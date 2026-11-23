import { ADDR, ADDR_OLD, START_BLOCK, client, EV, isZeroAddr } from './chain';

export type Bet = {
  game_bet_id: string; game: string; player: string; wager: string;
  payout?: string; status: string; block_number: number;
};

// Public RPCs cap eth_getLogs at ~50k blocks (100k already fails on
// publicnode), so scan START_BLOCK..latest in 40k chunks and merge.
//
// Speed matters: the scan range grows ~43k blocks/day forever, and Vercel
// kills functions at 60s. The old design (12 sequential single-event
// scans) crossed that limit once the range passed ~700k blocks and every
// /api/bets poll started timing out. Two structural wins keep it fast:
//   1. Placed+Resolved are fetched in ONE getLogs call per chunk via
//      viem's multi-event `events` param (same logs, half the calls).
//   2. The 6 (game, contract) scans run with limited concurrency (3)
//      instead of fully sequentially. Retries below absorb the
//      occasional rate-limit/empty page this can cause.
//
// Plus loadAllBets results are cached for 15s with in-flight dedupe:
// the 6s UI poll mostly serves the cached snapshot, so at most one scan
// runs per 15s per instance no matter how many visitors poll.

const CHUNK = 40_000n;
const CONCURRENCY = 3;
const CACHE_TTL_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// -2: resolve requires block > placeBlock, so once a bet is 2 blocks old
// it can settle. The old -30 margin hid fresh bets for ~60s on Base
// Sepolia (2s blocks) and delayed the resolve poll loop. Pinned ONCE per
// loadAllBets so every scan in the batch sees the same snapshot edge.
async function pinnedToBlock(): Promise<bigint> {
  return (await client.getBlockNumber()) - 2n;
}

async function getLogsChunked(address: `0x${string}`, events: any[], eventNames: Set<string>, toBlock: bigint) {
  const out: any[] = [];
  for (let from = START_BLOCK; from <= toBlock; from += CHUNK) {
    const to = from + CHUNK - 1n < toBlock ? from + CHUNK - 1n : toBlock;
    let logs: any[] | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        logs = (await client.getLogs({ address, events, fromBlock: from, toBlock: to } as any)) as any[];
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await sleep(800 * (attempt + 1));
      }
    }
    out.push(...(logs ?? []));
  }
  return out;
}

async function loadGame(
  address: `0x${string}`,
  placedEv: any,
  resolvedEv: any,
  placedName: string,
  resolvedName: string,
  game: string,
  player: string | undefined,
  toBlock: bigint
) {
  const logs = await getLogsChunked(address, [placedEv, resolvedEv], new Set([placedName, resolvedName]), toBlock);
  const placed = logs.filter((l) => l.eventName === placedName);
  const resolved = logs.filter((l) => l.eventName === resolvedName);
  const map = new Map<string, Bet>();
  for (const l of placed) {
    if (player && (l.args.player as string).toLowerCase() !== player.toLowerCase()) continue;
    map.set(l.args.gameBetId as string, {
      game_bet_id: l.args.gameBetId as string, game, player: l.args.player as string,
      wager: (l.args.wager as bigint).toString(), status: 'escrowed', block_number: Number(l.blockNumber),
    });
  }
  for (const l of resolved) {
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

async function scanAllBets(player?: string, game?: string): Promise<Bet[]> {
  const t0 = Date.now();
  const toBlock = await pinnedToBlock();
  // Scan current + revoked previous-generation contracts so history
  // survives game redeploys (gameBetIds never collide across contracts).
  const tasks: Array<() => Promise<Bet[]>> = [];
  const add = (addrs: string[], placedEv: any, resolvedEv: any, placedName: string, resolvedName: string, name: string) => {
    for (const a of addrs.filter((a) => !isZeroAddr(a))) {
      tasks.push(() => loadGame(a as `0x${string}`, placedEv, resolvedEv, placedName, resolvedName, name, player, toBlock));
    }
  };
  if (!game || game === 'coinflip') add([ADDR.coinflip, ADDR_OLD.coinflip], EV.flipPlaced, EV.flipResolved, 'FlipPlaced', 'FlipResolved', 'coinflip');
  if (!game || game === 'dice') add([ADDR.dice, ADDR_OLD.dice], EV.rollPlaced, EV.rollResolved, 'RollPlaced', 'RollResolved', 'dice');
  if (!game || game === 'plinko') add([ADDR.plinko, ADDR_OLD.plinko], EV.dropPlaced, EV.dropResolved, 'DropPlaced', 'DropResolved', 'plinko');

  // Limited-concurrency worker pool (see header note on throttling).
  const out: Bet[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      out.push(...(await tasks[i]()));
    }
  });
  await Promise.all(workers);
  console.log(`[bets] scan player=${player || '-'} game=${game || '-'} ms=${Date.now() - t0} tasks=${tasks.length}`);

  out.sort((a, b) => b.block_number - a.block_number || b.game_bet_id.localeCompare(a.game_bet_id));
  // Dedupe by gameBetId (paranoia: same bet must never appear twice).
  const seen = new Set<string>();
  return out.filter((b) => {
    if (seen.has(b.game_bet_id)) return false;
    seen.add(b.game_bet_id);
    return true;
  });
}

// Short-TTL result cache + in-flight dedupe. Concurrent polls share one
// scan; polls inside the TTL get the identical snapshot.
const cache = new Map<string, { at: number; data: Bet[] }>();
const inflight = new Map<string, Promise<Bet[]>>();

export function loadAllBets(player?: string, game?: string): Promise<Bet[]> {
  const key = `${(player || '').toLowerCase()}|${game || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.data);
  const running = inflight.get(key);
  if (running) return running;
  const p = scanAllBets(player, game)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
