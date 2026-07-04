import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Clock, Loader2, RefreshCw } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import {
  createRiotLink,
  getRiotLinkStatus,
  refreshRank,
  submitManualReview,
  unlinkRiot,
} from '@/api/riotLink'
import {
  rankLabel,
  riotIdSchema,
  type RiotIdInput,
  type RiotLinkStatus,
} from '@/schemas/riotLink.schema'

const QUERY_KEY = ['riotLink']
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = (error.data as { detail?: string } | null)?.detail
    if (detail) return detail
  }
  return fallback
}

function riotId(link: RiotLinkStatus): string {
  return `${link.riot_game_name}#${link.riot_tag_line}`
}

export function RiotLinkPage() {
  const queryClient = useQueryClient()

  const statusQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getRiotLinkStatus,
    // Poll only while a verification window is open; idle otherwise.
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 8000 : false,
  })

  const setStatus = (data: RiotLinkStatus) => queryClient.setQueryData(QUERY_KEY, data)

  const link = statusQuery.data

  if (statusQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (statusQuery.isError || !link) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>Couldn't load your Riot link status.</p>
        <Button variant="outline" size="sm" onClick={() => statusQuery.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link to="/settings" />}>
          <ArrowLeft />
        </Button>
        <h1 className="text-2xl font-semibold">Link your Riot account</h1>
      </div>

      {link.status === 'verified' ? (
        <VerifiedCard link={link} onChange={setStatus} />
      ) : link.status === 'pending' ? (
        <PendingCard link={link} onChange={setStatus} refetch={statusQuery.refetch} />
      ) : link.status === 'manual_review' ? (
        <ManualReviewPendingCard link={link} onChange={setStatus} />
      ) : (
        <LinkFormCard link={link} onChange={setStatus} />
      )}
    </div>
  )
}

