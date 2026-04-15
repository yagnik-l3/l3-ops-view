import { addWeeks, startOfWeek, format, parseISO } from 'date-fns'
import type { Allocation, Person, Project, PersonType } from '@/lib/supabase/types'

export interface WeekColumn {
  monday: Date
  label: string
  isoString: string
}

export interface AllocationBar {
  allocation: Allocation
  project: Project
  startCol: number
  endCol: number
  spanCols: number
}

export interface PersonRow {
  person: Person
  bars: AllocationBar[]
  weeklyLoad: number[] // capacity % per week (0-100+)
  isOverloaded: boolean
}

export interface FreeSlot {
  person: Person
  freeFrom: Date
  nextPipelineProject?: Project
}

export interface HireSignal {
  role: PersonType
  avgUtilization: number
  fromWeek: Date
  toWeek: Date
  weekCount: number
}

/** Generate week columns starting from the Monday of fromDate (defaults to current Monday) */
export function generateWeekColumns(weeksCount = 12, fromDate?: Date): WeekColumn[] {
  const base = fromDate ?? new Date()
  const startMonday = startOfWeek(base, { weekStartsOn: 1 })
  return Array.from({ length: weeksCount }, (_, i) => {
    const monday = addWeeks(startMonday, i)
    return {
      monday,
      label: format(monday, 'dd MMM'),
      isoString: format(monday, 'yyyy-MM-dd'),
    }
  })
}

/**
 * Given an allocation and week columns, compute which columns it spans.
 * Uses raw start_date/end_date — no Monday normalization.
 * A week column covers [monday, monday+7). The allocation overlaps if:
 *   allocStart < weekEnd  AND  allocEnd >= weekMonday
 */
export function getAllocationColumns(
  allocation: Allocation,
  weeks: WeekColumn[]
): { startCol: number; endCol: number; spanCols: number } {
  const allocStart = parseISO(allocation.start_date)
  const allocEnd   = parseISO(allocation.end_date)

  let startCol = -1
  let endCol   = -1

  weeks.forEach((week, i) => {
    const weekEnd = addWeeks(week.monday, 1)
    if (allocStart < weekEnd && allocEnd >= week.monday) {
      if (startCol === -1) startCol = i
      endCol = i
    }
  })

  if (startCol === -1) return { startCol: -1, endCol: -1, spanCols: 0 }
  return { startCol, endCol, spanCols: endCol - startCol + 1 }
}

/**
 * Peak single-day load for a set of allocations within one week.
 * Iterates Mon–Sun, sums capacities for allocations active on each day,
 * returns the highest single-day total.
 * ISO date string comparison (YYYY-MM-DD) is lexicographically equivalent
 * to chronological order, so no Date parsing or timezone issues.
 */
function weekPeakLoad(allocations: Allocation[], weekMonday: Date): number {
  let peak = 0
  for (let d = 0; d < 7; d++) {
    const day = new Date(weekMonday)
    day.setDate(day.getDate() + d)
    const dayStr = format(day, 'yyyy-MM-dd')
    const load = allocations
      .filter(a => a.start_date <= dayStr && a.end_date >= dayStr)
      .reduce((sum, a) => sum + a.capacity_percent, 0)
    if (load > peak) peak = load
  }
  return peak
}

/**
 * Calculate weekly load for a person across all their allocations.
 * Returns the PEAK single-day load for each week, not the naive sum of all
 * allocations that touch the week. This prevents false overloads from
 * sequential (non-concurrent) allocations that both fall within the same
 * Mon–Sun calendar week.
 */
export function calculateWeeklyLoad(
  allocations: Allocation[],
  weeks: WeekColumn[]
): number[] {
  return weeks.map(week => weekPeakLoad(allocations, week.monday))
}

/** Check if a person is overloaded (>100% in any week) */
export function isPersonOverloaded(weeklyLoad: number[]): boolean {
  return weeklyLoad.some(load => load > 100)
}

