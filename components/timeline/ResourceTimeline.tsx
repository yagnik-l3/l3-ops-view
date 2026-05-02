'use client'

import { useState, useLayoutEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  calculateWeeklyLoad,
  isPersonOverloaded,
  computeTeamLoadHeatmap,
  assignLanes,
  type WeekColumn,
} from '@/lib/utils/timeline'
import {
  workingDays,
  workingHours,
  workingDaysInWeek,
  allocationCost,
  effectiveHourlyRate,
  formatCost,
} from '@/lib/utils/cost'
import { formatDate } from '@/lib/utils/date'
import type { Person, Project, Allocation } from '@/lib/supabase/types'
import { startOfWeek, isSameDay, format } from 'date-fns'

// ── Fixed layout constants ──────────────────────────────────
const NAME_W   = 200
const SIDEBAR_W = 200  // matches the fixed sidebar in app/layout.tsx
const MIN_COL  = 40    // allow up to 20 weeks on typical screens
const LANE_H   = 26
const LANE_G   = 5
const ROW_PAD  = 12

type FilterType = 'all' | 'developers' | 'designers' | 'overloaded'

function getBarStyle(project: Project): { bg: string; text: string; border?: string } {
  const c = project.color ?? '#1d9e75'
  switch (project.status) {
    case 'active':
    case 'in_production': return { bg: c,             text: '#fff' }
    case 'pipeline':      return { bg: 'transparent', text: c,      border: c }
    case 'paused':        return { bg: `${c}25`,      text: c,      border: `${c}55` }
    case 'on_hold':       return { bg: `${c}25`,      text: c,      border: `${c}55` }
    case 'completed':     return { bg: `${c}18`,      text: `${c}99` }
    default:              return { bg: 'transparent', text: '#8b949e', border: '#484f58' }
  }
}

/** Working days in the week starting on `monday` as Date objects (skipping holiday Saturdays) */
function getWorkingDaysOfWeek(monday: Date): Date[] {
  const days: Date[] = []
  const wdCount = workingDaysInWeek(monday)
  for (let i = 0; i < wdCount; i++) {
    const d = new Date(monday)
    // Mon(0)…Fri(4) always; Sat(5) only if workingDaysInWeek returned 6
    d.setDate(d.getDate() + (i < 5 ? i : 5))
    days.push(d)
  }
  return days
}

function rowH(laneCount: number) {
  const n = Math.max(1, laneCount)
  return n * LANE_H + (n - 1) * LANE_G + ROW_PAD * 2
}

function heatStyle(pct: number): { bg: string; color: string } {
  if (pct >= 90) return { bg: 'rgba(226,75,74,.14)',  color: '#e24b4a' }
  if (pct >= 70) return { bg: 'rgba(239,159,39,.14)', color: '#ef9f27' }
  if (pct >= 25) return { bg: 'rgba(29,158,117,.14)', color: '#1d9e75' }
  return { bg: 'transparent', color: '#6e7681' }
}

// ── Component ───────────────────────────────────────────────

interface Props {
  weeks: WeekColumn[]
  filter: FilterType
}

