'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function UnauthorizedPage() {
  const router = useRouter()

  return (
    <main className="flex min-h-svh items-center justify-center bg-sidebar px-4 text-sidebar-foreground">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-white/60">
            Unauthorized
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            You don&apos;t have permission to access this page.
          </h1>
          <p className="text-sm text-white/70">
            Use the button below to return to the previous screen.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="mt-8 w-full"
          onClick={() => router.back()}
        >
          <ArrowLeft />
          Go Back
        </Button>
      </div>
    </main>
  )
}
