import assert from 'node:assert/strict'
import test from 'node:test'
import { hasUsableThreadRoot } from '../../src/app/threadRoots'

test('thread room keeps a live root open even before threadId materializes locally', () => {
  assert.equal(hasUsableThreadRoot({}), true)
  assert.equal(hasUsableThreadRoot({ threadArchivedAt: undefined }), true)
  assert.equal(hasUsableThreadRoot({ threadArchivedAt: null }), true)
  assert.equal(hasUsableThreadRoot({ threadArchivedAt: '2026-04-17T10:00:00.000Z' }), false)
  assert.equal(hasUsableThreadRoot(null), false)
  assert.equal(hasUsableThreadRoot(undefined), false)
})
