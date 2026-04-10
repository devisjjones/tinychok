import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import { shouldAutoFocusTextInputOnSceneOpen } from '../../src/shared/utils'

function withBrowserEnvironment(
  options: {
    coarsePointer?: boolean
    maxTouchPoints?: number
    userAgent?: string
  },
  run: () => void,
) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const globalTarget = globalThis as Record<string, unknown>
  const previousWindow = globalTarget.window
  const previousNavigator = globalTarget.navigator

  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      addEventListener() {},
      addListener() {},
      dispatchEvent() {
        return false
      },
      matches: query === '(pointer: coarse)' ? (options.coarsePointer ?? false) : false,
      media: query,
      onchange: null,
      removeEventListener() {},
      removeListener() {},
    }),
  })

  Object.defineProperty(dom.window.navigator, 'maxTouchPoints', {
    configurable: true,
    value: options.maxTouchPoints ?? 0,
  })

  if (options.userAgent) {
    Object.defineProperty(dom.window.navigator, 'userAgent', {
      configurable: true,
      value: options.userAgent,
    })
  }

  Object.defineProperty(globalTarget, 'window', {
    configurable: true,
    value: dom.window,
  })
  Object.defineProperty(globalTarget, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })

  try {
    run()
  } finally {
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
  }
}

test('scene-open autofocus stays enabled on desktop browsers', () => {
  withBrowserEnvironment(
    {
      coarsePointer: false,
      maxTouchPoints: 0,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    },
    () => {
      assert.equal(shouldAutoFocusTextInputOnSceneOpen(), true)
    },
  )
})

test('scene-open autofocus is disabled on mobile browsers', () => {
  withBrowserEnvironment(
    {
      coarsePointer: true,
      maxTouchPoints: 5,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
    },
    () => {
      assert.equal(shouldAutoFocusTextInputOnSceneOpen(), false)
    },
  )
})
