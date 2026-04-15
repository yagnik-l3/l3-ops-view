'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ProjectCard } from '@/components/projects/ProjectCard'

const PALETTE = [
  '#1d9e75', '#378add', '#8b5cf6', '#ef9f27', '#ec4899',
  '#06b6d4', '#f97316', '#d4537e', '#84cc16', '#a855f7', '#14b8a6', '#e24b4a',
]
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, X } from 'lucide-react'
import type { Project, ProjectStatus } from '@/lib/supabase/types'

const COLUMNS: { status: ProjectStatus; label: string }[] = [
  { status: 'pipeline',  label: 'Pipeline' },
  { status: 'active',    label: 'Active' },
  { status: 'on_hold',   label: 'On Hold' },
  { status: 'paused',    label: 'Paused' },
  { status: 'completed', label: 'Completed' },
]

export default function ProjectsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newProject, setNewProject] = useState({
    name: '', client_name: '', sales_value: '', target_end_date: '', estimated_weeks: '',
  })

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Project[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const nextColor = PALETTE[(projects ?? []).length % PALETTE.length]
      const { data, error } = await supabase.from('projects').insert({
        name: newProject.name,
        client_name: newProject.client_name,
        sales_value: parseFloat(newProject.sales_value) || 0,
        target_end_date: newProject.target_end_date || null,
        estimated_weeks: parseInt(newProject.estimated_weeks) || null,
        status: 'pipeline',
        color: nextColor,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setShowAddDialog(false)
      setNewProject({ name: '', client_name: '', sales_value: '', target_end_date: '', estimated_weeks: '' })
      if (data?.id) router.push(`/projects/${data.id}`)
    },
  })

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Projects</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">All projects by stage</p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add project
        </button>
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex gap-5 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <div key={col.status} className="shrink-0 w-72 space-y-3">
              <Skeleton className="h-4 w-20 bg-[#21262d]" />
              {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg bg-[#161b22]" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const colProjects = (projects ?? []).filter(p => p.status === col.status)
            return (
              <div key={col.status} className="shrink-0 w-72 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#8b949e]">{col.label}</span>
                  <span className="text-xs bg-[#21262d] text-[#6e7681] px-1.5 py-0.5 rounded-md">
                    {colProjects.length}
                  </span>
                </div>
                <div className="space-y-2.5 min-h-20">
                  {colProjects.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#30363d] py-8 text-center">
                      <p className="text-xs text-[#3d444d]">No projects here</p>
                    </div>
                  ) : (
                    colProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onClick={() => router.push(`/projects/${project.id}`)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add project modal */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
              <h2 className="text-sm font-semibold text-[#e6edf3]">Add project</h2>
              <button
                onClick={() => setShowAddDialog(false)}
                className="text-[#6e7681] hover:text-[#e6edf3] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">Project name *</label>
                <input
                  className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681]"
                  value={newProject.name}
                  onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Brand redesign"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">Client name *</label>
                <input
                  className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681]"
                  value={newProject.client_name}
                  onChange={e => setNewProject(p => ({ ...p, client_name: e.target.value }))}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8b949e] block mb-1.5">Deal value (₹)</label>
                  <input
                    type="number"
                    className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681]"
                    value={newProject.sales_value}
                    onChange={e => setNewProject(p => ({ ...p, sales_value: e.target.value }))}
                    placeholder="150000"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8b949e] block mb-1.5">Est. weeks</label>
                  <input
                    type="number"
                    className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681]"
                    value={newProject.estimated_weeks}
                    onChange={e => setNewProject(p => ({ ...p, estimated_weeks: e.target.value }))}
                    placeholder="8"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">Target end date</label>
                <input
                  type="date"
                  className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  value={newProject.target_end_date}
                  onChange={e => setNewProject(p => ({ ...p, target_end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                onClick={() => createMutation.mutate()}
                disabled={!newProject.name || !newProject.client_name || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating…' : 'Create project'}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
                onClick={() => setShowAddDialog(false)}
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
