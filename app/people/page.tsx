'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PersonCard } from '@/components/people/PersonCard'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Person, Allocation, Project } from '@/lib/supabase/types'

type FilterType = 'all' | 'developers' | 'designers'

export default function PeoplePage() {
  const supabase = createClient()
  const router = useRouter()
  const [filter, setFilter] = useState<FilterType>('all')

  const { data: people, isLoading: loadingPeople } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data as Person[]
    },
  })

  const { data: allAllocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['allocations_with_projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations').select('*, projects(*)')
        .order('start_date', { ascending: false })
      if (error) throw error
      return data as (Allocation & { projects: Project })[]
    },
  })

  const isLoading = loadingPeople || loadingAllocs

  const filteredPeople = (people ?? []).filter(p => {
    if (filter === 'developers') return p.type === 'developer'
    if (filter === 'designers') return p.type === 'designer'
    return true
  })

  function getPersonAllocs(personId: string) {
    return (allAllocations ?? []).filter(a => a.person_id === personId)
  }

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">People</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Team capacity and allocation overview</p>
        </div>
        <div className="text-xs text-[#6e7681]">
          {filteredPeople.length} member{filteredPeople.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {(['all', 'developers', 'designers'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md capitalize transition-colors',
              filter === f
                ? 'bg-[#21262d] text-[#e6edf3]'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]/60'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-52 w-full rounded-lg bg-[#161b22]" />
          ))}
        </div>
      ) : filteredPeople.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#30363d] py-20 text-center">
          <p className="text-sm text-[#6e7681]">No team members found</p>
          <p className="text-xs text-[#3d444d] mt-1">Add people in Settings to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPeople.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              allocations={getPersonAllocs(person.id)}
              onClick={() => router.push(`/people/${person.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
