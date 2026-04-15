'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatINR } from '@/lib/utils/currency'
import { formatMonthYear, formatDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils'
import type { SalesTarget, Project } from '@/lib/supabase/types'
import { Target, TrendingUp, CheckCircle2 } from 'lucide-react'

export default function SalesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [showTargetDialog, setShowTargetDialog] = useState(false)
  const [targetForm, setTargetForm] = useState({ target_amount: '', achieved_amount: '', notes: '' })

  const { data: targets, isLoading: loadingTargets } = useQuery({
    queryKey: ['sales_targets_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_targets')
        .select('*')
        .order('month', { ascending: false })
        .limit(6)
      if (error) throw error
      return data as SalesTarget[]
    },
  })

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Project[]
    },
  })

  const currentTarget = targets?.[0] ?? null
  const pct = currentTarget && currentTarget.target_amount > 0
    ? Math.min(100, Math.round((currentTarget.achieved_amount / currentTarget.target_amount) * 100))
    : 0
  const barColor = pct >= 100 ? '#1D9E75' : pct >= 60 ? '#EF9F27' : '#E24B4A'

  // Won = completed projects this calendar year
  const thisYear = new Date().getFullYear()
  const wonProjects = (projects ?? []).filter(p => p.status === 'completed')
  const wonValue = wonProjects.reduce((s, p) => s + (p.sales_value ?? 0), 0)

  // Active pipeline
  const activeValue = (projects ?? [])
    .filter(p => ['pipeline', 'active', 'in_production'].includes(p.status))
    .reduce((s, p) => s + (p.sales_value ?? 0), 0)

  const setTargetMutation = useMutation({
    mutationFn: async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const { error } = await supabase.from('sales_targets').upsert({
        month: monthStart,
        target_amount: parseFloat(targetForm.target_amount) || 0,
        achieved_amount: parseFloat(targetForm.achieved_amount) || 0,
        notes: targetForm.notes || null,
      }, { onConflict: 'month' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_targets_all'] })
      queryClient.invalidateQueries({ queryKey: ['sales_target_current'] })
      setShowTargetDialog(false)
      setTargetForm({ target_amount: '', achieved_amount: '', notes: '' })
    },
  })

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-zinc-900">Sales</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Monthly targets and project revenue</p>
        </div>
        <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5" onClick={() => {
          setTargetForm({
            target_amount: currentTarget?.target_amount?.toString() ?? '',
            achieved_amount: currentTarget?.achieved_amount?.toString() ?? '',
            notes: currentTarget?.notes ?? '',
          })
          setShowTargetDialog(true)
        }}>
          <Target className="h-3.5 w-3.5" />
          {currentTarget ? 'Update target' : 'Set target'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-400 mb-2">This month's target</p>
          <p className={cn('text-2xl font-medium', pct >= 100 ? 'text-[#1D9E75]' : 'text-zinc-900')}>{pct}%</p>
          <p className="text-xs text-zinc-400 mt-1">
            {formatINR(currentTarget?.achieved_amount)} of {formatINR(currentTarget?.target_amount)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-400 mb-2">Won (completed projects)</p>
          <p className="text-2xl font-medium text-[#1D9E75]">{formatINR(wonValue)}</p>
          <p className="text-xs text-zinc-400 mt-1">{wonProjects.length} project{wonProjects.length !== 1 ? 's' : ''} completed</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-400 mb-2">Active pipeline value</p>
          <p className="text-2xl font-medium text-zinc-900">{formatINR(activeValue)}</p>
          <p className="text-xs text-zinc-400 mt-1">
            {(projects ?? []).filter(p => ['pipeline','active','in_production'].includes(p.status)).length} projects in progress
          </p>
        </div>
      </div>

      {/* Current month progress */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-medium text-zinc-700">
          {currentTarget ? formatMonthYear(currentTarget.month) : 'Current month'} progress
        </h2>
        {loadingTargets ? (
          <Skeleton className="h-4 w-full rounded-full" />
        ) : currentTarget ? (
          <>
            <div className="flex items-end justify-between mb-1">
              <span className="text-3xl font-medium text-zinc-900">{pct}%</span>
              <span className="text-sm text-zinc-400">{formatINR(currentTarget.target_amount - currentTarget.achieved_amount)} remaining</span>
            </div>
            <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </div>
            <div className="flex justify-between text-xs text-zinc-400 pt-1">
              <span className="text-zinc-700 font-medium">{formatINR(currentTarget.achieved_amount)} achieved</span>
              <span>Target: {formatINR(currentTarget.target_amount)}</span>
            </div>
            {currentTarget.notes && (
              <p className="text-xs text-zinc-500 border-t border-zinc-100 pt-3">{currentTarget.notes}</p>
            )}
          </>
        ) : (
          <div className="py-6 text-center border border-dashed border-zinc-200 rounded-lg">
            <p className="text-sm text-zinc-400">No target set for this month</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowTargetDialog(true)}>
              Set target
            </Button>
          </div>
        )}
      </div>

      {/* Monthly history */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-700 mb-4">Monthly history</h2>
        {loadingTargets ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (targets ?? []).length === 0 ? (
          <p className="text-sm text-zinc-400">No history yet.</p>
        ) : (
          <div className="space-y-3">
            {(targets ?? []).map(t => {
              const p = t.target_amount > 0 ? Math.min(100, Math.round((t.achieved_amount / t.target_amount) * 100)) : 0
              const c = p >= 100 ? '#1D9E75' : p >= 60 ? '#EF9F27' : '#E24B4A'
              return (
                <div key={t.id} className="flex items-center gap-4">
                  <span className="text-xs text-zinc-500 w-20 flex-shrink-0">{formatMonthYear(t.month)}</span>
                  <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: c }} />
                  </div>
                  <span className="text-xs font-medium text-zinc-700 w-10 text-right">{p}%</span>
                  <span className="text-xs text-zinc-400 w-24 text-right hidden sm:block">{formatINR(t.achieved_amount)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Won / completed projects */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-700 mb-4">Completed projects</h2>
        {loadingProjects ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : wonProjects.length === 0 ? (
          <p className="text-sm text-zinc-400">No completed projects yet.</p>
        ) : (
          <div className="space-y-1">
            {wonProjects.map((p, i) => (
              <div key={p.id} className={cn('flex items-center gap-4 px-3 py-2.5 rounded-lg', i % 2 === 1 && 'bg-zinc-50')}>
                <CheckCircle2 className="h-4 w-4 text-[#1D9E75] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">{p.name}</p>
                  <p className="text-xs text-zinc-400">{p.client_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-zinc-900">{formatINR(p.sales_value)}</p>
                  {p.actual_end_date && <p className="text-xs text-zinc-400">{formatDate(p.actual_end_date)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Set/update target dialog */}
      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              {currentTarget ? 'Update this month\'s target' : 'Set this month\'s target'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Target amount (₹)</label>
              <input type="number" className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={targetForm.target_amount}
                onChange={e => setTargetForm(f => ({ ...f, target_amount: e.target.value }))}
                placeholder="1000000" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Achieved so far (₹)</label>
              <input type="number" className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={targetForm.achieved_amount}
                onChange={e => setTargetForm(f => ({ ...f, achieved_amount: e.target.value }))}
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Notes (optional)</label>
              <input className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={targetForm.notes}
                onChange={e => setTargetForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any context…" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white"
                onClick={() => setTargetMutation.mutate()}
                disabled={!targetForm.target_amount || setTargetMutation.isPending}>
                {setTargetMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => setShowTargetDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
