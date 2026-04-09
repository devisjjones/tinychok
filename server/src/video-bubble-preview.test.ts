import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('video bubble renders a preview frame shell with play icon and overlay metadata instead of file details', () => {
  const script = `
    import React from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { BubbleImageOverlayMeta, BubbleMessageContent } from './src/components/BubbleMessageContent.tsx'

    const markup = renderToStaticMarkup(
      React.createElement(BubbleMessageContent, {
        imageOverlay: React.createElement(BubbleImageOverlayMeta, {
          deliveryIndicatorSrc: '/icons/double-tick-50.png',
          time: '12:16',
        }),
        message: {
          attachment: {
            fileName: 'VID_20260408_151326.mp4',
            mediaUrl: 'https://api.staging.tinychok.ru/uploads/attachments/2026-04-08/701dfdb9-042d-418b-bc5a-7882497c0318.mp4',
            mimeType: 'video/mp4',
            size: 2506350,
          },
          attachmentRemovedNotice: undefined,
          replyTo: undefined,
          sourceContact: undefined,
          sourceGroup: undefined,
          text: '',
        },
        onOpenAttachment: () => undefined,
      }),
    )

    console.log(JSON.stringify({ markup }))
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
  const parsed = JSON.parse(result.stdout.trim()) as { markup: string }
  const { markup } = parsed

  assert.match(markup, /<video/u)
  assert.match(markup, /bubble-attachment-photo/u)
  assert.match(markup, /bubble-attachment-video-preview/u)
  assert.match(markup, /#t=0\.001/u)
  assert.match(markup, /bubble-attachment-play-button/u)
  assert.match(markup, /bubble-attachment-play-icon/u)
  assert.match(markup, /bubble-attachment-image-overlay/u)
  assert.match(markup, /12:16/u)
  assert.match(markup, /double-tick-50\.png/u)
  assert.doesNotMatch(markup, /bubble-attachment-link/u)
  assert.doesNotMatch(markup, /bubble-attachment-copy/u)
  assert.doesNotMatch(markup, /VID_20260408_151326\.mp4/u)
  assert.doesNotMatch(markup, /2\.4/u)
})
