'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { BarChart2, BookOpen, Receipt } from 'lucide-react'

const TABS = [
  { href: '/finance',             label: 'P&L',         icon: BarChart2 },
  { href: '/finance/ledger',      label: 'Ledger',      icon: BookOpen },
  { href: '/finance/collections', label: 'Collections', icon: Receipt },
] as const

export function FinanceNav() {
  const pathname = usePathname()

  return (
    <div className="border-b border-[#30363d] -mx-6 px-6">
      <nav className="flex gap-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-sm transition-colors border-b-2 -mb-px',
                active
                  ? 'border-[#58a6ff] text-[#e6edf3] font-medium'
                  : 'border-transparent text-[#8b949e] hover:text-[#e6edf3]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
