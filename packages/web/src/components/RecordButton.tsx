import { useState } from 'react'
import { createRule, Program } from '../api/client.ts'

interface RecordButtonProps {
  program: Program
  channelId: string
  onRecord: () => void
}

export default function RecordButton({ program, channelId, onRecord }: RecordButtonProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleRecord = async (type: 'ONCE' | 'SERIES') => {
    try {
      setLoading(true)
      setStatus('idle')

      await createRule({
        type,
        channelId,
        programId: type === 'ONCE' ? program.id : undefined,
        seriesTitle: type === 'SERIES' ? program.title : undefined,
        enabled: true,
        priority: 50,
        startEarly: 60, // Start 1 minute early
        endLate: 180,   // End 3 minutes late
        newOnly: 'ALL'
      })

      setStatus('success')
      onRecord()
      
      // Reset status after 2 seconds
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'success') {
    return (
      <div className="flex gap-2">
        <div className="px-4 py-2 bg-green-900 text-green-300 border border-green-700 rounded font-medium text-sm">
          ✓ Recording scheduled
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex gap-2">
        <div className="px-4 py-2 bg-red-950 text-red-400 border border-red-800 rounded font-medium text-sm">
          ✗ Failed to schedule
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleRecord('ONCE')}
        disabled={loading}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-black font-semibold rounded text-sm transition-colors disabled:cursor-not-allowed"
      >
        {loading ? 'Scheduling...' : 'Record Once'}
      </button>
      <button
        onClick={() => handleRecord('SERIES')}
        disabled={loading}
        className="px-4 py-2 bg-surface-100 hover:bg-surface-200 disabled:bg-surface-100/50 border border-border text-gray-200 font-semibold rounded text-sm transition-colors disabled:cursor-not-allowed"
      >
        {loading ? 'Scheduling...' : 'Record Series'}
      </button>
    </div>
  )
}