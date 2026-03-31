import { useState } from 'react'
import { Recording } from '../api/client.ts'

interface RecordingCardProps {
  recording: Recording
  onDelete: (id: string) => void
}

export default function RecordingCard({ recording, onDelete }: RecordingCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getStatusInfo = (status: Recording['status']): { classes: string; label: string } => {
    switch (status) {
      case 'RECORDING':
        return { classes: 'bg-rust/20 text-rust border-rust/40 animate-pulse', label: 'Recording' }
      case 'POST_PROCESSING':
        return { classes: 'bg-gold/20 text-gold border-gold/40 animate-pulse', label: 'Processing' }
      case 'COMPLETED':
        return { classes: 'bg-teal/20 text-teal border-teal/40', label: 'Completed' }
      case 'FAILED':
        return { classes: 'bg-rust/20 text-rust border-rust/40', label: 'Failed' }
      case 'SCHEDULED':
        return { classes: 'bg-navy-600 text-white/60 border-navy-500', label: 'Scheduled' }
      case 'CANCELLED':
        return { classes: 'bg-navy-700 text-navy-400 border-navy-600', label: 'Cancelled' }
      default:
        return { classes: 'bg-navy-700 text-navy-400 border-navy-600', label: status }
    }
  }

  const formatEpisode = () => {
    if (recording.season && recording.episode) {
      return `S${recording.season.toString().padStart(2, '0')}E${recording.episode.toString().padStart(2, '0')}`
    }
    return null
  }

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(recording.id)
      setShowDeleteConfirm(false)
    } else {
      setShowDeleteConfirm(true)
    }
  }

  const statusInfo = getStatusInfo(recording.status)

  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl p-4 shadow-card hover:shadow-card-hover hover:border-gold/30 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-white font-display mb-1">
            {recording.title}
          </h3>
          {recording.subtitle && (
            <p className="text-gold text-sm font-medium mb-1">
              {recording.subtitle}
            </p>
          )}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusInfo.classes}`}>
              {statusInfo.label}
            </span>
            {formatEpisode() && (
              <span className="font-mono text-xs text-navy-400">
                {formatEpisode()}
              </span>
            )}
          </div>
          {recording.status === 'POST_PROCESSING' && (
            <p className="text-gold/60 text-xs mb-1">Concatenating segments — will be ready shortly</p>
          )}
        </div>
      </div>

      {/* Description */}
      {recording.description && (
        <p className="text-white/50 text-sm mb-3 line-clamp-2">
          {recording.description}
        </p>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-sm text-navy-400 mb-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs">
            {formatDate(recording.scheduledStart)}
          </span>
          {recording.category && (
            <span className="text-xs">{recording.category}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs">{formatFileSize(recording.fileSize)}</span>
          <span className="font-mono text-xs">{formatDuration(recording.duration)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          {recording.status === 'COMPLETED' && recording.filePath && (
            <a
              href={`/recordings/${recording.id}/stream.m3u8`}
              className="inline-flex items-center px-3 py-1.5 bg-gold hover:bg-gold-muted text-navy font-semibold rounded text-sm transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Play
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showDeleteConfirm
                ? 'bg-rust text-white'
                : 'bg-rust/10 hover:bg-rust/20 text-rust border border-rust/30'
            }`}
          >
            {showDeleteConfirm ? 'Confirm Delete' : 'Delete'}
          </button>
          {showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 bg-navy-700 hover:bg-navy-600 border border-navy-500 rounded text-sm text-white"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {recording.status === 'FAILED' && recording.errorMessage && (
        <div className="mt-3 p-2 bg-rust/10 border border-rust/30 rounded text-sm text-rust">
          <span className="font-medium">Error:</span> {recording.errorMessage}
        </div>
      )}
    </div>
  )
}
