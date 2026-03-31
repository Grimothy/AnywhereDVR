import { useState, useEffect } from 'react'
import { getSources, createSource, updateSource, deleteSource, syncSource, Source,
         getSettings, updateSettings, AppSettings,
         getSourceGroups, updateSourceGroups, SourceGroup,
         getUsers, createUser, updateUser, deleteUser, regeneratePlaylistToken,
         AppUser, CreateUserData, UpdateUserData } from '../api/client.ts'

// ── Types ─────────────────────────────────────────────────────

type SettingsTab = 'sources' | 'recording' | 'storage' | 'users'
type SourceType = 'M3U' | 'XTREAM'

interface SourceFormData {
  name: string
  type: SourceType
  m3uUrl: string
  epgUrl: string
  xcHost: string
  xcUsername: string
  xcPassword: string
  refreshDaily: boolean
}

// ── Main component ─────────────────────────────────────────────

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sources')

  // ── Sources state ──────────────────────────────────────────
  const [sources, setSources] = useState<Source[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<SourceFormData>({
    name: '',
    type: 'M3U',
    m3uUrl: '',
    epgUrl: '',
    xcHost: '',
    xcUsername: '',
    xcPassword: '',
    refreshDaily: true
  })
  const [submitting, setSubmitting] = useState(false)
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<SourceGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsSaving, setGroupsSaving] = useState(false)

  // ── App Settings state ─────────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  // ── Users state ────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userFormData, setUserFormData] = useState<CreateUserData & { confirmPassword?: string }>({
    username: '',
    password: '',
    confirmPassword: '',
    role: 'USER',
    storageQuotaGB: null,
    assignedSourceIds: [],
    assignedGroups: [],
    requireToken: false,
  })
  const [userSubmitting, setUserSubmitting] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [regeneratingTokenId, setRegeneratingTokenId] = useState<string | null>(null)
  // available groups derived from selected sources (enabled groups only)
  const [availableGroups, setAvailableGroups] = useState<string[]>([])
  const [groupsLoadingForUser, setGroupsLoadingForUser] = useState(false)

  // ── Init ───────────────────────────────────────────────────

  useEffect(() => {
    fetchSources()
    fetchSettings()
  }, [])

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0 && !usersLoading) {
      fetchUsers()
    }
  }, [activeTab])

  // ── Source functions ───────────────────────────────────────

  const fetchSources = async () => {
    try {
      setSourcesLoading(true)
      setSources(await getSources())
    } catch {
      // non-fatal
    } finally {
      setSourcesLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({ name: '', type: 'M3U', m3uUrl: '', epgUrl: '', xcHost: '', xcUsername: '', xcPassword: '', refreshDaily: true })
    setShowAddForm(false)
    setEditingId(null)
    setGroups([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const sourceData: Partial<Source> = { name: formData.name, type: formData.type, refreshDaily: formData.refreshDaily }
      if (formData.type === 'M3U') {
        sourceData.m3uUrl = formData.m3uUrl || null
        if (formData.epgUrl) sourceData.epgUrl = formData.epgUrl
      } else {
        sourceData.xcHost = formData.xcHost || null
        sourceData.xcUsername = formData.xcUsername || null
        sourceData.xcPassword = formData.xcPassword || null
      }
      if (editingId) {
        await updateSource(editingId, sourceData)
      } else {
        await createSource(sourceData)
      }
      await fetchSources()
      resetForm()
    } catch {
      // non-fatal
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Delete this source?')) return
    try {
      await deleteSource(sourceId)
      await fetchSources()
    } catch {
      // non-fatal
    }
  }

  const handleSync = async (sourceId: string) => {
    try {
      setSyncingIds(prev => new Set(prev).add(sourceId))
      await syncSource(sourceId)
      await fetchSources()
    } catch {
      // non-fatal
    } finally {
      setSyncingIds(prev => { const n = new Set(prev); n.delete(sourceId); return n })
    }
  }

  const handleEdit = (source: Source) => {
    setFormData({
      name: source.name, type: source.type, m3uUrl: source.m3uUrl ?? '',
      epgUrl: source.epgUrl ?? '', xcHost: source.xcHost ?? '',
      xcUsername: source.xcUsername ?? '', xcPassword: source.xcPassword ?? '',
      refreshDaily: source.refreshDaily
    })
    setEditingId(source.id)
    setShowAddForm(true)
    setGroupsLoading(true)
    setGroups([])
    getSourceGroups(source.id).then(setGroups).catch(() => {}).finally(() => setGroupsLoading(false))
  }

  const handleGroupToggle = async (groupName: string) => {
    if (!editingId) return
    const updated = groups.map(g => g.name === groupName ? { ...g, disabled: !g.disabled } : g)
    setGroups(updated)
    setGroupsSaving(true)
    try {
      await updateSourceGroups(editingId, updated.filter(g => g.disabled).map(g => g.name))
    } catch {
      setGroups(groups)
    } finally {
      setGroupsSaving(false)
    }
  }

  // ── Settings functions ─────────────────────────────────────

  const fetchSettings = async () => {
    try {
      setSettingsLoading(true)
      setSettings(await getSettings())
    } catch {
      // non-fatal
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleSettingsChange = (key: keyof AppSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSettingsSaved(false)
  }

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSettingsSaving(true)
      setSettingsError(null)
      setSettings(await updateSettings(settings))
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } catch {
      setSettingsError('Failed to save settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  // ── Users functions ────────────────────────────────────────

  const fetchUsers = async () => {
    try {
      setUsersLoading(true)
      setUsers(await getUsers())
    } catch {
      // non-fatal
    } finally {
      setUsersLoading(false)
    }
  }

  const resetUserForm = () => {
    setUserFormData({ username: '', password: '', confirmPassword: '', role: 'USER', storageQuotaGB: null, assignedSourceIds: [], assignedGroups: [], requireToken: false })
    setShowUserForm(false)
    setEditingUserId(null)
    setUserError(null)
    setAvailableGroups([])
  }

  // Load the enabled groups across the given source IDs and update availableGroups.
  // If sourceIds is empty (= all sources), load from all sources.
  const loadGroupsForSources = async (sourceIds: string[]) => {
    const ids = sourceIds.length > 0 ? sourceIds : sources.map(s => s.id)
    if (ids.length === 0) { setAvailableGroups([]); return }
    setGroupsLoadingForUser(true)
    try {
      const results = await Promise.all(ids.map(id => getSourceGroups(id)))
      const seen = new Set<string>()
      const merged: string[] = []
      for (const groupList of results) {
        for (const g of groupList) {
          if (!g.disabled && g.name && !seen.has(g.name)) {
            seen.add(g.name)
            merged.push(g.name)
          }
        }
      }
      merged.sort((a, b) => a.localeCompare(b))
      setAvailableGroups(merged)
    } catch {
      setAvailableGroups([])
    } finally {
      setGroupsLoadingForUser(false)
    }
  }

  const handleEditUser = (user: AppUser) => {
    const formData = {
      username: user.username,
      password: '',
      confirmPassword: '',
      role: user.role,
      storageQuotaGB: user.storageQuotaGB,
      assignedSourceIds: [...user.assignedSourceIds],
      assignedGroups: [...user.assignedGroups],
      requireToken: user.requireToken,
    }
    setUserFormData(formData)
    setEditingUserId(user.id)
    setShowUserForm(true)
    setUserError(null)
    void loadGroupsForSources(user.assignedSourceIds)
  }

  // When the user form opens fresh (add mode), pre-load groups from all sources
  const handleOpenAddUser = () => {
    resetUserForm()
    setShowUserForm(true)
    void loadGroupsForSources([])
  }

  // Toggle a source in the user form and reload groups accordingly
  const handleUserSourceToggle = (sourceId: string) => {
    setUserFormData(prev => {
      const current = prev.assignedSourceIds ?? []
      const updated = current.includes(sourceId)
        ? current.filter(id => id !== sourceId)
        : [...current, sourceId]
      // Clear any groups that are no longer available after source change
      void loadGroupsForSources(updated)
      return { ...prev, assignedSourceIds: updated, assignedGroups: [] }
    })
  }

  // Toggle a group in the user form
  const handleUserGroupToggle = (groupName: string) => {
    setUserFormData(prev => {
      const current = prev.assignedGroups ?? []
      const updated = current.includes(groupName)
        ? current.filter(g => g !== groupName)
        : [...current, groupName]
      return { ...prev, assignedGroups: updated }
    })
  }

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError(null)

    if (!editingUserId && !userFormData.password) {
      setUserError('Password is required for new users')
      return
    }
    if (userFormData.password && userFormData.password !== userFormData.confirmPassword) {
      setUserError('Passwords do not match')
      return
    }

    try {
      setUserSubmitting(true)
      if (editingUserId) {
        const data: UpdateUserData = {
          username: userFormData.username,
          role: userFormData.role,
          storageQuotaGB: userFormData.storageQuotaGB,
          assignedSourceIds: userFormData.assignedSourceIds,
          assignedGroups: userFormData.assignedGroups,
          requireToken: userFormData.requireToken,
        }
        if (userFormData.password) data.password = userFormData.password
        await updateUser(editingUserId, data)
      } else {
        const { confirmPassword, ...data } = userFormData
        await createUser(data)
      }
      await fetchUsers()
      resetUserForm()
    } catch (err: any) {
      setUserError(err?.response?.data?.error?.message ?? 'Failed to save user')
    } finally {
      setUserSubmitting(false)
    }
  }

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return
    try {
      setDeletingUserId(id)
      await deleteUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch {
      // non-fatal
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleRegenerateToken = async (id: string) => {
    try {
      setRegeneratingTokenId(id)
      const { playlistToken } = await regeneratePlaylistToken(id)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, playlistToken } : u))
    } catch {
      // non-fatal
    } finally {
      setRegeneratingTokenId(null)
    }
  }

  // ── Shared helpers ─────────────────────────────────────────

  const getTypeBadge = (type: SourceType) => {
    return type === 'M3U'
      ? 'bg-teal/20 text-teal border-teal/30'
      : 'bg-gold/20 text-gold border-gold/30'
  }

  // ── Tabs config ────────────────────────────────────────────

  const tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: 'sources', label: 'Sources' },
    { key: 'recording', label: 'Recording' },
    { key: 'storage', label: 'Storage' },
    { key: 'users', label: 'Users' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="font-mono text-gold text-xs uppercase tracking-widest mb-6">
        Settings
      </h1>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-8 border-b border-navy-600">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-gold text-gold'
                : 'border-transparent text-navy-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Sources Tab ── */}
      {activeTab === 'sources' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-white font-display text-lg">Sources</h2>
            <button
              onClick={() => { resetForm(); setShowAddForm(!showAddForm) }}
              className="px-4 py-2 bg-gold hover:bg-gold-muted text-navy font-semibold rounded-lg text-sm transition-colors"
            >
              {showAddForm ? 'Cancel' : 'Add Source'}
            </button>
          </div>

          {showAddForm && (
            <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 mb-6 shadow-card">
              <h3 className="font-semibold text-white font-display mb-4">
                {editingId ? 'Edit Source' : 'Add Source'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Source Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none placeholder-navy-400"
                    placeholder="My IPTV Provider"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Source Type</label>
                  <div className="flex gap-4">
                    {(['M3U', 'XTREAM'] as SourceType[]).map(t => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value={t}
                          checked={formData.type === t}
                          onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as SourceType }))}
                          disabled={editingId !== null}
                          className="accent-gold"
                        />
                        <span className="text-sm text-white/60">{t === 'M3U' ? 'M3U Playlist' : 'Xtream Codes'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {formData.type === 'M3U' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-white/60 mb-1.5">M3U Playlist URL</label>
                      <input type="url" value={formData.m3uUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, m3uUrl: e.target.value }))}
                        className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none placeholder-navy-400"
                        placeholder="http://example.com/playlist.m3u" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/60 mb-1.5">EPG URL (Optional)</label>
                      <input type="url" value={formData.epgUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, epgUrl: e.target.value }))}
                        className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none placeholder-navy-400"
                        placeholder="http://example.com/epg.xml" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-white/60 mb-1.5">Xtream Server URL</label>
                      <input type="url" value={formData.xcHost}
                        onChange={(e) => setFormData(prev => ({ ...prev, xcHost: e.target.value }))}
                        className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none placeholder-navy-400"
                        placeholder="http://example.com:8080" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/60 mb-1.5">Username</label>
                        <input type="text" value={formData.xcUsername}
                          onChange={(e) => setFormData(prev => ({ ...prev, xcUsername: e.target.value }))}
                          className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none"
                          required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/60 mb-1.5">Password</label>
                        <input type="password" value={formData.xcPassword}
                          onChange={(e) => setFormData(prev => ({ ...prev, xcPassword: e.target.value }))}
                          className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none"
                          required />
                      </div>
                    </div>
                  </>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.refreshDaily}
                    onChange={(e) => setFormData(prev => ({ ...prev, refreshDaily: e.target.checked }))}
                    className="accent-gold" />
                  <span className="text-sm text-white/60">Refresh daily</span>
                </label>

                {/* Group Filtering */}
                {editingId && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-white/60">Channel Groups</label>
                      {groupsSaving && <span className="text-xs text-gold">Saving…</span>}
                    </div>
                    {groupsLoading ? (
                      <div className="text-xs text-navy-400 py-2">Loading groups…</div>
                    ) : groups.length === 0 ? (
                      <div className="text-xs text-navy-400 py-2">No groups found. Sync the source first.</div>
                    ) : (
                      <div className="bg-navy-700 border border-navy-500 rounded-lg max-h-56 overflow-y-auto">
                        {groups.map(group => (
                          <label key={group.name || '__ungrouped__'}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-navy-600 cursor-pointer border-b border-navy-600 last:border-0">
                            <input type="checkbox" checked={!group.disabled}
                              onChange={() => handleGroupToggle(group.name)}
                              className="accent-gold" />
                            <span className={`flex-1 text-sm ${group.disabled ? 'text-navy-500 line-through' : 'text-white'}`}>
                              {group.name || '(ungrouped)'}
                            </span>
                            <span className="text-xs text-navy-400 tabular-nums">{group.count}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-navy-500 mt-1.5">
                      Unchecked groups are hidden from the guide and will not be recorded.
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={submitting}
                    className="px-4 py-2 bg-gold hover:bg-gold-muted disabled:opacity-50 text-navy font-semibold rounded-lg text-sm transition-colors">
                    {submitting ? (editingId ? 'Updating…' : 'Adding…') : (editingId ? 'Update Source' : 'Add Source')}
                  </button>
                  <button type="button" onClick={() => resetForm()}
                    className="px-4 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-500 text-white rounded-lg text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Sources List */}
          {sourcesLoading ? (
            <div className="animate-pulse space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-navy-800 border border-navy-600 rounded-xl p-4">
                  <div className="h-6 bg-navy-700 rounded mb-2 w-48"></div>
                  <div className="h-4 bg-navy-700 rounded w-32"></div>
                </div>
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-10 bg-navy-800 border border-navy-600 rounded-xl">
              <p className="text-white/50 mb-2">No sources configured</p>
              <p className="text-sm text-navy-400">Add an M3U or Xtream source to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <div key={source.id} className="bg-navy-800 border border-navy-600 rounded-xl p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="font-semibold text-white">{source.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getTypeBadge(source.type)}`}>
                          {source.type}
                        </span>
                      </div>
                      <div className="text-sm text-navy-400 space-y-0.5">
                        <div>Last sync: {source.lastSyncAt ? new Date(source.lastSyncAt).toLocaleString() : 'Never'}</div>
                        {source.syncError && <div className="text-rust">Error: {source.syncError}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleSync(source.id)} disabled={syncingIds.has(source.id)}
                        className="px-3 py-1.5 bg-navy-700 hover:bg-navy-600 disabled:opacity-50 border border-navy-500 text-white rounded-lg text-sm transition-colors">
                        {syncingIds.has(source.id) ? 'Syncing…' : 'Sync'}
                      </button>
                      <button onClick={() => handleEdit(source)}
                        className="px-3 py-1.5 bg-navy-700 hover:bg-navy-600 border border-navy-500 text-white rounded-lg text-sm transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(source.id)}
                        className="px-3 py-1.5 bg-rust/10 hover:bg-rust/20 text-rust border border-rust/30 rounded-lg text-sm transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Recording Tab ── */}
      {activeTab === 'recording' && (
        <div>
          <h2 className="font-semibold text-white font-display text-lg mb-6">Recording Settings</h2>
          {settingsLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-navy-700 rounded-xl" />)}
            </div>
          ) : (
            <form onSubmit={handleSettingsSave}>
              <div className="bg-navy-800 border border-navy-600 rounded-xl divide-y divide-navy-600 shadow-card">
                <SettingRow label="Max Concurrent Recordings" description="How many streams can record simultaneously">
                  <input type="number" min={1} max={20}
                    value={settings.maxConcurrentStreams ?? '2'}
                    onChange={e => handleSettingsChange('maxConcurrentStreams', e.target.value)}
                    className="w-24 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white focus:outline-none focus:border-gold" />
                </SettingRow>
                <SettingRow label="Start Early" description="Seconds to begin recording before the EPG start time">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={3600}
                      value={settings.startEarlySeconds ?? '30'}
                      onChange={e => handleSettingsChange('startEarlySeconds', e.target.value)}
                      className="w-24 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white focus:outline-none focus:border-gold" />
                    <span className="text-sm text-navy-400">seconds</span>
                  </div>
                </SettingRow>
                <SettingRow label="End Late" description="Seconds to continue recording after the EPG end time">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={3600}
                      value={settings.endLateSeconds ?? '60'}
                      onChange={e => handleSettingsChange('endLateSeconds', e.target.value)}
                      className="w-24 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white focus:outline-none focus:border-gold" />
                    <span className="text-sm text-navy-400">seconds</span>
                  </div>
                </SettingRow>
                <SettingRow label="EPG Refresh Interval" description="How often to re-fetch EPG data from sources">
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={168}
                      value={settings.epgRefreshIntervalHours ?? '12'}
                      onChange={e => handleSettingsChange('epgRefreshIntervalHours', e.target.value)}
                      className="w-24 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white focus:outline-none focus:border-gold" />
                    <span className="text-sm text-navy-400">hours</span>
                  </div>
                </SettingRow>
                <SettingRow label="Commercial Skip (comskip)" description="Run comskip after recording to detect commercial breaks">
                  <ToggleInput value={settings.enableComskip ?? 'true'} onChange={v => handleSettingsChange('enableComskip', v)} />
                </SettingRow>
                <SettingRow label="TMDB Enrichment" description="Fetch artwork and metadata from The Movie Database">
                  <ToggleInput value={settings.enableTmdbEnrichment ?? 'true'} onChange={v => handleSettingsChange('enableTmdbEnrichment', v)} />
                </SettingRow>
                <SettingRow label="TMDB API Key" description="Required for artwork and metadata enrichment">
                  <input type="password" value={settings.tmdbApiKey ?? ''}
                    onChange={e => handleSettingsChange('tmdbApiKey', e.target.value)}
                    placeholder="Paste your TMDB API key"
                    className="w-64 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white focus:outline-none focus:border-gold font-mono" />
                </SettingRow>
              </div>
              <SaveBar saving={settingsSaving} saved={settingsSaved} error={settingsError} />
            </form>
          )}
        </div>
      )}

      {/* ── Storage Tab ── */}
      {activeTab === 'storage' && (
        <div>
          <h2 className="font-semibold text-white font-display text-lg mb-6">Storage Settings</h2>
          {settingsLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-navy-700 rounded-xl" />)}
            </div>
          ) : (
            <form onSubmit={handleSettingsSave}>
              <div className="bg-navy-800 border border-navy-600 rounded-xl divide-y divide-navy-600 shadow-card">
                <SettingRow label="Recordings Path" description="Base directory where recordings are stored (container path)">
                  <input type="text" value={settings.recordingsBasePath ?? '/recordings'}
                    onChange={e => handleSettingsChange('recordingsBasePath', e.target.value)}
                    className="w-64 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-gold" />
                </SettingRow>
                <SettingRow label="Disk Quota" description="Stop recording new content when disk usage exceeds this limit">
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={settings.globalDiskQuotaGB ?? '100'}
                      onChange={e => handleSettingsChange('globalDiskQuotaGB', e.target.value)}
                      className="w-24 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white focus:outline-none focus:border-gold" />
                    <span className="text-sm text-navy-400">GB</span>
                  </div>
                </SettingRow>
                <SettingRow label="ffmpeg Path" description="Path to the ffmpeg binary inside the container">
                  <input type="text" value={settings.ffmpegPath ?? '/usr/bin/ffmpeg'}
                    onChange={e => handleSettingsChange('ffmpegPath', e.target.value)}
                    className="w-64 px-3 py-1.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-gold" />
                </SettingRow>
              </div>
              <SaveBar saving={settingsSaving} saved={settingsSaved} error={settingsError} />
            </form>
          )}
        </div>
      )}

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-white font-display text-lg">Users</h2>
            <button
              onClick={() => { if (showUserForm) { resetUserForm() } else { handleOpenAddUser() } }}
              className="px-4 py-2 bg-gold hover:bg-gold-muted text-navy font-semibold rounded-lg text-sm transition-colors"
            >
              {showUserForm ? 'Cancel' : 'Add User'}
            </button>
          </div>

          {/* User Form */}
          {showUserForm && (
            <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 mb-6 shadow-card">
              <h3 className="font-semibold text-white font-display mb-4">
                {editingUserId ? 'Edit User' : 'Add User'}
              </h3>
              {userError && (
                <div className="mb-4 p-3 bg-rust/10 border border-rust/30 rounded-lg text-sm text-rust">
                  {userError}
                </div>
              )}
              <form onSubmit={handleUserSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1.5">Username</label>
                    <input type="text" value={userFormData.username}
                      onChange={e => setUserFormData(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none placeholder-navy-400"
                      required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1.5">Role</label>
                    <select value={userFormData.role}
                      onChange={e => setUserFormData(prev => ({ ...prev, role: e.target.value as 'ADMIN' | 'USER' }))}
                      className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none">
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1.5">
                      {editingUserId ? 'New Password (leave blank to keep)' : 'Password'}
                    </label>
                    <input type="password" value={userFormData.password}
                      onChange={e => setUserFormData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none"
                      required={!editingUserId} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1.5">Confirm Password</label>
                    <input type="password" value={userFormData.confirmPassword}
                      onChange={e => setUserFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">
                    Storage Quota (GB) <span className="text-navy-500 font-normal">— leave blank for unlimited</span>
                  </label>
                  <input type="number" min={1}
                    value={userFormData.storageQuotaGB ?? ''}
                    onChange={e => setUserFormData(prev => ({ ...prev, storageQuotaGB: e.target.value ? Number(e.target.value) : null }))}
                    className="w-32 px-3 py-2 bg-navy-700 border border-navy-500 focus:border-gold rounded-lg text-white focus:outline-none placeholder-navy-400"
                    placeholder="∞" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">
                    Assigned Sources
                    <span className="ml-2 text-white/30 font-normal">— leave all unchecked to allow all sources</span>
                  </label>
                  {sources.length === 0 ? (
                    <p className="text-xs text-white/30 py-2">No sources configured yet.</p>
                  ) : (
                    <div className="bg-navy-700 border border-navy-500 rounded-lg overflow-hidden">
                      {sources.map((src, i) => {
                        const checked = (userFormData.assignedSourceIds ?? []).includes(src.id)
                        return (
                          <label
                            key={src.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-navy-600 transition-colors ${i < sources.length - 1 ? 'border-b border-navy-500' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleUserSourceToggle(src.id)}
                              className="accent-gold flex-shrink-0"
                            />
                            <span className={`flex-1 text-sm ${checked ? 'text-white' : 'text-white/50'}`}>{src.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${src.type === 'M3U' ? 'text-teal border-teal/30 bg-teal/10' : 'text-gold border-gold/30 bg-gold/10'}`}>
                              {src.type}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-white/60">
                      Assigned Groups
                      <span className="ml-2 text-white/30 font-normal">— leave all unchecked to allow all groups</span>
                    </label>
                    {groupsLoadingForUser && <span className="text-xs text-gold/70">Loading…</span>}
                  </div>
                  {!groupsLoadingForUser && availableGroups.length === 0 ? (
                    <p className="text-xs text-white/30 py-2">
                      {sources.length === 0
                        ? 'No sources configured yet.'
                        : 'No enabled groups found. Sync your sources first.'}
                    </p>
                  ) : (
                    <div className="bg-navy-700 border border-navy-500 rounded-lg max-h-52 overflow-y-auto">
                      {availableGroups.map((groupName, i) => {
                        const checked = (userFormData.assignedGroups ?? []).includes(groupName)
                        return (
                          <label
                            key={groupName}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-navy-600 transition-colors ${i < availableGroups.length - 1 ? 'border-b border-navy-500' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleUserGroupToggle(groupName)}
                              className="accent-gold flex-shrink-0"
                            />
                            <span className={`text-sm ${checked ? 'text-white' : 'text-white/50'}`}>{groupName}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={userFormData.requireToken}
                    onChange={e => setUserFormData(prev => ({ ...prev, requireToken: e.target.checked }))}
                    className="accent-gold" />
                  <span className="text-sm text-white/60">Require token for M3U playlist access</span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={userSubmitting}
                    className="px-4 py-2 bg-gold hover:bg-gold-muted disabled:opacity-50 text-navy font-semibold rounded-lg text-sm transition-colors">
                    {userSubmitting ? (editingUserId ? 'Updating…' : 'Creating…') : (editingUserId ? 'Update User' : 'Create User')}
                  </button>
                  <button type="button" onClick={resetUserForm}
                    className="px-4 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-500 text-white rounded-lg text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Users List */}
          {usersLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-navy-700 rounded-xl" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 bg-navy-800 border border-navy-600 rounded-xl">
              <p className="text-white/50 mb-2">No users yet</p>
              <p className="text-sm text-navy-400">Create the first user account above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="bg-navy-800 border border-navy-600 rounded-xl p-4 shadow-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold font-semibold text-sm flex-shrink-0">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-white">{user.username}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          user.role === 'ADMIN'
                            ? 'bg-gold/20 text-gold border-gold/30'
                            : 'bg-navy-700 text-white/50 border-navy-500'
                        }`}>
                          {user.role}
                        </span>
                        {!user.isActive && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rust/20 text-rust border border-rust/30">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-navy-400 space-y-0.5 ml-11">
                        <div>
                          Quota: <span className="text-white/50">{user.storageQuotaGB ? `${user.storageQuotaGB} GB` : 'Unlimited'}</span>
                          {' · '}
                          Sources: <span className="text-white/50">{user.assignedSourceIds.length ? user.assignedSourceIds.length : 'All'}</span>
                          {' · '}
                          Groups: <span className="text-white/50">{user.assignedGroups.length ? user.assignedGroups.length : 'All'}</span>
                        </div>
                        {user.playlistToken && (
                          <div className="font-mono flex items-center gap-2">
                            <span className="text-navy-500">Token:</span>
                            <span className="text-teal">{user.playlistToken}</span>
                            {user.requireToken && <span className="text-gold text-[10px] uppercase tracking-wide">required</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleRegenerateToken(user.id)} disabled={regeneratingTokenId === user.id}
                        className="px-3 py-1.5 bg-teal/10 hover:bg-teal/20 text-teal border border-teal/30 rounded-lg text-xs transition-colors disabled:opacity-50">
                        {regeneratingTokenId === user.id ? '…' : 'Regen Token'}
                      </button>
                      <button onClick={() => handleEditUser(user)}
                        className="px-3 py-1.5 bg-navy-700 hover:bg-navy-600 border border-navy-500 text-white rounded-lg text-sm transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDeleteUser(user.id)} disabled={deletingUserId === user.id}
                        className="px-3 py-1.5 bg-rust/10 hover:bg-rust/20 text-rust border border-rust/30 rounded-lg text-sm transition-colors disabled:opacity-50">
                        {deletingUserId === user.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helper components ──────────────────────────────────────────

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-navy-400 mt-0.5">{description}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function ToggleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const on = value === 'true'
  return (
    <button
      type="button"
      onClick={() => onChange(on ? 'false' : 'true')}
      className={`w-10 h-5 rounded-full border relative transition-colors ${
        on ? 'bg-gold border-gold-muted' : 'bg-navy-700 border-navy-500'
      }`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

function SaveBar({ saving, saved, error }: { saving: boolean; saved: boolean; error: string | null }) {
  return (
    <div className="flex items-center gap-4 mt-4">
      <button type="submit" disabled={saving}
        className="px-4 py-2 bg-gold hover:bg-gold-muted disabled:opacity-50 text-navy font-semibold rounded-lg text-sm transition-colors">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
      {saved && <span className="text-sm text-teal">✓ Saved</span>}
      {error && <span className="text-sm text-rust">{error}</span>}
    </div>
  )
}
