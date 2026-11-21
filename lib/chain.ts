import { createPublicClient, fallback, http, parseAbiItem } from 'viem';

export const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
export const START_BLOCK = BigInt(process.env.START_BLOCK || '61788600');

// Fallbacks = deployed Base Sepolia addresses (broadcast/*/84532 in the
// contracts repo) — a missing env var must never silently zero these out.
export const ADDR = {
  token: (process.env.NEXT_PUBLIC_TOKEN || '0x79d782ffb87a643b9c5369f54f0c1fca02f40a89') as `0x${string}`,
  treasury: (process.env.NEXT_PUBLIC_TREASURY || '0xa84a9505753e0be52486e181bd9dde77d261ad56') as `0x${string}`,
  coinflip: (process.env.NEXT_PUBLIC_COINFLIP || '0x22157527B27C4E3174215126c100f66B041cF082') as `0x${string}`,
  dice: (process.env.NEXT_PUBLIC_DICE || '0xe3192207Fa9Da7BdBFfd09E0F01FB49C14E59b04') as `0x${string}`,
  plinko: (process.env.NEXT_PUBLIC_PLINKO || '0x1a2a89bfdd940b34f62237b6ccb4b8d2644a37cd') as `0x${string}`,
};

export function isZeroAddr(a: string) {
  return !a || a === '0x0000000000000000000000000000000000000000';
}

// Base Sepolia has a single game generation — no revoked predecessors.
// Kept as zero addresses so loadAllBets scans only the current contracts.
export const ADDR_OLD = {
  coinflip: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  dice: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

export const client = createPublicClient({
  // Fallback across public Base Sepolia endpoints: single-endpoint scans
  // intermittently return partial/empty log pages (lagging or throttled
  // backends). viem's fallback transport moves to the next URL on error.
  // Publicnode first: sepolia.base.org caps eth_getLogs at a 200-block
  // range, which breaks 40k-block history scans. Publicnode allows wide
  // ranges, so it leads; sepolia.base.org is a fallback only.
  transport: fallback(
    [
      'https://base-sepolia-rpc.publicnode.com',
      RPC_URL,
      'https://sepolia.base.org',
    ]
      .filter((u, i, a) => a.indexOf(u) === i)
      .map((u) => http(u, { timeout: 10_000 })),
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
