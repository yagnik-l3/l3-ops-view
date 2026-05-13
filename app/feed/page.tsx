import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FeedClient } from './FeedClient'

export const dynamic = 'force-dynamic'

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, person_id')
    .eq('id', user.id)
    .maybeSingle()

  // Employees go straight to their own profile graph — no team-wide view.
  if (profile?.role === 'employee') {
    redirect(profile.person_id ? `/people/${profile.person_id}` : '/log')
  }

  return <FeedClient />
}
