const cacheName = 'chicago-shell-v2'
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName)
      const response = await fetch('/', { cache: 'reload' })
      if (!response.ok) throw Error('App shell is unavailable')
      const html = await response.clone().text()
      const chunks = [
        ...new Set(
          html.match(
            /\/_next\/static\/[a-zA-Z0-9/_.-]+\.(?:js|css)(?=["'])/g,
          ) || [],
        ),
      ]
      await cache.addAll([
        ...chunks,
        '/chicago.webp',
        '/manifest.webmanifest',
        '/icon-192.png',
        '/icon-512.png',
      ])
      await cache.put('/', response)
      await self.skipWaiting()
    })(),
  )
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('chicago-shell-') && name !== cacheName)
          await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (
    url.origin !== self.location.origin ||
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/')
  )
    return
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok)
            await (await caches.open(cacheName)).put('/', response.clone())
          return response
        })
        .catch(async () => (await caches.match('/')) || Response.error()),
    )
    return
  }
  if (
    url.pathname.startsWith('/_next/static/') ||
    [
      '/chicago.webp',
      '/icon-192.png',
      '/icon-512.png',
      '/manifest.webmanifest',
    ].includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(event.request).then(async (hit) => {
        if (hit) return hit
        const response = await fetch(event.request)
        if (response.ok)
          await (
            await caches.open(cacheName)
          ).put(event.request, response.clone())
        return response
      }),
    )
  }
})
