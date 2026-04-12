import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import {
  preserveComposerFocusOnPrimaryAction,
  shouldPreserveComposerFocusOnPrimaryAction,
} from '../../src/shared/utils'

function withBrowserEnvironment(
  options: {
    coarsePointer?: boolean
    maxTouchPoints?: number
    userAgent?: string
  },
  run: (dom: JSDOM) => void,
) {
  const dom = new JSDOM('<!doctype html><html><body><textarea></textarea><button type="button">send</button></body></html>')
  const globalTarget = globalThis as Record<string, unknown>
  const previousWindow = globalTarget.window
  const previousNavigator = globalTarget.navigator
  const previousDocument = globalTarget.document

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
  Object.defineProperty(globalTarget, 'document', {
    configurable: true,
    value: dom.window.document,
  })

  try {
    run(dom)
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

    if (previousDocument === undefined) {
      delete globalTarget.document
    } else {
      Object.defineProperty(globalTarget, 'document', {
        configurable: true,
        value: previousDocument,
      })
    }
  }
}

test('mobile composer primary action preserves the focused textarea instead of letting the button steal focus', () => {
  withBrowserEnvironment(
    {
      coarsePointer: true,
      maxTouchPoints: 5,
      userAgent:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
    },
    (dom) => {
      const textarea = dom.window.document.querySelector('textarea') as HTMLTextAreaElement
      let prevented = false

      textarea.focus()
      assert.equal(dom.window.document.activeElement, textarea)
      assert.equal(shouldPreserveComposerFocusOnPrimaryAction(textarea), true)
      assert.equal(
        preserveComposerFocusOnPrimaryAction(textarea, {
          preventDefault() {
            prevented = true
          },
        }),
        true,
      )
      assert.equal(prevented, true)
      assert.equal(dom.window.document.activeElement, textarea)
    },
  )
})

test('desktop composer primary action does not force mobile-style focus preservation', () => {
  withBrowserEnvironment(
    {
      coarsePointer: false,
      maxTouchPoints: 0,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    (dom) => {
      const textarea = dom.window.document.querySelector('textarea') as HTMLTextAreaElement
      let prevented = false

      textarea.focus()
      assert.equal(shouldPreserveComposerFocusOnPrimaryAction(textarea), false)
      assert.equal(
        preserveComposerFocusOnPrimaryAction(textarea, {
          preventDefault() {
            prevented = true
          },
        }),
        false,
      )
      assert.equal(prevented, false)
    },
  )
})

test('mobile composer primary action stays passive when the textarea is not the active element', () => {
  withBrowserEnvironment(
    {
      coarsePointer: true,
      maxTouchPoints: 5,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
    },
    (dom) => {
      const textarea = dom.window.document.querySelector('textarea') as HTMLTextAreaElement
      const button = dom.window.document.querySelector('button') as HTMLButtonElement
      let prevented = false

      button.focus()
      assert.equal(dom.window.document.activeElement, button)
      assert.equal(shouldPreserveComposerFocusOnPrimaryAction(textarea), false)
      assert.equal(
        preserveComposerFocusOnPrimaryAction(textarea, {
          preventDefault() {
            prevented = true
          },
        }),
        false,
      )
      assert.equal(prevented, false)
    },
  )
})
