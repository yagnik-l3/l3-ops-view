'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getMonthTimeEntries, getAllProjectsLite } from '@/lib/queries/time'
import { format, subDays } from 'date-fns'
import { Activity, ArrowUpDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContributionGraph } from '@/components/time/ContributionGraph'
import { ReportClient } from './ReportClient'
import type { Person, TimeEntry } from '@/lib/supabase/types'

type Tab = 'activity' | 'report'
type SortBy = 'name' | 'total' | 'avg' | 'active'

const HOURS_PER_DAY = 8
// One full year graph; stats are computed over the same window.
const GRAPH_DAYS = 365
const GRAPH_WEEKS = 53

function workingDays(from: Date, to: Date): number {
  let n = 0
  const cur = new Date(from)
  while (cur <= to) {
    const dow = cur.getDay()
    if (dow !== 0) {
      // Skip 2nd & 4th Saturday
      if (dow !== 6 || ![2, 4].includes(Math.ceil(cur.getDate() / 7))) n++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return n
}

export function FeedClient() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('activity')
  const [sort, setSort] = useState<SortBy>('total')

  const today = new Date()
  const fromDate = format(subDays(today, GRAPH_DAYS - 1), 'yyyy-MM-dd')
  const toDate = format(today, 'yyyy-MM-dd')

  const { data: people, isLoading: loadingPeople } = useQuery({
    queryKey: ['feed_team_people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, name, role, type, avatar_initials, avatar_color, is_active, monthly_salary')
        .eq('is_active', true)
        .neq('type', 'founder')
        .order('name')
      if (error) throw error
      return data as (Pick<Person, 'id' | 'name' | 'role' | 'type' | 'avatar_initials' | 'avatar_color' | 'is_active' | 'monthly_salary'>)[]
    },
  })

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['feed_entries', fromDate, toDate],
    queryFn: () => getMonthTimeEntries(fromDate, toDate),
  })

  const { data: projects } = useQuery({
    queryKey: ['feed_projects_lite'],
    queryFn: getAllProjectsLite,
    staleTime: 5 * 60_000,
  })

  const projectMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string | null }>()
    for (const p of projects ?? []) m.set(p.id, p)
    return m
  }, [projects])

  const byPerson = useMemo(() => {
    const map = new Map<string, Pick<TimeEntry, 'person_id' | 'project_id' | 'date' | 'hours'>[]>()
    for (const e of entries ?? []) {
      const arr = map.get(e.person_id) ?? []
      arr.push(e)
      map.set(e.person_id, arr)
    }
    return map
  }, [entries])

  const totalWorkingDays = workingDays(subDays(today, GRAPH_DAYS - 1), today)

  const rows = useMemo(() => {
    return (people ?? []).map(p => {
      const list = byPerson.get(p.id) ?? []
      const totalHours = list.reduce((s, e) => s + Number(e.hours), 0)
      const daysLogged = new Set(list.map(e => e.date)).size
      const avgPerDay = daysLogged > 0 ? totalHours / daysLogged : 0
      const utilizationPct = totalWorkingDays > 0
        ? Math.round((totalHours / (totalWorkingDays * HOURS_PER_DAY)) * 100)
        : 0
      return { person: p, entries: list, totalHours, daysLogged, avgPerDay, utilizationPct }
    })
  }, [people, byPerson, totalWorkingDays])

  const sortedRows = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      switch (sort) {
        case 'name': return a.person.name.localeCompare(b.person.name)
        case 'total': return b.totalHours - a.totalHours
        case 'avg': return b.avgPerDay - a.avgPerDay
        case 'active': return b.daysLogged - a.daysLogged
      }
    })
    return arr
  }, [rows, sort])

  const isLoading = loadingPeople || loadingEntries

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-2">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Team</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          {tab === 'activity'
            ? 'Daily hours logged per person — spot patterns, compare output.'
            : 'Monthly hours per person broken down by project. Export for payroll or 1:1 prep.'}
        </p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 mt-4 border-b border-[#30363d]">
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')} icon={<Activity className="h-3.5 w-3.5" />}>
          Activity
        </TabButton>
        <TabButton active={tab === 'report'} onClick={() => setTab('report')} icon={<FileText className="h-3.5 w-3.5" />}>
          Monthly report
        </TabButton>
      </div>

      {tab === 'report' ? <ReportClient /> : <ActivityView
        sort={sort} setSort={setSort}
        sortedRows={sortedRows}
        projectMap={projectMap}
        isLoading={isLoading}
      />}
    </div>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors',
        active
          ? 'border-[#58a6ff] text-[#e6edf3]'
          : 'border-transparent text-[#8b949e] hover:text-[#e6edf3]'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

interface ActivityViewProps {
  sort: SortBy
  setSort: (s: SortBy) => void
  sortedRows: Array<{
    person: Pick<Person, 'id' | 'name' | 'role' | 'type' | 'avatar_initials' | 'avatar_color'>
    entries: Pick<TimeEntry, 'person_id' | 'project_id' | 'date' | 'hours'>[]
    totalHours: number
    daysLogged: number
    avgPerDay: number
    utilizationPct: number
  }>
  projectMap: Map<string, { id: string; name: string; color: string | null }>
  isLoading: boolean
}

function ActivityView({ sort, setSort, sortedRows, projectMap, isLoading }: ActivityViewProps) {
  return (
    <>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-[11px] text-[#6e7681]">Last 12 months · hover or click a cell for a day&apos;s project breakdown</p>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#6e7681] flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3" /> Sort
          </span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortBy)}
            className="text-xs border border-[#30363d] rounded-md px-2 py-1 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="total">Total hours</option>
            <option value="avg">Avg hrs/day</option>
            <option value="active">Active days</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* Person rows */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-40 rounded-xl bg-[#161b22] border border-[#30363d] animate-pulse" />
          ))}
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
          <p className="text-sm text-[#8b949e]">No active team members.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedRows.map(({ person, entries, totalHours, daysLogged, avgPerDay, utilizationPct }) => (
            <PersonRow
              key={person.id}
              person={person}
              entries={entries}
              projectMap={projectMap}
              totalHours={totalHours}
              daysLogged={daysLogged}
              avgPerDay={avgPerDay}
              utilizationPct={utilizationPct}
            />
          ))}
        </div>
      )}
    </>
  )
}

