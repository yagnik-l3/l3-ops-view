'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getPersonTimeSummary } from '@/lib/queries/time'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Download, FileText, Pencil, MessageSquare } from 'lucide-react'
import { plannedAllocationCost, workingDaysInMonth, formatCost } from '@/lib/utils/cost'
import type { Person, TimeEntry, Project, Allocation } from '@/lib/supabase/types'

const HOURS_PER_DAY = 8

type PersonLite = Pick<Person, 'id' | 'name' | 'role' | 'type' | 'avatar_initials' | 'avatar_color' | 'is_active' | 'monthly_salary'>
type ProjectLite = { id: string; name: string; color: string | null }
type EntryFull = TimeEntry & { projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'> | null }

interface ReportClientProps {
  people: PersonLite[]
  projectMap: Map<string, ProjectLite>
  loadingPeople: boolean
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function ReportClient({ people, projectMap, loadingPeople }: ReportClientProps) {
  const supabase = createClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

  const effectivePersonId = selectedPersonId ?? people[0]?.id ?? null
  const selectedPerson = useMemo(
    () => people.find(p => p.id === effectivePersonId) ?? null,
    [people, effectivePersonId],
  )

  const monthDate = new Date(year, month - 1, 1)
  const monthStart = isoDate(startOfMonth(monthDate))
  const monthEnd = isoDate(endOfMonth(monthDate))

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['report_entries', effectivePersonId, monthStart, monthEnd],
    queryFn: () => effectivePersonId
      ? getPersonTimeSummary(effectivePersonId, monthStart, monthEnd)
      : Promise.resolve([] as EntryFull[]),
    enabled: !!effectivePersonId,
  })

  const { data: allocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['report_allocations', effectivePersonId, monthStart, monthEnd],
    queryFn: async () => {
      if (!effectivePersonId) return [] as Allocation[]
      const { data, error } = await supabase
        .from('allocations')
        .select('id, person_id, project_id, start_date, end_date, capacity_percent, hourly_rate, monthly_salary')
        .eq('person_id', effectivePersonId)
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart)
      if (error) throw error
      return (data ?? []) as Allocation[]
    },
    enabled: !!effectivePersonId,
  })

  const monthWorkingDays = workingDaysInMonth(year, month)
  const payableHours = monthWorkingDays * HOURS_PER_DAY
  const salary = selectedPerson?.monthly_salary ?? 0

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

  const { projectRows, totalActualHours, totalActualCost, totalPlannedHours, daysLogged, daysWithLog } = useMemo(() => {
    const byProject = new Map<string, ProjectRow>()
    const datesLogged = new Set<string>()
    let logCount = 0

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
      if (e.work_log && e.work_log.trim() !== '') logCount++
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
      daysWithLog: logCount,
      ...totals,
    }
  }, [entries, allocations, projectMap, salary, monthWorkingDays, monthStart, monthEnd, payableHours])

  const utilPct = payableHours > 0 ? Math.round((totalActualHours / payableHours) * 100) : 0
  const zeroDays = Math.max(0, monthWorkingDays - daysLogged)
  const benchCost = Math.max(0, salary - Math.round(totalActualCost))

  // Work log highlights (chronological with non-empty work_log)
  const workLog = useMemo(() => {
    return ((entries ?? []) as EntryFull[])
      .filter(e => e.work_log && e.work_log.trim() !== '')
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [entries])

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
    if (!selectedPerson) return
    const headers = ['Date', 'Project', 'Hours', 'Work log']
    const lines = [headers.map(escapeCsv).join(',')]
    for (const e of ((entries ?? []) as EntryFull[]).slice().sort((a, b) => a.date.localeCompare(b.date))) {
      const row = [
        e.date,
        e.projects?.name ?? '',
        Number(e.hours).toFixed(2),
        e.work_log ?? '',
      ]
      lines.push(row.map(escapeCsv).join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${selectedPerson.name.replace(/\s+/g, '-').toLowerCase()}-${year}-${String(month).padStart(2, '0')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const isLoading = loadingEntries || loadingAllocs

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[#6e7681] uppercase tracking-wide">Employee</label>
          <select
            value={effectivePersonId ?? ''}
            onChange={e => setSelectedPersonId(e.target.value)}
            disabled={loadingPeople || people.length === 0}
            className="text-sm border border-[#30363d] rounded-md px-2.5 py-1.5 bg-[#0d1117] text-[#e6edf3] min-w-[200px] focus:outline-none focus:border-[#58a6ff]"
          >
            {people.length === 0 && <option value="">No team members</option>}
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
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
            disabled={!selectedPerson || (entries ?? []).length === 0}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {!selectedPerson ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
          <FileText className="h-6 w-6 text-[#6e7681] mx-auto mb-2" />
          <p className="text-sm text-[#8b949e]">No team members to report on.</p>
        </div>
      ) : (
        <>
          {/* ── Section 1: Hours & utilization ── */}
          <SectionCard title="Hours & utilization" subtitle={`${monthWorkingDays} working day${monthWorkingDays !== 1 ? 's' : ''} this month — Mon–Fri + 1st/3rd/5th Saturday`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
              <Stat label="Hours logged" value={`${totalActualHours.toFixed(1)}h`} sub={`of ${payableHours}h capacity`} />
              <Stat label="Utilization" value={`${utilPct}%`} valueColor={utilPct >= 80 ? '#1D9E75' : utilPct >= 50 ? '#58a6ff' : utilPct >= 20 ? '#EF9F27' : '#E24B4A'} />
              <Stat label="Days logged" value={`${daysLogged}`} sub={zeroDays > 0 ? `${zeroDays} working day${zeroDays !== 1 ? 's' : ''} missed` : 'all working days covered'} subColor={zeroDays > 0 ? '#EF9F27' : '#1D9E75'} />
              <Stat label="Work log entries" value={`${daysWithLog}`} sub={daysWithLog === 0 ? 'no notes recorded' : 'with notes'} />
            </div>
          </SectionCard>

          {/* ── Section 2: Per-project breakdown ── */}
          <SectionCard
            title="Project breakdown"
            subtitle="Planned = allocated this month · Actual = logged hours · Cost share = monthly salary × actual hours / capacity"
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
                      <th className="text-right px-5 py-2.5 text-[10px] uppercase tracking-wide text-[#6e7681]">Cost share</th>
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
                          <td className="px-5 py-3 text-right tabular-nums">
                            {r.actualCost > 0 ? (
                              <span className="text-[#c9d1d9]">{formatCost(Math.round(r.actualCost))}</span>
                            ) : (
                              <span className="text-[#484f58]">—</span>
                            )}
                          </td>
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
                      <td className="px-5 py-3 text-right text-sm font-semibold text-[#c9d1d9] tabular-nums">{formatCost(Math.round(totalActualCost))}</td>
                    </tr>
                    {salary > 0 && (
                      <tr className="border-t border-[#30363d]/60">
                        <td className="px-5 py-3 text-[11px] text-[#6e7681]">Salary · bench</td>
                        <td colSpan={3} />
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

          {/* ── Section 3: Work log highlights ── */}
          <SectionCard
            title="Work log"
            subtitle="What they actually shipped — chronological, only entries with notes"
            action={
              <Link
                href={`/people/${selectedPerson.id}#edit-log`}
                className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#58a6ff] border border-[#30363d] hover:border-[#58a6ff]/50 rounded-md px-3 py-1.5 transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Edit logs
              </Link>
            }
          >
            {isLoading ? (
              <div className="h-48 bg-[#0d1117]/40 animate-pulse" />
            ) : workLog.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <MessageSquare className="h-5 w-5 text-[#484f58] mx-auto mb-2" />
                <p className="text-sm text-[#8b949e]">No work-log notes recorded this month.</p>
                <p className="text-xs text-[#6e7681] mt-1">Encourage logging notes to surface them in 1:1s.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#30363d]/60">
                {workLog.map((e, i) => {
                  const proj = projectMap.get(e.project_id)
                  const color = e.projects?.color ?? proj?.color ?? '#58a6ff'
                  const name = e.projects?.name ?? proj?.name ?? 'Unknown'
                  const dateObj = new Date(e.date + 'T00:00:00')
                  return (
                    <li key={e.id ?? `${e.date}-${e.project_id}-${i}`} className="px-5 py-3 flex gap-4 items-start">
                      <div className="text-[10px] text-[#6e7681] uppercase tracking-wide tabular-nums w-16 shrink-0 mt-0.5">
                        <div>{dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                        <div className="text-[#484f58] mt-0.5">{dateObj.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs font-medium text-[#c9d1d9] truncate">{name}</span>
                          <span className="text-[11px] text-[#6e7681] tabular-nums">{Number(e.hours).toFixed(1)}h</span>
                        </div>
                        <p className="text-sm text-[#c9d1d9] whitespace-pre-wrap leading-relaxed">{e.work_log}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>
        </>
      )}
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
