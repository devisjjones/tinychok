import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isStandaloneEmojiMessageText } from '../../src/shared/utils'
import { EmojiOnlyMessageContent } from '../../src/components/BubbleMessageContent'

test('isStandaloneEmojiMessageText accepts one emoji grapheme and rejects text or multiple glyphs', () => {
  assert.equal(isStandaloneEmojiMessageText('🔥'), true)
  assert.equal(isStandaloneEmojiMessageText('👍🏽'), true)
  assert.equal(isStandaloneEmojiMessageText('🏳️‍🌈'), true)
  assert.equal(isStandaloneEmojiMessageText('1️⃣'), true)
  assert.equal(isStandaloneEmojiMessageText('🔥🔥'), false)
  assert.equal(isStandaloneEmojiMessageText('🔥 ваф'), false)
  assert.equal(isStandaloneEmojiMessageText('5'), false)
  assert.equal(isStandaloneEmojiMessageText(''), false)
})

test('EmojiOnlyMessageContent renders enlarged glyph with pale meta row and inline delivery indicator', () => {
  const markup = renderToStaticMarkup(
    <EmojiOnlyMessageContent
      deliveryIndicatorSrc="/icons/double-tick-50.png"
      emoji="🔥"
      time="10:00"
    />,
  )

  assert.match(markup, /emoji-only-message-glyph">🔥<\/span>/u)
  assert.match(markup, /emoji-only-message-meta/u)
  assert.match(markup, /emoji-only-message-indicator/u)
  assert.match(markup, /<time>10:00<\/time>/u)
  assert.doesNotMatch(markup, /bubble-delivery-indicator/u)
  assert.doesNotMatch(markup, /<p>🔥<\/p>/u)
})
