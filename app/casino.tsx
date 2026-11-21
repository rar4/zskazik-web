'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from 'wagmi';
import { parseEther, formatEther, parseEventLogs } from 'viem';
import { sepolia } from 'viem/chains';
import tokenAbi from '../abi/CasinoToken.json';
import treasuryAbi from '../abi/Treasury.json';
import flipAbi from '../abi/CoinFlip.json';
import diceAbi from '../abi/Dice.json';
import plinkoAbi from '../abi/Plinko.json';
import WalletButton from './wallet-button';
import Spinner from './spinner';

const T = (process.env.NEXT_PUBLIC_TOKEN || '0x79d782ffb87a643b9c5369f54f0c1fca02f40a89') as `0x${string}`;
const TR = (process.env.NEXT_PUBLIC_TREASURY || '0xa84a9505753e0be52486e181bd9dde77d261ad56') as `0x${string}`;
const FL = (process.env.NEXT_PUBLIC_COINFLIP || '0x22157527b27c4e3174215126c100f66b041cf082') as `0x${string}`;
const DI = (process.env.NEXT_PUBLIC_DICE || '0xe3192207fa9da7bdbffd09e0f01fb49c14e59b04') as `0x${string}`;
const PL = (process.env.NEXT_PUBLIC_PLINKO || '0x1a2a89bfdd940b34f62237b6ccb4b8d2644a37cd') as `0x${string}`;
// Fallbacks = the deployed Sepolia addresses (broadcast/*/11155111 in the
// contracts repo). Without them a missing NEXT_PUBLIC_* env var made T/TR/…
// '' and writeContract sent approve calldata with an empty `to` — MetaMask
// interprets that as a contract CREATION and the tx runs out of gas.

