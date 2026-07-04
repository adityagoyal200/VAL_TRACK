import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchMe, logout as apiLogout, type User } from '@/api/auth'
import { refreshAccessToken, setAccessToken } from '@/lib/api'

interface AuthContextValue {
  user: User | null
  /** true while the initial silent-refresh attempt is in flight */
  loading: boolean
  /** called by the OAuth callback pages after a successful code exchange */
  onLogin: (access: string, user: User) => void
  /** re-fetches /me, e.g. after onboarding completes */
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On first load, try to resume the session from the refresh cookie.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const access = await refreshAccessToken()
      if (access && !cancelled) {
        try {
          setUser(await fetchMe())
        } catch {
          setAccessToken(null)
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onLogin = useCallback((access: string, nextUser: User) => {
    setAccessToken(access)
    setUser(nextUser)
  }, [])

  const refreshUser = useCallback(async () => {
    setUser(await fetchMe())
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, onLogin, refreshUser, logout }),
    [user, loading, onLogin, refreshUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
