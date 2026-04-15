'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatINR } from '@/lib/utils/currency'
import { Skeleton } from '@/components/ui/skeleton'
import type { Deal, SalesTarget } from '@/lib/supabase/types'

export function SalesSnapshot() {
  const supabase = createClient()

  const { data: target, isLoading: loadingTarget } = useQuery({
    queryKey: ['sales_target_current'],
    queryFn: async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString().split('T')[0]
      const { data } = await supabase
        .from('sales_targets')
        .select('*')
        .eq('month', monthStart)
        .single()
      return data as SalesTarget | null
    },
  })

  const { data: deals, isLoading: loadingDeals } = useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deals').select('*')
      if (error) throw error
      return data as Deal[]
    },
  })

  if (loadingTarget || loadingDeals) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  const pct = target
    ? Math.min(100, Math.round((target.achieved_amount / target.target_amount) * 100))
    : 0

  const pipelineValue = (deals ?? [])
    .filter(d => ['prospect', 'proposal', 'negotiation'].includes(d.status))
    .reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">Monthly target</span>
        <span className="text-sm text-zinc-900 font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 100 ? '#1D9E75' : pct >= 60 ? '#EF9F27' : '#E24B4A',
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{formatINR(target?.achieved_amount)} achieved</span>
        <span>of {formatINR(target?.target_amount)}</span>
      </div>
      <div className="pt-2 border-t border-zinc-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">Open pipeline</span>
          <span className="text-sm font-medium text-zinc-900">{formatINR(pipelineValue)}</span>
        </div>
      </div>
    </div>
  )
}
