import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Service-role client — server-only. Bypasses RLS, so never import this from
// client components or expose its env var with a NEXT_PUBLIC_ prefix.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
