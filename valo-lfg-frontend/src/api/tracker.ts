import { apiFetch } from '@/lib/api'

// Mirrors apps/tracker/serializers.py. The `subject_*` fields describe the
// tracked player's own line, so history rows render without a client scan.

export interface SeasonStat {
  season: string
  wins: number
  games: number
  end_tier: string
}

export interface ProfileHeader {
  riot_game_name: string
  riot_tag_line: string
  region: string
  account_level: number | null
  card_wide: string
  card_small: string
  title: string
  current_tier: string
  current_division: number | null
  current_rr: number | null
  last_change: number | null
  elo: number | null
  leaderboard_rank: number | null
  peak_tier: string
  peak_division: number | null
  seasons: SeasonStat[]
}

export interface AgentStat {
  agent: string
  agent_image: string
  games: number
  wins: number
  win_rate: number
  kd: number
  avg_acs: number
  adr: number
  kast: number
  hs_percent: number
  first_bloods: number
  multikills: number
  avg_rating: number | null
}

export interface MapStat {
  map_name: string
  map_image: string
  games: number
  wins: number
  win_rate: number
  kd: number
  avg_acs: number
  avg_rating: number | null
}

export interface WeaponStat {
  weapon_id: string
  name: string
  image: string
  kills: number
}

export interface BestMatch {
  match_id: string
  map_name: string
  map_image: string
  agent: string
  agent_image: string
  acs: number
  rating: number | null
  kills: number
  deaths: number
  assists: number
  won: boolean | null
  started_at: string
}

export interface OverviewStats {
  matches_counted: number
  wins: number
  losses: number
  draws: number
  win_rate: number
  kills: number
  deaths: number
  assists: number
  kd: number
  kda: number
  avg_acs: number
  avg_kills: number
  adr: number
  kast: number
  hs_percent: number
  hs_shot_percent: number
  body_percent: number
  leg_percent: number
  headshots: number
  bodyshots: number
  legshots: number
  damage_dealt: number
  damage_received: number
  first_bloods: number
  first_deaths: number
  multikills: number
  best_kill_round: number
  plants: number
  defuses: number
  mvps: number
  team_mvps: number
  current_streak: number
  avg_rating: number | null
  rating_form: number[]
  best_match: BestMatch | null
  top_agents: AgentStat[]
  top_maps: MapStat[]
  top_weapons: WeaponStat[]
}

export interface MMRHistoryEntry {
  match_id: string
  started_at: string
  tier_name: string
  rr: number | null
  rr_change: number | null
  map_name: string
}

export interface MatchSummary {
  match_id: string
  map_name: string
  map_image: string
  mode: string
  started_at: string
  game_length_seconds: number
  subject_won: boolean | null
  subject_agent: string
  subject_agent_image: string
  subject_kills: number
  subject_deaths: number
  subject_assists: number
  subject_acs: number
  subject_hs_percent: number
  subject_score_line: string
  subject_adr: number
  subject_kast: number
  subject_first_bloods: number
  subject_multikills: number
  subject_mvp: boolean
  subject_team_mvp: boolean
  rating: number | null
}

export interface WeaponKills {
  id: string
  name: string
  image: string
  kills: number
}

export interface MatchPlayer {
  puuid: string
  name: string
  tag: string
  team_id: string
  agent: string
  agent_image: string
  tier_name: string
  score: number
  kills: number
  deaths: number
  assists: number
  headshots: number
  bodyshots: number
  legshots: number
  damage_dealt: number
  damage_received: number
  acs: number
  kd: number
  hs_percent: number
  adr: number
  dd_delta: number
  kast: number
  first_bloods: number
  first_deaths: number
  multikills: number
  best_kill_round: number
  plants: number
  defuses: number
  weapons: WeaponKills[]
  is_subject: boolean
  party_id: string
  rating: number | null
}

export interface MatchTeam {
  team_id: string
  won: boolean | null
  rounds_won: number
  rounds_lost: number
}

export interface MatchDetail extends MatchSummary {
  season_name: string
  cluster: string
  region: string
  queue_id: string
  teams: MatchTeam[]
  players: MatchPlayer[]
}

export interface TrackerOverview {
  profile: ProfileHeader
  stats: OverviewStats
  rr_history: MMRHistoryEntry[]
  recent_matches: MatchSummary[]
}

export interface CareerAgent {
  agent: string
  agent_image: string
  games: number
  wins: number
  win_rate: number
  kd: number
  avg_acs: number
}

export interface CareerMap {
  map_name: string
  map_image: string
  games: number
  wins: number
  win_rate: number
  avg_acs: number
}

