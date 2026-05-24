import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

const RISK_RANGE = {
  all:      { minRisk: undefined, maxRisk: undefined },
  low:      { minRisk: 0,  maxRisk: 24  },
  medium:   { minRisk: 25, maxRisk: 49  },
  high:     { minRisk: 50, maxRisk: 74  },
  critical: { minRisk: 75, maxRisk: 100 },
}

const STATUS_COLOR = {
  approved: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  pending:  'text-blue-400    bg-blue-400/10    border-blue-400/20',
  flagged:  'text-amber-400   bg-amber-400/10   border-amber-400/20',
  blocked:  'text-red-400     bg-red-400/10     border-red-400/20',
  safe:     'text-teal-400    bg-teal-400/10    border-teal-400/20',
}

function RiskScore({ score }) {
  const s = parseFloat(score) || 0
  const cls =
    s >= 85 ? 'text-red-400     bg-red-400/15     border-red-400/30'
  : s >= 70 ? 'text-red-300     bg-red-300/10     border-red-300/20'
  : s >= 50 ? 'text-orange-400  bg-orange-400/15  border-orange-400/30'
  : s >= 25 ? 'text-amber-400   bg-amber-400/15   border-amber-400/30'
  :           'text-emerald-400 bg-emerald-400/15 border-emerald-400/30'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold font-mono border ${cls}`}>
      {Math.round(s)}
    </span>
  )
}

function parseRules(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

const RULE_SHORT = {
  'Blacklisted merchant':                                        'BLACKLIST',
  'High transaction amount (>$5,000)':                          'HIGH AMT',
  'High-risk merchant category (crypto/gambling)':              'HIGH RISK',
  'High velocity (>5 transactions in 1 hour)':                  'VELOCITY',
  'Round-trip cycling (layering across 3+ merchants)':          'RT CYCLE',
  'Unusual transaction location':                               'LOCATION',
  'Structuring pattern (amounts just below reporting threshold)': 'STRUCTURING',
  'Cycling pattern (>10 transactions in 24 hours)':             'CYCLING',
  'Amount acceleration (exponential growth pattern)':           'ACCEL',
  'Transaction during odd hours (1AM–5AM)':                     'ODD HRS',
  'Suspiciously round amount':                                  'ROUND AMT',
}

function RuleChips({ rules }) {
  if (!rules || rules.length === 0) return <span className="text-slate-700 text-xs font-mono">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {rules.map((r, i) => (
        <span
          key={i}
          title={r}
          className="px-1.5 py-0.5 rounded bg-[#1a2744] text-[9px] font-mono text-slate-400 border border-white/5 cursor-default"
        >
          {RULE_SHORT[r] ?? r.slice(0, 10)}
        </span>
      ))}
    </div>
  )
}

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [riskFilter,   setRiskFilter]   = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [ruleFilter,   setRuleFilter]   = useState('all')
  const [page,         setPage]         = useState(1)
  const [totalPages,   setTotalPages]   = useState(1)
  const [totalCount,   setTotalCount]   = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = RISK_RANGE[riskFilter] ?? RISK_RANGE.all
      const { data } = await api.get('/transactions', {
        params: {
          page,
          limit:   20,
          search:  search       || undefined,
          status:  statusFilter !== 'all' ? statusFilter : undefined,
          minRisk: range.minRisk,
          maxRisk: range.maxRisk,
          sortBy:  'transaction_time',
          sortDir: 'DESC',
        },
      })

      const d          = data.data ?? data
      let rows         = d.transactions ?? (Array.isArray(d) ? d : [])
      const pagination = d.pagination ?? {}

      // Client-side rule filter (structuring/cycling)
      if (ruleFilter !== 'all') {
        const filterMap = {
          structuring: 'Structuring pattern',
          cycling:     'Cycling pattern',
          roundtrip:   'Round-trip cycling',
          accel:       'Amount acceleration',
        }
        const needle = filterMap[ruleFilter] ?? ''
        rows = rows.filter(tx => {
          const rules = parseRules(tx.fraud_indicators)
          return rules.some(r => r.includes(needle))
        })
      }

      setTransactions(rows)
      setTotalPages(pagination.totalPages ?? 1)
      setTotalCount(pagination.total ?? rows.length)
    } catch (e) {
      console.error('Transactions load error', e)
    } finally {
      setLoading(false)
    }
  }, [page, search, riskFilter, statusFilter, ruleFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Transactions</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            {loading ? 'Loading…' : `${totalCount.toLocaleString()} total records`}
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs font-mono text-slate-400 hover:text-white border border-[#1a2744] hover:border-slate-500 px-3 py-1.5 rounded-lg transition-all"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search merchant, cardholder..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="rounded-lg bg-[#0c1426] border border-[#1a2744] px-4 py-2 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 font-mono w-64"
        />
        <select
          value={riskFilter}
          onChange={(e) => { setRiskFilter(e.target.value); setPage(1) }}
          className="rounded-lg bg-[#0c1426] border border-[#1a2744] px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 font-mono"
        >
          <option value="all">All Risk Levels</option>
          <option value="low">Low (0–24)</option>
          <option value="medium">Medium (25–49)</option>
          <option value="high">High (50–74)</option>
          <option value="critical">Critical (75+)</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-lg bg-[#0c1426] border border-[#1a2744] px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 font-mono"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="flagged">Flagged</option>
          <option value="blocked">Blocked</option>
          <option value="safe">Safe</option>
        </select>
        <select
          value={ruleFilter}
          onChange={(e) => { setRuleFilter(e.target.value); setPage(1) }}
          className="rounded-lg bg-[#0c1426] border border-[#1a2744] px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 font-mono"
        >
          <option value="all">All Patterns</option>
          <option value="structuring">Structuring</option>
          <option value="cycling">Cycling (24h)</option>
          <option value="roundtrip">Round-Trip Cycling</option>
          <option value="accel">Amount Acceleration</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm font-mono">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-slate-600 text-sm font-mono">No transactions found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1a2744]">
                {['Time', 'Merchant', 'Amount', 'Card', 'Status', 'Risk', 'Rules'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-mono text-slate-600 uppercase tracking-widest whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const rules = parseRules(tx.fraud_indicators)
                return (
                  <tr
                    key={tx.id ?? i}
                    className="border-b border-[#1a2744]/50 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 text-[10px] font-mono text-slate-600 whitespace-nowrap">
                      {timeAgo(tx.transaction_time)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-200 font-mono">{tx.merchant_name}</div>
                      {tx.merchant_category && (
                        <div className="text-[10px] text-slate-600">{tx.merchant_category}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-white whitespace-nowrap">
                      ${parseFloat(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      {tx.currency && tx.currency !== 'USD' && (
                        <span className="ml-1 text-[10px] text-slate-600">{tx.currency}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">
                      ···{tx.card_last_four}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono capitalize border ${STATUS_COLOR[tx.status] ?? 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <RiskScore score={tx.risk_score} />
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <RuleChips rules={rules} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border border-[#1a2744] text-xs font-mono text-slate-400 hover:text-white disabled:opacity-30 transition-all"
          >
            ← Prev
          </button>
          <span className="text-xs font-mono text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border border-[#1a2744] text-xs font-mono text-slate-400 hover:text-white disabled:opacity-30 transition-all"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}