import { NextResponse } from 'next/server';
import { ADDR, START_BLOCK, client, EV, isZeroAddr } from '@/lib/chain';

export const dynamic = 'force-dynamic';

type Bet = {
  game_bet_id: string; game: string; player: string; wager: string;
  payout?: string; status: string; block_number: number;
};

async function loadGame(address: `0x${string}`, placedEv: any, resolvedEv: any, game: string, player?: string) {
  const toBlock = await client.getBlockNumber();
  const [placed, resolved] = await Promise.all([
    client.getLogs({ address, event: placedEv, fromBlock: START_BLOCK, toBlock }),
    client.getLogs({ address, event: resolvedEv, fromBlock: START_BLOCK, toBlock }),
  ]);
  const map = new Map<string, Bet>();
  for (const l of placed as any[]) {
    if (player && (l.args.player as string).toLowerCase() !== player.toLowerCase()) continue;
    map.set(l.args.gameBetId as string, {
      game_bet_id: l.args.gameBetId as string, game, player: l.args.player as string,
      wager: (l.args.wager as bigint).toString(), status: 'escrowed', block_number: Number(l.blockNumber),
    });
  }
  for (const l of resolved as any[]) {
    const b = map.get(l.args.gameBetId as string);
    const payout = (l.args.payout as bigint).toString();
    if (b) {
      b.payout = payout;
      b.status = (l.args.payout as bigint) > BigInt(0) ? 'won' : 'lost';
    } else if (!player || (l.args.player as string).toLowerCase() === player.toLowerCase()) {
      map.set(l.args.gameBetId as string, {
        game_bet_id: l.args.gameBetId as string, game, player: l.args.player as string,
        wager: '0', payout, status: (l.args.payout as bigint) > BigInt(0) ? 'won' : 'lost',
        block_number: Number(l.blockNumber),
      });
    }
  }
  return Array.from(map.values());
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const player = searchParams.get('player') || undefined;
    const game = searchParams.get('game') || undefined;
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
    const out: Bet[] = [];
    if ((!game || game === 'coinflip') && !isZeroAddr(ADDR.coinflip)) {
      out.push(...await loadGame(ADDR.coinflip, EV.flipPlaced, EV.flipResolved, 'coinflip', player));
    }
    if ((!game || game === 'dice') && !isZeroAddr(ADDR.dice)) {
      out.push(...await loadGame(ADDR.dice, EV.rollPlaced, EV.rollResolved, 'dice', player));
    }
    if ((!game || game === 'plinko') && !isZeroAddr(ADDR.plinko)) {
      out.push(...await loadGame(ADDR.plinko, EV.dropPlaced, EV.dropResolved, 'plinko', player));
    }
    out.sort((a, b) => b.block_number - a.block_number);
    return NextResponse.json(out.slice(0, limit));
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
