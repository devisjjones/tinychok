import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getActiveRoomReadKey,
  shouldSyncActiveRoomRead,
} from '../../src/app/roomReadSync'

test('active room read sync targets use stable room keys', () => {
  assert.equal(getActiveRoomReadKey(null), null)
  assert.equal(
    getActiveRoomReadKey({
      id: 7,
      kind: 'chat',
      unread: 3,
    }),
    'chat:7',
  )
})

test('active room read sync only acknowledges visible unread rooms once per in-flight request', () => {
  const target = {
    id: 9,
    kind: 'group' as const,
    unread: 2,
  }

  assert.equal(
    shouldSyncActiveRoomRead({
      documentVisible: true,
      syncInFlightRoomKey: null,
      target,
    }),
    true,
  )
  assert.equal(
    shouldSyncActiveRoomRead({
      documentVisible: false,
      syncInFlightRoomKey: null,
      target,
    }),
    false,
  )
  assert.equal(
    shouldSyncActiveRoomRead({
      documentVisible: true,
      syncInFlightRoomKey: 'group:9',
      target,
    }),
    false,
  )
  assert.equal(
    shouldSyncActiveRoomRead({
      documentVisible: true,
      syncInFlightRoomKey: null,
      target: {
        ...target,
        unread: 0,
      },
    }),
    false,
  )
})
