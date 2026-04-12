import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BubbleMessageContent,
  BubbleTextInlineMeta,
} from '../../src/components/BubbleMessageContent'

test('BubbleMessageContent renders inline text meta inside the text paragraph', () => {
  const markup = renderToStaticMarkup(
    <BubbleMessageContent
      inlineMeta={
        <BubbleTextInlineMeta
          deliveryIndicatorSrc="/icons/double-tick-50.png"
          edited
          time="10:00"
        />
      }
      message={{
        attachment: undefined,
        attachmentRemovedNotice: undefined,
        replyTo: undefined,
        sourceContact: undefined,
        sourceGroup: undefined,
        text: 'Не вижу',
      }}
      showReplyInline={false}
    />,
  )

  assert.match(markup, /bubble-text-paragraph-with-inline-meta/u)
  assert.match(markup, /bubble-text-content">Не вижу<\/span>/u)
  assert.match(markup, /bubble-text-inline-meta/u)
  assert.match(markup, /bubble-text-inline-meta-edited/u)
  assert.match(markup, /Отредактировано/u)
  assert.match(markup, /<time>10:00<\/time>/u)
  assert.match(markup, /bubble-text-inline-meta-indicator/u)
  assert.doesNotMatch(markup, /bubble-delivery-indicator/u)
})
