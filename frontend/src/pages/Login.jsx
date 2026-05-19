import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import api from '../api/axios'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      if (data.success) {
        setAuth(data.data.token, data.data.user)
        navigate('/dashboard')
      } else {
        setError(data.message || 'Login failed')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      className="min-h-screen bg-[#05080f] flex items-center justify-center px-4 relative"
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-3 shadow-lg shadow-blue-600/30">
            <span className="text-lg font-bold text-white">FS</span>
          </div>
          <h1 className="text-2xl font-bold text-white">FraudShield</h1>
          <p className="text-[10px] text-slate-600 tracking-[0.25em] uppercase mt-1">Secure Access Portal</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#1a2744] bg-[#0c1426] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 uppercase mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="user@fraudshield.com"
                className="w-full rounded-lg bg-[#070b14] border border-[#1a2744] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 uppercase mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg bg-[#070b14] border border-[#1a2744] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-xs text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed py-2.5 text-sm font-semibold text-white transition-all shadow-lg shadow-blue-600/20"
            >
              {loading ? 'Authenticating...' : 'Sign in →'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[9px] text-slate-700 tracking-widest uppercase">
          FraudShield v1.0 • Restricted Access
        </p>
      </div>
    </div>
  )
}
