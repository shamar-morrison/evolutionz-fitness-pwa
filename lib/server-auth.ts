import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

type AuthFailure = {
  response: NextResponse
}

type AuthSuccess = {
  user: User
}

type AdminAuthSuccess = {
  user: User
  profile: Profile
}

const SUSPENDED_ACCOUNT_ERROR =
  'Your account has been suspended. Please contact an administrator.'

async function readProfile(userId: string) {
  const supabase = await createClient()
  return readStaffProfile(supabase, userId)
}

export async function requireAuthenticatedUser(): Promise<AuthFailure | AuthSuccess> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { user }
}

export async function requireAuthenticatedProfile(): Promise<AuthFailure | AdminAuthSuccess> {
  const authResult = await requireAuthenticatedUser()

  if ('response' in authResult) {
    return authResult
  }

  const profile = await readProfile(authResult.user.id)

  if (!profile) {
    return {
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  if (profile.isSuspended) {
    return {
      response: NextResponse.json({ error: SUSPENDED_ACCOUNT_ERROR }, { status: 403 }),
    }
  }

  return {
    user: authResult.user,
    profile,
  }
}

export async function requireAdminUser(): Promise<AuthFailure | AdminAuthSuccess> {
  const authResult = await requireAuthenticatedProfile()

  if ('response' in authResult) {
    return authResult
  }

  if (authResult.profile.role !== 'admin') {
    return {
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    user: authResult.user,
    profile: authResult.profile,
  }
}
