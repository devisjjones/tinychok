import assert from 'node:assert/strict'
import test from 'node:test'

import { preservePendingAttachmentPreview } from '../../src/app/usePendingMessageOutbox'

test('preservePendingAttachmentPreview keeps the local image preview until the server message is confirmed', () => {
  const localAttachment = {
    fileName: 'photo.jpg',
    height: 720,
    mediaUrl: 'blob:tinychok-local-photo',
    mimeType: 'image/jpeg',
    size: 123_456,
    width: 1280,
  }
  const uploadedAttachment = {
    fileName: 'photo.jpg',
    height: 720,
    mediaUrl: 'uploads/media/photo.jpg',
    mimeType: 'image/jpeg',
    size: 123_456,
    width: 1280,
  }

  assert.deepEqual(
    preservePendingAttachmentPreview(localAttachment, uploadedAttachment),
    localAttachment,
  )
})

test('preservePendingAttachmentPreview accepts the uploaded attachment after the optimistic preview is gone', () => {
  const uploadedAttachment = {
    fileName: 'photo.jpg',
    height: 720,
    mediaUrl: 'uploads/media/photo.jpg',
    mimeType: 'image/jpeg',
    size: 123_456,
    width: 1280,
  }

  assert.deepEqual(
    preservePendingAttachmentPreview(undefined, uploadedAttachment),
    uploadedAttachment,
  )
  assert.deepEqual(
    preservePendingAttachmentPreview(
      {
        ...uploadedAttachment,
        mediaUrl: 'uploads/media/photo-v1.jpg',
      },
      uploadedAttachment,
    ),
    uploadedAttachment,
  )
})
