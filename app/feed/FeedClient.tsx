'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getPersonTimeSummary, getAllProjectsLite } from '@/lib/queries/time'
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  addDays,
  isSameMonth,
} from 'date-fns'
import {
  Activity,
  FileText,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Coffee,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { workingDaysInMonth, isWorkingDay } from '@/lib/utils/cost'
import { ReportClient } from './ReportClient'
import type { Person, TimeEntry, Project } from '@/lib/supabase/types'

type Tab = 'activity' | 'report'

const HOURS_PER_DAY = 8

type PersonLite = Pick<Person, 'id' | 'name' | 'role' | 'type' | 'avatar_initials' | 'avatar_color' | 'is_active' | 'monthly_salary'>
type ProjectLite = { id: string; name: string; color: string | null }
type EntryFull = TimeEntry & { projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'> | null }

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function FeedClient() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('activity')

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
      return data as PersonLite[]
    },
  })

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

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-2">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Team</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          {tab === 'activity'
            ? 'Pick a teammate and see their month at a glance — hours, projects, daily breakdown.'
            : "One employee at a time — hours, cost split, and what they actually shipped. Built for 1:1s."}
        </p>
      </header>

      <div className="flex items-center gap-1 mb-6 mt-4 border-b border-[#30363d]">
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')} icon={<Activity className="h-3.5 w-3.5" />}>
          Activity
        </TabButton>
        <TabButton active={tab === 'report'} onClick={() => setTab('report')} icon={<FileText className="h-3.5 w-3.5" />}>
          Monthly report
        </TabButton>
      </div>

      {tab === 'report'
        ? <ReportClient people={people ?? []} projectMap={projectMap} loadingPeople={loadingPeople} />
        : <ActivityView people={people ?? []} projectMap={projectMap} loadingPeople={loadingPeople} />}
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

// ── Activity view ──────────────────────────────────────────────────────────

interface ActivityViewProps {
  people: PersonLite[]
  projectMap: Map<string, ProjectLite>
  loadingPeople: boolean
}

