import { NextResponse } from 'next/server';
import { createWalletClient, http, parseAbi, parseEventLogs, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { ADDR, client } from '@/lib/chain';
import { derivePlinkoPath, ARB_SYS_ADDRESS, arbSysAbi } from '@/lib/plinko-path';
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

// Fast RPC for the relayer: publicnode allows wide getLogs ranges and is low-latency.
const RPC = 'https://arbitrum-sepolia-rpc.publicnode.com';

function relayer() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error('RELAYER_PRIVATE_KEY not configured');
  const account = privateKeyToAccount(pk as Hex);
  return createWalletClient({ account, chain: arbitrumSepolia, transport: http(RPC) });
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
    // No preflight simulation: broadcast optimistically for speed (~166ms
    // saved per bet). A doomed bet (e.g. allowance < wager, inactive
    // session) reverts on-chain instead, costing the relayer one cheap
    // Arbitrum tx, and returns TX_REVERTED below — the client treats it
    // as deterministic and does not fall back to a wallet popup, so the
    // user still gets an error without burning a confirmation.
    const hash = await wallet.writeContract({
      address: ADDR.forwarder,
      abi: forwarderAbi as any,
      functionName: 'executeMetaTransaction',
      args: [user, target, callData, signature],
      gas: GAS_PLACE,
    } as any);
    mark('placeBroadcast');
    const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 100 });
    mark('placeMined');
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'meta-tx reverted on-chain', hash, code: 'TX_REVERTED' }, { status: 500 });
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
      // No block wait before resolve. The place receipt only exists after
      // the place tx is mined, so a resolve broadcast now cannot land in
      // the place block — the sequencer will include it in a later block,
      // which satisfies _requireResolvable (block.number > placeBlock)
      // without burning a full 2s block waiting for place+1 to mine first.
      // That wait cost one whole block per bet.
      // Prefetch the expected randomness hash in parallel with resolve
      // inclusion: if resolve lands at place+1 (the usual case), its word
      // source is arbBlockHash(placeBlock), already known now. This
      // overlaps the derivation RPC with the ~800ms resolve wait instead
      // of paying it serially after resolve mined.
      const hashPromise = (client as any).readContract({
        address: ARB_SYS_ADDRESS,
        abi: arbSysAbi,
        functionName: 'arbBlockHash',
        args: [receipt.blockNumber],
      }).catch(() => null) as Promise<Hex | null>;
      mark('resolveReady');
      resolveHash = await wallet.writeContract({
        address: target,
        abi: gameAbi as any,
        functionName: 'resolve',
        args: [gameBetId],
        gas: GAS_RESOLVE,
      } as any);
      mark('resolveBroadcast');
      const resolveReceipt = await client.waitForTransactionReceipt({ hash: resolveHash as Hex, pollingInterval: 100 });
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
            const prefetchedHash = await hashPromise;
            const prefetched =
              prefetchedHash && Number(resolveReceipt.blockNumber) === Number(receipt.blockNumber) + 1
                ? { resolveBlock: Number(resolveReceipt.blockNumber), hash: prefetchedHash }
                : null;
            const path = await derivePlinkoPath(
              client as any,
              String(target),
              gameBetId as Hex,
              Number(receipt.blockNumber),
              Number(resolveReceipt.blockNumber),
              Number(placed.args.rows),
              prefetched,
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
