import { MessageCircle } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { startDiscordLogin, startGoogleLogin } from '@/lib/oauth'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75z"
      />
    </svg>
  )
}

export function LoginPage() {
  const { user, loading } = useAuth()

  if (!loading && user) {
    return <Navigate to="/queue" replace />
  }

  const handleGoogleLogin = () => void startGoogleLogin()
  const handleDiscordLogin = () => startDiscordLogin()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Valo LFG</CardTitle>
          <CardDescription>
            Find teammates you're still queuing with next month.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" size="lg" onClick={handleGoogleLogin}>
            <GoogleIcon />
            Continue with Google
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={handleDiscordLogin}
            className="text-[#5865F2] dark:text-[#5865F2]"
          >
            <MessageCircle className="size-4" />
            Continue with Discord
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
