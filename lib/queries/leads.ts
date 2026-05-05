import { createClient } from '@/lib/supabase/client'
import type { Lead, LeadInsert, LeadUpdate, LeadStatus, LeadSource, ConnectVia } from '@/lib/supabase/types'

const PAGE_SIZE = 25

export interface LeadsFilter {
  status?: LeadStatus | 'all'
  source?: LeadSource | 'all'
  connect_via?: ConnectVia | 'all'
  poc?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export async function getLeads(filter: LeadsFilter = {}, cursor?: number): Promise<Lead[]> {
  const supabase = createClient()
  let query = supabase
    .from('leads')
    .select('*')
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)

  if (cursor) query = query.lt('id', cursor)
  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)
  if (filter.source && filter.source !== 'all') query = query.eq('source', filter.source)
  if (filter.connect_via && filter.connect_via !== 'all') query = query.eq('connect_via', filter.connect_via)
  if (filter.poc) query = query.ilike('poc', `%${filter.poc}%`)
  if (filter.dateFrom) query = query.gte('date_of_first_approach', filter.dateFrom)
  if (filter.dateTo) query = query.lte('date_of_first_approach', filter.dateTo)
  if (filter.search) {
    query = query.or(
      `client_name.ilike.%${filter.search}%,company_name.ilike.%${filter.search}%,contact_detail.ilike.%${filter.search}%`,
    )
  }

  const { data, error } = await query
  if (error) throw error
  return data as Lead[]
}

export async function getLeadsKpi(dateFrom?: string, dateTo?: string) {
  const supabase = createClient()

  // Same period drives both lists: KPI counts/sales are scoped to leads
  // that converted in [dateFrom, dateTo] (matched against converted_date).
  // Counts (interested / not_converted etc.) use the same period filtered
  // against date_of_first_approach so the snapshot is internally consistent.
  const [{ data: rows, error }, { data: salesRows, error: salesError }] = await Promise.all([
    (() => {
      let q = supabase.from('leads').select('status')
      if (dateFrom) q = q.gte('date_of_first_approach', dateFrom)
      if (dateTo)   q = q.lte('date_of_first_approach', dateTo)
      return q
    })(),
    (() => {
      let q = supabase
        .from('leads')
        .select('converted_amount')
        .eq('status', 'done')
        .not('converted_amount', 'is', null)
      if (dateFrom) q = q.gte('converted_date', dateFrom)
      if (dateTo)   q = q.lte('converted_date', dateTo)
      return q
    })(),
  ])

  if (error) throw error
  if (salesError) throw salesError

  const statusRows   = rows  as { status: LeadStatus }[]
  const total        = statusRows.length
  const converted    = statusRows.filter(r => r.status === 'done').length
  const notConverted = statusRows.filter(r => r.status === 'not_converted').length
  const interested   = statusRows.filter(r => r.status === 'interested').length
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0
  const totalSales   = (salesRows as { converted_amount: number | null }[])
    .reduce((sum, r) => sum + (r.converted_amount ?? 0), 0)

  return { total, converted, notConverted, interested, conversionRate, totalSales }
}

export async function createLead(lead: LeadInsert): Promise<Lead> {
  const supabase = createClient()
  const { data, error } = await supabase.from('leads').insert(lead).select().single()
  if (error) throw error
  return data as Lead
}

export async function updateLead(id: number, updates: LeadUpdate): Promise<Lead> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Lead
}

export async function deleteLead(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export { PAGE_SIZE }
