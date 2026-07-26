import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarRange,
  Crosshair,
  Flame,
  Gauge,
  ListVideo,
  Loader2,
  Map as MapIcon,
  Radar,
  Radio,
  Search,
  Settings,
  Shirt,
  Swords,
  TrendingUp,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/chip'
import { Wordmark } from '@/components/wordmark'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import {
  getCareer,
  getMatches,
  getOverview,
  type ActStat,
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
import { AgentHoneycomb } from './AgentHoneycomb'
import { CombatDNAPanel } from './CombatDNA'
import { HeroEmblem3D } from './HeroEmblem3D'
import { EncountersTab } from './EncountersTab'
import { RadarLoader, ScoreGauge, useCountUp } from './HeroFx'
import { MatchDetailDialog } from './MatchDetailDialog'
import { RatingBadge, RatingSparkline, ScoreLegend } from './RatingBadge'
import { RRChart } from './RRChart'
import { SquadTab } from './SquadTab'
import { ACCENTS, Panel, RankNumber, SectionHeader, type Accent } from './ui'
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
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'matches', label: 'Matches', icon: ListVideo },
  { id: 'agents', label: 'Agents', icon: UsersRound },
  { id: 'maps', label: 'Maps', icon: MapIcon },
  { id: 'arsenal', label: 'Arsenal', icon: Crosshair },
  { id: 'career', label: 'Acts', icon: CalendarRange },
  { id: 'squad', label: 'Squad', icon: UsersRound },
  { id: 'encounters', label: 'Encounters', icon: Radar },
  { id: 'collection', label: 'Collection', icon: Shirt },
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
  // Same query key CareerTab uses — shares its cache, so switching to the
  // Acts tab later is instant instead of re-fetching the full history walk.
  const career = useQuery({
    queryKey: ['tracker', 'career', sk, mode || 'all'],
    queryFn: () => getCareer(subject, mode),
  })

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const linkMissing =
    !isPublic && overview.error instanceof ApiError && overview.error.status === 409

  return (
    <div className="scanlines relative mx-auto max-w-6xl px-4 py-8">
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
          <RadarLoader size={96} label="Scanning" />
        </div>
      )}

      {linkMissing && (
        <div className="clip-bevel glass animate-rise mt-10 border border-border p-8 text-center">
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
          <ProfileHero
            profile={overview.data.profile}
            stats={overview.data.stats}
            lifetime={career.data?.all}
          />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <nav className="clip-bevel-sm glass flex flex-wrap gap-1 border border-border/70 p-1">
              {tabs.map((t) => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`relative flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-heading text-xs font-semibold tracking-wide uppercase transition-all duration-200 ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-[0_0_18px_-2px_oklch(0.645_0.235_18_/_0.55)]'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                )
              })}
            </nav>
            {tab !== 'collection' && tab !== 'encounters' && (
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
            {tab === 'agents' && <AgentHoneycomb agents={overview.data.stats.top_agents} />}
            {tab === 'maps' && <MapsTab maps={overview.data.stats.top_maps} />}
            {tab === 'arsenal' && <ArsenalTab weapons={overview.data.stats.top_weapons} />}
            {tab === 'career' && <CareerTab mode={mode} subject={subject} />}
            {tab === 'squad' && <SquadTab mode={mode} subject={subject} />}
            {tab === 'encounters' && <EncountersTab subject={subject} />}
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

function ProfileHero({
  profile,
  stats,
  lifetime,
}: {
  profile: ProfileHeader
  stats: OverviewStats
  lifetime?: ActStat
}) {
  const icons = useRankIcons()
  const streak = stats.current_streak
  const currentKey = rankIconKey(profile.current_tier, profile.current_division)
  const peakKey = rankIconKey(profile.peak_tier, profile.peak_division)

  return (
    <section className="clip-bevel animate-rise group relative mt-6 overflow-hidden border border-border bg-card shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)]">
      {profile.card_wide && (
        <img
          src={profile.card_wide}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[center_28%] opacity-90"
        />
      )}
      {/* only enough gradient for text legibility — the card art stays visible */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/45 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/85 via-transparent to-transparent"
        aria-hidden
      />
      {/* subtle aurora, kept low so it doesn't wash out the card */}
      <div
        className="aurora animate-drift"
        style={{ top: '-40%', right: '-8%', width: '40%', height: '170%', opacity: 0.18, background: 'radial-gradient(closest-side, #ff4655, transparent)' }}
        aria-hidden
      />
      <div
        className="aurora animate-drift-slow"
        style={{ bottom: '-50%', left: '20%', width: '44%', height: '180%', opacity: 0.14, background: 'radial-gradient(closest-side, #00e5c0, transparent)' }}
        aria-hidden
      />
      <div className="tactical-grid relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-4">
            {profile.card_small && (
              <img
                src={profile.card_small}
                alt=""
                aria-hidden
                className="clip-bevel-sm h-16 w-16 border border-white/15 object-cover shadow-[0_0_26px_-6px_rgba(0,229,192,0.55)]"
              />
            )}
            <div>
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-heading text-3xl font-bold tracking-wide text-foreground [text-shadow:0_0_24px_rgba(255,255,255,0.18)] sm:text-4xl">
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
              {stats.top_agents.length > 0 && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mains</span>
                  {stats.top_agents.slice(0, 3).map(
                    (a) =>
                      a.agent_image && (
                        <img
                          key={a.agent}
                          src={a.agent_image}
                          alt={a.agent}
                          title={`${a.agent} · ${a.games}g · ${a.win_rate}%`}
                          loading="lazy"
                          className="clip-bevel-sm h-8 w-8 border border-white/15 object-cover transition-transform hover:scale-110"
                        />
                      ),
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-6">
            <TrackerScore
              rating={stats.avg_rating}
              form={stats.rating_form}
              games={stats.matches_counted}
              lifetimeRating={lifetime?.avg_rating ?? null}
              lifetimeGames={lifetime?.matches ?? 0}
            />
            <RankEmblem
              label="Current"
              icon={icons?.byName[currentKey]?.large}
              tier={profile.current_tier}
              division={profile.current_division}
              rr={profile.current_rr}
              delta={profile.last_change}
              color={tierColor(profile.current_tier) || '#ff4655'}
            />
            <RankEmblem
              label="Peak"
              icon={icons?.byName[peakKey]?.large}
              tier={profile.peak_tier}
              division={profile.peak_division}
              color={tierColor(profile.peak_tier) || '#e7c15a'}
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
                className="clip-bevel-sm hud-tile px-2.5 py-1 text-[11px]"
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
      {/* lit bottom edge — the hero's signature red→cyan HUD line */}
      <div
        className="animate-pulse-glow pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #ff4655 30%, #00e5c0 70%, transparent)' }}
        aria-hidden
      />
    </section>
  )
}

/** A rank shown as the 3D crystal-reticle emblem (the actual rank badge
 * floating in a spinning HUD reticle) with its label + RR beneath. Used for
 * both Current and Peak, so rank is never rendered as a flat duplicate. */
function RankEmblem({
  label,
  icon,
  tier,
  division,
  rr,
  delta,
  color,
  dim,
}: {
  label: string
  icon?: string
  tier: string
  division: number | null
  rr?: number | null
  delta?: number | null
  color: string
  dim?: boolean
}) {
  return (
    <div className={`flex flex-col items-center ${dim ? 'opacity-90' : ''}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <HeroEmblem3D color={color} rankIcon={tier ? icon : undefined} className="my-1 h-[76px] w-[76px]" />
      <div className="font-heading text-xs leading-tight font-bold" style={{ color: tier ? color : undefined }}>
        {rankLabel(tier, division, rr)}
      </div>
      {delta != null && (
        <div
          className="text-[10px] font-semibold tabular-nums"
          style={{ color: delta >= 0 ? WIN_COLOR : LOSS_COLOR }}
        >
          {signed(delta)} last
        </div>
      )}
    </div>
  )
}

/** Hero headline: the 0–10 performance rating, its grade, a form sparkline,
 * and — once the full-history career pull lands — the lifetime score next
 * to it, so "recent form" and "overall" are never confused for each other. */
function TrackerScore({
  rating,
  form,
  games,
  lifetimeRating,
  lifetimeGames,
}: {
  rating: number | null
  form: number[]
  games: number
  lifetimeRating: number | null
  lifetimeGames: number
}) {
  const lifetimeTier = ratingTier(lifetimeRating)
  return (
    <div className="flex items-center gap-5">
      {/* the hero centerpiece: an animated radial score dial */}
      <div className="flex flex-col items-center">
        <ScoreGauge value={rating} label="Recent Form" />
        {form.length >= 2 ? (
          <div className="mt-2 flex items-center gap-1.5">
            <RatingSparkline values={form} width={126} height={24} />
            <span className="text-[10px] text-muted-foreground">last {form.length}</span>
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-muted-foreground">{games} games</div>
        )}
      </div>

      {lifetimeGames > 0 && (
        <div className="flex flex-col items-center self-stretch justify-center border-l border-border/60 pl-5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Overall</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className="font-heading text-4xl leading-none font-bold tabular-nums"
              style={{ color: lifetimeTier.color, textShadow: `0 0 24px ${lifetimeTier.color}44` }}
            >
              {ratingLabel(lifetimeRating)}
            </span>
            <span className="text-xs font-medium text-muted-foreground">/10</span>
          </div>
          {lifetimeRating != null && (
            <span
              className="mt-2 rounded-[3px] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: lifetimeTier.ink, backgroundColor: lifetimeTier.color, boxShadow: `0 0 16px -4px ${lifetimeTier.color}` }}
            >
              {lifetimeTier.grade} · {lifetimeTier.label}
            </span>
          )}
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {lifetimeGames.toLocaleString()} games
          </div>
        </div>
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
        <CombatDNAPanel stats={stats} />
      </div>

      <div className="mt-4">
        <ScoreLegend />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel accent="cyan" className="lg:col-span-2">
          <SectionHeader icon={<TrendingUp className="h-3.5 w-3.5" />} title="RANK RATING" accent="cyan" />
          <RRChart history={rrHistory} />
        </Panel>
        <Panel accent="cyan">
          <SectionHeader icon={<Crosshair className="h-3.5 w-3.5" />} title="HIT LOCATIONS" accent="cyan" />
          <AccuracyFigure
            head={stats.hs_shot_percent}
            body={stats.body_percent}
            legs={stats.leg_percent}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {stats.headshots.toLocaleString()} heads · {stats.bodyshots.toLocaleString()} bodies ·{' '}
            {stats.legshots.toLocaleString()} legs
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <TopAgents agents={stats.top_agents} />
        <TopWeapons weapons={stats.top_weapons} />
        {stats.best_match && <BestMatchCard best={stats.best_match} onOpen={onOpen} />}
      </div>

      <TopMaps maps={stats.top_maps} />

      <section className="mt-6">
        <SectionHeader icon={<ListVideo className="h-3.5 w-3.5" />} title="RECENT MATCHES" accent="red" />
        <div className="space-y-2">
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

/** An oversized "hero" stat — the marquee numbers (Win Rate / K/D / ACS) blown
 * up with a count-up animation and, for win rate, a fill bar. Editorial scale +
 * negative space is what separates this from a uniform tile grid. */
function HeroStat({
  label,
  value,
  decimals = 0,
  suffix = '',
  sub,
  accent,
  numColor,
  bar,
  className = '',
}: {
  label: string
  value: number
  decimals?: number
  suffix?: string
  sub: string
  accent?: Accent
  numColor?: string
  bar?: number
  className?: string
}) {
  const n = useCountUp(value, { duration: 1400, decimals })
  const color = numColor ?? (accent ? ACCENTS[accent] : undefined)
  const shown = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString()
  return (
    <Panel accent={accent} className={`flex min-h-[128px] flex-col justify-between ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <div>
        <span
          className="font-heading text-5xl font-bold leading-none tabular-nums sm:text-6xl"
          style={color ? { color, textShadow: `0 0 34px ${color}44` } : undefined}
        >
          {shown}
          {suffix && <span className="text-3xl align-top">{suffix}</span>}
        </span>
        {bar != null && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-out"
              style={{
                width: `${Math.max(0, Math.min(100, bar))}%`,
                backgroundColor: color ?? '#fff',
                boxShadow: color ? `0 0 10px -1px ${color}` : undefined,
              }}
            />
          </div>
        )}
        <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
      </div>
    </Panel>
  )
}

/** A dense inline stat chip for the secondary strip under the hero stats. */
function CompactStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div
      className="glass clip-bevel-sm hover-lift flex items-baseline gap-2 border border-border px-3 py-2 hover:border-white/25"
      title={sub}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className="font-heading text-sm font-bold tabular-nums"
        style={accent ? { color: accent, textShadow: `0 0 14px ${accent}44` } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

function StatRow({ stats }: { stats: OverviewStats }) {
  const win = stats.win_rate >= 50
  const aces = stats.best_kill_round >= 5
  const secondary: { label: string; value: string; sub: string; accent?: string }[] = [
    { label: 'KDA', value: stats.kda.toFixed(2), sub: `${stats.avg_kills} kills / game` },
    { label: 'ADR', value: stats.adr.toFixed(0), sub: `${stats.damage_dealt.toLocaleString()} dmg total` },
    { label: 'KAST', value: `${stats.kast}%`, sub: 'kill/assist/survive/trade' },
    { label: 'HS%', value: `${stats.hs_percent}%`, sub: 'per match avg' },
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
    { label: 'MVPs', value: String(stats.mvps), sub: `${stats.team_mvps} team MVPs`, accent: stats.mvps > 0 ? ACCENTS.gold : undefined },
    {
      label: 'Streak',
      value: streakLabel(stats.current_streak) || '—',
      sub: 'current run',
      accent: stats.current_streak > 0 ? WIN_COLOR : stats.current_streak < 0 ? LOSS_COLOR : undefined,
    },
  ]
  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-4">
        <HeroStat
          className="animate-pop lg:col-span-2"
          label="Win Rate"
          value={stats.win_rate}
          suffix="%"
          sub={`${stats.wins}W · ${stats.losses}L${stats.draws ? ` · ${stats.draws}D` : ''}`}
          accent={win ? 'cyan' : 'red'}
          numColor={win ? WIN_COLOR : LOSS_COLOR}
          bar={stats.win_rate}
        />
        <HeroStat className="animate-pop" label="K / D" value={stats.kd} decimals={2} sub={`${stats.kills} / ${stats.deaths} / ${stats.assists}`} accent="violet" />
        <HeroStat className="animate-pop" label="Avg ACS" value={stats.avg_acs} sub={`${stats.matches_counted} games`} accent="gold" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {secondary.map((s, i) => (
          <div key={s.label} className="animate-pop" style={{ '--i': i } as CSSProperties}>
            <CompactStat label={s.label} value={s.value} sub={s.sub} accent={s.accent} />
          </div>
        ))}
      </div>
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
      className="clip-bevel group relative overflow-hidden border border-border bg-gradient-to-br from-card to-card/60 p-4 text-left transition-all duration-200 hover:border-[#e7c15a]/50"
    >
      {best.map_image && (
        <img
          src={best.map_image}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-25 transition-opacity duration-300 group-hover:opacity-40"
        />
      )}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 4%, #e7c15a 40%, #e7c15a 60%, transparent 96%)' }}
        aria-hidden
      />
      <div className="relative">
        <SectionHeader
          icon={<Swords className="h-3.5 w-3.5" />}
          title="BEST GAME"
          accent="gold"
          right={<RatingBadge value={best.rating} showGrade />}
        />
        <div className="flex items-center gap-3">
          {best.agent_image && (
            <img src={best.agent_image} alt={best.agent} className="h-12 w-12 rounded-sm ring-1 ring-white/10" />
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
    <Panel accent="violet">
      <SectionHeader icon={<UsersRound className="h-3.5 w-3.5" />} title="TOP AGENTS" accent="violet" />
      {agents.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
      <div className="space-y-2.5">
        {agents.slice(0, 5).map((a, i) => (
          <div key={a.agent} className="hud-row [--row-accent:#a374ff] group -mx-1 flex items-center gap-3 rounded-sm px-2 py-1">
            <RankNumber n={i + 1} />
            {a.agent_image ? (
              <img src={a.agent_image} alt={a.agent} className="h-9 w-9 rounded-sm ring-1 ring-white/10" loading="lazy" />
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
    </Panel>
  )
}

function TopWeapons({ weapons }: { weapons: WeaponStat[] }) {
  const max = Math.max(...weapons.map((w) => w.kills), 1)
  return (
    <Panel accent="red">
      <SectionHeader icon={<Crosshair className="h-3.5 w-3.5" />} title="TOP WEAPONS" accent="red" />
      {weapons.length === 0 && (
        <p className="text-sm text-muted-foreground">No kill-feed data in this sample.</p>
      )}
      <div className="space-y-2.5">
        {weapons.slice(0, 5).map((w) => (
          <div key={w.weapon_id || w.name} className="hud-row [--row-accent:#ff4655] -mx-1 flex items-center gap-3 rounded-sm px-2 py-1">
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
    </Panel>
  )
}

function TopMaps({ maps }: { maps: MapStat[] }) {
  if (maps.length === 0) return null
  return (
    <section className="mt-4">
      <SectionHeader icon={<MapIcon className="h-3.5 w-3.5" />} title="MAP PERFORMANCE" accent="gold" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {maps.map((m) => (
          <div
            key={m.map_name}
            className="clip-bevel-sm group relative overflow-hidden border border-border bg-card transition-colors duration-200 hover:border-white/20"
          >
            {m.map_image && (
              <img
                src={m.map_image}
                alt={m.map_name}
                className="h-20 w-full object-cover opacity-40 transition-opacity duration-200 group-hover:opacity-55"
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

function MapsTab({ maps }: { maps: MapStat[] }) {
  if (maps.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">No map data yet.</p>
  return (
    <div className="animate-rise grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {maps.map((m) => (
        <div
          key={m.map_name}
          className="clip-bevel hover-lift group relative overflow-hidden border border-border bg-card transition-colors duration-200 hover:border-white/20"
        >
          {m.map_image && (
            <img
              src={m.map_image}
              alt=""
              className="h-32 w-full object-cover opacity-45 transition-all duration-300 group-hover:scale-105 group-hover:opacity-60"
              loading="lazy"
            />
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
        <div
          key={w.weapon_id || w.name}
          className="clip-bevel glass hover-lift group relative overflow-hidden border border-border p-4 transition-colors duration-200 hover:border-primary/40"
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 4%, #ff4655 40%, #ff4655 60%, transparent 96%)' }}
            aria-hidden
          />
          <div className="flex h-14 items-center justify-center transition-transform duration-300 group-hover:scale-110">
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
            <RankNumber n={i + 1} />
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
      className="clip-bevel-sm glass hover-lift group relative flex w-full items-center gap-3 overflow-hidden border border-border p-3 text-left transition-all duration-200 hover:border-white/25"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, ${accent}14, transparent 55%)` }}
        aria-hidden
      />
      {match.map_image && (
        <img
          src={match.map_image}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-y-0 right-0 h-full w-56 object-cover opacity-15 [mask-image:linear-gradient(to_left,black,transparent)]"
        />
      )}
      <div className="relative h-11 w-1 shrink-0" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}80` }} />
      {match.subject_agent_image ? (
        <img
          src={match.subject_agent_image}
          alt={match.subject_agent}
          className="relative h-11 w-11 rounded-sm ring-1 ring-white/10"
          loading="lazy"
        />
      ) : (
        <div className="relative h-11 w-11 rounded-sm bg-muted" />
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
        className="clip-bevel-sm glass h-9 w-52 border border-border pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </form>
  )
}
