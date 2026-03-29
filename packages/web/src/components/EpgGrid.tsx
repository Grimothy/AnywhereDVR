import { useState, useEffect, useMemo } from 'react'
import { getChannels, Channel } from '../api/client.ts'
import { useEpg } from '../hooks/useEpg.ts'
import { Program } from '../api/client.ts'

interface EpgGridProps {
  onProgramSelect?: (program: Program, channelId: string) => void
}

export default function EpgGrid({ onProgramSelect }: EpgGridProps) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [currentWindowStart, setCurrentWindowStart] = useState(() => {
    // Start at current time, rounded to nearest 30 minutes
    const now = new Date()
    const minutes = now.getMinutes()
    const roundedMinutes = Math.floor(minutes / 30) * 30
    now.setMinutes(roundedMinutes, 0, 0)
    return now
  })

  const windowEnd = useMemo(() => {
    const end = new Date(currentWindowStart)
    end.setHours(end.getHours() + 6) // 6-hour window
    return end
  }, [currentWindowStart])

  const channelIds = useMemo(() => channels.map(c => c.id), [channels])

  const { programs, loading: epgLoading, error } = useEpg({
    channelIds,
    start: currentWindowStart.toISOString(),
    end: windowEnd.toISOString()
  })

  // Group programs by channel
  const programsByChannel = useMemo(() => {
    const grouped = new Map<string, Program[]>()
    programs.forEach(program => {
      const channelPrograms = grouped.get(program.channelId) || []
      channelPrograms.push(program)
      grouped.set(program.channelId, channelPrograms)
    })
    // Sort programs by start time for each channel
    grouped.forEach(programs => {
      programs.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    })
    return grouped
  }, [programs])

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        setChannelsLoading(true)
        const response = await getChannels({ perPage: 100 })
        setChannels(response.data)
      } catch (err) {
        // Handle error silently for now
      } finally {
        setChannelsLoading(false)
      }
    }
    fetchChannels()
  }, [])

  const goToNow = () => {
    const now = new Date()
    const minutes = now.getMinutes()
    const roundedMinutes = Math.floor(minutes / 30) * 30
    now.setMinutes(roundedMinutes, 0, 0)
    setCurrentWindowStart(now)
  }

  const navigateTime = (hours: number) => {
    const newStart = new Date(currentWindowStart)
    newStart.setHours(newStart.getHours() + hours)
    setCurrentWindowStart(newStart)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const getProgramWidth = (program: Program) => {
    const start = new Date(program.startTime)
    const end = new Date(program.endTime)
    const duration = (end.getTime() - start.getTime()) / (1000 * 60) // minutes
    return Math.max(120, (duration / 30) * 120) // 120px per 30-min slot, minimum 120px
  }

  const getProgramOffset = (program: Program) => {
    const programStart = new Date(program.startTime)
    const windowStart = currentWindowStart
    const offsetMinutes = (programStart.getTime() - windowStart.getTime()) / (1000 * 60)
    return Math.max(0, (offsetMinutes / 30) * 120) // 120px per 30-min slot
  }

  const isNowVisible = () => {
    const now = new Date()
    return now >= currentWindowStart && now <= windowEnd
  }

  const getNowPosition = () => {
    if (!isNowVisible()) return 0
    const now = new Date()
    const offsetMinutes = (now.getTime() - currentWindowStart.getTime()) / (1000 * 60)
    return 160 + (offsetMinutes / 30) * 120 // 160px channel column + offset
  }

  const timeSlots = useMemo(() => {
    const slots = []
    const current = new Date(currentWindowStart)
    while (current < windowEnd) {
      slots.push(new Date(current))
      current.setMinutes(current.getMinutes() + 30)
    }
    return slots
  }, [currentWindowStart, windowEnd])

  if (channelsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-surface-50 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-40 h-12 bg-surface-50 rounded"></div>
                <div className="flex gap-2 flex-1">
                  <div className="w-32 h-12 bg-surface-50 rounded"></div>
                  <div className="w-48 h-12 bg-surface-50 rounded"></div>
                  <div className="w-24 h-12 bg-surface-50 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">No EPG data available</p>
          <p className="text-sm text-gray-500">Add a source with EPG URL in Settings</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Time Navigation */}
      <div className="p-4 border-b border-border bg-surface-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-amber-500 text-xs uppercase tracking-widest mb-1">
              Guide
            </h2>
            <p className="text-sm text-gray-400">
              {formatDate(currentWindowStart)} • {formatTime(currentWindowStart)} - {formatTime(windowEnd)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigateTime(-3)}
              className="px-3 py-1 bg-surface-100 hover:bg-surface-200 border border-border rounded text-sm"
            >
              ← 3h
            </button>
            <button
              onClick={goToNow}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded text-sm"
            >
              Now
            </button>
            <button
              onClick={() => navigateTime(3)}
              className="px-3 py-1 bg-surface-100 hover:bg-surface-200 border border-border rounded text-sm"
            >
              3h →
            </button>
          </div>
        </div>
      </div>

      {/* EPG Grid */}
      <div className="flex-1 overflow-auto relative">
        {/* Time Header */}
        <div className="sticky top-0 z-10 bg-surface-100 border-b border-border flex">
          <div className="w-40 p-2 border-r border-border"></div>
          {timeSlots.map((time, i) => (
            <div 
              key={i} 
              className="w-30 p-2 text-center border-r border-border font-mono text-xs text-gray-400"
              style={{ minWidth: '120px' }}
            >
              {formatTime(time)}
            </div>
          ))}
        </div>

        {/* Channel Rows */}
        <div className="relative">
          {channels.map((channel) => (
            <div key={channel.id} className="flex border-b border-border-muted min-h-16 relative">
              {/* Channel Name */}
              <div className="w-40 p-3 border-r border-border bg-surface-50 flex items-center">
                <div>
                  <div className="font-semibold text-sm text-gray-200 truncate">
                    {channel.name}
                  </div>
                  {channel.channelNumber && (
                    <div className="text-xs text-gray-400">
                      {channel.channelNumber}
                    </div>
                  )}
                </div>
              </div>

              {/* Program Cells */}
              <div className="flex-1 relative h-16">
                {programsByChannel.get(channel.id)?.map((program) => (
                  <div
                    key={program.id}
                    className="absolute top-1 bottom-1 bg-surface-100 border border-border hover:bg-surface-200 cursor-pointer rounded px-2 py-1 overflow-hidden"
                    style={{
                      left: `${getProgramOffset(program)}px`,
                      width: `${getProgramWidth(program)}px`,
                    }}
                    onClick={() => {
                      setSelectedProgram(program)
                      onProgramSelect?.(program, channel.id)
                    }}
                  >
                    <div className="text-sm font-medium text-gray-200 truncate">
                      {program.title}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {formatTime(new Date(program.startTime))} - {formatTime(new Date(program.endTime))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Now Line */}
          {isNowVisible() && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-20 pointer-events-none"
              style={{ left: `${getNowPosition()}px` }}
            />
          )}
        </div>

        {/* Program Details Panel */}
        {selectedProgram && (
          <div className="absolute bottom-0 left-0 right-0 bg-surface-100 border-t border-border p-4 shadow-lg">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-gray-100 mb-1">
                  {selectedProgram.title}
                </h3>
                {selectedProgram.subtitle && (
                  <p className="text-amber-500 font-medium mb-2">
                    {selectedProgram.subtitle}
                  </p>
                )}
                <p className="text-sm text-gray-400 mb-2 font-mono">
                  {formatTime(new Date(selectedProgram.startTime))} - {formatTime(new Date(selectedProgram.endTime))} • {selectedProgram.category}
                </p>
                {selectedProgram.description && (
                  <p className="text-gray-300 text-sm mb-4">
                    {selectedProgram.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedProgram(null)}
                className="text-gray-400 hover:text-gray-200 text-xl ml-4"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}