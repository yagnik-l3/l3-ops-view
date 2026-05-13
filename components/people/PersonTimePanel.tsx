'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getPersonTimeSummary } from '@/lib/queries/time'
import { format, startOfMonth, endOfMonth, startOfWeek, subDays } from 'date-fns'
import { Clock } from 'lucide-react'
import { ContributionGraph } from '@/components/time/ContributionGraph'

interface Props {
  personId: string
}

export function PersonTimePanel({ personId }: Props) {
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd')
  const weekStart  = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  // 1-year window for the contribution graph
  const yearFrom = format(subDays(now, 52 * 7), 'yyyy-MM-dd')
  const graphTo  = format(now, 'yyyy-MM-dd')

  const { data: monthEntries, isLoading } = useQuery({
    queryKey: ['person_time', personId, monthStart, monthEnd],
    queryFn: () => getPersonTimeSummary(personId, monthStart, monthEnd),
  })

  const { data: graphEntries } = useQuery({
    queryKey: ['person_time_graph', personId, yearFrom, graphTo],
    queryFn: () => getPersonTimeSummary(personId, yearFrom, graphTo),
  })

  const stats = useMemo(() => {
    const week = (monthEntries ?? [])
      .filter(e => e.date >= weekStart)
      .reduce((s, e) => s + Number(e.hours), 0)
    const month = (monthEntries ?? []).reduce((s, e) => s + Number(e.hours), 0)
    const total = (graphEntries ?? []).reduce((s, e) => s + Number(e.hours), 0)
    return { week, month, total }
  }, [monthEntries, graphEntries, weekStart])

  const byProject = useMemo(() => {
    const map = new Map<string, { name: string; color: string; hours: number }>()
    for (const e of monthEntries ?? []) {
      if (!e.projects) continue
      const cur = map.get(e.projects.id) ?? {
        name: e.projects.name,
        color: e.projects.color ?? '#58a6ff',
        hours: 0,
      }
      cur.hours += Number(e.hours)
      map.set(e.projects.id, cur)
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.hours - a.hours)
  }, [monthEntries])

  const maxHours = Math.max(...byProject.map(p => p.hours), 1)

  const dailyBreakdown = useMemo(() => {
    type Bucket = { hours: number; projects: Map<string, { id: string; name: string; color: string | null; hours: number }> }
    const m = new Map<string, Bucket>()
    for (const e of graphEntries ?? []) {
      const bucket = m.get(e.date) ?? { hours: 0, projects: new Map() }
      bucket.hours += Number(e.hours)
      if (e.projects) {
        const cur = bucket.projects.get(e.projects.id)
        if (cur) cur.hours += Number(e.hours)
        else bucket.projects.set(e.projects.id, {
          id: e.projects.id,
          name: e.projects.name,
          color: e.projects.color ?? null,
          hours: Number(e.hours),
        })
      }
      m.set(e.date, bucket)
    }
    return Array.from(m, ([date, b]) => ({
      date,
      hours: b.hours,
      projects: Array.from(b.projects.values()),
    }))
  }, [graphEntries])

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-7 w-7 rounded-md bg-[#58a6ff]/15 border border-[#58a6ff]/25 flex items-center justify-center">
          <Clock className="h-3.5 w-3.5 text-[#58a6ff]" />
        </div>
        <div>
          <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">Time logged</h2>
          <p className="text-[11px] text-[#6e7681] mt-0.5">Daily activity from time logs</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Tile label="This week" hours={stats.week} />
        <Tile label="This month" hours={stats.month} />
        <Tile label="Last year" hours={stats.total} />
      </div>

      {/* Contribution graph (1 year, click any cell for breakdown) */}
      <div className="mb-5 overflow-x-auto">
        <ContributionGraph entries={dailyBreakdown} weeks={52} cellSize={12} cellGap={3} />
      </div>

      {isLoading ? (
        <div className="h-20 rounded-lg bg-[#0d1117] animate-pulse" />
      ) : byProject.length === 0 ? (
        <p className="text-xs text-[#6e7681] text-center py-4">No hours logged this month yet.</p>
      ) : (
        <>
          <p className="text-[11px] text-[#6e7681] uppercase tracking-wide mb-2">By project · this month</p>
          <div className="space-y-1.5">
            {byProject.map(p => (
              <div key={p.id} className="flex items-center gap-3 text-xs">
                <Link href={`/projects/${p.id}`} className="w-40 min-w-0 hover:text-[#58a6ff]">
                  <span className="truncate text-[#c9d1d9] block">{p.name}</span>
                </Link>
                <div className="flex-1 h-2 rounded-full bg-[#21262d] overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${(p.hours / maxHours) * 100}%`, backgroundColor: p.color }}
                  />
                </div>
                <span className="w-12 text-right text-[#e6edf3] tabular-nums">{p.hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, hours }: { label: string; hours: number }) {
  return (
    <div className="rounded-lg bg-[#0d1117] border border-[#21262d] px-3 py-2.5">
      <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-[#e6edf3] tabular-nums mt-0.5">{hours.toFixed(1)}<span className="text-xs text-[#6e7681] ml-1">h</span></p>
    </div>
  )
}
