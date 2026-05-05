'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { addWeeks, format } from 'date-fns'
import type { Person, Project } from '@/lib/supabase/types'

interface AddAllocationDialogProps {
  open: boolean
  onClose: () => void
  preselectedPerson?: Person
  preselectedProject?: Project
}

export function AddAllocationDialog({ open, onClose, preselectedPerson, preselectedProject }: AddAllocationDialogProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const today = new Date()
  const defaultStart = format(today, 'yyyy-MM-dd')
  const defaultEnd = format(addWeeks(today, 4), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    person_id: preselectedPerson?.id ?? '',
    project_id: preselectedProject?.id ?? '',
    start_date: defaultStart,
    end_date: defaultEnd,
    capacity_percent: '100',
    notes: '',
  })

  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data, error } = await supabase.from('people').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data as Person[]
    },
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*')
        .in('status', ['pipeline', 'active', 'in_production'])
        .order('name')
      if (error) throw error
      return data as Project[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const person = (people ?? []).find(p => p.id === form.person_id)
      const { data, error } = await supabase.from('allocations').insert({
        person_id: form.person_id,
        project_id: form.project_id,
        start_date: form.start_date,
        end_date: form.end_date,
        capacity_percent: parseInt(form.capacity_percent),
        monthly_salary: person?.monthly_salary ?? null,
        notes: form.notes || null,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations'] })
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Add allocation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Person *</label>
            <select
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.person_id}
              onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))}
            >
              <option value="">Select person…</option>
              {(people ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Project *</label>
            <select
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.project_id}
              onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
            >
              <option value="">Select project…</option>
              {(projects ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Start date</label>
              <input
                type="date"
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">End date</label>
              <input
                type="date"
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Capacity % (1–100)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10} max={100} step={10}
                className="flex-1"
                value={form.capacity_percent}
                onChange={e => setForm(f => ({ ...f, capacity_percent: e.target.value }))}
              />
              <span className="text-sm font-medium text-zinc-800 w-12 text-center">{form.capacity_percent}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Notes (optional)</label>
            <input
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any context…"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white"
              onClick={() => createMutation.mutate()}
              disabled={!form.person_id || !form.project_id || createMutation.isPending}
            >
              {createMutation.isPending ? 'Saving…' : 'Add allocation'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
