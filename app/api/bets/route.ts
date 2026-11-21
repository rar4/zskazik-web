import { NextResponse } from 'next/server';
import { loadAllBets } from '@/lib/bets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const player = searchParams.get('player') || undefined;
    const game = searchParams.get('game') || undefined;
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
    const out = await loadAllBets(player, game);
    return NextResponse.json(out.slice(0, limit));
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
