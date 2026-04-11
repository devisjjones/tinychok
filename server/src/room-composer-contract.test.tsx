import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RoomComposer } from '../../src/components/RoomComposer'

test('room composer render contract keeps support/thread controls aligned with direct composer', () => {
  const markup = renderToStaticMarkup(
    <RoomComposer
      attachmentInputRef={{ current: null }}
      attachmentName=""
      className="settings-item settings-support-composer"
      draft="Тестовое сообщение"
      draftInputRef={{ current: null }}
      onAttachmentChange={() => undefined}
      onAttachmentClear={() => undefined}
      onDraftChange={() => undefined}
      onOpenAttachmentPicker={() => undefined}
      onOpenVideoNoteRecorder={() => undefined}
      onSubmit={() => undefined}
      placeholder="Опишите проблему одним сообщением..."
      submitAriaLabel="Отправить в поддержку"
      submitTitle="Отправить в поддержку"
    />,
  )

  assert.match(markup, /class="composer settings-item settings-support-composer"/u)
  assert.match(markup, /composer-input/u)
  assert.match(markup, /composer-field/u)
  assert.match(markup, /aria-label="Смайлики и GIF"/u)
  assert.match(markup, /aria-label="Добавить вложение"/u)
  assert.match(markup, /aria-label="Записать видеосообщение"/u)
  assert.match(markup, /class="send-button composer-send"/u)
  assert.match(markup, /aria-label="Отправить в поддержку"/u)
})

test('direct room and app thread-support surfaces reuse the shared room composer', () => {
  const directSource = readFileSync(join(process.cwd(), 'src/rooms/DirectChatRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')

  assert.match(directSource, /import \{ RoomComposer \} from '\.\.\/components\/RoomComposer'/u)
  assert.match(directSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{onOpenVideoNoteRecorder\}/u)
  assert.match(directSource, /<RoomComposer[\s\S]*submitAriaLabel="Отправить"/u)
  assert.match(appSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{threadTarget\.kind !== 'support' \? openThreadVideoNoteRecorder : undefined\}/u)
  assert.match(appSource, /<RoomComposer[\s\S]*className="settings-item settings-support-composer"/u)
  assert.doesNotMatch(appSource, /className="settings-input settings-support-textarea"/u)
})
