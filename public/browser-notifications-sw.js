self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  const payload =
    event.notification && typeof event.notification.data === 'object' && event.notification.data !== null
      ? event.notification.data
      : {}
  const target = payload.clickData
  const url =
    typeof payload.url === 'string' && payload.url.length > 0
      ? payload.url
      : self.location.origin + '/'

  event.notification.close()

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window',
    })
    const existingClient = clients[0]

    if (existingClient) {
      await existingClient.focus()
      existingClient.postMessage({
        target,
        type: 'tinychok.browser-notification.click',
      })
      return
    }

    const openedClient = await self.clients.openWindow(url)
    if (openedClient) {
      openedClient.postMessage({
        target,
        type: 'tinychok.browser-notification.click',
      })
    }
  })())
})
