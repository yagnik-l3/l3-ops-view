import { createClient } from '@/lib/supabase/client'
import type { ProjectInsert, Project } from '@/lib/supabase/types'

export async function getProjects() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getProjectById(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select(`*, allocations(*, people(*))`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createProject(project: ProjectInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProject(id: string, updates: Partial<Project>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProject(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}
