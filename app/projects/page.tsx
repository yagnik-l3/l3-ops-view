'use client'

import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ProjectListRow } from '@/components/projects/ProjectListRow'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, X, Search } from 'lucide-react'
import type { Project, ProjectStatus, ProjectKind } from '@/lib/supabase/types'

const PALETTE = [
  '#1d9e75', '#378add', '#8b5cf6', '#ef9f27', '#ec4899',
  '#06b6d4', '#f97316', '#d4537e', '#84cc16', '#a855f7', '#14b8a6', '#e24b4a',
]

type StatusFilterValue = ProjectStatus | 'all' | 'internal'

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'lost', label: 'Lost' },
  { value: 'internal', label: 'Internal' },
]

export default function ProjectsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const statusFilter = (searchParams.get('status') ?? 'all') as StatusFilterValue
  const searchFilter = searchParams.get('search') ?? ''

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newProject, setNewProject] = useState<{
    name: string
    client_name: string
    sales_value: string
    start_date: string
    target_end_date: string
    estimated_weeks: string
    kind: ProjectKind
  }>({
    name: '', client_name: '', sales_value: '', start_date: '', target_end_date: '', estimated_weeks: '',
    kind: 'client',
  })

  // Auto-calculate estimated_weeks from start + target end dates
  useEffect(() => {
    const start = newProject.start_date
    const end = newProject.target_end_date
    if (!start || !end) return
    const [sy, sm, sd] = start.split('-').map(Number)
    const [ey, em, ed] = end.split('-').map(Number)
    if (!sy || !sm || !sd || !ey || !em || !ed) return
    const diffDays = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000)
    const weeks = diffDays > 0 ? Math.max(1, Math.round(diffDays / 7)) : 0
    if (weeks > 0) setNewProject(p => ({ ...p, estimated_weeks: String(weeks) }))
  }, [newProject.start_date, newProject.target_end_date])

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Project[]
    },
  })

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter(p => {
      const matchStatus =
        statusFilter === 'all' ? true
          : statusFilter === 'internal' ? p.kind === 'internal'
            : p.status === statusFilter && p.kind !== 'internal'
      const q = searchFilter.toLowerCase()
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q)
      return matchStatus && matchSearch
    })
  }, [projects, statusFilter, searchFilter])

  const createMutation = useMutation({
    mutationFn: async () => {
      const nextColor = PALETTE[(projects ?? []).length % PALETTE.length]
      const isInternal = newProject.kind === 'internal'
      const basePayload = {
        name: newProject.name,
        client_name: isInternal ? 'L3 Labs' : newProject.client_name,
        sales_value: isInternal ? 0 : (parseFloat(newProject.sales_value) || 0),
        start_date: isInternal ? null : (newProject.start_date || null),
        target_end_date: isInternal ? null : (newProject.target_end_date || null),
        estimated_weeks: isInternal ? null : (parseInt(newProject.estimated_weeks) || null),
        status: (isInternal ? 'active' : 'pipeline') as ProjectStatus,
        color: nextColor,
      }
      // Try with `kind`; fall back without if the column hasn't been added yet.
      const withKind = await supabase.from('projects').insert({ ...basePayload, kind: newProject.kind }).select().single()
      if (!withKind.error) return withKind.data
      if (isInternal) {
        throw new Error('To create an Internal project, run the project_kind migration first (see Setup → docs).')
      }
      const fallback = await supabase.from('projects').insert(basePayload).select().single()
      if (fallback.error) throw fallback.error
      return fallback.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setShowAddDialog(false)
      setNewProject({ name: '', client_name: '', sales_value: '', start_date: '', target_end_date: '', estimated_weeks: '', kind: 'client' })
      if (data?.id) router.push(`/projects/${data.id}`)
    },
  })

  return (
    <div className="p-6 space-y-5 min-h-screen bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Projects</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            {isLoading ? '…' : `${filtered.length} of ${projects?.length ?? 0} projects`}
          </p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add project
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#30363d] rounded-lg bg-[#161b22] text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] transition-colors"
            placeholder="Search by name or client…"
            value={searchFilter}
            onChange={e => setParam('search', e.target.value)}
          />
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setParam('status', opt.value)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${statusFilter === opt.value
                  ? 'bg-[#388bfd]/20 text-[#58a6ff] border border-[#388bfd]/40'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] border border-transparent'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-lg bg-[#161b22]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#30363d] py-16 text-center">
          <p className="text-sm text-[#6e7681]">No projects match your filters</p>
          {(statusFilter !== 'all' || searchFilter) && (
            <button
              onClick={() => router.replace(pathname)}
              className="mt-2 text-xs text-[#58a6ff] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Column headers */}
          <div className="hidden md:flex items-center gap-4 px-4 pb-1 text-[11px] font-medium text-[#3d444d] uppercase tracking-wide select-none">
            <span className="flex-1">Project / Client</span>
            <span className="w-36 shrink-0">Timeline</span>
            <span className="hidden lg:block w-28 shrink-0">Progress</span>
            <span className="shrink-0 w-20">Status</span>
            <span className="hidden sm:block w-24 shrink-0 text-right">Value</span>
            <span className="w-24 shrink-0 text-right">Deadline</span>
          </div>
          {filtered.map(project => (
            <ProjectListRow
              key={project.id}
              project={project}
              onClick={() => router.push(`/projects/${project.id}`)}
            />
          ))}
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
              {/* Kind toggle */}
              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">Project kind</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#0d1117] border border-[#30363d]">
                  {(['client', 'internal'] as ProjectKind[]).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setNewProject(p => ({ ...p, kind: k }))}
                      className={`text-xs py-1.5 rounded-md transition-colors ${newProject.kind === k
                        ? k === 'internal'
                          ? 'bg-[#bc8cff]/15 text-[#bc8cff] border border-[#bc8cff]/25'
                          : 'bg-[#388bfd]/20 text-[#58a6ff] border border-[#388bfd]/40'
                        : 'text-[#6e7681] hover:text-[#e6edf3] border border-transparent'
                        }`}
                    >
                      {k === 'client' ? 'Client work' : 'Internal'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#6e7681] mt-1">
                  {newProject.kind === 'internal'
                    ? 'Bench, R&D, marketing — billed to L3 Labs, no revenue, not pickable in finance billable totals.'
                    : 'Client deliverable with revenue, dates, and allocations.'}
                </p>
              </div>

              <div>
                <label className="text-xs text-[#8b949e] block mb-1.5">Project name *</label>
                <input
                  className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681]"
                  value={newProject.name}
                  onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                  placeholder={newProject.kind === 'internal' ? 'e.g. Bench' : 'e.g. Brand redesign'}
                  autoFocus
                />
              </div>

              {newProject.kind === 'client' && (
                <>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#8b949e] block mb-1.5">Start date</label>
                      <input
                        type="date"
                        className="w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                        value={newProject.start_date}
                        onChange={e => setNewProject(p => ({ ...p, start_date: e.target.value }))}
                      />
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
                </>
              )}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                onClick={() => createMutation.mutate()}
                disabled={!newProject.name || (newProject.kind === 'client' && !newProject.client_name) || createMutation.isPending}
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
