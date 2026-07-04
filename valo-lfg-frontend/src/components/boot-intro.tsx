import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Wordmark } from './wordmark'

const LINES = [
  'INITIALIZING CORE',
  'ESTABLISHING UPLINK',
  'SYNCING RANK DATA',
  'AUTHENTICATING AGENT',
]

/** One-time tactical boot sequence that wipes away to reveal the app. */
export function BootIntro() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    if (sessionStorage.getItem('booted') === '1') return false
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (!show) return
    document.body.style.overflow = 'hidden'
    const lineTimer = setInterval(
      () => setLine((l) => Math.min(l + 1, LINES.length - 1)),
      380,
    )
    const done = setTimeout(() => {
      sessionStorage.setItem('booted', '1')
      setShow(false)
    }, 1900)
    return () => {
      clearInterval(lineTimer)
      clearTimeout(done)
      document.body.style.overflow = ''
    }
  }, [show])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-background"
          exit={{ y: '-100%' }}
          transition={{ duration: 0.7, ease: [0.7, 0, 0.3, 1] }}
        >
          <div className="tactical-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          <div className="relative flex flex-col items-center gap-6">
            <Wordmark className="scale-125" />
            <div className="h-px w-56 overflow-hidden bg-border">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.7, ease: 'easeInOut' }}
              />
            </div>
            <div className="font-heading text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-primary">//</span> {LINES[line]}
              <span className="ml-0.5 animate-pulse">_</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
