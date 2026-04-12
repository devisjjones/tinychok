import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import type { MessageAttachment } from '../../src/app/types'
import { formatAttachmentPreviewText, formatMessagePreview } from '../../src/shared/utils'
import { BubbleMessageContent } from '../../src/components/BubbleMessageContent'
import { ComposerAttachmentPreview } from '../../src/components/ComposerAttachmentPreview'
import { VideoNoteRecorderOverlay } from '../../src/components/VideoNoteRecorderOverlay'

const videoNoteAttachment: MessageAttachment = {
  fileName: 'video-note-20260411-112233.webm',
  mediaUrl: 'uploads/attachments/video-note-20260411-112233.webm',
  mimeType: 'video/webm',
  presentation: 'video-note',
  size: 1_250_000,
}

function withBrowserEnvironment(
  options: {
    coarsePointer?: boolean
    maxTouchPoints?: number
    userAgent: string
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

  Object.defineProperty(dom.window.navigator, 'userAgent', {
    configurable: true,
    value: options.userAgent,
  })

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
  assert.doesNotMatch(markup, />video-note-20260411-112233\.webm</u)
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

test('video-note recorder uses the mobile square title on mobile browsers and keeps the circle title on desktop', () => {
  withBrowserEnvironment(
    {
      coarsePointer: true,
      maxTouchPoints: 5,
      userAgent:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
    },
    () => {
      const mobileMarkup = renderToStaticMarkup(
        <VideoNoteRecorderOverlay onClose={() => undefined} onUse={() => undefined} />,
      )

      assert.match(mobileMarkup, /Видео-квадратик/u)
      assert.match(mobileMarkup, /Закрыть видео-квадратик/u)
    },
  )

  withBrowserEnvironment(
    {
      coarsePointer: false,
      maxTouchPoints: 0,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    () => {
      const desktopMarkup = renderToStaticMarkup(
        <VideoNoteRecorderOverlay onClose={() => undefined} onUse={() => undefined} />,
      )

      assert.match(desktopMarkup, /Видео-квадратик/u)
      assert.match(desktopMarkup, /Закрыть видео-квадратик/u)
    },
  )
})
