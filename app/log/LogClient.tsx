'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  getAllocationProjectsForDate,
  getEntriesForDate,
  upsertTimeEntries,
  deleteTimeEntry,
  type UpsertRow,
} from '@/lib/queries/time'
import { format, parseISO, subDays, addDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Trash2, Check, Lock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project } from '@/lib/supabase/types'

interface LogClientProps {
  personId: string
  userId: string
  fullName: string | null
  isFounder: boolean
}

type Row = {
  entryId: string | null
  projectId: string
  projectName: string
  clientName: string
  color: string | null
  hours: string
  isAdhoc: boolean
}

const todayIso = () => format(new Date(), 'yyyy-MM-dd')
const PICKABLE_STATUSES = new Set(['pipeline', 'active', 'in_production', 'on_hold', 'paused'])

export function LogClient({ personId, userId, fullName, isFounder }: LogClientProps) {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const [date, setDate] = useState(todayIso())
  const [rows, setRows] = useState<Row[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  const isToday = date === todayIso()
  const canEdit = isFounder || isToday  // employees: today only

  const { data: allocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['log_allocations', personId, date],
    queryFn: () => getAllocationProjectsForDate(personId, date),
  })

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['log_entries', personId, date],
    queryFn: () => getEntriesForDate(personId, date),
  })

  const { data: allProjects } = useQuery({
    queryKey: ['log_all_projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, client_name, status, color')
        .order('name')
      if (error) throw error
      return data as Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'>[]
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!allocations || !entries) return
    const allocIds = new Set(allocations.map(a => a.project_id))
    const projectMap = new Map<string, Row>()
    for (const a of allocations) {
      if (!a.projects) continue
      projectMap.set(a.project_id, {
        entryId: null,
        projectId: a.project_id,
        projectName: a.projects.name,
        clientName: a.projects.client_name,
        color: a.projects.color ?? null,
        hours: '',
        isAdhoc: false,
      })
    }
    for (const e of entries) {
      const existing = projectMap.get(e.project_id)
      if (existing) {
        existing.entryId = e.id
        existing.hours = String(Number(e.hours))
      } else {
        const project = (allProjects ?? []).find(p => p.id === e.project_id)
        projectMap.set(e.project_id, {
          entryId: e.id,
          projectId: e.project_id,
          projectName: project?.name ?? '(unknown project)',
          clientName: project?.client_name ?? '',
          color: project?.color ?? null,
          hours: String(Number(e.hours)),
          isAdhoc: !allocIds.has(e.project_id),
        })
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(Array.from(projectMap.values()))
  }, [allocations, entries, allProjects])

  const totalHours = useMemo(
    () => rows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0),
    [rows]
  )

  const availableProjects = useMemo(() => {
    const shownIds = new Set(rows.map(r => r.projectId))
    return (allProjects ?? []).filter(p => PICKABLE_STATUSES.has(p.status) && !shownIds.has(p.id))
  }, [allProjects, rows])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toUpsert: UpsertRow[] = rows
        .filter(r => parseFloat(r.hours) > 0)
        .map(r => ({
          id: r.entryId,
          person_id: personId,
          project_id: r.projectId,
          date,
          hours: parseFloat(r.hours),
          work_log: null,
        }))
      if (toUpsert.length === 0) return
      await upsertTimeEntries(toUpsert, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log_entries', personId, date] })
      queryClient.invalidateQueries({ queryKey: ['feed_entries'] })
      queryClient.invalidateQueries({ queryKey: ['person_time'] })
      queryClient.invalidateQueries({ queryKey: ['person_time_graph'] })
      queryClient.invalidateQueries({ queryKey: ['project_time'] })
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 2000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deleteTimeEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log_entries', personId, date] })
      queryClient.invalidateQueries({ queryKey: ['feed_entries'] })
    },
  })

  function updateRow(projectId: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => r.projectId === projectId ? { ...r, ...patch } : r))
  }

  function addProjectRow(p: Pick<Project, 'id' | 'name' | 'client_name' | 'color'>) {
    setRows(rs => [
      ...rs,
      {
        entryId: null,
        projectId: p.id,
        projectName: p.name,
        clientName: p.client_name,
        color: p.color ?? null,
        hours: '',
        isAdhoc: true,
      },
    ])
    setShowProjectPicker(false)
  }

  function removeRow(projectId: string) {
    const row = rows.find(r => r.projectId === projectId)
    if (!row) return
    if (row.entryId) {
      if (!confirm('Delete this entry?')) return
      deleteMutation.mutate(row.entryId)
    }
    setRows(rs => rs.filter(r => r.projectId !== projectId))
  }

  function shiftDate(deltaDays: number) {
    const next = format(addDays(parseISO(date), deltaDays), 'yyyy-MM-dd')
    if (next > todayIso()) return  // no future dates
    setDate(next)
  }

  const dateObj = parseISO(date)
  const dateLabel = isToday
    ? 'Today'
    : date === format(subDays(new Date(), 1), 'yyyy-MM-dd')
      ? 'Yesterday'
      : format(dateObj, 'EEE')
  const dateLong = format(dateObj, 'dd MMM yyyy')

  const loading = loadingAllocs || loadingEntries
  const canSave = canEdit && !saveMutation.isPending && totalHours > 0

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Daily log</h1>
        {fullName && <p className="text-sm text-[#8b949e] mt-1">{fullName}</p>}
      </header>

      {/* Date stepper */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => shiftDate(-1)}
          className="p-2 rounded-lg border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 transition-colors"
          title="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[#6e7681]">{dateLabel}</p>
            <p className="text-base font-semibold text-[#e6edf3]">{dateLong}</p>
          </div>
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={e => setDate(e.target.value)}
            className="text-xs border border-[#30363d] rounded-md px-2 py-1 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
          />
        </div>

        <button
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="p-2 rounded-lg border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {!isToday && (
          <button
            onClick={() => setDate(todayIso())}
            className="px-3 py-2 rounded-lg border border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#58a6ff] hover:bg-[#58a6ff]/20 text-xs transition-colors whitespace-nowrap"
          >
            Today
          </button>
        )}
      </div>

      {/* Read-only banner for employees on past days */}
      {!canEdit && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] text-xs">
          <Lock className="h-3.5 w-3.5 flex-shrink-0" />
          Past days are locked. You can only edit today&apos;s log.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3">
          <p className="text-[11px] text-[#6e7681] uppercase tracking-wide">Total today</p>
          <p className={cn(
            'text-2xl font-semibold tabular-nums mt-0.5',
            totalHours > 9 ? 'text-[#f59e0b]' : 'text-[#e6edf3]'
          )}>
            {totalHours.toFixed(1)}<span className="text-sm text-[#6e7681] ml-1">h</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3">
          <p className="text-[11px] text-[#6e7681] uppercase tracking-wide">Projects</p>
          <p className="text-2xl font-semibold text-[#e6edf3] tabular-nums mt-0.5">
            {rows.filter(r => parseFloat(r.hours) > 0).length}
          </p>
        </div>
      </div>

      {totalHours > 9 && canEdit && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-xs">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          That&apos;s a long day — double check before saving.
        </div>
      )}

      {/* Rows */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-[#161b22] border border-[#30363d] animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-8 text-center mb-3">
          <p className="text-sm text-[#8b949e]">No hours logged on this day.</p>
          {canEdit && <p className="text-xs text-[#6e7681] mt-1">Add a project below to start.</p>}
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {rows.map(r => (
            <ProjectRow
              key={r.projectId}
              row={r}
              canEdit={canEdit}
              onHoursChange={v => updateRow(r.projectId, { hours: v })}
              onRemove={() => removeRow(r.projectId)}
            />
          ))}
        </div>
      )}

      {/* Add project */}
      {canEdit && (
        showProjectPicker ? (
          <div className="rounded-xl border border-[#58a6ff]/40 bg-[#161b22] p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#8b949e]">Pick a project to log against</p>
              <button
                onClick={() => setShowProjectPicker(false)}
                className="text-[10px] text-[#6e7681] hover:text-[#e6edf3]"
              >
                Cancel
              </button>
            </div>
            {availableProjects.length === 0 ? (
              <p className="text-xs text-[#6e7681] py-2">All projects are already added.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {availableProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addProjectRow(p)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#21262d] text-sm text-[#e6edf3] transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color ?? '#58a6ff' }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{p.name}</p>
                        <p className="text-[11px] text-[#6e7681] truncate">{p.client_name}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#6e7681] capitalize">{p.status.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowProjectPicker(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-sm transition-colors mb-5"
          >
            <Plus className="h-3.5 w-3.5" /> Add project
          </button>
        )
      )}

      {/* Save bar */}
      {canEdit && rows.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending
              ? 'Saving…'
              : savedAt
                ? <><Check className="h-3.5 w-3.5" /> Saved</>
                : 'Save'}
          </button>
          {saveMutation.isError && (
            <span className="text-xs text-[#e24b4a]">Save failed: {(saveMutation.error as Error).message}</span>
          )}
        </div>
      )}
    </div>
  )
}