// Explicit gas limits, measured from real Sepolia receipts (approve 128k,
// place 1.09–1.18M, resolve 335–539k) with headroom. Without them the
// wallet must estimate gas itself — OKX frequently fails that step with
// "network fee estimation unsuccessful" even though the tx is valid.
// An explicit limit makes the wallet skip estimation entirely.
const GAS_APPROVE = 200_000n;
const GAS_PLACE = 1_500_000n;
const GAS_RESOLVE = 800_000n;

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
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== sepolia.id;

  // Wallet connects on whatever chain it was left on (often mainnet).
  // Auto-switch to Sepolia so writes don't fail the chain check.
  useEffect(() => {
    if (wrongChain) {
      switchChain({ chainId: sepolia.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongChain]);
  const publicClient = usePublicClient();
  const { data: wallet } = useWalletClient();
  const [tab, setTab] = useState<Tab>('flip');
  const [wager, setWager] = useState('100');
  const [choice, setChoice] = useState(true);
  const [target, setTarget] = useState(50);
  const [rows, setRows] = useState(8);
  const [pending, setPending] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [msg, setMsg] = useState('');
  const [bankroll, setBankroll] = useState('0');
  const [bets, setBets] = useState<Bet[]>([]);

  // Allowance via react-query: refetches automatically when the connected
  // chain (and thus the public client) changes. The old hand-rolled poll
  // captured the publicClient from the render when the address first
  // appeared — for a wallet left on mainnet that client is undefined
  // (chain not configured), so the poller early-returned forever and the
  // UI kept asking to "approve again" even after a successful approve.
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: T,
    abi: tokenAbi as any,
    functionName: 'allowance',
    args: address ? ([address, TR] as any) : undefined,
    query: { enabled: !!address && !!T },
  });
  const allowance = allowanceData?.toString() ?? '0';

  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const load = async () => {
    const pc = publicClientRef.current;
    if (!pc || !address) return;
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
    if (!wallet || approving) return;
    if (!T || !TR) {
      setMsg('config error: contract addresses missing');
      return;
    }
    if (wrongChain) {
      setMsg('switching to Sepolia first…');
      switchChain({ chainId: sepolia.id });
      return;
    }
    setApproving(true);
    try {
      setMsg('approving treasury… confirm in your wallet');
      // Exact amount, not 2^256-1: OKX Wallet (and most wallets) block
      // unlimited ERC20 approvals as a security risk.
      const hash = await wallet.writeContract({
        address: T, abi: tokenAbi, functionName: 'approve',
        args: [TR, parseEther(wager || '0')], gas: GAS_APPROVE,
      } as any);
      await publicClient!.waitForTransactionReceipt({ hash });
      // The RPC can lag a block behind the receipt — poll the allowance
      // refetch until it reflects the approval (or give up after ~10s,
      // the 6s background poll + this query's refetch will catch up).
      const want = parseEther(wager || '0');
      for (let i = 0; i < 5; i++) {
        const r = await refetchAllowance();
        if (r.data && (r.data as bigint) >= want) break;
        await new Promise((res) => setTimeout(res, 2000));
      }
      setMsg('approved ✓ now place your bet');
      load();
    } catch (e: any) {
      setMsg('approve failed: ' + (e.shortMessage || e.message));
    } finally {
      setApproving(false);
    }
  };

  const waitBlocks = async (n: number) => {
    const start = await publicClient!.getBlockNumber();
    while ((await publicClient!.getBlockNumber()) < start + BigInt(n)) {
      await new Promise((r) => setTimeout(r, 800));
    }
  };

  const play = async () => {
    if (!wallet) return;
    if (!FL || !DI || !PL) {
      setMsg('config error: game contract addresses missing');
      return;
    }
    if (wrongChain) {
      setMsg('switching to Sepolia first…');
      switchChain({ chainId: sepolia.id });
      return;
    }
    setMsg('');
    try {
      const w = parseEther(wager);
      let gameId: `0x${string}`;
      if (tab === 'flip') {
        const h = await wallet.writeContract({ address: FL, abi: flipAbi, functionName: 'flip', args: [choice, w], gas: GAS_PLACE } as any);
        gameId = parseGameId(await publicClient!.waitForTransactionReceipt({ hash: h }), flipAbi, 'FlipPlaced');
        setPending(gameId); setMsg('flipped — resolving…');
        await waitBlocks(2);
        const rh = await wallet.writeContract({ address: FL, abi: flipAbi, functionName: 'resolve', args: [gameId], gas: GAS_RESOLVE } as any);
        await publicClient!.waitForTransactionReceipt({ hash: rh });
      } else if (tab === 'dice') {
        const h = await wallet.writeContract({ address: DI, abi: diceAbi, functionName: 'roll', args: [target, w], gas: GAS_PLACE } as any);
        gameId = parseGameId(await publicClient!.waitForTransactionReceipt({ hash: h }), diceAbi, 'RollPlaced');
        setPending(gameId); setMsg('rolled — resolving…');
        await waitBlocks(2);
        const rh = await wallet.writeContract({ address: DI, abi: diceAbi, functionName: 'resolve', args: [gameId], gas: GAS_RESOLVE } as any);
        await publicClient!.waitForTransactionReceipt({ hash: rh });
      } else {
        const h = await wallet.writeContract({ address: PL, abi: plinkoAbi, functionName: 'drop', args: [rows, w], gas: GAS_PLACE } as any);
        gameId = parseGameId(await publicClient!.waitForTransactionReceipt({ hash: h }), plinkoAbi, 'DropPlaced');
        setPending(gameId); setMsg('dropped — resolving…');
        await waitBlocks(2);
        const rh = await wallet.writeContract({ address: PL, abi: plinkoAbi, functionName: 'resolve', args: [gameId], gas: GAS_RESOLVE } as any);
        await publicClient!.waitForTransactionReceipt({ hash: rh });
      }
      setMsg('settled ✓ check history');
    } catch (e: any) {
      setMsg('failed: ' + (e.shortMessage || e.message));
    } finally {
      setPending(null); load();
    }
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1>🎰 ZSKazik</h1>
        <WalletButton />
      </div>
      {wrongChain && (
        <div style={{ background: '#4a2b00', border: '1px solid #b97a1a', padding: 12, borderRadius: 10, marginTop: 12 }}>
          ⚠️ Wallet is on chain {chainId} (mainnet) — this casino runs on <b>Sepolia</b>.{' '}
          <button style={S.btn} disabled={isSwitching} onClick={() => switchChain({ chainId: sepolia.id })}>
            {isSwitching ? 'switching…' : 'Switch to Sepolia'}
          </button>
        </div>
      )}
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
            {needApprove && isConnected && !wrongChain && (
              <button style={{ ...S.btn, opacity: approving ? 0.7 : 1, cursor: approving ? 'wait' : 'pointer' }} disabled={approving} onClick={approve}>
                {approving ? <><Spinner />approving…</> : '1️⃣ approve treasury'}
              </button>
            )}
            <button style={{ ...S.btn, opacity: pending ? 0.7 : 1, cursor: pending ? 'wait' : 'pointer' }} disabled={!isConnected || pending !== null || wrongChain || needApprove || approving} onClick={play}>
              {pending ? <><Spinner />resolving…</> : needApprove ? 'approve first ↑' : 'bet'}
            </button>
          </div>
          {(approving || pending) && msg && <div style={{ marginTop: 8 }}><Spinner />{msg}</div>}
          {msg && !approving && !pending && <div style={{ marginTop: 8 }}>{msg}</div>}
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

function parseGameId(rc: any, abi: any, placedEvent: string): `0x${string}` {
  // The place tx emits THREE logs with a bytes32/address in topic1, in order:
  // ERC20 Transfer (escrow pull), Treasury BetEscrowed (treasuryBetId), then
  // the game's *Placed event (gameBetId). Picking "the first log with a
  // 32-byte topic1" — the old logic — returned the Transfer's `from`
  // address, so resolve() reverted BetNotFound and the wager stayed stuck
  // in escrow. Decode by event name instead so only *Placed matches.
  const parsed = parseEventLogs({ abi, logs: rc.logs }) as any[];
  const placed = parsed.find((e) => e.eventName === placedEvent);
  if (placed) return placed.args.gameBetId as `0x${string}`;
  throw new Error(placedEvent + ' not found in receipt');
}
