// packages/web/src/contexts/AuthContext.tsx
// Provides the current user, login, logout, and setup status to the whole app

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import axios from 'axios'

// ── Types ─────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  username: string
  role: 'ADMIN' | 'USER'
  storageQuotaGB: number | null
  assignedSourceIds: string[]
  assignedGroups: string[]
  playlistToken: string | null
  requireToken: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  needsSetup: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

// ── Context ───────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  const checkSetupStatus = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/auth/setup-status')
      setNeedsSetup(res.data.data.needsSetup)
    } catch {
      setNeedsSetup(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/auth/me', { withCredentials: true })
      setUser(res.data.data)
    } catch {
      setUser(null)
    }
  }, [])

  // On mount: check setup status and try to restore session
  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await checkSetupStatus()
      await refreshUser()
      setIsLoading(false)
    }
    void init()
  }, [checkSetupStatus, refreshUser])

  const login = async (username: string, password: string) => {
    const res = await axios.post('/api/v1/auth/login', { username, password }, { withCredentials: true })
    setUser(res.data.data)
    setNeedsSetup(false)
  }

  const logout = async () => {
    await axios.post('/api/v1/auth/logout', {}, { withCredentials: true })
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, needsSetup, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
