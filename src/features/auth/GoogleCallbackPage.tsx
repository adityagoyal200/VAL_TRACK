export function GoogleCallbackPage() {
  // TODO(M1): read ?code= from the URL, POST to /api/auth/google/callback/,
  // store the JWT pair, redirect to /onboarding or /queue.
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Signing you in with Google…
    </div>
  )
}
