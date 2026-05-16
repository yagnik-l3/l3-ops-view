'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, startOfWeek, addDays, parseISO } from 'date-fns'

export type DailyEntry = {
  date: string
  hours: number
  projects?: Array<{ id: string; name: string; color?: string | null; hours: number }>
}

interface Props {
  entries: DailyEntry[]
  /** Number of weeks to render (default 52 = 1 year). */
  weeks?: number
  /** End date of the graph (rightmost column). Defaults to today. */
  endDate?: Date
  cellSize?: number
  cellGap?: number
  showWeekdayLabels?: boolean
  showMonthLabels?: boolean
  showLegend?: boolean
  /** When provided, the cell popover shows an "Edit this day" action. */
  onEditDay?: (iso: string) => void
}

function shade(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (hours <= 0) return 0
  if (hours <= 3) return 1
  if (hours <= 6) return 2
  if (hours <= 8) return 3
  return 4
}

const SHADE_BG = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] as const
const SHADE_BORDER = ['#21262d', '#0e4429', '#006d32', '#26a641', '#39d353'] as const

const POPOVER_WIDTH = 260
const POPOVER_HEIGHT_ESTIMATE = 220   // generous max; popover content is short
const VIEWPORT_PADDING = 8
const CELL_GAP_FROM_POPOVER = 8

