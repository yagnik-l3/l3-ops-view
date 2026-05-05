'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatDate, projectDaysRemaining } from '@/lib/utils/date'
import { formatINR, formatINRFull } from '@/lib/utils/currency'
import {
  workingDays, workingHours, allocationCost, allocationSalaryCost,
  effectiveHourlyRate, formatCost,
} from '@/lib/utils/cost'
import type { Project, Allocation, Person, ProjectStatus, Transaction } from '@/lib/supabase/types'
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, TrendingUp, TrendingDown, AlertTriangle, Receipt } from 'lucide-react'
import { format, addWeeks, parseISO } from 'date-fns'
import { AddTransactionDialog } from '@/components/finance/AddTransactionDialog'

const PALETTE = [
  '#1d9e75', '#378add', '#8b5cf6', '#ef9f27', '#ec4899',
  '#06b6d4', '#f97316', '#d4537e', '#84cc16', '#a855f7', '#14b8a6', '#e24b4a',
]

type AllocWithPerson = Allocation & { people: Person }

const ALL_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'pipeline',  label: 'Pipeline' },
  { value: 'active',    label: 'Active' },
  { value: 'on_hold',   label: 'On Hold' },
  { value: 'paused',    label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'lost',      label: 'Lost' },
]

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  active:        { bg: '#1d9e7522', text: '#1d9e75' },
  in_production: { bg: '#1d9e7522', text: '#1d9e75' }, // legacy — treat as active
  pipeline:      { bg: '#21262d',   text: '#8b949e' },
  paused:        { bg: '#ef9f2722', text: '#ef9f27' },
  on_hold:       { bg: '#d4537e22', text: '#d4537e' },
  completed:     { bg: '#21262d',   text: '#6e7681' },
  lost:          { bg: '#e24b4a22', text: '#e24b4a' },
}

