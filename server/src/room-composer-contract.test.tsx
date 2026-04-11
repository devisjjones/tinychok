import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RoomComposer } from '../../src/components/RoomComposer'

test('room composer keeps support composer free from video-note controls', () => {
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
      onSubmit={() => undefined}
      placeholder="Опишите проблему одним сообщением..."
      showEmojiPicker={false}
      submitAriaLabel="Отправить в поддержку"
      submitTitle="Отправить в поддержку"
    />,
  )

  assert.match(markup, /class="composer settings-item settings-support-composer"/u)
  assert.match(markup, /composer-input/u)
  assert.match(markup, /composer-field/u)
  assert.doesNotMatch(markup, /aria-label="Смайлики и GIF"/u)
  assert.match(markup, /aria-label="Добавить вложение"/u)
  assert.match(markup, /class="send-button composer-send"/u)
  assert.match(markup, /aria-label="Отправить в поддержку"/u)
  assert.doesNotMatch(markup, /round\.svg/u)
})

test('room composer swaps the primary action from video-note recorder to send arrow when payload appears', () => {
  const emptyMarkup = renderToStaticMarkup(
    <RoomComposer
      attachmentInputRef={{ current: null }}
      attachmentName=""
      draft=""
      draftInputRef={{ current: null }}
      onAttachmentChange={() => undefined}
      onAttachmentClear={() => undefined}
      onDraftChange={() => undefined}
      onOpenAttachmentPicker={() => undefined}
      onOpenVideoNoteRecorder={() => undefined}
      onSubmit={() => undefined}
      placeholder="Напиши сообщение..."
      submitAriaLabel="Отправить"
      submitTitle="Отправить"
    />,
  )
  const payloadMarkup = renderToStaticMarkup(
    <RoomComposer
      attachmentInputRef={{ current: null }}
      attachmentName=""
      draft="Тест"
      draftInputRef={{ current: null }}
      onAttachmentChange={() => undefined}
      onAttachmentClear={() => undefined}
      onDraftChange={() => undefined}
      onOpenAttachmentPicker={() => undefined}
      onOpenVideoNoteRecorder={() => undefined}
      onSubmit={() => undefined}
      placeholder="Напиши сообщение..."
      submitAriaLabel="Отправить"
      submitTitle="Отправить"
    />,
  )

  assert.match(emptyMarkup, /class="send-button composer-send composer-send-video-note"/u)
  assert.match(emptyMarkup, /aria-label="Записать видеосообщение"/u)
  assert.match(emptyMarkup, /src="\/icons\/round\.svg"/u)
  assert.doesNotMatch(emptyMarkup, /src="\/icons\/sent\.png"/u)

  assert.match(payloadMarkup, /class="send-button composer-send"/u)
  assert.match(payloadMarkup, /src="\/icons\/sent\.png"/u)
  assert.doesNotMatch(payloadMarkup, /src="\/icons\/round\.svg"/u)
})

test('direct, group, channel and thread-support surfaces reuse the shared room composer', () => {
  const directSource = readFileSync(join(process.cwd(), 'src/rooms/DirectChatRoom.tsx'), 'utf8')
  const groupSource = readFileSync(join(process.cwd(), 'src/rooms/GroupRoom.tsx'), 'utf8')
  const channelSource = readFileSync(join(process.cwd(), 'src/rooms/SubscriptionChannelRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')

  assert.match(directSource, /import \{ RoomComposer \} from '\.\.\/components\/RoomComposer'/u)
  assert.match(directSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{onOpenVideoNoteRecorder\}/u)
  assert.match(directSource, /<RoomComposer[\s\S]*submitAriaLabel="Отправить"/u)

  assert.match(groupSource, /import \{ RoomComposer \} from '\.\.\/components\/RoomComposer'/u)
  assert.match(groupSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{onOpenVideoNoteRecorder\}/u)

  assert.match(channelSource, /import \{ RoomComposer \} from '\.\.\/components\/RoomComposer'/u)
  assert.match(channelSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{publisherOnOpenVideoNoteRecorder\}/u)

  assert.match(appSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{threadTarget\.kind !== 'support' \? openThreadVideoNoteRecorder : undefined\}/u)
  assert.match(appSource, /<RoomComposer[\s\S]*className="settings-item settings-support-composer"/u)
  assert.doesNotMatch(appSource, /className="settings-input settings-support-textarea"/u)
})
