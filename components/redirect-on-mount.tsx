'use client'

import { useEffect } from 'react'
import { useProgressRouter } from '@/hooks/use-progress-router'

type RedirectOnMountProps = {
  href: string
}

export function RedirectOnMount({ href }: RedirectOnMountProps) {
  const router = useProgressRouter()

  useEffect(() => {
    router.replace(href)
  }, [href, router])

  return null
}
