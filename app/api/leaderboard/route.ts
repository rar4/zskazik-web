import { NextResponse } from 'next/server';
import { loadAllBets } from '@/lib/bets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const bets = await loadAllBets();
    const map = new Map<string, { player: string; plays: number; wins: number }>();
    for (const b of bets) {
      const e = map.get(b.player) || { player: b.player, plays: 0, wins: 0 };
      e.plays += 1;
      if (b.status === 'won') e.wins += 1;
      map.set(b.player, e);
    }
    return NextResponse.json(Array.from(map.values()).sort((a, b) => b.wins - a.wins).slice(0, 20));
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
