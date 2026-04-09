import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('reply previews no longer render ambiguous author labels like "Вы" or "Собеседник"', () => {
  const script = `
    import React from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { BubbleMessageContent, ReplyReferenceBlock } from './src/components/BubbleMessageContent.tsx'

    const inlineMarkup = renderToStaticMarkup(
      React.createElement(BubbleMessageContent, {
        message: {
          attachment: undefined,
          attachmentRemovedNotice: undefined,
          replyTo: {
            author: 'me',
            id: 101,
            text: '🔥',
          },
          sourceContact: undefined,
          sourceGroup: undefined,
          text: 'фыва',
        },
      }),
    )

    const attachedMarkup = renderToStaticMarkup(
      React.createElement(ReplyReferenceBlock, {
        mine: false,
        onClick: () => undefined,
        replyChatTitle: 'Алекс Тестер',
        replyTo: {
          author: 'me',
          id: 102,
          text: '🔥',
        },
      }),
    )

    console.log(JSON.stringify({ inlineMarkup, attachedMarkup }))
  `

  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 0, result.stderr)
  const parsed = JSON.parse(result.stdout.trim()) as { attachedMarkup: string, inlineMarkup: string }

  assert.match(parsed.inlineMarkup, /class="bubble-reply"/u)
  assert.match(parsed.inlineMarkup, />🔥<\/p>/u)
  assert.doesNotMatch(parsed.inlineMarkup, />Вы</u)
  assert.doesNotMatch(parsed.inlineMarkup, />Собеседник</u)

  assert.match(parsed.attachedMarkup, /bubble-reply-reference-copy/u)
  assert.match(parsed.attachedMarkup, />🔥<\/span>/u)
  assert.doesNotMatch(parsed.attachedMarkup, /bubble-reply-reference-label/u)
  assert.doesNotMatch(parsed.attachedMarkup, />Вы</u)
  assert.doesNotMatch(parsed.attachedMarkup, />Собеседник</u)
  assert.doesNotMatch(parsed.attachedMarkup, />Алекс Тестер</u)
})
