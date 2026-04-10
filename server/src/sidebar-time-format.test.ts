import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatGroupTime,
  formatMessageTimeLabel,
  formatSidebarActivityLabel,
  formatSubscriptionChannelTime,
} from '../../src/shared/utils'
import type { GroupPreview, SubscriptionChannel } from '../../src/shared/types'

test('sidebar activity labels show time only for today and short date for older activity', () => {
  const now = new Date('2026-04-06T18:00:00.000Z')

  assert.match(
    formatSidebarActivityLabel('2026-04-06T15:06:00.000Z', '03:06', now),
    /^\d{2}:\d{2}$/u,
  )
  assert.equal(formatSidebarActivityLabel(undefined, '03:06', now), '03:06')
  assert.equal(formatSidebarActivityLabel('', '20:14', now), '20:14')
  assert.match(
    formatSidebarActivityLabel('2026-04-04T15:14:00.000Z', '20:14', now),
    /^4 апр\.$/u,
  )
})

test('group and channel list formatters reuse sidebar activity labels instead of stale raw times', () => {
  const group = {
    accent: '#8c5738',
    archivedAt: undefined,
    avatarImage: undefined,
    id: 17,
    latestActivityAt: '2026-04-04T15:14:00.000Z',
    members: 2,
    messages: [
      {
        author: 'me',
        createdAt: '2026-04-04T15:14:00.000Z',
        id: 1,
        text: 'Привет',
        time: '20:14',
      },
    ],
    muted: false,
    preview: 'Привет',
    time: '20:14',
    title: 'Тест группа',
    unread: 0,
  } as GroupPreview

  const channel = {
    accent: '#8c5738',
    archivedAt: undefined,
    avatarImage: undefined,
    handle: '@test',
    id: 9,
    latestActivityAt: '2026-04-04T15:14:00.000Z',
    muted: false,
    posts: [
      {
        createdAt: '2026-04-04T15:14:00.000Z',
        id: 1,
        text: 'Пост',
        time: '20:14',
      },
    ],
    preview: 'Пост',
    readers: 2,
    time: '20:14',
    title: 'Тестовый канал',
    unread: 0,
  } as SubscriptionChannel

  assert.match(formatGroupTime(group), /^4 апр\.$/u)
  assert.match(formatSubscriptionChannelTime(channel), /^4 апр\.$/u)
})

test('message time labels prefer createdAt over stale fallback time strings', () => {
  const formatted = formatMessageTimeLabel('2026-04-10T20:44:00.000Z', '17:44')

  assert.match(formatted, /^\d{2}:\d{2}$/u)
  assert.notEqual(formatted, '17:44')
  assert.equal(formatMessageTimeLabel(undefined, '17:44'), '17:44')
})
