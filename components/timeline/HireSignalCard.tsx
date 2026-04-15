'use client'

import { AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import type { HireSignal } from '@/lib/utils/timeline'

interface HireSignalCardProps {
  signal: HireSignal
}

export function HireSignalCard({ signal }: HireSignalCardProps) {
  const roleLabel = signal.role === 'developer' ? 'Developer' : 'Designer'

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-[#EF9F27] mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-zinc-800">
          Consider hiring a {roleLabel}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {roleLabel} team is at {signal.avgUtilization}% avg capacity from{' '}
          <span className="font-medium">{format(signal.fromWeek, 'dd MMM')}</span>
          {' '}to{' '}
          <span className="font-medium">{format(signal.toWeek, 'dd MMM')}</span>
          {' '}({signal.weekCount} consecutive weeks)
        </p>
      </div>
    </div>
  )
}
