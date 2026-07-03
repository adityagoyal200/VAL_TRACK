import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  completeOnboarding,
  putRoleTags,
  putSchedule,
  updateProfileBasics,
} from '@/api/profile'
import {
  COMM_PREFERENCES,
  DAYS,
  LANGUAGES,
  REGIONS,
  ROLE_TAGS,
  profileBasicsSchema,
  type ProfileBasicsInput,
  type ScheduleBlockInput,
} from '@/schemas/profile.schema'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const STEPS = ['Basics', 'Roles', 'Schedule'] as const

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

interface DaySchedule {
  enabled: boolean
  start: string
  end: string
}

const defaultDay: DaySchedule = { enabled: false, start: '20:00', end: '23:00' }

export function OnboardingWizard() {
  const [step, setStep] = useState(0)
  const [roles, setRoles] = useState<string[]>([])
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [days, setDays] = useState<DaySchedule[]>(Array(7).fill(defaultDay))
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const form = useForm<ProfileBasicsInput>({
    resolver: zodResolver(profileBasicsSchema),
    defaultValues: { bio: '' },
  })
  const basics = form.watch()

  const submitBasics = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await updateProfileBasics(values)
      setStep(1)
    } catch {
      setServerError('Could not save. Try again.')
    }
  })

  const submitRoles = async () => {
    if (roles.length === 0) {
      setRolesError('Pick at least one role.')
      return
    }
    setServerError(null)
    try {
      await putRoleTags(roles)
      setStep(2)
    } catch {
      setServerError('Could not save. Try again.')
    }
  }

  const submitSchedule = async () => {
    setSubmitting(true)
    setServerError(null)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const blocks: ScheduleBlockInput[] = days
      .map((d, i) =>
        d.enabled
          ? { day_of_week: i, start_time: d.start, end_time: d.end, timezone }
          : null,
      )
      .filter((b): b is ScheduleBlockInput => b !== null)
    try {
      await putSchedule(blocks)
      await completeOnboarding()
      await refreshUser()
      navigate('/queue', { replace: true })
    } catch {
      setServerError('Could not finish onboarding. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleRole = (role: string) => {
    setRolesError(null)
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  const updateDay = (index: number, patch: Partial<DaySchedule>) => {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                    i <= step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    i === step ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="w-6 border-t" />}
              </div>
            ))}
          </div>
          <CardTitle>
            {step === 0 && 'Tell us how you play'}
            {step === 1 && 'What roles do you fill?'}
            {step === 2 && 'When do you usually queue?'}
          </CardTitle>
          <CardDescription>
            {step === 0 && 'Region, language, and how you like to communicate.'}
            {step === 1 && 'Pick everything you comfortably play.'}
            {step === 2 && 'Rough weekly windows are enough — you can edit later.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && <p className="mb-4 text-sm text-destructive">{serverError}</p>}

          {step === 0 && (
            <form onSubmit={submitBasics} className="flex flex-col gap-6">
              <div>
                <Label className="mb-2 block">Region</Label>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map((r) => (
                    <Chip
                      key={r.value}
                      selected={basics.region === r.value}
                      onClick={() =>
                        form.setValue('region', r.value, { shouldValidate: true })
                      }
                    >
                      {r.label}
                    </Chip>
                  ))}
                </div>
                {form.formState.errors.region && (
                  <p className="mt-1 text-sm text-destructive">
                    {form.formState.errors.region.message}
                  </p>
                )}
              </div>

              <div>
                <Label className="mb-2 block">Main language</Label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => (
                    <Chip
                      key={l.value}
                      selected={basics.language === l.value}
                      onClick={() =>
                        form.setValue('language', l.value, { shouldValidate: true })
                      }
                    >
                      {l.label}
                    </Chip>
                  ))}
                </div>
                {form.formState.errors.language && (
                  <p className="mt-1 text-sm text-destructive">
                    {form.formState.errors.language.message}
                  </p>
                )}
              </div>

              <div>
                <Label className="mb-2 block">Communication</Label>
                <div className="flex flex-wrap gap-2">
                  {COMM_PREFERENCES.map((c) => (
                    <Chip
                      key={c.value}
                      selected={basics.comm_preference === c.value}
                      onClick={() =>
                        form.setValue('comm_preference', c.value, {
                          shouldValidate: true,
                        })
                      }
                    >
                      {c.label}
                    </Chip>
                  ))}
                </div>
                {form.formState.errors.comm_preference && (
                  <p className="mt-1 text-sm text-destructive">
                    {form.formState.errors.comm_preference.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="bio" className="mb-2 block">
                  Bio <span className="text-muted-foreground">(optional)</span>
                </Label>
                <textarea
                  id="bio"
                  {...form.register('bio')}
                  rows={2}
                  maxLength={280}
                  placeholder="Chill grinder, mostly evenings. Don't int and we're friends."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>

              <Button type="submit" disabled={form.formState.isSubmitting}>
                Continue
              </Button>
            </form>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-2">
                {ROLE_TAGS.map((r) => (
                  <Chip
                    key={r.value}
                    selected={roles.includes(r.value)}
                    onClick={() => toggleRole(r.value)}
                  >
                    {r.label}
                  </Chip>
                ))}
              </div>
              {rolesError && <p className="text-sm text-destructive">{rolesError}</p>}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button onClick={submitRoles}>Continue</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {DAYS.map((day, i) => (
                <div key={day} className="flex items-center gap-3">
                  <Chip
                    selected={days[i].enabled}
                    onClick={() => updateDay(i, { enabled: !days[i].enabled })}
                  >
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
              <p className="text-xs text-muted-foreground">
                Times are in your timezone (
                {Intl.DateTimeFormat().resolvedOptions().timeZone}).
              </p>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={submitSchedule} disabled={submitting}>
                  {submitting ? 'Finishing…' : 'Finish'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
