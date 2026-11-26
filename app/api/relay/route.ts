import { NextResponse } from 'next/server';
import { createWalletClient, http, parseAbi, parseEventLogs, encodeFunctionData, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ADDR, client } from '@/lib/chain';
import { derivePlinkoPath } from '@/lib/plinko-path';
import { recordBet } from '@/lib/store';
import { humanizeError } from '@/lib/revert';

export const dynamic = 'force-dynamic';

// Relayer: submits session-signed meta-bets via TrustedForwarder (gas paid by
// RELAYER_PRIVATE_KEY, server-only) and auto-resolves 2 blocks later in the
// same request. The relayer cannot change bet params - the session signature
// binds (user, target, calldata, nonce) and the Forwarder verifies it on-chain.

const forwarderAbi = parseAbi([
  'function executeMetaTransaction(address user, address target, bytes callData, bytes signature) returns (bytes)',
  'function isSessionActive(address user) view returns (bool)',
]);

const gameAbi = parseAbi([
  'function resolve(bytes32 gameBetId)',
  'event FlipPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, bool choiceHeads)',
  'event RollPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, uint8 target)',
  'event DropPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, uint8 rows)',
  'event FlipResolved(bytes32 indexed gameBetId, address indexed player, bool won, uint256 payout)',
  'event RollResolved(bytes32 indexed gameBetId, address indexed player, uint8 roll, bool won, uint256 payout)',
  'event DropResolved(bytes32 indexed gameBetId, address indexed player, uint8 bin, uint256 multBps, uint256 payout)',
]);

const RESOLVED_EVENTS = ['FlipResolved', 'RollResolved', 'DropResolved'];
const GAME_BY_ADDR: Record<string, string> = {
  [ADDR.coinflip.toLowerCase()]: 'coinflip',
  [ADDR.dice.toLowerCase()]: 'dice',
  [ADDR.plinko.toLowerCase()]: 'plinko',
};

// Explicit gas (measured from real receipts, like the wallet path): without
// a limit viem runs estimateGas + fee fetch on every tx, adding ~200-400ms
// per tx to the place+resolve critical path.
const GAS_PLACE = 1_500_000n;
const GAS_RESOLVE = 800_000n;

// Fast RPC for the relayer: publicnode allows wide getLogs ranges and is
// low-latency; sepolia.base.org caps getLogs at 200 blocks.
const RPC = 'https://base-sepolia-rpc.publicnode.com';

function relayer() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error('RELAYER_PRIVATE_KEY not configured');
  const account = privateKeyToAccount(pk as Hex);
  return createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });
}

