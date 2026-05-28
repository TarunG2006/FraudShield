import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import api from '../api/axios'
import StatCard from '../components/StatCard'

// ── Fraud by Hour Heatmap ──────────────────────────────────────────────────────
function HourHeatmap({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-600 text-xs font-mono text-center py-8">No data</p>
  }
  const maxCount = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex gap-1 flex-wrap">
      {data.map(d => {
        const intensity = d.count / maxCount
        const bg = intensity === 0
          ? 'bg-[#0f1a2e]'
          : intensity < 0.25 ? 'bg-blue-900/60'
          : intensity < 0.5  ? 'bg-amber-800/70'
          : intensity < 0.75 ? 'bg-orange-600/80'
          : 'bg-red-500/90'
        return (
          <div key={d.hour} className="flex flex-col items-center gap-0.5 group relative">
            <div className={`w-7 h-7 rounded-md ${bg} border border-white/5 flex items-center justify-center cursor-default transition-all group-hover:scale-110`}>
              {d.count > 0 && (
                <span className="text-[8px] font-mono text-white/70">{d.count}</span>
              )}
            </div>
            <span className="text-[8px] font-mono text-slate-700">{d.hour}</span>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
              <div className="bg-[#0c1426] border border-[#1a2744] rounded-lg px-2 py-1 text-[10px] font-mono text-slate-300 whitespace-nowrap shadow-xl">
                {d.label}: {d.count} fraud txn{d.count !== 1 ? 's' : ''}
              </div>
              <div className="w-1.5 h-1.5 bg-[#1a2744] rotate-45 -mt-[3px]" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Top Flagged Merchants list ─────────────────────────────────────────────────
function MerchantList({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-600 text-xs font-mono text-center py-4">No data</p>
  }
  const max = Math.max(...data.map(d => d.fraud_count), 1)
  return (
    <div className="space-y-2">
      {data.map((m, i) => (
        <div key={m.merchant} className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-600 w-4 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between mb-0.5">
              <span className="text-xs font-mono text-slate-300 truncate">{m.merchant}</span>
              <span className="text-xs font-mono text-red-400 ml-2 flex-shrink-0">{m.fraud_count}</span>
            </div>
            <div className="h-1 rounded-full bg-[#1a2744]">
              <div
                className="h-1 rounded-full bg-red-500/70"
                style={{ width: `${(m.fraud_count / max) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] font-mono text-slate-600 w-10 text-right">
            {m.avg_risk}
          </span>
        </div>
      ))}
      <div className="flex justify-between text-[9px] font-mono text-slate-700 mt-1 px-5">
        <span>merchant</span>
        <span>flags / avg risk</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [overview,         setOverview]         = useState(null)
  const [trends,           setTrends]           = useState([])
  const [riskDist,         setRiskDist]         = useState([])
  const [fraudIndicators,  setFraudIndicators]  = useState([])
  const [fraudByHour,      setFraudByHour]      = useState([])
  const [topFlagged,       setTopFlagged]       = useState([])
  const [loading,          setLoading]          = useState(true)

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([
        api.get('/analytics/dashboard'),
        api.get('/analytics/transaction-trend'),
        api.get('/analytics/risk-distribution'),
        api.get('/analytics/fraud-indicators'),
        api.get('/analytics/fraud-by-hour'),
        api.get('/analytics/top-flagged-merchants'),
      ])

      if (results[0].status === 'fulfilled') {
        const d = results[0].value.data?.data
        setOverview(d?.overview ?? d ?? {})
      }
      if (results[1].status === 'fulfilled') setTrends(results[1].value.data?.data ?? [])
      if (results[2].status === 'fulfilled') setRiskDist(results[2].value.data?.data ?? [])
      if (results[3].status === 'fulfilled') setFraudIndicators(results[3].value.data?.data ?? [])
      if (results[4].status === 'fulfilled') setFraudByHour(results[4].value.data?.data ?? [])
      if (results[5].status === 'fulfilled') setTopFlagged(results[5].value.data?.data ?? [])

      setLoading(false)
    }
    load()
  }, [])

  const o = overview ?? {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-xs text-slate-500 font-mono mt-0.5">Real-time fraud detection overview</p>
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Transactions"
          value={loading ? '…' : (o.totalTransactions ?? 0).toLocaleString()}
          sub="All time"
          accent="blue"
          icon="◈"
        />
        <StatCard
          title="Flagged + Blocked"
          value={loading ? '…' : ((o.flaggedCount ?? 0) + (o.blockedCount ?? 0))}
          sub="Fraud detected"
          accent="red"
          icon="⚑"
        />
        <StatCard
          title="Unread Alerts"
          value={loading ? '…' : (o.unreadAlerts ?? 0)}
          sub="Require attention"
          accent="amber"
          icon="◉"
        />
        <StatCard
          title="Avg Risk Score"
          value={loading ? '…' : Number(o.avgRisk ?? 0).toFixed(1)}
          sub="Across all records"
          accent="emerald"
          icon="◎"
        />
      </div>

      {/* Volume trend + Risk distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-[#1a2744] bg-[#0c1426] p-5">
          <h2 className="text-sm font-semibold text-white">Transaction Volume</h2>
          <p className="text-[10px] font-mono text-slate-600 tracking-widest mb-4 mt-0.5">DAILY TREND — LAST 14 DAYS</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trends} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false} axisLine={false}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0c1426', border: '1px solid #1a2744', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }}
              />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
              <Line type="monotone" dataKey="fraud" stroke="#ef4444" strokeWidth={2} dot={false} name="Fraud" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] p-5">
          <h2 className="text-sm font-semibold text-white">Risk Distribution</h2>
          <p className="text-[10px] font-mono text-slate-600 tracking-widest mb-4 mt-0.5">BY SCORE BAND</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={riskDist} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={95} />
              <Tooltip
                contentStyle={{ background: '#0c1426', border: '1px solid #1a2744', borderRadius: 8, fontSize: 11 }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {riskDist.map((entry) => (
                  <Cell key={entry.name} fill={entry.color ?? '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Fraud Indicators + Top Flagged Merchants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Fraud Indicators bar chart */}
        <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] p-5">
          <h2 className="text-sm font-semibold text-white">Recent Fraud Indicators</h2>
          <p className="text-[10px] font-mono text-slate-600 tracking-widest mb-4 mt-0.5">RULES FIRED — LAST 24H</p>
          {fraudIndicators.length === 0 ? (
            <p className="text-slate-600 text-xs font-mono text-center py-8">No fraud indicators in last 24h</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fraudIndicators} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category" dataKey="rule"
                  tick={{ fill: '#94a3b8', fontSize: 9, fontFamily: 'monospace' }}
                  tickLine={false} axisLine={false} width={130}
                />
                <Tooltip
                  contentStyle={{ background: '#0c1426', border: '1px solid #1a2744', borderRadius: 8, fontSize: 11 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(v) => [v, 'Times fired']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Flagged Merchants */}
        <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] p-5">
          <h2 className="text-sm font-semibold text-white">Top Flagged Merchants</h2>
          <p className="text-[10px] font-mono text-slate-600 tracking-widest mb-4 mt-0.5">LAST 30 DAYS — BY FRAUD COUNT</p>
          <MerchantList data={topFlagged} />
        </div>
      </div>

      {/* Fraud by Hour heatmap */}
      <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] p-5">
        <h2 className="text-sm font-semibold text-white">Fraud by Hour</h2>
        <p className="text-[10px] font-mono text-slate-600 tracking-widest mb-4 mt-0.5">UTC HOUR — LAST 7 DAYS (FLAGGED + BLOCKED ONLY)</p>
        <HourHeatmap data={fraudByHour} />
        <div className="flex items-center gap-4 mt-3">
          {[
            { label: 'None',   cls: 'bg-[#0f1a2e]' },
            { label: 'Low',    cls: 'bg-blue-900/60' },
            { label: 'Med',    cls: 'bg-amber-800/70' },
            { label: 'High',   cls: 'bg-orange-600/80' },
            { label: 'Peak',   cls: 'bg-red-500/90' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${l.cls} border border-white/5`} />
              <span className="text-[9px] font-mono text-slate-600">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary stats */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="High Risk (75+)"
            value={o.highRiskCount ?? 0}
            sub="Risk score >= 75"
            accent="red"
            icon="▲"
          />
          <StatCard
            title="False Positives"
            value={o.falsePositives ?? 0}
            sub="Marked safe"
            accent="emerald"
            icon="✔"
          />
          <StatCard
            title="Active Rules"
            value={o.activeRules ?? 11}
            sub="Detection rules on"
            accent="blue"
            icon="◆"
          />
          <StatCard
            title="Fraud Rate"
            value={`${o.fraudRate ?? 0}%`}
            sub="Flagged + blocked"
            accent="amber"
            icon="~"
          />
        </div>
      )}
    </div>
  )
}