function ActivityView({ people, projectMap, loadingPeople }: ActivityViewProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-indexed
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const effectivePersonId = selectedPersonId ?? people[0]?.id ?? null
  const selectedPerson = useMemo(
    () => people.find(p => p.id === effectivePersonId) ?? null,
    [people, effectivePersonId],
  )

  const monthDate = new Date(year, month - 1, 1)
  const monthStart = isoDate(startOfMonth(monthDate))
  const monthEnd = isoDate(endOfMonth(monthDate))

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['activity_entries', effectivePersonId, monthStart, monthEnd],
    queryFn: () => effectivePersonId
      ? getPersonTimeSummary(effectivePersonId, monthStart, monthEnd)
      : Promise.resolve([] as EntryFull[]),
    enabled: !!effectivePersonId,
  })

  // Aggregate hours per (date, project)
  const dailyMap = useMemo(() => {
    type DayCell = {
      hours: number
      projects: Map<string, { id: string; name: string; color: string | null; hours: number; logs: { hours: number; work_log: string | null }[] }>
    }
    const map = new Map<string, DayCell>()
    for (const e of (entries ?? []) as EntryFull[]) {
      const bucket = map.get(e.date) ?? { hours: 0, projects: new Map() }
      bucket.hours += Number(e.hours)
      const projId = e.project_id
      const proj = projectMap.get(projId)
      const cur = bucket.projects.get(projId) ?? {
        id: projId,
        name: e.projects?.name ?? proj?.name ?? 'Unknown',
        color: e.projects?.color ?? proj?.color ?? null,
        hours: 0,
        logs: [] as { hours: number; work_log: string | null }[],
      }
      cur.hours += Number(e.hours)
      cur.logs.push({ hours: Number(e.hours), work_log: e.work_log })
      bucket.projects.set(projId, cur)
      map.set(e.date, bucket)
    }
    return map
  }, [entries, projectMap])

  const monthSummary = useMemo(() => {
    const totalHours = Array.from(dailyMap.values()).reduce((s, d) => s + d.hours, 0)
    const workingDays = workingDaysInMonth(year, month)
    const payable = workingDays * HOURS_PER_DAY
    const utilPct = payable > 0 ? Math.round((totalHours / payable) * 100) : 0
    const daysLogged = dailyMap.size

    const projectTotals = new Map<string, { id: string; name: string; color: string | null; hours: number }>()
    for (const day of dailyMap.values()) {
      for (const [pid, p] of day.projects) {
        const cur = projectTotals.get(pid) ?? { id: pid, name: p.name, color: p.color, hours: 0 }
        cur.hours += p.hours
        projectTotals.set(pid, cur)
      }
    }
    const topProjects = Array.from(projectTotals.values())
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 3)

    return { totalHours, workingDays, payable, utilPct, daysLogged, topProjects }
  }, [dailyMap, year, month])

  function shiftMonth(delta: number) {
    const next = addMonths(monthDate, delta)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
    setSelectedDay(null)
  }
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth() + 1)
    setSelectedDay(null)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  // Build calendar grid: 6 weeks × 7 days, starting Monday before/at the 1st of month
  const calendarStart = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const dow = first.getDay() // 0 = Sun, 1 = Mon, ... 6 = Sat
    const offsetFromMonday = (dow + 6) % 7 // Mon→0, Tue→1, ..., Sun→6
    return addDays(first, -offsetFromMonday)
  }, [year, month])

  const cells = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 42; i++) arr.push(addDays(calendarStart, i))
    return arr
  }, [calendarStart])

  const expanded = selectedDay ? dailyMap.get(selectedDay) ?? null : null

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[#6e7681] uppercase tracking-wide">Employee</label>
          <select
            value={effectivePersonId ?? ''}
            onChange={e => { setSelectedPersonId(e.target.value); setSelectedDay(null) }}
            disabled={loadingPeople || people.length === 0}
            className="text-sm border border-[#30363d] rounded-md px-2.5 py-1.5 bg-[#0d1117] text-[#e6edf3] min-w-[200px] focus:outline-none focus:border-[#58a6ff]"
          >
            {people.length === 0 && <option value="">No team members</option>}
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

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
      </div>

      {/* Summary strip */}
      {selectedPerson && (
        <SummaryStrip
          person={selectedPerson}
          totalHours={monthSummary.totalHours}
          workingDays={monthSummary.workingDays}
          payable={monthSummary.payable}
          utilPct={monthSummary.utilPct}
          daysLogged={monthSummary.daysLogged}
          topProjects={monthSummary.topProjects}
        />
      )}

      {/* Calendar */}
      {loadingPeople ? (
        <div className="h-[420px] rounded-xl bg-[#161b22] border border-[#30363d] animate-pulse" />
      ) : !selectedPerson ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
          <p className="text-sm text-[#8b949e]">No active team members.</p>
        </div>
      ) : (
        <MonthCalendar
          cells={cells}
          monthYear={year}
          monthIdx={month}
          dailyMap={dailyMap}
          selectedDay={selectedDay}
          onSelectDay={iso => setSelectedDay(prev => prev === iso ? null : iso)}
          loading={loadingEntries}
        />
      )}

      {/* Day expanded */}
      {expanded && selectedDay && selectedPerson && (
        <DayDetail
          date={selectedDay}
          dayCell={expanded}
          personId={selectedPerson.id}
        />
      )}
    </div>
  )
}

// ── Summary strip ──────────────────────────────────────────────────────────

interface SummaryStripProps {
  person: PersonLite
  totalHours: number
  workingDays: number
  payable: number
  utilPct: number
  daysLogged: number
  topProjects: { id: string; name: string; color: string | null; hours: number }[]
}

