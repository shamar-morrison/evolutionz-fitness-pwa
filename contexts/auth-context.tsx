'use client'

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/types'

type AuthContextType = {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function readProfile(userId: string) {
  const supabase = createClient()
  return readStaffProfile(supabase, userId)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const syncedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let isMounted = true

    async function syncSession(session: Session | null) {
      const nextUser = session?.user ?? null

      if (!nextUser) {
        syncedUserIdRef.current = null

        if (!isMounted) {
          return
        }

        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      if (syncedUserIdRef.current === nextUser.id) {
        return
      }

      syncedUserIdRef.current = nextUser.id

      try {
        const nextProfile = await readProfile(nextUser.id)

        if (!isMounted || syncedUserIdRef.current !== nextUser.id) {
          return
        }

        setUser(nextUser)
        setProfile(nextProfile)
      } catch (error) {
        console.error('Failed to sync authenticated profile:', error)

        if (!isMounted || syncedUserIdRef.current !== nextUser.id) {
          return
        }

        setUser(nextUser)
        setProfile(null)
      } finally {
        if (isMounted && syncedUserIdRef.current === nextUser.id) {
          setLoading(false)
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const nextUserId = session?.user?.id ?? null

      if (nextUserId !== syncedUserIdRef.current) {
        setLoading(true)
      }

      void syncSession(session)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      loading,
    }),
    [loading, profile, user],
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const EMPTY_AUTH: AuthContextType = {
  user: null,
  profile: null,
  role: null,
  loading: false,
}

export function useOptionalAuth(): AuthContextType {
  return useContext(AuthContext) ?? EMPTY_AUTH
}
