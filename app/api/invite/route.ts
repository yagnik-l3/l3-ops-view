import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Only founders (rows in user_profiles) can invite.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; full_name?: string }
    | null
  const email = body?.email?.trim()
  const full_name = body?.full_name?.trim()
  if (!email) {
    return NextResponse.json({ error: 'email_required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: full_name ? { full_name } : undefined,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
