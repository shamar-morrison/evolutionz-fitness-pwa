'use client'

export function replaceCurrentUrl(href: string | null | undefined) {
  if (typeof window === 'undefined') {
    return
  }

  const fallbackHref = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const nextHref = href ?? fallbackHref

  window.history.replaceState(null, '', nextHref)
}
