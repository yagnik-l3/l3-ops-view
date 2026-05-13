'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getProjectTimeSummary } from '@/lib/queries/time'
import { format, startOfMonth, endOfMonth, startOfWeek } from 'date-fns'
import { Clock } from 'lucide-react'

interface Props {
  projectId: string
}

export function ProjectTimePanel({ projectId }: Props) {
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd')
  const weekStart  = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const wideStart = '2020-01-01'
  const wideEnd   = format(now, 'yyyy-MM-dd')

  const { data: monthEntries, isLoading } = useQuery({
    queryKey: ['project_time', projectId, monthStart, monthEnd],
    queryFn: () => getProjectTimeSummary(projectId, monthStart, monthEnd),
  })

  const { data: allEntries } = useQuery({
    queryKey: ['project_time_all', projectId],
    queryFn: () => getProjectTimeSummary(projectId, wideStart, wideEnd),
  })

  const stats = useMemo(() => {
    const week = (monthEntries ?? [])
      .filter(e => e.date >= weekStart)
      .reduce((s, e) => s + Number(e.hours), 0)
    const month = (monthEntries ?? []).reduce((s, e) => s + Number(e.hours), 0)
    const total = (allEntries ?? []).reduce((s, e) => s + Number(e.hours), 0)
    return { week, month, total }
  }, [monthEntries, allEntries, weekStart])

  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; initials: string; color: string; hours: number }>()
    for (const e of monthEntries ?? []) {
      if (!e.people) continue
      const cur = map.get(e.people.id) ?? {
        name: e.people.name,
        initials: e.people.avatar_initials ?? e.people.name.slice(0, 2).toUpperCase(),
        color: e.people.avatar_color ?? '#1D9E75',
        hours: 0,
      }
      cur.hours += Number(e.hours)
      map.set(e.people.id, cur)
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.hours - a.hours)
  }, [monthEntries])

  const maxPersonHours = Math.max(...byPerson.map(p => p.hours), 1)

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-7 w-7 rounded-md bg-[#58a6ff]/15 border border-[#58a6ff]/25 flex items-center justify-center">
          <Clock className="h-3.5 w-3.5 text-[#58a6ff]" />
        </div>
        <div>
          <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">Time logged</h2>
          <p className="text-[11px] text-[#6e7681] mt-0.5">Actual hours from team daily logs</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Tile label="This week" hours={stats.week} />
        <Tile label="This month" hours={stats.month} />
        <Tile label="All time" hours={stats.total} />
      </div>

      {isLoading ? (
        <div className="h-20 rounded-lg bg-[#0d1117] animate-pulse" />
      ) : byPerson.length === 0 ? (
        <p className="text-xs text-[#6e7681] text-center py-4">No hours logged this month yet.</p>
      ) : (
        <>
          <p className="text-[11px] text-[#6e7681] uppercase tracking-wide mb-2">By person · this month</p>
          <div className="space-y-1.5">
            {byPerson.map(p => (
              <div key={p.id} className="flex items-center gap-3 text-xs">
                <Link href={`/people/${p.id}`} className="flex items-center gap-2 w-40 min-w-0 hover:text-[#58a6ff]">
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-medium shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.initials}
                  </div>
                  <span className="truncate text-[#c9d1d9]">{p.name}</span>
                </Link>
                <div className="flex-1 h-2 rounded-full bg-[#21262d] overflow-hidden">
                  <div
                    className="h-full bg-[#58a6ff]"
                    style={{ width: `${(p.hours / maxPersonHours) * 100}%` }}
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
