import { NextResponse } from 'next/server';
import { loadAllBets, type Bet } from '@/lib/bets';
import { backfillBets, isBackfilled, listBets, recordBet, storeEnabled } from '@/lib/store';
import { ADDR, client, EV } from '@/lib/chain';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GAMES = ['coinflip', 'dice', 'plinko'] as const;

const PLACED_EV: Record<string, any> = {
  coinflip: EV.flipPlaced,
  dice: EV.rollPlaced,
  plinko: EV.dropPlaced,
};
const CONTRACT: Record<string, `0x${string}`> = {
  coinflip: ADDR.coinflip,
  dice: ADDR.dice,
  plinko: ADDR.plinko,
};

// Concurrent first reads share one backfill scan instead of each
// starting their own (the scan takes seconds; overlapping ones would
// also race the meta flag).
let backfillPromise: Promise<void> | null = null;
function ensureBackfilled(): Promise<void> {
  if (!backfillPromise) {
    backfillPromise = (async () => {
      if (!(await isBackfilled())) {
        await backfillBets(await loadAllBets());
      }
    })().finally(() => {
      backfillPromise = null;
    });
  }
  return backfillPromise;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const player = searchParams.get('player') || undefined;
  const game = searchParams.get('game') || undefined;
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);
  // History shows only settled bets: an escrowed (placed, unresolved) bet
  // is appended only once it has a result (won/lost).
  const settled = (b: Bet) => b.status === 'won' || b.status === 'lost';
  if (storeEnabled()) {
    try {
      // First read after deploy: one chain scan populates the store, then
      // every later read is a stable DB query.
      await ensureBackfilled();
      return NextResponse.json((await listBets(player, game, limit)).filter(settled));
    } catch (e: any) {
      console.error('[bets] store read failed, falling back to scan', e?.message || e);
    }
  }
  try {
    const out = await loadAllBets(player, game);
    return NextResponse.json(out.filter(settled).slice(0, limit));
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const UINT = /^\d+$/;

// POST /api/bets — write-through from the direct-wallet path (the relay
// path records server-side). The claimed bet is verified on-chain before
// it is stored: the Placed event for (gameBetId, player) must exist near
// the claimed block with the claimed wager. Resolved status/payout are
// trusted from the client once the bet itself is real (history is
// cosmetic; the chain remains the money source).
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const { game_bet_id, game, player, wager, payout, status, block_number } = body || {};
  if (!HEX32.test(game_bet_id || '')) return NextResponse.json({ error: 'bad game_bet_id' }, { status: 400 });
  if (!GAMES.includes(game)) return NextResponse.json({ error: 'bad game' }, { status: 400 });
  if (!ADDR_RE.test(player || '')) return NextResponse.json({ error: 'bad player' }, { status: 400 });
  if (!UINT.test(String(wager))) return NextResponse.json({ error: 'bad wager' }, { status: 400 });
  if (payout !== undefined && payout !== null && !UINT.test(String(payout)))
    return NextResponse.json({ error: 'bad payout' }, { status: 400 });
  if (!['escrowed', 'won', 'lost'].includes(status)) return NextResponse.json({ error: 'bad status' }, { status: 400 });
  if (!Number.isInteger(block_number) || block_number <= 0)
    return NextResponse.json({ error: 'bad block_number' }, { status: 400 });

  try {
    // 7-block window, so the result set is tiny — filter by (gameBetId,
    // player) on the decoded args instead of RPC topics (this viem
    // version's getLogs has no topics parameter).
    const logs = (await client.getLogs({
      address: CONTRACT[game],
      event: PLACED_EV[game],
      fromBlock: BigInt(Math.max(0, block_number - 3)),
      toBlock: BigInt(block_number + 3),
    })) as any[];
    const match = logs.find(
      (l) =>
        String(l.args.gameBetId).toLowerCase() === game_bet_id.toLowerCase() &&
        String(l.args.player).toLowerCase() === player.toLowerCase() &&
        String(l.args.wager) === String(wager)
    );
    if (!match) {
      return NextResponse.json({ error: 'bet not found on-chain' }, { status: 422 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'verify failed: ' + String(e.shortMessage || e.message || e) }, { status: 502 });
  }

  const bet: Bet = {
    game_bet_id,
    game,
    player: player.toLowerCase(),
    wager: String(wager),
    ...(payout !== undefined && payout !== null ? { payout: String(payout) } : {}),
    status,
    block_number,
  };
  if (!(await recordBet(bet))) return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
