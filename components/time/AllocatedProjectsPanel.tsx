'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Briefcase, AlertTriangle, CalendarClock } from 'lucide-react'
import { getActivePersonAllocations, type AllocationWithDeadline } from '@/lib/queries/time'
import { projectDaysRemaining, formatShortDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils'

interface Props {
  personId: string
}

const FINISHED = new Set(['completed', 'lost'])
const todayIso = () => format(new Date(), 'yyyy-MM-dd')

type Urgency = 'overdue' | 'critical' | 'warn' | 'ok' | 'none'

function urgencyOf(days: number | null): Urgency {
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days <= 3) return 'critical'
  if (days <= 7) return 'warn'
  return 'ok'
}

const URGENCY_COLOR: Record<Urgency, string> = {
  overdue:  '#e24b4a',
  critical: '#e24b4a',
  warn:     '#ef9f27',
  ok:       '#1d9e75',
  none:     '#6e7681',
}

/** "Your projects" panel on /log — a stack of project cards sorted by urgency.
 *  No outer container; each card stands alone. The card body answers: what is
 *  this project, how soon is it due, and how much of my time is on it. */
export function AllocatedProjectsPanel({ personId }: Props) {
  const today = todayIso()

  const { data: allocations, isLoading } = useQuery({
    queryKey: ['log_active_allocations', personId, today],
    queryFn: () => getActivePersonAllocations(personId, today),
  })

  const live = useMemo(() => {
    return (allocations ?? [])
      .filter(a => a.projects && !FINISHED.has(a.projects.status))
      .sort((a, b) => {
        const da = a.projects?.target_end_date ?? null
        const db = b.projects?.target_end_date ?? null
        if (da && db) return da.localeCompare(db)
        if (da) return -1
        if (db) return 1
        return 0
      })
  }, [allocations])

  const overdueCount = live.filter(a =>
    a.projects?.target_end_date && urgencyOf(projectDaysRemaining(a.projects)) === 'overdue'
  ).length
  const urgentCount = live.filter(a => {
    const u = a.projects?.target_end_date ? urgencyOf(projectDaysRemaining(a.projects)) : 'none'
    return u === 'overdue' || u === 'critical' || u === 'warn'
  }).length

  if (isLoading) {
    return (
      <div className="mb-5 space-y-2">
        <div className="h-4 w-32 bg-[#161b22] rounded animate-pulse" />
        <div className="h-20 rounded-lg bg-[#161b22] animate-pulse" />
        <div className="h-20 rounded-lg bg-[#161b22] animate-pulse" />
      </div>
    )
  }
  if (live.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="h-3.5 w-3.5 text-[#58a6ff]" />
        <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">
          Your projects
        </h2>
        <span className="text-[11px] text-[#6e7681]">· {live.length}</span>
        {urgentCount > 0 && (
          <span
            className={cn(
              'ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
              overdueCount > 0
                ? 'text-[#e24b4a] bg-[#e24b4a]/12'
                : 'text-[#ef9f27] bg-[#ef9f27]/12'
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            {overdueCount > 0 ? `${overdueCount} overdue` : `${urgentCount} due soon`}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {live.map(a => <ProjectCard key={a.id} alloc={a} today={today} />)}
      </div>
    </section>
  )
}

function ProjectCard({ alloc, today }: { alloc: AllocationWithDeadline; today: string }) {
  const p = alloc.projects
  if (!p) return null

  const hasDeadline = !!p.target_end_date
  const days = hasDeadline ? projectDaysRemaining(p) : null
  const urg = hasDeadline ? urgencyOf(days) : 'none'
  const isUpcoming = alloc.start_date > today
  const projectColor = p.color ?? '#58a6ff'
  const urgencyColor = URGENCY_COLOR[urg]

  // Card border tints with urgency so the eye lands on hot ones first.
  const borderClass =
    urg === 'overdue' || urg === 'critical'
      ? 'border-[#e24b4a]/45'
      : urg === 'warn'
        ? 'border-[#ef9f27]/40'
        : 'border-[#30363d]'

  const countNum   = days === null ? null : Math.abs(days)
  const countLabel = urg === 'overdue' ? 'overdue' : days === 0 ? 'today' : 'left'

  const cap = alloc.capacity_percent ?? 0

  return (
    <Link
      href={`/projects/${p.id}`}
      className={cn(
        'group block rounded-lg border bg-[#161b22] hover:bg-[#1c2128] transition-colors',
        borderClass
      )}
    >
      <div className="flex items-stretch">
        {/* Color stripe — project's own color, full-height of card */}
        <div
          className="w-1 rounded-l-lg shrink-0"
          style={{ background: projectColor }}
        />

        <div className="flex-1 min-w-0 px-4 py-3">
          {/* Top row: name + days */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#e6edf3] truncate group-hover:text-[#58a6ff] transition-colors">
                {p.name}
              </p>
              {p.client_name && (
                <p className="text-[11px] text-[#6e7681] truncate mt-0.5">{p.client_name}</p>
              )}
            </div>

            {hasDeadline && countNum !== null ? (
              <div className="text-right shrink-0 leading-none">
                <p
                  className="text-2xl font-extrabold tabular-nums"
                  style={{ color: urgencyColor }}
                >
                  {countNum}
                  <span className="text-xs font-bold ml-0.5">d</span>
                </p>
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.14em] mt-1"
                  style={{ color: urgencyColor }}
                >
                  {countLabel}
                </p>
              </div>
            ) : (
              <div className="text-right shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#6e7681]">
                  <CalendarClock className="h-3 w-3" />
                  No deadline
                </span>
              </div>
            )}
          </div>

          {/* Bottom row: capacity bar + meta */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 h-1.5 rounded-full bg-[#21262d] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(cap, 100)}%`,
                  background: projectColor,
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-[#8b949e] shrink-0">
              {cap}% capacity
            </span>
            {hasDeadline && (
              <span className="text-[10px] text-[#6e7681] shrink-0">
                Due {formatShortDate(p.target_end_date)}
              </span>
            )}
            {isUpcoming && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#58a6ff] shrink-0">
                Upcoming
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
