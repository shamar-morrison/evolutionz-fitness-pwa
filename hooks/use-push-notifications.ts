'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOptionalAuth } from '@/contexts/auth-context'
import { toast } from '@/hooks/use-toast'

type UsePushNotificationsResult = {
  isSupported: boolean
  permission: NotificationPermission
  isSubscribed: boolean
  requestPermission: () => Promise<void>
  unsubscribe: () => Promise<void>
}

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  }
}

function getError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return error
  }

  return new Error(fallbackMessage)
}

export function usePushNotifications(): UsePushNotificationsResult {
  const { profile } = useOptionalAuth()
  const isAdmin = profile?.role === 'admin'

  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const hasBootstrappedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isAdmin) {
      setIsSupported(false)
      return
    }

    const supported =
      'Notification' in window &&
      'PushManager' in window &&
      'serviceWorker' in navigator

    setIsSupported(supported)
    if (!supported) return

    setPermission(Notification.permission)

    let cancelled = false

    ;(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (!registration) {
          if (!cancelled) setIsSupported(false)
          return
        }

        const existing = await registration.pushManager.getSubscription()
        if (cancelled) return

        if (existing) {
          setIsSubscribed(true)
          return
        }

        if (
          Notification.permission === 'granted' &&
          !hasBootstrappedRef.current
        ) {
          hasBootstrappedRef.current = true
          const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
          if (!publicKey) return

          let subscription: PushSubscription | null = null
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlB64ToUint8Array(publicKey),
            })
            const response = await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(serializeSubscription(subscription)),
            })
            if (!response.ok) {
              throw new Error(
                `Failed to save subscription on the server (${response.status}).`,
              )
            }
            if (!cancelled) setIsSubscribed(true)
          } catch (error) {
            if (subscription) {
              await subscription.unsubscribe().catch(() => {})
            }
            console.error('Failed to auto-resubscribe to push:', error)
          }
        }
      } catch (error) {
        console.error('Failed to read service worker registration:', error)
        if (!cancelled) setIsSupported(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const requestPermission = useCallback(async () => {
    if (!isSupported || !isAdmin) return

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) {
      throw new Error('Missing VAPID public key configuration.')
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return

      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        throw new Error('Service worker is not registered on this device.')
      }

      const existing = await registration.pushManager.getSubscription()
      const createdNow = !existing
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(publicKey),
        }))

      try {
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serializeSubscription(subscription)),
        })

        if (!response.ok) {
          throw new Error('Failed to save subscription on the server.')
        }

        setIsSubscribed(true)
        toast({
          title: 'Push notifications enabled',
          description: 'You will receive updates on this device.',
        })
      } catch (error) {
        if (createdNow) {
          await subscription.unsubscribe().catch(() => {})
        }
        throw error
      }
    } catch (error) {
      console.error('Failed to enable push notifications:', error)
      throw getError(error, 'Unexpected error.')
    }
  }, [isAdmin, isSupported])

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !isAdmin) return

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      const endpoint = subscription?.endpoint

      if (endpoint) {
        const response = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
        if (!response.ok) {
          throw new Error('Failed to delete subscription on the server.')
        }
      }

      if (subscription) {
        await subscription.unsubscribe()
      }

      setIsSubscribed(false)
      toast({
        title: 'Push notifications disabled',
        description: 'This device will no longer receive updates.',
      })
    } catch (error) {
      console.error('Failed to disable push notifications:', error)
      throw getError(error, 'Unexpected error.')
    }
  }, [isAdmin, isSupported])

  return {
    isSupported,
    permission,
    isSubscribed,
    requestPermission,
    unsubscribe,
  }
}
