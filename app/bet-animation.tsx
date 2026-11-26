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
  // Plinko: the result header/metrics stay hidden until the ball has
  // actually landed (onDone), so the reveal is synced to the drop —
  // not to the moment the chain result arrives.
  const [plinkoDone, setPlinkoDone] = useState(false);
  // Plinko loading overlay: a separate full-screen screen shown between
  // click and the ball drop. It fades out once the chain result has
  // landed, and only then is the result handed to the board so the ball
  // starts falling as the screen disappears.
  const [overlayPhase, setOverlayPhase] = useState<'loading' | 'fading' | 'gone'>('loading');
  const overlayPhaseRef = useRef(overlayPhase);
  overlayPhaseRef.current = overlayPhase;

  useEffect(() => { setPlinkoDone(false); setOverlayPhase('loading'); }, [animation]);

  const rawResultEarly = animation.result ?? null;
  useEffect(() => {
    if (animation.game !== 'plinko' || !rawResultEarly || overlayPhaseRef.current !== 'loading') return;
    setOverlayPhase('fading');
    const t = setTimeout(() => setOverlayPhase('gone'), 250);
    return () => clearTimeout(t);
  }, [rawResultEarly, animation.game]);

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

  const rawResult = animation.result ?? null;
  // Flip/Dice keep the timed reveal; Plinko reveals on ball landing.
  const result = animation.game === 'plinko' ? (plinkoDone ? rawResult : null) : ready ? rawResult : null;
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
        @keyframes zsk-load-shimmer { 0% { transform: translateX(-110%); } 100% { transform: translateX(280%); } }
        @keyframes zsk-load-ring { 0% { transform: scale(.55); opacity: .85; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes zsk-orb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes zsk-load-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
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
          {result ? resultLine(animation, result) : animation.game === 'plinko' ? 'Anticipation — the ball drops for real once the chain result lands' : 'Waiting for on-chain result…'}
        </div>

        <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
          {animation.game === 'flip' && <CoinAnimation animation={animation} result={result} />}
          {animation.game === 'dice' && <DiceAnimation animation={animation} result={result} tick={tick} />}
          {animation.game === 'plinko' && <PlinkoAnimation animation={animation} result={overlayPhase === 'gone' ? rawResult : null} onDone={() => setPlinkoDone(true)} />}
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

      {animation.game === 'plinko' && overlayPhase !== 'gone' && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Plinko loading"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
            color: '#f4f6ff',
            background: 'radial-gradient(circle at 50% 22%, rgba(108,92,231,.42), transparent 42%), linear-gradient(180deg, rgba(7,9,20,.99), rgba(11,14,23,.99))',
            opacity: overlayPhase === 'fading' ? 0 : 1,
            transition: 'opacity .25s ease-out',
            pointerEvents: overlayPhase === 'fading' ? 'none' : 'auto',
            animation: 'zsk-load-fade .4s ease-out',
          }}
        >
          <div style={{ letterSpacing: 4, fontWeight: 800, opacity: 0.72, textTransform: 'uppercase', fontSize: 13 }}>
            ZSKazik
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(42px, 10vw, 84px)', lineHeight: 1, letterSpacing: -1, fontWeight: 1000 }}>
            PLINKO
          </h1>
          <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(108,92,231,.75)', animation: `zsk-load-ring 1.6s ease-out ${i * 0.53}s infinite` }} />
            ))}
            <span style={{ position: 'relative', width: 58, height: 58, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #ffffff, #6c5ce7 55%, #2f2470)', boxShadow: '0 0 0 6px rgba(108,92,231,.22), 0 0 34px rgba(108,92,231,.9)', animation: 'zsk-orb-float 1.4s ease-in-out infinite, zsk-ball-pulse 1.6s ease-in-out infinite' }} />
          </div>
          <div style={{ width: 'min(380px, 84%)', height: 10, borderRadius: 999, background: 'rgba(255,255,255,.10)', overflow: 'hidden' }} role="progressbar" aria-label="Placing bet">
            <div style={{ width: '38%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(108,92,231,.25), #6c5ce7, rgba(108,92,231,.25))', animation: 'zsk-load-shimmer 1.3s ease-in-out infinite' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, minHeight: 22 }}>
            {['Placing your bet on Arbitrum Sepolia', 'Waiting for the block to land', 'Resolving the drop'][Math.floor(tick / 11) % 3]}{'.'.repeat((tick % 3) + 1)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }} aria-hidden="true">
            {['Placing', 'Mining', 'Resolving'].map((s, i) => (
              <span key={s} style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 800, padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', opacity: 0.55 + 0.45 * Math.abs(Math.sin(tick / 9 + i)), transition: 'opacity .3s' }}>
                {s}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Wager {fmt(animation.wager)} ZSK · {animation.rows} rows
          </div>
        </div>
      )}
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

function PlinkoAnimation({ animation, result, onDone }: { animation: BetAnimationState; result: NonNullable<BetAnimationState['result']> | null; onDone?: () => void }) {
  const rows = clamp(animation.rows, 8, 16);
  const bins = rows + 1;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);
  const [done, setDone] = useState(false);
  const resultBin = result?.details?.bin;
  const path = result?.details?.path;
  // The path is only trustworthy if it reproduces the settled bin. If the
  // relayer/direct path failed to derive it, we show the settled bin without
  // animating a made-up trajectory — but still reveal the result.
  const pathValid = Array.isArray(path) && path.length === rows && resultBin !== undefined && path.reduce((a, b) => a + (b ? 1 : 0), 0) === resultBin;

  useEffect(() => { doneRef.current = false; setDone(false); }, [resultBin, path]);

  // Settled bin without a derivable path: nothing to animate, reveal now.
  useEffect(() => {
    if (resultBin !== undefined && !pathValid && path === undefined) {
      if (!doneRef.current) { doneRef.current = true; setDone(true); onDone?.(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultBin, pathValid, path]);

  // Canvas board: ball replays the on-chain bits (bit i = right at row i).
  // Peg positions are in spacing units: at step s the ball has `rights`
  // rights among the first s bits, x-offset = rights - s/2, which is exactly
  // peg (s, rights). Motion between pegs is cosmetic only (gravity, spin,
  // blur, jitter seeded from the word's high bits) — it cannot change the bin.
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
    const bucketsTop = 30 + rows * rowGap + 10;
    // Taller buckets leave room for the multiplier label BELOW the
    // resting ball — never under it (a ball drawn after the buckets
    // would cover a label at the bucket top while it settles).
    const bucketH = 56;
    const H = bucketsTop + bucketH + 8;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto'; // preserve aspect; fixed px height distorted the board on narrow screens
    ctx.scale(dpr, dpr);
    // Reserve a half-spacing margin at each edge: there are rows+1 bins
    // (one per slot centre), so spacing = (W - 2*EDGE) / (rows + 1) puts
    // the leftmost bucket edge exactly at EDGE and the rightmost at
    // W - EDGE. The old (W - 40) / rows put both outer buckets off-canvas
    // (rows=8: left edge at -12.5px, right at 572.5px on a 560px board).
    const EDGE = 6;
    const spacing = (W - EDGE * 2) / (rows + 1);
    const labelFont = Math.max(10, Math.min(14, spacing * 0.4));
    const ballR = Math.max(7, Math.min(10, spacing * 0.3)); // fits between pegs, reads as a ball
    const pegXY = (row: number, col: number) => ({ x: W / 2 + (col - row / 2) * spacing, y: 30 + row * rowGap });
    const ballXY = (step: number, rights: number) => ({ x: W / 2 + (rights - step / 2) * spacing, y: 30 + step * rowGap });
    // Bin slot i is centered on ballXY(rows, i); dividers sit half a
    // spacing either side, so the resting ball is always inside its slot.
    const slotCenter = (i: number) => ballXY(rows, i).x;
    // Resting ball sits above the multiplier label line (see bucketH).
    const floorY = bucketsTop + bucketH - ballR - 18;

    // Segment timeline: gravity fall between pegs, accelerating slightly,
    // then a bouncing settle into the bucket. Cosmetic duration jitter is
    // seeded from the word's high bits (bits 16+) — reproducible, and it
    // cannot affect the outcome bits (0..rows-1).
    const positions = pathValid && path ? pathPositions(path) : null;
    const wordBig = result?.details?.word ? BigInt(result.details.word) : 0n;
    const segDur: number[] = [];
    if (positions) {
      const mult = result?.details?.multBps ? Number(result.details.multBps) : 0;
      const slow = mult >= 20000 ? 1.6 : 1;
      for (let i = 0; i < rows; i++) {
        const jitter = Number((wordBig >> BigInt(16 + (i % 8) * 3)) & 7n) - 3.5; // -3.5..3.5
        // Slower fall: ~255ms base per peg (was ~150ms), still accelerating
        // slightly down the board. Total ~2.7s at 8 rows, ~4.2s at 16 rows.
        let d = 255 - i * 5 + jitter * 15;
        if (i >= rows - 2) d *= slow;
        segDur.push(Math.max(110, Math.min(450, d)));
      }
      segDur.push(750); // settle into bucket (with bounce)
    }
    const total = segDur.reduce((a, b) => a + b, 0);
    let raf = 0;
    let start = 0;
    let lastHit = -1;
    let lastT = 0;
    let prevBx = W / 2;
    let prevBy = 16;
    let spin = 0;
    let audio: AudioContext | null = null;
    const trail: { x: number; y: number }[] = [];
    // Anticipation sparkles: cosmetic particles that fall during the wait
    // for the chain result. Seeded randomness is fine here (not the path).
    const sparkles: { x: number; y: number; vy: number; vx: number; r: number; a: number }[] = [];
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
    const easeOutBounce = (x: number) => {
      const n1 = 7.5625, d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    };
    // Static board layer, pre-rendered once per effect (rows fixed) instead
    // of redrawn every frame: buckets + labels (measureText per bucket) and
    // ~136 pegs with shadowBlur cost several ms per frame at 60fps and made
    // the first frames after the modal mounts heavier than needed. Per frame
    // we now blit this layer and only draw the dynamic bits on top: the win
    // bucket highlight, hit/swept peg highlights, trail, and the ball.
    const staticCanvas = document.createElement('canvas');
    staticCanvas.width = W * dpr;
    staticCanvas.height = H * dpr;
    const sctx = staticCanvas.getContext('2d');
    if (sctx) {
      sctx.scale(dpr, dpr);
      for (let i = 0; i < bins; i++) {
        const x0 = slotCenter(i) - spacing / 2;
        const x1 = slotCenter(i) + spacing / 2;
        sctx.beginPath();
        sctx.roundRect(x0 + 1.5, bucketsTop, spacing - 3, bucketH, 7);
        sctx.fillStyle = 'rgba(255,255,255,.07)';
        sctx.fill();
        sctx.strokeStyle = 'rgba(255,255,255,.14)';
        sctx.stroke();
        sctx.beginPath();
        sctx.moveTo(x0 + 1.5, bucketsTop);
        sctx.lineTo(x0 + 1.5, bucketsTop - 7);
        sctx.strokeStyle = 'rgba(255,255,255,.25)';
        sctx.stroke();
        sctx.fillStyle = '#fff';
        sctx.font = `800 ${labelFont}px system-ui, sans-serif`;
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        const labelY = bucketsTop + bucketH - 10;
        const label = multLabel(rows, i) || String(i);
        const labelW = Math.min(spacing - 4, sctx.measureText(label).width + 8);
        sctx.beginPath();
        sctx.roundRect((x0 + x1) / 2 - labelW / 2, labelY - labelFont / 2 - 2, labelW, labelFont + 4, 4);
        sctx.fillStyle = 'rgba(0,0,0,.45)';
        sctx.fill();
        sctx.fillStyle = '#fff';
        sctx.fillText(label, (x0 + x1) / 2, labelY);
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= r; c++) {
          const { x, y } = pegXY(r, c);
          sctx.beginPath();
          sctx.arc(x, y, 3.5, 0, Math.PI * 2);
          sctx.fillStyle = '#aab6ff';
          sctx.shadowColor = 'rgba(170,182,255,.7)';
          sctx.shadowBlur = 6;
          sctx.fill();
          sctx.shadowBlur = 0;
        }
      }
    }
    const draw = (now: number) => {
      if (!start) { start = now; lastT = now; }
      const dt = Math.max(1, now - lastT);
      lastT = now;
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
        // Idle/anticipation: the ball bounces in the launcher on a loop
        // (drop ~10px, bounce, spin) while the chain settles the bet. It
        // never enters a peg path here — any early bounce would constrain
        // the reachable bins and could not be the true on-chain path, so
        // anticipation stays above the board and the real drop only
        // starts once the settled bits arrive.
        const bounce = Math.abs(Math.sin(now / 210));
        bx = W / 2;
        by = 16 + bounce * bounce * 12;
        spin += 0.22;
      } else if (finished) {
        bx = slotCenter(positions[rows]);
        by = floorY;
      } else if (seg >= rows) {
        // Settle: fall into the bucket slot and bounce on its floor.
        bx = slotCenter(positions[rows]);
        const fromY = ballXY(rows, positions[rows]).y;
        by = fromY + (floorY - fromY) * easeOutBounce(p);
      } else {
        const a = ballXY(curStep, curRights);
        const b = ballXY(curStep + 1, positions[curStep + 1]);
        // Horizontal: fast deflection right after the peg, then drift.
        // Vertical: accelerating gravity fall. Both land exactly on b.
        const ex = 1 - Math.pow(1 - p, 3);
        const ey = p * p;
        bx = a.x + (b.x - a.x) * ex;
        by = a.y + (b.y - a.y) * ey;
        if (p >= 0.98 && curStep !== lastHit) { lastHit = curStep; tick(); }
      }
      // Spin follows horizontal travel; velocity drives motion blur.
      const vx = (bx - prevBx) / dt;
      const vy = (by - prevBy) / dt;
      spin += vx * dt * 0.9;
      const speed = Math.hypot(vx, vy);
      prevBx = bx; prevBy = by;
      if (finished && !doneRef.current) { doneRef.current = true; setDone(true); onDone?.(); }
      // Clear the WHOLE frame, bucket strip included. Clearing only the
      // board area (the old clearRect(0, 0, W, bucketsTop)) never erased
      // trail/ball after-images that fell into the buckets, so they
      // accumulated over the multiplier labels frame after frame.
      ctx.clearRect(0, 0, W, H);
      // Blit the pre-rendered static board (buckets, labels, base pegs).
      if (sctx) ctx.drawImage(staticCanvas, 0, 0, W, H);
      // Win bucket highlight, drawn over the static layer once settled.
      if (doneRef.current && resultBin !== undefined) {
        const x0 = slotCenter(resultBin) - spacing / 2;
        ctx.beginPath();
        ctx.roundRect(x0 + 1.5, bucketsTop, spacing - 3, bucketH, 7);
        ctx.fillStyle = result?.status === 'won' ? 'rgba(17,122,56,.85)' : 'rgba(139,30,45,.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        ctx.stroke();
        const labelY = bucketsTop + bucketH - 10;
        const label = multLabel(rows, resultBin) || String(resultBin);
        const labelW = Math.min(spacing - 4, ctx.measureText(label).width + 8);
        // Opaque pill behind the label so it stays readable on the highlight.
        ctx.beginPath();
        ctx.roundRect(slotCenter(resultBin) - labelW / 2, labelY - labelFont / 2 - 2, labelW, labelFont + 4, 4);
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fill();
        ctx.font = `800 ${labelFont}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(label, slotCenter(resultBin), labelY);
      }
      // Dynamic peg highlights only: hit pegs along the true path and the
      // anticipation sweep row before the path arrives. Base pegs are in
      // the static layer.
      const sweepRow = positions ? -1 : Math.floor(now / 160) % rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= r; c++) {
          const hit = !!positions && curStep > r && c === positions[r];
          const swept = r === sweepRow;
          if (!hit && !swept) continue;
          const { x, y } = pegXY(r, c);
          ctx.beginPath();
          ctx.arc(x, y, hit ? 4.5 : 4, 0, Math.PI * 2);
          ctx.fillStyle = hit ? '#dfe6ff' : '#ffffff';
          ctx.shadowColor = 'rgba(170,182,255,.7)';
          ctx.shadowBlur = hit ? 10 : 14;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      // Trail (fading after-images along the true trajectory).
      if (positions) {
        trail.push({ x: bx, y: by });
        if (trail.length > 12) trail.shift();
        trail.forEach((pt, i) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, ballR * (0.35 + 0.5 * (i / trail.length)), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(108,92,231,${(i / trail.length) * 0.22})`;
          ctx.fill();
        });
      }
      // Ball: motion-blurred ellipse along velocity, spinning highlight.
      const ang = Math.atan2(vy, vx);
      const stretch = Math.min(0.55, speed * 0.012);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(positions ? ang : 0);
      ctx.scale(1 + stretch, 1 - stretch * 0.45);
      const grad = ctx.createRadialGradient(-ballR * 0.3, -ballR * 0.4, 1, 0, 0, ballR * 1.1);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.55, '#6c5ce7');
      grad.addColorStop(1, '#2f2470');
      ctx.beginPath();
      ctx.arc(0, 0, ballR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(108,92,231,.9)';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
      // Spin marker dot (shows rotation; cosmetic only).
      ctx.beginPath();
      ctx.arc(bx + Math.cos(spin) * ballR * 0.55, by + Math.sin(spin) * ballR * 0.55, ballR * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fill();
      // Anticipation dressing, only while waiting for the chain result:
      // expanding rings around the launcher ball plus falling sparkles.
      // Purely cosmetic — the ball stays in the launcher until the real
      // on-chain path arrives, so this cannot imply a trajectory.
      if (!positions) {
        for (let i = 0; i < 3; i++) {
          const phase = ((now / 1400) + i / 3) % 1;
          ctx.beginPath();
          ctx.arc(bx, by, ballR + phase * 34, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(108,92,231,${(1 - phase) * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (sparkles.length < 36 && Math.random() < 0.35) {
          sparkles.push({
            x: 30 + Math.random() * (W - 60),
            y: -6,
            vy: 0.6 + Math.random() * 1.4,
            vx: (Math.random() - 0.5) * 0.5,
            r: 1 + Math.random() * 2.2,
            a: 0.35 + Math.random() * 0.5,
          });
        }
        for (let i = sparkles.length - 1; i >= 0; i--) {
          const s = sparkles[i];
          s.x += s.vx; s.y += s.vy;
          if (s.y > H) { sparkles.splice(i, 1); continue; }
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(190,200,255,${s.a})`;
          ctx.fill();
        }
      } else {
        sparkles.length = 0;
      }
      if (!finished) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); if (audio) void audio.close().catch(() => {}); };
  }, [rows, path, pathValid, resultBin]);

  const pathStr = pathValid && path ? path.map((b) => (b ? 'R' : 'L')).join(' ') : null;

  return (
    <div style={{ width: 'min(560px, 100%)', margin: '0 auto' }}>
      <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} aria-label="Plinko board" />
      <div style={{ marginTop: 10, opacity: 0.72, fontSize: 13, lineHeight: 1.55, overflowWrap: 'anywhere', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
        {resultBin === undefined
          ? 'Anticipation — ball held in the launcher until the chain result lands…'
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
