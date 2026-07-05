import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Crosshair,
  Flame,
  Loader2,
  Radio,
  Search,
  Settings,
  Swords,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/chip'
import { Wordmark } from '@/components/wordmark'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import {
  getMatches,
  getOverview,
  type AgentStat,
  type MapStat,
  type MatchSummary,
  type OverviewStats,
  type ProfileHeader,
  type TrackerSubject,
  type WeaponStat,
} from '@/api/tracker'
import { fetchRankIcons, rankIconKey } from '@/api/valorantAssets'
import { AccuracyFigure } from './AccuracyFigure'
import { CareerTab } from './CareerTab'
import { CollectionTab } from './CollectionTab'
import { MatchDetailDialog } from './MatchDetailDialog'
import { RatingBadge, RatingSparkline, ScoreLegend } from './RatingBadge'
import { RRChart } from './RRChart'
import { SquadTab } from './SquadTab'
import {
  LOSS_COLOR,
  WIN_COLOR,
  formatDuration,
  outcome,
  outcomeColor,
  rankLabel,
  ratingLabel,
  ratingTier,
  signed,
  streakLabel,
  subjectKey,
  tierColor,
  timeAgo,
} from './lib'

// Queues HenrikDev's v4 history can filter by. Empty value = every queue.
const MODES = [
  { value: 'competitive', label: 'Competitive' },
  { value: '', label: 'All modes' },
  { value: 'unrated', label: 'Unrated' },
  { value: 'swiftplay', label: 'Swiftplay' },
  { value: 'spikerush', label: 'Spike Rush' },
  { value: 'deathmatch', label: 'Deathmatch' },
  { value: 'teamdeathmatch', label: 'Team Deathmatch' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'replication', label: 'Replication' },
] as const

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'matches', label: 'Matches' },
  { id: 'agents', label: 'Agents' },
  { id: 'maps', label: 'Maps' },
  { id: 'arsenal', label: 'Arsenal' },
  { id: 'career', label: 'Acts' },
  { id: 'squad', label: 'Squad' },
  { id: 'collection', label: 'Collection' },
] as const
type TabId = (typeof TABS)[number]['id']

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = (error.data as { detail?: string } | null)?.detail
    if (detail) return detail
  }
  return fallback
}

function useRankIcons() {
  return useQuery({
    queryKey: ['val-assets', 'rank-icons'],
    queryFn: fetchRankIcons,
    staleTime: Infinity,
  }).data
}

/** Route wrapper for the public "/tracker/:name/:tag" search-result page. */
export function PublicTrackerPage() {
  const { name = '', tag = '' } = useParams()
  // Keyed by identity so navigating between players remounts fresh state.
  return <TrackerPage key={`${name}#${tag}`} subject={{ name, tag }} />
}

