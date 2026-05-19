import { useState } from 'react'
import RiskBadge from './RiskBadge'
import api from '../api/axios'
import toast from 'react-hot-toast'

const HEADERS = ['ID', 'Amount', 'Merchant', 'Location', 'Category', 'Risk Score', 'Status', 'Date', 'Action']

const STATUS_STYLE = {
  approved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
  flagged:  'bg-amber-500/10   text-amber-400   border border-amber-500/25',
  blocked:  'bg-red-500/10     text-red-400     border border-red-500/25',
  safe:     'bg-blue-500/10    text-blue-400    border border-blue-500/25',
  pending:  'bg-slate-500/10   text-slate-400   border border-slate-500/25',
}

function StatusBadge({ status = 'pending' }) {
  const s = status.toLowerCase()
  const cls = STATUS_STYLE[s] ?? STATUS_STYLE.pending
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest ${cls}`}>
      {s.toUpperCase()}
    </span>
  )
}

function scoreToLevel(score) {
  const s = Number(score || 0)
  if (s >= 75) return 'critical'
  if (s >= 50) return 'high'
  if (s >= 25) return 'medium'
  return 'low'
}

// ── Detail Modal ───────────────────────────────────────────────────────────
function TransactionModal({ tx, onClose, onMarkedSafe }) {
  const [marking, setMarking] = useState(false)
  const riskScore = Number(tx.risk_score ?? tx.riskScore ?? 0)
  const riskLevel = tx.risk_level ?? tx.riskLevel ?? scoreToLevel(riskScore)
  const status    = tx.status ?? 'unknown'

  const handleMarkSafe = async () => {
    setMarking(true)
    try {
      await api.patch(`/transactions/${tx.id}/mark-safe`)
      toast.success('Transaction marked as safe')
      onMarkedSafe(tx.id)
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to mark as safe')
    } finally {
      setMarking(false)
    }
  }

  const canMarkSafe = ['flagged', 'blocked', 'pending'].includes(status)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px',
    }}>
      <div style={{
        background: '#0c1426', border: '1px solid #1a2744',
        borderRadius: '12px', width: '100%', maxWidth: '520px',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px', borderBottom: '1px solid #1a2744',
        }}>
          <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '15px', fontWeight: 600, fontFamily: 'monospace' }}>
            Transaction Detail
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '20px', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            ['Transaction ID', tx.transaction_id ?? tx.id],
            ['Amount',   `${tx.currency ?? 'USD'} ${Number(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
            ['Merchant',  tx.merchant_name ?? tx.merchantName ?? '—'],
            ['Category',  tx.merchant_category ?? tx.merchantCategory ?? '—'],
            ['Location',  [tx.location_city, tx.location_country].filter(Boolean).join(', ') || '—'],
            ['Date',      tx.transaction_time ? new Date(tx.transaction_time).toLocaleString() : '—'],
            ['Status',    status],
            ['Risk Score', riskScore],
            ['ML Score',  tx.ml_score ?? '—'],
            ['Rule Score', tx.rule_score ?? '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontSize: '12px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
              <span style={{ color: '#f1f5f9', fontSize: '13px', fontFamily: 'monospace', fontWeight: 500 }}>{String(value)}</span>
            </div>
          ))}

          {/* Indicators */}
          {tx.fraud_indicators && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#64748b', fontSize: '12px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Indicators</span>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {String(tx.fraud_indicators).split(' ').filter(Boolean).map(ind => (
                  <span key={ind} style={{
                    background: 'rgba(239,68,68,0.1)', color: '#f87171',
                    border: '1px solid rgba(239,68,68,0.25)', borderRadius: '4px',
                    padding: '1px 6px', fontSize: '10px', fontFamily: 'monospace',
                  }}>{ind}</span>
                ))}
              </div>
            </div>
          )}

          {/* Risk level */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '12px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Level</span>
            <RiskBadge level={riskLevel} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #1a2744',
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
        }}>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
            border: '1px solid #1a2744', borderRadius: '8px',
            padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontFamily: 'monospace',
          }}>Close</button>
          {canMarkSafe && (
            <button
              onClick={handleMarkSafe}
              disabled={marking}
              style={{
                background: '#10b981', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '8px 16px', fontSize: '13px',
                fontWeight: 600, cursor: marking ? 'not-allowed' : 'pointer',
                opacity: marking ? 0.7 : 1, fontFamily: 'monospace',
              }}
            >
              {marking ? 'Marking...' : '✓ Mark as Safe'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Table ─────────────────────────────────────────────────────────────
export default function TransactionTable({ transactions = [], loading = false, onRefresh }) {
  const [selected,   setSelected]   = useState(null)
  const [localTxns,  setLocalTxns]  = useState(null)

  const rows = localTxns ?? transactions

  const handleMarkedSafe = (id) => {
    setLocalTxns((localTxns ?? transactions).map(tx =>
      tx.id === id ? { ...tx, status: 'safe' } : tx
    ))
    if (onRefresh) onRefresh()
  }

  if (loading) return (
    <div className="py-16 text-center text-slate-500 text-sm font-mono">Loading transactions...</div>
  )
  if (!rows.length) return (
    <div className="py-16 text-center text-slate-500 text-sm font-mono">No transactions found</div>
  )

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a2744]">
              {HEADERS.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono tracking-widest text-slate-500 uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a2744]">
            {rows.map((tx) => {
              const riskScore = Number(tx.risk_score ?? tx.riskScore ?? 0)
              const status    = (tx.status ?? 'unknown').toLowerCase()
              const canMark   = ['flagged', 'blocked', 'pending'].includes(status)

              return (
                <tr
                  key={tx.id}
                  onClick={() => setSelected(tx)}
                  className="hover:bg-white/[0.025] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {String(tx.transaction_id ?? tx.id ?? '').slice(0, 10)}…
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-white whitespace-nowrap">
                    ${Number(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                    {tx.merchant_name ?? tx.merchantName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {[tx.location_city, tx.location_country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs capitalize">
                    {tx.merchant_category ?? tx.merchantCategory ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 rounded-full bg-[#1a2744]">
                        <div
                          className={`h-full rounded-full ${
                            riskScore >= 75 ? 'bg-red-500' :
                            riskScore >= 50 ? 'bg-orange-500' :
                            riskScore >= 25 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(riskScore, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-400 w-6 text-right">{riskScore}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600 whitespace-nowrap">
                    {tx.transaction_time ?? tx.created_at
                      ? new Date(tx.transaction_time ?? tx.created_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {canMark && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelected(tx) }}
                        style={{
                          background: 'rgba(16,185,129,0.15)', color: '#34d399',
                          border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px',
                          padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'monospace', whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ Safe
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <TransactionModal
          tx={selected}
          onClose={() => setSelected(null)}
          onMarkedSafe={handleMarkedSafe}
        />
      )}
    </>
  )
}