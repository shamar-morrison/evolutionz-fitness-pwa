import type { ReactNode } from 'react'
import { AuthLayoutWithToaster } from '@/components/auth-layout-with-toaster'

export default function AuthCallbackLayout({ children }: { children: ReactNode }) {
  return <AuthLayoutWithToaster>{children}</AuthLayoutWithToaster>
}
