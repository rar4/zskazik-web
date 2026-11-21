import { NextResponse } from 'next/server';
import { createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ADDR, client } from '@/lib/chain';

export const dynamic = 'force-dynamic';

// Resolve-only endpoint: the relayer submits resolve() for a placed bet.
// Called by the frontend poll loop once the bet is >1 block old, so the
// user never signs the resolve tx themselves.

const gameAbi = parseAbi(['function resolve(bytes32 gameBetId)']);

export async function POST(req: Request) {
  try {
    const { gameBetId, target } = await req.json();
    if (!gameBetId || !target) {
      return NextResponse.json({ error: 'missing gameBetId/target' }, { status: 400 });
    }
    const allowed = [ADDR.coinflip, ADDR.dice, ADDR.plinko].map((a) => a.toLowerCase());
    if (!allowed.includes(String(target).toLowerCase())) {
      return NextResponse.json({ error: 'target not a game contract' }, { status: 400 });
    }
    const pk = process.env.RELAYER_PRIVATE_KEY;
    if (!pk) throw new Error('RELAYER_PRIVATE_KEY not configured');
    const wallet = createWalletClient({
      account: privateKeyToAccount(pk as Hex),
      chain: baseSepolia,
      transport: http('https://base-sepolia-rpc.publicnode.com'),
    });
    const hash = await wallet.writeContract({
      address: target,
      abi: gameAbi as any,
      functionName: 'resolve',
      args: [gameBetId],
    } as any);
    await client.waitForTransactionReceipt({ hash });
    return NextResponse.json({ hash });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.shortMessage || e.message || e) }, { status: 500 });
  }
}
