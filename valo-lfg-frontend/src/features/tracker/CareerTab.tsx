import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crosshair, Loader2, Map as MapIcon, Trophy, UsersRound } from 'lucide-react'
import { Chip } from '@/components/chip'
import {
  getCareer,
  type ActStat,
  type CareerAgent,
  type CareerMap,
  type TrackerSubject,
} from '@/api/tracker'
import { fetchRankIcons } from '@/api/valorantAssets'
import { AccuracyFigure } from './AccuracyFigure'
import { RatingBadge } from './RatingBadge'
import { LOSS_COLOR, WIN_COLOR, subjectKey } from './lib'
import { Panel, RankNumber, SectionHeader } from './ui'

/**
 * Lifetime career: per-act splits over every stored match plus an aggregate
 * "all acts" bucket. Backend bins by act short (e11a4, …); this tab lets the
 * player page through acts and rolls up combat, agent and map performance.
 */
export function CareerTab({ mode, subject = null }: { mode: string; subject?: TrackerSubject }) {
  const career = useQuery({
    queryKey: ['tracker', 'career', subjectKey(subject), mode || 'all'],
    queryFn: () => getCareer(subject, mode),
  })
  const icons = useQuery({
    queryKey: ['val-assets', 'rank-icons'],
    queryFn: fetchRankIcons,
    staleTime: Infinity,
  }).data

  // "all" first, then each real act (already newest-first from the backend).
  const buckets = useMemo<ActStat[]>(() => {
    if (!career.data) return []
    return [career.data.all, ...career.data.acts]
  }, [career.data])
  // Default to the "All acts" lifetime bucket — the overall Tracker Score —
  // with per-act splits one click away.
  const [act, setAct] = useState<string | null>(null)
  const active = buckets.find((b) => b.act === (act ?? 'all')) ?? buckets[0]

  if (career.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!active || active.matches === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No stored matches yet for this mode. Career history builds up as you play.
      </p>
    )
  }

  const peak = active.peak_tier ? icons?.byTier[active.peak_tier] : undefined
  const isLifetime = active.act === 'all'

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap gap-2">
        {buckets.map((b) => (
          <Chip key={b.act} selected={active.act === b.act} onClick={() => setAct(b.act)}>
            {b.act === 'all' ? 'All acts' : b.label || b.act.toUpperCase()}
          </Chip>
        ))}
      </div>

      <Panel accent={isLifetime ? 'gold' : 'cyan'} className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              {isLifetime && <Trophy className="h-3 w-3" style={{ color: '#e7c15a' }} />}
              {isLifetime ? 'Lifetime' : active.label || active.act.toUpperCase()}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className="font-heading text-3xl font-bold tabular-nums"
                style={{ color: active.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
              >
                {active.win_rate}%
              </span>
              <span className="text-sm text-muted-foreground">
                {active.wins}W · {active.losses}L{active.draws ? ` · ${active.draws}D` : ''} ·{' '}
                {active.matches} games
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {isLifetime ? 'Overall Score' : 'Tracker Score'}
              </div>
              <div className="mt-1 flex justify-end">
                <RatingBadge value={active.avg_rating} size="md" showGrade />
              </div>
            </div>
            {peak && (
              <div className="flex items-center gap-2.5 border-l border-border/60 pl-6">
                <img src={peak.large} alt="" aria-hidden className="h-12 w-12 drop-shadow" />
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Peak rank
                  </div>
                  <div className="font-heading text-lg font-bold">{peak.name}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <CareerStat label="K/D" value={active.kd.toFixed(2)} />
          <CareerStat label="KDA" value={active.kda.toFixed(2)} />
          <CareerStat label="Avg ACS" value={String(active.avg_acs)} />
          <CareerStat label="ADR" value={active.adr.toFixed(0)} />
          <CareerStat label="HS%" value={`${active.hs_percent}%`} />
          <CareerStat label="Kills / game" value={active.avg_kills.toFixed(1)} />
          <CareerStat label="Kills" value={active.kills.toLocaleString()} />
          <CareerStat label="Assists" value={active.assists.toLocaleString()} />
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <AccuracyCard act={active} />
        <CareerAgents agents={active.top_agents} />
        <CareerMaps maps={active.top_maps} />
      </div>
    </div>
  )
}

function AccuracyCard({ act }: { act: ActStat }) {
  return (
    <Panel accent="cyan">
      <SectionHeader icon={<Crosshair className="h-3.5 w-3.5" />} title="HIT LOCATIONS" accent="cyan" />
      <AccuracyFigure head={act.hs_percent} body={act.body_percent} legs={act.leg_percent} />
      <p className="mt-3 text-xs text-muted-foreground">
        {act.head.toLocaleString()} heads · {act.body.toLocaleString()} bodies ·{' '}
        {act.leg.toLocaleString()} legs
      </p>
    </Panel>
  )
}

function CareerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="clip-bevel-sm border border-border/70 bg-background/40 p-2.5 transition-colors hover:border-white/20">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-heading text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}

function CareerAgents({ agents }: { agents: CareerAgent[] }) {
  return (
    <Panel accent="violet">
      <SectionHeader icon={<UsersRound className="h-3.5 w-3.5" />} title="TOP AGENTS" accent="violet" />
      {agents.length === 0 && <p className="text-sm text-muted-foreground">No agent data.</p>}
      <div className="space-y-2.5">
        {agents.map((a, i) => (
          <div key={a.agent} className="group -mx-1 flex items-center gap-3 rounded-sm px-1 py-0.5 transition-colors hover:bg-white/5">
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
            <div
              className="font-heading text-sm font-bold tabular-nums"
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

function CareerMaps({ maps }: { maps: CareerMap[] }) {
  return (
    <Panel accent="gold">
      <SectionHeader icon={<MapIcon className="h-3.5 w-3.5" />} title="MAP PERFORMANCE" accent="gold" />
      {maps.length === 0 && <p className="text-sm text-muted-foreground">No map data.</p>}
      <div className="space-y-2.5">
        {maps.map((m, i) => (
          <div key={m.map_name} className="group -mx-1 flex items-center gap-3 rounded-sm px-1 py-0.5 transition-colors hover:bg-white/5">
            <RankNumber n={i + 1} />
            {m.map_image ? (
              <img
                src={m.map_image}
                alt=""
                aria-hidden
                className="clip-bevel-sm h-9 w-14 shrink-0 object-cover ring-1 ring-white/10"
                loading="lazy"
              />
            ) : (
              <div className="h-9 w-14 shrink-0 bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.map_name || 'Unknown'}</div>
              <div className="text-xs text-muted-foreground">
                {m.games}g · {m.avg_acs} ACS
              </div>
            </div>
            <div
              className="font-heading text-sm font-bold tabular-nums"
              style={{ color: m.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
            >
              {m.win_rate}%
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
