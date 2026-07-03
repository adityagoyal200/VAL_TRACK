import { Link } from 'react-router-dom'
import { useOAuthCallback } from './useOAuthCallback'

export function DiscordCallbackPage() {
  const { error } = useOAuthCallback('discord')

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-destructive">{error}</p>
        <Link to="/login" className="text-sm underline">
          Back to login
        </Link>
      </div>
    )
  }
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Signing you in with Discord…
    </div>
  )
}
