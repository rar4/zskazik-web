// Decode EVM revert data into a human-readable reason.
//
// Why this exists: the forwarder wraps every inner game revert as
// MetaTransactionFailed(address,bytes) (selector 0x7e256957). Viem's
// shortMessage shows only that outer selector, so users saw
// "executeMetaTransaction reverted with signature 0x7e256957" with no clue
// WHY the bet failed (in practice: ERC20 allowance < wager, because the
// UI's cached allowance never refetched after earlier bets consumed it).
// Decoding the nested bytes here makes the real cause visible.

const KNOWN: Record<string, string> = {
  '0xfb8f41b2': 'ERC20InsufficientAllowance — approve the Treasury for at least the wager first',
  '0x766ca6b5': 'ERC20InsufficientBalance — wager exceeds your ZSK balance',
  '0x5274afe7': 'SafeERC20FailedOperation — token transfer failed (check allowance/balance)',
  '0xd855c4f4': 'InvalidSignature — session key does not match the one authorised on-chain',
  '0xf645eedf': 'InvalidSignature (ECDSA) — session signature could not be recovered',
  '0xfce698f7': 'InvalidSignature — bad signature length',
  '0xd78bce0c': 'InvalidSignature — bad signature s value',
  '0x6659116f': 'SessionNotSet — session key not authorised on-chain',
  '0x3b62ee79': 'SessionExpired — session key expired, register again',
  '0x07375c84': 'ZeroWager — wager is zero',
  '0x469bfa91': 'BetNotFound',
  '0x560ff900': 'AlreadySettled',
  '0x085de625': 'TooEarly — resolve only in a later block',
  '0x1f2a2005': 'ZeroAmount',
  '0x1c4e56c1': 'BelowMinBet — wager below the minimum bet',
  '0x288f969e': 'ExceedsMaxBet — wager above the maximum bet',
  '0xe0fa4f83': 'ExceedsMaxPayout — worst-case payout above the Treasury cap',
  '0x9d3c939f': 'ExceedsWinMultiplier — worst-case payout above the Treasury win-multiplier cap',
  '0xf175dd9f': 'ExceedsTotalExposure — Treasury exposure cap reached',
  '0x414311c8': 'InsolventBankroll — Treasury bankroll cannot cover the payout',
  '0xa91baf81': 'UnauthorizedGame — game contract not authorised on the Treasury',
  '0xd93c0665': 'EnforcedPause — contract is paused',
};

/** Decode a bytes32/hex word or an Error(string) / nested revert blob. */
export function decodeRevertData(data: unknown): string | null {
  if (!data || typeof data !== 'string' || !data.startsWith('0x') || data.length < 10) return null;
  const hex = data.toLowerCase();
  const selector = hex.slice(0, 10);

  // MetaTransactionFailed(address, bytes): selector | address(32) | offset(32) | len(32) | inner...
  if (selector === '0x7e256957' && hex.length >= 10 + 64 * 2) {
    try {
      const lenOff = 10 + 64; // offset word starts at byte 4+32
      const innerLen = parseInt(hex.slice(lenOff + 64, lenOff + 128), 16);
      const innerStart = lenOff + 128;
      if (innerLen > 0 && hex.length >= innerStart + innerLen * 2) {
        const inner = '0x' + hex.slice(innerStart, innerStart + innerLen * 2);
        const decoded = decodeRevertData(inner);
        if (decoded) return decoded;
      }
    } catch {}
    return 'MetaTransactionFailed — the inner bet call reverted (see inner reason)';
  }

  // Error(string): 0x08c379a0 | offset(32) | len(32) | utf8...
  if (selector === '0x08c379a0' && hex.length >= 10 + 128) {
    try {
      const len = parseInt(hex.slice(10 + 64, 10 + 128), 16);
      const bytes = Buffer.from(hex.slice(10 + 128, 10 + 128 + len * 2), 'hex');
      const s = bytes.toString('utf8').trim();
      if (s) return s;
    } catch {}
  }

  if (KNOWN[selector]) return KNOWN[selector];
  return null;
}

/** Extract readable text from a viem/unknown thrown error. */
export function humanizeError(e: any): string {
  const raw: any = e?.cause?.data ?? e?.data ?? e?.cause?.error?.data ?? e?.error?.data ?? null;
  const decoded = decodeRevertData(raw);
  if (decoded) return decoded;
  if (typeof raw === 'string' && raw.startsWith('0x') && raw.length >= 10) {
    return 'execution reverted with selector ' + raw.slice(0, 10);
  }
  // viem ExecutionRevertedError carries the raw data in cause.data as above;
  // fall back to any string reason embedded in the message.
  const msg = String(e?.shortMessage || e?.message || e || '');
  const m = msg.match(/execution reverted:\s*(.+)/i);
  if (m) return m[1].trim();
  return msg;
}
