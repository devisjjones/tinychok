import type { ContactsTabKey } from './contactsContract'
import type {
  ChannelsView,
  SettingsView,
  StageView,
  SubscriptionChannel,
  TopListView,
} from './types'
import type { ThreadTarget } from './useThreadFlow'

export type SearchTopFilter = 'all' | 'contacts' | 'channels'

export const appNavigationHistoryStateMarker = 'tinychok-app-navigation'

export type AppNavigationRoute = {
  activeChannelId: number | null
  activeChatId: number | null
  activeFilter: string
  activeGroupId: number | null
  activeSubscriptionChannelId: number | null
  bottomSection: 'chats' | 'contacts'
  channelDetailView: 'main' | 'storage'
  channelsView: ChannelsView
  contactsTab: ContactsTabKey
  premiumGiftChatId: number | null
  previewSubscriptionChannel: SubscriptionChannel | null
  query: string
  searchOpen: boolean
  searchTopFilter: SearchTopFilter
  settingsView: SettingsView
  stageView: StageView
  threadTarget: ThreadTarget | null
  topListView: TopListView
}

export type AppNavigationHistoryState = {
  depth: number
  marker: typeof appNavigationHistoryStateMarker
  route: AppNavigationRoute
}

function isThreadTarget(value: unknown): value is ThreadTarget {
  if (!value || typeof value !== 'object') {
    return false
  }

  const target = value as Record<string, unknown>
  if (target.kind === 'support') {
    return typeof target.ticketId === 'number'
  }

  if (target.kind === 'group') {
    return typeof target.groupId === 'number' && typeof target.messageId === 'number'
  }

  if (target.kind === 'channel') {
    return typeof target.channelId === 'number' && typeof target.postId === 'number'
  }

  return false
}

function isPreviewSubscriptionChannel(value: unknown): value is SubscriptionChannel {
  if (!value || typeof value !== 'object') {
    return false
  }

  const channel = value as Record<string, unknown>
  return (
    typeof channel.accent === 'string' &&
    typeof channel.description === 'string' &&
    typeof channel.id === 'number' &&
    typeof channel.title === 'string' &&
    typeof channel.handle === 'string'
  )
}

function serializeThreadTarget(target: ThreadTarget | null) {
  if (!target) return 'none'
  if (target.kind === 'support') return `support:${target.ticketId}`
  if (target.kind === 'group') return `group:${target.groupId}:${target.messageId}`
  return `channel:${target.channelId}:${target.postId}`
}

function serializePreviewChannel(channel: SubscriptionChannel | null) {
  if (!channel) return 'none'
  return `${channel.id}:${channel.handle}:${channel.title}`
}

export function createAppNavigationHistoryState(
  route: AppNavigationRoute,
  depth: number,
): AppNavigationHistoryState {
  return {
    depth,
    marker: appNavigationHistoryStateMarker,
    route,
  }
}

export function readAppNavigationHistoryState(value: unknown): AppNavigationHistoryState | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const state = value as Record<string, unknown>
  if (state.marker !== appNavigationHistoryStateMarker || typeof state.depth !== 'number') {
    return null
  }

  const route = state.route
  if (!route || typeof route !== 'object') {
    return null
  }

  const candidate = route as Record<string, unknown>
  if (
    typeof candidate.stageView !== 'string' ||
    typeof candidate.settingsView !== 'string' ||
    typeof candidate.channelsView !== 'string' ||
    typeof candidate.channelDetailView !== 'string' ||
    typeof candidate.bottomSection !== 'string' ||
    typeof candidate.contactsTab !== 'string' ||
    typeof candidate.query !== 'string' ||
    typeof candidate.activeFilter !== 'string' ||
    typeof candidate.searchOpen !== 'boolean' ||
    typeof candidate.searchTopFilter !== 'string' ||
    typeof candidate.topListView !== 'string' ||
    (candidate.activeChannelId !== null && typeof candidate.activeChannelId !== 'number') ||
    (candidate.activeChatId !== null && typeof candidate.activeChatId !== 'number') ||
    (candidate.activeGroupId !== null && typeof candidate.activeGroupId !== 'number') ||
    (candidate.activeSubscriptionChannelId !== null &&
      typeof candidate.activeSubscriptionChannelId !== 'number') ||
    (candidate.premiumGiftChatId !== null && typeof candidate.premiumGiftChatId !== 'number') ||
    (candidate.previewSubscriptionChannel !== null &&
      !isPreviewSubscriptionChannel(candidate.previewSubscriptionChannel)) ||
    (candidate.threadTarget !== null && !isThreadTarget(candidate.threadTarget))
  ) {
    return null
  }

  return state as AppNavigationHistoryState
}

export function getAppNavigationRouteEntryKey(route: AppNavigationRoute) {
  if (route.threadTarget) {
    return `thread:${serializeThreadTarget(route.threadTarget)}`
  }

  if (route.stageView === 'settings') {
    return `settings:${route.settingsView}`
  }

  if (route.stageView === 'premium') {
    return `premium:${route.premiumGiftChatId ?? 'self'}`
  }

  if (route.stageView === 'channels') {
    return `channels:${route.channelsView}:${route.activeChannelId ?? 'none'}:${route.channelDetailView}`
  }

  if (route.activeChatId !== null) {
    return `room:chat:${route.activeChatId}`
  }

  if (route.activeGroupId !== null) {
    return `room:group:${route.activeGroupId}`
  }

  if (route.activeSubscriptionChannelId !== null || route.previewSubscriptionChannel) {
    return `room:channel:${route.activeSubscriptionChannelId ?? serializePreviewChannel(route.previewSubscriptionChannel)}`
  }

  return `main:${route.bottomSection}:${route.topListView}:${route.searchOpen ? 'search' : 'default'}`
}
