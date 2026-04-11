'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AuthCardShell } from '@/components/auth-card-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const supabase = createClient()
    const redirectTo = new URL('/auth/reset-password', window.location.origin).toString()

    setIsSubmitting(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (error) {
        throw error
      }

      setHasSubmitted(true)
    } catch (error) {
      console.error('Failed to request password reset:', error)
      toast({
        variant: 'destructive',
        description: GENERIC_ERROR_MESSAGE,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCardShell
      badge="Password Reset"
      title="Reset your password"
      description="Enter your email address and we'll send you a reset link."
    >
      {hasSubmitted ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100">
            Check your email for a reset link. It may take a few minutes to arrive.
          </div>
          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-amber-300 transition-colors hover:text-amber-200"
            >
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="h-12 border-white/10 bg-white/5 text-white placeholder:text-white/35 transition-colors focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20"
                placeholder="staff@evolutionzfitness.com"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full bg-amber-400 font-medium text-black hover:bg-amber-300"
            >
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-amber-300 transition-colors hover:text-amber-200"
            >
              Back to login
            </Link>
          </div>
        </div>
      )}
    </AuthCardShell>
  )
}
