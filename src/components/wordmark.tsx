import { cn } from '@/lib/utils'

/** Angular tactical brand mark + wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="size-7 text-primary" aria-hidden>
        <path fill="currentColor" d="M3 4h9l7.5 15-4.5 9z" />
        <path fill="currentColor" opacity="0.55" d="M21 4h8L18 28h-2z" />
      </svg>
      <span className="font-heading text-lg font-bold uppercase tracking-wide">
        Valo<span className="text-primary">/</span>LFG
      </span>
    </div>
  )
}
