import { createClient } from '@/lib/supabase/client'
import type { AllocationInsert, Allocation } from '@/lib/supabase/types'

export async function getAllocations() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('allocations')
    .select(`*, people(*), projects(*)`)
    .order('start_date')
  if (error) throw error
  return data
}

export async function getAllocationsByPerson(personId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('allocations')
    .select(`*, projects(*)`)
    .eq('person_id', personId)
    .order('start_date')
  if (error) throw error
  return data
}

export async function getAllocationsByProject(projectId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('allocations')
    .select(`*, people(*)`)
    .eq('project_id', projectId)
    .order('start_date')
  if (error) throw error
  return data
}

export async function createAllocation(allocation: AllocationInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('allocations')
    .insert(allocation)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAllocation(id: string, updates: Partial<Allocation>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('allocations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAllocation(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('allocations').delete().eq('id', id)
  if (error) throw error
}
