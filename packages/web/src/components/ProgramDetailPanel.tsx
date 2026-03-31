// packages/web/src/components/ProgramDetailPanel.tsx
// Reusable sticky program detail + record-action panel.
// Used by Guide, Channels, and Search pages.

import { useState } from 'react'
import { Program, Rule, createRule } from '../api/client.ts'
import SeriesPassModal, { SeriesPassForm } from './SeriesPassModal.tsx'

type RecordStatus = 'idle' | 'loading' | 'success' | 'error'

// ── Main component ─────────────────────────────────────────────

interface Props {
  program: Program
  channelId: string
  existingRules: Rule[]
  onRuleCreated: (rule: Rule) => void
  onDismiss: () => void
}

export default function ProgramDetailPanel({
  program,
  channelId,
  existingRules,
  onRuleCreated,
  onDismiss,
}: Props) {
  const [recordStatus, setRecordStatus] = useState<RecordStatus>('idle')
  const [showSeriesModal, setShowSeriesModal] = useState(false)

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const hasSeriesPass = existingRules.some(
    (r) =>
      r.type === 'SERIES' &&
      r.seriesTitle?.toLowerCase() === program.title.toLowerCase(),
  )

  const handleRecordOnce = async () => {
    try {
      setRecordStatus('loading')
      const rule = await createRule({
        type: 'ONCE',
        channelId,
        programId: program.id,
        enabled: true,
        priority: 50,
        startEarly: 60,
        endLate: 180,
        newOnly: 'ALL',
      })
      onRuleCreated(rule)
      setRecordStatus('success')
      setTimeout(() => setRecordStatus('idle'), 3000)
    } catch {
      setRecordStatus('error')
      setTimeout(() => setRecordStatus('idle'), 3000)
    }
  }

  const handleSeriesConfirm = async (form: SeriesPassForm) => {
    setShowSeriesModal(false)
    try {
      setRecordStatus('loading')
      const rule = await createRule({
        type: 'SERIES',
        channelId: form.channelScope === 'this' ? channelId : undefined,
        seriesTitle: program.title,
        enabled: true,
        priority: form.priority,
        startEarly: form.startEarly,
        endLate: form.endLate,
        newOnly: form.newOnly,
        keepLast: form.keepLast > 0 ? form.keepLast : undefined,
      })
      onRuleCreated(rule)
      setRecordStatus('success')
      setTimeout(() => setRecordStatus('idle'), 3000)
    } catch {
      setRecordStatus('error')
      setTimeout(() => setRecordStatus('idle'), 3000)
    }
  }

  return (
    <>
      <div className="sticky bottom-0 border-t border-navy-600 bg-navy-800 shrink-0">
        <div className="flex gap-4 p-4">
          {/* Poster / Logo */}
          {(program.posterUrl || program.logoUrl) && (
            <div className="flex-shrink-0">
              <img
                src={program.posterUrl || program.logoUrl || ''}
                alt={program.title}
                className="h-28 w-auto object-contain rounded border border-navy-600"
              />
            </div>
          )}

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Title row */}
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h3 className="font-semibold text-white font-display">{program.title}</h3>

                  {program.season != null && program.episode != null && (
                    <span className="px-1.5 py-0.5 bg-navy-700 border border-navy-500 rounded text-xs text-teal font-mono">
                      S{program.season.toString().padStart(2, '0')}
                      E{program.episode.toString().padStart(2, '0')}
                    </span>
                  )}

                  {program.isNew && (
                    <span className="px-1.5 py-0.5 bg-teal/20 border border-teal/40 rounded text-xs text-teal">
                      NEW
                    </span>
                  )}

                  {program.isRecording && (
                    <span className="px-1.5 py-0.5 bg-rust/20 border border-rust/40 rounded text-xs text-rust flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-rust rounded-full animate-pulse" />
                      RECORDING
                    </span>
                  )}

                  {hasSeriesPass && (
                    <span className="px-1.5 py-0.5 bg-gold/20 border border-gold/40 rounded text-xs text-gold">
                      Series Pass
                    </span>
                  )}
                </div>

                {/* Subtitle */}
                {program.subtitle && (
                  <p className="text-gold text-sm truncate mb-0.5">{program.subtitle}</p>
                )}

                {/* Time + category */}
                <p className="text-xs text-white/50 font-mono">
                  {formatTime(program.startTime)} – {formatTime(program.endTime)}
                  {program.category && (
                    <span className="ml-2 text-navy-400">• {program.category}</span>
                  )}
                </p>

                {/* Genres */}
                {program.genres && program.genres.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {program.genres.slice(0, 4).map((g) => (
                      <span
                        key={g}
                        className="px-1.5 py-0.5 bg-navy-700 border border-navy-600 rounded text-xs text-white/50"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Overview / description */}
                {(program.overview || program.description) && (
                  <p className="text-sm text-white/60 mt-2 line-clamp-2">
                    {program.overview || program.description}
                  </p>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={onDismiss}
                className="text-white/50 hover:text-white text-xl leading-none flex-shrink-0 mt-0.5"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 mt-3">
              {recordStatus === 'success' ? (
                <span className="px-3 py-1.5 bg-teal/20 text-teal border border-teal/40 rounded text-sm font-medium">
                  ✓ Scheduled
                </span>
              ) : recordStatus === 'error' ? (
                <span className="px-3 py-1.5 bg-rust/20 text-rust border border-rust/40 rounded text-sm font-medium">
                  ✗ Failed to schedule
                </span>
              ) : (
                <>
                  <button
                    onClick={handleRecordOnce}
                    disabled={recordStatus === 'loading'}
                    className="px-4 py-1.5 bg-gold hover:bg-gold-muted disabled:opacity-50 text-navy font-semibold rounded text-sm transition-colors"
                  >
                    {recordStatus === 'loading' ? 'Scheduling…' : 'Record Once'}
                  </button>

                  {hasSeriesPass ? (
                    <span className="px-3 py-1.5 bg-gold/10 border border-gold/30 text-gold rounded text-sm font-medium">
                      ✓ Series Pass active
                    </span>
                  ) : (
                    <button
                      onClick={() => setShowSeriesModal(true)}
                      disabled={recordStatus === 'loading'}
                      className="px-4 py-1.5 bg-navy-700 hover:bg-navy-600 disabled:opacity-50 border border-navy-500 text-white font-semibold rounded text-sm transition-colors"
                    >
                      Series Pass…
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSeriesModal && (
        <SeriesPassModal
          title={program.title}
          posterUrl={program.posterUrl || program.logoUrl}
          channelId={channelId}
          onConfirm={handleSeriesConfirm}
          onCancel={() => setShowSeriesModal(false)}
        />
      )}
    </>
  )
}
