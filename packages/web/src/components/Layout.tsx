import { Link, useLocation } from 'react-router-dom'
import { ReactNode, useState, useEffect } from 'react'
import { useSocketEvent } from '../hooks/useSocket.ts'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [liveRecordingCount, setLiveRecordingCount] = useState(0)

  // Listen for live recording updates
  useSocketEvent('recording:started', () => {
    setLiveRecordingCount(prev => prev + 1)
  })

  useSocketEvent('recording:completed', () => {
    setLiveRecordingCount(prev => Math.max(0, prev - 1))
  })

  useSocketEvent('recording:failed', () => {
    setLiveRecordingCount(prev => Math.max(0, prev - 1))
  })

  useSocketEvent('recording:cancelled', () => {
    setLiveRecordingCount(prev => Math.max(0, prev - 1))
  })

  const navItems = [
    { path: '/guide', label: 'Guide', icon: '📺' },
    { path: '/recordings', label: 'Recordings', icon: '🎬' },
    { path: '/schedule', label: 'Schedule', icon: '📅' },
    { path: '/status', label: 'Status', icon: '📊' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ]

  const isActive = (path: string) => {
    return location.pathname === path || (path === '/guide' && location.pathname === '/')
  }

  return (
    <div className="flex h-screen bg-surface text-gray-200">
      {/* Sidebar */}
      <div className="w-64 bg-[#0a0c12] border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <h1 className="font-mono text-amber-500 text-xs uppercase tracking-widest">
            AnywhereDVR
          </h1>
          {liveRecordingCount > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-red-400">
                {liveRecordingCount} recording{liveRecordingCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
                ${isActive(item.path) 
                  ? 'bg-surface-50 border-l-2 border-amber-500 text-amber-500' 
                  : 'text-gray-400 hover:bg-surface-50 hover:text-gray-200'
                }
              `}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-16 bg-surface-50 border-b border-border flex items-center px-6">
          <h2 className="font-mono text-amber-500 text-xs uppercase tracking-widest">
            AnywhereDVR
          </h2>
          <div className="ml-auto">
            {liveRecordingCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-400 font-semibold">
                  {liveRecordingCount} live
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}