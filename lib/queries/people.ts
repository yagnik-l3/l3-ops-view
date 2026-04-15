import { createClient } from '@/lib/supabase/client'
import type { PersonInsert, Person } from '@/lib/supabase/types'

export async function getPeople() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getPersonById(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('people')
    .select(`*, allocations(*, projects(*))`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createPerson(person: PersonInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('people')
    .insert(person)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePerson(id: string, updates: Partial<Person>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('people')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
