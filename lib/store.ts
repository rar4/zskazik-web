import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Bet } from './bets';

// Persistent bet log (hosted MySQL). History used to be a full chain
// rescan on every 6s poll, so public-RPC flakiness reshuffled the list
// constantly. Now bets are written through to this store at
// placement/resolution time and /api/bets reads it back — identical
// answers until a real bet lands.
//
// Why MySQL and not a SQLite file: on Vercel every serverless instance
// has its own ephemeral /tmp, so a file DB diverges per instance (writes
// on one instance invisible to reads on another). A hosted MySQL is the
// one shared store all instances see.
//
// Configure via DATABASE_URL=mysql://user:pass@host:port/dbname (the
// database is created if missing). Without it the store is disabled and
// /api/bets falls back to the live chain scan.

export function storeEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

let pool: Pool | null = null;
let initPromise: Promise<Pool> | null = null;

async function createDatabaseIfMissing(uri: string) {
  const url = new URL(uri);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName || !/^[A-Za-z0-9_]+$/.test(dbName)) return;
  const server = await mysql.createConnection({ uri });
  try {
    await server.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  } finally {
    await server.end();
  }
}

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  if (!initPromise) {
    initPromise = (async () => {
      const uri = process.env.DATABASE_URL as string;
      await createDatabaseIfMissing(uri);
      const p = mysql.createPool({ uri, connectionLimit: 5, waitForConnections: true });
      await p.query(`
        CREATE TABLE IF NOT EXISTS bets (
          game_bet_id   VARCHAR(66) PRIMARY KEY,
          game          VARCHAR(16) NOT NULL,
          player        VARCHAR(42) NOT NULL,
          wager         TEXT NOT NULL,
          payout        TEXT NULL,
          status        VARCHAR(16) NOT NULL,
          block_number  BIGINT NOT NULL,
          KEY idx_bets_player_block (player, block_number DESC, game_bet_id DESC)
        ) ENGINE=InnoDB
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS meta (
          k VARCHAR(64) PRIMARY KEY,
          v TEXT NOT NULL
        ) ENGINE=InnoDB
      `);
      pool = p;
      return p;
    })();
  }
  return initPromise;
}

export async function isBackfilled(): Promise<boolean> {
  const p = await getPool();
  const [rows] = (await p.query("SELECT v FROM meta WHERE k = 'backfill_done'")) as [RowDataPacket[], unknown];
  return rows[0]?.v === '1';
}

export async function markBackfilled() {
  const p = await getPool();
  await p.query("INSERT INTO meta (k, v) VALUES ('backfill_done', '1') ON DUPLICATE KEY UPDATE v = '1'");
}

const UPSERT_TAIL = `
  ON DUPLICATE KEY UPDATE
    wager = IF(bets.wager = '0', VALUES(wager), bets.wager),
    payout = COALESCE(VALUES(payout), bets.payout),
    status = IF(VALUES(payout) IS NOT NULL, VALUES(status), bets.status),
    block_number = LEAST(bets.block_number, VALUES(block_number))
`;

// Order-independent merge: a placed row always wins for wager, a resolved
// row always wins for payout/status, earliest block wins. Rows can arrive
// in any order (relay vs wallet, retries) and converge to the same state.
export async function upsertBet(bet: Bet): Promise<void> {
  const p = await getPool();
  await p.query(
    `INSERT INTO bets (game_bet_id, game, player, wager, payout, status, block_number)
     VALUES (?, ?, ?, ?, ?, ?, ?) ${UPSERT_TAIL}`,
    [bet.game_bet_id, bet.game, bet.player.toLowerCase(), bet.wager, bet.payout ?? null, bet.status, bet.block_number]
  );
}

// Write path must never fail a bet: log and swallow DB errors.
export async function recordBet(bet: Bet): Promise<boolean> {
  try {
    await upsertBet(bet);
    return true;
  } catch (e: any) {
    console.error('[store] recordBet failed', e?.message || e);
    return false;
  }
}

export async function backfillBets(bets: Bet[]): Promise<number> {
  const p = await getPool();
  const BATCH = 200;
  for (let i = 0; i < bets.length; i += BATCH) {
    const chunk = bets.slice(i, i + BATCH);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values: unknown[] = [];
    for (const b of chunk) {
      values.push(
        b.game_bet_id,
        b.game,
        b.player.toLowerCase(),
        b.wager,
        b.payout ?? null,
        b.status,
        b.block_number
      );
    }
    await p.query(
      `INSERT INTO bets (game_bet_id, game, player, wager, payout, status, block_number)
       VALUES ${placeholders} ${UPSERT_TAIL}`,
      values
    );
  }
  await markBackfilled();
  return bets.length;
}

type Row = RowDataPacket & {
  game_bet_id: string;
  game: string;
  player: string;
  wager: string;
  payout: string | null;
  status: string;
  block_number: number | bigint;
};

export async function listBets(player?: string, game?: string, limit = 50): Promise<Bet[]> {
  const p = await getPool();
  const where: string[] = [];
  const params: unknown[] = [];
  if (player) {
    where.push('player = ?');
    params.push(player.toLowerCase());
  }
  if (game) {
    where.push('game = ?');
    params.push(game);
  }
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 50, 1), 200);
  const [rows] = (await p.query(
    `SELECT game_bet_id, game, player, wager, payout, status, block_number
       FROM bets ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY block_number DESC, game_bet_id DESC LIMIT ${safeLimit}`,
    params
  )) as [Row[], unknown];
  return rows.map((r) => ({
    game_bet_id: r.game_bet_id,
    game: r.game,
    player: r.player,
    wager: String(r.wager),
    ...(r.payout !== null && r.payout !== undefined ? { payout: String(r.payout) } : {}),
    status: r.status,
    block_number: Number(r.block_number),
  }));
}

export async function countBets(): Promise<number> {
  const p = await getPool();
  const [rows] = (await p.query('SELECT COUNT(*) AS n FROM bets')) as [RowDataPacket[], unknown];
  return Number(rows[0]?.n ?? 0);
}
