import axios from 'axios'

// API client instance
const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Type definitions
interface Source {
  id: string
  name: string
  type: 'M3U' | 'XTREAM'
  m3uUrl?: string
  xcHost?: string
  xcUsername?: string
  xcPassword?: string
  epgUrl?: string
  refreshDaily: boolean
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

export async function deleteSource(id: string): Promise<void> {
  await api.delete(`/sources/${id}`)
}

export async function syncSource(id: string): Promise<void> {
  await api.post(`/sources/${id}/sync`)
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

export async function getEpgGuide(params: {
  channelIds?: string[]
  start: string
  end: string
}): Promise<Program[]> {
  const response = await api.get('/epg/guide', { params })
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

export async function deleteRule(id: string): Promise<void> {
  await api.delete(`/rules/${id}`)
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

// Export types
export type {
  Source,
  Channel,
  Program,
  Rule,
  Recording,
  PaginatedResponse
}