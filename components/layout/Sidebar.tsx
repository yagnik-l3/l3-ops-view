'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  CalendarRange,
  Folder,
  Users,
  Settings,
  LogOut,
  BarChart2,
} from 'lucide-react'
import type { UserProfile } from '@/lib/supabase/types'

const NAV_ITEMS = [
  { href: '/timeline',  label: 'Timeline',   icon: CalendarRange },
  { href: '/projects',  label: 'Projects',   icon: Folder },
  { href: '/people',    label: 'People',     icon: Users },
  { href: '/finance',   label: 'Finance',    icon: BarChart2 },
  { href: '/settings',  label: 'Settings',   icon: Settings },
]

interface SidebarProps {
  profile: UserProfile | null
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-[200px] bg-[#161b22] border-r border-[#30363d] flex flex-col z-30">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-[#30363d]">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-[4px] bg-[#58a6ff]/20 flex items-center justify-center">
            <span className="text-[#58a6ff] text-[10px] font-bold">L3</span>
          </div>
          <span className="text-sm font-medium text-[#e6edf3]">L3 Labs</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/timeline' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-[#21262d] text-[#e6edf3] font-medium'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]/60'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-2 py-4 border-t border-[#30363d]">
        {profile && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-[#c9d1d9] truncate">{profile.full_name}</p>
            <span className="text-[11px] text-[#8b949e] capitalize">Founder</span>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]/60 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
