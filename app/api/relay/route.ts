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

// Fast RPC for the relayer: publicnode allows wide getLogs ranges and is
// low-latency; sepolia.base.org caps getLogs at 200 blocks.
const RPC = 'https://base-sepolia-rpc.publicnode.com';

function relayer() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error('RELAYER_PRIVATE_KEY not configured');
  const account = privateKeyToAccount(pk as Hex);
  return createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });
}

async function waitBlocks(n: number) {
  const start = await client.getBlockNumber();
  while ((await client.getBlockNumber()) < start + BigInt(n)) {
    await new Promise((r) => setTimeout(r, 800));
  }
}

export async function POST(req: Request) {
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
    // user only sees the forwarder's wrapper selector 0x7e256957.
    const active = await client.readContract({
      address: ADDR.forwarder, abi: forwarderAbi, functionName: 'isSessionActive', args: [user],
    } as any).catch(() => false);
    if (!active) {
      return NextResponse.json({ error: 'SessionNotSet/SessionExpired — register the session key first' }, { status: 400 });
    }
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
    const hash = await wallet.writeContract({
      address: ADDR.forwarder,
      abi: forwarderAbi as any,
      functionName: 'executeMetaTransaction',
      args: [user, target, callData, signature],
    } as any);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'meta-tx reverted', hash }, { status: 500 });
    }
    const logs = parseEventLogs({ abi: gameAbi, logs: receipt.logs }) as any[];
    const placed = logs.find((l) => ['FlipPlaced', 'RollPlaced', 'DropPlaced'].includes(l.eventName));
    let gameBetId: string | null = placed?.args?.gameBetId ?? null;
    const game = GAME_BY_ADDR[String(target).toLowerCase()];
    // Write-through: record the bet in the persistent log at placement
    // time (recordBet never throws, so a DB outage can't fail the bet).
    if (placed && game) {
      await recordBet({
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
      await waitBlocks(2);
      resolveHash = await wallet.writeContract({
        address: target,
        abi: gameAbi as any,
        functionName: 'resolve',
        args: [gameBetId],
      } as any);
      const resolveReceipt = await client.waitForTransactionReceipt({ hash: resolveHash as Hex });
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
        await recordBet({
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
    return NextResponse.json({ hash, gameBetId, resolveHash, result });
  } catch (e: any) {
    return NextResponse.json({ error: humanizeError(e) }, { status: 500 });
  }
}
