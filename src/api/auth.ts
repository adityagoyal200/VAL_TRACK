import { apiFetch } from '@/lib/api'

export interface SocialAccount {
  provider: 'google' | 'discord'
  discord_username: string
  discord_avatar_hash: string
}

export interface User {
  id: string
  email: string
  username: string
  date_joined: string
  social_accounts: SocialAccount[]
}

export interface LoginResponse {
  access: string
  user: User
}

export function googleCallback(code: string, redirectUri: string, codeVerifier: string) {
  return apiFetch<LoginResponse>('/api/auth/google/callback/', {
    method: 'POST',
    body: JSON.stringify({ code, redirect_uri: redirectUri, code_verifier: codeVerifier }),
  })
}

export function discordCallback(code: string, redirectUri: string) {
  return apiFetch<LoginResponse>('/api/auth/discord/callback/', {
    method: 'POST',
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
}

export function fetchMe() {
  return apiFetch<User>('/api/auth/me/')
}

export function logout() {
  return apiFetch<void>('/api/auth/logout/', { method: 'POST' })
}
