export type BrowserNotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied'

type BrowserNotificationPermission = NotificationPermission | 'unsupported'

type ShowBrowserNotificationOptions = {
  body: string
  clickData?: unknown
  icon?: string
  onClick?: () => void
  tag?: string
  url?: string
}

const browserNotificationServiceWorkerPath = '/browser-notifications-sw.js'
let browserNotificationServiceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null

export function resetBrowserNotificationDeliveryForTests() {
  browserNotificationServiceWorkerRegistrationPromise = null
}

function normalizeBrowserNotificationStatus(
  permission: BrowserNotificationPermission,
): BrowserNotificationStatus {
  switch (permission) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    case 'default':
      return 'default'
    default:
      return 'unsupported'
  }
}

export function getBrowserNotificationStatus(): BrowserNotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  return normalizeBrowserNotificationStatus(window.Notification.permission)
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  const permission = await window.Notification.requestPermission()
  if (permission === 'granted') {
    void ensureBrowserNotificationDeliveryReady()
  }
  return normalizeBrowserNotificationStatus(permission)
}

async function getBrowserNotificationServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return null
  }

  if (!browserNotificationServiceWorkerRegistrationPromise) {
    browserNotificationServiceWorkerRegistrationPromise = navigator.serviceWorker
      .register(browserNotificationServiceWorkerPath, {
        scope: '/',
      })
      .then(async (registration) => {
        try {
          return await navigator.serviceWorker.ready
        } catch {
          return registration
        }
      })
      .catch((error) => {
        console.error('Failed to register Tinychok browser notification service worker', error)
        browserNotificationServiceWorkerRegistrationPromise = null
        return null
      })
  }

  return browserNotificationServiceWorkerRegistrationPromise
}

export async function ensureBrowserNotificationDeliveryReady() {
  if (getBrowserNotificationStatus() !== 'granted') {
    return null
  }

  return getBrowserNotificationServiceWorkerRegistration()
}

export async function showBrowserNotification(
  title: string,
  options: ShowBrowserNotificationOptions,
) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null
  }

  if (window.Notification.permission !== 'granted') {
    return null
  }

  const notificationOptions: NotificationOptions = {
    body: options.body,
    data: {
      clickData: options.clickData ?? null,
      url: options.url ?? window.location.href,
    },
    icon: options.icon,
    tag: options.tag,
  }

  const registration = await getBrowserNotificationServiceWorkerRegistration()
  if (registration) {
    try {
      await registration.showNotification(title, notificationOptions)
      return null
    } catch (error) {
      console.error('Failed to show Tinychok browser notification through service worker', error)
    }
  }

  try {
    const notification = new window.Notification(title, notificationOptions)

    notification.onclick = (event) => {
      event.preventDefault()
      notification.close()
      void window.focus()
      options.onClick?.()
    }

    return notification
  } catch (error) {
    console.error('Failed to show Tinychok browser notification', error)
    return null
  }
}
