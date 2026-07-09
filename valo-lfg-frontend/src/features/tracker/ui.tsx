import type { CSSProperties, ReactNode } from 'react'

/**
 * Shared tactical-panel primitives for the tracker. Every tab used to hand-roll
 * its own `clip-bevel border border-border bg-card p-4` box + bare `<h2>` —
 * consistent but flat. These give every panel a lit accent edge, corner
 * brackets on the two square corners (the bevel already cuts the other two),
 * and a shared header/stat-tile language so the whole tracker reads as one
 * HUD instead of a stack of identical grey cards.
 */

export const ACCENTS = {
  red: '#ff4655',
  cyan: '#00e5c0',
  gold: '#e7c15a',
  violet: '#a374ff',
} as const

export type Accent = keyof typeof ACCENTS

export function Panel({
  children,
  accent,
  className = '',
  padded = true,
  as: As = 'section',
}: {
  children: ReactNode
  accent?: Accent
  className?: string
  padded?: boolean
  as?: 'section' | 'div'
}) {
  const color = accent ? ACCENTS[accent] : undefined
  return (
    <As
      className={`clip-bevel relative overflow-hidden border border-border bg-gradient-to-br from-card to-card/60 ${padded ? 'p-4' : ''} ${className}`}
    >
      {color && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent 4%, ${color} 40%, ${color} 60%, transparent 96%)` }}
          aria-hidden
        />
      )}
      {/* corner ticks on the two square corners — the other two are already cut by clip-bevel */}
      <span className="pointer-events-none absolute top-0 left-0 h-2.5 w-2.5 border-t border-l border-white/15" aria-hidden />
      <span className="pointer-events-none absolute right-0 bottom-0 h-2.5 w-2.5 border-r border-b border-white/15" aria-hidden />
      <div className="relative">{children}</div>
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
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border"
            style={{ borderColor: `${color}55`, backgroundColor: `${color}17`, color }}
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
  const glow: CSSProperties = accent
    ? { color: accent, textShadow: `0 0 22px ${accent}4d` }
    : {}
  return (
    <div className="clip-bevel-sm group relative overflow-hidden border border-border bg-gradient-to-b from-card to-background/50 p-3.5 transition-colors duration-200 hover:border-white/20">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/40">{icon}</span>}
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
