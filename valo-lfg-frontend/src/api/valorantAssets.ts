// Static game content from valorant-api.com (public, CORS-enabled CDN).
// Fetched client-side and cached forever by react-query — the backend only
// ever stores/serves uuids, never art.

const VAL_API = 'https://valorant-api.com/v1'

async function valFetch<T>(path: string): Promise<T> {
  const resp = await fetch(`${VAL_API}${path}`)
  if (!resp.ok) throw new Error(`valorant-api ${path} -> ${resp.status}`)
  const body = (await resp.json()) as { data: T }
  return body.data
}

// --- competitive tier emblems ----------------------------------------------

interface RawEpisode {
  tiers: { tier: number; tierName: string; smallIcon: string | null; largeIcon: string | null }[]
}

export interface RankIcons {
  /** lowercased full tier name ("ascendant 1", "radiant") -> icon url */
  byName: Record<string, { small: string; large: string; name: string }>
  /** numeric competitive tier (3, 27, …) -> icon url + display name */
  byTier: Record<number, { small: string; large: string; name: string }>
}

export async function fetchRankIcons(): Promise<RankIcons> {
  const episodes = await valFetch<RawEpisode[]>('/competitivetiers')
  const latest = episodes[episodes.length - 1]
  const byName: RankIcons['byName'] = {}
  const byTier: RankIcons['byTier'] = {}
  for (const t of latest?.tiers ?? []) {
    if (!t.smallIcon) continue
    const entry = { small: t.smallIcon, large: t.largeIcon ?? t.smallIcon, name: t.tierName }
    byName[t.tierName.toLowerCase()] = entry
    byTier[t.tier] = entry
  }
  return { byName, byTier }
}

/** Compose the lookup key for RankIcons from the API's split tier fields. */
export function rankIconKey(tier: string, division: number | null | undefined): string {
  if (!tier) return ''
  return division ? `${tier} ${division}` : tier
}

// --- weapon skin resolution --------------------------------------------------

export interface ResolvedSkin {
  skinId: string
  name: string
  image: string
  weapon: string
  contentTier: string | null // content-tier uuid ("" = standard issue)
  levelIndex: number
}

interface RawWeapon {
  uuid: string
  displayName: string
  skins: {
    uuid: string
    displayName: string
    contentTierUuid: string | null
    displayIcon: string | null
    chromas: { fullRender: string | null; displayIcon: string | null }[]
    levels: { uuid: string; displayIcon: string | null }[]
  }[]
}

export interface SkinIndex {
  /** skin-level uuid -> resolved skin (the shape entitlements come in) */
  byLevel: Map<string, ResolvedSkin>
}

export async function fetchSkinIndex(): Promise<SkinIndex> {
  const weapons = await valFetch<RawWeapon[]>('/weapons')
  const byLevel = new Map<string, ResolvedSkin>()
  for (const weapon of weapons) {
    for (const skin of weapon.skins) {
      // Always show the skin's base art: higher-level icons are VFX preview
      // frames, not weapon renders.
      const art =
        skin.displayIcon ??
        skin.levels[0]?.displayIcon ??
        skin.chromas[0]?.fullRender ??
        skin.chromas[0]?.displayIcon ??
        ''
      skin.levels.forEach((level, i) => {
        byLevel.set(level.uuid.toLowerCase(), {
          skinId: skin.uuid,
          name: skin.displayName,
          image: art,
          weapon: weapon.displayName,
          contentTier: skin.contentTierUuid,
          levelIndex: i,
        })
      })
    }
  }
  return { byLevel }
}

// --- content tiers (skin rarity) ---------------------------------------------

export interface ContentTier {
  color: string // css color derived from highlightColor
  icon: string
  rank: number
  name: string
}

interface RawContentTier {
  uuid: string
  devName: string
  rank: number
  highlightColor: string // "RRGGBBAA"
  displayIcon: string
}

export async function fetchContentTiers(): Promise<Map<string, ContentTier>> {
  const tiers = await valFetch<RawContentTier[]>('/contenttiers')
  const map = new Map<string, ContentTier>()
  for (const t of tiers) {
    map.set(t.uuid.toLowerCase(), {
      color: `#${(t.highlightColor || 'ffffffff').slice(0, 6)}`,
      icon: t.displayIcon,
      rank: t.rank,
      name: t.devName,
    })
  }
  return map
}
