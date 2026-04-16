import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseMessageTextSegments,
  renderComposerMarkupToHtml,
  stripMessageFormattingMarkup,
  wrapComposerVisibleSelectionWithMarkup,
} from '../../src/shared/utils'

test('message formatting parser keeps bold links and inline styles as structured segments', () => {
  const segments = parseMessageTextSegments('Привет, <b>жирный https://example.com</b> и <u>подчеркнутый</u> текст')

  assert.deepEqual(
    segments.map((segment) => ({
      kind: segment.kind,
      style: segment.style,
      value: segment.value,
    })),
    [
      {
        kind: 'text',
        style: { bold: false, italic: false, strike: false, underline: false },
        value: 'Привет, ',
      },
      {
        kind: 'text',
        style: { bold: true, italic: false, strike: false, underline: false },
        value: 'жирный ',
      },
      {
        kind: 'external-link',
        style: { bold: true, italic: false, strike: false, underline: false },
        value: 'https://example.com',
      },
      {
        kind: 'text',
        style: { bold: false, italic: false, strike: false, underline: false },
        value: ' и ',
      },
      {
        kind: 'text',
        style: { bold: false, italic: false, strike: false, underline: true },
        value: 'подчеркнутый',
      },
      {
        kind: 'text',
        style: { bold: false, italic: false, strike: false, underline: false },
        value: ' текст',
      },
    ],
  )
})

test('message formatting parser turns mentions into bold full-name segments', () => {
  const segments = parseMessageTextSegments('Привет, @mira!', [
    {
      nickname: 'mira',
      sourceContact: {
        handle: '@mira',
        identifier: '+799900000011',
        title: 'Мира Тестова',
      },
    },
  ])

  assert.deepEqual(
    segments.map((segment) => ({
      kind: segment.kind,
      style: segment.style,
      value: segment.value,
    })),
    [
      {
        kind: 'text',
        style: { bold: false, italic: false, strike: false, underline: false },
        value: 'Привет, ',
      },
      {
        kind: 'mention',
        style: { bold: true, italic: false, strike: false, underline: false },
        value: 'Мира Тестова',
      },
      {
        kind: 'text',
        style: { bold: false, italic: false, strike: false, underline: false },
        value: '!',
      },
    ],
  )
})

test('message formatting stripper removes inline markup from previews and reply snippets', () => {
  assert.equal(
    stripMessageFormattingMarkup('До <b>жирного</b> и <s>перечёркнутого</s> текста'),
    'До жирного и перечёркнутого текста',
  )
})

test('composer rich input html renderer keeps inline styles visible inside the editor', () => {
  assert.equal(
    renderComposerMarkupToHtml('До <b>жирного</b> и <u>подчеркнутого</u> текста'),
    'До <b>жирного</b> и <u>подчеркнутого</u> текста',
  )
  assert.equal(
    renderComposerMarkupToHtml('<i>первая строка</i>\n<b>вторая строка</b>'),
    '<i>первая строка</i><br><b>вторая строка</b>',
  )
})

test('composer visible-selection wrapper preserves existing markup and wraps selected visible text', () => {
  assert.equal(
    wrapComposerVisibleSelectionWithMarkup('До жирного и текста', 3, 10, 'bold'),
    'До <b>жирного</b> и текста',
  )
  assert.equal(
    wrapComposerVisibleSelectionWithMarkup('До <i>жирного</i> и текста', 3, 10, 'underline'),
    'До <u><i>жирного</i></u> и текста',
  )
})
