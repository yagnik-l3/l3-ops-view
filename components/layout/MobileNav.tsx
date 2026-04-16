'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CalendarRange, Folder, Users, Settings, BarChart2 } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/timeline', label: 'Timeline', icon: CalendarRange },
  { href: '/projects', label: 'Projects', icon: Folder },
  { href: '/people',   label: 'People',   icon: Users },
  { href: '/finance',  label: 'Finance',  icon: BarChart2 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#161b22] border-t border-[#30363d] flex z-30 md:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
