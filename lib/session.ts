// Session-key helpers for 0-popup betting (Metaplay-style).
//
// Flow: the user authorises a throwaway session key ONCE on-chain
// (TrustedForwarder.setSigner). After that, bets are signed off-chain by the
// session key (no wallet popup) and submitted by the relayer (/api/relay),
// which pays gas. Funds never leave the user's wallet - Treasury pulls the
// wager via the user's standing approval to the Treasury.

import { keccak256, encodePacked, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const KEY = 'zskazik-session-key';
export const SESSION_DAYS = 30;

export function getSessionAccount() {
  if (typeof window === 'undefined') return null;
  let pk = localStorage.getItem(KEY);
  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem(KEY, pk);
  }
  return privateKeyToAccount(pk as `0x${string}`);
}

export function clearSession() {
  if (typeof window !== 'undefined') localStorage.removeItem(KEY);
}

// Must match TrustedForwarder.metaDigest (Solidity abi.encodePacked):
// keccak256(abi.encodePacked(user, target, callData, nonce))
export function metaDigest(user: `0x${string}`, target: `0x${string}`, callData: `0x${string}`, nonce: bigint) {
  return keccak256(encodePacked(['address', 'address', 'bytes', 'uint256'], [user, target, callData, nonce]));
}

export const forwarderAbi = parseAbi([
  'function setSigner(address signer, uint64 expiry)',
  'function revokeSigner()',
  'function sessionOf(address user) view returns (address signer, uint64 expiry)',
  'function isSessionActive(address user) view returns (bool)',
  'function nonces(address user) view returns (uint256)',
  'function executeMetaTransaction(address user, address target, bytes callData, bytes signature) returns (bytes)',
  'function metaDigest(address user, address target, bytes callData, uint256 nonce) pure returns (bytes32)',
]);
