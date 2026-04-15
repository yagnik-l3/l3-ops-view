'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'
import { workingDays, workingHours, allocationCost, formatCost } from '@/lib/utils/cost'
import {
  generateWeekColumns,
  calculateWeeklyLoad,
  getPersonFreeDate,
  assignLanes,
} from '@/lib/utils/timeline'
import type { Person, Allocation, Project } from '@/lib/supabase/types'
import { format } from 'date-fns'
import { ArrowLeft, Briefcase, CalendarRange, Clock } from 'lucide-react'

type AllocWithProject = Allocation & { projects: Project }

export default function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const { data: person, isLoading: loadingPerson } = useQuery({
    queryKey: ['person', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('people').select('*').eq('id', id).single()
      if (error) throw error
      return data as Person
    },
  })

  const { data: allocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['allocations_person', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('*, projects(*)')
        .eq('person_id', id)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data as AllocWithProject[]
    },
  })

  const weeks12 = generateWeekColumns(12)
  const weeks1 = generateWeekColumns(1)

  const thisWeekLoad = allocations ? calculateWeeklyLoad(allocations, weeks1)[0] ?? 0 : 0
  const freeFrom = allocations ? getPersonFreeDate(allocations) : null
  const activeAllocs = (allocations ?? []).filter(a =>
    ['active', 'in_production'].includes(a.projects?.status ?? '')
  )
  const completedAllocs = (allocations ?? []).filter(a => a.projects?.status === 'completed')
  const weeklyLoad12 = allocations ? calculateWeeklyLoad(allocations, weeks12) : weeks12.map(() => 0)

  const loadColor =
    thisWeekLoad > 100 ? '#e24b4a' : thisWeekLoad > 80 ? '#ef9f27' : '#1d9e75'

  if (loadingPerson) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6e7681] text-sm">Loading…</div>
      </div>
    )
  }

  if (!person) {
    return (
      <div className="p-6">
        <p className="text-[#8b949e]">Person not found.</p>
      </div>
    )
  }

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
        <span className="text-xs text-[#6e7681]">People</span>
        <span className="text-xs text-[#6e7681]">/</span>
        <span className="text-xs text-[#c9d1d9]">{person.name}</span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Profile header */}
        <div className="flex items-start gap-5">
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center text-white text-xl font-medium shrink-0"
            style={{ backgroundColor: person.avatar_color ?? '#1d9e75' }}
          >
            {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-[#e6edf3]">{person.name}</h1>
            <p className="text-sm text-[#8b949e] mt-1 capitalize">{person.role}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={cn(
                'text-[11px] px-2.5 py-0.5 rounded-full border',
                person.type === 'developer'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : person.type === 'designer'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  : 'bg-[#21262d] text-[#8b949e] border-[#30363d]'
              )}>
                {person.type}
              </span>
              <span className={cn(
                'text-[11px] px-2.5 py-0.5 rounded-full border',
                !freeFrom || freeFrom <= new Date()
                  ? 'bg-[#1d9e75]/10 text-[#1d9e75] border-[#1d9e75]/20'
                  : 'bg-[#21262d] text-[#8b949e] border-[#30363d]'
              )}>
                {!freeFrom || freeFrom <= new Date()
                  ? 'Available now'
                  : `Free from ${format(freeFrom, 'dd MMM')}`}
              </span>
            </div>
          </div>

          {/* This week stat */}
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold" style={{ color: loadColor }}>
              {thisWeekLoad}%
            </p>
            <p className="text-xs text-[#6e7681] mt-0.5">this week</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-center">
            <p className="text-2xl font-semibold" style={{ color: loadColor }}>{thisWeekLoad}%</p>
            <p className="text-xs text-[#6e7681] mt-1">Current utilization</p>
          </div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-center">
            <p className="text-2xl font-semibold text-[#e6edf3]">{activeAllocs.length}</p>
            <p className="text-xs text-[#6e7681] mt-1">Active projects</p>
          </div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-center">
            <p className="text-lg font-semibold text-[#e6edf3]">
              {!freeFrom || freeFrom <= new Date()
                ? 'Now'
                : format(freeFrom, 'dd MMM')}
            </p>
            <p className="text-xs text-[#6e7681] mt-1">Free from</p>
          </div>
        </div>

        {/* 12-week capacity heatmap */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
          <h2 className="text-sm font-medium text-[#c9d1d9] mb-4">12-week capacity</h2>
          <div className="flex gap-1">
            {weeks12.map((week, i) => {
              const load = weeklyLoad12[i]
              const color = load > 100 ? '#e24b4a' : load > 80 ? '#ef9f27' : load > 0 ? '#1d9e75' : '#21262d'
              const bg = load > 100 ? '#e24b4a22' : load > 80 ? '#ef9f2722' : load > 0 ? '#1d9e7522' : '#21262d'
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-sm flex items-end justify-center pb-1"
                    style={{ height: 48, background: bg, border: `1px solid ${color}20` }}
                  >
                    <span className="text-[9px] font-medium" style={{ color }}>
                      {load > 0 ? `${load}%` : ''}
                    </span>
                  </div>
                  <span className="text-[9px] text-[#6e7681] text-center leading-tight">
                    {week.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Active projects */}
        {activeAllocs.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5" /> Active now
            </h2>
            <div className="space-y-2">
              {activeAllocs.map(a => (
                <div
                  key={a.id}
                  className="flex items-center gap-4 rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 cursor-pointer hover:border-[#58a6ff]/40 transition-colors group"
                  onClick={() => router.push(`/projects/${a.project_id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#e6edf3] truncate group-hover:text-[#58a6ff] transition-colors">
                      {a.projects?.name}
                    </p>
                    <p className="text-xs text-[#6e7681] mt-0.5">{a.projects?.client_name}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-xs font-medium text-[#c9d1d9]">{a.capacity_percent}% capacity</p>
                    <p className="text-[10px] text-[#6e7681]">
                      until {formatDate(a.end_date, 'dd MMM yyyy')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Full allocation history */}
        <section>
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-widest mb-4 flex items-center gap-2">
            <CalendarRange className="h-3.5 w-3.5" /> Allocation history
            <span className="text-[#6e7681] font-normal normal-case tracking-normal text-xs">
              ({(allocations ?? []).length} total)
            </span>
          </h2>
          {loadingAllocs ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-[#161b22] animate-pulse" />
              ))}
            </div>
          ) : (allocations ?? []).length === 0 ? (
            <p className="text-sm text-[#6e7681]">No allocations recorded.</p>
          ) : (
            <div className="space-y-1">
              {(allocations ?? []).map(a => {
                const isPast = new Date(a.end_date) < new Date()
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-start gap-3 py-3 border-b border-[#21262d] last:border-0',
                      'cursor-pointer hover:bg-[#161b22] rounded-lg px-3 transition-colors',
                      isPast && 'opacity-50'
                    )}
                    onClick={() => router.push(`/projects/${a.project_id}`)}
                  >
                    <div className={cn(
                      'h-1.5 w-1.5 rounded-full mt-2 shrink-0',
                      isPast ? 'bg-[#3d444d]' : 'bg-[#1d9e75]'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#c9d1d9] truncate">{a.projects?.name}</p>
                      <p className="text-xs text-[#6e7681]">{a.projects?.client_name}</p>
                      <p className="text-xs text-[#6e7681] mt-0.5">
                        {formatDate(a.start_date, 'dd MMM yyyy')} – {formatDate(a.end_date, 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-[#8b949e]">
                        {a.capacity_percent}% · {workingDays(a.start_date, a.end_date, a.capacity_percent)}d / {workingHours(a.start_date, a.end_date, a.capacity_percent)}h
                      </p>
                      {allocationCost(a.start_date, a.end_date, a.capacity_percent, a.hourly_rate) != null && (
                        <p className="text-[11px] text-[#1d9e75] font-medium mt-0.5">
                          {formatCost(allocationCost(a.start_date, a.end_date, a.capacity_percent, a.hourly_rate)!)}
                        </p>
                      )}
                      <p className={cn(
                        'text-[10px] mt-0.5 capitalize',
                        a.projects?.status === 'active' ? 'text-[#1d9e75]' :
                        a.projects?.status === 'in_production' ? 'text-[#378add]' :
                        a.projects?.status === 'on_hold' ? 'text-[#d4537e]' :
                        'text-[#6e7681]'
                      )}>
                        {a.projects?.status?.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Summary footer */}
        {completedAllocs.length > 0 && (
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-[#6e7681]" />
              <p className="text-sm text-[#8b949e]">
                <span className="font-medium text-[#c9d1d9]">{completedAllocs.length}</span> completed project{completedAllocs.length !== 1 ? 's' : ''} · Total value{' '}
                <span className="font-medium text-[#c9d1d9]">
                  {formatINR(completedAllocs.reduce((s, a) => s + (a.projects?.sales_value ?? 0), 0))}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
