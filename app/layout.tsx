import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { TooltipProvider } from '@/components/ui/tooltip'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'L3 Labs Ops',
  description: 'Internal founder dashboard — resource & project management',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    profile = data
  }

  const isAuthPage = false // middleware handles redirects

  return (
    <html lang="en" className={`${geist.variable} h-full antialiased dark`}>
      <body className="h-full bg-[#0d1117] text-[#e6edf3]">
        <QueryProvider>
          <TooltipProvider>
            {user ? (
              <div className="flex h-full">
                <Sidebar profile={profile} />
                <main className="flex-1 ml-0 md:ml-50 min-h-screen pb-16 md:pb-0">
                  {children}
                </main>
                <MobileNav />
              </div>
            ) : (
              <>{children}</>
            )}
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
