'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Briefcase, AlertTriangle } from 'lucide-react'
import { getActivePersonAllocations, type AllocationWithDeadline } from '@/lib/queries/time'
import { projectDaysRemaining, formatShortDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils'

interface Props {
  personId: string
}

const FINISHED = new Set(['completed', 'lost'])
const DAY_MS = 86_400_000
const todayIso = () => format(new Date(), 'yyyy-MM-dd')

// Shared vertical geometry of the timeline (px). The axis sits at AXIS_Y;
// deadline dates render above it and countdown boxes below, staggered between
// two depths so neighbouring markers don't collide in the narrow log column.
const AXIS_Y = 46
const TRACK_H = 162
const BOX_TOP = [62, 100]
// How many days out the "danger zone" heat band reaches from today.
const DANGER_DAYS = 14
// Markers are kept inside this percentage band so end labels don't clip the panel.
const EDGE_PAD = 7

type Urgency = 'overdue' | 'critical' | 'warn' | 'ok'

function urgencyOf(days: number | null): Urgency {
  if (days === null) return 'ok'
  if (days < 0) return 'overdue'
  if (days <= 3) return 'critical'
  if (days <= 7) return 'warn'
  return 'ok'
}

const URGENCY_COLOR: Record<Urgency, string> = {
  overdue:  '#e24b4a',
  critical: '#e24b4a',
  warn:     '#ef9f27',
  ok:       '#6e7681',
}

/** "Your projects" panel on /log — a horizontal deadline timeline tuned to make
 *  pressure visible: a danger-zone heat band near today, bold countdown boxes,
 *  and the single most urgent deadline pulsing like a radar ping. */
export function AllocatedProjectsPanel({ personId }: Props) {
  const today = todayIso()

  const { data: allocations, isLoading } = useQuery({
    queryKey: ['log_active_allocations', personId, today],
    queryFn: () => getActivePersonAllocations(personId, today),
  })

  // Live allocations on non-finished projects, soonest deadline first.
  const live = useMemo(() => {
    return (allocations ?? [])
      .filter(a => a.projects && !FINISHED.has(a.projects.status))
      .sort((a, b) => {
        const da = a.projects?.target_end_date ?? null
        const db = b.projects?.target_end_date ?? null
        if (da && db) return da.localeCompare(db)
        if (da) return -1
        if (db) return 1
        return 0
      })
  }, [allocations])

  const dated   = useMemo(() => live.filter(a => a.projects?.target_end_date), [live])
  const undated = useMemo(() => live.filter(a => !a.projects?.target_end_date), [live])

  // Axis spans from the earliest of {today, soonest deadline} to the latest
  // deadline — so overdue projects sit to the left of the Today marker.
  const { minMs, maxMs } = useMemo(() => {
    const todayMs = parseISO(today).getTime()
    const ds = dated.map(a => parseISO(a.projects!.target_end_date!).getTime())
    return {
      minMs: Math.min(todayMs, ...ds),
      maxMs: Math.max(todayMs, ...ds),
    }
  }, [dated, today])

  // Map a timestamp to a percentage along the track, kept inside the edge pad.
  // When every deadline lands on the same day, spread markers evenly instead.
  function pctOf(ms: number, idx = 0, count = 1) {
    if (maxMs === minMs) {
      return count <= 1 ? 50 : EDGE_PAD + (idx / (count - 1)) * (100 - 2 * EDGE_PAD)
    }
    return EDGE_PAD + ((ms - minMs) / (maxMs - minMs)) * (100 - 2 * EDGE_PAD)
  }

  if (isLoading) {
    return <div className="h-48 rounded-xl border border-[#30363d] bg-[#161b22] animate-pulse mb-5" />
  }
  if (live.length === 0) return null

  const todayMs   = parseISO(today).getTime()
  const todayPct  = pctOf(todayMs)

  // Urgency tallies drive the header badge and the panel's border tint.
  const overdueCount = dated.filter(a => urgencyOf(projectDaysRemaining(a.projects!)) === 'overdue').length
  const urgentCount  = dated.filter(a => urgencyOf(projectDaysRemaining(a.projects!)) !== 'ok').length

  // Danger zone — a heat band from the overdue region / today, fading right.
  const hasOverdue     = overdueCount > 0
  const dangerStartPct = hasOverdue ? EDGE_PAD : todayPct
  const dangerEndPct   = Math.min(pctOf(todayMs + DANGER_DAYS * DAY_MS), 100)
  const dangerWidthPct = Math.max(0, dangerEndPct - dangerStartPct)

  const panelBorder =
    overdueCount > 0       ? 'border-[#e24b4a]/40'
    : urgentCount > 0      ? 'border-[#ef9f27]/35'
    : 'border-[#30363d]'

  return (
    <div className={cn('rounded-xl border bg-[#161b22] p-4 mb-5', panelBorder)}>
      <div className="flex items-center gap-2 mb-1">
        <Briefcase className="h-3.5 w-3.5 text-[#58a6ff]" />
        <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">Your projects</h2>
        <span className="text-[11px] text-[#6e7681]">· deadline timeline</span>
        {urgentCount > 0 && (
          <span
            className={cn(
              'ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
              overdueCount > 0
                ? 'text-[#e24b4a] bg-[#e24b4a]/12'
                : 'text-[#ef9f27] bg-[#ef9f27]/12'
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            {overdueCount > 0 ? `${overdueCount} overdue` : `${urgentCount} due soon`}
          </span>
        )}
      </div>

      {dated.length > 0 ? (
        <div className="relative" style={{ height: TRACK_H }}>
          {/* Axis */}
          <div
            className="absolute left-0 right-0 rounded-full bg-[#30363d]"
            style={{ top: AXIS_Y, height: 2 }}
          />
          {/* Arrow head */}
          <div
            className="absolute h-0 w-0"
            style={{
              right: -1,
              top: AXIS_Y - 3,
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
              borderLeft: '6px solid #30363d',
            }}
          />

          {/* Danger zone — heat band + blurred glow, hottest near today */}
          {dangerWidthPct > 0 && (
            <>
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${dangerStartPct}%`,
                  width: `${dangerWidthPct}%`,
                  top: AXIS_Y - 5,
                  height: 12,
                  filter: 'blur(7px)',
                  background:
                    'linear-gradient(to right, rgba(226,75,74,.55), rgba(239,159,39,.3) 45%, transparent)',
                }}
              />
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${dangerStartPct}%`,
                  width: `${dangerWidthPct}%`,
                  top: AXIS_Y - 2,
                  height: 6,
                  background:
                    'linear-gradient(to right, rgba(226,75,74,.9), rgba(239,159,39,.55) 45%, rgba(239,159,39,0))',
                }}
              />
              <div
                className="absolute flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.16em] text-[#e24b4a]/80 whitespace-nowrap pointer-events-none"
                style={{ left: `${dangerStartPct}%`, top: AXIS_Y + 8 }}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Danger zone
              </div>
            </>
          )}

          {/* Today marker */}
          <div
            className="absolute"
            style={{ left: `${todayPct}%`, top: 0, bottom: 0, transform: 'translateX(-50%)' }}
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-0 text-[10px] font-bold text-[#58a6ff] whitespace-nowrap">
              Today
            </div>
            <div
              className="absolute left-1/2 -translate-x-1/2 border-l border-[#58a6ff]/60"
              style={{ top: 16, height: AXIS_Y - 16 }}
            />
            <div
              className="absolute left-1/2 rounded-full bg-[#58a6ff] ring-2 ring-[#161b22]"
              style={{ top: AXIS_Y - 4, height: 8, width: 8, transform: 'translateX(-50%)' }}
            />
          </div>

          {/* Project deadline markers — index 0 is the most urgent (the "hero") */}
          {dated.map((a, i) => (
            <DeadlineMarker
              key={a.id}
              alloc={a}
              today={today}
              isHero={i === 0}
              leftPct={pctOf(parseISO(a.projects!.target_end_date!).getTime(), i, dated.length)}
              boxTop={BOX_TOP[i % 2]}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#6e7681] py-2">No project deadlines to show.</p>
      )}

      {/* Projects with no deadline set — listed as chips below the timeline */}
      {undated.length > 0 && (
        <div className="mt-1 pt-3 border-t border-[#21262d] flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[#6e7681]">No deadline</span>
          {undated.map(a => {
            const p = a.projects!
            return (
              <Link
                key={a.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-1.5 text-[11px] text-[#8b949e] hover:text-[#58a6ff] transition-colors"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.color ?? '#58a6ff' }}
                />
                <span className="truncate max-w-30">{p.name}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DeadlineMarker({
  alloc,
  leftPct,
  boxTop,
  isHero,
  today,
}: {
  alloc: AllocationWithDeadline
  leftPct: number
  boxTop: number
  isHero: boolean
  today: string
}) {
  const p = alloc.projects
  if (!p || !p.target_end_date) return null

  const days       = projectDaysRemaining(p)
  const urg        = urgencyOf(days)
  const color      = urg === 'ok' ? (p.color ?? '#58a6ff') : URGENCY_COLOR[urg]
  const isUpcoming = alloc.start_date > today
  // The hero marker pulses only when it is genuinely urgent — a calm timeline
  // shouldn't scream when nothing is actually due.
  const pulse      = isHero && urg !== 'ok' && !isUpcoming

  const dotSize = isHero ? 18 : 11

  const countNum   = days === null ? '—' : String(Math.abs(days))
  const countLabel = urg === 'overdue' ? 'overdue' : days === 0 ? 'due today' : 'left'

  const boxClass =
    urg === 'overdue' || urg === 'critical'
      ? 'border-[#e24b4a]/60 bg-[#e24b4a]/12 text-[#e24b4a]'
      : urg === 'warn'
        ? 'border-[#ef9f27]/55 bg-[#ef9f27]/10 text-[#ef9f27]'
        : 'border-[#30363d] bg-[#21262d] text-[#8b949e]'

  return (
    <div
      className="absolute"
      style={{ left: `${leftPct}%`, top: 0, bottom: 0, transform: 'translateX(-50%)' }}
    >
      {/* Deadline date — above the axis */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-[10px] tabular-nums whitespace-nowrap"
        style={{ top: 4, color: urg === 'ok' ? '#8b949e' : color }}
      >
        {formatShortDate(p.target_end_date)}
      </div>

      {/* Stem: date label down to the axis */}
      <div
        className="absolute left-1/2 -translate-x-1/2 border-l border-dashed"
        style={{ top: 18, height: AXIS_Y - 18, borderColor: `${color}55` }}
      />

      {/* Stem: axis down to the countdown box */}
      <div
        className="absolute left-1/2 -translate-x-1/2 border-l border-[#30363d]"
        style={{ top: AXIS_Y + 6, height: boxTop - (AXIS_Y + 6) }}
      />

      {/* Dot on the axis — hero is enlarged, pulses + glows when urgent */}
      <span
        className="absolute left-1/2"
        style={{
          top: AXIS_Y - dotSize / 2,
          height: dotSize,
          width: dotSize,
          transform: 'translateX(-50%)',
        }}
      >
        {pulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: color, opacity: 0.65 }}
          />
        )}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: isUpcoming ? '#161b22' : color,
            border: `2px solid ${color}`,
            boxShadow: isHero ? `0 0 12px 1px ${color}` : '0 0 0 2px #161b22',
          }}
        />
      </span>

      {/* Countdown box + project name — below the axis, staggered */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: boxTop }}>
        <div
          className={cn(
            'flex flex-col items-center justify-center rounded-md border w-14 py-1',
            boxClass
          )}
          style={isHero && pulse ? { boxShadow: `0 0 14px -2px ${color}` } : undefined}
        >
          <div className="flex items-baseline gap-0.5 leading-none">
            <span className="text-xl font-extrabold tabular-nums">{countNum}</span>
            <span className="text-[10px] font-bold">d</span>
          </div>
          <span className="text-[7px] font-bold uppercase tracking-[0.12em] mt-0.5">
            {countLabel}
          </span>
        </div>
        <Link
          href={`/projects/${p.id}`}
          className="mt-1 block w-14 text-center text-[10px] font-medium text-[#c9d1d9] truncate hover:text-[#58a6ff] transition-colors"
        >
          {p.name}
        </Link>
        {isUpcoming && (
          <span className="mt-0.5 block text-center text-[8px] uppercase tracking-wider text-[#58a6ff]">
            upcoming
          </span>
        )}
      </div>
    </div>
  )
}
