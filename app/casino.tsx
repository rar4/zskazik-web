'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import tokenAbi from '../abi/CasinoToken.json';
import treasuryAbi from '../abi/Treasury.json';
import flipAbi from '../abi/CoinFlip.json';
import diceAbi from '../abi/Dice.json';
import plinkoAbi from '../abi/Plinko.json';

const T = (process.env.NEXT_PUBLIC_TOKEN || '') as `0x${string}`;
const TR = (process.env.NEXT_PUBLIC_TREASURY || '') as `0x${string}`;
const FL = (process.env.NEXT_PUBLIC_COINFLIP || '') as `0x${string}`;
const DI = (process.env.NEXT_PUBLIC_DICE || '') as `0x${string}`;
const PL = (process.env.NEXT_PUBLIC_PLINKO || '') as `0x${string}`;

type Tab = 'flip' | 'dice' | 'plinko' | 'history';
type Bet = { game_bet_id: string; game: string; player: string; wager: string; payout?: string; status: string };

const S = {
  page: { maxWidth: 860, margin: '0 auto', padding: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as const,
  tabs: { display: 'flex', gap: 8, margin: '16px 0' },
  tab: (on: boolean) => ({
    padding: '8px 14px', borderRadius: 10, border: '1px solid #2a3350', cursor: 'pointer',
    background: on ? '#6c5ce7' : '#151b2e', color: '#fff',
  }),
  card: { background: '#151b2e', border: '1px solid #2a3350', borderRadius: 14, padding: 16, marginTop: 12 },
  row: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' } as const,
  input: { padding: 10, borderRadius: 8, border: '1px solid #2a3350', background: '#0b0e17', color: '#fff', width: 160 },
  btn: { padding: '10px 16px', borderRadius: 10, border: 0, background: '#6c5ce7', color: '#fff', cursor: 'pointer' },
  muted: { opacity: 0.7, fontSize: 13 },
};

export default function Casino() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: wallet } = useWalletClient();
  const [tab, setTab] = useState<Tab>('flip');
  const [wager, setWager] = useState('100');
  const [choice, setChoice] = useState(true);
  const [target, setTarget] = useState(50);
  const [rows, setRows] = useState(8);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [allowance, setAllowance] = useState('0');
  const [bankroll, setBankroll] = useState('0');
  const [bets, setBets] = useState<Bet[]>([]);

  const load = async () => {
    if (!publicClient || !address) return;
    try {
      const al = (await publicClient.readContract({
        address: T, abi: tokenAbi, functionName: 'allowance', args: [address, TR],
      } as any)) as bigint;
      setAllowance(al.toString());
    } catch {}
    try {
      const r = await fetch(`/api/bankroll`);
      const j = await r.json();
      if (j.bankroll) setBankroll(j.bankroll);
    } catch {}
    try {
      const r = await fetch(`/api/bets?player=${address}&limit=20`);
      const data = await r.json().catch(() => []);
      setBets(Array.isArray(data) ? data : []);
    } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const needApprove = BigInt(allowance || '0') < parseEther(wager || '0');

  const approve = async () => {
    if (!wallet) return;
    setMsg('approving treasury…');
    const hash = await wallet.writeContract({
      address: T, abi: tokenAbi, functionName: 'approve',
      args: [TR, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    setMsg('approved ✓ now place your bet');
    load();
  };

  const waitBlocks = async (n: number) => {
    const start = await publicClient!.getBlockNumber();
    while ((await publicClient!.getBlockNumber()) < start + BigInt(n)) {
      await new Promise((r) => setTimeout(r, 800));
    }
  };

  const play = async () => {
    if (!wallet) return;
    setMsg('');
    try {
      const w = parseEther(wager);
      let gameId: `0x${string}`;
      if (tab === 'flip') {
        const h = await wallet.writeContract({ address: FL, abi: flipAbi, functionName: 'flip', args: [choice, w] } as any);
        gameId = parseGameId(await publicClient!.waitForTransactionReceipt({ hash: h }));
        setPending(gameId); setMsg('flipped — resolving…');
        await waitBlocks(2);
        const rh = await wallet.writeContract({ address: FL, abi: flipAbi, functionName: 'resolve', args: [gameId] } as any);
        await publicClient!.waitForTransactionReceipt({ hash: rh });
      } else if (tab === 'dice') {
        const h = await wallet.writeContract({ address: DI, abi: diceAbi, functionName: 'roll', args: [target, w] } as any);
        gameId = parseGameId(await publicClient!.waitForTransactionReceipt({ hash: h }));
        setPending(gameId); setMsg('rolled — resolving…');
        await waitBlocks(2);
        const rh = await wallet.writeContract({ address: DI, abi: diceAbi, functionName: 'resolve', args: [gameId] } as any);
        await publicClient!.waitForTransactionReceipt({ hash: rh });
      } else {
        const h = await wallet.writeContract({ address: PL, abi: plinkoAbi, functionName: 'drop', args: [rows, w] } as any);
        gameId = parseGameId(await publicClient!.waitForTransactionReceipt({ hash: h }));
        setPending(gameId); setMsg('dropped — resolving…');
        await waitBlocks(2);
        const rh = await wallet.writeContract({ address: PL, abi: plinkoAbi, functionName: 'resolve', args: [gameId] } as any);
        await publicClient!.waitForTransactionReceipt({ hash: rh });
      }
      setMsg('settled ✓ check history');
    } catch (e: any) {
      setMsg('failed: ' + (e.shortMessage || e.message));
    } finally {
      setPending(null); load();
    }
  };

  const onConnect = (connector?: any) => {
    setMsg('');
    const c = connector || connectors.find((x: any) => x.id === 'okx-wallet') || connectors[0];
    if (!c) {
      setMsg('No wallet found — install OKX Wallet or MetaMask and open this page in the same browser.');
      return;
    }
    connect({ connector: c });
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1>🎰 ZSKazik</h1>
        {isConnected ? (
          <button style={S.btn} onClick={() => disconnect()}>{address?.slice(0, 8)}… disconnect</button>
        ) : (
          <div style={S.row}>
            <button style={S.btn} disabled={isPending} onClick={() => onConnect(connectors.find((x: any) => x.id === 'okx-wallet'))}>{isPending ? 'connecting…' : 'connect OKX Wallet'}</button>
            <button style={S.btn} disabled={isPending} onClick={() => onConnect(connectors.find((x: any) => x.id !== 'okx-wallet') || connectors[0])}>connect wallet</button>
          </div>
        )}
      </div>
      <div style={S.muted}>
        {connectors.map((c: any) => <span key={c.uid} style={{ marginRight: 8 }}>{c.name} ({c.id})</span>)}
      </div>
      {connectError && <div style={{ color: '#ff9', marginTop: 8 }}>connect failed: {connectError.message} — install MetaMask and try again in the same browser.</div>}
      <div style={S.muted}>bankroll: {fmt(bankroll)} ZSK · testnet randomness — mainnet needs VRF</div>
      <div style={S.tabs}>
        {(['flip', 'dice', 'plinko', 'history'] as Tab[]).map((t) => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab !== 'history' && (
        <div style={S.card}>
          <div style={S.row}>
            <input style={S.input} value={wager} onChange={(e) => setWager(e.target.value)} placeholder="wager ZSK" />
            {tab === 'flip' && (
              <button style={S.tab(choice)} onClick={() => setChoice(!choice)}>{choice ? 'heads' : 'tails'}</button>
            )}
            {tab === 'dice' && (
              <input style={S.input} type="number" min={5} max={95} value={target} onChange={(e) => setTarget(Number(e.target.value))} title="roll-over target" />
            )}
            {tab === 'plinko' && (
              <select value={rows} onChange={(e) => setRows(Number(e.target.value))} style={S.input as any}>
                <option value={8}>8 rows</option><option value={12}>12 rows</option><option value={16}>16 rows</option>
              </select>
            )}
          </div>
          {tab === 'dice' && <div style={S.muted}>target {target} → pays {(98 / (100 - target)).toFixed(2)}x on roll ≥ {target} (2% edge)</div>}
          {tab === 'flip' && <div style={S.muted}>pays 1.96x (2% edge)</div>}
          {tab === 'plinko' && <div style={S.muted}>pays by bin table, up to 16x on 16 rows</div>}
          <div style={S.row}>
            {needApprove && isConnected && <button style={S.btn} onClick={approve}>1️⃣ approve treasury</button>}
            <button style={S.btn} disabled={!isConnected || pending !== null} onClick={play}>
              {pending ? 'resolving…' : needApprove ? '2️⃣ bet (after approve)' : 'bet'}
            </button>
          </div>
          {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
          {pending && <div style={S.muted}>bet {pending} — wait 2 blocks, auto-resolving…</div>}
        </div>
      )}
      <div style={S.card}>
        <b>recent bets</b>
        {(Array.isArray(bets) ? bets : []).length === 0 && <div style={S.muted}>no bets yet</div>}
        {(Array.isArray(bets) ? bets : []).map((b) => (
          <div key={b.game_bet_id} style={S.muted}>
            {b.game} · {fmt(b.wager)} → {b.payout ? fmt(b.payout) : '…'} · {b.status}
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(w: string) {
  try { return Number(formatEther(BigInt(w))).toLocaleString(); } catch { return w; }
}

function parseGameId(rc: any): `0x${string}` {
  for (const log of rc.logs) {
    if (log.topics && log.topics.length >= 2 && log.topics[1]?.length === 66) {
      return log.topics[1] as `0x${string}`;
    }
  }
  throw new Error('gameBetId not found in receipt');
}
