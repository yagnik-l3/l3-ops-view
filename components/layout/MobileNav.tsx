'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  CalendarRange,
  Folder,
  Users,
  Settings,
  BarChart2,
  Target,
  ClipboardList,
  Activity,
  UserCircle2,
} from 'lucide-react'
import type { UserProfile } from '@/lib/supabase/types'

const FOUNDER_NAV = [
  { href: '/timeline', label: 'Timeline', icon: CalendarRange },
  { href: '/projects', label: 'Projects', icon: Folder },
  { href: '/people',   label: 'People',   icon: Users },
  { href: '/leads',    label: 'Leads',    icon: Target },
  { href: '/finance',  label: 'Finance',  icon: BarChart2 },
  { href: '/feed',     label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

function employeeNav(personId: string | null | undefined) {
  return [
    { href: '/log', label: 'Log', icon: ClipboardList },
    ...(personId ? [{ href: `/people/${personId}`, label: 'Me', icon: UserCircle2 }] : []),
  ] as const
}

interface MobileNavProps {
  profile: UserProfile | null
}

export function MobileNav({ profile }: MobileNavProps) {
  const pathname = usePathname()
  const isEmployee = profile?.role === 'employee'
  const items = isEmployee ? employeeNav(profile?.person_id) : FOUNDER_NAV

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#161b22] border-t border-[#30363d] flex z-30 md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
              active ? 'text-[#58a6ff]' : 'text-[#6e7681]'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
