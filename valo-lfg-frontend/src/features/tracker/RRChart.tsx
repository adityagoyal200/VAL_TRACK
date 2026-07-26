import { useMemo } from 'react'
import type { MMRHistoryEntry } from '@/api/tracker'
import { LOSS_COLOR, WIN_COLOR, tierColor } from './lib'

/** A lightweight inline-SVG RR timeline — no charting dependency.
 * `history` arrives newest-first; we plot it left→right chronologically. */
export function RRChart({ history }: { history: MMRHistoryEntry[] }) {
  const points = useMemo(
    () => [...history].reverse().filter((h) => h.rr != null) as (MMRHistoryEntry & { rr: number })[],
    [history],
  )

  if (points.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
        Not enough ranked games yet to chart rank rating.
      </div>
    )
  }

  const W = 640
  const H = 176
  const PAD = 18
  const LABEL_W = 30
  const rrs = points.map((p) => p.rr)
  const min = Math.min(...rrs)
  const max = Math.max(...rrs)
  const span = Math.max(1, max - min)
  const stepX = (W - PAD - LABEL_W) / (points.length - 1)

  const x = (i: number) => LABEL_W + i * stepX
  const y = (rr: number) => PAD + (H - PAD * 2) * (1 - (rr - min) / span)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.rr)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`
  const lastColor = tierColor(points[points.length - 1].tier_name)
  const net = points.reduce((acc, p) => acc + (p.rr_change ?? 0), 0)
  const gridValues = [max, Math.round((max + min) / 2), min]

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Last {points.length} ranked games</span>
        <span
          className="font-heading font-bold tabular-nums"
          style={{ color: net >= 0 ? WIN_COLOR : LOSS_COLOR }}
        >
          {net >= 0 ? '+' : ''}
          {net} RR net
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Rank rating over recent competitive matches"
      >
        <defs>
          <linearGradient id="rrfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lastColor} stopOpacity="0.30" />
            <stop offset="100%" stopColor={lastColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={LABEL_W}
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeOpacity="0.10"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={0}
              y={y(v) + 3}
              fontSize="10"
              fill="currentColor"
              fillOpacity="0.45"
              className="tabular-nums"
            >
              {v}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#rrfill)" />
        <path d={line} fill="none" stroke={lastColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle
            key={p.match_id || i}
            cx={x(i)}
            cy={y(p.rr)}
            r={i === points.length - 1 ? 3.5 : 2.5}
            fill={p.rr_change != null && p.rr_change < 0 ? LOSS_COLOR : WIN_COLOR}
          >
            <title>
              {p.tier_name} · {p.rr} RR
              {p.rr_change != null ? ` (${p.rr_change > 0 ? '+' : ''}${p.rr_change})` : ''}
              {p.map_name ? ` · ${p.map_name}` : ''}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  )
}
