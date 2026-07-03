import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { discordCallback, googleCallback } from '@/api/auth'
import { consumeCallbackParams, redirectUriFor } from '@/lib/oauth'
import { useAuth } from '@/hooks/useAuth'

/** Shared logic for the OAuth callback pages: exchanges the code with the
 * backend exactly once (guarded against StrictMode double-effects, since the
 * authorization code is single-use) and redirects on success. */
export function useOAuthCallback(provider: 'google' | 'discord') {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const navigate = useNavigate()
  const { onLogin } = useAuth()

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const { code, verifier } = consumeCallbackParams(provider)
        const redirectUri = redirectUriFor(provider)
        const result =
          provider === 'google'
            ? await googleCallback(code, redirectUri, verifier ?? '')
            : await discordCallback(code, redirectUri)
        onLogin(result.access, result.user)
        navigate('/queue', { replace: true })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Login failed.')
      }
    })()
  }, [provider, navigate, onLogin])

  return { error }
}
