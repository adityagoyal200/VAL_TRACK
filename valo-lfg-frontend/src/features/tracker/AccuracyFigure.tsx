// tracker.gg-style hit-location widget: a body silhouette whose segments
// light up with the share of shots landed there, plus the exact numbers.

const SEGMENT_BASE = '#2a2f38'

function heat(pct: number): string {
  // 0% -> dim slate, high% -> hot red. HS above ~35% is already elite.
  const t = Math.min(1, pct / 45)
  if (t <= 0.05) return SEGMENT_BASE
  const r = Math.round(90 + t * 165)
  const g = Math.round(70 - t * 20)
  const b = Math.round(85 - t * 10)
  return `rgb(${r},${g},${b})`
}

export function AccuracyFigure({
  head,
  body,
  legs,
}: {
  head: number
  body: number
  legs: number
}) {
  const rows = [
    { label: 'Head', value: head },
    { label: 'Body', value: body },
    { label: 'Legs', value: legs },
  ]
  const max = Math.max(head, body, legs, 1)
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 60 120" className="h-28 w-14 shrink-0" role="img" aria-label="Hit locations">
        {/* head */}
        <circle cx="30" cy="14" r="10" fill={heat(head)} />
        {/* torso + arms */}
        <path
          d="M18 28 h24 l3 34 h-8 l-2 -22 h-10 l-2 22 h-8 z"
          fill={heat(body)}
        />
        <rect x="12" y="30" width="5" height="26" rx="2.5" fill={heat(body)} />
        <rect x="43" y="30" width="5" height="26" rx="2.5" fill={heat(body)} />
        {/* legs */}
        <rect x="20" y="66" width="8" height="48" rx="3" fill={heat(legs)} />
        <rect x="32" y="66" width="8" height="48" rx="3" fill={heat(legs)} />
      </svg>
      <div className="min-w-0 flex-1 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="uppercase tracking-wider text-muted-foreground">{r.label}</span>
              <span className="font-heading font-bold tabular-nums">{r.value.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-1.5 bg-muted">
              <div
                className="h-full"
                style={{ width: `${(100 * r.value) / max}%`, backgroundColor: heat(r.value) }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
