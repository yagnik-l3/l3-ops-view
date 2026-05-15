'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Briefcase, AlertCircle } from 'lucide-react'
import { formatINR } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { Project, Person, Allocation } from '@/lib/supabase/types'

type AllocationFull = Allocation & { people: Person | null; projects: Project | null }

export interface PersonRowLite {
  person: Person
  salary: number
  plannedCost: number
  actualCost: number
  plannedHours: number
  actualHours: number
  realBench: number
  actualUtilPct: number
  plannedUtilPct: number
}

interface Props {
  year: number
  month: number
  personRows: PersonRowLite[]
  allocations: AllocationFull[]
  hoursByDay: Map<string, number>
}

const ROW_H = 24
const ROW_GAP = 4

function monthBounds(year: number, month: number): { startMs: number; endMs: number; days: number } {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0) // last day
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    days: end.getDate(),
  }
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Full-width allocations view for the selected month — one row per person with
 *  their allocations as colored bars across a day-grid, planned vs actual hours
 *  summary on the left. Sits as a top-level section on /finance, never nested. */
export function AllocationsStrip({ year, month, personRows, allocations, hoursByDay }: Props) {
  const { startMs, endMs, days } = useMemo(() => monthBounds(year, month), [year, month])
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`

  // People sorted: those with the biggest planned-vs-actual gap first, then
  // bench, then everyone else. Founders and people with no salary go last.
  const rows = useMemo(() => {
    return personRows
      .map(r => {
        const personAllocs = allocations.filter(
          a =>
            a.person_id === r.person.id &&
            a.start_date <= isoOf(new Date(endMs)) &&
            a.end_date >= isoOf(new Date(startMs)) &&
            a.projects?.status !== 'lost',
        )
        // Per-day logged-hours sparkline for the month (1 number per day).
        const sparkline = new Array(days).fill(0)
        for (let d = 1; d <= days; d++) {
          const iso = `${monthPrefix}${String(d).padStart(2, '0')}`
          // Sum all hours logged for this person on this date.
          let h = 0
          for (const [key, v] of hoursByDay) {
            if (!key.startsWith(`${r.person.id}|`)) continue
            if (!key.endsWith(`|${iso}`)) continue
            h += v
          }
          sparkline[d - 1] = h
        }
        return { ...r, allocs: personAllocs, sparkline }
      })
      .filter(r => r.allocs.length > 0 || r.actualHours > 0 || r.salary > 0)
      .sort((a, b) => {
        if (a.person.type === 'founder' && b.person.type !== 'founder') return 1
        if (b.person.type === 'founder' && a.person.type !== 'founder') return -1
        return (b.salary ?? 0) - (a.salary ?? 0)
      })
  }, [personRows, allocations, hoursByDay, days, monthPrefix, startMs, endMs])

  // Tick positions for the day grid (every Monday + month start/end).
  // Computed before the early-return so React hook order is stable.
  const ticks = useMemo(() => {
    const out: { day: number; isWeekStart: boolean }[] = []
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month - 1, d)
      const dow = date.getDay()
      if (d === 1 || d === days || dow === 1) out.push({ day: d, isWeekStart: dow === 1 })
    }
    return out
  }, [year, month, days])

  if (rows.length === 0) return null

  function pctOf(iso: string): number {
    const ms = new Date(iso + 'T00:00:00').getTime()
    const clamped = Math.max(startMs, Math.min(endMs, ms))
    return ((clamped - startMs) / (endMs - startMs)) * 100
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#30363d] flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-md bg-[#58a6ff]/15 border border-[#58a6ff]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Briefcase className="h-4 w-4 text-[#58a6ff]" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-[#e6edf3]">Allocations · This Month</h2>
            <p className="text-xs text-[#6e7681] mt-0.5">
              Bars = planned allocations · sparkline below each row = actual hours logged per day
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#6e7681] mt-1">
          <Legend swatch="#58a6ff" label="Planned bar" />
          <Legend swatch="#1D9E75" label="Actual hrs (sparkline)" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d]">
              <th className="text-left px-5 py-2 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide w-[220px]">Person</th>
              <th className="text-right px-3 py-2 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide w-[110px]">Planned · Actual</th>
              <th className="text-left px-5 py-2 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">
                <div className="relative h-3">
                  {ticks.map(t => (
                    <span
                      key={t.day}
                      className={cn(
                        'absolute top-0 -translate-x-1/2 text-[9px] tabular-nums',
                        t.isWeekStart ? 'text-[#8b949e]' : 'text-[#484f58]',
                      )}
                      style={{ left: `${((t.day - 1) / (days - 1)) * 100}%` }}
                    >
                      {t.day}
                    </span>
                  ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isOver = r.actualUtilPct > 100 || r.plannedUtilPct > 100
              const hasBench = r.realBench > 0 && r.person.type !== 'founder' && r.salary > 0
              const maxSpark = Math.max(8, ...r.sparkline)

              return (
                <tr
                  key={r.person.id}
                  className={cn(
                    'border-b border-[#30363d]/60 last:border-0',
                    i % 2 === 1 && 'bg-[#0d1117]/30',
                  )}
                >
                  {/* Person column */}
                  <td className="px-5 py-3 align-top">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                        style={{
                          backgroundColor: (r.person.avatar_color ?? '#484f58') + '33',
                          color: r.person.avatar_color ?? '#8b949e',
                        }}
                      >
                        {r.person.avatar_initials ?? r.person.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#c9d1d9] truncate">{r.person.name}</p>
                        <p className="text-[10px] text-[#6e7681] capitalize">{r.person.role}</p>
                      </div>
                    </div>
                  </td>

                  {/* Summary numbers */}
                  <td className="px-3 py-3 text-right align-top">
                    <div className="text-xs tabular-nums text-[#8b949e]">
                      {Math.round(r.plannedHours)}h <span className="text-[#484f58]">plan</span>
                    </div>
                    <div className="text-xs tabular-nums text-[#c9d1d9] mt-0.5 font-medium">
                      {Math.round(r.actualHours)}h <span className="text-[#484f58]">actual</span>
                    </div>
                    {hasBench && (
                      <div className="text-[10px] tabular-nums text-[#EF9F27] mt-0.5">
                        bench {formatINR(r.realBench)}
                      </div>
                    )}
                    {isOver && (
                      <div className="flex items-center justify-end gap-0.5 mt-0.5 text-[9px] text-[#e24b4a]">
                        <AlertCircle className="h-2.5 w-2.5" /> overloaded
                      </div>
                    )}
                  </td>

                  {/* Timeline: allocation bars + actual sparkline */}
                  <td className="px-5 py-3">
                    <div className="relative" style={{ height: r.allocs.length * (ROW_H + ROW_GAP) + 28 }}>
                      {/* Subtle weekly grid lines */}
                      {ticks.map(t => (
                        <span
                          key={t.day}
                          className="absolute top-0 bottom-0 w-px bg-[#21262d]"
                          style={{ left: `${((t.day - 1) / (days - 1)) * 100}%` }}
                        />
                      ))}

                      {/* Allocation bars */}
                      {r.allocs.map((a, idx) => {
                        const p = a.projects
                        if (!p) return null
                        const left = pctOf(a.start_date)
                        const right = pctOf(a.end_date)
                        const width = Math.max(0.5, right - left)
                        const color = p.color ?? '#58a6ff'
                        const opacity = 0.25 + Math.min(0.55, (a.capacity_percent / 100) * 0.55)
                        return (
                          <Link
                            key={a.id}
                            href={`/projects/${p.id}`}
                            className="absolute rounded-md flex items-center px-2 text-[10px] font-medium tracking-tight text-[#e6edf3] hover:ring-1 hover:ring-white/30 transition-shadow truncate"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              top: idx * (ROW_H + ROW_GAP),
                              height: ROW_H,
                              backgroundColor: color,
                              opacity,
                            }}
                            title={`${p.name} · ${a.capacity_percent}% · ${a.start_date} → ${a.end_date}`}
                          >
                            <span className="truncate">{p.name} · {a.capacity_percent}%</span>
                          </Link>
                        )
                      })}

                      {/* Actual hours sparkline along the bottom */}
                      <div
                        className="absolute left-0 right-0 flex items-end gap-px"
                        style={{
                          top: r.allocs.length * (ROW_H + ROW_GAP) + 4,
                          height: 18,
                        }}
                      >
                        {r.sparkline.map((h, di) => {
                          const heightPct = h > 0 ? Math.max(8, Math.min(100, (h / maxSpark) * 100)) : 0
                          const isOverDay = h > 8
                          return (
                            <span
                              key={di}
                              className="flex-1 rounded-sm transition-colors"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor: h === 0
                                  ? 'transparent'
                                  : isOverDay
                                    ? '#e24b4a'
                                    : h >= 6
                                      ? '#1D9E75'
                                      : '#39d35355',
                                minHeight: h > 0 ? 2 : 0,
                              }}
                              title={h > 0 ? `Day ${di + 1}: ${h}h logged` : ''}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-3 rounded-sm inline-block" style={{ backgroundColor: swatch }} />
      {label}
    </span>
  )
}
