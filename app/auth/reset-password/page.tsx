'use client'

import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { AuthCardShell } from '@/components/auth-card-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { createClient } from '@/lib/supabase/client'

type RecoveryStatus = 'checking' | 'ready' | 'invalid'

const POLL_INTERVAL_MS = 750
const MAX_SESSION_CHECKS = 10
const PASSWORD_TOGGLE_BUTTON_CLASS_NAME =
  'absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-white/40 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]'

export default function ResetPasswordPage() {
  const router = useProgressRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [status, setStatus] = useState<RecoveryStatus>('checking')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/u, ''))
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    const hasRecoveryHash =
      hashParams.get('type') === 'recovery' ||
      (hashParams.has('access_token') && hashParams.has('refresh_token'))
    let isMounted = true
    let sessionCheckTimeoutId: ReturnType<typeof setTimeout> | null = null
    let finalizedStatus: Exclude<RecoveryStatus, 'checking'> | null = null

    const clearSessionCheckTimeout = () => {
      if (sessionCheckTimeoutId) {
        clearTimeout(sessionCheckTimeoutId)
        sessionCheckTimeoutId = null
      }
    }

    const markStatus = (nextStatus: RecoveryStatus) => {
      if (!isMounted || finalizedStatus) {
        return
      }

      if (nextStatus !== 'checking') {
        finalizedStatus = nextStatus
        clearSessionCheckTimeout()
      }

      setStatus(nextStatus)
    }

    const markReadyFromSession = (session: Session | null) => {
      if (session?.user) {
        markStatus('ready')
        return true
      }

      return false
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        markReadyFromSession(session)
      }
    })

    const scheduleSessionCheck = (attempt: number) => {
      sessionCheckTimeoutId = setTimeout(async () => {
        const nextSession = await supabase.auth.getSession()

        if (markReadyFromSession(nextSession.data.session)) {
          return
        }

        if (attempt >= MAX_SESSION_CHECKS) {
          markStatus('invalid')
          return
        }

        if (isMounted && !finalizedStatus) {
          scheduleSessionCheck(attempt + 1)
        }
      }, POLL_INTERVAL_MS)
    }

    async function initialize() {
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error || !data.session?.user) {
          markStatus('invalid')
          return
        }

        markStatus('ready')
        return
      }

      if (!hasRecoveryHash) {
        markStatus('invalid')
        return
      }

      const initialSession = await supabase.auth.getSession()

      if (markReadyFromSession(initialSession.data.session)) {
        return
      }

      if (!finalizedStatus) {
        scheduleSessionCheck(1)
      }
    }

    void initialize()

    return () => {
      isMounted = false

      clearSessionCheckTimeout()
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match.')
      return
    }

    setValidationError(null)
    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        throw error
      }

      await supabase.auth.signOut()
      router.replace('/login?message=password-updated')
      router.refresh()
    } catch (error) {
      const description =
        error instanceof Error ? error.message : 'Unable to update your password.'

      toast({
        variant: 'destructive',
        title: 'Password update failed',
        description,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'invalid') {
    return (
      <AuthCardShell
        badge="Password Reset"
        title="Set new password"
        description="This reset link is invalid or has expired."
      >
        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-amber-300 transition-colors hover:text-amber-200"
          >
            Request a new reset link
          </Link>
        </div>
      </AuthCardShell>
    )
  }

  return (
    <AuthCardShell
      badge="Password Reset"
      title="Set new password"
      description="Choose a new password for your staff account."
    >
      {status === 'checking' ? (
        <p className="text-center text-sm text-white/60">Checking your reset link...</p>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/80">
              New password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                className="h-12 border-white/10 bg-white/5 pr-12 text-white placeholder:text-white/35 transition-colors focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20"
                placeholder="Enter a new password"
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

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-white/80">
              Confirm new password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                className="h-12 border-white/10 bg-white/5 pr-12 text-white placeholder:text-white/35 transition-colors focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20"
                placeholder="Re-enter your new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className={PASSWORD_TOGGLE_BUTTON_CLASS_NAME}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {validationError ? (
            <p className="text-center text-sm text-red-400">{validationError}</p>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full bg-amber-400 font-medium text-black hover:bg-amber-300"
          >
            {isSubmitting ? 'Updating...' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthCardShell>
  )
}
