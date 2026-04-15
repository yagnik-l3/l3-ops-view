'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Project, ProjectStatus } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active:        'bg-[#1D9E75] text-white',
  in_production: 'bg-[#378ADD] text-white',
  pipeline:      'bg-white text-zinc-600 border border-dashed border-zinc-400',
  paused:        'bg-zinc-100 text-zinc-500 border border-dashed border-zinc-300',
  on_hold:       'bg-[#D4537E]/20 text-[#D4537E] border border-dashed border-[#D4537E]/40',
  completed:     'bg-zinc-200 text-zinc-500',
}

interface TimelineBarProps {
  project: Project
  capacityPercent: number
  startCol: number
  spanCols: number
  colWidth: number
  onClick: () => void
}

export function TimelineBar({
  project,
  capacityPercent,
  startCol,
  spanCols,
  colWidth,
  onClick,
}: TimelineBarProps) {
  const left = startCol * colWidth
  const width = spanCols * colWidth - 4 // 4px gap

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          'absolute top-1/2 -translate-y-1/2 h-[26px] rounded-[6px] cursor-pointer',
          'flex items-center px-2 overflow-hidden',
          'transition-opacity hover:opacity-90 select-none',
          STATUS_COLORS[project.status]
        )}
        style={{ left: left + 2, width: Math.max(width, 20) }}
        onClick={onClick}
      >
        <span className="text-[11px] font-medium truncate leading-none">
          {project.name}
        </span>
        {capacityPercent < 100 && width > 60 && (
          <span className="ml-1 text-[10px] opacity-70 flex-shrink-0">
            {capacityPercent}%
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <div className="space-y-1">
          <p className="font-medium text-xs">{project.name}</p>
          <p className="text-xs text-zinc-400">{project.client_name}</p>
          <div className="text-xs text-zinc-500 space-y-0.5">
            <p>Capacity: {capacityPercent}%</p>
            <p>Target: {formatDate(project.target_end_date)}</p>
            <p>Value: {formatINR(project.sales_value)}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
