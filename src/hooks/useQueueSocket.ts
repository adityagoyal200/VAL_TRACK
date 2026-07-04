import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessToken, refreshAccessToken } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

/**
 * Keeps a live-queue websocket open while `enabled`, and turns server pushes
 * into TanStack Query invalidations so the visible feed / tabs refetch in real
 * time. Reconnects with backoff; on an auth rejection (code 4401) it refreshes
 * the access token before retrying. Polling on the queries stays as a fallback.
 */
export function useQueueSocket(enabled: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    let closed = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>
    let attempt = 0

    const connect = async () => {
      if (closed) return
      const token = getAccessToken() ?? (await refreshAccessToken())
      if (!token || closed) return

      ws = new WebSocket(`${WS_BASE}/ws/queue/?token=${encodeURIComponent(token)}`)

      ws.onopen = () => {
        attempt = 0
      }

      ws.onmessage = (event) => {
        let msg: { type?: string }
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        if (!msg.type || msg.type === 'connected') return
        if (msg.type === 'queue.changed') {
          queryClient.invalidateQueries({ queryKey: ['listings'] })
        } else if (msg.type.startsWith('request.')) {
          // A join request arrived / was resolved: refresh feed + both my-tabs.
          queryClient.invalidateQueries({ queryKey: ['listings'] })
          queryClient.invalidateQueries({ queryKey: ['join-requests'] })
        }
      }

      ws.onclose = async (event) => {
        ws = null
        if (closed) return
        if (event.code === 4401) await refreshAccessToken() // token likely expired
        const delay = Math.min(1000 * 2 ** attempt, 15000)
        attempt += 1
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      closed = true
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [enabled, queryClient])
}
