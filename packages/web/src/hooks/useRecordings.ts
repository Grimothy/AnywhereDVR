import { useState, useEffect } from 'react'
import { getRecordings, Recording, PaginatedResponse } from '../api/client.ts'

interface UseRecordingsOptions {
  status?: string
  title?: string
  page?: number
  perPage?: number
}

interface UseRecordingsReturn {
  recordings: Recording[]
  total: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useRecordings(options: UseRecordingsOptions = {}): UseRecordingsReturn {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecordings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response: PaginatedResponse<Recording> = await getRecordings(options)
      setRecordings(response.data)
      setTotal(response.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recordings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecordings()
  }, [options.status, options.title, options.page, options.perPage])

  return {
    recordings,
    total,
    loading,
    error,
    refetch: fetchRecordings
  }
}