import { createPublicClient, http, parseAbiItem } from 'viem';

export const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
export const START_BLOCK = BigInt(process.env.START_BLOCK || '0');

export const ADDR = {
  token: (process.env.NEXT_PUBLIC_TOKEN || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  treasury: (process.env.NEXT_PUBLIC_TREASURY || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  coinflip: (process.env.NEXT_PUBLIC_COINFLIP || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  dice: (process.env.NEXT_PUBLIC_DICE || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  plinko: (process.env.NEXT_PUBLIC_PLINKO || '0x0000000000000000000000000000000000000000') as `0x${string}`,
};

export function isZeroAddr(a: string) {
  return !a || a === '0x0000000000000000000000000000000000000000';
}

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
