import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Chip } from '@/components/chip'
import { getProfile, putRoleTags, putSchedule, updateProfileBasics } from '@/api/profile'
import { unlinkProvider } from '@/api/auth'
import { getRiotLinkStatus } from '@/api/riotLink'
import { rankLabel } from '@/schemas/riotLink.schema'
import {
  COMM_PREFERENCES,
  DAYS,
  LANGUAGES,
  REGIONS,
  ROLE_TAGS,
  type ScheduleBlockInput,
} from '@/schemas/profile.schema'
import { setLinkMode, startDiscordLogin, startGoogleLogin } from '@/lib/oauth'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/lib/api'

interface DaySchedule {
  enabled: boolean
  start: string
  end: string
}

export function ProfileSettingsPage() {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const riotQuery = useQuery({ queryKey: ['riotLink'], queryFn: getRiotLinkStatus })

  const [region, setRegion] = useState('')
  const [language, setLanguage] = useState('')
  const [comm, setComm] = useState('')
  const [bio, setBio] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [days, setDays] = useState<DaySchedule[]>(
    Array.from({ length: 7 }, () => ({ enabled: false, start: '20:00', end: '23:00' })),
  )
  const [message, setMessage] = useState<string | null>(null)

  // Seed local edit state once the profile loads
  useEffect(() => {
    const p = profileQuery.data
    if (!p) return
    setRegion(p.region)
    setLanguage(p.language)
    setComm(p.comm_preference)
    setBio(p.bio)
    setRoles(p.role_tags)
    setDays((prev) =>
      prev.map((d, i) => {
        const block = p.schedule_blocks.find((b) => b.day_of_week === i)
        return block
          ? {
              enabled: true,
              start: block.start_time.slice(0, 5),
              end: block.end_time.slice(0, 5),
            }
          : d
      }),
    )
  }, [profileQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const blocks: ScheduleBlockInput[] = days
        .map((d, i) =>
          d.enabled
            ? { day_of_week: i, start_time: d.start, end_time: d.end, timezone }
            : null,
        )
        .filter((b): b is ScheduleBlockInput => b !== null)
      await updateProfileBasics({ region, language, comm_preference: comm, bio })
      await putRoleTags(roles)
      await putSchedule(blocks)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setMessage('Saved.')
    },
    onError: () => setMessage('Could not save. Check your entries and try again.'),
  })

  const unlinkMutation = useMutation({
    mutationFn: unlinkProvider,
    onSuccess: () => refreshUser(),
    onError: (e) => {
      const detail =
        e instanceof ApiError ? (e.data as { detail?: string })?.detail : null
      setMessage(detail ?? 'Could not unlink.')
    },
  })

  // Reuses the login redirect; the callback page sees link mode and attaches
  // the account to the current user instead.
  const connect = (provider: 'google' | 'discord') => {
    setLinkMode(provider)
    if (provider === 'google') void startGoogleLogin()
    else startDiscordLogin()
  }

  const toggleRole = (role: string) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )

  const updateDay = (index: number, patch: Partial<DaySchedule>) =>
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))

  const linked = (provider: string) =>
    user?.social_accounts.some((a) => a.provider === provider) ?? false

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link to="/queue" />}>
          <ArrowLeft />
        </Button>
        <h1 className="text-2xl font-semibold">Profile settings</h1>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Connected accounts</CardTitle>
            <CardDescription>
              Link both so teammates can reach you either way. You can't remove
              your only login method.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(['google', 'discord'] as const).map((provider) => (
              <div key={provider} className="flex items-center justify-between">
                <span className="text-sm capitalize">
                  {provider}
                  {provider === 'discord' && linked('discord') && (
                    <span className="ml-2 text-muted-foreground">
                      {
                        user?.social_accounts.find((a) => a.provider === 'discord')
                          ?.discord_username
                      }
                    </span>
                  )}
                </span>
                {linked(provider) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unlinkMutation.mutate(provider)}
                    disabled={unlinkMutation.isPending}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => connect(provider)}>
                    Connect
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riot account</CardTitle>
            <CardDescription>
              Verified rank builds trust with teammates and unlocks rank-matched
              listings.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            {(() => {
              const link = riotQuery.data
              const status = link?.status ?? 'none'
              if (status === 'verified') {
                return (
                  <div className="text-sm">
                    <span className="font-medium">
                      {link!.riot_game_name}#{link!.riot_tag_line}
                    </span>
                    <span className="ml-2 text-emerald-500">Verified</span>
                    <div className="text-muted-foreground">
                      {rankLabel(link!.current_tier, link!.current_division)}
                      {link!.current_rr != null && ` · ${link!.current_rr} RR`}
                    </div>
                  </div>
                )
              }
              const text =
                status === 'pending'
                  ? 'Verification in progress'
                  : status === 'manual_review'
                    ? 'Screenshot under review'
                    : status === 'expired' || status === 'rejected'
                      ? 'Verification incomplete'
                      : 'Not linked yet'
              return <span className="text-sm text-muted-foreground">{text}</span>
            })()}
            <Button variant="outline" size="sm" render={<Link to="/riot-link" />}>
              {riotQuery.data?.status === 'verified' ? 'Manage' : 'Link account'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How you play</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <Label className="mb-2 block">Region</Label>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <Chip key={r.value} selected={region === r.value} onClick={() => setRegion(r.value)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Main language</Label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <Chip key={l.value} selected={language === l.value} onClick={() => setLanguage(l.value)}>
                    {l.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Communication</Label>
              <div className="flex flex-wrap gap-2">
                {COMM_PREFERENCES.map((c) => (
                  <Chip key={c.value} selected={comm === c.value} onClick={() => setComm(c.value)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Roles</Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_TAGS.map((r) => (
                  <Chip key={r.value} selected={roles.includes(r.value)} onClick={() => toggleRole(r.value)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="bio" className="mb-2 block">
                Bio
              </Label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                maxLength={280}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly schedule</CardTitle>
            <CardDescription>
              Times are in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {DAYS.map((day, i) => (
              <div key={day} className="flex items-center gap-3">
                <Chip selected={days[i].enabled} onClick={() => updateDay(i, { enabled: !days[i].enabled })}>
                  {day.slice(0, 3)}
                </Chip>
                {days[i].enabled ? (
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="time"
                      value={days[i].start}
                      onChange={(e) => updateDay(i, { start: e.target.value })}
                      className="rounded-md border bg-background px-2 py-1"
                    />
                    <span className="text-muted-foreground">to</span>
                    <input
                      type="time"
                      value={days[i].end}
                      onChange={(e) => updateDay(i, { end: e.target.value })}
                      className="rounded-md border bg-background px-2 py-1"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Not playing</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {message && <span className="text-sm text-muted-foreground">{message}</span>}
        </div>
      </div>
    </div>
  )
}
