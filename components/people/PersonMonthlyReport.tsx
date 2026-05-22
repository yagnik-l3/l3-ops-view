'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getPersonTimeSummary, getAllProjectsLite } from '@/lib/queries/time'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { plannedAllocationCost, workingDaysInMonth, formatCost } from '@/lib/utils/cost'
import type { Person, TimeEntry, Project, Allocation } from '@/lib/supabase/types'

const HOURS_PER_DAY = 8

type ProjectLite = { id: string; name: string; color: string | null }
type EntryFull = TimeEntry & { projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'> | null }

interface Props {
  personId: string
  person: Person
  /** Cost / salary figures only render for founders. */
  isFounder: boolean
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Per-person monthly report — hours, utilization, and cost split.
 *  Scoped to a fixed person so it can live on the profile page. */
export function PersonMonthlyReport({ personId, person, isFounder }: Props) {
  const supabase = createClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const monthDate = new Date(year, month - 1, 1)
  const monthStart = isoDate(startOfMonth(monthDate))
  const monthEnd = isoDate(endOfMonth(monthDate))

  const { data: projects } = useQuery({
    queryKey: ['feed_projects_lite'],
    queryFn: getAllProjectsLite,
    staleTime: 5 * 60_000,
  })
  const projectMap = useMemo(() => {
    const m = new Map<string, ProjectLite>()
    for (const p of projects ?? []) m.set(p.id, p)
    return m
  }, [projects])

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['report_entries', personId, monthStart, monthEnd],
    queryFn: () => getPersonTimeSummary(personId, monthStart, monthEnd),
  })

  const { data: allocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['report_allocations', personId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('id, person_id, project_id, start_date, end_date, capacity_percent, hourly_rate, monthly_salary')
        .eq('person_id', personId)
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart)
      if (error) throw error
      return (data ?? []) as Allocation[]
    },
  })

  const monthWorkingDays = workingDaysInMonth(year, month)
  const payableHours = monthWorkingDays * HOURS_PER_DAY
  const salary = person.monthly_salary ?? 0

  // ── Aggregate by project ─────────────────────────────────────────────────
  type ProjectRow = {
    id: string
    name: string
    color: string | null
    actualHours: number
    actualCost: number
    plannedHours: number
    plannedCost: number
  }

  const { projectRows, totalActualHours, totalActualCost, totalPlannedHours, daysLogged } = useMemo(() => {
    const byProject = new Map<string, ProjectRow>()
    const datesLogged = new Set<string>()

    for (const e of (entries ?? []) as EntryFull[]) {
      const projId = e.project_id
      const proj = projectMap.get(projId)
      const row = byProject.get(projId) ?? {
        id: projId,
        name: e.projects?.name ?? proj?.name ?? 'Unknown',
        color: e.projects?.color ?? proj?.color ?? null,
        actualHours: 0,
        actualCost: 0,
        plannedHours: 0,
        plannedCost: 0,
      }
      const hours = Number(e.hours)
      row.actualHours += hours
      if (salary > 0 && monthWorkingDays > 0) {
        const capped = Math.min(hours, HOURS_PER_DAY)
        row.actualCost += (capped / HOURS_PER_DAY / monthWorkingDays) * salary
      }
      byProject.set(projId, row)
      datesLogged.add(e.date)
    }

    for (const a of allocations ?? []) {
      const projId = a.project_id
      const proj = projectMap.get(projId)
      const row = byProject.get(projId) ?? {
        id: projId,
        name: proj?.name ?? 'Unknown',
        color: proj?.color ?? null,
        actualHours: 0,
        actualCost: 0,
        plannedHours: 0,
        plannedCost: 0,
      }
      const allocSalary = a.monthly_salary ?? salary
      const cost = plannedAllocationCost(a, allocSalary, monthStart, monthEnd)
      const hours = allocSalary > 0
        ? Math.round((cost / allocSalary) * payableHours)
        : 0
      row.plannedCost += cost
      row.plannedHours += hours
      byProject.set(projId, row)
    }

    const rows = Array.from(byProject.values()).sort((a, b) => {
      const aHas = a.actualHours > 0 || a.plannedHours > 0
      const bHas = b.actualHours > 0 || b.plannedHours > 0
      if (aHas !== bHas) return aHas ? -1 : 1
      return b.actualHours - a.actualHours
    })

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalActualHours += r.actualHours
        acc.totalActualCost += r.actualCost
        acc.totalPlannedHours += r.plannedHours
        return acc
      },
      { totalActualHours: 0, totalActualCost: 0, totalPlannedHours: 0 },
    )

    return {
      projectRows: rows,
      daysLogged: datesLogged.size,
      ...totals,
    }
  }, [entries, allocations, projectMap, salary, monthWorkingDays, monthStart, monthEnd, payableHours])

  const utilPct = payableHours > 0 ? Math.round((totalActualHours / payableHours) * 100) : 0
  const zeroDays = Math.max(0, monthWorkingDays - daysLogged)
  const benchCost = Math.max(0, salary - Math.round(totalActualCost))

  function shiftMonth(delta: number) {
    const next = addMonths(monthDate, delta)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
  }
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth() + 1)
  }

  function exportCsv() {
    const headers = ['Date', 'Project', 'Hours']
    const lines = [headers.map(escapeCsv).join(',')]
    for (const e of ((entries ?? []) as EntryFull[]).slice().sort((a, b) => a.date.localeCompare(b.date))) {
      const row = [
        e.date,
        e.projects?.name ?? '',
        Number(e.hours).toFixed(2),
      ]
      lines.push(row.map(escapeCsv).join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${person.name.replace(/\s+/g, '-').toLowerCase()}-${year}-${String(month).padStart(2, '0')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const isLoading = loadingEntries || loadingAllocs
  const colCount = isFounder ? 5 : 4

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-end">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 text-sm font-medium text-[#c9d1d9] min-w-[148px] text-center select-none">
            {monthLabel(year, month)}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={goToday}
              className="ml-2 text-xs px-2.5 py-1 rounded text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#21262d] transition-colors"
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={exportCsv}
          disabled={(entries ?? []).length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* ── Section 1: Hours & utilization ── */}
      <SectionCard title="Hours & utilization" subtitle={`${monthWorkingDays} working day${monthWorkingDays !== 1 ? 's' : ''} this month — Mon–Fri + 1st/3rd/5th Saturday`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-5">
          <Stat label="Hours logged" value={`${totalActualHours.toFixed(1)}h`} sub={`of ${payableHours}h capacity`} />
          <Stat label="Utilization" value={`${utilPct}%`} valueColor={utilPct >= 80 ? '#1D9E75' : utilPct >= 50 ? '#58a6ff' : utilPct >= 20 ? '#EF9F27' : '#E24B4A'} />
          <Stat label="Days logged" value={`${daysLogged}`} sub={zeroDays > 0 ? `${zeroDays} working day${zeroDays !== 1 ? 's' : ''} missed` : 'all working days covered'} subColor={zeroDays > 0 ? '#EF9F27' : '#1D9E75'} />
        </div>
      </SectionCard>

      {/* ── Section 2: Per-project breakdown ── */}
      <SectionCard
        title="Project breakdown"
        subtitle={isFounder
          ? 'Planned = allocated this month · Actual = logged hours · Cost share = monthly salary × actual hours / capacity'
          : 'Planned = allocated this month · Actual = logged hours'}
      >
        {isLoading ? (
          <div className="h-48 bg-[#0d1117]/40 animate-pulse" />
        ) : projectRows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-[#8b949e]">No projects this month.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wide text-[#6e7681]">Project</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wide text-[#6e7681]">Planned hrs</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wide text-[#6e7681]">Actual hrs</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wide text-[#6e7681]">Gap</th>
                  {isFounder && (
                    <th className="text-right px-5 py-2.5 text-[10px] uppercase tracking-wide text-[#6e7681]">Cost share</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {projectRows.map((r, i) => {
                  const gap = r.actualHours - r.plannedHours
                  const showPlanned = r.plannedHours > 0
                  return (
                    <tr key={r.id} className={i % 2 === 1 ? 'bg-[#0d1117]/30' : ''}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color ?? '#58a6ff' }} />
                          <span className="text-[#c9d1d9] truncate">{r.name}</span>
                          {!showPlanned && r.actualHours > 0 && (
                            <span className="text-[10px] text-[#EF9F27] border border-[#EF9F27]/30 bg-[#EF9F27]/10 rounded-full px-1.5 py-0.5">ad-hoc</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {showPlanned ? <span className="text-[#8b949e]">{r.plannedHours.toFixed(0)}h</span> : <span className="text-[#484f58]">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.actualHours > 0 ? <span className="text-[#e6edf3] font-medium">{r.actualHours.toFixed(1)}h</span> : <span className="text-[#484f58]">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {showPlanned ? (
                          <span className={gap >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                            {gap > 0 ? '+' : ''}{gap.toFixed(1)}h
                          </span>
                        ) : (
                          <span className="text-[#484f58]">—</span>
                        )}
                      </td>
                      {isFounder && (
                        <td className="px-5 py-3 text-right tabular-nums">
                          {r.actualCost > 0 ? (
                            <span className="text-[#c9d1d9]">{formatCost(Math.round(r.actualCost))}</span>
                          ) : (
                            <span className="text-[#484f58]">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#30363d] bg-[#0d1117]/40">
                  <td className="px-5 py-3 text-xs font-medium text-[#6e7681]">Total</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-[#8b949e] tabular-nums">{totalPlannedHours.toFixed(0)}h</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-[#e6edf3] tabular-nums">{totalActualHours.toFixed(1)}h</td>
                  <td className="px-3 py-3" />
                  {isFounder && (
                    <td className="px-5 py-3 text-right text-sm font-semibold text-[#c9d1d9] tabular-nums">{formatCost(Math.round(totalActualCost))}</td>
                  )}
                </tr>
                {isFounder && salary > 0 && (
                  <tr className="border-t border-[#30363d]/60">
                    <td className="px-5 py-3 text-[11px] text-[#6e7681]">Salary · bench</td>
                    <td colSpan={colCount - 2} />
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className="text-xs text-[#8b949e]">{formatCost(salary)}</span>
                      {benchCost > 0 && <span className="text-xs text-[#EF9F27] ml-2">· bench {formatCost(benchCost)}</span>}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#30363d] flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-[#e6edf3]">{title}</h2>
          {subtitle && <p className="text-xs text-[#6e7681] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, sub, subColor, valueColor }: { label: string; value: string; sub?: string; subColor?: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: valueColor ?? '#e6edf3' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: subColor ?? '#6e7681' }}>{sub}</p>}
    </div>
  )
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
