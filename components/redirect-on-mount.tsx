'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

type RedirectOnMountProps = {
  href: string
}

export function RedirectOnMount({ href }: RedirectOnMountProps) {
  const router = useRouter()

  useEffect(() => {
    router.replace(href)
  }, [href, router])

  return null
}