interface RowProps {
  person: { id: string; name: string; role: string; type: string; avatar_initials: string | null; avatar_color: string | null }
  entries: Pick<TimeEntry, 'person_id' | 'project_id' | 'date' | 'hours'>[]
  projectMap: Map<string, { id: string; name: string; color: string | null }>
  totalHours: number
  daysLogged: number
  avgPerDay: number
  utilizationPct: number
}

function PersonRow({ person, entries, projectMap, totalHours, daysLogged, avgPerDay, utilizationPct }: RowProps) {
  // Aggregate hours per date + project breakdown for the graph
  const dailyBreakdown = useMemo(() => {
    type Bucket = { hours: number; projects: Map<string, { id: string; name: string; color: string | null; hours: number }> }
    const m = new Map<string, Bucket>()
    for (const e of entries) {
      const bucket = m.get(e.date) ?? { hours: 0, projects: new Map() }
      bucket.hours += Number(e.hours)
      const proj = projectMap.get(e.project_id)
      const projName = proj?.name ?? 'Unknown'
      const projColor = proj?.color ?? null
      const cur = bucket.projects.get(e.project_id)
      if (cur) cur.hours += Number(e.hours)
      else bucket.projects.set(e.project_id, { id: e.project_id, name: projName, color: projColor, hours: Number(e.hours) })
      m.set(e.date, bucket)
    }
    return Array.from(m, ([date, b]) => ({
      date,
      hours: b.hours,
      projects: Array.from(b.projects.values()),
    }))
  }, [entries, projectMap])

  const initials = person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()
  const color = person.avatar_color ?? '#1D9E75'

  const utilColor = utilizationPct >= 80 ? '#1d9e75' : utilizationPct >= 50 ? '#58a6ff' : utilizationPct >= 20 ? '#f59e0b' : '#e24b4a'

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
      <div className="flex flex-wrap items-start gap-4 mb-3">
        <Link href={`/people/${person.id}`} className="flex items-center gap-3 group flex-1 min-w-0">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
            style={{ backgroundColor: color }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e6edf3] truncate group-hover:text-[#58a6ff] transition-colors">
              {person.name}
            </p>
            <p className="text-[11px] text-[#6e7681] truncate capitalize">{person.role} · {person.type}</p>
          </div>
        </Link>
        <div className="flex items-center gap-4 text-xs">
          <Stat label="Total" value={`${totalHours.toFixed(0)}h`} />
          <Stat label="Days" value={String(daysLogged)} />
          <Stat label="Avg/day" value={`${avgPerDay.toFixed(1)}h`} />
          <Stat label="Utilization" value={`${utilizationPct}%`} valueColor={utilColor} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <ContributionGraph
          entries={dailyBreakdown}
          weeks={GRAPH_WEEKS}
          cellSize={11}
          cellGap={2}
          showWeekdayLabels={false}
        />
      </div>
    </div>
  )
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold tabular-nums" style={{ color: valueColor ?? '#e6edf3' }}>{value}</p>
    </div>
  )
}
