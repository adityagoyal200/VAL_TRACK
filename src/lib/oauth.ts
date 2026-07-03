const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const DISCORD_AUTH_URL = 'https://discord.com/oauth2/authorize'

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

export function redirectUriFor(provider: 'google' | 'discord'): string {
  return `${window.location.origin}/auth/${provider}/callback`
}

/** Builds the Google consent URL (PKCE + state), stashing verifier/state in
 * sessionStorage for the callback page. */
export async function startGoogleLogin(): Promise<void> {
  const verifier = randomString(48)
  const state = randomString(16)
  sessionStorage.setItem('oauth_google_verifier', verifier)
  sessionStorage.setItem('oauth_google_state', state)

  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUriFor('google'),
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: await sha256Challenge(verifier),
    code_challenge_method: 'S256',
    state,
  })
  window.location.assign(`${GOOGLE_AUTH_URL}?${params}`)
}

export function startDiscordLogin(): void {
  const state = randomString(16)
  sessionStorage.setItem('oauth_discord_state', state)

  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    redirect_uri: redirectUriFor('discord'),
    response_type: 'code',
    scope: 'identify email',
    state,
  })
  window.location.assign(`${DISCORD_AUTH_URL}?${params}`)
}

/** Validates state and returns the code + stashed PKCE verifier (Google only).
 * Throws if the callback URL is malformed or state doesn't match. */
export function consumeCallbackParams(provider: 'google' | 'discord'): {
  code: string
  verifier: string | null
} {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const expectedState = sessionStorage.getItem(`oauth_${provider}_state`)
  sessionStorage.removeItem(`oauth_${provider}_state`)

  if (!code) throw new Error(params.get('error') ?? 'Missing authorization code.')
  if (!state || state !== expectedState) throw new Error('State mismatch — try again.')

  const verifier = sessionStorage.getItem(`oauth_${provider}_verifier`)
  sessionStorage.removeItem(`oauth_${provider}_verifier`)
  return { code, verifier }
}