/** none / expired / rejected — collect a Riot ID and open a new window. */
function LinkFormCard({
  link,
  onChange,
}: {
  link: RiotLinkStatus
  onChange: (data: RiotLinkStatus) => void
}) {
  const form = useForm<RiotIdInput>({
    resolver: zodResolver(riotIdSchema),
    defaultValues: {
      riot_game_name: link.riot_game_name ?? '',
      riot_tag_line: link.riot_tag_line ?? '',
    },
  })

  const createMutation = useMutation({
    mutationFn: createRiotLink,
    onSuccess: onChange,
  })

  const onSubmit = form.handleSubmit((values) => createMutation.mutate(values))

  const notice =
    link.status === 'expired'
      ? 'No match was detected in your last window. Start again when you can hop into a game.'
      : link.status === 'rejected'
        ? 'Your screenshot review was rejected. You can try linking again.'
        : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prove it's your account</CardTitle>
        <CardDescription>
          Enter your Riot ID, then play any match (any mode) within 10 minutes — we
          detect it automatically. No password or Riot login needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notice && (
          <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="riot_game_name" className="mb-2 block">
                Game name
              </Label>
              <Input
                id="riot_game_name"
                placeholder="TenZ"
                autoComplete="off"
                {...form.register('riot_game_name')}
              />
            </div>
            <span className="pb-2 text-lg text-muted-foreground">#</span>
            <div className="w-28">
              <Label htmlFor="riot_tag_line" className="mb-2 block">
                Tag
              </Label>
              <Input
                id="riot_tag_line"
                placeholder="NA1"
                autoComplete="off"
                {...form.register('riot_tag_line')}
              />
            </div>
          </div>
          {(form.formState.errors.riot_game_name ||
            form.formState.errors.riot_tag_line) && (
            <p className="text-sm text-destructive">
              {form.formState.errors.riot_game_name?.message ??
                form.formState.errors.riot_tag_line?.message}
            </p>
          )}
          {createMutation.isError && (
            <p className="text-sm text-destructive">
              {apiErrorMessage(
                createMutation.error,
                "Couldn't reach the rank provider. Try again.",
              )}
            </p>
          )}
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Starting…' : 'Start verification'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** pending — live countdown, poll for the match, plus screenshot fallback. */
function PendingCard({
  link,
  onChange,
  refetch,
}: {
  link: RiotLinkStatus
  onChange: (data: RiotLinkStatus) => void
  refetch: () => void
}) {
  const secondsLeft = useCountdown(link.verification_seconds_remaining ?? 0)

  // When the local timer reaches zero, ask the server for the final verdict.
  const firedRef = useRef(false)
  useEffect(() => {
    if (secondsLeft === 0 && !firedRef.current) {
      firedRef.current = true
      refetch()
    }
  }, [secondsLeft, refetch])

  const cancelMutation = useMutation({
    mutationFn: unlinkRiot,
    onSuccess: () => onChange({ status: 'none' }),
  })

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5 text-primary" />
          Waiting for your match
        </CardTitle>
        <CardDescription>
          Verifying <span className="font-medium text-foreground">{riotId(link)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-1 py-2">
          <span className="font-mono text-5xl tabular-nums">
            {mm}:{ss}
          </span>
          <span className="flex items-center gap-1.5 text-center text-sm text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            {secondsLeft > 0
              ? 'Watching for a completed match…'
              : "Time's up on the clock — still checking, since matches can take a few minutes to show up."}
          </span>
        </div>

        <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>1. Open VALORANT and start any match — Deathmatch or Swiftplay is fastest.</li>
          <li>2. Finish the match (or leave once it's registered).</li>
          <li>3. We detect it and verify you automatically — no need to stay on this page.</li>
        </ol>

        <ManualReviewUploader link={link} onChange={onChange} />

        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
        >
          Cancel verification
        </Button>
      </CardContent>
    </Card>
  )
}

/** verified — show rank, allow a rate-limited refresh, or unlink. */
function VerifiedCard({
  link,
  onChange,
}: {
  link: RiotLinkStatus
  onChange: (data: RiotLinkStatus) => void
}) {
  const refreshMutation = useMutation({
    mutationFn: refreshRank,
    onSuccess: onChange,
  })
  const unlinkMutation = useMutation({
    mutationFn: unlinkRiot,
    onSuccess: () => onChange({ status: 'none' }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="size-5 text-emerald-500" />
          Verified
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{riotId(link)}</span>
          {link.region && (
            <span className="ml-2 uppercase text-muted-foreground">{link.region}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Current rank"
            value={rankLabel(link.current_tier, link.current_division)}
          />
          <Stat
            label="RR"
            value={link.current_rr != null ? `${link.current_rr}` : '—'}
          />
          <Stat label="Peak" value={rankLabel(link.peak_tier, link.peak_division)} />
        </div>
        {link.account_level != null && (
          <p className="text-sm text-muted-foreground">
            Account level {link.account_level}
          </p>
        )}

        {refreshMutation.isError && (
          <p className="text-sm text-destructive">
            {apiErrorMessage(refreshMutation.error, "Couldn't refresh right now.")}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw
              className={refreshMutation.isPending ? 'animate-spin' : undefined}
            />
            Refresh rank
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => unlinkMutation.mutate()}
            disabled={unlinkMutation.isPending}
          >
            Unlink
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** manual_review — screenshot submitted, awaiting a moderator. */
function ManualReviewPendingCard({
  link,
  onChange,
}: {
  link: RiotLinkStatus
  onChange: (data: RiotLinkStatus) => void
}) {
  const unlinkMutation = useMutation({
    mutationFn: unlinkRiot,
    onSuccess: () => onChange({ status: 'none' }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Under review</CardTitle>
        <CardDescription>
          We got your screenshot for{' '}
          <span className="font-medium text-foreground">{riotId(link)}</span>. A
          moderator will confirm it soon — check back later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => unlinkMutation.mutate()}
          disabled={unlinkMutation.isPending}
        >
          Cancel and start over
        </Button>
      </CardContent>
    </Card>
  )
}

function ManualReviewUploader({
  link,
  onChange,
}: {
  link: RiotLinkStatus
  onChange: (data: RiotLinkStatus) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: submitManualReview,
    onSuccess: onChange,
  })

  const pick = (selected: File | undefined) => {
    setLocalError(null)
    if (!selected) return
    if (selected.size > MAX_SCREENSHOT_BYTES) {
      setLocalError('Screenshot must be under 5 MB.')
      return
    }
    setFile(selected)
  }

  return (
    <details className="rounded-md border px-3 py-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        Can't play right now? Upload a screenshot instead
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-muted-foreground">
          Upload a screenshot of your in-game career page showing{' '}
          {link.riot_game_name ? (
            <span className="font-medium text-foreground">{riotId(link)}</span>
          ) : (
            'your Riot ID'
          )}
          . A moderator will review it.
        </p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => pick(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        {localError && <p className="text-destructive">{localError}</p>}
        {mutation.isError && (
          <p className="text-destructive">
            {apiErrorMessage(mutation.error, 'Upload failed. Try again.')}
          </p>
        )}
        <Button
          size="sm"
          className="self-start"
          disabled={!file || mutation.isPending}
          onClick={() => file && mutation.mutate(file)}
        >
          {mutation.isPending ? 'Uploading…' : 'Submit for review'}
        </Button>
      </div>
    </details>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  )
}

/** Ticks a local countdown from an initial seconds value, re-seeded by the caller. */
function useCountdown(initialSeconds: number): number {
  const [deadline, setDeadline] = useState(() => Date.now() + initialSeconds * 1000)
  const [, force] = useState(0)

  // Re-seed whenever the server reports a fresh remaining time.
  useEffect(() => {
    setDeadline(Date.now() + initialSeconds * 1000)
  }, [initialSeconds])

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}
