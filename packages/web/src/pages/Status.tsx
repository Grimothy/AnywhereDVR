import { useState, useEffect } from 'react'
import { useSocketEvent } from '../hooks/useSocket.ts'
import { getSources, Source } from '../api/client.ts'

interface ActiveRecording {
  recordingId: string
  title: string
  channelName: string
  duration?: number
  fileSize?: number
}

interface Notification {
  id: string
  type: string
  title: string
  message: string
  timestamp: Date
}

export default function Status() {
  const [activeRecordings, setActiveRecordings] = useState<ActiveRecording[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)

  // Socket event listeners
  useSocketEvent('recording:started', (data: { recordingId: string; title: string; channelName: string }) => {
    setActiveRecordings(prev => [...prev, data])
    addNotification('recording', 'Recording Started', `${data.title} on ${data.channelName}`)
  })

  useSocketEvent('recording:progress', (data: { recordingId: string; duration: number; fileSize: number }) => {
    setActiveRecordings(prev => prev.map(rec =>
      rec.recordingId === data.recordingId
        ? { ...rec, duration: data.duration, fileSize: data.fileSize }
        : rec
    ))
  })

  useSocketEvent('recording:completed', (data: { recordingId: string; title: string }) => {
    setActiveRecordings(prev => prev.filter(rec => rec.recordingId !== data.recordingId))
    addNotification('recording', 'Recording Completed', data.title)
  })

  useSocketEvent('recording:failed', (data: { recordingId: string; title: string; error: string }) => {
    setActiveRecordings(prev => prev.filter(rec => rec.recordingId !== data.recordingId))
    addNotification('error', 'Recording Failed', `${data.title}: ${data.error}`)
  })

  useSocketEvent('recording:cancelled', (data: { recordingId: string }) => {
    setActiveRecordings(prev => prev.filter(rec => rec.recordingId !== data.recordingId))
  })

  useSocketEvent('notification', (data: { id: string; type: string; title: string; message: string }) => {
    addNotification(data.type, data.title, data.message)
  })

  useSocketEvent('status:sourceSync', (data: { sourceId: string; status: string; error?: string }) => {
    const message = data.error ? `Failed: ${data.error}` : 'Completed successfully'
    addNotification('sync', 'Source Sync', message)
    fetchSources()
  })

  const addNotification = (type: string, title: string, message: string) => {
    const notification: Notification = {
      id: Date.now().toString(),
      type,
      title,
      message,
      timestamp: new Date()
    }
    setNotifications(prev => [notification, ...prev.slice(0, 9)])
  }

  const fetchSources = async () => {
    try {
      setSourcesLoading(true)
      const response = await getSources()
      setSources(response)
    } catch {
      // Handle error silently
    } finally {
      setSourcesLoading(false)
    }
  }

  useEffect(() => {
    fetchSources()
  }, [])

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '00:00:00'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 MB'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
  }

  const formatLastSync = (lastSyncAt?: string) => {
    if (!lastSyncAt) return 'Never'
    return new Date(lastSyncAt).toLocaleString()
  }

  const getNotificationDot = (type: string) => {
    switch (type) {
      case 'recording': return 'bg-teal'
      case 'error': return 'bg-rust'
      case 'sync': return 'bg-gold'
      default: return 'bg-navy-400'
    }
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="font-mono text-gold text-xs uppercase tracking-widest">
        Status
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Recordings */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-white font-display mb-4 flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-rust rounded-full animate-pulse" />
            Active Recordings
          </h2>

          {activeRecordings.length === 0 ? (
            <p className="text-navy-400 text-sm">No active recordings</p>
          ) : (
            <div className="space-y-3">
              {activeRecordings.map((recording) => (
                <div key={recording.recordingId} className="bg-navy-700 border border-navy-600 rounded-lg p-4">
                  <div className="font-medium text-white mb-1">
                    {recording.title}
                  </div>
                  <div className="text-sm text-white/50 mb-2">
                    {recording.channelName}
                  </div>
                  <div className="flex items-center gap-4 text-sm font-mono text-navy-400">
                    <span>{formatDuration(recording.duration)}</span>
                    <span>{formatFileSize(recording.fileSize)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Disk Usage */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-white font-display mb-4">
            Disk Usage
          </h2>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-navy-400 mb-2">
              <span>Used</span>
              <span>0 GB / ∞</span>
            </div>
            <div className="w-full bg-navy-700 rounded-full h-2">
              <div className="bg-teal h-2 rounded-full" style={{ width: '0%' }}></div>
            </div>
          </div>

          <p className="text-xs text-navy-500">
            Disk usage monitoring coming soon
          </p>
        </div>

        {/* Source Health */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-white font-display mb-4">
            Source Health
          </h2>

          {sourcesLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 bg-navy-700 rounded w-32"></div>
                  <div className="h-4 bg-navy-700 rounded w-24"></div>
                </div>
              ))}
            </div>
          ) : sources.length === 0 ? (
            <p className="text-navy-400 text-sm">No sources configured</p>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <div key={source.id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">{source.name}</div>
                    <div className="text-xs text-navy-400">
                      {source.type} • Last sync: {formatLastSync(source.lastSyncAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {source.syncError ? (
                      <div className="w-2.5 h-2.5 bg-rust rounded-full" title={source.syncError} />
                    ) : source.lastSyncAt ? (
                      <div className="w-2.5 h-2.5 bg-teal rounded-full" />
                    ) : (
                      <div className="w-2.5 h-2.5 bg-gold rounded-full" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-white font-display mb-4">
            Recent Activity
          </h2>

          {notifications.length === 0 ? (
            <p className="text-navy-400 text-sm">No recent activity</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notifications.map((notification) => (
                <div key={notification.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${getNotificationDot(notification.type)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm">
                      {notification.title}
                    </div>
                    <div className="text-xs text-navy-400 mb-0.5">
                      {notification.message}
                    </div>
                    <div className="text-xs text-navy-500 font-mono">
                      {notification.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
