'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { addWeeks, startOfWeek, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResourceTimeline } from '@/components/timeline/ResourceTimeline'
import { generateWeekColumns } from '@/lib/utils/timeline'

type FilterType = 'all' | 'developers' | 'designers' | 'overloaded'
const WEEK_OPTIONS = [8, 12] as const
const VALID_FILTERS: FilterType[] = ['all', 'developers', 'designers', 'overloaded']

export default function TimelinePage() {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  // ── Read state from URL (with safe fallbacks) ──────────────
  const weekCount: 8 | 12 = (() => {
    const w = parseInt(searchParams.get('w') ?? '')
    return w === 12 ? 12 : 8
  })()

  const filter: FilterType = (() => {
    const f = searchParams.get('f') as FilterType
    return VALID_FILTERS.includes(f) ? f : 'all'
  })()

  const startDate: Date = (() => {
    const from = searchParams.get('from')
    if (from) {
      const d = new Date(from + 'T00:00:00')
      if (!isNaN(d.getTime())) return startOfWeek(d, { weekStartsOn: 1 })
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  })()

  // ── Write state to URL (replace so back-button skips intermediate states) ──
  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([k, v]) => params.set(k, v))
    router.replace(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const weeks = generateWeekColumns(weekCount, startDate)

  function goBack()    { setParams({ from: format(addWeeks(startDate, -Math.floor(weekCount / 3)), 'yyyy-MM-dd') }) }
  function goForward() { setParams({ from: format(addWeeks(startDate,  Math.floor(weekCount / 3)), 'yyyy-MM-dd') }) }
  function goToday()   { setParams({ from: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') }) }

  const endDate   = addWeeks(startDate, weekCount - 1)
  const rangeLabel = `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] select-none">

      {/* ── Controls bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 h-12 border-b border-[#30363d] shrink-0">

        <span className="text-sm font-semibold text-[#e6edf3] mr-1">Timeline</span>

        <div className="h-4 w-px bg-[#30363d]" />

        {/* Prev / range label / Next */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={goBack}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-[#c9d1d9] px-2 min-w-42.5 text-center tabular-nums">
            {rangeLabel}
          </span>
          <button
            onClick={goForward}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={goToday}
          className="text-xs px-2.5 py-1 rounded text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#21262d] transition-colors"
        >
          Today
        </button>

        {/* Jump-to date */}
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-[11px] text-[#6e7681]">From</span>
          <input
            type="date"
            value={format(startDate, 'yyyy-MM-dd')}
            onChange={e => {
              if (e.target.value) setParams({ from: e.target.value })
            }}
            className="text-xs border border-[#30363d] rounded px-2 py-1 bg-[#21262d] text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff] transition-colors cursor-pointer"
          />
        </div>

        <div className="h-4 w-px bg-[#30363d]" />

        {/* Week count — 8w / 12w only */}
        <div className="flex items-center gap-0.5">
          {WEEK_OPTIONS.map(w => (
            <button
              key={w}
              onClick={() => setParams({ w: String(w) })}
              className={cn(
                'text-xs px-2.5 py-1 rounded transition-colors',
                weekCount === w
                  ? 'bg-[#21262d] text-[#e6edf3]'
                  : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]/60'
              )}
            >
              {w}w
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[#30363d]" />

        {/* Filter */}
        <div className="flex items-center gap-0.5">
          {VALID_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setParams({ f })}
              className={cn(
                'text-xs px-2.5 py-1 rounded capitalize transition-colors',
                filter === f
                  ? 'bg-[#21262d] text-[#e6edf3]'
                  : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]/60'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-5">
          {([
            { label: 'Active',     color: '#1d9e75' },
            { label: 'Pipeline',   color: '#484f58' },
            { label: 'On hold',    color: '#d4537e' },
            { label: 'Overloaded', color: '#e24b4a' },
          ] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm" style={{ background: color }} />
              <span className="text-[10px] text-[#6e7681]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Gantt ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <ResourceTimeline weeks={weeks} filter={filter} />
      </div>
    </div>
  )
}
