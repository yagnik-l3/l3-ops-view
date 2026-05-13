import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/types'

export { updateSession as proxyHandler }

// Routes that only founders can access. Employee deep-links into /projects/[id]
// and /people/[id] are still allowed (we only block the index pages here).
const FOUNDER_ONLY_PREFIXES = [
  '/timeline',
  '/projects',
  '/people',
  '/leads',
  '/sales',
  '/finance',
  '/settings',
]

function isFounderOnly(pathname: string): boolean {
  // Exact-match the index routes; allow deep links like /projects/[id] and /people/[id].
  if (pathname === '/projects' || pathname.startsWith('/projects/')) {
    return pathname === '/projects'
  }
  if (pathname === '/people' || pathname.startsWith('/people/')) {
    return pathname === '/people'
  }
  return FOUNDER_ONLY_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Redirect authenticated users away from auth pages
  if (user && pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Allow unauthenticated access to auth routes
  if (pathname.startsWith('/auth')) {
    return supabaseResponse
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Role-aware guard for employees
  if (isFounderOnly(pathname)) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role === 'employee') {
      const url = request.nextUrl.clone()
      url.pathname = '/log'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
