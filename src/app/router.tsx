import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'
import { GoogleCallbackPage } from '@/features/auth/GoogleCallbackPage'
import { DiscordCallbackPage } from '@/features/auth/DiscordCallbackPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { LiveQueuePage } from '@/features/queue/LiveQueuePage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
      <Route path="/auth/discord/callback" element={<DiscordCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/queue" element={<LiveQueuePage />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
