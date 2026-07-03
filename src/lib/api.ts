const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, data: unknown) {
    super(`API error ${status}`)
    this.status = status
    this.data = data
  }
}

async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include', // sends/receives the httpOnly refresh cookie
  })
}

/** POST /api/auth/token/refresh/ using the httpOnly cookie. Returns the new
 * access token, or null if the session is gone. */
export async function refreshAccessToken(): Promise<string | null> {
  const resp = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!resp.ok) return null
  const data = (await resp.json()) as { access: string }
  accessToken = data.access
  return data.access
}

/** Fetch wrapper: JSON in/out, attaches the access token, and on a 401
 * silently refreshes once and retries. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let resp = await rawFetch(path, init)
  if (resp.status === 401 && (await refreshAccessToken())) {
    resp = await rawFetch(path, init)
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new ApiError(resp.status, data)
  }
  if (resp.status === 204 || resp.status === 205) return undefined as T
  return (await resp.json()) as T
}
