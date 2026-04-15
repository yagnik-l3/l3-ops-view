'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Person } from '@/lib/supabase/types'

interface AvatarStackProps {
  people: Pick<Person, 'id' | 'name' | 'avatar_initials' | 'avatar_color'>[]
  max?: number
  size?: 'sm' | 'md'
}

export function AvatarStack({ people, max = 4, size = 'sm' }: AvatarStackProps) {
  const shown = people.slice(0, max)
  const rest = people.length - max

  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'

  return (
    <div className="flex -space-x-1.5">
      {shown.map(person => (
        <Tooltip key={person.id}>
          <TooltipTrigger
            className={cn(
              'rounded-full border-2 border-white flex items-center justify-center font-medium text-white cursor-default',
              sizeClasses
            )}
            style={{ backgroundColor: person.avatar_color ?? '#1D9E75' }}
          >
            {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{person.name}</p>
          </TooltipContent>
        </Tooltip>
      ))}
      {rest > 0 && (
        <div
          className={cn(
            'rounded-full border-2 border-white bg-zinc-200 flex items-center justify-center text-zinc-600 font-medium',
            sizeClasses
          )}
        >
          +{rest}
        </div>
      )}
    </div>
  )
}
