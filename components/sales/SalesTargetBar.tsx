'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatINR } from '@/lib/utils/currency'
import { formatMonthYear } from '@/lib/utils/date'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export function SalesTargetBar() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: target, isLoading } = useQuery({
    queryKey: ['sales_target_current'],
    queryFn: async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const { data } = await supabase.from('sales_targets').select('*').eq('month', monthStart).single()
      return data as import('@/lib/supabase/types').SalesTarget | null
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  if (!target) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 py-8 text-center">
        <p className="text-sm text-zinc-400">No target set for this month</p>
        <p className="text-xs text-zinc-300 mt-1">Add a sales target to track progress</p>
      </div>
    )
  }

  const pct = target.target_amount > 0
    ? Math.min(100, Math.round((target.achieved_amount / target.target_amount) * 100))
    : 0
  const color = pct >= 100 ? '#1D9E75' : pct >= 60 ? '#EF9F27' : '#E24B4A'

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-zinc-400 mb-0.5">{formatMonthYear(target.month)}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-medium text-zinc-900">{pct}%</span>
            <span className="text-sm text-zinc-400">of target</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-400">Achieved</p>
          <p className="text-lg font-medium text-zinc-900">{formatINR(target.achieved_amount)}</p>
          <p className="text-xs text-zinc-400">of {formatINR(target.target_amount)}</p>
        </div>
      </div>

      <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      {pct < 100 && (
        <p className="text-xs text-zinc-400">
          {formatINR(target.target_amount - target.achieved_amount)} remaining to hit target
        </p>
      )}
      {pct >= 100 && (
        <p className="text-xs text-[#1D9E75] font-medium">
          Target achieved! {formatINR(target.achieved_amount - target.target_amount)} over target.
        </p>
      )}
    </div>
  )
}
