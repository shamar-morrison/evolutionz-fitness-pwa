'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
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

export function usePushNotifications(): UsePushNotificationsResult {
  const { profile } = useAuth()
  const isAdmin = profile?.titles?.includes('Owner') ?? false

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

          try {
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlB64ToUint8Array(publicKey),
            })
            const response = await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(serializeSubscription(subscription)),
            })
            if (response.ok && !cancelled) {
              setIsSubscribed(true)
            }
          } catch (error) {
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
      toast({
        title: 'Push notifications unavailable',
        description: 'Missing VAPID public key configuration.',
        variant: 'destructive',
      })
      return
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return

      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        toast({
          title: 'Push notifications unavailable',
          description: 'Service worker is not registered on this device.',
          variant: 'destructive',
        })
        return
      }

      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(publicKey),
        }))

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
      console.error('Failed to enable push notifications:', error)
      toast({
        title: 'Could not enable push notifications',
        description:
          error instanceof Error ? error.message : 'Unexpected error.',
        variant: 'destructive',
      })
    }
  }, [isAdmin, isSupported])

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !isAdmin) return

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      const endpoint = subscription?.endpoint

      if (subscription) {
        await subscription.unsubscribe()
      }

      if (endpoint) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
      }

      setIsSubscribed(false)
      toast({
        title: 'Push notifications disabled',
        description: 'This device will no longer receive updates.',
      })
    } catch (error) {
      console.error('Failed to disable push notifications:', error)
      toast({
        title: 'Could not disable push notifications',
        description:
          error instanceof Error ? error.message : 'Unexpected error.',
        variant: 'destructive',
      })
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
