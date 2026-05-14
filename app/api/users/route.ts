import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// A member-with-access row: their user_profiles record merged with the auth
// metadata (email + ban state) that only the service role can read.
export type ManagedUser = {
  id: string
  full_name: string | null
  role: string
  person_id: string | null
  email: string | null
  banned: boolean
  created_at: string | null
}

// Lists every login-capable member. Founders only — exposes auth emails and
// ban state, so it must never be reachable by employees.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.role !== 'founder') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: profiles, error: profilesErr } = await admin
    .from('user_profiles')
    .select('id, full_name, role, person_id, created_at')
  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 400 })
  }

  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 })
  }
  const authById = new Map(authData.users.map(u => [u.id, u]))

  const now = Date.now()
  const users: ManagedUser[] = (profiles ?? []).map(p => {
    const authUser = authById.get(p.id)
    const bannedUntil = authUser?.banned_until
    return {
      id: p.id,
      full_name: p.full_name,
      role: p.role,
      person_id: p.person_id,
      email: authUser?.email ?? null,
      banned: bannedUntil ? new Date(bannedUntil).getTime() > now : false,
      created_at: p.created_at,
    }
  })

  return NextResponse.json({ users })
}
