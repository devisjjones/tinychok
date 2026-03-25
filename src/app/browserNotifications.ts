export type BrowserNotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied'

type BrowserNotificationPermission = NotificationPermission | 'unsupported'

type ShowBrowserNotificationOptions = {
  body: string
  icon?: string
  onClick?: () => void
  tag?: string
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
  return normalizeBrowserNotificationStatus(permission)
}

export function showBrowserNotification(
  title: string,
  options: ShowBrowserNotificationOptions,
) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null
  }

  if (window.Notification.permission !== 'granted') {
    return null
  }

  const notification = new window.Notification(title, {
    body: options.body,
    icon: options.icon,
    tag: options.tag,
  })

  notification.onclick = (event) => {
    event.preventDefault()
    notification.close()
    void window.focus()
    options.onClick?.()
  }

  return notification
}
