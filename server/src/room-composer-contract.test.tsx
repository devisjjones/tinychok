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

test('room composer shows edit banner and disables attachment picker while editing', () => {
  const markup = renderToStaticMarkup(
    <RoomComposer
      attachmentInputRef={{ current: null }}
      attachmentName=""
      draft="Исправленный текст"
      draftInputRef={{ current: null }}
      editTarget={{ author: 'me', id: 7, text: 'Исходный текст' }}
      onAttachmentChange={() => undefined}
      onAttachmentClear={() => undefined}
      onDraftChange={() => undefined}
      onEditCancel={() => undefined}
      onOpenAttachmentPicker={() => undefined}
      onSubmit={() => undefined}
      placeholder="Напиши сообщение..."
      submitAriaLabel="Отправить"
      submitTitle="Отправить"
    />,
  )

  assert.match(markup, /Редактирование/u)
  assert.match(markup, /Исходный текст/u)
  assert.match(markup, /aria-label="Отменить редактирование"/u)
  assert.match(markup, /aria-label="Добавить вложение"[^>]*disabled/u)
})

test('direct, group, channel and thread-support surfaces reuse the shared room composer', () => {
  const directSource = readFileSync(join(process.cwd(), 'src/rooms/DirectChatRoom.tsx'), 'utf8')
  const groupSource = readFileSync(join(process.cwd(), 'src/rooms/GroupRoom.tsx'), 'utf8')
  const channelSource = readFileSync(join(process.cwd(), 'src/rooms/SubscriptionChannelRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')

  assert.match(directSource, /import \{ RoomComposer \} from '\.\.\/components\/RoomComposer'/u)
  assert.match(directSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{onOpenVideoNoteRecorder\}/u)
  assert.match(directSource, /<RoomComposer[\s\S]*submitAriaLabel="Отправить"/u)
  assert.match(directSource, /<RoomComposer[\s\S]*editTarget=\{editTarget\}/u)
  assert.match(directSource, /<RoomComposer[\s\S]*onEditCancel=\{onEditCancel\}/u)

  assert.match(groupSource, /import \{ RoomComposer \} from '\.\.\/components\/RoomComposer'/u)
  assert.match(groupSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{onOpenVideoNoteRecorder\}/u)
  assert.match(groupSource, /<RoomComposer[\s\S]*editTarget=\{editTarget\}/u)
  assert.match(groupSource, /<RoomComposer[\s\S]*onEditCancel=\{onEditCancel\}/u)

  assert.match(channelSource, /import \{ RoomComposer \} from '\.\.\/components\/RoomComposer'/u)
  assert.match(channelSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{publisherOnOpenVideoNoteRecorder\}/u)
  assert.match(channelSource, /<RoomComposer[\s\S]*editTarget=\{publisherEditTarget\}/u)
  assert.match(channelSource, /<RoomComposer[\s\S]*onEditCancel=\{publisherOnEditCancel\}/u)

  assert.match(appSource, /<RoomComposer[\s\S]*onOpenVideoNoteRecorder=\{threadTarget\.kind !== 'support' \? openThreadVideoNoteRecorder : undefined\}/u)
  assert.match(appSource, /<RoomComposer[\s\S]*editTarget=\{threadEditTarget\}/u)
  assert.match(appSource, /<RoomComposer[\s\S]*onEditCancel=\{cancelThreadCommentEdit\}/u)
  assert.match(appSource, /<RoomComposer[\s\S]*className="settings-item settings-support-composer"/u)
  assert.doesNotMatch(appSource, /className="settings-input settings-support-textarea"/u)
})

test('room composer keeps mobile submit taps on the textarea instead of letting the primary button steal focus', () => {
  const roomComposerSource = readFileSync(join(process.cwd(), 'src/components/RoomComposer.tsx'), 'utf8')
  const directSource = readFileSync(join(process.cwd(), 'src/rooms/DirectChatRoom.tsx'), 'utf8')
  const groupSource = readFileSync(join(process.cwd(), 'src/rooms/GroupRoom.tsx'), 'utf8')

  assert.match(roomComposerSource, /import \{ preserveComposerFocusOnPrimaryAction \} from '\.\.\/shared\/utils'/u)
  assert.match(roomComposerSource, /function preserveDraftFocusOnPrimaryAction/u)
  assert.match(roomComposerSource, /onMouseDown=\{preserveDraftFocusOnPrimaryAction\}/u)
  assert.match(roomComposerSource, /onPointerDown=\{preserveDraftFocusOnPrimaryAction\}/u)
  assert.match(
    directSource,
    /await Promise\.resolve\(onSubmit\(\)\)\s*if \(!shouldAutoFocusTextInputOnSceneOpen\(\)\) return/u,
  )
  assert.match(
    groupSource,
    /await Promise\.resolve\(onSubmit\(\)\)\s*if \(!shouldAutoFocusTextInputOnSceneOpen\(\)\) return/u,
  )
})
