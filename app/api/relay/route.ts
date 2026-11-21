import { NextResponse } from 'next/server';
import { createWalletClient, http, parseAbi, parseEventLogs, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ADDR, client } from '@/lib/chain';

export const dynamic = 'force-dynamic';

// Relayer: submits session-signed meta-bets via TrustedForwarder (gas paid by
// RELAYER_PRIVATE_KEY, server-only) and auto-resolves in the background.
// The relayer cannot change bet params - the session signature binds
// (user, target, calldata, nonce) and the Forwarder verifies it on-chain.
//
// Latency: the POST returns as soon as the place tx is mined (~1 block).
// The frontend polls and calls /api/resolve once the bet is >1 block old,
// so click-to-placed is ~1 block (~2s) and settlement follows async.

const forwarderAbi = parseAbi([
  'function executeMetaTransaction(address user, address target, bytes callData, bytes signature) returns (bytes)',
  'function isSessionActive(address user) view returns (bool)',
]);

const gameAbi = parseAbi([
  'function resolve(bytes32 gameBetId)',
  'event FlipPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, bool choiceHeads)',
  'event RollPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, uint8 target)',
  'event DropPlaced(bytes32 indexed gameBetId, address indexed player, uint256 wager, uint8 rows)',
]);

// Fast RPC for the relayer: publicnode allows wide getLogs ranges and is
// low-latency; sepolia.base.org caps getLogs at 200 blocks.
const RPC = 'https://base-sepolia-rpc.publicnode.com';

function relayer() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error('RELAYER_PRIVATE_KEY not configured');
  const account = privateKeyToAccount(pk as Hex);
  return createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });
}

export async function POST(req: Request) {
  try {
    const { user, target, callData, signature } = await req.json();
    if (!user || !target || !callData || !signature) {
      return NextResponse.json({ error: 'missing user/target/callData/signature' }, { status: 400 });
    }
    const allowed = [ADDR.coinflip, ADDR.dice, ADDR.plinko].map((a) => a.toLowerCase());
    if (!allowed.includes(String(target).toLowerCase())) {
      return NextResponse.json({ error: 'target not a game contract' }, { status: 400 });
    }
    const wallet = relayer();
    const hash = await wallet.writeContract({
      address: ADDR.forwarder,
      abi: forwarderAbi as any,
      functionName: 'executeMetaTransaction',
      args: [user, target, callData, signature],
    } as any);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'meta-tx reverted', hash }, { status: 500 });
    }
    const logs = parseEventLogs({ abi: gameAbi, logs: receipt.logs }) as any[];
    const placed = logs.find((l) => ['FlipPlaced', 'RollPlaced', 'DropPlaced'].includes(l.eventName));
    const gameBetId: string | null = placed?.args?.gameBetId ?? null;
    // Return immediately - the frontend polls and triggers /api/resolve
    // once the bet is >1 block old, so click-to-placed is ~1 block (~2s).
    return NextResponse.json({ hash, gameBetId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.shortMessage || e.message || e) }, { status: 500 });
  }
}
