import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Only founders can create new users.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.role !== 'founder') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; full_name?: string; role?: string; person_id?: string; password?: string }
    | null
  const email = body?.email?.trim()
  const password = body?.password ?? ''
  const role = (body?.role ?? 'founder').trim()
  const person_id = body?.person_id?.trim() || null
  let full_name = body?.full_name?.trim() || null

  if (!email) {
    return NextResponse.json({ error: 'email_required' }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'password_min_8' }, { status: 400 })
  }
  if (role !== 'founder' && role !== 'employee') {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 })
  }

  if (role === 'employee') {
    if (!person_id) {
      return NextResponse.json({ error: 'person_required' }, { status: 400 })
    }
    const { data: person, error: personErr } = await supabase
      .from('people')
      .select('id, name, is_active')
      .eq('id', person_id)
      .maybeSingle()
    if (personErr || !person) {
      return NextResponse.json({ error: 'person_not_found' }, { status: 400 })
    }
    if (!person.is_active) {
      return NextResponse.json({ error: 'person_inactive' }, { status: 400 })
    }
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('person_id', person_id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'person_already_linked' }, { status: 400 })
    }
    // For employees, the display name is always the linked person's name.
    full_name = person.name
  }

  const admin = createAdminClient()
  const metadata: Record<string, string> = { role }
  if (full_name) metadata.full_name = full_name
  if (role === 'employee' && person_id) metadata.person_id = person_id

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
