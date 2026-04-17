import assert from 'node:assert/strict'
import test from 'node:test'

import { createPostAuthMainSurfaceState } from '../../src/app/postAuthMainSurface'

test('post-auth main surface resets to the default chats list view', () => {
  assert.deepEqual(createPostAuthMainSurfaceState(), {
    activeChannelId: null,
    activeChatId: null,
    activeFilter: 'Все',
    activeGroupId: null,
    activeSubscriptionChannelId: null,
    bottomSection: 'chats',
    channelDetailView: 'main',
    channelsView: 'list',
    contactsTab: 'all',
    premiumGiftChatId: null,
    previewSubscriptionChannel: null,
    query: '',
    searchOpen: false,
    searchTopFilter: 'all',
    settingsView: 'profile',
    stageView: 'main',
    topListView: 'none',
  })
})