export function TrackerPage({ subject = null }: { subject?: TrackerSubject } = {}) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const isPublic = subject !== null
  const [mode, setMode] = useState<string>('competitive')
  // Collection (owned skins) is a self-only feature; hide it on public pages.
  const tabs = isPublic ? TABS.filter((t) => t.id !== 'collection') : TABS
  // ?tab= deep-links straight to a tab (e.g. /tracker?tab=collection)
  const [tab, setTab] = useState<TabId>(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab')
    return tabs.some((t) => t.id === wanted) ? (wanted as TabId) : 'overview'
  })
  const [selected, setSelected] = useState<string | null>(null)
  const sk = subjectKey(subject)

  const overview = useQuery({
    queryKey: ['tracker', 'overview', sk, mode || 'all'],
    queryFn: () => getOverview(subject, mode),
  })
  const matches = useQuery({
    queryKey: ['tracker', 'matches', sk, mode || 'all'],
    queryFn: () => getMatches(subject, { mode: mode || undefined, size: 20 }),
  })

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const linkMissing =
    !isPublic && overview.error instanceof ApiError && overview.error.status === 409

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="animate-rise flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Wordmark className="h-7 w-auto" />
          <div className="hidden h-8 w-px bg-border sm:block" />
          <div className="hidden sm:block">
            <h1 className="font-heading text-lg leading-none font-semibold tracking-wide">
              PLAYER TRACKER
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Every match, agent, weapon and rank move — tracked.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PlayerSearch />
          {isPublic ? (
            <Button variant="outline" size="sm" render={<Link to="/tracker" />}>
              <ArrowLeft className="mr-1 h-4 w-4" /> My tracker
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" render={<Link to="/queue" />}>
                <Radio className="mr-1 h-4 w-4" /> Queue
              </Button>
              <Button variant="ghost" size="icon-sm" render={<Link to="/settings" />}>
                <Settings />
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Log out
              </Button>
            </>
          )}
        </div>
      </header>

      {overview.isLoading && (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      )}

      {linkMissing && (
        <div className="clip-bevel animate-rise mt-10 border border-border bg-card p-8 text-center">
          <p className="font-heading text-lg font-semibold">No Riot account linked</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {apiErrorMessage(overview.error, 'Link and verify a Riot account to see your stats.')}
          </p>
          <Button className="mt-5" render={<Link to="/riot-link" />}>
            Link Riot account
          </Button>
        </div>
      )}

      {overview.isError && !linkMissing && (
        <div className="mt-10 text-center text-sm text-muted-foreground">
          {apiErrorMessage(overview.error, 'Couldn’t load tracker data. Try again shortly.')}
        </div>
      )}

      {overview.data && (
        <>
          <ProfileHero profile={overview.data.profile} stats={overview.data.stats} />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-1 border-b border-border">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 px-3 py-2 font-heading text-sm font-semibold tracking-wide uppercase transition-colors ${
                    tab === t.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            {tab !== 'collection' && (
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <Chip key={m.value} selected={mode === m.value} onClick={() => setMode(m.value)}>
                    {m.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5">
            {tab === 'overview' && (
              <OverviewTab
                stats={overview.data.stats}
                rrHistory={overview.data.rr_history}
                recent={overview.data.recent_matches}
                onOpen={setSelected}
              />
            )}
            {tab === 'matches' && (
              <div className="animate-rise space-y-2">
                {matches.isLoading && (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {matches.data?.matches.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No matches found for this mode.
                  </p>
                )}
                {matches.data?.matches.map((m) => (
                  <MatchRow key={m.match_id} match={m} onOpen={() => setSelected(m.match_id)} />
                ))}
              </div>
            )}
            {tab === 'agents' && <AgentsTab agents={overview.data.stats.top_agents} />}
            {tab === 'maps' && <MapsTab maps={overview.data.stats.top_maps} />}
            {tab === 'arsenal' && <ArsenalTab weapons={overview.data.stats.top_weapons} />}
            {tab === 'career' && <CareerTab mode={mode} subject={subject} />}
            {tab === 'squad' && <SquadTab mode={mode} subject={subject} />}
            {tab === 'collection' && !isPublic && <CollectionTab />}
          </div>
        </>
      )}

      <MatchDetailDialog matchId={selected} subject={subject} onClose={() => setSelected(null)} />

      <footer className="mt-10 border-t border-border/50 pt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        VALO/LFG isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot
        Games or anyone officially involved in producing or managing Riot Games properties. Riot
        Games and all associated properties are trademarks or registered trademarks of Riot Games,
        Inc. The Tracker Score is a personal performance measure for your own games, not an official
        rank or matchmaking rating.
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function ProfileHero({ profile, stats }: { profile: ProfileHeader; stats: OverviewStats }) {
  const icons = useRankIcons()
  const streak = stats.current_streak
  const currentKey = rankIconKey(profile.current_tier, profile.current_division)
  const peakKey = rankIconKey(profile.peak_tier, profile.peak_division)

  return (
    <section className="clip-bevel animate-rise relative mt-6 overflow-hidden border border-border bg-card">
      {profile.card_wide && (
        <img
          src={profile.card_wide}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[center_30%] opacity-35"
        />
      )}
      <div className="tactical-grid relative bg-gradient-to-r from-card via-card/80 to-card/30 p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-4">
            {profile.card_small && (
              <img
                src={profile.card_small}
                alt=""
                aria-hidden
                className="clip-bevel-sm h-16 w-16 border border-border object-cover"
              />
            )}
            <div>
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-heading text-3xl font-bold tracking-wide">
                  {profile.riot_game_name}
                </span>
                <span className="text-lg text-muted-foreground">#{profile.riot_tag_line}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {profile.title && <span className="text-cyan">{profile.title}</span>}
                <span className="uppercase">{profile.region || '—'}</span>
                {profile.account_level != null && <span>· Level {profile.account_level}</span>}
                {streak !== 0 && (
                  <span
                    className="font-heading font-bold"
                    style={{ color: streak > 0 ? WIN_COLOR : LOSS_COLOR }}
                  >
                    · <Flame className="mb-0.5 inline h-3.5 w-3.5" /> {streakLabel(streak)} streak
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-6">
            <TrackerScore rating={stats.avg_rating} form={stats.rating_form} games={stats.matches_counted} />
            <RankBadge
              label="Current"
              icon={icons?.byName[currentKey]?.large}
              tier={profile.current_tier}
              division={profile.current_division}
              rr={profile.current_rr}
              delta={profile.last_change}
            />
            <RankBadge
              label="Peak"
              icon={icons?.byName[peakKey]?.large}
              tier={profile.peak_tier}
              division={profile.peak_division}
              dim
            />
            {profile.leaderboard_rank != null && (
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Leaderboard
                </div>
                <div className="font-heading text-2xl font-bold text-glow-red text-primary">
                  #{profile.leaderboard_rank}
                </div>
              </div>
            )}
          </div>
        </div>

        {profile.seasons.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.seasons.slice(0, 6).map((s) => (
              <div
                key={s.season}
                className="clip-bevel-sm border border-border/70 bg-background/60 px-2.5 py-1 text-[11px]"
                title={`${s.wins}W / ${s.games} games`}
              >
                <span className="uppercase text-muted-foreground">{s.season}</span>{' '}
                <span className="font-semibold" style={{ color: tierColor(s.end_tier) }}>
                  {s.end_tier || 'Unranked'}
                </span>{' '}
                <span className="text-muted-foreground">
                  {s.games ? `· ${s.wins}W/${s.games}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function RankBadge({
  label,
  icon,
  tier,
  division,
  rr,
  delta,
  dim,
}: {
  label: string
  icon?: string
  tier: string
  division: number | null
  rr?: number | null
  delta?: number | null
  dim?: boolean
}) {
  const color = tierColor(tier)
  return (
    <div className={`flex items-center gap-2.5 ${dim ? 'opacity-80' : ''}`}>
      {icon && tier ? (
        <img src={icon} alt="" aria-hidden className="h-12 w-12 drop-shadow" />
      ) : (
        <div className="h-12 w-12" />
      )}
      <div className="text-left">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-heading text-lg leading-tight font-bold" style={{ color: tier ? color : undefined }}>
          {rankLabel(tier, division, rr)}
        </div>
        {delta != null && (
          <div
            className="text-xs font-semibold tabular-nums"
            style={{ color: delta >= 0 ? WIN_COLOR : LOSS_COLOR }}
          >
            {signed(delta)} last game
          </div>
        )}
      </div>
    </div>
  )
}

/** Hero headline: the 0–10 performance rating, its grade, and a form sparkline. */
function TrackerScore({
  rating,
  form,
  games,
}: {
  rating: number | null
  form: number[]
  games: number
}) {
  const { grade, color, ink, label } = ratingTier(rating)
  return (
    <div className="flex flex-col items-end">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Tracker Score</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="font-heading text-4xl leading-none font-bold tabular-nums" style={{ color }}>
          {ratingLabel(rating)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">/10</span>
      </div>
      {rating != null && (
        <span
          className="mt-1.5 inline-flex items-center gap-1 rounded-[3px] px-2 py-0.5 text-xs font-bold shadow-sm"
          style={{ color: ink, backgroundColor: color }}
        >
          <span>{grade}</span>
          <span className="opacity-80">·</span>
          <span className="uppercase tracking-wide">{label}</span>
        </span>
      )}
      {form.length >= 2 ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
          <RatingSparkline values={form} width={104} height={26} />
          <span className="text-[10px] text-muted-foreground">last {form.length}</span>
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-muted-foreground">{games} games</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  stats,
  rrHistory,
  recent,
  onOpen,
}: {
  stats: OverviewStats
  rrHistory: import('@/api/tracker').MMRHistoryEntry[]
  recent: MatchSummary[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="animate-rise">
      <StatRow stats={stats} />

      <div className="mt-4">
        <ScoreLegend />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="clip-bevel border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan" />
            <h2 className="font-heading text-sm font-semibold tracking-wide">RANK RATING</h2>
          </div>
          <RRChart history={rrHistory} />
        </section>
        <section className="clip-bevel border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-cyan" />
            <h2 className="font-heading text-sm font-semibold tracking-wide">HIT LOCATIONS</h2>
          </div>
          <AccuracyFigure
            head={stats.hs_shot_percent}
            body={stats.body_percent}
            legs={stats.leg_percent}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {stats.headshots.toLocaleString()} heads · {stats.bodyshots.toLocaleString()} bodies ·{' '}
            {stats.legshots.toLocaleString()} legs
          </p>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <TopAgents agents={stats.top_agents} />
        <TopWeapons weapons={stats.top_weapons} />
        {stats.best_match && <BestMatchCard best={stats.best_match} onOpen={onOpen} />}
      </div>

      <TopMaps maps={stats.top_maps} />

      <section className="mt-6">
        <h2 className="font-heading text-sm font-semibold tracking-wide">RECENT MATCHES</h2>
        <div className="mt-3 space-y-2">
          {recent.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No matches found for this mode.
            </p>
          )}
          {recent.map((m) => (
            <MatchRow key={m.match_id} match={m} onOpen={() => onOpen(m.match_id)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function StatRow({ stats }: { stats: OverviewStats }) {
  const aces = stats.best_kill_round >= 5
  const tiles: { label: string; value: string; sub: string; accent?: string }[] = [
    {
      label: 'Win Rate',
      value: `${stats.win_rate}%`,
      sub: `${stats.wins}W · ${stats.losses}L${stats.draws ? ` · ${stats.draws}D` : ''}`,
      accent: stats.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR,
    },
    { label: 'K/D', value: stats.kd.toFixed(2), sub: `${stats.kills}/${stats.deaths}/${stats.assists}` },
    { label: 'KDA', value: stats.kda.toFixed(2), sub: `${stats.avg_kills} kills / game` },
    { label: 'Avg ACS', value: String(stats.avg_acs), sub: `${stats.matches_counted} games` },
    { label: 'ADR', value: stats.adr.toFixed(0), sub: `${stats.damage_dealt.toLocaleString()} dmg total` },
    { label: 'KAST', value: `${stats.kast}%`, sub: 'kill/assist/survive/trade' },
    { label: 'Headshot %', value: `${stats.hs_percent}%`, sub: 'per match avg' },
    {
      label: 'First Bloods',
      value: String(stats.first_bloods),
      sub: `${stats.first_deaths} first deaths`,
      accent: stats.first_bloods > stats.first_deaths ? WIN_COLOR : undefined,
    },
    {
      label: 'Multikills',
      value: String(stats.multikills),
      sub: aces ? `best round: ${stats.best_kill_round}K 🔥` : `best round: ${stats.best_kill_round}K`,
    },
    { label: 'Spike', value: String(stats.plants + stats.defuses), sub: `${stats.plants} plants · ${stats.defuses} defuses` },
    {
      label: 'Match MVPs',
      value: String(stats.mvps),
      sub: `${stats.team_mvps} team MVPs`,
      accent: stats.mvps > 0 ? '#e7c15a' : undefined,
    },
    {
      label: 'Streak',
      value: streakLabel(stats.current_streak) || '—',
      sub: 'current run',
      accent: stats.current_streak > 0 ? WIN_COLOR : stats.current_streak < 0 ? LOSS_COLOR : undefined,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="clip-bevel-sm border border-border bg-card p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
          <div className="mt-1 font-heading text-2xl font-bold tabular-nums" style={{ color: t.accent }}>
            {t.value}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground" title={t.sub}>
            {t.sub}
          </div>
        </div>
      ))}
    </div>
  )
}

function BestMatchCard({
  best,
  onOpen,
}: {
  best: NonNullable<OverviewStats['best_match']>
  onOpen: (id: string) => void
}) {
  return (
    <button
      onClick={() => best.match_id && onOpen(best.match_id)}
      className="clip-bevel group relative overflow-hidden border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/40"
    >
      {best.map_image && (
        <img
          src={best.map_image}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-25 transition-opacity group-hover:opacity-35"
        />
      )}
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-cyan" />
            <h2 className="font-heading text-sm font-semibold tracking-wide">BEST GAME</h2>
          </div>
          <RatingBadge value={best.rating} showGrade />
        </div>
        <div className="mt-3 flex items-center gap-3">
          {best.agent_image && (
            <img src={best.agent_image} alt={best.agent} className="h-12 w-12 rounded-sm" />
          )}
          <div>
            <div className="font-heading text-2xl font-bold tabular-nums">{best.acs} ACS</div>
            <div className="text-xs text-muted-foreground">
              {best.kills}/{best.deaths}/{best.assists} · {best.agent} · {best.map_name}
            </div>
          </div>
        </div>
        <div
          className="mt-2 text-xs font-semibold"
          style={{ color: outcomeColor(best.won) }}
        >
          {outcome(best.won) === 'win' ? 'VICTORY' : outcome(best.won) === 'loss' ? 'DEFEAT' : 'DRAW'}
          {best.started_at ? ` · ${timeAgo(best.started_at)}` : ''}
        </div>
      </div>
    </button>
  )
}

function TopAgents({ agents }: { agents: AgentStat[] }) {
  return (
    <section className="clip-bevel border border-border bg-card p-4">
      <h2 className="mb-3 font-heading text-sm font-semibold tracking-wide">TOP AGENTS</h2>
      {agents.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
      <div className="space-y-2.5">
        {agents.slice(0, 5).map((a) => (
          <div key={a.agent} className="flex items-center gap-3">
            {a.agent_image ? (
              <img src={a.agent_image} alt={a.agent} className="h-9 w-9 rounded-sm" loading="lazy" />
            ) : (
              <div className="h-9 w-9 rounded-sm bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.agent || 'Unknown'}</div>
              <div className="text-xs text-muted-foreground">
                {a.games}g · {a.kd.toFixed(2)} K/D · {a.avg_acs} ACS
              </div>
            </div>
            <RatingBadge value={a.avg_rating} />
            <div
              className="w-10 text-right font-heading text-sm font-bold tabular-nums"
              style={{ color: a.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
            >
              {a.win_rate}%
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function TopWeapons({ weapons }: { weapons: WeaponStat[] }) {
  const max = Math.max(...weapons.map((w) => w.kills), 1)
  return (
    <section className="clip-bevel border border-border bg-card p-4">
      <h2 className="mb-3 font-heading text-sm font-semibold tracking-wide">TOP WEAPONS</h2>
      {weapons.length === 0 && (
        <p className="text-sm text-muted-foreground">No kill-feed data in this sample.</p>
      )}
      <div className="space-y-2.5">
        {weapons.slice(0, 5).map((w) => (
          <div key={w.weapon_id || w.name} className="flex items-center gap-3">
            <div className="flex h-8 w-16 shrink-0 items-center justify-center">
              {w.image ? (
                <img
                  src={w.image}
                  alt={w.name}
                  loading="lazy"
                  className="max-h-8 max-w-16 object-contain"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between">
                <span className="truncate text-sm font-medium">{w.name || 'Unknown'}</span>
                <span className="font-heading text-sm font-bold tabular-nums">{w.kills}</span>
              </div>
              <div className="mt-1 h-1 bg-muted">
                <div className="h-full bg-cyan" style={{ width: `${(100 * w.kills) / max}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function TopMaps({ maps }: { maps: MapStat[] }) {
  if (maps.length === 0) return null
  return (
    <section className="mt-4">
      <h2 className="mb-3 font-heading text-sm font-semibold tracking-wide">MAP PERFORMANCE</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {maps.map((m) => (
          <div key={m.map_name} className="clip-bevel-sm relative overflow-hidden border border-border bg-card">
            {m.map_image && (
              <img
                src={m.map_image}
                alt={m.map_name}
                className="h-20 w-full object-cover opacity-40"
                loading="lazy"
              />
            )}
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-card via-card/60 to-transparent p-2.5">
              <div className="flex items-center justify-between gap-1">
                <div className="truncate text-sm font-semibold">{m.map_name || 'Unknown'}</div>
                <RatingBadge value={m.avg_rating} />
              </div>
              <div className="text-xs text-muted-foreground">
                <span style={{ color: m.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}>{m.win_rate}%</span>{' '}
                · {m.games}g · {m.kd.toFixed(2)} KD
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Agents / Maps / Arsenal tabs
// ---------------------------------------------------------------------------

function AgentsTab({ agents }: { agents: AgentStat[] }) {
  if (agents.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">No agent data yet.</p>
  return (
    <div className="clip-bevel animate-rise overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Agent</th>
            <th className="px-2 py-2.5 text-right font-medium">Games</th>
            <th className="px-2 py-2.5 text-right font-medium">Win %</th>
            <th className="px-2 py-2.5 text-right font-medium">K/D</th>
            <th className="px-2 py-2.5 text-right font-medium">ACS</th>
            <th className="px-2 py-2.5 text-right font-medium">ADR</th>
            <th className="px-2 py-2.5 text-right font-medium">KAST</th>
            <th className="px-2 py-2.5 text-right font-medium">HS%</th>
            <th className="px-2 py-2.5 text-right font-medium">FB</th>
            <th className="px-2 py-2.5 text-right font-medium">MK</th>
            <th className="px-4 py-2.5 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.agent} className="border-t border-border/40">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  {a.agent_image ? (
                    <img src={a.agent_image} alt="" className="h-8 w-8 rounded-sm" loading="lazy" />
                  ) : (
                    <div className="h-8 w-8 rounded-sm bg-muted" />
                  )}
                  <span className="font-medium">{a.agent || 'Unknown'}</span>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.games}</td>
              <td
                className="px-2 py-2.5 text-right font-semibold tabular-nums"
                style={{ color: a.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
              >
                {a.win_rate}%
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.kd.toFixed(2)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.avg_acs}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.adr.toFixed(0)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.kast}%</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.hs_percent}%</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.first_bloods}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{a.multikills}</td>
              <td className="px-4 py-2.5 text-right">
                <RatingBadge value={a.avg_rating} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MapsTab({ maps }: { maps: MapStat[] }) {
  if (maps.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">No map data yet.</p>
  return (
    <div className="animate-rise grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {maps.map((m) => (
        <div key={m.map_name} className="clip-bevel relative overflow-hidden border border-border bg-card">
          {m.map_image && (
            <img src={m.map_image} alt="" className="h-32 w-full object-cover opacity-45" loading="lazy" />
          )}
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-card via-card/50 to-transparent p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-heading text-lg font-bold">{m.map_name || 'Unknown'}</div>
              <RatingBadge value={m.avg_rating} showGrade />
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm">
              <span
                className="font-heading font-bold"
                style={{ color: m.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
              >
                {m.win_rate}% WR
              </span>
              <span className="text-muted-foreground">{m.games} games</span>
              <span className="text-muted-foreground">{m.kd.toFixed(2)} KD</span>
              <span className="text-muted-foreground">{m.avg_acs} ACS</span>
            </div>
            <div className="mt-2 h-1 bg-muted/60">
              <div
                className="h-full"
                style={{
                  width: `${m.win_rate}%`,
                  backgroundColor: m.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ArsenalTab({ weapons }: { weapons: WeaponStat[] }) {
  if (weapons.length === 0)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No weapon data in this sample yet — play a few games.
      </p>
    )
  const max = Math.max(...weapons.map((w) => w.kills), 1)
  return (
    <div className="animate-rise grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {weapons.map((w, i) => (
        <div key={w.weapon_id || w.name} className="clip-bevel border border-border bg-card p-4">
          <div className="flex h-14 items-center justify-center">
            {w.image ? (
              <img
                src={w.image}
                alt={w.name}
                loading="lazy"
                className="max-h-14 max-w-full object-contain drop-shadow"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            ) : (
              <span className="font-heading text-lg text-muted-foreground">{w.name}</span>
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-sm font-medium">{w.name || 'Unknown'}</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              #{i + 1}
            </span>
          </div>
          <div className="mt-1 font-heading text-2xl font-bold tabular-nums">
            {w.kills} <span className="text-sm font-normal text-muted-foreground">kills</span>
          </div>
          <div className="mt-2 h-1 bg-muted">
            <div className="h-full bg-primary" style={{ width: `${(100 * w.kills) / max}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Match row
// ---------------------------------------------------------------------------

function MatchRow({ match, onOpen }: { match: MatchSummary; onOpen: () => void }) {
  const result = outcome(match.subject_won)
  const accent = outcomeColor(match.subject_won)
  return (
    <button
      onClick={onOpen}
      className="clip-bevel-sm group relative flex w-full items-center gap-3 overflow-hidden border border-border bg-card p-3 text-left transition-colors hover:border-muted-foreground/40"
    >
      {match.map_image && (
        <img
          src={match.map_image}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-y-0 right-0 h-full w-56 object-cover opacity-15 [mask-image:linear-gradient(to_left,black,transparent)]"
        />
      )}
      <div className="h-11 w-1 shrink-0" style={{ backgroundColor: accent }} />
      {match.subject_agent_image ? (
        <img
          src={match.subject_agent_image}
          alt={match.subject_agent}
          className="h-11 w-11 rounded-sm"
          loading="lazy"
        />
      ) : (
        <div className="h-11 w-11 rounded-sm bg-muted" />
      )}
      <div className="relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: accent }}>
            {result === 'win' ? 'VICTORY' : result === 'loss' ? 'DEFEAT' : 'DRAW'}
          </span>
          <span className="font-heading text-sm font-bold tabular-nums">{match.subject_score_line}</span>
          {match.subject_mvp && (
            <span className="clip-bevel-sm bg-[#e7c15a]/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#e7c15a]">
              MATCH MVP
            </span>
          )}
          {!match.subject_mvp && match.subject_team_mvp && (
            <span className="clip-bevel-sm bg-cyan/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-cyan">
              TEAM MVP
            </span>
          )}
          {match.subject_multikills > 0 && (
            <span className="clip-bevel-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary">
              {match.subject_multikills}× MULTI
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {match.map_name} · {match.mode} · {timeAgo(match.started_at)} ·{' '}
          {formatDuration(match.game_length_seconds)}
        </div>
      </div>
      <div className="relative hidden shrink-0 items-center gap-4 text-right sm:flex">
        <MiniStat label="KDA" value={`${match.subject_kills}/${match.subject_deaths}/${match.subject_assists}`} />
        <MiniStat label="ACS" value={String(match.subject_acs)} />
        <MiniStat label="ADR" value={match.subject_adr.toFixed(0)} />
        <MiniStat label="HS" value={`${match.subject_hs_percent}%`} />
        <MiniStat label="KAST" value={match.subject_kast ? `${match.subject_kast}%` : '—'} />
        <MiniStat label="FB" value={String(match.subject_first_bloods)} />
        <div className="w-px self-stretch bg-border/60" />
        <div className="flex flex-col items-end">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</div>
          <div className="mt-0.5">
            <RatingBadge value={match.rating} size="md" showGrade />
          </div>
        </div>
      </div>
      <div className="relative flex items-center gap-2 text-right sm:hidden">
        <div>
          <div className="font-heading text-sm font-bold tabular-nums">
            {match.subject_kills}/{match.subject_deaths}/{match.subject_assists}
          </div>
          <div className="text-xs text-muted-foreground">{match.subject_acs} ACS</div>
        </div>
        <RatingBadge value={match.rating} />
      </div>
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-heading text-sm font-bold tabular-nums">{value}</div>
    </div>
  )
}

/** Riot-ID lookup box (name#tag) -> the public tracker for that player. */
function PlayerSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const raw = q.trim()
    const hash = raw.lastIndexOf('#')
    if (hash <= 0 || hash === raw.length - 1) return // need both name and tag
    const name = raw.slice(0, hash).trim()
    const tag = raw.slice(hash + 1).trim()
    if (!name || !tag) return
    navigate(`/tracker/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
    setQ('')
  }

  return (
    <form onSubmit={submit} className="relative hidden sm:block">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search Riot ID · name#tag"
        aria-label="Search a Riot ID"
        className="clip-bevel-sm h-9 w-52 border border-border bg-card pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </form>
  )
}
