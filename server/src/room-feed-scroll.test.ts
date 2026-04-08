import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRoomFeedSignature,
  classifyRoomFeedChange,
  isRoomFeedNearBottom,
  shouldAutoScrollRoomFeed,
} from '../../src/app/roomFeedScroll'

test('room feed signatures track latest visible item', () => {
  assert.deepEqual(buildRoomFeedSignature([]), {
    count: 0,
    lastItemId: null,
  })
  assert.deepEqual(buildRoomFeedSignature([{ id: 4 }, { id: 7 }]), {
    count: 2,
    lastItemId: 7,
  })
})

test('room feed classifier separates room switch, prepend, append and tail replacement', () => {
  const previous = { count: 4, lastItemId: 40 }

  assert.equal(
    classifyRoomFeedChange({
      next: { count: 4, lastItemId: 40 },
      prependMutation: false,
      previous,
      roomChanged: true,
    }),
    'room-switch',
  )
  assert.equal(
    classifyRoomFeedChange({
      next: { count: 9, lastItemId: 40 },
      prependMutation: true,
      previous,
      roomChanged: false,
    }),
    'prepend',
  )
  assert.equal(
    classifyRoomFeedChange({
      next: { count: 5, lastItemId: 50 },
      prependMutation: false,
      previous,
      roomChanged: false,
    }),
    'append',
  )
  assert.equal(
    classifyRoomFeedChange({
      next: { count: 4, lastItemId: 41 },
      prependMutation: false,
      previous,
      roomChanged: false,
    }),
    'tail-replaced',
  )
})

test('room feed auto-scroll contract keeps incoming messages from dragging users who read older history', () => {
  assert.equal(
    shouldAutoScrollRoomFeed({
      changeKind: 'room-switch',
      intent: null,
      stickyToBottom: false,
    }),
    true,
  )
  assert.equal(
    shouldAutoScrollRoomFeed({
      changeKind: 'append',
      intent: 'local-send',
      stickyToBottom: false,
    }),
    true,
  )
  assert.equal(
    shouldAutoScrollRoomFeed({
      changeKind: 'append',
      intent: null,
      stickyToBottom: true,
    }),
    true,
  )
  assert.equal(
    shouldAutoScrollRoomFeed({
      changeKind: 'append',
      intent: null,
      stickyToBottom: false,
    }),
    false,
  )
  assert.equal(
    shouldAutoScrollRoomFeed({
      changeKind: 'prepend',
      intent: 'local-send',
      stickyToBottom: true,
    }),
    false,
  )
})

test('near-bottom helper uses sticky threshold for live feeds', () => {
  assert.equal(
    isRoomFeedNearBottom({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 540,
    }),
    true,
  )
  assert.equal(
    isRoomFeedNearBottom({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 500,
    }),
    false,
  )
})
