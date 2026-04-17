export function createPostAuthMainSurfaceState() {
  return {
    activeChannelId: null,
    activeChatId: null,
    activeFilter: 'Все',
    activeGroupId: null,
    activeSubscriptionChannelId: null,
    bottomSection: 'chats' as const,
    channelDetailView: 'main' as const,
    channelsView: 'list' as const,
    contactsTab: 'all' as const,
    premiumGiftChatId: null,
    previewSubscriptionChannel: null,
    query: '',
    searchOpen: false,
    searchTopFilter: 'all' as const,
    settingsView: 'profile' as const,
    stageView: 'main' as const,
    topListView: 'none' as const,
  }
}
