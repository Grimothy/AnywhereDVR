// packages/web/src/components/Layout.tsx
// Main app shell — collapsible sidebar, role-aware nav, new palette

import { Link, useLocation } from 'react-router-dom'
import { ReactNode, useState } from 'react'
import { useSocketEvent } from '../hooks/useSocket.ts'
import { useAuth } from '../contexts/AuthContext.tsx'

interface LayoutProps {
  children: ReactNode
}

// ── Nav icons (inline SVG, no library dependency) ─────────────

function IconGuide({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M9 21V9"/>
    </svg>
  )
}
function IconRecordings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
    </svg>
  )
}
function IconSchedule({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}
function IconPasses({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  )
}
function IconStatus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
    </svg>
  )
}
function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
  )
}
function IconChannels({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="2" y="7" width="20" height="15" rx="2"/>
      <path d="M17 2l-5 5-5-5"/>
    </svg>
  )
}
function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  )
}
function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M15 19l-7-7 7-7"/>
    </svg>
  )
}
function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
    </svg>
  )
}

// ── Layout ────────────────────────────────────────────────────

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const [liveCount, setLiveCount] = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  useSocketEvent('recording:started', () => setLiveCount(p => p + 1))
  useSocketEvent('recording:completed', () => setLiveCount(p => Math.max(0, p - 1)))
  useSocketEvent('recording:failed', () => setLiveCount(p => Math.max(0, p - 1)))
  useSocketEvent('recording:cancelled', () => setLiveCount(p => Math.max(0, p - 1)))

  const isAdmin = user?.role === 'ADMIN'

  // Admin sees all nav items; users see a trimmed set
  const adminNav = [
    { path: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
    { path: '/guide', label: 'Guide', Icon: IconGuide },
    { path: '/channels', label: 'Channels', Icon: IconChannels },
    { path: '/search', label: 'Search', Icon: IconSearch },
    { path: '/recordings', label: 'Recordings', Icon: IconRecordings },
    { path: '/schedule', label: 'Schedule', Icon: IconSchedule },
    { path: '/passes', label: 'Series Passes', Icon: IconPasses },
    { path: '/status', label: 'Status', Icon: IconStatus },
    { path: '/settings', label: 'Settings', Icon: IconSettings },
  ]

  const userNav = [
    { path: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
    { path: '/guide', label: 'Guide', Icon: IconGuide },
    { path: '/channels', label: 'Channels', Icon: IconChannels },
    { path: '/search', label: 'Search', Icon: IconSearch },
    { path: '/recordings', label: 'My Recordings', Icon: IconRecordings },
    { path: '/schedule', label: 'My Schedule', Icon: IconSchedule },
  ]

  const navItems = isAdmin ? adminNav : userNav

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="flex h-screen bg-navy overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside
        className={`
          flex flex-col flex-shrink-0 bg-navy-700 border-r border-navy-500
          transition-all duration-200 ease-in-out
          ${collapsed ? 'w-16' : 'w-60'}
        `}
      >
        {/* Logo row */}
        <div className={`flex items-center border-b border-navy-500 h-16 px-3 gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-gold" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 3H3C1.9 3 1 3.9 1 5v12c0 1.1.9 2 2 2h5l-1 3v1h10v-1l-1-3h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H3V5h18v10z"/>
            </svg>
          </div>
          {!collapsed && (
            <span className="font-display font-bold text-white text-sm tracking-wide truncate flex-1">
              AnywhereDVR
            </span>
          )}
          <button
            onClick={() => setCollapsed(p => !p)}
            className={`flex-shrink-0 p-1 rounded-lg text-white/50 hover:text-white hover:bg-navy-600 transition-colors ${collapsed ? 'rotate-180' : ''}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <IconChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Live recording badge */}
        {liveCount > 0 && !collapsed && (
          <div className="mx-3 mt-3 flex items-center gap-2 bg-rust-muted border border-rust/30 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-rust-light animate-pulse flex-shrink-0" />
            <span className="text-xs text-rust-light font-medium">
              {liveCount} recording{liveCount !== 1 ? 's' : ''} live
            </span>
          </div>
        )}
        {liveCount > 0 && collapsed && (
          <div className="mx-3 mt-3 flex justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-rust-light animate-pulse" title={`${liveCount} live`} />
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, label, Icon }) => {
            const active = isActive(path)
            return (
              <Link
                key={path}
                to={path}
                title={collapsed ? label : undefined}
                className={`
                  flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all
                  ${active
                    ? 'bg-gold/10 text-gold border border-gold/20'
                    : 'text-white/50 hover:bg-navy-600 hover:text-white border border-transparent'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User footer */}
        <div className={`border-t border-navy-500 p-2 ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <button
              onClick={logout}
              className="p-2 rounded-xl text-white/50 hover:text-rust-light hover:bg-navy-600 transition-colors"
              title="Sign out"
            >
              <IconLogout className="w-5 h-5" />
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-teal/20 border border-teal/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-teal uppercase">
                  {user?.username?.charAt(0) ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.username}</p>
                <p className="text-xs text-white/50 capitalize">{user?.role?.toLowerCase()}</p>
              </div>
              <button
                onClick={logout}
                className="flex-shrink-0 p-1.5 rounded-lg text-white/50 hover:text-rust-light hover:bg-navy-600 transition-colors"
                title="Sign out"
              >
                <IconLogout className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex-shrink-0 bg-navy-700 border-b border-navy-500 flex items-center px-6 gap-4">
          {/* Page title via breadcrumb feel */}
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-semibold text-white text-sm truncate">
              {getPageTitle(location.pathname)}
            </h2>
          </div>

          {/* Live indicator */}
          {liveCount > 0 && (
            <div className="flex items-center gap-2 bg-rust-muted border border-rust/30 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-rust-light animate-pulse" />
              <span className="text-xs font-medium text-rust-light">{liveCount} live</span>
            </div>
          )}

          {/* User role badge */}
          {user && (
            <span className={`
              text-xs font-medium px-2.5 py-1 rounded-full border
              ${isAdmin
                ? 'text-gold border-gold/30 bg-gold/10'
                : 'text-teal border-teal/30 bg-teal-muted'
              }
            `}>
              {isAdmin ? 'Admin' : 'User'}
            </span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/': 'Program Guide',
    '/guide': 'Program Guide',
    '/channels': 'Channels',
    '/search': 'Search',
    '/dashboard': 'Dashboard',
    '/recordings': 'Recordings',
    '/schedule': 'Schedule',
    '/passes': 'Series Passes',
    '/status': 'System Status',
    '/settings': 'Settings',
  }
  return map[pathname] ?? 'AnywhereDVR'
}
