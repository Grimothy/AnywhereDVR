import { useEffect, useState, useCallback } from 'react'
import { getRules, updateRule, deleteRule, getRulePreview, Rule, RulePreviewProgram } from '../api/client.ts'

export default function SeriesPasses() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getRules()
      setRules(data)
    } catch {
      setError('Failed to load recording rules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleToggle = async (rule: Rule) => {
    try {
      setTogglingId(rule.id)
      const updated = await updateRule(rule.id, { enabled: !rule.enabled })
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch {
      // TODO: surface error toast
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recording rule? Existing recordings will be kept.')) return
    try {
      setDeletingId(id)
      await deleteRule(id)
      setRules((prev) => prev.filter((r) => r.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch {
      // TODO: surface error toast
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const seriesRules = rules.filter((r) => r.type === 'SERIES')
  const onceRules = rules.filter((r) => r.type === 'ONCE')
  const manualRules = rules.filter((r) => r.type === 'MANUAL')

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-gold text-xs uppercase tracking-widest mb-6">
          Series Passes & Rules
        </h1>
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-navy-700 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-gold text-xs uppercase tracking-widest mb-6">
          Series Passes & Rules
        </h1>
        <div className="bg-rust/10 border border-rust/30 rounded-xl p-4">
          <p className="text-rust">{error}</p>
          <button
            onClick={loadRules}
            className="mt-2 text-sm text-gold hover:text-gold-muted"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-gold text-xs uppercase tracking-widest">
          Series Passes & Rules
        </h1>
        <span className="text-xs text-navy-400">
          {rules.length} rule{rules.length !== 1 ? 's' : ''} total
        </span>
      </div>

      {rules.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/50 mb-2">No recording rules yet</p>
          <p className="text-sm text-navy-400">
            Go to the Guide, click a program, and hit "Series Pass" or "Record Once"
          </p>
        </div>
      )}

      {/* Series Passes (SERIES) */}
      {seriesRules.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-teal/20 border border-teal/30 rounded text-xs text-teal font-mono">
              SERIES
            </span>
            Series Passes
            <span className="text-navy-400 font-normal">({seriesRules.length})</span>
          </h2>
          <div className="space-y-2">
            {seriesRules.map((rule) => (
              <SeriesRuleRow
                key={rule.id}
                rule={rule}
                toggling={togglingId === rule.id}
                deleting={deletingId === rule.id}
                expanded={expandedId === rule.id}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        </section>
      )}

      {/* One-time recordings (ONCE) */}
      {onceRules.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-gold/20 border border-gold/30 rounded text-xs text-gold font-mono">
              ONCE
            </span>
            One-Time Recordings
            <span className="text-navy-400 font-normal">({onceRules.length})</span>
          </h2>
          <div className="space-y-2">
            {onceRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                toggling={togglingId === rule.id}
                deleting={deletingId === rule.id}
                onToggle={handleToggle}
                onDelete={handleDelete}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">
                    {rule.programId ? `Program ${rule.programId.slice(0, 8)}…` : 'One-time recording'}
                  </div>
                  <div className="text-xs text-navy-400 mt-0.5 flex items-center gap-3 flex-wrap">
                    {(rule as any).channel?.name && (
                      <span>{(rule as any).channel.name}</span>
                    )}
                    <span className="text-navy-500">
                      +{rule.startEarly}s early · +{rule.endLate}s late
                    </span>
                  </div>
                </div>
              </RuleRow>
            ))}
          </div>
        </section>
      )}

      {/* Manual recordings */}
      {manualRules.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-navy-600 border border-navy-500 rounded text-xs text-white/60 font-mono">
              MANUAL
            </span>
            Manual Recordings
            <span className="text-navy-400 font-normal">({manualRules.length})</span>
          </h2>
          <div className="space-y-2">
            {manualRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                toggling={togglingId === rule.id}
                deleting={deletingId === rule.id}
                onToggle={handleToggle}
                onDelete={handleDelete}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">
                    {(rule as any).channel?.name ?? 'Manual recording'}
                  </div>
                  <div className="text-xs text-navy-400 mt-0.5 flex items-center gap-3">
                    <span>{formatDate(rule.manualStart)} – {formatDate(rule.manualEnd)}</span>
                  </div>
                </div>
              </RuleRow>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── SeriesRuleRow — rule row with expandable preview ──────────

interface SeriesRuleRowProps {
  rule: Rule
  toggling: boolean
  deleting: boolean
  expanded: boolean
  onToggle: (rule: Rule) => void
  onDelete: (id: string) => void
  onToggleExpand: (id: string) => void
}

function SeriesRuleRow({
  rule,
  toggling,
  deleting,
  expanded,
  onToggle,
  onDelete,
  onToggleExpand,
}: SeriesRuleRowProps) {
  const [preview, setPreview] = useState<RulePreviewProgram[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const handleExpand = async () => {
    onToggleExpand(rule.id)
    if (!expanded && preview === null && !previewLoading) {
      try {
        setPreviewLoading(true)
        setPreviewError(null)
        const data = await getRulePreview(rule.id)
        setPreview(data)
      } catch {
        setPreviewError('Failed to load preview')
      } finally {
        setPreviewLoading(false)
      }
    }
  }

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div
      className={`bg-navy-800 border rounded-xl shadow-card transition-colors ${
        rule.enabled ? 'border-navy-600' : 'border-navy-700 opacity-60'
      }`}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 p-3">
        {/* Enable/disable toggle */}
        <button
          onClick={() => onToggle(rule)}
          disabled={toggling}
          title={rule.enabled ? 'Disable rule' : 'Enable rule'}
          className={`w-10 h-5 rounded-full border transition-colors flex-shrink-0 relative ${
            rule.enabled
              ? 'bg-gold border-gold-muted'
              : 'bg-navy-700 border-navy-500'
          } ${toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
              rule.enabled ? 'left-5' : 'left-0.5'
            }`}
          />
        </button>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white">{rule.seriesTitle}</div>
          <div className="text-xs text-navy-400 mt-0.5 flex items-center gap-3 flex-wrap">
            {(rule as any).channel?.name ? (
              <span>{(rule as any).channel.name}</span>
            ) : (
              <span className="italic">Any channel</span>
            )}
            <span className={rule.newOnly === 'NEW_ONLY' ? 'text-teal' : 'text-navy-400'}>
              {rule.newOnly === 'NEW_ONLY' ? 'New episodes only' : 'All episodes'}
            </span>
            {rule.keepLast && (
              <span>Keep last {rule.keepLast}</span>
            )}
            <span className="text-navy-500">
              +{rule.startEarly}s early · +{rule.endLate}s late
            </span>
          </div>
        </div>

        {/* Priority badge */}
        <div className="text-xs text-navy-500 flex-shrink-0 hidden sm:block">
          P{rule.priority}
        </div>

        {/* Preview toggle */}
        <button
          onClick={handleExpand}
          title={expanded ? 'Hide upcoming matches' : 'Preview upcoming matches'}
          className="text-xs text-navy-400 hover:text-gold transition-colors flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-navy-600 hover:border-gold/40"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          Preview
        </button>

        {/* Delete button */}
        <button
          onClick={() => onDelete(rule.id)}
          disabled={deleting}
          className="text-navy-400 hover:text-rust transition-colors flex-shrink-0 disabled:opacity-50 text-sm"
          title="Delete rule"
        >
          {deleting ? '…' : '✕'}
        </button>
      </div>

      {/* Preview panel */}
      {expanded && (
        <div className="border-t border-navy-700 px-3 pb-3 pt-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Upcoming matches · next 14 days
            {rule.newOnly === 'NEW_ONLY' && (
              <span className="ml-2 normal-case font-normal text-teal/70">
                (filtered: new episodes only)
              </span>
            )}
          </p>

          {previewLoading && (
            <div className="flex items-center gap-2 py-3 text-sm text-white/40">
              <span className="w-3.5 h-3.5 border border-white/20 border-t-white/60 rounded-full animate-spin" />
              Loading…
            </div>
          )}

          {previewError && (
            <p className="text-xs text-rust py-2">{previewError}</p>
          )}

          {preview !== null && !previewLoading && (
            preview.length === 0 ? (
              <div className="py-3 text-sm text-white/40">
                No upcoming matches in the next 14 days.
                {rule.newOnly === 'NEW_ONLY' && (
                  <span className="block mt-1 text-xs text-white/30">
                    The EPG may not have any episodes flagged as new, or the show may be on hiatus.
                    Switch to "All episodes" if you want to record reruns too.
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {preview.map((prog) => (
                  <div
                    key={prog.id}
                    className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-navy-700/50 hover:bg-navy-700 transition-colors"
                  >
                    {/* Date/time */}
                    <div className="text-xs font-mono text-white/50 flex-shrink-0 w-44">
                      {formatDateTime(prog.startTime)}
                    </div>

                    {/* Episode info */}
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      {prog.subtitle ? (
                        <span className="text-sm text-white/80 truncate">{prog.subtitle}</span>
                      ) : (
                        <span className="text-sm text-white/40 italic">No subtitle</span>
                      )}
                      {prog.season != null && prog.episode != null && (
                        <span className="px-1.5 py-0.5 bg-navy-600 border border-navy-500 rounded text-[10px] text-teal font-mono flex-shrink-0">
                          S{prog.season.toString().padStart(2, '0')}
                          E{prog.episode.toString().padStart(2, '0')}
                        </span>
                      )}
                      {prog.isNew && (
                        <span className="px-1.5 py-0.5 bg-teal/20 border border-teal/40 rounded text-[10px] text-teal flex-shrink-0">
                          NEW
                        </span>
                      )}
                    </div>

                    {/* Channel */}
                    <div className="text-xs text-navy-400 flex-shrink-0 hidden sm:block truncate max-w-[120px]">
                      {prog.channel.name}
                    </div>

                    {/* Recording status */}
                    <div className="flex-shrink-0">
                      {prog.recordingStatus === 'SCHEDULED' && (
                        <span className="px-1.5 py-0.5 bg-gold/20 border border-gold/40 rounded text-[10px] text-gold font-mono">
                          SCHED
                        </span>
                      )}
                      {prog.recordingStatus === 'RECORDING' && (
                        <span className="px-1.5 py-0.5 bg-rust/20 border border-rust/40 rounded text-[10px] text-rust font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-rust rounded-full animate-pulse inline-block" />
                          REC
                        </span>
                      )}
                      {prog.recordingStatus === 'COMPLETED' && (
                        <span className="px-1.5 py-0.5 bg-teal/20 border border-teal/40 rounded text-[10px] text-teal font-mono">
                          DONE
                        </span>
                      )}
                      {(prog.recordingStatus === 'CANCELLED' || prog.recordingStatus === 'FAILED') && (
                        <span className="px-1.5 py-0.5 bg-navy-600 border border-navy-500 rounded text-[10px] text-white/40 font-mono">
                          {prog.recordingStatus}
                        </span>
                      )}
                      {prog.recordingStatus === null && (
                        <span className="px-1.5 py-0.5 bg-navy-600/50 border border-navy-600 rounded text-[10px] text-white/20 font-mono">
                          PENDING
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Generic RuleRow (ONCE / MANUAL) ──────────────────────────

interface RuleRowProps {
  rule: Rule
  toggling: boolean
  deleting: boolean
  onToggle: (rule: Rule) => void
  onDelete: (id: string) => void
  children: React.ReactNode
}

function RuleRow({ rule, toggling, deleting, onToggle, onDelete, children }: RuleRowProps) {
  return (
    <div
      className={`flex items-center gap-4 p-3 bg-navy-800 border rounded-xl shadow-card transition-colors ${
        rule.enabled ? 'border-navy-600' : 'border-navy-700 opacity-60'
      }`}
    >
      {/* Enable/disable toggle */}
      <button
        onClick={() => onToggle(rule)}
        disabled={toggling}
        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
        className={`w-10 h-5 rounded-full border transition-colors flex-shrink-0 relative ${
          rule.enabled
            ? 'bg-gold border-gold-muted'
            : 'bg-navy-700 border-navy-500'
        } ${toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
            rule.enabled ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>

      {children}

      {/* Priority badge */}
      <div className="text-xs text-navy-500 flex-shrink-0 hidden sm:block">
        P{rule.priority}
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDelete(rule.id)}
        disabled={deleting}
        className="text-navy-400 hover:text-rust transition-colors flex-shrink-0 disabled:opacity-50 text-sm"
        title="Delete rule"
      >
        {deleting ? '…' : '✕'}
      </button>
    </div>
  )
}
