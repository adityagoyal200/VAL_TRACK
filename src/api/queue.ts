import { apiFetch } from '@/lib/api'
import type { CreateListingInput } from '@/schemas/queue.schema'

export type ListingStatus = 'open' | 'filled' | 'expired' | 'cancelled'
export type JoinRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired'

export interface Member {
  user_id: string
  username: string
  is_host: boolean
  discord_username: string
}

export interface JoinRequestBrief {
  id: string
  requester_id: string
  requester_username: string
  message: string
  status: JoinRequestStatus
  created_at: string
  responded_at: string | null
}

/** Mirrors PartyListingSerializer. `join_requests` is populated only for the host. */
export interface Listing {
  id: string
  host_id: string
  host_username: string
  listing_type: string
  region: string
  party_size_current: number
  party_size_target: number
  rank_min: string
  rank_max: string
  roles_needed: string[]
  comm_preference: string
  note: string
  status: ListingStatus
  expires_at: string
  filled_at: string | null
  created_at: string
  seats_open: number
  is_full: boolean
  members: Member[]
  join_requests: JoinRequestBrief[]
  viewer_is_host: boolean
  viewer_is_member: boolean
  viewer_request_status: JoinRequestStatus | null
}

/** DRF cursor-pagination envelope. `next`/`previous` are opaque cursor URLs. */
export interface Paginated<T> {
  next: string | null
  previous: string | null
  results: T[]
}

export interface ListingFilters {
  region?: string
  listing_type?: string
  comm_preference?: string
  /** The viewer's own rank; matches listings whose accepted range includes it. */
  rank?: string
  /** Role values, ANY-matched against roles_needed. */
  roles?: string[]
}

function queryString(filters: ListingFilters): string {
  const params = new URLSearchParams()
  if (filters.region) params.set('region', filters.region)
  if (filters.listing_type) params.set('listing_type', filters.listing_type)
  if (filters.comm_preference) params.set('comm_preference', filters.comm_preference)
  if (filters.rank) params.set('rank', filters.rank)
  if (filters.roles?.length) params.set('roles', filters.roles.join(','))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** The open live-queue feed (first page), filtered server-side. */
export function listListings(filters: ListingFilters = {}) {
  return apiFetch<Paginated<Listing>>(`/api/listings/${queryString(filters)}`)
}

export function createListing(payload: CreateListingInput) {
  return apiFetch<Listing>('/api/listings/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function requestJoin(listingId: string, message = '') {
  return apiFetch<JoinRequestBrief>(`/api/listings/${listingId}/join-requests/`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

/** The current user's own listings, any status, newest first. */
export function myListings() {
  return apiFetch<Paginated<Listing>>('/api/listings/mine/')
}

export function cancelListing(listingId: string) {
  return apiFetch<Listing>(`/api/listings/${listingId}/cancel/`, { method: 'POST' })
}

/** Compact listing shown alongside a requester's own outgoing requests. */
export interface ListingSummary {
  id: string
  host_username: string
  listing_type: string
  region: string
  party_size_current: number
  party_size_target: number
  status: ListingStatus
}

export interface MyJoinRequest {
  id: string
  listing: ListingSummary
  message: string
  status: JoinRequestStatus
  created_at: string
  responded_at: string | null
}

/** The current user's outgoing join requests. */
export function myJoinRequests() {
  return apiFetch<Paginated<MyJoinRequest>>('/api/join-requests/mine/')
}

/** Host accepts a request — returns the updated listing (may now be FILLED). */
export function acceptJoinRequest(requestId: string) {
  return apiFetch<Listing>(`/api/join-requests/${requestId}/accept/`, { method: 'POST' })
}

export function declineJoinRequest(requestId: string) {
  return apiFetch<JoinRequestBrief>(`/api/join-requests/${requestId}/decline/`, {
    method: 'POST',
  })
}

/** Requester withdraws their own pending request. */
export function cancelJoinRequest(requestId: string) {
  return apiFetch<JoinRequestBrief>(`/api/join-requests/${requestId}/cancel/`, {
    method: 'POST',
  })
}
