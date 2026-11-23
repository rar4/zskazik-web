'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';

export type BetAnimationState = {
  game: 'flip' | 'dice' | 'plinko';
  wager: string;
  choiceHeads: boolean;
  target: number;
  rows: number;
  result?: {
    status: 'won' | 'lost';
    payout: string;
    won?: boolean;
    details?: {
      roll?: number;
      bin?: number;
      multBps?: string;
    };
  } | null;
};

const WAIT_MS = 2400;

export default function BetAnimation({ animation, onClose }: { animation: BetAnimationState; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const i = setInterval(() => setTick((v) => v + 1), 90);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = old;
    };
  }, []);

  const result = ready ? animation.result ?? null : null;
  const won = result?.status === 'won';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${animation.game} bet animation`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflowY: 'auto',
        color: '#f4f6ff',
        background:
          'radial-gradient(circle at 50% 18%, rgba(108,92,231,.38), transparent 34%), linear-gradient(180deg, rgba(7,9,20,.96), rgba(11,14,23,.98))',
      }}
    >
      <style>{`
        @keyframes zsk-coin-spin { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
        @keyframes zsk-dice-shake { 0% { transform: translateY(0) rotate(-4deg) scale(1); } 50% { transform: translateY(-9px) rotate(4deg) scale(1.04); } 100% { transform: translateY(0) rotate(-2deg) scale(1); } }
        @keyframes zsk-ball-pulse { 0%,100% { box-shadow: 0 0 0 5px rgba(108,92,231,.22), 0 0 22px rgba(108,92,231,.72); } 50% { box-shadow: 0 0 0 10px rgba(108,92,231,.10), 0 0 34px rgba(108,92,231,.95); } }
        @keyframes zsk-confetti-fall { 0% { transform: translateY(-18px) rotate(0deg); opacity: 1; } 100% { transform: translateY(170px) rotate(540deg); opacity: 0; } }
        @keyframes zsk-reveal { from { transform: scale(.9) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes zsk-glow { 0%,100% { filter: drop-shadow(0 0 12px rgba(108,92,231,.55)); } 50% { filter: drop-shadow(0 0 26px rgba(108,92,231,.9)); } }
      `}</style>

      {result && won && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
          {Array.from({ length: 30 }).map((_, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                top: (i % 5) * 22,
                left: `${(i * 37) % 100}%`,
                width: 7 + (i % 4) * 2,
                height: 11 + (i % 5) * 3,
                borderRadius: 2,
                background: ['#ffd166', '#6c5ce7', '#4ecdc4', '#ff6b9d', '#f8f9fa'][i % 5],
                opacity: 0.88,
                animation: `zsk-confetti-fall ${1.35 + (i % 5) * 0.12}s ease-out ${i * 0.035}s forwards`,
              }}
            />
          ))}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          width: 'min(780px, 100%)',
          maxHeight: 'calc(100vh - 36px)',
          overflowY: 'auto',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 28,
          padding: 'clamp(22px, 5vw, 46px)',
          textAlign: 'center',
          background: 'rgba(12,16,30,.82)',
          boxShadow: '0 28px 90px rgba(0,0,0,.55)',
          backdropFilter: 'blur(10px)',
          animation: result ? 'zsk-reveal .35s ease-out' : undefined,
        }}
      >
        <div style={{ letterSpacing: 3, fontWeight: 800, opacity: 0.72, textTransform: 'uppercase' }}>
          {animation.game}
        </div>
        <h1 style={{ margin: '10px 0 8px', fontSize: 'clamp(34px, 8vw, 68px)', lineHeight: 1, letterSpacing: -1 }}>
          {result ? (won ? 'YOU WON' : 'YOU LOST') : 'IN PLAY'}
        </h1>
        <div style={{ opacity: 0.78, minHeight: 22 }}>
          {result ? resultLine(animation, result) : 'Waiting for on-chain result…'}
        </div>

        <div style={{ height: 'clamp(280px, 48vh, 430px)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
          {animation.game === 'flip' && <CoinAnimation animation={animation} result={result} />}
          {animation.game === 'dice' && <DiceAnimation animation={animation} result={result} tick={tick} />}
          {animation.game === 'plinko' && <PlinkoAnimation animation={animation} result={result} />}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
          <Metric label="Wager" value={`${fmt(animation.wager)} ZSK`} />
          {result && <Metric label="Payout" value={`${fmt(result.payout)} ZSK`} strong={won} />}
          {result && netValue(animation.wager, result.payout) && <Metric label="Net" value={`${netValue(animation.wager, result.payout)} ZSK`} strong={won} />}
        </div>

        <div style={{ marginTop: 26, minHeight: 46 }}>
          {result ? (
            <button
              onClick={onClose}
              style={{ padding: '13px 24px', border: 0, borderRadius: 999, background: '#6c5ce7', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
            >
              Back to game
            </button>
          ) : (
            <span style={{ opacity: 0.72 }}>The animation settles when the chain result lands.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CoinAnimation({ animation, result }: { animation: BetAnimationState; result: NonNullable<BetAnimationState['result']> | null }) {
  const heads = result
    ? result.won === undefined
      ? animation.choiceHeads
      : result.won
        ? animation.choiceHeads
        : !animation.choiceHeads
    : null;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ perspective: 900 }}>
        <div
          style={{
            position: 'relative',
            width: 'clamp(150px, 34vw, 220px)',
            height: 'clamp(150px, 34vw, 220px)',
            margin: '0 auto',
            transformStyle: 'preserve-3d',
            animation: result ? undefined : 'zsk-coin-spin 1.12s linear infinite',
            transform: result ? (heads ? 'rotateY(0deg)' : 'rotateY(180deg)') : undefined,
            transition: result ? 'transform .55s ease' : undefined,
          }}
        >
          <CoinFace label="H" text="HEADS" style={{ background: 'radial-gradient(circle at 35% 30%, #fff3b0, #edc34d 45%, #9a6c16)' }} />
          <CoinFace label="T" text="TAILS" back style={{ background: 'radial-gradient(circle at 35% 30%, #d9f7ff, #7dd3fc 45%, #0369a1)' }} />
        </div>
      </div>
      <div style={{ marginTop: 24, fontSize: 24, fontWeight: 900, letterSpacing: 3 }}>
        {result && heads !== null ? (heads ? 'HEADS' : 'TAILS') : 'FLIPPING'}
      </div>
      <div style={{ marginTop: 6, opacity: 0.7 }}>You picked {animation.choiceHeads ? 'HEADS' : 'TAILS'}</div>
    </div>
  );
}

function CoinFace({ label, text, back = false, style }: { label: string; text: string; back?: boolean; style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: '8px solid rgba(255,255,255,.38)',
        boxShadow: 'inset 0 -18px 34px rgba(0,0,0,.24), 0 24px 54px rgba(0,0,0,.34)',
        color: '#17120b',
        fontWeight: 1000,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        ...style,
      }}
    >
      <span style={{ fontSize: 'clamp(56px, 13vw, 88px)', lineHeight: 1 }}>{label}</span>
      <span style={{ fontSize: 12, letterSpacing: 3 }}>{text}</span>
    </div>
  );
}

function DiceAnimation({ animation, result, tick }: { animation: BetAnimationState; result: NonNullable<BetAnimationState['result']> | null; tick: number }) {
  const shown = result?.details?.roll ?? Math.floor(((tick * 37) % 100 + 100) % 100);
  const won = result?.status === 'won';
  const target = clamp(animation.target, 5, 95);

  return (
    <div style={{ width: 'min(560px, 100%)' }}>
      <div
        style={{
          width: 'clamp(150px, 34vw, 218px)',
          height: 'clamp(150px, 34vw, 218px)',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 30,
          border: '1px solid rgba(255,255,255,.18)',
          background: result
            ? won
              ? 'linear-gradient(145deg, #174d2a, #0f7a3d)'
              : 'linear-gradient(145deg, #4b1720, #8b1e2d)'
            : 'linear-gradient(145deg, #273154, #111827)',
          boxShadow: '0 26px 70px rgba(0,0,0,.42)',
          fontSize: 'clamp(72px, 17vw, 118px)',
          fontWeight: 1000,
          letterSpacing: -4,
          animation: result ? undefined : 'zsk-dice-shake .18s ease-in-out infinite alternate',
        }}
      >
        {String(shown).padStart(2, '0')}
      </div>

      <div style={{ position: 'relative', height: 18, marginTop: 34, borderRadius: 999, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${target}%`,
            background: result ? (won ? '#42d977' : '#ff5a6d') : '#6c5ce7',
            animation: result ? undefined : 'zsk-glow 1.2s ease-in-out infinite',
          }}
        />
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${target}% - 1px)`, width: 2, background: '#fff', opacity: 0.85 }} />
        {result?.details?.roll !== undefined && (
          <div style={{ position: 'absolute', top: -8, bottom: -8, left: `calc(${result.details.roll}% - 2px)`, width: 4, background: '#fff', borderRadius: 999 }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, opacity: 0.72, fontSize: 13 }}>
        <span>0</span>
        <span>pay on roll ≥ {target}</span>
        <span>99</span>
      </div>
    </div>
  );
}

function PlinkoAnimation({ animation, result }: { animation: BetAnimationState; result: NonNullable<BetAnimationState['result']> | null }) {
  const rows = clamp(animation.rows, 1, 16);
  const bins = rows + 1;
  const [step, setStep] = useState(0);
  const resultBin = result?.details?.bin;
  const cycle = Math.floor(step / (rows + 2));
  const runningBin = (11 + cycle * 37) % bins;
  const finalBin = resultBin ?? runningBin;
  const known = resultBin !== undefined;

  useEffect(() => {
    setStep(0);
  }, [resultBin]);

  useEffect(() => {
    const i = setInterval(() => {
      setStep((s) => {
        if (known) return Math.min(rows, s + 1);
        return s >= rows + 1 ? 0 : s + 1;
      });
    }, 170);
    return () => clearInterval(i);
  }, [known, rows]);

  const path = useMemo(() => {
    const rights = new Set(Array.from({ length: finalBin }, (_, j) => Math.floor(((j + 1) * rows) / (finalBin + 1))));
    let lefts = 0;
    return Array.from({ length: rows + 1 }, (_, i) => {
      if (i > 0 && rights.has(i - 1)) lefts += 1;
      return lefts;
    });
  }, [finalBin, rows]);

  const spacing = 38 / Math.max(1, rows / 2);
  const rowGap = Math.min(31, Math.max(16, Math.floor(295 / Math.max(1, rows))));
  const ballLeft = 50 + ((path[step] ?? 0) - step / 2) * spacing;
  const ballTop = 18 + step * rowGap;

  return (
    <div style={{ width: 'min(560px, 100%)' }}>
      <div style={{ position: 'relative', height: 30 + rows * rowGap + 48 }}>
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: r + 1 }).map((__, i) => (
            <span
              key={`${r}-${i}`}
              style={{
                position: 'absolute',
                left: `${50 + (i - r / 2) * spacing}%`,
                top: 24 + r * rowGap,
                width: 7,
                height: 7,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                background: '#aab6ff',
                boxShadow: '0 0 8px rgba(170,182,255,.5)',
              }}
            />
          ))
        )}
        <span
          style={{
            position: 'absolute',
            left: `${ballLeft}%`,
            top: ballTop,
            width: 20,
            height: 20,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle at 35% 30%, #fff, #6c5ce7 55%, #2f2470)',
            transition: 'left .17s ease-out, top .17s ease-out',
            animation: 'zsk-ball-pulse .9s ease-in-out infinite',
          }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bins}, 1fr)`, gap: 5, marginTop: 8 }}>
        {Array.from({ length: bins }).map((_, i) => (
          <div
            key={i}
            style={{
              minHeight: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,.12)',
              background: result && i === resultBin ? (result.status === 'won' ? '#117a38' : '#8b1e2d') : 'rgba(255,255,255,.07)',
              fontWeight: 900,
              transform: result && i === resultBin ? 'scale(1.08)' : undefined,
              transition: 'all .2s ease',
            }}
          >
            {i}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, opacity: 0.72 }}>
        {result?.details?.bin !== undefined ? `Landed in bin ${result.details.bin}` : `Dropping through ${rows} rows…`}
      </div>
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      style={{
        minWidth: 132,
        padding: '12px 16px',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,.12)',
        background: strong ? 'rgba(66,217,119,.12)' : 'rgba(255,255,255,.06)',
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.68 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function resultLine(animation: BetAnimationState, result: NonNullable<BetAnimationState['result']>) {
  if (animation.game === 'flip') {
    const heads = result.won === undefined ? animation.choiceHeads : result.won ? animation.choiceHeads : !animation.choiceHeads;
    return `Coin landed ${heads ? 'HEADS' : 'TAILS'} · you picked ${animation.choiceHeads ? 'HEADS' : 'TAILS'}`;
  }
  if (animation.game === 'dice') {
    return result.details?.roll !== undefined ? `Rolled ${result.details.roll} · target ${clamp(animation.target, 5, 95)}+` : 'Result settled';
  }
  const mult = result.details?.multBps ? `${trimNumber(Number(result.details.multBps) / 10000)}x` : null;
  return result.details?.bin !== undefined ? `Bin ${result.details.bin}${mult ? ` · ${mult}` : ''}` : 'Result settled';
}

function netValue(wager: string, payout: string) {
  try {
    const net = Number(formatEther(BigInt(payout))) - Number(formatEther(BigInt(wager)));
    if (!Number.isFinite(net) || net === 0) return null;
    return `${net > 0 ? '+' : '−'}${Math.abs(net).toLocaleString()}`;
  } catch {
    return null;
  }
}

function fmt(w: string) {
  try {
    return Number(formatEther(BigInt(w))).toLocaleString();
  } catch {
    return w;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function trimNumber(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
