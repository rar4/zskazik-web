import { ADDR, ADDR_OLD, START_BLOCK, client, EV, isZeroAddr } from './chain';

export type Bet = {
  game_bet_id: string; game: string; player: string; wager: string;
  payout?: string; status: string; block_number: number;
};

// Public RPCs cap eth_getLogs at ~50k blocks. Scanning START_BLOCK..latest
// in one call breaks as soon as the chain outgrows the cap (deploy was at
// block ~12.18M with a 50k cap — history would have died within days).
// Scan in 40k-block chunks and merge.
const CHUNK = 40_000n;

async function getLogsChunked(address: `0x${string}`, event: any) {
  // -2: public RPCs are load-balanced and getBlockNumber() can return a
  // block ahead of the node answering getLogs ("range extends beyond
  // current head"). History lagging 2 blocks is harmless.
  const toBlock = (await client.getBlockNumber()) - 2n;
  const out: any[] = [];
  for (let from = START_BLOCK; from <= toBlock; from += CHUNK) {
    const to = from + CHUNK - 1n < toBlock ? from + CHUNK - 1n : toBlock;
    // Public RPCs are flaky under scan load (transient errors / empty
    // pages) — one retry per chunk before giving up.
    let logs: any[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        logs = await client.getLogs({ address, event, fromBlock: from, toBlock: to }) as any[];
        break;
      } catch (e) {
        if (attempt === 1) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    out.push(...(logs ?? []));
  }
  return out;
}

async function loadGame(address: `0x${string}`, placedEv: any, resolvedEv: any, game: string, player?: string) {
  const [placed, resolved] = await Promise.all([
    getLogsChunked(address, placedEv),
    getLogsChunked(address, resolvedEv),
  ]);
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

export async function loadAllBets(player?: string, game?: string): Promise<Bet[]> {
  const out: Bet[] = [];
  // Scan current + revoked previous-generation contracts so history
  // survives game redeploys (gameBetIds never collide across contracts).
  const coinflipAddrs = [ADDR.coinflip, ADDR_OLD.coinflip].filter((a) => !isZeroAddr(a));
  const diceAddrs = [ADDR.dice, ADDR_OLD.dice].filter((a) => !isZeroAddr(a));
  if (!game || game === 'coinflip') {
    for (const a of coinflipAddrs) out.push(...await loadGame(a, EV.flipPlaced, EV.flipResolved, 'coinflip', player));
  }
  if (!game || game === 'dice') {
    for (const a of diceAddrs) out.push(...await loadGame(a, EV.rollPlaced, EV.rollResolved, 'dice', player));
  }
  if ((!game || game === 'plinko') && !isZeroAddr(ADDR.plinko)) {
    out.push(...await loadGame(ADDR.plinko, EV.dropPlaced, EV.dropResolved, 'plinko', player));
  }
  out.sort((a, b) => b.block_number - a.block_number);
  return out;
}
