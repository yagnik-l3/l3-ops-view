'use client'

import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import type { Person, Project } from '@/lib/supabase/types'

interface FreeSlotCardProps {
  person: Person
  freeFrom: Date
  nextProject?: Project
}

export function FreeSlotCard({ person, freeFrom, nextProject }: FreeSlotCardProps) {
  const isNow = freeFrom <= new Date()

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5">
      <div
        className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
        style={{ backgroundColor: person.avatar_color ?? '#1D9E75' }}
      >
        {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800">{person.name}</p>
        <p className="text-xs text-zinc-400">
          {isNow ? 'Available now' : `Free from ${format(freeFrom, 'dd MMM')}`}
          {nextProject && (
            <span className="text-zinc-400"> · {person.role}</span>
          )}
        </p>
      </div>
      {nextProject && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 flex-shrink-0">
          <ArrowRight className="h-3 w-3" />
          <span className="truncate max-w-[100px]">{nextProject.name}</span>
        </div>
      )}
    </div>
  )
}
