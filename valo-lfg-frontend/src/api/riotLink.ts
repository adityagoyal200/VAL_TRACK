import { apiFetch } from '@/lib/api'
import type { RiotIdInput, RiotLinkStatus } from '@/schemas/riotLink.schema'

/** GET current link status. Backend returns {status: "none"} when unlinked. */
export function getRiotLinkStatus() {
  return apiFetch<RiotLinkStatus>('/api/riot-link/status/')
}

/** POST a Riot ID to open a 10-minute play-a-match verification window. */
export function createRiotLink(input: RiotIdInput) {
  return apiFetch<RiotLinkStatus>('/api/riot-link/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Multipart screenshot upload — moves the link into manual_review. */
export function submitManualReview(screenshot: File) {
  const body = new FormData()
  body.append('screenshot', screenshot)
  return apiFetch<RiotLinkStatus>('/api/riot-link/manual-review/', {
    method: 'POST',
    body,
  })
}

/** Re-pull MMR for a verified account (backend rate-limits to 1/hour). */
export function refreshRank() {
  return apiFetch<RiotLinkStatus>('/api/riot-link/refresh-rank/', { method: 'POST' })
}

/** DELETE the link entirely so the user can start over. */
export function unlinkRiot() {
  return apiFetch<void>('/api/riot-link/', { method: 'DELETE' })
}
