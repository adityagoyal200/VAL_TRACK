import { useSyncExternalStore } from 'react'

/** Accent/severity of a toast — maps to a color + default icon in <Toaster>. */
export type ToastKind = 'success' | 'info' | 'warn' | 'muted'

/** Icon key, resolved to a lucide icon in the viewport so this stays pure data. */
export type ToastIcon = 'bell' | 'check' | 'x' | 'user-plus' | 'user-minus'

export type Toast = {
  id: number
  kind: ToastKind
  title: string
  description?: string
  icon?: ToastIcon
  /** Auto-dismiss delay in ms; `Infinity` to keep it until dismissed. */
  duration: number
}

export type ToastInput = Omit<Toast, 'id' | 'duration'> & { duration?: number }

const DEFAULT_DURATION = 6000
const MAX_VISIBLE = 4

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/**
 * Queue a toast from anywhere — components or plain modules like the queue
 * websocket hook. Returns the toast id so callers can dismiss it early.
 */
export function pushToast(input: ToastInput): number {
  const id = nextId++
  const toast: Toast = { duration: DEFAULT_DURATION, ...input, id }
  // Keep only the newest few so a burst of events can't bury the screen.
  toasts = [...toasts, toast].slice(-MAX_VISIBLE)
  emit()
  if (Number.isFinite(toast.duration)) {
    setTimeout(() => dismissToast(id), toast.duration)
  }
  return id
}

export function dismissToast(id: number) {
  const next = toasts.filter((t) => t.id !== id)
  if (next.length !== toasts.length) {
    toasts = next
    emit()
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

const getSnapshot = () => toasts

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
