'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Briefcase } from 'lucide-react'
import { getActivePersonAllocations, type AllocationWithDeadline } from '@/lib/queries/time'
import { projectDaysRemaining, formatShortDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils'

interface Props {
  personId: string
}

const FINISHED = new Set(['completed', 'lost'])
const todayIso = () => format(new Date(), 'yyyy-MM-dd')

/** "Your projects" panel on /log — the employee's current + upcoming allocations,
 *  each with the project deadline and how long they're allocated for. */
export function AllocatedProjectsPanel({ personId }: Props) {
  const today = todayIso()

  const { data: allocations, isLoading } = useQuery({
    queryKey: ['log_active_allocations', personId, today],
    queryFn: () => getActivePersonAllocations(personId, today),
  })

  // Drop finished projects; sort by project deadline (soonest first, no-deadline last).
  const sorted = useMemo(() => {
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

  if (isLoading) {
    return <div className="h-28 rounded-xl border border-[#30363d] bg-[#161b22] animate-pulse mb-5" />
  }
  if (sorted.length === 0) return null

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="h-3.5 w-3.5 text-[#58a6ff]" />
        <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">Your projects</h2>
        <span className="text-[11px] text-[#6e7681]">· deadlines</span>
      </div>
      <div className="space-y-2">
        {sorted.map(a => <ProjectDeadlineRow key={a.id} alloc={a} today={today} />)}
      </div>
    </div>
  )
}

function ProjectDeadlineRow({ alloc, today }: { alloc: AllocationWithDeadline; today: string }) {
  const p = alloc.projects
  if (!p) return null

  const days = projectDaysRemaining(p)
  const isOverdue = days !== null && days < 0
  const isAtRisk = days !== null && days >= 0 && days <= 7
  const isUpcoming = alloc.start_date > today

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5">
      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color ?? '#58a6ff' }} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${p.id}`}
            className="text-sm font-medium text-[#e6edf3] truncate hover:text-[#58a6ff] transition-colors"
          >
            {p.name}
          </Link>
          {isUpcoming && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#58a6ff]/15 text-[#58a6ff] border border-[#58a6ff]/25 shrink-0">
              upcoming
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#6e7681] truncate">
          {p.client_name && <>{p.client_name} · </>}
          Allocated until {formatShortDate(alloc.end_date)} · {alloc.capacity_percent}%
        </p>
      </div>

      <div className="text-right shrink-0">
        {p.target_end_date ? (
          <p className="text-xs font-medium text-[#c9d1d9]">Due {formatShortDate(p.target_end_date)}</p>
        ) : (
          <p className="text-xs text-[#3d444d]">No deadline</p>
        )}
        {days !== null && (
          <span className={cn(
            'inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded',
            isOverdue
              ? 'text-[#e24b4a] bg-[#e24b4a]/10'
              : isAtRisk
                ? 'text-[#ef9f27] bg-[#ef9f27]/10'
                : 'text-[#6e7681]'
          )}>
            {isOverdue
              ? `${Math.abs(days)}d overdue`
              : days === 0
                ? 'Due today'
                : `${days}d left`}
          </span>
        )}
      </div>
    </div>
  )
}
