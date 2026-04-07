'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const GENERIC_ERROR_MESSAGE = 'Unable to sign in. Please check your credentials and try again.'
const ARCHIVED_ACCOUNT_ERROR =
  'This staff account has been archived. Contact an admin if you need access again.'

export default function LoginPage() {
  const router = useProgressRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
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

      router.push(getAuthenticatedHomePath(profile?.role))
      router.refresh()
    } catch (error) {
      console.error('Failed to sign in:', error)
      setError(GENERIC_ERROR_MESSAGE)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-white flex flex-col justify-center relative overflow-hidden">
      {/* Top Right Glow */}
      <div className="absolute -right-[400px] -top-[400px] h-[800px] w-[800px] rounded-full bg-amber-400/15 blur-[150px] pointer-events-none" />
      {/* Bottom Left Glow */}
      <div className="absolute -bottom-[400px] -left-[400px] h-[800px] w-[800px] rounded-full bg-amber-400/15 blur-[150px] pointer-events-none" />

      <div className="mx-auto w-full max-w-md relative z-10">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="mx-auto flex w-full flex-col justify-center">
            <div className="text-center mb-8">
              <div className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300 mb-4">
                Staff Access
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Evolutionz Fitness</h1>
              <p className="text-sm text-white/60">Secure access to operations dashboard.</p>
            </div>

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
                    className="h-12 border-white/10 bg-white/5 text-white placeholder:text-white/35 transition-colors focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20 pr-12"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full bg-amber-400 text-black hover:bg-amber-300 font-medium"
              >
                {isSubmitting ? 'Signing In...' : 'Sign In'}
              </Button>

              {error ? <p className="text-sm text-red-400 text-center">{error}</p> : null}
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}
