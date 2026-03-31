// packages/web/src/pages/Channels.tsx
// Browse channels and see 7-day show lineup. Click a program to record.

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Channel,
  Program,
  Rule,
  getChannels,
  getGroups,
  getChannelSchedule,
  getRules,
  ChannelGroup,
} from '../api/client.ts'
import ProgramDetailPanel from '../components/ProgramDetailPanel.tsx'

// ── Helpers ───────────────────────────────────────────────────

function toUTCDate(date: Date) {
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    d: date.getUTCDate(),
  }
}

function isSameUTCDate(dateStr: string, compareStr: string): boolean {
  const d = new Date(dateStr)
  const c = new Date(compareStr)
  const ud = toUTCDate(d)
  const uc = toUTCDate(c)
  return ud.y === uc.y && ud.m === uc.m && ud.d === uc.d
}

function getUTCDateKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const ud = toUTCDate(d)
  const un = toUTCDate(now)
  if (ud.y === un.y && ud.m === un.m && ud.d === un.d) return 'Today'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(startStr: string, endStr: string): string {
  const mins = Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// ── Sub-components ────────────────────────────────────────────

function ChannelRow({
  channel,
  selected,
  onClick,
}: {
  channel: Channel
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg
        ${selected
          ? 'bg-gold/10 border border-gold/30 text-white'
          : 'border border-transparent text-white/70 hover:bg-navy-600 hover:text-white'
        }
      `}
    >
      {/* Logo */}
      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
        {channel.tvgLogo ? (
          <img
            src={channel.tvgLogo}
            alt=""
            className="w-8 h-8 object-contain rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-navy-600 border border-navy-500 flex items-center justify-center">
            <span className="text-xs text-white/30 font-bold uppercase">
              {channel.name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{channel.name}</p>
        {channel.groupTitle && (
          <p className="text-xs text-white/40 truncate">{channel.groupTitle}</p>
        )}
      </div>

      {/* Channel number */}
      {channel.channelNumber != null && (
        <span className="flex-shrink-0 text-xs text-white/30 font-mono">
          {channel.channelNumber}
        </span>
      )}
    </button>
  )
}

function ProgramRow({
  program,
  selected,
  onClick,
}: {
  program: Program
  selected: boolean
  onClick: () => void
}) {
  const isPast = new Date(program.endTime) < new Date()

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-start gap-4 px-4 py-3 text-left transition-colors border-b border-navy-700 last:border-0
        ${selected ? 'bg-gold/5 border-l-2 border-l-gold' : 'hover:bg-navy-700/50'}
        ${isPast ? 'opacity-50' : ''}
      `}
    >
      {/* Time column */}
      <div className="flex-shrink-0 w-20 pt-0.5">
        <p className="text-xs font-mono text-white/50">{formatTime(program.startTime)}</p>
        <p className="text-xs font-mono text-white/30">{formatDuration(program.startTime, program.endTime)}</p>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white truncate">{program.title}</span>

          {program.season != null && program.episode != null && (
            <span className="px-1.5 py-0.5 bg-navy-700 border border-navy-500 rounded text-xs text-teal font-mono flex-shrink-0">
              S{program.season.toString().padStart(2, '0')}
              E{program.episode.toString().padStart(2, '0')}
            </span>
          )}

          {program.isNew && (
            <span className="px-1.5 py-0.5 bg-teal/20 border border-teal/40 rounded text-xs text-teal flex-shrink-0">
              NEW
            </span>
          )}

          {program.isRecording && (
            <span className="px-1.5 py-0.5 bg-rust/20 border border-rust/40 rounded text-xs text-rust flex items-center gap-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-rust rounded-full animate-pulse" />
              LIVE
            </span>
          )}

          {program.isScheduled && !program.isRecording && (
            <span className="px-1.5 py-0.5 bg-teal/10 border border-teal/20 rounded text-xs text-teal/70 flex-shrink-0">
              ✓ Scheduled
            </span>
          )}
        </div>

        {program.subtitle && (
          <p className="text-xs text-gold/80 mt-0.5 truncate">{program.subtitle}</p>
        )}

        {program.category && (
          <p className="text-xs text-white/30 mt-0.5">{program.category}</p>
        )}
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function Channels() {
  const [searchParams] = useSearchParams()
  const [channels, setChannels] = useState<Channel[]>([])
  const [groups, setGroups] = useState<ChannelGroup[]>([])
  const [channelSearch, setChannelSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [loadingChannels, setLoadingChannels] = useState(true)

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [allPrograms, setAllPrograms] = useState<Program[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState(false)

  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => getUTCDateKey(new Date().toISOString()))

  const availableDateKeys = useMemo(() => {
    const keys = new Set<string>()
    allPrograms.forEach((p) => keys.add(getUTCDateKey(p.startTime)))
    return Array.from(keys).sort()
  }, [allPrograms])

  const filteredPrograms = useMemo(() => {
    return allPrograms.filter((p) => getUTCDateKey(p.startTime) === selectedDateKey)
  }, [allPrograms, selectedDateKey])

  const navigateDate = (direction: number) => {
    const idx = availableDateKeys.indexOf(selectedDateKey)
    const newIdx = Math.max(0, Math.min(availableDateKeys.length - 1, idx + direction))
    setSelectedDateKey(availableDateKeys[newIdx])
  }

  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [existingRules, setExistingRules] = useState<Rule[]>([])
  const [rulesLoaded, setRulesLoaded] = useState(false)

  // Load channels and groups on mount
  useEffect(() => {
    Promise.all([
      getChannels({ perPage: 200 }),
      getGroups(),
    ])
      .then(([chResp, grpResp]) => {
        setChannels(chResp.data)
        setGroups(grpResp)
      })
      .catch(() => {})
      .finally(() => setLoadingChannels(false))
  }, [])

  // Auto-select channel from URL query param after channels load
  useEffect(() => {
    if (loadingChannels) return
    const channelId = searchParams.get('channelId')
    if (!channelId) return
    const channel = channels.find((c) => c.id === channelId)
    if (channel) {
      handleChannelSelect(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingChannels, channels, searchParams])

  // Filter channels client-side
  const filteredChannels = useMemo(() => {
    let list = channels
    if (selectedGroup) {
      list = list.filter((c) => c.groupTitle === selectedGroup)
    }
    if (channelSearch.trim()) {
      const q = channelSearch.toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.channelNumber != null && c.channelNumber.toString().includes(q)),
      )
    }
    return list
  }, [channels, selectedGroup, channelSearch])

  // Load schedule when a channel is selected
  const handleChannelSelect = async (channel: Channel) => {
    if (selectedChannel?.id === channel.id) return
    setSelectedChannel(channel)
    setSelectedProgram(null)
    setAllPrograms([])
    setScheduleError(false)
    setScheduleLoading(true)
    setSelectedDateKey(getUTCDateKey(new Date().toISOString()))

    try {
      const result = await getChannelSchedule(channel.id)
      setAllPrograms(result.programs)
    } catch {
      setScheduleError(true)
    } finally {
      setScheduleLoading(false)
    }
  }

  const handleProgramSelect = async (program: Program) => {
    setSelectedProgram((prev) => (prev?.id === program.id ? null : program))

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
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Channel list ──────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-navy-600 bg-navy-800">
        {/* Toolbar */}
        <div className="p-3 space-y-2 border-b border-navy-600">
          {/* Group filter */}
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.count})
              </option>
            ))}
          </select>

          {/* Channel search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Find channel…"
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              className="w-full bg-navy-700 border border-navy-500 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
            />
          </div>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loadingChannels ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
            </div>
          ) : filteredChannels.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-8">No channels found</p>
          ) : (
            filteredChannels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                selected={selectedChannel?.id === ch.id}
                onClick={() => handleChannelSelect(ch)}
              />
            ))
          )}
        </div>

        {/* Count footer */}
        {!loadingChannels && (
          <div className="border-t border-navy-600 px-4 py-2">
            <p className="text-xs text-white/30">
              {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Right: Schedule ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedChannel ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-navy-700 border border-navy-600 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <rect x="2" y="7" width="20" height="15" rx="2" />
                  <path d="M17 2l-5 5-5-5" />
                </svg>
              </div>
              <p className="text-white/40 font-medium">Select a channel</p>
              <p className="text-white/20 text-sm mt-1">to see 7-day lineup</p>
            </div>
          </div>
        ) : (
          <>
            {/* Channel header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-navy-600 bg-navy-800 flex-shrink-0">
              {selectedChannel.tvgLogo ? (
                <img
                  src={selectedChannel.tvgLogo}
                  alt=""
                  className="h-10 w-auto object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-navy-600 border border-navy-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white/40 uppercase">
                    {selectedChannel.name.charAt(0)}
                  </span>
                </div>
              )}
              <div>
                <h2 className="font-display font-semibold text-white">{selectedChannel.name}</h2>
                {selectedChannel.groupTitle && (
                  <p className="text-xs text-white/40">{selectedChannel.groupTitle}</p>
                )}
              </div>
              {selectedChannel.channelNumber != null && (
                <span className="ml-auto text-sm text-white/30 font-mono">
                  CH {selectedChannel.channelNumber}
                </span>
              )}
            </div>

            {/* Date navigation */}
            <div className="px-4 py-2 border-b border-navy-700 flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigateDate(-1)}
                disabled={availableDateKeys.indexOf(selectedDateKey) <= 0}
                className="px-2 py-1 bg-navy-700 hover:bg-navy-600 border border-navy-500 rounded text-sm text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              <div className="flex-1 text-center">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                  {formatDateLabel(selectedDateKey + 'T00:00:00Z')}
                </p>
                <p className="text-[10px] text-white/20">
                  {availableDateKeys.length > 0 ? `${availableDateKeys.indexOf(selectedDateKey) + 1} of ${availableDateKeys.length} days` : 'No EPG data'}
                </p>
              </div>
              <button
                onClick={() => navigateDate(1)}
                disabled={availableDateKeys.indexOf(selectedDateKey) >= availableDateKeys.length - 1}
                className="px-2 py-1 bg-navy-700 hover:bg-navy-600 border border-navy-500 rounded text-sm text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>

            {/* Program list */}
            <div className="flex-1 overflow-y-auto">
              {scheduleLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
                </div>
              ) : scheduleError ? (
                <div className="flex items-center justify-center py-16">
                  <p className="text-white/30 text-sm">Failed to load schedule</p>
                </div>
              ) : filteredPrograms.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <p className="text-white/40 font-medium">No programs listed</p>
                    <p className="text-white/20 text-sm mt-1">EPG data may not be available for this channel</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-navy-700">
                  {filteredPrograms.map((prog) => (
                    <ProgramRow
                      key={prog.id}
                      program={prog}
                      selected={selectedProgram?.id === prog.id}
                      onClick={() => handleProgramSelect(prog)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selectedProgram && selectedChannel && (
              <ProgramDetailPanel
                program={selectedProgram}
                channelId={selectedChannel.id}
                existingRules={existingRules}
                onRuleCreated={(rule) => setExistingRules((prev) => [...prev, rule])}
                onDismiss={() => setSelectedProgram(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
