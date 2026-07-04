import type { ReactNode } from 'react'
import { Check, ChevronRight, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { startDiscordLogin, startGoogleLogin } from '@/lib/oauth'
import { useAuth } from '@/hooks/useAuth'
import { Wordmark } from '@/components/wordmark'
import { TiltCard } from '@/components/tilt-card'
import { ScrambleText } from '@/components/scramble-text'
import { Magnetic } from '@/components/magnetic'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5">
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

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="#5865F2">
      <path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.9a.07.07 0 0 0-.08.03c-.2.38-.44.87-.6 1.25a18.3 18.3 0 0 0-5.44 0 12 12 0 0 0-.62-1.25.08.08 0 0 0-.08-.03A19.7 19.7 0 0 0 3.66 4.37a.07.07 0 0 0-.03.03C.53 9.02-.32 13.55.1 18.02a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.29 1.23-1.99a.08.08 0 0 0-.04-.11 13 13 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6.01-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.54-13.62a.06.06 0 0 0-.03-.03zM8.02 15.3c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z" />
    </svg>
  )
}

function ProviderButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group clip-bevel-sm relative flex h-12 w-full items-center gap-3 border border-border bg-secondary/40 px-4 text-sm font-medium transition-all hover:border-primary/60 hover:bg-secondary"
    >
      {icon}
      <span>{label}</span>
      <ChevronRight className="ml-auto size-4 -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
    </button>
  )
}

const FEATURES = ['Verified ranks', 'Schedule matching', 'Role & comms fit', 'No add-and-ghost']

export function LoginPage() {
  const { user, loading } = useAuth()

  if (!loading && user) {
    return <Navigate to="/queue" replace />
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="tactical-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6">
        <header className="flex items-center justify-between py-6">
          <Wordmark />
          <span className="font-heading text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">
            v1 · closed beta
          </span>
        </header>

        <main className="grid flex-1 items-center gap-12 pb-16 lg:grid-cols-2">
          {/* Hero copy */}
          <div className="animate-rise">
            <div className="clip-bevel-sm mb-6 inline-flex items-center gap-2 border border-cyan/30 bg-cyan/5 px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.15em] text-cyan">
              <span className="size-1.5 animate-pulse rounded-full bg-cyan" />
              Verified accounts · No fake Immortals
            </div>

            <h1 className="font-heading text-5xl font-bold uppercase leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl">
              <ScrambleText text="Stop queuing" />
              <br />
              <ScrambleText text="with " delayMs={220} />
              <span className="text-primary text-glow-red">
                <ScrambleText text="randoms." delayMs={360} />
              </span>
            </h1>

            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              Find teammates you're still running it back with next month — matched
              on rank, role, schedule, and comms. Every account verified.
            </p>

            <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground/90">
                  <span className="clip-bevel-sm flex size-5 items-center justify-center bg-primary/15 text-primary">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Auth card */}
          <div className="w-full max-w-sm animate-rise [animation-delay:150ms] lg:justify-self-end">
            <TiltCard
              className="clip-bevel glow-red tactical-sheen border border-border/80 bg-card/80 p-8 backdrop-blur-sm"
              max={7}
            >
              <span className="absolute right-0 top-0 size-3.5 bg-primary" />
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                // Access
              </p>
              <h2 className="mt-2 font-heading text-2xl font-bold uppercase tracking-wide">
                Sign in
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a provider to enter the queue.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <Magnetic strength={0.25} className="w-full">
                  <ProviderButton
                    icon={<GoogleIcon />}
                    label="Continue with Google"
                    onClick={() => void startGoogleLogin()}
                  />
                </Magnetic>
                <Magnetic strength={0.25} className="w-full">
                  <ProviderButton
                    icon={<DiscordIcon />}
                    label="Continue with Discord"
                    onClick={() => startDiscordLogin()}
                  />
                </Magnetic>
              </div>

              <p className="mt-6 flex items-start gap-2 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-px size-4 shrink-0 text-cyan" />
                No Riot password required. We verify ownership by watching you play a
                live match.
              </p>
            </TiltCard>
          </div>
        </main>

        <footer className="flex items-center justify-between py-6 text-xs text-muted-foreground/60">
          <span>© 2026 Valo LFG</span>
          <span>Not affiliated with Riot Games</span>
        </footer>
      </div>
    </div>
  )
}
