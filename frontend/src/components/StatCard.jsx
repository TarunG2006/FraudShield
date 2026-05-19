const ACCENTS = {
  blue:    'border-blue-500/20    from-blue-500/8',
  red:     'border-red-500/20     from-red-500/8',
  amber:   'border-amber-500/20   from-amber-500/8',
  emerald: 'border-emerald-500/20 from-emerald-500/8',
}

export default function StatCard({ title, value, sub, icon, accent = 'blue' }) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${ACCENTS[accent] ?? ACCENTS.blue} to-transparent bg-[#0c1426] p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white tabular-nums">{value ?? '—'}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && <span className="text-2xl opacity-40 leading-none">{icon}</span>}
      </div>
    </div>
  )
}