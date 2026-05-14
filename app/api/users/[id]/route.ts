import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ~100 years — Supabase has no permanent ban, so we ban for an effectively
// unbounded duration and lift it with 'none'.
const BAN_DURATION = '876600h'

// Confirms the caller is an authenticated founder. Returns their user id, or a
// ready-to-return error response.
async function requireFounder(): Promise<{ userId: string } | { error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.role !== 'founder') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

// Edit a member (role / name / linked person) and/or ban-unban them.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFounder()
  if ('error' in auth) return auth.error
  const { id } = await params

  // A founder editing or banning their own account could lock themselves out.
  if (id === auth.userId) {
    return NextResponse.json({ error: 'cannot_modify_self' }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as
    | { full_name?: string | null; role?: string; person_id?: string | null; banned?: boolean }
    | null
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: target } = await admin
    .from('user_profiles')
    .select('id, role, person_id, full_name')
    .eq('id', id)
    .maybeSingle()
  if (!target) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  // ── Ban / unban ──────────────────────────────────────────────────────────
  if (typeof body.banned === 'boolean') {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: body.banned ? BAN_DURATION : 'none',
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  // ── Profile edit (role / name / linked person) ───────────────────────────
  const wantsProfileEdit =
    body.role !== undefined || body.full_name !== undefined || body.person_id !== undefined

  if (wantsProfileEdit) {
    const role = (body.role ?? target.role).trim()
    if (role !== 'founder' && role !== 'employee') {
      return NextResponse.json({ error: 'invalid_role' }, { status: 400 })
    }

    let person_id: string | null =
      body.person_id !== undefined ? (body.person_id || null) : target.person_id
    let full_name: string | null =
      body.full_name !== undefined ? (body.full_name?.trim() || null) : target.full_name

    if (role === 'employee') {
      if (!person_id) {
        return NextResponse.json({ error: 'person_required' }, { status: 400 })
      }
      const { data: person, error: personErr } = await admin
        .from('people')
        .select('id, name, is_active')
        .eq('id', person_id)
        .maybeSingle()
      if (personErr || !person) {
        return NextResponse.json({ error: 'person_not_found' }, { status: 400 })
      }
      // The linked person must not already belong to a different login.
      const { data: existing } = await admin
        .from('user_profiles')
        .select('id')
        .eq('person_id', person_id)
        .neq('id', id)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ error: 'person_already_linked' }, { status: 400 })
      }
      // Employees always display the linked person's name.
      full_name = person.name
    } else {
      // Founders are not linked to a person.
      person_id = null
    }

    const { error } = await admin
      .from('user_profiles')
      .update({ role, person_id, full_name })
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Keep auth user_metadata in sync. handle_new_user() only reads it at
    // signup, but staying consistent keeps the Supabase dashboard accurate.
    const metadata: Record<string, string | null> = { role, full_name, person_id }
    await admin.auth.admin.updateUserById(id, { user_metadata: metadata })
  }

  return NextResponse.json({ ok: true })
}

// Permanently delete a member's login. The user_profiles row is removed via the
// ON DELETE CASCADE on user_profiles.id -> auth.users.id.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFounder()
  if ('error' in auth) return auth.error
  const { id } = await params

  if (id === auth.userId) {
    return NextResponse.json({ error: 'cannot_modify_self' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
