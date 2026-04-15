'use client'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  loading?: boolean
  className?: string
  accent?: 'default' | 'teal' | 'amber' | 'red'
}

const accentMap = {
  default: 'text-zinc-900',
  teal:    'text-[#1D9E75]',
  amber:   'text-[#EF9F27]',
  red:     'text-[#E24B4A]',
}

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendValue,
  loading,
  className,
  accent = 'default',
}: MetricCardProps) {
  if (loading) {
    return (
      <div className={cn('rounded-lg border border-zinc-200 bg-white p-6', className)}>
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-zinc-200 bg-white p-6', className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-zinc-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-zinc-400" />}
      </div>
      <p className={cn('mt-2 text-2xl font-500 tracking-tight', accentMap[accent])}>
        {value}
      </p>
      {(sub || trendValue) && (
        <p className="mt-1 text-xs text-zinc-400">
          {trendValue && (
            <span
              className={cn(
                'mr-1',
                trend === 'up' && 'text-[#1D9E75]',
                trend === 'down' && 'text-[#E24B4A]'
              )}
            >
              {trendValue}
            </span>
          )}
          {sub}
        </p>
      )}
    </div>
  )
}
