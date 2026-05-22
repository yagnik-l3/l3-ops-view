'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  addDays,
  isSameMonth,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Coffee } from 'lucide-react'
import { cn } from '@/lib/utils'
import { workingDaysInMonth, isWorkingDay } from '@/lib/utils/cost'
import { getPersonTimeSummary, getAllProjectsLite } from '@/lib/queries/time'
import type { TimeEntry, Project } from '@/lib/supabase/types'

interface Props {
  personId: string
  /** When set, the calendar opens with this day selected (yyyy-MM-dd). */
  initialDate?: string
  /** Fired when the user picks a day. Receives the iso date or null on deselect. */
  onSelectDay?: (iso: string | null) => void
}

const HOURS_PER_DAY = 8
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type ProjectLite = { id: string; name: string; color: string | null }
type EntryFull = TimeEntry & { projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'> | null }

type DayCellData = {
  hours: number
  projects: Map<string, { id: string; name: string; color: string | null; hours: number }>
}

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')
const monthLabel = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })

/** Calendar view of a person's time entries for a single month. Mirrors the
 *  /feed → Activity tab but trimmed for the profile page: no avatar in the
 *  summary strip (the profile header already shows it). */
export function PersonActivityCalendar({ personId, initialDate, onSelectDay }: Props) {
  const now = new Date()
  const seed = initialDate ? new Date(initialDate + 'T00:00:00') : now
  const [year, setYear]   = useState(seed.getFullYear())
  const [month, setMonth] = useState(seed.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDate ?? null)

  const monthDate  = new Date(year, month - 1, 1)
  const monthStart = isoDate(startOfMonth(monthDate))
  const monthEnd   = isoDate(endOfMonth(monthDate))

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
    queryKey: ['person_activity_entries', personId, monthStart, monthEnd],
    queryFn: () => getPersonTimeSummary(personId, monthStart, monthEnd),
  })

  const dailyMap = useMemo(() => {
    const map = new Map<string, DayCellData>()
    for (const e of (entries ?? []) as EntryFull[]) {
      const bucket = map.get(e.date) ?? { hours: 0, projects: new Map() }
      bucket.hours += Number(e.hours)
      const proj = projectMap.get(e.project_id)
      const cur = bucket.projects.get(e.project_id) ?? {
        id: e.project_id,
        name: e.projects?.name ?? proj?.name ?? 'Unknown',
        color: e.projects?.color ?? proj?.color ?? null,
        hours: 0,
      }
      cur.hours += Number(e.hours)
      bucket.projects.set(e.project_id, cur)
      map.set(e.date, bucket)
    }
    return map
  }, [entries, projectMap])

  const summary = useMemo(() => {
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
    onSelectDay?.(null)
  }
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth() + 1)
    setSelectedDay(null)
    onSelectDay?.(null)
  }
  function handleSelect(iso: string) {
    const next = selectedDay === iso ? null : iso
    setSelectedDay(next)
    onSelectDay?.(next)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  // 6-week grid, Monday-anchored.
  const calendarStart = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const dow = first.getDay()
    const offsetFromMonday = (dow + 6) % 7
    return addDays(first, -offsetFromMonday)
  }, [year, month])

  const cells = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 42; i++) arr.push(addDays(calendarStart, i))
    return arr
  }, [calendarStart])

  const expanded = selectedDay ? dailyMap.get(selectedDay) ?? null : null
  const utilColor = summary.utilPct >= 80 ? '#1D9E75'
    : summary.utilPct >= 50 ? '#58a6ff'
    : summary.utilPct >= 20 ? '#EF9F27'
    : '#E24B4A'

  return (
    <div className="space-y-5">
      {/* Month nav */}
      <div className="flex items-center gap-0.5 justify-end">
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

      {/* Summary strip */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 flex flex-wrap items-center gap-5">
        <Stat label="Hours" value={`${summary.totalHours.toFixed(1)}h`} sub={`of ${summary.payable}h capacity`} />
        <Stat label="Days logged" value={`${summary.daysLogged}`} sub={`of ${summary.workingDays} working`} />
        <Stat label="Utilization" value={`${summary.utilPct}%`} valueColor={utilColor} />
        {summary.topProjects.length > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-[11px] text-[#6e7681] uppercase tracking-wide">Top</span>
            {summary.topProjects.map(p => (
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

      {/* Calendar */}
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

        <div className={cn('grid grid-cols-7', loadingEntries && 'opacity-60 pointer-events-none')}>
          {cells.map((d, i) => {
            const iso = isoDate(d)
            const inMonth = isSameMonth(d, monthDate)
            const cell = dailyMap.get(iso)
            const holiday = !isWorkingDay(d)
            const today = isoDate(new Date())
            return (
              <CalendarCell
                key={iso + '-' + i}
                date={d}
                inMonth={inMonth}
                holiday={holiday}
                isToday={iso === today}
                isSelected={iso === selectedDay}
                hours={cell?.hours ?? 0}
                projects={cell ? Array.from(cell.projects.values()) : []}
                onClick={() => handleSelect(iso)}
              />
            )
          })}
        </div>
      </div>

      {/* Day detail */}
      {expanded && selectedDay && (
        <DayDetail date={selectedDay} dayCell={expanded} />
      )}
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

interface CalendarCellProps {
  date: Date
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
        {holiday && inMonth && <Coffee className="h-3 w-3 text-[#6e7681]" />}
      </div>

      {hasData && (
        <div className="mt-1 space-y-1">
          <div className="text-sm font-semibold tabular-nums" style={{ color: hours >= HOURS_PER_DAY ? '#1D9E75' : '#e6edf3' }}>
            {hours.toFixed(1)}<span className="text-[10px] text-[#6e7681] ml-0.5">h</span>
          </div>
          <div className="h-1.5 w-full rounded-sm overflow-hidden flex bg-[#0d1117]">
            {segments.map((s, i) => (
              <div key={i} style={{ width: `${s.widthPct}%`, backgroundColor: s.color }} />
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

function DayDetail({ date, dayCell }: { date: string; dayCell: DayCellData }) {
  const projects = useMemo(
    () => Array.from(dayCell.projects.values()).sort((a, b) => b.hours - a.hours),
    [dayCell],
  )
  const dateObj = new Date(date + 'T00:00:00')
  const weekday = dateObj.toLocaleDateString('en-IN', { weekday: 'long' })
  const dateLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
      <div className="mb-4">
        <p className="text-[11px] text-[#6e7681] uppercase tracking-wide">{weekday}</p>
        <h3 className="text-base font-semibold text-[#e6edf3] mt-0.5">{dateLabel}</h3>
        <p className="text-xs text-[#8b949e] mt-1">
          {dayCell.hours.toFixed(1)}h across {projects.length} project{projects.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-2">
        {projects.map(p => (
          <div key={p.id} className="rounded-lg border border-[#30363d] bg-[#0d1117]/40 p-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#58a6ff' }} />
            <span className="text-sm font-medium text-[#c9d1d9] truncate">{p.name}</span>
            <span className="ml-auto text-sm tabular-nums text-[#e6edf3] font-medium">{p.hours.toFixed(1)}h</span>
          </div>
        ))}
      </div>
    </div>
  )
}
