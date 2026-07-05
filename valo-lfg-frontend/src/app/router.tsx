import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'
import { GoogleCallbackPage } from '@/features/auth/GoogleCallbackPage'
import { DiscordCallbackPage } from '@/features/auth/DiscordCallbackPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { ProfileSettingsPage } from '@/features/profile/ProfileSettingsPage'
import { RiotLinkPage } from '@/features/riot/RiotLinkPage'
import { LiveQueuePage } from '@/features/queue/LiveQueuePage'
import { TrackerPage, PublicTrackerPage } from '@/features/tracker/TrackerPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
      <Route path="/auth/discord/callback" element={<DiscordCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<OnboardingWizard />} />
        <Route path="/queue" element={<LiveQueuePage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="/tracker/:name/:tag" element={<PublicTrackerPage />} />
        <Route path="/settings" element={<ProfileSettingsPage />} />
        <Route path="/riot-link" element={<RiotLinkPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
