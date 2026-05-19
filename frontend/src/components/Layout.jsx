import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',    icon: '▦' },
  { to: '/transactions', label: 'Transactions', icon: '◈' },
  { to: '/alerts',       label: 'Alerts',       icon: '◉' },
  { to: '/rules',        label: 'Rules',        icon: '◧' },
]

export default function Layout() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  function logout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="flex h-screen bg-[#05080f] text-slate-200 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-[#1a2744] bg-[#070b14]">

        {/* Brand */}
        <div className="px-5 py-5 border-b border-[#1a2744]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-bold text-white">FS</div>
            <span className="font-bold text-white text-sm tracking-wide">FraudShield</span>
          </div>
          <p className="mt-1 text-[9px] text-slate-600 tracking-[0.2em] uppercase">Detection System</p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-500 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className="px-3 py-4 border-t border-[#1a2744] space-y-1">
          <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-[#1a2744]">
            <p className="text-xs text-slate-300 truncate">{user?.email || 'user'}</p>
            <p className="text-[10px] text-slate-600 capitalize mt-0.5">{user?.role || 'analyst'}</p>
          </div>
          <button
            onClick={logout}
            className="w-full px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-left border border-transparent hover:border-red-500/20"
          >
            ← Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="h-12 flex-shrink-0 flex items-center justify-between px-6 border-b border-[#1a2744] bg-[#070b14]/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-500 tracking-widest">SYSTEM ONLINE</span>
          </div>
          <span className="text-[10px] text-slate-600">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}