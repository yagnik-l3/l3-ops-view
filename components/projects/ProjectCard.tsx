'use client'

import { cn } from '@/lib/utils'
import { formatDate, projectDaysRemaining } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'
import type { Project, ProjectStatus } from '@/lib/supabase/types'

// in_production treated as Active in UI
const STATUS_ACCENT: Record<string, string> = {
  pipeline:      '#6e7681',
  active:        '#1d9e75',
  in_production: '#1d9e75',
  completed:     '#3d444d',
  on_hold:       '#d4537e',
  paused:        '#ef9f27',
}

const STATUS_LABEL: Record<string, string> = {
  pipeline:      'Pipeline',
  active:        'Active',
  in_production: 'Active',
  completed:     'Completed',
  on_hold:       'On Hold',
  paused:        'Paused',
}

interface ProjectCardProps {
  project: Project
  onClick: () => void
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const days = projectDaysRemaining(project)
  const isOverdue = days !== null && days < 0
  const isAtRisk = days !== null && days >= 0 && days <= 7
  const accent = STATUS_ACCENT[project.status]

  let progress = 0
  if (project.start_date && project.estimated_weeks) {
    const start = new Date(project.start_date)
    const elapsed = Math.floor((Date.now() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
    progress = Math.min(100, Math.round((elapsed / project.estimated_weeks) * 100))
  }

  return (
    <div
      className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 cursor-pointer transition-all hover:border-[#484f58] hover:bg-[#1c2128] group"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#e6edf3] truncate group-hover:text-white transition-colors">
            {project.name}
          </p>
          <p className="text-xs text-[#6e7681] mt-0.5 truncate">{project.client_name}</p>
        </div>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded shrink-0 mt-0.5"
          style={{ background: `${accent}22`, color: accent }}
        >
          {STATUS_LABEL[project.status]}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs mt-3">
        <span className="text-[#c9d1d9] font-medium">{formatINR(project.sales_value)}</span>
        {days !== null ? (
          <span className={cn(
            'font-medium',
            isOverdue ? 'text-[#e24b4a]' : isAtRisk ? 'text-[#ef9f27]' : 'text-[#6e7681]'
          )}>
            {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
          </span>
        ) : (
          <span className="text-[#3d444d]">No deadline</span>
        )}
      </div>

      {project.start_date && project.estimated_weeks && progress > 0 && (
        <div className="mt-2.5">
          <div className="h-1 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                backgroundColor: isOverdue ? '#e24b4a' : progress > 80 ? '#ef9f27' : '#1d9e75',
              }}
            />
          </div>
          <p className="text-[10px] text-[#6e7681] mt-1">{progress}% time elapsed</p>
        </div>
      )}

      {project.delay_reason && (
        <p className="text-[11px] text-[#ef9f27] mt-2 truncate">⚠ {project.delay_reason}</p>
      )}
    </div>
  )
}
