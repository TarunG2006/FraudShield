import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import api from '../api/axios'
import StatCard from '../components/StatCard'

export default function Dashboard() {
  const [overview,  setOverview]  = useState(null)
  const [trends,    setTrends]    = useState([])
  const [riskDist,  setRiskDist]  = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const [sumRes, trendRes, distRes] = await Promise.allSettled([
        api.get('/analytics/dashboard'),
        api.get('/analytics/transaction-trend'),
        api.get('/analytics/risk-distribution'),
      ])

      if (sumRes.status === 'fulfilled') {
        const d = sumRes.value.data?.data
        setOverview(d?.overview ?? d ?? {})
      }

      if (trendRes.status === 'fulfilled') {
        setTrends(trendRes.value.data?.data ?? [])
      }

      if (distRes.status === 'fulfilled') {
        setRiskDist(distRes.value.data?.data ?? [])
      }

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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Volume trend */}
        <div className="lg:col-span-2 rounded-xl border border-[#1a2744] bg-[#0c1426] p-5">
          <h2 className="text-sm font-semibold text-white">Transaction Volume</h2>
          <p className="text-[10px] font-mono text-slate-600 tracking-widest mb-4 mt-0.5">DAILY TREND — LAST 14 DAYS</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trends} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v.slice(5)} // show MM-DD only
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#0c1426', border: '1px solid #1a2744', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
              <Line type="monotone" dataKey="fraud" stroke="#ef4444" strokeWidth={2} dot={false} name="Fraud" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Risk distribution */}
        <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] p-5">
          <h2 className="text-sm font-semibold text-white">Risk Distribution</h2>
          <p className="text-[10px] font-mono text-slate-600 tracking-widest mb-4 mt-0.5">BY SCORE BAND</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={riskDist} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" horizontal={false} />
              <XAxis type="number"   tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={95}
              />
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

      {/* Secondary stats */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="High Risk (75+)"  value={o.highRiskCount ?? 0}  sub="Risk score >= 75"    accent="red"     icon="▲" />
          <StatCard title="False Positives"  value={o.falsePositives ?? 0} sub="Marked safe"         accent="emerald" icon="✓" />
          <StatCard title="Active Rules"     value={o.activeRules ?? 0}    sub="Detection rules on"  accent="blue"    icon="◆" />
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
