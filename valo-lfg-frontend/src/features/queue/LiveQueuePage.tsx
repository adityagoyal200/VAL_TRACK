import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  Check,
  Crown,
  Inbox,
  Loader2,
  Mic,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/chip'
import { Wordmark } from '@/components/wordmark'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useQueueSocket } from '@/hooks/useQueueSocket'
import {
  acceptJoinRequest,
  cancelJoinRequest,
  cancelListing,
  createListing,
  declineJoinRequest,
  listListings,
  myJoinRequests,
  myListings,
  requestJoin,
  type Listing,
  type ListingFilters,
  type ListingStatus,
  type MyJoinRequest,
} from '@/api/queue'
import { REGIONS, COMM_PREFERENCES, ROLE_TAGS } from '@/schemas/profile.schema'
import { TIERS } from '@/schemas/riotLink.schema'
import {
  LISTING_TYPES,
  commLabel,
  createListingSchema,
  listingTypeLabel,
  rankRangeLabel,
  regionLabel,
  roleLabel,
  type CreateListingInput,
} from '@/schemas/queue.schema'

// Prefix keys so invalidating ['listings'] refreshes both the feed and My Parties.
const FEED_KEY = ['listings'] as const
const MINE_KEY = ['listings', 'mine'] as const
const REQUESTS_KEY = ['join-requests', 'mine'] as const

type Tab = 'browse' | 'parties' | 'requests'

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = (error.data as { detail?: string } | null)?.detail
    if (detail) return detail
  }
  return fallback
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

export function LiveQueuePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('browse')
  const [filters, setFilters] = useState<ListingFilters>({})
  const [createOpen, setCreateOpen] = useState(false)

  // Real-time feed/tab updates over websocket while signed in.
  useQueueSocket(!!user)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="animate-rise flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Wordmark className="h-7 w-auto" />
          <div className="hidden h-8 w-px bg-border sm:block" />
          <div className="hidden sm:block">
            <h1 className="font-heading text-lg leading-none font-semibold tracking-wide">
              LIVE QUEUE
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Find a party that fits how you play.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user?.username}
          </span>
          <Button variant="ghost" size="icon-sm" render={<Link to="/settings" />}>
            <Settings />
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      <TabBar tab={tab} onChange={setTab} onCreate={() => setCreateOpen(true)} />

      {tab === 'browse' && (
        <BrowseTab
          filters={filters}
          onFilters={setFilters}
          onCreate={() => setCreateOpen(true)}
        />
      )}
      {tab === 'parties' && <MyPartiesTab onCreate={() => setCreateOpen(true)} />}
      {tab === 'requests' && <MyRequestsTab onBrowse={() => setTab('browse')} />}

      <CreateListingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultRegion={filters.region}
      />
    </div>
  )
}

