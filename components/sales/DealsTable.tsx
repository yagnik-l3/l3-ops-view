'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { Deal, DealStatus } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const DEAL_STATUSES: DealStatus[] = ['prospect', 'proposal', 'negotiation', 'closed_won', 'closed_lost']

interface DealsTableProps {
  canEdit: boolean
}

export function DealsTable({ canEdit }: DealsTableProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [filterStatus, setFilterStatus] = useState<DealStatus | 'all'>('all')
  const [form, setForm] = useState({ name: '', client_name: '', value: '', status: 'prospect' as DealStatus, expected_close_date: '' })

  const { data: deals, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deals').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Deal[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('deals').insert({
        name: form.name,
        client_name: form.client_name,
        value: parseFloat(form.value) || 0,
        status: form.status,
        expected_close_date: form.expected_close_date || null,
        closed_by: user?.id,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      setShowAdd(false)
      setForm({ name: '', client_name: '', value: '', status: 'prospect', expected_close_date: '' })
    },
  })

  const filtered = (deals ?? []).filter(d => filterStatus === 'all' || d.status === filterStatus)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {(['all', ...DEAL_STATUSES] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md capitalize transition-colors',
                filterStatus === s
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              )}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" /> Add deal
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 py-12 text-center">
          <p className="text-sm text-zinc-400">No deals found</p>
          {canEdit && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowAdd(true)}>
              Add your first deal
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Deal</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Client</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 hidden sm:table-cell">Value</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 hidden md:table-cell">Close date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((deal, i) => (
                <tr key={deal.id} className={cn('border-b border-zinc-100 last:border-0', i % 2 === 1 && 'bg-zinc-50/50')}>
                  <td className="px-4 py-3 font-medium text-zinc-800 truncate max-w-[160px]">{deal.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{deal.client_name}</td>
                  <td className="px-4 py-3 text-zinc-900 font-medium hidden sm:table-cell">{formatINR(deal.value)}</td>
                  <td className="px-4 py-3"><StatusBadge status={deal.status} type="deal" /></td>
                  <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">
                    {formatDate(deal.actual_close_date ?? deal.expected_close_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Add deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Deal name *</label>
              <input className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Website redesign" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Client *</label>
              <input className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Acme Corp" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Value (₹)</label>
                <input type="number" className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="250000" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Status</label>
                <select className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 bg-white"
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DealStatus }))}>
                  {DEAL_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Expected close date</label>
              <input type="date" className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white"
                onClick={() => createMutation.mutate()}
                disabled={!form.name || !form.client_name || createMutation.isPending}>
                {createMutation.isPending ? 'Adding…' : 'Add deal'}
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
