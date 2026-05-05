'use client'

import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/lib/supabase/types'

// in_production is kept in DB but treated as Active in the UI
const CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pipeline:      { label: 'Pipeline',  bg: '#21262d',   color: '#8b949e' },
  active:        { label: 'Active',    bg: '#1d9e7522', color: '#1d9e75' },
  in_production: { label: 'Active',    bg: '#1d9e7522', color: '#1d9e75' },
  completed:     { label: 'Completed', bg: '#21262d',   color: '#6e7681' },
  on_hold:       { label: 'On Hold',   bg: '#d4537e22', color: '#d4537e' },
  paused:        { label: 'Paused',    bg: '#ef9f2722', color: '#ef9f27' },
  lost:          { label: 'Lost',      bg: '#e24b4a22', color: '#e24b4a' },
}

interface StatusBadgeProps {
  status: ProjectStatus | string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = CONFIG[status as string]
  if (!cfg) return null

  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap', className)}
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}
