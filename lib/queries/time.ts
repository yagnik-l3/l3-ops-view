import { createClient } from '@/lib/supabase/client'
import type { TimeEntry, Project, Allocation, Person } from '@/lib/supabase/types'

export type TimeEntryWithRels = TimeEntry & {
  people: Pick<Person, 'id' | 'name' | 'avatar_initials' | 'avatar_color'> | null
  projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'> | null
}

/** Projects the person had ANY allocation overlap with on a given date.
 *  Allows back-logging during the 7-day window even if today's allocations changed. */
export async function getAllocationProjectsForDate(personId: string, date: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('allocations')
    .select('id, project_id, start_date, end_date, capacity_percent, projects(id, name, client_name, status, color)')
    .eq('person_id', personId)
    .lte('start_date', date)
    .gte('end_date', date)
    .order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as Array<Allocation & { projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'> }>
}

export type AllocationWithDeadline = Allocation & {
  projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color' | 'start_date' | 'target_end_date' | 'actual_end_date'> | null
}

/** Current + upcoming allocations for a person (allocation end_date today or later),
 *  joined with project deadline fields. Powers the "Your projects" panel on /log. */
export async function getActivePersonAllocations(personId: string, today: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('allocations')
    .select('id, project_id, start_date, end_date, capacity_percent, projects(id, name, client_name, status, color, start_date, target_end_date, actual_end_date)')
    .eq('person_id', personId)
    .gte('end_date', today)
    .order('end_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as AllocationWithDeadline[]
}

export async function getEntriesForDate(personId: string, date: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('person_id', personId)
    .eq('date', date)
  if (error) throw error
  return (data ?? []) as TimeEntry[]
}

/** Returns the most recent date <= `before` for which the person has any entries. */
export async function getMostRecentEntryDate(personId: string, before: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('time_entries')
    .select('date')
    .eq('person_id', personId)
    .lt('date', before)
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0]?.date ?? null
}

export type UpsertRow = {
  id?: string | null
  person_id: string
  project_id: string
  date: string
  hours: number
  work_log: string | null
}

export async function upsertTimeEntries(rows: UpsertRow[], createdBy: string) {
  const supabase = createClient()
  const payload = rows.map(r => ({
    person_id: r.person_id,
    project_id: r.project_id,
    date: r.date,
    hours: r.hours,
    work_log: r.work_log,
    updated_at: new Date().toISOString(),
    created_by: createdBy,
  }))
  const { error } = await supabase
    .from('time_entries')
    .upsert(payload, { onConflict: 'person_id,project_id,date' })
  if (error) throw error
}

export async function deleteTimeEntry(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  if (error) throw error
}

export type FeedFilters = {
  before?: string | null  // ISO date string, exclusive cursor
  limit?: number
  personId?: string | null
  projectId?: string | null
  fromDate?: string | null
  toDate?: string | null
}

export async function getFeed(filters: FeedFilters = {}) {
  const supabase = createClient()
  const limit = filters.limit ?? 50
  let q = supabase
    .from('time_entries')
    .select('*, people(id, name, avatar_initials, avatar_color), projects(id, name, client_name, status, color)')
    .not('work_log', 'is', null)
    .neq('work_log', '')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filters.personId) q = q.eq('person_id', filters.personId)
  if (filters.projectId) q = q.eq('project_id', filters.projectId)
  if (filters.fromDate) q = q.gte('date', filters.fromDate)
  if (filters.toDate) q = q.lte('date', filters.toDate)
  if (filters.before) q = q.lt('date', filters.before)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as TimeEntryWithRels[]
}

export async function getProjectTimeSummary(projectId: string, fromDate: string, toDate: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('time_entries')
    .select('*, people(id, name, avatar_initials, avatar_color)')
    .eq('project_id', projectId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Array<TimeEntry & { people: Pick<Person, 'id' | 'name' | 'avatar_initials' | 'avatar_color'> | null }>
}

export async function getPersonTimeSummary(personId: string, fromDate: string, toDate: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('time_entries')
    .select('*, projects(id, name, client_name, status, color)')
    .eq('person_id', personId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Array<TimeEntry & { projects: Pick<Project, 'id' | 'name' | 'client_name' | 'status' | 'color'> | null }>
}

/** Every time entry logged on a single date, across all people — joined with
 *  person + project. Powers the team-wide day snapshot on /feed. */
export async function getDayTimeEntries(date: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('time_entries')
    .select('*, people(id, name, avatar_initials, avatar_color), projects(id, name, client_name, status, color)')
    .eq('date', date)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TimeEntryWithRels[]
}

/** All time_entries for a project during a month range — used by finance for actuals. */
export async function getMonthTimeEntries(fromDate: string, toDate: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('time_entries')
    .select('person_id, project_id, date, hours')
    .gte('date', fromDate)
    .lte('date', toDate)
  if (error) throw error
  return (data ?? []) as Pick<TimeEntry, 'person_id' | 'project_id' | 'date' | 'hours'>[]
}

/** Lightweight project lookup for joining client-side. */
export async function getAllProjectsLite() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color')
    .order('name')
  if (error) throw error
  return (data ?? []) as Array<{ id: string; name: string; color: string | null }>
}
