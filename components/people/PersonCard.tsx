'use client'

import { cn } from '@/lib/utils'
import { generateWeekColumns, calculateWeeklyLoad, getPersonFreeDate } from '@/lib/utils/timeline'
import type { Person, Allocation, Project } from '@/lib/supabase/types'
import { format } from 'date-fns'

interface PersonCardProps {
  person: Person
  allocations: (Allocation & { projects: Project })[]
  onClick: () => void
}

export function PersonCard({ person, allocations, onClick }: PersonCardProps) {
  const weeks = generateWeekColumns(1)
  const thisWeekLoad = calculateWeeklyLoad(allocations, weeks)[0] ?? 0
  const freeFrom = getPersonFreeDate(allocations)
  const isFree = !freeFrom || freeFrom <= new Date()

  const activeAllocs = allocations.filter(a =>
    ['active', 'in_production', 'pipeline'].includes(a.projects?.status ?? '')
  )

  const loadColor = thisWeekLoad > 100
    ? '#e24b4a'
    : thisWeekLoad > 80
    ? '#ef9f27'
    : '#1d9e75'

  return (
    <div
      className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 cursor-pointer hover:border-[#484f58] hover:bg-[#1c2128] transition-all group"
      onClick={onClick}
    >
      {/* Top: avatar + name + free status */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0"
          style={{ backgroundColor: person.avatar_color ?? '#1d9e75' }}
        >
          {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[#e6edf3] truncate group-hover:text-white transition-colors">
            {person.name}
          </p>
          <p className="text-xs text-[#6e7681] capitalize mt-0.5">
            {person.role}
            {person.default_hourly_rate != null && (
              <span className="ml-1.5 text-[#484f58]">₹{person.default_hourly_rate}/h</span>
            )}
          </p>
        </div>
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full border shrink-0 mt-0.5',
          isFree
            ? 'bg-[#1d9e75]/10 text-[#1d9e75] border-[#1d9e75]/20'
            : 'bg-[#21262d] text-[#8b949e] border-[#30363d]'
        )}>
          {isFree ? 'Available' : `Free ${format(freeFrom!, 'dd MMM')}`}
        </span>
      </div>

      {/* Capacity bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-[#6e7681]">This week</span>
          <span className="text-xs font-medium" style={{ color: loadColor }}>
            {thisWeekLoad}%
          </span>
        </div>
        <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, thisWeekLoad)}%`,
              backgroundColor: loadColor,
            }}
          />
        </div>
        {thisWeekLoad > 100 && (
          <p className="text-[10px] text-[#e24b4a] mt-1">Overallocated by {thisWeekLoad - 100}%</p>
        )}
      </div>

      {/* Current projects */}
      {activeAllocs.length > 0 ? (
        <div className="space-y-1.5 border-t border-[#21262d] pt-3">
          <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-2">Current work</p>
          {activeAllocs.slice(0, 3).map(a => {
            const accent =
              a.projects?.status === 'active' ? '#1d9e75' :
              a.projects?.status === 'in_production' ? '#378add' : '#6e7681'
            return (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <p className="text-xs text-[#c9d1d9] truncate">{a.projects?.name}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-[#6e7681]">{a.capacity_percent}%</span>
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                </div>
              </div>
            )
          })}
          {activeAllocs.length > 3 && (
            <p className="text-[10px] text-[#6e7681] mt-1">+{activeAllocs.length - 3} more</p>
          )}
        </div>
      ) : (
        <div className="border-t border-[#21262d] pt-3">
          <p className="text-xs text-[#6e7681]">No active projects</p>
        </div>
      )}
    </div>
  )
}
