import { z } from 'zod'

/** Ranked tiers in ascending order. `value` matches the backend Tier choices. */
export const TIERS = [
  { value: 'iron', label: 'Iron' },
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'ascendant', label: 'Ascendant' },
  { value: 'immortal', label: 'Immortal' },
  { value: 'radiant', label: 'Radiant' },
] as const

const TIER_LABELS = Object.fromEntries(TIERS.map((t) => [t.value, t.label]))

/** Human label for a tier value; empty/unknown tiers read as "Unranked". */
export function tierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? 'Unranked'
}

/** Full rank label including division, e.g. "Diamond 2". Radiant and unranked
 * have no division, so they render as just the tier name. */
export function rankLabel(tier: string | undefined, division?: number | null): string {
  if (!tier) return 'Unranked'
  const base = tierLabel(tier)
  return division ? `${base} ${division}` : base
}

/** Verification lifecycle. "none" is a synthetic client status when no link exists. */
export type RiotLinkStatusValue =
  | 'none'
  | 'pending'
  | 'verified'
  | 'manual_review'
  | 'rejected'
  | 'expired'

/** Shape returned by GET /api/riot-link/status/ and the mutating endpoints. */
export interface RiotLinkStatus {
  riot_game_name?: string
  riot_tag_line?: string
  region?: string
  account_level?: number | null
  current_tier?: string
  current_division?: number | null
  current_rr?: number | null
  peak_tier?: string
  peak_division?: number | null
  status: RiotLinkStatusValue
  verification_seconds_remaining?: number
  last_rank_refresh_at?: string | null
}

export const riotIdSchema = z.object({
  riot_game_name: z
    .string()
    .trim()
    .min(3, 'Game name is at least 3 characters.')
    .max(16, 'Game name is at most 16 characters.'),
  riot_tag_line: z
    .string()
    .trim()
    .min(2, 'Tag is at least 2 characters.')
    .max(8, 'Tag is at most 8 characters.')
    .regex(/^[A-Za-z0-9]+$/, 'Tag is letters and numbers only.'),
})
export type RiotIdInput = z.infer<typeof riotIdSchema>
