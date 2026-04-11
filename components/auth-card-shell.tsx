import type { ReactNode } from 'react'

type AuthCardShellProps = {
  badge?: string
  title: string
  description: string
  children: ReactNode
}

export function AuthCardShell({
  badge = 'Staff Access',
  title,
  description,
  children,
}: AuthCardShellProps) {
  return (
    <main className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#0a0a0a] px-6 py-10 text-white">
      <div className="pointer-events-none absolute -right-[400px] -top-[400px] h-[800px] w-[800px] rounded-full bg-amber-400/15 blur-[150px]" />
      <div className="pointer-events-none absolute -bottom-[400px] -left-[400px] h-[800px] w-[800px] rounded-full bg-amber-400/15 blur-[150px]" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10">
          <div className="mx-auto flex w-full flex-col justify-center">
            <div className="mb-8 text-center">
              <div className="mb-4 inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">
                {badge}
              </div>
              <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
              <p className="text-sm text-white/60">{description}</p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </main>
  )
}
