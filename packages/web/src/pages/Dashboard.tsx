// packages/web/src/pages/Dashboard.tsx
// Home page: EPG program search + DVR insights and smart suggestions.

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getInsights,
  searchPrograms,
  createRule,
  getRules,
  InsightsData,
  InsightSuggestion,
  ProgramSearchResult,
  Rule,
} from '../api/client.ts'
import ProgramDetailPanel from '../components/ProgramDetailPanel.tsx'

// ── Helpers ───────────────────────────────────────────────────

function formatBytes(bytesStr: string): string {
  const bytes = parseFloat(bytesStr)
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${bytes} B`
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m avg`
  return `${m}m avg`
}

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

function formatDur(startStr: string, endStr: string): string {
  const mins = Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// ── Stat card ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = 'gold',
  icon,
}: {
  label: string
  value: string
  sub?: string
  color?: 'gold' | 'teal' | 'rust'
  icon: React.ReactNode
}) {
  const colorMap = {
    gold: 'bg-gold/10 border-gold/20 text-gold',
    teal: 'bg-teal/10 border-teal/20 text-teal',
    rust: 'bg-rust/10 border-rust/20 text-rust',
  }
  return (
    <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider font-mono mb-0.5">{label}</p>
        <p className="font-display text-2xl font-bold text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ── Suggestion card ───────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onSeasonPass,
}: {
  suggestion: InsightSuggestion
  onSeasonPass: (title: string) => void
}) {
  const severityMap = {
    tip: { border: 'border-teal/20', dot: 'bg-teal', label: 'text-teal', labelBg: 'bg-teal/10' },
    warning: { border: 'border-gold/20', dot: 'bg-gold', label: 'text-gold', labelBg: 'bg-gold/10' },
    info: { border: 'border-navy-500', dot: 'bg-white/30', label: 'text-white/50', labelBg: 'bg-navy-600' },
  }
  const s = severityMap[suggestion.severity]

  return (
    <div className={`bg-navy-700 rounded-xl border ${s.border} p-4`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{suggestion.title}</p>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{suggestion.body}</p>
          {suggestion.action === 'season-pass' && suggestion.actionTarget && (
            <button
              onClick={() => onSeasonPass(suggestion.actionTarget!)}
              className="mt-2 px-3 py-1 bg-gold hover:bg-gold-muted text-navy text-xs font-semibold rounded transition-colors"
            >
              Create Season Pass
            </button>
          )}
        </div>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-medium ${s.label} ${s.labelBg}`}>
          {suggestion.severity}
        </span>
      </div>
    </div>
  )
}

// ── Search result row ─────────────────────────────────────────

function SearchResultRow({
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
        w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-navy-700 last:border-0
        ${selected ? 'bg-gold/5 border-l-2 border-l-gold' : 'hover:bg-navy-700/50'}
      `}
    >
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center mt-0.5">
        {result.channelLogo ? (
          <img
            src={result.channelLogo}
            alt=""
            className="w-8 h-8 object-contain rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-navy-600 flex items-center justify-center">
            <span className="text-xs font-bold text-white/30 uppercase">
              {result.channelName?.charAt(0) ?? '?'}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{result.title}</span>
          {result.season != null && result.episode != null && (
            <span className="px-1.5 py-0.5 bg-navy-700 border border-navy-500 rounded text-xs text-teal font-mono">
              S{result.season.toString().padStart(2, '0')}E{result.episode.toString().padStart(2, '0')}
            </span>
          )}
          {result.isNew && (
            <span className="px-1.5 py-0.5 bg-teal/20 border border-teal/40 rounded text-xs text-teal">NEW</span>
          )}
          {result.isScheduled && (
            <span className="px-1.5 py-0.5 bg-teal/10 border border-teal/20 rounded text-xs text-teal/70">✓ Scheduled</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-white/40">{result.channelName}</span>
          <span className="text-xs font-mono text-white/30">{formatDateTime(result.startTime)}</span>
          <span className="text-xs text-white/20">{formatDur(result.startTime, result.endTime)}</span>
        </div>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error'

export default function Dashboard() {
  const navigate = useNavigate()

  // Search state
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProgramSearchResult[]>([])
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Detail panel
  const [selectedResult, setSelectedResult] = useState<ProgramSearchResult | null>(null)
  const [existingRules, setExistingRules] = useState<Rule[]>([])
  const [rulesLoaded, setRulesLoaded] = useState(false)

  // Insights state
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(true)

  // Pass creation from suggestions
  const [passStatus, setPassStatus] = useState<Record<string, 'loading' | 'done' | 'error'>>({})

  useEffect(() => {
    getInsights()
      .then(setInsights)
      .catch(() => {})
      .finally(() => setInsightsLoading(false))
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setSearchResults([])
      setSearchState('idle')
      setSelectedResult(null)
      return
    }
    setSearchState('loading')
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchPrograms(query.trim())
        setSearchResults(data)
        setSearchState(data.length === 0 ? 'empty' : 'results')
        setSelectedResult(null)
      } catch {
        setSearchState('error')
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleResultClick = async (result: ProgramSearchResult) => {
    setSelectedResult((prev) => (prev?.id === result.id ? null : result))
    if (!rulesLoaded) {
      try {
        const rules = await getRules()
        setExistingRules(rules)
        setRulesLoaded(true)
      } catch { /* non-fatal */ }
    }
  }

  const handleCreatePassFromSuggestion = async (seriesTitle: string) => {
    setPassStatus((p) => ({ ...p, [seriesTitle]: 'loading' }))
    try {
      await createRule({
        type: 'SERIES',
        seriesTitle,
        enabled: true,
        priority: 50,
        startEarly: 60,
        endLate: 180,
        newOnly: 'ALL',
      })
      setPassStatus((p) => ({ ...p, [seriesTitle]: 'done' }))
    } catch {
      setPassStatus((p) => ({ ...p, [seriesTitle]: 'error' }))
    }
  }

  const isSearchActive = query.trim().length >= 1

  return (
    <div className="flex flex-col h-full">
      {/* ── Search bar ──────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-navy-600 bg-navy-800 flex-shrink-0">
        <div className="relative max-w-2xl">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30"
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search upcoming programs to record…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-navy-700 border border-navy-500 rounded-xl pl-12 pr-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20 text-base"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-white/30 hover:text-white transition-colors"
              aria-label="Clear"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchState === 'results' && (
          <p className="text-xs text-white/30 mt-2 ml-1">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{query}"
            <button
              onClick={() => navigate('/search')}
              className="ml-2 text-gold/70 hover:text-gold underline"
            >
              Open full search
            </button>
          </p>
        )}
      </div>

      {/* ── Scrollable content ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Search results (overlays insights while typing) */}
        {isSearchActive && (
          <div>
            {searchState === 'loading' && (
              <div className="flex items-center justify-center py-10">
                <div className="flex items-center gap-3 text-white/40">
                  <div className="w-5 h-5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
                  <span className="text-sm">Searching…</span>
                </div>
              </div>
            )}
            {searchState === 'empty' && (
              <div className="flex items-center justify-center py-10">
                <p className="text-white/40 text-sm">No upcoming programs found for "{query}"</p>
              </div>
            )}
            {searchState === 'error' && (
              <div className="flex items-center justify-center py-10">
                <p className="text-rust/60 text-sm">Search failed — try again</p>
              </div>
            )}
            {searchState === 'results' && (
              <div className="divide-y divide-navy-700">
                {searchResults.map((r) => (
                  <SearchResultRow
                    key={r.id}
                    result={r}
                    selected={selectedResult?.id === r.id}
                    onClick={() => handleResultClick(r)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Insights (shown when not searching) */}
        {!isSearchActive && (
          <div className="p-6 space-y-6 max-w-5xl mx-auto">

            {insightsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              </div>
            ) : !insights ? (
              <p className="text-white/30 text-center py-16 text-sm">Could not load insights</p>
            ) : (
              <>
                {/* ── Stats row ─────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="Completed"
                    value={insights.stats.totalCompleted.toLocaleString()}
                    sub={formatDuration(insights.stats.avgDurationSeconds)}
                    color="gold"
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                      </svg>
                    }
                  />
                  <StatCard
                    label="Storage used"
                    value={formatBytes(insights.stats.totalStorageBytes)}
                    color="teal"
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <ellipse cx="12" cy="5" rx="9" ry="3"/>
                        <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/>
                        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
                      </svg>
                    }
                  />
                  <StatCard
                    label="Season Passes"
                    value={`${insights.stats.activePasses}`}
                    sub={`${insights.stats.totalPasses} total`}
                    color="teal"
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5z"/>
                        <path d="M9 12l2 2 4-4"/>
                      </svg>
                    }
                  />
                  <StatCard
                    label="Upcoming"
                    value={`${insights.stats.upcomingCount}`}
                    sub="next 7 days"
                    color="gold"
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="18" rx="2"/>
                        <path d="M16 2v4M8 2v4M3 10h18"/>
                      </svg>
                    }
                  />
                </div>

                {/* ── Suggestions ───────────────────────────── */}
                {insights.suggestions.length > 0 && (
                  <section>
                    <h2 className="font-display font-semibold text-white text-sm mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gold" />
                      Smart Suggestions
                    </h2>
                    <div className="space-y-2">
                      {insights.suggestions.map((s, i) => (
                        <SuggestionCard
                          key={i}
                          suggestion={
                            // Override button state if pass was just created
                            s.action === 'season-pass' && s.actionTarget && passStatus[s.actionTarget] === 'done'
                              ? { ...s, title: `✓ Season Pass created for "${s.actionTarget}"`, action: undefined }
                              : s
                          }
                          onSeasonPass={handleCreatePassFromSuggestion}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Two column: upcoming + failed ─────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Upcoming schedule */}
                  <div className="bg-navy-700 rounded-2xl border border-navy-500">
                    <div className="px-5 py-4 border-b border-navy-600">
                      <h3 className="font-display font-semibold text-white text-sm">Upcoming</h3>
                    </div>
                    <div className="divide-y divide-navy-700">
                      {insights.upcoming.length === 0 ? (
                        <p className="px-5 py-8 text-center text-white/30 text-sm">Nothing scheduled</p>
                      ) : (
                        insights.upcoming.slice(0, 8).map((rec) => (
                          <div key={rec.id} className="px-5 py-3 flex items-center gap-3">
                            {rec.channel?.tvgLogo ? (
                              <img
                                src={rec.channel.tvgLogo}
                                alt=""
                                className="w-6 h-6 object-contain rounded flex-shrink-0 opacity-70"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-teal flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{rec.title}</p>
                              <p className="text-xs text-white/40 font-mono">{formatDateTime(rec.scheduledStart)}</p>
                            </div>
                            {rec.status === 'RECORDING' && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rust/20 border border-rust/40 rounded text-xs text-rust">
                                <span className="w-1.5 h-1.5 bg-rust rounded-full animate-pulse" />
                                LIVE
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right column: top channels + categories */}
                  <div className="space-y-4">

                    {/* Top channels */}
                    {insights.topChannels.length > 0 && (
                      <div className="bg-navy-700 rounded-2xl border border-navy-500">
                        <div className="px-5 py-4 border-b border-navy-600">
                          <h3 className="font-display font-semibold text-white text-sm">Most Recorded Channels</h3>
                        </div>
                        <div className="divide-y divide-navy-700">
                          {insights.topChannels.map((ch, i) => (
                            <div key={ch.channelId} className="px-5 py-3 flex items-center gap-3">
                              <span className="text-xs text-white/20 font-mono w-4 flex-shrink-0">{i + 1}</span>
                              {ch.tvgLogo ? (
                                <img
                                  src={ch.tvgLogo}
                                  alt=""
                                  className="w-6 h-6 object-contain rounded flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              ) : (
                                <div className="w-6 h-6 rounded bg-navy-600 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-bold text-white/30 uppercase">{ch.name.charAt(0)}</span>
                                </div>
                              )}
                              <p className="flex-1 text-sm text-white truncate">{ch.name}</p>
                              <span className="text-xs text-white/30 font-mono">{ch.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top categories */}
                    {insights.topCategories.length > 0 && (
                      <div className="bg-navy-700 rounded-2xl border border-navy-500">
                        <div className="px-5 py-4 border-b border-navy-600">
                          <h3 className="font-display font-semibold text-white text-sm">Top Categories</h3>
                        </div>
                        <div className="px-5 py-4 space-y-2">
                          {insights.topCategories.map(({ category, count }) => {
                            const total = insights.topCategories.reduce((s, c) => s + c.count, 0)
                            const pct = total ? Math.round((count / total) * 100) : 0
                            return (
                              <div key={category}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-white/70">{category}</span>
                                  <span className="text-xs text-white/30 font-mono">{count}</span>
                                </div>
                                <div className="h-1.5 bg-navy-600 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gold/60 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Failed recordings ─────────────────────── */}
                {insights.recentFailed.length > 0 && (
                  <section>
                    <h2 className="font-display font-semibold text-white text-sm mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rust" />
                      Recent Failures
                      <span className="px-1.5 py-0.5 bg-rust/20 border border-rust/30 rounded text-xs text-rust font-mono ml-1">
                        {insights.recentFailed.length}
                      </span>
                    </h2>
                    <div className="bg-navy-700 rounded-2xl border border-rust/20 divide-y divide-navy-700">
                      {insights.recentFailed.slice(0, 5).map((rec) => (
                        <div key={rec.id} className="px-5 py-3 flex items-start gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-rust flex-shrink-0 mt-1.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{rec.title}</p>
                            <p className="text-xs text-white/30 font-mono mt-0.5">{formatDateTime(rec.scheduledStart)}</p>
                            {rec.errorMessage && (
                              <p className="text-xs text-rust/70 mt-0.5 truncate">{rec.errorMessage}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Empty state — new install */}
                {insights.stats.totalCompleted === 0 && insights.suggestions.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-navy-700 border border-navy-600 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21 3H3C1.9 3 1 3.9 1 5v12c0 1.1.9 2 2 2h5l-1 3v1h10v-1l-1-3h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H3V5h18v10z"/>
                      </svg>
                    </div>
                    <p className="text-white/40 font-medium">Nothing recorded yet</p>
                    <p className="text-white/20 text-sm mt-1">
                      Use the search bar above or browse Channels to schedule your first recording.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Detail panel ────────────────────────────────────── */}
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