export function ContributionGraph({
  entries,
  weeks = 52,
  endDate = new Date(),
  cellSize = 12,
  cellGap = 3,
  showWeekdayLabels = true,
  showMonthLabels = true,
  showLegend = true,
  onEditDay,
}: Props) {
  const [hoveredIso, setHoveredIso] = useState<string | null>(null)
  const [pinnedIso, setPinnedIso] = useState<string | null>(null)
  const [cellRect, setCellRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => setMounted(true), [])

  const activeIso = pinnedIso ?? hoveredIso

  // Track the active cell's screen position, even while scrolling or resizing.
  useLayoutEffect(() => {
    if (!activeIso) {
      setCellRect(null)
      return
    }
    const update = () => {
      const el = cellRefs.current.get(activeIso)
      if (el) setCellRect(el.getBoundingClientRect())
    }
    update()
    // capture phase so we catch overflow-scrollable ancestors as well as window
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [activeIso])

  // Pin click outside-to-close
  useEffect(() => {
    if (!pinnedIso) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const cellEl = cellRefs.current.get(pinnedIso)
      const popoverEl = document.querySelector('[data-contribution-popover]')
      if (popoverEl?.contains(target)) return
      if (cellEl?.contains(target)) return
      setPinnedIso(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [pinnedIso])

  const { weekCols, monthMarkers, totalHours, byDate } = useMemo(() => {
    const dateMap = new Map<string, DailyEntry>()
    let totalH = 0
    for (const e of entries) {
      const cur = dateMap.get(e.date)
      if (cur) {
        cur.hours += Number(e.hours)
        if (e.projects && e.projects.length) {
          cur.projects = (cur.projects ?? []).concat(e.projects)
        }
      } else {
        dateMap.set(e.date, {
          date: e.date,
          hours: Number(e.hours),
          projects: e.projects ? [...e.projects] : undefined,
        })
      }
      totalH += Number(e.hours)
    }

    const lastDay = endDate
    const lastWeekStart = startOfWeek(lastDay, { weekStartsOn: 1 })
    const firstWeekStart = addDays(lastWeekStart, -7 * (weeks - 1))

    type Cell = { iso: string; hours: number; date: Date; inFuture: boolean }
    const cols: Cell[][] = []
    let cursor = firstWeekStart
    for (let w = 0; w < weeks; w++) {
      const col: Cell[] = []
      for (let d = 0; d < 7; d++) {
        const day = addDays(cursor, d)
        const iso = format(day, 'yyyy-MM-dd')
        col.push({
          iso,
          hours: dateMap.get(iso)?.hours ?? 0,
          date: day,
          inFuture: day > lastDay,
        })
      }
      cols.push(col)
      cursor = addDays(cursor, 7)
    }

    const markers: { col: number; label: string }[] = []
    let lastMonth = -1
    for (let i = 0; i < cols.length; i++) {
      const m = cols[i][0].date.getMonth()
      if (m !== lastMonth) {
        markers.push({ col: i, label: format(cols[i][0].date, 'MMM') })
        lastMonth = m
      }
    }

    return { weekCols: cols, monthMarkers: markers, totalHours: totalH, byDate: dateMap }
  }, [entries, weeks, endDate])

  const activeEntry: DailyEntry | null = activeIso
    ? byDate.get(activeIso) ?? { date: activeIso, hours: 0, projects: [] }
    : null

  // Compute fixed-position style for the portal popover, flipping to keep it on screen.
  const popoverStyle = useMemo<React.CSSProperties | null>(() => {
    if (!cellRect || typeof window === 'undefined') return null
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = cellRect.left + cellRect.width / 2 - POPOVER_WIDTH / 2
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - POPOVER_WIDTH - VIEWPORT_PADDING))

    let top = cellRect.bottom + CELL_GAP_FROM_POPOVER
    // Flip above if it would clip the bottom of the viewport
    if (top + POPOVER_HEIGHT_ESTIMATE > vh - VIEWPORT_PADDING) {
      top = cellRect.top - POPOVER_HEIGHT_ESTIMATE - CELL_GAP_FROM_POPOVER
      // If even above is off-screen (very short viewport), clamp into view
      if (top < VIEWPORT_PADDING) top = VIEWPORT_PADDING
    }

    return {
      position: 'fixed',
      left,
      top,
      width: POPOVER_WIDTH,
      zIndex: 1000,
    }
  }, [cellRect])

  const labelWidth = showWeekdayLabels ? 30 : 0
  const monthLabelHeight = showMonthLabels ? 16 : 0
  const gridWidth = weekCols.length * (cellSize + cellGap)
  const gridHeight = 7 * (cellSize + cellGap)

  return (
    <div className="text-[10px] text-[#6e7681]">
      <div
        className="relative"
        style={{ paddingLeft: labelWidth, paddingTop: monthLabelHeight }}
      >
        {showMonthLabels && (
          <div className="absolute top-0" style={{ left: labelWidth, width: gridWidth, height: monthLabelHeight }}>
            {monthMarkers.map(m => (
              <span
                key={`${m.col}-${m.label}`}
                className="absolute"
                style={{ left: m.col * (cellSize + cellGap) }}
              >
                {m.label}
              </span>
            ))}
          </div>
        )}

        {showWeekdayLabels && (
          <div className="absolute" style={{ left: 0, top: monthLabelHeight, width: labelWidth, height: gridHeight }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <span
                key={i}
                className="absolute leading-none"
                style={{ top: i * (cellSize + cellGap) + (cellSize - 10) / 2 }}
              >
                {d}
              </span>
            ))}
          </div>
        )}

        <div onMouseLeave={() => setHoveredIso(null)}>
          <div className="flex" style={{ gap: cellGap }}>
            {weekCols.map((col, ci) => (
              <div key={ci} className="flex flex-col" style={{ gap: cellGap }}>
                {col.map(cell => {
                  const s = shade(cell.hours)
                  const isActive = activeIso === cell.iso
                  return (
                    <div
                      key={cell.iso}
                      ref={(el) => {
                        if (el) cellRefs.current.set(cell.iso, el)
                        else cellRefs.current.delete(cell.iso)
                      }}
                      role="button"
                      tabIndex={cell.inFuture ? -1 : 0}
                      onMouseEnter={() => !cell.inFuture && setHoveredIso(cell.iso)}
                      onClick={() => {
                        if (cell.inFuture) return
                        setPinnedIso(prev => prev === cell.iso ? null : cell.iso)
                      }}
                      className="rounded-[2px] transition-transform"
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: cell.inFuture ? 'transparent' : SHADE_BG[s],
                        borderColor: isActive ? '#58a6ff' : (cell.inFuture ? 'transparent' : SHADE_BORDER[s]),
                        borderWidth: cell.inFuture ? 0 : isActive ? 2 : 1,
                        opacity: cell.inFuture ? 0.15 : 1,
                        cursor: cell.inFuture ? 'default' : 'pointer',
                        transform: isActive ? 'scale(1.15)' : undefined,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showLegend && (
        <div className="flex items-center justify-end gap-1.5 mt-3 pr-1">
          <span>{totalHours.toFixed(0)}h total</span>
          <span className="ml-2">Less</span>
          {[0, 1, 2, 3, 4].map(s => (
            <div
              key={s}
              className="rounded-[2px]"
              style={{
                width: cellSize - 2,
                height: cellSize - 2,
                backgroundColor: SHADE_BG[s],
                borderColor: SHADE_BORDER[s],
                borderWidth: 1,
              }}
            />
          ))}
          <span>More</span>
        </div>
      )}

      {/* Tooltip rendered via portal so no ancestor overflow can clip it */}
      {mounted && activeEntry && popoverStyle && createPortal(
        <div
          data-contribution-popover
          style={popoverStyle}
          className="bg-[#0d1117] border border-[#30363d] rounded-lg shadow-2xl p-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#21262d]">
            <span className="text-[#e6edf3] font-medium">
              {format(parseISO(activeEntry.date), 'EEE, dd MMM yyyy')}
            </span>
            <span className="text-[#1d9e75] font-semibold tabular-nums">
              {activeEntry.hours.toFixed(1)}h
            </span>
          </div>
          {activeEntry.projects && activeEntry.projects.length > 0 ? (
            <div className="space-y-1.5">
              {[...activeEntry.projects]
                .sort((a, b) => b.hours - a.hours)
                .map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.color ?? '#58a6ff' }}
                    />
                    <span className="text-[#c9d1d9] flex-1 min-w-0 truncate">{p.name}</span>
                    <span className="text-[#8b949e] tabular-nums">{p.hours.toFixed(1)}h</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-[#6e7681]">
              {activeEntry.hours > 0 ? 'No project breakdown.' : 'No hours logged.'}
            </p>
          )}
          {onEditDay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEditDay(activeEntry.date)
                setPinnedIso(null)
              }}
              className="mt-2 pt-2 w-full border-t border-[#21262d] text-[11px] text-[#58a6ff] hover:text-[#79b8ff] text-left transition-colors"
            >
              Edit this day →
            </button>
          )}
          {pinnedIso === activeEntry.date && !onEditDay && (
            <p className="text-[10px] text-[#484f58] mt-2 pt-2 border-t border-[#21262d]">
              Click anywhere outside to dismiss
            </p>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
