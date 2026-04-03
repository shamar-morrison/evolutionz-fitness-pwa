'use client'

import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL')
  }

  return value
}

function getSupabasePublishableKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }

  return value
}

export function createClient() {
  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey())

  return browserClient
}
