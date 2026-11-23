import { NextResponse } from 'next/server';
import { loadAllBets } from '@/lib/bets';
import { backfillBets, countBets, storeEnabled } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-time (re)population of the MySQL bet log from a full chain scan.
// Idempotent: rows upsert by game_bet_id, so re-running never duplicates.
// Set BACKFILL_SECRET and send it as x-backfill-secret to protect this.
export async function POST(req: Request) {
  if (!storeEnabled()) {
    return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 503 });
  }
  const secret = process.env.BACKFILL_SECRET;
  if (secret && req.headers.get('x-backfill-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const bets = await loadAllBets();
    await backfillBets(bets);
    return NextResponse.json({ ok: true, scanned: bets.length, stored: await countBets() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
