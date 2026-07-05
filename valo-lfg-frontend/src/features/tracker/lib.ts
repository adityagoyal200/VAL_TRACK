// Shared tracker formatting helpers.

import type { TrackerSubject } from '@/api/tracker'

/** Stable react-query cache key for a subject ("me" or "name#tag"). */
export function subjectKey(subject: TrackerSubject): string {
  return subject ? `${subject.name}#${subject.tag}`.toLowerCase() : 'me'
}

const TIER_COLORS: Record<string, string> = {
  iron: '#8a8f98',
  bronze: '#b0764a',
  silver: '#c3ccd4',
  gold: '#e7c15a',
  platinum: '#3fb6c6',
  diamond: '#d17ce0',
  ascendant: '#1fbf75',
  immortal: '#c93b5b',
  radiant: '#fff3a3',
}

/** Base tier from a full name like "Diamond 2" -> "diamond". */
export function tierBase(tierName: string | null | undefined): string {
  if (!tierName) return ''
  return tierName.split(' ')[0].toLowerCase()
}

export function tierColor(tierName: string | null | undefined): string {
  return TIER_COLORS[tierBase(tierName)] ?? '#8a8f98'
}

/** A display rank string from the profile header pieces. */
export function rankLabel(
  tier: string,
  division: number | null | undefined,
  rr?: number | null,
): string {
  if (!tier) return 'Unranked'
  const cap = tier.charAt(0).toUpperCase() + tier.slice(1)
  const base = division ? `${cap} ${division}` : cap
  return rr != null ? `${base} · ${rr} RR` : base
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Full local date + time, e.g. "Sun, Jul 5, 2026 · 3:23 PM". */
export function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

export function timeAgo(iso: string): string {
  if (!iso) return ''
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/** win | loss | draw from the nullable subject_won flag. */
export function outcome(won: boolean | null): 'win' | 'loss' | 'draw' {
  if (won === true) return 'win'
  if (won === false) return 'loss'
  return 'draw'
}

export const WIN_COLOR = '#00E5C0'
export const LOSS_COLOR = '#FF4655'

export function outcomeColor(won: boolean | null): string {
  const o = outcome(won)
  return o === 'win' ? WIN_COLOR : o === 'loss' ? LOSS_COLOR : '#8a8f98'
}

/** "+4,200" style signed formatting for RR deltas. */
export function signed(n: number | null | undefined): string {
  if (n == null) return ''
  return n > 0 ? `+${n}` : String(n)
}

/** "W3" / "L2" streak chip text, or "" when there is no run. */
export function streakLabel(streak: number): string {
  if (!streak) return ''
  return streak > 0 ? `W${streak}` : `L${-streak}`
}

/**
 * Grade bands for the 0–10 performance rating (the "tracker score"), best
 * first. `min` is the inclusive floor of each band. The legend and every
 * badge read from this one list so colors/labels never drift apart.
 */
export interface RatingTier {
  grade: string
  color: string // the tier's signature color (used for text / fills / borders)
  ink: string // legible text color when `color` is the filled background
  label: string
  min: number
}

// Labels stay neutral/descriptive (no shaming) — this rates only your OWN
// games, as self-improvement feedback, per Riot's developer policies.
export const RATING_TIERS: RatingTier[] = [
  { grade: 'S', min: 9.0, color: '#e7c15a', ink: '#1a1206', label: 'Elite' }, // gold
  { grade: 'A', min: 7.5, color: '#28c47e', ink: '#04160d', label: 'Great' }, // green
  { grade: 'B', min: 6.0, color: '#43bdcf', ink: '#04171b', label: 'Good' }, // teal
  { grade: 'C', min: 4.5, color: '#c3ccd4', ink: '#12171c', label: 'Average' }, // grey
  { grade: 'D', min: 3.0, color: '#e8973a', ink: '#1c1004', label: 'Fair' }, // orange
  { grade: 'F', min: 0.0, color: '#ff5163', ink: '#ffffff', label: 'Building' }, // red
]

const NO_RATING: RatingTier = { grade: '–', color: '#6b7280', ink: '#ffffff', label: 'Unrated', min: 0 }

export function ratingTier(value: number | null | undefined): RatingTier {
  if (value == null) return NO_RATING
  return RATING_TIERS.find((t) => value >= t.min) ?? RATING_TIERS[RATING_TIERS.length - 1]
}

/** One-decimal rating text, or "—" when unrated. */
export function ratingLabel(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(1)
}
