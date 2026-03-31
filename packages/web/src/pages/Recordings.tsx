import { useState, useMemo } from 'react'
import { useRecordings } from '../hooks/useRecordings.ts'
import { useSocketEvent } from '../hooks/useSocket.ts'
import RecordingCard from '../components/RecordingCard.tsx'
import { deleteRecording } from '../api/client.ts'

type FilterStatus = 'all' | 'recording' | 'completed' | 'failed'
type SortOption = 'newest' | 'oldest' | 'alphabetical'

export default function Recordings() {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [page, setPage] = useState(1)
  const perPage = 20

  const statusFilter = filterStatus === 'all' ? undefined : filterStatus.toUpperCase()
  
  const { recordings, total, loading, error, refetch } = useRecordings({
    status: statusFilter,
    page,
    perPage
  })

  // Auto-refresh when any recording changes state via Socket.IO
  useSocketEvent('recording:completed', () => refetch())
  useSocketEvent('recording:post_processing', () => refetch())
  useSocketEvent('recording:cancelled', () => refetch())

  const sortedRecordings = useMemo(() => {
    const sorted = [...recordings]
    
    switch (sortOption) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'oldest':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case 'alphabetical':
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
    }
    
    return sorted
  }, [recordings, sortOption])

  const handleDelete = async (id: string) => {
    try {
      await deleteRecording(id)
      await refetch()
    } catch {
      // Handle error silently for now
    }
  }

  const filterTabs: Array<{ key: FilterStatus; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'recording', label: 'Recording' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' }
  ]

  const totalPages = Math.ceil(total / perPage)

  if (loading && recordings.length === 0) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-navy-700 rounded mb-6 w-48"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-navy-700 rounded-xl p-4">
                <div className="h-6 bg-navy-600 rounded mb-3"></div>
                <div className="h-4 bg-navy-600 rounded mb-2 w-3/4"></div>
                <div className="h-4 bg-navy-600 rounded mb-4 w-1/2"></div>
                <div className="h-8 bg-navy-600 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-gold text-xs uppercase tracking-widest mb-4">
          Recordings
        </h1>
        
        {/* Filters and Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Status Filter Tabs */}
          <div className="flex gap-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setFilterStatus(tab.key)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filterStatus === tab.key
                    ? 'bg-gold text-navy font-semibold'
                    : 'bg-navy-700 text-white/50 hover:bg-navy-600 hover:text-white border border-navy-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Sort */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-navy-400">Sort:</label>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-navy-700 border border-navy-500 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gold"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="alphabetical">A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rust/10 border border-rust/30 rounded-xl p-4 mb-6">
          <p className="text-rust">Error loading recordings: {error}</p>
          <button
            onClick={refetch}
            className="mt-2 px-3 py-1.5 bg-rust/20 hover:bg-rust/30 text-rust rounded text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Recordings Grid */}
      {sortedRecordings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/50 mb-2">No recordings found</p>
          <p className="text-sm text-navy-400">
            {filterStatus === 'all' 
              ? 'Start recording shows from the Guide'
              : `No ${filterStatus} recordings`}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6">
            {sortedRecordings.map((recording) => (
              <RecordingCard
                key={recording.id}
                recording={recording}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-navy-700 hover:bg-navy-600 disabled:opacity-40 disabled:cursor-not-allowed border border-navy-500 rounded text-sm text-white"
              >
                Previous
              </button>
              <span className="px-4 py-1.5 text-sm text-white/50">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 bg-navy-700 hover:bg-navy-600 disabled:opacity-40 disabled:cursor-not-allowed border border-navy-500 rounded text-sm text-white"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
