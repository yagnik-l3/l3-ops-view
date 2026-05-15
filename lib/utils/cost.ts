const HOURS_PER_DAY = 8

// ── Working day helpers ─────────────────────────────────────────────────────

/**
 * Returns true if `date` is a working Saturday (not the 2nd or 4th Saturday of the month).
 */
function isWorkingSaturday(date: Date): boolean {
  const nth = Math.ceil(date.getDate() / 7)
  return nth !== 2 && nth !== 4
}

/**
 * Working days in a week whose Monday is `monday`.
 * Mon–Fri always (5) + Saturday unless 2nd or 4th of month.
 */
export function workingDaysInWeek(monday: Date): number {
  const sat = new Date(monday)
  sat.setDate(sat.getDate() + 5)
  return isWorkingSaturday(sat) ? 6 : 5
}

/**
 * Total working days in a calendar month (1-indexed month).
 * Used to convert monthly salary → daily rate.
 */
export function workingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dow = date.getDay()
    if (dow === 0) continue // Sunday
    if (dow === 6 && !isWorkingSaturday(date)) continue // holiday Saturday
    count++
  }
  return count
}

/**
 * Returns true if a given date is a working day (Mon–Sat, excluding 2nd/4th Saturday).
 */
function isWorkingDay(date: Date): boolean {
  const dow = date.getDay()
  if (dow === 0) return false // Sunday
  if (dow === 6) return isWorkingSaturday(date)
  return true
}

/**
 * Working days for an allocation.
 * start_date / end_date are ISO date strings (YYYY-MM-DD).
 * Iterates every calendar day in [start_date, end_date] and counts working days.
 * Capacity is applied: a person at 80% works 80% of the available days.
 */
