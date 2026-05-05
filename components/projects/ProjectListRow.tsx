'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatShortDate, projectDaysRemaining } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'
import type { Project } from '@/lib/supabase/types'
import { AlertTriangle, CalendarDays, Clock } from 'lucide-react'

const NOW = Date.now()

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pipeline: { label: 'Pipeline', color: '#6e7681', bg: '#6e768120' },
  active: { label: 'Active', color: '#1d9e75', bg: '#1d9e7520' },
  on_hold: { label: 'On Hold', color: '#d4537e', bg: '#d4537e20' },
  completed: { label: 'Completed', color: '#3d444d', bg: '#3d444d40' },
  paused: { label: 'Paused', color: '#ef9f27', bg: '#ef9f2720' },
  lost: { label: 'Lost', color: '#e24b4a', bg: '#e24b4a20' },
}

interface ProjectListRowProps {
  project: Project
  onClick: () => void
}

export function ProjectListRow({ project, onClick }: ProjectListRowProps) {
  const isLost = project.status === 'lost'
  // Finished projects (lost/completed, or any with actual_end_date) have no living
  // deadline — projectDaysRemaining returns null so overdue/at-risk chips don't render.
  const days = projectDaysRemaining(project)
  const isOverdue = days !== null && days < 0
  const isAtRisk = days !== null && days >= 0 && days <= 7
  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.pipeline
  const accent = isLost ? '#e24b4a' : (project.color ?? status.color)

  const progress = useMemo(() => {
    if (isLost) return null
    let progressValue: number | null = null
    if (project.start_date && project.target_end_date && NOW >= new Date(project.start_date).getTime()) {
      const start = new Date(project.start_date)
      const end = new Date(project.target_end_date)
      const totalWeeks = (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)
      const elapsed = (NOW - start.getTime()) / (7 * 24 * 60 * 60 * 1000)
      progressValue = Math.min(100, Math.round((elapsed / totalWeeks) * 100))
    }
    return progressValue
  }, [isLost, project.start_date, project.target_end_date])

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center gap-4 px-4 py-3.5 bg-[#161b22] border border-[#30363d] rounded-lg cursor-pointer hover:border-[#484f58] hover:bg-[#1c2128] transition-all',
        isLost && 'opacity-65 hover:opacity-90',
      )}
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      {/* ── Project name + client ─────────────────────────── */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'text-sm font-medium text-[#e6edf3] group-hover:text-white transition-colors truncate',
              isLost && 'line-through decoration-[#e24b4a]/60 decoration-[1.5px] text-[#8b949e]',
            )}
          >
            {project.name}
          </span>
          {/* Delay-reason flag is irrelevant for lost projects */}
          {!isLost && project.delay_reason && (
            <span className="flex items-center gap-1 text-[11px] text-[#ef9f27] shrink-0">
              <AlertTriangle className="h-3 w-3" />
              {project.delay_reason}
            </span>
          )}
        </div>
        <p className="text-xs text-[#6e7681] mt-0.5">{project.client_name}</p>
      </div>

      {/* ── Date range / Lost reason ──────────────────────── */}
      <div className="hidden md:flex flex-col items-start gap-0.5 w-36 shrink-0">
        {isLost ? (
          project.lost_reason ? (
            <span className="text-xs text-[#e24b4a]/80 line-clamp-2 italic">"{project.lost_reason}"</span>
          ) : (
            <span className="text-xs text-[#484f58] italic">No reason recorded</span>
          )
        ) : (project.start_date || project.target_end_date) ? (
          <>
            <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span>
                {project.start_date ? formatShortDate(project.start_date) : '—'}
                {' → '}
                {project.target_end_date ? formatShortDate(project.target_end_date) : '—'}
              </span>
            </div>
            {project.estimated_weeks && (
              <div className="flex items-center gap-1.5 text-[11px] text-[#3d444d]">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{project.estimated_weeks}w estimated</span>
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-[#3d444d]">No dates set</span>
        )}
      </div>

      {/* ── Progress bar — hidden for lost projects ──────── */}
      <div className="hidden lg:flex flex-col gap-1 w-28 shrink-0">
        {isLost ? null : progress !== null ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#6e7681]">Progress</span>
              <span className={cn(
                'text-[11px] font-medium',
                isOverdue ? 'text-[#e24b4a]' : progress > 80 ? 'text-[#ef9f27]' : 'text-[#6e7681]'
              )}>
                {progress}%
              </span>
            </div>
            <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progress}%`,
                  backgroundColor: isOverdue ? '#e24b4a' : progress > 80 ? '#ef9f27' : '#1d9e75',
                }}
              />
            </div>
          </>
        ) : (
          <span className="text-[11px] text-[#3d444d]">No progress data</span>
        )}
      </div>

      {/* ── Status badge ─────────────────────────────────── */}
      <div className="shrink-0 w-20">
        <span
          className="inline-block text-[11px] font-medium px-2 py-0.5 rounded"
          style={{ color: status.color, background: status.bg }}
        >
          {status.label}
        </span>
      </div>

      {/* ── Deal value ───────────────────────────────────── */}
      <div className="hidden sm:block w-24 shrink-0 text-right">
        <span
          className={cn(
            'text-sm font-medium text-[#c9d1d9]',
            isLost && 'line-through decoration-[#e24b4a]/60 text-[#8b949e]',
          )}
        >
          {project.sales_value ? formatINR(project.sales_value) : '—'}
        </span>
      </div>

      {/* ── Deadline chip — suppressed for lost projects ── */}
      <div className="shrink-0 w-24 text-right">
        {isLost ? (
          <span className="text-xs text-[#484f58] italic">—</span>
        ) : days === null ? (
          <span className="text-xs text-[#3d444d]">No deadline</span>
        ) : isOverdue ? (
          <span className="text-xs font-medium text-[#e24b4a] bg-[#e24b4a]/10 px-2 py-0.5 rounded">
            {Math.abs(days)}d overdue
          </span>
        ) : isAtRisk ? (
          <span className="text-xs font-medium text-[#ef9f27] bg-[#ef9f27]/10 px-2 py-0.5 rounded">
            {days}d left
          </span>
        ) : (
          <span className="text-xs text-[#6e7681]">{days}d left</span>
        )}
      </div>
    </div>
  )
}
