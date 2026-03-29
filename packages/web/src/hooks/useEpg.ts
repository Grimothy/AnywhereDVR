import { useState, useEffect } from 'react'
import { getEpgGuide, Program } from '../api/client.ts'

interface UseEpgOptions {
  channelIds?: string[]
  start: string
  end: string
}

interface UseEpgReturn {
  programs: Program[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useEpg(options: UseEpgOptions): UseEpgReturn {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEpg = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getEpgGuide(options)
      setPrograms(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch EPG data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (options.start && options.end) {
      fetchEpg()
    }
  }, [options.start, options.end, options.channelIds])

  return {
    programs,
    loading,
    error,
    refetch: fetchEpg
  }
}