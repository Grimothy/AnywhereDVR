import { useEffect, useState, useCallback, useMemo } from 'react'
import { getUpcomingSchedule, cancelRecording, Recording } from '../api/client.ts'

export default function Schedule() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const loadSchedule = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getUpcomingSchedule()
      setRecordings(data)
    } catch {
      setError('Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  const groupedRecordings = useMemo(() => {
    const groups = new Map<string, Recording[]>()

    recordings.forEach((recording) => {
      const date = new Date(recording.scheduledStart).toDateString()
      const existing = groups.get(date) || []
      existing.push(recording)
      groups.set(date, existing)
    })

    return Array.from(groups.entries())
  }, [recordings])

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  }

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const getDuration = (start: string, end: string) => {
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this scheduled recording?')) return
    try {
      setCancellingId(id)
      await cancelRecording(id)
      setRecordings((prev) =>
        prev.filter((r) => r.id !== id),
      )
    } catch {
      // TODO: surface toast
    } finally {
      setCancellingId(null)
    }
  }

  const getRuleTypeBadge = (rule?: Recording['rule']) => {
    const type = rule?.type ?? 'ONCE'
    const baseClasses = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono border'
    switch (type) {
      case 'SERIES':
        return <span className={`${baseClasses} bg-teal/20 text-teal border-teal/30`}>Series</span>
      case 'ONCE':
        return <span className={`${baseClasses} bg-gold/20 text-gold border-gold/30`}>Once</span>
      case 'MANUAL':
        return <span className={`${baseClasses} bg-navy-600 text-white/60 border-navy-500`}>Manual</span>
      default:
        return <span className={`${baseClasses} bg-navy-700 text-navy-400 border-navy-600`}>{type}</span>
    }
  }

  const getStatusBadge = (status: Recording['status']) => {
    if (status === 'RECORDING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rust/20 text-rust border border-rust/30">
          <span className="w-1.5 h-1.5 bg-rust rounded-full animate-pulse" />
          Live
        </span>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-gold text-xs uppercase tracking-widest mb-6">Schedule</h1>
        <div className="animate-pulse space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-5 bg-navy-700 rounded mb-3 w-32" />
              <div className="space-y-2">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-14 bg-navy-700 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-gold text-xs uppercase tracking-widest mb-6">Schedule</h1>
        <div className="bg-rust/10 border border-rust/30 rounded-xl p-4">
          <p className="text-rust">{error}</p>
          <button onClick={loadSchedule} className="mt-2 text-sm text-gold hover:text-gold-muted">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-mono text-gold text-xs uppercase tracking-widest">Schedule</h1>
        <span className="text-xs text-navy-400">
          {recordings.length} upcoming recording{recordings.length !== 1 ? 's' : ''}
        </span>
      </div>

      {groupedRecordings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/50 mb-2">No upcoming recordings scheduled</p>
          <p className="text-sm text-navy-400">
            Create recording rules from the Guide to see scheduled recordings here
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedRecordings.map(([dateStr, dayRecordings]) => (
            <div key={dateStr}>
              <h2 className="font-semibold text-white font-display mb-3 pb-2 border-b border-navy-600">
                {getDateLabel(dateStr)}
              </h2>

              <div className="space-y-2">
                {dayRecordings.map((recording) => (
                  <div
                    key={recording.id}
                    className="flex items-center gap-3 p-3 bg-navy-800 border border-navy-600 rounded-xl hover:border-gold/30 transition-colors shadow-card"
                  >
                    {/* Time */}
                    <div className="w-20 text-sm font-mono text-white/50 flex-shrink-0">
                      {formatTime(recording.scheduledStart)}
                    </div>

                    {/* Duration */}
                    <div className="w-14 text-xs text-navy-400 flex-shrink-0">
                      {getDuration(recording.scheduledStart, recording.scheduledEnd)}
                    </div>

                    {/* Channel */}
                    <div className="w-36 text-sm text-white/60 truncate flex-shrink-0">
                      {recording.channel?.name ?? '—'}
                    </div>

                    {/* Title + subtitle */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate flex items-center gap-2">
                        {recording.title}
                        {getStatusBadge(recording.status)}
                      </div>
                      {recording.subtitle && (
                        <div className="text-xs text-gold truncate">{recording.subtitle}</div>
                      )}
                    </div>

                    {/* Episode */}
                    {recording.season != null && recording.episode != null && (
                      <div className="text-xs font-mono text-navy-400 flex-shrink-0 hidden sm:block">
                        S{recording.season.toString().padStart(2, '0')}
                        E{recording.episode.toString().padStart(2, '0')}
                      </div>
                    )}

                    {/* Rule type */}
                    <div className="flex-shrink-0 hidden md:block">
                      {getRuleTypeBadge(recording.rule)}
                    </div>

                    {/* Cancel */}
                    <div className="flex-shrink-0">
                      <button
                        onClick={() => handleCancel(recording.id)}
                        disabled={cancellingId === recording.id}
                        className="text-navy-400 hover:text-rust text-sm transition-colors disabled:opacity-50"
                        title="Cancel recording"
                      >
                        {cancellingId === recording.id ? '…' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