async function waitUntilBlock(target: bigint) {
  // Poll every 100ms (was 250ms) against a target we already know from the
  // place receipt — no initial getBlockNumber round trip, and the coarse
  // poll no longer adds up to 250ms of dead air before resolve can go.
  while ((await client.getBlockNumber()) < target) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (k: string) => { timings[k] = Date.now() - t0; };
  try {
    const { user, target, callData, signature } = await req.json();
    if (!user || !target || !callData || !signature) {
      return NextResponse.json({ error: 'missing user/target/callData/signature' }, { status: 400 });
    }
    const allowed = [ADDR.coinflip, ADDR.dice, ADDR.plinko].map((a) => a.toLowerCase());
    if (!allowed.includes(String(target).toLowerCase())) {
      return NextResponse.json({ error: 'target not a game contract' }, { status: 400 });
    }
    const wallet = relayer();
    // Preflight: simulate the meta-tx before paying gas for it. Without
    // this, a doomed bet (e.g. allowance < wager) reverts on-chain and the
    // user only sees the forwarder's wrapper selector 0x7e256957. The
    // simulation covers isSessionActive too (inactive session = revert),
    // so the separate read was pure latency — one RPC off the path.
    try {
      const simData = encodeFunctionData({
        abi: forwarderAbi, functionName: 'executeMetaTransaction', args: [user, target, callData, signature],
      } as any);
      // Raw eth_call: client.call drops revert data in CallExecutionError.
      await (client as any).request({
        method: 'eth_call',
        params: [{ from: wallet.account.address, to: ADDR.forwarder, data: simData }, 'latest'],
      });
    } catch (simErr: any) {
      return NextResponse.json({ error: humanizeError(simErr), code: 'PREFLIGHT_REVERT' }, { status: 400 });
    }
    mark('simulated');
    const hash = await wallet.writeContract({
      address: ADDR.forwarder,
      abi: forwarderAbi as any,
      functionName: 'executeMetaTransaction',
      args: [user, target, callData, signature],
      gas: GAS_PLACE,
    } as any);
    mark('placeBroadcast');
    const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 200 });
    mark('placeMined');
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'meta-tx reverted', hash }, { status: 500 });
    }
    const logs = parseEventLogs({ abi: gameAbi, logs: receipt.logs }) as any[];
    const placed = logs.find((l) => ['FlipPlaced', 'RollPlaced', 'DropPlaced'].includes(l.eventName));
    let gameBetId: string | null = placed?.args?.gameBetId ?? null;
    const game = GAME_BY_ADDR[String(target).toLowerCase()];
    // Write-through: record the bet in the persistent log at placement
    // time. Fire-and-forget: it runs concurrently with the resolve wait
    // below instead of blocking it (recordBet never throws anyway).
    if (placed && game) {
      void recordBet({
        game_bet_id: placed.args.gameBetId as string,
        game,
        player: placed.args.player as string,
        wager: (placed.args.wager as bigint).toString(),
        status: 'escrowed',
        block_number: Number(receipt.blockNumber),
      });
    }
    let resolveHash: string | null = null;
    let result: {
      status: 'won' | 'lost';
      payout: string;
      won?: boolean;
      details?: { roll?: number; bin?: number; multBps?: string; path?: number[]; word?: string };
    } | null = null;
    if (gameBetId) {
      // One block is enough: resolve() only requires a LATER block than
      // placement, and the resolve tx lands after this wait regardless.
      // Target is the known place block + 1, not a fresh getBlockNumber.
      await waitUntilBlock(receipt.blockNumber + 1n);
      mark('resolveReady');
      resolveHash = await wallet.writeContract({
        address: target,
        abi: gameAbi as any,
        functionName: 'resolve',
        args: [gameBetId],
        gas: GAS_RESOLVE,
      } as any);
      mark('resolveBroadcast');
      const resolveReceipt = await client.waitForTransactionReceipt({ hash: resolveHash as Hex, pollingInterval: 200 });
      mark('resolveMined');
      const resolvedLogs = parseEventLogs({ abi: gameAbi, logs: resolveReceipt.logs }) as any[];
      const resolved = resolvedLogs.find((l) => RESOLVED_EVENTS.includes(l.eventName));
      if (resolved && placed && game) {
        const payout = (resolved.args.payout as bigint).toString();
        const status: 'won' | 'lost' = BigInt(payout) > 0n ? 'won' : 'lost';
        const won = resolved.eventName === 'DropResolved' ? BigInt(payout) > 0n : resolved.args.won === true;
        const details: { roll?: number; bin?: number; multBps?: string; path?: number[]; word?: string } | undefined =
          resolved.eventName === 'RollResolved'
            ? { roll: Number(resolved.args.roll) }
            : resolved.eventName === 'DropResolved'
              ? { bin: Number(resolved.args.bin), multBps: (resolved.args.multBps as bigint).toString() }
              : undefined;
        result = { payout, status, won, details };
        // Plinko bit-path replay: recompute the contract's randomness word
        // from the resolve block's prevrandao so the animator can replay the
        // exact bounces. Only attach it when it reproduces the settled bin —
        // a mismatch means our replica drifted, and the UI must not animate
        // a path that disagrees with the payout.
        if (resolved.eventName === 'DropResolved' && details?.bin !== undefined) {
          try {
            const path = await derivePlinkoPath(
              client as any,
              String(target),
              gameBetId as Hex,
              Number(receipt.blockNumber),
              Number(resolveReceipt.blockNumber),
              Number(placed.args.rows),
            );
            if (path.bin === details.bin) {
              details.path = path.bits;
              details.word = path.word;
            }
          } catch {
            // Path is cosmetic; the settled result above stands on its own.
          }
        }
        // The result is already computed above, so the DB write must
        // not delay the response the ball is waiting on.
        void recordBet({
          game_bet_id: gameBetId,
          game,
          player: placed.args.player as string,
          wager: (placed.args.wager as bigint).toString(),
          payout,
          status,
          block_number: Number(receipt.blockNumber),
        });
      }
    }
    mark('done');
    return NextResponse.json({ hash, gameBetId, resolveHash, result, blockNumber: Number(receipt.blockNumber), timings });
  } catch (e: any) {
    return NextResponse.json({ error: humanizeError(e) }, { status: 500 });
  }
}
