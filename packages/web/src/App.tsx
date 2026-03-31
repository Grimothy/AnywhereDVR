// packages/web/src/App.tsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx'
import Layout from './components/Layout.tsx'
import LoginPage from './pages/LoginPage.tsx'
import SetupWizard from './pages/SetupWizard.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Guide from './pages/Guide.tsx'
import Channels from './pages/Channels.tsx'
import Search from './pages/Search.tsx'
import Recordings from './pages/Recordings.tsx'
import Schedule from './pages/Schedule.tsx'
import SeriesPasses from './pages/SeasonPasses.tsx'
import Status from './pages/Status.tsx'
import Settings from './pages/Settings.tsx'

// ── Loading screen ────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-navy flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-gold animate-pulse" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 3H3C1.9 3 1 3.9 1 5v12c0 1.1.9 2 2 2h5l-1 3v1h10v-1l-1-3h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H3V5h18v10z"/>
          </svg>
        </div>
        <p className="text-white/50 text-sm font-medium">Loading AnywhereDVR…</p>
      </div>
    </div>
  )
}

// ── App routes (inside AuthProvider) ─────────────────────────

function AppRoutes() {
  const { user, isLoading, needsSetup } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (needsSetup) return <SetupWizard />
  if (!user) return <LoginPage />

  const isAdmin = user.role === 'ADMIN'

  return (
    <Layout>
      <Routes>
        {/* Common routes */}
        <Route path="/guide" element={<Guide />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/search" element={<Search />} />
        <Route path="/recordings" element={<Recordings />} />
        <Route path="/schedule" element={<Schedule />} />

        {/* Common to all authenticated users */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Admin-only routes */}
        {isAdmin && (
          <>
            <Route path="/passes" element={<SeriesPasses />} />
            <Route path="/status" element={<Status />} />
            <Route path="/settings" element={<Settings />} />
          </>
        )}

        {/* Default redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}

// ── Root ──────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
