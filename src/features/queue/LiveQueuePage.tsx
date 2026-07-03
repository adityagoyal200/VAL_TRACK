export function LiveQueuePage() {
  // TODO(M4/M5): fetch listings via TanStack Query, subscribe to WS for live updates.
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Live Queue</h1>
      <p className="mt-2 text-muted-foreground">
        Party listings will show up here once the matchmaking API is wired up.
      </p>
    </div>
  )
}
