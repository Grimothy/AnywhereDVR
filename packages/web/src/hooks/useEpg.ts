import { useState, useEffect, useRef } from 'react'
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
  refetch: () => void
}

export function useEpg(options: UseEpgOptions): UseEpgReturn {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Serialize channelIds to a stable string so the effect only re-runs when
  // the actual IDs change, not when the array reference changes each render.
  const channelKey = options.channelIds ? options.channelIds.join(',') : ''

  // Keep a ref to the latest options so the fetch function always uses current
  // values without being listed as an effect dependency.
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Track the latest fetch so stale responses from previous windows are ignored.
  const fetchIdRef = useRef(0)

  const refetch = () => {
    fetchIdRef.current += 1
    const myFetchId = fetchIdRef.current
    const { channelIds, start, end } = optionsRef.current

    if (!start || !end) return

    setLoading(true)
    setError(null)

    getEpgGuide({ channelIds, start, end })
      .then((data) => {
        if (fetchIdRef.current !== myFetchId) return // stale response, discard
        setPrograms(data)
      })
      .catch((err) => {
        if (fetchIdRef.current !== myFetchId) return
        setError(err instanceof Error ? err.message : 'Failed to fetch EPG data')
        setPrograms([])
      })
      .finally(() => {
        if (fetchIdRef.current !== myFetchId) return
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!options.start || !options.end) return
    // channelIds === undefined means channels haven't loaded yet; skip to avoid
    // a wasted request that returns all channels, then a second request once
    // the real channel list arrives.
    if (options.channelIds === undefined) return
    // An explicitly empty array (filtered to zero results) also means nothing to fetch.
    if (options.channelIds.length === 0) return
    // Clear stale data immediately so the grid doesn't show the wrong window's programs
    setPrograms([])
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.start, options.end, channelKey])

  return { programs, loading, error, refetch }
}