export interface ActStat {
  act: string
  label: string
  matches: number
  wins: number
  losses: number
  draws: number
  win_rate: number
  kills: number
  deaths: number
  assists: number
  kd: number
  kda: number
  avg_acs: number
  avg_kills: number
  hs_percent: number
  body_percent: number
  leg_percent: number
  head: number
  body: number
  leg: number
  adr: number
  avg_rating: number | null
  peak_tier: number
  top_agents: CareerAgent[]
  top_maps: CareerMap[]
}

export interface Career {
  acts: ActStat[]
  all: ActStat
}

export interface PartySizeStat {
  size: number
  games: number
  wins: number
  win_rate: number
  kd: number
  avg_acs: number
  avg_placement: number
}

export interface Teammate {
  puuid: string
  name: string
  tag: string
  agent_image: string
  games: number
  wins: number
  win_rate: number
}

export interface Duelist {
  puuid: string
  name: string
  tag: string
  agent_image: string
  kills: number
  deaths: number
  diff: number
}

export interface Squad {
  matches_analysed: number
  solo_win_rate: number
  stacked_win_rate: number
  party_sizes: PartySizeStat[]
  teammates: Teammate[]
  nemeses: Duelist[]
  victims: Duelist[]
}

export interface EncounteredPlayer {
  puuid: string
  name: string
  tag: string
  agent_image: string
  games: number
  wins: number
  losses: number
  win_rate: number
  last_seen: string
  acts: string[]
}

export interface PartyGroupMember {
  name: string
  tag: string
  agent_image: string
}

export interface PartyGroup {
  puuids: string[]
  names: PartyGroupMember[]
  size: number
  side: 'ally' | 'enemy'
  label: string
  games: number
  last_seen: string
  acts: string[]
}

export interface Encounters {
  matches_analysed: number
  opponents: EncounteredPlayer[]
  teammates: EncounteredPlayer[]
  enemy_parties: PartyGroup[]
  ally_parties: PartyGroup[]
}

export interface EncounterBackfillJob {
  id: number
  status: 'pending' | 'running' | 'done' | 'failed'
  total: number
  done: number
  ingested: number
  error: string
}

export interface SkinCollection {
  skin_levels: string[]
  updated_at: string | null
}

/**
 * A tracked player. `null` means the signed-in user's own linked account
 * (the /tracker/me/… routes); a name+tag targets the public "search any Riot
 * ID" routes (/tracker/<name>/<tag>/…). Every fetcher takes one so the same
 * UI renders self and public trackers.
 */
export type TrackerSubject = { name: string; tag: string } | null

function subjectBase(subject: TrackerSubject): string {
  if (!subject) return '/api/tracker/me'
  return `/api/tracker/${encodeURIComponent(subject.name)}/${encodeURIComponent(subject.tag)}`
}

export function getOverview(subject: TrackerSubject, mode = 'competitive') {
  return apiFetch<TrackerOverview>(`${subjectBase(subject)}/overview/?mode=${encodeURIComponent(mode)}`)
}

export function getMatches(subject: TrackerSubject, params: { mode?: string; size?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.mode) qs.set('mode', params.mode)
  if (params.size) qs.set('size', String(params.size))
  const s = qs.toString()
  return apiFetch<{ matches: MatchSummary[] }>(`${subjectBase(subject)}/matches/${s ? `?${s}` : ''}`)
}

export function getMatchDetail(subject: TrackerSubject, matchId: string) {
  return apiFetch<MatchDetail>(`${subjectBase(subject)}/matches/${encodeURIComponent(matchId)}/`)
}

export function getCareer(subject: TrackerSubject, mode = 'competitive') {
  return apiFetch<Career>(`${subjectBase(subject)}/career/?mode=${encodeURIComponent(mode)}`)
}

export function getSquad(subject: TrackerSubject, mode = 'competitive') {
  return apiFetch<Squad>(`${subjectBase(subject)}/squad/?mode=${encodeURIComponent(mode)}`)
}

export function getEncounters(subject: TrackerSubject) {
  return apiFetch<Encounters>(`${subjectBase(subject)}/encounters/`)
}

/** Self only — kicks off (or returns the in-flight) full-history backfill. */
export function startEncountersBackfill() {
  return apiFetch<EncounterBackfillJob>('/api/tracker/me/encounters/backfill/', { method: 'POST' })
}

export async function getEncountersBackfillStatus() {
  const { job } = await apiFetch<{ job: EncounterBackfillJob | null }>(
    '/api/tracker/me/encounters/backfill/status/',
  )
  return job
}

export function getSkins() {
  return apiFetch<SkinCollection>('/api/tracker/me/skins/')
}

export function createCollectionCode() {
  return apiFetch<{ code: string; expires_in: number }>('/api/tracker/collection/code/', {
    method: 'POST',
  })
}