/** Find when a person next becomes free */
export function getPersonFreeDate(allocations: Allocation[]): Date | null {
  if (!allocations.length) return new Date()
  const latestEnd = allocations
    .map(a => parseISO(a.end_date))
    .sort((a, b) => b.getTime() - a.getTime())[0]
  // next day after allocation ends
  const freeFrom = new Date(latestEnd)
  freeFrom.setDate(freeFrom.getDate() + 1)
  return freeFrom <= new Date() ? new Date() : freeFrom
}

/** Compute hire signals: 3+ consecutive weeks >80% average for a role */
export function computeHireSignals(
  people: Person[],
  allocations: Allocation[],
  weeks: WeekColumn[],
  threshold = 80,
  consecutiveWeeks = 3
): HireSignal[] {
  const signals: HireSignal[] = []
  const roleTypes: PersonType[] = ['developer', 'designer']

  for (const roleType of roleTypes) {
    const rolespeople = people.filter(p => p.type === roleType && p.is_active)
    if (!rolespeople.length) continue

    const weeklyAvg = weeks.map(week => {
      const totalCapacity = rolespeople.reduce((sum, person) => {
        const personAllocs = allocations.filter(a => a.person_id === person.id)
        return sum + weekPeakLoad(personAllocs, week.monday)
      }, 0)
      return rolespeople.length ? totalCapacity / rolespeople.length : 0
    })

    // Find consecutive stretches above threshold
    let streak = 0
    let streakStart = 0
    for (let i = 0; i < weeklyAvg.length; i++) {
      if (weeklyAvg[i] >= threshold) {
        if (streak === 0) streakStart = i
        streak++
        if (streak >= consecutiveWeeks) {
          const avgUtil = weeklyAvg
            .slice(streakStart, i + 1)
            .reduce((s, v) => s + v, 0) / (i - streakStart + 1)

          signals.push({
            role: roleType,
            avgUtilization: Math.round(avgUtil),
            fromWeek: weeks[streakStart].monday,
            toWeek: weeks[i].monday,
            weekCount: streak,
          })
          break // one signal per role type is enough
        }
      } else {
        streak = 0
      }
    }
  }

  return signals
}

export interface LanedBar {
  allocation: Allocation & { projects: Project }
  startCol: number
  spanCols: number
  lane: number
}

/**
 * Assign allocations to non-overlapping lanes so concurrent projects stack
 * vertically without overlap. Returns an array of LanedBars and the total
 * lane count.
 */
export function assignLanes(
  allocations: (Allocation & { projects: Project })[],
  weeks: WeekColumn[]
): { bars: LanedBar[]; laneCount: number } {
  if (!allocations.length) return { bars: [], laneCount: 1 }

  // Sort by start_date so greedy placement works correctly
  const sorted = [...allocations].sort(
    (a, b) => a.start_date.localeCompare(b.start_date)
  )

  // laneEnds[i] = the last endCol used in lane i
  const laneEnds: number[] = []
  const bars: LanedBar[] = []

  for (const alloc of sorted) {
    const { startCol, spanCols } = getAllocationColumns(alloc, weeks)
    if (spanCols <= 0) continue

    const endCol = startCol + spanCols - 1

    // Find first lane that is free
    let lane = laneEnds.findIndex(end => end < startCol)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(endCol)
    } else {
      laneEnds[lane] = endCol
    }

    bars.push({ allocation: alloc, startCol, spanCols, lane })
  }

  return { bars, laneCount: Math.max(1, laneEnds.length) }
}

/** Team load heatmap: avg peak daily capacity used across all active people per week */
export function computeTeamLoadHeatmap(
  people: Person[],
  allocations: Allocation[],
  weeks: WeekColumn[]
): number[] {
  const activePeople = people.filter(p => p.is_active)
  if (!activePeople.length) return weeks.map(() => 0)

  return weeks.map(week => {
    const total = activePeople.reduce((sum, person) => {
      const personAllocs = allocations.filter(a => a.person_id === person.id)
      return sum + Math.min(100, weekPeakLoad(personAllocs, week.monday))
    }, 0)
    return Math.round(total / activePeople.length)
  })
}
