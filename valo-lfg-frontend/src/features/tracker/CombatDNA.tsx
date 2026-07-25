import { useEffect, useMemo, useState } from 'react'
import { Radar } from 'lucide-react'
import type { OverviewStats } from '@/api/tracker'
import { usePrefersReducedMotion } from './HeroFx'
import { Panel, SectionHeader } from './ui'

/**
 * "Combat DNA" — the player's playstyle fingerprint as an animated radar
 * (spider) chart plus a matching bar breakdown. Six axes derived from the
 * aggregate stats, each normalised 0–100 against sensible skill anchors. The
 * polygon draws itself in on mount and axes light up on hover. This is the
 * signature data-art piece: something a plain stat table can't show.
 */
export interface DnaMetric {
  key: string
  label: string
  value: number // 0–100 normalised
  display: string // raw stat for the label
}

function normalise(v: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))
}

export function buildDnaMetrics(s: OverviewStats): DnaMetric[] {
  const g = Math.max(1, s.matches_counted)
  return [
    { key: 'aim', label: 'Aim', value: normalise(s.hs_percent, 12, 40), display: `${s.hs_percent}%` },
    { key: 'impact', label: 'Impact', value: normalise(s.avg_acs, 120, 320), display: String(s.avg_acs) },
    { key: 'entry', label: 'Entry', value: normalise(s.first_bloods / g, 0, 2.2), display: (s.first_bloods / g).toFixed(1) },
    { key: 'survive', label: 'Survive', value: Math.max(0, Math.min(100, s.kast)), display: `${s.kast}%` },
    { key: 'clutch', label: 'Clutch', value: normalise(s.multikills / g, 0, 2.5), display: (s.multikills / g).toFixed(1) },
    { key: 'support', label: 'Support', value: normalise(s.assists / g, 0, 7), display: (s.assists / g).toFixed(1) },
  ]
}

export function CombatDNA({ metrics, size = 280 }: { metrics: DnaMetric[]; size?: number }) {
  const reduce = usePrefersReducedMotion()
  const [grown, setGrown] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    if (reduce) {
      setGrown(true)
      return
    }
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [reduce])

  const n = metrics.length
  const cx = 50
  const cy = 50
  const R = 34
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const point = (i: number, r: number): [number, number] => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))]

  const rings = [0.25, 0.5, 0.75, 1]
  const gridPolys = useMemo(
    () => rings.map((f) => metrics.map((_, i) => point(i, R * f).map((v) => v.toFixed(2)).join(',')).join(' ')),
    [metrics],
  )
  const dataPts = metrics.map((m, i) => point(i, R * (m.value / 100)))
  const dataPoly = dataPts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ')

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id="dnafill" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#00e5c0" stopOpacity="0.6" />
            <stop offset="70%" stopColor="#a374ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ff4655" stopOpacity="0.22" />
          </radialGradient>
        </defs>

        {gridPolys.map((pts, i) => (
          <polygon key={i} points={pts} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.3" />
        ))}
        {metrics.map((_, i) => {
          const [x, y] = point(i, R)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.09)" strokeWidth="0.3" />
        })}

        <g
          style={{
            transformOrigin: '50px 50px',
            transform: grown ? 'scale(1) rotate(0deg)' : 'scale(0.04) rotate(-40deg)',
            opacity: grown ? 1 : 0,
            transition: reduce ? undefined : 'transform 1.1s cubic-bezier(0.2,0.8,0.2,1), opacity 0.6s ease',
          }}
        >
          <polygon points={dataPoly} fill="url(#dnafill)" stroke="#00e5c0" strokeWidth="0.7" style={{ filter: 'drop-shadow(0 0 2.5px #00e5c0)' }} />
          {dataPts.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={hover === i ? 2 : 1.3}
              fill={hover === i ? '#ffffff' : '#00e5c0'}
              style={{ filter: 'drop-shadow(0 0 2px #00e5c0)', transition: 'r 0.15s ease' }}
            />
          ))}
        </g>

        {metrics.map((m, i) => {
          const [lx, ly] = point(i, R + 10)
          const anchor = Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end'
          const active = hover === i
          return (
            <g key={m.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* invisible hit target */}
              <circle cx={lx} cy={ly} r="7" fill="transparent" />
              <text
                x={lx}
                y={ly - 0.4}
                textAnchor={anchor}
                className="font-heading"
                style={{ fontSize: 3.4, fill: active ? '#ffffff' : 'rgba(255,255,255,0.72)', fontWeight: 700, letterSpacing: '0.02em' }}
              >
                {m.label.toUpperCase()}
              </text>
              <text
                x={lx}
                y={ly + 3.6}
                textAnchor={anchor}
                style={{ fontSize: 3, fill: active ? '#00e5c0' : 'rgba(255,255,255,0.42)', fontWeight: 700 }}
              >
                {m.display}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function DnaBars({ metrics }: { metrics: DnaMetric[] }) {
  return (
    <div className="space-y-2.5">
      {metrics.map((m, i) => (
        <DnaBar key={m.key} m={m} i={i} />
      ))}
    </div>
  )
}

function DnaBar({ m, i }: { m: DnaMetric; i: number }) {
  const reduce = usePrefersReducedMotion()
  const [w, setW] = useState(0)
  useEffect(() => {
    if (reduce) {
      setW(m.value)
      return
    }
    const id = setTimeout(() => setW(m.value), 90 + i * 70)
    return () => clearTimeout(id)
  }, [m.value, i, reduce])
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">{m.label}</span>
        <span className="font-heading font-bold tabular-nums">{m.display}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${w}%`,
            background: 'linear-gradient(90deg, #ff4655, #a374ff 55%, #00e5c0)',
            boxShadow: '0 0 8px -1px #00e5c0',
            transition: reduce ? undefined : 'width 1s cubic-bezier(0.2,0.8,0.2,1)',
          }}
        />
      </div>
    </div>
  )
}

export function CombatDNAPanel({ stats }: { stats: OverviewStats }) {
  const metrics = useMemo(() => buildDnaMetrics(stats), [stats])
  return (
    <Panel accent="cyan">
      <SectionHeader icon={<Radar className="h-3.5 w-3.5" />} title="COMBAT DNA" kicker="your playstyle fingerprint" accent="cyan" />
      <div className="grid items-center gap-4 sm:grid-cols-2">
        <div className="flex justify-center py-2">
          <CombatDNA metrics={metrics} size={280} />
        </div>
        <DnaBars metrics={metrics} />
      </div>
    </Panel>
  )
}
