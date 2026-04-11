import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MessageAttachment } from '../../src/app/types'
import { formatAttachmentPreviewText, formatMessagePreview } from '../../src/shared/utils'
import { BubbleMessageContent } from '../../src/components/BubbleMessageContent'
import { ComposerAttachmentPreview } from '../../src/components/ComposerAttachmentPreview'

const videoNoteAttachment: MessageAttachment = {
  fileName: 'video-note-20260411-112233.webm',
  mediaUrl: 'uploads/attachments/video-note-20260411-112233.webm',
  mimeType: 'video/webm',
  presentation: 'video-note',
  size: 1_250_000,
}

test('video-note summaries stay human-readable instead of falling back to file names', () => {
  assert.equal(formatAttachmentPreviewText(videoNoteAttachment), 'Видеосообщение')
  assert.equal(
    formatMessagePreview({
      attachment: videoNoteAttachment,
      attachmentRemovedNotice: undefined,
      sourceChannel: undefined,
      sourceContact: undefined,
      sourceGroup: undefined,
      text: '',
    }),
    'Видеосообщение',
  )
})

test('video-note bubbles render through the dedicated circular media path', () => {
  const markup = renderToStaticMarkup(
    <BubbleMessageContent
      message={{
        attachment: videoNoteAttachment,
        attachmentRemovedNotice: undefined,
        replyTo: undefined,
        sourceContact: undefined,
        sourceGroup: undefined,
        text: '',
      }}
      onOpenAttachment={() => undefined}
    />,
  )

  assert.match(markup, /bubble-attachment-photo-video-note/u)
  assert.match(markup, /bubble-attachment-image-video-note/u)
  assert.match(markup, /bubble-attachment-play-button-video-note/u)
  assert.match(markup, /Видеосообщение/u)
  assert.doesNotMatch(markup, /video-note-20260411-112233\.webm/u)
})

test('composer preview keeps video-note as a circular draft without rename or send-original controls', () => {
  const markup = renderToStaticMarkup(
    <ComposerAttachmentPreview
      attachmentDraft={{
        fileName: videoNoteAttachment.fileName,
        kind: 'video-note',
        mimeType: videoNoteAttachment.mimeType,
        originalSize: videoNoteAttachment.size,
        presentation: 'video-note',
        previewUrl: 'blob:video-note-preview',
        sendOriginal: false,
        size: videoNoteAttachment.size,
        status: 'ready',
      }}
      onClear={() => undefined}
      onOpenPreview={() => undefined}
    />,
  )

  assert.match(markup, /composer-attachment-preview-video-note-button/u)
  assert.match(markup, /Открыть превью видеосообщения/u)
  assert.match(markup, />Видеосообщение</u)
  assert.doesNotMatch(markup, /composer-attachment-rename-trigger/u)
  assert.doesNotMatch(markup, /Без сжатия/u)
})
