import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appNavigationHistoryStateMarker,
  createAppNavigationHistoryState,
  getAppNavigationRouteEntryKey,
  readAppNavigationHistoryState,
  type AppNavigationRoute,
} from '../../src/app/browserNavigationHistory'

const baseRoute: AppNavigationRoute = {
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
  threadTarget: null,
  topListView: 'none',
}

test('browser navigation history state round-trips through the shared marker contract', () => {
  const historyState = createAppNavigationHistoryState(baseRoute, 3)
  const restoredState = readAppNavigationHistoryState(historyState)

  assert.deepEqual(restoredState, historyState)
  assert.equal(historyState.marker, appNavigationHistoryStateMarker)
  assert.equal(historyState.depth, 3)
})

test('browser navigation entry keys change only for real screen transitions', () => {
  const mainListKey = getAppNavigationRouteEntryKey(baseRoute)
  const searchKey = getAppNavigationRouteEntryKey({
    ...baseRoute,
    query: 'пикачу',
    searchOpen: true,
  })
  const searchRefinedKey = getAppNavigationRouteEntryKey({
    ...baseRoute,
    activeFilter: '★',
    contactsTab: 'incoming',
    query: 'пикачу gif',
    searchOpen: true,
    searchTopFilter: 'channels',
  })
  const directRoomKey = getAppNavigationRouteEntryKey({
    ...baseRoute,
    activeChatId: 41,
  })
  const threadRoomKey = getAppNavigationRouteEntryKey({
    ...baseRoute,
    threadTarget: {
      groupId: 12,
      kind: 'group',
      messageId: 77,
    },
  })
  const settingsKey = getAppNavigationRouteEntryKey({
    ...baseRoute,
    settingsView: 'quiet',
    stageView: 'settings',
  })

  assert.notEqual(mainListKey, searchKey)
  assert.equal(searchKey, searchRefinedKey)
  assert.notEqual(searchKey, directRoomKey)
  assert.notEqual(directRoomKey, threadRoomKey)
  assert.notEqual(threadRoomKey, settingsKey)
})

test('browser navigation history parser rejects malformed or foreign payloads', () => {
  assert.equal(readAppNavigationHistoryState(null), null)
  assert.equal(readAppNavigationHistoryState({}), null)
  assert.equal(
    readAppNavigationHistoryState({
      depth: 1,
      marker: 'foreign-marker',
      route: baseRoute,
    }),
    null,
  )
  assert.equal(
    readAppNavigationHistoryState({
      depth: 1,
      marker: appNavigationHistoryStateMarker,
      route: {
        ...baseRoute,
        activeChatId: 'broken',
      },
    }),
    null,
  )
})