export function workingDays(startDate: string, endDate: string, capacityPercent: number): number {
  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T00:00:00')
  let days = 0
  const cur = new Date(start)
  while (cur <= end) {
    if (isWorkingDay(cur)) days++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.round(days * (capacityPercent / 100))
}

/** Working hours = working days × 8 */
export function workingHours(startDate: string, endDate: string, capacityPercent: number): number {
  return workingDays(startDate, endDate, capacityPercent) * HOURS_PER_DAY
}

// ── Effective rate ──────────────────────────────────────────────────────────

/**
 * Returns the effective hourly rate for an allocation.
 * Priority: allocation.hourly_rate → person.default_hourly_rate → null
 */
export function effectiveHourlyRate(
  allocationRate: number | null,
  personDefaultRate: number | null | undefined,
): number | null {
  return allocationRate ?? personDefaultRate ?? null
}

// ── Cost calculations ───────────────────────────────────────────────────────

/**
 * Hourly-rate-based cost for an allocation.
 * Falls back to `fallbackRate` if allocation rate is null.
 * Returns null only if both are null.
 */
export function allocationCost(
  startDate: string,
  endDate: string,
  capacityPercent: number,
  hourlyRate: number | null,
  fallbackRate?: number | null,
): number | null {
  const rate = hourlyRate ?? fallbackRate ?? null
  if (rate == null) return null
  return workingHours(startDate, endDate, capacityPercent) * rate
}

/**
 * Salary-based cost for an allocation.
 * For each day in [start_date, end_date], adds (capacity% / month_working_days) × monthly_salary.
 * Properly handles partial weeks at start/end.
 */
export function allocationSalaryCost(
  startDate: string,
  endDate: string,
  capacityPercent: number,
  monthlySalary: number | null,
): number | null {
  if (monthlySalary == null) return null

  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T00:00:00')
  let totalCost = 0
  const cur = new Date(start)

  while (cur <= end) {
    if (isWorkingDay(cur)) {
      const year  = cur.getFullYear()
      const month = cur.getMonth() + 1 // 1-indexed
      const monthDays = workingDaysInMonth(year, month)
      if (monthDays > 0) {
        totalCost += (capacityPercent / 100 / monthDays) * monthlySalary
      }
    }
    cur.setDate(cur.getDate() + 1)
  }

  return Math.round(totalCost)
}

/**
 * Format a YYYY-MM-DD date string from a Date.
 */
function dateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Planned cost only: salary share for the (capacity_percent / 100) of each
 * working day in the allocation × month overlap. Ignores any logged hours.
 * Use this to answer "what was this allocation supposed to cost?".
 */
export function plannedAllocationCost(
  alloc: { start_date: string; end_date: string; capacity_percent: number },
  monthlySalary: number | null,
  monthStart: string,
  monthEnd: string,
): number {
  if (monthlySalary == null) return 0

  const overlapStart = alloc.start_date > monthStart ? alloc.start_date : monthStart
  const overlapEnd = alloc.end_date < monthEnd ? alloc.end_date : monthEnd
  if (overlapStart > overlapEnd) return 0

  const start = new Date(overlapStart + 'T00:00:00')
  const end = new Date(overlapEnd + 'T00:00:00')

  let totalCost = 0
  const cur = new Date(start)
  while (cur <= end) {
    if (isWorkingDay(cur)) {
      const year = cur.getFullYear()
      const month = cur.getMonth() + 1
      const monthDays = workingDaysInMonth(year, month)
      if (monthDays > 0) {
        totalCost += (alloc.capacity_percent / 100 / monthDays) * monthlySalary
      }
    }
    cur.setDate(cur.getDate() + 1)
  }
  return Math.round(totalCost)
}

/**
 * Daily hybrid cost: for each working day in the allocation × month overlap,
 * if actual hours were logged that day for (person, project), cost the day at
 * (actual_hours / 8 / month_working_days) × monthly_salary; otherwise cost it
 * at the planned (capacity% / month_working_days) × monthly_salary share.
 *
 * Returns the total cost plus a count of how many working days came from
 * actuals vs planned — used by the UI to badge each project row.
 */
export function effectiveAllocationCost(
  alloc: {
    start_date: string
    end_date: string
    capacity_percent: number
    person_id: string
    project_id: string
  },
  monthlySalary: number | null,
  monthStart: string,
  monthEnd: string,
  hoursByDay: Map<string, number>,
): { cost: number; actualDays: number; plannedDays: number } {
  if (monthlySalary == null) return { cost: 0, actualDays: 0, plannedDays: 0 }

  const overlapStart = alloc.start_date > monthStart ? alloc.start_date : monthStart
  const overlapEnd = alloc.end_date < monthEnd ? alloc.end_date : monthEnd
  if (overlapStart > overlapEnd) return { cost: 0, actualDays: 0, plannedDays: 0 }

  const start = new Date(overlapStart + 'T00:00:00')
  const end = new Date(overlapEnd + 'T00:00:00')

  let totalCost = 0
  let actualDays = 0
  let plannedDays = 0
  const cur = new Date(start)

  while (cur <= end) {
    if (isWorkingDay(cur)) {
      const year = cur.getFullYear()
      const month = cur.getMonth() + 1
      const monthDays = workingDaysInMonth(year, month)
      if (monthDays > 0) {
        const iso = dateIso(cur)
        const key = `${alloc.person_id}|${alloc.project_id}|${iso}`
        const actualHours = hoursByDay.get(key)
        if (actualHours != null && actualHours > 0) {
          // Cap at a full day so an over-logged day doesn't exceed 100% capacity attribution.
          const cappedHours = Math.min(actualHours, HOURS_PER_DAY)
          totalCost += (cappedHours / HOURS_PER_DAY / monthDays) * monthlySalary
          actualDays++
        } else {
          totalCost += (alloc.capacity_percent / 100 / monthDays) * monthlySalary
          plannedDays++
        }
      }
    }
    cur.setDate(cur.getDate() + 1)
  }

  return { cost: Math.round(totalCost), actualDays, plannedDays }
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** Format a rupee amount with K / L shorthand */
export function formatCost(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`
  if (amount >= 1000)   return `₹${(amount / 1000).toFixed(1)}K`
  return `₹${Math.round(amount)}`
}
