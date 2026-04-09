import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareTimelineItems,
  mergeTimelineItems,
  mergeVisibleTimelineItems,
} from '../../src/app/useRoomHistoryWindow'

test('compareTimelineItems keeps optimistic room messages after confirmed tail items when timestamps match', () => {
  const createdAt = '2026-04-09T10:00:00.000Z'

  assert.equal(
    compareTimelineItems(
      { createdAt, id: 1042 },
      { createdAt, id: -1 },
    ) < 0,
    true,
  )
  assert.equal(
    compareTimelineItems(
      { createdAt, id: -1 },
      { createdAt, id: 1042 },
    ) > 0,
    true,
  )
})

test('mergeTimelineItems preserves send order for multiple optimistic messages with the same timestamp', () => {
  const createdAt = '2026-04-09T10:00:00.000Z'

  const mergedItems = mergeTimelineItems(
    [],
    [
      { createdAt, id: 401 },
      { createdAt, id: 402 },
      { createdAt, id: -1 },
      { createdAt, id: -2 },
    ],
  )

  assert.deepEqual(
    mergedItems.map((item) => item.id),
    [401, 402, -1, -2],
  )
})

test('mergeVisibleTimelineItems keeps pending tail after newer confirmed server timestamps', () => {
  const mergedItems = mergeVisibleTimelineItems(
    [],
    [
      { createdAt: '2026-04-09T10:00:00.500Z', id: 401 },
      { createdAt: '2026-04-09T10:00:00.700Z', id: 402 },
      { createdAt: '2026-04-09T10:00:00.300Z', id: -3 },
    ],
  )

  assert.deepEqual(
    mergedItems.map((item) => item.id),
    [401, 402, -3],
  )
})

test('mergeVisibleTimelineItems keeps older history before the current room slice while preferring recent duplicates', () => {
  const mergedItems = mergeVisibleTimelineItems(
    [
      { createdAt: '2026-04-09T09:59:58.000Z', id: 301 },
      { createdAt: '2026-04-09T09:59:59.000Z', id: 302 },
      { createdAt: '2026-04-09T10:00:00.000Z', id: 401 },
    ],
    [
      { createdAt: '2026-04-09T10:00:00.500Z', id: 401 },
      { createdAt: '2026-04-09T10:00:00.700Z', id: 402 },
      { createdAt: '2026-04-09T10:00:00.300Z', id: -3 },
    ],
  )

  assert.deepEqual(
    mergedItems.map((item) => item.id),
    [301, 302, 401, 402, -3],
  )
  assert.equal(mergedItems[2]?.createdAt, '2026-04-09T10:00:00.500Z')
})
