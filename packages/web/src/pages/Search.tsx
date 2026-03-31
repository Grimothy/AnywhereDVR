// packages/web/src/pages/Search.tsx
// Search upcoming EPG programs and schedule recordings.

import { useState, useEffect, useRef } from 'react'
import { ProgramSearchResult, Rule, getRules, searchPrograms } from '../api/client.ts'
import ProgramDetailPanel from '../components/ProgramDetailPanel.tsx'

// ── Helpers ───────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (isToday) return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${time}`
}

function formatDuration(startStr: string, endStr: string): string {
  const mins = Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// ── Result card ───────────────────────────────────────────────

function SearchResultCard({
  result,
  selected,
  onClick,
}: {
  result: ProgramSearchResult
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-start gap-4 px-5 py-4 text-left transition-colors border-b border-navy-700 last:border-0
        ${selected ? 'bg-gold/5 border-l-2 border-l-gold' : 'hover:bg-navy-700/40'}
      `}
    >
      {/* Channel logo */}
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
        {result.channelLogo ? (
          <img
            src={result.channelLogo}
            alt=""
            className="w-10 h-10 object-contain rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-navy-600 border border-navy-500 flex items-center justify-center">
            <span className="text-xs font-bold text-white/30 uppercase">
              {result.channelName?.charAt(0) ?? '?'}
            </span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Channel line */}
        <p className="text-xs text-white/40 mb-1 truncate">
          {result.channelName}
          {result.groupTitle && (
            <span className="ml-1.5 text-white/20">· {result.groupTitle}</span>
          )}
        </p>

        {/* Title + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{result.title}</span>

          {result.season != null && result.episode != null && (
            <span className="px-1.5 py-0.5 bg-navy-700 border border-navy-500 rounded text-xs text-teal font-mono flex-shrink-0">
              S{result.season.toString().padStart(2, '0')}
              E{result.episode.toString().padStart(2, '0')}
            </span>
          )}

          {result.isNew && (
            <span className="px-1.5 py-0.5 bg-teal/20 border border-teal/40 rounded text-xs text-teal flex-shrink-0">
              NEW
            </span>
          )}

          {result.isRecording && (
            <span className="px-1.5 py-0.5 bg-rust/20 border border-rust/40 rounded text-xs text-rust flex items-center gap-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-rust rounded-full animate-pulse" />
              LIVE
            </span>
          )}

          {result.isScheduled && !result.isRecording && (
            <span className="px-1.5 py-0.5 bg-teal/10 border border-teal/20 rounded text-xs text-teal/70 flex-shrink-0">
              ✓ Scheduled
            </span>
          )}
        </div>

        {/* Subtitle */}
        {result.subtitle && (
          <p className="text-xs text-gold/80 mt-0.5 truncate">{result.subtitle}</p>
        )}

        {/* Air time + duration + category */}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs font-mono text-white/50">{formatDateTime(result.startTime)}</span>
          <span className="text-xs text-white/30">{formatDuration(result.startTime, result.endTime)}</span>
          {result.category && (
            <span className="text-xs text-white/30">· {result.category}</span>
          )}
        </div>

        {/* Genres */}
        {result.genres && result.genres.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {result.genres.slice(0, 4).map((g) => (
              <span
                key={g}
                className="px-1.5 py-0.5 bg-navy-700 border border-navy-600 rounded text-xs text-white/40"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Poster thumbnail */}
      {(result.posterUrl || result.logoUrl) && (
        <div className="flex-shrink-0 hidden sm:block">
          <img
            src={result.posterUrl || result.logoUrl || ''}
            alt=""
            className="h-16 w-auto object-contain rounded border border-navy-600 opacity-80"
          />
        </div>
      )}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error'

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProgramSearchResult[]>([])
  const [searchState, setSearchState] = useState<SearchState>('idle')

  const [selectedResult, setSelectedResult] = useState<ProgramSearchResult | null>(null)
  const [existingRules, setExistingRules] = useState<Rule[]>([])
  const [rulesLoaded, setRulesLoaded] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 2) {
      setResults([])
      setSearchState('idle')
      setSelectedResult(null)
      return
    }

    setSearchState('loading')

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchPrograms(query.trim())
        setResults(data)
        setSearchState(data.length === 0 ? 'empty' : 'results')
        setSelectedResult(null)
      } catch {
        setSearchState('error')
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const handleResultClick = async (result: ProgramSearchResult) => {
    setSelectedResult((prev) => (prev?.id === result.id ? null : result))

    if (!rulesLoaded) {
      try {
        const rules = await getRules()
        setExistingRules(rules)
        setRulesLoaded(true)
      } catch {
        // non-fatal
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-6 py-5 border-b border-navy-600 bg-navy-800 flex-shrink-0">
        <div className="relative max-w-2xl">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search upcoming programs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-navy-700 border border-navy-500 rounded-xl pl-12 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20 text-base"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-white/30 hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {searchState === 'results' && (
          <p className="text-xs text-white/30 mt-2 ml-1">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {/* Idle / prompt */}
        {searchState === 'idle' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-navy-700 border border-navy-600 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>
              <p className="text-white/40 font-medium">Search for a show</p>
              <p className="text-white/20 text-sm mt-1">Type at least 2 characters to search upcoming programs</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {searchState === 'loading' && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-white/40">
              <div className="w-5 h-5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              <span className="text-sm">Searching…</span>
            </div>
          </div>
        )}

        {/* No results */}
        {searchState === 'empty' && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <p className="text-white/40 font-medium">No upcoming programs found</p>
              <p className="text-white/20 text-sm mt-1">for "{query}"</p>
            </div>
          </div>
        )}

        {/* Error */}
        {searchState === 'error' && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <p className="text-rust/70 font-medium">Search failed</p>
              <p className="text-white/30 text-sm mt-1">Check your connection and try again</p>
            </div>
          </div>
        )}

        {/* Results list */}
        {searchState === 'results' && (
          <div>
            {results.map((result) => (
              <SearchResultCard
                key={result.id}
                result={result}
                selected={selectedResult?.id === result.id}
                onClick={() => handleResultClick(result)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedResult && (
        <ProgramDetailPanel
          program={selectedResult}
          channelId={selectedResult.channelId}
          existingRules={existingRules}
          onRuleCreated={(rule) => setExistingRules((prev) => [...prev, rule])}
          onDismiss={() => setSelectedResult(null)}
        />
      )}
    </div>
  )
}