interface ProjectRowProps {
  row: Row
  canEdit: boolean
  onHoursChange: (v: string) => void
  onRemove: () => void
}

function ProjectRow({ row, canEdit, onHoursChange, onRemove }: ProjectRowProps) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3 flex items-center gap-3">
      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: row.color ?? '#58a6ff' }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#e6edf3] truncate">{row.projectName}</p>
          {row.isAdhoc && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#58a6ff]/15 text-[#58a6ff] border border-[#58a6ff]/25">
              ad-hoc
            </span>
          )}
        </div>
        {row.clientName && <p className="text-[11px] text-[#6e7681] truncate">{row.clientName}</p>}
      </div>
      {canEdit ? (
        <>
          <input
            type="number"
            step="0.5"
            min="0"
            max="16"
            placeholder="0"
            value={row.hours}
            onChange={e => onHoursChange(e.target.value)}
            className="w-20 text-sm text-right border border-[#30363d] rounded-lg px-2.5 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] tabular-nums"
          />
          <span className="text-xs text-[#6e7681]">h</span>
          <button
            onClick={onRemove}
            className="p-1.5 text-[#6e7681] hover:text-[#e24b4a] hover:bg-[#e24b4a]/10 rounded transition-colors"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <div className="text-right">
          <p className="text-sm font-semibold text-[#e6edf3] tabular-nums">
            {parseFloat(row.hours).toFixed(1)}<span className="text-xs text-[#6e7681] ml-0.5">h</span>
          </p>
        </div>
      )}
    </div>
  )
}
