import assert from 'node:assert/strict'
import test from 'node:test'

import { compareTimelineItems, mergeTimelineItems } from '../../src/app/useRoomHistoryWindow'

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

