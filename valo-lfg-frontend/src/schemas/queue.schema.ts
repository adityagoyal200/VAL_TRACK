import { z } from 'zod'
import { REGIONS, COMM_PREFERENCES, ROLE_TAGS } from '@/schemas/profile.schema'
import { TIERS, tierLabel } from '@/schemas/riotLink.schema'

/** Kinds of party a host can put up. `value` matches the backend ListingType. */
export const LISTING_TYPES = [
  { value: 'lf_fifth', label: 'Looking for 5th' },
  { value: 'lf_duo', label: 'Looking for duo' },
  { value: 'lf_stack', label: 'Building a stack' },
  { value: 'lf_group_to_join', label: 'Looking to join a group' },
] as const

const labelMap = (pairs: readonly { value: string; label: string }[]) =>
  Object.fromEntries(pairs.map((p) => [p.value, p.label]))

const LISTING_TYPE_LABELS = labelMap(LISTING_TYPES)
const REGION_LABELS = labelMap(REGIONS)
const COMM_LABELS = labelMap(COMM_PREFERENCES)
const ROLE_LABELS = labelMap(ROLE_TAGS)

export const listingTypeLabel = (v: string) => LISTING_TYPE_LABELS[v] ?? v
export const regionLabel = (v: string) => REGION_LABELS[v] ?? v.toUpperCase()
export const commLabel = (v: string) => COMM_LABELS[v] ?? v
export const roleLabel = (v: string) => ROLE_LABELS[v] ?? v

/** "Diamond – Immortal", "Diamond+", "up to Gold", or "Any rank" from a range. */
export function rankRangeLabel(min: string, max: string): string {
  if (min && max) return min === max ? tierLabel(min) : `${tierLabel(min)} – ${tierLabel(max)}`
  if (min) return `${tierLabel(min)}+`
  if (max) return `up to ${tierLabel(max)}`
  return 'Any rank'
}

const regionValues = REGIONS.map((r) => r.value) as [string, ...string[]]
const commValues = COMM_PREFERENCES.map((c) => c.value) as [string, ...string[]]
const roleValues = ROLE_TAGS.map((r) => r.value) as [string, ...string[]]
const typeValues = LISTING_TYPES.map((t) => t.value) as [string, ...string[]]
const tierValues = TIERS.map((t) => t.value) as [string, ...string[]]

export const createListingSchema = z
  .object({
    listing_type: z.enum(typeValues, { error: 'Pick what you’re looking for.' }),
    region: z.enum(regionValues, { error: 'Pick a region.' }),
    party_size_target: z.number().int().min(2).max(5),
    rank_min: z.union([z.enum(tierValues), z.literal('')]).default(''),
    rank_max: z.union([z.enum(tierValues), z.literal('')]).default(''),
    roles_needed: z.array(z.enum(roleValues)).default([]),
    comm_preference: z.enum(commValues).default('either'),
    note: z.string().max(280, 'Keep it under 280 characters.').default(''),
  })
  .refine(
    (v) => !(v.rank_min && v.rank_max) || tierIndex(v.rank_min) <= tierIndex(v.rank_max),
    { path: ['rank_max'], message: 'Max rank can’t be below the min.' },
  )
export type CreateListingInput = z.infer<typeof createListingSchema>

function tierIndex(value: string): number {
  return TIERS.findIndex((t) => t.value === value)
}
