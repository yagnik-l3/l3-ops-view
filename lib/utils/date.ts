import { format, formatDistanceToNow, parseISO, startOfWeek, addWeeks, differenceInDays } from 'date-fns'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'

const IST = 'Asia/Kolkata'

export function toIST(date: Date | string): Date {
  const d = typeof date === 'string' ? parseISO(date) : date
  return toZonedTime(d, IST)
}

export function formatDate(date: Date | string | null | undefined, fmt = 'dd MMM yyyy'): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatInTimeZone(d, IST, fmt)
}

export function formatShortDate(date: Date | string | null | undefined): string {
  return formatDate(date, 'dd MMM')
}

export function formatMonthYear(date: Date | string | null | undefined): string {
  return formatDate(date, 'MMM yyyy')
}

export function daysRemaining(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null
  return differenceInDays(parseISO(targetDate), new Date())
}

export function getWeekMonday(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function getWeeksFromNow(weeks: number): Date {
  return addWeeks(getWeekMonday(), weeks)
}

export function getMondayString(date: Date = new Date()): string {
  return format(getWeekMonday(date), 'yyyy-MM-dd')
}

export function formatRelative(date: string): string {
  return formatDistanceToNow(parseISO(date), { addSuffix: true })
}

/**
 * Snap a date string to the Monday of its calendar week (floor).
 * Used for end_week normalization: "ends April 24" → Monday April 20.
 */
export function toMondayFloor(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

/**
 * Normalize a start_week string to the correct Monday anchor.
 * - Mon–Fri  → floor to the Monday of that week  (Apr 14 Tue  → Apr 13)
 * - Sat–Sun  → advance to the NEXT Monday         (Apr 18 Sat  → Apr 20)
 *
 * Rationale: Saturday is the last working day of the current week; an allocation
 * "starting on Saturday" almost always means the next full working week.
 */
export function toMondayCeil(dateStr: string): string {
  const d   = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay() // 0 = Sun, 6 = Sat
  const floor = startOfWeek(d, { weekStartsOn: 1 })
  if (dow === 0 || dow === 6) {
    // Weekend → next Monday
    return format(addWeeks(floor, 1), 'yyyy-MM-dd')
  }
  // Mon–Fri → this week's Monday
  return format(floor, 'yyyy-MM-dd')
}
