'use client'

import { usePathname, useRouter as useNextRouter, useSearchParams } from 'next/navigation'
import { startNavigationProgress } from '@/lib/navigation-progress'

function buildRouteKey(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname
}

function getDestinationRouteKey(href: string) {
  try {
    const url = new URL(href, window.location.href)

    if (url.origin !== window.location.origin) {
      return null
    }

    return buildRouteKey(url.pathname, url.search.replace(/^\?/u, ''))
  } catch {
    return null
  }
}

export function useProgressRouter() {
  const router = useNextRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentRouteKey = buildRouteKey(pathname, searchParams.toString())

  return {
    ...router,
    back() {
      startNavigationProgress()
      router.back()
    },
    forward() {
      startNavigationProgress()
      router.forward()
    },
    push(...args: Parameters<typeof router.push>) {
      const destinationRouteKey = getDestinationRouteKey(args[0])

      if (destinationRouteKey !== null && destinationRouteKey !== currentRouteKey) {
        startNavigationProgress()
      }

      router.push(...args)
    },
    replace(...args: Parameters<typeof router.replace>) {
      const destinationRouteKey = getDestinationRouteKey(args[0])

      if (destinationRouteKey !== null && destinationRouteKey !== currentRouteKey) {
        startNavigationProgress()
      }

      router.replace(...args)
    },
  }
}
