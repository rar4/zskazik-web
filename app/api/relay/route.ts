import { NextResponse } from 'next/server';
import { createWalletClient, http, parseAbi, parseEventLogs, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ADDR, client } from '@/lib/chain';

export const dynamic = 'force-dynamic';

// Relayer: submits session-signed meta-bets via TrustedForwarder (gas paid by
// RELAYER_PRIVATE_KEY, server-only) and auto-resolves 2 blocks later in the
// same request. The relayer cannot change bet params - the session signature
// binds (user, target, calldata, nonce) and the Forwarder verifies it on-chain.

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

async function waitBlocks(n: number) {
  const start = await client.getBlockNumber();
  while ((await client.getBlockNumber()) < start + BigInt(n)) {
    await new Promise((r) => setTimeout(r, 800));
  }
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
    let gameBetId: string | null = placed?.args?.gameBetId ?? null;
    let resolveHash: string | null = null;
    if (gameBetId) {
      await waitBlocks(2);
      resolveHash = await wallet.writeContract({
        address: target,
        abi: gameAbi as any,
        functionName: 'resolve',
        args: [gameBetId],
      } as any);
      await client.waitForTransactionReceipt({ hash: resolveHash as Hex });
    }
    return NextResponse.json({ hash, gameBetId, resolveHash });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.shortMessage || e.message || e) }, { status: 500 });
  }
}
