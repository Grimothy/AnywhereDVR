// packages/web/src/pages/SetupWizard.tsx
// First-run setup — creates the initial admin account

import { useState, type FormEvent } from 'react'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext.tsx'

export default function SetupWizard() {
  const { refreshUser } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)
    try {
      await axios.post('/api/v1/auth/setup', { username, password }, { withCredentials: true })
      await refreshUser()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      setError(msg ?? 'Setup failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-gold/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-teal/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 mb-4">
            <svg className="w-7 h-7 text-gold" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 3H3C1.9 3 1 3.9 1 5v12c0 1.1.9 2 2 2h5l-1 3v1h10v-1l-1-3h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H3V5h18v10z"/>
            </svg>
          </div>
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">Welcome to AnywhereDVR</h1>
          <p className="mt-2 text-white/50 text-sm max-w-xs mx-auto">
            Create your administrator account to get started.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-gold flex items-center justify-center text-navy text-xs font-bold">1</div>
            <span className="text-xs text-white/60">Create Admin</span>
          </div>
          <div className="w-8 h-px bg-navy-500" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-navy-500 flex items-center justify-center text-white/50 text-xs font-bold">2</div>
            <span className="text-xs text-white/50">Add Sources</span>
          </div>
          <div className="w-8 h-px bg-navy-500" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-navy-500 flex items-center justify-center text-white/50 text-xs font-bold">3</div>
            <span className="text-xs text-white/50">Start Recording</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-navy-700 rounded-2xl border border-navy-500 shadow-card p-8">
          <h2 className="font-display text-lg font-semibold text-white mb-5">Admin account details</h2>

          {error && (
            <div className="mb-5 flex items-center gap-3 rounded-xl bg-rust-muted border border-rust/30 px-4 py-3 text-sm text-rust-light">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1.5">Username</label>
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full rounded-xl bg-navy-600 border border-navy-500 text-white placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50 transition-colors"
                placeholder="e.g. admin"
              />
              <p className="mt-1 text-xs text-white/50">Letters, numbers, _ and - only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1.5">Password</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl bg-navy-600 border border-navy-500 text-white placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50 transition-colors"
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1.5">Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full rounded-xl bg-navy-600 border border-navy-500 text-white placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50 transition-colors"
                placeholder="Re-enter password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold hover:bg-gold-hover text-navy font-semibold py-2.5 px-4 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-glow mt-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                'Create admin account →'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
