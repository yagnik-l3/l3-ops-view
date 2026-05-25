'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getMonthTimeEntries, getAllProjectsLite, type ProjectLite } from '@/lib/queries/time'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, addYears } from 'date-fns'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Person } from '@/lib/supabase/types'

type Range = 'month' | 'year'

type PersonLite = Pick<Person, 'id' | 'name' | 'avatar_initials' | 'avatar_color'>

type Bucket = 'billable' | 'internal' | 'support'

/** A project bucket is decided once for the entire period: internal projects
 *  always go to "internal"; lost or completed client projects go to "support";
 *  everything else is "billable". This is the simplest rule that gives the
 *  founder the year-end visibility they want without over-engineering. */
function bucketFor(p: ProjectLite): Bucket {
  if (p.kind === 'internal') return 'internal'
  if (p.status === 'lost' || p.status === 'completed') return 'support'
  return 'billable'
}

const BUCKET_LABEL: Record<Bucket, string> = {
  billable: 'Client (billable)',
  internal: 'Internal',
  support: 'Post-completion support',
}

const BUCKET_COLOR: Record<Bucket, string> = {
  billable: '#58a6ff',
  internal: '#bc8cff',
  support: '#f59e0b',
}

export function TeamReport() {
  const supabase = createClient()
  const [range, setRange] = useState<Range>('month')
  const [anchor, setAnchor] = useState<Date>(() => new Date())

  const [fromIso, toIso, label] = useMemo<[string, string, string]>(() => {
    if (range === 'month') {
      return [
        format(startOfMonth(anchor), 'yyyy-MM-dd'),
        format(endOfMonth(anchor), 'yyyy-MM-dd'),
        format(anchor, 'MMMM yyyy'),
      ]
    }
    return [
      format(startOfYear(anchor), 'yyyy-MM-dd'),
      format(endOfYear(anchor), 'yyyy-MM-dd'),
      format(anchor, 'yyyy'),
    ]
  }, [range, anchor])

  function shift(delta: number) {
    setAnchor(a => range === 'month' ? addMonths(a, delta) : addYears(a, delta))
  }

  const { data: people } = useQuery({
    queryKey: ['report_people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, name, avatar_initials, avatar_color')
        .eq('is_active', true)
        .neq('type', 'founder')
        .order('name')
      if (error) throw error
      return data as PersonLite[]
    },
    staleTime: 5 * 60_000,
  })

  const { data: projects } = useQuery({
    queryKey: ['report_projects_lite'],
    queryFn: getAllProjectsLite,
    staleTime: 5 * 60_000,
  })

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['report_entries', fromIso, toIso],
    queryFn: () => getMonthTimeEntries(fromIso, toIso),
  })

  const pivot = useMemo(() => {
    const projectMap = new Map<string, ProjectLite>()
    for (const p of projects ?? []) projectMap.set(p.id, p)

    /** hours[personId][projectId] */
    const hours = new Map<string, Map<string, number>>()
    /** Projects with any hours in the period, grouped by bucket. */
    const projectsInUse = new Map<string, ProjectLite>()
    /** Totals per (person, bucket). */
    const personBucket = new Map<string, Record<Bucket, number>>()
    /** Totals per project. */
    const projectTotals = new Map<string, number>()

    for (const e of entries ?? []) {
      const p = projectMap.get(e.project_id)
      if (!p) continue
      const h = Number(e.hours)
      const personMap = hours.get(e.person_id) ?? new Map<string, number>()
      personMap.set(e.project_id, (personMap.get(e.project_id) ?? 0) + h)
      hours.set(e.person_id, personMap)

      projectsInUse.set(p.id, p)
      projectTotals.set(p.id, (projectTotals.get(p.id) ?? 0) + h)

      const b = bucketFor(p)
      const totals = personBucket.get(e.person_id) ?? { billable: 0, internal: 0, support: 0 }
      totals[b] += h
      personBucket.set(e.person_id, totals)
    }

    const projectsByBucket: Record<Bucket, ProjectLite[]> = { billable: [], internal: [], support: [] }
    for (const p of projectsInUse.values()) {
      projectsByBucket[bucketFor(p)].push(p)
    }
    // sort projects within each bucket by total hours desc
    for (const b of ['billable', 'internal', 'support'] as Bucket[]) {
      projectsByBucket[b].sort((a, b2) => (projectTotals.get(b2.id) ?? 0) - (projectTotals.get(a.id) ?? 0))
    }

    return { hours, personBucket, projectsByBucket, projectTotals }
  }, [entries, projects])

  const rows = useMemo(() => {
    return (people ?? [])
      .map(person => {
        const totals = pivot.personBucket.get(person.id) ?? { billable: 0, internal: 0, support: 0 }
        const total = totals.billable + totals.internal + totals.support
        return { person, totals, total }
      })
      .sort((a, b) => b.total - a.total || a.person.name.localeCompare(b.person.name))
  }, [people, pivot])

  const grandTotals = useMemo(() => {
    const t = { billable: 0, internal: 0, support: 0, total: 0 }
    for (const r of rows) {
      t.billable += r.totals.billable
      t.internal += r.totals.internal
      t.support += r.totals.support
      t.total += r.total
    }
    return t
  }, [rows])

  const hasAnyHours = grandTotals.total > 0

  function downloadCsv() {
    const buckets: Bucket[] = ['billable', 'internal', 'support']
    const headerParts = ['Person']
    const colMeta: { projectId: string; name: string; bucket: Bucket }[] = []
    for (const b of buckets) {
      for (const p of pivot.projectsByBucket[b]) {
        headerParts.push(`${p.name} (${BUCKET_LABEL[b]})`)
        colMeta.push({ projectId: p.id, name: p.name, bucket: b })
      }
    }
    headerParts.push('Billable', 'Internal', 'Support', 'Total')
    const lines = [headerParts.map(csvEscape).join(',')]
    for (const r of rows) {
      const cells = [r.person.name]
      for (const c of colMeta) {
        const v = pivot.hours.get(r.person.id)?.get(c.projectId) ?? 0
        cells.push(v ? v.toFixed(2) : '')
      }
      cells.push(r.totals.billable.toFixed(2), r.totals.internal.toFixed(2), r.totals.support.toFixed(2), r.total.toFixed(2))
      lines.push(cells.map(csvEscape).join(','))
    }
    const totalsRow = ['TOTAL']
    for (const c of colMeta) {
      totalsRow.push((pivot.projectTotals.get(c.projectId) ?? 0).toFixed(2))
    }
    totalsRow.push(grandTotals.billable.toFixed(2), grandTotals.internal.toFixed(2), grandTotals.support.toFixed(2), grandTotals.total.toFixed(2))
    lines.push(totalsRow.map(csvEscape).join(','))

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `team-report-${label.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => shift(-1)}
              className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
              aria-label={range === 'month' ? 'Previous month' : 'Previous year'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-sm font-medium text-[#c9d1d9] min-w-[120px] text-center select-none">
              {label}
            </span>
            <button
              onClick={() => shift(1)}
              className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
              aria-label={range === 'month' ? 'Next month' : 'Next year'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 rounded-md bg-[#0d1117] border border-[#30363d] text-xs">
            {(['month', 'year'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-1 rounded transition-colors capitalize',
                  range === r ? 'bg-[#21262d] text-[#e6edf3]' : 'text-[#8b949e] hover:text-[#e6edf3]',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={downloadCsv}
            disabled={!hasAnyHours}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#30363d] text-xs text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Download CSV"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <SummaryChip label="Billable" hours={grandTotals.billable} color={BUCKET_COLOR.billable} />
        <SummaryChip label="Internal" hours={grandTotals.internal} color={BUCKET_COLOR.internal} />
        <SummaryChip label="Support" hours={grandTotals.support} color={BUCKET_COLOR.support} />
        <SummaryChip label="Total" hours={grandTotals.total} color="#1D9E75" />
      </div>

      {/* Pivot */}
      {loadingEntries ? (
        <div className="h-64 rounded-lg bg-[#161b22] border border-[#30363d] animate-pulse" />
      ) : !hasAnyHours ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
          <p className="text-sm text-[#8b949e]">No time logged in {label}.</p>
        </div>
      ) : (
        <PivotTable rows={rows} pivot={pivot} grandTotals={grandTotals} />
      )}
    </div>
  )
}

function SummaryChip({ label, hours, color }: { label: string; hours: number; color: string }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2.5">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <p className="text-[10px] text-[#6e7681] uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-lg font-semibold text-[#e6edf3] tabular-nums">
        {hours.toFixed(1)}<span className="text-xs text-[#6e7681] ml-0.5">h</span>
      </p>
    </div>
  )
}

interface PivotTableProps {
  rows: Array<{
    person: PersonLite
    totals: Record<Bucket, number>
    total: number
  }>
  pivot: {
    hours: Map<string, Map<string, number>>
    projectsByBucket: Record<Bucket, ProjectLite[]>
    projectTotals: Map<string, number>
  }
  grandTotals: { billable: number; internal: number; support: number; total: number }
}

function PivotTable({ rows, pivot, grandTotals }: PivotTableProps) {
  const buckets: Bucket[] = ['billable', 'internal', 'support']
  const flatColumns: { projectId: string; name: string; color: string | null; bucket: Bucket; clientName?: string; status?: string }[] = []
  for (const b of buckets) {
    for (const p of pivot.projectsByBucket[b]) {
      flatColumns.push({
        projectId: p.id,
        name: p.name,
        color: p.color,
        bucket: b,
        clientName: b === 'support' ? p.client_name : undefined,
        status: b === 'support' ? p.status : undefined,
      })
    }
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          {/* Bucket group header */}
          <tr className="border-b border-[#30363d] bg-[#0d1117]/60">
            <th className="text-left px-4 py-2 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide sticky left-0 bg-[#0d1117]/60 z-10">
              Person
            </th>
            {buckets.map(b => {
              const count = pivot.projectsByBucket[b].length
              if (count === 0) return null
              return (
                <th
                  key={b}
                  colSpan={count}
                  className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider border-l border-[#30363d]"
                  style={{ color: BUCKET_COLOR[b] }}
                >
                  {BUCKET_LABEL[b]}
                </th>
              )
            })}
            <th
              colSpan={4}
              className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#6e7681] border-l border-[#30363d]"
            >
              Subtotals
            </th>
          </tr>
          {/* Project header */}
          <tr className="border-b border-[#30363d]">
            <th className="text-left px-4 py-2 text-[11px] font-medium text-[#8b949e] sticky left-0 bg-[#161b22] z-10"></th>
            {flatColumns.map((c, i) => {
              const isFirstInBucket = i === 0 || c.bucket !== flatColumns[i - 1].bucket
              return (
                <th
                  key={c.projectId}
                  className={cn(
                    'text-right px-2 py-2 text-[11px] font-medium text-[#c9d1d9] min-w-[90px] align-bottom',
                    isFirstInBucket && 'border-l border-[#30363d]',
                  )}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#6e7681' }} />
                    <span className="truncate" title={c.clientName ? `${c.name} · ${c.clientName} (${c.status})` : c.name}>
                      {c.name}
                    </span>
                  </div>
                </th>
              )
            })}
            <th className="text-right px-3 py-2 text-[11px] font-medium border-l border-[#30363d]" style={{ color: BUCKET_COLOR.billable }}>Billable</th>
            <th className="text-right px-3 py-2 text-[11px] font-medium" style={{ color: BUCKET_COLOR.internal }}>Internal</th>
            <th className="text-right px-3 py-2 text-[11px] font-medium" style={{ color: BUCKET_COLOR.support }}>Support</th>
            <th className="text-right px-3 py-2 text-[11px] font-medium text-[#e6edf3]">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ person, totals, total }) => (
            <tr key={person.id} className="border-b border-[#30363d]/60 hover:bg-[#0d1117]/40">
              <td className="px-4 py-2 text-[#c9d1d9] sticky left-0 bg-[#161b22] hover:bg-[#0d1117]/40 z-10">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0"
                    style={{ backgroundColor: person.avatar_color ?? '#1D9E75' }}
                  >
                    {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate">{person.name}</span>
                </div>
              </td>
              {flatColumns.map((c, i) => {
                const v = pivot.hours.get(person.id)?.get(c.projectId) ?? 0
                const isFirstInBucket = i === 0 || c.bucket !== flatColumns[i - 1].bucket
                return (
                  <td
                    key={c.projectId}
                    className={cn(
                      'text-right px-2 py-2 tabular-nums',
                      v > 0 ? 'text-[#e6edf3]' : 'text-[#3d444d]',
                      isFirstInBucket && 'border-l border-[#30363d]',
                    )}
                  >
                    {v > 0 ? v.toFixed(1) : '·'}
                  </td>
                )
              })}
              <td className="text-right px-3 py-2 tabular-nums border-l border-[#30363d]" style={{ color: totals.billable > 0 ? BUCKET_COLOR.billable : '#3d444d' }}>
                {totals.billable > 0 ? totals.billable.toFixed(1) : '·'}
              </td>
              <td className="text-right px-3 py-2 tabular-nums" style={{ color: totals.internal > 0 ? BUCKET_COLOR.internal : '#3d444d' }}>
                {totals.internal > 0 ? totals.internal.toFixed(1) : '·'}
              </td>
              <td className="text-right px-3 py-2 tabular-nums" style={{ color: totals.support > 0 ? BUCKET_COLOR.support : '#3d444d' }}>
                {totals.support > 0 ? totals.support.toFixed(1) : '·'}
              </td>
              <td className="text-right px-3 py-2 font-semibold tabular-nums text-[#e6edf3]">{total.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#30363d] bg-[#0d1117]/40">
            <td className="px-4 py-2.5 text-[11px] font-semibold text-[#6e7681] uppercase tracking-wide sticky left-0 bg-[#0d1117]/40 z-10">
              Total
            </td>
            {flatColumns.map((c, i) => {
              const v = pivot.projectTotals.get(c.projectId) ?? 0
              const isFirstInBucket = i === 0 || c.bucket !== flatColumns[i - 1].bucket
              return (
                <td
                  key={c.projectId}
                  className={cn(
                    'text-right px-2 py-2.5 font-medium tabular-nums text-[#c9d1d9]',
                    isFirstInBucket && 'border-l border-[#30363d]',
                  )}
                >
                  {v > 0 ? v.toFixed(1) : '·'}
                </td>
              )
            })}
            <td className="text-right px-3 py-2.5 font-bold tabular-nums border-l border-[#30363d]" style={{ color: BUCKET_COLOR.billable }}>
              {grandTotals.billable.toFixed(1)}
            </td>
            <td className="text-right px-3 py-2.5 font-bold tabular-nums" style={{ color: BUCKET_COLOR.internal }}>
              {grandTotals.internal.toFixed(1)}
            </td>
            <td className="text-right px-3 py-2.5 font-bold tabular-nums" style={{ color: BUCKET_COLOR.support }}>
              {grandTotals.support.toFixed(1)}
            </td>
            <td className="text-right px-3 py-2.5 font-bold tabular-nums text-[#e6edf3]">
              {grandTotals.total.toFixed(1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}
