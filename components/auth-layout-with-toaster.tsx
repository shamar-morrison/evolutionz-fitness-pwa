import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/toaster'

type AuthLayoutWithToasterProps = {
  children: ReactNode
}

export function AuthLayoutWithToaster({ children }: AuthLayoutWithToasterProps) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
