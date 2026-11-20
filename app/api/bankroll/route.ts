import { NextResponse } from 'next/server';
import { ADDR, client, isZeroAddr } from '@/lib/chain';
import { parseAbiItem, formatEther } from 'viem';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (isZeroAddr(ADDR.treasury)) return NextResponse.json({ bankroll: '0', bankrollEth: '0' });
    const bank = (await client.readContract({
      address: ADDR.treasury,
      abi: [parseAbiItem('function bankroll() view returns (uint256)')],
      functionName: 'bankroll',
    } as any)) as bigint;
    return NextResponse.json({ bankroll: bank.toString(), bankrollEth: formatEther(bank) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
