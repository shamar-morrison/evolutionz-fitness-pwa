import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseAdmin: SupabaseClient | null = null

function getRequiredEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`)
  }

  return value
}

export function getSupabaseAdminClient() {
  if (supabaseAdmin) {
    return supabaseAdmin
  }

  supabaseAdmin = createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  return supabaseAdmin
}
