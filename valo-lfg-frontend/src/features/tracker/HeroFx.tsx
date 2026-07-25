import { useEffect, useState } from 'react'
import { ratingTier } from './lib'

/** Honour the OS "reduce motion" setting — animations fall back to final state. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

/** Animate a number from 0 → target on mount (easeOutCubic). Returns the live
 * value rounded to `decimals`. Snaps straight to target under reduced-motion. */
export function useCountUp(
  target: number,
  { duration = 1200, decimals = 0 }: { duration?: number; decimals?: number } = {},
): number {
  const reduce = usePrefersReducedMotion()
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (reduce || duration <= 0) {
      setVal(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(target * eased)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduce])
  const f = Math.pow(10, decimals)
  return Math.round(val * f) / f
}

/**
 * The hero centerpiece: a radial 0–10 Tracker-Score dial. The gradient arc
 * sweeps from empty to the score on mount, the number counts up, and the whole
 * dial sits in a tier-coloured glow. This is the "moment" — the thing you see
 * first and remember.
 */
export function ScoreGauge({
  value,
  size = 150,
  label = 'Recent Form',
}: {
  value: number | null
  size?: number
  label?: string
}) {
  const tier = ratingTier(value)
  const reduce = usePrefersReducedMotion()
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / 10))
  const r = 42
  const C = 2 * Math.PI * r

  const [draw, setDraw] = useState(0)
  useEffect(() => {
    if (reduce) {
      setDraw(pct)
      return
    }
    setDraw(0)
    const id = requestAnimationFrame(() => setDraw(pct))
    return () => cancelAnimationFrame(id)
  }, [pct, reduce])

  const num = useCountUp(value ?? 0, { duration: 1400, decimals: 1 })
  const offset = C * (1 - draw)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* soft tier glow behind the dial */}
      <div
        className="animate-pulse-glow absolute inset-2 rounded-full"
        style={{ background: `radial-gradient(circle, ${tier.color}33, transparent 68%)`, filter: 'blur(8px)' }}
        aria-hidden
      />
      <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90">
        <defs>
          <linearGradient id="scoregaugegrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff5163" />
            <stop offset="34%" stopColor="#e8973a" />
            <stop offset="52%" stopColor="#e7c15a" />
            <stop offset="76%" stopColor="#28c47e" />
            <stop offset="100%" stopColor="#00e5c0" />
          </linearGradient>
        </defs>
        {/* tick marks around the ring — HUD detail */}
        {Array.from({ length: 40 }).map((_, i) => {
          const a = (i / 40) * 2 * Math.PI
          const inner = i % 5 === 0 ? 34 : 36
          return (
            <line
              key={i}
              x1={50 + inner * Math.cos(a)}
              y1={50 + inner * Math.sin(a)}
              x2={50 + 38 * Math.cos(a)}
              y2={50 + 38 * Math.sin(a)}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={i % 5 === 0 ? 0.8 : 0.4}
            />
          )
        })}
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        {value != null && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="url(#scoregaugegrad)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            style={{
              transition: reduce ? undefined : 'stroke-dashoffset 1.4s cubic-bezier(0.2,0.7,0.2,1)',
              filter: `drop-shadow(0 0 5px ${tier.color})`,
            }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div
          className="font-heading text-[2.4rem] font-bold leading-none tabular-nums"
          style={{ color: tier.color, textShadow: `0 0 26px ${tier.color}55` }}
        >
          {value == null ? '—' : num.toFixed(1)}
        </div>
        {value != null && (
          <div
            className="mt-1.5 rounded-[3px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ color: tier.ink, backgroundColor: tier.color, boxShadow: `0 0 16px -4px ${tier.color}` }}
          >
            {tier.grade} · {tier.label}
          </div>
        )}
      </div>
    </div>
  )
}