function TabBar({
  tab,
  onChange,
  onCreate,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
  onCreate: () => void
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'browse', label: 'Browse' },
    { id: 'parties', label: 'My Parties' },
    { id: 'requests', label: 'Requests' },
  ]
  return (
    <div className="animate-rise mt-6 flex items-center justify-between border-b">
      <nav className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={
              'relative px-3 py-2 font-heading text-sm tracking-wide transition-colors ' +
              (tab === t.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </nav>
      <Button size="sm" className="clip-bevel-sm" onClick={onCreate}>
        <Plus /> New listing
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------- browse */

function BrowseTab({
  filters,
  onFilters,
  onCreate,
}: {
  filters: ListingFilters
  onFilters: (next: ListingFilters) => void
  onCreate: () => void
}) {
  const feed = useQuery({
    queryKey: [...FEED_KEY, filters],
    queryFn: () => listListings(filters),
    // Websocket drives live updates; this slow poll is just a safety net.
    refetchInterval: 30000,
  })
  const listings = feed.data?.results ?? []

  return (
    <>
      <FilterRail filters={filters} onChange={onFilters} />

      <div className="animate-rise mb-4 mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Radio
            className={
              feed.isFetching ? 'size-4 animate-pulse text-primary' : 'size-4 text-primary'
            }
          />
          <span className="font-heading tracking-wide">
            {listings.length} {listings.length === 1 ? 'PARTY' : 'PARTIES'} LIVE
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => feed.refetch()}
          aria-label="Refresh"
        >
          <RefreshCw className={feed.isFetching ? 'animate-spin' : undefined} />
        </Button>
      </div>

      <ListingGrid
        isPending={feed.isPending}
        isError={feed.isError}
        onRetry={() => feed.refetch()}
        listings={listings}
        empty={
          <EmptyState
            title="No open parties right now"
            body="Be the first — put up a listing and let players come to you."
            action={
              <Button size="sm" className="clip-bevel-sm" onClick={onCreate}>
                <Plus /> Create a listing
              </Button>
            }
          />
        }
      />
    </>
  )
}

function FilterRail({
  filters,
  onChange,
}: {
  filters: ListingFilters
  onChange: (next: ListingFilters) => void
}) {
  const toggleRole = (value: string) => {
    const roles = filters.roles ?? []
    const next = roles.includes(value)
      ? roles.filter((r) => r !== value)
      : [...roles, value]
    onChange({ ...filters, roles: next.length ? next : undefined })
  }

  const set = (key: keyof ListingFilters, value: string) =>
    onChange({ ...filters, [key]: filters[key] === value ? undefined : value })

  const active =
    filters.region ||
    filters.comm_preference ||
    filters.rank ||
    filters.listing_type ||
    filters.roles?.length

  return (
    <section className="animate-rise mt-6 rounded-md border bg-card/40 p-4 clip-bevel-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-xs tracking-widest text-muted-foreground">
          FILTERS
        </h2>
        {active ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange({})}
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <FilterGroup label="Region">
          {REGIONS.map((r) => (
            <Chip
              key={r.value}
              selected={filters.region === r.value}
              onClick={() => set('region', r.value)}
            >
              {r.label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="Your rank">
          {TIERS.map((t) => (
            <Chip
              key={t.value}
              selected={filters.rank === t.value}
              onClick={() => set('rank', t.value)}
            >
              {t.label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="Roles needed">
          {ROLE_TAGS.map((r) => (
            <Chip
              key={r.value}
              selected={(filters.roles ?? []).includes(r.value)}
              onClick={() => toggleRole(r.value)}
            >
              {r.label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="Comms">
          {COMM_PREFERENCES.map((c) => (
            <Chip
              key={c.value}
              selected={filters.comm_preference === c.value}
              onClick={() => set('comm_preference', c.value)}
            >
              {c.label}
            </Chip>
          ))}
        </FilterGroup>
      </div>
    </section>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- my parties */

function MyPartiesTab({ onCreate }: { onCreate: () => void }) {
  const mine = useQuery({
    queryKey: MINE_KEY,
    queryFn: myListings,
    // Poll so incoming join requests surface without a manual refresh.
    refetchInterval: 30000,
  })
  const listings = mine.data?.results ?? []

  return (
    <div className="mt-6">
      <ListingGrid
        isPending={mine.isPending}
        isError={mine.isError}
        onRetry={() => mine.refetch()}
        listings={listings}
        empty={
          <EmptyState
            title="You haven't posted a party yet"
            body="Put up a listing and manage who joins right here."
            action={
              <Button size="sm" className="clip-bevel-sm" onClick={onCreate}>
                <Plus /> Create a listing
              </Button>
            }
          />
        }
      />
    </div>
  )
}

/* --------------------------------------------------------------- my requests */

function MyRequestsTab({ onBrowse }: { onBrowse: () => void }) {
  const requests = useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: myJoinRequests,
    refetchInterval: 30000,
  })
  const items = requests.data?.results ?? []

  if (requests.isPending) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading your requests…
      </div>
    )
  }
  if (requests.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <p>Couldn't load your requests.</p>
        <Button variant="outline" size="sm" onClick={() => requests.refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No join requests yet"
          body="Browse open parties and request to join one."
          action={
            <Button size="sm" className="clip-bevel-sm" onClick={onBrowse}>
              Browse parties
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      {items.map((req) => (
        <RequestRow key={req.id} req={req} />
      ))}
    </div>
  )
}

function RequestRow({ req }: { req: MyJoinRequest }) {
  const queryClient = useQueryClient()
  const cancel = useMutation({
    mutationFn: () => cancelJoinRequest(req.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REQUESTS_KEY }),
  })

  return (
    <div className="animate-rise flex items-center justify-between gap-3 rounded-md border bg-card/50 px-4 py-3 clip-bevel-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-heading tracking-wide text-primary">
            {listingTypeLabel(req.listing.listing_type)}
          </span>
          <span className="text-xs uppercase text-muted-foreground">
            {regionLabel(req.listing.region)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Host <span className="text-foreground">{req.listing.host_username}</span> ·{' '}
          {req.listing.party_size_current}/{req.listing.party_size_target} · asked{' '}
          {timeAgo(req.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <RequestStatusBadge status={req.status} />
        {req.status === 'pending' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Withdraw
          </Button>
        )}
      </div>
    </div>
  )
}

function RequestStatusBadge({ status }: { status: MyJoinRequest['status'] }) {
  const styles: Record<string, string> = {
    pending: 'border-amber-500/40 text-amber-400',
    accepted: 'border-cyan/40 text-cyan',
    declined: 'border-muted-foreground/30 text-muted-foreground',
    cancelled: 'border-muted-foreground/30 text-muted-foreground',
    expired: 'border-muted-foreground/30 text-muted-foreground',
  }
  return (
    <span
      className={
        'rounded-full border px-2 py-0.5 text-[0.7rem] capitalize ' +
        (styles[status] ?? 'border-muted-foreground/30 text-muted-foreground')
      }
    >
      {status}
    </span>
  )
}

/* ------------------------------------------------------------- shared: cards */

function ListingGrid({
  isPending,
  isError,
  onRetry,
  listings,
  empty,
}: {
  isPending: boolean
  isError: boolean
  onRetry: () => void
  listings: Listing[]
  empty: React.ReactNode
}) {
  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading the queue…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <p>Couldn't load listings.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  if (listings.length === 0) return <>{empty}</>

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  )
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: React.ReactNode
}) {
  return (
    <div className="animate-rise flex flex-col items-center gap-4 rounded-md border border-dashed py-16 text-center">
      <Inbox className="size-8 text-muted-foreground" />
      <div>
        <p className="font-heading tracking-wide">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: FEED_KEY })
    queryClient.invalidateQueries({ queryKey: REQUESTS_KEY })
  }

  const join = useMutation({
    mutationFn: () => requestJoin(listing.id),
    onSuccess: refresh,
  })
  const cancel = useMutation({
    mutationFn: () => cancelListing(listing.id),
    onSuccess: refresh,
  })

  const showHostPanel = listing.viewer_is_host && listing.join_requests.length > 0
  const canCancel =
    listing.viewer_is_host &&
    (listing.status === 'open' || listing.status === 'filled')

  return (
    <article className="animate-rise tactical-sheen group relative flex flex-col gap-3 rounded-md border bg-card/60 p-4 transition-colors hover:border-primary/50 clip-bevel-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm font-semibold tracking-wide text-primary">
              {listingTypeLabel(listing.listing_type)}
            </span>
            {listing.status !== 'open' && <ListingStatusBadge status={listing.status} />}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="uppercase">{regionLabel(listing.region)}</span>
            <span>·</span>
            <span>{rankRangeLabel(listing.rank_min, listing.rank_max)}</span>
          </div>
        </div>
        <Seats current={listing.party_size_current} target={listing.party_size_target} />
      </div>

      {listing.roles_needed.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {listing.roles_needed.map((role) => (
            <span
              key={role}
              className="rounded-full border border-cyan/40 px-2 py-0.5 text-[0.7rem] text-cyan"
            >
              {roleLabel(role)}
            </span>
          ))}
        </div>
      )}

      {listing.note && (
        <p className="line-clamp-2 text-sm text-muted-foreground">“{listing.note}”</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Crown className="size-3.5 text-primary/70" />
            <span className="truncate">{listing.host_username}</span>
          </span>
          <span className="flex items-center gap-1">
            {listing.comm_preference === 'text' ? (
              <MessageSquare className="size-3.5" />
            ) : (
              <Mic className="size-3.5" />
            )}
            {commLabel(listing.comm_preference)}
          </span>
          <span className="hidden sm:inline">{timeAgo(listing.created_at)}</span>
        </div>
        <JoinControl listing={listing} join={join} />
      </div>

      {join.isError && (
        <p className="text-xs text-destructive">
          {apiErrorMessage(join.error, "Couldn't send your request.")}
        </p>
      )}

      {showHostPanel && (
        <HostRequestPanel listing={listing} onResolved={refresh} />
      )}

      {canCancel && (
        <div className="flex justify-end border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            <Ban className="size-3.5" /> Cancel listing
          </Button>
        </div>
      )}
    </article>
  )
}

function HostRequestPanel({
  listing,
  onResolved,
}: {
  listing: Listing
  onResolved: () => void
}) {
  const queryClient = useQueryClient()
  const settle = () => {
    queryClient.invalidateQueries({ queryKey: FEED_KEY })
    onResolved()
  }
  const accept = useMutation({ mutationFn: acceptJoinRequest, onSuccess: settle })
  const decline = useMutation({ mutationFn: declineJoinRequest, onSuccess: settle })
  const pending = accept.isPending || decline.isPending

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="font-heading text-xs tracking-widest text-muted-foreground">
        JOIN REQUESTS ({listing.join_requests.length})
      </p>
      {listing.join_requests.map((req) => (
        <div
          key={req.id}
          className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
        >
          <div className="min-w-0">
            <span className="text-sm font-medium">{req.requester_username}</span>
            {req.message && (
              <p className="truncate text-xs text-muted-foreground">“{req.message}”</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="icon-sm"
              className="bg-cyan/15 text-cyan hover:bg-cyan/25"
              disabled={pending || listing.is_full}
              onClick={() => accept.mutate(req.id)}
              aria-label={`Accept ${req.requester_username}`}
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={pending}
              onClick={() => decline.mutate(req.id)}
              aria-label={`Decline ${req.requester_username}`}
            >
              <X />
            </Button>
          </div>
        </div>
      ))}
      {(accept.isError || decline.isError) && (
        <p className="text-xs text-destructive">
          {apiErrorMessage(
            accept.error ?? decline.error,
            "Couldn't update that request.",
          )}
        </p>
      )}
    </div>
  )
}

function JoinControl({
  listing,
  join,
}: {
  listing: Listing
  join: ReturnType<typeof useMutation<unknown, unknown, void>>
}) {
  if (listing.viewer_is_host) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-primary">
        <Crown className="size-3.5" /> Hosting
      </span>
    )
  }
  if (listing.viewer_is_member) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-cyan">
        <Check className="size-3.5" /> In party
      </span>
    )
  }
  if (listing.viewer_request_status === 'pending') {
    return <span className="text-xs text-muted-foreground">Requested</span>
  }
  if (listing.is_full) {
    return <span className="text-xs text-muted-foreground">Full</span>
  }
  return (
    <Button
      size="sm"
      className="clip-bevel-sm"
      disabled={join.isPending}
      onClick={() => join.mutate()}
    >
      {join.isPending ? <Loader2 className="animate-spin" /> : null}
      Request to join
    </Button>
  )
}

function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const styles: Record<ListingStatus, string> = {
    open: 'border-cyan/40 text-cyan',
    filled: 'border-primary/40 text-primary',
    expired: 'border-muted-foreground/30 text-muted-foreground',
    cancelled: 'border-muted-foreground/30 text-muted-foreground',
  }
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[0.65rem] uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function Seats({ current, target }: { current: number; target: number }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-heading text-sm tabular-nums">
        {current}
        <span className="text-muted-foreground">/{target}</span>
      </span>
      <div className="flex gap-1">
        {Array.from({ length: target }).map((_, i) => (
          <span
            key={i}
            className={
              i < current
                ? 'size-1.5 rounded-full bg-primary'
                : 'size-1.5 rounded-full border border-muted-foreground/40'
            }
          />
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- create form */

const EMPTY_FORM: CreateListingInput = {
  listing_type: 'lf_fifth',
  region: 'na',
  party_size_target: 5,
  rank_min: '',
  rank_max: '',
  roles_needed: [],
  comm_preference: 'either',
  note: '',
}

function CreateListingDialog({
  open,
  onOpenChange,
  defaultRegion,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultRegion?: string
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreateListingInput>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reseed each time the dialog opens, defaulting region to the active filter.
  const reset = () =>
    setForm({ ...EMPTY_FORM, region: defaultRegion ?? EMPTY_FORM.region })

  const create = useMutation({
    mutationFn: createListing,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEED_KEY })
      onOpenChange(false)
    },
  })

  const patch = (next: Partial<CreateListingInput>) => setForm((f) => ({ ...f, ...next }))

  const toggleRole = (value: string) =>
    patch({
      roles_needed: form.roles_needed.includes(value)
        ? form.roles_needed.filter((r) => r !== value)
        : [...form.roles_needed, value],
    })

  const submit = () => {
    const parsed = createListingSchema.safeParse(form)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    create.mutate(parsed.data)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="animate-rise relative my-8 w-full max-w-lg rounded-md border bg-card p-6 shadow-xl clip-bevel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-lg font-semibold tracking-wide text-glow-red">
          Post a listing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You’ll be seeded as host. Players request to join and you pick who’s in.
        </p>

        <div className="mt-5 flex flex-col gap-5">
          <Field label="Looking for" error={errors.listing_type}>
            {LISTING_TYPES.map((t) => (
              <Chip
                key={t.value}
                selected={form.listing_type === t.value}
                onClick={() => patch({ listing_type: t.value })}
              >
                {t.label}
              </Chip>
            ))}
          </Field>

          <Field label="Region" error={errors.region}>
            {REGIONS.map((r) => (
              <Chip
                key={r.value}
                selected={form.region === r.value}
                onClick={() => patch({ region: r.value })}
              >
                {r.label}
              </Chip>
            ))}
          </Field>

          <Field label="Party size" error={errors.party_size_target}>
            {[2, 3, 4, 5].map((n) => (
              <Chip
                key={n}
                selected={form.party_size_target === n}
                onClick={() => patch({ party_size_target: n })}
              >
                {n}
              </Chip>
            ))}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Min rank" error={errors.rank_min}>
              <RankSelect value={form.rank_min} onChange={(v) => patch({ rank_min: v })} />
            </Field>
            <Field label="Max rank" error={errors.rank_max}>
              <RankSelect value={form.rank_max} onChange={(v) => patch({ rank_max: v })} />
            </Field>
          </div>

          <Field label="Roles needed (optional)">
            {ROLE_TAGS.map((r) => (
              <Chip
                key={r.value}
                selected={form.roles_needed.includes(r.value)}
                onClick={() => toggleRole(r.value)}
              >
                {r.label}
              </Chip>
            ))}
          </Field>

          <Field label="Comms">
            {COMM_PREFERENCES.map((c) => (
              <Chip
                key={c.value}
                selected={form.comm_preference === c.value}
                onClick={() => patch({ comm_preference: c.value })}
              >
                {c.label}
              </Chip>
            ))}
          </Field>

          <div>
            <label className="mb-2 block text-xs text-muted-foreground">
              Note <span className="opacity-70">(optional)</span>
            </label>
            <textarea
              rows={2}
              maxLength={280}
              value={form.note}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="Chill ranked grind, no rage. Sentinel main preferred."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {errors.note && <p className="mt-1 text-sm text-destructive">{errors.note}</p>}
          </div>
        </div>

        {create.isError && (
          <p className="mt-4 text-sm text-destructive">
            {apiErrorMessage(create.error, "Couldn't post your listing.")}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button className="clip-bevel-sm" disabled={create.isPending} onClick={submit}>
            {create.isPending ? <Loader2 className="animate-spin" /> : null}
            Go live
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span className="mb-2 block text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  )
}

function RankSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value="">Any</option>
      {TIERS.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  )
}
