const LEVELS = {
  low:      { label: 'LOW',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
  medium:   { label: 'MEDIUM',   cls: 'bg-amber-500/10  text-amber-400  border-amber-500/25'  },
  high:     { label: 'HIGH',     cls: 'bg-red-500/10    text-red-400    border-red-500/25'    },
  critical: { label: 'CRITICAL', cls: 'bg-red-600/20    text-red-300    border-red-400/40'    },
}

export default function RiskBadge({ level = 'low' }) {
  const { label, cls } = LEVELS[level?.toLowerCase()] ?? LEVELS.low
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono font-bold tracking-widest ${cls}`}>
      {label}
    </span>
  )
}