import { useEffect, useRef, useState } from 'react'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_[]#*'

/**
 * Decodes `text` from random characters into place on mount — a tactical
 * "decrypt" reveal. `delayMs` staggers the start; honors reduced-motion.
 */
export function ScrambleText({
  text,
  className,
  delayMs = 0,
}: {
  text: string
  className?: string
  delayMs?: number
}) {
  const [display, setDisplay] = useState(text)
  const raf = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(text)
      return
    }
    const startFrame = Math.round(delayMs / 16)
    // Each char scrambles for a stretch, then locks, staggered left-to-right.
    const plan = text.split('').map((ch, i) => ({
      ch,
      start: startFrame + i * 2,
      end: startFrame + i * 2 + 14,
    }))

    let frame = 0
    const tick = () => {
      let out = ''
      let locked = 0
      for (const p of plan) {
        if (p.ch === ' ') {
          out += ' '
          locked++
        } else if (frame >= p.end) {
          out += p.ch
          locked++
        } else if (frame >= p.start) {
          out += CHARS[Math.floor(Math.random() * CHARS.length)]
        }
      }
      setDisplay(out)
      if (locked < plan.length) {
        frame++
        raf.current = requestAnimationFrame(tick)
      }
    }
    tick()
    return () => cancelAnimationFrame(raf.current)
  }, [text, delayMs])

  return (
    <span className={className} aria-label={text}>
      {display}
    </span>
  )
}
