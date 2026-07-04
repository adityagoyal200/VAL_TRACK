import { apiFetch } from '@/lib/api'
import type { ProfileBasicsInput, ScheduleBlockInput } from '@/schemas/profile.schema'

export interface Profile {
  region: string
  language: string
  comm_preference: string
  bio: string
  role_tags: string[]
  schedule_blocks: ScheduleBlockInput[]
  onboarding_completed: boolean
}

export function getProfile() {
  return apiFetch<Profile>('/api/profile/')
}

export function updateProfileBasics(basics: ProfileBasicsInput) {
  return apiFetch<Profile>('/api/profile/', {
    method: 'PATCH',
    body: JSON.stringify(basics),
  })
}

export function putRoleTags(roles: string[]) {
  return apiFetch<Profile>('/api/profile/role-tags/', {
    method: 'PUT',
    body: JSON.stringify({ roles }),
  })
}

export function putSchedule(blocks: ScheduleBlockInput[]) {
  return apiFetch<Profile>('/api/profile/schedule/', {
    method: 'PUT',
    body: JSON.stringify({ blocks }),
  })
}

export function completeOnboarding() {
  return apiFetch<Profile>('/api/profile/complete-onboarding/', { method: 'POST' })
}
