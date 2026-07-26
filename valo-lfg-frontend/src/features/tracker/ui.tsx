import type { CSSProperties, MouseEvent, ReactNode } from 'react'

/**
 * Shared tactical-panel primitives for the tracker. Every tab renders through
 * these, so the whole app reads as one immersive HUD rather than a stack of
 * grey cards. Each panel is a frosted-glass surface (blurs the WebGL/ambient
 * backdrop behind it) with a lit accent edge, glowing corner brackets, a
 * cursor-tracked spotlight, and a sheen that sweeps on hover.
 */

export const ACCENTS = {
  red: '#ff4655',
  cyan: '#00e5c0',
  gold: '#e7c15a',
  violet: '#a374ff',
} as const

export type Accent = keyof typeof ACCENTS

/** Track the pointer so the panel's `.spotlight` halo follows the cursor. */
function trackSpot(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--spot-x', `${e.clientX - r.left}px`)
  el.style.setProperty('--spot-y', `${e.clientY - r.top}px`)
}

/** L-shaped glowing bracket for a panel corner (Valorant HUD framing). */
function Bracket({ pos, color }: { pos: 'tl' | 'br'; color?: string }) {
  const edges = pos === 'tl' ? 'left-0 top-0 border-l-2 border-t-2' : 'bottom-0 right-0 border-b-2 border-r-2'
  return (
    <span
      className={`pointer-events-none absolute z-[2] h-3 w-3 ${edges}`}
      style={{
        borderColor: color ? `${color}b3` : 'rgba(255,255,255,0.22)',
        filter: color ? `drop-shadow(0 0 4px ${color}99)` : undefined,
      }}
      aria-hidden
    />
  )
}

export function Panel({
  children,
  accent,
  className = '',
  padded = true,
  spotlight = true,
  as: As = 'section',
}: {
  children: ReactNode
  accent?: Accent
  className?: string
  padded?: boolean
  spotlight?: boolean
  as?: 'section' | 'div'
}) {
  const color = accent ? ACCENTS[accent] : undefined
  return (
    <As
      onMouseMove={spotlight ? trackSpot : undefined}
      className={`group/panel clip-bevel glass sheen-sweep relative overflow-hidden border border-border transition-colors duration-200 hover:border-white/15 ${padded ? 'p-4' : ''} ${className}`}
      style={color ? ({ '--spot-color': `${color}1f` } as CSSProperties) : undefined}
    >
      {/* lit accent edge — a soft breathing glow line along the top */}
      {color && (
        <div
          className="animate-pulse-glow pointer-events-none absolute inset-x-0 top-0 z-[2] h-px"
          style={{ background: `linear-gradient(90deg, transparent 4%, ${color} 42%, ${color} 58%, transparent 96%)` }}
          aria-hidden
        />
      )}
      {spotlight && <div className="spotlight" aria-hidden />}
      {/* glowing brackets on the two square corners (the bevel cuts the others) */}
      <Bracket pos="tl" color={color} />
      <Bracket pos="br" color={color} />
      <div className="relative z-[3]">{children}</div>
    </As>
  )
}

export function SectionHeader({
  icon,
  title,
  kicker,
  accent = 'cyan',
  right,
}: {
  icon?: ReactNode
  title: string
  kicker?: string
  accent?: Accent
  right?: ReactNode
}) {
  const color = ACCENTS[accent]
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border"
              style={{
                borderColor: `${color}66`,
                backgroundColor: `${color}1f`,
                color,
                boxShadow: `0 0 14px -4px ${color}, inset 0 0 10px -6px ${color}`,
              }}
              aria-hidden
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold tracking-wide">{title}</h2>
            {kicker && <p className="truncate text-[11px] text-muted-foreground">{kicker}</p>}
          </div>
        </div>
        {right}
      </div>
      {/* lit divider rule under the header */}
      <div
        className="mt-2 h-px w-full"
        style={{ background: `linear-gradient(90deg, ${color}80, ${color}12 32%, transparent 78%)` }}
        aria-hidden
      />
    </div>
  )
}

export function StatTile({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  icon?: ReactNode
}) {
  const glow: CSSProperties = accent ? { color: accent, textShadow: `0 0 22px ${accent}55` } : {}
  return (
    <div
      onMouseMove={trackSpot}
      className="group/panel sheen-sweep hover-lift clip-bevel-sm glass relative overflow-hidden border border-border p-3.5 hover:border-white/25"
      style={accent ? ({ '--spot-color': `${accent}26` } as CSSProperties) : undefined}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent"
        aria-hidden
      />
      <div className="spotlight" aria-hidden />
      <div className="relative z-[3]">
        <div className="flex items-start justify-between gap-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          {icon && (
            <span className="text-muted-foreground/40 transition-colors group-hover/panel:text-muted-foreground/70">
              {icon}
            </span>
          )}
        </div>
        <div className="mt-1 font-heading text-2xl font-bold tabular-nums" style={glow}>
          {value}
        </div>
        {sub && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground" title={sub}>
            {sub}
          </div>
        )}
      </div>
      {/* accent baseline that lights up on hover */}
      {accent && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-0.5 opacity-50 transition-opacity duration-200 group-hover/panel:opacity-100"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, boxShadow: `0 0 10px -1px ${accent}` }}
          aria-hidden
        />
      )}
    </div>
  )
}

/** Numbered rank chip for list rows — gold/silver/bronze for the top 3. */
export function RankNumber({ n }: { n: number }) {
  const medal = n === 1 ? ACCENTS.gold : n === 2 ? '#c7ced6' : n === 3 ? '#cd8a4f' : undefined
  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center font-heading text-[11px] font-bold tabular-nums"
      style={{
        color: medal ?? 'var(--muted-foreground)',
        backgroundColor: medal ? `${medal}1a` : 'transparent',
        border: `1px solid ${medal ? `${medal}55` : 'var(--border)'}`,
        boxShadow: medal ? `0 0 12px -3px ${medal}` : undefined,
      }}
      aria-hidden
    >
      {n}
    </div>
  )
}

/** Thin accent divider — an alternative to a full Panel for lighter sections. */
export function AccentRule({ accent = 'cyan' }: { accent?: Accent }) {
  const color = ACCENTS[accent]
  return (
    <div
      className="h-px w-full"
      style={{ background: `linear-gradient(90deg, ${color}, transparent 70%)` }}
      aria-hidden
    />
  )
}
