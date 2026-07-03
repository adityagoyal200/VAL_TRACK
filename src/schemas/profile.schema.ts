import { z } from 'zod'

export const REGIONS = [
  { value: 'na', label: 'North America' },
  { value: 'eu', label: 'Europe' },
  { value: 'ap', label: 'Asia Pacific' },
  { value: 'kr', label: 'Korea' },
  { value: 'latam', label: 'Latin America' },
  { value: 'br', label: 'Brazil' },
] as const

export const COMM_PREFERENCES = [
  { value: 'voice', label: 'Voice only' },
  { value: 'text', label: 'Text only' },
  { value: 'either', label: 'Either' },
] as const

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ru', label: 'Russian' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
] as const

export const ROLE_TAGS = [
  { value: 'igl', label: 'IGL' },
  { value: 'entry', label: 'Entry Fragger' },
  { value: 'support', label: 'Support' },
  { value: 'duelist_main', label: 'Duelist Main' },
  { value: 'controller_main', label: 'Controller Main' },
  { value: 'initiator_main', label: 'Initiator Main' },
  { value: 'sentinel_main', label: 'Sentinel Main' },
  { value: 'flex', label: 'Flex' },
] as const

export const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

const regionValues = REGIONS.map((r) => r.value) as [string, ...string[]]
const commValues = COMM_PREFERENCES.map((c) => c.value) as [string, ...string[]]
const languageValues = LANGUAGES.map((l) => l.value) as [string, ...string[]]
const roleValues = ROLE_TAGS.map((r) => r.value) as [string, ...string[]]

export const profileBasicsSchema = z.object({
  region: z.enum(regionValues, { error: 'Pick your region.' }),
  language: z.enum(languageValues, { error: 'Pick your main language.' }),
  comm_preference: z.enum(commValues, { error: 'Pick a communication preference.' }),
  bio: z.string().max(280, 'Keep it under 280 characters.'),
})
export type ProfileBasicsInput = z.infer<typeof profileBasicsSchema>

export const roleTagsSchema = z
  .array(z.enum(roleValues))
  .min(1, 'Pick at least one role.')
export type RoleTagsInput = z.infer<typeof roleTagsSchema>

export const scheduleBlockSchema = z
  .object({
    day_of_week: z.number().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string(),
  })
  .refine((b) => b.start_time < b.end_time, {
    message: 'Start must be before end.',
  })
export type ScheduleBlockInput = z.infer<typeof scheduleBlockSchema>
