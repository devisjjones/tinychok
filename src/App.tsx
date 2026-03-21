import { type ChangeEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  accountNameMaxFontSize,
  accountNameMinFontSize,
  accountStatusMaxFontSize,
  accountStatusMinFontSize,
  accountsStorageKey,
  channelActionMenuHeight,
  channelActionMenuWidth,
  channelAvatarUploadAcceptedMimeTypes,
  channelAvatarUploadMaxSizeBytes,
  channelAvatarTones,
  channelBlockedMenuHeight,
  channelDirectLinkMaxLength,
  channelDescriptionMaxLength,
  channelTitleMaxLength,
  chatActionMenuHeight,
  chatActionMenuWidth,
  displayNameFieldMaxLength,
  managedChannelsPerUserLimit,
  nicknameFieldMaxLength,
  quickFilters,
  sessionStorageKey,
  statusFieldMaxLength,
  surnameFieldMaxLength,
} from './app/constants'
import {
  discoveryResults as initialDiscoveryResults,
  initialChannels,
  initialChats,
  initialGroups,
  initialSubscribedChannels,
} from './app/mockData'
import { loadAccounts, loadSession } from './app/storage'
import {
  createManagedChannel as createManagedChannelRequest,
  deleteDialog as deleteDialogRequest,
  deleteDialogHistory as deleteDialogHistoryRequest,
  deleteDialogMessage as deleteDialogMessageRequest,
  deleteGroupMessage as deleteGroupMessageRequest,
  deleteManagedChannel as deleteManagedChannelRequest,
  fetchBootstrap,
  markDialogRead as markDialogReadRequest,
  markGroupRead as markGroupReadRequest,
  markSubscriptionChannelRead as markSubscriptionChannelReadRequest,
  openDirectDialog as openDirectDialogRequest,
  openRealtimeConnection,
  registerAccount,
  requestAuthCode,
  saveSnapshot,
  searchDiscoveryResults as searchDiscoveryResultsRequest,
  setDialogFavorite as setDialogFavoriteRequest,
  setDialogPinnedMessage as setDialogPinnedMessageRequest,
  sendDirectMessage as sendDirectMessageRequest,
  sendGroupMessage as sendGroupMessageRequest,
  updateManagedChannel as updateManagedChannelRequest,
  updateSession as updateSessionRequest,
  uploadMediaFile,
  verifyAuthCode,
} from './app/backend'
import type {
  Account,
  ActionAnchor,
  AuthStep,
  Channel,
  ChannelPost,
  Chat,
  ChannelsView,
  GroupPreview,
  GroupParticipant,
  Message,
  ReplyTarget,
  SearchResult,
  Session,
  SettingsView,
  StageView,
  SubscriptionChannel,
  TopListView,
} from './app/types'
import { scheduleActionAnchor, useAnchoredMenu } from './app/useAnchoredMenu'
import {
  formatMessagePreview,
  formatChannelAvatarLabel,
  formatContactStatus,
  formatGroupLatestAuthor,
  formatGroupPreview,
  formatGroupTime,
  formatNowTime,
  formatSessionName,
  formatSubscriptionChannelReaders,
  formatSubscriptionChannelTime,
  formatUnreadBadgeCount,
  buildChannelDirectLinkFromTitle,
  ensureUniqueChannelDirectLink,
  getChannelVisibilityDescription,
  getChannelVisibilityLabel,
  getNextChannelVisibility,
  getPremiumDaysLeft,
  hasActivePremium,
  isPhoneQuery,
  makeDraftChannel,
  matchesQuery,
  moveUnreadItemsFirst,
  normalizeIdentifier,
  normalizeNickname,
  normalizePremiumExpiry,
  sanitizeChannelDirectLink,
  sanitizeChannelDescription,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
  sortChatsByRecentActivity,
} from './app/utils'
import { AuthScreen } from './screens/AuthScreen'
import { ConfirmLogoutScreen } from './screens/ConfirmLogoutScreen'
import { DirectChatRoom } from './rooms/DirectChatRoom'
import { GroupRoom } from './rooms/GroupRoom'
import { SubscriptionChannelRoom } from './rooms/SubscriptionChannelRoom'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { SelectedBubbleOverlay } from './components/SelectedBubbleOverlay'
import { useCookieConsent } from './app/useCookieConsent'
import type { AppSnapshot, UpdateManagedChannelBody, UpdateSessionBody } from './shared/backend'
import './App.css'

type PendingAttachmentDraft = {
  file?: File
  fileName: string
  mediaUrl?: string
  mimeType: string
  size: number
}

type DeliveryIssue = 'pending' | 'failed'

const deliveryIndicatorIconPaths = [
  '/icons/hourglass-48.png',
  '/icons/warning-48.png',
  '/icons/double-tick-50.png',
]

type PendingDirectMessage = {
  attachment?: Message['attachment']
  attachmentDraft?: PendingAttachmentDraft
  chatId: number
  createdAt: string
  localId: number
  queuedAt: string
  replyTo?: Message['replyTo']
  status: DeliveryIssue
  text: string
  time: string
  retryCount: number
}

type PendingGroupMessage = {
  attachment?: Message['attachment']
  attachmentDraft?: PendingAttachmentDraft
  createdAt: string
  groupId: number
  localId: number
  queuedAt: string
  status: DeliveryIssue
  text: string
  time: string
  retryCount: number
}

function getSyntheticChannelId(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }

  return -Math.max(1, Math.abs(hash))
}

type StoredAttachmentDraft = Omit<PendingAttachmentDraft, 'file'>

type StoredPendingDirectMessage = Omit<PendingDirectMessage, 'attachmentDraft'> & {
  attachmentDraft?: StoredAttachmentDraft
}

type StoredPendingGroupMessage = Omit<PendingGroupMessage, 'attachmentDraft'> & {
  attachmentDraft?: StoredAttachmentDraft
}

const DELIVERY_FAILURE_TIMEOUT_MS = 15_000
const failedDirectMessagesStorageKeyPrefix = 'tinychok.failed-direct'
const failedGroupMessagesStorageKeyPrefix = 'tinychok.failed-group'

function getFailedDirectMessagesStorageKey(identifier: string) {
  return `${failedDirectMessagesStorageKeyPrefix}:${identifier}`
}

function getFailedGroupMessagesStorageKey(identifier: string) {
  return `${failedGroupMessagesStorageKeyPrefix}:${identifier}`
}

function serializeAttachmentDraft(
  attachmentDraft?: PendingAttachmentDraft,
): StoredAttachmentDraft | undefined {
  if (!attachmentDraft) return undefined

  return {
    fileName: attachmentDraft.fileName,
    mediaUrl: attachmentDraft.mediaUrl,
    mimeType: attachmentDraft.mimeType,
    size: attachmentDraft.size,
  }
}

function deserializeAttachmentDraft(
  attachmentDraft?: StoredAttachmentDraft,
): PendingAttachmentDraft | undefined {
  if (!attachmentDraft) return undefined
  if (attachmentDraft.mediaUrl?.startsWith('blob:')) return undefined

  return {
    fileName: attachmentDraft.fileName,
    mediaUrl: attachmentDraft.mediaUrl,
    mimeType: attachmentDraft.mimeType,
    size: attachmentDraft.size,
  }
}

function sanitizePersistedAttachment(attachment?: Message['attachment']) {
  if (!attachment) return undefined
  if (attachment.mediaUrl.startsWith('blob:')) return undefined

  return {
    fileName: attachment.fileName,
    mediaUrl: attachment.mediaUrl,
    mimeType: attachment.mimeType,
    size: attachment.size,
  } satisfies NonNullable<Message['attachment']>
}

function serializePendingDirectMessages(messages: PendingDirectMessage[]): StoredPendingDirectMessage[] {
  return messages.map((message) => ({
    ...message,
    attachment: sanitizePersistedAttachment(message.attachment),
    attachmentDraft: serializeAttachmentDraft(message.attachmentDraft),
  }))
}

function serializePendingGroupMessages(messages: PendingGroupMessage[]): StoredPendingGroupMessage[] {
  return messages.map((message) => ({
    ...message,
    attachment: sanitizePersistedAttachment(message.attachment),
    attachmentDraft: serializeAttachmentDraft(message.attachmentDraft),
  }))
}

function loadPersistedFailedDirectMessages(identifier: string) {
  if (typeof window === 'undefined') return [] as PendingDirectMessage[]

  const raw = window.localStorage.getItem(getFailedDirectMessagesStorageKey(identifier))
  if (!raw) return []

  try {
    return (JSON.parse(raw) as StoredPendingDirectMessage[]).map((message) => ({
      ...message,
      attachment: sanitizePersistedAttachment(message.attachment),
      attachmentDraft: deserializeAttachmentDraft(message.attachmentDraft),
    }))
  } catch {
    return []
  }
}

function loadPersistedFailedGroupMessages(identifier: string) {
  if (typeof window === 'undefined') return [] as PendingGroupMessage[]

  const raw = window.localStorage.getItem(getFailedGroupMessagesStorageKey(identifier))
  if (!raw) return []

  try {
    return (JSON.parse(raw) as StoredPendingGroupMessage[]).map((message) => ({
      ...message,
      attachment: sanitizePersistedAttachment(message.attachment),
      attachmentDraft: deserializeAttachmentDraft(message.attachmentDraft),
    }))
  } catch {
    return []
  }
}

function buildGroupParticipantFromChat(chat: Chat, participantId?: number): GroupParticipant {
  return {
    accent: chat.accent,
    id: participantId ?? chat.id,
    online: chat.online,
    premium: chat.premium,
    status: formatContactStatus(chat),
    title: chat.title,
  }
}

function buildFallbackGroupParticipant(title: string, participantId: number): GroupParticipant {
  return {
    accent: '#cfb4a0',
    id: participantId,
    online: false,
    premium: false,
    status: 'Участник группы',
    title,
  }
}

function hydrateGroupParticipants(group: GroupPreview, chats: Chat[]): GroupParticipant[] {
  const chatByTitle = new Map(chats.map((chat) => [chat.title, chat]))
  const fallbackChatByTitle = new Map(initialChats.map((chat) => [chat.title, chat]))
  const participantsById = new Map<number, GroupParticipant>()
  const participantsByTitle = new Map<string, GroupParticipant>()

  function upsertParticipant(participant: GroupParticipant) {
    participantsById.set(participant.id, participant)
    participantsByTitle.set(participant.title, participant)
  }

  group.participants.forEach((participant) => {
    const matchingChat =
      chatByTitle.get(participant.title) ?? fallbackChatByTitle.get(participant.title)

    upsertParticipant(
      matchingChat
        ? buildGroupParticipantFromChat(matchingChat, participant.id)
        : participant,
    )
  })

  group.messages.forEach((message) => {
    if (message.author === 'me' || !message.displayAuthor) return

    if (message.groupParticipantId !== undefined && participantsById.has(message.groupParticipantId)) {
      return
    }

    if (participantsByTitle.has(message.displayAuthor)) return

    const matchingChat =
      chatByTitle.get(message.displayAuthor) ?? fallbackChatByTitle.get(message.displayAuthor)

    upsertParticipant(
      matchingChat
        ? buildGroupParticipantFromChat(matchingChat, message.groupParticipantId)
        : buildFallbackGroupParticipant(
            message.displayAuthor,
            message.groupParticipantId ?? getSyntheticChannelId(`${group.id}:${message.displayAuthor}`),
          ),
    )
  })

  return Array.from(participantsById.values())
}

function buildPreviewSubscriptionChannelFromManagedChannel(channel: Channel): SubscriptionChannel {
  return {
    accent: channel.avatarTone,
    draft: channel.status === 'draft',
    handle: channel.directLink,
    id: channel.id,
    posts: [],
    preview: channel.description,
    readers: 0,
    time: '',
    title: channel.title,
    unread: 0,
    visibility: channel.visibility,
  }
}

type ChannelAvatarPickerTarget =
  | { scope: 'create' }
  | { scope: 'existing'; channelId: number }

type ChannelAvatarDraft = {
  kind: 'stock' | 'upload' | 'uploaded'
  label: string
  previewUrl: string
  file?: File
}

type StockAvatarOption = {
  id: string
  imagePath: string
  label: string
}

function formatStockAvatarLabel(filePath: string) {
  const fileName = filePath.split('/').pop() ?? filePath

  return fileName
    .replace(/\.[^.]+$/u, '')
    .replace(/[_-]+/gu, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase())
}

function buildStockAvatarOptions(modules: Record<string, string>) {
  return Object.entries(modules)
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath, 'ru'))
    .map(([filePath, imagePath]) => ({
      id: filePath,
      imagePath,
      label: formatStockAvatarLabel(filePath),
    })) satisfies StockAvatarOption[]
}

const channelAvatarStockOptions = buildStockAvatarOptions(
  import.meta.glob('./assets/stock-avatars/channels/*.{png,jpg,jpeg}', {
    eager: true,
    import: 'default',
  }) as Record<string, string>,
)

const profileAvatarStockOptions = buildStockAvatarOptions(
  import.meta.glob('./assets/stock-avatars/users/*.{png,jpg,jpeg}', {
    eager: true,
    import: 'default',
  }) as Record<string, string>,
)

