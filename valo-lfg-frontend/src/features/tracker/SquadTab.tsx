import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Skull, Swords, UsersRound } from 'lucide-react'
import {
  getSquad,
  type Duelist,
  type PartySizeStat,
  type Squad,
  type Teammate,
  type TrackerSubject,
} from '@/api/tracker'
import { LOSS_COLOR, WIN_COLOR, subjectKey } from './lib'
import { Panel, RankNumber, SectionHeader, type Accent } from './ui'

/**
 * Party & rivalry analysis over the recent detailed-match window (the only
 * matches that carry party_id + a per-duel kill feed). Shows how the player
 * does solo vs stacked, who they queue with most, and their kill-feed
 * nemeses / favourite victims.
 */
const PARTY_LABELS: Record<number, string> = {
  1: 'Solo',
  2: 'Duo',
  3: 'Trio',
  4: '4-stack',
  5: '5-stack',
}

export function SquadTab({ mode, subject = null }: { mode: string; subject?: TrackerSubject }) {
  const squad = useQuery({
    queryKey: ['tracker', 'squad', subjectKey(subject), mode || 'all'],
    queryFn: () => getSquad(subject, mode),
  })

  if (squad.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!squad.data || squad.data.matches_analysed === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No detailed matches to analyse yet for this mode. Play a few games to see who you
        queue — and clash — with.
      </p>
    )
  }

  const s: Squad = squad.data

  return (
    <div className="animate-rise space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SoloVsStacked solo={s.solo_win_rate} stacked={s.stacked_win_rate} />
        <PartyBreakdown sizes={s.party_sizes} />
      </div>

      <Teammates mates={s.teammates} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DuelList
          title="NEMESES"
          subtitle="killed you the most"
          icon={<Skull className="h-3.5 w-3.5" />}
          duelists={s.nemeses}
          highlight="deaths"
          accent="red"
        />
        <DuelList
          title="FAVOURITE VICTIMS"
          subtitle="you killed the most"
          icon={<Swords className="h-3.5 w-3.5" />}
          duelists={s.victims}
          highlight="kills"
          accent="cyan"
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Based on the last {s.matches_analysed} detailed matches.
      </p>
    </div>
  )
}

function SoloVsStacked({ solo, stacked }: { solo: number; stacked: number }) {
  const rows: { label: string; value: number }[] = [
    { label: 'Solo queue', value: solo },
    { label: 'Stacked (2+)', value: stacked },
  ]
  return (
    <Panel accent="cyan">
      <SectionHeader icon={<UsersRound className="h-3.5 w-3.5" />} title="SOLO VS STACKED" accent="cyan" />
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span
                className="font-heading font-bold tabular-nums"
                style={{ color: r.value >= 50 ? WIN_COLOR : LOSS_COLOR }}
              >
                {r.value}%
              </span>
            </div>
            <div className="mt-1 h-1.5 bg-muted">
              <div
                className="h-full transition-all"
                style={{
                  width: `${r.value}%`,
                  backgroundColor: r.value >= 50 ? WIN_COLOR : LOSS_COLOR,
                  boxShadow: `0 0 10px -1px ${r.value >= 50 ? WIN_COLOR : LOSS_COLOR}`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function PartyBreakdown({ sizes }: { sizes: PartySizeStat[] }) {
  const maxGames = Math.max(...sizes.map((p) => p.games), 1)
  return (
    <Panel accent="violet">
      <SectionHeader icon={<UsersRound className="h-3.5 w-3.5" />} title="PARTY SIZE" accent="violet" />
      {sizes.length === 0 && <p className="text-sm text-muted-foreground">No data.</p>}
      <div className="space-y-2.5">
        {sizes.map((p) => (
          <div key={p.size} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">
              {PARTY_LABELS[p.size] ?? `${p.size}-stack`}
            </span>
            <div className="h-4 flex-1 bg-muted">
              <div
                className="flex h-full items-center bg-cyan/70 px-1.5"
                style={{ width: `${Math.max(8, (100 * p.games) / maxGames)}%` }}
              >
                <span className="text-[10px] font-bold text-background">{p.games}</span>
              </div>
            </div>
            <span
              className="w-12 shrink-0 text-right font-heading text-sm font-bold tabular-nums"
              style={{ color: p.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
            >
              {p.win_rate}%
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Teammates({ mates }: { mates: Teammate[] }) {
  if (mates.length === 0) return null
  return (
    <Panel accent="cyan">
      <SectionHeader icon={<UsersRound className="h-3.5 w-3.5" />} title="MOST PLAYED WITH" accent="cyan" />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {mates.map((t, i) => (
          <div key={t.puuid} className="group -mx-1 flex items-center gap-3 rounded-sm px-1 py-0.5 transition-colors hover:bg-white/5">
            <RankNumber n={i + 1} />
            {t.agent_image ? (
              <img src={t.agent_image} alt="" aria-hidden className="h-9 w-9 rounded-sm ring-1 ring-white/10" loading="lazy" />
            ) : (
              <div className="h-9 w-9 rounded-sm bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {t.name}
                <span className="text-muted-foreground">#{t.tag}</span>
              </div>
              <div className="text-xs text-muted-foreground">{t.games} games together</div>
            </div>
            <div
              className="font-heading text-sm font-bold tabular-nums"
              style={{ color: t.win_rate >= 50 ? WIN_COLOR : LOSS_COLOR }}
            >
              {t.win_rate}%
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function DuelList({
  title,
  subtitle,
  icon,
  duelists,
  highlight,
  accent,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  duelists: Duelist[]
  highlight: 'kills' | 'deaths'
  accent: Accent
}) {
  return (
    <Panel accent={accent}>
      <SectionHeader icon={icon} title={title} kicker={subtitle} accent={accent} />
      {duelists.length === 0 && (
        <p className="text-sm text-muted-foreground">No recurring rivals in this sample.</p>
      )}
      <div className="space-y-2.5">
        {duelists.map((d, i) => (
          <div key={d.puuid} className="group -mx-1 flex items-center gap-3 rounded-sm px-1 py-0.5 transition-colors hover:bg-white/5">
            <RankNumber n={i + 1} />
            {d.agent_image ? (
              <img src={d.agent_image} alt="" aria-hidden className="h-9 w-9 rounded-sm ring-1 ring-white/10" loading="lazy" />
            ) : (
              <div className="h-9 w-9 rounded-sm bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {d.name || 'Unknown'}
                {d.tag && <span className="text-muted-foreground">#{d.tag}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.kills} killed · {d.deaths} died to
              </div>
            </div>
            <div className="text-right">
              <div
                className="font-heading text-lg font-bold tabular-nums"
                style={{ color: highlight === 'kills' ? WIN_COLOR : LOSS_COLOR }}
              >
                {highlight === 'kills' ? d.kills : d.deaths}
              </div>
              <div
                className="text-[11px] font-semibold tabular-nums"
                style={{ color: d.diff >= 0 ? WIN_COLOR : LOSS_COLOR }}
              >
                {d.diff >= 0 ? `+${d.diff}` : d.diff}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
