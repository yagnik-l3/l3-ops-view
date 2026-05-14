'use client'

import { DailyLogEditor } from '@/components/time/DailyLogEditor'
import { AllocatedProjectsPanel } from '@/components/time/AllocatedProjectsPanel'

interface LogClientProps {
  personId: string
  userId: string
  fullName: string | null
}

export function LogClient({ personId, userId, fullName }: LogClientProps) {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Daily log</h1>
        {fullName && <p className="text-sm text-[#8b949e] mt-1">{fullName}</p>}
      </header>

      <AllocatedProjectsPanel personId={personId} />

      <DailyLogEditor personId={personId} userId={userId} />
    </div>
  )
}
