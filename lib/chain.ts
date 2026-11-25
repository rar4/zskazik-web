import { createPublicClient, fallback, http, parseAbiItem } from 'viem';

export const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
export const START_BLOCK = BigInt(process.env.START_BLOCK || '61788600');

// Fallbacks = deployed Base Sepolia addresses (broadcast/*/84532 in the
// contracts repo) — a missing env var must never silently zero these out.
export const ADDR = {
  token: (process.env.NEXT_PUBLIC_TOKEN || '0x79d782ffb87a643b9c5369f54f0c1fca02f40a89') as `0x${string}`,
  treasury: (process.env.NEXT_PUBLIC_TREASURY || '0xa84a9505753e0be52486e181bd9dde77d261ad56') as `0x${string}`,
  coinflip: (process.env.NEXT_PUBLIC_COINFLIP || '0xAF7fDDa566905860D6BF3AdB4cd73Dc771Fab366') as `0x${string}`,
  dice: (process.env.NEXT_PUBLIC_DICE || '0xfC1dB725d0dEd61618E76152610c39147B42eff7') as `0x${string}`,
  plinko: (process.env.NEXT_PUBLIC_PLINKO || '0xdDe34251ad0E1EeD50602680FACdA3e4C66E7f08') as `0x${string}`,
  forwarder: (process.env.NEXT_PUBLIC_FORWARDER || '0x0FA6F0693cd56D6dE6DD0297C75CCf41FafCbda7') as `0x${string}`,
};

export function isZeroAddr(a: string) {
  return !a || a === '0x0000000000000000000000000000000000000000';
}

// Base Sepolia has two game generations: the first deployment (direct
// bets, before the ERC-2771 forwarder) and the current forwarder-enabled
// one. History scans both so old bets stay visible after redeploys.
export const ADDR_OLD = {
  coinflip: '0x22157527B27C4E3174215126c100f66B041cF082' as `0x${string}`,
  dice: '0xDcCBA84D53BF3daa275f57cA7e81b202892EfC14' as `0x${string}`,
  plinko: '0x1a2a89BFDD940B34f62237b6cCb4b8D2644a37cD' as `0x${string}`,
};

export const client = createPublicClient({
  // 500ms receipt/block polling: viem's 4s default added seconds of dead
  // air to every place+resolve cycle — the ball waited on the poller,
  // not on the chain (2s blocks).
  pollingInterval: 500,
  // Fallback across public Base Sepolia endpoints: single-endpoint scans
  // intermittently return partial/empty log pages (lagging or throttled
  // backends). viem's fallback transport moves to the next URL on error.
  // RPC_URL (Alchemy in prod) leads: the free public endpoints return
  // empty pages under concurrent scan load, which used to stall history.
  // sepolia.base.org caps eth_getLogs at a 200-block range, which breaks
  // 40k-block history scans, so it is last resort only.
  transport: fallback(
    [
      RPC_URL,
      'https://base-sepolia-rpc.publicnode.com',
      'https://sepolia.base.org',
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
