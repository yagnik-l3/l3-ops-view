'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Invalid credentials. Please try again.')
    } else {
      router.push('/timeline')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="h-7 w-7 rounded-lg bg-[#58a6ff]/20 flex items-center justify-center">
              <span className="text-[#58a6ff] text-xs font-bold">L3</span>
            </div>
            <span className="text-[#e6edf3] font-medium">L3 Labs Ops</span>
          </div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Welcome back</h1>
          <p className="text-sm text-[#8b949e] mt-1">Sign in to your founder dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[#30363d] rounded-lg bg-[#161b22] text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] transition-colors"
              placeholder="you@l3labs.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[#30363d] rounded-lg bg-[#161b22] text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] transition-colors"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-[#6e7681] text-center mt-6">
          Internal tool — invite only. Contact your CTO to get access.
        </p>
      </div>
    </div>
  )
}
