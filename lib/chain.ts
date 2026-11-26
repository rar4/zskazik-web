import { createPublicClient, fallback, http, parseAbiItem } from 'viem';

export const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
export const START_BLOCK = BigInt(process.env.START_BLOCK || '332881300');

// Fallbacks = deployed Arbitrum Sepolia addresses (broadcast/*/421614 in the
// contracts repo) — a missing env var must never silently zero these out.
export const ADDR = {
  token: (process.env.NEXT_PUBLIC_TOKEN || '0x79d782ffb87a643b9c5369f54f0c1fca02f40a89') as `0x${string}`,
  treasury: (process.env.NEXT_PUBLIC_TREASURY || '0xa84a9505753e0be52486e181bd9dde77d261ad56') as `0x${string}`,
  coinflip: (process.env.NEXT_PUBLIC_COINFLIP || '0xdccba84d53bf3daa275f57ca7e81b202892efc14') as `0x${string}`,
  dice: (process.env.NEXT_PUBLIC_DICE || '0xdde34251ad0e1eed50602680facda3e4c66e7f08') as `0x${string}`,
  plinko: (process.env.NEXT_PUBLIC_PLINKO || '0x4473a610e79a66e5ca9a805cb2af42758bfa1b3e') as `0x${string}`,
  forwarder: (process.env.NEXT_PUBLIC_FORWARDER || '0x22157527b27c4e3174215126c100f66b041cf082') as `0x${string}`,
};

export function isZeroAddr(a: string) {
  return !a || a === '0x0000000000000000000000000000000000000000';
}

// Arbitrum Sepolia has two game generations: the first deployment (direct
// bets, before the ERC-2771 forwarder) and the current forwarder-enabled
// one. History scans both so old bets stay visible after redeploys.
// Fresh Arbitrum deployment: no previous generation on this chain. The old
// Base addresses must NOT be scanned here — CREATE nonces collide across
// chains, so the Base dice/plinko addresses equal the new Arbitrum
// coinflip/dice addresses and scanning both would double-count bets.
export const ADDR_OLD = {
  coinflip: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  dice: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  plinko: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

export const client = createPublicClient({
  // 100ms receipt/block polling: viem's 4s default added seconds of dead
  // air to every place+resolve cycle — the ball waited on the poller,
  // not on the chain (250ms Arbitrum blocks). 100ms caps the average
  // detection lag at ~50ms per wait (2 waits per bet via relay).
  pollingInterval: 100,
  // Fallback across public Arbitrum Sepolia endpoints: single-endpoint scans
  // intermittently return partial/empty log pages (lagging or throttled
  // backends). viem's fallback transport moves to the next URL on error.
  // RPC_URL (Alchemy in prod) leads: the free public endpoints return
  // empty pages under concurrent scan load, which used to stall history.
  // the official RPC is the last resort only.
  transport: fallback(
    [
      RPC_URL,
      'https://arbitrum-sepolia-rpc.publicnode.com',
      'https://sepolia-rollup.arbitrum.io/rpc',
    ]
      .filter((u, i, a) => a.indexOf(u) === i)
      // 4s, not 10s: publicnode answers in ~300ms when healthy. A hung
      // request otherwise burns 10s before the fallback even tries, and
      // with chunk retries one bad chunk can eat the whole 60s budget.
      .map((u) => http(u, { timeout: 4_000 })),
    { rank: false },
  ),
});

export const EV = {
  flipPlaced: parseAbiItem(
    'event FlipPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, bool choiceHeads)'
  ),
  flipResolved: parseAbiItem(
    'event FlipResolved(bytes32 indexed gameBetId, address indexed player, bool won, uint256 payout)'
  ),
  rollPlaced: parseAbiItem(
    'event RollPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, uint8 target)'
  ),
  rollResolved: parseAbiItem(
    'event RollResolved(bytes32 indexed gameBetId, address indexed player, uint8 roll, bool won, uint256 payout)'
  ),
  dropPlaced: parseAbiItem(
    'event DropPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, uint8 rows)'
  ),
  dropResolved: parseAbiItem(
    'event DropResolved(bytes32 indexed gameBetId, address indexed player, uint8 bin, uint256 multBps, uint256 payout)'
  ),
};
