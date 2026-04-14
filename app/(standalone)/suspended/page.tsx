'use client'

import { useState } from 'react'
import { AuthCardShell } from '@/components/auth-card-shell'
import { Button } from '@/components/ui/button'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { createClient } from '@/lib/supabase/client'

export default function SuspendedPage() {
  const router = useProgressRouter()
  const [error, setError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async () => {
    const supabase = createClient()

    setIsSigningOut(true)
    setError(null)

    try {
      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        throw signOutError
      }

      router.replace('/login')
      router.refresh()
    } catch (signOutError) {
      console.error('Failed to sign out suspended user:', signOutError)
      setError('Unable to sign out right now. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <AuthCardShell
      badge="Account Suspended"
      title="Access suspended"
      description="Your account has been suspended. Please contact an administrator to restore access."
    >
      <div className="space-y-6">


        <Button
          type="button"
          className="h-12 w-full bg-amber-400 font-medium text-black hover:bg-amber-300"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
        >
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </Button>

        {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
      </div>
    </AuthCardShell>
  )
}
