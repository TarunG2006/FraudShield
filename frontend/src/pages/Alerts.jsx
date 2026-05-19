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

// Handle both snake_case (DB) and camelCase (socket payload)
function normalizeAlert(a) {
  return {
    ...a,
    id:            a.id,
    severity:      a.severity ?? 'low',
    message:       a.message ?? '',
    recommendation: a.recommendation ?? '',
    riskScore:     a.riskScore ?? a.risk_score ?? 0,
    createdAt:     a.createdAt ?? a.created_at ?? null,
    triggeredRules: a.triggeredRules ?? a.triggered_rules ?? [],
  }
}

function parseRules(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export default function Alerts() {
  const [alerts,    setAlerts]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)
  const token = useAuthStore((s) => s.token)

  // Load existing alerts on mount
  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/alerts?page=1&limit=50')
        const d = data.data ?? data
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

  // Socket.io real-time connection
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

  // Mark single alert as read
  const markRead = async (alertId) => {
    try {
      await api.patch(`/alerts/${alertId}/read`)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a))
    } catch (e) {
      console.warn('markRead failed', e.message)
    }
  }

  const unread = alerts.filter(a => !a.is_read).length

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
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1a2744] bg-[#0c1426]">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[10px] font-mono text-slate-400 tracking-widest">
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm font-mono">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] p-14 text-center">
          <p className="text-slate-500 font-mono text-sm">No alerts</p>
          <p className="text-slate-700 text-xs mt-1">New alerts will appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, i) => {
            const rules = parseRules(alert.triggeredRules)
            return (
              <div
                key={alert.id ?? i}
                onClick={() => !alert.is_read && markRead(alert.id)}
                className={`rounded-xl border border-[#1a2744] border-l-4 p-4 transition-all cursor-pointer
                  ${SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.low}
                  ${!alert.is_read ? 'ring-1 ring-white/5' : 'opacity-75'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <RiskBadge level={alert.severity} />
                      {!alert.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Unread" />
                      )}
                      <span className="text-[10px] font-mono text-slate-600">
                        #{String(alert.id ?? i).slice(0, 8)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-200 leading-relaxed">{alert.message}</p>

                    {alert.recommendation && (
                      <p className="mt-1.5 text-xs text-slate-400">
                        <span className="text-slate-600 font-mono">REC </span>
                        {alert.recommendation}
                      </p>
                    )}

                    {rules.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rules.map((rule, ri) => (
                          <span
                            key={ri}
                            className="px-1.5 py-0.5 rounded bg-[#1a2744] text-[10px] font-mono text-slate-500"
                          >
                            {rule}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-white font-mono">{alert.riskScore}</p>
                    <p className="text-[9px] text-slate-600 font-mono tracking-widest">RISK</p>
                    {alert.createdAt && (
                      <p className="text-[10px] text-slate-700 font-mono mt-1">
                        {new Date(alert.createdAt).toLocaleTimeString()}
                      </p>
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
