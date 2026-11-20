import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const r = await fetch(`${base}/api/bets?limit=200`, { cache: 'no-store' });
  const bets = await r.json();
  if (!Array.isArray(bets)) return NextResponse.json(bets);
  const map = new Map<string, { player: string; plays: number; wins: number }>();
  for (const b of bets) {
    const e = map.get(b.player) || { player: b.player, plays: 0, wins: 0 };
    e.plays += 1;
    if (b.status === 'won') e.wins += 1;
    map.set(b.player, e);
  }
  return NextResponse.json(Array.from(map.values()).sort((a, b) => b.wins - a.wins).slice(0, 20));
}
