import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200',
        selected
          ? 'border-primary/70 bg-primary text-primary-foreground shadow-[0_0_16px_-3px_var(--primary)]'
          : 'border-border bg-white/[0.03] text-muted-foreground backdrop-blur-sm hover:border-white/25 hover:bg-white/[0.08] hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
