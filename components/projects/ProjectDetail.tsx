'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, daysRemaining } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { Project, Allocation, Person, ProjectStatus } from '@/lib/supabase/types'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { format, addWeeks } from 'date-fns'

const ALL_STATUSES: { value: ProjectStatus; label: string; color: string }[] = [
  { value: 'pipeline',      label: 'Pipeline',      color: 'text-zinc-600' },
  { value: 'active',        label: 'Active',        color: 'text-[#1D9E75]' },
  { value: 'in_production', label: 'In Production', color: 'text-[#378ADD]' },
  { value: 'on_hold',       label: 'On Hold',       color: 'text-[#D4537E]' },
  { value: 'paused',        label: 'Paused',        color: 'text-[#EF9F27]' },
  { value: 'completed',     label: 'Completed',     color: 'text-zinc-400' },
]

const STATUS_NEEDS_START: ProjectStatus[] = ['active', 'in_production']

interface ProjectDetailProps {
  project: Project | null
  open: boolean
  onClose: () => void
}

interface AllocationRow extends Allocation {
  people: Person
}

export function ProjectDetail({ project, open, onClose }: ProjectDetailProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Project>>({})
  const [showAddAlloc, setShowAddAlloc] = useState(false)
  const [allocForm, setAllocForm] = useState({
    person_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(addWeeks(new Date(), 4), 'yyyy-MM-dd'),
    capacity_percent: 100,
    notes: '',
  })

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        client_name: project.client_name,
        status: project.status,
        start_date: project.start_date ?? '',
        target_end_date: project.target_end_date ?? '',
        estimated_weeks: project.estimated_weeks ?? undefined,
        sales_value: project.sales_value ?? 0,
        notes: project.notes ?? '',
        delay_reason: project.delay_reason ?? '',
        actual_end_date: project.actual_end_date ?? '',
      })
      setEditing(false)
    }
  }, [project?.id])

  const { data: allocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['allocations_project', project?.id],
    enabled: !!project?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('*, people(*)')
        .eq('project_id', project!.id)
        .order('start_date', { ascending: true })
      if (error) throw error
      return data as AllocationRow[]
    },
  })

  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data, error } = await supabase.from('people').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data as Person[]
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      const { data, error } = await supabase
        .from('projects').update(updates).eq('id', project!.id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
    },
  })

  const addAllocMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('allocations').insert({
        person_id: allocForm.person_id,
        project_id: project!.id,
        start_date: allocForm.start_date,
        end_date: allocForm.end_date,
        capacity_percent: allocForm.capacity_percent,
        notes: allocForm.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations_project', project?.id] })
      queryClient.invalidateQueries({ queryKey: ['allocations'] })
      setShowAddAlloc(false)
      setAllocForm({ person_id: '', start_date: format(new Date(), 'yyyy-MM-dd'), end_date: format(addWeeks(new Date(), 4), 'yyyy-MM-dd'), capacity_percent: 100, notes: '' })
    },
  })

  const deleteAllocMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('allocations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations_project', project?.id] })
      queryClient.invalidateQueries({ queryKey: ['allocations'] })
    },
  })

  if (!project) return null

  const days = daysRemaining(project.target_end_date)
  const isOverdue = days !== null && days < 0
  const currentStatus = form.status ?? project.status
  const needsStartDate = STATUS_NEEDS_START.includes(currentStatus as ProjectStatus)

  function handleSave() {
    const updates: Partial<Project> = { ...form }
    // Clear empty optional strings
    if (!updates.delay_reason) updates.delay_reason = null
    if (!updates.notes) updates.notes = null
    if (!updates.actual_end_date) updates.actual_end_date = null
    if (!updates.start_date) updates.start_date = null
    if (!updates.target_end_date) updates.target_end_date = null
    updateMutation.mutate(updates)
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  className="w-full text-base font-medium border-b border-zinc-300 focus:outline-none focus:border-zinc-900 bg-transparent pb-0.5"
                  value={form.name ?? ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              ) : (
                <SheetTitle className="text-base font-medium leading-tight">{project.name}</SheetTitle>
              )}
              <p className="text-sm text-zinc-400 mt-0.5">{project.client_name}</p>
            </div>
            <div className="flex-shrink-0">
              {editing ? (
                <select
                  className="text-xs border border-zinc-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  value={form.status ?? project.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as ProjectStatus }))}
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              ) : (
                <StatusBadge status={project.status} />
              )}
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Dates & numbers */}
          <section>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Details</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">

              {/* Start date — always visible, required when going active */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Start date {needsStartDate && editing && <span className="text-[#E24B4A]">*</span>}
                </label>
                {editing ? (
                  <input type="date"
                    className={cn("w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900",
                      needsStartDate && !form.start_date ? 'border-amber-300 bg-amber-50' : 'border-zinc-200')}
                    value={form.start_date ?? ''}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                ) : (
                  <p className="text-sm text-zinc-800">{formatDate(project.start_date)}</p>
                )}
              </div>

              {/* Target end date */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Target end</label>
                {editing ? (
                  <input type="date"
                    className="w-full text-sm border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={form.target_end_date ?? ''}
                    onChange={e => setForm(f => ({ ...f, target_end_date: e.target.value }))} />
                ) : (
                  <p className={cn('text-sm', isOverdue ? 'text-[#E24B4A]' : 'text-zinc-800')}>
                    {formatDate(project.target_end_date)}
                    {days !== null && (
                      <span className="ml-1 text-xs text-zinc-400">
                        ({isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`})
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Deal value */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Deal value</label>
                {editing ? (
                  <input type="number"
                    className="w-full text-sm border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={form.sales_value ?? ''}
                    onChange={e => setForm(f => ({ ...f, sales_value: parseFloat(e.target.value) || 0 }))} />
                ) : (
                  <p className="text-sm font-medium text-zinc-900">{formatINR(project.sales_value)}</p>
                )}
              </div>

              {/* Estimated weeks */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Est. weeks</label>
                {editing ? (
                  <input type="number"
                    className="w-full text-sm border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={form.estimated_weeks ?? ''}
                    onChange={e => setForm(f => ({ ...f, estimated_weeks: parseInt(e.target.value) || undefined }))} />
                ) : (
                  <p className="text-sm text-zinc-800">{project.estimated_weeks ?? '—'}</p>
                )}
              </div>

              {/* Actual end date (when completed) */}
              {(currentStatus === 'completed' || project.actual_end_date) && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Actual end</label>
                  {editing ? (
                    <input type="date"
                      className="w-full text-sm border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      value={form.actual_end_date ?? ''}
                      onChange={e => setForm(f => ({ ...f, actual_end_date: e.target.value }))} />
                  ) : (
                    <p className="text-sm text-zinc-800">{formatDate(project.actual_end_date)}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Delay reason */}
          <section>
            <label className="text-xs text-zinc-400 block mb-1.5">Delay reason</label>
            {editing ? (
              <textarea
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900"
                rows={2}
                value={form.delay_reason ?? ''}
                onChange={e => setForm(f => ({ ...f, delay_reason: e.target.value }))}
                placeholder="Describe any blockers or delays…" />
            ) : project.delay_reason ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                <p className="text-xs text-amber-700">{project.delay_reason}</p>
              </div>
            ) : (
              <p className="text-sm text-zinc-300">None</p>
            )}
          </section>

          {/* Notes */}
          <section>
            <label className="text-xs text-zinc-400 block mb-1.5">Notes</label>
            {editing ? (
              <textarea
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900"
                rows={3}
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            ) : (
              <p className="text-sm text-zinc-600">{project.notes || <span className="text-zinc-300">No notes</span>}</p>
            )}
          </section>

          {/* ── Team allocations ─────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Team & allocations</h3>
              <button
                onClick={() => setShowAddAlloc(v => !v)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Assign person
              </button>
            </div>

            {/* Add allocation inline form */}
            {showAddAlloc && (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Person</label>
                  <select
                    className="w-full text-sm border border-zinc-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={allocForm.person_id}
                    onChange={e => setAllocForm(f => ({ ...f, person_id: e.target.value }))}
                  >
                    <option value="">Select person…</option>
                    {(people ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.role}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Start date</label>
                    <input type="date"
                      className="w-full text-sm border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      value={allocForm.start_date}
                      onChange={e => setAllocForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">End date</label>
                    <input type="date"
                      className="w-full text-sm border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      value={allocForm.end_date}
                      onChange={e => setAllocForm(f => ({ ...f, end_date: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Capacity: {allocForm.capacity_percent}%</label>
                  <input type="range" min={10} max={100} step={10}
                    className="w-full"
                    value={allocForm.capacity_percent}
                    onChange={e => setAllocForm(f => ({ ...f, capacity_percent: parseInt(e.target.value) }))} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm"
                    className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs"
                    onClick={() => addAllocMutation.mutate()}
                    disabled={!allocForm.person_id || addAllocMutation.isPending}>
                    {addAllocMutation.isPending ? 'Saving…' : 'Add'}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowAddAlloc(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Allocation list */}
            {loadingAllocs ? (
              <div className="space-y-2">
                {[1,2].map(i => <div key={i} className="h-10 bg-zinc-100 rounded animate-pulse" />)}
              </div>
            ) : (allocations ?? []).length === 0 ? (
              <p className="text-sm text-zinc-300 py-2">No one assigned yet.</p>
            ) : (
              <div className="space-y-1.5">
                {(allocations ?? []).map((a, i) => (
                  <div key={a.id} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg group',
                    i % 2 === 1 ? 'bg-zinc-50' : 'bg-white border border-zinc-100'
                  )}>
                    {/* Avatar */}
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0"
                      style={{ backgroundColor: a.people?.avatar_color ?? '#1D9E75' }}
                    >
                      {a.people?.avatar_initials ?? a.people?.name?.slice(0, 2).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800">{a.people?.name}</p>
                      <p className="text-xs text-zinc-400">
                        {formatDate(a.start_date, 'dd MMM')} – {formatDate(a.end_date, 'dd MMM')}
                        <span className="mx-1">·</span>
                        <span className={cn('font-medium', a.capacity_percent > 80 ? 'text-[#EF9F27]' : 'text-zinc-500')}>
                          {a.capacity_percent}%
                        </span>
                      </p>
                    </div>
                    {/* Delete */}
                    <button
                      onClick={() => deleteAllocMutation.mutate(a.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-[#E24B4A] transition-all rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-zinc-100 flex-shrink-0 flex gap-2">
          {editing ? (
            <>
              <Button
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
              Edit project
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
