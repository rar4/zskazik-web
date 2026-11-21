'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from 'wagmi';
import { parseEther, formatEther, parseEventLogs, encodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getSessionAccount, metaDigest, forwarderAbi, SESSION_DAYS } from '../lib/session';
import tokenAbi from '../abi/CasinoToken.json';
import treasuryAbi from '../abi/Treasury.json';
import flipAbi from '../abi/CoinFlip.json';
import diceAbi from '../abi/Dice.json';
import plinkoAbi from '../abi/Plinko.json';
import WalletButton from './wallet-button';
import Spinner from './spinner';

const T = (process.env.NEXT_PUBLIC_TOKEN || '0x79d782ffb87a643b9c5369f54f0c1fca02f40a89') as `0x${string}`;
const TR = (process.env.NEXT_PUBLIC_TREASURY || '0xa84a9505753e0be52486e181bd9dde77d261ad56') as `0x${string}`;
const FL = (process.env.NEXT_PUBLIC_COINFLIP || '0xAF7fDDa566905860D6BF3AdB4cd73Dc771Fab366') as `0x${string}`;
const DI = (process.env.NEXT_PUBLIC_DICE || '0xDcCBA84D53BF3daa275f57cA7e81b202892EfC14') as `0x${string}`;
const PL = (process.env.NEXT_PUBLIC_PLINKO || '0xdDe34251ad0E1EeD50602680FACdA3e4C66E7f08') as `0x${string}`;
const FW = (process.env.NEXT_PUBLIC_FORWARDER || '0x0FA6F0693cd56D6dE6DD0297C75CCf41FafCbda7') as `0x${string}`;
// Fallbacks = the deployed Base Sepolia addresses (broadcast/*/84532 in the
// contracts repo). Without them a missing NEXT_PUBLIC_* env var made T/TR/…
// '' and writeContract sent approve calldata with an empty `to` — MetaMask
// interprets that as a contract CREATION and the tx runs out of gas.

