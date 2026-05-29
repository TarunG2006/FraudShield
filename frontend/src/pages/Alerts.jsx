import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import api from '../api/axios'
import RiskBadge from '../components/RiskBadge'
import useAuthStore from '../store/authStore'

const SEVERITY_STYLE = {
  critical: 'border-l-red-500   bg-red-500/5',
  high:     'border-l-red-400   bg-red-400/[0.04]',
  medium:   'border-l-amber-400 bg-amber-400/[0.04]',
  low:      'border-l-emerald-400 bg-emerald-400/[0.03]',
}

const SEVERITY_CHIP = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high:     'bg-red-400/15 text-red-300 border-red-400/30',
  medium:   'bg-amber-400/15 text-amber-300 border-amber-400/30',
  low:      'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
}

const RULE_COLORS = [
  'bg-blue-500/15 text-blue-300 border-blue-500/20',
  'bg-purple-500/15 text-purple-300 border-purple-500/20',
  'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
  'bg-rose-500/15 text-rose-300 border-rose-500/20',
  'bg-orange-500/15 text-orange-300 border-orange-500/20',
  'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
]

const TABS = ['all', 'critical', 'high', 'medium', 'low']

function normalizeAlert(a) {
  return {
    ...a,
    id:             a.id,
    severity:       a.severity ?? 'low',
    message:        a.message ?? '',
    recommendation: a.recommendation ?? '',
    riskScore:      a.details?.riskScore ?? a.riskScore ?? a.risk_score ?? 0,
    createdAt:      a.createdAt ?? a.created_at ?? null,
    triggeredRules: a.details?.triggeredRules ?? a.triggeredRules ?? a.triggered_rules ?? [],
    // Transaction fields may be nested or flat
    amount:         a.amount ?? a.transaction?.amount ?? null,
    merchantName:   a.merchantName ?? a.merchant_name ?? a.transaction?.merchant_name ?? null,
  }
}

function parseRules(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)   return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function Alerts() {
  const [alerts,    setAlerts]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [connected, setConnected] = useState(false)
  const [tab,       setTab]       = useState('all')
  const socketRef = useRef(null)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/alerts?page=1&limit=100')
        const d   = data.data ?? data
        const raw = Array.isArray(d) ? d : (d.alerts ?? [])
        setAlerts(raw.map(normalizeAlert))
      } catch (e) {
        console.error('Alerts load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth:       { token },
      transports: ['polling', 'websocket'],
      upgrade:    true,
    })
    socketRef.current = socket
    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('new_alert',  (alert) => {
      setAlerts((prev) => [normalizeAlert(alert), ...prev])
    })
    return () => socket.disconnect()
  }, [token])

  const markRead = async (alertId) => {
    try {
      await api.patch(`/alerts/${alertId}/read`)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a))
    } catch (e) {
      console.warn('markRead failed', e.message)
    }
  }

  const markAllRead = async () => {
    const unreadIds = alerts.filter(a => !a.is_read).map(a => a.id)
    await Promise.allSettled(unreadIds.map(id => api.patch(`/alerts/${id}/read`)))
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
  }

  const filtered = tab === 'all' ? alerts : alerts.filter(a => a.severity === tab)
  const unread   = alerts.filter(a => !a.is_read).length

  const tabCounts = TABS.reduce((acc, t) => {
    acc[t] = t === 'all' ? alerts.length : alerts.filter(a => a.severity === t).length
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            Alerts
            {unread > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-mono border border-red-500/30">
                {unread} unread
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">Real-time fraud alerts</p>
        </div>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs font-mono text-slate-400 hover:text-white border border-[#1a2744] hover:border-slate-500 px-3 py-1.5 rounded-lg transition-all"
            >
              ✓ Mark all read
            </button>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1a2744] bg-[#0c1426]">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-mono text-slate-400 tracking-widest">
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Severity Filter Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-[#0c1426] border border-[#1a2744] w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono capitalize transition-all ${
              tab === t
                ? 'bg-[#1a2744] text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
            {tabCounts[t] > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] border ${
                tab === t
                  ? t === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : t === 'high'     ? 'bg-red-400/15 text-red-300 border-red-400/30'
                  : t === 'medium'   ? 'bg-amber-400/15 text-amber-300 border-amber-400/30'
                  : t === 'low'      ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
                  : 'bg-slate-700 text-slate-400 border-slate-600'
                  : 'bg-slate-800 text-slate-600 border-slate-700'
              }`}>
                {tabCounts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm font-mono">Loading alerts...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] p-14 text-center">
          <p className="text-slate-500 font-mono text-sm">No {tab !== 'all' ? tab : ''} alerts</p>
          <p className="text-slate-700 text-xs mt-1">New alerts will appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((alert, i) => {
            const rules = parseRules(alert.triggeredRules)
            return (
              <div
                key={alert.id ?? i}
                className={`rounded-xl border border-[#1a2744] border-l-4 p-4 transition-all
                  ${SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.low}
                  ${!alert.is_read ? 'ring-1 ring-white/5' : 'opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Top row: severity badge + unread dot + time-ago */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${SEVERITY_CHIP[alert.severity] ?? SEVERITY_CHIP.low}`}>
                        {alert.severity}
                      </span>
                      {!alert.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Unread" />
                      )}
                      <span className="text-[10px] font-mono text-slate-600 ml-auto">
                        {timeAgo(alert.createdAt)}
                      </span>
                    </div>

                    {/* Merchant + Amount prominently */}
                    {(alert.merchantName || alert.amount) && (
                      <div className="flex items-center gap-3 mb-1.5">
                        {alert.merchantName && (
                          <span className="text-sm font-semibold text-white font-mono">
                            {alert.merchantName}
                          </span>
                        )}
                        {alert.amount && (
                          <span className="text-sm font-bold text-emerald-400 font-mono">
                            ${parseFloat(alert.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-sm text-slate-300 leading-relaxed">{alert.message}</p>

                    {alert.recommendation && (
                      <p className="mt-1.5 text-xs text-slate-400">
                        <span className="text-slate-600 font-mono">REC </span>
                        {alert.recommendation}
                      </p>
                    )}

                    {/* Rule chips */}
                    {rules.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {rules.map((rule, ri) => (
                          <span
                            key={ri}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${RULE_COLORS[ri % RULE_COLORS.length]}`}
                          >
                            {rule}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right side: score + mark read button */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                    <div>
                      <p className="text-2xl font-bold text-white font-mono leading-none">{alert.riskScore}</p>
                      <p className="text-[9px] text-slate-600 font-mono tracking-widest">RISK</p>
                    </div>
                    {!alert.is_read && (
                      <button
                        onClick={() => markRead(alert.id)}
                        className="text-[10px] font-mono text-slate-500 hover:text-emerald-400 border border-[#1a2744] hover:border-emerald-500/30 px-2 py-1 rounded-md transition-all whitespace-nowrap"
                      >
                        ✓ Read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
