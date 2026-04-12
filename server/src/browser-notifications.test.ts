import assert from 'node:assert/strict'
import test from 'node:test'

import {
  requestBrowserNotificationPermission,
  resetBrowserNotificationDeliveryForTests,
  showBrowserNotification,
} from '../../src/app/browserNotifications'

function withBrowserNotificationEnvironment(
  options: {
    notification: NotificationConstructorMock
    navigator?: NavigatorMock
    onFocus?: () => void
  },
  run: () => Promise<void> | void,
) {
  const globalTarget = globalThis as Record<string, unknown>
  const previousNavigator = globalTarget.navigator
  const previousWindow = globalTarget.window

  Object.defineProperty(globalTarget, 'window', {
    configurable: true,
    value: {
      Notification: options.notification,
      focus: options.onFocus ?? (() => Promise.resolve()),
      location: {
        href: 'https://staging.tinychok.ru/app',
      },
    },
  })

  if (options.navigator === undefined) {
    delete globalTarget.navigator
  } else {
    Object.defineProperty(globalTarget, 'navigator', {
      configurable: true,
      value: options.navigator,
    })
  }

  resetBrowserNotificationDeliveryForTests()

  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      resetBrowserNotificationDeliveryForTests()

      if (previousWindow === undefined) {
        delete globalTarget.window
      } else {
        Object.defineProperty(globalTarget, 'window', {
          configurable: true,
          value: previousWindow,
        })
      }

      if (previousNavigator === undefined) {
        delete globalTarget.navigator
      } else {
        Object.defineProperty(globalTarget, 'navigator', {
          configurable: true,
          value: previousNavigator,
        })
      }
    })
}

type NotificationInstanceMock = {
  closeCalls: number
  onclick: ((event: { preventDefault: () => void }) => void) | null
  options: BrowserNotificationOptionsMock
  title: string
}

type BrowserNotificationOptionsMock = NotificationOptions & {
  renotify?: boolean
}

type NotificationConstructorMock = {
  new (title: string, options?: NotificationOptions): NotificationInstanceMock
  permission: NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
}

type ServiceWorkerRegistrationMock = {
  showNotification: (title: string, options?: NotificationOptions) => Promise<void>
  update?: () => Promise<void>
}

type NavigatorMock = {
  serviceWorker?: {
    ready: Promise<ServiceWorkerRegistrationMock>
    register: (
      scriptUrl: string,
      options?: { scope?: string; updateViaCache?: 'all' | 'imports' | 'none' },
    ) => Promise<ServiceWorkerRegistrationMock>
  }
}

function createNotificationConstructor(options?: {
  permission?: NotificationPermission
  onConstruct?: (instance: NotificationInstanceMock) => void
  requestPermission?: () => Promise<NotificationPermission>
  shouldThrow?: boolean
}) {
  const instances: NotificationInstanceMock[] = []
  const settings = options

  class NotificationMockImpl {
    static permission = settings?.permission ?? 'granted'
    static requestPermission =
      settings?.requestPermission ??
      (async () => NotificationMockImpl.permission)

    closeCalls = 0
    onclick: ((event: { preventDefault: () => void }) => void) | null = null
    options: NotificationOptions
    title: string

    constructor(title: string, notificationOptions: NotificationOptions = {}) {
      if (settings?.shouldThrow) {
        throw new TypeError('Notification constructor is unavailable')
      }

      this.title = title
      this.options = notificationOptions
      instances.push(this)
      settings?.onConstruct?.(this)
    }

    close() {
      this.closeCalls += 1
    }
  }

  return {
    instances,
    NotificationMock: NotificationMockImpl as unknown as NotificationConstructorMock,
  }
}

