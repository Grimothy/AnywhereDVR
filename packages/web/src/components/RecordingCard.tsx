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

  const getStatusBadge = (status: Recording['status']) => {
    const baseClasses = 'inline-flex items-center px-2 py-1 rounded text-xs font-medium border'
    
    switch (status) {
      case 'RECORDING':
        return `${baseClasses} bg-red-900 text-red-300 border-red-700 animate-pulse`
      case 'POST_PROCESSING':
        return `${baseClasses} bg-yellow-900 text-yellow-300 border-yellow-700`
      case 'COMPLETED':
        return `${baseClasses} bg-green-900 text-green-300 border-green-700`
      case 'FAILED':
        return `${baseClasses} bg-red-950 text-red-400 border-red-800`
      case 'SCHEDULED':
        return `${baseClasses} bg-blue-900 text-blue-300 border-blue-700`
      case 'CANCELLED':
        return `${baseClasses} bg-gray-900 text-gray-400 border-gray-700`
      default:
        return `${baseClasses} bg-gray-900 text-gray-400 border-gray-700`
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

  return (
    <div className="bg-surface-50 border border-border rounded-lg p-4 hover:border-amber-500/20 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-100 mb-1">
            {recording.title}
          </h3>
          {recording.subtitle && (
            <p className="text-amber-500 text-sm font-medium mb-1">
              {recording.subtitle}
            </p>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span className={getStatusBadge(recording.status)}>
              {recording.status.replace('_', ' ')}
            </span>
            {formatEpisode() && (
              <span className="font-mono text-xs text-gray-400">
                {formatEpisode()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {recording.description && (
        <p className="text-gray-400 text-sm mb-3 line-clamp-2">
          {recording.description}
        </p>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
        <div className="flex items-center gap-4">
          <span className="font-mono">
            {formatDate(recording.scheduledStart)}
          </span>
          {recording.category && (
            <span>{recording.category}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono">{formatFileSize(recording.fileSize)}</span>
          <span className="font-mono">{formatDuration(recording.duration)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          {recording.status === 'COMPLETED' && recording.filePath && (
            <a
              href={`/recordings/${recording.id}/stream.m3u8`}
              className="inline-flex items-center px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded text-sm transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Play
            </a>
          )}
        </div>
        <div>
          <button
            onClick={handleDelete}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              showDeleteConfirm
                ? 'bg-red-900 hover:bg-red-800 text-red-200'
                : 'bg-red-900/50 hover:bg-red-900 text-red-400 hover:text-red-200'
            }`}
          >
            {showDeleteConfirm ? 'Confirm Delete' : 'Delete'}
          </button>
          {showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="ml-2 px-3 py-1 bg-surface-100 hover:bg-surface-200 border border-border rounded text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {recording.status === 'FAILED' && recording.errorMessage && (
        <div className="mt-3 p-2 bg-red-950/50 border border-red-800 rounded text-sm text-red-300">
          <span className="font-medium">Error:</span> {recording.errorMessage}
        </div>
      )}
    </div>
  )
}