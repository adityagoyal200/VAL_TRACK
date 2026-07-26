import { useRef, type CSSProperties, type MouseEvent } from 'react'

/**
 * The 3D hero emblem: the player's actual rank badge floating in front of a
 * spinning hex reticle, in real 3D space (preserve-3d) — it tilts toward the
 * cursor and bobs. Falls back to a faceted rank-crystal when there's no rank
 * icon (unranked). Pure CSS/transforms, renders everywhere (no WebGL).
 */
const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'

export function HeroEmblem3D({
  color = '#ff4655',
  rankIcon,
  className = '',
}: {
  color?: string
  rankIcon?: string
  className?: string
}) {
  const inner = useRef<HTMLDivElement>(null)
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    inner.current?.style.setProperty('--tilt', `rotateX(${-py * 24}deg) rotateY(${px * 24}deg)`)
  }
  const onLeave = () => inner.current?.style.setProperty('--tilt', 'rotateX(0deg) rotateY(0deg)')

  return (
    <div
      className={`relative shrink-0 [perspective:640px] ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      aria-hidden
    >
      <div
        className="animate-pulse-glow absolute inset-[6%] rounded-full"
        style={{ background: `radial-gradient(circle, ${color}70, transparent 70%)`, filter: 'blur(10px)' }}
      />
      <div
        ref={inner}
        className="relative h-full w-full [transform:var(--tilt,rotateX(0deg)_rotateY(0deg))] [transform-style:preserve-3d] transition-transform duration-200 ease-out"
      >
        {rankIcon ? <RankBadge3D color={color} rankIcon={rankIcon} /> : <Crystal color={color} />}
      </div>
    </div>
  )
}

function RankBadge3D({ color, rankIcon }: { color: string; rankIcon: string }) {
  return (
    <div className="absolute inset-0 [transform-style:preserve-3d]">
      {/* spinning hex reticle behind */}
      <div
        className="absolute inset-[3%]"
        style={{
          transform: 'translateZ(-18px)',
          clipPath: HEX,
          WebkitClipPath: HEX,
          boxShadow: `inset 0 0 0 2px ${color}66`,
          background: `radial-gradient(circle, ${color}22, transparent 68%)`,
          animation: 'spinY 9s linear infinite',
        }}
      />
      {/* counter-rotating dashed ring */}
      <div
        className="absolute inset-[18%] rounded-full"
        style={{ transform: 'translateZ(-8px)', border: `1px dashed ${color}66`, animation: 'radarSweep 8s linear infinite reverse' }}
      />
      {/* rank badge floating in front */}
      <div className="absolute inset-[6%] flex items-center justify-center" style={{ transform: 'translateZ(28px)' }}>
        <img
          src={rankIcon}
          alt=""
          className="h-full w-full object-contain"
          style={{
            filter: `drop-shadow(0 6px 12px ${color}aa) drop-shadow(0 0 10px ${color}99)`,
            animation: 'floatBob 4s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}

function Crystal({ color }: { color: string }) {
  const SLICES = 9
  const mid = (SLICES - 1) / 2
  return (
    <div className="h-full w-full [transform-style:preserve-3d]" style={{ animation: 'spinY 8s linear infinite' }}>
      {Array.from({ length: SLICES }).map((_, i) => {
        const depth = (i - mid) * 2.4
        const t = 1 - Math.abs(i - mid) / SLICES
        const isFace = i === Math.round(mid)
        const style: CSSProperties = {
          transform: `translateZ(${depth}px)`,
          clipPath: HEX,
          WebkitClipPath: HEX,
          background: isFace
            ? `radial-gradient(circle at 38% 32%, #fff8, ${color} 30%, ${color}22 72%, #0a0c10)`
            : `${color}26`,
          boxShadow: `inset 0 0 0 1px ${color}${isFace ? 'cc' : '66'}`,
          opacity: 0.35 + t * 0.65,
        }
        return <div key={i} className="absolute inset-0" style={style} />
      })}
    </div>
  )
}
