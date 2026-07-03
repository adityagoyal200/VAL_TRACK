import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }

  const atOnboarding = location.pathname === '/onboarding'
  if (!user.onboarding_completed && !atOnboarding) {
    return <Navigate to="/onboarding" replace />
  }
  if (user.onboarding_completed && atOnboarding) {
    return <Navigate to="/queue" replace />
  }
  return <Outlet />
}