function App() {
  const messageFeedRef = useRef<HTMLDivElement | null>(null)
  const channelTitleInputRef = useRef<HTMLInputElement | null>(null)
  const accountNameRef = useRef<HTMLHeadingElement | null>(null)
  const settingsProfileNameRef = useRef<HTMLHeadingElement | null>(null)
  const accountStatusRef = useRef<HTMLParagraphElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const groupAttachmentInputRef = useRef<HTMLInputElement | null>(null)
  const channelsPanelRef = useRef<HTMLDivElement | null>(null)
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const channelAvatarObjectUrlsRef = useRef(new Set<string>())
  const localMessageAttachmentObjectUrlsRef = useRef(new Set<string>())
  const pendingDirectMessagesRef = useRef<PendingDirectMessage[]>([])
  const pendingGroupMessagesRef = useRef<PendingGroupMessage[]>([])
  const nextOptimisticMessageIdRef = useRef(-1)
  const pendingRetryInFlightRef = useRef(false)
  const backendSyncTimeoutRef = useRef<number | null>(null)
  const skipNextBackendSyncRef = useRef(false)
  // These refs keep the debounced write-path transparent: text fields update locally first,
  // then the latest snapshot/patch is flushed through dedicated backend mutations.
  const latestSnapshotRef = useRef<AppSnapshot | null>(null)
  const previousSnapshotSlicesRef = useRef<{
    channels: Channel[]
    chats: typeof initialChats
    groups: typeof initialGroups
    session: Session | null
    subscriptionChannels: typeof initialSubscribedChannels
  }>({
    channels: initialChannels,
    chats: initialChats,
    groups: initialGroups,
    session: loadSession(),
    subscriptionChannels: initialSubscribedChannels,
  })
  const sessionMutationTimeoutRef = useRef<number | null>(null)
  const pendingSessionPatchRef = useRef<UpdateSessionBody>({})
  const suppressSessionSnapshotSyncRef = useRef(false)
  const channelMutationTimeoutsRef = useRef(new Map<number, number>())
  const pendingChannelPatchesRef = useRef(new Map<number, UpdateManagedChannelBody>())
  const suppressChannelSnapshotSyncRef = useRef(false)
  const [chats, setChats] = useState(initialChats)
  const [channels, setChannels] = useState(initialChannels)
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)
  const [retainedAllChatId, setRetainedAllChatId] = useState<number | null>(null)
  const [retainedFavoriteChatId, setRetainedFavoriteChatId] = useState<number | null>(null)
  const [retainedSubscriptionChannelId, setRetainedSubscriptionChannelId] = useState<number | null>(
    null,
  )
  const [retainedGroupId, setRetainedGroupId] = useState<number | null>(null)
  const [activeChannelId, setActiveChannelId] = useState<number | null>(initialChannels[0]?.id ?? null)
  const [stageView, setStageView] = useState<StageView>('main')
  const [channelsView, setChannelsView] = useState<ChannelsView>('list')
  const [settingsView, setSettingsView] = useState<SettingsView>('profile')
  const [query, setQuery] = useState('')
  const [chatMessageDrafts, setChatMessageDrafts] = useState<Record<number, string>>({})
  const [groupMessageDrafts, setGroupMessageDrafts] = useState<Record<number, string>>({})
  const [chatAttachmentDrafts, setChatAttachmentDrafts] = useState<Record<number, PendingAttachmentDraft | undefined>>({})
  const [groupAttachmentDrafts, setGroupAttachmentDrafts] = useState<Record<number, PendingAttachmentDraft | undefined>>({})
  const [activeFilter, setActiveFilter] = useState('Все')
  const [searchOpen, setSearchOpen] = useState(false)
  const [quietMode, setQuietMode] = useState(false)
  const [authStep, setAuthStep] = useState<AuthStep>('phone')
  const [displayName, setDisplayName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [authExistingAccount, setAuthExistingAccount] = useState<Pick<Account, 'displayName' | 'surname'> | null>(null)
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [backendReady, setBackendReady] = useState(false)
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [bottomSection, setBottomSection] = useState<'chats' | 'contacts'>('chats')
  const [chatActionsOpen, setChatActionsOpen] = useState(false)
  const [blockedActionChatId, setBlockedActionChatId] = useState<number | null>(null)
  const [premiumGiftChatId, setPremiumGiftChatId] = useState<number | null>(null)
  const [messageActionMessageId, setMessageActionMessageId] = useState<number | null>(null)
  const [forwardingMessageId, setForwardingMessageId] = useState<number | null>(null)
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [confirmingDeleteHistoryChatId, setConfirmingDeleteHistoryChatId] = useState<number | null>(
    null,
  )
  const [confirmingDeleteContactChatId, setConfirmingDeleteContactChatId] = useState<number | null>(
    null,
  )
  const [confirmingDeleteMessageId, setConfirmingDeleteMessageId] = useState<number | null>(null)
  const [confirmingDeleteGroupMessageId, setConfirmingDeleteGroupMessageId] = useState<number | null>(null)
  const [confirmingDeleteChannelId, setConfirmingDeleteChannelId] = useState<number | null>(null)
  const [managedChannelLimitErrorOpen, setManagedChannelLimitErrorOpen] = useState(false)
  const [transferringChannelId, setTransferringChannelId] = useState<number | null>(null)
  const [channelTransferTargetChatId, setChannelTransferTargetChatId] = useState<number | null>(null)
  const [channelTransferCode, setChannelTransferCode] = useState('')
  const [channelTransferError, setChannelTransferError] = useState('')
  const [channelTransferSearch, setChannelTransferSearch] = useState('')
  const [creatingChannelTitle, setCreatingChannelTitle] = useState('')
  const [creatingChannelDirectLink, setCreatingChannelDirectLink] = useState('')
  const [creatingChannelDirectLinkDirty, setCreatingChannelDirectLinkDirty] = useState(false)
  const [creatingChannelDescription, setCreatingChannelDescription] = useState('')
  const [creatingChannelAvatarTone, setCreatingChannelAvatarTone] = useState(channelAvatarTones[0])
  const [creatingChannelAvatarDraft, setCreatingChannelAvatarDraft] = useState<ChannelAvatarDraft | null>(
    null,
  )
  const [profileAvatarPickerOpen, setProfileAvatarPickerOpen] = useState(false)
  const [profileAvatarPickerDraft, setProfileAvatarPickerDraft] = useState<ChannelAvatarDraft | null>(null)
  const [profileAvatarPickerError, setProfileAvatarPickerError] = useState('')
  const [profileAvatarPickerBusy, setProfileAvatarPickerBusy] = useState(false)
  const [profileAvatarPickerMode, setProfileAvatarPickerMode] = useState<'none' | 'stock' | 'device'>('none')
  const [channelAvatarPickerTarget, setChannelAvatarPickerTarget] = useState<ChannelAvatarPickerTarget | null>(
    null,
  )
  const [channelAvatarPickerDraft, setChannelAvatarPickerDraft] = useState<ChannelAvatarDraft | null>(null)
  const [channelAvatarPickerError, setChannelAvatarPickerError] = useState('')
  const [channelAvatarPickerBusy, setChannelAvatarPickerBusy] = useState(false)
  const [channelAvatarPickerMode, setChannelAvatarPickerMode] = useState<'none' | 'stock' | 'device'>('none')
  const [editingChannelTitleId, setEditingChannelTitleId] = useState<number | null>(null)
  const [editingChannelTitleValue, setEditingChannelTitleValue] = useState('')
  const [channelManagementOpenId, setChannelManagementOpenId] = useState<number | null>(null)
  const [topListView, setTopListView] = useState<TopListView>('none')
  const [copyHintText, setCopyHintText] = useState('')
  const [discoveryResults, setDiscoveryResults] = useState(initialDiscoveryResults)
  const [liveSearchState, setLiveSearchState] = useState<{
    query: string
    results: SearchResult[]
  } | null>(null)
  const [subscriptionChannels, setSubscriptionChannels] = useState(initialSubscribedChannels)
  const [groups, setGroups] = useState(initialGroups)
  const [activeSubscriptionChannelId, setActiveSubscriptionChannelId] = useState<number | null>(null)
  const [previewSubscriptionChannel, setPreviewSubscriptionChannel] = useState<SubscriptionChannel | null>(null)
  const [activeSubscriptionPostId, setActiveSubscriptionPostId] = useState<number | null>(null)
  const [activeGroupMessageId, setActiveGroupMessageId] = useState<number | null>(null)
  const [groupParticipantsOpen, setGroupParticipantsOpen] = useState(false)
  const [forwardingSubscriptionPostText, setForwardingSubscriptionPostText] = useState('')
  const [forwardingGroupMessageText, setForwardingGroupMessageText] = useState('')
  const [pendingDirectMessages, setPendingDirectMessages] = useState<PendingDirectMessage[]>([])
  const [pendingGroupMessages, setPendingGroupMessages] = useState<PendingGroupMessage[]>([])
  const [messageActionAnchor, setMessageActionAnchor] = useState<ActionAnchor | null>(null)
  const [subscriptionPostActionAnchor, setSubscriptionPostActionAnchor] = useState<ActionAnchor | null>(
    null,
  )
  const [groupMessageActionAnchor, setGroupMessageActionAnchor] = useState<ActionAnchor | null>(null)
  const { cookieConsent, updateCookieConsent } = useCookieConsent()

  useEffect(() => {
    const preloadedImages = deliveryIndicatorIconPaths.map((path) => {
      const image = new Image()
      image.src = path
      return image
    })

    return () => {
      preloadedImages.length = 0
    }
  }, [])

  const blockedContactIds = session?.blockedContactIds ?? []
  const availableChats = sortChatsByRecentActivity(
    chats.filter((chat) => !blockedContactIds.includes(chat.id)),
  )
  const blockedChats = sortChatsByRecentActivity(
    chats.filter((chat) => blockedContactIds.includes(chat.id)),
  )
  const visibleRetainedAllChatId =
    activeFilter === 'Все' &&
    stageView === 'main' &&
    bottomSection === 'chats' &&
    topListView === 'none' &&
    !searchOpen &&
    activeChatId === retainedAllChatId
      ? retainedAllChatId
      : null
  const visibleRetainedFavoriteChatId =
    activeFilter === '★' &&
    stageView === 'main' &&
    bottomSection === 'chats' &&
    topListView === 'none' &&
    !searchOpen &&
    activeChatId === retainedFavoriteChatId
      ? retainedFavoriteChatId
      : null
  const visibleRetainedGroupId =
    topListView === 'groups' &&
    stageView === 'main' &&
    !searchOpen &&
    activeGroupId === retainedGroupId
      ? retainedGroupId
      : null

  const visibleChats = availableChats.filter((chat) => {
    if (searchOpen) return true
    if (bottomSection === 'contacts') return true
    if (activeFilter === '★') return Boolean(chat.pinned)

    return true
  })

  const myContactsResults = availableChats.filter((chat) => {
    if (query.trim() === '') return false

    return (
      matchesQuery(chat.title, query) ||
      matchesQuery(chat.handle, query) ||
      matchesQuery(chat.phone, query)
    )
  })

  const trimmedSearchQuery = query.trim()
  const liveSearchResults =
    searchOpen &&
    topListView === 'none' &&
    trimmedSearchQuery !== '' &&
    liveSearchState?.query === trimmedSearchQuery
      ? liveSearchState.results
      : null
  const searchResultSource = liveSearchResults ?? discoveryResults
  const searchResults = searchResultSource
    .filter((result) => !availableChats.some(
      (chat) => normalizeIdentifier(chat.phone) === normalizeIdentifier(result.phone),
    ))
    .filter((result) => {
    if (query.trim() === '') return true

    return (
      matchesQuery(result.title, query) ||
      matchesQuery(result.handle, query) ||
      matchesQuery(result.phone, query)
    )
    })

  const activeChat =
    activeChatId === null ? null : availableChats.find((chat) => chat.id === activeChatId) ?? null
  const pinnedMessage =
    activeChat?.pinnedMessageId === undefined
      ? null
      : activeChat?.messages.find((message) => message.id === activeChat.pinnedMessageId) ?? null
  const activeMessage =
    messageActionMessageId === null
      ? null
      : activeChat?.messages.find((message) => message.id === messageActionMessageId) ?? null
  const forwardingMessage =
    forwardingMessageId === null
      ? null
      : activeChat?.messages.find((message) => message.id === forwardingMessageId) ?? null
  const premiumGiftChat =
    premiumGiftChatId === null ? null : chats.find((chat) => chat.id === premiumGiftChatId) ?? null
  const activeChannel =
    activeChannelId === null
      ? null
      : channels.find((channel) => channel.id === activeChannelId) ?? null
  const activeSubscriptionChannel =
    activeSubscriptionChannelId === null
      ? null
      : subscriptionChannels.find((channel) => channel.id === activeSubscriptionChannelId) ?? null
  const currentSubscriptionChannel = previewSubscriptionChannel ?? activeSubscriptionChannel
  const activeSubscriptionPost =
    activeSubscriptionPostId === null
      ? null
      : currentSubscriptionChannel?.posts.find((post) => post.id === activeSubscriptionPostId) ?? null
  const persistedActiveGroup =
    activeGroupId === null ? null : groups.find((group) => group.id === activeGroupId) ?? null
  const activeGroup = persistedActiveGroup
    ? {
        ...persistedActiveGroup,
        participants: hydrateGroupParticipants(persistedActiveGroup, chats),
      }
    : null
  const activeGroupMessage =
    activeGroupMessageId === null
      ? null
      : activeGroup?.messages.find((message) => message.id === activeGroupMessageId) ?? null
  function resolveGroupParticipant(
    group: typeof activeGroup,
    message: Message | null,
  ): GroupParticipant | null {
    if (!group || !message || message.author === 'me') return null

    if (message.groupParticipantId !== undefined) {
      const matchedParticipant = group.participants.find(
        (participant) => participant.id === message.groupParticipantId,
      )
      if (matchedParticipant) return matchedParticipant
    }

    if (!message.displayAuthor) return null
    return group.participants.find((participant) => participant.title === message.displayAuthor) ?? null
  }
  const activeGroupMessageParticipant = resolveGroupParticipant(activeGroup, activeGroupMessage)
  const subscriptionMenuFallbackHeight =
    currentSubscriptionChannel?.visibility === 'closed' ? channelBlockedMenuHeight : channelActionMenuHeight
  const { menuRef: subscriptionPostMenuRef, style: subscriptionPostMenuStyle } = useAnchoredMenu(
    subscriptionPostActionAnchor,
    channelActionMenuWidth,
    subscriptionMenuFallbackHeight,
  )
  const { menuRef: groupMessageMenuRef, style: groupMessageMenuStyle } = useAnchoredMenu(
    groupMessageActionAnchor,
    channelActionMenuWidth,
    channelActionMenuHeight,
  )

  useEffect(() => {
    if (editingChannelTitleId === null) return

    window.requestAnimationFrame(() => {
      channelTitleInputRef.current?.focus()
      channelTitleInputRef.current?.select()
    })
  }, [editingChannelTitleId])
  const { menuRef: messageMenuRef, style: messageMenuStyle } = useAnchoredMenu(
    messageActionAnchor,
    chatActionMenuWidth,
    chatActionMenuHeight,
  )
  const transferringChannel =
    transferringChannelId === null
      ? null
      : channels.find((channel) => channel.id === transferringChannelId) ?? null
  const channelTransferTarget =
    channelTransferTargetChatId === null
      ? null
      : availableChats.find((chat) => chat.id === channelTransferTargetChatId) ?? null
  const channelTransferResults = availableChats.filter((chat) => {
    if (channelTransferSearch.trim() === '') return true

    return (
      matchesQuery(chat.title, channelTransferSearch) ||
      matchesQuery(chat.handle, channelTransferSearch) ||
      matchesQuery(chat.phone, channelTransferSearch)
    )
  })
  const activeChatMessageCount = activeChat?.messages.length ?? 0
  const activeGroupMessageCount = activeGroup?.messages.length ?? 0
  const isSettingsView = stageView === 'settings'
  const isPremiumView = stageView === 'premium'
  const isChannelsView = stageView === 'channels'
  const isRailVisible = !isSettingsView && !isPremiumView && !isChannelsView
  const isChannelsListView = isChannelsView && channelsView === 'list'
  const isChannelCreateView = isChannelsView && channelsView === 'create'
  const isChannelDetailView = isChannelsView && channelsView === 'detail'
  const isChatOpen = stageView === 'main' && activeChat !== null
  const isGroupOpen = stageView === 'main' && activeGroup !== null
  const isSubscriptionChannelOpen = stageView === 'main' && currentSubscriptionChannel !== null
  const isChannelsTopListOpen = topListView === 'channels'
  const isGroupsTopListOpen = topListView === 'groups'
  const isAnyRoomOpen = isChatOpen || isSubscriptionChannelOpen || isGroupOpen
  const visibleRetainedSubscriptionChannelId =
    isChannelsTopListOpen &&
    stageView === 'main' &&
    !searchOpen &&
    activeSubscriptionChannelId === retainedSubscriptionChannelId
      ? retainedSubscriptionChannelId
      : null
  const searchShowsPhone = isPhoneQuery(query)
  const totalUnreadCount = availableChats.reduce((sum, chat) => sum + chat.unread, 0)
  const totalFavoriteUnreadCount = availableChats.reduce(
    (sum, chat) => sum + (chat.pinned ? chat.unread : 0),
    0,
  )
  const sortByUnreadEnabled = !quietMode
  const orderedVisibleChats =
    !sortByUnreadEnabled
      ? visibleChats
      : activeFilter === 'Все'
      ? moveUnreadItemsFirst(visibleChats, visibleRetainedAllChatId)
      : activeFilter === '★'
      ? moveUnreadItemsFirst(visibleChats, visibleRetainedFavoriteChatId)
      : visibleChats
  const orderedSubscriptionChannels = sortByUnreadEnabled
    ? moveUnreadItemsFirst(subscriptionChannels, visibleRetainedSubscriptionChannelId)
    : subscriptionChannels
  const orderedGroups = sortByUnreadEnabled
    ? moveUnreadItemsFirst(groups, visibleRetainedGroupId)
    : groups
  const totalChannelNotifications = subscriptionChannels.reduce((sum, channel) => sum + channel.unread, 0)
  const totalGroupNotifications = groups.reduce((sum, group) => sum + group.unread, 0)
  const sessionHasPremium = hasActivePremium(session?.premium, session?.premiumExpiresAt)
  const sessionName = session ? formatSessionName(session) : ''
  const sessionAvatarLabel = session?.displayName.trim().slice(0, 1).toUpperCase() || 'Я'
  const premiumDaysLeft = getPremiumDaysLeft(session?.premium, session?.premiumExpiresAt)
  const premiumMonthlyPrice = 199
  const premiumAnnualPrice = 1390
  const premiumAnnualSavingsPercent = Math.round((1 - premiumAnnualPrice / (premiumMonthlyPrice * 12)) * 100)
  const cookieConsentStatus =
    cookieConsent === 'analytics'
      ? 'Вы приняли аналитические cookie'
      : cookieConsent === 'necessary'
      ? 'Вы приняли только необходимые cookie'
      : 'Выбор ещё не сохранён'
  const pendingDirectMessageIds = new Set(
    pendingDirectMessages
      .filter((message) => message.status === 'pending')
      .map((message) => message.localId),
  )
  const failedDirectMessageIds = new Set(
    pendingDirectMessages
      .filter((message) => message.status === 'failed')
      .map((message) => message.localId),
  )
  const pendingGroupMessageIds = new Set(
    pendingGroupMessages
      .filter((message) => message.status === 'pending')
      .map((message) => message.localId),
  )
  const failedGroupMessageIds = new Set(
    pendingGroupMessages
      .filter((message) => message.status === 'failed')
      .map((message) => message.localId),
  )
  const hasPendingOutgoingMessages =
    pendingDirectMessages.some((message) => message.status === 'pending') ||
    pendingGroupMessages.some((message) => message.status === 'pending')
  const hasLocalOutboxMessages =
    pendingDirectMessages.length > 0 || pendingGroupMessages.length > 0
  function getDirectMessageDeliveryIssue(messageId: number): DeliveryIssue | null {
    return failedDirectMessageIds.has(messageId)
      ? 'failed'
      : pendingDirectMessageIds.has(messageId)
        ? 'pending'
        : null
  }

  function getGroupMessageDeliveryIssue(messageId: number): DeliveryIssue | null {
    return failedGroupMessageIds.has(messageId)
      ? 'failed'
      : pendingGroupMessageIds.has(messageId)
        ? 'pending'
        : null
  }

  const activeMessageDeliveryIssue =
    activeMessage?.author === 'me' ? getDirectMessageDeliveryIssue(activeMessage.id) : null
  const activeGroupMessageDeliveryIssue =
    activeGroupMessage?.author === 'me' ? getGroupMessageDeliveryIssue(activeGroupMessage.id) : null
  const nextCookieConsentChoice = cookieConsent === 'analytics' ? 'necessary' : 'analytics'
  const cookieConsentToggleLabel = cookieConsent === null ? 'Сохранить выбор' : 'Изменить выбор'
  const cookieConsentBanner = (
    <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
  )

  useEffect(() => {
    if ((!isChatOpen && !isSubscriptionChannelOpen && !isGroupOpen) || !messageFeedRef.current) return

    messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight
  }, [
    activeChatId,
    activeChatMessageCount,
    activeGroupId,
    activeGroupMessageCount,
    activeSubscriptionChannelId,
    isChatOpen,
    isGroupOpen,
    isSubscriptionChannelOpen,
  ])

  useEffect(() => {
    if (!isChannelsView || !channelsPanelRef.current) return

    channelsPanelRef.current.scrollTop = 0
  }, [activeChannelId, channelsView, isChannelsView])

  useEffect(() => {
    const avatarObjectUrls = channelAvatarObjectUrlsRef.current
    const localAttachmentObjectUrls = localMessageAttachmentObjectUrlsRef.current

    return () => {
      avatarObjectUrls.forEach((url) => URL.revokeObjectURL(url))
      avatarObjectUrls.clear()
      localAttachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url))
      localAttachmentObjectUrls.clear()
    }
  }, [])

  useEffect(() => {
    pendingDirectMessagesRef.current = pendingDirectMessages
  }, [pendingDirectMessages])

  useEffect(() => {
    pendingGroupMessagesRef.current = pendingGroupMessages
  }, [pendingGroupMessages])

  useEffect(() => {
    if (!session?.identifier) return

    setPendingDirectMessages((currentMessages) => {
      const pendingMessages = currentMessages.filter((message) => message.status === 'pending')
      const failedMessages = loadPersistedFailedDirectMessages(session.identifier)

      return [
        ...pendingMessages,
        ...failedMessages.filter(
          (failedMessage) => !pendingMessages.some((message) => message.localId === failedMessage.localId),
        ),
      ]
    })

    setPendingGroupMessages((currentMessages) => {
      const pendingMessages = currentMessages.filter((message) => message.status === 'pending')
      const failedMessages = loadPersistedFailedGroupMessages(session.identifier)

      return [
        ...pendingMessages,
        ...failedMessages.filter(
          (failedMessage) => !pendingMessages.some((message) => message.localId === failedMessage.localId),
        ),
      ]
    })
  }, [session?.identifier])

  useEffect(() => {
    if (!session?.identifier || typeof window === 'undefined') return

    const failedMessages = pendingDirectMessages.filter((message) => message.status === 'failed')
    const storageKey = getFailedDirectMessagesStorageKey(session.identifier)

    if (failedMessages.length === 0) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(serializePendingDirectMessages(failedMessages)))
  }, [pendingDirectMessages, session?.identifier])

  useEffect(() => {
    if (!session?.identifier || typeof window === 'undefined') return

    const failedMessages = pendingGroupMessages.filter((message) => message.status === 'failed')
    const storageKey = getFailedGroupMessagesStorageKey(session.identifier)

    if (failedMessages.length === 0) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(serializePendingGroupMessages(failedMessages)))
  }, [pendingGroupMessages, session?.identifier])

  useEffect(() => {
    if (!copyHintText) return

    const timeoutId = window.setTimeout(() => setCopyHintText(''), 1600)
    return () => window.clearTimeout(timeoutId)
  }, [copyHintText])

  const adjustAccountNameFontSize = useCallback(() => {
    const nameNode = accountNameRef.current

    if (!nameNode) return

    if (!sessionName.trim()) {
      nameNode.style.removeProperty('font-size')
      return
    }

    let nextFontSize = accountNameMaxFontSize
    nameNode.style.fontSize = `${nextFontSize}px`

    const computedStyle = window.getComputedStyle(nameNode)
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || nextFontSize * 0.98
    const maxHeight = lineHeight * 2 + 1

    while (nameNode.scrollHeight > maxHeight && nextFontSize > accountNameMinFontSize) {
      nextFontSize -= 0.5
      nameNode.style.fontSize = `${nextFontSize}px`
    }
  }, [sessionName])

  const adjustAccountStatusFontSize = useCallback(() => {
    const statusNode = accountStatusRef.current
    const statusValue = session?.status?.trim()

    if (!statusNode) return

    if (!statusValue) {
      statusNode.style.removeProperty('font-size')
      return
    }

    let nextFontSize = accountStatusMaxFontSize
    statusNode.style.fontSize = `${nextFontSize}px`

    const computedStyle = window.getComputedStyle(statusNode)
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || nextFontSize * 1.32
    const maxHeight = lineHeight * 2 + 1

    while (statusNode.scrollHeight > maxHeight && nextFontSize > accountStatusMinFontSize) {
      nextFontSize -= 0.5
      statusNode.style.fontSize = `${nextFontSize}px`
    }
  }, [session?.status])

  const adjustSettingsProfileNameFontSize = useCallback(() => {
    const nameNode = settingsProfileNameRef.current

    if (!nameNode) return

    if (!sessionName.trim()) {
      nameNode.style.removeProperty('font-size')
      return
    }

    let nextFontSize = accountNameMaxFontSize
    nameNode.style.fontSize = `${nextFontSize}px`

    const computedStyle = window.getComputedStyle(nameNode)
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || nextFontSize * 0.98
    const maxHeight = lineHeight * 3 + 1

    while (nameNode.scrollHeight > maxHeight && nextFontSize > accountNameMinFontSize) {
      nextFontSize -= 0.5
      nameNode.style.fontSize = `${nextFontSize}px`
    }
  }, [sessionName])

  useLayoutEffect(() => {
    if (!isRailVisible) return
    adjustAccountNameFontSize()
  }, [adjustAccountNameFontSize, isRailVisible])

  useLayoutEffect(() => {
    if (!isSettingsView || settingsView !== 'profile') return

    const animationFrameId = window.requestAnimationFrame(() => {
      adjustSettingsProfileNameFontSize()
    })

    return () => window.cancelAnimationFrame(animationFrameId)
  }, [adjustSettingsProfileNameFontSize, isSettingsView, settingsView])

  useLayoutEffect(() => {
    if (!isRailVisible) return
    adjustAccountStatusFontSize()
  }, [adjustAccountStatusFontSize, isRailVisible])

  useEffect(() => {
    const hasName = sessionName.trim() !== ''
    const hasStatus = Boolean(session?.status?.trim())

    if (!isRailVisible || (!hasName && !hasStatus)) return

    const handleResize = () => {
      adjustAccountNameFontSize()
      adjustAccountStatusFontSize()
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [adjustAccountNameFontSize, adjustAccountStatusFontSize, isRailVisible, session?.status, sessionName])

  const persistSession = useCallback((nextSession: Session | null) => {
    setSession(nextSession)

    if (typeof window === 'undefined') return

    if (nextSession) {
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
    } else {
      window.localStorage.removeItem(sessionStorageKey)
    }
  }, [])

  const syncSession = useCallback((nextSession: Session) => {
    persistSession(nextSession)

    const currentAccounts = loadAccounts()
    const hasExistingAccount = currentAccounts.some(
      (account) => account.identifier === nextSession.identifier,
    )
    const nextAccounts = hasExistingAccount
      ? currentAccounts.map((account) =>
          account.identifier === nextSession.identifier
            ? {
                ...account,
                avatarImage: nextSession.avatarImage,
                displayName: nextSession.displayName,
                surname: nextSession.surname ?? '',
                nickname: nextSession.nickname ?? '',
                status: nextSession.status ?? '',
                premium: nextSession.premium ?? true,
                premiumExpiresAt: normalizePremiumExpiry(
                  nextSession.premium ?? true,
                  nextSession.premiumExpiresAt,
                ),
                blockedContactIds: nextSession.blockedContactIds ?? [],
              }
            : account,
        )
      : [
          ...currentAccounts,
          {
            avatarImage: nextSession.avatarImage,
            blockedContactIds: nextSession.blockedContactIds ?? [],
            createdAt: new Date().toISOString(),
            displayName: nextSession.displayName,
            identifier: nextSession.identifier,
            nickname: nextSession.nickname ?? '',
            premium: nextSession.premium ?? true,
            premiumExpiresAt: normalizePremiumExpiry(
              nextSession.premium ?? true,
              nextSession.premiumExpiresAt,
            ),
            status: nextSession.status ?? '',
            surname: nextSession.surname ?? '',
          },
        ]

    window.localStorage.setItem(accountsStorageKey, JSON.stringify(nextAccounts))
  }, [persistSession])

  const mergeDirectOutboxMessagesIntoChats = useCallback((snapshotChats: AppSnapshot['chats']) => {
    const queuedMessages = pendingDirectMessagesRef.current

    if (queuedMessages.length === 0) return snapshotChats

    const queuedMessagesByChatId = new Map<number, PendingDirectMessage[]>()

    queuedMessages.forEach((message) => {
      const chatMessages = queuedMessagesByChatId.get(message.chatId) ?? []
      chatMessages.push(message)
      queuedMessagesByChatId.set(message.chatId, chatMessages)
    })

    return snapshotChats.map((chat) => {
      const queuedMessagesForChat = queuedMessagesByChatId.get(chat.id)
      if (!queuedMessagesForChat || queuedMessagesForChat.length === 0) return chat

      const existingIds = new Set(chat.messages.map((message) => message.id))
      const localMessages = queuedMessagesForChat
        .filter((message) => !existingIds.has(message.localId))
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .map((message) => ({
          attachment: message.attachment,
          author: 'me' as const,
          createdAt: message.createdAt,
          id: message.localId,
          replyTo: message.replyTo,
          text: message.text,
          time: message.time,
        }))

      if (localMessages.length === 0) return chat

      return {
        ...chat,
        messages: [...chat.messages, ...localMessages],
      }
    })
  }, [])

  const mergeGroupOutboxMessagesIntoGroups = useCallback((snapshotGroups: AppSnapshot['groups']) => {
    const queuedMessages = pendingGroupMessagesRef.current

    if (queuedMessages.length === 0) return snapshotGroups

    const queuedMessagesByGroupId = new Map<number, PendingGroupMessage[]>()

    queuedMessages.forEach((message) => {
      const groupMessages = queuedMessagesByGroupId.get(message.groupId) ?? []
      groupMessages.push(message)
      queuedMessagesByGroupId.set(message.groupId, groupMessages)
    })

    return snapshotGroups.map((group) => {
      const queuedMessagesForGroup = queuedMessagesByGroupId.get(group.id)
      if (!queuedMessagesForGroup || queuedMessagesForGroup.length === 0) return group

      const existingIds = new Set(group.messages.map((message) => message.id))
      const localMessages = queuedMessagesForGroup
        .filter((message) => !existingIds.has(message.localId))
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .map((message) => ({
          attachment: message.attachment,
          author: 'me' as const,
          createdAt: message.createdAt,
          id: message.localId,
          text: message.text,
          time: message.time,
        }))

      if (localMessages.length === 0) return group

      return {
        ...group,
        messages: [...group.messages, ...localMessages],
      }
    })
  }, [])

  const applySnapshot = useCallback((snapshot: AppSnapshot) => {
    const mergedChats = mergeDirectOutboxMessagesIntoChats(snapshot.chats)
    const mergedGroups = mergeGroupOutboxMessagesIntoGroups(snapshot.groups)

    skipNextBackendSyncRef.current = true
    setChats(mergedChats)
    setChannels(snapshot.channels)
    setDiscoveryResults(snapshot.discoveryResults)
    setGroups(mergedGroups)
    setSubscriptionChannels(snapshot.subscriptionChannels)
    setActiveChatId((currentChatId) =>
      currentChatId !== null && mergedChats.some((chat) => chat.id === currentChatId)
        ? currentChatId
        : null,
    )
    setActiveGroupId((currentGroupId) =>
      currentGroupId !== null && mergedGroups.some((group) => group.id === currentGroupId)
        ? currentGroupId
        : null,
    )
    setActiveSubscriptionChannelId((currentChannelId) =>
      currentChannelId !== null &&
      snapshot.subscriptionChannels.some((channel) => channel.id === currentChannelId)
        ? currentChannelId
        : null,
    )
    setActiveChannelId((currentChannelId) =>
      currentChannelId !== null && snapshot.channels.some((channel) => channel.id === currentChannelId)
        ? currentChannelId
        : snapshot.channels[0]?.id ?? null,
      )
    syncSession(snapshot.session)
  }, [mergeDirectOutboxMessagesIntoChats, mergeGroupOutboxMessagesIntoGroups, syncSession])

  useEffect(() => {
    if (!session) {
      latestSnapshotRef.current = null
      return
    }

    latestSnapshotRef.current = {
      channels,
      chats,
      discoveryResults,
      groups,
      session,
      subscriptionChannels,
    }
  }, [channels, chats, discoveryResults, groups, session, subscriptionChannels])

  const fallbackSaveCurrentSnapshot = useCallback(async (reason: string) => {
    if (
      pendingDirectMessagesRef.current.length > 0 ||
      pendingGroupMessagesRef.current.length > 0
    ) {
      return
    }

    const snapshot = latestSnapshotRef.current
    const sessionToken = snapshot?.session.sessionToken

    if (!snapshot || !sessionToken) return

    try {
      const nextSnapshot = await saveSnapshot(sessionToken, snapshot)
      applySnapshot(nextSnapshot)
    } catch (error) {
      console.error(`Failed to fallback snapshot sync after ${reason}`, error)
    }
  }, [applySnapshot])

  const scheduleSessionMutation = useCallback((patch: UpdateSessionBody) => {
    // Profile inputs are edited character-by-character, so they use a dedicated debounce path
    // instead of pushing a full snapshot on every keystroke.
    if (!backendReady || !session?.sessionToken) return

    if (hasPendingOutgoingMessages) {
      return
    }

    suppressSessionSnapshotSyncRef.current = true
    pendingSessionPatchRef.current = {
      ...pendingSessionPatchRef.current,
      ...patch,
    }

    if (sessionMutationTimeoutRef.current !== null) {
      window.clearTimeout(sessionMutationTimeoutRef.current)
    }

    sessionMutationTimeoutRef.current = window.setTimeout(() => {
      const nextPatch = pendingSessionPatchRef.current
      const sessionToken = latestSnapshotRef.current?.session.sessionToken

      pendingSessionPatchRef.current = {}
      sessionMutationTimeoutRef.current = null
      suppressSessionSnapshotSyncRef.current = false

      if (!sessionToken || Object.keys(nextPatch).length === 0) return

      void (async () => {
        try {
          const response = await updateSessionRequest(sessionToken, nextPatch)
          applySnapshot(response.snapshot)
        } catch (error) {
          console.error('Failed to sync session mutation', error)
          await fallbackSaveCurrentSnapshot('session mutation')
        }
      })()
    }, 320)
  }, [applySnapshot, backendReady, fallbackSaveCurrentSnapshot, session?.sessionToken])

  const scheduleManagedChannelMutation = useCallback(
    (channelId: number, patch: UpdateManagedChannelBody) => {
      // Channel detail fields follow the same pattern as profile fields: local form state first,
      // then one compact server mutation after the user pauses typing.
      if (!backendReady || !session?.sessionToken) return

      suppressChannelSnapshotSyncRef.current = true
      pendingChannelPatchesRef.current.set(channelId, {
        ...(pendingChannelPatchesRef.current.get(channelId) ?? {}),
        ...patch,
      })

      const activeTimeout = channelMutationTimeoutsRef.current.get(channelId)
      if (activeTimeout !== undefined) {
        window.clearTimeout(activeTimeout)
      }

      const timeoutId = window.setTimeout(() => {
        const nextPatch = pendingChannelPatchesRef.current.get(channelId)
        const sessionToken = latestSnapshotRef.current?.session.sessionToken

        pendingChannelPatchesRef.current.delete(channelId)
        channelMutationTimeoutsRef.current.delete(channelId)
        suppressChannelSnapshotSyncRef.current = false

        if (!sessionToken || !nextPatch || Object.keys(nextPatch).length === 0) return

        void (async () => {
          try {
            const response = await updateManagedChannelRequest(sessionToken, channelId, nextPatch)
            applySnapshot(response.snapshot)
          } catch (error) {
            console.error('Failed to sync managed channel mutation', error)
            await fallbackSaveCurrentSnapshot('channel mutation')
          }
        })()
      }, 320)

      channelMutationTimeoutsRef.current.set(channelId, timeoutId)
    },
    [applySnapshot, backendReady, fallbackSaveCurrentSnapshot, session?.sessionToken],
  )

  useEffect(() => {
    if (session?.sessionToken) return

    if (sessionMutationTimeoutRef.current !== null) {
      window.clearTimeout(sessionMutationTimeoutRef.current)
      sessionMutationTimeoutRef.current = null
    }

    channelMutationTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    channelMutationTimeoutsRef.current.clear()
    pendingSessionPatchRef.current = {}
    pendingChannelPatchesRef.current.clear()
    suppressSessionSnapshotSyncRef.current = false
    suppressChannelSnapshotSyncRef.current = false
  }, [session?.sessionToken])

  useEffect(() => {
    if (!session?.sessionToken) return

    let cancelled = false

    void (async () => {
      try {
        const snapshot = await fetchBootstrap(session.sessionToken!)
        if (cancelled) return
        applySnapshot(snapshot)
        setBackendReady(true)
      } catch (error) {
        if (cancelled) return
        console.error('Failed to bootstrap Tinychok backend', error)
        setBackendReady(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [applySnapshot, session?.sessionToken])

  useEffect(() => {
    if (!searchOpen || topListView !== 'none') {
      return
    }

    const trimmedQuery = query.trim()
    if (!trimmedQuery || !backendReady || !session?.sessionToken) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void searchDiscoveryResultsRequest(session.sessionToken!, trimmedQuery)
        .then((results) => {
          if (!cancelled) {
            setLiveSearchState({
              query: trimmedQuery,
              results,
            })
          }
        })
        .catch((error) => {
          if (cancelled) return
          console.error('Failed to search discovery accounts', error)
          setLiveSearchState({
            query: trimmedQuery,
            results: [],
          })
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [backendReady, query, searchOpen, session?.sessionToken, topListView])

  useEffect(() => {
    if (!backendReady || !session?.sessionToken) return

    const socket = openRealtimeConnection(session.sessionToken, (event) => {
      applySnapshot(event.snapshot)
    })

    return () => {
      socket.close()
    }
  }, [applySnapshot, backendReady, session?.sessionToken])

  useEffect(() => {
    const previousSlices = previousSnapshotSlicesRef.current
    const chatsChanged = previousSlices.chats !== chats
    const groupsChanged = previousSlices.groups !== groups
    const sessionChanged = previousSlices.session !== session
    const channelsChanged = previousSlices.channels !== channels
    const subscriptionChannelsChanged =
      previousSlices.subscriptionChannels !== subscriptionChannels

    previousSnapshotSlicesRef.current = {
      channels,
      chats,
      groups,
      session,
      subscriptionChannels,
    }

    if (!backendReady || !session?.sessionToken) return

    if (skipNextBackendSyncRef.current) {
      skipNextBackendSyncRef.current = false
      return
    }

    const onlySessionAndChannelChanged =
      !chatsChanged &&
      !groupsChanged &&
      !subscriptionChannelsChanged &&
      (sessionChanged || channelsChanged)

    if (onlySessionAndChannelChanged) {
      // If the change is already traveling through dedicated session/channel mutations,
      // we skip the legacy full snapshot save to avoid duplicate writes.
      const sessionHandledByDedicatedMutation =
        !sessionChanged || suppressSessionSnapshotSyncRef.current
      const channelsHandledByDedicatedMutation =
        !channelsChanged || suppressChannelSnapshotSyncRef.current

      if (sessionHandledByDedicatedMutation && channelsHandledByDedicatedMutation) {
        return
      }
    }

    if (hasLocalOutboxMessages) {
      return
    }

    if (backendSyncTimeoutRef.current !== null) {
      window.clearTimeout(backendSyncTimeoutRef.current)
    }

    const snapshot: AppSnapshot = {
      channels,
      chats,
      discoveryResults,
      groups,
      session,
      subscriptionChannels,
    }

    backendSyncTimeoutRef.current = window.setTimeout(() => {
      void saveSnapshot(session.sessionToken!, snapshot).catch((error) => {
        console.error('Failed to sync Tinychok snapshot', error)
      })
    }, 300)

    return () => {
      if (backendSyncTimeoutRef.current !== null) {
        window.clearTimeout(backendSyncTimeoutRef.current)
        backendSyncTimeoutRef.current = null
      }
    }
  }, [
    backendReady,
    channels,
    chats,
    discoveryResults,
    groups,
    hasLocalOutboxMessages,
    hasPendingOutgoingMessages,
    session,
    subscriptionChannels,
  ])

  async function submitPhoneStep() {
    const normalized = normalizeIdentifier(identifier)

    if (!normalized) {
      setAuthError('Введи номер телефона.')
      return
    }

    if (normalized.length < 12) {
      setAuthError('Проверь номер телефона.')
      return
    }

    try {
      const response = await requestAuthCode({ identifier: normalized })
      setIdentifier(normalized)
      setAuthExistingAccount(response.existingAccount)
      setAuthError('')
      setAuthStep('code')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось запросить код.')
    }
  }

  async function submitCodeStep() {
    const normalized = normalizeIdentifier(identifier)
    const trimmedCode = smsCode.trim()

    if (trimmedCode.length < 4) {
      setAuthError('Введи код из SMS.')
      return
    }

    try {
      const response = await verifyAuthCode({
        code: trimmedCode,
        identifier: normalized,
      })

      if (response.status === 'authenticated') {
        applySnapshot(response.snapshot)
        setBackendReady(true)
        setAuthError('')
        return
      }

      setAuthExistingAccount(null)
      setAuthError('')
      setAuthStep('profile')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось подтвердить код.')
    }
  }

  async function submitProfileStep() {
    const normalized = normalizeIdentifier(identifier)
    const trimmedName = sanitizePersonField(displayName, displayNameFieldMaxLength)

    if (!trimmedName) {
      setAuthError('Для регистрации нужен ник или имя.')
      return
    }

    try {
      const response = await registerAccount({
        code: smsCode.trim(),
        displayName: trimmedName,
        identifier: normalized,
      })
      applySnapshot(response.snapshot)
      setBackendReady(true)
      setAuthError('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось завершить регистрацию.')
    }
  }

  function logout() {
    persistSession(null)
    setBackendReady(false)
    setIdentifier('')
    setDisplayName('')
    setSmsCode('')
    setAuthStep('phone')
    setAuthExistingAccount(null)
    setChatMessageDrafts({})
    setGroupMessageDrafts({})
    setChatAttachmentDrafts({})
    setGroupAttachmentDrafts({})
    setConfirmingLogout(false)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setPremiumGiftChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setTopListView('none')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setRetainedGroupId(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setPendingDirectMessages([])
    setPendingGroupMessages([])
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
  }

  function getNextOptimisticMessageId() {
    const nextId = nextOptimisticMessageIdRef.current
    nextOptimisticMessageIdRef.current -= 1
    return nextId
  }

  function clearChatComposer(chatId: number) {
    setChatMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [chatId]: '',
    }))
    setChatAttachmentDrafts((currentAttachments) => ({
      ...currentAttachments,
      [chatId]: undefined,
    }))
  }

  function clearGroupComposer(groupId: number) {
    setGroupMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [groupId]: '',
    }))
    setGroupAttachmentDrafts((currentAttachments) => ({
      ...currentAttachments,
      [groupId]: undefined,
    }))
  }

  function queuePendingDirectMessage(message: PendingDirectMessage) {
    setPendingDirectMessages((currentMessages) => [...currentMessages, message])
  }

  function queuePendingGroupMessage(message: PendingGroupMessage) {
    setPendingGroupMessages((currentMessages) => [...currentMessages, message])
  }

  function updatePendingDirectMessage(
    localId: number,
    updater: (message: PendingDirectMessage) => PendingDirectMessage,
  ) {
    setPendingDirectMessages((currentMessages) =>
      currentMessages.map((message) => (message.localId === localId ? updater(message) : message)),
    )
  }

  function updatePendingGroupMessage(
    localId: number,
    updater: (message: PendingGroupMessage) => PendingGroupMessage,
  ) {
    setPendingGroupMessages((currentMessages) =>
      currentMessages.map((message) => (message.localId === localId ? updater(message) : message)),
    )
  }

  function removePendingDirectMessage(localId: number) {
    setPendingDirectMessages((currentMessages) =>
      currentMessages.filter((message) => message.localId !== localId),
    )
  }

  function removePendingGroupMessage(localId: number) {
    setPendingGroupMessages((currentMessages) =>
      currentMessages.filter((message) => message.localId !== localId),
    )
  }

  function clearPendingDirectMessagesForChat(chatId: number) {
    setPendingDirectMessages((currentMessages) =>
      currentMessages.filter((message) => message.chatId !== chatId),
    )
  }

  function markPendingDirectMessageAttemptFailed(localId: number) {
    const failureTimestamp = new Date().toISOString()

    updatePendingDirectMessage(localId, (message) => {
      const shouldFail =
        Date.now() - Date.parse(message.queuedAt) >= DELIVERY_FAILURE_TIMEOUT_MS

      return {
        ...message,
        retryCount: message.retryCount + 1,
        status: shouldFail ? 'failed' : 'pending',
      }
    })

    return failureTimestamp
  }

  function markPendingGroupMessageAttemptFailed(localId: number) {
    const failureTimestamp = new Date().toISOString()

    updatePendingGroupMessage(localId, (message) => {
      const shouldFail =
        Date.now() - Date.parse(message.queuedAt) >= DELIVERY_FAILURE_TIMEOUT_MS

      return {
        ...message,
        retryCount: message.retryCount + 1,
        status: shouldFail ? 'failed' : 'pending',
      }
    })

    return failureTimestamp
  }

  function applyLocalDialogRead(chatId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              unread: 0,
            }
          : chat,
      ),
    )
  }

  function applyLocalGroupRead(groupId: number) {
    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              unread: 0,
            }
          : group,
      ),
    )
  }

  function applyLocalSubscriptionChannelRead(channelId: number) {
    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              unread: 0,
            }
          : channel,
      ),
    )
  }

  function applyLocalDirectMessage(
    chatId: number,
    text: string,
    options?: {
      attachment?: Message['attachment']
      createdAt?: string
      forwarded?: boolean
      forwardedAuthorName?: string
      localId?: number
      markAsRead?: boolean
      replyTo?: Message['replyTo']
      sourceChannel?: Message['sourceChannel']
      time?: string
    },
  ) {
    const createdAt = options?.createdAt ?? new Date().toISOString()
    const time = options?.time ?? formatNowTime()

    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== chatId) return chat

        return {
          ...chat,
          typing: false,
          unread: options?.markAsRead === false ? chat.unread : 0,
          status: 'только что был(а) здесь',
          messages: [
            ...chat.messages,
            {
              attachment: options?.attachment,
              author: 'me',
              forwarded: options?.forwarded,
              forwardedAuthorName: options?.forwardedAuthorName,
              id: options?.localId ?? Date.now(),
              replyTo: options?.replyTo,
              sourceChannel: options?.sourceChannel,
              text,
              createdAt,
              time,
            },
          ],
        }
      }),
    )
  }

  function applyLocalTogglePinnedChat(chatId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinned: !chat.pinned,
            }
          : chat,
      ),
    )
  }

  function applyLocalGroupMessage(
    groupId: number,
    text: string,
    options?: {
      attachment?: Message['attachment']
      createdAt?: string
      forwarded?: boolean
      forwardedAuthorName?: string
      localId?: number
      sourceChannel?: Message['sourceChannel']
      time?: string
    },
  ) {
    const time = options?.time ?? formatNowTime()
    const createdAt = options?.createdAt ?? new Date().toISOString()

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              preview:
                text || (options?.attachment ? `Файл: ${options.attachment.fileName}` : group.preview),
              time,
              unread: 0,
              messages: [
                ...group.messages,
                {
                  attachment: options?.attachment,
                  id: options?.localId ?? Date.now() + group.id,
                  author: 'me',
                  createdAt,
                  forwarded: options?.forwarded,
                  forwardedAuthorName: options?.forwardedAuthorName,
                  sourceChannel: options?.sourceChannel,
                  text,
                  time,
                },
              ],
            }
          : group,
      ),
    )
  }

  function applyLocalDeleteChatHistory(chatId: number) {
    clearPendingDirectMessagesForChat(chatId)
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [],
              pinnedMessageId: undefined,
              typing: false,
              unread: 0,
            }
          : chat,
      ),
    )
  }

  function clearDeletedChatLocalState(chatId: number) {
    setChatMessageDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[chatId]
      return nextDrafts
    })
    setChatAttachmentDrafts((currentAttachments) => {
      const nextAttachments = { ...currentAttachments }
      delete nextAttachments[chatId]
      return nextAttachments
    })
  }

  function buildMessageAttachmentFromDraft(attachmentDraft?: PendingAttachmentDraft) {
    if (!attachmentDraft) return undefined

    if (attachmentDraft.mediaUrl) {
      return {
        fileName: attachmentDraft.fileName,
        mediaUrl: attachmentDraft.mediaUrl,
        mimeType: attachmentDraft.mimeType,
        size: attachmentDraft.size,
      } satisfies NonNullable<Message['attachment']>
    }

    if (!attachmentDraft.file) return undefined

    const localMediaUrl = URL.createObjectURL(attachmentDraft.file)
    localMessageAttachmentObjectUrlsRef.current.add(localMediaUrl)

    return {
      fileName: attachmentDraft.fileName,
      mediaUrl: localMediaUrl,
      mimeType: attachmentDraft.mimeType,
      size: attachmentDraft.size,
    } satisfies NonNullable<Message['attachment']>
  }

  async function resolvePendingAttachmentForSend(
    sessionToken: string,
    attachmentDraft?: PendingAttachmentDraft,
  ) {
    if (!attachmentDraft) {
      return {
        attachment: undefined,
        attachmentDraft: undefined,
      }
    }

    if (attachmentDraft.mediaUrl) {
      return {
        attachment: {
          fileName: attachmentDraft.fileName,
          mediaUrl: attachmentDraft.mediaUrl,
          mimeType: attachmentDraft.mimeType,
          size: attachmentDraft.size,
        } satisfies NonNullable<Message['attachment']>,
        attachmentDraft,
      }
    }

    if (!attachmentDraft.file) {
      throw new Error('Вложение больше недоступно локально. Добавьте файл заново.')
    }

    const uploadedMedia = await uploadMediaFile(sessionToken, attachmentDraft.file, 'attachment')

    return {
      attachment: {
        fileName: uploadedMedia.fileName,
        mediaUrl: uploadedMedia.mediaUrl,
        mimeType: uploadedMedia.mimeType,
        size: uploadedMedia.size,
      } satisfies NonNullable<Message['attachment']>,
      attachmentDraft: {
        fileName: uploadedMedia.fileName,
        mediaUrl: uploadedMedia.mediaUrl,
        mimeType: uploadedMedia.mimeType,
        size: uploadedMedia.size,
      } satisfies PendingAttachmentDraft,
    }
  }

  function applyLocalDeleteGroupMessage(groupId: number, messageId: number) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id !== groupId) return group

        return {
          ...group,
          messages: group.messages.filter((message) => message.id !== messageId),
        }
      }),
    )
  }

  async function createPendingAttachmentDraft(file: File) {
    // Chat and group composers share the same upload contract, so one helper keeps
    // the draft -> upload -> final message attachment path explicit in one place.
    if (backendReady && session?.sessionToken) {
      try {
        const uploadedMedia = await uploadMediaFile(session.sessionToken, file, 'attachment')
        return {
          fileName: uploadedMedia.fileName,
          mediaUrl: uploadedMedia.mediaUrl,
          mimeType: uploadedMedia.mimeType,
          size: uploadedMedia.size,
        } satisfies PendingAttachmentDraft
      } catch (error) {
        console.error('Failed to upload attachment draft', error)
      }
    }

    return {
      file,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    } satisfies PendingAttachmentDraft
  }

  function applyLocalDeleteContact(chatId: number) {
    clearPendingDirectMessagesForChat(chatId)
    setChats((currentChats) => currentChats.filter((chat) => chat.id !== chatId))
    clearDeletedChatLocalState(chatId)
  }

  function applyLocalSetPinnedMessage(chatId: number, messageId?: number) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinnedMessageId: messageId,
            }
          : chat,
      ),
    )
  }

  function applyLocalDeleteMessage(chatId: number, messageId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== chatId) return chat

        return {
          ...chat,
          messages: chat.messages.filter((message) => message.id !== messageId),
          pinnedMessageId: chat.pinnedMessageId === messageId ? undefined : chat.pinnedMessageId,
        }
      }),
    )
  }

  function applyLocalDeleteChannel(channelId: number) {
    setChannels((currentChannels) => currentChannels.filter((channel) => channel.id !== channelId))
  }

  function releaseChannelAvatarDraft(draft: ChannelAvatarDraft | null) {
    if (!draft?.previewUrl.startsWith('blob:')) return

    URL.revokeObjectURL(draft.previewUrl)
    channelAvatarObjectUrlsRef.current.delete(draft.previewUrl)
  }

  function getCurrentChannelAvatarPreview() {
    if (!channelAvatarPickerTarget) return null

    if (channelAvatarPickerDraft) {
      return channelAvatarPickerDraft.previewUrl
    }

    if (channelAvatarPickerTarget.scope === 'create') {
      return creatingChannelAvatarDraft?.previewUrl ?? null
    }

    return channels.find((channel) => channel.id === channelAvatarPickerTarget.channelId)?.avatarImage ?? null
  }

  function getCurrentChannelAvatarTone() {
    if (!channelAvatarPickerTarget) return creatingChannelAvatarTone

    if (channelAvatarPickerTarget.scope === 'create') {
      return creatingChannelAvatarTone
    }

    return (
      channels.find((channel) => channel.id === channelAvatarPickerTarget.channelId)?.avatarTone ??
      creatingChannelAvatarTone
    )
  }

  function closeChannelAvatarPicker(options?: { preserveCurrentDraft?: boolean }) {
    if (!options?.preserveCurrentDraft) {
      const shouldPreserveSavedCreateDraft =
        channelAvatarPickerTarget?.scope === 'create' &&
        channelAvatarPickerDraft !== null &&
        channelAvatarPickerDraft === creatingChannelAvatarDraft

      if (!shouldPreserveSavedCreateDraft) {
        releaseChannelAvatarDraft(channelAvatarPickerDraft)
      }
    }

    setChannelAvatarPickerTarget(null)
    setChannelAvatarPickerDraft(null)
    setChannelAvatarPickerError('')
    setChannelAvatarPickerBusy(false)
    setChannelAvatarPickerMode('none')

    if (channelAvatarInputRef.current) {
      channelAvatarInputRef.current.value = ''
    }
  }

  function openChannelAvatarPicker(target: ChannelAvatarPickerTarget) {
    setChannelAvatarPickerTarget(target)
    setChannelAvatarPickerError('')
    setChannelAvatarPickerBusy(false)

    if (target.scope === 'create') {
      setChannelAvatarPickerDraft(creatingChannelAvatarDraft)
      setChannelAvatarPickerMode('none')
      return
    }

    setChannelAvatarPickerDraft(null)
    setChannelAvatarPickerMode('none')
  }

  function buildStockAvatarDraft(option: StockAvatarOption): ChannelAvatarDraft {
    return {
      kind: 'stock',
      label: option.label,
      previewUrl: option.imagePath,
    }
  }

  function selectStockChannelAvatar(option: StockAvatarOption) {
    const nextDraft = buildStockAvatarDraft(option)

    setChannelAvatarPickerMode('stock')
    setChannelAvatarPickerError('')
    setChannelAvatarPickerDraft((currentDraft) => {
      const shouldPreserveSavedCreateDraft =
        channelAvatarPickerTarget?.scope === 'create' &&
        currentDraft !== null &&
        currentDraft === creatingChannelAvatarDraft

      if (!shouldPreserveSavedCreateDraft) {
        releaseChannelAvatarDraft(currentDraft)
      }

      return nextDraft
    })
  }

  function getCurrentProfileAvatarPreview() {
    return profileAvatarPickerDraft?.previewUrl ?? session?.avatarImage ?? null
  }

  function closeProfileAvatarPicker(options?: { preserveCurrentDraft?: boolean }) {
    if (!options?.preserveCurrentDraft) {
      releaseChannelAvatarDraft(profileAvatarPickerDraft)
    }

    setProfileAvatarPickerOpen(false)
    setProfileAvatarPickerDraft(null)
    setProfileAvatarPickerError('')
    setProfileAvatarPickerBusy(false)
    setProfileAvatarPickerMode('none')

    if (profileAvatarInputRef.current) {
      profileAvatarInputRef.current.value = ''
    }
  }

  function openProfileAvatarPicker() {
    setProfileAvatarPickerOpen(true)
    setProfileAvatarPickerDraft(null)
    setProfileAvatarPickerError('')
    setProfileAvatarPickerBusy(false)
    setProfileAvatarPickerMode('none')
  }

  function selectStockProfileAvatar(option: StockAvatarOption) {
    const nextDraft = buildStockAvatarDraft(option)

    setProfileAvatarPickerMode('stock')
    setProfileAvatarPickerError('')
    setProfileAvatarPickerDraft((currentDraft) => {
      releaseChannelAvatarDraft(currentDraft)
      return nextDraft
    })
  }

  async function mutateBlockedContacts(nextBlockedContactIds: number[]) {
    if (!session) return

    if (backendReady && session.sessionToken) {
      try {
        const response = await updateSessionRequest(session.sessionToken, {
          blockedContactIds: nextBlockedContactIds,
        })
        applySnapshot(response.snapshot)
        return
      } catch (error) {
        console.error('Failed to update blocked contacts', error)
      }
    }

    syncSession({
      ...session,
      blockedContactIds: nextBlockedContactIds,
    })
  }

  async function syncDialogRead(dialogId: number) {
    if (!backendReady || !session?.sessionToken) {
      applyLocalDialogRead(dialogId)
      return
    }

    try {
      const response = await markDialogReadRequest(session.sessionToken, dialogId)
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to mark dialog as read', error)
      applyLocalDialogRead(dialogId)
    }
  }

  async function syncGroupRead(groupId: number) {
    if (!backendReady || !session?.sessionToken) {
      applyLocalGroupRead(groupId)
      return
    }

    try {
      const response = await markGroupReadRequest(session.sessionToken, groupId)
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to mark group as read', error)
      applyLocalGroupRead(groupId)
    }
  }

  async function syncSubscriptionChannelRead(channelId: number) {
    if (!backendReady || !session?.sessionToken) {
      applyLocalSubscriptionChannelRead(channelId)
      return
    }

    try {
      const response = await markSubscriptionChannelReadRequest(session.sessionToken, channelId)
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to mark subscription channel as read', error)
      applyLocalSubscriptionChannelRead(channelId)
    }
  }

  async function sendMessage() {
    if (!activeChat) return

    const chatId = activeChat.id
    const text = (chatMessageDrafts[chatId] ?? '').trim()
    const attachmentDraft = chatAttachmentDrafts[chatId]
    const replyTo = replyTarget
      ? {
          author: replyTarget.author,
          text: replyTarget.text,
        }
      : undefined
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)

    if (!text && !attachment) return

    const localId = getNextOptimisticMessageId()
    const createdAt = new Date().toISOString()
    const time = formatNowTime()

    if (backendReady && session?.sessionToken) {
      try {
        const response = await sendDirectMessageRequest(session.sessionToken, chatId, {
          attachment,
          markAsRead: true,
          replyTo,
          text,
        })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to send direct message', error)
        applyLocalDirectMessage(chatId, text, { attachment, createdAt, localId, replyTo, time })
        queuePendingDirectMessage({
          attachment,
          attachmentDraft,
          chatId,
          createdAt,
          localId,
          queuedAt: createdAt,
          replyTo,
          retryCount: 0,
          status: 'pending',
          text,
          time,
        })
      }
    } else {
      applyLocalDirectMessage(chatId, text, { attachment, createdAt, localId, replyTo, time })
      queuePendingDirectMessage({
        attachment,
        attachmentDraft,
        chatId,
        createdAt,
        localId,
        queuedAt: createdAt,
        replyTo,
        retryCount: 0,
        status: 'pending',
        text,
        time,
      })
    }

    clearChatComposer(chatId)
    setReplyTarget(null)
  }

  function updateChatDraft(chatId: number, value: string) {
    setChatMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [chatId]: value,
    }))
  }

  function updateGroupDraft(groupId: number, value: string) {
    setGroupMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [groupId]: value,
    }))
  }

  async function sendGroupMessage() {
    if (!activeGroup) return

    const groupId = activeGroup.id
    const text = (groupMessageDrafts[groupId] ?? '').trim()
    const attachmentDraft = groupAttachmentDrafts[groupId]
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    if (!text && !attachment) return

    const localId = getNextOptimisticMessageId()
    const createdAt = new Date().toISOString()
    const time = formatNowTime()

    if (backendReady && session?.sessionToken) {
      try {
        const response = await sendGroupMessageRequest(session.sessionToken, groupId, {
          attachment,
          text,
        })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to send group message', error)
        applyLocalGroupMessage(groupId, text, { attachment, createdAt, localId, time })
        queuePendingGroupMessage({
          attachment,
          attachmentDraft,
          createdAt,
          groupId,
          localId,
          queuedAt: createdAt,
          retryCount: 0,
          status: 'pending',
          text,
          time,
        })
      }
    } else {
      applyLocalGroupMessage(groupId, text, { attachment, createdAt, localId, time })
      queuePendingGroupMessage({
        attachment,
        attachmentDraft,
        createdAt,
        groupId,
        localId,
        queuedAt: createdAt,
        retryCount: 0,
        status: 'pending',
        text,
        time,
      })
    }

    clearGroupComposer(groupId)
    closeGroupMessageActions()
  }

  function openAttachmentPicker() {
    attachmentInputRef.current?.click()
  }

  async function handleChatAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file || !activeChat) {
      event.target.value = ''
      return
    }

    const nextAttachmentDraft = await createPendingAttachmentDraft(file)
    setChatAttachmentDrafts((currentAttachments) => ({
      ...currentAttachments,
      [activeChat.id]: nextAttachmentDraft,
    }))

    // Reset the native file input so selecting the same file again still fires onChange.
    event.target.value = ''
  }

  function openGroupAttachmentPicker() {
    groupAttachmentInputRef.current?.click()
  }

  async function handleGroupAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file || !activeGroup) {
      event.target.value = ''
      return
    }

    const nextAttachmentDraft = await createPendingAttachmentDraft(file)
    setGroupAttachmentDrafts((currentAttachments) => ({
      ...currentAttachments,
      [activeGroup.id]: nextAttachmentDraft,
    }))

    event.target.value = ''
  }

  function closeActiveRoom() {
    setActiveChatId(null)
    setActiveSubscriptionChannelId(null)
    setPreviewSubscriptionChannel(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setGroupParticipantsOpen(false)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setChatActionsOpen(false)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteGroupMessageId(null)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
  }

  const flushPendingMessages = useCallback(async () => {
    if (
      pendingRetryInFlightRef.current ||
      !backendReady ||
      !session?.sessionToken ||
      !hasPendingOutgoingMessages
    ) {
      return
    }

    pendingRetryInFlightRef.current = true

    try {
      const nextDirectMessage = pendingDirectMessages.find((message) => message.status === 'pending')

      if (nextDirectMessage) {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          nextDirectMessage.attachmentDraft,
        )

        if (
          resolvedAttachment.attachmentDraft?.mediaUrl &&
          resolvedAttachment.attachmentDraft.mediaUrl !== nextDirectMessage.attachmentDraft?.mediaUrl
        ) {
          updatePendingDirectMessage(nextDirectMessage.localId, (message) => ({
            ...message,
            attachment: resolvedAttachment.attachment,
            attachmentDraft: resolvedAttachment.attachmentDraft,
          }))
        }

        const response = await sendDirectMessageRequest(session.sessionToken, nextDirectMessage.chatId, {
          attachment: resolvedAttachment.attachment,
          markAsRead: true,
          replyTo: nextDirectMessage.replyTo,
          text: nextDirectMessage.text,
        })

        removePendingDirectMessage(nextDirectMessage.localId)
        applySnapshot(response.snapshot)
        return
      }

      const nextGroupMessage = pendingGroupMessages.find((message) => message.status === 'pending')

      if (!nextGroupMessage) return

      const resolvedAttachment = await resolvePendingAttachmentForSend(
        session.sessionToken,
        nextGroupMessage.attachmentDraft,
      )

      if (
        resolvedAttachment.attachmentDraft?.mediaUrl &&
        resolvedAttachment.attachmentDraft.mediaUrl !== nextGroupMessage.attachmentDraft?.mediaUrl
      ) {
        updatePendingGroupMessage(nextGroupMessage.localId, (message) => ({
          ...message,
          attachment: resolvedAttachment.attachment,
          attachmentDraft: resolvedAttachment.attachmentDraft,
        }))
      }

      const response = await sendGroupMessageRequest(session.sessionToken, nextGroupMessage.groupId, {
        attachment: resolvedAttachment.attachment,
        text: nextGroupMessage.text,
      })

      removePendingGroupMessage(nextGroupMessage.localId)
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to retry pending outgoing message', error)
      const nextDirectMessage = pendingDirectMessages.find((message) => message.status === 'pending')

      if (nextDirectMessage) {
        markPendingDirectMessageAttemptFailed(nextDirectMessage.localId)
      } else {
        const nextGroupMessage = pendingGroupMessages.find((message) => message.status === 'pending')

        if (nextGroupMessage) {
          markPendingGroupMessageAttemptFailed(nextGroupMessage.localId)
        }
      }
    } finally {
      pendingRetryInFlightRef.current = false
    }
  }, [
    applySnapshot,
    backendReady,
    hasPendingOutgoingMessages,
    markPendingDirectMessageAttemptFailed,
    markPendingGroupMessageAttemptFailed,
    pendingDirectMessages,
    pendingGroupMessages,
    session?.sessionToken,
    updatePendingDirectMessage,
    updatePendingGroupMessage,
  ])

  useEffect(() => {
    if (!backendReady || !session?.sessionToken || !hasPendingOutgoingMessages) return

    const tryFlushPendingMessages = () => {
      void flushPendingMessages()
    }

    tryFlushPendingMessages()

    const retryIntervalId = window.setInterval(tryFlushPendingMessages, 4000)
    window.addEventListener('online', tryFlushPendingMessages)

    return () => {
      window.clearInterval(retryIntervalId)
      window.removeEventListener('online', tryFlushPendingMessages)
    }
  }, [backendReady, flushPendingMessages, hasPendingOutgoingMessages, session?.sessionToken])

  function openSubscriptionChannel(channelId: number) {
    const shouldRetainSubscriptionChannelInList =
      topListView === 'channels' &&
      subscriptionChannels.some(
        (channel) =>
          channel.id === channelId &&
          (channel.unread > 0 || channel.id === retainedSubscriptionChannelId),
      )

    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedGroupId(null)
    setActiveChatId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(null)
    setRetainedSubscriptionChannelId(shouldRetainSubscriptionChannelInList ? channelId : null)
    setPreviewSubscriptionChannel(null)
    setActiveSubscriptionChannelId(channelId)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
    setTopListView('channels')
    setSearchOpen(false)
    void syncSubscriptionChannelRead(channelId)
  }

  function buildPreviewSubscriptionChannel(
    sourceChannel: NonNullable<Message['sourceChannel']>,
    previewPost?: ChannelPost,
  ) {
    return {
      accent: sourceChannel.accent ?? '#8c5738',
      draft: sourceChannel.draft,
      handle: sourceChannel.handle ?? '@channel_preview',
      id: sourceChannel.id ?? getSyntheticChannelId(sourceChannel.title),
      posts: previewPost ? [previewPost] : [],
      preview: previewPost?.text ?? '',
      readers: 0,
      time: previewPost?.time ?? '',
      title: sourceChannel.title,
      unread: 0,
      visibility: sourceChannel.visibility ?? 'public',
    } satisfies SubscriptionChannel
  }

  function openSourceChannel(sourceChannel: NonNullable<Message['sourceChannel']>, previewPost?: ChannelPost) {
    const normalizedHandle = sourceChannel.handle ? sanitizeChannelDirectLink(sourceChannel.handle) : ''
    if (!sourceChannel) return

    if (sourceChannel.id !== undefined) {
      const existingChannel = subscriptionChannels.find((channel) => channel.id === sourceChannel.id)
      if (existingChannel) {
        openSubscriptionChannel(existingChannel.id)
        return
      }
    }

    const existingByTitle = subscriptionChannels.find(
      (channel) => channel.title === sourceChannel.title,
    )
    if (existingByTitle) {
      openSubscriptionChannel(existingByTitle.id)
      return
    }

    if (normalizedHandle) {
      const existingByHandle = subscriptionChannels.find(
        (channel) => sanitizeChannelDirectLink(channel.handle) === normalizedHandle,
      )
      if (existingByHandle) {
        openSubscriptionChannel(existingByHandle.id)
        return
      }

      const managedChannel = channels.find(
        (channel) => sanitizeChannelDirectLink(channel.directLink) === normalizedHandle,
      )
      if (managedChannel) {
        setStageView('main')
        setRetainedAllChatId(null)
        setRetainedFavoriteChatId(null)
        setRetainedGroupId(null)
        setRetainedSubscriptionChannelId(null)
        setActiveChatId(null)
        setActiveGroupId(null)
        setActiveGroupMessageId(null)
        setMessageActionMessageId(null)
        setForwardingMessageId(null)
        setForwardingGroupMessageText('')
        setGroupMessageActionAnchor(null)
        setPreviewSubscriptionChannel(buildPreviewSubscriptionChannelFromManagedChannel(managedChannel))
        setActiveSubscriptionChannelId(null)
        setActiveSubscriptionPostId(null)
        setForwardingSubscriptionPostText('')
        setSubscriptionPostActionAnchor(null)
        setTopListView('channels')
        setSearchOpen(false)
        return
      }
    }

    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedGroupId(null)
    setRetainedSubscriptionChannelId(null)
    setActiveChatId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(null)
    setPreviewSubscriptionChannel(buildPreviewSubscriptionChannel(sourceChannel, previewPost))
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
    setTopListView('channels')
    setSearchOpen(false)
  }

  function openSourceChannelFromMessage(message: Message) {
    const sourceChannel = message.sourceChannel
    if (!sourceChannel) return

    const previewPost: ChannelPost = {
      attachment: message.attachment,
      createdAt: message.createdAt,
      id: message.id,
      text: message.text,
      time: message.time,
    }

    openSourceChannel(sourceChannel, previewPost)
  }

  function subscribeToPreviewSubscriptionChannel() {
    if (!previewSubscriptionChannel) return

    const existingChannel = subscriptionChannels.find(
      (channel) =>
        channel.id === previewSubscriptionChannel.id ||
        channel.title === previewSubscriptionChannel.title,
    )

    if (existingChannel) {
      openSubscriptionChannel(existingChannel.id)
      return
    }

    setSubscriptionChannels((currentChannels) => [previewSubscriptionChannel, ...currentChannels])
    openSubscriptionChannel(previewSubscriptionChannel.id)
  }

  function openGroup(groupId: number) {
    const shouldRetainGroupInList =
      topListView === 'groups' &&
      groups.some((group) => group.id === groupId && (group.unread > 0 || group.id === retainedGroupId))

    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setActiveChatId(null)
    setPreviewSubscriptionChannel(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
    setTopListView('groups')
    setSearchOpen(false)
    setRetainedGroupId(shouldRetainGroupInList ? groupId : null)
    setActiveGroupId(groupId)
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(null)
    void syncGroupRead(groupId)
  }

  function openChat(chatId: number) {
    const shouldRetainChatInAllFilter =
      activeFilter === 'Все' &&
      availableChats.some((chat) => chat.id === chatId && (chat.unread > 0 || chat.id === retainedAllChatId))
    const shouldRetainChatInFavoritesFilter =
      activeFilter === '★' &&
      availableChats.some(
        (chat) =>
          chat.id === chatId && Boolean(chat.pinned) && (chat.unread > 0 || chat.id === retainedFavoriteChatId),
      )

    setStageView('main')
    setSettingsView('profile')
    setConfirmingLogout(false)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setPremiumGiftChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setTopListView('none')
    setRetainedAllChatId(shouldRetainChatInAllFilter ? chatId : null)
    setRetainedFavoriteChatId(shouldRetainChatInFavoritesFilter ? chatId : null)
    setRetainedSubscriptionChannelId(null)
    setRetainedGroupId(null)
    setPreviewSubscriptionChannel(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
    setBottomSection('chats')
    setActiveChatId(chatId)
    void syncDialogRead(chatId)
  }

  function createLocalDialogFromSearchResult(result: SearchResult) {
    const normalizedPhone = normalizeIdentifier(result.phone)
    const existingChat = chats.find((chat) => normalizeIdentifier(chat.phone) === normalizedPhone)
    if (existingChat) {
      return existingChat.id
    }

    const nextChatId = chats.reduce((maxId, chat) => Math.max(maxId, chat.id), 0) + 1
    setChats((currentChats) => [
      ...currentChats,
      {
        accent: result.accent,
        handle: result.handle,
        id: nextChatId,
        messages: [],
        mood: result.subtitle,
        phone: normalizedPhone || result.phone,
        status: result.subtitle,
        title: result.title,
        unread: 0,
      },
    ])

    return nextChatId
  }

  async function openSearchResult(result: SearchResult) {
    const normalizedPhone = normalizeIdentifier(result.phone)
    const existingChat = chats.find((chat) => normalizeIdentifier(chat.phone) === normalizedPhone)
    if (existingChat) {
      openChat(existingChat.id)
      return
    }

    if (backendReady && session?.sessionToken) {
      try {
        const response = await openDirectDialogRequest(session.sessionToken, {
          identifier: normalizedPhone || result.phone,
        })
        applySnapshot(response.snapshot)
        openChat(response.dialogId)
        return
      } catch (error) {
        console.error('Failed to open direct dialog from search result', error)
      }
    }

    openChat(createLocalDialogFromSearchResult(result))
  }

  async function togglePinnedChat(chatId: number) {
    const currentChat = chats.find((chat) => chat.id === chatId)
    if (!currentChat) return

    if (backendReady && session?.sessionToken) {
      try {
        const response = await setDialogFavoriteRequest(session.sessionToken, chatId, {
          pinned: !currentChat.pinned,
        })
        applySnapshot(response.snapshot)
        return
      } catch (error) {
        console.error('Failed to toggle pinned chat', error)
      }
    }

    applyLocalTogglePinnedChat(chatId)
  }

  function updateSessionProfile(patch: Partial<Session>) {
    if (!session) return

    const nextDisplayName =
      patch.displayName !== undefined
        ? sanitizePersonField(patch.displayName, displayNameFieldMaxLength)
        : session.displayName
    const nextSurname =
      patch.surname !== undefined
        ? sanitizePersonField(patch.surname, surnameFieldMaxLength)
        : session.surname ?? ''
    const nextNickname =
      patch.nickname !== undefined
        ? normalizeNickname(patch.nickname)
        : session.nickname ?? ''
    const nextStatus =
      patch.status !== undefined ? sanitizeStatusField(patch.status) : session.status ?? ''
    const nextAvatarImage =
      patch.avatarImage !== undefined ? patch.avatarImage?.trim() || undefined : session.avatarImage

    if (nextDisplayName === '') return

    const nextSession: Session = {
      ...session,
      avatarImage: nextAvatarImage,
      displayName: nextDisplayName,
      surname: nextSurname,
      nickname: nextNickname,
      status: nextStatus,
      premium: session.premium ?? true,
      premiumExpiresAt: normalizePremiumExpiry(session.premium ?? true, session.premiumExpiresAt),
    }

    syncSession(nextSession)
    scheduleSessionMutation({
      displayName: nextDisplayName,
      nickname: nextNickname,
      status: nextStatus,
      surname: nextSurname,
      ...(patch.avatarImage !== undefined ? { avatarImage: nextAvatarImage } : {}),
    })
  }

  function blockChat(chatId: number) {
    if (!session || blockedContactIds.includes(chatId)) return

    void mutateBlockedContacts([...blockedContactIds, chatId])
    setChatActionsOpen(false)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setActiveChatId(null)
    setStageView('main')
  }

  function blockThenDeleteChat(chatId: number) {
    void deleteContact(chatId)
  }

  function unblockChat(chatId: number) {
    if (!session) return

    void mutateBlockedContacts(blockedContactIds.filter((id) => id !== chatId))
    setBlockedActionChatId(null)
  }

  async function deleteChatHistory(chatId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteDialogHistoryRequest(session.sessionToken, chatId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to delete chat history', error)
        applyLocalDeleteChatHistory(chatId)
      }
    } else {
      applyLocalDeleteChatHistory(chatId)
    }

    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setMessageActionAnchor(null)
  }

  async function deleteContact(chatId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteDialogRequest(session.sessionToken, chatId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to delete contact', error)
        applyLocalDeleteContact(chatId)

        if (session && blockedContactIds.includes(chatId)) {
          syncSession({
            ...session,
            blockedContactIds: blockedContactIds.filter((id) => id !== chatId),
          })
        }
      }
    } else {
      applyLocalDeleteContact(chatId)

      if (session && blockedContactIds.includes(chatId)) {
        syncSession({
          ...session,
          blockedContactIds: blockedContactIds.filter((id) => id !== chatId),
        })
      }
    }

    clearDeletedChatLocalState(chatId)

    if (activeChatId === chatId) {
      setActiveChatId(null)
      setStageView('main')
    }

    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteMessageId(null)
  }

  async function copyMessageText(message: Pick<Message, 'attachment' | 'text'>) {
    try {
      await navigator.clipboard.writeText(formatMessagePreview(message))
      setCopyHintText('Сообщение скопировано')
    } catch {
      // Ignore clipboard failures in demo mode.
    }

    setMessageActionMessageId(null)
  }

  async function copyToClipboard(text: string, successMessage = 'Ссылка скопирована') {
    try {
      await navigator.clipboard.writeText(text)
      setCopyHintText(successMessage)
    } catch {
      // Ignore clipboard failures in demo mode.
    }
  }

  function replyToMessage(message: Message) {
    setReplyTarget({
      id: message.id,
      text: formatMessagePreview(message),
      author: message.author,
    })
    setMessageActionMessageId(null)
  }

  async function pinMessage(chatId: number, messageId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await setDialogPinnedMessageRequest(session.sessionToken, chatId, {
          messageId,
        })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to pin message', error)
        applyLocalSetPinnedMessage(chatId, messageId)
      }
    } else {
      applyLocalSetPinnedMessage(chatId, messageId)
    }

    setMessageActionMessageId(null)
  }

  async function unpinMessage(chatId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await setDialogPinnedMessageRequest(session.sessionToken, chatId, {
          messageId: null,
        })
        applySnapshot(response.snapshot)
        return
      } catch (error) {
        console.error('Failed to unpin message', error)
      }
    }

    applyLocalSetPinnedMessage(chatId)
  }

  function forwardMessageToChat(targetChatId: number, message: Message) {
    void forwardTextToChat(targetChatId, formatMessagePreview(message), {
      forwarded: true,
      forwardedAuthorName:
        message.forwardedAuthorName ??
        (message.author === 'me' ? sessionName : activeChat?.title ?? message.displayAuthor),
      sourceChannel: message.sourceChannel,
    })
    setForwardingMessageId(null)
    setMessageActionMessageId(null)
  }

  async function forwardTextToChat(
    targetChatId: number,
    text: string,
    options?: {
      forwarded?: boolean
      forwardedAuthorName?: string
      sourceChannel?: Message['sourceChannel']
    },
  ) {
    const trimmedText = text.trim()
    if (!trimmedText) return

    if (backendReady && session?.sessionToken) {
      try {
        const response = await sendDirectMessageRequest(session.sessionToken, targetChatId, {
          forwarded: options?.forwarded ?? true,
          forwardedAuthorName: options?.forwardedAuthorName,
          markAsRead: targetChatId === activeChatId,
          sourceChannel: options?.sourceChannel,
          text: trimmedText,
        })
        applySnapshot(response.snapshot)
        return
      } catch (error) {
        console.error('Failed to forward text to chat', error)
      }
    }

    applyLocalDirectMessage(targetChatId, trimmedText, {
      forwarded: options?.forwarded ?? true,
      forwardedAuthorName: options?.forwardedAuthorName,
      markAsRead: targetChatId === activeChatId,
      sourceChannel: options?.sourceChannel,
    })
  }

  async function forwardTextToGroup(
    targetGroupId: number,
    text: string,
    options?: {
      forwarded?: boolean
      forwardedAuthorName?: string
      sourceChannel?: Message['sourceChannel']
    },
  ) {
    const trimmedText = text.trim()
    if (!trimmedText) return

    if (backendReady && session?.sessionToken) {
      try {
        const response = await sendGroupMessageRequest(session.sessionToken, targetGroupId, {
          forwarded: options?.forwarded ?? true,
          forwardedAuthorName: options?.forwardedAuthorName,
          sourceChannel: options?.sourceChannel,
          text: trimmedText,
        })
        applySnapshot(response.snapshot)
        return
      } catch (error) {
        console.error('Failed to forward text to group', error)
      }
    }

    applyLocalGroupMessage(targetGroupId, trimmedText, {
      forwarded: options?.forwarded ?? true,
      forwardedAuthorName: options?.forwardedAuthorName,
      sourceChannel: options?.sourceChannel,
    })
  }

  function retryFailedDirectMessage(chatId: number, messageId: number) {
    updatePendingDirectMessage(messageId, (message) => ({
      ...message,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    }))

    setMessageActionMessageId(null)
    setMessageActionAnchor(null)
    setForwardingMessageId(null)

    if (activeChatId !== chatId) {
      setActiveChatId(chatId)
    }
  }

  function retryFailedGroupMessage(groupId: number, messageId: number) {
    updatePendingGroupMessage(messageId, (message) => ({
      ...message,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    }))

    closeGroupMessageActions()

    if (activeGroupId !== groupId) {
      setActiveGroupId(groupId)
    }
  }

  function deleteFailedDirectMessage(chatId: number, messageId: number) {
    removePendingDirectMessage(messageId)
    applyLocalDeleteMessage(chatId, messageId)

    if (replyTarget?.id === messageId) {
      setReplyTarget(null)
    }

    setMessageActionMessageId(null)
    setMessageActionAnchor(null)
    setForwardingMessageId(null)
  }

  function deleteFailedGroupMessage(groupId: number, messageId: number) {
    removePendingGroupMessage(messageId)
    applyLocalDeleteGroupMessage(groupId, messageId)
    closeGroupMessageActions()
  }

  async function deleteGroupMessage(groupId: number, messageId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteGroupMessageRequest(session.sessionToken, groupId, messageId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to delete group message', error)
        applyLocalDeleteGroupMessage(groupId, messageId)
      }
    } else {
      applyLocalDeleteGroupMessage(groupId, messageId)
    }

    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setConfirmingDeleteGroupMessageId(null)
    setGroupMessageActionAnchor(null)
  }

  async function deleteMessage(chatId: number, messageId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteDialogMessageRequest(session.sessionToken, chatId, messageId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to delete message', error)
        applyLocalDeleteMessage(chatId, messageId)
      }
    } else {
      applyLocalDeleteMessage(chatId, messageId)
    }

    if (replyTarget?.id === messageId) {
      setReplyTarget(null)
    }

    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setConfirmingDeleteMessageId(null)
    setMessageActionAnchor(null)
  }

  function prepareChannelDraft(channelNumber: number, channelId: number) {
    releaseChannelAvatarDraft(creatingChannelAvatarDraft)
    const nextDraft = makeDraftChannel(channelNumber, channelId)
    setCreatingChannelTitle(nextDraft.title)
    setCreatingChannelDirectLink(buildUniqueChannelDirectLinkFromTitle(nextDraft.title))
    setCreatingChannelDirectLinkDirty(false)
    setCreatingChannelDescription(nextDraft.description)
    setCreatingChannelAvatarTone(nextDraft.avatarTone)
    setCreatingChannelAvatarDraft(null)
  }

  function openChannelsView(nextView: ChannelsView = 'list') {
    setChannelManagementOpenId(null)
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setRetainedGroupId(null)
    setStageView('channels')
    setChannelsView(nextView)
    setTopListView('none')
    setActiveSubscriptionChannelId(null)
    setPreviewSubscriptionChannel(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setGroupParticipantsOpen(false)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setConfirmingLogout(false)
    setPremiumGiftChatId(null)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteGroupMessageId(null)
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
  }

  function openChannelsListView() {
    openChannelsView('list')
  }

  function openManagedChannelLimitError() {
    setChannelManagementOpenId(null)
    setManagedChannelLimitErrorOpen(true)
  }

  function openChannelCreateView() {
    if (channels.length >= managedChannelsPerUserLimit) {
      openManagedChannelLimitError()
      return
    }

    const nextId = channels.reduce((maxId, channel) => Math.max(maxId, channel.id), 0) + 1
    prepareChannelDraft(channels.length + 1, nextId)
    openChannelsView('create')
  }

  function openChannelDetailView(channelId: number) {
    setChannelManagementOpenId(null)
    setActiveChannelId(channelId)
    openChannelsView('detail')
  }

  function collectKnownChannelDirectLinks(excludeManagedChannelId?: number) {
    return [
      ...channels
        .filter((channel) => channel.id !== excludeManagedChannelId)
        .map((channel) => channel.directLink),
      ...subscriptionChannels.map((channel) => channel.handle),
    ]
  }

  function buildUniqueChannelDirectLinkFromTitle(title: string, excludeManagedChannelId?: number) {
    return ensureUniqueChannelDirectLink(
      buildChannelDirectLinkFromTitle(title),
      collectKnownChannelDirectLinks(excludeManagedChannelId),
      title,
    )
  }

  function buildEditableChannelDirectLink(value: string, fallbackTitle = 'Канал') {
    return sanitizeChannelDirectLink(value) || buildChannelDirectLinkFromTitle(fallbackTitle)
  }

  function resolveChannelReferenceByHandle(
    handleValue: string,
  ): NonNullable<Message['sourceChannel']> | null {
    const normalizedHandle = sanitizeChannelDirectLink(handleValue)
    if (!normalizedHandle) return null

    const existingSubscriptionChannel = subscriptionChannels.find(
      (channel) => sanitizeChannelDirectLink(channel.handle) === normalizedHandle,
    )
    if (existingSubscriptionChannel) {
      return {
        accent: existingSubscriptionChannel.accent,
        draft: existingSubscriptionChannel.draft,
        handle: existingSubscriptionChannel.handle,
        id: existingSubscriptionChannel.id,
        title: existingSubscriptionChannel.title,
        visibility: existingSubscriptionChannel.visibility,
      }
    }

    const existingManagedChannel = channels.find(
      (channel) => sanitizeChannelDirectLink(channel.directLink) === normalizedHandle,
    )
    if (existingManagedChannel) {
      return {
        accent: existingManagedChannel.avatarTone,
        draft: existingManagedChannel.status === 'draft',
        handle: existingManagedChannel.directLink,
        id: existingManagedChannel.id,
        title: existingManagedChannel.title,
        visibility: existingManagedChannel.visibility,
      }
    }

    return null
  }

  function resolveEmbeddedChannelFromMessage(
    message: Pick<Message, 'sourceChannel' | 'text'>,
  ): NonNullable<Message['sourceChannel']> | null {
    if (message.sourceChannel) return null

    const trimmedText = message.text.trim()
    if (!/^@\S+$/u.test(trimmedText)) return null

    return resolveChannelReferenceByHandle(trimmedText)
  }

  function updateChannel(channelId: number, patch: Partial<Channel>) {
    const normalizedDirectLink =
      patch.directLink !== undefined ? sanitizeChannelDirectLink(patch.directLink) : undefined
    const normalizedPatch: Partial<Channel> = {
      ...patch,
      ...(patch.directLink !== undefined
        ? { directLink: normalizedDirectLink || '@' }
        : {}),
    }

    setChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id === channelId
          ? (() => {
              if (
                normalizedPatch.avatarImage !== undefined &&
                channel.avatarImage?.startsWith('blob:') &&
                channel.avatarImage !== normalizedPatch.avatarImage
              ) {
                URL.revokeObjectURL(channel.avatarImage)
                channelAvatarObjectUrlsRef.current.delete(channel.avatarImage)
              }

              return {
                ...channel,
                ...normalizedPatch,
              }
            })()
          : channel,
      ),
    )

    const serverPatch: UpdateManagedChannelBody = {}

    if (normalizedPatch.title !== undefined) {
      serverPatch.title = normalizedPatch.title
    }

    if (normalizedDirectLink !== undefined && normalizedDirectLink !== '') {
      serverPatch.directLink = ensureUniqueChannelDirectLink(
        normalizedDirectLink,
        collectKnownChannelDirectLinks(channelId),
        normalizedPatch.title ?? channels.find((channel) => channel.id === channelId)?.title ?? 'Канал',
      )
    }

    if (normalizedPatch.description !== undefined) {
      serverPatch.description = normalizedPatch.description
    }

    if (normalizedPatch.visibility !== undefined) {
      serverPatch.visibility = normalizedPatch.visibility
    }

    if (normalizedPatch.avatarTone !== undefined) {
      serverPatch.avatarTone = normalizedPatch.avatarTone
    }

    if (normalizedPatch.avatarImage !== undefined) {
      serverPatch.avatarImage = normalizedPatch.avatarImage
    }

    if (normalizedPatch.status !== undefined) {
      serverPatch.status = normalizedPatch.status
    }

    if (Object.keys(serverPatch).length > 0) {
      scheduleManagedChannelMutation(channelId, serverPatch)
    }
  }

  function triggerChannelAvatarUpload() {
    setChannelAvatarPickerMode('device')
    setChannelAvatarPickerError('')
    channelAvatarInputRef.current?.click()
  }

  function triggerProfileAvatarUpload() {
    setProfileAvatarPickerMode('device')
    setProfileAvatarPickerError('')
    profileAvatarInputRef.current?.click()
  }

  function handleProfileAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      event.target.value = ''
      return
    }

    if (!channelAvatarUploadAcceptedMimeTypes.includes(file.type as (typeof channelAvatarUploadAcceptedMimeTypes)[number])) {
      setProfileAvatarPickerError('Поддерживаются только JPG и PNG.')
      event.target.value = ''
      return
    }

    if (file.size > channelAvatarUploadMaxSizeBytes) {
      setProfileAvatarPickerError('Файл слишком большой. Максимальный размер аватарки 1 МБ.')
      event.target.value = ''
      return
    }

    const nextAvatarImage = URL.createObjectURL(file)
    channelAvatarObjectUrlsRef.current.add(nextAvatarImage)
    setProfileAvatarPickerError('')
    setProfileAvatarPickerMode('device')
    setProfileAvatarPickerDraft((currentDraft) => {
      releaseChannelAvatarDraft(currentDraft)
      return {
        file,
        kind: 'upload',
        label: file.name,
        previewUrl: nextAvatarImage,
      }
    })

    event.target.value = ''
  }

  async function applyProfileAvatarSelection() {
    if (!session || !profileAvatarPickerDraft) return

    setProfileAvatarPickerBusy(true)
    setProfileAvatarPickerError('')

    try {
      let nextAvatarImage = profileAvatarPickerDraft.previewUrl
      let preserveCurrentDraft = profileAvatarPickerDraft.kind === 'upload'

      if (profileAvatarPickerDraft.kind === 'upload') {
        if (!profileAvatarPickerDraft.file) {
          throw new Error('Сначала выберите изображение для загрузки.')
        }

        if (backendReady && session.sessionToken) {
          const uploadedMedia = await uploadMediaFile(
            session.sessionToken,
            profileAvatarPickerDraft.file,
            'profile-avatar',
          )
          nextAvatarImage = uploadedMedia.mediaUrl
          preserveCurrentDraft = false
          releaseChannelAvatarDraft(profileAvatarPickerDraft)
        }
      }

      if (backendReady && session.sessionToken) {
        try {
          const response = await updateSessionRequest(session.sessionToken, { avatarImage: nextAvatarImage })
          applySnapshot(response.snapshot)
        } catch (error) {
          console.error('Failed to sync profile avatar mutation', error)
          syncSession({
            ...session,
            avatarImage: nextAvatarImage,
          })
        }
      } else {
        syncSession({
          ...session,
          avatarImage: nextAvatarImage,
        })
      }

      closeProfileAvatarPicker({ preserveCurrentDraft })
    } catch (error) {
      console.error('Failed to apply profile avatar selection', error)
      setProfileAvatarPickerError(
        error instanceof Error ? error.message : 'Не удалось применить аватарку профиля.',
      )
      setProfileAvatarPickerBusy(false)
    }
  }

  function handleChannelAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      event.target.value = ''
      return
    }

    if (!channelAvatarUploadAcceptedMimeTypes.includes(file.type as (typeof channelAvatarUploadAcceptedMimeTypes)[number])) {
      setChannelAvatarPickerError('Поддерживаются только JPG и PNG.')
      event.target.value = ''
      return
    }

    if (file.size > channelAvatarUploadMaxSizeBytes) {
      setChannelAvatarPickerError('Файл слишком большой. Максимальный размер аватарки 1 МБ.')
      event.target.value = ''
      return
    }

    const nextAvatarImage = URL.createObjectURL(file)
    channelAvatarObjectUrlsRef.current.add(nextAvatarImage)
    setChannelAvatarPickerError('')
    setChannelAvatarPickerMode('device')
    setChannelAvatarPickerDraft((currentDraft) => {
      const shouldPreserveSavedCreateDraft =
        channelAvatarPickerTarget?.scope === 'create' &&
        currentDraft !== null &&
        currentDraft === creatingChannelAvatarDraft

      if (!shouldPreserveSavedCreateDraft) {
        releaseChannelAvatarDraft(currentDraft)
      }

      return {
        file,
        kind: 'upload',
        label: file.name,
        previewUrl: nextAvatarImage,
      }
    })

    event.target.value = ''
  }

  async function applyChannelAvatarSelection() {
    if (!channelAvatarPickerTarget || !channelAvatarPickerDraft) return

    setChannelAvatarPickerBusy(true)
    setChannelAvatarPickerError('')

    try {
      let nextDraft = channelAvatarPickerDraft

      if (channelAvatarPickerDraft.kind === 'upload') {
        if (!channelAvatarPickerDraft.file) {
          throw new Error('Сначала выберите изображение для загрузки.')
        }

        if (backendReady && session?.sessionToken) {
          const uploadedMedia = await uploadMediaFile(
            session.sessionToken,
            channelAvatarPickerDraft.file,
            'channel-avatar',
          )

          releaseChannelAvatarDraft(channelAvatarPickerDraft)
          nextDraft = {
            kind: 'uploaded',
            label: channelAvatarPickerDraft.label,
            previewUrl: uploadedMedia.mediaUrl,
          }
        } else {
          nextDraft = {
            kind: 'uploaded',
            label: channelAvatarPickerDraft.label,
            previewUrl: channelAvatarPickerDraft.previewUrl,
          }
        }
      }

      if (channelAvatarPickerTarget.scope === 'create') {
        if (creatingChannelAvatarDraft && creatingChannelAvatarDraft !== channelAvatarPickerDraft) {
          releaseChannelAvatarDraft(creatingChannelAvatarDraft)
        }

        setCreatingChannelAvatarDraft(nextDraft)
      } else {
        updateChannel(channelAvatarPickerTarget.channelId, { avatarImage: nextDraft.previewUrl })
      }

      closeChannelAvatarPicker({ preserveCurrentDraft: true })
    } catch (error) {
      console.error('Failed to apply channel avatar selection', error)
      setChannelAvatarPickerError(
        error instanceof Error ? error.message : 'Не удалось применить аватарку канала.',
      )
      setChannelAvatarPickerBusy(false)
    }
  }

  async function createChannel() {
    if (channels.length >= managedChannelsPerUserLimit) {
      openManagedChannelLimitError()
      return
    }

    if (backendReady && session?.sessionToken) {
      try {
        const response = await createManagedChannelRequest(session.sessionToken, {
          avatarImage: creatingChannelAvatarDraft?.previewUrl,
          avatarTone: creatingChannelAvatarTone,
          description: creatingChannelDescription,
          directLink: ensureUniqueChannelDirectLink(
            sanitizeChannelDirectLink(creatingChannelDirectLink) ||
              buildChannelDirectLinkFromTitle(creatingChannelTitle),
            collectKnownChannelDirectLinks(),
            creatingChannelTitle,
          ),
          title: creatingChannelTitle,
          visibility: 'private',
        })
        applySnapshot(response.snapshot)
        setCreatingChannelAvatarDraft(null)
        setActiveChannelId(response.channelId)
        openChannelsView('detail')
        return
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === `Один пользователь может управлять только ${managedChannelsPerUserLimit} каналами.`
        ) {
          openManagedChannelLimitError()
          return
        }

        console.error('Failed to create managed channel', error)
      }
    }

    if (channels.length >= managedChannelsPerUserLimit) {
      openManagedChannelLimitError()
      return
    }

    const nextId = channels.reduce((maxId, channel) => Math.max(maxId, channel.id), 0) + 1
    const title =
      sanitizeChannelTitle(creatingChannelTitle) || `Новый канал ${channels.length + 1}`
    const directLink = ensureUniqueChannelDirectLink(
      sanitizeChannelDirectLink(creatingChannelDirectLink) || buildChannelDirectLinkFromTitle(title),
      collectKnownChannelDirectLinks(),
      title,
    )
    const description =
      sanitizeChannelDescription(creatingChannelDescription) ||
      'Описание канала пока не заполнено. Здесь можно подготовить текст до публикации.'
    const nextChannel: Channel = {
      avatarImage: creatingChannelAvatarDraft?.previewUrl,
      avatarTone: creatingChannelAvatarTone,
      description,
      directLink,
      id: nextId,
      status: 'draft',
      title,
      visibility: 'private',
    }

    setChannels((currentChannels) => [...currentChannels, nextChannel])
    setCreatingChannelAvatarDraft(null)
    setActiveChannelId(nextId)
    openChannelsView('detail')
  }

  function closeChannelTransfer() {
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setChannelTransferSearch('')
  }

  function closeSubscriptionPostActions() {
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
  }

  function closeGroupMessageActions() {
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setConfirmingDeleteGroupMessageId(null)
    setGroupMessageActionAnchor(null)
  }

  async function deleteChannel(channelId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteManagedChannelRequest(session.sessionToken, channelId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to delete channel', error)
        applyLocalDeleteChannel(channelId)
      }
    } else {
      applyLocalDeleteChannel(channelId)
    }

    setConfirmingDeleteChannelId(null)
    setChannelsView('list')
    if (transferringChannelId === channelId) {
      closeChannelTransfer()
    }
  }

  function startChannelTransfer(channelId: number) {
    setChannelManagementOpenId(null)
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(channelId)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setChannelTransferSearch('')
  }

  function openChannelTitleEditor(channel: Channel) {
    setEditingChannelTitleId(channel.id)
    setEditingChannelTitleValue(channel.title)
  }

  function submitChannelTitleEdit() {
    if (editingChannelTitleId === null) return

    const nextTitle = sanitizeChannelTitle(editingChannelTitleValue)
    if (!nextTitle) return

    updateChannel(editingChannelTitleId, { title: nextTitle })
    setEditingChannelTitleId(null)
    setEditingChannelTitleValue('')
  }

  function selectChannelTransferTarget(chatId: number) {
    setChannelTransferTargetChatId(chatId)
    setChannelTransferCode('')
    setChannelTransferError('')
  }

  function submitChannelTransfer() {
    if (transferringChannelId === null || channelTransferTarget === null) return

    if (channelTransferCode.trim().length < 4) {
      setChannelTransferError('Введи код из SMS для подтверждения передачи канала.')
      return
    }

    void deleteChannel(transferringChannelId)
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          authError={authError}
          authExistingAccount={authExistingAccount}
          authStep={authStep}
          displayName={displayName}
          displayNameMaxLength={displayNameFieldMaxLength}
          identifier={identifier}
          smsCode={smsCode}
          onDisplayNameChange={(value) =>
            setDisplayName(sanitizePersonField(value, displayNameFieldMaxLength))
          }
          onIdentifierChange={(value) => {
            setIdentifier(value)
            setAuthExistingAccount(null)
          }}
          onSmsCodeChange={(value) => setSmsCode(value.replace(/[^\d]/g, ''))}
          onSubmit={() => {
            if (authStep === 'phone') {
              void submitPhoneStep()
              return
            }

            if (authStep === 'code') {
              void submitCodeStep()
              return
            }

            void submitProfileStep()
          }}
        />
        {cookieConsentBanner}
      </>
    )
  }

  if (confirmingLogout) {
    return (
      <>
        <ConfirmLogoutScreen
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={logout}
        />
        {cookieConsentBanner}
      </>
    )
  }

  const shellClassName = [
    'shell',
    isPremiumView
      ? 'shell-settings shell-premium'
      : isSettingsView || isChannelsView
        ? 'shell-settings'
        : '',
    !isSettingsView && !isPremiumView && !isChannelsView && !isAnyRoomOpen ? 'shell-main-list' : '',
    !isSettingsView && !isPremiumView && !isChannelsView && isAnyRoomOpen ? 'shell-main-room' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const subscriptionPostActions = activeSubscriptionPost ? (
    <>
      <button
        type="button"
        className="room-confirm-scrim message-menu-scrim"
        aria-label="Закрыть действия с постом канала"
        onClick={closeSubscriptionPostActions}
      />
      {subscriptionPostActionAnchor && !forwardingSubscriptionPostText ? (
        <SelectedBubbleOverlay
          anchor={subscriptionPostActionAnchor}
          channelTitle={currentSubscriptionChannel?.title ?? ''}
          kind="channel"
          post={activeSubscriptionPost}
          draft={Boolean(currentSubscriptionChannel?.draft)}
        />
      ) : null}
      {currentSubscriptionChannel?.visibility === 'closed' ? (
        subscriptionPostActionAnchor ? (
          <div
            ref={subscriptionPostMenuRef}
            className="message-menu message-menu-note"
            style={subscriptionPostMenuStyle}
          >
            <p className="room-confirm-copy">
              Канал имеет тип "закрытый", копирование и пересылка сообщений запрещена
            </p>
          </div>
        ) : null
      ) : forwardingSubscriptionPostText ? (
        <div className="room-confirm room-forward">
          <p className="room-confirm-copy">Кому переслать сообщение?</p>
          <div className="room-forward-list">
            {availableChats.length > 0 ? (
              <div className="room-forward-section">
                <p className="room-forward-section-title">Личные чаты</p>
                {availableChats.map((chat) => (
                  <button
                    key={`chat-${chat.id}`}
                    type="button"
                    className="room-forward-item"
                    onClick={() => {
                      void forwardTextToChat(chat.id, forwardingSubscriptionPostText, {
                        forwarded: true,
                        sourceChannel: currentSubscriptionChannel
                          ? {
                              accent: currentSubscriptionChannel.accent,
                              draft: currentSubscriptionChannel.draft,
                              handle: currentSubscriptionChannel.handle,
                              id: currentSubscriptionChannel.id,
                              title: currentSubscriptionChannel.title,
                              visibility: currentSubscriptionChannel.visibility,
                            }
                          : undefined,
                      })
                      closeSubscriptionPostActions()
                    }}
                  >
                    <span className="avatar" style={{ backgroundColor: chat.accent }}>
                      {chat.title.slice(0, 1)}
                    </span>
                    <span>{chat.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {orderedGroups.length > 0 ? (
              <div className="room-forward-section">
                <p className="room-forward-section-title">Группы</p>
                {orderedGroups.map((group) => (
                  <button
                    key={`group-${group.id}`}
                    type="button"
                    className="room-forward-item"
                    onClick={() => {
                      void forwardTextToGroup(group.id, forwardingSubscriptionPostText, {
                        forwarded: true,
                        sourceChannel: currentSubscriptionChannel
                          ? {
                              accent: currentSubscriptionChannel.accent,
                              draft: currentSubscriptionChannel.draft,
                              handle: currentSubscriptionChannel.handle,
                              id: currentSubscriptionChannel.id,
                              title: currentSubscriptionChannel.title,
                              visibility: currentSubscriptionChannel.visibility,
                            }
                          : undefined,
                      })
                      closeSubscriptionPostActions()
                    }}
                  >
                    <span className="avatar" style={{ backgroundColor: group.accent }}>
                      {group.title.slice(0, 1)}
                    </span>
                    <span>{group.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="room-confirm-button"
            onClick={() => setForwardingSubscriptionPostText('')}
          >
            Назад
          </button>
        </div>
      ) : subscriptionPostActionAnchor ? (
        <div
          ref={subscriptionPostMenuRef}
          className="message-menu"
          style={subscriptionPostMenuStyle}
        >
          <button
            type="button"
            className="message-menu-item"
            onClick={() => setForwardingSubscriptionPostText(formatMessagePreview(activeSubscriptionPost))}
          >
            Переслать
          </button>
          <button
            type="button"
            className="message-menu-item"
            onClick={() => {
              copyToClipboard(formatMessagePreview(activeSubscriptionPost), 'Сообщение скопировано')
              closeSubscriptionPostActions()
            }}
          >
            Скопировать
          </button>
        </div>
      ) : null}
    </>
  ) : null

  const groupMessageActions = activeGroupMessage ? (
    <>
      <button
        type="button"
        className="room-confirm-scrim message-menu-scrim"
        aria-label="Закрыть действия с сообщением группы"
        onClick={closeGroupMessageActions}
      />
      {groupMessageActionAnchor && !forwardingGroupMessageText ? (
        <SelectedBubbleOverlay
          anchor={groupMessageActionAnchor}
          deliveryIssue={activeGroupMessageDeliveryIssue ?? undefined}
          kind="group"
          linkedChannel={activeGroupMessage ? resolveEmbeddedChannelFromMessage(activeGroupMessage) : null}
          message={activeGroupMessage}
          mine={activeGroupMessage.author === 'me'}
          participant={activeGroupMessageParticipant}
        />
      ) : null}
      {forwardingGroupMessageText ? (
        <div className="room-confirm room-forward">
          <p className="room-confirm-copy">Кому переслать сообщение?</p>
          <div className="room-forward-list">
            {availableChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="room-forward-item"
                onClick={() => {
                  void forwardTextToChat(chat.id, forwardingGroupMessageText, {
                    forwarded: true,
                    forwardedAuthorName:
                      activeGroupMessage?.forwardedAuthorName ??
                      (activeGroupMessage?.author === 'me'
                        ? sessionName
                        : activeGroupMessageParticipant?.title ?? activeGroupMessage?.displayAuthor),
                    sourceChannel: activeGroupMessage?.sourceChannel,
                  })
                  closeGroupMessageActions()
                }}
              >
                <span className="avatar" style={{ backgroundColor: chat.accent }}>
                  {chat.title.slice(0, 1)}
                </span>
                <span>{chat.title}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="room-confirm-button"
            onClick={() => setForwardingGroupMessageText('')}
          >
            Назад
          </button>
        </div>
      ) : groupMessageActionAnchor ? (
        <div
          ref={groupMessageMenuRef}
          className="message-menu"
          style={groupMessageMenuStyle}
        >
          {activeGroupMessageDeliveryIssue === 'failed' ? (
            <>
              <button
                type="button"
                className="message-menu-item"
                onClick={() => retryFailedGroupMessage(activeGroup!.id, activeGroupMessage.id)}
              >
                Отправить повторно
              </button>
              <button
                type="button"
                className="message-menu-item danger"
                onClick={() => deleteFailedGroupMessage(activeGroup!.id, activeGroupMessage.id)}
              >
                Удалить
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="message-menu-item"
                onClick={() => setForwardingGroupMessageText(formatMessagePreview(activeGroupMessage))}
              >
                Переслать
              </button>
              <button
                type="button"
                className="message-menu-item"
                onClick={() => {
                  copyToClipboard(formatMessagePreview(activeGroupMessage), 'Сообщение скопировано')
                  closeGroupMessageActions()
                }}
              >
                Скопировать
              </button>
              {activeGroupMessage.author === 'me' ? (
                <button
                  type="button"
                  className="message-menu-item danger"
                  onClick={() => {
                    setConfirmingDeleteGroupMessageId(activeGroupMessage.id)
                    setActiveGroupMessageId(null)
                    setGroupMessageActionAnchor(null)
                  }}
                >
                  Удалить
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  ) : null

  const groupParticipantsDialog =
    activeGroup && groupParticipantsOpen ? (
      <>
        <button
          type="button"
          className="room-confirm-scrim"
          aria-label="Закрыть список участников"
          onClick={() => setGroupParticipantsOpen(false)}
        />
        <div className="room-confirm room-participants">
          <p className="room-confirm-copy">{`Участники группы ${activeGroup.title}`}</p>
          <div className="room-forward-list room-participants-list">
            {activeGroup.participants.map((participant) => (
              <div key={participant.id} className="room-forward-item room-participant-item">
                <span className="chat-avatar-stack room-participant-avatar-stack">
                  <span className="avatar" style={{ backgroundColor: participant.accent }}>
                    {participant.title.slice(0, 1)}
                  </span>
                  {participant.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                </span>
                <span className="room-participant-copy">
                  <span className="room-participant-name-row">
                    <strong>{participant.title}</strong>
                    {participant.premium ? (
                      <span className="premium-crown chat-crown" aria-label="Премиум">
                        <img src="/icons/crown64.png" alt="" />
                      </span>
                    ) : null}
                  </span>
                  <span className="room-participant-status">{participant.status}</span>
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="room-confirm-button"
            onClick={() => setGroupParticipantsOpen(false)}
          >
            Закрыть
          </button>
        </div>
      </>
  ) : null

  const confirmingDeleteGroupMessageDialog =
    activeGroup && confirmingDeleteGroupMessageId !== null ? (
      <>
        <button
          type="button"
          className="room-confirm-scrim"
          aria-label="Закрыть подтверждение удаления сообщения группы"
          onClick={() => setConfirmingDeleteGroupMessageId(null)}
        />
        <div className="room-confirm room-confirm-compact">
          <p className="room-confirm-copy">Удалить своё сообщение в группе?</p>
          <div className="room-confirm-actions room-confirm-actions-dual">
            <button
              type="button"
              className="room-confirm-button room-confirm-danger"
              onClick={() => {
                void deleteGroupMessage(activeGroup.id, confirmingDeleteGroupMessageId)
              }}
            >
              Удалить
            </button>
            <button
              type="button"
              className="room-confirm-button"
              onClick={() => setConfirmingDeleteGroupMessageId(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      </>
    ) : null

  return (
    <>
      <main className={shellClassName}>
      {isRailVisible ? (
        <aside className="rail">
        <div className="account-header">
            <div className="account-headline">
              <div className="account-name">
                <span className="channel-avatar channel-avatar-large account-avatar" style={{ backgroundColor: '#8c5738' }}>
                  {session?.avatarImage ? (
                    <img src={session.avatarImage} alt="" className="channel-avatar-image" />
                  ) : (
                    sessionAvatarLabel
                  )}
                </span>
              <h2 ref={accountNameRef}>{sessionName}</h2>
            </div>
            <div className="quiet-toggle-stack">
              {sessionHasPremium ? (
                <span className="premium-crown quiet-toggle-crown" aria-label="Премиум">
                  <img src="/icons/crown64.png" alt="" />
                </span>
              ) : null}
              <button
                className={quietMode ? 'ghost-button quiet-toggle active' : 'ghost-button quiet-toggle'}
                type="button"
                onClick={() => setQuietMode((current) => !current)}
                aria-label="Тихо"
                title="Тихо"
              >
                <img src={quietMode ? '/icons/quiet.png' : '/icons/quiet100.png'} alt="" />
              </button>
            </div>
          </div>
          {session.status?.trim() ? (
            <div className="account-status-row">
              <p ref={accountStatusRef}>{session.status}</p>
            </div>
          ) : null}
        </div>

        <div className="filters" aria-label="Фильтры чатов">
          {quickFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={
                topListView === 'none' &&
                (filter === 'Все' ? activeFilter === 'Все' : filter === activeFilter)
                  ? 'filter active'
                  : 'filter'
              }
              onClick={() => {
                if (filter === 'Все') {
                  setRetainedAllChatId(null)
                  setRetainedFavoriteChatId(null)
                  setRetainedSubscriptionChannelId(null)
                  setRetainedGroupId(null)
                  setActiveFilter('Все')
                  setSearchOpen(false)
                  setTopListView('none')
                  setActiveSubscriptionChannelId(null)
                  setActiveGroupId(null)
                  setActiveGroupMessageId(null)
                  setForwardingGroupMessageText('')
                  setGroupMessageActionAnchor(null)
                  return
                }

                setRetainedAllChatId(null)
                setRetainedFavoriteChatId(null)
                setRetainedSubscriptionChannelId(null)
                setRetainedGroupId(null)
                setActiveFilter(filter)
                setSearchOpen(false)
                setTopListView('none')
                setActiveSubscriptionChannelId(null)
                setActiveGroupId(null)
                setActiveGroupMessageId(null)
                setForwardingGroupMessageText('')
                setGroupMessageActionAnchor(null)
              }}
            >
              {filter === '★' ? (
                <>
                  <img className="filter-icon" src="/icons/star100.png" alt="Избранное" />
                  {!quietMode && totalFavoriteUnreadCount > 0 ? (
                    <span
                      className={
                        totalFavoriteUnreadCount > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'
                      }
                    >
                      {formatUnreadBadgeCount(totalFavoriteUnreadCount)}
                    </span>
                  ) : null}
                </>
              ) : (
                <span>Все</span>
              )}
              {filter === 'Все' && !quietMode && totalUnreadCount > 0 ? (
                <span className={totalUnreadCount > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'}>
                  {formatUnreadBadgeCount(totalUnreadCount)}
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className={isChannelsTopListOpen ? 'filter active' : 'filter'}
            onClick={() => {
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setTopListView('channels')
              setActiveChatId(null)
              setActiveSubscriptionChannelId(null)
              setActiveSubscriptionPostId(null)
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
              setSearchOpen(false)
              setQuery('')
            }}
            aria-label="Каналы"
            title="Каналы"
          >
            <img className="filter-icon" src="/icons/news100.svg" alt="Каналы" />
            {!quietMode && totalChannelNotifications > 0 ? (
              <span
                className={
                  totalChannelNotifications > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'
                }
              >
                {formatUnreadBadgeCount(totalChannelNotifications)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={isGroupsTopListOpen ? 'filter active' : 'filter'}
            onClick={() => {
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setTopListView('groups')
              setActiveChatId(null)
              setActiveSubscriptionChannelId(null)
              setActiveSubscriptionPostId(null)
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
              setSearchOpen(false)
              setQuery('')
            }}
            aria-label="Группы"
            title="Группы"
          >
            <img className="filter-icon" src="/icons/group100.png" alt="Группы" />
            {!quietMode && totalGroupNotifications > 0 ? (
              <span className={totalGroupNotifications > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'}>
                {formatUnreadBadgeCount(totalGroupNotifications)}
              </span>
            ) : null}
          </button>
        </div>

        {searchOpen && topListView === 'none' ? (
          <label className="search">
            <span className="search-label">Поиск</span>
            <input
              type="search"
              placeholder="Имя или @handle"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}

        {searchOpen && topListView === 'none' ? (
          <div className="chat-list search-results">
            {myContactsResults.length > 0 ? (
              <section className="search-group">
                <p className="search-group-title">Мои контакты</p>
                {myContactsResults.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={chat.id === activeChat?.id ? 'chat-card active' : 'chat-card'}
                    onClick={() => openChat(chat.id)}
                  >
                    <span className="chat-avatar-stack">
                      <span className="avatar" style={{ backgroundColor: chat.accent }}>
                        {chat.title.slice(0, 1)}
                      </span>
                      {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                    </span>
                    <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong className="chat-name-text">{chat.title}</strong>
                        {chat.premium ? (
                          <span className="premium-crown chat-crown" aria-label="Премиум">
                            <img src="/icons/crown64.png" alt="" />
                          </span>
                        ) : null}
                        {chat.pinned ? (
                          <span className="chat-star">
                            <img src="/icons/star100.png" alt="Избранный контакт" />
                          </span>
                        ) : null}
                      </span>
                      <span>{chat.messages.at(-1)?.time}</span>
                    </span>
                    <span className="chat-handle">
                      {searchShowsPhone ? chat.phone : chat.handle}
                    </span>
                  </span>
                  {!quietMode && chat.unread > 0 ? (
                    <span className={chat.unread > 9 ? 'badge badge-wide' : 'badge'}>
                      {formatUnreadBadgeCount(chat.unread)}
                    </span>
                  ) : null}
                </button>
                ))}
              </section>
            ) : null}

            <section className="search-group">
              <p className="search-group-title">Результаты поиска</p>
              {searchResults.map((result) => (
                <button
                  key={`${result.phone}:${result.handle}`}
                  type="button"
                  className="chat-card search-card"
                  onClick={() => void openSearchResult(result)}
                >
                  <span className="avatar" style={{ backgroundColor: result.accent }}>
                    {result.title.slice(0, 1)}
                  </span>
                  <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong>{result.title}</strong>
                      </span>
                    </span>
                    <span className="chat-handle">
                      {searchShowsPhone ? result.phone : result.handle}
                    </span>
                  </span>
                </button>
              ))}
              {query.trim() !== '' && myContactsResults.length === 0 && searchResults.length === 0 ? (
                <article className="chat-card search-card">
                  <span className="chat-copy">
                    <strong>Ничего не найдено</strong>
                    <span className="chat-handle">Попробуйте номер или @handle зарегистрированного аккаунта</span>
                  </span>
                </article>
              ) : null}
            </section>
          </div>
        ) : isChannelsTopListOpen ? (
          <div className="chat-list">
            {orderedSubscriptionChannels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                className={[
                  'chat-card',
                  'chat-card-compact',
                  channel.id === activeSubscriptionChannelId ? 'active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => openSubscriptionChannel(channel.id)}
              >
                <span className="avatar" style={{ backgroundColor: channel.accent }}>
                  {channel.title.slice(0, 1)}
                </span>
                <span className="chat-copy">
                  <span className="chat-topline">
                    <span className="chat-name-row">
                      <strong className="chat-name-text">{channel.title}</strong>
                      <span className="chat-star">
                        <img src="/icons/news100.svg" alt="Канал" />
                      </span>
                    </span>
                    {!quietMode && channel.unread > 0 ? (
                      <span
                        className={
                          channel.unread > 9
                            ? 'chat-topline-badge chat-topline-badge-wide'
                            : 'chat-topline-badge'
                        }
                      >
                        {formatUnreadBadgeCount(channel.unread)}
                      </span>
                    ) : (
                      <span className="chat-topline-meta">{formatSubscriptionChannelTime(channel)}</span>
                    )}
                  </span>
                  <span className="chat-preview chat-status-preview">
                    {formatSubscriptionChannelReaders(channel)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : isGroupsTopListOpen ? (
          <div className="chat-list">
            {orderedGroups.map((group) => (
              (() => {
                const groupLatestAuthor = formatGroupLatestAuthor(group)
                const groupMeta = groupLatestAuthor
                  ? `${group.members} участников · ${groupLatestAuthor}`
                  : `${group.members} участников`

                return (
                  <button
                    key={group.id}
                    type="button"
                    className={group.id === activeGroupId ? 'chat-card active' : 'chat-card'}
                    onClick={() => openGroup(group.id)}
                  >
                    <span className="avatar" style={{ backgroundColor: group.accent }}>
                      {group.title.slice(0, 1)}
                    </span>
                    <span className="chat-copy">
                      <span className="chat-topline">
                        <span className="chat-name-row">
                          <strong className="chat-name-text">{group.title}</strong>
                          <span className="chat-star">
                            <img src="/icons/group100.png" alt="Группа" />
                          </span>
                        </span>
                        {!quietMode && group.unread > 0 ? (
                          <span
                            className={
                              group.unread > 9
                                ? 'chat-topline-badge chat-topline-badge-wide'
                                : 'chat-topline-badge'
                            }
                          >
                            {formatUnreadBadgeCount(group.unread)}
                          </span>
                        ) : (
                          <span className="chat-topline-meta">{formatGroupTime(group)}</span>
                        )}
                      </span>
                      <span className="chat-handle">{groupMeta}</span>
                      <span className="chat-preview">{formatGroupPreview(group)}</span>
                    </span>
                  </button>
                )
              })()
            ))}
          </div>
        ) : (
          <div className="chat-list">
            {orderedVisibleChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={[
                  'chat-card',
                  bottomSection === 'contacts' ? '' : 'chat-card-compact',
                  chat.id === activeChat?.id ? 'active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => openChat(chat.id)}
              >
                <span className="chat-avatar-stack">
                  <span className="avatar" style={{ backgroundColor: chat.accent }}>
                    {chat.title.slice(0, 1)}
                  </span>
                  {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                </span>
                <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong className="chat-name-text">{chat.title}</strong>
                        {chat.premium ? (
                          <span className="premium-crown chat-crown" aria-label="Премиум">
                            <img src="/icons/crown64.png" alt="" />
                        </span>
                      ) : null}
                      {chat.pinned ? (
                        <span className="chat-star">
                          <img src="/icons/star100.png" alt="Избранный контакт" />
                        </span>
                        ) : null}
                    </span>
                    {bottomSection === 'contacts' ? null : chat.typing && !quietMode ? (
                      <span className="chat-topline-typing" aria-label={`${chat.title} печатает`}>
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    ) : !quietMode && chat.unread > 0 ? (
                      <span
                        className={
                          chat.unread > 9
                            ? 'chat-topline-badge chat-topline-badge-wide'
                            : 'chat-topline-badge'
                        }
                      >
                        {formatUnreadBadgeCount(chat.unread)}
                      </span>
                    ) : (
                      <span className="chat-topline-meta">{chat.messages.at(-1)?.time}</span>
                    )}
                  </span>
                  {bottomSection === 'contacts' ? (
                    <span className="chat-preview chat-status-preview">{formatContactStatus(chat)}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="bottom-nav" aria-label="Основная навигация">
          <button
            type="button"
            className={!searchOpen && bottomSection === 'chats' ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              if (isChannelsView) {
                setStageView('main')
              }
              setTopListView('none')
              setPreviewSubscriptionChannel(null)
              setActiveSubscriptionChannelId(null)
              setBottomSection('chats')
              setSearchOpen(false)
              setQuery('')
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setActiveFilter('Все')
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Чаты"
          >
            <img src="/icons/chat100.png" alt="" />
          </button>
          <button
            type="button"
            className={!searchOpen && bottomSection === 'contacts' ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              if (isChannelsView) {
                setStageView('main')
              }
              setTopListView('none')
              setPreviewSubscriptionChannel(null)
              setActiveSubscriptionChannelId(null)
              setBottomSection('contacts')
              setSearchOpen(false)
              setQuery('')
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setActiveFilter('Все')
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Контакты"
          >
            <img src="/icons/contacts100.svg" alt="" />
          </button>
          <button
            type="button"
            className={searchOpen ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              if (isChannelsView) {
                setStageView('main')
              }
              setTopListView('none')
              setActiveSubscriptionChannelId(null)
              setSearchOpen(true)
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setActiveFilter('Поиск')
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Поиск"
          >
            <img src="/icons/search100.svg" alt="" />
          </button>
          {sessionHasPremium ? (
            <button
              type="button"
              className={isChannelsView ? 'soft-button icon-button icon-button-channel active' : 'soft-button icon-button icon-button-channel'}
              onClick={() => openChannelsListView()}
              aria-label="Каналы"
            >
              <img src="/icons/news_settings.png" alt="" />
            </button>
          ) : (
            <button
              type="button"
              className="soft-button icon-button"
              onClick={() => {
                setRetainedAllChatId(null)
                setRetainedFavoriteChatId(null)
                setRetainedSubscriptionChannelId(null)
                setRetainedGroupId(null)
                setStageView('premium')
                setConfirmingLogout(false)
                setPremiumGiftChatId(null)
                setActiveGroupId(null)
                setActiveGroupMessageId(null)
                setForwardingGroupMessageText('')
                setGroupMessageActionAnchor(null)
              }}
              aria-label="Премиум"
            >
              <img src="/icons/crown100.png" alt="" />
            </button>
          )}
          <button
            type="button"
            className={isSettingsView ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setStageView('settings')
              setSettingsView('profile')
              setConfirmingLogout(false)
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Настройки"
          >
            <img src="/icons/settings50.svg" alt="" />
          </button>
        </div>
        </aside>
      ) : null}

      <section
        className={
          isPremiumView
            ? 'stage settings-open premium-open'
            : isSettingsView
              ? 'stage settings-open'
            : isChannelsView
              ? 'stage channels-open'
            : isChatOpen || isSubscriptionChannelOpen || isGroupOpen
              ? 'stage chat-open'
              : 'stage'
        }
      >
        {!isSettingsView &&
        !isPremiumView &&
        !isChannelsView &&
        !activeChat &&
        !currentSubscriptionChannel &&
        !activeGroup ? (
          <div className="hero-panel hero-panel-idle">
            <div>
              <p className="eyebrow">Личный канал</p>
              <h2>Мессенджер для тихих разговоров и маленьких секретов</h2>
            </div>
          </div>
        ) : null}

        {isSettingsView ? (
          <section className="settings-view">
            <div className="settings-panel">
              <div className={`settings-heading${settingsView === 'profile' ? ' settings-heading-profile' : ''}`}>
                {settingsView === 'profile' ? (
                  <>
                    <p className="eyebrow">Настройки</p>
                    <div className="settings-profile-header">
                      <div className="settings-profile-avatar-stack">
                        <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: '#8c5738' }}>
                          {session.avatarImage ? (
                            <img src={session.avatarImage} alt="" className="channel-avatar-image" />
                          ) : (
                            sessionAvatarLabel
                          )}
                        </span>
                        <button
                          type="button"
                          className="soft-button settings-profile-avatar-button"
                          onClick={openProfileAvatarPicker}
                        >
                          Сменить
                        </button>
                      </div>
                      <div className="settings-profile-copy">
                        <h2 ref={settingsProfileNameRef}>{formatSessionName(session)}</h2>
                        <p className="settings-identity">{session.identifier}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="eyebrow">Настройки</p>
                    <h2>{formatSessionName(session)}</h2>
                    <p className="settings-identity">{session.identifier}</p>
                  </>
                )}
              </div>

              {settingsView === 'profile' ? (
                <div className="settings-stack">
                  <article className="settings-item">
                    <span className="settings-label">Имя</span>
                    <input
                    type="text"
                    className="settings-input"
                    value={session.displayName}
                    maxLength={displayNameFieldMaxLength}
                    onChange={(event) =>
                      updateSessionProfile({ displayName: event.target.value })
                    }
                    />
                  </article>
                  <article className="settings-item">
                    <span className="settings-label">Фамилия</span>
                    <input
                    type="text"
                    className="settings-input"
                    value={session.surname ?? ''}
                    maxLength={surnameFieldMaxLength}
                    onChange={(event) =>
                      updateSessionProfile({ surname: event.target.value })
                    }
                    />
                  </article>
                  <article className="settings-item">
                    <span className="settings-label">Статус</span>
                    <input
                      type="text"
                      className="settings-input"
                      value={session.status ?? ''}
                      placeholder="Статус не задан"
                      maxLength={statusFieldMaxLength}
                      onChange={(event) =>
                        updateSessionProfile({ status: event.target.value })
                      }
                    />
                  </article>
                  <article className="settings-item">
                    <span className="settings-label">Никнейм</span>
                    <label className="settings-handle">
                      <span>@</span>
                      <input
                        type="text"
                        className="settings-input handle-input"
                        value={session.nickname ?? ''}
                        placeholder="nickname"
                        maxLength={nicknameFieldMaxLength}
                        onChange={(event) =>
                          updateSessionProfile({
                            nickname: normalizeNickname(event.target.value),
                          })
                        }
                      />
                    </label>
                  </article>
                </div>
              ) : settingsView === 'management' ? (
                <div className="settings-stack">
                  <article className="settings-item">
                    <span className="settings-label">Аккаунт</span>
                    <p className="settings-text">
                      Управление номером, учётной записью и запросами на удаление данных.
                    </p>
                  </article>
                  <button
                    type="button"
                    className="settings-action-card"
                    onClick={() => setSettingsView('blocked')}
                  >
                    Заблокированные контакты
                  </button>
                  <button type="button" className="settings-action-card">
                    Сменить номер телефона
                  </button>
                  <a
                    className="settings-action-card settings-action-link"
                    href="/user-agreement.html"
                  >
                    Пользовательское соглашение
                  </a>
                  <a
                    className="settings-action-card settings-action-link"
                    href="/privacy-policy.html"
                  >
                    Политика в отношении обработки персональных данных
                  </a>
                  <article className="settings-item settings-consent-card">
                    <span className="settings-label">Cookie и аналитика</span>
                    <strong className="settings-consent-status">{cookieConsentStatus}</strong>
                    <p className="settings-text">
                      Необходимые cookie нужны для входа, защиты сессии и сохранения настроек.
                      Аналитические cookie помогают улучшать Tinychok и включаются только после
                      вашего выбора. Подробнее в{' '}
                      <a className="settings-inline-link" href="/privacy-policy.html">
                        Политике обработки персональных данных
                      </a>
                      .
                    </p>
                    <button
                      type="button"
                      className="soft-button settings-consent-toggle"
                      onClick={() => updateCookieConsent(nextCookieConsentChoice)}
                    >
                      {cookieConsentToggleLabel}
                    </button>
                  </article>
                  <button type="button" className="settings-action-card danger">
                    Удалить аккаунт
                  </button>
                  <button type="button" className="settings-action-card danger">
                    Удалить данные и аккаунт
                  </button>
                </div>
              ) : (
                <div className="settings-stack">
                  <article className="settings-item">
                    <span className="settings-label">Заблокированные контакты</span>
                    <p className="settings-text">
                      Контакты скрыты из списка, но переписка с ними сохранена.
                    </p>
                  </article>
                  {blockedChats.length > 0 ? (
                    blockedChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        className="settings-action-card"
                        onClick={() => setBlockedActionChatId(chat.id)}
                      >
                        {chat.title}
                      </button>
                    ))
                  ) : (
                    <article className="settings-item">
                      <p className="settings-text">Пока нет заблокированных контактов.</p>
                    </article>
                  )}
                  {blockedActionChatId !== null ? (
                    <div className="settings-popover">
                      <button
                        type="button"
                        className="settings-action-card danger"
                        onClick={() => {
                          void deleteChatHistory(blockedActionChatId)
                        }}
                      >
                        Удалить переписку
                      </button>
                      <button
                        type="button"
                        className="settings-action-card"
                        onClick={() => unblockChat(blockedActionChatId)}
                      >
                        Вернуть контакт
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="settings-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    setStageView('main')
                    setConfirmingLogout(false)
                  }}
                >
                  Назад
                </button>
                {settingsView === 'profile' ? (
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() => {
                      setSettingsView('management')
                      setConfirmingLogout(false)
                      setBlockedActionChatId(null)
                    }}
                  >
                    Управление
                  </button>
                ) : (
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() => {
                      setSettingsView(settingsView === 'blocked' ? 'management' : 'profile')
                      setConfirmingLogout(false)
                      setBlockedActionChatId(null)
                    }}
                  >
                    {settingsView === 'blocked' ? 'Управление' : 'К настройкам'}
                  </button>
                )}
                <button
                  type="button"
                  className="soft-button icon-button"
                  onClick={() => {
                    setStageView('premium')
                    setPremiumGiftChatId(null)
                    setConfirmingLogout(false)
                  }}
                  aria-label="Премиум"
                >
                  <img src="/icons/crown100.png" alt="" />
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setConfirmingLogout(true)}
                >
                  Выйти
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isPremiumView ? (
          <section className="settings-view premium-view">
            <div className="settings-panel premium-panel">
              <div className="settings-heading premium-heading">
                {premiumGiftChat ? (
                  <>
                    <div className="premium-gift-title">
                      <h2>Подарить Премиум</h2>
                      <img src="/icons/crown100.png" alt="" />
                    </div>
                    <p className="premium-gift-contact">{`Контакту ${premiumGiftChat.title}`}</p>
                  </>
                ) : (
                  <h2>{sessionHasPremium ? 'Продли премиум Тайничок' : 'Премиум Тайничок'}</h2>
                )}
                <p className="settings-copy">
                  {premiumGiftChat
                    ? 'В Тайничке нет рекламы, поэтому, совершая покупку, вы помогаете обслуживать серверы.'
                    : 'В Тайничке нет рекламы, поэтому, совершая покупку, вы помогаете обслуживать серверы.'}
                </p>
                {!premiumGiftChat && sessionHasPremium && premiumDaysLeft !== null ? (
                  <p className="premium-gift-contact">
                    {premiumDaysLeft > 0
                      ? `Премиум активен ещё ${premiumDaysLeft} дн.`
                      : 'Премиум заканчивается сегодня'}
                  </p>
                ) : null}
              </div>

              <div className="premium-stack">
                <article className="premium-card">
                  <div className="premium-price">
                    <strong>199р</strong>
                    <span>/ месяц</span>
                  </div>
                  <p className="premium-note">Для спокойного доступа ко всем премиум-возможностям.</p>
                  <ul className="premium-features">
                    <li>
                      <span className="premium-feature-crown">
                        <span>Добавляет к имени</span>
                        <img src="/icons/crown64.png" alt="" aria-hidden="true" />
                      </span>
                    </li>
                    <li>Увеличивает срок хранения файлов и фотографий</li>
                    <li>Создание тематических каналов</li>
                  </ul>
                  <button type="button" className="send-button premium-submit">
                    Выбрать месяц
                  </button>
                </article>

                <article className="premium-card premium-card-annual">
                  <span className="premium-annual-badge">{`Выгода ${premiumAnnualSavingsPercent}%`}</span>
                  <div className="premium-card-header">
                    <div className="premium-price">
                      <strong>{`${premiumAnnualPrice}р`}</strong>
                      <span>/ год</span>
                    </div>
                  </div>
                  <p className="premium-note">Выгоднее для тех, кто остаётся в Тайничке надолго.</p>
                  <ul className="premium-features">
                    <li>
                      <span className="premium-feature-crown">
                        <span>Добавляет к имени</span>
                        <img src="/icons/crown64.png" alt="" aria-hidden="true" />
                      </span>
                    </li>
                    <li>Увеличивает срок хранения файлов и фотографий</li>
                    <li>Создание тематических каналов</li>
                  </ul>
                  <button type="button" className="send-button premium-submit">
                    Выбрать год
                  </button>
                </article>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    setStageView('main')
                    setPremiumGiftChatId(null)
                  }}
                >
                  Назад
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isChannelsListView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-manager-panel">
              <div className="channels-screen-header">
                <p className="eyebrow">Каналы</p>
                <h2>Управление каналами</h2>
                <p className="settings-copy">Каналы, которыми вы управляете сейчас.</p>
              </div>

              <div className="channels-manager-content">
                {channels.length > 0 ? (
                  <div className="channels-list">
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        className="channel-card"
                        onClick={() => openChannelDetailView(channel.id)}
                      >
                        <span className="channel-avatar" style={{ backgroundColor: channel.avatarTone }}>
                          {channel.avatarImage ? (
                            <img src={channel.avatarImage} alt="" className="channel-avatar-image" />
                          ) : (
                            formatChannelAvatarLabel(channel.title)
                          )}
                        </span>
                        <span className="channel-card-copy">
                          <strong className="channel-card-title">
                            <span>{channel.title}</span>
                            <span className="chat-star">
                              <img src="/icons/news100.svg" alt="Канал" />
                            </span>
                          </strong>
                          <span>{channel.status === 'draft' ? 'Черновик канала' : 'Активный канал'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <article className="settings-item">
                    <p className="settings-text">Пока нет каналов. Создайте первый канал из этой сцены.</p>
                  </article>
                )}
              </div>

              <div className="settings-actions channels-manager-actions">
                <button type="button" className="soft-button" onClick={() => setStageView('main')}>
                  Назад
                </button>
                <button
                  type="button"
                  className="send-button channels-create-button"
                  onClick={openChannelCreateView}
                >
                  Создать канал
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isChannelCreateView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-detail-panel">
              <div className="channels-screen-header">
                <p className="eyebrow">Каналы</p>
                <h2>Создать канал</h2>
                <p className="settings-copy">
                  Подготовьте черновик канала: название, прямую ссылку, аватарку и описание.
                </p>
              </div>

              <div className="channels-fields">
                <article className="settings-item">
                  <span className="settings-label">Название канала</span>
                  <input
                    type="text"
                    className="settings-input"
                    maxLength={channelTitleMaxLength}
                    value={creatingChannelTitle}
                    onChange={(event) => {
                      const nextTitle = event.target.value.slice(0, channelTitleMaxLength)
                      setCreatingChannelTitle(nextTitle)

                      if (!creatingChannelDirectLinkDirty) {
                        setCreatingChannelDirectLink(buildUniqueChannelDirectLinkFromTitle(nextTitle))
                      }
                    }}
                  />
                </article>

                <article className="settings-item">
                  <span className="settings-label">Прямая ссылка</span>
                  <input
                    type="text"
                    className="settings-input"
                    maxLength={channelDirectLinkMaxLength + 1}
                    value={creatingChannelDirectLink}
                    placeholder="@kanal"
                    onChange={(event) => {
                      setCreatingChannelDirectLinkDirty(true)
                      setCreatingChannelDirectLink(
                        buildEditableChannelDirectLink(event.target.value, creatingChannelTitle),
                      )
                    }}
                  />
                </article>

                <article className="settings-item">
                  <span className="settings-label">Аватарка канала</span>
                  <div className="channel-avatar-settings">
                    <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: creatingChannelAvatarTone }}>
                      {creatingChannelAvatarDraft?.previewUrl ? (
                        <img src={creatingChannelAvatarDraft.previewUrl} alt="" className="channel-avatar-image" />
                      ) : (
                        formatChannelAvatarLabel(creatingChannelTitle || 'Новый канал')
                      )}
                    </span>
                    <div className="channel-avatar-copy">
                      <p className="settings-text">
                        Можно выбрать готовое изображение Tinychok или загрузить аватарку с устройства.
                      </p>
                      <button
                        type="button"
                        className="soft-button"
                        onClick={() => openChannelAvatarPicker({ scope: 'create' })}
                      >
                        Сменить аватарку
                      </button>
                    </div>
                  </div>
                </article>

                <article className="settings-item channel-description-card">
                  <span className="settings-label">Описание канала</span>
                  <textarea
                    className="channel-description-input"
                    maxLength={channelDescriptionMaxLength}
                    value={creatingChannelDescription}
                    onChange={(event) =>
                      setCreatingChannelDescription(
                        event.target.value.slice(0, channelDescriptionMaxLength),
                      )
                    }
                  />
                </article>
              </div>

              <div className="settings-actions channels-create-actions">
                <button type="button" className="soft-button" onClick={openChannelsListView}>
                  Назад
                </button>
                <button
                  type="button"
                  className="send-button channels-create-submit"
                  onClick={() => {
                    void createChannel()
                  }}
                >
                  Создать канал
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isChannelDetailView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-detail-panel">
              {activeChannel ? (
                <>
                  <div className="channels-heading">
                    <div className="channels-heading-main">
                      <div className="channel-header-avatar-stack">
                        <span
                          className="channel-avatar channel-avatar-large"
                          style={{ backgroundColor: activeChannel.avatarTone }}
                        >
                          {activeChannel.avatarImage ? (
                            <img src={activeChannel.avatarImage} alt="" className="channel-avatar-image" />
                          ) : (
                            formatChannelAvatarLabel(activeChannel.title)
                          )}
                        </span>
                        <button
                          type="button"
                          className="soft-button channel-avatar-change"
                          onClick={() => openChannelAvatarPicker({ channelId: activeChannel.id, scope: 'existing' })}
                        >
                          Сменить
                        </button>
                      </div>
                      <div className="channel-title-block">
                        <div className="channel-title-row">
                          <h3>{activeChannel.title}</h3>
                          <button
                            type="button"
                            className="soft-button channel-title-edit"
                            onClick={() => openChannelTitleEditor(activeChannel)}
                            aria-label="Редактировать название канала"
                            title="Редактировать название канала"
                          >
                            <img src="/icons/edit100.png" alt="" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="channels-fields">
                    <article className="settings-item">
                      <span className="settings-label">Прямая ссылка</span>
                      <div className="channel-link-field">
                        <input
                          type="text"
                          className="settings-input channel-link-input"
                          maxLength={channelDirectLinkMaxLength + 1}
                          value={
                            activeChannel.visibility === 'closed'
                              ? 'Недоступно для закрытого канала'
                              : activeChannel.directLink || '@'
                          }
                          readOnly={activeChannel.visibility === 'closed'}
                          placeholder="@kanal"
                          onChange={(event) =>
                            updateChannel(activeChannel.id, {
                              directLink: buildEditableChannelDirectLink(event.target.value, activeChannel.title),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="soft-button channel-link-copy"
                          onClick={() => copyToClipboard(activeChannel.directLink)}
                          aria-label="Копировать ссылку"
                          title="Копировать ссылку"
                          disabled={activeChannel.visibility === 'closed'}
                        >
                          <img src="/icons/copy100.png" alt="" />
                        </button>
                      </div>
                    </article>

                    <article className="settings-item channel-description-card">
                      <span className="settings-label">Описание канала</span>
                      <textarea
                        className="channel-description-input"
                        maxLength={channelDescriptionMaxLength}
                        value={activeChannel.description}
                        onChange={(event) =>
                          updateChannel(activeChannel.id, {
                            description: event.target.value.slice(0, channelDescriptionMaxLength),
                          })
                        }
                      />
                    </article>

                    <article className="settings-item channel-privacy-card">
                      <span className="settings-label">Приватность канала</span>
                      <div className="channel-privacy-row">
                        <div className="channel-privacy-content">
                          <strong>{getChannelVisibilityLabel(activeChannel.visibility)}</strong>
                          <p className="settings-text">
                            {getChannelVisibilityDescription(activeChannel.visibility)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="soft-button channel-privacy-toggle"
                          onClick={() =>
                            updateChannel(activeChannel.id, {
                              visibility: getNextChannelVisibility(activeChannel.visibility),
                            })
                          }
                          aria-label="Изменить приватность канала"
                          title="Изменить приватность канала"
                        >
                          <img src="/icons/reset100.png" alt="" />
                        </button>
                      </div>
                    </article>
                  </div>

                  {channelManagementOpenId === activeChannel.id ? (
                    <>
                      <button
                        type="button"
                        className="room-confirm-scrim"
                        aria-label="Закрыть управление каналом"
                        onClick={() => setChannelManagementOpenId(null)}
                      />
                      <div className="room-confirm room-confirm-compact">
                        <p className="room-confirm-copy">Управление каналом</p>
                        <div className="room-forward-list">
                          <button
                            type="button"
                            className="room-forward-item"
                            onClick={() => startChannelTransfer(activeChannel.id)}
                          >
                            Передать
                          </button>
                          <button
                            type="button"
                            className="room-forward-item room-confirm-danger"
                            onClick={() => {
                              setChannelManagementOpenId(null)
                              setConfirmingDeleteChannelId(activeChannel.id)
                            }}
                          >
                            Удалить канал
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <div className="channels-empty-state">
                  <p className="eyebrow">Канал</p>
                  <h3>Канал не найден</h3>
                  <p className="settings-copy">
                    Вернитесь к списку каналов и выберите другой черновик.
                  </p>
                </div>
              )}

              <div className="settings-actions">
                <button type="button" className="soft-button" onClick={openChannelsListView}>
                  Назад
                </button>
                {activeChannel ? (
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() =>
                      setChannelManagementOpenId((current) =>
                        current === activeChannel.id ? null : activeChannel.id,
                      )
                    }
                  >
                    Управление
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {isSubscriptionChannelOpen ? (
          <SubscriptionChannelRoom
            actions={subscriptionPostActions}
            activePostId={forwardingSubscriptionPostText ? null : activeSubscriptionPostId}
            channel={currentSubscriptionChannel!}
            messageFeedRef={messageFeedRef}
            onBack={closeActiveRoom}
            onPostSelect={(event, postId) => {
              setActiveSubscriptionPostId(postId)
              scheduleActionAnchor(event.currentTarget, 'start', setSubscriptionPostActionAnchor)
              setForwardingSubscriptionPostText('')
            }}
            subscriptionAction={
              previewSubscriptionChannel
                ? {
                    label: 'Подписаться',
                    onClick: subscribeToPreviewSubscriptionChannel,
                  }
                : undefined
            }
          />
        ) : null}

        {isGroupOpen ? (
          <GroupRoom
            actions={groupMessageActions}
            activeMessageId={forwardingGroupMessageText ? null : activeGroupMessageId}
            attachmentInputRef={groupAttachmentInputRef}
            attachmentName={groupAttachmentDrafts[activeGroup.id]?.fileName ?? ''}
            draft={groupMessageDrafts[activeGroup.id] ?? ''}
            getMessageDeliveryIssue={getGroupMessageDeliveryIssue}
            group={activeGroup}
            messageFeedRef={messageFeedRef}
            onAttachmentChange={handleGroupAttachmentChange}
            onBack={closeActiveRoom}
            onComposerFocus={closeGroupMessageActions}
            onDraftChange={(value) => updateGroupDraft(activeGroup.id, value)}
            onMessageSelect={(event, message) => {
              setActiveGroupMessageId(message.id)
              scheduleActionAnchor(
                event.currentTarget,
                message.author === 'me' ? 'end' : 'start',
                setGroupMessageActionAnchor,
              )
              setForwardingGroupMessageText('')
            }}
            onOpenLinkedChannel={openSourceChannel}
            onOpenParticipants={() => setGroupParticipantsOpen(true)}
            onOpenSourceChannel={openSourceChannelFromMessage}
            onOpenAttachmentPicker={openGroupAttachmentPicker}
            resolveLinkedChannelFromMessage={resolveEmbeddedChannelFromMessage}
            onSubmit={sendGroupMessage}
          />
        ) : null}
        {groupParticipantsDialog}
        {confirmingDeleteGroupMessageDialog}

        {isChatOpen ? (
          <>
            <DirectChatRoom
              activeChat={activeChat}
              activeMessageId={messageActionMessageId}
              attachmentInputRef={attachmentInputRef}
              attachmentName={chatAttachmentDrafts[activeChat.id]?.fileName ?? ''}
              chatActionsOpen={chatActionsOpen}
              draft={chatMessageDrafts[activeChat.id] ?? ''}
              getMessageDeliveryIssue={getDirectMessageDeliveryIssue}
              messageFeedRef={messageFeedRef}
              pinnedMessage={pinnedMessage}
              quietMode={quietMode}
              replyTarget={replyTarget}
              onAttachmentChange={handleChatAttachmentChange}
              onBack={closeActiveRoom}
              onBlockChat={() => blockChat(activeChat.id)}
              onCloseChatActions={() => setChatActionsOpen(false)}
              onDraftChange={(value) => updateChatDraft(activeChat.id, value)}
              onMessageSelect={(event, message) => {
                setMessageActionMessageId(message.id)
                scheduleActionAnchor(
                  event.currentTarget,
                  message.author === 'me' ? 'end' : 'start',
                  setMessageActionAnchor,
                )
              }}
              onOpenLinkedChannel={openSourceChannel}
              onOpenSourceChannel={openSourceChannelFromMessage}
              onOpenAttachmentPicker={openAttachmentPicker}
              onOpenPremiumGift={() => {
                setPremiumGiftChatId(activeChat.id)
                setStageView('premium')
                setChatActionsOpen(false)
              }}
              onReplyCancel={() => setReplyTarget(null)}
              onRequestDeleteContact={() => {
                setConfirmingDeleteContactChatId(activeChat.id)
                setChatActionsOpen(false)
              }}
              onRequestDeleteHistory={() => {
                setConfirmingDeleteHistoryChatId(activeChat.id)
                setChatActionsOpen(false)
              }}
              resolveLinkedChannelFromMessage={resolveEmbeddedChannelFromMessage}
              onSubmit={sendMessage}
              onToggleChatActions={() => setChatActionsOpen((current) => !current)}
              onToggleFavoriteChat={() => {
                void togglePinnedChat(activeChat.id)
              }}
              onUnpinMessage={() => {
                void unpinMessage(activeChat.id)
              }}
            />

            {activeMessage ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim message-menu-scrim"
                  aria-label="Закрыть меню сообщения"
                  onClick={() => {
                    setMessageActionMessageId(null)
                    setMessageActionAnchor(null)
                  }}
                />
                {messageActionAnchor ? (
                  <SelectedBubbleOverlay
                    anchor={messageActionAnchor}
                    deliveryIssue={activeMessageDeliveryIssue ?? undefined}
                    kind="direct"
                    linkedChannel={resolveEmbeddedChannelFromMessage(activeMessage)}
                    message={activeMessage}
                    mine={activeMessage.author === 'me'}
                    replyChatTitle={activeChat.title}
                  />
                ) : null}
                {messageActionAnchor ? (
                  <div
                    ref={messageMenuRef}
                    className="message-menu"
                    style={messageMenuStyle}
                  >
                    {activeMessageDeliveryIssue === 'failed' ? (
                      <>
                        <button
                          type="button"
                          className="message-menu-item"
                          onClick={() => retryFailedDirectMessage(activeChat.id, activeMessage.id)}
                        >
                          Отправить повторно
                        </button>
                        <button
                          type="button"
                          className="message-menu-item danger"
                          onClick={() => deleteFailedDirectMessage(activeChat.id, activeMessage.id)}
                        >
                          Удалить
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="message-menu-item" onClick={() => replyToMessage(activeMessage)}>
                          Ответить
                        </button>
                        <button
                          type="button"
                          className="message-menu-item"
                          onClick={() => copyMessageText(activeMessage)}
                        >
                          Скопировать
                        </button>
                        <button
                          type="button"
                          className="message-menu-item"
                          onClick={() => {
                            void pinMessage(activeChat.id, activeMessage.id)
                          }}
                        >
                          Закрепить
                        </button>
                        <button
                          type="button"
                          className="message-menu-item"
                          onClick={() => {
                            setForwardingMessageId(activeMessage.id)
                            setMessageActionMessageId(null)
                            setMessageActionAnchor(null)
                          }}
                        >
                          Переслать
                        </button>
                        <button
                          type="button"
                          className="message-menu-item danger"
                          onClick={() => {
                            setConfirmingDeleteMessageId(activeMessage.id)
                            setMessageActionMessageId(null)
                          }}
                        >
                          Удалить
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}

            {forwardingMessage ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть пересылку"
                  onClick={() => setForwardingMessageId(null)}
                />
                <div className="room-confirm room-forward">
                  <p className="room-confirm-copy">Кому переслать сообщение?</p>
                  <div className="room-forward-list">
                    {availableChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        className="room-forward-item"
                        onClick={() => forwardMessageToChat(chat.id, forwardingMessage)}
                      >
                        <span className="avatar" style={{ backgroundColor: chat.accent }}>
                          {chat.title.slice(0, 1)}
                        </span>
                        <span>{chat.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {confirmingDeleteHistoryChatId !== null ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть подтверждение"
                  onClick={() => setConfirmingDeleteHistoryChatId(null)}
                />
                <div className="room-confirm">
                  <p className="room-confirm-copy">
                    Вы точно хотите удалить всю переписку с этим контактом?
                  </p>
                  <div className="room-confirm-actions">
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteChatHistory(confirmingDeleteHistoryChatId)
                      }}
                    >
                      Удалить у меня
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteChatHistory(confirmingDeleteHistoryChatId)
                      }}
                    >
                      Удалить у всех
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={() => setConfirmingDeleteHistoryChatId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {confirmingDeleteMessageId !== null ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть подтверждение удаления сообщения"
                  onClick={() => setConfirmingDeleteMessageId(null)}
                />
                <div className="room-confirm">
                  <p className="room-confirm-copy">Удалить это сообщение?</p>
                  <div className="room-confirm-actions">
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteMessage(activeChat.id, confirmingDeleteMessageId)
                      }}
                    >
                      Удалить у меня
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteMessage(activeChat.id, confirmingDeleteMessageId)
                      }}
                    >
                      Удалить у всех
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={() => setConfirmingDeleteMessageId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {confirmingDeleteContactChatId !== null ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть подтверждение удаления контакта"
                  onClick={() => setConfirmingDeleteContactChatId(null)}
                />
                <div className="room-confirm">
                  <p className="room-confirm-copy">
                    {`Удалить контакт ${
                      chats.find((chat) => chat.id === confirmingDeleteContactChatId)?.title ?? ''
                    } и всю переписку с ним?`}
                  </p>
                  <div className="room-confirm-actions">
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => blockThenDeleteChat(confirmingDeleteContactChatId)}
                    >
                      Удалить и заблокировать
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteContact(confirmingDeleteContactChatId)
                      }}
                    >
                      Да, удалить
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={() => setConfirmingDeleteContactChatId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {confirmingDeleteChannelId !== null ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть подтверждение удаления канала"
              onClick={() => setConfirmingDeleteChannelId(null)}
            />
            <div className="room-confirm room-confirm-compact">
              <p className="room-confirm-copy">
                {`Удалить канал ${
                  channels.find((channel) => channel.id === confirmingDeleteChannelId)?.title ?? ''
                }?`}
              </p>
              <div className="room-confirm-actions room-confirm-actions-dual">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-danger"
                  onClick={() => {
                    void deleteChannel(confirmingDeleteChannelId)
                  }}
                >
                  Удалить канал
                </button>
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={() => setConfirmingDeleteChannelId(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </>
        ) : null}

        {managedChannelLimitErrorOpen ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть ошибку лимита каналов"
              onClick={() => setManagedChannelLimitErrorOpen(false)}
            />
            <div className="room-confirm room-confirm-compact">
              <p className="room-confirm-copy">Нельзя создать ещё один канал.</p>
              <p className="settings-text room-confirm-note">
                {`Один пользователь может управлять только ${managedChannelsPerUserLimit} каналами. Удалите один из текущих каналов, чтобы создать новый.`}
              </p>
              <div className="room-confirm-actions room-confirm-actions-single">
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={() => setManagedChannelLimitErrorOpen(false)}
                >
                  Понятно
                </button>
              </div>
            </div>
          </>
        ) : null}

        {transferringChannel ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть передачу канала"
              onClick={closeChannelTransfer}
            />
            {channelTransferTarget ? (
              <div className="room-confirm room-transfer-confirm">
                <p className="room-confirm-copy">
                  {`Подтвердите передачу канала ${transferringChannel.title} контакту ${channelTransferTarget.title}.`}
                </p>
                <div className="auth-code-note room-transfer-note">
                  <span className="settings-label">SMS отправлена на номер</span>
                  <strong>{channelTransferTarget.phone}</strong>
                </div>
                <label className="auth-field">
                  <span>Код из SMS</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Например, 4821"
                    value={channelTransferCode}
                    onChange={(event) =>
                      setChannelTransferCode(event.target.value.replace(/[^\d]/g, ''))
                    }
                  />
                </label>
                {channelTransferError ? <p className="auth-error">{channelTransferError}</p> : null}
                <div className="room-confirm-actions room-confirm-actions-dual">
                  <button
                    type="button"
                    className="room-confirm-button room-confirm-danger"
                    onClick={submitChannelTransfer}
                  >
                    Подтвердить передачу
                  </button>
                  <button
                    type="button"
                    className="room-confirm-button"
                    onClick={() => {
                      setChannelTransferTargetChatId(null)
                      setChannelTransferCode('')
                      setChannelTransferError('')
                    }}
                  >
                    Назад к списку
                  </button>
                </div>
              </div>
            ) : (
              <div className="room-confirm room-forward room-transfer-list">
                <p className="room-confirm-copy">Кому передать этот канал?</p>
                <label className="search room-transfer-search">
                  <span className="search-label">Поиск контакта</span>
                  <input
                    type="search"
                    placeholder="Имя, @handle или номер"
                    value={channelTransferSearch}
                    onChange={(event) => setChannelTransferSearch(event.target.value)}
                  />
                </label>
                <div className="room-forward-list">
                  {channelTransferResults.length > 0 ? (
                    channelTransferResults.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        className="room-forward-item"
                        onClick={() => selectChannelTransferTarget(chat.id)}
                      >
                        <span className="avatar" style={{ backgroundColor: chat.accent }}>
                          {chat.title.slice(0, 1)}
                        </span>
                        <span>{chat.title}</span>
                      </button>
                    ))
                  ) : (
                    <article className="settings-item room-transfer-empty">
                      <p className="settings-text">Контакт не найден. Попробуйте другой ник или номер.</p>
                    </article>
                  )}
                </div>
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={closeChannelTransfer}
                >
                  Назад
                </button>
              </div>
            )}
          </>
        ) : null}

        {profileAvatarPickerOpen ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть выбор аватарки профиля"
              onClick={() => closeProfileAvatarPicker()}
            />
            <div className="channel-avatar-picker-popover">
              <div className="channel-avatar-picker-copy">
                <p className="settings-label">Аватарка профиля</p>
                <p className="settings-text">
                  Поддерживаются JPG и PNG до 1 МБ. Лучше всего работает квадратное изображение.
                </p>
              </div>

              <div className="channel-avatar-picker-preview-card">
                <span
                  className="channel-avatar channel-avatar-large channel-avatar-picker-preview"
                  style={{ backgroundColor: '#8c5738' }}
                >
                  {getCurrentProfileAvatarPreview() ? (
                    <img src={getCurrentProfileAvatarPreview()!} alt="" className="channel-avatar-image" />
                  ) : (
                    sessionAvatarLabel
                  )}
                </span>
                <div className="channel-avatar-picker-preview-copy">
                  <strong>Превью</strong>
                  <span>Так будет выглядеть ваша аватарка.</span>
                  {profileAvatarPickerDraft?.label ? <span>{profileAvatarPickerDraft.label}</span> : null}
                </div>
              </div>

              <div className="channel-avatar-picker-toggle-row">
                <button
                  type="button"
                  className={`soft-button channel-avatar-picker-toggle${profileAvatarPickerMode === 'stock' ? ' active' : ''}`}
                  onClick={() => {
                    setProfileAvatarPickerMode('stock')
                    setProfileAvatarPickerError('')
                  }}
                >
                  Выбрать аватар
                </button>
                <button
                  type="button"
                  className={`soft-button channel-avatar-picker-toggle${profileAvatarPickerMode === 'device' ? ' active' : ''}`}
                  onClick={triggerProfileAvatarUpload}
                >
                  Загрузить с устройства
                </button>
              </div>

              {profileAvatarPickerMode === 'stock' ? (
                profileAvatarStockOptions.length > 0 ? (
                <div className="channel-avatar-stock-grid">
                  {profileAvatarStockOptions.map((option) => {
                    const optionPreviewUrl = option.imagePath
                    const isSelected = profileAvatarPickerDraft?.previewUrl === optionPreviewUrl

                    return (
                      <button
                        key={`profile-${option.id}`}
                        type="button"
                        className={`channel-avatar-stock-option${isSelected ? ' active' : ''}`}
                        onClick={() => selectStockProfileAvatar(option)}
                      >
                        <span
                          className="channel-avatar channel-avatar-stock-preview"
                          style={{ backgroundColor: '#8c5738' }}
                        >
                          <img src={optionPreviewUrl} alt="" className="channel-avatar-image" />
                        </span>
                        <span>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
                ) : (
                  <article className="settings-item channel-avatar-device-card">
                    <p className="settings-text">
                      В папке `src/assets/stock-avatars/users` пока нет стоковых аватарок.
                    </p>
                  </article>
                )
              ) : profileAvatarPickerMode === 'device' ? (
                <article className="settings-item channel-avatar-device-card">
                  <p className="settings-text">
                    Выберите файл с устройства. Если нужно, можно сразу открыть диалог ещё раз и заменить изображение.
                  </p>
                  <button
                    type="button"
                    className="soft-button"
                    onClick={triggerProfileAvatarUpload}
                  >
                    {profileAvatarPickerDraft?.kind === 'upload' || profileAvatarPickerDraft?.kind === 'uploaded'
                      ? 'Выбрать другой файл'
                      : 'Выбрать файл'}
                  </button>
                </article>
              ) : (
                <article className="settings-item channel-avatar-device-card">
                  <p className="settings-text">
                    Выберите, откуда взять аватарку: из готового набора или с устройства.
                  </p>
                </article>
              )}

              {profileAvatarPickerError ? <p className="auth-error">{profileAvatarPickerError}</p> : null}

              <div className="channel-title-popover-actions channel-avatar-picker-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => closeProfileAvatarPicker()}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="send-button"
                  onClick={() => {
                    void applyProfileAvatarSelection()
                  }}
                  disabled={!profileAvatarPickerDraft || profileAvatarPickerBusy}
                >
                  {profileAvatarPickerBusy ? 'Сохраняем...' : 'Применить'}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {channelAvatarPickerTarget ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть выбор аватарки канала"
              onClick={() => closeChannelAvatarPicker()}
            />
            <div className="channel-avatar-picker-popover">
              <div className="channel-avatar-picker-copy">
                <p className="settings-label">Аватарка канала</p>
                <p className="settings-text">
                  Поддерживаются JPG и PNG до 1 МБ. Лучше всего работает квадратное изображение.
                </p>
              </div>

              <div className="channel-avatar-picker-preview-card">
                <span
                  className="channel-avatar channel-avatar-large channel-avatar-picker-preview"
                  style={{ backgroundColor: getCurrentChannelAvatarTone() }}
                >
                  {getCurrentChannelAvatarPreview() ? (
                    <img src={getCurrentChannelAvatarPreview()!} alt="" className="channel-avatar-image" />
                  ) : (
                    formatChannelAvatarLabel(
                      channelAvatarPickerTarget.scope === 'create'
                        ? creatingChannelTitle || 'Новый канал'
                        : channels.find((channel) => channel.id === channelAvatarPickerTarget.channelId)?.title ?? 'Канал',
                    )
                  )}
                </span>
                <div className="channel-avatar-picker-preview-copy">
                  <strong>Превью</strong>
                  <span>Так аватарка будет выглядеть в интерфейсе Tinychok.</span>
                  {channelAvatarPickerDraft?.label ? <span>{channelAvatarPickerDraft.label}</span> : null}
                </div>
              </div>

              <div className="channel-avatar-picker-toggle-row">
                <button
                  type="button"
                  className={`soft-button channel-avatar-picker-toggle${channelAvatarPickerMode === 'stock' ? ' active' : ''}`}
                  onClick={() => {
                    setChannelAvatarPickerMode('stock')
                    setChannelAvatarPickerError('')
                  }}
                >
                  Выбрать аватар
                </button>
                <button
                  type="button"
                  className={`soft-button channel-avatar-picker-toggle${channelAvatarPickerMode === 'device' ? ' active' : ''}`}
                  onClick={triggerChannelAvatarUpload}
                >
                  Загрузить с устройства
                </button>
              </div>

              {channelAvatarPickerMode === 'stock' ? (
                channelAvatarStockOptions.length > 0 ? (
                <div className="channel-avatar-stock-grid">
                  {channelAvatarStockOptions.map((option) => {
                    const optionPreviewUrl = option.imagePath
                    const isSelected = channelAvatarPickerDraft?.previewUrl === optionPreviewUrl

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`channel-avatar-stock-option${isSelected ? ' active' : ''}`}
                        onClick={() => selectStockChannelAvatar(option)}
                      >
                        <span
                          className="channel-avatar channel-avatar-stock-preview"
                          style={{ backgroundColor: getCurrentChannelAvatarTone() }}
                        >
                          <img src={optionPreviewUrl} alt="" className="channel-avatar-image" />
                        </span>
                        <span>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
                ) : (
                  <article className="settings-item channel-avatar-device-card">
                    <p className="settings-text">
                      В папке `src/assets/stock-avatars/channels` пока нет стоковых аватарок.
                    </p>
                  </article>
                )
              ) : channelAvatarPickerMode === 'device' ? (
                <article className="settings-item channel-avatar-device-card">
                  <p className="settings-text">
                    Выберите файл с устройства. Если нужно, можно сразу открыть диалог ещё раз и заменить изображение.
                  </p>
                  <button
                    type="button"
                    className="soft-button"
                    onClick={triggerChannelAvatarUpload}
                  >
                    {channelAvatarPickerDraft?.kind === 'upload' || channelAvatarPickerDraft?.kind === 'uploaded'
                      ? 'Выбрать другой файл'
                      : 'Выбрать файл'}
                  </button>
                </article>
              ) : (
                <article className="settings-item channel-avatar-device-card">
                  <p className="settings-text">
                    Выберите, откуда взять аватарку: из готового набора или с устройства.
                  </p>
                </article>
              )}

              {channelAvatarPickerError ? <p className="auth-error">{channelAvatarPickerError}</p> : null}

              <div className="channel-title-popover-actions channel-avatar-picker-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => closeChannelAvatarPicker()}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="send-button"
                  onClick={() => {
                    void applyChannelAvatarSelection()
                  }}
                  disabled={!channelAvatarPickerDraft || channelAvatarPickerBusy}
                >
                  {channelAvatarPickerBusy ? 'Сохраняем...' : 'Применить'}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {editingChannelTitleId !== null ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть редактирование названия канала"
              onClick={() => {
                setEditingChannelTitleId(null)
                setEditingChannelTitleValue('')
              }}
            />
            <div className="channel-title-popover">
              <p className="settings-label">Название канала</p>
              <input
                ref={channelTitleInputRef}
                type="text"
                className="settings-input"
                maxLength={channelTitleMaxLength}
                value={editingChannelTitleValue}
                onChange={(event) =>
                  setEditingChannelTitleValue(event.target.value.slice(0, channelTitleMaxLength))
                }
              />
              <div className="channel-title-popover-actions">
                <button type="button" className="soft-button" onClick={submitChannelTitleEdit}>
                  Сохранить
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingChannelTitleId(null)
                    setEditingChannelTitleValue('')
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </>
        ) : null}

        <input
          ref={profileAvatarInputRef}
          type="file"
          accept={channelAvatarUploadAcceptedMimeTypes.join(',')}
          className="composer-attachment-input"
          onChange={handleProfileAvatarChange}
        />
        <input
          ref={channelAvatarInputRef}
          type="file"
          accept={channelAvatarUploadAcceptedMimeTypes.join(',')}
          className="composer-attachment-input"
          onChange={handleChannelAvatarChange}
        />
        {copyHintText ? <div className="copy-hint">{copyHintText}</div> : null}
      </section>
      </main>
      {cookieConsentBanner}
    </>
  )
}

export default App