test('browser notifications prefer the service worker delivery path when permission is granted', async () => {
  const { NotificationMock, instances } = createNotificationConstructor()
  const registerCalls: Array<{
    options?: { scope?: string; updateViaCache?: 'all' | 'imports' | 'none' }
    scriptUrl: string
  }> = []
  const showCalls: Array<{ options?: BrowserNotificationOptionsMock; title: string }> = []
  let updateCalls = 0
  const registration: ServiceWorkerRegistrationMock = {
    async showNotification(title, notificationOptions) {
      showCalls.push({
        options: notificationOptions,
        title,
      })
    },
    async update() {
      updateCalls += 1
    },
  }

  await withBrowserNotificationEnvironment(
    {
      navigator: {
        serviceWorker: {
          ready: Promise.resolve(registration),
          register: async (scriptUrl, registrationOptions) => {
            registerCalls.push({
              options: registrationOptions,
              scriptUrl,
            })
            return registration
          },
        },
      },
      notification: NotificationMock,
    },
    async () => {
      const result = await showBrowserNotification('Новое сообщение', {
        body: 'Проверь Тайничок',
        clickData: {
          chatId: 17,
          kind: 'direct',
        },
        tag: 'tinychok:direct:17',
      })

      assert.equal(result, null)
    },
  )

  assert.equal(instances.length, 0)
  assert.deepEqual(registerCalls, [
    {
      options: { scope: '/', updateViaCache: 'none' },
      scriptUrl: '/browser-notifications-sw.js',
    },
  ])
  assert.equal(showCalls.length, 1)
  assert.equal(showCalls[0]?.title, 'Новое сообщение')
  assert.equal(showCalls[0]?.options?.body, 'Проверь Тайничок')
  assert.equal(showCalls[0]?.options?.renotify, true)
  assert.equal(showCalls[0]?.options?.tag, 'tinychok:direct:17')
  assert.deepEqual(showCalls[0]?.options?.data, {
    clickData: {
      chatId: 17,
      kind: 'direct',
    },
    url: 'https://staging.tinychok.ru/app',
  })
  assert.equal(updateCalls, 2)
})

test('browser notifications fall back to the Notification constructor when service workers are unavailable', async () => {
  const { NotificationMock, instances } = createNotificationConstructor()
  let focused = 0
  let onClickCalls = 0
  let prevented = 0

  await withBrowserNotificationEnvironment(
    {
      notification: NotificationMock,
      onFocus: () => {
        focused += 1
      },
    },
    async () => {
      const result = await showBrowserNotification('Новое сообщение', {
        body: 'Проверь Тайничок',
        onClick: () => {
          onClickCalls += 1
        },
      })

      assert.notEqual(result, null)
      result?.onclick?.({
        preventDefault() {
          prevented += 1
        },
      } as Event)
    },
  )

  assert.equal(instances.length, 1)
  assert.equal(instances[0]?.title, 'Новое сообщение')
  assert.equal(instances[0]?.options.body, 'Проверь Тайничок')
  assert.equal(instances[0]?.closeCalls, 1)
  assert.equal(prevented, 1)
  assert.equal(focused, 1)
  assert.equal(onClickCalls, 1)
})

test('permission request eagerly prepares notification delivery for browsers that require service workers', async () => {
  const { NotificationMock } = createNotificationConstructor({
    permission: 'default',
    requestPermission: async () => {
      NotificationMock.permission = 'granted'
      return 'granted'
    },
  })
  const registerCalls: string[] = []
  const registration: ServiceWorkerRegistrationMock = {
    async showNotification() {},
  }

  await withBrowserNotificationEnvironment(
    {
      navigator: {
        serviceWorker: {
          ready: Promise.resolve(registration),
          register: async (scriptUrl) => {
            registerCalls.push(scriptUrl)
            return registration
          },
        },
      },
      notification: NotificationMock,
    },
    async () => {
      const status = await requestBrowserNotificationPermission()
      assert.equal(status, 'granted')
      await Promise.resolve()
    },
  )

  assert.deepEqual(registerCalls, ['/browser-notifications-sw.js'])
})

test('browser notifications do not hang on browsers where serviceWorker.ready stays pending', async () => {
  const { NotificationMock, instances } = createNotificationConstructor()
  const showCalls: Array<{ options?: BrowserNotificationOptionsMock; title: string }> = []
  const registration: ServiceWorkerRegistrationMock = {
    async showNotification(title, notificationOptions) {
      showCalls.push({
        options: notificationOptions,
        title,
      })
    },
  }

  await withBrowserNotificationEnvironment(
    {
      navigator: {
        serviceWorker: {
          ready: new Promise<ServiceWorkerRegistrationMock>(() => {}),
          register: async () => registration,
        },
      },
      notification: NotificationMock,
    },
    async () => {
      const result = await showBrowserNotification('Новое сообщение', {
        body: 'Chrome не должен зависать на ready',
        tag: 'tinychok:direct:42',
      })

      assert.equal(result, null)
    },
  )

  assert.equal(instances.length, 0)
  assert.equal(showCalls.length, 1)
  assert.equal(showCalls[0]?.title, 'Новое сообщение')
  assert.equal(showCalls[0]?.options?.renotify, true)
})
