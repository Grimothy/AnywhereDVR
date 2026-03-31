import axios from 'axios'

// API client instance
const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Type definitions
interface Source {
  id: string
  name: string
  type: 'M3U' | 'XTREAM'
  m3uUrl?: string | null
  xcHost?: string | null
  xcUsername?: string | null
  xcPassword?: string | null
  epgUrl?: string | null
  refreshDaily: boolean
  disabledGroups?: string[]
  lastSyncAt?: string
  syncError?: string
  createdAt: string
  updatedAt: string
}

interface Channel {
  id: string
  sourceId: string
  name: string
  channelNumber?: number
  groupTitle?: string
  streamUrl: string
  streamType: string
  tvgId?: string
  tvgName?: string
  tvgLogo?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface Program {
  id: string
  channelId: string
  title: string
  subtitle?: string
  description?: string
  category?: string
  startTime: string
  endTime: string
  season?: number
  episode?: number
  iconUrl?: string
  isNew: boolean
  isScheduled?: boolean
  isRecording?: boolean
  recordingId?: string | null
  // TMDB enrichment
  posterUrl?: string | null
  backdropUrl?: string | null
  logoUrl?: string | null
  overview?: string | null
  genres?: string[]
}

interface Rule {
  id: string
  type: 'SERIES' | 'ONCE' | 'MANUAL'
  channelId?: string
  seriesTitle?: string
  programId?: string
  manualStart?: string
  manualEnd?: string
  newOnly: 'ALL' | 'NEW_ONLY'
  priority: number
  enabled: boolean
  keepLast?: number
  startEarly: number
  endLate: number
  createdAt: string
  updatedAt: string
}

interface Recording {
  id: string
  ruleId?: string
  channelId: string
  programId?: string
  title: string
  subtitle?: string
  description?: string
  season?: number
  episode?: number
  category?: string
  scheduledStart: string
  scheduledEnd: string
  actualStart?: string
  actualEnd?: string
  filePath?: string
  livePath?: string
  fileSize?: number
  duration?: number
  comskipStatus?: string
  edlPath?: string
  tmdbId?: number
  posterUrl?: string
  backdropUrl?: string
  sidecarPath?: string
  status: 'SCHEDULED' | 'RECORDING' | 'POST_PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  errorMessage?: string
  ffmpegPid?: number
  createdAt: string
  updatedAt: string
  // Included relations (when the API joins them)
  channel?: { id: string; name: string; tvgLogo?: string | null } | null
  rule?: { id: string; type: string; seriesTitle?: string | null } | null
}

interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    perPage: number
  }
}

// API functions
export async function getSources(): Promise<Source[]> {
  const response = await api.get('/sources')
  return response.data.data
}

export async function createSource(data: Partial<Source>): Promise<Source> {
  const response = await api.post('/sources', data)
  return response.data.data
}

export async function updateSource(id: string, data: Partial<Source>): Promise<Source> {
  const response = await api.put(`/sources/${id}`, data)
  return response.data.data
}

export async function deleteSource(id: string): Promise<void> {
  await api.delete(`/sources/${id}`)
}

export async function syncSource(id: string): Promise<void> {
  await api.post(`/sources/${id}/sync`)
}

export interface SourceGroup {
  name: string
  count: number
  disabled: boolean
}

export async function getSourceGroups(id: string): Promise<SourceGroup[]> {
  const response = await api.get(`/sources/${id}/groups`)
  return response.data.data
}

export async function updateSourceGroups(id: string, disabledGroups: string[]): Promise<string[]> {
  const response = await api.put(`/sources/${id}/groups`, { disabledGroups })
  return response.data.data.disabledGroups
}

export async function getChannels(params?: {
  sourceId?: string
  groupTitle?: string
  search?: string
  page?: number
  perPage?: number
}): Promise<PaginatedResponse<Channel>> {
  const response = await api.get('/channels', { params })
  return response.data
}

export interface ChannelGroup {
  name: string
  count: number
}

export async function getGroups(): Promise<ChannelGroup[]> {
  const response = await api.get('/channels/groups/list')
  return response.data.data
}

export async function getEpgGuide(params: {
  channelIds?: string[]
  start: string
  end: string
}): Promise<Program[]> {
  const { channelIds, ...rest } = params
  const response = await api.get('/epg', {
    params: {
      ...rest,
      // Backend expects comma-separated string, not array
      ...(channelIds && channelIds.length > 0 ? { channelIds: channelIds.join(',') } : {}),
    },
  })
  // Backend returns { data: { channels: [{ channelId, programs: [] }] } }
  // Flatten into a single Program[] with channelId on each program
  const channels: Array<{ channelId: string; programs: Program[] }> = response.data.data.channels ?? []
  return channels.flatMap(ch => ch.programs.map(p => ({ ...p, channelId: ch.channelId })))
}

export interface ProgramSearchResult extends Program {
  channelId: string
  channelName: string
  channelLogo?: string | null
  channelNumber?: number | null
  groupTitle?: string | null
}

export async function searchPrograms(q: string, limit = 50): Promise<ProgramSearchResult[]> {
  const response = await api.get('/epg/search', { params: { q, limit } })
  return response.data.data.programs
}

export async function getChannelSchedule(channelId: string): Promise<{
  channelId: string
  channelName: string
  channelLogo?: string | null
  programs: Program[]
}> {
  const response = await api.get(`/epg/${channelId}`)
  return response.data.data
}

export async function getRules(): Promise<Rule[]> {
  const response = await api.get('/rules')
  return response.data.data
}

