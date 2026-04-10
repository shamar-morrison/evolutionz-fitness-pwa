import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getRequiredServerEnv } from '@/lib/server-env'

let supabaseAdmin: SupabaseClient | null = null

export function getSupabaseAdminClient() {
  if (supabaseAdmin) {
    return supabaseAdmin
  }

  supabaseAdmin = createClient(
    getRequiredServerEnv('SUPABASE_URL'),
    getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  return supabaseAdmin
}
