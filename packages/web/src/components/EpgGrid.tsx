import { useState, useEffect, useMemo, useCallback } from 'react'
import { getChannels, getGroups, Channel, ChannelGroup } from '../api/client.ts'
import { useEpg } from '../hooks/useEpg.ts'
import { Program } from '../api/client.ts'

interface EpgGridProps {
  onProgramSelect?: (program: Program, channelId: string) => void
  onChannelClick?: (channelId: string) => void
  selectedProgramId?: string | null
}

const WINDOW_HOURS = 8
const SLOT_MINUTES = 30
const PIXELS_PER_SLOT = 88
const CHANNEL_COLUMN_WIDTH = 220

export default function EpgGrid({ onProgramSelect, onChannelClick, selectedProgramId }: EpgGridProps) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [groups, setGroups] = useState<ChannelGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [totalChannelCount, setTotalChannelCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const now = new Date()
    now.setMinutes(0, 0, 0)
    return now
  })

  const currentWindowStart = useMemo(() => {
    const d = new Date(anchorDate)
    d.setMinutes(0, 0, 0)
    return d
  }, [anchorDate])

  const windowEnd = useMemo(() => {
    const end = new Date(currentWindowStart)
    end.setHours(end.getHours() + WINDOW_HOURS)
    return end
  }, [currentWindowStart])

  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return channels
    return channels.filter((channel) => {
      const number = channel.channelNumber?.toString() ?? ''
      return channel.name.toLowerCase().includes(q) || number.includes(q)
    })
  }, [channels, searchQuery])

  const channelIds = useMemo(
    () => (channelsLoading ? undefined : filteredChannels.map((c) => c.id)),
    [filteredChannels, channelsLoading],
  )

  const { programs, loading: epgLoading, error } = useEpg({
    channelIds,
    start: currentWindowStart.toISOString(),
    end: windowEnd.toISOString(),
  })

  const programsByChannel = useMemo(() => {
    const grouped = new Map<string, Program[]>()
    programs.forEach((program) => {
      const channelPrograms = grouped.get(program.channelId) || []
      channelPrograms.push(program)
      grouped.set(program.channelId, channelPrograms)
    })
    grouped.forEach((channelPrograms) => {
      channelPrograms.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      )
    })
    return grouped
  }, [programs])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setChannelsLoading(true)
        const [channelsRes, groupsRes] = await Promise.all([
          getChannels({ groupTitle: selectedGroup || undefined, perPage: 200 }),
          getGroups(),
        ])
        setChannels(channelsRes.data)
        setGroups(groupsRes)
        const total = groupsRes.reduce((sum, g) => sum + g.count, 0)
        setTotalChannelCount(total)
      } catch {
        setChannels([])
      } finally {
        setChannelsLoading(false)
      }
    }
    fetchData()
  }, [selectedGroup])

  const goToNow = () => {
    const now = new Date()
    now.setMinutes(0, 0, 0)
    setAnchorDate(now)
  }

  const navigateHours = (hours: number) => {
    const next = new Date(anchorDate)
    next.setHours(next.getHours() + hours)
    setAnchorDate(next)
  }

  const navigateDays = (days: number) => {
    const next = new Date(anchorDate)
    next.setDate(next.getDate() + days)
    setAnchorDate(next)
  }

  const goToDate = (dateStr: string) => {
    const next = new Date(dateStr)
    next.setHours(anchorDate.getHours(), 0, 0, 0)
    setAnchorDate(next)
  }

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const formatDate = (date: Date) =>
    date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  const getProgramWidth = useCallback((program: Program) => {
    const start = new Date(program.startTime)
    const end = new Date(program.endTime)
    const duration = (end.getTime() - start.getTime()) / (1000 * 60)
    return Math.max(90, (duration / SLOT_MINUTES) * PIXELS_PER_SLOT)
  }, [])

  const getProgramOffset = useCallback((program: Program) => {
    const programStart = new Date(program.startTime)
    const offsetMinutes =
      (programStart.getTime() - currentWindowStart.getTime()) / (1000 * 60)
    return Math.max(0, (offsetMinutes / SLOT_MINUTES) * PIXELS_PER_SLOT)
  }, [currentWindowStart])

  const isNowVisible = () => {
    const now = new Date()
    return now >= currentWindowStart && now <= windowEnd
  }

  const getNowPosition = () => {
    if (!isNowVisible()) return 0
    const now = new Date()
    const offsetMinutes = (now.getTime() - currentWindowStart.getTime()) / (1000 * 60)
    return CHANNEL_COLUMN_WIDTH + (offsetMinutes / SLOT_MINUTES) * PIXELS_PER_SLOT
  }

  const timeSlots = useMemo(() => {
    const slots = []
    const current = new Date(currentWindowStart)
    while (current < windowEnd) {
      slots.push(new Date(current))
      current.setMinutes(current.getMinutes() + SLOT_MINUTES)
    }
    return slots
  }, [currentWindowStart, windowEnd])

  if (channelsLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Keep the toolbar visible during channel load so it doesn't jump */}
        <div className="p-4 border-b border-navy-600 bg-navy-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-mono text-gold text-xs uppercase tracking-widest mb-1">Guide</h2>
              <div className="h-4 w-40 bg-navy-700 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-10 bg-navy-700 rounded animate-pulse" />
              <div className="h-8 w-16 bg-navy-700 rounded animate-pulse" />
              <div className="h-8 w-10 bg-navy-700 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="h-12 w-48 bg-navy-700 rounded animate-pulse flex-shrink-0" />
              <div className="h-12 flex-1 bg-navy-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <p className="text-white/60 mb-2">No EPG data available</p>
          <p className="text-sm text-navy-400">Add a source with working EPG in Settings</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-navy-600 bg-navy-800 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-mono text-gold text-xs uppercase tracking-widest mb-1">Guide</h2>
            <p className="text-sm text-white/50">
              {formatDate(currentWindowStart)} • {formatTime(currentWindowStart)} - {formatTime(windowEnd)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateHours(-4)}
              className="px-2 py-1 bg-navy-700 hover:bg-navy-600 border border-navy-500 rounded text-sm text-white/60"
            >
              -4h
            </button>
            <button
              onClick={goToNow}
              className="px-3 py-1 bg-gold hover:bg-gold-muted text-navy font-semibold rounded text-sm"
            >
              Now
            </button>
            <button
              onClick={() => navigateHours(4)}
              className="px-2 py-1 bg-navy-700 hover:bg-navy-600 border border-navy-500 rounded text-sm text-white/60"
            >
              +4h
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs text-navy-400 mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find channel..."
              className="w-full px-3 py-2 bg-navy-700 border border-navy-500 rounded text-sm text-white focus:outline-none focus:border-gold placeholder-navy-400"
            />
          </div>
          <div>
            <label className="block text-xs text-navy-400 mb-1">Group</label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-2 bg-navy-700 border border-navy-500 rounded text-sm text-white focus:outline-none focus:border-gold"
            >
              <option value="">All ({totalChannelCount})</option>
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name} ({g.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-navy-400 mb-1">Date</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigateDays(-1)}
                className="px-2 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-500 rounded text-sm text-white/60"
                title="Previous day"
              >
                ‹
              </button>
              <input
                type="date"
                value={anchorDate.toISOString().split('T')[0]}
                onChange={(e) => goToDate(e.target.value)}
                className="flex-1 px-2 py-2 bg-navy-700 border border-navy-500 rounded text-sm text-white focus:outline-none focus:border-gold"
              />
              <button
                onClick={() => navigateDays(1)}
                className="px-2 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-500 rounded text-sm text-white/60"
                title="Next day"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        <div className="text-xs text-navy-400">
          Showing {filteredChannels.length} of {channels.length} channels
          {epgLoading ? ' • Loading guide...' : ''}
        </div>
      </div>

      <div className="flex-1 overflow-auto relative">
        <div className="sticky top-0 z-10 bg-navy-800 border-b border-navy-600 flex">
          <div
            className="p-2 border-r border-navy-600 text-xs text-navy-400 font-medium"
            style={{ width: `${CHANNEL_COLUMN_WIDTH}px`, minWidth: `${CHANNEL_COLUMN_WIDTH}px` }}
          >
            Channel
          </div>
          {timeSlots.map((time, i) => (
            <div
              key={i}
              className="p-2 text-center border-r border-navy-600 font-mono text-xs text-navy-400"
              style={{ minWidth: `${PIXELS_PER_SLOT}px` }}
            >
              {formatTime(time)}
            </div>
          ))}
        </div>

        <div className="relative">
          {filteredChannels.map((channel) => (
            <div key={channel.id} className="flex border-b border-navy-700 min-h-14 relative">
              <button
                type="button"
                onClick={() => onChannelClick?.(channel.id)}
                className="p-2 border-r border-navy-600 bg-navy-800 flex items-center hover:bg-navy-700 transition-colors"
                style={{ width: `${CHANNEL_COLUMN_WIDTH}px`, minWidth: `${CHANNEL_COLUMN_WIDTH}px` }}
              >
                <div className="min-w-0 text-left">
                  <div className="font-semibold text-sm text-white truncate">{channel.name}</div>
                  {channel.channelNumber && (
                    <div className="text-xs text-navy-400">CH {channel.channelNumber}</div>
                  )}
                </div>
              </button>

              <div className="flex-1 relative h-14">
                {epgLoading ? (
                  <div className="absolute inset-1 bg-navy-700 rounded animate-pulse opacity-50" />
                ) : (
                  programsByChannel.get(channel.id)?.map((program) => {
                  const isSelected = program.id === selectedProgramId
                  return (
                    <button
                      key={program.id}
                      type="button"
                      className={`absolute top-1 bottom-1 border rounded px-2 py-1 overflow-hidden text-left flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'bg-gold/20 border-gold text-white'
                          : 'bg-navy-700 border-navy-600 hover:bg-navy-600 text-white/60'
                      }`}
                      style={{
                        left: `${getProgramOffset(program)}px`,
                        width: `${getProgramWidth(program)}px`,
                      }}
                      onClick={() => onProgramSelect?.(program, channel.id)}
                    >
                      {(program.posterUrl || program.logoUrl) && (
                        <img
                          src={program.logoUrl || program.posterUrl || ''}
                          alt=""
                          className="h-8 w-8 object-contain rounded flex-shrink-0 opacity-80"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{program.title}</div>
                        <div className="text-[11px] text-navy-400 truncate">
                          {formatTime(new Date(program.startTime))} - {formatTime(new Date(program.endTime))}
                        </div>
                      </div>
                    </button>
                  )
                })
                )}
              </div>
            </div>
          ))}

          {isNowVisible() && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gold z-20 pointer-events-none"
              style={{ left: `${getNowPosition()}px` }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
