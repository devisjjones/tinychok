import assert from 'node:assert/strict'
import test from 'node:test'
import { buildComposerAttachmentDraft } from '../../src/app/composerAttachments'
import {
  buildVideoNoteFile,
  buildVideoNoteFileName,
  clampVideoNoteRecordingProgress,
  resolveSupportedVideoNoteMimeType,
  shouldAutoStopVideoNoteRecording,
  stopMediaStreamTracks,
  videoNoteRecordingLimitMs,
} from '../../src/app/videoNotes'

test('video-note recorder prefers the strongest supported mime candidate first', () => {
  const mimeType = resolveSupportedVideoNoteMimeType({
    isTypeSupported(candidate) {
      return candidate === 'video/webm;codecs=vp8,opus' || candidate === 'video/webm'
    },
  })

  assert.equal(mimeType, 'video/webm;codecs=vp8,opus')
})

test('video-note recorder filename uses deterministic timestamp and extension', () => {
  const fileName = buildVideoNoteFileName(new Date(2026, 3, 11, 12, 34, 56), 'video/mp4')
  assert.equal(fileName, 'video-note-20260411-123456.mp4')
})

test('video-note recorder normalizes codec mime parameters into a sendable ready draft', async () => {
  const file = buildVideoNoteFile(new Blob(['video-note'], { type: 'video/webm;codecs=vp8,opus' }), {
    now: new Date(2026, 3, 11, 12, 34, 56),
  })
  const draft = await buildComposerAttachmentDraft(file, {
    presentation: 'video-note',
    previewUrl: 'blob:video-note-preview',
  })

  assert.equal(file.name, 'video-note-20260411-123456.webm')
  assert.equal(file.type, 'video/webm')
  assert.equal(draft.status, 'ready')
  assert.equal(draft.kind, 'video-note')
  assert.equal(draft.mimeType, 'video/webm')
})

test('video-note recorder progress clamps and auto-stop triggers at the 30-second limit', () => {
  assert.equal(clampVideoNoteRecordingProgress(0), 0)
  assert.equal(clampVideoNoteRecordingProgress(videoNoteRecordingLimitMs / 2), 0.5)
  assert.equal(clampVideoNoteRecordingProgress(videoNoteRecordingLimitMs * 2), 1)
  assert.equal(shouldAutoStopVideoNoteRecording(videoNoteRecordingLimitMs - 1), false)
  assert.equal(shouldAutoStopVideoNoteRecording(videoNoteRecordingLimitMs), true)
})

test('video-note recorder cleanup stops every media track on close', () => {
  const stopped: string[] = []
  stopMediaStreamTracks({
    getTracks() {
      return [
        { stop: () => stopped.push('video') },
        { stop: () => stopped.push('audio') },
      ]
    },
  } as never)

  assert.deepEqual(stopped, ['video', 'audio'])
})
