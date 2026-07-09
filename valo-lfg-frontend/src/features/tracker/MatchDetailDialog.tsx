import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { getMatchDetail, type MatchDetail, type MatchPlayer, type TrackerSubject } from '@/api/tracker'
import { fetchRankIcons } from '@/api/valorantAssets'
import { RatingBadge } from './RatingBadge'
import {
  LOSS_COLOR,
  WIN_COLOR,
  formatDateTime,
  formatDuration,
  outcome,
  partyColorsFor,
  partySizeLabel,
  subjectKey,
  tierColor,
  timeAgo,
} from './lib'

/** Full scoreboard overlay for a single match. Fetches on open. */
export function MatchDetailDialog({
  matchId,
  subject = null,
  onClose,
}: {
  matchId: string | null
  subject?: TrackerSubject
  onClose: () => void
}) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Jump to another player's public tracker (closes this dialog first).
  const openPlayer = (name: string, tag: string) => {
    if (!name || !tag) return
    onClose()
    navigate(`/tracker/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tracker', 'match', subjectKey(subject), matchId],
    queryFn: () => getMatchDetail(subject, matchId!),
    enabled: !!matchId,
  })

  if (!matchId) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="clip-bevel animate-rise mt-8 w-full max-w-5xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-border">
          {data?.map_image && (
            <img
              src={data.map_image}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
          )}
          <div className="relative flex items-center justify-between bg-gradient-to-r from-card via-card/70 to-transparent px-5 py-3">
            <div>
              <h2 className="font-heading text-sm font-semibold tracking-wide">SCOREBOARD</h2>
              {data && (
                <p className="text-xs text-muted-foreground">
                  {data.map_name} · {data.mode} · {formatDuration(data.game_length_seconds)} ·{' '}
                  {timeAgo(data.started_at)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {data && (
                <span className="font-heading text-xl font-bold tracking-wider tabular-nums">
                  {data.subject_score_line}
                </span>
              )}
              <button
                onClick={onClose}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {isError && (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Couldn’t load this match.
          </div>
        )}
        {data && <MatchInfo match={data} />}
        {data && <Scoreboard match={data} onOpenPlayer={openPlayer} />}
      </div>
    </div>
  )
}

/** Match-level context row: exact date/time it was played, queue, season,
 * server, length and the raw id. */
function MatchInfo({ match }: { match: MatchDetail }) {
  const rounds = match.teams[0] ? match.teams[0].rounds_won + match.teams[0].rounds_lost : 0
  const server = [match.cluster, match.region].filter(Boolean).join(' · ')
  const items: [string, string][] = [
    ['Date & time', formatDateTime(match.started_at)],
    ['Queue', match.mode || match.queue_id || '—'],
    ['Act', match.season_name || '—'],
    ['Duration', formatDuration(match.game_length_seconds)],
    ['Rounds', rounds ? String(rounds) : '—'],
    ['Server', server || '—'],
    ['Match ID', match.match_id || '—'],
  ]
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border px-5 py-3.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
          <div className="truncate text-sm font-medium" title={v}>
            {v}
          </div>
        </div>
      ))}
    </div>
  )
}

function Scoreboard({
  match,
  onOpenPlayer,
}: {
  match: MatchDetail
  onOpenPlayer: (name: string, tag: string) => void
}) {
  // Order teams so the tracked player's team shows first.
  const subjectTeam = match.players.find((p) => p.is_subject)?.team_id
  const teams = [...match.teams].sort((a) => (a.team_id === subjectTeam ? -1 : 1))
  const rankIcons = useQuery({
    queryKey: ['val-assets', 'rank-icons'],
    queryFn: fetchRankIcons,
    staleTime: Infinity,
  }).data

  return (
    <div className="max-h-[75vh] overflow-y-auto">
      {teams.map((team) => {
        const rows = match.players
          .filter((p) => p.team_id === team.team_id)
          .sort((a, b) => b.acs - a.acs)
        const partyColors = partyColorsFor(rows)
        const partySizes = new Map<string, number>()
        for (const p of rows) {
          if (!p.party_id) continue
          partySizes.set(p.party_id, (partySizes.get(p.party_id) ?? 0) + 1)
        }
        const result = outcome(team.won)
        return (
          <div key={team.team_id} className="border-t border-border first:border-t-0">
            <div
              className="flex items-center justify-between px-5 py-1.5 text-xs font-semibold tracking-wide"
              style={{
                color: result === 'win' ? WIN_COLOR : result === 'loss' ? LOSS_COLOR : undefined,
              }}
            >
              <span>
                {result === 'win' ? 'VICTORY' : result === 'loss' ? 'DEFEAT' : 'DRAW'} · Team{' '}
                {team.team_id}
              </span>
              <span>
                {team.rounds_won}–{team.rounds_lost}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-1.5 font-medium">Player</th>
                    <th className="px-2 py-1.5 text-right font-medium" title="performance rating 0–10">
                      Score
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">ACS</th>
                    <th className="px-2 py-1.5 text-right font-medium">K</th>
                    <th className="px-2 py-1.5 text-right font-medium">D</th>
                    <th className="px-2 py-1.5 text-right font-medium">A</th>
                    <th className="px-2 py-1.5 text-right font-medium" title="damage delta per round">
                      +/−
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">K/D</th>
                    <th className="px-2 py-1.5 text-right font-medium">ADR</th>
                    <th className="px-2 py-1.5 text-right font-medium">HS%</th>
                    <th className="px-2 py-1.5 text-right font-medium">KAST</th>
                    <th className="px-2 py-1.5 text-right font-medium" title="first bloods">
                      FB
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium" title="rounds with 3+ kills">
                      MK
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium" title="plants / defuses">
                      P/D
                    </th>
                    <th className="px-5 py-1.5 text-right font-medium">DMG</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <PlayerRow
                      key={p.puuid || `${p.name}${p.tag}`}
                      p={p}
                      onOpenPlayer={onOpenPlayer}
                      partyColor={p.party_id ? partyColors.get(p.party_id) : undefined}
                      partySize={p.party_id ? partySizes.get(p.party_id) ?? 0 : 0}
                      rankIcon={
                        p.tier_name
                          ? rankIcons?.byName[p.tier_name.toLowerCase()]?.small
                          : undefined
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PlayerRow({
  p,
  rankIcon,
  partyColor,
  partySize = 0,
  onOpenPlayer,
}: {
  p: MatchPlayer
  rankIcon?: string
  partyColor?: string
  partySize?: number
  onOpenPlayer: (name: string, tag: string) => void
}) {
  const delta = p.dd_delta
  const canOpen = !!(p.name && p.tag)
  return (
    <tr className={`border-t border-border/40 ${p.is_subject ? 'bg-cyan/5' : ''}`}>
      <td className="px-5 py-2">
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => onOpenPlayer(p.name, p.tag)}
          className="group flex items-center gap-2 text-left enabled:cursor-pointer"
          title={canOpen ? `View ${p.name}#${p.tag}'s tracker` : undefined}
        >
          {p.agent_image ? (
            <img src={p.agent_image} alt={p.agent} className="h-7 w-7 rounded-sm" loading="lazy" />
          ) : (
            <div className="h-7 w-7 rounded-sm bg-muted" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {partyColor && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: partyColor }}
                  aria-hidden
                />
              )}
              <span
                className={`truncate group-enabled:group-hover:underline ${
                  p.is_subject ? 'font-semibold text-cyan' : ''
                }`}
              >
                {p.name}
              </span>
              <span className="text-xs text-muted-foreground">#{p.tag}</span>
              {partyColor && (
                <span
                  className="rounded-sm px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: `${partyColor}26`, color: partyColor }}
                >
                  {partySizeLabel(partySize)}
                </span>
              )}
            </div>
            {p.tier_name && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: tierColor(p.tier_name) }}>
                {rankIcon && <img src={rankIcon} alt="" aria-hidden className="h-3.5 w-3.5" />}
                {p.tier_name}
              </span>
            )}
          </div>
        </button>
      </td>
      <td className="px-2 py-2 text-right">
        <RatingBadge value={p.rating} />
      </td>
      <td className="px-2 py-2 text-right font-medium tabular-nums">{p.acs}</td>
      <td className="px-2 py-2 text-right tabular-nums">{p.kills}</td>
      <td className="px-2 py-2 text-right tabular-nums">{p.deaths}</td>
      <td className="px-2 py-2 text-right tabular-nums">{p.assists}</td>
      <td
        className="px-2 py-2 text-right tabular-nums"
        style={{ color: delta > 0 ? WIN_COLOR : delta < 0 ? LOSS_COLOR : undefined }}
      >
        {delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{p.kd.toFixed(2)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{p.adr.toFixed(0)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{p.hs_percent}%</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {p.kast ? `${p.kast}%` : '—'}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{p.first_bloods}</td>
      <td className="px-2 py-2 text-right tabular-nums">{p.multikills}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {p.plants}/{p.defuses}
      </td>
      <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{p.damage_dealt}</td>
    </tr>
  )
}