// Explicit gas limits, measured from real Base Sepolia receipts (approve 128k,
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
  const wrongChain = isConnected && chainId !== baseSepolia.id;

  // Wallet connects on whatever chain it was left on (often mainnet).
  // Auto-switch to Base Sepolia so writes don't fail the chain check.
  useEffect(() => {
    if (wrongChain) {
      switchChain({ chainId: baseSepolia.id });
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
  const [placing, setPlacing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
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

  // parseEther throws on invalid input — typing garbage into the wager
  // box used to crash the whole page during render (needApprove is
  // computed every render). Parse safely and gate the buttons instead.
  const wagerWei = safeParseEther(wager);
  const wagerValid = wagerWei !== null && wagerWei > 0n;
  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: T,
    abi: tokenAbi as any,
    functionName: 'balanceOf',
    args: address ? ([address] as any) : undefined,
    query: { enabled: !!address && !!T, refetchInterval: 6000 },
  });
  const insufficientBalance = wagerValid && balanceData !== undefined && (balanceData as bigint) < wagerWei!;
  const needApprove = wagerValid && BigInt(allowance || '0') < wagerWei!;

  // Session-key (0-popup) betting: is a session authorised on-chain?
  const { data: sessionActiveData, refetch: refetchSession } = useReadContract({
    address: FW,
    abi: forwarderAbi as any,
    functionName: 'isSessionActive',
    args: address ? ([address] as any) : undefined,
    query: { enabled: !!address && !!FW },
  });
  const sessionActive = sessionActiveData === true;
  const [settingUp, setSettingUp] = useState(false);

  // One-time setup (1 popup): authorise the browser session key for 30 days.
  // After this, bets need 0 popups - session key signs off-chain, relayer submits.
  const ensureSession = async (): Promise<boolean> => {
    if (!wallet || settingUp) return false;
    const session = getSessionAccount();
    if (!session) return false;
    setSettingUp(true);
    try {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 3600);
      setMsg('authorising session key… confirm in your wallet (one-time)');
      const hash = await wallet.writeContract({
        address: FW, abi: forwarderAbi, functionName: 'setSigner',
        args: [session.address, expiry],
      } as any);
      await publicClient!.waitForTransactionReceipt({ hash });
      await refetchSession();
      return true;
    } catch (e: any) {
      setMsg('session setup failed: ' + (e.shortMessage || e.message));
      return false;
    } finally {
      setSettingUp(false);
    }
  };

  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const load = async () => {
    const pc = publicClientRef.current;
    if (!pc || !address) return;
    // Live ZSK balance: refetch on every poll (6s) and after every bet
    // (load() runs in play()'s finally), so the header updates immediately
    // when a wager is deducted or a payout lands.
    refetchBalance();
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

  // One-time approval for the whole session: approve the user's full ZSK
  // balance (finite, so wallets don't block it like unlimited approvals),
  // not just one wager - covers many bets with a single popup.
  const ensureApproved = async (): Promise<boolean> => {
    if (!wallet || approving) return false;
    if (!T || !TR) {
      setMsg('config error: contract addresses missing');
      return false;
    }
    const amount = balanceData && (balanceData as bigint) > wagerWei! ? (balanceData as bigint) : wagerWei!;
    setApproving(true);
    try {
      setMsg('approving treasury for 1-click betting… confirm in your wallet (one-time)');
      const hash = await wallet.writeContract({
        address: T, abi: tokenAbi, functionName: 'approve',
        args: [TR, amount], gas: GAS_APPROVE,
      } as any);
      await publicClient!.waitForTransactionReceipt({ hash });
      for (let i = 0; i < 5; i++) {
        const r = await refetchAllowance();
        if (r.data && (r.data as bigint) >= wagerWei!) break;
        await new Promise((res) => setTimeout(res, 2000));
      }
      return true;
    } catch (e: any) {
      setMsg('approve failed: ' + (e.shortMessage || e.message));
      return false;
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
    if (!wallet || placing || pending) return;
    if (!wagerValid || !wagerWei) {
      setMsg('enter a valid wager amount first');
      return;
    }
    if (insufficientBalance) {
      setMsg('insufficient ZSK balance for this wager');
      return;
    }
    if (!FL || !DI || !PL) {
      setMsg('config error: game contract addresses missing');
      return;
    }
    if (wrongChain) {
      setMsg('switching to Base Sepolia first…');
      switchChain({ chainId: baseSepolia.id });
      return;
    }
    setMsg('');
    setPlacing(true);
    // Registration first: this click only registers (approve + session
    // authorisation, 2 popups) and does NOT bet. Bets are placed only
    // after registration, by the next click.
    if (needApprove || !sessionActive) {
      if (needApprove && !(await ensureApproved())) { setPlacing(false); return; }
      if (!(await ensureSession())) { setPlacing(false); return; }
      setPlacing(false);
      setMsg('registered ✓ now click bet to play');
      return;
    }
    // 0-popup path: session key signs off-chain, relayer submits + resolves.
    if (address) {
      try {
        const session = getSessionAccount();
        if (!session) throw new Error('no session key');
        const targetAddr = tab === 'flip' ? FL : tab === 'dice' ? DI : PL;
        const abi = tab === 'flip' ? flipAbi : tab === 'dice' ? diceAbi : plinkoAbi;
        const fn = tab === 'flip' ? 'flip' : tab === 'dice' ? 'roll' : 'drop';
        const args = tab === 'flip' ? [choice, wagerWei] : tab === 'dice' ? [target, wagerWei] : [rows, wagerWei];
        const callData = encodeFunctionData({ abi: abi as any, functionName: fn, args: args as any });
        const nonce = (await publicClient!.readContract({
          address: FW, abi: forwarderAbi, functionName: 'nonces', args: [address],
        } as any)) as bigint;
        const digest = metaDigest(address, targetAddr, callData, nonce);
        const signature = await session.signMessage({ message: { raw: digest } });
        setMsg('placing (1-click, no popup)…');
        const res = await fetch('/api/relay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: address, target: targetAddr, callData, signature }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'relay failed');
        setMsg('settled ✓ check history');
        return;
      } catch (e: any) {
        // Fall through to the direct wallet path below on any relay failure.
        setMsg('1-click failed (' + (e.shortMessage || e.message) + ') — falling back to wallet…');
      } finally {
        setPending(null); setPlacing(false); load();
      }
    }
    try {
      const w = wagerWei;
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
      setPending(null); setPlacing(false); load();
    }
  };

  const resolveStuck = async (b: Bet) => {
    if (!wallet || resolvingId) return;
    const addr = b.game === 'coinflip' ? FL : b.game === 'dice' ? DI : PL;
    const abi = b.game === 'coinflip' ? flipAbi : b.game === 'dice' ? diceAbi : plinkoAbi;
    setResolvingId(b.game_bet_id);
    try {
      const h = await wallet.writeContract({ address: addr, abi, functionName: 'resolve', args: [b.game_bet_id], gas: GAS_RESOLVE } as any);
      await publicClient!.waitForTransactionReceipt({ hash: h });
      setMsg('settled ✓ check history');
      load();
    } catch (e: any) {
      setMsg('resolve failed: ' + (e.shortMessage || e.message));
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1>🎰 ZSKazik</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isConnected && balanceData !== undefined && (
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }} title="Your ZSK balance">
              {fmt((balanceData as bigint).toString())} ZSK
            </span>
          )}
          <WalletButton />
        </div>
      </div>
      {wrongChain && (
        <div style={{ background: '#4a2b00', border: '1px solid #b97a1a', padding: 12, borderRadius: 10, marginTop: 12 }}>
          ⚠️ Wallet is on chain {chainId} (mainnet) — this casino runs on <b>Base Sepolia</b>.{' '}
          <button style={S.btn} disabled={isSwitching} onClick={() => switchChain({ chainId: baseSepolia.id })}>
            {isSwitching ? 'switching…' : 'Switch to Base Sepolia'}
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
            <button style={{ ...S.btn, opacity: (pending || placing || approving || settingUp) ? 0.7 : 1, cursor: (pending || placing || approving || settingUp) ? 'wait' : 'pointer' }} disabled={!isConnected || pending !== null || placing || approving || settingUp || wrongChain || !wagerValid || insufficientBalance} onClick={play}>
              {placing || approving || settingUp ? <><Spinner />{approving ? 'approving…' : settingUp ? 'registering…' : 'placing…'}</> : sessionActive && !needApprove ? 'bet' : 'register (2 confirmations)'}
            </button>
          </div>
          {isConnected && sessionActive && !needApprove && <div style={S.muted}>1-click betting on — bets need 0 popups for 30 days</div>}
          {!wagerValid && isConnected && <div style={S.muted}>enter a valid wager amount</div>}
          {insufficientBalance && <div style={{ color: '#ff9', marginTop: 6 }}>insufficient ZSK balance for this wager</div>}
          {(approving || pending) && msg && <div style={{ marginTop: 8 }}><Spinner />{msg}</div>}
          {msg && !approving && !pending && <div style={{ marginTop: 8 }}>{msg}</div>}
          {pending && <div style={S.muted}>bet {pending} — wait 2 blocks, auto-resolving…</div>}
        </div>
      )}
      <div style={S.card}>
        <b>recent bets</b>
        {(Array.isArray(bets) ? bets : []).length === 0 && <div style={S.muted}>no bets yet</div>}
        {(Array.isArray(bets) ? bets : []).map((b) => (
          <div key={b.game_bet_id} style={{ ...S.muted, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {b.game} · {fmt(b.wager)} → {b.payout ? fmt(b.payout) : '…'} · {b.status}
            </span>
            {b.status === 'escrowed' && isConnected && !wrongChain && (
              <button
                style={{ ...S.btn, padding: '4px 10px', fontSize: 12, opacity: resolvingId === b.game_bet_id ? 0.7 : 1 }}
                disabled={resolvingId !== null || pending !== null}
                onClick={() => resolveStuck(b)}
              >
                {resolvingId === b.game_bet_id ? <><Spinner size={11} />resolving…</> : 'resolve'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(w: string) {
  try { return Number(formatEther(BigInt(w))).toLocaleString(); } catch { return w; }
}

function safeParseEther(v: string): bigint | null {
  try {
    if (!v || !/^\d+(\.\d+)?$/.test(v.trim())) return null;
    return parseEther(v.trim());
  } catch {
    return null;
  }
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
