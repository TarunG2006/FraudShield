import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import TransactionTable from '../components/TransactionTable'

// Backend filter param for risk is minRisk/maxRisk, not riskLevel
// We map frontend risk level selection to score ranges
const RISK_RANGE = {
  all:      { minRisk: undefined, maxRisk: undefined },
  low:      { minRisk: 0,  maxRisk: 24  },
  medium:   { minRisk: 25, maxRisk: 49  },
  high:     { minRisk: 50, maxRisk: 74  },
  critical: { minRisk: 75, maxRisk: 100 },
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [riskFilter,   setRiskFilter]   = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
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
          limit:    20,
          search:   search   || undefined,
          status:   statusFilter !== 'all' ? statusFilter : undefined,
          minRisk:  range.minRisk,
          maxRisk:  range.maxRisk,
          sortBy:   'transaction_time',
          sortDir:  'DESC',
        },
      })

      const d = data.data ?? data
      const rows = d.transactions ?? (Array.isArray(d) ? d : [])
      const pagination = d.pagination ?? {}

      setTransactions(rows)
      setTotalPages(pagination.totalPages ?? 1)
      setTotalCount(pagination.total ?? rows.length)
    } catch (e) {
      console.error('Transactions load error', e)
    } finally {
      setLoading(false)
    }
  }, [page, search, riskFilter, statusFilter])

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
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#1a2744] bg-[#0c1426] overflow-hidden">
        <TransactionTable transactions={transactions} loading={loading} />
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