function SummaryStrip({ person, totalHours, workingDays, payable, utilPct, daysLogged, topProjects }: SummaryStripProps) {
  const utilColor = utilPct >= 80 ? '#1D9E75' : utilPct >= 50 ? '#58a6ff' : utilPct >= 20 ? '#EF9F27' : '#E24B4A'
  const initials = person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()
  const avatarColor = person.avatar_color ?? '#1D9E75'

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
      <div className="flex flex-wrap items-center gap-5">
        <Link href={`/people/${person.id}`} className="flex items-center gap-3 group min-w-0">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e6edf3] truncate group-hover:text-[#58a6ff] transition-colors">{person.name}</p>
            <p className="text-[11px] text-[#6e7681] truncate capitalize">{person.role}</p>
          </div>
        </Link>

        <div className="flex items-center gap-5 flex-wrap">
          <Stat label="Hours" value={`${totalHours.toFixed(1)}h`} sub={`of ${payable}h capacity`} />
          <Stat label="Days logged" value={`${daysLogged}`} sub={`of ${workingDays} working`} />
          <Stat label="Utilization" value={`${utilPct}%`} valueColor={utilColor} />
        </div>

        {topProjects.length > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-[11px] text-[#6e7681] uppercase tracking-wide">Top</span>
            {topProjects.map(p => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-[#30363d] bg-[#0d1117]"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? '#58a6ff' }} />
                <span className="text-[#c9d1d9] truncate max-w-[120px]">{p.name}</span>
                <span className="text-[#6e7681] tabular-nums">{p.hours.toFixed(1)}h</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">{label}</p>
      <p className="text-base font-semibold tabular-nums" style={{ color: valueColor ?? '#e6edf3' }}>{value}</p>
      {sub && <p className="text-[10px] text-[#6e7681] mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Calendar grid ──────────────────────────────────────────────────────────

interface DayCellData {
  hours: number
  projects: Map<string, { id: string; name: string; color: string | null; hours: number; logs: { hours: number; work_log: string | null }[] }>
}

interface MonthCalendarProps {
  cells: Date[]
  monthYear: number
  monthIdx: number
  dailyMap: Map<string, DayCellData>
  selectedDay: string | null
  onSelectDay: (iso: string) => void
  loading: boolean
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthCalendar({ cells, monthYear, monthIdx, dailyMap, selectedDay, onSelectDay, loading }: MonthCalendarProps) {
  const today = isoDate(new Date())
  const monthRef = new Date(monthYear, monthIdx - 1, 1)

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[#30363d] bg-[#0d1117]">
        {WEEKDAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={cn(
              'px-3 py-2 text-[10px] uppercase tracking-wider text-center',
              i === 5 ? 'text-[#EF9F27]/70' : i === 6 ? 'text-[#6e7681]' : 'text-[#8b949e]',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      <div className={cn('grid grid-cols-7', loading && 'opacity-60 pointer-events-none')}>
        {cells.map((d, i) => {
          const iso = isoDate(d)
          const inMonth = isSameMonth(d, monthRef)
          const cell = dailyMap.get(iso)
          const holiday = !isWorkingDay(d)
          const isToday = iso === today
          const isSelected = iso === selectedDay
          return (
            <CalendarCell
              key={iso + '-' + i}
              date={d}
              iso={iso}
              inMonth={inMonth}
              holiday={holiday}
              isToday={isToday}
              isSelected={isSelected}
              hours={cell?.hours ?? 0}
              projects={cell ? Array.from(cell.projects.values()) : []}
              onClick={() => onSelectDay(iso)}
            />
          )
        })}
      </div>
    </div>
  )
}

interface CalendarCellProps {
  date: Date
  iso: string
  inMonth: boolean
  holiday: boolean
  isToday: boolean
  isSelected: boolean
  hours: number
  projects: { id: string; name: string; color: string | null; hours: number }[]
  onClick: () => void
}

function CalendarCell({ date, inMonth, holiday, isToday, isSelected, hours, projects, onClick }: CalendarCellProps) {
  const hasData = hours > 0
  const dayNum = date.getDate()
  // Stacked bar segments — width proportional to hours per project, capped at HOURS_PER_DAY
  const segments = useMemo(() => {
    if (projects.length === 0) return [] as { color: string; widthPct: number }[]
    const denom = Math.max(hours, HOURS_PER_DAY)
    return projects
      .slice()
      .sort((a, b) => b.hours - a.hours)
      .map(p => ({
        color: p.color ?? '#58a6ff',
        widthPct: (p.hours / denom) * 100,
      }))
  }, [projects, hours])

  return (
    <button
      onClick={onClick}
      disabled={!inMonth && !hasData}
      className={cn(
        'group relative h-[88px] border-r border-b border-[#30363d] p-1.5 text-left transition-colors',
        'last:border-r-0',
        !inMonth && 'bg-[#0d1117]/40 opacity-40',
        inMonth && holiday && 'bg-[#0d1117]/30',
        inMonth && !holiday && 'bg-[#161b22] hover:bg-[#21262d]/60',
        isSelected && 'ring-1 ring-inset ring-[#58a6ff] bg-[#21262d]/80',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'text-[11px] tabular-nums font-medium',
            isToday ? 'inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#58a6ff] text-[#0d1117]'
              : holiday ? 'text-[#6e7681]'
              : inMonth ? 'text-[#c9d1d9]' : 'text-[#484f58]',
          )}
        >
          {dayNum}
        </span>
        {holiday && inMonth && (
          <Coffee className="h-3 w-3 text-[#6e7681]" />
        )}
      </div>

      {hasData && (
        <div className="mt-1 space-y-1">
          <div className="text-sm font-semibold tabular-nums" style={{ color: hours >= HOURS_PER_DAY ? '#1D9E75' : '#e6edf3' }}>
            {hours.toFixed(1)}<span className="text-[10px] text-[#6e7681] ml-0.5">h</span>
          </div>
          <div className="h-1.5 w-full rounded-sm overflow-hidden flex bg-[#0d1117]">
            {segments.map((s, i) => (
              <div
                key={i}
                style={{ width: `${s.widthPct}%`, backgroundColor: s.color }}
              />
            ))}
          </div>
          {projects.length > 1 && (
            <p className="text-[10px] text-[#6e7681] tabular-nums">{projects.length} projects</p>
          )}
        </div>
      )}

      {!hasData && inMonth && !holiday && (
        <p className="mt-1 text-[10px] text-[#484f58]">—</p>
      )}
    </button>
  )
}

// ── Day detail ─────────────────────────────────────────────────────────────

interface DayDetailProps {
  date: string
  dayCell: DayCellData
  personId: string
}

function DayDetail({ date, dayCell, personId }: DayDetailProps) {
  const projects = useMemo(
    () => Array.from(dayCell.projects.values()).sort((a, b) => b.hours - a.hours),
    [dayCell],
  )
  const dateObj = new Date(date + 'T00:00:00')
  const weekday = dateObj.toLocaleDateString('en-IN', { weekday: 'long' })
  const dateLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-[11px] text-[#6e7681] uppercase tracking-wide">{weekday}</p>
          <h3 className="text-base font-semibold text-[#e6edf3] mt-0.5">{dateLabel}</h3>
          <p className="text-xs text-[#8b949e] mt-1">{dayCell.hours.toFixed(1)}h across {projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href={`/people/${personId}?date=${date}#edit-log`}
          className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#58a6ff] border border-[#30363d] hover:border-[#58a6ff]/50 rounded-md px-3 py-1.5 transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Edit log
        </Link>
      </div>

      <div className="space-y-3">
        {projects.map(p => (
          <div key={p.id} className="rounded-lg border border-[#30363d] bg-[#0d1117]/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#58a6ff' }} />
              <span className="text-sm font-medium text-[#c9d1d9] truncate">{p.name}</span>
              <span className="ml-auto text-sm tabular-nums text-[#e6edf3] font-medium">{p.hours.toFixed(1)}h</span>
            </div>
            {p.logs.filter(l => l.work_log && l.work_log.trim() !== '').length > 0 ? (
              <ul className="space-y-1.5 mt-2">
                {p.logs
                  .filter(l => l.work_log && l.work_log.trim() !== '')
                  .map((l, i) => (
                    <li key={i} className="text-xs text-[#8b949e] whitespace-pre-wrap leading-relaxed pl-4 border-l border-[#30363d]">
                      {l.work_log}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-[11px] text-[#484f58] italic mt-1 pl-4">No work log entered</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
