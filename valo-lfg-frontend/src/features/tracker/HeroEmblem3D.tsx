import { useRef, type CSSProperties, type MouseEvent } from 'react'

/**
 * The 3D hero emblem — a faceted rank crystal built from stacked hexagon slices
 * in real 3D space (preserve-3d), auto-spinning around Y and tilting toward the
 * cursor. Pure CSS/transforms so it renders everywhere (no WebGL dependency),
 * lit in the player's rank colour.
 */
const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
const SLICES = 9

export function HeroEmblem3D({ color = '#ff4655', className = '' }: { color?: string; className?: string }) {
  const inner = useRef<HTMLDivElement>(null)

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - el.left) / el.width - 0.5
    const py = (e.clientY - el.top) / el.height - 0.5
    if (inner.current) inner.current.style.setProperty('--tilt', `rotateX(${-py * 26}deg) rotateY(${px * 26}deg)`)
  }
  const onLeave = () => inner.current?.style.setProperty('--tilt', 'rotateX(0deg) rotateY(0deg)')

  const mid = (SLICES - 1) / 2
  return (
    <div
      className={`relative shrink-0 [perspective:640px] ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      aria-hidden
    >
      {/* ambient glow */}
      <div
        className="animate-pulse-glow absolute inset-[12%] rounded-full"
        style={{ background: `radial-gradient(circle, ${color}66, transparent 70%)`, filter: 'blur(10px)' }}
      />
      <div
        ref={inner}
        className="relative h-full w-full [transform:var(--tilt,rotateX(0deg)_rotateY(0deg))] [transform-style:preserve-3d] transition-transform duration-200 ease-out"
      >
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
      </div>
    </div>
  )
}
