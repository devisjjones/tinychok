import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveMobileViewportKeyboardInset,
  resolveMobileViewportRevealDelta,
} from '../../src/app/authKeyboardViewport'

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

test('mobile auth keyboard inset still resolves from the preserved pre-keyboard viewport height', () => {
  assert.equal(
    resolveMobileViewportKeyboardInset({
      layoutViewportHeight: 873,
      visualViewportHeight: 492,
      visualViewportOffsetTop: 0,
    }),
    381,
  )
})

test('mobile auth reveal delta reports how much the screen must scroll to fully show the submit button', () => {
  assert.equal(
    resolveMobileViewportRevealDelta({
      elementBottom: 742,
      visualViewportHeight: 620,
      visualViewportOffsetTop: 0,
    }),
    142,
  )
})
