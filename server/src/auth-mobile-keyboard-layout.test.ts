import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveMobileViewportKeyboardInset } from '../../src/app/authKeyboardViewport'

test('mobile auth keyboard inset stays off until the visual viewport meaningfully shrinks', () => {
  assert.equal(
    resolveMobileViewportKeyboardInset({
      layoutViewportHeight: 812,
      visualViewportHeight: 760,
      visualViewportOffsetTop: 0,
    }),
    0,
  )
})

test('mobile auth keyboard inset tracks the on-screen keyboard height after viewport shrink', () => {
  assert.equal(
    resolveMobileViewportKeyboardInset({
      layoutViewportHeight: 812,
      visualViewportHeight: 446,
      visualViewportOffsetTop: 12,
    }),
    354,
  )
})
