'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getMonthTimeEntries, getAllProjectsLite } from '@/lib/queries/time'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'
import type { Person } from '@/lib/supabase/types'

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

export function ReportClient() {
  const supabase = createClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)  // 1-indexed

  const monthDate = new Date(year, month - 1, 1)
  const fromDate = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const toDate   = format(endOfMonth(monthDate), 'yyyy-MM-dd')

  const { data: people, isLoading: loadingPeople } = useQuery({
    queryKey: ['report_people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, name, role, type, is_active, avatar_initials, avatar_color')
        .neq('type', 'founder')
        .order('name')
      if (error) throw error
      return data as Pick<Person, 'id' | 'name' | 'role' | 'type' | 'is_active' | 'avatar_initials' | 'avatar_color'>[]
    },
  })

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['report_entries', fromDate, toDate],
    queryFn: () => getMonthTimeEntries(fromDate, toDate),
  })

  const { data: projects } = useQuery({
    queryKey: ['report_projects'],
    queryFn: getAllProjectsLite,
    staleTime: 5 * 60_000,
  })

  const { table, projectCols, totals } = useMemo(() => {
    // Build pivot: rows = person, columns = project, cells = hours
    const projectMap = new Map<string, { id: string; name: string; color: string | null }>()
    for (const p of projects ?? []) projectMap.set(p.id, p)

    const usedProjects = new Map<string, { id: string; name: string; color: string | null; total: number }>()
    const pivot = new Map<string, Map<string, number>>()  // personId -> projectId -> hours

    for (const e of entries ?? []) {
      const personMap = pivot.get(e.person_id) ?? new Map<string, number>()
      personMap.set(e.project_id, (personMap.get(e.project_id) ?? 0) + Number(e.hours))
      pivot.set(e.person_id, personMap)

      const p = projectMap.get(e.project_id)
      const cur = usedProjects.get(e.project_id) ?? {
        id: e.project_id,
        name: p?.name ?? 'Unknown',
        color: p?.color ?? null,
        total: 0,
      }
      cur.total += Number(e.hours)
      usedProjects.set(e.project_id, cur)
    }

    const projectCols = Array.from(usedProjects.values()).sort((a, b) => b.total - a.total)

    type Row = {
      person: Pick<Person, 'id' | 'name' | 'avatar_initials' | 'avatar_color' | 'is_active'>
      perProject: number[]
      total: number
    }
    const rows: Row[] = (people ?? []).map(person => {
      const pm = pivot.get(person.id) ?? new Map<string, number>()
      const perProject = projectCols.map(p => pm.get(p.id) ?? 0)
      const total = perProject.reduce((s, h) => s + h, 0)
      return { person, perProject, total }
    })
    // Sort by total desc, but keep active people first
    rows.sort((a, b) => {
      if (a.person.is_active !== b.person.is_active) return a.person.is_active ? -1 : 1
      return b.total - a.total
    })

    const grandTotal = rows.reduce((s, r) => s + r.total, 0)
    const colTotals = projectCols.map(p => p.total)

    return { table: rows, projectCols, totals: { grand: grandTotal, perProject: colTotals } }
  }, [entries, people, projects])

  function shiftMonth(delta: number) {
    const next = addMonths(monthDate, delta)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
  }

  function exportCsv() {
    const headers = ['Employee', 'Total hours', ...projectCols.map(p => p.name)]
    const lines = [headers.map(escapeCsv).join(',')]
    for (const r of table) {
      const row = [r.person.name, r.total.toFixed(2), ...r.perProject.map(h => h.toFixed(2))]
      lines.push(row.map(escapeCsv).join(','))
    }
    lines.push(['TOTAL', totals.grand.toFixed(2), ...totals.perProject.map(h => h.toFixed(2))].map(escapeCsv).join(','))

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `time-report-${year}-${String(month).padStart(2, '0')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const isLoading = loadingPeople || loadingEntries
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div>
      {/* Month picker + export */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-2 min-w-[180px] text-center">
            <p className="text-xs text-[#6e7681]">Report month</p>
            <p className="text-sm font-semibold text-[#e6edf3]">{monthLabel(year, month)}</p>
          </div>
          <button
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            className="p-2 rounded-lg border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={exportCsv}
          disabled={table.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="h-64 rounded-xl bg-[#161b22] border border-[#30363d] animate-pulse" />
      ) : table.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
          <FileText className="h-6 w-6 text-[#6e7681] mx-auto mb-2" />
          <p className="text-sm text-[#8b949e]">No team members to report on.</p>
        </div>
      ) : projectCols.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
          <FileText className="h-6 w-6 text-[#6e7681] mx-auto mb-2" />
          <p className="text-sm text-[#8b949e]">No hours logged in {monthLabel(year, month)}.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0d1117] border-b border-[#30363d]">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[#8b949e] sticky left-0 bg-[#0d1117] min-w-[200px]">Employee</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[#8b949e]">Total</th>
                  {projectCols.map(p => (
                    <th key={p.id} className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[#8b949e] min-w-[100px]">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? '#58a6ff' }} />
                        <span className="truncate max-w-[120px]">{p.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.person.id} className={i % 2 === 1 ? 'bg-[#0d1117]/30' : ''}>
                    <td className="px-4 py-3 sticky left-0 bg-inherit">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0"
                          style={{ backgroundColor: r.person.avatar_color ?? '#1D9E75' }}
                        >
                          {r.person.avatar_initials ?? r.person.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className={r.person.is_active ? 'text-[#e6edf3]' : 'text-[#6e7681]'}>{r.person.name}</span>
                        {!r.person.is_active && <span className="text-[10px] text-[#6e7681]">(inactive)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#1d9e75]">
                      {r.total > 0 ? `${r.total.toFixed(1)}h` : <span className="text-[#30363d]">—</span>}
                    </td>
                    {r.perProject.map((h, j) => (
                      <td key={projectCols[j].id} className="px-4 py-3 text-right tabular-nums text-[#c9d1d9]">
                        {h > 0 ? h.toFixed(1) : <span className="text-[#30363d]">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-[#30363d] bg-[#0d1117]/60">
                  <td className="px-4 py-3 text-[10px] uppercase tracking-wider text-[#8b949e] sticky left-0 bg-inherit">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-[#e6edf3]">
                    {totals.grand.toFixed(1)}h
                  </td>
                  {totals.perProject.map((h, j) => (
                    <td key={projectCols[j].id} className="px-4 py-3 text-right tabular-nums font-semibold text-[#c9d1d9]">
                      {h.toFixed(1)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-[#6e7681] mt-3">
        Hours include both employee-logged time and any auto-backfilled allocation hours. Click Export CSV for a detailed download.
      </p>
    </div>
  )
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
