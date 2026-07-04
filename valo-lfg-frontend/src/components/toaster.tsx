import { createPortal } from 'react-dom'
import { Bell, Check, UserRoundMinus, UserRoundPlus, X } from 'lucide-react'
import {
  dismissToast,
  useToasts,
  type Toast,
  type ToastIcon,
  type ToastKind,
} from '@/lib/toast'

const ICONS: Record<ToastIcon, typeof Bell> = {
  bell: Bell,
  check: Check,
  x: X,
  'user-plus': UserRoundPlus,
  'user-minus': UserRoundMinus,
}

const DEFAULT_ICON: Record<ToastKind, ToastIcon> = {
  success: 'check',
  info: 'bell',
  warn: 'bell',
  muted: 'x',
}

// Per-kind accent: the left rail + icon color, matching the tactical palette.
const ACCENT: Record<ToastKind, string> = {
  success: 'border-l-cyan text-cyan',
  info: 'border-l-primary text-primary',
  warn: 'border-l-amber-500 text-amber-400',
  muted: 'border-l-muted-foreground/50 text-muted-foreground',
}

function ToastCard({ toast }: { toast: Toast }) {
  const Icon = ICONS[toast.icon ?? DEFAULT_ICON[toast.kind]]
  return (
    <div
      role="status"
      className={
        'animate-rise pointer-events-auto flex items-start gap-3 rounded-md border border-l-2 ' +
        'bg-card/95 p-3 pr-2 shadow-xl backdrop-blur clip-bevel-sm ' +
        ACCENT[toast.kind]
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm leading-tight tracking-wide text-foreground">
          {toast.title}
        </p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissToast(toast.id)}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** Fixed, stacked toast viewport. Mounted once, driven by the toast store. */
export function Toaster() {
  const toasts = useToasts()
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  )
}
