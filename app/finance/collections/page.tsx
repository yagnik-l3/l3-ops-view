'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatINR, formatINRFull } from '@/lib/utils/currency'
import { buildCollectionSummaries } from '@/lib/queries/ledger'
import { FinanceNav } from '@/components/finance/FinanceNav'
import { AddTransactionDialog } from '@/components/finance/AddTransactionDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Receipt, Search } from 'lucide-react'
import type { Project, Transaction } from '@/lib/supabase/types'

type StatusFilter = 'all' | 'outstanding' | 'paid'

export default function CollectionsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('outstanding')
  const [addTxFor, setAddTxFor] = useState<string | null>(null) // project id

  const { data: projects, isLoading: lp } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('start_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return data as Project[]
    },
  })

  const { data: transactions, isLoading: lt } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('*')
        .eq('type', 'collection')
        .order('date', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    },
  })

  const summaries = useMemo(() => {
    if (!projects || !transactions) return []
    return buildCollectionSummaries(projects, transactions)
  }, [projects, transactions])

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, s) => ({
        salesValue: acc.salesValue + s.salesValue,
        collected:  acc.collected + s.collected,
        outstanding: acc.outstanding + s.outstanding,
      }),
      { salesValue: 0, collected: 0, outstanding: 0 },
    )
  }, [summaries])

  const filtered = useMemo(() => {
    return summaries
      .filter(s => {
        if (statusFilter === 'outstanding' && s.outstanding === 0) return false
        if (statusFilter === 'paid' && s.outstanding > 0) return false
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          const hay = `${s.project.name} ${s.project.client_name}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => b.outstanding - a.outstanding)
  }, [summaries, search, statusFilter])

  const isLoading = lp || lt

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0d1117]">
      <FinanceNav />

      {/* ── Header ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Collections</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            Outstanding amounts per project · sales value − collected
          </p>
        </div>
      </div>

      {/* ── Totals ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card label="Total billed" value={totals.salesValue} icon={Receipt} accent="default" />
        <Card label="Collected" value={totals.collected} accent="green" />
        <Card label="Outstanding" value={totals.outstanding} accent={totals.outstanding > 0 ? 'amber' : 'green'} />
      </div>

      {/* ── Filter bar ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2.5">
        <div className="flex gap-1">
          {([
            { v: 'outstanding' as const, label: 'Outstanding' },
            { v: 'paid' as const,        label: 'Paid' },
            { v: 'all' as const,         label: 'All' },
          ]).map(opt => (
            <button
              key={opt.v}
              onClick={() => setStatusFilter(opt.v)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md transition-colors',
                statusFilter === opt.v
                  ? 'bg-[#21262d] text-[#e6edf3]'
                  : 'text-[#8b949e] hover:text-[#e6edf3]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-[#30363d] mx-1" />
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 text-[#6e7681] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="w-full text-xs bg-[#0d1117] border border-[#30363d] rounded-md pl-8 pr-2 py-1.5 text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
            placeholder="Search project or client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Table ───────────────────────────────────── */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#e6edf3]">Projects</h2>
          <span className="text-xs text-[#6e7681]">
            {filtered.length} of {summaries.length}
          </span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 bg-[#21262d]" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[#8b949e]">
              {summaries.length === 0
                ? 'No projects with sales value yet.'
                : statusFilter === 'outstanding'
                ? '🎉 All projects are fully collected.'
                : 'No projects match the current filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Project</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Sales value</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Collected</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Outstanding</th>
                  <th className="text-left  px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden md:table-cell">Last payment</th>
                  <th className="text-left  px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden lg:table-cell">Progress</th>
                  <th className="w-32 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const pct = s.salesValue > 0 ? Math.round((s.collected / s.salesValue) * 100) : 0
                  const outstandingColor = s.outstanding === 0 ? '#1d9e75' : '#ef9f27'
                  const lastDate = s.lastCollectionDate
                  const aging = lastDate ? differenceInDays(new Date(), parseISO(lastDate)) : null

                  return (
                    <tr
                      key={s.project.id}
                      className={cn(
                        'border-b border-[#30363d]/60 last:border-0 hover:bg-[#21262d]/40 transition-colors group',
                        i % 2 === 1 && 'bg-[#0d1117]/30',
                      )}
                    >
                      <td
                        className="px-5 py-3 max-w-[220px] cursor-pointer"
                        onClick={() => router.push(`/projects/${s.project.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          {s.project.color && (
                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.project.color }} />
                          )}
                          <p className="font-medium text-[#c9d1d9] truncate group-hover:text-[#e6edf3]">{s.project.name}</p>
                        </div>
                        <p className="text-xs text-[#6e7681] truncate mt-0.5">{s.project.client_name}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-[#c9d1d9]">
                        {formatINRFull(s.salesValue)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-[#1d9e75]">
                        {s.collected > 0 ? formatINRFull(s.collected) : <span className="text-[#484f58]">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-medium tabular-nums" style={{ color: outstandingColor }}>
                        {formatINRFull(s.outstanding)}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell text-xs text-[#8b949e] whitespace-nowrap">
                        {lastDate ? (
                          <>
                            <span>{format(parseISO(lastDate), 'dd MMM yy')}</span>
                            {aging !== null && aging > 0 && (
                              <span className="ml-1.5 text-[10px] text-[#6e7681]">({aging}d ago)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[#484f58] italic">No payments yet</span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-[#21262d] rounded-full overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                backgroundColor: pct >= 100 ? '#1d9e75' : pct >= 50 ? '#ef9f27' : '#e24b4a',
                              }}
                            />
                          </div>
                          <span className="text-xs text-[#8b949e] tabular-nums w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {s.outstanding > 0 && (
                          <button
                            onClick={() => setAddTxFor(s.project.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#1d9e75]/10 border border-[#1d9e75]/30 text-[#1d9e75] hover:bg-[#1d9e75]/20 text-xs transition-colors opacity-80 group-hover:opacity-100"
                          >
                            <Plus className="h-3 w-3" />
                            Record
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#30363d] bg-[#0d1117]/40">
                  <td className="px-5 py-3 text-xs font-medium text-[#6e7681]">Total ({filtered.length})</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-[#c9d1d9] tabular-nums">
                    {formatINRFull(filtered.reduce((s, x) => s + x.salesValue, 0))}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-[#1d9e75] tabular-nums">
                    {formatINRFull(filtered.reduce((s, x) => s + x.collected, 0))}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-[#ef9f27] tabular-nums">
                    {formatINRFull(filtered.reduce((s, x) => s + x.outstanding, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <AddTransactionDialog
        open={!!addTxFor}
        onClose={() => setAddTxFor(null)}
        preselectedProjectId={addTxFor ?? undefined}
        defaultMode="collection"
      />
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────

function Card({
  label, value, accent = 'default', icon: Icon,
}: {
  label: string
  value: number
  accent?: 'default' | 'green' | 'amber'
  icon?: typeof Receipt
}) {
  const colorMap = {
    default: 'text-[#e6edf3]',
    green:   'text-[#1d9e75]',
    amber:   'text-[#ef9f27]',
  }
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-[#8b949e] leading-snug">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 text-[#484f58] flex-shrink-0 mt-0.5" />}
      </div>
      <p className={cn('text-2xl font-semibold tracking-tight leading-none tabular-nums', colorMap[accent])}>
        {formatINR(value)}
      </p>
    </div>
  )
}
