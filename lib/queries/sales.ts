import { createClient } from '@/lib/supabase/client'
import type { DealInsert, Deal, SalesTarget } from '@/lib/supabase/types'

export async function getDeals() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getSalesTargets() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sales_targets')
    .select('*')
    .order('month', { ascending: false })
    .limit(12)
  if (error) throw error
  return data
}

export async function getCurrentMonthTarget() {
  const supabase = createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]

  const { data, error } = await supabase
    .from('sales_targets')
    .select('*')
    .eq('month', monthStart)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createDeal(deal: DealInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('deals')
    .insert(deal)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateDeal(id: string, updates: Partial<Deal>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('deals')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function upsertSalesTarget(target: Partial<SalesTarget> & { month: string }) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sales_targets')
    .upsert(target, { onConflict: 'month' })
    .select()
    .single()
  if (error) throw error
  return data
}
