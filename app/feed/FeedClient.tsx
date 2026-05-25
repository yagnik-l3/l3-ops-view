'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getDayTimeEntries } from '@/lib/queries/time'
import { format, addDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Pencil, CheckCircle2, Coffee, Activity, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isWorkingDay } from '@/lib/utils/cost'
import type { Person } from '@/lib/supabase/types'
import { TeamReport } from './TeamReport'

type Tab = 'activity' | 'report'

const HOURS_PER_DAY = 8

type PersonLite = Pick<Person, 'id' | 'name' | 'role' | 'type' | 'avatar_initials' | 'avatar_color' | 'is_active'>

type ProjectDay = {
  id: string
  name: string
  color: string | null
  hours: number
  logs: { hours: number; work_log: string | null }[]
}

type DayData = {
  hours: number
  projects: Map<string, ProjectDay>
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Team-wide day snapshot — every active employee and what they logged on a
 *  single day, so the founder can see who worked on what without drilling in. */
export function FeedClient() {
  const [tab, setTab] = useState<Tab>('activity')

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Team</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          Day-by-day activity and rolled-up reports across the team.
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-[#30363d] mb-5">
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')} icon={<Activity className="h-3.5 w-3.5" />}>
          Activity
        </TabButton>
        <TabButton active={tab === 'report'} onClick={() => setTab('report')} icon={<FileText className="h-3.5 w-3.5" />}>
          Report
        </TabButton>
      </div>

      {tab === 'activity' ? <ActivityView /> : <TeamReport />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors',
        active
          ? 'border-[#58a6ff] text-[#e6edf3]'
          : 'border-transparent text-[#8b949e] hover:text-[#e6edf3]',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function ActivityView() {
  const supabase = createClient()
  const todayIso = isoDate(new Date())
  const [date, setDate] = useState(todayIso)

  const { data: people, isLoading: loadingPeople } = useQuery({
    queryKey: ['feed_team_people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, name, role, type, avatar_initials, avatar_color, is_active')
        .eq('is_active', true)
        .neq('type', 'founder')
        .order('name')
      if (error) throw error
      return data as PersonLite[]
    },
  })

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['feed_day_entries', date],
    queryFn: () => getDayTimeEntries(date),
  })

  // Aggregate entries → per-person, per-project for the selected day.
  const byPerson = useMemo(() => {
    const map = new Map<string, DayData>()
    for (const e of entries ?? []) {
      const bucket = map.get(e.person_id) ?? { hours: 0, projects: new Map<string, ProjectDay>() }
      const hours = Number(e.hours)
      bucket.hours += hours
      const cur = bucket.projects.get(e.project_id) ?? {
        id: e.project_id,
        name: e.projects?.name ?? 'Unknown',
        color: e.projects?.color ?? null,
        hours: 0,
        logs: [],
      }
      cur.hours += hours
      cur.logs.push({ hours, work_log: e.work_log })
      bucket.projects.set(e.project_id, cur)
      map.set(e.person_id, bucket)
    }
    return map
  }, [entries])

  // One row per active employee — logged first (by hours), then the rest.
  const rows = useMemo(() => {
    return (people ?? [])
      .map(p => ({ person: p, day: byPerson.get(p.id) ?? null }))
      .sort((a, b) =>
        (b.day?.hours ?? 0) - (a.day?.hours ?? 0) ||
        a.person.name.localeCompare(b.person.name),
      )
  }, [people, byPerson])

  const loggedCount = rows.filter(r => (r.day?.hours ?? 0) > 0).length
  const totalHours = rows.reduce((s, r) => s + (r.day?.hours ?? 0), 0)

  const dateObj = new Date(date + 'T00:00:00')
  const isToday = date === todayIso
  const holiday = !isWorkingDay(dateObj)

  function shiftDay(delta: number) {
    setDate(isoDate(addDays(dateObj, delta)))
  }

  const showSkeleton = loadingPeople || (loadingEntries && !entries)

  return (
    <div>
      {/* Date nav + summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-base font-medium text-[#c9d1d9]">
            {dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          {isToday && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#58a6ff]/10 text-[#58a6ff] border border-[#58a6ff]/20">
              Today
            </span>
          )}
          {holiday && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#6e7681]">
              <Coffee className="h-3 w-3" /> Weekend / holiday
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!showSkeleton && rows.length > 0 && (
            <p className="text-xs text-[#8b949e] tabular-nums">
              <span className="text-[#e6edf3] font-medium">{loggedCount}</span> of {rows.length} logged
              {' · '}
              <span className="text-[#e6edf3] font-medium">{totalHours.toFixed(1)}h</span> total
            </p>
          )}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => shiftDay(-1)}
              className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => shiftDay(1)}
              disabled={isToday}
              className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!isToday && (
              <button
                onClick={() => setDate(todayIso)}
                className="ml-2 text-xs px-2.5 py-1 rounded text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#21262d] transition-colors"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      {showSkeleton ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-xl bg-[#161b22] border border-[#30363d] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
          <p className="text-sm text-[#8b949e]">No active team members.</p>
        </div>
      ) : (
        <div className={cn('space-y-3', loadingEntries && 'opacity-60')}>
          {rows.map(({ person, day }) => (
            <PersonDayCard key={person.id} person={person} day={day} date={date} />
          ))}
        </div>
      )}
    </div>
  )
}

function PersonDayCard({ person, day, date }: { person: PersonLite; day: DayData | null; date: string }) {
  const initials = person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()
  const avatarColor = person.avatar_color ?? '#1D9E75'
  const hours = day?.hours ?? 0
  const logged = hours > 0

  const projects = useMemo(
    () => (day ? Array.from(day.projects.values()).sort((a, b) => b.hours - a.hours) : []),
    [day],
  )

  // Stacked bar — width proportional to hours per project, capped at a full day.
  const segments = useMemo(() => {
    if (projects.length === 0) return [] as { color: string; widthPct: number }[]
    const denom = Math.max(hours, HOURS_PER_DAY)
    return projects.map(p => ({
      color: p.color ?? '#58a6ff',
      widthPct: (p.hours / denom) * 100,
    }))
  }, [projects, hours])

  return (
    <div
      className={cn(
        'rounded-xl border bg-[#161b22] overflow-hidden',
        logged ? 'border-[#30363d]' : 'border-[#30363d]/50',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Link href={`/people/${person.id}`} className="flex items-center gap-3 group min-w-0 flex-1">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e6edf3] truncate group-hover:text-[#58a6ff] transition-colors">
              {person.name}
            </p>
            <p className="text-[11px] text-[#6e7681] truncate capitalize">{person.role}</p>
          </div>
        </Link>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-lg font-semibold tabular-nums"
            style={{ color: logged ? (hours >= HOURS_PER_DAY ? '#1D9E75' : '#e6edf3') : '#484f58' }}
          >
            {hours.toFixed(1)}<span className="text-[11px] text-[#6e7681] ml-0.5">h</span>
          </span>
          {logged ? (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#1D9E75]/10 text-[#1D9E75] border border-[#1D9E75]/20">
              <CheckCircle2 className="h-3 w-3" /> logged
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#21262d] text-[#8b949e] border border-[#30363d]">
              not logged
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {logged ? (
        <div className="px-4 pb-4 space-y-3">
          <div className="h-1.5 w-full rounded-sm overflow-hidden flex bg-[#0d1117]">
            {segments.map((s, i) => (
              <div key={i} style={{ width: `${s.widthPct}%`, backgroundColor: s.color }} />
            ))}
          </div>

          {projects.map(p => {
            const notes = p.logs.filter(l => l.work_log && l.work_log.trim() !== '')
            return (
              <div key={p.id} className="rounded-lg border border-[#30363d] bg-[#0d1117]/40 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#58a6ff' }} />
                  <span className="text-sm font-medium text-[#c9d1d9] truncate">{p.name}</span>
                  <span className="ml-auto text-sm tabular-nums text-[#e6edf3] font-medium">{p.hours.toFixed(1)}h</span>
                </div>
                {notes.length > 0 ? (
                  <ul className="space-y-1.5">
                    {notes.map((l, i) => (
                      <li key={i} className="text-xs text-[#8b949e] whitespace-pre-wrap leading-relaxed pl-4 border-l border-[#30363d]">
                        {l.work_log}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-[#484f58] italic pl-4">No work log entered</p>
                )}
              </div>
            )
          })}

          <Link
            href={`/people/${person.id}?date=${date}#edit-log`}
            className="inline-flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#58a6ff] transition-colors"
          >
            <Pencil className="h-3 w-3" /> Edit log
          </Link>
        </div>
      ) : (
        <div className="px-4 pb-4 -mt-1">
          <p className="text-xs text-[#6e7681]">
            No time logged{' · '}
            <Link
              href={`/people/${person.id}?date=${date}#edit-log`}
              className="text-[#8b949e] hover:text-[#58a6ff] transition-colors"
            >
              add an entry
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
