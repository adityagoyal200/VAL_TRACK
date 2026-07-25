// The "tracker score": a 0–10 performance rating rendered consistently across
// the hero, match rows, scoreboard and stat tables. Color + grade come from
// `ratingTier` so every surface agrees on what a number means.

import { RATING_TIERS, ratingLabel, ratingTier } from './lib'

/**
 * Solid, high-contrast score chip: the 0–10 value on a filled tier-colored
 * background with a legible ink color, optionally tagged with its S/A/B grade.
 * Unrated games render as a muted "—".
 */
export function RatingBadge({
  value,
  size = 'sm',
  showGrade = false,
}: {
  value: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  showGrade?: boolean
}) {
  const { grade, color, ink } = ratingTier(value)
  const unrated = value == null
  const pad =
    size === 'lg'
      ? 'px-3 py-1 text-xl gap-1.5'
      : size === 'md'
        ? 'px-2.5 py-0.5 text-base gap-1.5'
        : 'px-2 py-0.5 text-sm gap-1'
  // A glossy sheen + tier-colored glow + inset hairline, layered over the flat
  // tier color — reads as a lit chip rather than a plain painted rectangle.
  // The gradient is tint-agnostic (white→dark overlay) so it flatters any tier.
  const litStyle = {
    color: ink,
    backgroundColor: color,
    backgroundImage:
      'linear-gradient(140deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 42%, rgba(0,0,0,0.22))',
    boxShadow: `0 1px 2px rgba(0,0,0,0.35), 0 0 12px -3px ${color}, inset 0 0 0 1px rgba(255,255,255,0.16)`,
  }
  return (
    <span
      className={`inline-flex items-center rounded-[3px] font-heading font-bold tabular-nums ${pad}`}
      style={
        unrated
          ? { color: '#9aa2ad', backgroundColor: '#ffffff10', boxShadow: 'inset 0 0 0 1px #ffffff1f' }
          : litStyle
      }
      title={
        unrated
          ? 'Not enough data to rate this game'
          : `Performance rating ${ratingLabel(value)} / 10 · grade ${grade}`
      }
    >
      {ratingLabel(value)}
      {showGrade && !unrated && (
        <span
          className="-mr-0.5 ml-0.5 flex items-center rounded-[2px] px-1.5 text-[0.7em] font-bold leading-none"
          style={{ backgroundColor: 'rgba(0,0,0,0.22)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
        >
          {grade}
        </span>
      )}
    </span>
  )
}

/** Human range for a grade band, e.g. "9.0+", "6.0–7.4", "<3.0". */
function tierRange(i: number): string {
  const t = RATING_TIERS[i]
  if (i === 0) return `${t.min.toFixed(1)}+`
  const upper = RATING_TIERS[i - 1].min
  if (i === RATING_TIERS.length - 1) return `<${upper.toFixed(1)}`
  return `${t.min.toFixed(1)}–${(upper - 0.1).toFixed(1)}`
}

/**
 * Explains the tracker score: what it measures, its 0–10 scale, and the
 * color/grade bands. Rendered on the Overview so the numbers everywhere else
 * are legible without a hover.
 */
export function ScoreLegend() {
  // A left→right scale, worst→best, matching how a number reads on a slider.
  const scale = [...RATING_TIERS].reverse()
  const gradient = `linear-gradient(90deg, ${scale.map((t) => t.color).join(', ')})`
  return (
    <section className="clip-bevel border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-base font-bold tracking-wide">TRACKER SCORE</h2>
        <span className="text-xs text-muted-foreground">Performance rating · 0–10 per game</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/80">
        A personal, self-improvement measure of{' '}
        <span className="font-semibold text-foreground">how you played each game</span>, win or lose
        — blending damage (ADR), impact (KAST), efficiency (KDA), opening duels and multikills,
        weighted so utility and survival count too, not just kills. An average game lands around{' '}
        <span className="font-semibold text-foreground">5.0 — a solid B</span>; carry games climb
        into A/S. It’s a recent-form measure to help you improve — not an official rank or
        matchmaking rating.
      </p>

      {/* visual 0–10 scale, with each grade's letter pinned at its band floor */}
      <div className="mt-5">
        <div className="relative">
          <div className="h-2.5 w-full rounded-full" style={{ background: gradient }} />
          {RATING_TIERS.map((t) => (
            <span
              key={t.grade}
              className="absolute top-1/2 h-3.5 w-px -translate-y-1/2"
              style={{ left: `${(t.min / 10) * 100}%`, backgroundColor: 'rgba(0,0,0,0.35)' }}
            />
          ))}
        </div>
        <div className="relative mt-1 h-4 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {RATING_TIERS.map((t, i) => (
            <span
              key={t.grade}
              className="absolute -translate-x-1/2"
              style={{ left: `${(t.min / 10) * 100}%`, color: t.color }}
              title={`${t.label} · ${tierRange(i)}`}
            >
              {t.grade}
            </span>
          ))}
          <span className="absolute right-0 translate-x-0 text-muted-foreground">10</span>
        </div>
      </div>

      {/* grade key */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {RATING_TIERS.map((t, i) => (
          <div
            key={t.grade}
            className="flex items-center gap-2 rounded-sm border border-border/60 bg-background/40 px-2.5 py-2 transition-colors hover:border-white/20"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] font-heading text-sm font-bold"
              style={{
                color: t.ink,
                backgroundColor: t.color,
                backgroundImage:
                  'linear-gradient(140deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 42%, rgba(0,0,0,0.22))',
                boxShadow: `0 0 12px -3px ${t.color}, inset 0 0 0 1px rgba(255,255,255,0.16)`,
              }}
            >
              {t.grade}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-semibold text-foreground">{t.label}</div>
              <div className="text-[11px] tabular-nums text-muted-foreground">{tierRange(i)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * A tiny form sparkline of recent ratings. `values` arrive newest-first (as the
 * API returns them); we draw them left→right oldest→newest.
 */
export function RatingSparkline({
  values,
  width = 120,
  height = 30,
}: {
  values: number[]
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const series = [...values].reverse() // oldest → newest
  const pad = 3
  const n = series.length
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (n - 1)
  // Fixed 0–10 domain so the line's height is comparable across players.
  const y = (v: number) => height - pad - (v / 10) * (height - 2 * pad)
  const points = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`
  const last = series[n - 1]
  const { color } = ratingTier(last)
  const gid = `spark-${Math.round(width)}-${Math.round(height)}`

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* midline at 5.0 for reference */}
      <line
        x1={pad}
        x2={width - pad}
        y1={y(5)}
        y2={y(5)}
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeDasharray="2 3"
      />
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(last)} r="2.5" fill={color} />
    </svg>
  )
}
