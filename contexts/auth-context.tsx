'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { User } from '@/types'

type AuthContextType = {
  user: User | null
  signOut: () => Promise<void>
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// TODO: Replace with Supabase auth - this is a mock user for development
const MOCK_USER: User = {
  id: '1',
  name: 'Marcus Johnson',
  email: 'marcus@evolutionzfitness.com',
  role: 'admin', // Change to 'staff' to test staff permissions
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(MOCK_USER)
  const [isLoading, setIsLoading] = useState(false)

  const signOut = useCallback(async () => {
    setIsLoading(true)
    // TODO: Replace with Supabase signOut
    await new Promise((resolve) => setTimeout(resolve, 500))
    setUser(null)
    setIsLoading(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, signOut, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
