import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/lib/supabase/types'

export async function getMyProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return (data as UserProfile | null)
}
