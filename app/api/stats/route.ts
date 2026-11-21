import { NextResponse } from 'next/server';
import { loadAllBets } from '@/lib/bets';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const player = searchParams.get('player') || undefined;
    const bets = await loadAllBets(player);
    const settled = bets.filter((b) => b.status === 'won' || b.status === 'lost');
    return NextResponse.json({
      plays: bets.length,
      settled: settled.length,
      wins: bets.filter((b) => b.status === 'won').length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
