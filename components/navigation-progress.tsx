'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  completeNavigationProgress,
  startNavigationProgress,
  subscribeNavigationProgress,
  type NavigationProgressState,
} from '@/lib/navigation-progress'

const initialProgressState: NavigationProgressState = {
  active: false,
  fadingOut: false,
  progress: 0,
  visible: false,
}

function buildRouteKey(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname
}

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = buildRouteKey(pathname, searchParams.toString())
  const initialRouteKey = useRef<string | null>(null)
  const [progressState, setProgressState] = useState(initialProgressState)

  useEffect(() => subscribeNavigationProgress(setProgressState), [])

  useEffect(() => {
    if (initialRouteKey.current === null) {
      initialRouteKey.current = routeKey
      return
    }

    if (initialRouteKey.current !== routeKey) {
      initialRouteKey.current = routeKey
      completeNavigationProgress()
    }
  }, [routeKey])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const target = event.target

      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a[href]')

      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      if (anchor.target || anchor.hasAttribute('download')) {
        return
      }

      let url: URL

      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }

      if (url.origin !== window.location.origin) {
        return
      }

      const destinationRouteKey = buildRouteKey(url.pathname, url.search.replace(/^\?/u, ''))

      if (destinationRouteKey === routeKey) {
        return
      }

      startNavigationProgress()
    }

    const handlePopState = () => {
      startNavigationProgress()
    }

    document.addEventListener('click', handleDocumentClick, true)
    window.addEventListener('popstate', handlePopState)

    return () => {
      document.removeEventListener('click', handleDocumentClick, true)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [routeKey])

  return (
    <div
      aria-hidden="true"
      data-navigation-progress="bar"
      style={{
        background: 'var(--primary)',
        height: '3px',
        left: 0,
        opacity: progressState.visible && !progressState.fadingOut ? 1 : 0,
        pointerEvents: 'none',
        position: 'fixed',
        right: 0,
        top: 0,
        transform: `scaleX(${progressState.progress})`,
        transformOrigin: '0% 50%',
        transition: progressState.fadingOut
          ? 'opacity 180ms ease'
          : 'transform 220ms ease, opacity 180ms ease',
        zIndex: 60,
      }}
    />
  )
}
