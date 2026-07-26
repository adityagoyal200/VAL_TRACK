import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, MonitorDown, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/chip'
import { createCollectionCode, getSkins } from '@/api/tracker'
import {
  fetchContentTiers,
  fetchSkinIndex,
  type ResolvedSkin,
} from '@/api/valorantAssets'
import { timeAgo } from './lib'

/** The skin showcase: owned skin-level uuids come from our backend (synced by
 * the desktop app); names, art and rarity resolve client-side from
 * valorant-api.com. */
export function CollectionTab() {
  const skins = useQuery({ queryKey: ['tracker', 'skins'], queryFn: getSkins })
  const index = useQuery({
    queryKey: ['val-assets', 'skin-index'],
    queryFn: fetchSkinIndex,
    staleTime: Infinity,
    enabled: (skins.data?.skin_levels.length ?? 0) > 0,
  })
  const tiers = useQuery({
    queryKey: ['val-assets', 'content-tiers'],
    queryFn: fetchContentTiers,
    staleTime: Infinity,
    enabled: (skins.data?.skin_levels.length ?? 0) > 0,
  })

  const [weapon, setWeapon] = useState<string>('')
  const [search, setSearch] = useState('')

  const owned = useMemo(() => {
    if (!skins.data || !index.data) return []
    const bySkin = new Map<string, ResolvedSkin>()
    for (const levelId of skins.data.skin_levels) {
      const hit = index.data.byLevel.get(levelId.toLowerCase())
      if (!hit) continue
      if (!hit.contentTier) continue // standard-issue defaults are noise
      const prev = bySkin.get(hit.skinId)
      if (!prev || hit.levelIndex > prev.levelIndex) bySkin.set(hit.skinId, hit)
    }
    const rankOf = (s: ResolvedSkin) =>
      s.contentTier ? (tiers.data?.get(s.contentTier)?.rank ?? -1) : -1
    return [...bySkin.values()].sort(
      (a, b) => rankOf(b) - rankOf(a) || a.name.localeCompare(b.name),
    )
  }, [skins.data, index.data, tiers.data])

  const weapons = useMemo(
    () => [...new Set(owned.map((s) => s.weapon))].sort(),
    [owned],
  )
  const visible = owned.filter(
    (s) =>
      (!weapon || s.weapon === weapon) &&
      (!search || s.name.toLowerCase().includes(search.toLowerCase())),
  )

  if (skins.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const empty = (skins.data?.skin_levels.length ?? 0) === 0

  return (
    <div className="animate-rise">
      {empty ? (
        <SyncPanel firstTime />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span
                className="font-heading text-2xl font-bold tabular-nums"
                style={{ color: '#e7c15a', textShadow: '0 0 22px #e7c15a4d' }}
              >
                {owned.length}
              </span>{' '}
              <span className="text-sm text-muted-foreground">
                skins owned
                {skins.data?.updated_at ? ` · synced ${timeAgo(skins.data.updated_at)}` : ''}
              </span>
            </div>
            <SyncPanel />
          </div>

          <div className="clip-bevel-sm glass mt-4 flex flex-wrap items-center gap-2 border border-border/70 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skins…"
                className="clip-bevel-sm glass h-9 w-52 border border-border pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-muted-foreground/60"
              />
            </div>
            <Chip selected={weapon === ''} onClick={() => setWeapon('')}>
              All
            </Chip>
            {weapons.map((w) => (
              <Chip key={w} selected={weapon === w} onClick={() => setWeapon(w)}>
                {w}
              </Chip>
            ))}
          </div>

          {(index.isLoading || tiers.isLoading) && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((s) => {
              const tier = s.contentTier ? tiers.data?.get(s.contentTier) : undefined
              return (
                <div
                  key={s.skinId}
                  className="clip-bevel-sm glass group relative overflow-hidden border border-border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25"
                  style={{
                    boxShadow: tier
                      ? `inset 0 2px 0 0 ${tier.color}, 0 10px 24px -12px ${tier.color}66`
                      : undefined,
                  }}
                >
                  <div className="flex h-20 items-center justify-center">
                    {s.image ? (
                      <img
                        src={s.image}
                        alt={s.name}
                        loading="lazy"
                        className="max-h-20 max-w-full object-contain drop-shadow transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="text-xs text-muted-foreground">no art</div>
                    )}
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {s.weapon}
                      </div>
                    </div>
                    {tier?.icon && (
                      <img src={tier.icon} alt={tier.name} className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {visible.length === 0 && !index.isLoading && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No skins match that filter.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Mint a pairing code and walk the user through pushing their collection
 * from the desktop app (the only place skin ownership can be read). */
function SyncPanel({ firstTime = false }: { firstTime?: boolean }) {
  const mint = useMutation({ mutationFn: createCollectionCode })

  const codeBlock = mint.data && (
    <div className="mt-4">
      <div className="font-heading text-3xl font-bold tracking-[0.3em] text-cyan">
        {mint.data.code}
      </div>
      <ol className="mx-auto mt-4 max-w-md list-inside list-decimal space-y-1 text-left text-sm text-muted-foreground">
        <li>Launch VALORANT and the Valo LFG desktop app on your gaming PC.</li>
        <li>Open the “Sync collection” panel in the desktop app.</li>
        <li>Enter this code within 10 minutes and hit Sync.</li>
        <li>Refresh this page — your skins appear here.</li>
      </ol>
    </div>
  )

  if (!firstTime) {
    return (
      <div className="text-right">
        <Button variant="outline" size="sm" onClick={() => mint.mutate()} disabled={mint.isPending}>
          <RefreshCw className="mr-1 h-4 w-4" /> Re-sync
        </Button>
        {codeBlock}
      </div>
    )
  }

  return (
    <div className="clip-bevel glass tactical-grid relative overflow-hidden border border-border p-8 text-center">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 10%, #00e5c0 40%, #00e5c0 60%, transparent 90%)' }}
        aria-hidden
      />
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm border border-cyan/40 bg-cyan/10">
        <MonitorDown className="h-7 w-7 text-cyan" />
      </div>
      <p className="mt-3 font-heading text-lg font-semibold">Show off your collection</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Skin ownership only lives inside the Riot client, so the Valo LFG desktop app reads it
        locally and pushes it here — no Riot login ever leaves your PC.
      </p>
      <Button className="mt-5" onClick={() => mint.mutate()} disabled={mint.isPending}>
        {mint.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
        Generate sync code
      </Button>
      {mint.isError && (
        <p className="mt-2 text-sm text-destructive">Couldn’t create a code. Try again.</p>
      )}
      {codeBlock}
    </div>
  )
}
