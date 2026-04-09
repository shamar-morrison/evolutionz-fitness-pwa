'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV !== 'production'
    ) {
      return
    }

    void navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => console.error('Failed to register service worker:', error))
  }, [])

  return null
}
