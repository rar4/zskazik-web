'use client';

import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { multLabel, pathPositions } from '../lib/plinko-path';

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
      /** On-chain Plinko path: bits[i]=1 => right at row i (see lib/plinko-path). */
      path?: number[];
      word?: string;
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
  const rows = clamp(animation.rows, 8, 16);
  const bins = rows + 1;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);
  const [done, setDone] = useState(false);
  const resultBin = result?.details?.bin;
  const path = result?.details?.path;
  // The path is only trustworthy if it reproduces the settled bin. If the
  // relayer/direct path failed to derive it, we show the settled bin without
  // animating a made-up trajectory.
  const pathValid = Array.isArray(path) && path.length === rows && resultBin !== undefined && path.reduce((a, b) => a + (b ? 1 : 0), 0) === resultBin;

  useEffect(() => { doneRef.current = false; setDone(false); }, [resultBin, path]);

  // Canvas board: ball replays the on-chain bits (bit i = right at row i).
  // Peg positions are in spacing units: at step s the ball has `rights`
  // rights among the first s bits, x-offset = rights - s/2, which is exactly
  // peg (s, rights). Motion between pegs is cosmetic only (easing, squash,
  // trail) — it cannot change the bin.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // NOTE: this effect deliberately does NOT depend on the `result`
    // object identity. The parent creates a new object on every update,
    // and depending on it restarted the ball from the top (multiple
    // falls per bet). It reruns only when the settled bin/path change,
    // so the ball falls exactly once per result — into the chain bin.
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 560;
    const rowGap = Math.min(26, Math.floor(340 / rows));
    const H = 46 + rows * rowGap + 30;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.maxWidth = '100%';
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);
    const spacing = (W - 40) / rows;
    const pegXY = (row: number, col: number) => ({ x: W / 2 + (col - row / 2) * spacing, y: 30 + row * rowGap });
    const ballXY = (step: number, rights: number) => ({ x: W / 2 + (rights - step / 2) * spacing, y: 30 + step * rowGap });

    // Segment timeline: fall between pegs, accelerating slightly, then a
    // settle into the bin. Slow-mo the last two segments on high bins.
    const positions = pathValid && path ? pathPositions(path) : null;
    const segDur: number[] = [];
    if (positions) {
      const mult = result?.details?.multBps ? Number(result.details.multBps) : 0;
      const slow = mult >= 20000 ? 1.6 : 1;
      for (let i = 0; i < rows; i++) {
        let d = 165 - i * 4;
        if (i >= rows - 2) d *= slow;
        segDur.push(Math.max(70, d));
      }
      segDur.push(420); // settle into bin
    }
    const total = segDur.reduce((a, b) => a + b, 0);
    let raf = 0;
    let start = 0;
    let lastHit = -1;
    let audio: AudioContext | null = null;
    const trail: { x: number; y: number }[] = [];
    const tick = () => {
      try {
        audio = audio ?? new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audio.state === 'suspended') void audio.resume();
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = 1900;
        g.gain.setValueAtTime(0.05, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.06);
        o.connect(g).connect(audio.destination);
        o.start();
        o.stop(audio.currentTime + 0.07);
      } catch { /* sound is cosmetic */ }
    };
    const draw = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      // Locate segment + local progress.
      let seg = 0;
      let acc = 0;
      while (seg < segDur.length && t > acc + segDur[seg]) { acc += segDur[seg]; seg += 1; }
      const p = segDur.length ? Math.min(1, Math.max(0, (t - acc) / (segDur[seg] ?? 1))) : 1;
      const finished = !!positions && (seg >= segDur.length || t >= total);
      const curStep = positions ? Math.min(rows, seg) : 0;
      const curRights = positions ? positions[curStep] : 0;
      let bx: number, by: number;
      if (!positions) {
        // Idle: ball hovers at the top until the on-chain path arrives.
        bx = W / 2;
        by = 16 + Math.sin(now / 320) * 4;
      } else if (finished) {
        const end = ballXY(rows, positions[rows]);
        bx = end.x; by = end.y + rowGap; // resting inside the bucket slot
      } else if (seg >= rows) {
        // Settle segment: drop straight into the bucket.
        const end = ballXY(rows, positions[rows]);
        bx = end.x;
        by = end.y + p * rowGap;
      } else {
        const a = ballXY(curStep, curRights);
        const b = ballXY(curStep + 1, positions[curStep + 1]);
        const e = p * p * (3 - 2 * p); // smootherstep-ish
        // Quadratic arc sagging slightly below the straight diagonal.
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 + rowGap * 0.28;
        bx = (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * mx + e * e * b.x;
        by = (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * my + e * e * b.y;
        if (p >= 0.98 && curStep !== lastHit) { lastHit = curStep; tick(); }
      }
      if (finished && !doneRef.current) { doneRef.current = true; setDone(true); }
      // Pegs. Peg (r, c) is hit iff the ball's rights at step r equal c.
      ctx.clearRect(0, 0, W, H);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= r; c++) {
          const { x, y } = pegXY(r, c);
          const hit = !!positions && curStep > r && c === positions[r];
          ctx.beginPath();
          ctx.arc(x, y, hit ? 4.5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = hit ? '#dfe6ff' : '#aab6ff';
          ctx.shadowColor = 'rgba(170,182,255,.7)';
          ctx.shadowBlur = hit ? 10 : 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      // Trail.
      if (positions) {
        trail.push({ x: bx, y: by });
        if (trail.length > 14) trail.shift();
        trail.forEach((pt, i) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3 + (i / trail.length) * 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(108,92,231,${(i / trail.length) * 0.25})`;
          ctx.fill();
        });
      }
      // Ball (squash on peg impact).
      const squash = positions && p > 0.85 ? 1 - (p - 0.85) * 1.2 : 1;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(2 - squash, squash);
      const grad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 11);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.55, '#6c5ce7');
      grad.addColorStop(1, '#2f2470');
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(108,92,231,.9)';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.restore();
      if (!finished) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); if (audio) void audio.close().catch(() => {}); };
  }, [rows, path, pathValid, resultBin]);

  const pathStr = pathValid && path ? path.map((b) => (b ? 'R' : 'L')).join(' ') : null;

  return (
    <div style={{ width: 'min(560px, 100%)', margin: '0 auto' }}>
      <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} aria-label="Plinko board" />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bins}, 1fr)`, gap: 5, marginTop: 8 }}>
        {Array.from({ length: bins }).map((_, i) => {
          const isWin = done && i === resultBin;
          const label = multLabel(rows, i) || String(i);
          return (
            <div
              key={i}
              style={{
                minHeight: 38,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,.12)',
                background: isWin ? (result?.status === 'won' ? '#117a38' : '#8b1e2d') : 'rgba(255,255,255,.07)',
                fontWeight: 900,
                fontSize: 12,
                transform: isWin ? 'scale(1.1)' : undefined,
                transition: 'all .25s ease',
              }}
            >
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, opacity: 0.72, fontSize: 13 }}>
        {resultBin === undefined
          ? 'Waiting for on-chain result — ball drops only once the bin is locked.'
          : pathValid
            ? `Landed in bin ${resultBin} · path ${pathStr}`
            : `Landed in bin ${resultBin} · on-chain path unavailable for this bet, showing settled bin only.`}
      </div>
      {pathValid && result?.details?.word ? (
        <div style={{ marginTop: 4, opacity: 0.5, fontSize: 11 }} title={result.details.word}>
          word {result.details.word.slice(0, 20)}… · bin = popcount(path bits)
        </div>
      ) : null}
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
