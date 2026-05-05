'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatINR } from '@/lib/utils/currency'
import { allocationSalaryCost } from '@/lib/utils/cost'
import { formatDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Users,
  Activity,
  AlertTriangle,
  Ban,
  type LucideIcon,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { FinanceNav } from '@/components/finance/FinanceNav'
import type { Project, Person, Allocation } from '@/lib/supabase/types'

// ── Extended join type ───────────────────────────────────────────────────────

type AllocationFull = Allocation & { people: Person | null; projects: Project | null }

// ── Pure month/date helpers ──────────────────────────────────────────────────

function getMonthBounds(year: number, month: number): [string, string] {
  const lastDay = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(lastDay)}`]
}

function calendarDaysOverlap(s1: string, e1: string, s2: string, e2: string): number {
  const start = Math.max(Date.parse(s1 + 'T00:00:00'), Date.parse(s2 + 'T00:00:00'))
  const end = Math.min(Date.parse(e1 + 'T00:00:00'), Date.parse(e2 + 'T00:00:00'))
  return Math.max(0, Math.round((end - start) / 86400000) + 1)
}

function calendarDays(start: string, end: string): number {
  return Math.max(1, Math.round((Date.parse(end + 'T00:00:00') - Date.parse(start + 'T00:00:00')) / 86400000) + 1)
}

function prevMonthOf(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1]
}

function nextMonthOf(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1]
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function shortMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'short' })
}

// ── Financial calculations ───────────────────────────────────────────────────

const REVENUE_STATUSES = new Set(['active', 'in_production', 'completed'])

function projectEffectiveEnd(p: Project): string | null {
  return p.actual_end_date || p.target_end_date || null
}

function projectRevenueInMonth(p: Project, year: number, month: number): number {
  if (!p.sales_value || !p.start_date) return 0
  if (!REVENUE_STATUSES.has(p.status)) return 0
  const effectiveEnd = projectEffectiveEnd(p)
  if (!effectiveEnd) return 0
  const [monthStart, monthEnd] = getMonthBounds(year, month)
  const totalDays = calendarDays(p.start_date, effectiveEnd)
  const overlapDays = calendarDaysOverlap(p.start_date, effectiveEnd, monthStart, monthEnd)
  return Math.round((p.sales_value * overlapDays) / totalDays)
}

function allocationCostInMonth(
  alloc: Allocation,
  monthlySalary: number | null | undefined,
  year: number,
  month: number,
): number {
  if (!monthlySalary) return 0
  const [monthStart, monthEnd] = getMonthBounds(year, month)
  const start = alloc.start_date > monthStart ? alloc.start_date : monthStart
  const end = alloc.end_date < monthEnd ? alloc.end_date : monthEnd
  if (start > end) return 0
  return allocationSalaryCost(start, end, alloc.capacity_percent, monthlySalary) ?? 0
}

function isStretched(p: Project, allAllocations: AllocationFull[]): boolean {
  if (!p.target_end_date) return false
  return allAllocations.some(a => a.project_id === p.id && a.end_date > p.target_end_date!)
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function computeMonthMetrics(
  year: number,
  month: number,
  people: Person[],
  projects: Project[],
  allocations: AllocationFull[],
) {
  const [monthStart, monthEnd] = getMonthBounds(year, month)

  const totalSalary = people.reduce((s, p) => s + (p.monthly_salary ?? 0), 0)

  const activeProjects = projects.filter(p => {
    if (!REVENUE_STATUSES.has(p.status) || !p.start_date) return false
    const end = projectEffectiveEnd(p)
    if (!end) return false
    return p.start_date <= monthEnd && end >= monthStart
  })

  // Allocations on lost projects don't count as "real" allocated work —
  // a lost project is one where the client backed out, so any time spent
  // on it should land in bench cost rather than masquerading as project
  // cost. Excluding them here keeps revenue/cost rows and bench totals
  // honest without deleting historical allocation rows.
  const monthAllocs = allocations.filter(
    a => a.start_date <= monthEnd && a.end_date >= monthStart
      && a.projects?.status !== 'lost',
  )

  // Salary lookup uses the allocation's snapshot (monthly_salary on the
  // allocation row) so changing someone's current salary never rewrites
  // historical project cost. Falls back to the live person salary only
  // for legacy rows where the snapshot was never captured.
  const allocSalary = (a: AllocationFull) => a.monthly_salary ?? a.people?.monthly_salary ?? null

  const projectRows = activeProjects.map(p => {
    const revenue = projectRevenueInMonth(p, year, month)
    const devCost = monthAllocs
      .filter(a => a.project_id === p.id)
      .reduce((sum, a) => sum + allocationCostInMonth(a, allocSalary(a), year, month), 0)
    return { project: p, revenue, devCost, margin: revenue - devCost }
  })

  const totalRevenue = projectRows.reduce((s, r) => s + r.revenue, 0)
  const totalAllocatedCost = monthAllocs.reduce(
    (sum, a) => sum + allocationCostInMonth(a, allocSalary(a), year, month), 0,
  )
  const benchCost = Math.max(0, totalSalary - totalAllocatedCost)
  const netProfit = totalRevenue - totalSalary
  const marginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  const personRows = people.map(person => {
    const personAllocs = monthAllocs.filter(a => a.person_id === person.id)
    // Each allocation uses its own salary snapshot so historical project
    // cost is preserved. The header salary column stays on live salary —
    // it represents the company's current monthly outlay.
    const allocatedCost = personAllocs.reduce(
      (sum, a) => sum + allocationCostInMonth(a, allocSalary(a), year, month), 0,
    )
    const salary = person.monthly_salary ?? 0
    const bench = Math.max(0, salary - allocatedCost)
    const utilPct = salary > 0 ? Math.min(100, Math.round((allocatedCost / salary) * 100)) : 0
    const projectNames = [...new Set(
      personAllocs.map(a => a.projects?.name).filter(Boolean) as string[],
    )]
    return { person, salary, allocatedCost, bench, utilPct, projectNames }
  })

  return { totalRevenue, totalSalary, totalAllocatedCost, benchCost, netProfit, marginPct, projectRows, personRows }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Month from URL (?month=2025-04)
  const [year, month] = useMemo<[number, number]>(() => {
    const raw = searchParams.get('month') ?? ''
    const [y, m] = raw.split('-').map(Number)
    if (y > 2000 && m >= 1 && m <= 12) return [y, m]
    const now = new Date()
    return [now.getFullYear(), now.getMonth() + 1]
  }, [searchParams])

  const setMonth = useCallback(
    (y: number, m: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('month', `${y}-${String(m).padStart(2, '0')}`)
      router.replace(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  // Data queries
  const { data: people, isLoading: loadingPeople } = useQuery({
    queryKey: ['finance_people'],
    queryFn: async () => {
      const { data, error } = await supabase.from('people').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data as Person[]
    },
    staleTime: 60_000,
  })

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ['finance_projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('start_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as Project[]
    },
    staleTime: 60_000,
  })

  const { data: allocations, isLoading: loadingAllocations } = useQuery({
    queryKey: ['finance_allocations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('allocations').select('*, people(*), projects(*)').order('start_date')
      if (error) throw error
      return data as AllocationFull[]
    },
    staleTime: 60_000,
  })

  const isLoading = loadingPeople || loadingProjects || loadingAllocations
  const hasData = !!(people && projects && allocations)

  // Current month metrics
  const metrics = useMemo(
    () => hasData ? computeMonthMetrics(year, month, people!, projects!, allocations!) : null,
    [hasData, year, month, people, projects, allocations],
  )

  // 6-month trend
  const trendMonths = useMemo<[number, number][]>(() => {
    const result: [number, number][] = []
    let [y, m]: [number, number] = [year, month]
    for (let i = 0; i < 6; i++) {
      result.unshift([y, m])
        ;[y, m] = prevMonthOf(y, m)
    }
    return result
  }, [year, month])

  const trendData = useMemo(
    () => !hasData ? [] : trendMonths.map(([y, m]) => ({
      year: y, month: m,
      ...computeMonthMetrics(y, m, people!, projects!, allocations!),
    })),
    [hasData, trendMonths, people, projects, allocations],
  )

  const trendMax = useMemo(
    () => Math.max(...trendData.map(d => Math.max(d.totalRevenue, d.totalSalary)), 1),
    [trendData],
  )

  const [prevY, prevM] = prevMonthOf(year, month)
  const [nextY, nextM] = nextMonthOf(year, month)
  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 space-y-6 min-h-screen bg-[#0d1117]">
        <FinanceNav />
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-24 bg-[#21262d]" />
            <Skeleton className="h-4 w-48 bg-[#21262d]" />
          </div>
          <Skeleton className="h-8 w-44 bg-[#21262d]" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg bg-[#161b22]" />)}
        </div>
        <Skeleton className="h-64 rounded-lg bg-[#161b22]" />
        <Skeleton className="h-48 rounded-lg bg-[#161b22]" />
      </div>
    )
  }

  const m_ = metrics!
  const stretchedProjects = m_.projectRows.filter(r => isStretched(r.project, allocations!))
  const benchEmployees = m_.personRows.filter(r => r.utilPct < 20 && r.salary > 0 && r.person.type !== 'founder')

  // ── Lost work — sales_value of projects the client backed out on. ──
  // Scoped to the selected month via lost_at so this section reads as
  // "what we lost in {Month}" alongside the rest of the page's monthly
  // P&L. Projects without lost_at are skipped (graceful degrade for any
  // legacy rows missing the timestamp).
  const [monthStartIso, monthEndIso] = getMonthBounds(year, month)
  const lostProjects = (projects ?? [])
    .filter(p => {
      if (p.status !== 'lost' || (p.sales_value ?? 0) <= 0) return false
      if (!p.lost_at) return false
      const lostDay = p.lost_at.slice(0, 10) // ISO timestamp → YYYY-MM-DD
      return lostDay >= monthStartIso && lostDay <= monthEndIso
    })
    .sort((a, b) => (b.sales_value ?? 0) - (a.sales_value ?? 0))
  const totalLostValue = lostProjects.reduce((s, p) => s + (p.sales_value ?? 0), 0)

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0d1117]">
      <FinanceNav />

      {/* ── Header + Month Nav ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Finance</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Monthly P&amp;L · revenue vs. payroll</p>
        </div>
        <div className="flex items-center gap-0.5 self-start sm:self-auto">
          <button
            onClick={() => setMonth(prevY, prevM)}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 text-sm font-medium text-[#c9d1d9] min-w-[148px] text-center select-none">
            {monthLabel(year, month)}
          </span>
          <button
            onClick={() => setMonth(nextY, nextM)}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => setMonth(now.getFullYear(), now.getMonth() + 1)}
              className="ml-2 text-xs px-2.5 py-1 rounded text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#21262d] transition-colors"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Recognized Revenue"
          value={formatINR(m_.totalRevenue)}
          sub={`${m_.projectRows.length} project${m_.projectRows.length !== 1 ? 's' : ''} active`}
          accent="green"
          icon={TrendingUp}
        />
        <KpiCard
          label="Payroll Expense"
          value={formatINR(m_.totalSalary)}
          sub={`${people?.length ?? 0} employee${(people?.length ?? 0) !== 1 ? 's' : ''}`}
          accent="default"
          icon={Users}
        />
        <KpiCard
          label="Net Profit / Loss"
          value={formatINR(m_.netProfit)}
          sub={m_.netProfit >= 0 ? 'In the black' : 'In the red'}
          accent={m_.netProfit >= 0 ? 'green' : 'red'}
          icon={m_.netProfit >= 0 ? TrendingUp : TrendingDown}
        />
        <KpiCard
          label="Operating Margin"
          value={m_.totalRevenue > 0 ? `${Math.round(m_.marginPct)}%` : '—'}
          sub={m_.benchCost > 0 ? `${formatINR(m_.benchCost)} bench cost` : 'Fully allocated'}
          accent={m_.marginPct >= 20 ? 'green' : m_.marginPct >= 0 ? 'amber' : 'red'}
          icon={Activity}
        />
      </div>

      {/* ── Insight ribbon ── */}
      {(stretchedProjects.length > 0 || benchEmployees.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {stretchedProjects.map(r => (
            <div
              key={r.project.id}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#EF9F27]/30 bg-[#EF9F27]/10 text-[#EF9F27]"
            >
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>
                <span className="font-medium">{r.project.name}</span> stretched — cost rising on fixed revenue
              </span>
            </div>
          ))}
          {benchEmployees.map(r => (
            <div
              key={r.person.id}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#30363d] bg-[#161b22] text-[#8b949e]"
            >
              <span>
                <span className="font-medium text-[#c9d1d9]">{r.person.name}</span> on bench · {formatINR(r.salary)}/mo unallocated
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Lost Work — all-time tally of projects the client backed out on ── */}
      {lostProjects.length > 0 && (
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#30363d] flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-md bg-[#e24b4a]/15 border border-[#e24b4a]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Ban className="h-4 w-4 text-[#e24b4a]" />
              </div>
              <div>
                <h2 className="text-sm font-medium text-[#e6edf3]">
                  Work Lost <span className="text-[#6e7681] font-normal">· {monthLabel(year, month)}</span>
                </h2>
                <p className="text-xs text-[#6e7681] mt-0.5">
                  Clients who backed out this month — excluded from revenue, payroll, and dev cost above
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-semibold tabular-nums text-[#e24b4a] leading-none">
                {formatINR(totalLostValue)}
              </p>
              <p className="text-[11px] text-[#6e7681] mt-1.5">
                {lostProjects.length} project{lostProjects.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Project</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden md:table-cell">Reason</th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Lost value</th>
                </tr>
              </thead>
              <tbody>
                {lostProjects.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    className={cn(
                      'border-b border-[#30363d]/60 last:border-0 hover:bg-[#21262d]/40 transition-colors cursor-pointer',
                      i % 2 === 1 && 'bg-[#0d1117]/30',
                    )}
                  >
                    <td className="px-5 py-3 max-w-[240px]">
                      <p className="font-medium text-[#c9d1d9] truncate">{p.name}</p>
                      <p className="text-xs text-[#6e7681] truncate mt-0.5">{p.client_name}</p>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell max-w-[360px]">
                      {p.lost_reason ? (
                        <p className="text-xs text-[#8b949e] line-clamp-2">{p.lost_reason}</p>
                      ) : (
                        <span className="text-xs text-[#484f58] italic">No reason recorded</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-[#e24b4a]">
                      {formatINR(p.sales_value ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#30363d] bg-[#0d1117]/40">
                  <td colSpan={2} className="px-5 py-3 text-xs font-medium text-[#6e7681]">
                    Total lost ({lostProjects.length} project{lostProjects.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-[#e24b4a] tabular-nums">
                    {formatINR(totalLostValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Projects Table ── */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d] flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-[#e6edf3]">Project Revenue &amp; Cost</h2>
            <p className="text-xs text-[#6e7681] mt-0.5">Revenue prorated by timeline overlap · dev cost from salary allocations</p>
          </div>
          <span className="text-xs text-[#6e7681] flex-shrink-0 mt-0.5">
            {m_.projectRows.length} project{m_.projectRows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {m_.projectRows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-[#8b949e]">No active projects overlap this month.</p>
            <p className="text-xs text-[#6e7681] mt-1">Projects need a start date and end date to appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Project</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden sm:table-cell">Status</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden md:table-cell">Target End</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Revenue</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Dev Cost</th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Margin</th>
                </tr>
              </thead>
              <tbody>
                {m_.projectRows
                  .slice()
                  .sort((a, b) => b.revenue - a.revenue)
                  .map(({ project: p, revenue, devCost, margin }, i) => {
                    const stretched = isStretched(p, allocations!)
                    const mPct = revenue > 0 ? Math.round((margin / revenue) * 100) : null
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          'border-b border-[#30363d]/60 last:border-0 hover:bg-[#21262d]/40 transition-colors',
                          i % 2 === 1 && 'bg-[#0d1117]/30',
                        )}
                      >
                        <td className="px-5 py-3 max-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-[#c9d1d9] truncate">{p.name}</span>
                            {stretched && (
                              <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#EF9F27]/15 text-[#EF9F27] border border-[#EF9F27]/25">
                                stretched
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[#6e7681] truncate block mt-0.5">{p.client_name}</span>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-3 py-3 text-right text-xs hidden md:table-cell">
                          <span className={stretched ? 'text-[#EF9F27]' : 'text-[#8b949e]'}>
                            {formatDate(p.target_end_date)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-[#1D9E75]">
                          {formatINR(revenue)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#8b949e]">
                          {devCost > 0 ? formatINR(devCost) : <span className="text-[#30363d]">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn('font-medium tabular-nums', margin >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]')}>
                            {formatINR(margin)}
                          </span>
                          {mPct !== null && (
                            <div className={cn('text-[10px] mt-0.5 tabular-nums', mPct >= 0 ? 'text-[#6e7681]' : 'text-[#E24B4A]')}>
                              {mPct}%
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#30363d] bg-[#0d1117]/40">
                  <td colSpan={3} className="px-5 py-3 text-xs font-medium text-[#6e7681] hidden md:table-cell">Total</td>
                  <td colSpan={2} className="px-5 py-3 text-xs font-medium text-[#6e7681] md:hidden">Total</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-[#1D9E75] tabular-nums">{formatINR(m_.totalRevenue)}</td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-[#8b949e] tabular-nums">{formatINR(m_.totalAllocatedCost)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={cn('text-sm font-bold tabular-nums', (m_.totalRevenue - m_.totalAllocatedCost) >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]')}>
                      {formatINR(m_.totalRevenue - m_.totalAllocatedCost)}
                    </span>
                    {m_.totalRevenue > 0 && (
                      <div className="text-[10px] text-[#6e7681] mt-0.5 tabular-nums">
                        {Math.round(((m_.totalRevenue - m_.totalAllocatedCost) / m_.totalRevenue) * 100)}%
                      </div>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Employee Cost Breakdown ── */}
      {(() => {
        const founderRows = m_.personRows.filter(r => r.person.type === 'founder')
        const staffRows = m_.personRows.filter(r => r.person.type !== 'founder')
        const founderSalary = founderRows.reduce((s, r) => s + r.salary, 0)
        const staffSalary = m_.totalSalary - founderSalary

        function PersonRow({ person, salary, allocatedCost, bench, utilPct, projectNames, i, isFounder }: {
          person: Person; salary: number; allocatedCost: number; bench: number; utilPct: number; projectNames: string[]; i: number; isFounder?: boolean
        }) {
          return (
            <tr
              key={person.id}
              className={cn(
                'border-b border-[#30363d]/60 last:border-0 hover:bg-[#21262d]/40 transition-colors',
                i % 2 === 1 && 'bg-[#0d1117]/30',
              )}
            >
              <td className="px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: (person.avatar_color ?? '#484f58') + '33',
                      color: person.avatar_color ?? '#8b949e',
                    }}
                  >
                    {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#c9d1d9] truncate">{person.name}</p>
                    <p className="text-xs text-[#6e7681] capitalize">{person.role}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-right font-medium tabular-nums text-[#c9d1d9]">
                {salary > 0 ? formatINR(salary) : <span className="text-[#484f58]">—</span>}
              </td>
              {isFounder ? (
                <>
                  <td className="px-3 py-3 text-right tabular-nums text-[#484f58]">—</td>
                  <td className="px-3 py-3 text-right hidden sm:table-cell text-[#484f58] text-xs">—</td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#378add]/10 text-[#378add] border border-[#378add]/20">mgmt</span>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs text-[#484f58] italic">management</span>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-3 text-right tabular-nums text-[#8b949e]">
                    {allocatedCost > 0 ? formatINR(allocatedCost) : <span className="text-[#484f58]">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right hidden sm:table-cell">
                    {bench > 0 ? (
                      <span className="text-[#EF9F27] text-xs font-medium tabular-nums">{formatINR(bench)}</span>
                    ) : (
                      <span className="text-[#484f58] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-14 h-1.5 bg-[#21262d] rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${utilPct}%`,
                            backgroundColor: utilPct >= 80 ? '#1D9E75' : utilPct >= 40 ? '#EF9F27' : '#E24B4A',
                          }}
                        />
                      </div>
                      <span className="text-xs text-[#8b949e] w-9 text-right tabular-nums">{utilPct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell max-w-[240px]">
                    {projectNames.length > 0 ? (
                      <span className="text-xs text-[#8b949e] truncate block">{projectNames.join(', ')}</span>
                    ) : (
                      <span className="text-xs text-[#484f58] italic">on bench</span>
                    )}
                  </td>
                </>
              )}
            </tr>
          )
        }

        return (
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#30363d] flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium text-[#e6edf3]">Employee Cost Breakdown</h2>
                <p className="text-xs text-[#6e7681] mt-0.5">Payroll vs. allocated project hours · bench = unallocated salary cost</p>
              </div>
              <span className="text-xs font-medium text-[#8b949e] flex-shrink-0 mt-0.5 tabular-nums">{formatINR(m_.totalSalary)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="text-left px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Employee</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Monthly Cost</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Allocated</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden sm:table-cell">Bench</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Util.</th>
                    <th className="text-left px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden lg:table-cell">Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Staff rows */}
                  {staffRows
                    .slice()
                    .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))
                    .map((row, i) => <PersonRow key={row.person.id} {...row} i={i} />)}

                  {/* Founder rows — separator + rows */}
                  {founderRows.length > 0 && (
                    <>
                      <tr className="border-b border-t border-[#30363d] bg-[#0d1117]/60">
                        <td colSpan={6} className="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#378add]">
                          Management / Founders — {formatINR(founderSalary)}/mo
                        </td>
                      </tr>
                      {founderRows
                        .slice()
                        .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))
                        .map((row, i) => <PersonRow key={row.person.id} {...row} i={i} isFounder />)}
                    </>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#30363d] bg-[#0d1117]/40">
                    <td className="px-5 py-3 text-xs font-medium text-[#6e7681]">Total</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-[#c9d1d9] tabular-nums">{formatINR(m_.totalSalary)}</td>
                    <td className="px-3 py-3 text-right text-sm font-medium text-[#8b949e] tabular-nums">{formatINR(m_.totalAllocatedCost)}</td>
                    <td className="px-3 py-3 text-right hidden sm:table-cell">
                      {m_.benchCost > 0 ? (
                        <span className="text-sm font-medium text-[#EF9F27] tabular-nums">{formatINR(m_.benchCost)}</span>
                      ) : (
                        <span className="text-[#484f58]">—</span>
                      )}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── 6-Month Trend ── */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-sm font-medium text-[#e6edf3]">6-Month Trend</h2>
            <p className="text-xs text-[#6e7681] mt-0.5">Click a month to navigate · revenue vs. payroll</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#6e7681]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm inline-block bg-[#1D9E75]" /> Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm inline-block bg-[#E24B4A]" /> Payroll
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2">
          {trendData.map(d => {
            const revH = trendMax > 0 ? Math.max(0, Math.round((d.totalRevenue / trendMax) * 88)) : 0
            const expH = trendMax > 0 ? Math.max(0, Math.round((d.totalSalary / trendMax) * 88)) : 0
            const isSel = d.year === year && d.month === month

            return (
              <div
                key={`${d.year}-${d.month}`}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 cursor-pointer group rounded-md px-1 py-1.5 transition-colors',
                  isSel ? 'bg-[#21262d]' : 'hover:bg-[#21262d]/60',
                )}
                onClick={() => setMonth(d.year, d.month)}
              >
                {/* Net P/L label */}
                <span className={cn(
                  'text-[9px] font-medium tabular-nums h-3 leading-3',
                  d.netProfit > 0 ? 'text-[#1D9E75]' : d.netProfit < 0 ? 'text-[#E24B4A]' : 'text-[#484f58]',
                )}>
                  {d.netProfit !== 0 ? (d.netProfit > 0 ? '+' : '') + formatINR(d.netProfit) : ''}
                </span>

                {/* Bar group */}
                <div className="flex items-end gap-0.5 w-full" style={{ height: 88 }}>
                  <div
                    className="flex-1 rounded-t-[2px] transition-all duration-300"
                    style={{
                      height: d.totalRevenue > 0 ? revH : 2,
                      backgroundColor: '#1D9E75',
                      opacity: isSel ? 1 : 0.65,
                    }}
                  />
                  <div
                    className="flex-1 rounded-t-[2px] transition-all duration-300"
                    style={{
                      height: d.totalSalary > 0 ? expH : 2,
                      backgroundColor: '#E24B4A',
                      opacity: isSel ? 1 : 0.65,
                    }}
                  />
                </div>

                {/* Month label */}
                <span className={cn(
                  'text-[10px] transition-colors select-none',
                  isSel
                    ? 'text-[#e6edf3] font-semibold'
                    : 'text-[#6e7681] group-hover:text-[#8b949e]',
                )}>
                  {shortMonthLabel(d.year, d.month)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Averages */}
        <div className="mt-5 pt-4 border-t border-[#30363d] grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[11px] text-[#6e7681]">Avg Revenue</p>
            <p className="text-sm font-semibold text-[#1D9E75] mt-0.5 tabular-nums">
              {formatINR(trendData.reduce((s, d) => s + d.totalRevenue, 0) / Math.max(trendData.length, 1))}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#6e7681]">Avg Payroll</p>
            <p className="text-sm font-semibold text-[#E24B4A] mt-0.5 tabular-nums">
              {formatINR(trendData.reduce((s, d) => s + d.totalSalary, 0) / Math.max(trendData.length, 1))}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#6e7681]">Avg Net P/L</p>
            {(() => {
              const avg = trendData.reduce((s, d) => s + d.netProfit, 0) / Math.max(trendData.length, 1)
              return (
                <p className={cn('text-sm font-semibold mt-0.5 tabular-nums', avg >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]')}>
                  {(avg > 0 ? '+' : '') + formatINR(avg)}
                </p>
              )
            })()}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  accent?: 'default' | 'green' | 'amber' | 'red'
  icon?: LucideIcon
}

function KpiCard({ label, value, sub, accent = 'default', icon: Icon }: KpiCardProps) {
  const colorMap = {
    default: 'text-[#e6edf3]',
    green: 'text-[#1D9E75]',
    amber: 'text-[#EF9F27]',
    red: 'text-[#E24B4A]',
  }
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-[#8b949e] leading-snug">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 text-[#484f58] flex-shrink-0 mt-0.5" />}
      </div>
      <p className={cn('text-2xl font-semibold tracking-tight leading-none tabular-nums', colorMap[accent])}>
        {value}
      </p>
      {sub && <p className="text-xs text-[#6e7681] mt-1.5">{sub}</p>}
    </div>
  )
}

const STATUS_MAP: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-[#1D9E75]/15', text: 'text-[#1D9E75]', label: 'Active' },
  completed: { bg: 'bg-[#484f58]/40', text: 'text-[#8b949e]', label: 'Completed' },
  pipeline: { bg: 'bg-[#484f58]/20', text: 'text-[#6e7681]', label: 'Pipeline' },
  on_hold: { bg: 'bg-[#D4537E]/15', text: 'text-[#D4537E]', label: 'On Hold' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { bg: 'bg-[#484f58]/20', text: 'text-[#6e7681]', label: status }
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap', s.bg, s.text)}>
      {s.label}
    </span>
  )
}
