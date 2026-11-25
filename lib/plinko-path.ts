import { concat, keccak256, type Hex } from 'viem';

// Bit-path replay for Plinko: the contract decides the game as
//   word = keccak256(abi.encode(treasuryBetId, block.prevrandao, placeBlock))
//   treasuryBetId = keccak256(abi.encode(contract, gameBetId))
//   bit i of word = bounce RIGHT at row i; bin = popcount(bits[0..rows))
// (Plinko.sol resolve(), GameBase.sol _random/_nextIds.)
// The animator replays those exact bits, so the ball's trajectory is a
// pure function of on-chain data and cannot diverge from the payout.
// When the contract moves to Chainlink VRF the word source changes but
// the bit semantics (and this animator) stay the same.

export type PlinkoPath = {
  /** Full 256-bit randomness word, hex. */
  word: Hex;
  /** bits[i] = 1 => bounce right at row i. Length === rows. */
  bits: number[];
  /** popcount(bits) — must equal the on-chain bin. */
  bin: number;
};

export function treasuryBetIdFor(contract: string, gameBetId: Hex): Hex {
  // Solidity abi.encode(address, bytes32): address left-padded to 32 bytes.
  const addr = ('0x' + '0'.repeat(24) + contract.replace(/^0x/, '').toLowerCase()) as Hex;
  return keccak256(concat([addr, gameBetId]));
}

export function randomWordFor(treasuryBetId: Hex, prevrandao: Hex, placeBlock: number): Hex {
  // abi.encode(bytes32, bytes32, uint256): uint256 as big-endian 32 bytes.
  const uint = ('0x' + BigInt(placeBlock).toString(16).padStart(64, '0')) as Hex;
  return keccak256(concat([treasuryBetId, prevrandao, uint]));
}

export function bitsFromWord(word: Hex, rows: number): number[] {
  const w = BigInt(word);
  return Array.from({ length: rows }, (_, i) => Number((w >> BigInt(i)) & 1n));
}

export function popcount(bits: number[]): number {
  return bits.reduce((a, b) => a + (b ? 1 : 0), 0);
}

/** Cumulative rights after each step: positions[s] = rights among first s bits.
 *  Ball x-offset at step s (in peg-spacing units) is positions[s] - s/2. */
export function pathPositions(bits: number[]): number[] {
  const out = [0];
  let rights = 0;
  for (const b of bits) {
    if (b) rights += 1;
    out.push(rights);
  }
  return out;
}

export function pathFromWord(word: Hex, rows: number): PlinkoPath {
  const bits = bitsFromWord(word, rows);
  return { word, bits, bin: popcount(bits) };
}

type BlockClient = {
  getBlock: (args: { blockNumber: bigint }) => Promise<{ prevRandao?: Hex; prevrandao?: Hex; mixHash?: Hex }>;
};

/** Recompute the exact path the contract used, from chain data only. */
export async function derivePlinkoPath(
  client: BlockClient,
  contract: string,
  gameBetId: Hex,
  placeBlock: number,
  resolveBlock: number,
  rows: number,
): Promise<PlinkoPath> {
  const block = await client.getBlock({ blockNumber: BigInt(resolveBlock) });
  // OP Stack: block.prevrandao in Solidity reads the header mixHash, and
  // viem exposes it as `mixHash` (there is no prevRandao field on these
  // blocks). Fall back through all three names for other clients/chains.
  const prevrandao = (block.prevRandao ?? block.prevrandao ?? block.mixHash) as Hex | undefined;
  if (!prevrandao) throw new Error('resolve block has no prevrandao');
  const word = randomWordFor(treasuryBetIdFor(contract, gameBetId), prevrandao, placeBlock);
  return pathFromWord(word, rows);
}

// Bin multipliers in bps (10000 = 1x) — mirror of Plinko.multBps, for labels.
export const PLINKO_MULT_BPS: Record<number, number[]> = {
  8: [56_000, 21_000, 11_000, 10_000, 5_000, 10_000, 11_000, 21_000, 56_000],
  12: [100_000, 30_000, 16_000, 14_000, 11_000, 10_000, 5_000, 10_000, 11_000, 14_000, 16_000, 30_000, 100_000],
  16: [160_000, 90_000, 20_000, 14_000, 14_000, 12_000, 11_000, 10_000, 5_000, 10_000, 11_000, 12_000, 14_000, 14_000, 20_000, 90_000, 160_000],
};

export function multLabel(rows: number, bin: number): string {
  const t = PLINKO_MULT_BPS[rows];
  if (!t || bin < 0 || bin >= t.length) return '';
  const x = t[bin] / 10_000;
  return `${Number.isInteger(x) ? x : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`;
}
