const OFFLINE_CACHE = 'evolutionz-offline-v1'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE)
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys()

      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith('evolutionz-offline-') && key !== OFFLINE_CACHE)
          .map((key) => caches.delete(key)),
      )

      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') {
    return
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request)
      } catch (error) {
        const cache = await caches.open(OFFLINE_CACHE)
        const offlineResponse = await cache.match(OFFLINE_URL)

        if (offlineResponse) {
          return offlineResponse
        }

        throw error
      }
    })(),
  )
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch (error) {
    return
  }

  if (!data || !data.title) return

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || '',
      icon: '/web-app-manifest-192x192.png',
      badge: '/web-app-manifest-192x192.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      const existing = allClients.find((client) => client.url.includes(targetUrl))
      if (existing) {
        return existing.focus()
      }

      return self.clients.openWindow(targetUrl)
    })(),
  )
})
