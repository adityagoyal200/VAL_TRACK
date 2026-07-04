import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  discordCallback,
  googleCallback,
  linkDiscord,
  linkGoogle,
} from '@/api/auth'
import { consumeCallbackParams, consumeLinkMode, redirectUriFor } from '@/lib/oauth'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

/** Shared logic for the OAuth callback pages. Runs exactly once (guarded
 * against StrictMode double-effects, since the authorization code is
 * single-use). Handles both login and settings-page "connect account" mode. */
export function useOAuthCallback(provider: 'google' | 'discord') {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const navigate = useNavigate()
  const { onLogin, refreshUser } = useAuth()

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const isLink = consumeLinkMode(provider)
        const { code, verifier } = consumeCallbackParams(provider)
        const redirectUri = redirectUriFor(provider)

        if (isLink) {
          if (provider === 'google') {
            await linkGoogle(code, redirectUri, verifier ?? '')
          } else {
            await linkDiscord(code, redirectUri)
          }
          await refreshUser()
          navigate('/settings', { replace: true })
          return
        }

        const result =
          provider === 'google'
            ? await googleCallback(code, redirectUri, verifier ?? '')
            : await discordCallback(code, redirectUri)
        onLogin(result.access, result.user)
        navigate('/queue', { replace: true })
      } catch (e) {
        if (e instanceof ApiError && typeof (e.data as { detail?: string })?.detail === 'string') {
          setError((e.data as { detail: string }).detail)
        } else {
          setError(e instanceof Error ? e.message : 'Login failed.')
        }
      }
    })()
  }, [provider, navigate, onLogin, refreshUser])

  return { error }
}
