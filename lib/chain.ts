import { createPublicClient, http, parseAbiItem } from 'viem';

export const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
export const START_BLOCK = BigInt(process.env.START_BLOCK || '12180054');

// Fallbacks = deployed Sepolia addresses (broadcast/*/11155111 in the
// contracts repo) — a missing env var must never silently zero these out.
export const ADDR = {
  token: (process.env.NEXT_PUBLIC_TOKEN || '0x79d782ffb87a643b9c5369f54f0c1fca02f40a89') as `0x${string}`,
  treasury: (process.env.NEXT_PUBLIC_TREASURY || '0xa84a9505753e0be52486e181bd9dde77d261ad56') as `0x${string}`,
  coinflip: (process.env.NEXT_PUBLIC_COINFLIP || '0x3ca2AeC906EbBCf550619e29389e9Bd440ef268B') as `0x${string}`,
  dice: (process.env.NEXT_PUBLIC_DICE || '0xF4Bf21af01451dc3eF1196C4F3b176F1969004bc') as `0x${string}`,
  plinko: (process.env.NEXT_PUBLIC_PLINKO || '0x1a2a89bfdd940b34f62237b6ccb4b8d2644a37cd') as `0x${string}`,
};

export function isZeroAddr(a: string) {
  return !a || a === '0x0000000000000000000000000000000000000000';
}

// Pre-v2 game contracts (revoked in Treasury). Their historical bets must
// stay visible in history/stats, so the API scans both generations.
export const ADDR_OLD = {
  coinflip: '0x22157527B27C4E3174215126c100f66B041cF082' as `0x${string}`,
  dice: '0xe3192207Fa9Da7BdBFfd09E0F01FB49C14E59b04' as `0x${string}`,
};

export const client = createPublicClient({ transport: http(RPC_URL) });

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
