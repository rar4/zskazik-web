import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const { searchParams } = new URL(req.url);
  const player = searchParams.get('player') || '';
  const r = await fetch(`${base}/api/bets?player=${player}&limit=200`, { cache: 'no-store' });
  const bets = await r.json();
  if (!Array.isArray(bets)) return NextResponse.json(bets);
  const settled = bets.filter((b: any) => b.status === 'won' || b.status === 'lost');
  return NextResponse.json({
    plays: bets.length,
    settled: settled.length,
    wins: bets.filter((b: any) => b.status === 'won').length,
  });
}