export function ResourceTimeline({ weeks, filter }: Props) {
  const supabase = createClient()
  const router   = useRouter()

  // ── Container width for dynamic column sizing ──────────────
  const containerRef = useRef<HTMLDivElement>(null)
  // Initialise from window.innerWidth so the very first render already has a
  // reasonable column width — no flash of narrow columns on page reload.
  const [containerW, setContainerW] = useState(() =>
    typeof window !== 'undefined' ? Math.max(0, window.innerWidth - SIDEBAR_W) : 0
  )

  // Keep containerW exact and up-to-date via ResizeObserver.
  // On client-side navigation the browser may not have committed layout yet
  // when useLayoutEffect fires, so we retry each frame until width > 0.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf: number
    const measure = (attempt = 0) => {
      const { width } = el.getBoundingClientRect()
      if (width > 0) {
        setContainerW(width)
      } else if (attempt < 30) {
        raf = requestAnimationFrame(() => measure(attempt + 1))
      }
    }
    measure()
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setContainerW(e.contentRect.width)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  // Divide available width equally across however many weeks are shown.
  // This means 8w and 12w both fill the screen with no horizontal scroll.
  // containerW is 0 only during SSR — fall back to MIN_COL in that case.
  const COL_W: number = containerW > 0
    ? Math.max(MIN_COL, Math.floor((containerW - NAME_W) / weeks.length))
    : MIN_COL

  // ── Expanded week state ────────────────────────────────────
  const [expandedWeekIdx, setExpandedWeekIdx] = useState<number | null>(null)

  const todayMonday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const todayIdx    = weeks.findIndex(w => isSameDay(w.monday, todayMonday))

  const expIdx  = expandedWeekIdx !== null && expandedWeekIdx < weeks.length ? expandedWeekIdx : null
  const expDays = expIdx !== null ? getWorkingDaysOfWeek(weeks[expIdx].monday) : []

  // Day cells divide the week column equally — total width never changes so
  // expanding a week produces zero additional horizontal scroll.
  const DAY_W: number = expDays.length > 0 ? COL_W / expDays.length : COL_W

  // Grid and total width are constant: expanding a week never shifts other weeks.
  const gridW  = weeks.length * COL_W
  const totalW = NAME_W + gridW

  /** x-offset of left edge of week[i] — constant regardless of expansion */
  function xOf(i: number): number { return i * COL_W }
  /** width of column i — always COL_W; day cells are rendered inside it */
  function wOf(_i: number): number { return COL_W }

  // ── Data ──────────────────────────────────────────────────
  const { data: people, isLoading: loadPeople } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, name, role, type, is_active, avatar_initials, avatar_color, default_hourly_rate')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as Person[]
    },
  })

  const { data: allocations, isLoading: loadAllocs } = useQuery({
    queryKey: ['allocations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('id, person_id, project_id, start_date, end_date, capacity_percent, hourly_rate, projects(id, name, client_name, color, status)')
      if (error) throw error
      return data as (Allocation & { projects: Project })[]
    },
  })

  // Cross-user updates rely on TanStack Query refetchOnWindowFocus rather than
  // a realtime channel — keeps us inside the Supabase free-tier message budget.
  const allActive = people ?? []

  function filterGroup(list: Person[]): Person[] {
    if (filter === 'developers') return list.filter(p => p.type === 'developer')
    if (filter === 'designers')  return list.filter(p => p.type === 'designer')
    if (filter === 'overloaded') {
      return list.filter(p => {
        const pa = (allocations ?? []).filter(a => a.person_id === p.id)
        return isPersonOverloaded(calculateWeeklyLoad(pa, weeks))
      })
    }
    return list
  }

  const devs      = filterGroup(allActive.filter(p => p.type === 'developer'))
  const designers = filterGroup(allActive.filter(p => p.type === 'designer'))
  const others    = filterGroup(allActive.filter(p => p.type !== 'developer' && p.type !== 'designer'))

  const teamHeatmap = people && allocations
    ? computeTeamLoadHeatmap(people, allocations, weeks)
    : weeks.map(() => 0)

  if (loadPeople || loadAllocs) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="space-y-2 w-64">
          {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded-lg bg-[#161b22] animate-pulse" />)}
        </div>
      </div>
    )
  }

  // ── Week header cells renderer ─────────────────────────────
  // flatMap is required: when a week is expanded, it produces multiple day cells.
  // A plain map would produce nested arrays which flex containers don't flatten.
  function renderHeaderCells() {
    return weeks.flatMap((week, i) => {
      if (i === expIdx) {
        return expDays.map((day, di) => {
          const isToday = isSameDay(day, new Date())
          return (
            <div
              key={`exp-hdr-${i}-${di}`}
              className="shrink-0 flex flex-col items-center justify-center cursor-pointer select-none"
              style={{
                width:      DAY_W,
                minWidth:   DAY_W,
                height:     40,
                borderLeft: di === 0 ? '2px solid rgba(88,166,255,.5)' : '1px solid #21262d',
                background: isToday ? 'rgba(88,166,255,.12)' : 'rgba(88,166,255,.05)',
              }}
              onClick={() => setExpandedWeekIdx(null)}
            >
              <span className="text-[9px] font-medium" style={{ color: isToday ? '#58a6ff' : '#8b949e' }}>
                {format(day, 'EEE')}
              </span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: isToday ? '#58a6ff' : '#c9d1d9' }}>
                {format(day, 'd')}
              </span>
            </div>
          )
        })
      }

      const isCurrent = i === todayIdx
      return [
        <div
          key={`hdr-${i}`}
          className="shrink-0 flex items-center justify-center relative cursor-pointer select-none group/wk"
          style={{
            width:      COL_W,
            minWidth:   COL_W,
            height:     40,
            borderLeft: '1px solid #21262d',
            background: isCurrent ? 'rgba(88,166,255,.08)' : 'transparent',
          }}
          onClick={() => setExpandedWeekIdx(i === expIdx ? null : i)}
        >
          <span
            className="text-[11px] tabular-nums group-hover/wk:text-[#c9d1d9] transition-colors"
            style={{ color: isCurrent ? '#58a6ff' : '#6e7681', fontWeight: isCurrent ? 600 : 400 }}
          >
            {week.label}
          </span>
          {isCurrent && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
              style={{ width: 4, height: 4, background: '#58a6ff' }} />
          )}
        </div>
      ]
    })
  }

  // ── Group renderer ─────────────────────────────────────────
  function renderGroup(label: string, personList: Person[]) {
    if (personList.length === 0) return null

    return (
      <div key={label}>
        {/* Group label */}
        <div className="flex border-b border-[#21262d]" style={{ width: totalW }}>
          <div
            className="sticky left-0 z-10 flex items-center gap-2 px-5 py-2 border-r border-[#21262d] shrink-0"
            style={{ width: NAME_W, background: '#0d1117' }}
          >
            <span className="text-[10px] font-bold tracking-[0.14em] text-[#484f58] uppercase">{label}</span>
            <span className="text-[10px] bg-[#21262d] text-[#6e7681] px-1.5 py-0.5 rounded">{personList.length}</span>
          </div>
          <div className="flex bg-[#0a0f14]" style={{ width: gridW }}>
            {weeks.map((_, i) => (
              <div key={i} style={{ width: wOf(i), minWidth: wOf(i), height: 30, borderLeft: '1px solid #161b22' }} />
            ))}
          </div>
        </div>

        {/* Person rows */}
        {personList.map(person => {
          const allocs     = (allocations ?? []).filter(a => a.person_id === person.id)
          const load       = calculateWeeklyLoad(allocs, weeks)
          const overloaded = isPersonOverloaded(load)
          const { bars, laneCount } = assignLanes(allocs as any, weeks)
          const rh         = rowH(laneCount)
          const refIdx     = todayIdx >= 0 ? todayIdx : 0
          const thisLoad   = load[refIdx] ?? 0
          const loadColor  = thisLoad > 100 ? '#e24b4a' : thisLoad > 80 ? '#ef9f27' : '#8b949e'

          // Visible window cost (uses fallback rate from person)
          const ws = weeks[0] ? format(weeks[0].monday, 'yyyy-MM-dd') : null
          const we = weeks[weeks.length - 1] ? format(weeks[weeks.length - 1].monday, 'yyyy-MM-dd') : null
          let visibleCost: number | null = null
          if (ws && we) {
            let total = 0, hasAny = false
            for (const a of allocs) {
              const rate = effectiveHourlyRate(a.hourly_rate, person.default_hourly_rate)
              if (rate == null) continue
              const s = a.start_date > ws ? a.start_date : ws
              const e = a.end_date   < we ? a.end_date   : we
              if (s > e) continue
              hasAny = true
              total += allocationCost(s, e, a.capacity_percent, rate) ?? 0
            }
            if (hasAny) visibleCost = total
          }

          return (
            <div
              key={person.id}
              className="flex border-b border-[#161b22] group"
              style={{ width: totalW, height: rh }}
            >
              {/* Name cell — sticky */}
              <div
                className="sticky left-0 z-10 flex items-center gap-2.5 px-4 shrink-0 border-r border-[#21262d] cursor-pointer"
                style={{ width: NAME_W, minWidth: NAME_W, height: rh, background: '#0d1117' }}
                onClick={() => router.push(`/people/${person.id}`)}
              >
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: person.avatar_color ?? '#1d9e75' }}
                >
                  {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#c9d1d9] truncate group-hover:text-white transition-colors leading-tight">
                    {person.name}
                  </p>
                  <p className="text-[10px] text-[#6e7681] truncate capitalize mt-0.5 leading-tight">
                    {person.role}
                    {person.default_hourly_rate != null && (
                      <span className="ml-1 text-[#3d444d]">· ₹{person.default_hourly_rate}/h</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  {thisLoad > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums" style={{ color: loadColor }}>
                      {thisLoad}%
                    </span>
                  )}
                  {visibleCost != null && (
                    <span className="text-[9px] text-[#484f58] tabular-nums">{formatCost(visibleCost)}</span>
                  )}
                  {overloaded && <div className="h-1.5 w-1.5 rounded-full bg-[#e24b4a]" />}
                </div>
              </div>

              {/* Gantt area */}
              <div className="relative" style={{ width: gridW, height: rh }}>

                {/* Column backgrounds */}
                {weeks.flatMap((_, i) => {
                  const bg =
                    load[i] > 100  ? 'rgba(226,75,74,.05)'  :
                    i === todayIdx ? 'rgba(88,166,255,.06)'  : 'transparent'

                  if (i === expIdx) {
                    return expDays.map((day, di) => (
                      <div
                        key={`cbg-${i}-${di}`}
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                          left:       xOf(i) + di * DAY_W,
                          width:      DAY_W,
                          borderLeft: di === 0 ? '2px solid rgba(88,166,255,.2)' : '1px solid #1c2128',
                          background: isSameDay(day, new Date()) ? 'rgba(88,166,255,.08)' : bg,
                        }}
                      />
                    ))
                  }
                  return [
                    <div
                      key={`cbg-${i}`}
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{ left: xOf(i), width: COL_W, borderLeft: '1px solid #161b22', background: bg }}
                    />
                  ]
                })}

                {/* Today marker */}
                {todayIdx >= 0 && (
                  <div
                    className="absolute top-0 bottom-0 pointer-events-none z-1"
                    style={{ left: xOf(todayIdx), width: 2, background: 'rgba(88,166,255,.3)' }}
                  />
                )}

                {/* Bars */}
                {bars.map(({ allocation: alloc, startCol, spanCols, lane }) => {
                  const project = alloc.projects as Project
                  if (!project) return null

                  const bs = getBarStyle(project)

                  // Default pixel edges (week-column granularity)
                  let barLeft  = xOf(startCol) + 3
                  let barRight = xOf(startCol + spanCols) - 3

                  // ── Day-level edge correction inside an expanded week ──────
                  // xOf(startCol + spanCols) reaches the START of the NEXT week,
                  // which overshoots when the allocation ends mid-week (e.g. Fri).
                  // Similarly, a bar starting mid-week should begin at the correct
                  // day column, not the week edge.
                  if (expIdx !== null) {
                    const endColOfBar = startCol + spanCols - 1

                    // Clamp RIGHT edge when bar ends inside the expanded week
                    if (endColOfBar === expIdx) {
                      const allocEnd = new Date(alloc.end_date + 'T00:00:00')
                      let lastDayIdx = expDays.length - 1
                      for (let d = expDays.length - 1; d >= 0; d--) {
                        if (expDays[d] <= allocEnd) { lastDayIdx = d; break }
                      }
                      barRight = xOf(expIdx) + (lastDayIdx + 1) * DAY_W - 3
                    }

                    // Clamp LEFT edge when bar starts inside the expanded week
                    if (startCol === expIdx) {
                      const allocStart = new Date(alloc.start_date + 'T00:00:00')
                      let firstDayIdx = 0
                      for (let d = 0; d < expDays.length; d++) {
                        if (expDays[d] >= allocStart) { firstDayIdx = d; break }
                      }
                      barLeft = xOf(expIdx) + firstDayIdx * DAY_W + 3
                    }
                  }

                  const barWidth = barRight - barLeft
                  const barTop   = ROW_PAD + lane * (LANE_H + LANE_G)
                  if (barWidth < 4) return null

                  // Issue 2: use effective rate (allocation rate → person default)
                  const rate  = effectiveHourlyRate(alloc.hourly_rate, person.default_hourly_rate)
                  const days  = workingDays(alloc.start_date, alloc.end_date, alloc.capacity_percent)
                  const hours = workingHours(alloc.start_date, alloc.end_date, alloc.capacity_percent)
                  const cost  = allocationCost(alloc.start_date, alloc.end_date, alloc.capacity_percent, rate)

                  return (
                    <Tooltip key={alloc.id}>
                      <TooltipTrigger
                        className="absolute flex items-center overflow-hidden cursor-pointer select-none"
                        style={{
                          left: barLeft, top: barTop, width: barWidth, height: LANE_H,
                          background: bs.bg, color: bs.text,
                          border: bs.border ? `1px solid ${bs.border}` : undefined,
                          borderRadius: 6, padding: '0 7px', transition: 'filter 120ms ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.2)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        <span className="text-[11px] font-medium truncate leading-none">{project.name}</span>
                        {alloc.capacity_percent < 100 && barWidth > 80 && (
                          <span className="ml-1.5 text-[10px] opacity-60 shrink-0">{alloc.capacity_percent}%</span>
                        )}
                      </TooltipTrigger>

                      <TooltipContent
                        side="top"
                        className="border-[#30363d] text-[#e6edf3]"
                        style={{ background: '#1c2128' }}
                      >
                        <div className="space-y-1.5 text-xs min-w-50">
                          <div className="flex items-center gap-2">
                            {project.color && (
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                            )}
                            <p className="font-semibold text-[#e6edf3]">{project.name}</p>
                          </div>
                          <p className="text-[#8b949e]">{project.client_name}</p>
                          <p className="text-[#8b949e]">
                            {formatDate(alloc.start_date, 'dd MMM')} – {formatDate(alloc.end_date, 'dd MMM')}
                            <span className="ml-2 font-medium text-[#c9d1d9]">{alloc.capacity_percent}%</span>
                          </p>
                          <div className="border-t border-[#30363d] pt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                            <span className="text-[#6e7681]">Working days</span>
                            <span className="text-[#c9d1d9] font-medium tabular-nums text-right">{days}d</span>
                            <span className="text-[#6e7681]">Working hours</span>
                            <span className="text-[#c9d1d9] font-medium tabular-nums text-right">{hours}h</span>
                            {cost != null ? (
                              <>
                                <span className="text-[#6e7681]">
                                  Est. cost{rate !== alloc.hourly_rate ? ' *' : ''}
                                </span>
                                <span className="text-[#1d9e75] font-semibold tabular-nums text-right">{formatCost(cost)}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[#6e7681]">Rate</span>
                                <span className="text-[#484f58] text-right">not set</span>
                              </>
                            )}
                            {rate != null && (
                              <>
                                <span className="text-[#6e7681]">Rate</span>
                                <span className="text-[#484f58] tabular-nums text-right">
                                  ₹{rate}/h{rate !== alloc.hourly_rate ? ' (default)' : ''}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────
  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[#0d1117]">
      <div style={{ width: totalW, minWidth: totalW }}>

        {/* Week header — sticky top.
            minWidth is required: when position:sticky is active some browsers
            constrain the element to the scroll-container viewport width, which
            hides day cells that are beyond the original viewport edge. */}
        <div
          className="flex border-b border-[#30363d] sticky top-0 z-20"
          style={{ height: 40, width: totalW, minWidth: totalW, background: '#0d1117', overflow: 'visible' }}
        >
          <div
            className="sticky left-0 z-30 flex items-center gap-2 px-5 border-r border-[#30363d] shrink-0"
            style={{ width: NAME_W, minWidth: NAME_W, height: 40, background: '#0d1117' }}
          >
            <span className="text-[11px] font-medium text-[#6e7681]">Team member</span>
            {expIdx !== null && (
              <span className="text-[9px] text-[#58a6ff]/50 ml-1">click day to close</span>
            )}
          </div>
          {renderHeaderCells()}
        </div>

        {/* Groups */}
        {renderGroup('Developers', devs)}
        {renderGroup('Designers', designers)}
        {others.length > 0 && renderGroup('Other', others)}

        {devs.length === 0 && designers.length === 0 && others.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-[#6e7681]">No team members match this filter.</p>
          </div>
        )}

        {/* Team load heatmap */}
        <div className="flex border-t-2 border-[#30363d]" style={{ width: totalW, background: '#0d1117' }}>
          <div
            className="sticky left-0 z-10 flex items-center px-5 border-r border-[#30363d] shrink-0"
            style={{ width: NAME_W, minWidth: NAME_W, height: 34, background: '#0d1117' }}
          >
            <span className="text-[10px] font-bold tracking-[0.14em] text-[#484f58] uppercase">Team load</span>
          </div>
          {teamHeatmap.flatMap((pct, i) => {
            const hs = heatStyle(pct)
            if (i === expIdx) {
              return expDays.map((_, di) => (
                <div
                  key={`ht-${i}-${di}`}
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    width: DAY_W, minWidth: DAY_W, height: 34,
                    borderLeft: di === 0 ? '2px solid rgba(88,166,255,.2)' : '1px solid #1c2128',
                    background: hs.bg,
                  }}
                >
                  <span className="text-[9px] font-medium tabular-nums" style={{ color: hs.color }}>
                    {pct > 0 ? `${pct}%` : '—'}
                  </span>
                </div>
              ))
            }
            return [
              <div
                key={`ht-${i}`}
                className="shrink-0 flex items-center justify-center"
                style={{ width: COL_W, minWidth: COL_W, height: 34, borderLeft: '1px solid #161b22', background: hs.bg }}
              >
                <span className="text-[10px] font-medium tabular-nums" style={{ color: hs.color }}>
                  {pct > 0 ? `${pct}%` : '—'}
                </span>
              </div>
            ]
          })}
        </div>

      </div>
    </div>
  )
}