const STATUS_NEEDS_START: ProjectStatus[] = ['active']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[#6e7681] mb-1">{label}</p>
      {children}
    </div>
  )
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Project>>({})
  const [showAddAlloc, setShowAddAlloc] = useState<string | boolean>(false) // string = pre-fill person_id
  const [editingAllocId, setEditingAllocId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRecordCollection, setShowRecordCollection] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [editAllocForm, setEditAllocForm] = useState({
    capacity_percent: 100,
    hourly_rate: '',
    start_date: '',
    end_date: '',
  })
  const [allocForm, setAllocForm] = useState({
    person_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(addWeeks(new Date(), 4), 'yyyy-MM-dd'),
    capacity_percent: 100,
    hourly_rate: '',
    notes: '',
  })

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
      if (error) throw error
      return data as Project
    },
  })

  const { data: allocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['allocations_project_page', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('*, people(*)')
        .eq('project_id', id)
        .order('start_date', { ascending: true })
      if (error) throw error
      return data as AllocWithPerson[]
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

  const { data: projectCollections } = useQuery({
    queryKey: ['project_collections', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('project_id', id)
        .eq('type', 'collection')
        .order('date', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    },
  })

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        client_name: project.client_name,
        status: project.status,
        color: project.color ?? '',
        start_date: project.start_date ?? '',
        target_end_date: project.target_end_date ?? '',
        estimated_weeks: project.estimated_weeks ?? undefined,
        sales_value: project.sales_value ?? 0,
        notes: project.notes ?? '',
        delay_reason: project.delay_reason ?? '',
        lost_reason: project.lost_reason ?? '',
        actual_end_date: project.actual_end_date ?? '',
      })
    }
  }, [project?.id])

  // Auto-calculate estimated_weeks from dates whenever either date changes in edit mode
  useEffect(() => {
    if (!editing) return
    const start = form.start_date
    const end = form.target_end_date
    if (!start || !end) return
    const [sy, sm, sd] = (start as string).split('-').map(Number)
    const [ey, em, ed] = (end as string).split('-').map(Number)
    if (!sy || !sm || !sd || !ey || !em || !ed) return
    const diffDays = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000)
    setForm(f => ({
      ...f,
      estimated_weeks: diffDays > 0 ? Math.max(1, Math.round(diffDays / 7)) : undefined,
    }))
  }, [editing, form.start_date, form.target_end_date])

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      const { data, error } = await supabase
        .from('projects').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
    },
  })

  const addAllocMutation = useMutation({
    mutationFn: async () => {
      const person = (people ?? []).find(p => p.id === allocForm.person_id)
      const { error } = await supabase.from('allocations').insert({
        person_id: allocForm.person_id,
        project_id: id,
        start_date: allocForm.start_date,
        end_date: allocForm.end_date,
        capacity_percent: allocForm.capacity_percent,
        hourly_rate: allocForm.hourly_rate ? parseFloat(allocForm.hourly_rate) : null,
        monthly_salary: person?.monthly_salary ?? null,
        notes: allocForm.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations_project_page', id] })
      queryClient.invalidateQueries({ queryKey: ['allocations'] })
      setShowAddAlloc(false)
      setAllocForm({
        person_id: '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(addWeeks(new Date(), 4), 'yyyy-MM-dd'),
        capacity_percent: 100,
        hourly_rate: '',
        notes: '',
      })
    },
  })

  const deleteAllocMutation = useMutation({
    mutationFn: async (allocId: string) => {
      const { error } = await supabase.from('allocations').delete().eq('id', allocId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations_project_page', id] })
      queryClient.invalidateQueries({ queryKey: ['allocations'] })
    },
  })

  const updateAllocMutation = useMutation({
    mutationFn: async (allocId: string) => {
      const { error } = await supabase.from('allocations').update({
        capacity_percent: editAllocForm.capacity_percent,
        hourly_rate: editAllocForm.hourly_rate ? parseFloat(editAllocForm.hourly_rate) : null,
        start_date: editAllocForm.start_date,
        end_date: editAllocForm.end_date,
      }).eq('id', allocId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations_project_page', id] })
      queryClient.invalidateQueries({ queryKey: ['allocations'] })
      setEditingAllocId(null)
    },
  })

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['allocations'] })
      router.push('/projects')
    },
  })

  // Total current-week capacity per person across ALL projects (for overallocation warning)
  const personIds = [...new Set((allocations ?? []).map(a => a.person_id))]
  const { data: crossProjectLoad } = useQuery({
    queryKey: ['cross_project_load', ...personIds],
    queryFn: async () => {
      if (!personIds.length) return {} as Record<string, number>
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('allocations')
        .select('person_id, capacity_percent, start_date, end_date')
        .in('person_id', personIds)
        .lte('start_date', today)
        .gte('end_date', today)
      if (error) throw error
      const result: Record<string, number> = {}
      for (const a of data) {
        result[a.person_id] = (result[a.person_id] ?? 0) + a.capacity_percent
      }
      return result
    },
    enabled: personIds.length > 0,
  })

  function handleSave() {
    const updates: Partial<Project> = { ...form }
    if (!updates.delay_reason) updates.delay_reason = null
    if (!updates.notes) updates.notes = null
    if (!updates.actual_end_date) updates.actual_end_date = null
    if (!updates.start_date) updates.start_date = null
    if (!updates.target_end_date) updates.target_end_date = null
    if (!updates.color) updates.color = null

    // Status transitions to/from 'lost' carry side effects: capture or
    // clear lost_reason and lost_at so the Finance "Work Lost" view can
    // scope to the month the loss happened in.
    const wasLost = project?.status === 'lost'
    const isLost = updates.status === 'lost'
    if (!isLost) {
      updates.lost_reason = null
      updates.lost_at = null
    } else {
      if (!updates.lost_reason) updates.lost_reason = null
      // Stamp lost_at only on the transition into lost; preserve the
      // original timestamp on subsequent edits while the project stays lost.
      if (!wasLost) updates.lost_at = new Date().toISOString()
    }
    updateMutation.mutate(updates)
  }

  function onPersonChange(personId: string) {
    const p = (people ?? []).find(x => x.id === personId)
    setAllocForm(f => ({
      ...f,
      person_id: personId,
      hourly_rate: p?.default_hourly_rate != null ? String(p.default_hourly_rate) : '',
    }))
  }

  function openAddPeriod(personId: string) {
    const p = (people ?? []).find(x => x.id === personId)
    setAllocForm({
      person_id: personId,
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(addWeeks(new Date(), 4), 'yyyy-MM-dd'),
      capacity_percent: 100,
      hourly_rate: p?.default_hourly_rate != null ? String(p.default_hourly_rate) : '',
      notes: '',
    })
    setShowAddAlloc(personId)
  }

  if (loadingProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6e7681] text-sm">Loading…</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-[#8b949e]">Project not found.</p>
      </div>
    )
  }

  const days = projectDaysRemaining(project)
  const isOverdue = days !== null && days < 0
  const currentStatus = (form.status ?? project.status) as ProjectStatus
  const needsStartDate = STATUS_NEEDS_START.includes(currentStatus)
  const statusStyle = STATUS_STYLE[project.status]

  return (
    <div className="min-h-screen bg-[#0d1117]">
      {/* Top bar */}
      <div className="border-b border-[#30363d] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="h-4 w-px bg-[#30363d]" />
        <span className="text-xs text-[#6e7681]">Projects</span>
        <span className="text-xs text-[#6e7681]">/</span>
        <span className="text-xs text-[#c9d1d9] truncate max-w-[200px]">{project.name}</span>
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs transition-colors disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-xs transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-xs transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e24b4a] hover:border-[#e24b4a]/40 text-xs transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Project header */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                className="w-full text-2xl font-semibold bg-transparent border-b border-[#30363d] focus:border-[#58a6ff] focus:outline-none text-[#e6edf3] pb-1"
                value={form.name ?? ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            ) : (
              <h1 className="text-2xl font-semibold text-[#e6edf3]">{project.name}</h1>
            )}
            <p className="text-sm text-[#8b949e] mt-1">{project.client_name}</p>
          </div>

          {/* Status + color in view/edit */}
          <div className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                {/* Color picker */}
                <div className="flex gap-1 flex-wrap max-w-30">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      className={cn(
                        'h-5 w-5 rounded-full transition-all',
                        (form.color ?? project.color) === c && 'ring-2 ring-offset-1 ring-white ring-offset-[#161b22] scale-110'
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
                <select
                  className="text-sm border border-[#30363d] rounded-lg px-3 py-1.5 bg-[#21262d] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  value={form.status ?? project.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as ProjectStatus }))}
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                {project.color && (
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                )}
                <span
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ background: statusStyle.bg, color: statusStyle.text }}
                >
                  {project.status.replace('_', ' ')}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Deal value highlight */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-center">
            <p className="text-xl font-bold text-[#e6edf3]">{formatINR(project.sales_value)}</p>
            <p className="text-xs text-[#6e7681] mt-1">Deal value</p>
          </div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-center">
            <p className={cn('text-xl font-bold', isOverdue ? 'text-[#e24b4a]' : 'text-[#e6edf3]')}>
              {project.target_end_date ? formatDate(project.target_end_date, 'dd MMM') : '—'}
            </p>
            <p className="text-xs text-[#6e7681] mt-1">
              {isOverdue ? `${Math.abs(days!)}d overdue` : days !== null ? `${days}d left` : 'Target end'}
            </p>
          </div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-center">
            <p className="text-xl font-bold text-[#e6edf3]">
              {project.estimated_weeks ?? '—'}
            </p>
            <p className="text-xs text-[#6e7681] mt-1">Est. weeks</p>
          </div>
        </div>

        {/* Details grid */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
          <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest mb-4">Details</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <Field label={`Start date${needsStartDate && editing ? ' *' : ''}`}>
              {editing ? (
                <input type="date"
                  className={cn(
                    'w-full text-sm bg-[#0d1117] border rounded-md px-3 py-1.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]',
                    needsStartDate && !form.start_date ? 'border-[#ef9f27]' : 'border-[#30363d]'
                  )}
                  value={form.start_date ?? ''}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-[#c9d1d9]">{formatDate(project.start_date)}</p>
              )}
            </Field>

            <Field label="Target end date">
              {editing ? (
                <input type="date"
                  className="w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  value={form.target_end_date ?? ''}
                  onChange={e => setForm(f => ({ ...f, target_end_date: e.target.value }))}
                />
              ) : (
                <p className={cn('text-sm', isOverdue ? 'text-[#e24b4a]' : 'text-[#c9d1d9]')}>
                  {formatDate(project.target_end_date)}
                  {days !== null && (
                    <span className="ml-1 text-xs text-[#6e7681]">
                      ({isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`})
                    </span>
                  )}
                </p>
              )}
            </Field>

            <Field label="Deal value (₹)">
              {editing ? (
                <input type="number"
                  className="w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  value={form.sales_value ?? ''}
                  onChange={e => setForm(f => ({ ...f, sales_value: parseFloat(e.target.value) || 0 }))}
                />
              ) : (
                <p className="text-sm font-medium text-[#c9d1d9]">{formatINR(project.sales_value)}</p>
              )}
            </Field>

            <Field label="Est. weeks">
              {editing ? (
                <input type="number"
                  className="w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  value={form.estimated_weeks ?? ''}
                  onChange={e => setForm(f => ({ ...f, estimated_weeks: parseInt(e.target.value) || undefined }))}
                />
              ) : (
                <p className="text-sm text-[#c9d1d9]">{project.estimated_weeks ?? '—'}</p>
              )}
            </Field>

            {(currentStatus === 'completed' || project.actual_end_date) && (
              <Field label="Actual end date">
                {editing ? (
                  <input type="date"
                    className="w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                    value={form.actual_end_date ?? ''}
                    onChange={e => setForm(f => ({ ...f, actual_end_date: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm text-[#c9d1d9]">{formatDate(project.actual_end_date)}</p>
                )}
              </Field>
            )}
          </div>

          {/* Lost reason — only when project is (or is being marked) lost */}
          {currentStatus === 'lost' && (
            <div className="mt-5 pt-4 border-t border-[#21262d]">
              <Field label="Reason for loss">
                {editing ? (
                  <textarea
                    className="w-full text-sm bg-[#0d1117] border border-[#e24b4a]/30 rounded-md px-3 py-2 text-[#e6edf3] resize-none focus:outline-none focus:border-[#e24b4a]"
                    rows={2}
                    value={form.lost_reason ?? ''}
                    onChange={e => setForm(f => ({ ...f, lost_reason: e.target.value }))}
                    placeholder="Why did the client back out? e.g. budget cuts, found cheaper option, scope mismatch…"
                  />
                ) : project.lost_reason ? (
                  <div className="rounded-lg bg-[#e24b4a]/[0.08] border border-[#e24b4a]/30 px-3 py-2.5">
                    <p className="text-xs text-[#e24b4a]">{project.lost_reason}</p>
                  </div>
                ) : (
                  <p className="text-sm text-[#6e7681] italic">No reason recorded</p>
                )}
              </Field>
            </div>
          )}

          {/* Delay reason */}
          <div className="mt-5 pt-4 border-t border-[#21262d]">
            <Field label="Delay / blocker">
              {editing ? (
                <textarea
                  className="w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[#e6edf3] resize-none focus:outline-none focus:border-[#58a6ff]"
                  rows={2}
                  value={form.delay_reason ?? ''}
                  onChange={e => setForm(f => ({ ...f, delay_reason: e.target.value }))}
                  placeholder="Describe any blockers or delays…"
                />
              ) : project.delay_reason ? (
                <div className="rounded-lg bg-[#ef9f2710] border border-[#ef9f2730] px-3 py-2.5">
                  <p className="text-xs text-[#ef9f27]">{project.delay_reason}</p>
                </div>
              ) : (
                <p className="text-sm text-[#6e7681]">None</p>
              )}
            </Field>
          </div>

          {/* Notes */}
          <div className="mt-4">
            <Field label="Notes">
              {editing ? (
                <textarea
                  className="w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[#e6edf3] resize-none focus:outline-none focus:border-[#58a6ff]"
                  rows={3}
                  value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any project notes…"
                />
              ) : (
                <p className="text-sm text-[#8b949e]">{project.notes || '—'}</p>
              )}
            </Field>
          </div>
        </div>

        {/* Team & Allocations */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">
              Team & allocations
            </h2>
            <button
              onClick={() => {
                setAllocForm(f => ({ ...f, person_id: '', hourly_rate: '' }))
                setShowAddAlloc(v => !v)
              }}
              className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#58a6ff] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Assign person
            </button>
          </div>

          {/* Add allocation form */}
          {showAddAlloc && (
            <div className="mb-4 rounded-lg border border-[#30363d] bg-[#0d1117] p-4 space-y-3">
              {typeof showAddAlloc === 'string' ? (
                /* Pre-filled person — show as label, not a picker */
                <div className="flex items-center gap-2">
                  {(() => {
                    const p = (people ?? []).find(x => x.id === showAddAlloc)
                    return p ? (
                      <>
                        <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: p.avatar_color ?? '#1d9e75' }}>
                          {p.avatar_initials ?? p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#e6edf3]">{p.name}</span>
                        <span className="text-xs text-[#58a6ff] bg-[#58a6ff]/10 px-2 py-0.5 rounded">New period</span>
                      </>
                    ) : null
                  })()}
                </div>
              ) : (
                <div>
                  <label className="text-xs text-[#8b949e] block mb-1.5">Person</label>
                  <select
                    className="w-full text-sm border border-[#30363d] rounded-md px-3 py-1.5 bg-[#21262d] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                    value={allocForm.person_id}
                    onChange={e => onPersonChange(e.target.value)}
                  >
                    <option value="">Select person…</option>
                    {(people ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.role}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8b949e] block mb-1.5">Start date</label>
                  <input type="date"
                    className="w-full text-sm border border-[#30363d] rounded-md px-3 py-1.5 bg-[#21262d] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                    value={allocForm.start_date}
                    onChange={e => setAllocForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8b949e] block mb-1.5">End date</label>
                  <input type="date"
                    className="w-full text-sm border border-[#30363d] rounded-md px-3 py-1.5 bg-[#21262d] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                    value={allocForm.end_date}
                    onChange={e => setAllocForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">
                  Capacity: <span className="text-[#c9d1d9] font-medium">{allocForm.capacity_percent}%</span>
                </label>
                <input type="range" min={10} max={100} step={10}
                  className="w-full accent-[#58a6ff]"
                  value={allocForm.capacity_percent}
                  onChange={e => setAllocForm(f => ({ ...f, capacity_percent: parseInt(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">
                  Hourly rate (₹/h)
                  <span className="ml-1 text-[#6e7681]">— pre-filled from person's default, override if needed</span>
                </label>
                <input type="number"
                  className="w-full text-sm border border-[#30363d] rounded-md px-3 py-1.5 bg-[#21262d] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681]"
                  value={allocForm.hourly_rate}
                  onChange={e => setAllocForm(f => ({ ...f, hourly_rate: e.target.value }))}
                  placeholder="e.g. 2500"
                />
                {allocForm.hourly_rate && allocForm.start_date && allocForm.end_date && (
                  <p className="text-[11px] text-[#8b949e] mt-1">
                    {workingDays(allocForm.start_date, allocForm.end_date, allocForm.capacity_percent)}d ·{' '}
                    {workingHours(allocForm.start_date, allocForm.end_date, allocForm.capacity_percent)}h ·{' '}
                    <span className="text-[#1d9e75] font-medium">
                      {formatCost(workingHours(allocForm.start_date, allocForm.end_date, allocForm.capacity_percent) * parseFloat(allocForm.hourly_rate || '0'))}
                    </span> est. cost
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addAllocMutation.mutate()}
                  disabled={!allocForm.person_id || addAllocMutation.isPending}
                  className="px-4 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs transition-colors disabled:opacity-50"
                >
                  {addAllocMutation.isPending ? 'Saving…' : 'Add'}
                </button>
                <button
                  onClick={() => setShowAddAlloc(false)}
                  className="px-4 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Allocation list */}
          {loadingAllocs ? (
            <div className="space-y-2">
              {[1,2].map(i => <div key={i} className="h-12 bg-[#21262d] rounded-lg animate-pulse" />)}
            </div>
          ) : (allocations ?? []).length === 0 ? (
            <p className="text-sm text-[#6e7681] py-2">No one assigned yet.</p>
          ) : (
            <div className="space-y-1.5">
              {(allocations ?? []).map(a => {
                const isPast    = new Date(a.end_date) < new Date()
                const isEditing = editingAllocId === a.id
                const effRate   = effectiveHourlyRate(a.hourly_rate, a.people?.default_hourly_rate)
                const days      = workingDays(a.start_date, a.end_date, a.capacity_percent)
                const hours     = workingHours(a.start_date, a.end_date, a.capacity_percent)
                const cost      = allocationCost(a.start_date, a.end_date, a.capacity_percent, effRate)
                const totalLoad = crossProjectLoad?.[a.person_id] ?? 0
                const isOverAllocated = totalLoad > 100

                return (
                  <div
                    key={a.id}
                    className={cn(
                      'rounded-lg border transition-colors',
                      isEditing
                        ? 'border-[#58a6ff]/40 bg-[#161b22]'
                        : 'border-[#21262d] hover:border-[#30363d] hover:bg-[#21262d]/60',
                      isPast && !isEditing && 'opacity-50',
                      'group'
                    )}
                  >
                    {isEditing ? (
                      /* ── Edit mode ── */
                      <div className="px-3 py-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0"
                            style={{ backgroundColor: a.people?.avatar_color ?? '#1d9e75' }}
                          >
                            {a.people?.avatar_initials ?? a.people?.name?.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-[#e6edf3]">{a.people?.name}</span>
                        </div>
                        {/* Date range — editable so periods can be trimmed */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-[#8b949e] block mb-1">Start date</label>
                            <input
                              type="date"
                              className="w-full text-sm border border-[#30363d] rounded-md px-2 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                              value={editAllocForm.start_date}
                              onChange={e => setEditAllocForm(f => ({ ...f, start_date: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-[#8b949e] block mb-1">End date</label>
                            <input
                              type="date"
                              className="w-full text-sm border border-[#30363d] rounded-md px-2 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                              value={editAllocForm.end_date}
                              onChange={e => setEditAllocForm(f => ({ ...f, end_date: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-[#8b949e] block mb-1">
                              Capacity %
                              {isOverAllocated && (
                                <span className="ml-1 text-[#e24b4a]">· total this week: {totalLoad}%</span>
                              )}
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="range" min={10} max={100} step={10}
                                className="flex-1 accent-[#58a6ff]"
                                value={editAllocForm.capacity_percent}
                                onChange={e => setEditAllocForm(f => ({ ...f, capacity_percent: parseInt(e.target.value) }))}
                              />
                              <span className={cn(
                                'text-sm font-semibold w-10 text-right tabular-nums',
                                editAllocForm.capacity_percent + (totalLoad - a.capacity_percent) > 100
                                  ? 'text-[#e24b4a]' : 'text-[#c9d1d9]'
                              )}>
                                {editAllocForm.capacity_percent}%
                              </span>
                            </div>
                            {editAllocForm.capacity_percent + (totalLoad - a.capacity_percent) > 100 && (
                              <p className="text-[11px] text-[#e24b4a] mt-0.5">
                                ⚠ Total will be {editAllocForm.capacity_percent + (totalLoad - a.capacity_percent)}% this week
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="text-[11px] text-[#8b949e] block mb-1">
                              Hourly rate (₹/h)
                              {!a.hourly_rate && a.people?.default_hourly_rate && (
                                <span className="ml-1 text-[#484f58]">default: ₹{a.people.default_hourly_rate}</span>
                              )}
                            </label>
                            <input
                              type="number"
                              className="w-full text-sm border border-[#30363d] rounded-md px-2 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681]"
                              value={editAllocForm.hourly_rate}
                              onChange={e => setEditAllocForm(f => ({ ...f, hourly_rate: e.target.value }))}
                              placeholder={a.people?.default_hourly_rate ? `${a.people.default_hourly_rate} (default)` : 'e.g. 500'}
                            />
                          </div>
                        </div>
                        {/* Preview — uses the currently edited date range */}
                        {(editAllocForm.hourly_rate || effRate) && editAllocForm.start_date && editAllocForm.end_date && (
                          <p className="text-[11px] text-[#8b949e]">
                            {workingDays(editAllocForm.start_date, editAllocForm.end_date, editAllocForm.capacity_percent)}d ·{' '}
                            {workingHours(editAllocForm.start_date, editAllocForm.end_date, editAllocForm.capacity_percent)}h ·{' '}
                            <span className="text-[#1d9e75] font-medium">
                              {formatCost(
                                workingHours(editAllocForm.start_date, editAllocForm.end_date, editAllocForm.capacity_percent) *
                                (editAllocForm.hourly_rate ? parseFloat(editAllocForm.hourly_rate) : (effRate ?? 0))
                              )}
                            </span> est. cost
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateAllocMutation.mutate(a.id)}
                            disabled={updateAllocMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs transition-colors disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                            {updateAllocMutation.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingAllocId(null)}
                            className="px-3 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-xs transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0"
                          style={{ backgroundColor: a.people?.avatar_color ?? '#1d9e75' }}
                        >
                          {a.people?.avatar_initials ?? a.people?.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/people/${a.person_id}`)}>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-[#c9d1d9] truncate group-hover:text-[#e6edf3]">
                              {a.people?.name}
                            </p>
                            {isOverAllocated && (
                              <span className="text-[10px] text-[#e24b4a] bg-[#e24b4a]/10 px-1.5 py-0.5 rounded shrink-0">
                                {totalLoad}% total
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#6e7681]">
                            {formatDate(a.start_date, 'dd MMM')} – {formatDate(a.end_date, 'dd MMM')}
                            <span className="mx-1.5">·</span>
                            <span className={cn('font-medium', a.capacity_percent > 80 ? 'text-[#ef9f27]' : 'text-[#8b949e]')}>
                              {a.capacity_percent}%
                            </span>
                            <span className="mx-1.5">·</span>
                            {days}d / {hours}h
                            {cost != null && (
                              <span className="ml-1.5 text-[#1d9e75] font-medium">{formatCost(cost)}</span>
                            )}
                            {effRate != null && (
                              <span className="ml-1 text-[#3d444d]">
                                @ ₹{effRate}/h{a.hourly_rate == null ? ' (default)' : ''}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            title="Add another allocation period for this person"
                            onClick={() => openAddPeriod(a.person_id)}
                            className="p-1 text-[#6e7681] hover:text-[#58a6ff] rounded transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingAllocId(a.id)
                              setEditAllocForm({
                                capacity_percent: a.capacity_percent,
                                hourly_rate: a.hourly_rate != null ? String(a.hourly_rate) : '',
                                start_date: a.start_date,
                                end_date: a.end_date,
                              })
                            }}
                            className="p-1 text-[#6e7681] hover:text-[#58a6ff] rounded transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteAllocMutation.mutate(a.id)}
                            className="p-1 text-[#6e7681] hover:text-[#e24b4a] rounded transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Project economics — hourly + salary */}
        {(() => {
          const allAllocs = allocations ?? []
          const revenue   = project.sales_value ?? 0

          // Hourly-rate cost (use effective rate = allocation rate OR person default)
          let hourlyCost = 0, hourlyCount = 0
          for (const a of allAllocs) {
            const rate = effectiveHourlyRate(a.hourly_rate, a.people?.default_hourly_rate)
            if (rate == null) continue
            hourlyCost += allocationCost(a.start_date, a.end_date, a.capacity_percent, rate) ?? 0
            hourlyCount++
          }

          // Salary-based cost — uses the snapshot taken at allocation time so
          // that bumping someone's current salary doesn't rewrite past project
          // costs. Falls back to the live salary only for legacy rows where
          // no snapshot was captured.
          let salaryCost = 0, salaryCount = 0
          for (const a of allAllocs) {
            const snapshot = a.monthly_salary ?? a.people?.monthly_salary ?? null
            if (snapshot == null) continue
            salaryCost += allocationSalaryCost(a.start_date, a.end_date, a.capacity_percent, snapshot) ?? 0
            salaryCount++
          }

          if (hourlyCount === 0 && salaryCount === 0) return null

          function ProfitRow({ cost, label }: { cost: number; label: string }) {
            const profit   = revenue - cost
            const margin   = revenue > 0 ? Math.round((profit / revenue) * 100) : null
            const isProfit = profit >= 0
            return (
              <div className="rounded-lg bg-[#0d1117] border border-[#21262d] p-4">
                <p className="text-[11px] text-[#6e7681] uppercase tracking-wide mb-3">{label}</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-base font-semibold text-[#e24b4a]">{formatCost(cost)}</p>
                    <p className="text-[10px] text-[#6e7681] mt-0.5">Cost</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[#e6edf3]">{formatINR(revenue)}</p>
                    <p className="text-[10px] text-[#6e7681] mt-0.5">Revenue</p>
                  </div>
                  <div>
                    <p className={cn('text-base font-semibold', isProfit ? 'text-[#1d9e75]' : 'text-[#e24b4a]')}>
                      {isProfit ? '+' : '-'}{formatCost(Math.abs(profit))}
                    </p>
                    <p className="text-[10px] text-[#6e7681] mt-0.5 flex items-center justify-center gap-1">
                      {margin !== null
                        ? <>{isProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} {margin}%</>
                        : '—'
                      }
                    </p>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 space-y-3">
              <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">
                Project economics
              </h2>
              {hourlyCount > 0 && (
                <ProfitRow
                  cost={hourlyCost}
                  label={`Hourly cost${hourlyCount < allAllocs.length ? ` (${hourlyCount}/${allAllocs.length} allocations)` : ''}`}
                />
              )}
              {salaryCount > 0 && (
                <ProfitRow
                  cost={salaryCost}
                  label={`Salary cost${salaryCount < allAllocs.length ? ` (${salaryCount}/${allAllocs.length} allocations)` : ''}`}
                />
              )}
              {(hourlyCount < allAllocs.length || salaryCount < allAllocs.length) && (
                <p className="text-[11px] text-[#484f58] text-center">
                  Set hourly rates and/or salaries in Settings to see complete figures
                </p>
              )}
            </div>
          )
        })()}

        {/* ── Billing & Collections ── */}
        {(() => {
          const salesValue = project.sales_value ?? 0
          if (salesValue <= 0) return null
          const collections = projectCollections ?? []
          const collected = collections.reduce((s, c) => s + Number(c.amount), 0)
          const outstanding = Math.max(0, salesValue - collected)
          const pct = salesValue > 0 ? Math.min(100, Math.round((collected / salesValue) * 100)) : 0
          const fullyPaid = outstanding === 0 && collected > 0

          return (
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-[#1d9e75]/15 border border-[#1d9e75]/25 flex items-center justify-center">
                    <Receipt className="h-3.5 w-3.5 text-[#1d9e75]" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">Billing</h2>
                    <p className="text-[11px] text-[#6e7681] mt-0.5">
                      Project payments tracked in the ledger
                    </p>
                  </div>
                </div>
                {project.status !== 'lost' && !fullyPaid && (
                  <button
                    onClick={() => setShowRecordCollection(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1d9e75]/10 border border-[#1d9e75]/30 text-[#1d9e75] hover:bg-[#1d9e75]/20 text-xs font-medium transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Record collection
                  </button>
                )}
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-[#0d1117] border border-[#21262d] px-4 py-3">
                  <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">Sales value</p>
                  <p className="text-base font-semibold text-[#c9d1d9] mt-1 tabular-nums">{formatINRFull(salesValue)}</p>
                </div>
                <div className="rounded-lg bg-[#0d1117] border border-[#21262d] px-4 py-3">
                  <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">Collected</p>
                  <p className="text-base font-semibold text-[#1d9e75] mt-1 tabular-nums">{formatINRFull(collected)}</p>
                </div>
                <div className="rounded-lg bg-[#0d1117] border border-[#21262d] px-4 py-3">
                  <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">Outstanding</p>
                  <p
                    className="text-base font-semibold mt-1 tabular-nums"
                    style={{ color: outstanding === 0 ? '#1d9e75' : '#ef9f27' }}
                  >
                    {formatINRFull(outstanding)}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6e7681]">Payment progress</span>
                  <span className="text-[#c9d1d9] tabular-nums font-medium">{pct}%</span>
                </div>
                <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 100 ? '#1d9e75' : pct >= 50 ? '#ef9f27' : '#e24b4a',
                    }}
                  />
                </div>
              </div>

              {/* Collection list */}
              {collections.length > 0 ? (
                <div className="rounded-lg bg-[#0d1117] border border-[#21262d] divide-y divide-[#21262d]">
                  {collections.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-6 w-6 rounded-full bg-[#1d9e75]/15 flex items-center justify-center flex-shrink-0">
                          <Plus className="h-3 w-3 text-[#1d9e75]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-[#c9d1d9] tabular-nums">
                            {format(parseISO(c.date), 'dd MMM yyyy')}
                          </p>
                          {(c.reference || c.notes) && (
                            <p className="text-[11px] text-[#6e7681] truncate">
                              {c.reference && <span className="font-mono mr-1.5">{c.reference}</span>}
                              {c.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-[#1d9e75] tabular-nums whitespace-nowrap">
                        +{formatINR(Number(c.amount))}
                      </span>
                    </div>
                  ))}
                  {collections.length > 5 && (
                    <button
                      onClick={() => router.push('/finance/ledger')}
                      className="w-full px-3 py-2 text-[11px] text-[#58a6ff] hover:underline"
                    >
                      View all {collections.length} collections in Ledger →
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#6e7681] italic text-center py-2">
                  No collections recorded yet.
                </p>
              )}
            </div>
          )
        })()}
      </div>

      <AddTransactionDialog
        open={showRecordCollection}
        onClose={() => setShowRecordCollection(false)}
        preselectedProjectId={id}
        defaultMode="collection"
      />

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-[#e24b4a] flex-shrink-0" />
              <h2 className="text-sm font-semibold text-[#e6edf3]">Delete project</h2>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-[#c9d1d9]">
                Permanently delete <span className="font-semibold text-[#e6edf3]">{project.name}</span>?
              </p>
              <p className="text-xs text-[#8b949e]">
                This will also remove all{' '}
                <span className="text-[#e6edf3] font-medium">{(allocations ?? []).length} allocation{(allocations ?? []).length !== 1 ? 's' : ''}</span>{' '}
                tied to this project. This action cannot be undone.
              </p>
              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">
                  Type <span className="text-[#c9d1d9] font-mono">{project.name}</span> to confirm
                </label>
                <input
                  className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#e24b4a] placeholder-[#6e7681]"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={project.name}
                  autoFocus
                />
              </div>
              {deleteProjectMutation.error && (
                <p className="text-xs text-[#e24b4a]">{deleteProjectMutation.error.message}</p>
              )}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                disabled={deleteConfirmText !== project.name || deleteProjectMutation.isPending}
                onClick={() => deleteProjectMutation.mutate()}
                className="flex-1 py-2 rounded-lg bg-[#da3633] hover:bg-[#e24b4a] text-white text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleteProjectMutation.isPending ? 'Deleting…' : 'Delete project'}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                disabled={deleteProjectMutation.isPending}
                className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
