'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { AuthCardShell } from '@/components/auth-card-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/client'

const GENERIC_ERROR_MESSAGE = 'Unable to sign in. Please check your credentials and try again.'
const ARCHIVED_ACCOUNT_ERROR =
  'This staff account has been archived. Contact an admin if you need access again.'
const SUCCESS_MESSAGE_MAP = {
  'password-updated': 'Password updated successfully.',
} as const
const PASSWORD_TOGGLE_BUTTON_CLASS_NAME =
  'absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-white/40 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]'

function LoginSuccessMessage() {
  const searchParams = useSearchParams()
  const successMessageKey = searchParams.get('message')?.trim() ?? ''
  const successMessage =
    SUCCESS_MESSAGE_MAP[successMessageKey as keyof typeof SUCCESS_MESSAGE_MAP] ?? null

  if (!successMessage) {
    return null
  }

  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
      {successMessage}
    </div>
  )
}

export default function LoginPage() {
  const router = useProgressRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const supabase = createClient()

    setIsSubmitting(true)
    setError(null)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        throw signInError
      }

      const profile = data.user ? await readStaffProfile(supabase as any, data.user.id) : null

      if (!profile && data.user) {
        const archivedProfile = await readStaffProfile(supabase as any, data.user.id, {
          includeArchived: true,
        })

        await supabase.auth.signOut()

        if (archivedProfile?.archivedAt) {
          setError(ARCHIVED_ACCOUNT_ERROR)
          return
        }

        setError(GENERIC_ERROR_MESSAGE)
        return
      }

      router.push(getAuthenticatedHomePath(profile?.role, profile?.titles))
      router.refresh()
    } catch (error) {
      console.error('Failed to sign in:', error)
      setError(GENERIC_ERROR_MESSAGE)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCardShell
      title="Evolutionz Fitness"
      description="Secure access to operations dashboard."
    >
      <div className="space-y-6">
        <Suspense fallback={null}>
          <LoginSuccessMessage />
        </Suspense>

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

          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/80">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="h-12 border-white/10 bg-white/5 pr-12 text-white placeholder:text-white/35 transition-colors focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className={PASSWORD_TOGGLE_BUTTON_CLASS_NAME}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full bg-amber-400 font-medium text-black hover:bg-amber-300"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </Button>

          <div className="flex justify-center">
            <Link
              href="/forgot-password"
              className="text-sm text-amber-300 transition-colors hover:text-amber-200"
            >
              Forgot password?
            </Link>
          </div>

          {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
        </form>
      </div>
    </AuthCardShell>
  )
}
