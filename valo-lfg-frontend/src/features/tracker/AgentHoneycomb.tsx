import type { CSSProperties } from 'react'
import type { AgentStat } from '@/api/tracker'
import { RatingBadge } from './RatingBadge'
import { WIN_COLOR, LOSS_COLOR } from './lib'

/**
 * Agents as an interlocking hexagon honeycomb instead of a table — art-filled
 * tiles, coloured/glowing by win rate, that lift and reveal full stats on
 * hover. A navigation metaphor a plain tracker doesn't have.
 */
const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
const W = 118
const H = 136
const PER_ROW = 5

export function AgentHoneycomb({ agents }: { agents: AgentStat[] }) {
  if (agents.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">No agent data yet.</p>

  const rows: AgentStat[][] = []
  for (let i = 0; i < agents.length; i += PER_ROW) rows.push(agents.slice(i, i + PER_ROW))

  return (
    <div className="animate-rise flex flex-col items-center overflow-hidden py-6">
      {rows.map((row, r) => (
        <div
          key={r}
          className="flex"
          style={{ gap: 10, marginTop: r === 0 ? 0 : -H * 0.24, marginLeft: r % 2 === 1 ? (W + 10) / 2 : 0 }}
        >
          {row.map((a, i) => (
            <Hex key={a.agent} a={a} idx={r * PER_ROW + i} />
          ))}
        </div>
      ))}
      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        Hexes glow by win rate · hover for the full line
      </p>
    </div>
  )
}

function Hex({ a, idx }: { a: AgentStat; idx: number }) {
  const good = a.win_rate >= 50
  const color = good ? WIN_COLOR : LOSS_COLOR
  const hexStyle: CSSProperties = { clipPath: HEX, WebkitClipPath: HEX }
  return (
    <button
      className="group animate-pop relative shrink-0 transition-transform duration-200 hover:z-10 hover:scale-[1.12]"
      style={{ width: W, height: H, '--i': idx % PER_ROW } as CSSProperties}
      title={`${a.agent} · ${a.games} games · ${a.win_rate}% · ${a.kd.toFixed(2)} K/D · ${a.avg_acs} ACS`}
    >
      {/* glow (clip-aware via filter) */}
      <div
        className="absolute inset-0 opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{ ...hexStyle, background: color, filter: 'blur(9px)' }}
        aria-hidden
      />
      {/* base + art */}
      <div className="absolute inset-[3px]" style={{ ...hexStyle, background: '#0c0e13' }} aria-hidden />
      {a.agent_image && (
        <img
          src={a.agent_image}
          alt={a.agent}
          loading="lazy"
          className="absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] object-cover opacity-85 transition-all duration-200 group-hover:scale-105 group-hover:opacity-100"
          style={hexStyle}
        />
      )}
      {/* inner edge + bottom scrim */}
      <div
        className="absolute inset-[3px]"
        style={{ ...hexStyle, boxShadow: `inset 0 0 0 2px ${color}99`, background: `linear-gradient(to top, #0b0d12ee 6%, ${color}18 34%, transparent 60%)` }}
        aria-hidden
      />
      {/* rank pip */}
      <span
        className="absolute left-1/2 top-[14%] flex h-5 w-5 -translate-x-1/2 items-center justify-center font-heading text-[10px] font-bold tabular-nums"
        style={{ color, textShadow: `0 0 8px ${color}` }}
      >
        {idx + 1}
      </span>
      {/* label */}
      <div className="absolute inset-x-0 bottom-[16%] flex flex-col items-center gap-0.5">
        <span className="font-heading text-[11px] font-bold uppercase tracking-wide text-foreground [text-shadow:0_1px_3px_#000]">
          {a.agent}
        </span>
        <span className="font-heading text-sm font-bold tabular-nums" style={{ color, textShadow: `0 0 10px ${color}66` }}>
          {a.win_rate}%
        </span>
      </div>
      {/* hover detail overlay */}
      <div
        className="absolute inset-[3px] flex flex-col items-center justify-center gap-1 bg-black/72 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100"
        style={hexStyle}
      >
        <RatingBadge value={a.avg_rating} showGrade />
        <div className="mt-0.5 text-center text-[10px] leading-tight text-foreground/90">
          {a.games} games
          <br />
          {a.kd.toFixed(2)} K/D · {a.avg_acs} ACS
          <br />
          {a.hs_percent}% HS
        </div>
      </div>
    </button>
  )
}
