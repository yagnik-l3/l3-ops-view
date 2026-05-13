import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LogClient } from './LogClient'

export const dynamic = 'force-dynamic'

export default async function LogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, person_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) redirect('/auth/login')

  // Founders without a linked person can still pick a person to view, but for
  // now show a helpful empty state pointing back to founder routes.
  if (profile.role === 'founder' && !profile.person_id) {
    return (
      <div className="p-6 md:p-10 max-w-2xl">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Daily log</h1>
        <p className="text-sm text-[#8b949e] mt-2">
          You&apos;re signed in as a founder. The daily log is meant for employees logging their own hours.
          To view actuals, head to a project page or the team feed.
        </p>
      </div>
    )
  }

  if (!profile.person_id) {
    return (
      <div className="p-6 md:p-10 max-w-2xl">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Daily log</h1>
        <p className="text-sm text-[#8b949e] mt-2">
          Your account isn&apos;t linked to a team member yet. Ask a founder to finish setup from Settings.
        </p>
      </div>
    )
  }

  return (
    <LogClient
      personId={profile.person_id}
      userId={user.id}
      fullName={profile.full_name ?? null}
      isFounder={profile.role === 'founder'}
    />
  )
}