export async function createRule(data: Partial<Rule>): Promise<Rule> {
  const response = await api.post('/rules', data)
  return response.data.data
}

export async function updateRule(id: string, data: Partial<Rule>): Promise<Rule> {
  const response = await api.put(`/rules/${id}`, data)
  return response.data.data
}

export async function deleteRule(id: string): Promise<void> {
  await api.delete(`/rules/${id}`)
}

export interface RulePreviewProgram {
  id: string
  title: string
  subtitle?: string | null
  startTime: string
  endTime: string
  season?: number | null
  episode?: number | null
  isNew: boolean
  channel: { id: string; name: string; tvgLogo?: string | null }
  recordingStatus: string | null
}

export async function getRulePreview(id: string): Promise<RulePreviewProgram[]> {
  const response = await api.get(`/rules/${id}/preview`)
  return response.data.data
}

export async function getRecordings(params?: {
  status?: string
  title?: string
  page?: number
  perPage?: number
}): Promise<PaginatedResponse<Recording>> {
  const response = await api.get('/recordings', { params })
  return response.data
}

export async function deleteRecording(id: string): Promise<void> {
  await api.delete(`/recordings/${id}`)
}

export async function cancelRecording(id: string): Promise<Recording> {
  const response = await api.post(`/recordings/${id}/cancel`)
  return response.data.data
}

export async function getUpcomingSchedule(): Promise<Recording[]> {
  const response = await api.get('/recordings/schedule/upcoming')
  return response.data.data
}

// ── Image proxy ──────────────────────────────────────────────
//
// Routes all external image URLs through the server-side proxy so that:
//  - CORS issues are eliminated (images served from same origin)
//  - Dead URLs (HTTP 204, empty body, etc.) return a proper 404 so
//    the browser fires onError and the fallback chain works correctly
//
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  // Already proxied or a relative URL — pass through
  if (url.startsWith('/api/v1/proxy/') || url.startsWith('/')) return url
  const encoded = btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `/api/v1/proxy/image?url=${encoded}`
}

// Export types
export type {
  Source,
  Channel,
  Program,
  Rule,
  Recording,
  PaginatedResponse,
}

// ── Settings ────────────────────────────────────────────────

export interface AppSettings {
  maxConcurrentStreams?: string
  globalDiskQuotaGB?: string
  recordingsBasePath?: string
  startEarlySeconds?: string
  endLateSeconds?: string
  epgRefreshIntervalHours?: string
  epgDaysAhead?: string
  sourceRefreshIntervalHours?: string
  enableComskip?: string
  enableTmdbEnrichment?: string
  tmdbApiKey?: string
  ffmpegPath?: string
  comskipPath?: string
}

export async function getSettings(): Promise<AppSettings> {
  const response = await api.get('/settings')
  return response.data.data
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const response = await api.put('/settings', data)
  return response.data.data
}

// ── Users ────────────────────────────────────────────────────

export interface AppUser {
  id: string
  username: string
  role: 'ADMIN' | 'USER'
  storageQuotaGB: number | null
  assignedSourceIds: string[]
  assignedGroups: string[]
  playlistToken: string | null
  requireToken: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateUserData {
  username: string
  password: string
  role?: 'ADMIN' | 'USER'
  storageQuotaGB?: number | null
  assignedSourceIds?: string[]
  assignedGroups?: string[]
  requireToken?: boolean
}

export interface UpdateUserData {
  username?: string
  password?: string
  role?: 'ADMIN' | 'USER'
  storageQuotaGB?: number | null
  assignedSourceIds?: string[]
  assignedGroups?: string[]
  requireToken?: boolean
  isActive?: boolean
}

export async function getUsers(): Promise<AppUser[]> {
  const response = await api.get('/users')
  return response.data.data
}

export async function getUser(id: string): Promise<AppUser> {
  const response = await api.get(`/users/${id}`)
  return response.data.data
}

export async function createUser(data: CreateUserData): Promise<AppUser> {
  const response = await api.post('/users', data)
  return response.data.data
}

export async function updateUser(id: string, data: UpdateUserData): Promise<AppUser> {
  const response = await api.put(`/users/${id}`, data)
  return response.data.data
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`)
}

export async function regeneratePlaylistToken(id: string): Promise<{ playlistToken: string }> {
  const response = await api.post(`/users/${id}/regenerate-token`)
  return response.data.data
}

// ── Insights ─────────────────────────────────────────────────

export interface InsightSuggestion {
  type: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'tip'
  action?: string
  actionTarget?: string
}

export interface InsightsData {
  stats: {
    totalCompleted: number
    totalStorageBytes: string
    avgDurationSeconds: number
    statusBreakdown: Record<string, number>
    activePasses: number
    totalPasses: number
    upcomingCount: number
  }
  topCategories: Array<{ category: string; count: number }>
  topChannels: Array<{ channelId: string; name: string; tvgLogo: string | null; count: number }>
  suggestions: InsightSuggestion[]
  recentFailed: Array<{
    id: string
    title: string
    scheduledStart: string
    errorMessage?: string
    channel?: { id: string; name: string; tvgLogo?: string | null } | null
  }>
  upcoming: Array<{
    id: string
    title: string
    scheduledStart: string
    scheduledEnd: string
    status: string
    channel?: { id: string; name: string; tvgLogo?: string | null } | null
  }>
}

export async function getInsights(): Promise<InsightsData> {
  const response = await api.get('/insights')
  return response.data.data
}