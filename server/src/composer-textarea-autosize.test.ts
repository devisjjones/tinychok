import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import { resizeComposerTextarea } from '../../src/app/utils'

function withDom(
  html: string,
  run: (dom: JSDOM) => void,
) {
  const dom = new JSDOM(html)
  const globalTarget = globalThis as Record<string, unknown>
  const previousWindow = globalTarget.window
  const previousDocument = globalTarget.document
  const previousHTMLElement = globalTarget.HTMLElement
  const previousHTMLTextAreaElement = globalTarget.HTMLTextAreaElement

  globalTarget.window = dom.window as unknown
  globalTarget.document = dom.window.document as unknown
  globalTarget.HTMLElement = dom.window.HTMLElement as unknown
  globalTarget.HTMLTextAreaElement = dom.window.HTMLTextAreaElement as unknown

  try {
    run(dom)
  } finally {
    if (previousWindow === undefined) {
      delete globalTarget.window
    } else {
      globalTarget.window = previousWindow
    }

    if (previousDocument === undefined) {
      delete globalTarget.document
    } else {
      globalTarget.document = previousDocument
    }

    if (previousHTMLElement === undefined) {
      delete globalTarget.HTMLElement
    } else {
      globalTarget.HTMLElement = previousHTMLElement
    }

    if (previousHTMLTextAreaElement === undefined) {
      delete globalTarget.HTMLTextAreaElement
    } else {
      globalTarget.HTMLTextAreaElement = previousHTMLTextAreaElement
    }
  }
}

function mockTextareaMetrics(
  textarea: HTMLTextAreaElement,
  options: {
    clientHeight?: number
    scrollHeight: number
  },
) {
  Object.defineProperty(textarea, 'clientHeight', {
    configurable: true,
    get: () => options.clientHeight ?? (Number.parseFloat(textarea.style.height) || 0),
  })
  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    get: () => options.scrollHeight,
  })
}

test('resizeComposerTextarea expands until content fits without inner scroll', () => {
  withDom('<!doctype html><textarea></textarea>', (dom) => {
    const textarea = dom.window.document.querySelector('textarea') as HTMLTextAreaElement
    textarea.style.minHeight = '48px'
    textarea.style.maxHeight = '160px'
    textarea.style.height = '48px'
    mockTextareaMetrics(textarea, { scrollHeight: 96 })

    const result = resizeComposerTextarea(textarea)

    assert.equal(result.minHeight, 48)
    assert.equal(result.maxHeight, 160)
    assert.equal(result.height, 96)
    assert.equal(result.expanded, true)
    assert.equal(result.overflowY, 'hidden')
    assert.equal(textarea.style.height, '96px')
    assert.equal(textarea.style.overflowY, 'hidden')
  })
})

test('resizeComposerTextarea caps height at half of the support scene and enables inner scroll after overflow', () => {
  withDom('<!doctype html><div class="settings-stack-support"><textarea></textarea></div>', (dom) => {
    const supportScene = dom.window.document.querySelector('.settings-stack-support') as HTMLDivElement
    const textarea = dom.window.document.querySelector('textarea') as HTMLTextAreaElement

    Object.defineProperty(supportScene, 'clientHeight', {
      configurable: true,
      get: () => 600,
    })

    textarea.style.minHeight = '124px'
    textarea.style.maxHeight = 'none'
    textarea.style.height = '124px'
    mockTextareaMetrics(textarea, { scrollHeight: 420 })

    const result = resizeComposerTextarea(textarea)

    assert.equal(result.minHeight, 124)
    assert.equal(result.maxHeight, 300)
    assert.equal(result.height, 300)
    assert.equal(result.expanded, true)
    assert.equal(result.overflowY, 'auto')
    assert.equal(textarea.style.height, '300px')
    assert.equal(textarea.style.overflowY, 'auto')
  })
})
