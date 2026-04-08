import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveSearchChannelOpenTarget } from '../../src/app/channelSearch'
import type { Channel, ChannelSearchResult, SubscriptionChannel } from '../../src/app/types'

function buildSearchChannel(overrides: Partial<ChannelSearchResult> = {}): ChannelSearchResult {
  return {
    accent: '#8c5738',
    handle: '@test_channel',
    id: 77,
    title: 'Тестовый канал',
    unread: 0,
    visibility: 'public',
    ...overrides,
  }
}

function buildSubscriptionChannel(overrides: Partial<SubscriptionChannel> = {}): SubscriptionChannel {
  return {
    accent: '#8c5738',
    draft: false,
    handle: '@test_channel',
    id: 101,
    participants: [],
    posts: [],
    preview: '',
    readers: 0,
    time: '',
    title: 'Тестовый канал',
    unread: 0,
    visibility: 'public',
    ...overrides,
  }
}

function buildManagedChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    avatarTone: '#8c5738',
    commentBlacklistIdentifiers: [],
    commentsEnabledForAll: true,
    commentsEnabledForPremium: false,
    description: '',
    directLink: '@test_channel',
    id: 77,
    status: 'active',
    statusText: '',
    title: 'Тестовый канал',
    visibility: 'public',
    ...overrides,
  }
}

test('search channel open target prefers exact handle and never falls back by title alone', () => {
  const result = buildSearchChannel({
    handle: '@верхний_канал',
    id: 6,
    title: 'Тестовый канал 6',
  })

  const subscriptionChannels = [
    buildSubscriptionChannel({
      handle: '@нижний_канал',
      id: 8,
      title: 'Тестовый канал 8',
    }),
  ]

  const managedChannels = [
    buildManagedChannel({
      directLink: '@нижний_канал',
      id: 8,
      title: 'Тестовый канал 8',
    }),
  ]

  const target = resolveSearchChannelOpenTarget(result, subscriptionChannels, managedChannels)

  assert.deepEqual(target, {
    kind: 'preview-by-handle',
    handle: '@верхний_канал',
  })
})

test('search channel open target resolves the exact managed channel by handle before id fallback', () => {
  const result = buildSearchChannel({
    handle: '@верхний_канал',
    id: 6,
    title: 'Тестовый канал 6',
  })

  const managedChannels = [
    buildManagedChannel({
      directLink: '@нижний_канал',
      id: 6,
      title: 'Тестовый канал 8',
    }),
    buildManagedChannel({
      directLink: '@верхний_канал',
      id: 12,
      title: 'Тестовый канал 6',
    }),
  ]

  const target = resolveSearchChannelOpenTarget(result, [], managedChannels)

  assert.deepEqual(target, {
    kind: 'managed-preview',
    managedChannelId: 12,
  })
})
