import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'

const INTERACTIVE = 'a,button,[role="button"],input,textarea,select,label,summary,[data-cursor]'

/**
 * Valorant-style crosshair replacing the native cursor on fine-pointer devices.
 * Trails with spring physics and expands + rotates over interactive elements.
 */
export function CrosshairCursor() {
  const [enabled, setEnabled] = useState(false)
  const [active, setActive] = useState(false)
  const [down, setDown] = useState(false)

  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const sx = useSpring(x, { stiffness: 550, damping: 40, mass: 0.25 })
  const sy = useSpring(y, { stiffness: 550, damping: 40, mass: 0.25 })

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    setEnabled(true)
    document.documentElement.classList.add('custom-cursor')

    const move = (e: PointerEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
    }
    const over = (e: Event) => {
      const el = e.target as Element | null
      setActive(!!el?.closest?.(INTERACTIVE))
    }
    const dn = () => setDown(true)
    const up = () => setDown(false)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerover', over)
    window.addEventListener('pointerdown', dn)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', dn)
      window.removeEventListener('pointerup', up)
      document.documentElement.classList.remove('custom-cursor')
    }
  }, [x, y])

  if (!enabled) return null

  return (
    <motion.div
      style={{ x: sx, y: sy }}
      className="pointer-events-none fixed left-0 top-0 z-[60]"
    >
      <motion.svg
        viewBox="0 0 40 40"
        width="40"
        height="40"
        className="absolute -translate-x-1/2 -translate-y-1/2 text-primary"
        animate={{ scale: (active ? 1.5 : 1) * (down ? 0.85 : 1), rotate: active ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      >
        {/* four ticks + center dot */}
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="square">
          <line x1="20" y1="3" x2="20" y2="11" />
          <line x1="20" y1="29" x2="20" y2="37" />
          <line x1="3" y1="20" x2="11" y2="20" />
          <line x1="29" y1="20" x2="37" y2="20" />
        </g>
        <circle cx="20" cy="20" r="1.6" fill="currentColor" />
      </motion.svg>
    </motion.div>
  )
}
