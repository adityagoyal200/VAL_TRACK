import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, Skull, Swords, Users } from 'lucide-react'
import {
  getEncounters,
  getEncountersBackfillStatus,
  startEncountersBackfill,
  type EncounteredPlayer,
  type EncounterBackfillJob,
  type PartyGroup,
  type TrackerSubject,
} from '@/api/tracker'
import { Button } from '@/components/ui/button'
import { LOSS_COLOR, WIN_COLOR, subjectKey, timeAgo } from './lib'
import { Panel, RankNumber, SectionHeader } from './ui'

/**
 * Lifetime encounter/premade history — every match persisted to the
 * Encounters DB (the recent window ingested for free on every tracker view,
 * plus whatever the full-history backfill has pulled from past acts). Shows
 * who we've faced/teamed with most, and recurring duo/trio/stack groups on
 * either side, tracker.gg-"premades"-style.
 */
export function EncountersTab({ subject = null }: { subject?: TrackerSubject }) {
  const isPublic = subject !== null
  const sk = subjectKey(subject)

  const encounters = useQuery({
    queryKey: ['tracker', 'encounters', sk],
    queryFn: () => getEncounters(subject),
  })

  if (encounters.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const e = encounters.data
  const empty = !e || e.matches_analysed === 0

  return (
    <div className="animate-rise space-y-4">
      {!isPublic && <BackfillPanel />}

      {empty && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No persisted match history yet. Browse a few matches (or run a full history sync above)
          to build up who you've faced and teamed with.
        </p>
      )}

      {e && !empty && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <PlayerList
              title="MOST FACED"
              subtitle="opponents you keep running into"
              icon={<Swords className="h-3.5 w-3.5" />}
              players={e.opponents}
              recordAgainst
              accent="red"
            />
            <PlayerList
              title="MOST PLAYED WITH"
              subtitle="teammates across your whole history"
              icon={<Users className="h-3.5 w-3.5" />}
              players={e.teammates}
              accent="cyan"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PartyList
              title="ENEMY PREMADES"
              subtitle="duos, trios & stacks you've faced"
              icon={<Skull className="h-3.5 w-3.5" />}
              groups={e.enemy_parties}
              accent="red"
            />
            <PartyList
              title="YOUR PREMADES"
              subtitle="duos, trios & stacks on your own team"
              icon={<Users className="h-3.5 w-3.5" />}
              groups={e.ally_parties}
              accent="cyan"
            />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Based on {e.matches_analysed} persisted matches. Groups are detected by the same set of
            players repeatedly sharing a party, not just one game together.
          </p>
        </>
      )}
    </div>
  )
}

function BackfillPanel() {
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)

  const status = useQuery({
    queryKey: ['tracker', 'encounters-backfill-status'],
    queryFn: getEncountersBackfillStatus,
    refetchInterval: (query) => {
      const job = query.state.data as EncounterBackfillJob | null | undefined
      return job && (job.status === 'pending' || job.status === 'running') ? 2000 : false
    },
  })

  const job = status.data
  const running = job && (job.status === 'pending' || job.status === 'running')
  const progress = job && job.total > 0 ? Math.round((100 * job.done) / job.total) : 0

  const onStart = async () => {
    setStarting(true)
    try {
      await startEncountersBackfill()
      await queryClient.invalidateQueries({ queryKey: ['tracker', 'encounters-backfill-status'] })
    } finally {
      setStarting(false)
    }
  }

  const onDone = job?.status === 'done'
  const onFailed = job?.status === 'failed'

  return (
    <Panel accent="cyan">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold tracking-wide">FULL HISTORY SYNC</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pulls every act on record so Encounters covers your whole career, not just recent
            games. One-time, runs in the background.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!!running || starting} onClick={onStart}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Syncing…' : onDone ? 'Re-sync' : 'Sync full history'}
        </Button>
      </div>

      {job && job.total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {job.done}/{job.total} matches · {job.ingested} new
            </span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 bg-muted">
            <div
              className="h-full bg-cyan transition-all"
              style={{ width: `${progress}%`, boxShadow: '0 0 10px -1px #00e5c0' }}
            />
          </div>
        </div>
      )}

      {onFailed && (
        <p className="mt-2 text-xs text-primary">Sync failed: {job.error || 'unknown error'}</p>
      )}
    </Panel>
  )
}

function PlayerList({
  title,
  subtitle,
  icon,
  players,
  recordAgainst,
  accent = 'cyan',
}: {
  title: string
  subtitle: string
  icon: ReactNode
  players: EncounteredPlayer[]
  recordAgainst?: boolean
  accent?: 'red' | 'cyan'
}) {
  return (
    <Panel accent={accent}>
      <SectionHeader icon={icon} title={title} kicker={subtitle} accent={accent} />
      {players.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody recurring yet in this sample.</p>
      )}
      <div className="space-y-2.5">
        {players.map((p, i) => (
          <div key={p.puuid} className="group -mx-1 flex items-center gap-3 rounded-sm px-1 py-0.5 transition-colors hover:bg-white/5">
            <RankNumber n={i + 1} />
            {p.agent_image ? (
              <img src={p.agent_image} alt="" aria-hidden className="h-9 w-9 rounded-sm ring-1 ring-white/10" loading="lazy" />
            ) : (
              <div className="h-9 w-9 rounded-sm bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {p.name || 'Unknown'}
                {p.tag && <span className="text-muted-foreground">#{p.tag}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.games} games · {p.acts.length} act{p.acts.length === 1 ? '' : 's'} ·{' '}
                {timeAgo(p.last_seen)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-heading text-sm font-bold tabular-nums">{p.games}</div>
              {(p.wins > 0 || p.losses > 0) && (
                <div
                  className="text-[11px] font-semibold tabular-nums"
                  style={{ color: p.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
                  title={recordAgainst ? 'your win rate when facing them' : 'your win rate teamed with them'}
                >
                  {p.win_rate}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function PartyList({
  title,
  subtitle,
  icon,
  groups,
  accent = 'cyan',
}: {
  title: string
  subtitle: string
  icon: ReactNode
  groups: PartyGroup[]
  accent?: 'red' | 'cyan'
}) {
  return (
    <Panel accent={accent}>
      <SectionHeader icon={icon} title={title} kicker={subtitle} accent={accent} />
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No recurring premades spotted yet.</p>
      )}
      <div className="space-y-3">
        {groups.map((g) => (
          <div
            key={g.puuids.join('+')}
            className="border-l-2 pl-3 transition-colors"
            style={{ borderColor: g.side === 'enemy' ? '#ff465555' : '#00e5c055' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium">
                {g.names.map((m, i) => (
                  <span key={`${m.name}${m.tag}${i}`} className="flex items-center gap-1">
                    {m.agent_image && (
                      <img src={m.agent_image} alt="" aria-hidden className="h-5 w-5 rounded-sm" loading="lazy" />
                    )}
                    <span>
                      {m.name || 'Unknown'}
                      <span className="text-xs text-muted-foreground">#{m.tag}</span>
                    </span>
                    {i < g.names.length - 1 && <span className="text-muted-foreground">+</span>}
                  </span>
                ))}
              </div>
              <span
                className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                  g.side === 'enemy' ? 'bg-primary/10 text-primary' : 'bg-cyan/10 text-cyan'
                }`}
              >
                {g.label}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {g.side === 'enemy' ? 'Faced' : 'Together'} {g.games} time{g.games === 1 ? '' : 's'} ·{' '}
              {g.acts.join(', ')} · {timeAgo(g.last_seen)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
