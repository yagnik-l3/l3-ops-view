'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, daysRemaining } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/lib/supabase/types'
import { Plus } from 'lucide-react'

const BOARD_COLUMNS: { status: ProjectStatus; label: string }[] = [
  { status: 'pipeline',      label: 'Pipeline' },
  { status: 'active',        label: 'Active' },
  { status: 'in_production', label: 'In Production' },
  { status: 'on_hold',       label: 'On Hold' },
]

interface ProjectBoardProps {
  onProjectClick?: (project: Project) => void
  compact?: boolean
}

export function ProjectBoard({ onProjectClick, compact = false }: ProjectBoardProps) {
  const supabase = createClient()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Project[]
    },
  })

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map(col => (
          <div key={col.status} className="flex-none w-64 space-y-2">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const columns = compact ? BOARD_COLUMNS.slice(0, 3) : BOARD_COLUMNS

  return (
    <div className={cn('flex gap-4 overflow-x-auto pb-2', compact && 'min-w-0')}>
      {columns.map(col => {
        const colProjects = (projects ?? []).filter(p => p.status === col.status)
        return (
          <div key={col.status} className="flex-none w-64 space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-medium text-zinc-600">{col.label}</span>
              <span className="text-xs text-zinc-400">{colProjects.length}</span>
            </div>
            <div className="space-y-2">
              {colProjects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-200 py-6 text-center">
                  <p className="text-xs text-zinc-400">No projects</p>
                </div>
              ) : (
                colProjects.map(project => {
                  const days = daysRemaining(project.target_end_date)
                  return (
                    <div
                      key={project.id}
                      className="rounded-lg border border-zinc-200 bg-white p-3 cursor-pointer hover:border-zinc-300 hover:shadow-sm transition-all"
                      onClick={() => onProjectClick?.(project)}
                    >
                      <p className="text-sm font-medium text-zinc-800 truncate">{project.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{project.client_name}</p>
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-xs font-medium text-zinc-900">{formatINR(project.sales_value)}</span>
                        {days !== null && (
                          <span className={cn(
                            'text-[10px]',
                            days < 0 ? 'text-[#E24B4A]' : days < 7 ? 'text-[#EF9F27]' : 'text-zinc-400'
                          )}>
                            {days < 0 ? `${Math.abs(days)}d late` : `${days}d left`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
