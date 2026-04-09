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
