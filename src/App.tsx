import { type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  accountNameMaxFontSize,
  accountNameMinFontSize,
  accountStatusMaxFontSize,
  accountStatusMinFontSize,
  accountsStorageKey,
  browserNotificationsBannerDismissedStorageKey,
  browserNotificationsEnabledStorageKey,
  defaultGroupMemberLimit,
  channelActionMenuHeight,
  channelActionMenuWidth,
  channelAvatarUploadAcceptedMimeTypes,
  channelAvatarTones,
  channelBlockedMenuHeight,
  channelDirectLinkMaxLength,
  channelTitleMaxLength,
  chatActionMenuHeight,
  chatActionMenuWidth,
  displayNameFieldMaxLength,
  groupActionMenuHeight,
  groupActionMenuWidth,
  groupTitleMaxLength,
  managedChannelsPerUserLimit,
  messagePhotoSendOriginalPreferenceStorageKey,
  nicknameFieldMaxLength,
  premiumGroupMemberLimit,
  premiumDebugAutoCheckoutStorageKey,
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
import { prepareAvatarUpload } from './app/avatarProcessing'
import { loadAccounts, loadSession } from './app/storage'
import {
  buildComposerAttachmentDraft,
  buildGifLibraryAttachmentDraft,
  buildPendingAttachmentDraft,
  createPreparingComposerAttachmentDraft,
  releaseComposerAttachmentDraft,
  setComposerAttachmentSendOriginal,
  type ComposerAttachmentDraft,
} from './app/composerAttachments'
import { useBlacklistFlow } from './app/useBlacklistFlow'
import { useGroupSettingsFlow } from './app/useGroupSettingsFlow'
import { useRoomHistoryWindow } from './app/useRoomHistoryWindow'
import { useRoomMessageActions } from './app/useRoomMessageActions'
import { useThreadFlow } from './app/useThreadFlow'
import {
  ApiError,
  fetchClientRuntimeConfig,
  fetchDirectDialogHistory,
  fetchGroupHistory,
  fetchSubscriptionChannelHistory,
  createGroup as createGroupRequest,
  createManagedChannel as createManagedChannelRequest,
  deleteUserGif as deleteUserGifRequest,
  deleteDialog as deleteDialogRequest,
  deleteDialogHistory as deleteDialogHistoryRequest,
  deleteDialogMessage as deleteDialogMessageRequest,
  deleteGroupMessage as deleteGroupMessageRequest,
  deleteGroupThreadComment as deleteGroupThreadCommentRequest,
  blacklistSubscriptionChannelSubscriber as blacklistSubscriptionChannelSubscriberRequest,
  deleteManagedChannel as deleteManagedChannelRequest,
  deleteManagedChannelPost as deleteManagedChannelPostRequest,
  deleteSubscriptionChannelThreadComment as deleteSubscriptionChannelThreadCommentRequest,
  markGroupThreadRead as markGroupThreadReadRequest,
  markSubscriptionChannelThreadRead as markSubscriptionChannelThreadReadRequest,
  fetchBootstrap,
  inviteGroupMember as inviteGroupMemberRequest,
  inviteManagedChannelMembers as inviteManagedChannelMembersRequest,
  inviteSubscriptionChannelMembers as inviteSubscriptionChannelMembersRequest,
  leaveGroup as leaveGroupRequest,
  leaveSubscriptionChannel as leaveSubscriptionChannelRequest,
  markDialogRead as markDialogReadRequest,
  markGroupRead as markGroupReadRequest,
  markSubscriptionChannelRead as markSubscriptionChannelReadRequest,
  openDirectDialog as openDirectDialogRequest,
  openRealtimeConnection,
  reportContact as reportContactRequest,
  reportMediaAttachment as reportMediaAttachmentRequest,
  reportSubscriptionChannel as reportSubscriptionChannelRequest,
  removeSubscriptionChannelSubscriber as removeSubscriptionChannelSubscriberRequest,
  registerAccount,
  setDebugPremiumState as setDebugPremiumStateRequest,
  registerUserGif,
  requestAuthCode,
  saveSnapshot,
  searchUserGifs as searchUserGifsRequest,
  searchDiscoveryResults as searchDiscoveryResultsRequest,
  setDialogFavorite as setDialogFavoriteRequest,
  setDialogPinnedMessage as setDialogPinnedMessageRequest,
  sendDirectMessage as sendDirectMessageRequest,
  sendGroupMessage as sendGroupMessageRequest,
  sendManagedChannelPost as sendManagedChannelPostRequest,
  sendGroupThreadComment as sendGroupThreadCommentRequest,
  sendSubscriptionChannelThreadComment as sendSubscriptionChannelThreadCommentRequest,
  subscribeToGroupThread as subscribeToGroupThreadRequest,
  subscribeToSubscriptionChannelThread as subscribeToSubscriptionChannelThreadRequest,
  unsubscribeFromGroupThread as unsubscribeFromGroupThreadRequest,
  unsubscribeFromSubscriptionChannelThread as unsubscribeFromSubscriptionChannelThreadRequest,
  updateDialog as updateDialogRequest,
  updateGroup as updateGroupRequest,
  updateManagedChannel as updateManagedChannelRequest,
  updateSubscriptionChannel as updateSubscriptionChannelRequest,
  updateSession as updateSessionRequest,
  uploadMediaFile,
  verifyAuthCode,
} from './app/backend'
import { configureAnalyticsRuntime, trackAnalyticsEvent } from './app/analytics'
import {
  getBrowserNotificationStatus,
  requestBrowserNotificationPermission,
  showBrowserNotification,
  type BrowserNotificationStatus,
} from './app/browserNotifications'
import {
  buildUserGifRegistrationBodyFromAttachment,
  buildUserGifRegistrationBody,
  duplicateUserGifMessage,
  findDuplicateUserGif,
  readGifDimensions,
  validateGifUploadFile,
} from './app/gifLibrary'
import type { ClientRuntimeConfigResponse } from './shared/backend'
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
  MessageAttachment,
  ReplyTarget,
  SearchResult,
  Session,
  SettingsView,
  StageView,
  SubscriptionChannel,
  ThreadComment,
  ThreadInboxItem,
  TopListView,
  UserGifLibraryItem,
} from './app/types'
import { useCaptcha } from './app/useCaptcha'
import { scheduleActionAnchor, useAnchoredMenu } from './app/useAnchoredMenu'
import {
  formatMessagePreview,
  formatChannelAvatarLabel,
  formatContactStatus,
  formatGroupLatestAuthor,
  formatGroupPreview,
  formatGroupTime,
  insertComposerTextAtCursor,
  formatNowTime,
  formatSessionName,
  formatSubscriptionChannelReaders,
  formatSubscriptionChannelSubscribers,
  formatSubscriptionChannelTime,
  formatUnreadBadgeCount,
  buildChannelDirectLinkFromTitle,
  ensureUniqueChannelDirectLink,
  formatAttachmentSize,
  getChannelVisibilityDescription,
  getChannelVisibilityLabel,
  getNextChannelVisibility,
  getPremiumDaysLeft,
  hasActivePremium,
  isPhoneQuery,
  makePremiumExpiry,
  makeDraftChannel,
  matchesQuery,
  moveUnreadItemsFirst,
  normalizeIdentifier,
  normalizeNickname,
  normalizePremiumExpiry,
  isImageMimeType,
  sanitizeChannelDirectLink,
  sanitizeChannelDescription,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
  scrollFeedChildIntoView,
  shouldSubmitComposerWithEnter,
  sortChatsByRecentActivity,
  sortGroupsByRecentActivity,
  sortSubscriptionChannelsByRecentActivity,
} from './app/utils'
import { EmojiPicker } from './components/EmojiPicker'
import { AuthScreen } from './screens/AuthScreen'
import { ConfirmLogoutScreen } from './screens/ConfirmLogoutScreen'
import { DirectChatRoom } from './rooms/DirectChatRoom'
import { GroupRoom } from './rooms/GroupRoom'
import { SubscriptionChannelRoom } from './rooms/SubscriptionChannelRoom'
import { BubbleImageOverlayMeta, BubbleMessageContent } from './components/BubbleMessageContent'
import { AttachedReplyBubble } from './components/AttachedReplyBubble'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { ComposerAttachmentPicker } from './components/ComposerAttachmentPicker'
import { ComposerAttachmentPreview } from './components/ComposerAttachmentPreview'
import { MediaViewerOverlay } from './components/MediaViewerOverlay'
import { SelectedBubbleOverlay } from './components/SelectedBubbleOverlay'
import { useCookieConsent } from './app/useCookieConsent'
import {
  type PendingAttachmentDraft,
  type PendingDirectMessage,
  type PendingGroupMessage,
  usePendingMessageOutbox,
} from './app/usePendingMessageOutbox'
import type {
  AppSnapshot,
  ComplaintReason,
  CreateGroupBody,
  CreateManagedChannelBody,
  SendManagedChannelPostBody,
  UpdateManagedChannelBody,
  UpdateGroupBody,
  UpdateSubscriptionChannelBody,
  UpdateSessionBody,
} from './shared/backend'
import './App.css'

const deliveryIndicatorIconPaths = [
  '/icons/hourglass-48.png',
  '/icons/warning-48.png',
  '/icons/double-tick-50.png',
]

const contactComplaintReasonOptions: Array<{ label: string; value: ComplaintReason }> = [
  { label: 'Спам', value: 'spam' },
  { label: 'Обман', value: 'fraud' },
  { label: 'Очень неприятно', value: 'very_unpleasant' },
]

const blockedAuthNoticeMessage =
  'На ваш аккаунт поступило много жалоб, поэтому вход временно заблокирован. Если произошла ошибка, напишите в поддержку и укажите email: devisjjones@gmail.com'

type BrowserNotificationTarget =
  | {
      kind: 'chat'
      chatId: number
    }
  | {
      kind: 'group'
      groupId: number
    }
  | {
      kind: 'channel'
      channelId: number
    }
  | {
      item: ThreadInboxItem
      kind: 'thread'
    }

type BrowserNotificationDigestEntry = {
  body: string
  target: BrowserNotificationTarget
  title: string
  unread: number
}

type BrowserNotificationDigest = Map<string, BrowserNotificationDigestEntry>

type ProfileSettingsDraft = Pick<
  Session,
  'displayName' | 'surname' | 'nickname' | 'status' | 'avatarImage' | 'soundsDisabled'
>

function getSyntheticChannelId(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }

  return -Math.max(1, Math.abs(hash))
}

const jumpSoundPath = '/sfx/jump.wav'
const takeSoundPath = '/sfx/take.wav'

function buildProfileSettingsDraft(session: Session): ProfileSettingsDraft {
  return {
    avatarImage: session.avatarImage,
    displayName: session.displayName,
    nickname: session.nickname ?? '',
    soundsDisabled: Boolean(session.soundsDisabled),
    status: session.status ?? '',
    surname: session.surname ?? '',
  }
}

function buildBrowserNotificationDigest(
  chats: Chat[],
  groups: GroupPreview[],
  subscriptionChannels: SubscriptionChannel[],
  threadInbox: ThreadInboxItem[],
): BrowserNotificationDigest {
  const digest = new Map<string, BrowserNotificationDigestEntry>()

  chats.forEach((chat) => {
    digest.set(`chat:${chat.id}`, {
      body: 'Новое сообщение',
      target: {
        chatId: chat.id,
        kind: 'chat',
      },
      title: chat.title,
      unread: chat.unread,
    })
  })

  groups.forEach((group) => {
    digest.set(`group:${group.id}`, {
      body: 'Новое сообщение в группе',
      target: {
        groupId: group.id,
        kind: 'group',
      },
      title: group.title,
      unread: group.unread,
    })
  })

  subscriptionChannels.forEach((channel) => {
    digest.set(`channel:${channel.id}`, {
      body: 'Новый пост в канале',
      target: {
        channelId: channel.id,
        kind: 'channel',
      },
      title: channel.title,
      unread: channel.unread,
    })
  })

  threadInbox.forEach((item) => {
    digest.set(`thread:${item.threadId}`, {
      body: item.kind === 'group' ? 'Новый ответ в треде' : 'Новый комментарий к посту',
      target: {
        item,
        kind: 'thread',
      },
      title: item.kind === 'group' ? item.groupTitle : item.channelTitle,
      unread: item.unreadCount,
    })
  })

  return digest
}

function loadBrowserNotificationsEnabledPreference() {
  if (typeof window === 'undefined') return true

  const storedValue = window.localStorage.getItem(browserNotificationsEnabledStorageKey)
  if (storedValue === null) return true

  return storedValue === 'true'
}

function buildGroupParticipantFromChat(chat: Chat, participantId?: number): GroupParticipant {
  return {
    accent: chat.accent,
    favorite: chat.pinned,
    id: participantId ?? chat.id,
    identifier: chat.phone,
    nickname: chat.handle.replace(/^@+/u, ''),
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
    identifier: undefined,
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
    avatarImage: channel.avatarImage,
    commentBlacklistIdentifiers: channel.commentBlacklistIdentifiers ?? [],
    commentsEnabledForAll: channel.commentsEnabledForAll ?? false,
    commentsEnabledForPremium: channel.commentsEnabledForPremium ?? false,
    draft: channel.status === 'draft',
    handle: channel.directLink,
    id: getSyntheticChannelId(`managed-preview:${channel.directLink}:${channel.title}`),
    latestActivityAt: undefined,
    participants: [],
    posts: [],
    preview: channel.description,
    readers: 1,
    statusText: channel.description,
    time: '',
    title: channel.title,
    unread: 0,
    visibility: channel.visibility,
  }
}

function hasRoomThreadsEnabled(
  target: Pick<GroupPreview | SubscriptionChannel | Channel, 'commentsEnabledForAll' | 'commentsEnabledForPremium'>,
) {
  return Boolean(target.commentsEnabledForAll || target.commentsEnabledForPremium)
}

function getThreadsDisabledNoticeText(target: 'group' | 'channel') {
  return target === 'channel' ? 'В канале выключены комментарии.' : 'В группе выключены комментарии.'
}

function isRoomCommentsBlacklisted(
  target: Pick<GroupPreview | SubscriptionChannel | Channel, 'commentBlacklistIdentifiers'>,
  identifier: string | undefined,
) {
  const normalizedIdentifier = normalizeIdentifier(identifier ?? '')
  return (target.commentBlacklistIdentifiers ?? []).some(
    (candidate) => normalizeIdentifier(candidate) === normalizedIdentifier,
  )
}

function getRoomCommentBlockReason(
  target: Pick<
    GroupPreview | SubscriptionChannel | Channel,
    'commentBlacklistIdentifiers' | 'commentsEnabledForAll' | 'commentsEnabledForPremium'
  >,
  session: Session | null,
  roomLabel: 'группы' | 'канала',
) {
  if (isRoomCommentsBlacklisted(target, session?.identifier)) {
    return `Вы не можете отправлять сообщения. Вы в чёрном списке ${roomLabel}.`
  }

  if (target.commentsEnabledForPremium) {
    return hasActivePremium(session?.premium, session?.premiumExpiresAt)
      ? null
      : 'Комментарии доступны только премиум-пользователям.'
  }

  if (target.commentsEnabledForAll) {
    return null
  }

  return roomLabel === 'канала' ? 'Комментарии в канале выключены.' : 'Комментарии в группе выключены.'
}

function matchesExactSearchCandidate(value: string | undefined, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return value?.trim().toLowerCase().startsWith(normalizedQuery) ?? false
}

type ChannelAvatarPickerTarget =
  | { scope: 'create' }
  | { scope: 'existing'; channelId: number }

type ChannelAvatarDraft = {
  kind: 'stock' | 'upload' | 'uploaded'
  label: string
  previewUrl: string
  attachment?: MessageAttachment
  file?: File
}

type BlacklistManagerTarget =
  | {
      kind: 'group'
      scope: 'create'
    }
  | {
      kind: 'group'
      groupId: number
      scope: 'existing'
    }
  | {
      kind: 'channel'
      scope: 'create'
    }
  | {
      channelId: number
      kind: 'channel'
      scope: 'existing'
    }

function buildDefaultGroupTitle(session: Session | null) {
  return `Группа: ${session ? formatSessionName(session) : 'создатель группы'}`
}

function buildLocalGroupHandle(groupId: number) {
  return `@group_${groupId}`
}

function cloneManagedChannel(channel: Channel): Channel {
  return {
    ...channel,
    commentBlacklistIdentifiers: [...(channel.commentBlacklistIdentifiers ?? [])],
  }
}

function areStringListsEqual(left: string[] | undefined, right: string[] | undefined) {
  const leftValue = left ?? []
  const rightValue = right ?? []

  return (
    leftValue.length === rightValue.length &&
    leftValue.every((value, index) => value === rightValue[index])
  )
}

const PENDING_MESSAGE_RETRY_INTERVAL_MS = 2000
const OUTGOING_CONFIRMATION_WINDOW_MS = 30_000
const defaultClientRuntimeConfig: ClientRuntimeConfigResponse = {
  analytics: {
    enabled: false,
    flushIntervalMs: 5000,
    maxBatchSize: 20,
    provider: 'disabled',
  },
  admin: {
    bannerLabel: 'DEVELOPMENT',
    enabled: false,
    environment: 'development',
    hosts: [],
  },
  captcha: {
    enabled: false,
    provider: 'disabled',
    siteKey: null,
  },
}

type PendingGroupThreadComment = {
  attachment?: Message['attachment']
  attachmentDraft?: PendingAttachmentDraft
  authorIdentifier?: string
  createdAt: string
  deliveryId?: string
  displayAuthor?: string
  groupId: number
  localId: number
  messageId: number
  replyTo?: Message['replyTo']
  text: string
  time: string
}

type PendingChannelThreadComment = {
  attachment?: Message['attachment']
  attachmentDraft?: PendingAttachmentDraft
  authorIdentifier?: string
  channelId: number
  createdAt: string
  deliveryId?: string
  displayAuthor?: string
  localId: number
  postId: number
  replyTo?: Message['replyTo']
  text: string
  time: string
}

function areReplyTargetsEqual(
  left?: Message['replyTo'] | ThreadComment['replyTo'],
  right?: Message['replyTo'] | ThreadComment['replyTo'],
) {
  if (!left && !right) return true
  if (!left || !right) return false

  return left.id === right.id && left.author === right.author && left.text === right.text
}

function areMessageAttachmentsEquivalent(
  left?: Message['attachment'],
  right?: Message['attachment'],
) {
  if (!left && !right) return true
  if (!left || !right) return false

  return (
    left.fileName === right.fileName &&
    left.mimeType === right.mimeType &&
    left.size === right.size
  )
}

function areOutgoingTimestampsClose(
  localCreatedAt?: string,
  confirmedCreatedAt?: string,
  localTime?: string,
  confirmedTime?: string,
) {
  if (localCreatedAt && confirmedCreatedAt) {
    return Math.abs(Date.parse(localCreatedAt) - Date.parse(confirmedCreatedAt)) <= OUTGOING_CONFIRMATION_WINDOW_MS
  }

  if (!localCreatedAt && !confirmedCreatedAt && localTime && confirmedTime) {
    return localTime === confirmedTime
  }

  return false
}

function matchesOutgoingDirectMessage(localMessage: PendingDirectMessage, confirmedMessage: Message) {
  if (localMessage.deliveryId?.trim() && confirmedMessage.deliveryId?.trim()) {
    return localMessage.deliveryId === confirmedMessage.deliveryId
  }

  return (
    confirmedMessage.author === 'me' &&
    confirmedMessage.text === localMessage.text &&
    areReplyTargetsEqual(confirmedMessage.replyTo, localMessage.replyTo) &&
    areMessageAttachmentsEquivalent(confirmedMessage.attachment, localMessage.attachment) &&
    areOutgoingTimestampsClose(localMessage.createdAt, confirmedMessage.createdAt, localMessage.time, confirmedMessage.time)
  )
}

function matchesOutgoingGroupMessage(localMessage: PendingGroupMessage, confirmedMessage: Message) {
  if (localMessage.deliveryId?.trim() && confirmedMessage.deliveryId?.trim()) {
    return localMessage.deliveryId === confirmedMessage.deliveryId
  }

  return (
    confirmedMessage.author === 'me' &&
    confirmedMessage.text === localMessage.text &&
    areMessageAttachmentsEquivalent(confirmedMessage.attachment, localMessage.attachment) &&
    areOutgoingTimestampsClose(localMessage.createdAt, confirmedMessage.createdAt, localMessage.time, confirmedMessage.time)
  )
}

function matchesOutgoingThreadComment(
  localComment: PendingGroupThreadComment | PendingChannelThreadComment,
  confirmedComment: ThreadComment,
) {
  if (localComment.deliveryId?.trim() && confirmedComment.deliveryId?.trim()) {
    return localComment.deliveryId === confirmedComment.deliveryId
  }

  return (
    confirmedComment.author === 'me' &&
    confirmedComment.text === localComment.text &&
    areMessageAttachmentsEquivalent(confirmedComment.attachment, localComment.attachment) &&
    areReplyTargetsEqual(confirmedComment.replyTo, localComment.replyTo) &&
    areOutgoingTimestampsClose(localComment.createdAt, confirmedComment.createdAt, localComment.time, confirmedComment.time)
  )
}

function filterUnconfirmedOutgoingItems<LocalItem, ConfirmedItem>(
  localItems: LocalItem[],
  confirmedItems: ConfirmedItem[],
  matcher: (localItem: LocalItem, confirmedItem: ConfirmedItem) => boolean,
) {
  if (localItems.length === 0 || confirmedItems.length === 0) {
    return localItems
  }

  const usedConfirmedIndexes = new Set<number>()

  return localItems.filter((localItem) => {
    const matchedIndex = confirmedItems.findIndex(
      (confirmedItem, index) => !usedConfirmedIndexes.has(index) && matcher(localItem, confirmedItem),
    )

    if (matchedIndex === -1) {
      return true
    }

    usedConfirmedIndexes.add(matchedIndex)
    return false
  })
}

function getClientDeliveryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isExpiredSessionError(error: unknown) {
  if (error instanceof ApiError) {
    return error.status === 401
  }

  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.message === 'Не найдена активная сессия.' ||
    error.message === 'Сессия устарела. Войдите снова.' ||
    error.message === 'Сессия не найдена.'
  )
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) {
    return error.message || fallbackMessage
  }

  if (error instanceof Error) {
    return error.message || fallbackMessage
  }

  return fallbackMessage
}

function dedupeChatsByNormalizedPhone(chats: Chat[]) {
  const seenKeys = new Set<string>()

  return chats.filter((chat) => {
    const normalizedPhone = normalizeIdentifier(chat.phone)
    const dedupeKey = normalizedPhone || `dialog:${chat.id}`

    if (seenKeys.has(dedupeKey)) {
      return false
    }

    seenKeys.add(dedupeKey)
    return true
  })
}

function App() {
  const messageFeedRef = useRef<HTMLDivElement | null>(null)
  const threadSourceRef = useRef<HTMLDivElement | null>(null)
  const threadComposerInputRef = useRef<HTMLTextAreaElement | null>(null)
  const channelTitleInputRef = useRef<HTMLInputElement | null>(null)
  const accountNameRef = useRef<HTMLHeadingElement | null>(null)
  const settingsProfileNameRef = useRef<HTMLHeadingElement | null>(null)
  const accountStatusRef = useRef<HTMLParagraphElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const groupAttachmentInputRef = useRef<HTMLInputElement | null>(null)
  const channelAttachmentInputRef = useRef<HTMLInputElement | null>(null)
  const threadAttachmentInputRef = useRef<HTMLInputElement | null>(null)
  const channelsPanelRef = useRef<HTMLDivElement | null>(null)
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const channelAvatarObjectUrlsRef = useRef(new Set<string>())
  const localMessageAttachmentObjectUrlsRef = useRef(new Set<string>())
  const profileAvatarSelectionTokenRef = useRef(0)
  const channelAvatarSelectionTokenRef = useRef(0)
  const groupAvatarSelectionTokenRef = useRef(0)
  const chatAttachmentSelectionTokenRef = useRef(0)
  const groupAttachmentSelectionTokenRef = useRef(0)
  const channelAttachmentSelectionTokenRef = useRef(0)
  const threadAttachmentSelectionTokenRef = useRef(0)
  const nextOptimisticMessageIdRef = useRef(-1)
  const pendingRetryInFlightRef = useRef(false)
  const pendingGroupThreadCommentsRef = useRef<PendingGroupThreadComment[]>([])
  const pendingChannelThreadCommentsRef = useRef<PendingChannelThreadComment[]>([])
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
    threadInbox: ThreadInboxItem[]
  }>({
    channels: initialChannels,
    chats: initialChats,
    groups: initialGroups,
    session: loadSession(),
    subscriptionChannels: initialSubscribedChannels,
    threadInbox: [],
  })
  const pendingChannelPatchesRef = useRef(new Map<number, UpdateManagedChannelBody>())
  const suppressChannelSnapshotSyncRef = useRef(false)
  const previousChatsRef = useRef(initialChats)
  const browserNotificationDigestRef = useRef<BrowserNotificationDigest | null>(null)
  const browserNotificationOpenTargetRef = useRef<(target: BrowserNotificationTarget) => void>(() => {})
  const suppressNextBrowserNotificationDiffRef = useRef(false)
  const previousBrowserNotificationStatusRef = useRef<BrowserNotificationStatus>(
    getBrowserNotificationStatus(),
  )
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
  const [clientRuntimeConfig, setClientRuntimeConfig] = useState<ClientRuntimeConfigResponse>(
    defaultClientRuntimeConfig,
  )
  const [chatMessageDrafts, setChatMessageDrafts] = useState<Record<number, string>>({})
  const [groupMessageDrafts, setGroupMessageDrafts] = useState<Record<number, string>>({})
  const [channelPostDrafts, setChannelPostDrafts] = useState<Record<number, string>>({})
  const [chatAttachmentDrafts, setChatAttachmentDrafts] = useState<Record<number, ComposerAttachmentDraft | undefined>>({})
  const [groupAttachmentDrafts, setGroupAttachmentDrafts] = useState<Record<number, ComposerAttachmentDraft | undefined>>({})
  const [channelAttachmentDrafts, setChannelAttachmentDrafts] = useState<Record<number, ComposerAttachmentDraft | undefined>>({})
  const [threadAttachmentDraft, setThreadAttachmentDraft] = useState<ComposerAttachmentDraft | undefined>(undefined)
  const [mediaViewerAttachment, setMediaViewerAttachment] = useState<MessageAttachment | null>(null)
  const [mediaViewerDownloadEnabled, setMediaViewerDownloadEnabled] = useState(true)
  const [mediaViewerGifActionBusy, setMediaViewerGifActionBusy] = useState(false)
  const [mediaViewerGifAddEnabled, setMediaViewerGifAddEnabled] = useState(false)
  const [mediaViewerReportBusy, setMediaViewerReportBusy] = useState(false)
  const [mediaViewerReportToast, setMediaViewerReportToast] = useState('')
  const [pendingGroupThreadComments, setPendingGroupThreadComments] = useState<PendingGroupThreadComment[]>([])
  const [pendingChannelThreadComments, setPendingChannelThreadComments] = useState<PendingChannelThreadComment[]>([])
  const [activeFilter, setActiveFilter] = useState('Все')
  const [searchOpen, setSearchOpen] = useState(false)
  const [quietMode, setQuietMode] = useState(false)
  const [browserNotificationStatus, setBrowserNotificationStatus] = useState<BrowserNotificationStatus>(
    () => getBrowserNotificationStatus(),
  )
  const [browserNotificationsBannerDismissed, setBrowserNotificationsBannerDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.localStorage.getItem(browserNotificationsBannerDismissedStorageKey) === 'true'
    )
  })
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() =>
    loadBrowserNotificationsEnabledPreference(),
  )
  const [authStep, setAuthStep] = useState<AuthStep>('phone')
  const [displayName, setDisplayName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [authExistingAccount, setAuthExistingAccount] = useState<Pick<Account, 'displayName' | 'surname'> | null>(null)
  const [authBlockedNoticeOpen, setAuthBlockedNoticeOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [profileSettingsDraft, setProfileSettingsDraft] = useState<ProfileSettingsDraft | null>(() => {
    const storedSession = loadSession()
    return storedSession ? buildProfileSettingsDraft(storedSession) : null
  })
  const [profileSettingsBusy, setProfileSettingsBusy] = useState(false)
  const [profileSettingsError, setProfileSettingsError] = useState('')
  const [confirmProfileSettingsLeaveOpen, setConfirmProfileSettingsLeaveOpen] = useState(false)
  const [backendReady, setBackendReady] = useState(false)
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [bottomSection, setBottomSection] = useState<'chats' | 'contacts'>('chats')
  const [chatActionsOpen, setChatActionsOpen] = useState(false)
  const [blockedActionChatId, setBlockedActionChatId] = useState<number | null>(null)
  const [premiumGiftChatId, setPremiumGiftChatId] = useState<number | null>(null)
  const [premiumDebugAutoCheckout, setPremiumDebugAutoCheckout] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(premiumDebugAutoCheckoutStorageKey) === 'true'
  })
  const [photoSendOriginalPreference, setPhotoSendOriginalPreference] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem(messagePhotoSendOriginalPreferenceStorageKey) === 'true'
  })
  const [premiumPurchaseBusy, setPremiumPurchaseBusy] = useState(false)
  const [messageActionMessageId, setMessageActionMessageId] = useState<number | null>(null)
  const [forwardingMessageId, setForwardingMessageId] = useState<number | null>(null)
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [confirmingDeleteHistoryChatId, setConfirmingDeleteHistoryChatId] = useState<number | null>(
    null,
  )
  const [confirmingDeleteContactChatId, setConfirmingDeleteContactChatId] = useState<number | null>(
    null,
  )
  const [reportingChatId, setReportingChatId] = useState<number | null>(null)
  const [reportContactBusy, setReportContactBusy] = useState(false)
  const [reportContactError, setReportContactError] = useState('')
  const [reportContactSuccessOpen, setReportContactSuccessOpen] = useState(false)
  const [confirmingDeleteMessageId, setConfirmingDeleteMessageId] = useState<number | null>(null)
  const [confirmingLeaveGroupId, setConfirmingLeaveGroupId] = useState<number | null>(null)
  const [confirmingDeleteChannelId, setConfirmingDeleteChannelId] = useState<number | null>(null)
  const [managedChannelLimitErrorOpen, setManagedChannelLimitErrorOpen] = useState(false)
  const [transferringChannelId, setTransferringChannelId] = useState<number | null>(null)
  const [channelTransferTargetChatId, setChannelTransferTargetChatId] = useState<number | null>(null)
  const [channelTransferCode, setChannelTransferCode] = useState('')
  const [channelTransferError, setChannelTransferError] = useState('')
  const [channelTransferSearch, setChannelTransferSearch] = useState('')
  const [channelPostBusy, setChannelPostBusy] = useState(false)
  const [channelPostError, setChannelPostError] = useState('')
  const [channelPostReplyTarget, setChannelPostReplyTarget] = useState<ReplyTarget | null>(null)
  const [deferredRoomScrollTarget, setDeferredRoomScrollTarget] = useState<
    | {
        id: number
        kind: 'channel-post' | 'direct-message' | 'group-message'
      }
    | null
  >(null)
  const [creatingChannelTitle, setCreatingChannelTitle] = useState('')
  const [creatingChannelDirectLink, setCreatingChannelDirectLink] = useState('')
  const [creatingChannelDirectLinkDirty, setCreatingChannelDirectLinkDirty] = useState(false)
  const [creatingChannelDescription, setCreatingChannelDescription] = useState('')
  const [creatingChannelAvatarTone, setCreatingChannelAvatarTone] = useState(channelAvatarTones[0])
  const [creatingChannelAvatarDraft, setCreatingChannelAvatarDraft] = useState<ChannelAvatarDraft | null>(
    null,
  )
  const [creatingChannelCommentsForAll, setCreatingChannelCommentsForAll] = useState(false)
  const [creatingChannelCommentsForPremium, setCreatingChannelCommentsForPremium] = useState(false)
  const [creatingChannelBlacklistIdentifiers, setCreatingChannelBlacklistIdentifiers] = useState<string[]>([])
  const [channelInviteChatIds, setChannelInviteChatIds] = useState<number[]>([])
  const [channelInviteBusy, setChannelInviteBusy] = useState(false)
  const [channelInviteError, setChannelInviteError] = useState('')
  const [groupCreateOpen, setGroupCreateOpen] = useState(false)
  const [creatingGroupTitle, setCreatingGroupTitle] = useState('')
  const [creatingGroupAccent, setCreatingGroupAccent] = useState(channelAvatarTones[0])
  const [creatingGroupAvatarDraft, setCreatingGroupAvatarDraft] = useState<ChannelAvatarDraft | null>(
    null,
  )
  const [creatingGroupCommentsForAll, setCreatingGroupCommentsForAll] = useState(false)
  const [creatingGroupCommentsForPremium, setCreatingGroupCommentsForPremium] = useState(false)
  const [creatingGroupBlacklistIdentifiers, setCreatingGroupBlacklistIdentifiers] = useState<string[]>([])
  const [creatingGroupMemberChatIds, setCreatingGroupMemberChatIds] = useState<number[]>([])
  const [creatingGroupBusy, setCreatingGroupBusy] = useState(false)
  const [creatingGroupError, setCreatingGroupError] = useState('')
  const [creatingGroupSelectionHint, setCreatingGroupSelectionHint] = useState('')
  const [groupManagementOpen, setGroupManagementOpen] = useState(false)
  const [groupTransferOwnerOpen, setGroupTransferOwnerOpen] = useState(false)
  const [blacklistManagerTarget, setBlacklistManagerTarget] = useState<BlacklistManagerTarget | null>(null)
  const [blacklistAddMode, setBlacklistAddMode] = useState(false)
  const [blacklistSearchQuery, setBlacklistSearchQuery] = useState('')
  const [groupAvatarPickerOpen, setGroupAvatarPickerOpen] = useState(false)
  const [groupAvatarPickerDraft, setGroupAvatarPickerDraft] = useState<ChannelAvatarDraft | null>(null)
  const [groupAvatarPickerError, setGroupAvatarPickerError] = useState('')
  const [, setGroupAvatarPickerMode] = useState<'none' | 'stock' | 'device'>('none')
  const [groupAvatarPickerBusy, setGroupAvatarPickerBusy] = useState(false)
  const [profileAvatarPickerOpen, setProfileAvatarPickerOpen] = useState(false)
  const [profileAvatarPickerDraft, setProfileAvatarPickerDraft] = useState<ChannelAvatarDraft | null>(null)
  const [profileAvatarPickerError, setProfileAvatarPickerError] = useState('')
  const [profileAvatarPickerBusy, setProfileAvatarPickerBusy] = useState(false)
  const [, setProfileAvatarPickerMode] = useState<'none' | 'stock' | 'device'>('none')
  const [channelAvatarPickerTarget, setChannelAvatarPickerTarget] = useState<ChannelAvatarPickerTarget | null>(
    null,
  )
  const [channelAvatarPickerDraft, setChannelAvatarPickerDraft] = useState<ChannelAvatarDraft | null>(null)
  const [channelAvatarPickerError, setChannelAvatarPickerError] = useState('')
  const [channelAvatarPickerBusy, setChannelAvatarPickerBusy] = useState(false)
  const [, setChannelAvatarPickerMode] = useState<'none' | 'stock' | 'device'>('none')
  const [channelSettingsBusy, setChannelSettingsBusy] = useState(false)
  const [channelSettingsError, setChannelSettingsError] = useState('')
  const [channelSettingsDirtyVersion, setChannelSettingsDirtyVersion] = useState(0)
  const [channelSettingsBaseline, setChannelSettingsBaseline] = useState<Channel | null>(null)
  const [confirmChannelSettingsLeaveOpen, setConfirmChannelSettingsLeaveOpen] = useState(false)
  const [pendingAvatarPostPrompt, setPendingAvatarPostPrompt] = useState<{
    attachment: MessageAttachment
    channelId: number
    exitAfterSave: boolean
  } | null>(null)
  const [pendingAvatarPostCaption, setPendingAvatarPostCaption] = useState('')
  const [recentChannelAvatarSelection, setRecentChannelAvatarSelection] = useState<{
    attachment: MessageAttachment
    channelId: number
    mediaUrl: string
  } | null>(null)
  const [editingChannelTitleId, setEditingChannelTitleId] = useState<number | null>(null)
  const [editingChannelTitleValue, setEditingChannelTitleValue] = useState('')
  const [channelManagementOpenId, setChannelManagementOpenId] = useState<number | null>(null)
  const [topListView, setTopListView] = useState<TopListView>('none')
  const [copyHintText, setCopyHintText] = useState('')
  const [discoveryResults, setDiscoveryResults] = useState(initialDiscoveryResults)
  const [threadInbox, setThreadInbox] = useState<ThreadInboxItem[]>([])
  const [liveSearchState, setLiveSearchState] = useState<{
    query: string
    results: SearchResult[]
  } | null>(null)
  const [subscriptionChannels, setSubscriptionChannels] = useState(initialSubscribedChannels)
  const [groups, setGroups] = useState(initialGroups)
  const [activeSubscriptionChannelId, setActiveSubscriptionChannelId] = useState<number | null>(null)
  const [previewSubscriptionChannel, setPreviewSubscriptionChannel] = useState<SubscriptionChannel | null>(null)
  const [channelActionsAnchor, setChannelActionsAnchor] = useState<ActionAnchor | null>(null)
  const [channelShareOpen, setChannelShareOpen] = useState(false)
  const [channelShareBusy, setChannelShareBusy] = useState(false)
  const [channelShareError, setChannelShareError] = useState('')
  const [channelShareChatIds, setChannelShareChatIds] = useState<number[]>([])
  const [channelReportOpen, setChannelReportOpen] = useState(false)
  const [channelReportBusy, setChannelReportBusy] = useState(false)
  const [channelReportError, setChannelReportError] = useState('')
  const [channelReportSuccessOpen, setChannelReportSuccessOpen] = useState(false)
  const [confirmingLeaveSubscriptionChannelId, setConfirmingLeaveSubscriptionChannelId] = useState<number | null>(null)
  const [channelSubscribersOpen, setChannelSubscribersOpen] = useState(false)
  const [channelSubscribersSearchQuery, setChannelSubscribersSearchQuery] = useState('')
  const [selectedChannelSubscriberIdentifier, setSelectedChannelSubscriberIdentifier] = useState<string | null>(null)
  const [confirmingRemoveChannelSubscriberIdentifier, setConfirmingRemoveChannelSubscriberIdentifier] = useState<string | null>(null)
  const [confirmingBlacklistChannelSubscriberIdentifier, setConfirmingBlacklistChannelSubscriberIdentifier] = useState<string | null>(null)
  const [channelSubscriberActionBusy, setChannelSubscriberActionBusy] = useState(false)
  const [channelSubscriberActionError, setChannelSubscriberActionError] = useState('')
  const [groupParticipantsOpen, setGroupParticipantsOpen] = useState(false)
  const [groupActionsAnchor, setGroupActionsAnchor] = useState<ActionAnchor | null>(null)
  const [groupInviteOpen, setGroupInviteOpen] = useState(false)
  const [groupInviteBusy, setGroupInviteBusy] = useState(false)
  const [groupInviteError, setGroupInviteError] = useState('')
  const [groupInviteLimitNoticeOpen, setGroupInviteLimitNoticeOpen] = useState(false)
  const [groupReportNoticeOpen, setGroupReportNoticeOpen] = useState(false)
  const [threadsDisabledHintTarget, setThreadsDisabledHintTarget] = useState<'group-message' | 'channel-post' | null>(
    null,
  )
  const [messageActionAnchor, setMessageActionAnchor] = useState<ActionAnchor | null>(null)
  const { cookieConsent, updateCookieConsent } = useCookieConsent()
  const {
    captchaBusy,
    captchaContainerRef,
    captchaProvider,
    captchaRequired,
    getCaptchaTokenOrThrow,
    resetCaptcha,
  } = useCaptcha(clientRuntimeConfig.captcha, !session)
  const {
    blacklistHintTarget,
    clearBlacklistHint,
    closeBlacklistConfirmation,
    confirmBlacklistTarget: confirmBlacklistTargetFlow,
    confirmingBlacklistTarget,
    openBlacklistConfirmation,
    resetBlacklistFlow,
    showBlacklistHint,
  } = useBlacklistFlow()
  const {
    clearPendingDirectMessagesForChat,
    clearPendingMessages,
    getDirectMessageDeliveryIssue,
    getGroupMessageDeliveryIssue,
    hasLocalOutboxMessages,
    hasPendingOutgoingMessages,
    markPendingDirectMessageAttemptFailed,
    markPendingDirectMessageSending,
    markPendingGroupMessageAttemptFailed,
    markPendingGroupMessageSending,
    pendingDirectMessages,
    pendingDirectMessagesRef,
    pendingGroupMessages,
    pendingGroupMessagesRef,
    queuePendingDirectMessage,
    queuePendingGroupMessage,
    removePendingDirectMessage,
    removePendingGroupMessage,
    restorePersistedFailedMessages,
    updatePendingDirectMessage,
    updatePendingGroupMessage,
  } = usePendingMessageOutbox(session?.identifier)
  useEffect(() => {
    pendingGroupThreadCommentsRef.current = pendingGroupThreadComments
  }, [pendingGroupThreadComments])

  useEffect(() => {
    pendingChannelThreadCommentsRef.current = pendingChannelThreadComments
  }, [pendingChannelThreadComments])

  useEffect(() => {
    if (session?.sessionToken) return

    setPendingGroupThreadComments([])
    setPendingChannelThreadComments([])
  }, [session?.sessionToken])

  const queuePendingGroupThreadComment = useCallback((comment: PendingGroupThreadComment) => {
    setPendingGroupThreadComments((currentComments) => [...currentComments, comment])
  }, [])

  const queuePendingChannelThreadComment = useCallback((comment: PendingChannelThreadComment) => {
    setPendingChannelThreadComments((currentComments) => [...currentComments, comment])
  }, [])

  const removePendingGroupThreadComment = useCallback((localId: number) => {
    setPendingGroupThreadComments((currentComments) =>
      currentComments.filter((comment) => comment.localId !== localId),
    )
  }, [])

  const removePendingChannelThreadComment = useCallback((localId: number) => {
    setPendingChannelThreadComments((currentComments) =>
      currentComments.filter((comment) => comment.localId !== localId),
    )
  }, [])
  const {
    closeGroupSettingsDialog,
    confirmGroupSettingsLeaveOpen,
    confirmGroupSettingsLeaveWithDiscard,
    confirmGroupSettingsLeaveWithSave,
    dismissGroupSettingsLeaveConfirm,
    groupSettingsBusy,
    groupSettingsDirty,
    groupSettingsDraft,
    groupSettingsError,
    groupSettingsOpen,
    openGroupSettingsDialog,
    requestGroupSettingsLeave,
    resetGroupSettingsState,
    saveGroupSettings,
    updateGroupSettingsDraft,
  } = useGroupSettingsFlow({
    activeGroupId,
    applyGroupSettingsPatch,
    closeGroupActions,
    groups,
    setGroupManagementOpen,
    setGroupTransferOwnerOpen,
  })
  const {
    activeGroupMessageId,
    activeSubscriptionPostId,
    clearSubscriptionPostDeleteConfirmation,
    clearGroupMessageDeleteConfirmation,
    clearGroupMessageForwarding,
    clearSubscriptionPostForwarding,
    closeGroupMessageActions: closeRoomGroupMessageActions,
    closeSubscriptionPostActions: closeRoomSubscriptionPostActions,
    confirmingDeleteSubscriptionPostId,
    confirmingDeleteGroupMessageId,
    forwardingGroupMessageText,
    forwardingSubscriptionPostText,
    groupMessageActionAnchor,
    openGroupMessageActions,
    openSubscriptionPostActions,
    requestSubscriptionPostDelete,
    requestGroupMessageDelete,
    resetGroupMessageActions,
    resetRoomMessageActions,
    resetSubscriptionPostActions,
    startGroupMessageForwarding,
    startSubscriptionPostForwarding,
    subscriptionPostActionAnchor,
  } = useRoomMessageActions()
  const {
    clearThreadDeleteConfirmation,
    clearThreadForwarding,
    clearThreadReplyTarget,
    closeThreadCommentActions: closeThreadFlowCommentActions,
    closeThreadView: closeThreadFlowView,
    confirmingDeleteThreadCommentId,
    forwardingThreadCommentText,
    openThread,
    openThreadCommentActions: openThreadFlowCommentActions,
    replyToThreadComment: beginThreadReply,
    requestThreadCommentDelete: requestThreadCommentDeleteFlow,
    resetThreadComposer,
    resetThreadState,
    setForwardingThreadCommentText,
    setThreadBusy,
    setThreadDraft,
    setThreadError,
    threadBusy,
    threadCommentActionAnchor,
    threadCommentActionId,
    threadDraft,
    threadError,
    threadReplyTarget,
    threadTarget,
    threadTargetKind,
  } = useThreadFlow()

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

  useEffect(() => {
    let cancelled = false

    void fetchClientRuntimeConfig()
      .then((nextConfig) => {
        if (!cancelled) {
          setClientRuntimeConfig(nextConfig)
        }
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Failed to fetch client runtime config', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    configureAnalyticsRuntime({
      consentGranted: cookieConsent === 'analytics',
      enabled: clientRuntimeConfig.analytics.enabled,
      flushIntervalMs: clientRuntimeConfig.analytics.flushIntervalMs,
      maxBatchSize: clientRuntimeConfig.analytics.maxBatchSize,
      sessionToken: session?.sessionToken ?? null,
    })
  }, [
    clientRuntimeConfig.analytics.enabled,
    clientRuntimeConfig.analytics.flushIntervalMs,
    clientRuntimeConfig.analytics.maxBatchSize,
    cookieConsent,
    session?.sessionToken,
  ])

  useEffect(() => {
    if (cookieConsent !== 'analytics') return

    trackAnalyticsEvent('analytics_consent_granted', {
      source: 'cookie-banner',
    })
  }, [cookieConsent])

  useEffect(() => {
    if (activeGroupId !== null) return

    resetGroupSettingsState()
    setGroupParticipantsOpen(false)
    setGroupActionsAnchor(null)
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteLimitNoticeOpen(false)
    setGroupReportNoticeOpen(false)
    setThreadsDisabledHintTarget(null)
    setConfirmingLeaveGroupId(null)
    if (threadTargetKind === 'group') {
      resetThreadState()
      resetBlacklistFlow()
    }
  }, [activeGroupId, resetBlacklistFlow, resetGroupSettingsState, resetThreadState, threadTargetKind])

  useEffect(() => {
    if (activeSubscriptionChannelId !== null || previewSubscriptionChannel !== null) return

    setChannelActionsAnchor(null)
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelShareChatIds([])
    setChannelSubscribersOpen(false)
    setChannelSubscribersSearchQuery('')
    setSelectedChannelSubscriberIdentifier(null)
    setConfirmingRemoveChannelSubscriberIdentifier(null)
    setConfirmingBlacklistChannelSubscriberIdentifier(null)
    setChannelSubscriberActionBusy(false)
    setChannelSubscriberActionError('')
    setChannelReportOpen(false)
    setChannelReportBusy(false)
    setChannelReportError('')
    setChannelReportSuccessOpen(false)
    setChannelPostBusy(false)
    setChannelPostError('')
    setChannelPostReplyTarget(null)
    setThreadsDisabledHintTarget(null)
    setConfirmingLeaveSubscriptionChannelId(null)
    if (threadTargetKind === 'channel') {
      resetThreadState()
      resetBlacklistFlow()
    }
  }, [activeSubscriptionChannelId, previewSubscriptionChannel, resetBlacklistFlow, resetThreadState, threadTargetKind])

  const blockedContactIds = session?.blockedContactIds ?? []
  const availableChats = dedupeChatsByNormalizedPhone(
    sortChatsByRecentActivity(
      chats.filter((chat) => !blockedContactIds.includes(chat.id)),
    ),
  )
  const creatableGroupChats = availableChats.filter(
    (chat) => normalizeIdentifier(chat.phone) !== normalizeIdentifier(session?.identifier ?? ''),
  )
  const blockedChats = dedupeChatsByNormalizedPhone(
    sortChatsByRecentActivity(
      chats.filter((chat) => blockedContactIds.includes(chat.id)),
    ),
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
  const activeChatAdminBlockNotice = activeChat?.blockedByAdmin
    ? 'Пользователь заблокирован по решению администрации сервиса, обратитесь в поддержку, если возникла ошибка.'
    : null
  const reportingChat =
    reportingChatId === null ? null : chats.find((chat) => chat.id === reportingChatId) ?? null
  const pinnedMessage =
    activeChat?.pinnedMessageId === undefined
      ? null
      : activeChat?.pinnedMessage ??
        activeChat?.messages.find((message) => message.id === activeChat.pinnedMessageId) ??
        null
  const premiumGiftChat =
    premiumGiftChatId === null ? null : chats.find((chat) => chat.id === premiumGiftChatId) ?? null
  const activeChannel =
    activeChannelId === null
      ? null
      : channels.find((channel) => channel.id === activeChannelId) ?? null
  const activeChannelPendingPatch =
    activeChannel && channelSettingsDirtyVersion >= 0
      ? pendingChannelPatchesRef.current.get(activeChannel.id) ?? null
      : null
  const activeChannelSettingsDirty = Boolean(
    activeChannelPendingPatch && Object.keys(activeChannelPendingPatch).length > 0,
  )
  const activeSubscriptionChannel =
    activeSubscriptionChannelId === null
      ? null
      : subscriptionChannels.find((channel) => channel.id === activeSubscriptionChannelId) ?? null
  const currentSubscriptionChannel = previewSubscriptionChannel ?? activeSubscriptionChannel
  const ownedCurrentManagedChannel =
    currentSubscriptionChannel === null
      ? null
      : channels.find(
          (channel) =>
            channel.id === currentSubscriptionChannel.id ||
            sanitizeChannelDirectLink(channel.directLink) ===
              sanitizeChannelDirectLink(currentSubscriptionChannel.handle),
        ) ?? null
  const isCurrentSubscriptionChannelOwner = ownedCurrentManagedChannel !== null
  const actionableSubscriptionChannel = previewSubscriptionChannel ? null : activeSubscriptionChannel
  const currentSubscriptionChannelSubscriberCount = isCurrentSubscriptionChannelOwner
    ? Math.max(1, currentSubscriptionChannel?.participants?.length ?? 0)
    : currentSubscriptionChannel?.readers ?? 0
  const currentSubscriptionChannelSubscriberLabel = formatSubscriptionChannelSubscribers(
    currentSubscriptionChannelSubscriberCount,
  )
  const currentSubscriptionChannelSubscriberIdentifiers = new Set(
    (currentSubscriptionChannel?.participants ?? [])
      .map((participant) => normalizeIdentifier(participant.identifier ?? ''))
      .filter((identifier): identifier is string => Boolean(identifier)),
  )
  const filteredCurrentSubscriptionChannelParticipants = (currentSubscriptionChannel?.participants ?? [])
    .filter((participant) => {
      if (participant.identifier === session?.identifier) return true
      const searchQuery = channelSubscribersSearchQuery.trim()
      if (!searchQuery) return true

      return (
        matchesExactSearchCandidate(participant.title, searchQuery) ||
        matchesExactSearchCandidate(participant.nickname ? `@${participant.nickname}` : '', searchQuery) ||
        matchesExactSearchCandidate(participant.identifier, searchQuery)
      )
    })
    .sort((left, right) => {
      if (left.identifier === session?.identifier && right.identifier !== session?.identifier) {
        return -1
      }
      if (right.identifier === session?.identifier && left.identifier !== session?.identifier) {
        return 1
      }
      return left.title.localeCompare(right.title, 'ru')
    })
  const selectedCurrentSubscriptionChannelSubscriber =
    selectedChannelSubscriberIdentifier === null
      ? null
      : currentSubscriptionChannel?.participants?.find(
          (participant) =>
            normalizeIdentifier(participant.identifier ?? '') === selectedChannelSubscriberIdentifier,
        ) ?? null
  const persistedActiveGroup =
    activeGroupId === null ? null : groups.find((group) => group.id === activeGroupId) ?? null
  const activeGroup = useMemo(() => (
    persistedActiveGroup
      ? {
          ...persistedActiveGroup,
          participants: hydrateGroupParticipants(persistedActiveGroup, chats),
        }
      : null
  ), [chats, persistedActiveGroup])
  const isActiveGroupCreator =
    activeGroup !== null &&
    session !== null &&
    normalizeIdentifier(activeGroup.creatorIdentifier ?? session.identifier) === session.identifier
  const activeGroupCreatorParticipant =
    activeGroup?.participants.find(
      (participant) =>
        normalizeIdentifier(participant.identifier ?? '') ===
        normalizeIdentifier(activeGroup.creatorIdentifier ?? ''),
    ) ?? null
  const activeGroupCreatorChat =
    activeGroup?.creatorIdentifier
      ? chats.find(
          (chat) =>
            normalizeIdentifier(chat.phone) === normalizeIdentifier(activeGroup.creatorIdentifier ?? ''),
        ) ?? null
      : null
  const activeGroupOwnerHasPremium =
    isActiveGroupCreator
      ? hasActivePremium(session?.premium, session?.premiumExpiresAt)
      : Boolean(activeGroupCreatorChat?.premium ?? activeGroupCreatorParticipant?.premium)
  const activeGroupMemberLimit = activeGroupOwnerHasPremium
    ? premiumGroupMemberLimit
    : defaultGroupMemberLimit
  const activeGroupAtMemberLimit =
    activeGroup !== null && activeGroup.participants.length >= activeGroupMemberLimit
  const inviteableGroupChats = activeGroup
    ? availableChats.filter((chat) => {
        const normalizedPhone = normalizeIdentifier(chat.phone)

        return !activeGroup.participants.some(
          (participant) =>
            normalizeIdentifier(participant.identifier ?? '') === normalizedPhone ||
            participant.title === chat.title,
        )
      })
    : []
  const transferableGroupParticipants = activeGroup
    ? activeGroup.participants.filter(
        (participant) =>
          normalizeIdentifier(participant.identifier ?? '') !==
          normalizeIdentifier(activeGroup.creatorIdentifier ?? ''),
      )
    : []
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
  function resolveThreadCommentParticipant(comment: ThreadComment | null) {
    if (!comment?.authorIdentifier) return null

    const normalizedIdentifier = normalizeIdentifier(comment.authorIdentifier)
    const matchingChat =
      availableChats.find((chat) => normalizeIdentifier(chat.phone) === normalizedIdentifier) ??
      chats.find((chat) => normalizeIdentifier(chat.phone) === normalizedIdentifier) ??
      null

    if (threadTarget?.kind === 'group') {
      return (
        activeGroup?.participants.find(
          (participant) =>
            normalizeIdentifier(participant.identifier ?? '') === normalizedIdentifier,
        ) ??
        (matchingChat ? buildGroupParticipantFromChat(matchingChat) : null)
      )
    }

    if (threadTarget?.kind === 'channel') {
      return (
        currentSubscriptionChannel?.participants?.find(
          (participant) =>
            normalizeIdentifier(participant.identifier ?? '') === normalizedIdentifier,
        ) ??
        (matchingChat ? buildGroupParticipantFromChat(matchingChat) : null)
      )
    }

    return null
  }

  function handleThreadComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      threadBusy ||
      (!threadAttachmentDraft && !threadDraft.trim()) ||
      (threadAttachmentDraft ? threadAttachmentDraft.status !== 'ready' : false)
    ) {
      return
    }
    if (
      !shouldSubmitComposerWithEnter({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return
    }

    event.preventDefault()
    void submitThreadComment()
  }
  const activeThreadBlockReason =
    threadTarget?.kind === 'group'
      ? activeGroup
        ? getRoomCommentBlockReason(activeGroup, session, 'группы')
        : null
      : threadTarget?.kind === 'channel'
        ? currentSubscriptionChannel
          ? getRoomCommentBlockReason(currentSubscriptionChannel, session, 'канала')
          : null
        : null
  const subscriptionMenuFallbackHeight =
    currentSubscriptionChannel?.visibility === 'closed' ? channelBlockedMenuHeight : channelActionMenuHeight
  const { menuRef: subscriptionPostMenuRef, style: subscriptionPostMenuStyle } = useAnchoredMenu(
    subscriptionPostActionAnchor,
    channelActionMenuWidth,
    subscriptionMenuFallbackHeight,
  )

  const { menuRef: channelActionsMenuRef, style: channelActionsMenuStyle } = useAnchoredMenu(
    channelActionsAnchor,
    channelActionMenuWidth,
    channelActionMenuHeight,
  )
  const { menuRef: groupMessageMenuRef, style: groupMessageMenuStyle } = useAnchoredMenu(
    groupMessageActionAnchor,
    channelActionMenuWidth,
    channelActionMenuHeight,
  )
  const { menuRef: groupActionsMenuRef, style: groupActionsMenuStyle } = useAnchoredMenu(
    groupActionsAnchor,
    groupActionMenuWidth,
    groupActionMenuHeight,
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
  const { menuRef: threadCommentMenuRef, style: threadCommentMenuStyle } = useAnchoredMenu(
    threadCommentActionAnchor,
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
  const activeSubscriptionChannelPostCount = currentSubscriptionChannel?.posts.length ?? 0
  const isSettingsView = stageView === 'settings'
  const isPremiumView = stageView === 'premium'
  const isChannelsView = stageView === 'channels'
  const isRailVisible = !isSettingsView && !isPremiumView && !isChannelsView
  const isChannelsListView = isChannelsView && channelsView === 'list'
  const isChannelCreateView = isChannelsView && channelsView === 'create'
  const isChannelDetailView = isChannelsView && channelsView === 'detail'
  const isChannelInviteView = isChannelsView && channelsView === 'invite'
  const isChatOpen = stageView === 'main' && activeChat !== null
  const isGroupOpen = stageView === 'main' && activeGroup !== null
  const isSubscriptionChannelOpen = stageView === 'main' && currentSubscriptionChannel !== null
  const isChannelsTopListOpen = topListView === 'channels'
  const isGroupsTopListOpen = topListView === 'groups'
  const isThreadsTopListOpen = topListView === 'threads'
  const isAnyRoomOpen = isChatOpen || isSubscriptionChannelOpen || isGroupOpen
  const loadOlderDirectMessages = useCallback(async (beforeMessageId: number) => {
    if (!backendReady || !session?.sessionToken || !activeChat) {
      return {
        hasMore: false,
        items: [],
      }
    }

    const response = await fetchDirectDialogHistory(session.sessionToken, activeChat.id, beforeMessageId)
    return {
      hasMore: response.hasMore,
      items: response.messages,
    }
  }, [activeChat, backendReady, session?.sessionToken])
  const loadOlderGroupMessages = useCallback(async (beforeMessageId: number) => {
    if (!backendReady || !session?.sessionToken || !activeGroup) {
      return {
        hasMore: false,
        items: [],
      }
    }

    const response = await fetchGroupHistory(session.sessionToken, activeGroup.id, beforeMessageId)
    return {
      hasMore: response.hasMore,
      items: response.messages,
    }
  }, [activeGroup, backendReady, session?.sessionToken])
  const loadOlderChannelPosts = useCallback(async (beforePostId: number) => {
    if (!backendReady || !session?.sessionToken || !currentSubscriptionChannel) {
      return {
        hasMore: false,
        items: [],
      }
    }

    const response = await fetchSubscriptionChannelHistory(
      session.sessionToken,
      currentSubscriptionChannel.id,
      beforePostId,
    )
    return {
      hasMore: response.hasMore,
      items: response.posts,
    }
  }, [backendReady, currentSubscriptionChannel, session?.sessionToken])
  const {
    revealItemById: revealDirectMessageById,
    visibleItems: visibleDirectMessages,
  } = useRoomHistoryWindow({
    feedRef: messageFeedRef,
    hasOlderHistory: Boolean(activeChat?.historyHasMore),
    items: activeChat?.messages ?? [],
    loadOlderPage: !threadTarget && isChatOpen && activeChat ? loadOlderDirectMessages : undefined,
    roomKey: !threadTarget && isChatOpen && activeChat ? `direct:${activeChat.id}` : null,
  })
  const {
    revealItemById: revealGroupMessageById,
    visibleItems: visibleGroupMessages,
  } = useRoomHistoryWindow({
    feedRef: messageFeedRef,
    hasOlderHistory: Boolean(activeGroup?.historyHasMore),
    items: activeGroup?.messages ?? [],
    loadOlderPage: !threadTarget && isGroupOpen && activeGroup ? loadOlderGroupMessages : undefined,
    roomKey: !threadTarget && isGroupOpen && activeGroup ? `group:${activeGroup.id}` : null,
  })
  const {
    revealItemById: revealChannelPostById,
    visibleItems: visibleSubscriptionPosts,
  } = useRoomHistoryWindow({
    feedRef: messageFeedRef,
    hasOlderHistory: Boolean(currentSubscriptionChannel?.historyHasMore),
    items: currentSubscriptionChannel?.posts ?? [],
    loadOlderPage:
      !threadTarget && isSubscriptionChannelOpen && currentSubscriptionChannel
        ? loadOlderChannelPosts
        : undefined,
    roomKey:
      !threadTarget && isSubscriptionChannelOpen && currentSubscriptionChannel
        ? `channel:${currentSubscriptionChannel.id}`
        : null,
  })
  const activeVisibleChatMessageCount = visibleDirectMessages.length
  const activeVisibleGroupMessageCount = visibleGroupMessages.length
  const activeVisibleSubscriptionChannelPostCount = visibleSubscriptionPosts.length
  const activeMessage =
    messageActionMessageId === null
      ? null
      : visibleDirectMessages.find((message) => message.id === messageActionMessageId) ??
        activeChat?.messages.find((message) => message.id === messageActionMessageId) ??
        null
  const forwardingMessage =
    forwardingMessageId === null
      ? null
      : visibleDirectMessages.find((message) => message.id === forwardingMessageId) ??
        activeChat?.messages.find((message) => message.id === forwardingMessageId) ??
        null
  const activeSubscriptionPost =
    activeSubscriptionPostId === null
      ? null
      : visibleSubscriptionPosts.find((post) => post.id === activeSubscriptionPostId) ??
        currentSubscriptionChannel?.posts.find((post) => post.id === activeSubscriptionPostId) ??
        null
  const activeGroupMessage =
    activeGroupMessageId === null
      ? null
      : visibleGroupMessages.find((message) => message.id === activeGroupMessageId) ??
        activeGroup?.messages.find((message) => message.id === activeGroupMessageId) ??
        null
  const activeGroupMessageParticipant = resolveGroupParticipant(activeGroup, activeGroupMessage)
  const activeGroupWriteBlockReason = activeGroup
    ? (isRoomCommentsBlacklisted(activeGroup, session?.identifier)
        ? 'Вы не можете отправлять сообщения. Вы в чёрном списке группы.'
        : null)
    : null
  const threadGroupMessage =
    threadTarget?.kind === 'group' && activeGroup?.id === threadTarget.groupId
      ? visibleGroupMessages.find((message) => message.id === threadTarget.messageId) ??
        activeGroup.messages.find((message) => message.id === threadTarget.messageId) ??
        null
      : null
  const threadChannelPost =
    threadTarget?.kind === 'channel' && currentSubscriptionChannel?.id === threadTarget.channelId
      ? visibleSubscriptionPosts.find((post) => post.id === threadTarget.postId) ??
        currentSubscriptionChannel.posts.find((post) => post.id === threadTarget.postId) ??
        null
      : null
  const activeThreadComments =
    threadTarget?.kind === 'group'
      ? threadGroupMessage?.threadComments ?? []
      : threadTarget?.kind === 'channel'
        ? threadChannelPost?.threadComments ?? []
        : []
  const activeThreadCommentCount = activeThreadComments.length
  const activeThreadCommentLabel =
    activeThreadCommentCount % 10 === 1 && activeThreadCommentCount % 100 !== 11
      ? 'комментарий'
      : activeThreadCommentCount % 10 >= 2 &&
          activeThreadCommentCount % 10 <= 4 &&
          (activeThreadCommentCount % 100 < 12 || activeThreadCommentCount % 100 > 14)
        ? 'комментария'
        : 'комментариев'
  const activeThreadComment =
    threadCommentActionId === null
      ? null
      : activeThreadComments.find((comment) => comment.id === threadCommentActionId) ?? null
  const activeThreadCommentParticipant = resolveThreadCommentParticipant(activeThreadComment)
  const activeThreadCommentAlreadyBlacklisted =
    activeThreadCommentParticipant?.identifier && threadTarget
      ? threadTarget.kind === 'group'
        ? activeGroup
          ? isRoomCommentsBlacklisted(activeGroup, activeThreadCommentParticipant.identifier)
          : false
        : currentSubscriptionChannel
          ? isRoomCommentsBlacklisted(currentSubscriptionChannel, activeThreadCommentParticipant.identifier)
          : false
      : false
  const canBlacklistActiveThreadComment =
    Boolean(activeThreadCommentParticipant?.identifier) &&
    activeThreadComment?.author !== 'me' &&
    ((threadTarget?.kind === 'group' && isActiveGroupCreator) || threadTarget?.kind === 'channel')
  const activeGroupMessageAlreadyBlacklisted =
    activeGroup && activeGroupMessageParticipant?.identifier
      ? isRoomCommentsBlacklisted(activeGroup, activeGroupMessageParticipant.identifier)
      : false
  const activeThreadSourceLabel =
    threadTarget?.kind === 'group'
      ? activeGroup?.title ?? 'Группа'
      : currentSubscriptionChannel?.title ?? 'Канал'
  const activeThreadId =
    threadTarget?.kind === 'group'
      ? threadGroupMessage?.threadId
      : threadTarget?.kind === 'channel'
        ? threadChannelPost?.threadId
        : undefined
  const activeThreadInboxItem = activeThreadId
    ? threadInbox.find((item) => item.threadId === activeThreadId) ?? null
    : null
  const activeThreadSubscribed = activeThreadInboxItem !== null
  const threadSourceText =
    activeThreadInboxItem?.kind === 'group' && threadTarget?.kind === 'group'
      ? activeThreadInboxItem.sourceText
      : activeThreadInboxItem?.kind === 'channel' && threadTarget?.kind === 'channel'
        ? activeThreadInboxItem.sourceText
        : threadTarget?.kind === 'group'
          ? threadGroupMessage?.text ?? ''
          : threadChannelPost?.text ?? ''
  const threadSourceTime =
    activeThreadInboxItem?.kind === 'group' && threadTarget?.kind === 'group'
      ? activeThreadInboxItem.sourceTime
      : activeThreadInboxItem?.kind === 'channel' && threadTarget?.kind === 'channel'
        ? activeThreadInboxItem.sourceTime
        : threadTarget?.kind === 'group'
          ? threadGroupMessage?.time ?? ''
          : threadChannelPost?.time ?? ''
  const visibleRetainedSubscriptionChannelId =
    isChannelsTopListOpen &&
    stageView === 'main' &&
    !searchOpen &&
    activeSubscriptionChannelId === retainedSubscriptionChannelId
      ? retainedSubscriptionChannelId
      : null
  const searchShowsPhone = isPhoneQuery(query)
  const browserNotificationsSupported = browserNotificationStatus !== 'unsupported'
  const showBrowserNotificationsBanner =
    browserNotificationsSupported &&
    browserNotificationStatus !== 'granted' &&
    !browserNotificationsBannerDismissed &&
    !searchOpen &&
    topListView === 'none' &&
    bottomSection === 'chats'
  const browserNotificationBannerBody =
    browserNotificationStatus === 'denied'
      ? 'Разрешение сейчас запрещено браузером. Откройте настройки сайта и включите уведомления.'
      : 'Включите уведомления в браузере, чтобы быть в курсе новых сообщений.'
  const browserNotificationSettingsStatusLabel =
    browserNotificationStatus === 'granted'
      ? browserNotificationsEnabled
        ? 'Включены'
        : 'Выключены в Тайничке'
      : browserNotificationStatus === 'denied'
        ? 'Запрещены браузером'
        : browserNotificationStatus === 'default'
          ? 'Ожидают разрешения'
          : 'Не поддерживаются в этом браузере'
  const browserNotificationSettingsText =
    browserNotificationStatus === 'granted'
      ? !browserNotificationsEnabled
        ? 'Разрешение браузера сохранено, но Tinychok не отправляет уведомления в этом браузере.'
        : quietMode
        ? 'Браузерные уведомления включены, но режим «Тихо» временно их отключает.'
        : 'Новые сообщения будут приходить в браузер, пока сайт открыт и держит realtime-соединение.'
      : browserNotificationStatus === 'denied'
        ? 'Разрешение запрещено браузером. Включить уведомления можно через настройки сайта.'
        : browserNotificationStatus === 'default'
          ? 'Разрешите показ уведомлений, чтобы не пропускать новые сообщения в браузере.'
          : 'Этот браузер не поддерживает системные уведомления через Notification API.'
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
  const managedPreviewChannels = channels
    .filter(
      (managedChannel) =>
        !subscriptionChannels.some(
          (subscriptionChannel) =>
            sanitizeChannelDirectLink(subscriptionChannel.handle) ===
            sanitizeChannelDirectLink(managedChannel.directLink),
        ),
    )
    .map((managedChannel) => buildPreviewSubscriptionChannelFromManagedChannel(managedChannel))
  const listedSubscriptionChannels = sortSubscriptionChannelsByRecentActivity([
    ...managedPreviewChannels,
    ...subscriptionChannels,
  ])
  const orderedSubscriptionChannels = sortByUnreadEnabled
    ? moveUnreadItemsFirst(listedSubscriptionChannels, visibleRetainedSubscriptionChannelId)
    : listedSubscriptionChannels
  const sortedGroups = sortGroupsByRecentActivity(groups)
  const orderedGroups = sortByUnreadEnabled
    ? moveUnreadItemsFirst(sortedGroups, visibleRetainedGroupId)
    : sortedGroups
  const orderedThreadInbox = [...threadInbox].sort((left, right) => {
    if (!sortByUnreadEnabled) {
      const rightDate = Date.parse(right.latestActivityAt ?? '') || 0
      const leftDate = Date.parse(left.latestActivityAt ?? '') || 0
      return rightDate - leftDate
    }

    if ((left.unreadCount > 0) !== (right.unreadCount > 0)) {
      return left.unreadCount > 0 ? -1 : 1
    }

    const rightDate = Date.parse(right.latestActivityAt ?? '') || 0
    const leftDate = Date.parse(left.latestActivityAt ?? '') || 0
    return rightDate - leftDate
  })
  const formatThreadCommentCountLabel = (count: number) => {
    const noun =
      count % 10 === 1 && count % 100 !== 11
        ? 'комментарий'
        : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
          ? 'комментария'
          : 'комментариев'

    return `${count} ${noun}`
  }
  const totalChannelNotifications = subscriptionChannels.reduce((sum, channel) => sum + channel.unread, 0)
  const totalGroupNotifications = groups.reduce((sum, group) => sum + group.unread, 0)
  const totalThreadNotifications = threadInbox.reduce((sum, item) => sum + item.unreadCount, 0)
  const sessionHasPremium = hasActivePremium(session?.premium, session?.premiumExpiresAt)
  const openPremiumUpsell = useCallback(() => {
    setStageView('premium')
  }, [])

  async function applyPremiumDebugState(enabled: boolean, durationDays = 30) {
    if (!session) return

    if (backendReady && session.sessionToken) {
      const response = await setDebugPremiumStateRequest(session.sessionToken, {
        durationDays,
        enabled,
      })
      applySnapshot(response.snapshot)
      return
    }

    syncSession({
      ...session,
      premium: enabled,
      premiumExpiresAt: enabled ? makePremiumExpiry(durationDays) : '',
    })
  }
  const profilePreviewSession =
    session && profileSettingsDraft
      ? {
          ...session,
          ...profileSettingsDraft,
        }
      : session
  const sessionName = session ? formatSessionName(session) : ''
  const sessionAvatarLabel = session?.displayName.trim().slice(0, 1).toUpperCase() || 'Я'
  const profileSettingsName = profilePreviewSession ? formatSessionName(profilePreviewSession) : ''
  const profileSettingsAvatarLabel =
    profilePreviewSession?.displayName.trim().slice(0, 1).toUpperCase() || 'Я'
  const effectiveProfileSoundsDisabled = quietMode || Boolean(profileSettingsDraft?.soundsDisabled)
  const storageUsage = session?.storageUsage
  const storageUsageLabel = storageUsage
    ? `${formatAttachmentSize(storageUsage.usedBytes)} из ${formatAttachmentSize(storageUsage.quotaBytes)}`
    : ''
  const storageRemainingLabel = storageUsage
    ? `Осталось ${formatAttachmentSize(storageUsage.remainingBytes)}`
    : ''
  const storageUsagePercent = storageUsage?.percentUsed ?? 0
  const storageUsageTone =
    storageUsagePercent >= 100 ? 'danger' : storageUsagePercent >= 85 ? 'warning' : 'normal'
  const profileSettingsDirty =
    session !== null &&
    profileSettingsDraft !== null &&
    (
      sanitizePersonField(profileSettingsDraft.displayName, displayNameFieldMaxLength) !== session.displayName ||
      sanitizePersonField(profileSettingsDraft.surname ?? '', surnameFieldMaxLength) !== (session.surname ?? '') ||
      normalizeNickname(profileSettingsDraft.nickname ?? '') !== (session.nickname ?? '') ||
      sanitizeStatusField(profileSettingsDraft.status ?? '') !== (session.status ?? '') ||
      (profileSettingsDraft.avatarImage?.trim() || undefined) !== session.avatarImage ||
      Boolean(profileSettingsDraft.soundsDisabled) !== Boolean(session.soundsDisabled)
    )
  const creatingGroupMemberLimit = sessionHasPremium ? premiumGroupMemberLimit : defaultGroupMemberLimit
  const selectedGroupCreateChats = creatableGroupChats.filter((chat) =>
    creatingGroupMemberChatIds.includes(chat.id),
  )
  const canCreateGroup = selectedGroupCreateChats.length > 0
  const activeManagedChannelParticipantIdentifiers = new Set(
    activeChannel
      ? (
          subscriptionChannels.find(
            (channel) =>
              sanitizeChannelDirectLink(channel.handle) ===
              sanitizeChannelDirectLink(activeChannel.directLink),
          )?.participants ?? []
        )
          .map((participant) => normalizeIdentifier(participant.identifier ?? ''))
          .filter(Boolean)
      : [],
  )
  const inviteableManagedChannelChats = activeChannel
    ? availableChats.filter((chat) => {
        const chatIdentifier = normalizeIdentifier(chat.phone)
        if (!chatIdentifier) return false
        if (session && chatIdentifier === session.identifier) return false
        return !activeManagedChannelParticipantIdentifiers.has(chatIdentifier)
      })
    : []
  const selectedChannelInviteChats = inviteableManagedChannelChats.filter((chat) =>
    channelInviteChatIds.includes(chat.id),
  )
  const canInviteToManagedChannel = selectedChannelInviteChats.length > 0
  const selectedChannelShareChats = availableChats.filter((chat) => channelShareChatIds.includes(chat.id))
  const canInviteToCurrentSubscriptionChannel = selectedChannelShareChats.length > 0
  const blacklistManagerCurrentIdentifiers =
    blacklistManagerTarget?.kind === 'group' && blacklistManagerTarget.scope === 'create'
      ? creatingGroupBlacklistIdentifiers
      : blacklistManagerTarget?.kind === 'group' && blacklistManagerTarget.scope === 'existing'
        ? groups.find((group) => group.id === blacklistManagerTarget.groupId)?.commentBlacklistIdentifiers ?? []
        : blacklistManagerTarget?.kind === 'channel' && blacklistManagerTarget.scope === 'create'
          ? creatingChannelBlacklistIdentifiers
          : blacklistManagerTarget?.kind === 'channel' && blacklistManagerTarget.scope === 'existing'
            ? channels.find((channel) => channel.id === blacklistManagerTarget.channelId)?.commentBlacklistIdentifiers ?? []
            : []
  const blacklistManagerMembers =
    blacklistManagerTarget?.kind === 'group' && blacklistManagerTarget.scope === 'create'
      ? [
          ...(session
            ? [
                {
                  accent: creatingGroupAccent,
                  favorite: false,
                  id: getSyntheticChannelId(session.identifier),
                  identifier: session.identifier,
                  nickname: session.nickname ?? '',
                  online: true,
                  premium: sessionHasPremium,
                  status: session.status?.trim() || 'в сети',
                  title: formatSessionName(session),
                } satisfies GroupParticipant,
              ]
            : []),
          ...selectedGroupCreateChats.map((chat) => buildGroupParticipantFromChat(chat, chat.id)),
        ]
      : blacklistManagerTarget?.kind === 'group' && blacklistManagerTarget.scope === 'existing'
        ? activeGroup?.participants ?? []
        : blacklistManagerTarget?.kind === 'channel' && blacklistManagerTarget.scope === 'existing'
          ? (subscriptionChannels.find((channel) => channel.handle === channels.find((candidate) => candidate.id === blacklistManagerTarget.channelId)?.directLink)?.participants ??
            currentSubscriptionChannel?.participants ??
            [])
          : []
  const filteredBlacklistCandidates = blacklistManagerMembers.filter((participant) => {
    if (!blacklistAddMode) {
      return blacklistManagerCurrentIdentifiers.some(
        (identifier) => normalizeIdentifier(identifier) === normalizeIdentifier(participant.identifier ?? ''),
      )
    }

    if (
      blacklistManagerCurrentIdentifiers.some(
        (identifier) => normalizeIdentifier(identifier) === normalizeIdentifier(participant.identifier ?? ''),
      )
    ) {
      return false
    }

    if (!blacklistSearchQuery.trim()) return true

    return (
      matchesExactSearchCandidate(participant.title, blacklistSearchQuery) ||
      matchesExactSearchCandidate(participant.nickname ? `@${participant.nickname}` : '', blacklistSearchQuery)
    )
  })
  const premiumDaysLeft = getPremiumDaysLeft(session?.premium, session?.premiumExpiresAt)
  const premiumMonthlyPrice = 199
  const premiumAnnualPrice = 1390
  const premiumAnnualSavingsPercent = Math.round((1 - premiumAnnualPrice / (premiumMonthlyPrice * 12)) * 100)

  async function startRealPremiumCheckout(plan: 'month' | 'year') {
    const planLabel = plan === 'year' ? 'годовая' : 'месячная'
    throw new Error(`Реальная ${planLabel} покупка пока не подключена. Для тестов включите дебаг-тоггл автопокупки.`)
  }

  async function startPremiumCheckout(plan: 'month' | 'year') {
    if (!session || premiumPurchaseBusy) return

    setPremiumPurchaseBusy(true)

    try {
      if (premiumDebugAutoCheckout) {
        await applyPremiumDebugState(true, plan === 'year' ? 365 : 30)
        return
      }

      await startRealPremiumCheckout(plan)
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'Не удалось запустить покупку премиума.',
      )
    } finally {
      setPremiumPurchaseBusy(false)
    }
  }

  function disablePremiumForDebug() {
    if (!session) return

    void applyPremiumDebugState(false).catch((error) => {
      window.alert(
        error instanceof Error ? error.message : 'Не удалось отключить премиум в debug-режиме.',
      )
    })
  }

  const cookieConsentStatus =
    cookieConsent === 'analytics'
      ? 'Вы приняли аналитические cookie'
      : cookieConsent === 'necessary'
      ? 'Вы приняли только необходимые cookie'
      : 'Выбор ещё не сохранён'
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
    activeSubscriptionChannelPostCount,
    activeThreadCommentCount,
    isChatOpen,
    isGroupOpen,
    isSubscriptionChannelOpen,
    threadTarget,
  ])

  useLayoutEffect(() => {
    if (!threadTarget || !messageFeedRef.current) return

    window.requestAnimationFrame(() => {
      if (!messageFeedRef.current) return
      messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight
    })
  }, [activeThreadCommentCount, threadTarget])

  const scrollCurrentFeedToSelector = useCallback((selector: string) => {
    return scrollFeedChildIntoView(messageFeedRef.current, selector)
  }, [])

  const scrollToDirectMessage = useCallback((messageId: number) => {
    const didRevealOlderMessages = revealDirectMessageById(messageId)

    if (didRevealOlderMessages) {
      setDeferredRoomScrollTarget({ id: messageId, kind: 'direct-message' })
      return
    }

    void window.requestAnimationFrame(() => {
      scrollCurrentFeedToSelector(`[data-direct-message-id="${messageId}"]`)
    })
  }, [revealDirectMessageById, scrollCurrentFeedToSelector])

  const scrollToGroupMessage = useCallback((messageId: number) => {
    const didRevealOlderMessages = revealGroupMessageById(messageId)

    if (didRevealOlderMessages) {
      setDeferredRoomScrollTarget({ id: messageId, kind: 'group-message' })
      return
    }

    void window.requestAnimationFrame(() => {
      scrollCurrentFeedToSelector(`[data-group-message-id="${messageId}"]`)
    })
  }, [revealGroupMessageById, scrollCurrentFeedToSelector])

  const scrollToChannelPost = useCallback((postId: number) => {
    const didRevealOlderPosts = revealChannelPostById(postId)

    if (didRevealOlderPosts) {
      setDeferredRoomScrollTarget({ id: postId, kind: 'channel-post' })
      return
    }

    void window.requestAnimationFrame(() => {
      scrollCurrentFeedToSelector(`[data-channel-post-id="${postId}"]`)
    })
  }, [revealChannelPostById, scrollCurrentFeedToSelector])

  const scrollToThreadComment = useCallback((commentId: number) => {
    void window.requestAnimationFrame(() => {
      scrollCurrentFeedToSelector(`[data-thread-comment-id="${commentId}"]`)
    })
  }, [scrollCurrentFeedToSelector])

  useEffect(() => {
    if (!deferredRoomScrollTarget || threadTarget) return

    const frameId = window.requestAnimationFrame(() => {
      if (deferredRoomScrollTarget.kind === 'channel-post') {
        scrollCurrentFeedToSelector(`[data-channel-post-id="${deferredRoomScrollTarget.id}"]`)
      } else if (deferredRoomScrollTarget.kind === 'direct-message') {
        scrollCurrentFeedToSelector(`[data-direct-message-id="${deferredRoomScrollTarget.id}"]`)
      } else if (deferredRoomScrollTarget.kind === 'group-message') {
        scrollCurrentFeedToSelector(`[data-group-message-id="${deferredRoomScrollTarget.id}"]`)
      }
      setDeferredRoomScrollTarget(null)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [
    activeVisibleChatMessageCount,
    activeVisibleGroupMessageCount,
    activeVisibleSubscriptionChannelPostCount,
    deferredRoomScrollTarget,
    scrollCurrentFeedToSelector,
    threadTarget,
  ])

  useEffect(() => {
    if (!threadReplyTarget) return

    window.requestAnimationFrame(() => {
      threadComposerInputRef.current?.focus()
    })
  }, [threadReplyTarget])

  useEffect(() => {
    if (!threadTarget) return

    window.requestAnimationFrame(() => {
      threadComposerInputRef.current?.focus()
    })
  }, [threadTarget])

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
  }, [pendingDirectMessagesRef])

  useEffect(() => {
    if (!session?.identifier) return
    restorePersistedFailedMessages(session.identifier)
  }, [restorePersistedFailedMessages, session?.identifier])

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

  useEffect(() => {
    if (!session) {
      setProfileSettingsDraft(null)
      setProfileSettingsBusy(false)
      setProfileSettingsError('')
      return
    }

    setProfileSettingsDraft(buildProfileSettingsDraft(session))
    setProfileSettingsBusy(false)
    setProfileSettingsError('')
  }, [session])

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.localStorage.setItem(
      premiumDebugAutoCheckoutStorageKey,
      premiumDebugAutoCheckout ? 'true' : 'false',
    )
  }, [premiumDebugAutoCheckout])

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.sessionStorage.setItem(
      messagePhotoSendOriginalPreferenceStorageKey,
      photoSendOriginalPreference ? 'true' : 'false',
    )
  }, [photoSendOriginalPreference])

  useEffect(() => {
    const nextSendOriginal = sessionHasPremium && photoSendOriginalPreference

    setChatAttachmentDrafts((currentAttachments) =>
      Object.fromEntries(
        Object.entries(currentAttachments).map(([chatId, draft]) => [
          chatId,
          draft &&
          draft.kind === 'image' &&
          draft.status === 'ready' &&
          draft.compressionEligible &&
          draft.sendOriginal !== nextSendOriginal
            ? setComposerAttachmentSendOriginal(draft, nextSendOriginal)
            : draft,
        ]),
      ),
    )
    setGroupAttachmentDrafts((currentAttachments) =>
      Object.fromEntries(
        Object.entries(currentAttachments).map(([groupId, draft]) => [
          groupId,
          draft &&
          draft.kind === 'image' &&
          draft.status === 'ready' &&
          draft.compressionEligible &&
          draft.sendOriginal !== nextSendOriginal
            ? setComposerAttachmentSendOriginal(draft, nextSendOriginal)
            : draft,
        ]),
      ),
    )
    setChannelAttachmentDrafts((currentAttachments) =>
      Object.fromEntries(
        Object.entries(currentAttachments).map(([channelId, draft]) => [
          channelId,
          draft &&
          draft.kind === 'image' &&
          draft.status === 'ready' &&
          draft.compressionEligible &&
          draft.sendOriginal !== nextSendOriginal
            ? setComposerAttachmentSendOriginal(draft, nextSendOriginal)
            : draft,
        ]),
      ),
    )
    setThreadAttachmentDraft((currentDraft) =>
      currentDraft &&
      currentDraft.kind === 'image' &&
      currentDraft.status === 'ready' &&
      currentDraft.compressionEligible &&
      currentDraft.sendOriginal !== nextSendOriginal
        ? setComposerAttachmentSendOriginal(currentDraft, nextSendOriginal)
        : currentDraft,
    )
  }, [photoSendOriginalPreference, sessionHasPremium])

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
                soundsDisabled: Boolean(nextSession.soundsDisabled),
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
            soundsDisabled: Boolean(nextSession.soundsDisabled),
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

  const syncBrowserNotificationStatus = useCallback(() => {
    setBrowserNotificationStatus(getBrowserNotificationStatus())
  }, [])

  const persistBrowserNotificationsEnabled = useCallback((enabled: boolean) => {
    setBrowserNotificationsEnabled(enabled)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(browserNotificationsEnabledStorageKey, String(enabled))
    }
  }, [])

  const dismissBrowserNotificationsBanner = useCallback(() => {
    setBrowserNotificationsBannerDismissed(true)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(browserNotificationsBannerDismissedStorageKey, 'true')
    }
  }, [])

  const requestBrowserNotificationsAccess = useCallback(async () => {
    const nextStatus = await requestBrowserNotificationPermission()
    setBrowserNotificationStatus(nextStatus)
    if (nextStatus === 'granted') {
      persistBrowserNotificationsEnabled(true)
    }
    return nextStatus
  }, [persistBrowserNotificationsEnabled])

  const enableBrowserNotifications = useCallback(async () => {
    if (browserNotificationStatus === 'granted') {
      persistBrowserNotificationsEnabled(true)
      return 'granted'
    }

    return requestBrowserNotificationsAccess()
  }, [browserNotificationStatus, persistBrowserNotificationsEnabled, requestBrowserNotificationsAccess])

  const disableBrowserNotifications = useCallback(() => {
    persistBrowserNotificationsEnabled(false)
  }, [persistBrowserNotificationsEnabled])

  const logout = useCallback(() => {
    Object.values(chatAttachmentDrafts).forEach((draft) => releaseComposerAttachmentDraft(draft))
    Object.values(groupAttachmentDrafts).forEach((draft) => releaseComposerAttachmentDraft(draft))
    Object.values(channelAttachmentDrafts).forEach((draft) => releaseComposerAttachmentDraft(draft))
    releaseComposerAttachmentDraft(threadAttachmentDraft)
    persistSession(null)
    setBackendReady(false)
    setIdentifier('')
    setDisplayName('')
    setSmsCode('')
    setAuthStep('phone')
    setAuthExistingAccount(null)
    setChatMessageDrafts({})
    setGroupMessageDrafts({})
    setChannelPostDrafts({})
    setChatAttachmentDrafts({})
    setGroupAttachmentDrafts({})
    setChannelAttachmentDrafts({})
    setThreadAttachmentDraft(undefined)
    setChannelPostBusy(false)
    setChannelPostError('')
    setChannelPostReplyTarget(null)
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
    setThreadInbox([])
    setActiveSubscriptionChannelId(null)
    setActiveGroupId(null)
    resetRoomMessageActions()
    clearPendingMessages()
    setMessageActionAnchor(null)
  }, [
    channelAttachmentDrafts,
    chatAttachmentDrafts,
    clearPendingMessages,
    groupAttachmentDrafts,
    persistSession,
    resetRoomMessageActions,
    threadAttachmentDraft,
  ])

  const playAudioCue = useCallback((path: string) => {
    if (typeof window === 'undefined' || quietMode || session?.soundsDisabled) return

    const audio = new window.Audio(path)
    audio.volume = 0.72
    void audio.play().catch(() => {})
  }, [quietMode, session?.soundsDisabled])

  const playSendSound = useCallback(() => {
    playAudioCue(jumpSoundPath)
  }, [playAudioCue])

  const playReceiveSound = useCallback(() => {
    playAudioCue(takeSoundPath)
  }, [playAudioCue])

  useEffect(() => {
    syncBrowserNotificationStatus()

    if (typeof window === 'undefined') return undefined

    const handleVisibilityChange = () => {
      syncBrowserNotificationStatus()
    }

    window.addEventListener('focus', syncBrowserNotificationStatus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', syncBrowserNotificationStatus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncBrowserNotificationStatus])

  useEffect(() => {
    const previousStatus = previousBrowserNotificationStatusRef.current

    if (
      previousStatus !== 'default' &&
      browserNotificationStatus === 'default' &&
      browserNotificationsBannerDismissed
    ) {
      setBrowserNotificationsBannerDismissed(false)

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(browserNotificationsBannerDismissedStorageKey)
      }
    }

    previousBrowserNotificationStatusRef.current = browserNotificationStatus
  }, [browserNotificationStatus, browserNotificationsBannerDismissed])

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
      const unconfirmedQueuedMessages = filterUnconfirmedOutgoingItems(
        queuedMessagesForChat,
        chat.messages,
        matchesOutgoingDirectMessage,
      )
      const localMessages = unconfirmedQueuedMessages
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
  }, [pendingDirectMessagesRef])

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
      const unconfirmedQueuedMessages = filterUnconfirmedOutgoingItems(
        queuedMessagesForGroup,
        group.messages,
        matchesOutgoingGroupMessage,
      )
      const localMessages = unconfirmedQueuedMessages
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
  }, [pendingGroupMessagesRef])

  const mergePendingGroupThreadCommentsIntoGroups = useCallback((snapshotGroups: AppSnapshot['groups']) => {
    const queuedComments = pendingGroupThreadCommentsRef.current

    if (queuedComments.length === 0) return snapshotGroups

    const queuedCommentsByMessageKey = new Map<string, PendingGroupThreadComment[]>()

    queuedComments.forEach((comment) => {
      const messageKey = `${comment.groupId}:${comment.messageId}`
      const messageComments = queuedCommentsByMessageKey.get(messageKey) ?? []
      messageComments.push(comment)
      queuedCommentsByMessageKey.set(messageKey, messageComments)
    })

    return snapshotGroups.map((group) => ({
      ...group,
      messages: group.messages.map((message) => {
        const messageKey = `${group.id}:${message.id}`
        const queuedCommentsForMessage = queuedCommentsByMessageKey.get(messageKey)

        if (!queuedCommentsForMessage || queuedCommentsForMessage.length === 0) {
          return message
        }

        const existingComments = message.threadComments ?? []
        const existingIds = new Set(existingComments.map((comment) => comment.id))
        const unconfirmedQueuedComments = filterUnconfirmedOutgoingItems(
          queuedCommentsForMessage,
          existingComments,
          matchesOutgoingThreadComment,
        )
        const localComments = unconfirmedQueuedComments
          .filter((comment) => !existingIds.has(comment.localId))
          .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
          .map((comment) => ({
            attachment: comment.attachment,
            author: 'me' as const,
            authorIdentifier: comment.authorIdentifier,
            createdAt: comment.createdAt,
            displayAuthor: comment.displayAuthor,
            id: comment.localId,
            replyTo: comment.replyTo,
            text: comment.text,
            time: comment.time,
          }))

        if (localComments.length === 0) {
          return message
        }

        return {
          ...message,
          threadComments: [...existingComments, ...localComments],
        }
      }),
    }))
  }, [pendingGroupThreadCommentsRef])

  const mergePendingChannelThreadCommentsIntoChannels = useCallback((
    snapshotChannels: AppSnapshot['subscriptionChannels'],
  ) => {
    const queuedComments = pendingChannelThreadCommentsRef.current

    if (queuedComments.length === 0) return snapshotChannels

    const queuedCommentsByPostKey = new Map<string, PendingChannelThreadComment[]>()

    queuedComments.forEach((comment) => {
      const postKey = `${comment.channelId}:${comment.postId}`
      const postComments = queuedCommentsByPostKey.get(postKey) ?? []
      postComments.push(comment)
      queuedCommentsByPostKey.set(postKey, postComments)
    })

    return snapshotChannels.map((channel) => ({
      ...channel,
      posts: channel.posts.map((post) => {
        const postKey = `${channel.id}:${post.id}`
        const queuedCommentsForPost = queuedCommentsByPostKey.get(postKey)

        if (!queuedCommentsForPost || queuedCommentsForPost.length === 0) {
          return post
        }

        const existingComments = post.threadComments ?? []
        const existingIds = new Set(existingComments.map((comment) => comment.id))
        const unconfirmedQueuedComments = filterUnconfirmedOutgoingItems(
          queuedCommentsForPost,
          existingComments,
          matchesOutgoingThreadComment,
        )
        const localComments = unconfirmedQueuedComments
          .filter((comment) => !existingIds.has(comment.localId))
          .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
          .map((comment) => ({
            attachment: comment.attachment,
            author: 'me' as const,
            authorIdentifier: comment.authorIdentifier,
            createdAt: comment.createdAt,
            displayAuthor: comment.displayAuthor,
            id: comment.localId,
            replyTo: comment.replyTo,
            text: comment.text,
            time: comment.time,
          }))

        if (localComments.length === 0) {
          return post
        }

        return {
          ...post,
          threadComments: [...existingComments, ...localComments],
        }
      }),
    }))
  }, [pendingChannelThreadCommentsRef])

  const applySnapshot = useCallback((snapshot: AppSnapshot) => {
    const mergedChats = mergeDirectOutboxMessagesIntoChats(snapshot.chats)
    const mergedGroups = mergePendingGroupThreadCommentsIntoGroups(
      mergeGroupOutboxMessagesIntoGroups(snapshot.groups),
    )
    const mergedSubscriptionChannels = mergePendingChannelThreadCommentsIntoChannels(
      snapshot.subscriptionChannels,
    )

    skipNextBackendSyncRef.current = true
    setChats(mergedChats)
    setChannels(snapshot.channels)
    setDiscoveryResults(snapshot.discoveryResults)
    setGroups(mergedGroups)
    setSubscriptionChannels(mergedSubscriptionChannels)
    setThreadInbox(snapshot.threadInbox)
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
      mergedSubscriptionChannels.some((channel) => channel.id === currentChannelId)
        ? currentChannelId
        : null,
    )
    setActiveChannelId((currentChannelId) =>
      currentChannelId === null
        ? null
        : snapshot.channels.some((channel) => channel.id === currentChannelId)
          ? currentChannelId
          : snapshot.channels[0]?.id ?? null,
    )
    syncSession(snapshot.session)
  }, [
    mergeDirectOutboxMessagesIntoChats,
    mergeGroupOutboxMessagesIntoGroups,
    mergePendingChannelThreadCommentsIntoChannels,
    mergePendingGroupThreadCommentsIntoGroups,
    syncSession,
  ])

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
      threadInbox,
    }
  }, [channels, chats, discoveryResults, groups, session, subscriptionChannels, threadInbox])

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
  }, [applySnapshot, pendingDirectMessagesRef, pendingGroupMessagesRef])

  function clearScheduledBackendSnapshotSync() {
    if (backendSyncTimeoutRef.current !== null) {
      window.clearTimeout(backendSyncTimeoutRef.current)
      backendSyncTimeoutRef.current = null
    }
  }

  const commitManagedChannelMutation = useCallback(
    async (channelId: number, patch: UpdateManagedChannelBody, reason: string) => {
      if (!backendReady || !session?.sessionToken) {
        return latestSnapshotRef.current
      }

      try {
        const response = await updateManagedChannelRequest(session.sessionToken, channelId, patch)
        applySnapshot(response.snapshot)
        return response.snapshot
      } catch (error) {
        console.error(`Failed to sync managed channel mutation after ${reason}`, error)

        if (!(error instanceof ApiError)) {
          await fallbackSaveCurrentSnapshot(reason)
        }

        throw error
      }
    },
    [applySnapshot, backendReady, fallbackSaveCurrentSnapshot, session?.sessionToken],
  )

  useEffect(() => {
    if (session?.sessionToken) return

    pendingChannelPatchesRef.current.clear()
    suppressChannelSnapshotSyncRef.current = false
    setChannelSettingsDirtyVersion((current) => current + 1)
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
        if (isExpiredSessionError(error)) {
          logout()
          setAuthError('Сессия устарела. Войдите снова.')
          return
        }
        setBackendReady(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [applySnapshot, logout, session?.sessionToken])

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
      if (event.type === 'connection.ready') {
        suppressNextBrowserNotificationDiffRef.current = true
      }
      applySnapshot(event.snapshot)
    })

    socket.addEventListener('open', () => {
      trackAnalyticsEvent('realtime_connected', {})
    })

    socket.addEventListener('error', () => {
      trackAnalyticsEvent('realtime_error', {})
    })

    socket.addEventListener('close', () => {
      trackAnalyticsEvent('realtime_disconnected', {})
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
    const threadInboxChanged = previousSlices.threadInbox !== threadInbox

    previousSnapshotSlicesRef.current = {
      channels,
      chats,
      groups,
      session,
      subscriptionChannels,
      threadInbox,
    }

    if (!backendReady || !session?.sessionToken) return

    if (skipNextBackendSyncRef.current) {
      skipNextBackendSyncRef.current = false
      return
    }

    if (
      threadInboxChanged &&
      !chatsChanged &&
      !groupsChanged &&
      !sessionChanged &&
      !channelsChanged &&
      !subscriptionChannelsChanged
    ) {
      return
    }

    if (suppressChannelSnapshotSyncRef.current && (channelsChanged || subscriptionChannelsChanged)) {
      return
    }

    const onlySessionAndChannelChanged =
      !chatsChanged &&
      !groupsChanged &&
      !subscriptionChannelsChanged &&
      !threadInboxChanged &&
      (sessionChanged || channelsChanged)

    if (onlySessionAndChannelChanged) {
      // Channel detail fields still travel through dedicated debounced mutations.
      if (sessionChanged && !channelsChanged) {
        return
      }

      if (!channelsChanged || suppressChannelSnapshotSyncRef.current) {
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
      threadInbox,
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
    threadInbox,
  ])

  useEffect(() => {
    const previousChats = previousChatsRef.current

    if (activeChatId !== null) {
      const previousActiveChat = previousChats.find((chat) => chat.id === activeChatId) ?? null
      const nextActiveChat = chats.find((chat) => chat.id === activeChatId) ?? null

      if (
        previousActiveChat &&
        nextActiveChat &&
        nextActiveChat.messages.length > previousActiveChat.messages.length
      ) {
        const previousMessageIds = new Set(previousActiveChat.messages.map((message) => message.id))
        const hasIncomingMessages = nextActiveChat.messages.some(
          (message) => !previousMessageIds.has(message.id) && message.author === 'them',
        )

        if (hasIncomingMessages) {
          playReceiveSound()
        }
      }
    }

    previousChatsRef.current = chats
  }, [activeChatId, chats, playReceiveSound])

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
      const captchaToken = getCaptchaTokenOrThrow()
      const response = await requestAuthCode({ captchaToken, identifier: normalized })
      setIdentifier(normalized)
      setAuthExistingAccount(response.existingAccount)
      setAuthError('')
      setAuthStep('code')
      trackAnalyticsEvent('auth_code_request_succeeded', {
        captchaRequired,
        existingAccount: Boolean(response.existingAccount),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось запросить код.'
      setAuthError(message)
      trackAnalyticsEvent('auth_code_request_failed', {
        captchaRequired,
        reason: message,
      })
    } finally {
      resetCaptcha()
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
        trackAnalyticsEvent('auth_code_verify_succeeded', {
          outcome: 'authenticated',
        })
        return
      }

      setAuthExistingAccount(null)
      setAuthError('')
      setAuthStep('profile')
      trackAnalyticsEvent('auth_code_verify_succeeded', {
        outcome: 'needs-profile',
      })
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Не удалось подтвердить код.'

      if (nextMessage === blockedAuthNoticeMessage) {
        setAuthBlockedNoticeOpen(true)
        setAuthError('')
        trackAnalyticsEvent('auth_code_verify_failed', {
          blocked: true,
          reason: nextMessage,
        })
        return
      }

      setAuthError(nextMessage)
      trackAnalyticsEvent('auth_code_verify_failed', {
        blocked: false,
        reason: nextMessage,
      })
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
      trackAnalyticsEvent('auth_registration_succeeded', {})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось завершить регистрацию.'
      setAuthError(message)
      trackAnalyticsEvent('auth_registration_failed', {
        reason: message,
      })
    }
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
    clearChatAttachmentDraft(chatId)
  }

  function clearGroupComposer(groupId: number) {
    setGroupMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [groupId]: '',
    }))
    clearGroupAttachmentDraft(groupId)
  }

  function clearChatAttachmentDraft(chatId: number) {
    chatAttachmentSelectionTokenRef.current += 1
    setChatAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[chatId]
      releaseComposerAttachmentDraft(currentDraft)

      return {
        ...currentAttachments,
        [chatId]: undefined,
      }
    })
  }

  function clearGroupAttachmentDraft(groupId: number) {
    groupAttachmentSelectionTokenRef.current += 1
    setGroupAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[groupId]
      releaseComposerAttachmentDraft(currentDraft)

      return {
        ...currentAttachments,
        [groupId]: undefined,
      }
    })
  }

  function clearChannelAttachmentDraft(channelId: number) {
    channelAttachmentSelectionTokenRef.current += 1
    setChannelAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[channelId]
      releaseComposerAttachmentDraft(currentDraft)

      return {
        ...currentAttachments,
        [channelId]: undefined,
      }
    })
  }

  function clearThreadAttachmentDraft() {
    threadAttachmentSelectionTokenRef.current += 1
    setThreadAttachmentDraft((currentDraft) => {
      releaseComposerAttachmentDraft(currentDraft)
      return undefined
    })
  }

  function openMediaViewer(
    attachment: MessageAttachment,
    options?: { allowDownload?: boolean; allowGifAdd?: boolean },
  ) {
    setMediaViewerAttachment(attachment)
    setMediaViewerDownloadEnabled(options?.allowDownload ?? attachment.mimeType !== 'image/gif')
    setMediaViewerGifActionBusy(false)
    setMediaViewerGifAddEnabled(
      options?.allowGifAdd ?? attachment.mimeType === 'image/gif',
    )
    setMediaViewerReportBusy(false)
    setMediaViewerReportToast('')
  }

  function openAttachmentDraftPreview(attachmentDraft?: ComposerAttachmentDraft) {
    if (!attachmentDraft || attachmentDraft.kind !== 'image') return

    openMediaViewer({
      fileName: attachmentDraft.fileName,
      height: attachmentDraft.height,
      mediaUrl: attachmentDraft.previewUrl,
      mimeType: attachmentDraft.mimeType,
      size: attachmentDraft.size,
      width: attachmentDraft.width,
    }, { allowDownload: false, allowGifAdd: false })
  }

  function closeMediaViewer() {
    setMediaViewerAttachment(null)
    setMediaViewerDownloadEnabled(true)
    setMediaViewerGifActionBusy(false)
    setMediaViewerGifAddEnabled(false)
    setMediaViewerReportBusy(false)
    setMediaViewerReportToast('')
  }

  useEffect(() => {
    if (!mediaViewerReportToast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMediaViewerReportToast('')
    }, 2200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [mediaViewerReportToast])

  async function reportOpenedMediaAttachment() {
    if (!mediaViewerAttachment || mediaViewerReportBusy) {
      return
    }

    if (mediaViewerAttachment.reportState?.alreadyReported) {
      setMediaViewerReportToast('Вы уже отправляли жалобу')
      return
    }

    if (!(backendReady && session?.sessionToken)) {
      setMediaViewerReportToast('Жалоба отправлена')
      setMediaViewerAttachment((current) =>
            current
              ? {
                  ...current,
                  reportState: {
                    alreadyReported: true,
                    reportCount: (current.reportState?.reportCount ?? 0) + 1,
              },
            }
          : current,
      )
      return
    }

    setMediaViewerReportBusy(true)
    try {
      const response = await reportMediaAttachmentRequest(session.sessionToken, {
        mediaUrl: mediaViewerAttachment.mediaUrl,
        reason: 'very_unpleasant',
      })
      applySnapshot(response.snapshot)
      setMediaViewerAttachment((current) =>
            current
              ? {
                  ...current,
                  reportState: {
                    alreadyReported: true,
                    reportCount: (current.reportState?.reportCount ?? 0) + 1,
              },
            }
          : current,
      )
      setMediaViewerReportToast('Жалоба отправлена')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось отправить жалобу.'
      setMediaViewerReportToast(message)
    } finally {
      setMediaViewerReportBusy(false)
    }
  }

  async function addOpenedGifToLibrary() {
    if (!mediaViewerAttachment || mediaViewerGifActionBusy || !mediaViewerGifAddEnabled) {
      return
    }

    setMediaViewerGifActionBusy(true)

    try {
      await addGifAttachmentToLibrary(mediaViewerAttachment)
      setMediaViewerReportToast('GIF добавлена в вашу библиотеку')
    } catch (error) {
      setMediaViewerReportToast(
        getErrorMessage(error, 'Не удалось добавить GIF в вашу библиотеку.'),
      )
    } finally {
      setMediaViewerGifActionBusy(false)
    }
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

  function buildThreadInboxItemFromTarget(target: {
    kind: 'group'
    groupId: number
    messageId: number
  } | {
    kind: 'channel'
    channelId: number
    postId: number
  }) {
    if (target.kind === 'group') {
      const group = groups.find((candidate) => candidate.id === target.groupId)
      const message = group?.messages.find((candidate) => candidate.id === target.messageId)
      if (!group || !message?.threadId) return null

      const comments = message.threadComments ?? []
      const latestComment = comments.at(-1)

      return {
        commentCount: comments.length,
        groupAccent: group.accent,
        groupId: group.id,
        groupTitle: group.title,
        kind: 'group' as const,
        latestActivityAt: latestComment?.createdAt ?? message.createdAt,
        latestCommentAuthor: latestComment?.displayAuthor,
        latestCommentText: latestComment?.text ?? 'Пока без комментариев',
        latestCommentTime: latestComment?.time ?? message.time,
        messageId: message.id,
        sourceText: message.text,
        sourceTime: message.time,
        subscribed: true,
        threadId: message.threadId,
        unreadCount: 0,
      } satisfies ThreadInboxItem
    }

    const channel = subscriptionChannels.find((candidate) => candidate.id === target.channelId)
    const post = channel?.posts.find((candidate) => candidate.id === target.postId)
    if (!channel || !post?.threadId) return null

    const comments = post.threadComments ?? []
    const latestComment = comments.at(-1)

    return {
      channelAccent: channel.accent,
      channelId: channel.id,
      channelTitle: channel.title,
      commentCount: comments.length,
      kind: 'channel' as const,
      latestActivityAt: latestComment?.createdAt ?? post.createdAt,
      latestCommentAuthor: latestComment?.displayAuthor,
      latestCommentText: latestComment?.text ?? 'Пока без комментариев',
      latestCommentTime: latestComment?.time ?? post.time,
      postId: post.id,
      sourceText: post.text,
      sourceTime: post.time,
      subscribed: true,
      threadId: post.threadId,
      unreadCount: 0,
    } satisfies ThreadInboxItem
  }

  function applyLocalThreadRead(threadId: string) {
    setThreadInbox((currentThreadInbox) =>
      currentThreadInbox.map((item) =>
        item.threadId === threadId
          ? {
              ...item,
              unreadCount: 0,
            }
          : item,
      ),
    )
  }

  function applyLocalThreadSubscription(
    target: {
      kind: 'group'
      groupId: number
      messageId: number
    } | {
      kind: 'channel'
      channelId: number
      postId: number
    },
  ) {
    const nextItem = buildThreadInboxItemFromTarget(target)
    if (!nextItem) return

    setThreadInbox((currentThreadInbox) => {
      const existingItem = currentThreadInbox.find((item) => item.threadId === nextItem.threadId)
      if (existingItem) {
        return currentThreadInbox.map((item) =>
          item.threadId === nextItem.threadId
            ? {
                ...item,
                ...nextItem,
                subscribed: true,
              }
            : item,
        )
      }

      return [nextItem, ...currentThreadInbox]
    })
  }

  function applyLocalThreadUnsubscription(threadId: string) {
    setThreadInbox((currentThreadInbox) =>
      currentThreadInbox.filter((item) => item.threadId !== threadId),
    )
  }

  function applyLocalDirectMessage(
    chatId: number,
    text: string,
    options?: {
      attachment?: Message['attachment']
      createdAt?: string
      deliveryId?: string
      forwarded?: boolean
      forwardedAuthorName?: string
      localId?: number
      markAsRead?: boolean
      replyTo?: Message['replyTo']
      sourceChannel?: Message['sourceChannel']
      sourceGroup?: Message['sourceGroup']
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
              sourceGroup: options?.sourceGroup,
              text,
              createdAt,
              deliveryId: options?.deliveryId,
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
      deliveryId?: string
      forwarded?: boolean
      forwardedAuthorName?: string
      localId?: number
      replyTo?: Message['replyTo']
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
              latestActivityAt: createdAt,
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
                  deliveryId: options?.deliveryId,
                  forwarded: options?.forwarded,
                  forwardedAuthorName: options?.forwardedAuthorName,
                  replyTo: options?.replyTo,
                  sourceChannel: options?.sourceChannel,
                  text,
                  threadComments: [],
                  threadId: `local-group:${group.id}:${createdAt}:${options?.localId ?? Date.now()}`,
                  time,
                },
              ],
            }
          : group,
      ),
    )
  }

  function applyLocalGroupPatch(groupId: number, patch: Partial<GroupPreview>) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    )
  }

  function applyLocalSubscriptionChannelPatch(channelId: number, patch: Partial<SubscriptionChannel>) {
    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel)),
    )
  }

  function applyLocalGroupThreadComment(
    groupId: number,
    messageId: number,
    text: string,
    replyTo?: Message['replyTo'],
    options?: {
      attachment?: Message['attachment']
      authorIdentifier?: string
      createdAt?: string
      deliveryId?: string
      displayAuthor?: string
      localId?: number
      time?: string
    },
  ) {
    const createdAt = options?.createdAt ?? new Date().toISOString()
    const time = options?.time ?? formatNowTime()

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id !== groupId
          ? group
          : {
              ...group,
              messages: group.messages.map((message) =>
                message.id !== messageId
                  ? message
                  : {
                      ...message,
                      threadComments: [
                        ...(message.threadComments ?? []),
                        {
                          attachment: options?.attachment,
                          author: 'me',
                          authorIdentifier: options?.authorIdentifier ?? session?.identifier,
                          createdAt,
                          deliveryId: options?.deliveryId,
                          displayAuthor: options?.displayAuthor ?? sessionName,
                          id: options?.localId ?? (message.threadComments ?? []).length + 1,
                          replyTo,
                          text,
                          time,
                        } satisfies ThreadComment,
                      ],
                    },
              ),
            },
      ),
    )
  }

  function applyLocalSubscriptionThreadComment(
    channelId: number,
    postId: number,
    text: string,
    replyTo?: Message['replyTo'],
    options?: {
      attachment?: Message['attachment']
      authorIdentifier?: string
      createdAt?: string
      deliveryId?: string
      displayAuthor?: string
      localId?: number
      time?: string
    },
  ) {
    const createdAt = options?.createdAt ?? new Date().toISOString()
    const time = options?.time ?? formatNowTime()

    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id !== channelId
          ? channel
          : {
              ...channel,
              posts: channel.posts.map((post) =>
                post.id !== postId
                  ? post
                  : {
                      ...post,
                      threadComments: [
                        ...(post.threadComments ?? []),
                        {
                          attachment: options?.attachment,
                          author: 'me',
                          authorIdentifier: options?.authorIdentifier ?? session?.identifier,
                          createdAt,
                          deliveryId: options?.deliveryId,
                          displayAuthor: options?.displayAuthor ?? sessionName,
                          id: options?.localId ?? (post.threadComments ?? []).length + 1,
                          replyTo,
                          text,
                          time,
                        } satisfies ThreadComment,
                      ],
                    },
              ),
            },
      ),
    )
  }

  function applyLocalDeleteGroupThreadComment(groupId: number, messageId: number, commentId: number) {
    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id !== groupId
          ? group
          : {
              ...group,
              messages: group.messages.map((message) =>
                message.id !== messageId
                  ? message
                  : {
                      ...message,
                      threadComments: (message.threadComments ?? []).filter((comment) => comment.id !== commentId),
                    },
              ),
            },
      ),
    )
  }

  function applyLocalDeleteSubscriptionThreadComment(channelId: number, postId: number, commentId: number) {
    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id !== channelId
          ? channel
          : {
              ...channel,
              posts: channel.posts.map((post) =>
                post.id !== postId
                  ? post
                  : {
                      ...post,
                      threadComments: (post.threadComments ?? []).filter((comment) => comment.id !== commentId),
                    },
              ),
            },
      ),
    )
  }

  function applyLocalManagedChannelPost(
    managedChannel: Channel,
    text: string,
    options?: {
      attachment?: Message['attachment']
      createdAt?: string
      replyTo?: Message['replyTo']
      time?: string
    },
  ) {
    const createdAt = options?.createdAt ?? new Date().toISOString()
    const time = options?.time ?? formatNowTime()
    const nextPost = {
      attachment: options?.attachment,
      createdAt,
      id: Date.now(),
      replyTo:
        options?.replyTo ??
        (channelPostReplyTarget
          ? {
              author: channelPostReplyTarget.author,
              id: channelPostReplyTarget.id,
              text: channelPostReplyTarget.text,
            }
          : undefined),
      text,
      threadComments: [],
      time,
    }
    const normalizedHandle = sanitizeChannelDirectLink(managedChannel.directLink)

    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) => {
        const matchesManagedChannel =
          channel.id === managedChannel.id ||
          sanitizeChannelDirectLink(channel.handle) === normalizedHandle

        return matchesManagedChannel
          ? {
              ...channel,
              commentsEnabledForAll: managedChannel.commentsEnabledForAll ?? channel.commentsEnabledForAll,
              commentsEnabledForPremium:
                managedChannel.commentsEnabledForPremium ?? channel.commentsEnabledForPremium,
              latestActivityAt: createdAt,
              posts: [...channel.posts, nextPost],
              preview: text || (options?.attachment ? `Файл: ${options.attachment.fileName}` : channel.preview),
              time,
              unread: 0,
            }
          : channel
      }),
    )

    setPreviewSubscriptionChannel((currentChannel) => {
      if (!currentChannel) return currentChannel

      const matchesManagedChannel =
        currentChannel.id === managedChannel.id ||
        sanitizeChannelDirectLink(currentChannel.handle) === normalizedHandle

      return matchesManagedChannel
        ? {
            ...currentChannel,
            commentsEnabledForAll:
              managedChannel.commentsEnabledForAll ?? currentChannel.commentsEnabledForAll,
            commentsEnabledForPremium:
              managedChannel.commentsEnabledForPremium ?? currentChannel.commentsEnabledForPremium,
            latestActivityAt: createdAt,
            posts: [...currentChannel.posts, nextPost],
            preview: text,
            time,
            unread: 0,
          }
        : currentChannel
    })
  }

  function applyLocalDeleteManagedChannelPost(channelId: number, postId: number) {
    const managedChannel =
      channels.find((channel) => channel.id === channelId) ??
      (activeChannelId === channelId ? activeChannel : null) ??
      ownedCurrentManagedChannel ??
      null
    const managedChannelHandle = sanitizeChannelDirectLink(managedChannel?.directLink ?? '')
    const managedChannelDescription =
      managedChannel?.description ?? previewSubscriptionChannel?.preview ?? 'Пока пусто'

    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) => {
        const matchesManagedChannel =
          channel.id === channelId ||
          (managedChannelHandle !== '' &&
            sanitizeChannelDirectLink(channel.handle) === managedChannelHandle)

        if (!matchesManagedChannel) {
          return channel
        }

        const nextPosts = channel.posts.filter((post) => post.id !== postId)
        const latestPost = nextPosts.at(-1)

        return {
          ...channel,
          latestActivityAt: latestPost?.createdAt,
          posts: nextPosts,
          preview: latestPost ? formatMessagePreview(latestPost) : managedChannelDescription,
          time: latestPost?.time ?? '',
          unread:
            channel.id === channelId
              ? channel.unread
              : Math.max(0, channel.unread - (channel.posts.length === nextPosts.length ? 0 : 1)),
        }
      }),
    )

    setPreviewSubscriptionChannel((currentChannel) => {
      if (!currentChannel) return currentChannel

      const matchesManagedChannel =
        currentChannel.id === channelId ||
        (managedChannelHandle !== '' &&
          sanitizeChannelDirectLink(currentChannel.handle) === managedChannelHandle)

      if (!matchesManagedChannel) {
        return currentChannel
      }

      const nextPosts = currentChannel.posts.filter((post) => post.id !== postId)
      const latestPost = nextPosts.at(-1)

      return {
        ...currentChannel,
        latestActivityAt: latestPost?.createdAt,
        posts: nextPosts,
        preview: latestPost ? formatMessagePreview(latestPost) : managedChannelDescription,
        time: latestPost?.time ?? '',
      }
    })
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
      releaseComposerAttachmentDraft(currentAttachments[chatId])
      const nextAttachments = { ...currentAttachments }
      delete nextAttachments[chatId]
      return nextAttachments
    })
  }

  function buildMessageAttachmentFromDraft(attachmentDraft?: {
    file?: File
    fileName: string
    height?: number
    mediaUrl?: string
    mimeType: string
    size: number
    width?: number
  }) {
    if (!attachmentDraft) return undefined

    if (attachmentDraft.mediaUrl) {
      return {
        fileName: attachmentDraft.fileName,
        height: attachmentDraft.height,
        mediaUrl: attachmentDraft.mediaUrl,
        mimeType: attachmentDraft.mimeType,
        size: attachmentDraft.size,
        width: attachmentDraft.width,
      } satisfies NonNullable<Message['attachment']>
    }

    if (!attachmentDraft.file) return undefined

    const localMediaUrl = URL.createObjectURL(attachmentDraft.file)
    localMessageAttachmentObjectUrlsRef.current.add(localMediaUrl)

    return {
      fileName: attachmentDraft.fileName,
      height: attachmentDraft.height,
      mediaUrl: localMediaUrl,
      mimeType: attachmentDraft.mimeType,
      size: attachmentDraft.size,
      width: attachmentDraft.width,
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
          height: attachmentDraft.height,
          mediaUrl: attachmentDraft.mediaUrl,
          mimeType: attachmentDraft.mimeType,
          size: attachmentDraft.size,
          width: attachmentDraft.width,
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
        fileName: attachmentDraft.fileName,
        height: attachmentDraft.height,
        mediaUrl: uploadedMedia.mediaUrl,
        mimeType: uploadedMedia.mimeType,
        size: uploadedMedia.size,
        width: attachmentDraft.width,
      } satisfies NonNullable<Message['attachment']>,
      attachmentDraft: {
        fileName: attachmentDraft.fileName,
        height: attachmentDraft.height,
        mediaUrl: uploadedMedia.mediaUrl,
        mimeType: uploadedMedia.mimeType,
        size: uploadedMedia.size,
        width: attachmentDraft.width,
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

  async function createComposerDraft(file: File, options?: { previewUrl?: string }) {
    return await buildComposerAttachmentDraft(file, options)
  }

  function applyPhotoSendOriginalPreferenceToDraft(attachmentDraft: ComposerAttachmentDraft) {
    if (!sessionHasPremium || !photoSendOriginalPreference) {
      return attachmentDraft
    }

    return setComposerAttachmentSendOriginal(attachmentDraft, true)
  }

  function getGifSelectionBlockedReason(attachmentDraft?: ComposerAttachmentDraft) {
    if (!attachmentDraft) return null
    return attachmentDraft.mimeType === 'image/gif' ? null : 'Сначала уберите текущее вложение.'
  }

  function applyLocalGifLibrary(nextGifLibrary: UserGifLibraryItem[]) {
    if (!session) return null

    const nextSession = {
      ...session,
      gifLibrary: nextGifLibrary,
    }
    syncSession(nextSession)
    return nextSession
  }

  async function uploadUserGifToLibrary(file: File) {
    if (!session) {
      throw new Error('Нужна активная сессия.')
    }

    if (!sessionHasPremium) {
      openPremiumUpsell()
      throw new Error('GIF доступны только в премиуме.')
    }

    validateGifUploadFile(file)

    const existingDuplicate = findDuplicateUserGif(session.gifLibrary ?? [], {
      fileName: file.name,
      size: file.size,
    })
    if (existingDuplicate) {
      throw new Error(duplicateUserGifMessage)
    }

    const dimensions = await readGifDimensions(file)

    if (!(backendReady && session.sessionToken)) {
      const localGif = buildUserGifRegistrationBody(file, {
        fileName: file.name,
        kind: 'user-gif',
        mediaUrl: URL.createObjectURL(file),
        mimeType: 'image/gif',
        size: file.size,
        storageKey: '',
      }, dimensions)
      applyLocalGifLibrary([localGif, ...(session.gifLibrary ?? [])])
      return localGif
    }

    const sessionToken = session.sessionToken

    try {
      const uploadedMedia = await (async () => {
        try {
          return await uploadMediaFile(sessionToken, file, 'user-gif')
        } catch (error) {
          console.error('gif upload media failed', error)
          throw error
        }
      })()

      try {
        const response = await registerUserGif(
          sessionToken,
          buildUserGifRegistrationBody(file, uploadedMedia, dimensions),
        )
        applySnapshot(response.snapshot)

        return (
          response.snapshot.session.gifLibrary?.find((gif) => gif.mediaUrl === uploadedMedia.mediaUrl) ??
          response.snapshot.session.gifLibrary?.find((gif) =>
            findDuplicateUserGif([gif], { fileName: file.name, size: uploadedMedia.size }) !== null,
          ) ??
          buildUserGifRegistrationBody(file, uploadedMedia, dimensions)
        )
      } catch (error) {
        console.error('gif register failed', error)
        throw error
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }

      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Не удалось загрузить GIF. Попробуйте другой файл или повторите позже.')
      }

      throw new Error(getErrorMessage(error, 'Не удалось загрузить GIF. Попробуйте другой файл или повторите позже.'))
    }
  }

  async function uploadAndAttachChatGif(chatId: number, file: File) {
    const gif = await uploadUserGifToLibrary(file)
    attachChatGif(chatId, gif)
  }

  async function uploadAndAttachGroupGif(groupId: number, file: File) {
    const gif = await uploadUserGifToLibrary(file)
    attachGroupGif(groupId, gif)
  }

  async function uploadAndAttachChannelGif(channelId: number, file: File) {
    const gif = await uploadUserGifToLibrary(file)
    attachChannelGif(channelId, gif)
  }

  async function uploadAndAttachThreadGif(file: File) {
    const gif = await uploadUserGifToLibrary(file)
    attachThreadGif(gif)
  }

  async function searchAvailableGifs(query: string) {
    const normalizedQuery = query.trim()

    if (!normalizedQuery) {
      return []
    }

    if (!session?.sessionToken || !backendReady) {
      return (session?.gifLibrary ?? []).filter((gif) =>
        gif.fileName.toLowerCase().includes(normalizedQuery.toLowerCase()),
      )
    }

    const response = await searchUserGifsRequest(session.sessionToken, normalizedQuery)
    return response.items
  }

  async function deleteGifFromLibrary(gif: UserGifLibraryItem) {
    if (!(backendReady && session?.sessionToken)) {
      const nextGifLibrary = (session?.gifLibrary ?? []).filter((item) => item.id !== gif.id)
      applyLocalGifLibrary(nextGifLibrary)
      return
    }

    const response = await deleteUserGifRequest(session.sessionToken, gif.id)
    applySnapshot(response.snapshot)
  }

  async function addGifAttachmentToLibrary(attachment: MessageAttachment) {
    if (!session) {
      throw new Error('Нужна активная сессия.')
    }

    if (!sessionHasPremium) {
      openPremiumUpsell()
      throw new Error('GIF доступны только в премиуме.')
    }

    const existingDuplicate = findDuplicateUserGif(session.gifLibrary ?? [], attachment)
    if (existingDuplicate) {
      throw new Error(duplicateUserGifMessage)
    }

    if (!(backendReady && session.sessionToken)) {
      const nextGif = buildUserGifRegistrationBodyFromAttachment(attachment)
      applyLocalGifLibrary([nextGif, ...(session.gifLibrary ?? [])])
      return nextGif
    }

    const response = await registerUserGif(
      session.sessionToken,
      buildUserGifRegistrationBodyFromAttachment(attachment),
    )
    applySnapshot(response.snapshot)

    return (
      response.snapshot.session.gifLibrary?.find((gif) => gif.mediaUrl === attachment.mediaUrl) ??
      buildUserGifRegistrationBodyFromAttachment(attachment)
    )
  }

  function attachChatGif(chatId: number, gif: UserGifLibraryItem) {
    chatAttachmentSelectionTokenRef.current += 1
    setChatAttachmentDrafts((currentAttachments) => {
      releaseComposerAttachmentDraft(currentAttachments[chatId])
      return {
        ...currentAttachments,
        [chatId]: buildGifLibraryAttachmentDraft(gif),
      }
    })
  }

  function attachGroupGif(groupId: number, gif: UserGifLibraryItem) {
    groupAttachmentSelectionTokenRef.current += 1
    setGroupAttachmentDrafts((currentAttachments) => {
      releaseComposerAttachmentDraft(currentAttachments[groupId])
      return {
        ...currentAttachments,
        [groupId]: buildGifLibraryAttachmentDraft(gif),
      }
    })
  }

  function attachChannelGif(channelId: number, gif: UserGifLibraryItem) {
    channelAttachmentSelectionTokenRef.current += 1
    setChannelAttachmentDrafts((currentAttachments) => {
      releaseComposerAttachmentDraft(currentAttachments[channelId])
      return {
        ...currentAttachments,
        [channelId]: buildGifLibraryAttachmentDraft(gif),
      }
    })
  }

  function attachThreadGif(gif: UserGifLibraryItem) {
    threadAttachmentSelectionTokenRef.current += 1
    setThreadAttachmentDraft((currentDraft) => {
      releaseComposerAttachmentDraft(currentDraft)
      return buildGifLibraryAttachmentDraft(gif)
    })
  }

  function toggleChatAttachmentSendOriginal(chatId: number) {
    setChatAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[chatId]
      if (!currentDraft || currentDraft.kind !== 'image' || currentDraft.status !== 'ready') {
        return currentAttachments
      }

      const nextSendOriginal = !currentDraft.sendOriginal
      setPhotoSendOriginalPreference(nextSendOriginal)

      return {
        ...currentAttachments,
        [chatId]: setComposerAttachmentSendOriginal(currentDraft, nextSendOriginal),
      }
    })
  }

  function toggleGroupAttachmentSendOriginal(groupId: number) {
    setGroupAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[groupId]
      if (!currentDraft || currentDraft.kind !== 'image' || currentDraft.status !== 'ready') {
        return currentAttachments
      }

      const nextSendOriginal = !currentDraft.sendOriginal
      setPhotoSendOriginalPreference(nextSendOriginal)

      return {
        ...currentAttachments,
        [groupId]: setComposerAttachmentSendOriginal(currentDraft, nextSendOriginal),
      }
    })
  }

  function toggleChannelAttachmentSendOriginal(channelId: number) {
    setChannelAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[channelId]
      if (!currentDraft || currentDraft.kind !== 'image' || currentDraft.status !== 'ready') {
        return currentAttachments
      }

      const nextSendOriginal = !currentDraft.sendOriginal
      setPhotoSendOriginalPreference(nextSendOriginal)

      return {
        ...currentAttachments,
        [channelId]: setComposerAttachmentSendOriginal(currentDraft, nextSendOriginal),
      }
    })
  }

  function toggleThreadAttachmentSendOriginal() {
    setThreadAttachmentDraft((currentDraft) => {
      if (!currentDraft || currentDraft.kind !== 'image' || currentDraft.status !== 'ready') {
        return currentDraft
      }

      const nextSendOriginal = !currentDraft.sendOriginal
      setPhotoSendOriginalPreference(nextSendOriginal)

      return setComposerAttachmentSendOriginal(currentDraft, nextSendOriginal)
    })
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
    const deletedChannel =
      channels.find((channel) => channel.id === channelId) ??
      (activeChannelId === channelId ? activeChannel : null) ??
      null
    const deletedHandle = sanitizeChannelDirectLink(deletedChannel?.directLink ?? '')

    setChannels((currentChannels) => currentChannels.filter((channel) => channel.id !== channelId))
    setSubscriptionChannels((currentChannels) =>
      currentChannels.filter((channel) => {
        const matchesDeletedHandle =
          deletedHandle !== '' &&
          sanitizeChannelDirectLink(channel.handle) === deletedHandle

        return channel.id !== channelId && !matchesDeletedHandle
      }),
    )
    setPreviewSubscriptionChannel((currentChannel) => {
      if (!currentChannel) return currentChannel

      const matchesDeletedHandle =
        deletedHandle !== '' &&
        sanitizeChannelDirectLink(currentChannel.handle) === deletedHandle

      return currentChannel.id === channelId || matchesDeletedHandle ? null : currentChannel
    })

    if (
      activeSubscriptionChannelId === channelId ||
      (deletedHandle !== '' &&
        sanitizeChannelDirectLink(currentSubscriptionChannel?.handle ?? '') === deletedHandle)
    ) {
      setActiveSubscriptionChannelId(null)
      resetSubscriptionPostActions()
    }
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
    channelAvatarSelectionTokenRef.current += 1

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
    channelAvatarSelectionTokenRef.current += 1
    setChannelAvatarPickerTarget(target)
    setChannelAvatarPickerError('')
    setChannelAvatarPickerBusy(false)

    if (target.scope === 'create') {
      setChannelAvatarPickerDraft(creatingChannelAvatarDraft)
      setChannelAvatarPickerMode('device')
      return
    }

    setChannelAvatarPickerDraft(null)
    setChannelAvatarPickerMode('device')
  }

  async function buildProcessedAvatarDraft(file: File): Promise<ChannelAvatarDraft> {
    const preparedAvatar = await prepareAvatarUpload(file)
    channelAvatarObjectUrlsRef.current.add(preparedAvatar.previewUrl)

    return {
      file: preparedAvatar.file,
      kind: 'upload',
      label: file.name,
      previewUrl: preparedAvatar.previewUrl,
    }
  }

  function openGroupCreateDialog(preselectedChatIds: number[] = []) {
    groupAvatarSelectionTokenRef.current += 1

    const nextSelectedChatIds = [...new Set(
      preselectedChatIds.filter((chatId) => creatableGroupChats.some((chat) => chat.id === chatId)),
    )]

    if (groupAvatarPickerDraft && groupAvatarPickerDraft !== creatingGroupAvatarDraft) {
      releaseChannelAvatarDraft(groupAvatarPickerDraft)
    }

    releaseChannelAvatarDraft(creatingGroupAvatarDraft)
    setGroupCreateOpen(true)
    setCreatingGroupTitle('')
    setCreatingGroupAccent(channelAvatarTones[0])
    setCreatingGroupAvatarDraft(null)
    setCreatingGroupCommentsForAll(false)
    setCreatingGroupCommentsForPremium(false)
    setCreatingGroupBlacklistIdentifiers([])
    setCreatingGroupMemberChatIds(nextSelectedChatIds)
    setCreatingGroupBusy(false)
    setCreatingGroupError('')
    setCreatingGroupSelectionHint('')
    setGroupAvatarPickerOpen(false)
    setGroupAvatarPickerDraft(null)
    setGroupAvatarPickerError('')
    setGroupAvatarPickerMode('device')
    setGroupAvatarPickerBusy(false)

    if (groupAvatarInputRef.current) {
      groupAvatarInputRef.current.value = ''
    }
  }

  function closeGroupCreateDialog(options?: { preserveCurrentDraft?: boolean }) {
    groupAvatarSelectionTokenRef.current += 1

    if (!options?.preserveCurrentDraft) {
      releaseChannelAvatarDraft(creatingGroupAvatarDraft)
    }

    if (groupAvatarPickerDraft && groupAvatarPickerDraft !== creatingGroupAvatarDraft) {
      releaseChannelAvatarDraft(groupAvatarPickerDraft)
    }

    setGroupCreateOpen(false)
    setCreatingGroupTitle('')
    setCreatingGroupAccent(channelAvatarTones[0])
    setCreatingGroupAvatarDraft(null)
    setCreatingGroupCommentsForAll(false)
    setCreatingGroupCommentsForPremium(false)
    setCreatingGroupBlacklistIdentifiers([])
    setCreatingGroupMemberChatIds([])
    setCreatingGroupBusy(false)
    setCreatingGroupError('')
    setCreatingGroupSelectionHint('')
    setGroupAvatarPickerOpen(false)
    setGroupAvatarPickerDraft(null)
    setGroupAvatarPickerError('')
    setGroupAvatarPickerMode('device')
    setGroupAvatarPickerBusy(false)

    if (groupAvatarInputRef.current) {
      groupAvatarInputRef.current.value = ''
    }
  }

  function openGroupAvatarPicker() {
    groupAvatarSelectionTokenRef.current += 1
    setGroupAvatarPickerOpen(true)
    setGroupAvatarPickerDraft(creatingGroupAvatarDraft)
    setGroupAvatarPickerError('')
    setGroupAvatarPickerMode('device')
    setGroupAvatarPickerBusy(false)
  }

  function closeGroupAvatarPicker(options?: { preserveCurrentDraft?: boolean }) {
    groupAvatarSelectionTokenRef.current += 1

    if (!options?.preserveCurrentDraft) {
      const shouldPreserveSavedDraft =
        groupAvatarPickerDraft !== null && groupAvatarPickerDraft === creatingGroupAvatarDraft

      if (!shouldPreserveSavedDraft) {
        releaseChannelAvatarDraft(groupAvatarPickerDraft)
      }
    }

    setGroupAvatarPickerOpen(false)
    setGroupAvatarPickerDraft(null)
    setGroupAvatarPickerError('')
    setGroupAvatarPickerMode('device')
    setGroupAvatarPickerBusy(false)

    if (groupAvatarInputRef.current) {
      groupAvatarInputRef.current.value = ''
    }
  }

  function triggerGroupAvatarUpload() {
    groupAvatarSelectionTokenRef.current += 1
    setGroupAvatarPickerMode('device')
    setGroupAvatarPickerError('')
    setGroupAvatarPickerBusy(false)
    groupAvatarInputRef.current?.click()
  }

  async function handleGroupAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      event.target.value = ''
      return
    }

    const selectionToken = ++groupAvatarSelectionTokenRef.current
    setGroupAvatarPickerBusy(true)
    setGroupAvatarPickerError('')
    setGroupAvatarPickerMode('device')

    try {
      const nextDraft = await buildProcessedAvatarDraft(file)

      setGroupAvatarPickerDraft((currentDraft) => {
        if (selectionToken !== groupAvatarSelectionTokenRef.current) {
          releaseChannelAvatarDraft(nextDraft)
          return currentDraft
        }

        const shouldPreserveSavedDraft =
          currentDraft !== null && currentDraft === creatingGroupAvatarDraft

        if (!shouldPreserveSavedDraft) {
          releaseChannelAvatarDraft(currentDraft)
        }

        return nextDraft
      })
    } catch (error) {
      setGroupAvatarPickerError(
        error instanceof Error ? error.message : 'Не удалось подготовить аватарку группы.',
      )
    } finally {
      if (selectionToken === groupAvatarSelectionTokenRef.current) {
        setGroupAvatarPickerBusy(false)
      }
    }

    event.target.value = ''
  }

  function applyGroupAvatarSelection() {
    if (!groupAvatarPickerDraft) return

    if (creatingGroupAvatarDraft && creatingGroupAvatarDraft !== groupAvatarPickerDraft) {
      releaseChannelAvatarDraft(creatingGroupAvatarDraft)
    }

    setCreatingGroupAvatarDraft(groupAvatarPickerDraft)
    closeGroupAvatarPicker({ preserveCurrentDraft: true })
  }

  function toggleGroupCreateMember(chatId: number) {
    setCreatingGroupSelectionHint('')
    setCreatingGroupError('')
    setCreatingGroupMemberChatIds((currentChatIds) => {
      const nextSelected = currentChatIds.includes(chatId)
        ? currentChatIds.filter((currentChatId) => currentChatId !== chatId)
        : [...currentChatIds, chatId]

      if (nextSelected.length + 1 > creatingGroupMemberLimit) {
        setCreatingGroupError(
          creatingGroupMemberLimit === premiumGroupMemberLimit
            ? `Даже с премиумом владельца в группе может быть максимум ${premiumGroupMemberLimit} человек.`
            : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать больше людей, необходимо активировать премиум владельцу группы.`,
        )
        return currentChatIds
      }

      return nextSelected
    })
  }

  function getCurrentProfileAvatarPreview() {
    return profileAvatarPickerDraft?.previewUrl ?? profileSettingsDraft?.avatarImage ?? session?.avatarImage ?? null
  }

  function closeProfileAvatarPicker(options?: { preserveCurrentDraft?: boolean }) {
    profileAvatarSelectionTokenRef.current += 1

    if (!options?.preserveCurrentDraft) {
      releaseChannelAvatarDraft(profileAvatarPickerDraft)
    }

    setProfileAvatarPickerOpen(false)
    setProfileAvatarPickerDraft(null)
    setProfileAvatarPickerError('')
    setProfileAvatarPickerBusy(false)
    setProfileAvatarPickerMode('device')

    if (profileAvatarInputRef.current) {
      profileAvatarInputRef.current.value = ''
    }
  }

  function openProfileAvatarPicker() {
    profileAvatarSelectionTokenRef.current += 1
    setProfileAvatarPickerOpen(true)
    setProfileAvatarPickerDraft(null)
    setProfileAvatarPickerError('')
    setProfileAvatarPickerBusy(false)
    setProfileAvatarPickerMode('device')
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

  const syncActiveThreadRead = useCallback(async (
    target: {
      kind: 'group'
      groupId: number
      messageId: number
      threadId: string
    } | {
      kind: 'channel'
      channelId: number
      postId: number
      threadId: string
    },
  ) => {
    applyLocalThreadRead(target.threadId)

    if (!backendReady || !session?.sessionToken) {
      return
    }

    try {
      const response =
        target.kind === 'group'
          ? await markGroupThreadReadRequest(session.sessionToken, target.groupId, target.messageId)
          : await markSubscriptionChannelThreadReadRequest(
              session.sessionToken,
              target.channelId,
              target.postId,
            )
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to mark thread as read', error)
    }
  }, [applySnapshot, backendReady, session?.sessionToken])

  useEffect(() => {
    if (!threadTarget || !activeThreadId) return

    void syncActiveThreadRead(
      threadTarget.kind === 'group'
        ? {
            groupId: threadTarget.groupId,
            kind: 'group',
            messageId: threadTarget.messageId,
            threadId: activeThreadId,
          }
        : {
            channelId: threadTarget.channelId,
            kind: 'channel',
            postId: threadTarget.postId,
            threadId: activeThreadId,
          },
    )
  }, [activeThreadId, syncActiveThreadRead, threadTarget])

  async function toggleThreadSubscription(subscribe: boolean) {
    if (!threadTarget || !activeThreadId) return

    const fallbackTarget =
      threadTarget.kind === 'group'
        ? {
            groupId: threadTarget.groupId,
            kind: 'group' as const,
            messageId: threadTarget.messageId,
          }
        : {
            channelId: threadTarget.channelId,
            kind: 'channel' as const,
            postId: threadTarget.postId,
          }

    if (!backendReady || !session?.sessionToken) {
      if (subscribe) {
        applyLocalThreadSubscription(fallbackTarget)
      } else {
        applyLocalThreadUnsubscription(activeThreadId)
      }
      return
    }

    try {
      const response =
        threadTarget.kind === 'group'
          ? subscribe
            ? await subscribeToGroupThreadRequest(
                session.sessionToken,
                threadTarget.groupId,
                threadTarget.messageId,
              )
            : await unsubscribeFromGroupThreadRequest(
                session.sessionToken,
                threadTarget.groupId,
                threadTarget.messageId,
              )
          : subscribe
            ? await subscribeToSubscriptionChannelThreadRequest(
                session.sessionToken,
                threadTarget.channelId,
                threadTarget.postId,
              )
            : await unsubscribeFromSubscriptionChannelThreadRequest(
                session.sessionToken,
                threadTarget.channelId,
                threadTarget.postId,
              )
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to toggle thread subscription', error)
    }
  }

  async function sendMessage() {
    if (!activeChat) return
    if (activeChat.blockedByAdmin) return

    const chatId = activeChat.id
    const text = (chatMessageDrafts[chatId] ?? '').trim()
    const attachmentDraft = chatAttachmentDrafts[chatId]
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const replyTo = replyTarget
      ? {
          author: replyTarget.author,
          id: replyTarget.id,
          text: replyTarget.text,
        }
      : undefined
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)

    if (!text && !attachment) return

    playSendSound()

    const localId = getNextOptimisticMessageId()
    const deliveryId = getClientDeliveryId()
    const createdAt = new Date().toISOString()
    const time = formatNowTime()
    const pendingMessage: PendingDirectMessage = {
      attachment,
      attachmentDraft: buildPendingAttachmentDraft(attachmentDraft),
      chatId,
      createdAt,
      deliveryId,
      localId,
      queuedAt: createdAt,
      replyTo,
      retryCount: 0,
      status: backendReady && session?.sessionToken ? 'sending' : 'pending',
      text,
      time,
    }

    applyLocalDirectMessage(chatId, text, { attachment, createdAt, deliveryId, localId, replyTo, time })
    queuePendingDirectMessage(pendingMessage)
    clearChatComposer(chatId)
    setReplyTarget(null)

    if (backendReady && session?.sessionToken) {
      try {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          pendingMessage.attachmentDraft,
        )

        if (
          resolvedAttachment.attachmentDraft?.mediaUrl &&
          resolvedAttachment.attachmentDraft.mediaUrl !== pendingMessage.attachmentDraft?.mediaUrl
        ) {
          updatePendingDirectMessage(localId, (message) => ({
            ...message,
            attachment: resolvedAttachment.attachment,
            attachmentDraft: resolvedAttachment.attachmentDraft,
          }))
        }

        const response = await sendDirectMessageRequest(session.sessionToken, chatId, {
          attachment: resolvedAttachment.attachment,
          clientDeliveryId: deliveryId,
          markAsRead: true,
          replyTo,
          text,
        })
        removePendingDirectMessage(localId)
        applySnapshot(response.snapshot)
        trackAnalyticsEvent('direct_message_send_succeeded', {
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
        })
      } catch (error) {
        console.error('Failed to send direct message', error)
        if (isExpiredSessionError(error)) {
          logout()
          setAuthError('Сессия устарела. Войдите снова.')
          return
        }
        markPendingDirectMessageAttemptFailed(localId)
        trackAnalyticsEvent('direct_message_send_failed', {
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
        })
      }
    }
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

  function updateChannelPostDraft(channelId: number, value: string) {
    setChannelPostError('')
    setChannelPostDrafts((currentDrafts) => ({
      ...currentDrafts,
      [channelId]: value,
    }))
  }

  async function sendGroupMessage() {
    if (!activeGroup) return
    if (activeGroupWriteBlockReason) return

    const groupId = activeGroup.id
    const text = (groupMessageDrafts[groupId] ?? '').trim()
    const attachmentDraft = groupAttachmentDrafts[groupId]
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const replyTo = replyTarget
      ? {
          author: replyTarget.author,
          id: replyTarget.id,
          text: replyTarget.text,
        }
      : undefined
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    if (!text && !attachment) return

    playSendSound()

    const localId = getNextOptimisticMessageId()
    const deliveryId = getClientDeliveryId()
    const createdAt = new Date().toISOString()
    const time = formatNowTime()
    const pendingMessage: PendingGroupMessage = {
      attachment,
      attachmentDraft: buildPendingAttachmentDraft(attachmentDraft),
      createdAt,
      deliveryId,
      groupId,
      localId,
      queuedAt: createdAt,
      replyTo,
      retryCount: 0,
      status: backendReady && session?.sessionToken ? 'sending' : 'pending',
      text,
      time,
    }

    applyLocalGroupMessage(groupId, text, { attachment, createdAt, deliveryId, localId, replyTo, time })
    queuePendingGroupMessage(pendingMessage)
    clearGroupComposer(groupId)
    setReplyTarget(null)
    closeGroupMessageActions()

    if (backendReady && session?.sessionToken) {
      try {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          pendingMessage.attachmentDraft,
        )

        if (
          resolvedAttachment.attachmentDraft?.mediaUrl &&
          resolvedAttachment.attachmentDraft.mediaUrl !== pendingMessage.attachmentDraft?.mediaUrl
        ) {
          updatePendingGroupMessage(localId, (message) => ({
            ...message,
            attachment: resolvedAttachment.attachment,
            attachmentDraft: resolvedAttachment.attachmentDraft,
          }))
        }

        const response = await sendGroupMessageRequest(session.sessionToken, groupId, {
          attachment: resolvedAttachment.attachment,
          clientDeliveryId: deliveryId,
          replyTo,
          text,
        })
        removePendingGroupMessage(localId)
        applySnapshot(response.snapshot)
        trackAnalyticsEvent('group_message_send_succeeded', {
          groupId,
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
        })
      } catch (error) {
        console.error('Failed to send group message', error)
        if (isExpiredSessionError(error)) {
          logout()
          setAuthError('Сессия устарела. Войдите снова.')
          return
        }
        markPendingGroupMessageAttemptFailed(localId)
        trackAnalyticsEvent('group_message_send_failed', {
          groupId,
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
        })
      }
    }
  }

  async function sendManagedChannelPost() {
    if (!ownedCurrentManagedChannel || !currentSubscriptionChannel) return

    const text = (channelPostDrafts[currentSubscriptionChannel.id] ?? '').trim()
    const attachmentDraft = channelAttachmentDrafts[currentSubscriptionChannel.id]
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    if (!text && !attachment) return
    const replyTo = channelPostReplyTarget
      ? {
          author: channelPostReplyTarget.author,
          id: channelPostReplyTarget.id,
          text: channelPostReplyTarget.text,
        }
      : undefined

    playSendSound()

    setChannelPostBusy(true)
    setChannelPostError('')

    if (backendReady && session?.sessionToken) {
      try {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          buildPendingAttachmentDraft(attachmentDraft),
        )
        const requestBody: SendManagedChannelPostBody = {
          attachment: resolvedAttachment.attachment,
          replyTo,
          text,
        }
        const response = await sendManagedChannelPostRequest(
          session.sessionToken,
          ownedCurrentManagedChannel.id,
          requestBody,
        )
        applySnapshot(response.snapshot)
        trackAnalyticsEvent('channel_post_send_succeeded', {
          channelId: ownedCurrentManagedChannel.id,
        })

        if (previewSubscriptionChannel) {
          const matchedChannel = response.snapshot.subscriptionChannels.find(
            (channel) =>
              channel.id === previewSubscriptionChannel.id ||
              sanitizeChannelDirectLink(channel.handle) ===
                sanitizeChannelDirectLink(previewSubscriptionChannel.handle),
          )

          if (matchedChannel) {
            setPreviewSubscriptionChannel(matchedChannel)
          }
        }
        setChannelPostDrafts((currentDrafts) => ({
          ...currentDrafts,
          [currentSubscriptionChannel.id]: '',
        }))
        clearChannelAttachmentDraft(currentSubscriptionChannel.id)
        setChannelPostReplyTarget(null)
      } catch (error) {
        console.error('Failed to send managed channel post', error)
        if (isExpiredSessionError(error)) {
          logout()
          setAuthError('Сессия устарела. Войдите снова.')
          return
        }
        setChannelPostError(error instanceof Error ? error.message : 'Не удалось отправить сообщение.')
        setChannelPostBusy(false)
        trackAnalyticsEvent('channel_post_send_failed', {
          channelId: ownedCurrentManagedChannel.id,
        })
        return
      }
    } else {
      applyLocalManagedChannelPost(ownedCurrentManagedChannel, text, {
        attachment,
        replyTo,
      })
      setChannelPostDrafts((currentDrafts) => ({
        ...currentDrafts,
        [currentSubscriptionChannel.id]: '',
      }))
      clearChannelAttachmentDraft(currentSubscriptionChannel.id)
      setChannelPostReplyTarget(null)
    }
    setChannelPostBusy(false)
  }

  function openAttachmentPicker(mode: 'file' | 'photo') {
    if (!attachmentInputRef.current) return

    attachmentInputRef.current.accept = mode === 'photo' ? 'image/*' : ''
    attachmentInputRef.current.click()
  }

  async function handleChatAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file || !activeChat) {
      event.target.value = ''
      event.target.accept = ''
      return
    }

    const chatId = activeChat.id
    const selectionToken = ++chatAttachmentSelectionTokenRef.current
    const preparingDraft = createPreparingComposerAttachmentDraft(file)
    setChatAttachmentDrafts((currentAttachments) => {
      releaseComposerAttachmentDraft(currentAttachments[chatId])
      return {
        ...currentAttachments,
        [chatId]: preparingDraft,
      }
    })

    const nextAttachmentDraft = applyPhotoSendOriginalPreferenceToDraft(
      await createComposerDraft(file, { previewUrl: preparingDraft.previewUrl }),
    )
    setChatAttachmentDrafts((currentAttachments) => {
      if (selectionToken !== chatAttachmentSelectionTokenRef.current) {
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        return currentAttachments
      }

      return {
        ...currentAttachments,
        [chatId]: nextAttachmentDraft,
      }
    })

    // Reset the native file input so selecting the same file again still fires onChange.
    event.target.value = ''
    event.target.accept = ''
  }

  function openGroupAttachmentPicker(mode: 'file' | 'photo') {
    if (!groupAttachmentInputRef.current) return

    groupAttachmentInputRef.current.accept = mode === 'photo' ? 'image/*' : ''
    groupAttachmentInputRef.current.click()
  }

  async function handleGroupAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file || !activeGroup) {
      event.target.value = ''
      event.target.accept = ''
      return
    }

    const groupId = activeGroup.id
    const selectionToken = ++groupAttachmentSelectionTokenRef.current
    const preparingDraft = createPreparingComposerAttachmentDraft(file)
    setGroupAttachmentDrafts((currentAttachments) => {
      releaseComposerAttachmentDraft(currentAttachments[groupId])
      return {
        ...currentAttachments,
        [groupId]: preparingDraft,
      }
    })

    const nextAttachmentDraft = applyPhotoSendOriginalPreferenceToDraft(
      await createComposerDraft(file, { previewUrl: preparingDraft.previewUrl }),
    )
    setGroupAttachmentDrafts((currentAttachments) => {
      if (selectionToken !== groupAttachmentSelectionTokenRef.current) {
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        return currentAttachments
      }

      return {
        ...currentAttachments,
        [groupId]: nextAttachmentDraft,
      }
    })

    event.target.value = ''
    event.target.accept = ''
  }

  function openChannelAttachmentPicker(mode: 'file' | 'photo') {
    if (!channelAttachmentInputRef.current) return

    channelAttachmentInputRef.current.accept = mode === 'photo' ? 'image/*' : ''
    channelAttachmentInputRef.current.click()
  }

  async function handleChannelAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file || !currentSubscriptionChannel) {
      event.target.value = ''
      event.target.accept = ''
      return
    }

    const channelId = currentSubscriptionChannel.id
    const selectionToken = ++channelAttachmentSelectionTokenRef.current
    const preparingDraft = createPreparingComposerAttachmentDraft(file)
    setChannelAttachmentDrafts((currentAttachments) => {
      releaseComposerAttachmentDraft(currentAttachments[channelId])
      return {
        ...currentAttachments,
        [channelId]: preparingDraft,
      }
    })

    const nextAttachmentDraft = applyPhotoSendOriginalPreferenceToDraft(
      await createComposerDraft(file, { previewUrl: preparingDraft.previewUrl }),
    )
    setChannelAttachmentDrafts((currentAttachments) => {
      if (selectionToken !== channelAttachmentSelectionTokenRef.current) {
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        return currentAttachments
      }

      return {
        ...currentAttachments,
        [channelId]: nextAttachmentDraft,
      }
    })

    event.target.value = ''
    event.target.accept = ''
  }

  function openThreadAttachmentPicker(mode: 'file' | 'photo') {
    if (!threadAttachmentInputRef.current) return

    threadAttachmentInputRef.current.accept = mode === 'photo' ? 'image/*' : ''
    threadAttachmentInputRef.current.click()
  }

  async function handleThreadAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file || !threadTarget) {
      event.target.value = ''
      event.target.accept = ''
      return
    }

    const selectionToken = ++threadAttachmentSelectionTokenRef.current
    const preparingDraft = createPreparingComposerAttachmentDraft(file)
    setThreadAttachmentDraft((currentDraft) => {
      releaseComposerAttachmentDraft(currentDraft)
      return preparingDraft
    })

    const nextAttachmentDraft = applyPhotoSendOriginalPreferenceToDraft(
      await createComposerDraft(file, { previewUrl: preparingDraft.previewUrl }),
    )
    setThreadAttachmentDraft((currentDraft) => {
      if (selectionToken !== threadAttachmentSelectionTokenRef.current) {
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        return currentDraft
      }

      return nextAttachmentDraft
    })

    event.target.value = ''
    event.target.accept = ''
  }

  function closeActiveRoom() {
    setActiveChatId(null)
    setActiveSubscriptionChannelId(null)
    setPreviewSubscriptionChannel(null)
    setChannelActionsAnchor(null)
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelReportOpen(false)
    setChannelReportBusy(false)
    setChannelReportError('')
    setChannelReportSuccessOpen(false)
    setChannelPostBusy(false)
    setChannelPostError('')
    setConfirmingLeaveSubscriptionChannelId(null)
    setActiveGroupId(null)
    resetGroupSettingsState()
    setGroupParticipantsOpen(false)
    setGroupActionsAnchor(null)
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteLimitNoticeOpen(false)
    setGroupReportNoticeOpen(false)
    setThreadsDisabledHintTarget(null)
    setConfirmingLeaveGroupId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setChatActionsOpen(false)
    setReportingChatId(null)
    setReportContactBusy(false)
    setReportContactError('')
    setReportContactSuccessOpen(false)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    resetRoomMessageActions()
    resetThreadState()
    resetBlacklistFlow()
    setThreadsDisabledHintTarget(null)
    setBlacklistManagerTarget(null)
    setBlacklistAddMode(false)
    setBlacklistSearchQuery('')
    setMessageActionAnchor(null)
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

    let attemptedDirectMessage: PendingDirectMessage | null = null
    let attemptedGroupMessage: PendingGroupMessage | null = null

    try {
      const nextDirectMessage = pendingDirectMessages.find((message) => message.status === 'pending')

      if (nextDirectMessage) {
        attemptedDirectMessage = nextDirectMessage
        markPendingDirectMessageSending(nextDirectMessage.localId)
        trackAnalyticsEvent('direct_message_retry_started', {
          hasAttachment: Boolean(nextDirectMessage.attachment || nextDirectMessage.attachmentDraft),
          hasReply: Boolean(nextDirectMessage.replyTo),
          retryCount: nextDirectMessage.retryCount + 1,
        })

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
          clientDeliveryId: nextDirectMessage.deliveryId,
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

      attemptedGroupMessage = nextGroupMessage
      markPendingGroupMessageSending(nextGroupMessage.localId)
      trackAnalyticsEvent('group_message_retry_started', {
        groupId: nextGroupMessage.groupId,
        hasAttachment: Boolean(nextGroupMessage.attachment || nextGroupMessage.attachmentDraft),
        hasReply: Boolean(nextGroupMessage.replyTo),
        retryCount: nextGroupMessage.retryCount + 1,
      })

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
        clientDeliveryId: nextGroupMessage.deliveryId,
        replyTo: nextGroupMessage.replyTo,
        text: nextGroupMessage.text,
      })

      removePendingGroupMessage(nextGroupMessage.localId)
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to retry pending outgoing message', error)
      if (isExpiredSessionError(error)) {
        logout()
        setAuthError('Сессия устарела. Войдите снова.')
        return
      }
      if (attemptedDirectMessage) {
        markPendingDirectMessageAttemptFailed(attemptedDirectMessage.localId)
        trackAnalyticsEvent('direct_message_retry_failed', {
          hasAttachment: Boolean(attemptedDirectMessage.attachment || attemptedDirectMessage.attachmentDraft),
          hasReply: Boolean(attemptedDirectMessage.replyTo),
          retryCount: attemptedDirectMessage.retryCount + 1,
        })
      } else {
        if (attemptedGroupMessage) {
          markPendingGroupMessageAttemptFailed(attemptedGroupMessage.localId)
          trackAnalyticsEvent('group_message_retry_failed', {
            groupId: attemptedGroupMessage.groupId,
            hasAttachment: Boolean(attemptedGroupMessage.attachment || attemptedGroupMessage.attachmentDraft),
            hasReply: Boolean(attemptedGroupMessage.replyTo),
            retryCount: attemptedGroupMessage.retryCount + 1,
          })
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
    markPendingDirectMessageSending,
    markPendingGroupMessageAttemptFailed,
    markPendingGroupMessageSending,
    pendingDirectMessages,
    pendingGroupMessages,
    logout,
    removePendingDirectMessage,
    removePendingGroupMessage,
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

    const retryIntervalId = window.setInterval(tryFlushPendingMessages, PENDING_MESSAGE_RETRY_INTERVAL_MS)
    window.addEventListener('online', tryFlushPendingMessages)

    return () => {
      window.clearInterval(retryIntervalId)
      window.removeEventListener('online', tryFlushPendingMessages)
    }
  }, [backendReady, flushPendingMessages, hasPendingOutgoingMessages, session?.sessionToken])

  function openThreadInboxItem(item: ThreadInboxItem) {
    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedGroupId(null)
    setRetainedSubscriptionChannelId(null)
    setActiveChatId(null)
    setSearchOpen(false)
    setTopListView('threads')
    resetRoomMessageActions()
    setMessageActionAnchor(null)
    setPreviewSubscriptionChannel(null)
    setChannelPostReplyTarget(null)

    if (item.kind === 'group') {
      setActiveSubscriptionChannelId(null)
      resetSubscriptionPostActions()
      setActiveGroupId(item.groupId)
      setGroupInviteOpen(false)
      setGroupInviteBusy(false)
      setGroupInviteError('')
      setGroupInviteLimitNoticeOpen(false)
      setGroupReportNoticeOpen(false)
      setConfirmingLeaveGroupId(null)
      setGroupActionsAnchor(null)
      window.requestAnimationFrame(() => {
        openThread({ groupId: item.groupId, kind: 'group', messageId: item.messageId })
      })
      void syncGroupRead(item.groupId)
      return
    }

    setActiveGroupId(null)
    resetGroupMessageActions()
    setChannelActionsAnchor(null)
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelReportOpen(false)
    setChannelReportBusy(false)
    setChannelReportError('')
    setChannelReportSuccessOpen(false)
    setConfirmingLeaveSubscriptionChannelId(null)
    setActiveSubscriptionChannelId(item.channelId)
    setChannelPostReplyTarget(null)
    resetSubscriptionPostActions()
    window.requestAnimationFrame(() => {
      openThread({ channelId: item.channelId, kind: 'channel', postId: item.postId })
    })
    void syncSubscriptionChannelRead(item.channelId)
  }

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
    resetGroupMessageActions()
    setRetainedSubscriptionChannelId(shouldRetainSubscriptionChannelInList ? channelId : null)
    setPreviewSubscriptionChannel(null)
    setActiveSubscriptionChannelId(channelId)
    setChannelPostReplyTarget(null)
    resetSubscriptionPostActions()
    setChannelActionsAnchor(null)
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelReportOpen(false)
    setChannelReportBusy(false)
    setChannelReportError('')
    setChannelReportSuccessOpen(false)
    setConfirmingLeaveSubscriptionChannelId(null)
    setTopListView('channels')
    setSearchOpen(false)
    void syncSubscriptionChannelRead(channelId)
  }

  function openSubscriptionChannelCard(channel: SubscriptionChannel) {
    const existingChannel = subscriptionChannels.find((candidate) => candidate.id === channel.id)
    if (existingChannel) {
      openSubscriptionChannel(existingChannel.id)
      return
    }

    const matchingManagedChannel = channels.find(
      (managedChannel) =>
        sanitizeChannelDirectLink(managedChannel.directLink) ===
        sanitizeChannelDirectLink(channel.handle),
    )

    if (matchingManagedChannel) {
      setStageView('main')
      setRetainedAllChatId(null)
      setRetainedFavoriteChatId(null)
      setRetainedGroupId(null)
      setRetainedSubscriptionChannelId(null)
      setActiveChatId(null)
      setActiveGroupId(null)
      resetGroupMessageActions()
      setPreviewSubscriptionChannel(buildPreviewSubscriptionChannelFromManagedChannel(matchingManagedChannel))
      setActiveSubscriptionChannelId(null)
      setChannelPostReplyTarget(null)
      resetSubscriptionPostActions()
      setTopListView('channels')
      setSearchOpen(false)
      return
    }

    openSubscriptionChannel(channel.id)
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
      latestActivityAt: previewPost?.createdAt,
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
        setMessageActionMessageId(null)
        setForwardingMessageId(null)
        resetGroupMessageActions()
        setPreviewSubscriptionChannel(buildPreviewSubscriptionChannelFromManagedChannel(managedChannel))
        setActiveSubscriptionChannelId(null)
        setChannelPostReplyTarget(null)
        resetSubscriptionPostActions()
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
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    resetGroupMessageActions()
    setPreviewSubscriptionChannel(buildPreviewSubscriptionChannel(sourceChannel, previewPost))
    setActiveSubscriptionChannelId(null)
    setChannelPostReplyTarget(null)
    resetSubscriptionPostActions()
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
    resetSubscriptionPostActions()
    setTopListView('groups')
    setSearchOpen(false)
    setRetainedGroupId(shouldRetainGroupInList ? groupId : null)
    setActiveGroupId(groupId)
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteLimitNoticeOpen(false)
    setGroupReportNoticeOpen(false)
    setConfirmingLeaveGroupId(null)
    resetGroupMessageActions()
    setGroupActionsAnchor(null)
    void syncGroupRead(groupId)
  }

  function closeGroupActions() {
    setGroupActionsAnchor(null)
  }

  function closeGroupInvite() {
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
  }

  function openGroupInviteLimitNotice() {
    closeGroupActions()
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteLimitNoticeOpen(true)
  }

  async function toggleGroupMuted(groupId: number, muted: boolean) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await updateGroupRequest(session.sessionToken, groupId, { muted })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to update group mute state', error)
        setGroups((currentGroups) =>
          currentGroups.map((group) => (group.id === groupId ? { ...group, muted } : group)),
        )
      }
    } else {
      setGroups((currentGroups) =>
        currentGroups.map((group) => (group.id === groupId ? { ...group, muted } : group)),
      )
    }

    closeGroupActions()
  }

  function openGroupInvitePopup() {
    if (!activeGroup) return

    if (activeGroupAtMemberLimit) {
      openGroupInviteLimitNotice()
      return
    }

    closeGroupActions()
    setGroupInviteError('')
    setGroupInviteOpen(true)
  }

  async function inviteChatToActiveGroup(chatId: number) {
    if (!activeGroup) return

    if (activeGroupAtMemberLimit) {
      openGroupInviteLimitNotice()
      return
    }

    setGroupInviteBusy(true)
    setGroupInviteError('')

    if (backendReady && session?.sessionToken) {
      try {
        const response = await inviteGroupMemberRequest(session.sessionToken, activeGroup.id, {
          dialogId: chatId,
        })
        applySnapshot(response.snapshot)
        closeGroupInvite()
        return
      } catch (error) {
        console.error('Failed to invite member to group', error)
        const nextMessage =
          error instanceof Error
            ? error.message
            : 'Не удалось пригласить пользователя в группу.'

        if (
          nextMessage.includes('Максимальный размер одной группы') ||
          nextMessage.includes('максимум 200 человек')
        ) {
          openGroupInviteLimitNotice()
          return
        }

        setGroupInviteError(nextMessage)
        setGroupInviteBusy(false)
        return
      }
    }

    const invitedChat = availableChats.find((chat) => chat.id === chatId)
    if (!invitedChat) {
      setGroupInviteError('Контакт не найден.')
      setGroupInviteBusy(false)
      return
    }

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === activeGroup.id
          ? {
              ...group,
              members: group.members + 1,
              participants: [
                ...group.participants,
                buildGroupParticipantFromChat(invitedChat, invitedChat.id),
              ],
            }
          : group,
      ),
    )
    applyLocalDirectMessage(invitedChat.id, '', {
      markAsRead: invitedChat.id === activeChatId,
      sourceGroup: {
        accent: activeGroup.accent,
        creatorIdentifier: activeGroup.creatorIdentifier,
        handle: activeGroup.handle,
        sharedId: activeGroup.sharedId,
        title: activeGroup.title,
      },
    })
    closeGroupInvite()
  }

  async function leaveCurrentGroup(groupId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await leaveGroupRequest(session.sessionToken, groupId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to leave group', error)
        setGroups((currentGroups) => currentGroups.filter((group) => group.id !== groupId))
      }
    } else {
      setGroups((currentGroups) => currentGroups.filter((group) => group.id !== groupId))
    }

    setConfirmingLeaveGroupId(null)
    closeGroupInvite()
    closeGroupActions()

    if (activeGroupId === groupId) {
      closeActiveRoom()
      setStageView('main')
    }
  }

  function reportCurrentGroup() {
    closeGroupActions()
    setGroupReportNoticeOpen(true)
  }

  function openBlacklistManager(target: BlacklistManagerTarget) {
    setBlacklistManagerTarget(target)
    setBlacklistAddMode(false)
    setBlacklistSearchQuery('')
    closeGroupActions()
  }

  function closeBlacklistManager() {
    setBlacklistManagerTarget(null)
    setBlacklistAddMode(false)
    setBlacklistSearchQuery('')
  }

  async function applyGroupSettingsPatch(
    groupId: number,
    patch: UpdateGroupBody,
    options?: { strict?: boolean },
  ) {
    const optimisticGroupPatch: Partial<GroupPreview> = {
      ...(patch.commentsEnabledForAll !== undefined
        ? { commentsEnabledForAll: patch.commentsEnabledForAll }
        : {}),
      ...(patch.commentsEnabledForPremium !== undefined
        ? { commentsEnabledForPremium: patch.commentsEnabledForPremium }
        : {}),
      ...(patch.commentBlacklistIdentifiers !== undefined
        ? { commentBlacklistIdentifiers: patch.commentBlacklistIdentifiers }
        : {}),
    }

    if (!options?.strict && Object.keys(optimisticGroupPatch).length > 0) {
      applyLocalGroupPatch(groupId, optimisticGroupPatch)
    }

    if (backendReady && session?.sessionToken) {
      try {
        const response = await updateGroupRequest(session.sessionToken, groupId, patch)
        applySnapshot(response.snapshot)
        return true
      } catch (error) {
        console.error('Failed to update group settings', error)
        if (options?.strict) {
          throw error
        }
      }
    }

    applyLocalGroupPatch(groupId, patch)
    return true
  }

  async function applySubscriptionChannelPatch(
    channelId: number,
    patch: UpdateSubscriptionChannelBody,
  ) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await updateSubscriptionChannelRequest(session.sessionToken, channelId, patch)
        applySnapshot(response.snapshot)
        return
      } catch (error) {
        console.error('Failed to update subscription channel settings', error)
      }
    }

    applyLocalSubscriptionChannelPatch(channelId, patch)
  }

  function addIdentifierToBlacklist(identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!normalizedIdentifier || !blacklistManagerTarget) return

    const nextIdentifiers = [...new Set([...blacklistManagerCurrentIdentifiers, normalizedIdentifier])]

    if (blacklistManagerTarget.kind === 'group' && blacklistManagerTarget.scope === 'create') {
      setCreatingGroupBlacklistIdentifiers(nextIdentifiers)
    } else if (blacklistManagerTarget.kind === 'group' && blacklistManagerTarget.scope === 'existing') {
      void applyGroupSettingsPatch(blacklistManagerTarget.groupId, {
        commentBlacklistIdentifiers: nextIdentifiers,
      })
    } else if (blacklistManagerTarget.kind === 'channel' && blacklistManagerTarget.scope === 'create') {
      setCreatingChannelBlacklistIdentifiers(nextIdentifiers)
    } else if (blacklistManagerTarget.kind === 'channel' && blacklistManagerTarget.scope === 'existing') {
      updateChannel(blacklistManagerTarget.channelId, {
        commentBlacklistIdentifiers: nextIdentifiers,
      })
    }

    setBlacklistAddMode(false)
    setBlacklistSearchQuery('')
  }

  function removeIdentifierFromBlacklist(identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!normalizedIdentifier || !blacklistManagerTarget) return

    const nextIdentifiers = blacklistManagerCurrentIdentifiers.filter(
      (candidate) => normalizeIdentifier(candidate) !== normalizedIdentifier,
    )

    if (blacklistManagerTarget.kind === 'group' && blacklistManagerTarget.scope === 'create') {
      setCreatingGroupBlacklistIdentifiers(nextIdentifiers)
    } else if (blacklistManagerTarget.kind === 'group' && blacklistManagerTarget.scope === 'existing') {
      void applyGroupSettingsPatch(blacklistManagerTarget.groupId, {
        commentBlacklistIdentifiers: nextIdentifiers,
      })
    } else if (blacklistManagerTarget.kind === 'channel' && blacklistManagerTarget.scope === 'create') {
      setCreatingChannelBlacklistIdentifiers(nextIdentifiers)
    } else if (blacklistManagerTarget.kind === 'channel' && blacklistManagerTarget.scope === 'existing') {
      updateChannel(blacklistManagerTarget.channelId, {
        commentBlacklistIdentifiers: nextIdentifiers,
      })
    }
  }

  function openGroupThread(messageId: number) {
    if (!activeGroup) return
    clearThreadAttachmentDraft()
    openThread({ groupId: activeGroup.id, kind: 'group', messageId })
    resetGroupMessageActions()
  }

  function openChannelThread(postId: number) {
    if (!currentSubscriptionChannel) return
    clearThreadAttachmentDraft()
    openThread({ channelId: currentSubscriptionChannel.id, kind: 'channel', postId })
    resetSubscriptionPostActions()
  }

  const closeThreadView = useCallback(() => {
    clearThreadAttachmentDraft()
    closeThreadFlowView()
    resetBlacklistFlow()
  }, [closeThreadFlowView, resetBlacklistFlow])

  async function submitThreadComment() {
    const text = threadDraft.trim()
    const attachmentDraft = threadAttachmentDraft
    if (!threadTarget) return
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const replyTo = threadReplyTarget
      ? {
          author: threadReplyTarget.author,
          id: threadReplyTarget.id,
          text: threadReplyTarget.text,
        }
      : undefined
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)

    if (!text && !attachment) return

    playSendSound()

    const localId = getNextOptimisticMessageId()
    const deliveryId = getClientDeliveryId()
    const createdAt = new Date().toISOString()
    const time = formatNowTime()

    const pendingGroupThreadComment =
      threadTarget.kind === 'group'
        ? ({
            attachment,
            attachmentDraft: buildPendingAttachmentDraft(attachmentDraft),
            authorIdentifier: session?.identifier,
            createdAt,
            deliveryId,
            displayAuthor: sessionName,
            groupId: threadTarget.groupId,
            localId,
            messageId: threadTarget.messageId,
            replyTo,
            text,
            time,
          } satisfies PendingGroupThreadComment)
        : null

    const pendingChannelThreadComment =
      threadTarget.kind === 'channel'
        ? ({
            attachment,
            attachmentDraft: buildPendingAttachmentDraft(attachmentDraft),
            authorIdentifier: session?.identifier,
            channelId: threadTarget.channelId,
            createdAt,
            deliveryId,
            displayAuthor: sessionName,
            localId,
            postId: threadTarget.postId,
            replyTo,
            text,
            time,
          } satisfies PendingChannelThreadComment)
        : null

    if (threadTarget.kind === 'group') {
      applyLocalGroupThreadComment(threadTarget.groupId, threadTarget.messageId, text, replyTo, {
        attachment,
        authorIdentifier: session?.identifier,
        createdAt,
        deliveryId,
        displayAuthor: sessionName,
        localId,
        time,
      })
      applyLocalThreadSubscription({
        groupId: threadTarget.groupId,
        kind: 'group',
        messageId: threadTarget.messageId,
      })
      if (backendReady && session?.sessionToken && pendingGroupThreadComment) {
        queuePendingGroupThreadComment(pendingGroupThreadComment)
      }
    } else {
      applyLocalSubscriptionThreadComment(threadTarget.channelId, threadTarget.postId, text, replyTo, {
        attachment,
        authorIdentifier: session?.identifier,
        createdAt,
        deliveryId,
        displayAuthor: sessionName,
        localId,
        time,
      })
      applyLocalThreadSubscription({
        channelId: threadTarget.channelId,
        kind: 'channel',
        postId: threadTarget.postId,
      })
      if (backendReady && session?.sessionToken && pendingChannelThreadComment) {
        queuePendingChannelThreadComment(pendingChannelThreadComment)
      }
    }

    resetThreadComposer()
    clearThreadAttachmentDraft()
    setThreadBusy(true)
    setThreadError('')

    try {
      if (threadTarget.kind === 'group') {
        if (backendReady && session?.sessionToken) {
          const resolvedAttachment = await resolvePendingAttachmentForSend(
            session.sessionToken,
            pendingGroupThreadComment?.attachmentDraft,
          )

          const response = await sendGroupThreadCommentRequest(
            session.sessionToken,
            threadTarget.groupId,
            threadTarget.messageId,
            {
              attachment: resolvedAttachment.attachment,
              clientDeliveryId: deliveryId,
              replyTo,
              text,
            },
          )
          removePendingGroupThreadComment(localId)
          applySnapshot(response.snapshot)
          trackAnalyticsEvent('thread_comment_send_succeeded', {
            roomKind: 'group',
          })
        }
      } else {
        if (backendReady && session?.sessionToken) {
          const resolvedAttachment = await resolvePendingAttachmentForSend(
            session.sessionToken,
            pendingChannelThreadComment?.attachmentDraft,
          )

          const response = await sendSubscriptionChannelThreadCommentRequest(
            session.sessionToken,
            threadTarget.channelId,
            threadTarget.postId,
            {
              attachment: resolvedAttachment.attachment,
              clientDeliveryId: deliveryId,
              replyTo,
              text,
            },
          )
          removePendingChannelThreadComment(localId)
          applySnapshot(response.snapshot)
          trackAnalyticsEvent('thread_comment_send_succeeded', {
            roomKind: 'channel',
          })
        }
      }

      setThreadBusy(false)
    } catch (error) {
      console.error('Failed to send thread comment', error)
      if (isExpiredSessionError(error)) {
        logout()
        setAuthError('Сессия устарела. Войдите снова.')
        return
      }
      if (threadTarget.kind === 'group') {
        removePendingGroupThreadComment(localId)
        applyLocalDeleteGroupThreadComment(threadTarget.groupId, threadTarget.messageId, localId)
      } else {
        removePendingChannelThreadComment(localId)
        applyLocalDeleteSubscriptionThreadComment(threadTarget.channelId, threadTarget.postId, localId)
      }
      setThreadBusy(false)
      setThreadError(error instanceof Error ? error.message : 'Не удалось отправить комментарий.')
      trackAnalyticsEvent('thread_comment_send_failed', {
        roomKind: threadTarget.kind,
      })
    }
  }

  function addMessageAuthorToCurrentRoomBlacklist(
    identifier: string | undefined,
    roomKind: 'group' | 'channel',
  ) {
    if (!identifier) return

    if (roomKind === 'group' && activeGroup) {
      void applyGroupSettingsPatch(activeGroup.id, {
        commentBlacklistIdentifiers: [
          ...new Set([...(activeGroup.commentBlacklistIdentifiers ?? []), normalizeIdentifier(identifier)]),
        ],
      })
      closeGroupMessageActions()
      closeThreadView()
      return
    }

    if (roomKind === 'channel' && currentSubscriptionChannel) {
      void applySubscriptionChannelPatch(currentSubscriptionChannel.id, {
        commentBlacklistIdentifiers: [
          ...new Set([
            ...(currentSubscriptionChannel.commentBlacklistIdentifiers ?? []),
            normalizeIdentifier(identifier),
          ]),
        ],
      })
      closeThreadView()
    }
  }

  function confirmBlacklistTarget() {
    const target = confirmBlacklistTargetFlow()
    if (!target) return

    addMessageAuthorToCurrentRoomBlacklist(target.identifier, target.roomKind)
    trackAnalyticsEvent('blacklist_add_confirmed', {
      roomKind: target.roomKind,
    })
  }

  async function handleSaveGroupSettings() {
    const saved = await saveGroupSettings()
    if (!saved || !activeGroup) return

    trackAnalyticsEvent('group_settings_saved', {
      groupId: activeGroup.id,
    })
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
    setActiveGroupId(null)
    resetRoomMessageActions()
    setMessageActionAnchor(null)
    setBottomSection('chats')
    setActiveChatId(chatId)
    void syncDialogRead(chatId)
  }

  browserNotificationOpenTargetRef.current = (target) => {
    if (target.kind === 'chat') {
      openChat(target.chatId)
      return
    }

    if (target.kind === 'group') {
      openGroup(target.groupId)
      return
    }

    if (target.kind === 'channel') {
      openSubscriptionChannel(target.channelId)
      return
    }

    openThreadInboxItem(target.item)
  }

  useEffect(() => {
    if (!backendReady || !session?.sessionToken) {
      browserNotificationDigestRef.current = null
      suppressNextBrowserNotificationDiffRef.current = false
      return
    }

    const nextDigest = buildBrowserNotificationDigest(
      availableChats,
      groups,
      subscriptionChannels,
      threadInbox,
    )

    if (suppressNextBrowserNotificationDiffRef.current) {
      suppressNextBrowserNotificationDiffRef.current = false
      browserNotificationDigestRef.current = nextDigest
      return
    }

    const previousDigest = browserNotificationDigestRef.current
    browserNotificationDigestRef.current = nextDigest

    if (!previousDigest) {
      return
    }

    if (browserNotificationStatus !== 'granted' || !browserNotificationsEnabled || quietMode) {
      return
    }

    nextDigest.forEach((entry, key) => {
      const previousUnread = previousDigest.get(key)?.unread ?? 0
      if (entry.unread <= 0 || entry.unread <= previousUnread) {
        return
      }

      showBrowserNotification(entry.title, {
        body: entry.body,
        icon: '/icons/logo_ok_96.png',
        onClick: () => browserNotificationOpenTargetRef.current(entry.target),
        tag: `tinychok:${key}`,
      })
    })
  }, [
    availableChats,
    backendReady,
    browserNotificationsEnabled,
    browserNotificationStatus,
    groups,
    quietMode,
    session?.sessionToken,
    subscriptionChannels,
    threadInbox,
  ])

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

  function updateSessionProfile(patch: Partial<ProfileSettingsDraft>) {
    setProfileSettingsError('')
    setProfileSettingsDraft((currentDraft) => {
      if (!currentDraft) return currentDraft

      return {
        ...currentDraft,
        ...patch,
      }
    })
  }

  function discardProfileSettingsDraft() {
    if (!session) return

    setProfileSettingsDraft(buildProfileSettingsDraft(session))
    setProfileSettingsBusy(false)
    setProfileSettingsError('')
  }

  function leaveSettingsToMain(options?: { discardProfileDraft?: boolean }) {
    if (options?.discardProfileDraft) {
      discardProfileSettingsDraft()
    }

    setConfirmProfileSettingsLeaveOpen(false)
    setStageView('main')
    setConfirmingLogout(false)
  }

  async function saveProfileSettings() {
    if (!session || !profileSettingsDraft || !profileSettingsDirty) return

    const nextDisplayName = sanitizePersonField(profileSettingsDraft.displayName, displayNameFieldMaxLength)
    const nextSurname = sanitizePersonField(profileSettingsDraft.surname ?? '', surnameFieldMaxLength)
    const nextNickname = normalizeNickname(profileSettingsDraft.nickname ?? '')
    const nextStatus = sanitizeStatusField(profileSettingsDraft.status ?? '')
    const nextAvatarImage = profileSettingsDraft.avatarImage?.trim() || undefined
    const nextSoundsDisabled = Boolean(profileSettingsDraft.soundsDisabled)

    if (!nextDisplayName) {
      setProfileSettingsError('Имя не может быть пустым.')
      return
    }

    const patch: UpdateSessionBody = {
      avatarImage: nextAvatarImage,
      displayName: nextDisplayName,
      nickname: nextNickname,
      soundsDisabled: nextSoundsDisabled,
      status: nextStatus,
      surname: nextSurname,
    }

    const nextSession: Session = {
      ...session,
      avatarImage: nextAvatarImage,
      displayName: nextDisplayName,
      nickname: nextNickname,
      soundsDisabled: nextSoundsDisabled,
      status: nextStatus,
      surname: nextSurname,
    }

    setProfileSettingsBusy(true)
    setProfileSettingsError('')

    try {
      if (backendReady && session.sessionToken) {
        const response = await updateSessionRequest(session.sessionToken, patch)
        applySnapshot(response.snapshot)
        setProfileSettingsBusy(false)
      } else {
        syncSession(nextSession)
        setProfileSettingsBusy(false)
      }

      return true
    } catch (error) {
      console.error('Failed to save profile settings', error)
      setProfileSettingsError(error instanceof Error ? error.message : 'Не удалось сохранить настройки.')
      setProfileSettingsBusy(false)
      return false
    }
  }

  function blockChat(chatId: number) {
    if (!session || blockedContactIds.includes(chatId)) return

    void mutateBlockedContacts([...blockedContactIds, chatId])
    setChatActionsOpen(false)
    setReportingChatId(null)
    setReportContactBusy(false)
    setReportContactError('')
    setReportContactSuccessOpen(false)
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

  function closeReportContactDialog() {
    setReportingChatId(null)
    setReportContactBusy(false)
    setReportContactError('')
  }

  async function submitContactReport(chatId: number, reason: ComplaintReason) {
    setReportContactBusy(true)
    setReportContactError('')

    if (backendReady && session?.sessionToken) {
      try {
        const response = await reportContactRequest(session.sessionToken, chatId, { reason })
        applySnapshot(response.snapshot)
        closeReportContactDialog()
        setReportContactSuccessOpen(true)
        return
      } catch (error) {
        console.error('Failed to report contact', error)
        setReportContactError(
          error instanceof Error ? error.message : 'Не удалось отправить жалобу.',
        )
        setReportContactBusy(false)
        return
      }
    }

    closeReportContactDialog()
    setReportContactSuccessOpen(true)
  }

  async function toggleChatMuted(chatId: number, muted: boolean) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await updateDialogRequest(session.sessionToken, chatId, { muted })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to update chat mute state', error)
        setChats((currentChats) =>
          currentChats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  muted,
                  unread: muted ? 0 : chat.unread,
                }
              : chat,
          ),
        )
      }
    } else {
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                muted,
                unread: muted ? 0 : chat.unread,
              }
            : chat,
        ),
      )
    }

    setChatActionsOpen(false)
  }

  function closeChannelActions() {
    setChannelActionsAnchor(null)
  }

  function closeChannelShareDialog() {
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelShareChatIds([])
  }

  function closeChannelSubscribersDialog() {
    setChannelSubscribersOpen(false)
    setChannelSubscribersSearchQuery('')
    setSelectedChannelSubscriberIdentifier(null)
    setConfirmingRemoveChannelSubscriberIdentifier(null)
    setConfirmingBlacklistChannelSubscriberIdentifier(null)
    setChannelSubscriberActionBusy(false)
    setChannelSubscriberActionError('')
  }

  function closeChannelReportDialog() {
    setChannelReportOpen(false)
    setChannelReportBusy(false)
    setChannelReportError('')
  }

  async function toggleSubscriptionChannelMuted(channelId: number, muted: boolean) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await updateSubscriptionChannelRequest(session.sessionToken, channelId, {
          muted,
        })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to update channel mute state', error)
        setSubscriptionChannels((currentChannels) =>
          currentChannels.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  muted,
                  unread: muted ? 0 : channel.unread,
                }
              : channel,
          ),
        )
      }
    } else {
      setSubscriptionChannels((currentChannels) =>
        currentChannels.map((channel) =>
          channel.id === channelId
            ? {
                ...channel,
                muted,
                unread: muted ? 0 : channel.unread,
              }
            : channel,
        ),
      )
    }

    closeChannelActions()
  }

  function toggleChannelShareChat(chatId: number) {
    setChannelShareChatIds((currentChatIds) =>
      currentChatIds.includes(chatId)
        ? currentChatIds.filter((currentId) => currentId !== chatId)
        : [...currentChatIds, chatId],
    )
    setChannelShareError('')
  }

  function buildChannelInvitationSource(
    channel: Pick<SubscriptionChannel, 'accent' | 'draft' | 'handle' | 'title' | 'visibility'>,
  ): NonNullable<Message['sourceChannel']> {
    return {
      accent: channel.accent,
      draft: channel.draft,
      handle: channel.handle,
      leadText: 'Пользователь приглашает вас подписаться на канал:',
      title: channel.title,
      visibility: channel.visibility,
    }
  }

  async function inviteCurrentSubscriptionChannelToChats() {
    if (!currentSubscriptionChannel) return
    if (!canInviteToCurrentSubscriptionChannel) return

    setChannelShareBusy(true)
    setChannelShareError('')

    try {
      if (backendReady && session?.sessionToken) {
        const response = await inviteSubscriptionChannelMembersRequest(
          session.sessionToken,
          currentSubscriptionChannel.id,
          {
            dialogIds: selectedChannelShareChats.map((chat) => chat.id),
          },
        )
        applySnapshot(response.snapshot)
      } else {
        for (const chat of selectedChannelShareChats) {
          applyLocalDirectMessage(chat.id, '', {
            markAsRead: chat.id === activeChatId,
            sourceChannel: buildChannelInvitationSource(currentSubscriptionChannel),
          })
        }
      }

      closeChannelShareDialog()
      closeChannelActions()
    } catch (error) {
      console.error('Failed to invite contacts to channel', error)
      setChannelShareError(
        error instanceof Error ? error.message : 'Не удалось отправить приглашение в канал.',
      )
      setChannelShareBusy(false)
    }
  }

  async function removeCurrentChannelSubscriber(identifier: string) {
    if (!currentSubscriptionChannel || !backendReady || !session?.sessionToken) return

    setChannelSubscriberActionBusy(true)
    setChannelSubscriberActionError('')

    try {
      const response = await removeSubscriptionChannelSubscriberRequest(
        session.sessionToken,
        currentSubscriptionChannel.id,
        { identifier },
      )
      applySnapshot(response.snapshot)
      closeChannelSubscribersDialog()
      closeChannelActions()
    } catch (error) {
      console.error('Failed to remove channel subscriber', error)
      setChannelSubscriberActionError(
        error instanceof Error ? error.message : 'Не удалось удалить подписчика.',
      )
      setChannelSubscriberActionBusy(false)
    }
  }

  async function blacklistCurrentChannelSubscriber(identifier: string) {
    if (!currentSubscriptionChannel || !backendReady || !session?.sessionToken) return

    setChannelSubscriberActionBusy(true)
    setChannelSubscriberActionError('')

    try {
      const response = await blacklistSubscriptionChannelSubscriberRequest(
        session.sessionToken,
        currentSubscriptionChannel.id,
        { identifier },
      )
      applySnapshot(response.snapshot)
      closeChannelSubscribersDialog()
      closeChannelActions()
    } catch (error) {
      console.error('Failed to blacklist channel subscriber', error)
      setChannelSubscriberActionError(
        error instanceof Error ? error.message : 'Не удалось добавить подписчика в чёрный список.',
      )
      setChannelSubscriberActionBusy(false)
    }
  }

  async function leaveCurrentSubscriptionChannel(channelId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await leaveSubscriptionChannelRequest(session.sessionToken, channelId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to leave subscription channel', error)
        setSubscriptionChannels((currentChannels) =>
          currentChannels.filter((channel) => channel.id !== channelId),
        )
      }
    } else {
      setSubscriptionChannels((currentChannels) =>
        currentChannels.filter((channel) => channel.id !== channelId),
      )
    }

    setConfirmingLeaveSubscriptionChannelId(null)
    closeChannelShareDialog()
    closeChannelReportDialog()
    closeChannelActions()

    if (activeSubscriptionChannelId === channelId) {
      closeActiveRoom()
      setStageView('main')
    }
  }

  async function submitSubscriptionChannelReport(channelId: number, reason: ComplaintReason) {
    setChannelReportBusy(true)
    setChannelReportError('')

    if (backendReady && session?.sessionToken) {
      try {
        const response = await reportSubscriptionChannelRequest(session.sessionToken, channelId, {
          reason,
        })
        applySnapshot(response.snapshot)
        closeChannelReportDialog()
        setChannelReportSuccessOpen(true)
        return
      } catch (error) {
        console.error('Failed to report subscription channel', error)
        setChannelReportError(
          error instanceof Error ? error.message : 'Не удалось отправить жалобу на канал.',
        )
        setChannelReportBusy(false)
        return
      }
    }

    closeChannelReportDialog()
    setChannelReportSuccessOpen(true)
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
    setReportingChatId(null)
    setReportContactBusy(false)
    setReportContactError('')
    setReportContactSuccessOpen(false)
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

  function replyToThreadComment(comment: ThreadComment) {
    beginThreadReply(comment)
    clearBlacklistHint()
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

  function closeThreadCommentActions() {
    closeThreadFlowCommentActions()
    clearBlacklistHint()
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

    resetGroupMessageActions()
  }

  async function deleteManagedChannelPost(channelId: number, postId: number) {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteManagedChannelPostRequest(session.sessionToken, channelId, postId)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to delete managed channel post', error)
        applyLocalDeleteManagedChannelPost(channelId, postId)
      }
    } else {
      applyLocalDeleteManagedChannelPost(channelId, postId)
    }

    if (channelPostReplyTarget?.id === postId) {
      setChannelPostReplyTarget(null)
    }

    resetSubscriptionPostActions()
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

  async function deleteThreadComment(commentId: number) {
    if (!threadTarget) return

    if (threadTarget.kind === 'group') {
      if (backendReady && session?.sessionToken) {
        try {
          const response = await deleteGroupThreadCommentRequest(
            session.sessionToken,
            threadTarget.groupId,
            threadTarget.messageId,
            commentId,
          )
          applySnapshot(response.snapshot)
        } catch (error) {
          console.error('Failed to delete group thread comment', error)
          applyLocalDeleteGroupThreadComment(threadTarget.groupId, threadTarget.messageId, commentId)
        }
      } else {
        applyLocalDeleteGroupThreadComment(threadTarget.groupId, threadTarget.messageId, commentId)
      }
    } else {
      if (backendReady && session?.sessionToken) {
        try {
          const response = await deleteSubscriptionChannelThreadCommentRequest(
            session.sessionToken,
            threadTarget.channelId,
            threadTarget.postId,
            commentId,
          )
          applySnapshot(response.snapshot)
        } catch (error) {
          console.error('Failed to delete subscription thread comment', error)
          applyLocalDeleteSubscriptionThreadComment(threadTarget.channelId, threadTarget.postId, commentId)
        }
      } else {
        applyLocalDeleteSubscriptionThreadComment(threadTarget.channelId, threadTarget.postId, commentId)
      }
    }

    clearThreadDeleteConfirmation()
    clearThreadForwarding()
    closeThreadCommentActions()
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
    setCreatingChannelCommentsForAll(false)
    setCreatingChannelCommentsForPremium(false)
    setCreatingChannelBlacklistIdentifiers([])
  }

  function resetChannelInviteState() {
    setChannelInviteChatIds([])
    setChannelInviteBusy(false)
    setChannelInviteError('')
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
    setActiveGroupId(null)
    setGroupParticipantsOpen(false)
    resetRoomMessageActions()
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
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setMessageActionAnchor(null)
    if (nextView !== 'invite') {
      resetChannelInviteState()
    }
  }

  function openChannelsListView() {
    setActiveChannelId(null)
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

  function openManagedChannelRoom(
    channel: Channel,
    nextSubscriptionChannels: SubscriptionChannel[] = subscriptionChannels,
  ) {
    const normalizedHandle = sanitizeChannelDirectLink(channel.directLink)
    const existingSubscriptionChannel = nextSubscriptionChannels.find(
      (candidate) =>
        normalizedHandle !== '' &&
        sanitizeChannelDirectLink(candidate.handle) === normalizedHandle,
    )
    const fallbackSubscriptionChannel = nextSubscriptionChannels.find((candidate) => candidate.id === channel.id)

    if (existingSubscriptionChannel ?? fallbackSubscriptionChannel) {
      openSubscriptionChannel((existingSubscriptionChannel ?? fallbackSubscriptionChannel)!.id)
      return
    }

    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedGroupId(null)
    setRetainedSubscriptionChannelId(null)
    setActiveChatId(null)
    setActiveGroupId(null)
    resetGroupMessageActions()
    setPreviewSubscriptionChannel(buildPreviewSubscriptionChannelFromManagedChannel(channel))
    setActiveSubscriptionChannelId(null)
    setChannelPostReplyTarget(null)
    resetSubscriptionPostActions()
    setChannelActionsAnchor(null)
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelReportOpen(false)
    setChannelReportBusy(false)
    setChannelReportError('')
    setChannelReportSuccessOpen(false)
    setConfirmingLeaveSubscriptionChannelId(null)
    setTopListView('channels')
    setSearchOpen(false)
  }

  function setManagedChannelPendingPatch(
    channelId: number,
    nextPatch: UpdateManagedChannelBody,
    baselineChannel: Channel,
  ) {
    const normalizedPatch: UpdateManagedChannelBody = {}

    if (nextPatch.title !== undefined && nextPatch.title !== baselineChannel.title) {
      normalizedPatch.title = nextPatch.title
    }

    if (
      nextPatch.directLink !== undefined &&
      sanitizeChannelDirectLink(nextPatch.directLink) !== sanitizeChannelDirectLink(baselineChannel.directLink)
    ) {
      normalizedPatch.directLink = nextPatch.directLink
    }

    if (
      nextPatch.description !== undefined &&
      nextPatch.description !== baselineChannel.description
    ) {
      normalizedPatch.description = nextPatch.description
    }

    if (nextPatch.visibility !== undefined && nextPatch.visibility !== baselineChannel.visibility) {
      normalizedPatch.visibility = nextPatch.visibility
    }

    if (nextPatch.avatarTone !== undefined && nextPatch.avatarTone !== baselineChannel.avatarTone) {
      normalizedPatch.avatarTone = nextPatch.avatarTone
    }

    if (
      nextPatch.avatarImage !== undefined &&
      (nextPatch.avatarImage || undefined) !== (baselineChannel.avatarImage || undefined)
    ) {
      normalizedPatch.avatarImage = nextPatch.avatarImage
    }

    if (
      nextPatch.commentsEnabledForAll !== undefined &&
      Boolean(nextPatch.commentsEnabledForAll) !== Boolean(baselineChannel.commentsEnabledForAll)
    ) {
      normalizedPatch.commentsEnabledForAll = nextPatch.commentsEnabledForAll
    }

    if (
      nextPatch.commentsEnabledForPremium !== undefined &&
      Boolean(nextPatch.commentsEnabledForPremium) !== Boolean(baselineChannel.commentsEnabledForPremium)
    ) {
      normalizedPatch.commentsEnabledForPremium = nextPatch.commentsEnabledForPremium
    }

    if (
      nextPatch.commentBlacklistIdentifiers !== undefined &&
      !areStringListsEqual(nextPatch.commentBlacklistIdentifiers, baselineChannel.commentBlacklistIdentifiers)
    ) {
      normalizedPatch.commentBlacklistIdentifiers = nextPatch.commentBlacklistIdentifiers
    }

    if (nextPatch.status !== undefined && nextPatch.status !== baselineChannel.status) {
      normalizedPatch.status = nextPatch.status
    }

    if (Object.keys(normalizedPatch).length > 0) {
      clearScheduledBackendSnapshotSync()
      pendingChannelPatchesRef.current.set(channelId, normalizedPatch)
      suppressChannelSnapshotSyncRef.current = true
    } else {
      pendingChannelPatchesRef.current.delete(channelId)
      suppressChannelSnapshotSyncRef.current = pendingChannelPatchesRef.current.size > 0
    }

    setChannelSettingsDirtyVersion((current) => current + 1)
  }

  function syncManagedChannelState(channelId: number, nextChannelState: Channel) {
    const currentChannel = channels.find((channel) => channel.id === channelId) ?? null
    const currentHandle = sanitizeChannelDirectLink(currentChannel?.directLink ?? '')
    const nextHandle = sanitizeChannelDirectLink(nextChannelState.directLink)

    setChannels((currentChannels) =>
      currentChannels.map((channel) => (channel.id === channelId ? cloneManagedChannel(nextChannelState) : channel)),
    )

    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) => {
        const channelHandle = sanitizeChannelDirectLink(channel.handle)
        const matchesManagedChannel =
          channel.id === channelId ||
          (currentHandle !== '' && channelHandle === currentHandle) ||
          (nextHandle !== '' && channelHandle === nextHandle)

        if (!matchesManagedChannel) {
          return channel
        }

        return {
          ...channel,
          accent: nextChannelState.avatarTone,
          avatarImage: nextChannelState.avatarImage,
          commentBlacklistIdentifiers: nextChannelState.commentBlacklistIdentifiers ?? [],
          commentsEnabledForAll: Boolean(nextChannelState.commentsEnabledForAll),
          commentsEnabledForPremium: Boolean(nextChannelState.commentsEnabledForPremium),
          draft: nextChannelState.status === 'draft',
          handle: nextChannelState.directLink,
          statusText: nextChannelState.description,
          title: nextChannelState.title,
          visibility: nextChannelState.visibility,
        }
      }),
    )

    setPreviewSubscriptionChannel((currentChannelState) => {
      if (!currentChannelState) return currentChannelState

      const previewHandle = sanitizeChannelDirectLink(currentChannelState.handle)
      const matchesManagedChannel =
        currentChannelState.id === channelId ||
        (currentHandle !== '' && previewHandle === currentHandle) ||
        (nextHandle !== '' && previewHandle === nextHandle)

      if (!matchesManagedChannel) {
        return currentChannelState
      }

      return {
        ...currentChannelState,
        accent: nextChannelState.avatarTone,
        avatarImage: nextChannelState.avatarImage,
        commentBlacklistIdentifiers: nextChannelState.commentBlacklistIdentifiers ?? [],
        commentsEnabledForAll: Boolean(nextChannelState.commentsEnabledForAll),
        commentsEnabledForPremium: Boolean(nextChannelState.commentsEnabledForPremium),
        draft: nextChannelState.status === 'draft',
        handle: nextChannelState.directLink,
        statusText: nextChannelState.description,
        title: nextChannelState.title,
        visibility: nextChannelState.visibility,
      }
    })
  }

  function discardManagedChannelChanges(channelId: number, baselineChannel: Channel) {
    pendingChannelPatchesRef.current.delete(channelId)
    suppressChannelSnapshotSyncRef.current = pendingChannelPatchesRef.current.size > 0
    setChannelSettingsDirtyVersion((current) => current + 1)
    setChannelSettingsError('')
    syncManagedChannelState(channelId, baselineChannel)
    if (recentChannelAvatarSelection?.channelId === channelId) {
      setRecentChannelAvatarSelection(null)
    }
  }

  function openChannelDetailView(channelId: number) {
    setChannelManagementOpenId(null)
    setChannelSettingsError('')
    setConfirmChannelSettingsLeaveOpen(false)
    setPendingAvatarPostPrompt(null)
    setPendingAvatarPostCaption('')
    const nextChannel = channels.find((channel) => channel.id === channelId) ?? null
    setChannelSettingsBaseline(nextChannel ? cloneManagedChannel(nextChannel) : null)
    setActiveChannelId(channelId)
    openChannelsView('detail')
  }

  async function saveManagedChannelSettings(channelId: number, options?: { exitAfterSave?: boolean }) {
    setChannelSettingsBusy(true)
    setChannelSettingsError('')

    try {
      clearScheduledBackendSnapshotSync()
      const pendingPatch = pendingChannelPatchesRef.current.get(channelId) ?? null

      if (!pendingPatch || Object.keys(pendingPatch).length === 0) {
        return true
      }

      let savedSnapshot: AppSnapshot | null

      try {
        savedSnapshot = await commitManagedChannelMutation(channelId, pendingPatch, 'channel settings save')
      } catch (error) {
        setChannelSettingsError(
          getErrorMessage(error, 'Не удалось сохранить настройки канала. Попробуйте ещё раз.'),
        )
        return false
      }

      if (!savedSnapshot) {
        setChannelSettingsError('Не удалось сохранить настройки канала. Попробуйте ещё раз.')
        return false
      }

      pendingChannelPatchesRef.current.delete(channelId)
      suppressChannelSnapshotSyncRef.current = pendingChannelPatchesRef.current.size > 0
      setChannelSettingsDirtyVersion((current) => current + 1)

      const savedChannel =
        savedSnapshot.channels.find((channel) => channel.id === channelId) ??
        channels.find((channel) => channel.id === channelId) ??
        null

      if (savedChannel) {
        setChannelSettingsBaseline(cloneManagedChannel(savedChannel))
      }

      const avatarChanged =
        pendingPatch.avatarImage !== undefined &&
        (pendingPatch.avatarImage || undefined) !== (channelSettingsBaseline?.avatarImage || undefined)

      if (
        avatarChanged &&
        recentChannelAvatarSelection &&
        recentChannelAvatarSelection.channelId === channelId &&
        recentChannelAvatarSelection.mediaUrl === (pendingPatch.avatarImage || undefined)
      ) {
        setPendingAvatarPostPrompt({
          attachment: recentChannelAvatarSelection.attachment,
          channelId,
          exitAfterSave: Boolean(options?.exitAfterSave),
        })
        setPendingAvatarPostCaption('')
        return true
      }

      if (options?.exitAfterSave && savedChannel) {
        openManagedChannelRoom(savedChannel, savedSnapshot.subscriptionChannels)
      }

      return true
    } finally {
      setChannelSettingsBusy(false)
    }
  }

  async function handleActiveChannelDetailSave() {
    if (!activeChannel || channelSettingsBusy) return

    await saveManagedChannelSettings(activeChannel.id, { exitAfterSave: true })
  }

  async function handleActiveChannelDetailBack() {
    if (!activeChannel || channelSettingsBusy) {
      if (!activeChannel) {
        openChannelsListView()
      }
      return
    }

    if (activeChannelSettingsDirty) {
      setConfirmChannelSettingsLeaveOpen(true)
      return
    }

    openManagedChannelRoom(activeChannel)
  }

  function closeChannelSettingsLeaveConfirm() {
    if (channelSettingsBusy) return
    setConfirmChannelSettingsLeaveOpen(false)
  }

  function discardActiveChannelDetailChangesAndExit() {
    if (!activeChannel || !channelSettingsBaseline) return

    discardManagedChannelChanges(activeChannel.id, channelSettingsBaseline)
    setConfirmChannelSettingsLeaveOpen(false)
    openManagedChannelRoom(channelSettingsBaseline)
  }

  async function confirmActiveChannelLeaveWithSave() {
    if (!activeChannel) return

    setConfirmChannelSettingsLeaveOpen(false)
    await saveManagedChannelSettings(activeChannel.id, { exitAfterSave: true })
  }

  async function sendManagedChannelAvatarUpdatePost(
    channelId: number,
    attachment: MessageAttachment,
    caption: string,
  ) {
    if (backendReady && session?.sessionToken) {
      const response = await sendManagedChannelPostRequest(session.sessionToken, channelId, {
        attachment,
        text: caption,
      })
      applySnapshot(response.snapshot)
      return response.snapshot
    }

    const localManagedChannel = channels.find((channel) => channel.id === channelId) ?? null
    if (localManagedChannel) {
      applyLocalManagedChannelPost(localManagedChannel, caption, { attachment })
    }
    return latestSnapshotRef.current
  }

  async function confirmAvatarUpdatePost() {
    if (!pendingAvatarPostPrompt) return

    const prompt = pendingAvatarPostPrompt
    setChannelPostBusy(true)
    setChannelPostError('')

    try {
      const nextSnapshot = await sendManagedChannelAvatarUpdatePost(
        prompt.channelId,
        prompt.attachment,
        pendingAvatarPostCaption.trim(),
      )
      setPendingAvatarPostPrompt(null)
      setPendingAvatarPostCaption('')
      setRecentChannelAvatarSelection(null)

      if (prompt.exitAfterSave) {
        const latestChannel =
          nextSnapshot?.channels.find((channel) => channel.id === prompt.channelId) ??
          channels.find((channel) => channel.id === prompt.channelId) ??
          null
        if (latestChannel) {
          openManagedChannelRoom(latestChannel, nextSnapshot?.subscriptionChannels)
        }
      }
    } catch (error) {
      console.error('Failed to send avatar update post', error)
      setChannelPostError(
        error instanceof Error ? error.message : 'Не удалось опубликовать пост о смене аватарки.',
      )
    } finally {
      setChannelPostBusy(false)
    }
  }

  function skipAvatarUpdatePost() {
    const prompt = pendingAvatarPostPrompt
    setPendingAvatarPostPrompt(null)
    setPendingAvatarPostCaption('')
    setRecentChannelAvatarSelection(null)

    if (prompt?.exitAfterSave) {
      const latestChannel =
        latestSnapshotRef.current?.channels.find((channel) => channel.id === prompt.channelId) ??
        channels.find((channel) => channel.id === prompt.channelId) ??
        null
      if (latestChannel) {
        openManagedChannelRoom(
          latestChannel,
          latestSnapshotRef.current?.subscriptionChannels ?? subscriptionChannels,
        )
      }
    }
  }

  function renderAdminBlockedChatBadge(chat: Pick<Chat, 'blockedByAdmin'>) {
    if (!chat.blockedByAdmin) return null

    return (
      <span className="blocked-contact-badge" aria-label="Пользователь заблокирован администрацией">
        <img src="/icons/blocked.png" alt="" aria-hidden="true" />
      </span>
    )
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
    setChannelSettingsError('')
    const existingChannel = channels.find((channel) => channel.id === channelId) ?? null
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

    const currentHandle = sanitizeChannelDirectLink(existingChannel?.directLink ?? '')
    const nextHandle = sanitizeChannelDirectLink(normalizedPatch.directLink ?? existingChannel?.directLink ?? '')
    const shouldSyncRoomChannel =
      normalizedPatch.directLink !== undefined ||
      normalizedPatch.title !== undefined ||
      normalizedPatch.description !== undefined ||
      normalizedPatch.visibility !== undefined ||
      normalizedPatch.avatarTone !== undefined ||
      normalizedPatch.avatarImage !== undefined ||
      normalizedPatch.commentsEnabledForAll !== undefined ||
      normalizedPatch.commentsEnabledForPremium !== undefined ||
      normalizedPatch.commentBlacklistIdentifiers !== undefined ||
      normalizedPatch.status !== undefined

    if (shouldSyncRoomChannel) {
      setSubscriptionChannels((currentChannels) =>
        currentChannels.map((channel) => {
          const channelHandle = sanitizeChannelDirectLink(channel.handle)
          const matchesManagedChannel =
            channel.id === channelId ||
            (currentHandle !== '' && channelHandle === currentHandle) ||
            (nextHandle !== '' && channelHandle === nextHandle)

          return matchesManagedChannel
            ? {
                ...channel,
                ...(normalizedPatch.directLink !== undefined ? { handle: normalizedPatch.directLink } : {}),
                ...(normalizedPatch.title !== undefined ? { title: normalizedPatch.title } : {}),
                ...(normalizedPatch.description !== undefined
                  ? {
                      statusText: normalizedPatch.description,
                      ...(channel.posts.length === 0 ? { preview: normalizedPatch.description } : {}),
                    }
                  : {}),
                ...(normalizedPatch.visibility !== undefined
                  ? { visibility: normalizedPatch.visibility }
                  : {}),
                ...(normalizedPatch.avatarTone !== undefined
                  ? { accent: normalizedPatch.avatarTone }
                  : {}),
                ...(normalizedPatch.avatarImage !== undefined
                  ? { avatarImage: normalizedPatch.avatarImage }
                  : {}),
                ...(normalizedPatch.commentsEnabledForAll !== undefined
                  ? { commentsEnabledForAll: normalizedPatch.commentsEnabledForAll }
                  : {}),
                ...(normalizedPatch.commentsEnabledForPremium !== undefined
                  ? { commentsEnabledForPremium: normalizedPatch.commentsEnabledForPremium }
                  : {}),
                ...(normalizedPatch.commentBlacklistIdentifiers !== undefined
                  ? { commentBlacklistIdentifiers: normalizedPatch.commentBlacklistIdentifiers }
                  : {}),
                ...(normalizedPatch.status !== undefined
                  ? { draft: normalizedPatch.status === 'draft' }
                  : {}),
              }
            : channel
        }),
      )

      setPreviewSubscriptionChannel((currentChannel) => {
        if (!currentChannel) return currentChannel

        const previewHandle = sanitizeChannelDirectLink(currentChannel.handle)
        const matchesManagedChannel =
          currentChannel.id === channelId ||
          (currentHandle !== '' && previewHandle === currentHandle) ||
          (nextHandle !== '' && previewHandle === nextHandle)

        return matchesManagedChannel
          ? {
              ...currentChannel,
              ...(normalizedPatch.directLink !== undefined ? { handle: normalizedPatch.directLink } : {}),
              ...(normalizedPatch.title !== undefined ? { title: normalizedPatch.title } : {}),
              ...(normalizedPatch.description !== undefined
                ? {
                    statusText: normalizedPatch.description,
                    ...(currentChannel.posts.length === 0 ? { preview: normalizedPatch.description } : {}),
                  }
                : {}),
              ...(normalizedPatch.visibility !== undefined
                ? { visibility: normalizedPatch.visibility }
                : {}),
              ...(normalizedPatch.avatarTone !== undefined
                ? { accent: normalizedPatch.avatarTone }
                : {}),
              ...(normalizedPatch.avatarImage !== undefined
                ? { avatarImage: normalizedPatch.avatarImage }
                : {}),
              ...(normalizedPatch.commentsEnabledForAll !== undefined
                ? { commentsEnabledForAll: normalizedPatch.commentsEnabledForAll }
                : {}),
              ...(normalizedPatch.commentsEnabledForPremium !== undefined
                ? { commentsEnabledForPremium: normalizedPatch.commentsEnabledForPremium }
                : {}),
              ...(normalizedPatch.commentBlacklistIdentifiers !== undefined
                ? { commentBlacklistIdentifiers: normalizedPatch.commentBlacklistIdentifiers }
                : {}),
              ...(normalizedPatch.status !== undefined
                ? { draft: normalizedPatch.status === 'draft' }
                : {}),
            }
          : currentChannel
      })
    }

    const serverPatch: UpdateManagedChannelBody = {}

    if (normalizedPatch.title !== undefined) {
      serverPatch.title = normalizedPatch.title
    }

    if (normalizedDirectLink !== undefined && normalizedDirectLink !== '') {
      serverPatch.directLink = ensureUniqueChannelDirectLink(
        normalizedDirectLink,
        collectKnownChannelDirectLinks(channelId),
        normalizedPatch.title ?? existingChannel?.title ?? 'Канал',
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

    if (normalizedPatch.commentsEnabledForAll !== undefined) {
      serverPatch.commentsEnabledForAll = normalizedPatch.commentsEnabledForAll
    }

    if (normalizedPatch.commentsEnabledForPremium !== undefined) {
      serverPatch.commentsEnabledForPremium = normalizedPatch.commentsEnabledForPremium
    }

    if (normalizedPatch.commentBlacklistIdentifiers !== undefined) {
      serverPatch.commentBlacklistIdentifiers = normalizedPatch.commentBlacklistIdentifiers
    }

    if (normalizedPatch.status !== undefined) {
      serverPatch.status = normalizedPatch.status
    }

    if (Object.keys(serverPatch).length > 0) {
      const baselineChannel =
        channelSettingsBaseline && channelSettingsBaseline.id === channelId
          ? channelSettingsBaseline
          : existingChannel

      if (baselineChannel) {
        setManagedChannelPendingPatch(channelId, {
          ...(pendingChannelPatchesRef.current.get(channelId) ?? {}),
          ...serverPatch,
        }, baselineChannel)
      }
    }
  }

  function triggerChannelAvatarUpload() {
    channelAvatarSelectionTokenRef.current += 1
    setChannelAvatarPickerMode('device')
    setChannelAvatarPickerError('')
    setChannelAvatarPickerBusy(false)
    channelAvatarInputRef.current?.click()
  }

  function triggerProfileAvatarUpload() {
    profileAvatarSelectionTokenRef.current += 1
    setProfileAvatarPickerMode('device')
    setProfileAvatarPickerError('')
    setProfileAvatarPickerBusy(false)
    profileAvatarInputRef.current?.click()
  }

  async function handleProfileAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      event.target.value = ''
      return
    }

    const selectionToken = ++profileAvatarSelectionTokenRef.current
    setProfileAvatarPickerBusy(true)
    setProfileAvatarPickerError('')
    setProfileAvatarPickerMode('device')

    try {
      const nextDraft = await buildProcessedAvatarDraft(file)

      setProfileAvatarPickerDraft((currentDraft) => {
        if (selectionToken !== profileAvatarSelectionTokenRef.current) {
          releaseChannelAvatarDraft(nextDraft)
          return currentDraft
        }

        releaseChannelAvatarDraft(currentDraft)
        return nextDraft
      })
    } catch (error) {
      setProfileAvatarPickerError(
        error instanceof Error ? error.message : 'Не удалось подготовить аватарку профиля.',
      )
    } finally {
      if (selectionToken === profileAvatarSelectionTokenRef.current) {
        setProfileAvatarPickerBusy(false)
      }
    }

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

      setProfileSettingsError('')
      setProfileSettingsDraft((currentDraft) =>
        currentDraft
          ? {
              ...currentDraft,
              avatarImage: nextAvatarImage,
            }
          : currentDraft,
      )

      closeProfileAvatarPicker({ preserveCurrentDraft })
    } catch (error) {
      console.error('Failed to apply profile avatar selection', error)
      setProfileAvatarPickerError(
        error instanceof Error ? error.message : 'Не удалось применить аватарку профиля.',
      )
      setProfileAvatarPickerBusy(false)
    }
  }

  async function handleChannelAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      event.target.value = ''
      return
    }

    const selectionToken = ++channelAvatarSelectionTokenRef.current
    setChannelAvatarPickerBusy(true)
    setChannelAvatarPickerError('')
    setChannelAvatarPickerMode('device')

    try {
      const nextDraft = await buildProcessedAvatarDraft(file)

      setChannelAvatarPickerDraft((currentDraft) => {
        if (selectionToken !== channelAvatarSelectionTokenRef.current) {
          releaseChannelAvatarDraft(nextDraft)
          return currentDraft
        }

        const shouldPreserveSavedCreateDraft =
          channelAvatarPickerTarget?.scope === 'create' &&
          currentDraft !== null &&
          currentDraft === creatingChannelAvatarDraft

        if (!shouldPreserveSavedCreateDraft) {
          releaseChannelAvatarDraft(currentDraft)
        }

        return nextDraft
      })
    } catch (error) {
      setChannelAvatarPickerError(
        error instanceof Error ? error.message : 'Не удалось подготовить аватарку канала.',
      )
    } finally {
      if (selectionToken === channelAvatarSelectionTokenRef.current) {
        setChannelAvatarPickerBusy(false)
      }
    }

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
            attachment: {
              fileName: uploadedMedia.fileName,
              mediaUrl: uploadedMedia.mediaUrl,
              mimeType: uploadedMedia.mimeType,
              size: uploadedMedia.size,
            },
            label: channelAvatarPickerDraft.label,
            previewUrl: uploadedMedia.mediaUrl,
          }
        } else {
          nextDraft = {
            kind: 'uploaded',
            attachment: channelAvatarPickerDraft.file
              ? {
                  fileName: channelAvatarPickerDraft.file.name,
                  mediaUrl: channelAvatarPickerDraft.previewUrl,
                  mimeType: channelAvatarPickerDraft.file.type,
                  size: channelAvatarPickerDraft.file.size,
                }
              : channelAvatarPickerDraft.attachment,
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
        if (nextDraft.attachment) {
          setRecentChannelAvatarSelection({
            attachment: nextDraft.attachment,
            channelId: channelAvatarPickerTarget.channelId,
            mediaUrl: nextDraft.previewUrl,
          })
        }
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

  async function createGroup() {
    if (!session) return

    if (!canCreateGroup) {
      setCreatingGroupSelectionHint('Добавьте хотя бы одного пользователя в группу с вами.')
      return
    }

    if (selectedGroupCreateChats.length + 1 > creatingGroupMemberLimit) {
      setCreatingGroupError(
        creatingGroupMemberLimit === premiumGroupMemberLimit
          ? `Даже с премиумом владельца в группе может быть максимум ${premiumGroupMemberLimit} человек.`
          : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать больше людей, необходимо активировать премиум владельцу группы.`,
      )
      return
    }

    setCreatingGroupBusy(true)
    setCreatingGroupError('')
    setCreatingGroupSelectionHint('')

    try {
      const defaultTitle = buildDefaultGroupTitle(session)
      const nextTitle = creatingGroupTitle.replace(/\s+/g, ' ').trim().slice(0, groupTitleMaxLength) || defaultTitle
      let nextAvatarImage = creatingGroupAvatarDraft?.previewUrl
      let preserveCurrentDraft = creatingGroupAvatarDraft?.kind === 'upload'

      if (creatingGroupAvatarDraft?.kind === 'upload') {
        if (!creatingGroupAvatarDraft.file) {
          throw new Error('Сначала выберите изображение для загрузки.')
        }

        if (backendReady && session.sessionToken) {
          const uploadedMedia = await uploadMediaFile(
            session.sessionToken,
            creatingGroupAvatarDraft.file,
            'group-avatar',
          )
          nextAvatarImage = uploadedMedia.mediaUrl
          preserveCurrentDraft = false
          releaseChannelAvatarDraft(creatingGroupAvatarDraft)
        }
      }

      if (backendReady && session.sessionToken) {
        const response = await createGroupRequest(session.sessionToken, {
          accent: creatingGroupAccent,
          avatarImage: nextAvatarImage,
          commentBlacklistIdentifiers: creatingGroupBlacklistIdentifiers,
          commentsEnabledForAll: creatingGroupCommentsForAll,
          commentsEnabledForPremium: creatingGroupCommentsForPremium,
          memberDialogIds: selectedGroupCreateChats.map((chat) => chat.id),
          title: nextTitle,
        } satisfies CreateGroupBody)
        applySnapshot(response.snapshot)
        closeGroupCreateDialog({ preserveCurrentDraft })
        openGroup(response.groupId)
        return
      }

      const nextGroupId = groups.reduce((maxId, group) => Math.max(maxId, group.id), 0) + 1
      const creatorParticipant: GroupParticipant = {
        accent: creatingGroupAccent,
        id: getSyntheticChannelId(session.identifier),
        identifier: session.identifier,
        online: true,
        premium: sessionHasPremium,
        status: session.status?.trim() || 'в сети',
        title: formatSessionName(session),
      }
      const participants = [
        creatorParticipant,
        ...selectedGroupCreateChats.map((chat) => buildGroupParticipantFromChat(chat, chat.id)),
      ]
      const nextGroup: GroupPreview = {
        accent: creatingGroupAccent,
        avatarImage: nextAvatarImage,
        commentBlacklistIdentifiers: creatingGroupBlacklistIdentifiers,
        commentsEnabledForAll: creatingGroupCommentsForAll,
        commentsEnabledForPremium: creatingGroupCommentsForPremium,
        creatorIdentifier: session.identifier,
        handle: buildLocalGroupHandle(nextGroupId),
        id: nextGroupId,
        members: participants.length,
        messages: [],
        muted: false,
        participants,
        preview: 'Группа создана. Можно начинать обсуждение.',
        sharedId: `${session.identifier}:${nextGroupId}:${Date.now()}`,
        time: formatNowTime(),
        title: nextTitle,
        unread: 0,
      }

      setGroups((currentGroups) => [nextGroup, ...currentGroups])

      selectedGroupCreateChats.forEach((chat) => {
        applyLocalDirectMessage(chat.id, '', {
          markAsRead: chat.id === activeChatId,
          sourceGroup: {
            accent: nextGroup.accent,
            avatarImage: nextGroup.avatarImage,
            creatorIdentifier: nextGroup.creatorIdentifier,
            handle: nextGroup.handle,
            sharedId: nextGroup.sharedId,
            title: nextGroup.title,
          },
        })
      })

      closeGroupCreateDialog({ preserveCurrentDraft })
      openGroup(nextGroupId)
    } catch (error) {
      console.error('Failed to create group', error)
      setCreatingGroupError(error instanceof Error ? error.message : 'Не удалось создать группу.')
      setCreatingGroupBusy(false)
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
          commentBlacklistIdentifiers: creatingChannelBlacklistIdentifiers,
          commentsEnabledForAll: creatingChannelCommentsForAll,
          commentsEnabledForPremium: creatingChannelCommentsForPremium,
          description: creatingChannelDescription,
          directLink: ensureUniqueChannelDirectLink(
            sanitizeChannelDirectLink(creatingChannelDirectLink) ||
              buildChannelDirectLinkFromTitle(creatingChannelTitle),
            collectKnownChannelDirectLinks(),
            creatingChannelTitle,
          ),
          title: creatingChannelTitle,
          visibility: 'private',
        } satisfies CreateManagedChannelBody)
        applySnapshot(response.snapshot)
        setCreatingChannelAvatarDraft(null)
        resetChannelInviteState()
        setActiveChannelId(response.channelId)
        setChannelManagementOpenId(null)
        openChannelsView('invite')
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
      'Статус канала не задан.'
    const nextChannel: Channel = {
      avatarImage: creatingChannelAvatarDraft?.previewUrl,
      avatarTone: creatingChannelAvatarTone,
      commentBlacklistIdentifiers: creatingChannelBlacklistIdentifiers,
      commentsEnabledForAll: creatingChannelCommentsForAll,
      commentsEnabledForPremium: creatingChannelCommentsForPremium,
      description,
      directLink,
      id: nextId,
      status: 'draft',
      title,
      visibility: 'private',
    }

    setChannels((currentChannels) => [...currentChannels, nextChannel])
    setSubscriptionChannels((currentChannels) => [
      buildPreviewSubscriptionChannelFromManagedChannel(nextChannel),
      ...currentChannels,
    ])
    setCreatingChannelAvatarDraft(null)
    resetChannelInviteState()
    setActiveChannelId(nextId)
    setChannelManagementOpenId(null)
    openChannelsView('invite')
  }

  function toggleManagedChannelInviteChat(chatId: number) {
    setChannelInviteChatIds((currentChatIds) =>
      currentChatIds.includes(chatId)
        ? currentChatIds.filter((currentId) => currentId !== chatId)
        : [...currentChatIds, chatId],
    )
    setChannelInviteError('')
  }

  async function inviteMembersToActiveManagedChannel() {
    if (!activeChannel) return
    if (!canInviteToManagedChannel) return

    const selectedDialogIds = selectedChannelInviteChats.map((chat) => chat.id)
    setChannelInviteBusy(true)
    setChannelInviteError('')

    if (backendReady && session?.sessionToken) {
      try {
        const response = await inviteManagedChannelMembersRequest(session.sessionToken, activeChannel.id, {
          dialogIds: selectedDialogIds,
        })
        applySnapshot(response.snapshot)
        resetChannelInviteState()
        setActiveChannelId(null)
        openChannelsView('list')
        return
      } catch (error) {
        console.error('Failed to invite members to channel', error)
        setChannelInviteError(
          error instanceof Error ? error.message : 'Не удалось пригласить контакты в канал.',
        )
        setChannelInviteBusy(false)
        return
      }
    }

    resetChannelInviteState()
    setActiveChannelId(null)
    openChannelsView('list')
  }

  function closeChannelTransfer() {
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setChannelTransferSearch('')
  }

  function closeSubscriptionPostActions() {
    closeRoomSubscriptionPostActions()
    setThreadsDisabledHintTarget(null)
  }

  function closeGroupMessageActions() {
    closeRoomGroupMessageActions()
    clearBlacklistHint()
    setThreadsDisabledHintTarget(null)
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
          captchaBusy={captchaBusy}
          captchaContainerRef={captchaContainerRef}
          captchaProvider={captchaProvider}
          captchaRequired={captchaRequired}
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
            setAuthBlockedNoticeOpen(false)
          }}
          onSmsCodeChange={(value) => {
            setSmsCode(value.replace(/[^\d]/g, ''))
            setAuthBlockedNoticeOpen(false)
          }}
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
        {authBlockedNoticeOpen ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть предупреждение о блокировке"
              onClick={() => setAuthBlockedNoticeOpen(false)}
            />
            <div className="room-confirm room-confirm-compact auth-blocked-popup">
              <p className="room-confirm-copy">Вход временно заблокирован.</p>
              <p className="settings-text room-confirm-note">
                На ваш аккаунт поступило много жалоб. Если произошла ошибка, напишите в поддержку
                и укажите email: devisjjones@gmail.com
              </p>
              <div className="room-confirm-actions room-confirm-actions-single">
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={() => setAuthBlockedNoticeOpen(false)}
                >
                  Понятно
                </button>
              </div>
            </div>
          </>
        ) : null}
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
          onOpenAttachment={openMediaViewer}
          post={activeSubscriptionPost}
          draft={Boolean(currentSubscriptionChannel?.draft)}
        />
      ) : null}
      {currentSubscriptionChannel?.visibility === 'closed' ? (
        subscriptionPostActionAnchor ? (
          <div
            ref={subscriptionPostMenuRef}
            className="message-menu"
            style={subscriptionPostMenuStyle}
          >
            {isCurrentSubscriptionChannelOwner ? (
              <button
                type="button"
                className="message-menu-item"
                onClick={() => {
                  setChannelPostReplyTarget({
                    author: 'me',
                    id: activeSubscriptionPost.id,
                    text: formatMessagePreview(activeSubscriptionPost),
                  })
                  closeSubscriptionPostActions()
                }}
              >
                Ответить
              </button>
            ) : null}
            <button
              type="button"
              className={`message-menu-item${
                hasRoomThreadsEnabled(currentSubscriptionChannel) ? '' : ' disabled'
              }`}
              aria-disabled={!hasRoomThreadsEnabled(currentSubscriptionChannel)}
              onClick={() => {
                if (!hasRoomThreadsEnabled(currentSubscriptionChannel)) {
                  setThreadsDisabledHintTarget('channel-post')
                  return
                }

                openChannelThread(activeSubscriptionPost.id)
              }}
            >
              Прокомментировать
            </button>
            {threadsDisabledHintTarget === 'channel-post' ? (
              <p className="settings-text message-menu-note">
                {getThreadsDisabledNoticeText('channel')}
              </p>
            ) : null}
            {isCurrentSubscriptionChannelOwner ? (
              <button
                type="button"
                className="message-menu-item danger"
                onClick={() => {
                  requestSubscriptionPostDelete(activeSubscriptionPost.id)
                }}
              >
                Удалить
              </button>
            ) : null}
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
                      {group.avatarImage ? (
                        <img src={group.avatarImage} alt="" className="channel-avatar-image" />
                      ) : (
                        formatChannelAvatarLabel(group.title)
                      )}
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
            onClick={clearSubscriptionPostForwarding}
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
          {isCurrentSubscriptionChannelOwner ? (
            <button
              type="button"
              className="message-menu-item"
              onClick={() => {
                setChannelPostReplyTarget({
                  author: 'me',
                  id: activeSubscriptionPost.id,
                  text: formatMessagePreview(activeSubscriptionPost),
                })
                closeSubscriptionPostActions()
              }}
            >
              Ответить
            </button>
          ) : null}
          <button
            type="button"
            className="message-menu-item"
            onClick={() => startSubscriptionPostForwarding(formatMessagePreview(activeSubscriptionPost))}
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
          {currentSubscriptionChannel ? (
            <>
              <button
                type="button"
                className={`message-menu-item${hasRoomThreadsEnabled(currentSubscriptionChannel) ? '' : ' disabled'}`}
                aria-disabled={!hasRoomThreadsEnabled(currentSubscriptionChannel)}
                onClick={() => {
                  if (!hasRoomThreadsEnabled(currentSubscriptionChannel)) {
                    setThreadsDisabledHintTarget('channel-post')
                    return
                  }

                  openChannelThread(activeSubscriptionPost.id)
                }}
              >
                Прокомментировать
              </button>
              {threadsDisabledHintTarget === 'channel-post' ? (
                <p className="settings-text message-menu-note">
                  {getThreadsDisabledNoticeText('channel')}
                </p>
              ) : null}
            </>
          ) : null}
          {isCurrentSubscriptionChannelOwner ? (
            <button
              type="button"
              className="message-menu-item danger"
              onClick={() => {
                requestSubscriptionPostDelete(activeSubscriptionPost.id)
              }}
            >
              Удалить
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  ) : null

  const threadRoom = threadTarget ? (
    <>
      <section className="chat-room room-thread">
        <header className="room-header room-thread-header">
          <button
            type="button"
            className="soft-button room-mobile-back room-thread-back"
            onClick={closeThreadView}
            aria-label="Назад"
            title="Назад"
          >
            <img src="/icons/back.png" alt="" aria-hidden="true" className="room-mobile-back-icon" />
          </button>
          <div className="room-id">
            <div>
              <div className="room-title">
                <div className="room-title-name">
                  <h3>{`Комментарии: ${activeThreadSourceLabel}`}</h3>
                  <span className="chat-star room-thread-entity-icon" aria-hidden="true">
                    <img
                      src={
                        threadTarget.kind === 'group'
                          ? '/icons/group100.png'
                          : '/icons/news100.svg'
                      }
                      alt=""
                    />
                  </span>
                </div>
              </div>
              <p className="room-thread-meta">
                {`${activeThreadCommentCount} ${activeThreadCommentLabel}`}
              </p>
            </div>
          </div>
          {activeThreadId ? (
            <button
              type="button"
              className="soft-button room-thread-subscribe"
              onClick={() => {
                void toggleThreadSubscription(!activeThreadSubscribed)
              }}
            >
              <img src="/icons/root-50.png" alt="" aria-hidden="true" className="room-thread-subscribe-icon" />
              {activeThreadSubscribed ? 'Отписаться' : 'Подписаться'}
            </button>
          ) : null}
        </header>

        <div className="room-thread-source" ref={threadSourceRef}>
          {threadTarget.kind === 'group' && threadGroupMessage ? (
            (() => {
              const hasImageAttachment = Boolean(
                threadGroupMessage.attachment && isImageMimeType(threadGroupMessage.attachment.mimeType),
              )
              const isImageOnlyBubble =
                hasImageAttachment &&
                !resolveEmbeddedChannelFromMessage(threadGroupMessage) &&
                !threadGroupMessage.sourceChannel &&
                !threadGroupMessage.sourceGroup &&
                threadSourceText.trim().length === 0

              return (
            <AttachedReplyBubble
              mine={threadGroupMessage.author === 'me'}
              replyTo={threadGroupMessage.replyTo}
              bubble={
                <article
                  className={`bubble room-thread-source-bubble${threadGroupMessage.author === 'me' ? ' mine' : ''}${threadGroupMessage.replyTo ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`}
                >
                  <BubbleMessageContent
                    imageOverlay={
                      hasImageAttachment ? <BubbleImageOverlayMeta time={threadSourceTime} /> : undefined
                    }
                    linkedChannel={resolveEmbeddedChannelFromMessage(threadGroupMessage)}
                    message={{
                      ...threadGroupMessage,
                      text: threadSourceText,
                    }}
                    onOpenAttachment={openMediaViewer}
                    showReplyInline={false}
                  />
                  {!hasImageAttachment ? <time>{threadSourceTime}</time> : null}
                </article>
              }
            />
              )
            })()
          ) : threadTarget.kind === 'channel' && threadChannelPost ? (
            (() => {
              const hasImageAttachment = Boolean(
                threadChannelPost.attachment && isImageMimeType(threadChannelPost.attachment.mimeType),
              )
              const isImageOnlyBubble =
                hasImageAttachment && threadSourceText.trim().length === 0

              return (
            <AttachedReplyBubble
              className="channel"
              onReplyClick={(() => {
                const replyReference = threadChannelPost.replyTo
                const replyReferenceId = replyReference?.id

                return replyReference &&
                  typeof replyReferenceId === 'number' &&
                  Number.isInteger(replyReferenceId) &&
                  replyReferenceId > 0
                  ? () => {
                      setDeferredRoomScrollTarget({
                        id: replyReferenceId,
                        kind: 'channel-post',
                      })
                      closeThreadView()
                    }
                  : undefined
              })()}
              replyTo={threadChannelPost.replyTo}
              bubble={
                <article
                  className={`bubble channel-post room-thread-source-bubble${threadChannelPost.replyTo ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`}
                >
                  <BubbleMessageContent
                    imageOverlay={
                      hasImageAttachment ? <BubbleImageOverlayMeta time={threadSourceTime} /> : undefined
                    }
                    message={{
                      ...threadChannelPost,
                      text: threadSourceText,
                    }}
                    onOpenAttachment={openMediaViewer}
                    showReplyInline={false}
                  />
                  {!hasImageAttachment ? <time>{threadSourceTime}</time> : null}
                </article>
              }
            />
              )
            })()
          ) : null}
        </div>

        <div className="message-feed room-thread-feed" ref={messageFeedRef}>
          {activeThreadComments.length > 0 ? (
            activeThreadComments.map((comment) => {
              const participant = resolveThreadCommentParticipant(comment)
              const mine = comment.author === 'me'
              const hasImageAttachment = Boolean(
                comment.attachment && isImageMimeType(comment.attachment.mimeType),
              )
              const isImageOnlyBubble = hasImageAttachment && comment.text.trim().length === 0
              const replyReference = comment.replyTo

              return (
                <AttachedReplyBubble
                  key={`thread-comment-${comment.id}`}
                  mine={mine}
                  onReplyClick={
                    replyReference && Number.isInteger(replyReference.id) && replyReference.id > 0
                      ? () => scrollToThreadComment(replyReference.id)
                      : undefined
                  }
                  replyTo={replyReference}
                  bubble={
                    <button
                      type="button"
                      data-thread-comment-id={comment.id}
                      className={`bubble bubble-button${mine ? ' mine' : ''}${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`}
                      onClick={(event) => {
                        scheduleActionAnchor(
                          event.currentTarget,
                          mine ? 'end' : 'start',
                          (anchor) => openThreadFlowCommentActions(comment.id, anchor),
                        )
                      }}
                    >
                      {mine ? (
                        <span className="bubble-meta">Вы</span>
                      ) : participant ? (
                        <div className="bubble-sender">
                          <span className="bubble-sender-avatar-stack">
                            <span
                              className="avatar bubble-sender-avatar"
                              style={{ backgroundColor: participant.accent }}
                            >
                              {participant.title.slice(0, 1)}
                            </span>
                            {participant.online ? (
                              <span className="bubble-sender-presence-dot" aria-label="В сети" />
                            ) : null}
                          </span>
                          <span className="bubble-sender-name">{participant.title}</span>
                          {participant.premium ? (
                            <span className="premium-crown bubble-sender-crown" aria-label="Премиум">
                              <img src="/icons/crown64.png" alt="" />
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="bubble-meta">{comment.displayAuthor ?? 'Участник'}</span>
                      )}
                      <BubbleMessageContent
                        imageOverlay={
                          hasImageAttachment ? <BubbleImageOverlayMeta time={comment.time} /> : undefined
                        }
                        message={{
                          attachment: comment.attachment,
                          replyTo: comment.replyTo,
                          sourceGroup: undefined,
                          text: comment.text,
                        }}
                        onOpenAttachment={openMediaViewer}
                        showReplyInline={false}
                      />
                      {!hasImageAttachment ? <time>{comment.time}</time> : null}
                    </button>
                  }
                />
              )
            })
          ) : null}
        </div>

        {activeThreadBlockReason ? (
          <div className="composer composer-disabled">
            <p className="composer-disabled-note">{activeThreadBlockReason}</p>
          </div>
        ) : (
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              void submitThreadComment()
            }}
          >
            {activeThreadComments.length === 0 ? (
              <p className="room-thread-empty-copy">Будьте первым, кто оставит комментарий</p>
            ) : null}
            <div className="composer-input">
              {threadReplyTarget ? (
                <div className="composer-reply">
                  <div>
                    <span className="settings-label">Ответ</span>
                    <p>{threadReplyTarget.text}</p>
                  </div>
                  <button
                    type="button"
                    className="soft-button composer-reply-cancel"
                    onClick={clearThreadReplyTarget}
                    aria-label="Отменить ответ"
                    title="Отменить ответ"
                  >
                    <img src="/icons/cancel.png" alt="" aria-hidden="true" className="composer-reply-cancel-icon" />
                  </button>
                </div>
              ) : null}
              <div className="composer-entry">
                <div className="composer-field">
                  {threadAttachmentDraft ? (
                    <ComposerAttachmentPreview
                      attachmentDraft={threadAttachmentDraft}
                      onClear={clearThreadAttachmentDraft}
                      onOpenPreview={() => openAttachmentDraftPreview(threadAttachmentDraft)}
                      onOpenPremiumUpsell={openPremiumUpsell}
                      onToggleSendOriginal={toggleThreadAttachmentSendOriginal}
                      premiumUnlocked={sessionHasPremium}
                    />
                  ) : null}
                  <input
                    ref={threadAttachmentInputRef}
                    type="file"
                    className="composer-attachment-input"
                    onChange={handleThreadAttachmentChange}
                  />
                  <textarea
                    ref={threadComposerInputRef}
                    rows={1}
                    placeholder={
                      threadAttachmentDraft
                        ? threadAttachmentDraft.mimeType.startsWith('image/')
                          ? 'Добавьте подпись к фотографии...'
                          : 'Добавьте подпись к файлу...'
                        : 'Напишите комментарий...'
                    }
                    value={threadDraft}
                    onChange={(event) => setThreadDraft(event.target.value)}
                    onKeyDown={handleThreadComposerKeyDown}
                  />
                  <div className="composer-tools">
                    <EmojiPicker
                      canSelectGif={!getGifSelectionBlockedReason(threadAttachmentDraft)}
                      gifLibrary={session?.gifLibrary ?? []}
                      gifSelectionBlockedReason={getGifSelectionBlockedReason(threadAttachmentDraft)}
                      onDeleteGif={deleteGifFromLibrary}
                      onOpenPremiumUpsell={openPremiumUpsell}
                      onSearchGifs={searchAvailableGifs}
                      onSelect={(emoji) =>
                        insertComposerTextAtCursor(
                          threadComposerInputRef.current,
                          threadDraft,
                          emoji,
                          setThreadDraft,
                        )
                      }
                      onSelectGif={attachThreadGif}
                      onUploadGif={uploadAndAttachThreadGif}
                      premiumUnlocked={sessionHasPremium}
                    />
                    <ComposerAttachmentPicker
                      attachmentName={threadAttachmentDraft?.fileName ?? ''}
                      onSelectMode={openThreadAttachmentPicker}
                    />
                    {threadDraft.trim() || threadAttachmentDraft ? (
                      <button
                        type="submit"
                        className="send-button composer-send"
                        disabled={
                          threadBusy ||
                          (threadAttachmentDraft
                            ? threadAttachmentDraft.status !== 'ready'
                            : !threadDraft.trim())
                        }
                      >
                        <span className="composer-send-icon" aria-hidden="true">
                          <img src="/icons/sent.png" alt="" />
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {threadError ? <p className="auth-error">{threadError}</p> : null}
          </form>
        )}
      </section>
      {activeThreadComment ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim message-menu-scrim"
            aria-label="Закрыть действия с комментарием"
            onClick={() => {
              closeThreadCommentActions()
              clearThreadForwarding()
            }}
          />
          {threadCommentActionAnchor && !forwardingThreadCommentText ? (
            <SelectedBubbleOverlay
              anchor={threadCommentActionAnchor}
              kind="thread-comment"
              comment={activeThreadComment}
              mine={activeThreadComment.author === 'me'}
              onOpenAttachment={openMediaViewer}
              participant={activeThreadCommentParticipant}
            />
          ) : null}
          {forwardingThreadCommentText ? (
            <div className="room-confirm room-forward">
              <p className="room-confirm-copy">Кому переслать сообщение?</p>
              <div className="room-forward-list">
                {availableChats.map((chat) => (
                  <button
                    key={`thread-forward-chat-${chat.id}`}
                    type="button"
                    className="room-forward-item"
                    onClick={() => {
                      void forwardTextToChat(chat.id, forwardingThreadCommentText, {
                        forwarded: true,
                        forwardedAuthorName:
                          activeThreadComment.author === 'me'
                            ? sessionName
                            : activeThreadCommentParticipant?.title ?? activeThreadComment.displayAuthor,
                      })
                      clearThreadForwarding()
                      closeThreadCommentActions()
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
                onClick={clearThreadForwarding}
              >
                Назад
              </button>
            </div>
          ) : threadCommentActionAnchor ? (
            <div
              ref={threadCommentMenuRef}
              className="message-menu"
              style={threadCommentMenuStyle}
            >
              <button
                type="button"
                className="message-menu-item"
                onClick={() => replyToThreadComment(activeThreadComment)}
              >
                Ответить
              </button>
              <button
                type="button"
                className="message-menu-item"
                onClick={() => {
                  copyToClipboard(activeThreadComment.text, 'Сообщение скопировано')
                  closeThreadCommentActions()
                }}
              >
                Скопировать
              </button>
              <button
                type="button"
                className="message-menu-item"
                onClick={() => setForwardingThreadCommentText(activeThreadComment.text)}
              >
                Переслать
              </button>
              {activeThreadComment.author === 'me' ? (
                <button
                  type="button"
                  className="message-menu-item danger"
                  onClick={() => {
                    requestThreadCommentDeleteFlow(activeThreadComment.id)
                  }}
                >
                  Удалить
                </button>
              ) : canBlacklistActiveThreadComment ? (
                <>
                  <button
                    type="button"
                    className={`message-menu-item danger${activeThreadCommentAlreadyBlacklisted ? ' disabled' : ''}`}
                    aria-disabled={activeThreadCommentAlreadyBlacklisted}
                    onClick={() => {
                      if (activeThreadCommentAlreadyBlacklisted) {
                        showBlacklistHint('thread-comment')
                        return
                      }
                      if (!activeThreadCommentParticipant?.identifier) return
                      openBlacklistConfirmation({
                        identifier: activeThreadCommentParticipant.identifier,
                        nickname: activeThreadCommentParticipant.nickname,
                        roomKind: threadTarget.kind,
                        title: activeThreadCommentParticipant.title,
                      })
                      closeThreadCommentActions()
                    }}
                  >
                    В чёрный список
                  </button>
                  {blacklistHintTarget === 'thread-comment' ? (
                    <p className="settings-text message-menu-note">Пользователь уже в чёрном списке</p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {confirmingDeleteThreadCommentId !== null ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение удаления комментария"
            onClick={clearThreadDeleteConfirmation}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">Удалить свой комментарий?</p>
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button room-confirm-danger"
                onClick={() => {
                  void deleteThreadComment(confirmingDeleteThreadCommentId)
                }}
              >
                Удалить
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={clearThreadDeleteConfirmation}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  ) : null

  const channelRoomActions = actionableSubscriptionChannel ? (
    <>
      {channelActionsAnchor ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim message-menu-scrim"
            aria-label="Закрыть действия канала"
            onClick={closeChannelActions}
          />
          <div
            ref={channelActionsMenuRef}
            className="message-menu"
            style={channelActionsMenuStyle}
          >
            {isCurrentSubscriptionChannelOwner && ownedCurrentManagedChannel ? (
              <button
                type="button"
                className="message-menu-item"
                onClick={() => {
                  closeChannelActions()
                  openChannelDetailView(ownedCurrentManagedChannel.id)
                }}
              >
                Настройки канала
              </button>
            ) : null}
            <button
              type="button"
              className="message-menu-item"
              onClick={() => {
                void toggleSubscriptionChannelMuted(
                  actionableSubscriptionChannel.id,
                  !actionableSubscriptionChannel.muted,
                )
              }}
            >
              {actionableSubscriptionChannel.muted ? 'Включить уведомления' : 'Заглушить'}
            </button>
            <button
              type="button"
              className="message-menu-item"
              onClick={() => {
                setChannelShareOpen(true)
                setChannelShareBusy(false)
                setChannelShareError('')
                setChannelShareChatIds([])
                setChannelReportOpen(false)
                setChannelReportError('')
              }}
            >
              Пригласить подписаться
            </button>
            <button
              type="button"
              className="message-menu-item"
              onClick={() => {
                setChannelReportOpen(true)
                setChannelReportBusy(false)
                setChannelReportError('')
                setChannelShareOpen(false)
                setChannelShareError('')
              }}
            >
              Пожаловаться
            </button>
            {!isCurrentSubscriptionChannelOwner ? (
              <button
                type="button"
                className="message-menu-item danger"
                onClick={() => setConfirmingLeaveSubscriptionChannelId(actionableSubscriptionChannel.id)}
              >
                Покинуть канал
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {channelShareOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть приглашение в канал"
            onClick={closeChannelShareDialog}
          />
          <div className="room-confirm room-forward room-transfer-list">
            <p className="room-confirm-copy">{`Кого пригласить подписаться на канал ${actionableSubscriptionChannel.title}?`}</p>
            <div className="room-forward-list">
              {availableChats.length > 0 ? (
                availableChats.map((chat) => {
                  const chatIdentifier = normalizeIdentifier(chat.phone)
                  const alreadySubscribed =
                    chatIdentifier !== '' && currentSubscriptionChannelSubscriberIdentifiers.has(chatIdentifier)
                  const isSelected = channelShareChatIds.includes(chat.id)

                  return (
                    <button
                      key={`channel-share-${chat.id}`}
                      type="button"
                      className={`room-forward-item group-create-member-item${isSelected ? ' active' : ''}${alreadySubscribed ? ' room-forward-item-disabled' : ''}`}
                      onClick={() => {
                        if (alreadySubscribed || channelShareBusy) return
                        toggleChannelShareChat(chat.id)
                      }}
                      disabled={channelShareBusy || alreadySubscribed}
                    >
                      <span className="chat-avatar-stack">
                        <span className="avatar" style={{ backgroundColor: chat.accent }}>
                          {chat.title.slice(0, 1)}
                        </span>
                        {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                      </span>
                      <span className="group-create-member-copy">
                        <strong className="group-create-member-name-row">
                          <span>{chat.title}</span>
                        </strong>
                        <span>
                          {alreadySubscribed
                            ? 'Уже подписан(а)'
                            : chat.handle || chat.phone}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="group-create-member-checkbox"
                        checked={isSelected || alreadySubscribed}
                        disabled={alreadySubscribed}
                        readOnly
                        tabIndex={-1}
                      />
                    </button>
                  )
                })
              ) : (
                <article className="settings-item room-transfer-empty">
                  <p className="settings-text">Контакты не найдены.</p>
                </article>
              )}
            </div>
            {channelShareError ? <p className="auth-error">{channelShareError}</p> : null}
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button"
                onClick={closeChannelShareDialog}
                disabled={channelShareBusy}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`room-confirm-button room-confirm-button-primary${canInviteToCurrentSubscriptionChannel ? '' : ' disabled'}`}
                aria-disabled={!canInviteToCurrentSubscriptionChannel}
                onClick={() => {
                  if (channelShareBusy || !canInviteToCurrentSubscriptionChannel) return
                  void inviteCurrentSubscriptionChannelToChats()
                }}
                disabled={channelShareBusy}
              >
                {channelShareBusy ? 'Приглашаем...' : 'Пригласить'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {channelSubscribersOpen && currentSubscriptionChannel && isCurrentSubscriptionChannelOwner ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть список подписчиков"
            onClick={closeChannelSubscribersDialog}
          />
          <div className="room-confirm room-forward room-transfer-list room-participants">
            <p className="room-confirm-copy">{`Подписчики канала ${currentSubscriptionChannel.title}`}</p>
            <label className="search room-transfer-search">
              <span className="search-label">Поиск подписчика</span>
              <input
                type="search"
                placeholder="Имя, фамилия или @никнейм"
                value={channelSubscribersSearchQuery}
                onChange={(event) => setChannelSubscribersSearchQuery(event.target.value)}
              />
            </label>
            <div className="room-forward-list room-participants-list">
              {filteredCurrentSubscriptionChannelParticipants.length > 0 ? (
                filteredCurrentSubscriptionChannelParticipants.map((participant) => {
                  const isOwner = normalizeIdentifier(participant.identifier ?? '') === session?.identifier

                  return (
                    <button
                      key={`channel-subscriber-${participant.identifier ?? participant.id}`}
                      type="button"
                      className="room-forward-item room-participant-item room-participant-item-button"
                      onClick={() => {
                        if (isOwner) return
                        setSelectedChannelSubscriberIdentifier(
                          normalizeIdentifier(participant.identifier ?? '') || null,
                        )
                        setChannelSubscriberActionError('')
                      }}
                      disabled={isOwner}
                    >
                      <span className="chat-avatar-stack room-participant-avatar-stack">
                        <span className="avatar" style={{ backgroundColor: participant.accent }}>
                          {participant.title.slice(0, 1)}
                        </span>
                        {participant.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                      </span>
                      <span className="room-participant-copy">
                        <span className="room-participant-name-row">
                          <strong>{participant.title}</strong>
                          {isOwner ? (
                            <span className="room-participant-role">Владелец</span>
                          ) : null}
                          {participant.premium ? (
                            <span className="premium-crown chat-crown" aria-label="Премиум">
                              <img src="/icons/crown64.png" alt="" />
                            </span>
                          ) : null}
                        </span>
                        <span className="room-participant-status">
                          {participant.nickname ? `@${participant.nickname}` : participant.status}
                        </span>
                      </span>
                    </button>
                  )
                })
              ) : (
                <article className="settings-item room-transfer-empty">
                  <p className="settings-text">Подходящие подписчики не найдены.</p>
                </article>
              )}
            </div>
            {channelSubscriberActionError ? <p className="auth-error">{channelSubscriberActionError}</p> : null}
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={closeChannelSubscribersDialog}
                disabled={channelSubscriberActionBusy}
              >
                Закрыть
              </button>
            </div>
          </div>
        </>
      ) : null}

      {selectedCurrentSubscriptionChannelSubscriber && currentSubscriptionChannel && isCurrentSubscriptionChannelOwner ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть действия подписчика"
            onClick={() => {
              setSelectedChannelSubscriberIdentifier(null)
              setChannelSubscriberActionError('')
            }}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">{selectedCurrentSubscriptionChannelSubscriber.title}</p>
            <div className="room-forward-list room-report-reason-list">
              <button
                type="button"
                className="room-forward-item room-report-reason-item room-report-danger"
                onClick={() => {
                  setConfirmingRemoveChannelSubscriberIdentifier(
                    normalizeIdentifier(selectedCurrentSubscriptionChannelSubscriber.identifier ?? ''),
                  )
                }}
              >
                <span>Удалить подписчика</span>
              </button>
              <button
                type="button"
                className="room-forward-item room-report-reason-item room-report-danger"
                onClick={() => {
                  setConfirmingBlacklistChannelSubscriberIdentifier(
                    normalizeIdentifier(selectedCurrentSubscriptionChannelSubscriber.identifier ?? ''),
                  )
                }}
              >
                <span>В чёрный список</span>
              </button>
            </div>
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => {
                  setSelectedChannelSubscriberIdentifier(null)
                  setChannelSubscriberActionError('')
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : null}

      {confirmingRemoveChannelSubscriberIdentifier && selectedCurrentSubscriptionChannelSubscriber ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение удаления подписчика"
            onClick={() => setConfirmingRemoveChannelSubscriberIdentifier(null)}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">{`Удалить ${selectedCurrentSubscriptionChannelSubscriber.title} из подписчиков канала?`}</p>
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button room-confirm-danger"
                onClick={() => {
                  void removeCurrentChannelSubscriber(confirmingRemoveChannelSubscriberIdentifier)
                }}
                disabled={channelSubscriberActionBusy}
              >
                Удалить
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setConfirmingRemoveChannelSubscriberIdentifier(null)}
                disabled={channelSubscriberActionBusy}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : null}

      {confirmingBlacklistChannelSubscriberIdentifier && selectedCurrentSubscriptionChannelSubscriber ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение чёрного списка подписчика"
            onClick={() => setConfirmingBlacklistChannelSubscriberIdentifier(null)}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">{`Добавить ${selectedCurrentSubscriptionChannelSubscriber.title} в чёрный список канала?`}</p>
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button room-confirm-danger"
                onClick={() => {
                  void blacklistCurrentChannelSubscriber(confirmingBlacklistChannelSubscriberIdentifier)
                }}
                disabled={channelSubscriberActionBusy}
              >
                В чёрный список
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setConfirmingBlacklistChannelSubscriberIdentifier(null)}
                disabled={channelSubscriberActionBusy}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : null}

      {channelReportOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть жалобу на канал"
            onClick={closeChannelReportDialog}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">{`На что пожаловаться в канале ${actionableSubscriptionChannel.title}?`}</p>
            <div className="room-forward-list room-report-reason-list">
              {contactComplaintReasonOptions.map((option) => (
                <button
                  key={`channel-report-${option.value}`}
                  type="button"
                  className="room-forward-item room-report-reason-item"
                  onClick={() => {
                    void submitSubscriptionChannelReport(actionableSubscriptionChannel.id, option.value)
                  }}
                  disabled={channelReportBusy}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            {channelReportError ? <p className="auth-error">{channelReportError}</p> : null}
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={closeChannelReportDialog}
                disabled={channelReportBusy}
              >
                {channelReportBusy ? 'Отправляем...' : 'Отмена'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {channelReportSuccessOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение жалобы на канал"
            onClick={() => setChannelReportSuccessOpen(false)}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">Жалоба на канал отправлена.</p>
            <p className="settings-text room-confirm-note">
              Жалоба сохранена. Решение по каналу администрация принимает вручную.
            </p>
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setChannelReportSuccessOpen(false)}
              >
                Понятно
              </button>
            </div>
          </div>
        </>
      ) : null}

      {confirmingLeaveSubscriptionChannelId === actionableSubscriptionChannel.id ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение выхода из канала"
            onClick={() => setConfirmingLeaveSubscriptionChannelId(null)}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">{`Покинуть канал ${actionableSubscriptionChannel.title}?`}</p>
            <p className="settings-text room-confirm-note">
              Вы отпишетесь от канала и он исчезнет из вашего списка.
            </p>
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button room-confirm-danger"
                onClick={() => {
                  void leaveCurrentSubscriptionChannel(actionableSubscriptionChannel.id)
                }}
              >
                Покинуть канал
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setConfirmingLeaveSubscriptionChannelId(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
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
          onOpenAttachment={openMediaViewer}
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
            onClick={clearGroupMessageForwarding}
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
                onClick={() => {
                  replyToMessage(activeGroupMessage)
                  closeGroupMessageActions()
                }}
              >
                Ответить
              </button>
              <button
                type="button"
                className="message-menu-item"
                onClick={() => startGroupMessageForwarding(formatMessagePreview(activeGroupMessage))}
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
              {activeGroup ? (
                <>
                  <button
                    type="button"
                    className={`message-menu-item${hasRoomThreadsEnabled(activeGroup) ? '' : ' disabled'}`}
                    aria-disabled={!hasRoomThreadsEnabled(activeGroup)}
                    onClick={() => {
                      if (!hasRoomThreadsEnabled(activeGroup)) {
                        setThreadsDisabledHintTarget('group-message')
                        return
                      }

                      openGroupThread(activeGroupMessage.id)
                    }}
                  >
                    Прокомментировать
                  </button>
                  {threadsDisabledHintTarget === 'group-message' ? (
                    <p className="settings-text message-menu-note">
                      {getThreadsDisabledNoticeText('group')}
                    </p>
                  ) : null}
                </>
              ) : null}
              {isActiveGroupCreator &&
              activeGroupMessage.author !== 'me' &&
              activeGroupMessageParticipant?.identifier ? (
                <>
                  <button
                    type="button"
                    className={`message-menu-item danger${activeGroupMessageAlreadyBlacklisted ? ' disabled' : ''}`}
                    aria-disabled={activeGroupMessageAlreadyBlacklisted}
                    onClick={() => {
                      if (activeGroupMessageAlreadyBlacklisted) {
                        showBlacklistHint('group-message')
                        return
                      }
                      if (!activeGroupMessageParticipant?.identifier) return
                      openBlacklistConfirmation({
                        identifier: activeGroupMessageParticipant.identifier,
                        nickname: activeGroupMessageParticipant.nickname,
                        roomKind: 'group',
                        title: activeGroupMessageParticipant.title,
                      })
                      resetGroupMessageActions()
                    }}
                  >
                    В чёрный список
                  </button>
                  {blacklistHintTarget === 'group-message' ? (
                    <p className="settings-text message-menu-note">Пользователь уже в чёрном списке</p>
                  ) : null}
                </>
              ) : null}
              {activeGroupMessage.author === 'me' ? (
                <button
                  type="button"
                  className="message-menu-item danger"
                  onClick={() => requestGroupMessageDelete(activeGroupMessage.id)}
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

  const groupRoomActions = activeGroup ? (
    <>
      {groupActionsAnchor ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim message-menu-scrim"
            aria-label="Закрыть действия группы"
            onClick={closeGroupActions}
          />
          <div
            ref={groupActionsMenuRef}
            className="message-menu"
            style={groupActionsMenuStyle}
          >
            {isActiveGroupCreator ? (
              <button type="button" className="message-menu-item" onClick={openGroupSettingsDialog}>
                Настройки группы
              </button>
            ) : null}
            {!isActiveGroupCreator ? (
              <button
                type="button"
                className="message-menu-item danger"
                onClick={() => setConfirmingLeaveGroupId(activeGroup.id)}
              >
                Покинуть группу
              </button>
            ) : null}
            {!isActiveGroupCreator ? (
              <button type="button" className="message-menu-item" onClick={reportCurrentGroup}>
                Пожаловаться
              </button>
            ) : null}
            <button
              type="button"
              className="message-menu-item"
              onClick={() => {
                void toggleGroupMuted(activeGroup.id, !activeGroup.muted)
              }}
            >
              {activeGroup.muted ? 'Включить уведомления' : 'Заглушить'}
            </button>
            <button
              type="button"
              className={`message-menu-item${activeGroupAtMemberLimit ? ' disabled' : ''}`}
              onClick={openGroupInvitePopup}
            >
              Пригласить в группу
            </button>
          </div>
        </>
      ) : null}

      {groupInviteOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть приглашение в группу"
            onClick={closeGroupInvite}
          />
          <div className="room-confirm room-forward room-transfer-list">
            <p className="room-confirm-copy">{`Кого пригласить в группу ${activeGroup.title}?`}</p>
            <div className="room-forward-list">
              {inviteableGroupChats.length > 0 ? (
                inviteableGroupChats.map((chat) => (
                  <button
                    key={`group-invite-${chat.id}`}
                    type="button"
                    className="room-forward-item"
                    onClick={() => {
                      void inviteChatToActiveGroup(chat.id)
                    }}
                    disabled={groupInviteBusy}
                  >
                    <span className="avatar" style={{ backgroundColor: chat.accent }}>
                      {chat.title.slice(0, 1)}
                    </span>
                    <span>{chat.title}</span>
                  </button>
                ))
              ) : (
                <article className="settings-item room-transfer-empty">
                  <p className="settings-text">Все доступные контакты уже состоят в этой группе.</p>
                </article>
              )}
            </div>
            {groupInviteError ? <p className="auth-error">{groupInviteError}</p> : null}
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button type="button" className="room-confirm-button" onClick={closeGroupInvite}>
                Назад
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={closeGroupInvite}
                disabled={groupInviteBusy}
              >
                {groupInviteBusy ? 'Приглашаем...' : 'Закрыть'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {groupInviteLimitNoticeOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть ограничение приглашения в группу"
            onClick={() => setGroupInviteLimitNoticeOpen(false)}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">Нельзя пригласить ещё одного участника.</p>
            <p className="settings-text room-confirm-note">
              {activeGroupOwnerHasPremium
                ? `Даже с премиумом владельца в одной группе может быть максимум ${premiumGroupMemberLimit} человек.`
                : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать в группу больше людей, необходимо активировать премиум владельцу группы.`}
            </p>
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setGroupInviteLimitNoticeOpen(false)}
              >
                Понятно
              </button>
            </div>
          </div>
        </>
      ) : null}

      {groupReportNoticeOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть жалобу на группу"
            onClick={() => setGroupReportNoticeOpen(false)}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">Жалоба отправлена.</p>
            <p className="settings-text room-confirm-note">
              Мы получили сигнал и проверим эту группу.
            </p>
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setGroupReportNoticeOpen(false)}
              >
                Понятно
              </button>
            </div>
          </div>
        </>
      ) : null}

      {confirmingLeaveGroupId === activeGroup.id ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение выхода из группы"
            onClick={() => setConfirmingLeaveGroupId(null)}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">
              {isActiveGroupCreator
                ? `Удалить и покинуть группу ${activeGroup.title}?`
                : `Покинуть группу ${activeGroup.title}?`}
            </p>
            <p className="settings-text room-confirm-note">
              {isActiveGroupCreator
                ? 'Группа исчезнет у всех участников.'
                : 'Вы выйдете из группы, а остальные участники останутся в ней.'}
            </p>
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button room-confirm-danger"
                onClick={() => {
                  void leaveCurrentGroup(activeGroup.id)
                }}
              >
                {isActiveGroupCreator ? 'Удалить группу' : 'Покинуть группу'}
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setConfirmingLeaveGroupId(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
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
          onClick={clearGroupMessageDeleteConfirmation}
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
              onClick={clearGroupMessageDeleteConfirmation}
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
                  resetGroupMessageActions()
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
                resetGroupMessageActions()
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
              setActiveGroupId(null)
              resetRoomMessageActions()
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
              setActiveGroupId(null)
              resetRoomMessageActions()
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
          <button
            type="button"
            className={isThreadsTopListOpen ? 'filter active filter-icon-only' : 'filter filter-icon-only'}
            onClick={() => {
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setTopListView('threads')
              setActiveChatId(null)
              setActiveSubscriptionChannelId(null)
              setActiveGroupId(null)
              resetRoomMessageActions()
              resetThreadState()
              setSearchOpen(false)
              setQuery('')
            }}
            aria-label="Треды"
            title="Треды"
          >
            <img className="filter-icon" src="/icons/root-50.png" alt="" />
            {!quietMode && totalThreadNotifications > 0 ? (
              <span
                className={
                  totalThreadNotifications > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'
                }
              >
                {formatUnreadBadgeCount(totalThreadNotifications)}
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
                        {renderAdminBlockedChatBadge(chat)}
                        {chat.muted ? (
                          <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                            <img src="/icons/bell-100.png" alt="" />
                          </span>
                        ) : null}
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
                  'channel-list-card',
                  channel.id === activeSubscriptionChannelId ||
                  sanitizeChannelDirectLink(channel.handle) ===
                    sanitizeChannelDirectLink(currentSubscriptionChannel?.handle ?? '')
                    ? 'active'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => openSubscriptionChannelCard(channel)}
              >
                <span className="avatar" style={{ backgroundColor: channel.accent }}>
                  {channel.avatarImage ? (
                    <img src={channel.avatarImage} alt="" className="channel-avatar-image" />
                  ) : (
                    formatChannelAvatarLabel(channel.title)
                  )}
                </span>
                <span className="chat-copy">
                  <span className="chat-topline">
                    <span className="chat-name-row">
                      <strong className="chat-name-text">{channel.title}</strong>
                      {channel.muted ? (
                        <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                          <img src="/icons/bell-100.png" alt="" />
                        </span>
                      ) : null}
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
            <button
              type="button"
              className="chat-card group-create-card"
              onClick={() => openGroupCreateDialog()}
            >
              <span className="avatar group-create-card-avatar" aria-hidden="true">
                +
              </span>
              <span className="chat-copy">
                <span className="chat-topline">
                  <span className="chat-name-row">
                    <strong className="chat-name-text">Создать группу</strong>
                  </span>
                </span>
                <span className="chat-preview">Название, аватарка и участники в одном окне</span>
              </span>
            </button>
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
                      {group.avatarImage ? (
                        <img src={group.avatarImage} alt="" className="channel-avatar-image" />
                      ) : (
                        formatChannelAvatarLabel(group.title)
                      )}
                    </span>
                    <span className="chat-copy">
                      <span className="chat-topline">
                        <span className="chat-name-row">
                          <strong className="chat-name-text">{group.title}</strong>
                          {group.muted ? (
                            <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                              <img src="/icons/bell-100.png" alt="" />
                            </span>
                          ) : null}
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
        ) : isThreadsTopListOpen ? (
          <div className="chat-list">
            {orderedThreadInbox.length > 0 ? (
              orderedThreadInbox.map((item) => (
                <button
                  key={item.threadId}
                  type="button"
                  className={[
                    'chat-card',
                    'chat-card-compact',
                    activeThreadId === item.threadId ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => openThreadInboxItem(item)}
                >
                  <span
                    className="avatar"
                    style={{
                      backgroundColor: item.kind === 'group' ? item.groupAccent : item.channelAccent,
                    }}
                  >
                    {item.kind === 'group' ? item.groupTitle.slice(0, 1) : item.channelTitle.slice(0, 1)}
                  </span>
                  <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong className="chat-name-text">
                          {item.kind === 'group' ? item.groupTitle : item.channelTitle}
                        </strong>
                        <span className="chat-star">
                          <img
                            src={item.kind === 'group' ? '/icons/group100.png' : '/icons/news100.svg'}
                            alt=""
                          />
                        </span>
                      </span>
                      {!quietMode && item.unreadCount > 0 ? (
                        <span
                          className={
                            item.unreadCount > 9
                              ? 'chat-topline-badge chat-topline-badge-wide'
                              : 'chat-topline-badge'
                          }
                        >
                          {formatUnreadBadgeCount(item.unreadCount)}
                        </span>
                      ) : (
                        <span className="chat-topline-meta">{item.latestCommentTime}</span>
                      )}
                    </span>
                    <span className="chat-handle">
                      {item.commentCount > 0
                        ? formatThreadCommentCountLabel(item.commentCount)
                        : 'Подписка на тред'}
                    </span>
                    <span className="chat-preview thread-inbox-preview">
                      {item.sourceText || item.latestCommentText}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <article className="chat-card search-card">
                <span className="chat-copy">
                  <strong>Тредов пока нет</strong>
                  <span className="chat-handle">
                    Ответьте в любом треде или подпишитесь на него, чтобы он появился здесь.
                  </span>
                </span>
              </article>
            )}
          </div>
        ) : (
          <>
            {showBrowserNotificationsBanner ? (
              <section
                className="browser-notification-banner browser-notification-banner-standalone"
                aria-label="Включение браузерных уведомлений"
              >
                <button
                  type="button"
                  className="browser-notification-banner-main"
                  onClick={() => {
                    void requestBrowserNotificationsAccess()
                  }}
                >
                  <span className="browser-notification-banner-icon-wrap" aria-hidden="true">
                    <img
                      src="/icons/bell.png"
                      alt=""
                      className="browser-notification-banner-icon"
                    />
                  </span>
                  <span className="browser-notification-banner-copy">
                    <strong>Не пропускайте сообщения!</strong>
                    <span>{browserNotificationBannerBody}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="browser-notification-banner-dismiss"
                  aria-label="Скрыть плашку включения уведомлений"
                  onClick={(event) => {
                    event.stopPropagation()
                    dismissBrowserNotificationsBanner()
                  }}
                >
                  <img src="/icons/cancel.png" alt="" aria-hidden="true" />
                </button>
              </section>
            ) : null}
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
                        {renderAdminBlockedChatBadge(chat)}
                        {chat.muted ? (
                          <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                            <img src="/icons/bell-100.png" alt="" />
                          </span>
                        ) : null}
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
          </>
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
              resetGroupMessageActions()
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
              resetGroupMessageActions()
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
              resetGroupMessageActions()
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
                resetGroupMessageActions()
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
              resetGroupMessageActions()
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
                          {profilePreviewSession?.avatarImage ? (
                            <img src={profilePreviewSession.avatarImage} alt="" className="channel-avatar-image" />
                          ) : (
                            profileSettingsAvatarLabel
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
                        <h2 ref={settingsProfileNameRef}>{profileSettingsName}</h2>
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
                    value={profileSettingsDraft?.displayName ?? ''}
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
                    value={profileSettingsDraft?.surname ?? ''}
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
                      value={profileSettingsDraft?.status ?? ''}
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
                        value={profileSettingsDraft?.nickname ?? ''}
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
                  <article className="settings-item">
                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={effectiveProfileSoundsDisabled}
                        disabled={quietMode}
                        onChange={(event) =>
                          updateSessionProfile({ soundsDisabled: event.target.checked })
                        }
                      />
                      <span>Выключить звуки</span>
                    </label>
                  </article>
                  {storageUsage ? (
                    <article className={`settings-item storage-usage-card ${storageUsageTone}`}>
                      <div className="storage-usage-header">
                        <span className="settings-label">Хранилище</span>
                        <strong>{storageUsageLabel}</strong>
                      </div>
                      <div
                        className="storage-usage-bar"
                        role="progressbar"
                        aria-label="Использование хранилища"
                        aria-valuemin={0}
                        aria-valuemax={storageUsage.quotaBytes}
                        aria-valuenow={storageUsage.usedBytes}
                      >
                        <span
                          className="storage-usage-bar-fill"
                          style={{ width: `${Math.max(4, Math.min(100, storageUsagePercent))}%` }}
                        />
                      </div>
                      <p className="settings-text">{storageRemainingLabel}</p>
                      {!sessionHasPremium ? (
                        <button
                          type="button"
                          className="soft-button storage-usage-upsell"
                          onClick={() => setStageView('premium')}
                        >
                          Больше места с премиумом
                        </button>
                      ) : null}
                    </article>
                  ) : null}
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
                  <article className="settings-item settings-browser-notifications-card">
                    <span className="settings-label">Браузерные уведомления</span>
                    <strong className="settings-consent-status">
                      {browserNotificationSettingsStatusLabel}
                    </strong>
                    <p className="settings-text">{browserNotificationSettingsText}</p>
                    {browserNotificationStatus === 'default' ? (
                      <button
                        type="button"
                        className="soft-button settings-consent-toggle"
                        onClick={() => {
                          void enableBrowserNotifications()
                        }}
                      >
                        Включить уведомления
                      </button>
                    ) : browserNotificationStatus === 'granted' && browserNotificationsEnabled ? (
                      <button
                        type="button"
                        className="soft-button settings-consent-toggle"
                        onClick={disableBrowserNotifications}
                      >
                        Выключить уведомления
                      </button>
                    ) : browserNotificationStatus === 'granted' ? (
                      <button
                        type="button"
                        className="soft-button settings-consent-toggle"
                        onClick={() => {
                          void enableBrowserNotifications()
                        }}
                      >
                        Включить уведомления
                      </button>
                    ) : null}
                  </article>
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

              {settingsView === 'profile' && profileSettingsDirty ? (
                <button
                  type="button"
                  className="send-button settings-save-button"
                  onClick={() => {
                    void saveProfileSettings()
                  }}
                  disabled={profileSettingsBusy}
                >
                  {profileSettingsBusy ? 'Сохраняем...' : 'Сохранить'}
                </button>
              ) : null}
              {settingsView === 'profile' && profileSettingsError ? (
                <p className="auth-error">{profileSettingsError}</p>
              ) : null}
              <div className="settings-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    if (settingsView === 'profile' && profileSettingsDirty) {
                      setConfirmProfileSettingsLeaveOpen(true)
                      return
                    }

                    leaveSettingsToMain()
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

        {confirmProfileSettingsLeaveOpen ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть подтверждение сохранения настроек профиля"
              onClick={() => setConfirmProfileSettingsLeaveOpen(false)}
            />
            <div className="room-confirm room-confirm-compact">
              <p className="room-confirm-copy">Сохранить изменения настроек профиля?</p>
              <div className="room-confirm-actions room-confirm-actions-dual">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-danger"
                  onClick={() => {
                    leaveSettingsToMain({ discardProfileDraft: true })
                  }}
                >
                  Нет
                </button>
                <button
                  type="button"
                  className="room-confirm-button room-confirm-button-primary"
                  disabled={profileSettingsBusy}
                  onClick={() => {
                    void (async () => {
                      const saved = await saveProfileSettings()
                      if (saved) {
                        leaveSettingsToMain()
                      }
                    })()
                  }}
                >
                  Да
                </button>
              </div>
            </div>
          </>
        ) : null}

        {isPremiumView ? (
          <section className="settings-view premium-view">
            <div className="settings-panel premium-panel">
              <div className="settings-heading premium-heading">
                <div className="premium-title-row">
                  {premiumGiftChat ? (
                    <div className="premium-gift-title">
                      <h2>Подарить Премиум</h2>
                      <img src="/icons/crown100.png" alt="" />
                    </div>
                  ) : (
                    <h2>{sessionHasPremium ? 'Продли премиум Тайничок' : 'Премиум Тайничок'}</h2>
                  )}
                  {sessionHasPremium ? (
                    <div className="premium-debug-block">
                      <span className="premium-debug-label">Дебаг</span>
                      <button
                        type="button"
                        className="soft-button premium-debug-disable-button"
                        onClick={disablePremiumForDebug}
                      >
                        Выключить премиум
                      </button>
                    </div>
                  ) : null}
                </div>
                {premiumGiftChat ? (
                  <p className="premium-gift-contact">{`Контакту ${premiumGiftChat.title}`}</p>
                ) : null}
                <p className="settings-copy">
                  {premiumGiftChat
                    ? 'В Тайничке нет рекламы, поэтому, совершая покупку, вы помогаете обслуживать прожорливые серверы.'
                    : 'В Тайничке нет рекламы, поэтому, совершая покупку, вы помогаете обслуживать прожорливые серверы.'}
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
                    <li>Загрузка и использование GIF animation</li>
                    <li>Отправка фотографий в оригинальном размере</li>
                    <li>Хранилище файлов до 500 МБ</li>
                    <li>Создание тематических каналов</li>
                    <li>Группы до 200 человек</li>
                  </ul>
                  <button
                    type="button"
                    className="send-button premium-submit"
                    onClick={() => {
                      void startPremiumCheckout('month')
                    }}
                    disabled={premiumPurchaseBusy}
                  >
                    {premiumPurchaseBusy ? 'Обрабатываем...' : 'Выбрать месяц'}
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
                    <li>Загрузка и использование GIF animation</li>
                    <li>Отправка фотографий в оригинальном размере</li>
                    <li>Хранилище файлов до 500 МБ</li>
                    <li>Создание тематических каналов</li>
                    <li>Группы до 200 человек</li>
                  </ul>
                  <button
                    type="button"
                    className="send-button premium-submit"
                    onClick={() => {
                      void startPremiumCheckout('year')
                    }}
                    disabled={premiumPurchaseBusy}
                  >
                    {premiumPurchaseBusy ? 'Обрабатываем...' : 'Выбрать год'}
                  </button>
                </article>
              </div>

              <div className="settings-actions premium-actions">
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
                <div className="premium-debug-inline">
                  <span className="premium-debug-label">Дебаг</span>
                  <button
                    type="button"
                    className={
                      premiumDebugAutoCheckout
                        ? 'premium-debug-toggle active'
                        : 'premium-debug-toggle'
                    }
                    aria-pressed={premiumDebugAutoCheckout}
                    onClick={() => {
                      setPremiumDebugAutoCheckout((current) => !current)
                    }}
                  >
                    <span className="premium-debug-toggle-thumb" aria-hidden="true" />
                  </button>
                  <span className="premium-debug-inline-copy">
                    Автопокупка для тестов. При включении покупка проходит сразу, без реального платежа.
                  </span>
                </div>
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
                    <button
                      type="button"
                      className="channel-card channels-create-button"
                      onClick={openChannelCreateView}
                    >
                      <span className="channel-avatar channels-create-avatar" style={{ backgroundColor: '#8c5738' }}>
                        +
                      </span>
                      <span className="channel-card-copy">
                        <strong className="channel-card-title">
                          <span>Создать канал</span>
                          <span className="chat-star">
                            <img src="/icons/news100.svg" alt="Канал" />
                          </span>
                        </strong>
                        <span>Новый черновик канала</span>
                      </span>
                    </button>
                  </div>
                ) : (
                  <article className="settings-item">
                    <p className="settings-text">Пока нет каналов. Создайте первый канал из этой сцены.</p>
                  </article>
                )}
                {channels.length === 0 ? (
                  <button
                    type="button"
                    className="channel-card channels-create-button"
                    onClick={openChannelCreateView}
                  >
                    <span className="channel-avatar channels-create-avatar" style={{ backgroundColor: '#8c5738' }}>
                      +
                    </span>
                    <span className="channel-card-copy">
                      <strong className="channel-card-title">
                        <span>Создать канал</span>
                        <span className="chat-star">
                          <img src="/icons/news100.svg" alt="Канал" />
                        </span>
                      </strong>
                      <span>Новый черновик канала</span>
                    </span>
                  </button>
                ) : null}
              </div>

              <div className="settings-actions channels-manager-actions">
                <button type="button" className="soft-button channels-manager-back" onClick={() => setStageView('main')}>
                  Назад
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
                  <span className="settings-label">Статус канала</span>
                  <textarea
                    className="channel-description-input"
                    maxLength={statusFieldMaxLength}
                    placeholder="Статус канала не задан"
                    value={creatingChannelDescription}
                    onChange={(event) =>
                      setCreatingChannelDescription(
                        sanitizeStatusField(event.target.value),
                      )
                    }
                  />
                </article>

                <article className="settings-item">
                  <span className="settings-label">Комментарии</span>
                  <label className="settings-checkbox">
                    <input
                      type="radio"
                      name="create-channel-comments"
                      checked={!creatingChannelCommentsForAll && !creatingChannelCommentsForPremium}
                      onChange={() => {
                        setCreatingChannelCommentsForAll(false)
                        setCreatingChannelCommentsForPremium(false)
                      }}
                    />
                    <span>Комментарии выключены</span>
                  </label>
                  <label className="settings-checkbox">
                    <input
                      type="radio"
                      name="create-channel-comments"
                      checked={creatingChannelCommentsForAll}
                      onChange={() => {
                        setCreatingChannelCommentsForAll(true)
                        setCreatingChannelCommentsForPremium(false)
                      }}
                    />
                    <span>Включить комментарии для всех юзеров</span>
                  </label>
                  <label className="settings-checkbox">
                    <input
                      type="radio"
                      name="create-channel-comments"
                      checked={creatingChannelCommentsForPremium}
                      onChange={() => {
                        setCreatingChannelCommentsForAll(false)
                        setCreatingChannelCommentsForPremium(true)
                      }}
                    />
                    <span>Включить комментарии только для премиум юзеров</span>
                  </label>
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

        {isChannelInviteView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-detail-panel">
              {activeChannel ? (
                <>
                  <div className="channels-screen-header">
                    <p className="eyebrow">Каналы</p>
                    <h2>{`Пригласить в канал "${activeChannel.title}"`}</h2>
                    <p className="settings-copy">
                      Выберите контакты, которым сразу открыть доступ к этому каналу.
                    </p>
                  </div>

                  <div className="channels-fields">
                    <article className="settings-item">
                      <span className="settings-label">Контакты</span>
                      <div className="group-create-members-list">
                        {inviteableManagedChannelChats.length > 0 ? (
                          inviteableManagedChannelChats.map((chat) => {
                            const isSelected = channelInviteChatIds.includes(chat.id)

                            return (
                              <button
                                key={`channel-invite-${chat.id}`}
                                type="button"
                                className={`room-forward-item group-create-member-item${isSelected ? ' active' : ''}`}
                                onClick={() => toggleManagedChannelInviteChat(chat.id)}
                                disabled={channelInviteBusy}
                              >
                                <span className="chat-avatar-stack">
                                  <span className="avatar" style={{ backgroundColor: chat.accent }}>
                                    {chat.title.slice(0, 1)}
                                  </span>
                                  {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                                </span>
                                <span className="group-create-member-copy">
                                  <strong className="group-create-member-name-row">
                                    <span>{chat.title}</span>
                                    {chat.premium ? (
                                      <span className="premium-crown chat-crown" aria-label="Премиум">
                                        <img src="/icons/crown64.png" alt="" />
                                      </span>
                                    ) : null}
                                    {chat.pinned ? (
                                      <span className="chat-star" aria-label="Избранный контакт">
                                        <img src="/icons/star100.png" alt="" />
                                      </span>
                                    ) : null}
                                  </strong>
                                  <span>{chat.handle || chat.phone}</span>
                                </span>
                                <input
                                  type="checkbox"
                                  className="group-create-member-checkbox"
                                  checked={isSelected}
                                  readOnly
                                  tabIndex={-1}
                                />
                              </button>
                            )
                          })
                        ) : (
                          <article className="settings-item room-transfer-empty">
                            <p className="settings-text">
                              Сейчас нет доступных контактов для приглашения в этот канал.
                            </p>
                          </article>
                        )}
                      </div>
                    </article>
                  </div>

                  {channelInviteError ? <p className="auth-error">{channelInviteError}</p> : null}

                  <div className="settings-actions channels-create-actions">
                    <button
                      type="button"
                      className="soft-button"
                      onClick={openChannelsListView}
                      disabled={channelInviteBusy}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className={`send-button channels-create-submit${canInviteToManagedChannel ? '' : ' disabled'}`}
                      aria-disabled={!canInviteToManagedChannel}
                      onClick={() => {
                        if (channelInviteBusy || !canInviteToManagedChannel) return
                        void inviteMembersToActiveManagedChannel()
                      }}
                    >
                      {channelInviteBusy ? 'Приглашаем...' : 'Пригласить'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="channels-screen-header">
                    <p className="eyebrow">Каналы</p>
                    <h2>Канал не найден</h2>
                    <p className="settings-copy">
                      Не удалось подготовить экран приглашения. Вернитесь к списку каналов.
                    </p>
                  </div>
                  <div className="settings-actions channels-create-actions">
                    <button type="button" className="soft-button" onClick={openChannelsListView}>
                      Назад
                    </button>
                  </div>
                </>
              )}
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
                      <span className="settings-label">Статус канала</span>
                      <textarea
                        className="channel-description-input"
                        maxLength={statusFieldMaxLength}
                        placeholder="Статус канала не задан"
                        value={activeChannel.description}
                        onChange={(event) =>
                          updateChannel(activeChannel.id, {
                            description: sanitizeStatusField(event.target.value),
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

                    <article className="settings-item">
                      <span className="settings-label">Комментарии</span>
                      <label className="settings-checkbox">
                        <input
                          type="radio"
                          name={`channel-comments-${activeChannel.id}`}
                          checked={!activeChannel.commentsEnabledForAll && !activeChannel.commentsEnabledForPremium}
                          onChange={() =>
                            updateChannel(activeChannel.id, {
                              commentsEnabledForAll: false,
                              commentsEnabledForPremium: false,
                            })
                          }
                        />
                        <span>Комментарии выключены</span>
                      </label>
                      <label className="settings-checkbox">
                        <input
                          type="radio"
                          name={`channel-comments-${activeChannel.id}`}
                          checked={Boolean(activeChannel.commentsEnabledForAll)}
                          onChange={() =>
                            updateChannel(activeChannel.id, {
                              commentsEnabledForAll: true,
                              commentsEnabledForPremium: false,
                            })
                          }
                        />
                        <span>Включить комментарии для всех юзеров</span>
                      </label>
                      <label className="settings-checkbox">
                        <input
                          type="radio"
                          name={`channel-comments-${activeChannel.id}`}
                          checked={Boolean(activeChannel.commentsEnabledForPremium)}
                          onChange={() =>
                            updateChannel(activeChannel.id, {
                              commentsEnabledForAll: false,
                              commentsEnabledForPremium: true,
                            })
                          }
                        />
                        <span>Включить комментарии только для премиум юзеров</span>
                      </label>
                      <button
                        type="button"
                        className="soft-button channel-blacklist-button"
                        onClick={() =>
                          openBlacklistManager({
                            channelId: activeChannel.id,
                            kind: 'channel',
                            scope: 'existing',
                          })
                        }
                      >
                        Чёрный список
                      </button>
                    </article>
                  </div>

                  {channelSettingsError ? <p className="auth-error">{channelSettingsError}</p> : null}

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
                        <div className="room-confirm-actions room-confirm-actions-single">
                          <button
                            type="button"
                            className="room-confirm-button"
                            onClick={() => setChannelManagementOpenId(null)}
                          >
                            Отмена
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

              <div className="settings-actions channels-detail-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    void handleActiveChannelDetailBack()
                  }}
                  disabled={channelSettingsBusy}
                >
                  Назад
                </button>
                {activeChannel && activeChannelSettingsDirty ? (
                  <button
                    type="button"
                    className="send-button"
                    onClick={() => {
                      void handleActiveChannelDetailSave()
                    }}
                    disabled={channelSettingsBusy}
                  >
                    {channelSettingsBusy ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                ) : null}
                {activeChannel ? (
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() =>
                      setChannelManagementOpenId((current) =>
                        current === activeChannel.id ? null : activeChannel.id,
                      )
                    }
                    disabled={channelSettingsBusy}
                  >
                    Управление
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {confirmChannelSettingsLeaveOpen ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть подтверждение выхода из настроек канала"
              onClick={closeChannelSettingsLeaveConfirm}
            />
            <div className="room-confirm room-confirm-compact">
              <p className="room-confirm-copy">Хотите ли вы сохранить изменения?</p>
              <div className="room-confirm-actions room-confirm-actions-dual">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-button-primary"
                  disabled={channelSettingsBusy}
                  onClick={() => {
                    void confirmActiveChannelLeaveWithSave()
                  }}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="room-confirm-button"
                  disabled={channelSettingsBusy}
                  onClick={discardActiveChannelDetailChangesAndExit}
                >
                  Не сохранять
                </button>
              </div>
            </div>
          </>
        ) : null}

        {pendingAvatarPostPrompt ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть предложение опубликовать смену аватарки"
              onClick={skipAvatarUpdatePost}
            />
            <div className="room-confirm room-group-create">
              <p className="room-confirm-copy">Сделаем пост о смене аватарки канала?</p>
              <div className="channels-fields">
                <article className="settings-item channel-description-card">
                  <span className="settings-label">Добавьте подпись</span>
                  <textarea
                    className="channel-description-input"
                    maxLength={statusFieldMaxLength}
                    placeholder="Подпись не обязательна"
                    value={pendingAvatarPostCaption}
                    onChange={(event) => setPendingAvatarPostCaption(sanitizeStatusField(event.target.value))}
                  />
                </article>
              </div>
              {channelPostError ? <p className="auth-error">{channelPostError}</p> : null}
              <div className="room-confirm-actions room-confirm-actions-dual">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-button-primary"
                  disabled={channelPostBusy}
                  onClick={() => {
                    void confirmAvatarUpdatePost()
                  }}
                >
                  {channelPostBusy ? 'Публикуем...' : 'Да'}
                </button>
                <button
                  type="button"
                  className="room-confirm-button"
                  disabled={channelPostBusy}
                  onClick={skipAvatarUpdatePost}
                >
                  Нет
                </button>
              </div>
            </div>
          </>
        ) : null}

        {threadTarget ? (
          threadRoom
        ) : isSubscriptionChannelOpen ? (
          <SubscriptionChannelRoom
            actions={
              <>
                {channelRoomActions}
                {subscriptionPostActions}
              </>
            }
            activePostId={forwardingSubscriptionPostText ? null : activeSubscriptionPostId}
            channel={currentSubscriptionChannel!}
            messageFeedRef={messageFeedRef}
            onBack={closeActiveRoom}
            onOpenThread={openChannelThread}
            onOpenChannelActions={
              actionableSubscriptionChannel
                ? (event) => {
                    scheduleActionAnchor(event.currentTarget, 'end', setChannelActionsAnchor)
                    resetSubscriptionPostActions()
                    setChannelShareOpen(false)
                    setChannelShareError('')
                    setChannelShareChatIds([])
                    setChannelReportOpen(false)
                    setChannelReportError('')
                    setChannelSubscribersOpen(false)
                    setChannelSubscribersSearchQuery('')
                    setSelectedChannelSubscriberIdentifier(null)
                    setConfirmingRemoveChannelSubscriberIdentifier(null)
                    setConfirmingBlacklistChannelSubscriberIdentifier(null)
                    setChannelSubscriberActionBusy(false)
                    setChannelSubscriberActionError('')
                    setConfirmingLeaveSubscriptionChannelId(null)
                  }
                : undefined
            }
            onOpenSubscribers={
              isCurrentSubscriptionChannelOwner && actionableSubscriptionChannel
                ? () => {
                    setChannelSubscribersOpen(true)
                    setChannelSubscribersSearchQuery('')
                    setSelectedChannelSubscriberIdentifier(null)
                    setConfirmingRemoveChannelSubscriberIdentifier(null)
                    setConfirmingBlacklistChannelSubscriberIdentifier(null)
                    setChannelSubscriberActionBusy(false)
                    setChannelSubscriberActionError('')
                  }
                : undefined
            }
            onPostSelect={(event, postId) => {
              scheduleActionAnchor(event.currentTarget, 'start', (anchor) =>
                openSubscriptionPostActions(postId, anchor),
              )
            }}
            onReplyReferenceJump={scrollToChannelPost}
            visiblePosts={visibleSubscriptionPosts}
            publisher={
              ownedCurrentManagedChannel
                ? {
                    attachmentDraft: channelAttachmentDrafts[currentSubscriptionChannel!.id],
                    attachmentInputRef: channelAttachmentInputRef,
                    attachmentName: channelAttachmentDrafts[currentSubscriptionChannel!.id]?.fileName ?? '',
                    draft: channelPostDrafts[currentSubscriptionChannel!.id] ?? '',
                    error: channelPostError,
                    isBusy: channelPostBusy,
                    onAttachmentChange: handleChannelAttachmentChange,
                    onAttachmentClear: () => clearChannelAttachmentDraft(currentSubscriptionChannel!.id),
                    onAttachmentPreviewOpen: () =>
                      openAttachmentDraftPreview(channelAttachmentDrafts[currentSubscriptionChannel!.id]),
                    onDraftChange: (value) => updateChannelPostDraft(currentSubscriptionChannel!.id, value),
                    onOpenAttachmentPicker: openChannelAttachmentPicker,
                    onOpenPremiumUpsell: openPremiumUpsell,
                    onReplyCancel: () => setChannelPostReplyTarget(null),
                    onSelectGif: (gif) => attachChannelGif(currentSubscriptionChannel!.id, gif),
                    onToggleSendOriginal: () =>
                      toggleChannelAttachmentSendOriginal(currentSubscriptionChannel!.id),
                    onUploadGif: (file) => uploadAndAttachChannelGif(currentSubscriptionChannel!.id, file),
                    premiumUnlocked: sessionHasPremium,
                    gifLibrary: session?.gifLibrary ?? [],
                    gifSelectionBlockedReason: getGifSelectionBlockedReason(
                      channelAttachmentDrafts[currentSubscriptionChannel!.id],
                    ),
                    onDeleteGif: deleteGifFromLibrary,
                    onSearchGifs: searchAvailableGifs,
                    replyTarget: channelPostReplyTarget,
                    onSubmit: () => {
                      void sendManagedChannelPost()
                    },
                  }
                : undefined
            }
            subscriptionAction={
              previewSubscriptionChannel
                ? {
                    label: 'Подписаться',
                    onClick: subscribeToPreviewSubscriptionChannel,
                  }
                : undefined
            }
            subscriberCountLabel={currentSubscriptionChannelSubscriberLabel}
            onOpenAttachment={openMediaViewer}
          />
        ) : null}

        {!threadTarget && isGroupOpen ? (
          <GroupRoom
            actions={
              <>
                {groupRoomActions}
                {groupMessageActions}
              </>
            }
            activeMessageId={forwardingGroupMessageText ? null : activeGroupMessageId}
            attachmentDraft={groupAttachmentDrafts[activeGroup.id]}
            attachmentInputRef={groupAttachmentInputRef}
            attachmentName={groupAttachmentDrafts[activeGroup.id]?.fileName ?? ''}
            draft={groupMessageDrafts[activeGroup.id] ?? ''}
            getMessageDeliveryIssue={getGroupMessageDeliveryIssue}
            group={activeGroup}
            messageFeedRef={messageFeedRef}
            onAttachmentChange={handleGroupAttachmentChange}
            onAttachmentClear={() => clearGroupAttachmentDraft(activeGroup.id)}
            onAttachmentPreviewOpen={() => openAttachmentDraftPreview(groupAttachmentDrafts[activeGroup.id])}
            onOpenGroupActions={(event) => {
              scheduleActionAnchor(event.currentTarget, 'end', setGroupActionsAnchor)
              resetGroupMessageActions()
              setGroupInviteOpen(false)
              setGroupInviteError('')
              setGroupInviteLimitNoticeOpen(false)
              setGroupReportNoticeOpen(false)
              setConfirmingLeaveGroupId(null)
            }}
            onBack={closeActiveRoom}
            onComposerFocus={() => {
              closeGroupMessageActions()
              closeGroupActions()
            }}
            composerDisabledNotice={activeGroupWriteBlockReason}
            onDraftChange={(value) => updateGroupDraft(activeGroup.id, value)}
            onMessageSelect={(event, message) => {
              scheduleActionAnchor(
                event.currentTarget,
                message.author === 'me' ? 'end' : 'start',
                (anchor) => openGroupMessageActions(message.id, anchor),
              )
            }}
            onOpenAttachment={openMediaViewer}
            onOpenLinkedChannel={openSourceChannel}
            onOpenParticipants={() => setGroupParticipantsOpen(true)}
            onReplyCancel={() => setReplyTarget(null)}
            onReplyReferenceJump={scrollToGroupMessage}
            onOpenPremiumUpsell={openPremiumUpsell}
            onOpenSourceChannel={openSourceChannelFromMessage}
            onOpenAttachmentPicker={openGroupAttachmentPicker}
            onOpenThread={openGroupThread}
            onSelectGif={(gif) => attachGroupGif(activeGroup.id, gif)}
            onToggleSendOriginal={() => toggleGroupAttachmentSendOriginal(activeGroup.id)}
            onUploadGif={(file) => uploadAndAttachGroupGif(activeGroup.id, file)}
            gifLibrary={session?.gifLibrary ?? []}
            gifSelectionBlockedReason={getGifSelectionBlockedReason(groupAttachmentDrafts[activeGroup.id])}
            onDeleteGif={deleteGifFromLibrary}
            premiumUnlocked={sessionHasPremium}
            onSearchGifs={searchAvailableGifs}
            replyTarget={replyTarget}
            resolveLinkedChannelFromMessage={resolveEmbeddedChannelFromMessage}
            visibleMessages={visibleGroupMessages}
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
              attachmentDraft={chatAttachmentDrafts[activeChat.id]}
              attachmentInputRef={attachmentInputRef}
              attachmentName={chatAttachmentDrafts[activeChat.id]?.fileName ?? ''}
              chatActionsOpen={chatActionsOpen}
              draft={chatMessageDrafts[activeChat.id] ?? ''}
              getMessageDeliveryIssue={getDirectMessageDeliveryIssue}
              messageFeedRef={messageFeedRef}
              onAttachmentClear={() => clearChatAttachmentDraft(activeChat.id)}
              onAttachmentPreviewOpen={() => openAttachmentDraftPreview(chatAttachmentDrafts[activeChat.id])}
              pinnedMessage={pinnedMessage}
              quietMode={quietMode}
              replyTarget={replyTarget}
              visibleMessages={visibleDirectMessages}
              composerDisabledNotice={activeChatAdminBlockNotice}
              onAttachmentChange={handleChatAttachmentChange}
              onBack={closeActiveRoom}
              onBlockChat={() => blockChat(activeChat.id)}
              onCloseChatActions={() => setChatActionsOpen(false)}
              onCreateGroup={() => {
                setChatActionsOpen(false)
                openGroupCreateDialog([activeChat.id])
              }}
              onDraftChange={(value) => updateChatDraft(activeChat.id, value)}
              onMessageSelect={(event, message) => {
                setMessageActionMessageId(message.id)
                scheduleActionAnchor(
                  event.currentTarget,
                  message.author === 'me' ? 'end' : 'start',
                  setMessageActionAnchor,
                )
              }}
              onOpenAttachment={openMediaViewer}
              onOpenLinkedChannel={openSourceChannel}
              onOpenSourceChannel={openSourceChannelFromMessage}
              onOpenAttachmentPicker={openAttachmentPicker}
              onOpenPremiumUpsell={openPremiumUpsell}
              onOpenPremiumGift={() => {
                setPremiumGiftChatId(activeChat.id)
                setStageView('premium')
                setChatActionsOpen(false)
              }}
              onReplyCancel={() => setReplyTarget(null)}
              onSelectGif={(gif) => attachChatGif(activeChat.id, gif)}
              onUploadGif={(file) => uploadAndAttachChatGif(activeChat.id, file)}
              onReplyReferenceJump={scrollToDirectMessage}
              onRequestReportContact={() => {
                setReportingChatId(activeChat.id)
                setReportContactBusy(false)
                setReportContactError('')
                setChatActionsOpen(false)
              }}
              onToggleChatMuted={() => {
                void toggleChatMuted(activeChat.id, !activeChat.muted)
              }}
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
              onToggleSendOriginal={() => toggleChatAttachmentSendOriginal(activeChat.id)}
              onToggleChatActions={() => setChatActionsOpen((current) => !current)}
              onToggleFavoriteChat={() => {
                void togglePinnedChat(activeChat.id)
              }}
              gifLibrary={session?.gifLibrary ?? []}
              gifSelectionBlockedReason={getGifSelectionBlockedReason(chatAttachmentDrafts[activeChat.id])}
              onDeleteGif={deleteGifFromLibrary}
              premiumUnlocked={sessionHasPremium}
              onSearchGifs={searchAvailableGifs}
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
                    onOpenAttachment={openMediaViewer}
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

            {reportingChat ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть жалобу на контакт"
                  onClick={closeReportContactDialog}
                />
                <div className="room-confirm room-confirm-compact">
                  <p className="room-confirm-copy">{`На что пожаловаться у контакта ${reportingChat.title}?`}</p>
                  <div className="room-forward-list room-report-reason-list">
                    {contactComplaintReasonOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="room-forward-item room-report-reason-item"
                        onClick={() => {
                          void submitContactReport(reportingChat.id, option.value)
                        }}
                        disabled={reportContactBusy}
                      >
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                  {reportContactError ? <p className="auth-error">{reportContactError}</p> : null}
                  <div className="room-confirm-actions room-confirm-actions-single">
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={closeReportContactDialog}
                      disabled={reportContactBusy}
                    >
                      {reportContactBusy ? 'Отправляем...' : 'Отмена'}
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {reportContactSuccessOpen ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть подтверждение жалобы"
                  onClick={() => setReportContactSuccessOpen(false)}
                />
                <div className="room-confirm room-confirm-compact">
                  <p className="room-confirm-copy">Жалоба отправлена.</p>
                  <p className="settings-text room-confirm-note">
                    Мы сохранили причину жалобы и учтём её при модерации этого контакта.
                  </p>
                  <div className="room-confirm-actions room-confirm-actions-single">
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={() => setReportContactSuccessOpen(false)}
                    >
                      Понятно
                    </button>
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

        {confirmingDeleteSubscriptionPostId !== null && ownedCurrentManagedChannel ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть подтверждение удаления поста канала"
              onClick={clearSubscriptionPostDeleteConfirmation}
            />
            <div className="room-confirm room-confirm-compact">
              <p className="room-confirm-copy">Удалить этот пост в канале?</p>
              <div className="room-confirm-actions room-confirm-actions-dual">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-danger"
                  onClick={() => {
                    void deleteManagedChannelPost(ownedCurrentManagedChannel.id, confirmingDeleteSubscriptionPostId)
                  }}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={clearSubscriptionPostDeleteConfirmation}
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
                  <span>Так будет выглядеть обработанная квадратная аватарка.</span>
                  {profileAvatarPickerDraft?.label ? <span>{profileAvatarPickerDraft.label}</span> : null}
                </div>
              </div>

              <article className="settings-item channel-avatar-device-card">
                <button
                  type="button"
                  className="soft-button channel-avatar-device-button"
                  onClick={triggerProfileAvatarUpload}
                >
                  {profileAvatarPickerDraft?.kind === 'upload' || profileAvatarPickerDraft?.kind === 'uploaded'
                    ? 'Выбрать другой файл'
                    : 'Загрузить с устройства'}
                </button>
                <a
                  className="settings-inline-link channel-avatar-device-link"
                  href="/avatar-upload-rules.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Правила загрузки аватарки
                </a>
              </article>

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
                  {profileAvatarPickerBusy ? 'Обрабатываем...' : 'Применить'}
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
                  <span>Так будет выглядеть обработанная квадратная аватарка.</span>
                  {channelAvatarPickerDraft?.label ? <span>{channelAvatarPickerDraft.label}</span> : null}
                </div>
              </div>

              <article className="settings-item channel-avatar-device-card">
                <button
                  type="button"
                  className="soft-button channel-avatar-device-button"
                  onClick={triggerChannelAvatarUpload}
                >
                  {channelAvatarPickerDraft?.kind === 'upload' || channelAvatarPickerDraft?.kind === 'uploaded'
                    ? 'Выбрать другой файл'
                    : 'Загрузить с устройства'}
                </button>
                <a
                  className="settings-inline-link channel-avatar-device-link"
                  href="/avatar-upload-rules.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Правила загрузки аватарки
                </a>
              </article>

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
                  {channelAvatarPickerBusy ? 'Обрабатываем...' : 'Применить'}
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
      {groupCreateOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть создание группы"
            onClick={() => closeGroupCreateDialog()}
          />
          <div className="room-confirm room-group-create">
            <p className="room-confirm-copy">Создать группу</p>
            <div className="channels-fields">
              <article className="settings-item">
                <span className="settings-label">Название группы</span>
                <input
                  type="text"
                  className="settings-input"
                  maxLength={groupTitleMaxLength}
                  value={creatingGroupTitle}
                  placeholder={buildDefaultGroupTitle(session)}
                  onChange={(event) => {
                    setCreatingGroupTitle(event.target.value.slice(0, groupTitleMaxLength))
                    setCreatingGroupError('')
                  }}
                />
              </article>

              <article className="settings-item">
                <span className="settings-label">Аватарка группы</span>
                <div className="channel-avatar-settings">
                  <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: creatingGroupAccent }}>
                    {creatingGroupAvatarDraft?.previewUrl ? (
                      <img src={creatingGroupAvatarDraft.previewUrl} alt="" className="channel-avatar-image" />
                    ) : (
                      formatChannelAvatarLabel(creatingGroupTitle || buildDefaultGroupTitle(session))
                    )}
                  </span>
                    <div className="channel-avatar-copy">
                      <p className="settings-text">
                        Можно выбрать готовую аватарку Tinychok или загрузить JPG, PNG либо WebP до 5 МБ.
                      </p>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={openGroupAvatarPicker}
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
              </article>

              <article className="settings-item">
                <span className="settings-label">Добавить участников</span>
                <div className="group-create-members-list">
                  {creatableGroupChats.length > 0 ? (
                    creatableGroupChats.map((chat) => {
                      const isSelected = creatingGroupMemberChatIds.includes(chat.id)

                      return (
                        <button
                          key={`group-create-member-${chat.id}`}
                          type="button"
                          className={`room-forward-item group-create-member-item${isSelected ? ' active' : ''}`}
                          onClick={() => toggleGroupCreateMember(chat.id)}
                          disabled={creatingGroupBusy}
                        >
                          <span className="chat-avatar-stack">
                            <span className="avatar" style={{ backgroundColor: chat.accent }}>
                              {chat.title.slice(0, 1)}
                            </span>
                            {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                          </span>
                          <span className="group-create-member-copy">
                            <strong className="group-create-member-name-row">
                              <span>{chat.title}</span>
                              {chat.premium ? (
                                <span className="premium-crown chat-crown" aria-label="Премиум">
                                  <img src="/icons/crown64.png" alt="" />
                                </span>
                              ) : null}
                              {chat.pinned ? (
                                <span className="chat-star" aria-label="Избранный контакт">
                                  <img src="/icons/star100.png" alt="" />
                                </span>
                              ) : null}
                            </strong>
                            <span>{chat.handle || chat.phone}</span>
                          </span>
                          <input
                            type="checkbox"
                            className="group-create-member-checkbox"
                            checked={isSelected}
                            readOnly
                            tabIndex={-1}
                          />
                        </button>
                      )
                    })
                  ) : (
                    <article className="settings-item room-transfer-empty">
                      <p className="settings-text">
                        Сначала добавьте хотя бы один контакт, чтобы создать группу.
                      </p>
                    </article>
                  )}
                </div>
              </article>

              <article className="settings-item">
                <span className="settings-label">Комментарии</span>
                <label className="settings-checkbox">
                  <input
                    type="radio"
                    name="create-group-comments"
                    checked={!creatingGroupCommentsForAll && !creatingGroupCommentsForPremium}
                    onChange={() => {
                      setCreatingGroupCommentsForAll(false)
                      setCreatingGroupCommentsForPremium(false)
                    }}
                  />
                  <span>Комментарии выключены</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="radio"
                    name="create-group-comments"
                    checked={creatingGroupCommentsForAll}
                    onChange={() => {
                      setCreatingGroupCommentsForAll(true)
                      setCreatingGroupCommentsForPremium(false)
                    }}
                  />
                  <span>Включить комментарии для всех юзеров</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="radio"
                    name="create-group-comments"
                    checked={creatingGroupCommentsForPremium}
                    onChange={() => {
                      setCreatingGroupCommentsForAll(false)
                      setCreatingGroupCommentsForPremium(true)
                    }}
                  />
                  <span>Включить комментарии только для премиум юзеров</span>
                </label>
              </article>
            </div>
            {creatingGroupSelectionHint ? (
              <p className="auth-error">{creatingGroupSelectionHint}</p>
            ) : null}
            {creatingGroupError ? <p className="auth-error">{creatingGroupError}</p> : null}
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => closeGroupCreateDialog()}
                disabled={creatingGroupBusy}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`room-confirm-button room-confirm-button-primary${canCreateGroup ? '' : ' disabled'}`}
                aria-disabled={!canCreateGroup}
                onClick={() => {
                  if (creatingGroupBusy) return
                  void createGroup()
                }}
              >
                {creatingGroupBusy ? 'Создаём...' : 'Создать'}
              </button>
            </div>
          </div>
        </>
      ) : null}
      {groupAvatarPickerOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть выбор аватарки группы"
            onClick={() => closeGroupAvatarPicker()}
          />
          <div className="channel-avatar-picker-popover group-avatar-picker-popover">
            <div className="channel-avatar-picker-copy">
              <strong>Аватарка группы</strong>
            </div>
            <div className="channel-avatar-picker-preview-card">
              <span
                className="channel-avatar channel-avatar-picker-preview"
                style={{ backgroundColor: creatingGroupAccent }}
              >
                {groupAvatarPickerDraft?.previewUrl ?? creatingGroupAvatarDraft?.previewUrl ? (
                  <img
                    src={groupAvatarPickerDraft?.previewUrl ?? creatingGroupAvatarDraft?.previewUrl}
                    alt=""
                    className="channel-avatar-image"
                  />
                ) : (
                  formatChannelAvatarLabel(creatingGroupTitle || buildDefaultGroupTitle(session))
                )}
              </span>
              <div className="channel-avatar-picker-preview-copy">
                <strong>{creatingGroupTitle.trim() || buildDefaultGroupTitle(session)}</strong>
                <span>Так будет выглядеть обработанная квадратная аватарка.</span>
                {groupAvatarPickerDraft?.label ? <span>{groupAvatarPickerDraft.label}</span> : null}
              </div>
            </div>
            <article className="settings-item channel-avatar-device-card">
              <button
                type="button"
                className="soft-button channel-avatar-device-button"
                onClick={triggerGroupAvatarUpload}
              >
                {groupAvatarPickerDraft?.kind === 'upload' || groupAvatarPickerDraft?.kind === 'uploaded'
                  ? 'Выбрать другой файл'
                  : 'Загрузить с устройства'}
              </button>
              <a
                className="settings-inline-link channel-avatar-device-link"
                href="/avatar-upload-rules.html"
                target="_blank"
                rel="noreferrer"
              >
                Правила загрузки аватарки
              </a>
            </article>
            <input
              ref={groupAvatarInputRef}
              type="file"
              accept={channelAvatarUploadAcceptedMimeTypes.join(',')}
              className="composer-attachment-input"
              onChange={handleGroupAvatarChange}
            />
            {groupAvatarPickerError ? <p className="auth-error">{groupAvatarPickerError}</p> : null}
            <div className="channel-avatar-picker-actions room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => closeGroupAvatarPicker()}
              >
                Отмена
              </button>
              <button
                type="button"
                className="room-confirm-button room-confirm-button-primary"
                onClick={applyGroupAvatarSelection}
                disabled={!groupAvatarPickerDraft || groupAvatarPickerBusy}
              >
                {groupAvatarPickerBusy ? 'Обрабатываем...' : 'Применить'}
              </button>
            </div>
          </div>
        </>
      ) : null}
      {groupSettingsOpen && activeGroup ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть настройки группы"
            onClick={() => requestGroupSettingsLeave('close')}
          />
          <div className="room-confirm room-group-create">
            <p className="room-confirm-copy">Настройки группы</p>
            <div className="channels-fields">
              <article className="settings-item">
                <span className="settings-label">Название группы</span>
                <input
                  type="text"
                  className="settings-input"
                  maxLength={groupTitleMaxLength}
                  value={groupSettingsDraft?.title ?? ''}
                  onChange={(event) =>
                    updateGroupSettingsDraft({
                      title: event.target.value.slice(0, groupTitleMaxLength),
                    })
                  }
                />
              </article>
              <article className="settings-item">
                <span className="settings-label">Комментарии</span>
                <label className="settings-checkbox">
                  <input
                    type="radio"
                    name={`group-comments-${activeGroup.id}`}
                    checked={
                      !groupSettingsDraft?.commentsEnabledForAll &&
                      !groupSettingsDraft?.commentsEnabledForPremium
                    }
                    onChange={() =>
                      updateGroupSettingsDraft({
                        commentsEnabledForAll: false,
                        commentsEnabledForPremium: false,
                      })
                    }
                  />
                  <span>Комментарии выключены</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="radio"
                    name={`group-comments-${activeGroup.id}`}
                    checked={Boolean(groupSettingsDraft?.commentsEnabledForAll)}
                    onChange={() =>
                      updateGroupSettingsDraft({
                        commentsEnabledForAll: true,
                        commentsEnabledForPremium: false,
                      })
                    }
                  />
                  <span>Включить комментарии для всех юзеров</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="radio"
                    name={`group-comments-${activeGroup.id}`}
                    checked={Boolean(groupSettingsDraft?.commentsEnabledForPremium)}
                    onChange={() =>
                      updateGroupSettingsDraft({
                        commentsEnabledForAll: false,
                        commentsEnabledForPremium: true,
                      })
                    }
                  />
                  <span>Включить комментарии только для премиум юзеров</span>
                </label>
                <button
                  type="button"
                  className="soft-button channel-blacklist-button"
                  onClick={() =>
                    openBlacklistManager({ groupId: activeGroup.id, kind: 'group', scope: 'existing' })
                  }
                >
                  Чёрный список
                </button>
              </article>
            </div>
            {groupSettingsError ? <p className="auth-error">{groupSettingsError}</p> : null}
            {groupSettingsDirty ? (
              <div className="room-confirm-actions room-confirm-actions-single">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-button-primary"
                  disabled={groupSettingsBusy}
                  onClick={() => {
                    void handleSaveGroupSettings()
                  }}
                >
                  Сохранить
                </button>
              </div>
            ) : null}
            <div className="room-confirm-actions room-confirm-actions-dual">
              {isActiveGroupCreator ? (
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={() => requestGroupSettingsLeave('management')}
                >
                  Управление группой
                </button>
              ) : null}
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => requestGroupSettingsLeave('close')}
              >
                Закрыть
              </button>
            </div>
          </div>
        </>
      ) : null}
      {confirmGroupSettingsLeaveOpen ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение сохранения настроек группы"
            onClick={dismissGroupSettingsLeaveConfirm}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">Изменённые настройки группы не сохранены. Сохранить их?</p>
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button room-confirm-button-primary"
                disabled={groupSettingsBusy}
                onClick={() => {
                  void confirmGroupSettingsLeaveWithSave()
                }}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={confirmGroupSettingsLeaveWithDiscard}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : null}
      {groupManagementOpen && activeGroup ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть управление группой"
            onClick={() => {
              setGroupManagementOpen(false)
              setGroupTransferOwnerOpen(false)
            }}
          />
          <div className="room-confirm room-transfer-list room-participants">
            <p className="room-confirm-copy">Управление группой</p>
            {groupTransferOwnerOpen ? (
              <>
                <div className="room-forward-list room-participants-list">
                  {transferableGroupParticipants.length > 0 ? (
                    transferableGroupParticipants.map((participant) => (
                      <button
                        key={`group-owner-transfer-${participant.id}`}
                        type="button"
                        className="room-forward-item room-participant-item"
                        onClick={() => {
                          if (!participant.identifier) return
                          void applyGroupSettingsPatch(activeGroup.id, {
                            creatorIdentifier: participant.identifier,
                          })
                          setGroupTransferOwnerOpen(false)
                          setGroupManagementOpen(false)
                          closeGroupSettingsDialog()
                        }}
                      >
                        <span className="room-participant-avatar-stack">
                          <span className="avatar" style={{ backgroundColor: participant.accent }}>
                            {participant.title.slice(0, 1)}
                          </span>
                          {participant.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                        </span>
                        <span className="room-participant-copy">
                          <strong>{participant.title}</strong>
                          <span>
                            {participant.nickname ? `@${participant.nickname}` : 'Участник группы'}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <article className="settings-item room-transfer-empty">
                      <p className="settings-text">В группе пока некому передать владельца.</p>
                    </article>
                  )}
                </div>
                <div className="room-confirm-actions room-confirm-actions-single">
                  <button
                    type="button"
                    className="room-confirm-button"
                    onClick={() => setGroupTransferOwnerOpen(false)}
                  >
                    Назад
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="room-forward-list">
                  <button
                    type="button"
                    className="room-forward-item"
                    onClick={() => setGroupTransferOwnerOpen(true)}
                  >
                    Передать владельца
                  </button>
                  <button
                    type="button"
                    className="room-forward-item room-confirm-danger"
                    onClick={() => {
                      setGroupManagementOpen(false)
                      closeGroupSettingsDialog()
                      setConfirmingLeaveGroupId(activeGroup.id)
                    }}
                  >
                    Удалить группу
                  </button>
                </div>
                <div className="room-confirm-actions room-confirm-actions-single">
                  <button
                    type="button"
                    className="room-confirm-button"
                    onClick={() => {
                      setGroupManagementOpen(false)
                      setGroupTransferOwnerOpen(false)
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
      {confirmingBlacklistTarget ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть подтверждение чёрного списка"
            onClick={closeBlacklistConfirmation}
          />
          <div className="room-confirm room-confirm-compact">
            <p className="room-confirm-copy">
              {`Добавить ${confirmingBlacklistTarget.title} в чёрный список ${
                confirmingBlacklistTarget.roomKind === 'channel' ? 'канала' : 'группы'
              }?`}
            </p>
            <p className="settings-text room-confirm-note">
              {confirmingBlacklistTarget.nickname
                ? `@${confirmingBlacklistTarget.nickname}`
                : confirmingBlacklistTarget.identifier}
            </p>
            <p className="settings-text room-confirm-note">
              {confirmingBlacklistTarget.roomKind === 'channel'
                ? `${confirmingBlacklistTarget.title} сможет читать канал, но больше не сможет писать комментарии.`
                : `${confirmingBlacklistTarget.title} сможет читать группу, но больше не сможет писать сообщения и комментарии.`}
            </p>
            <div className="room-confirm-actions room-confirm-actions-dual">
              <button
                type="button"
                className="room-confirm-button room-confirm-danger"
                onClick={confirmBlacklistTarget}
              >
                В чёрный список
              </button>
              <button
                type="button"
                className="room-confirm-button"
                onClick={closeBlacklistConfirmation}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : null}
      {blacklistManagerTarget ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть чёрный список"
            onClick={closeBlacklistManager}
          />
          <div className="room-confirm room-forward room-transfer-list">
            <p className="room-confirm-copy">Чёрный список</p>
            {blacklistAddMode ? (
              <>
                <label className="search room-transfer-search">
                  <span className="search-label">Поиск пользователя</span>
                  <input
                    type="search"
                    placeholder="Имя или @никнейм"
                    value={blacklistSearchQuery}
                    onChange={(event) => setBlacklistSearchQuery(event.target.value)}
                  />
                </label>
                <div className="room-forward-list">
                  {filteredBlacklistCandidates.length > 0 ? (
                    filteredBlacklistCandidates.map((participant) => (
                      <button
                        key={`blacklist-add-${participant.identifier ?? participant.id}`}
                        type="button"
                        className="room-forward-item"
                        onClick={() => addIdentifierToBlacklist(participant.identifier ?? '')}
                      >
                        <span className="avatar" style={{ backgroundColor: participant.accent }}>
                          {participant.title.slice(0, 1)}
                        </span>
                        <span>{participant.nickname ? `${participant.title} · @${participant.nickname}` : participant.title}</span>
                      </button>
                    ))
                  ) : (
                    <article className="settings-item room-transfer-empty">
                      <p className="settings-text">Подходящие пользователи не найдены.</p>
                    </article>
                  )}
                </div>
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={() => {
                    setBlacklistAddMode(false)
                    setBlacklistSearchQuery('')
                  }}
                >
                  Назад
                </button>
              </>
            ) : (
              <>
                <div className="room-forward-list">
                  {filteredBlacklistCandidates.length > 0 ? (
                    filteredBlacklistCandidates.map((participant) => (
                      <div
                        key={`blacklist-item-${participant.identifier ?? participant.id}`}
                        className="room-forward-item room-forward-item-static"
                      >
                        <span className="avatar" style={{ backgroundColor: participant.accent }}>
                          {participant.title.slice(0, 1)}
                        </span>
                        <span>{participant.nickname ? `${participant.title} · @${participant.nickname}` : participant.title}</span>
                        <button
                          type="button"
                          className="soft-button"
                          onClick={() => removeIdentifierFromBlacklist(participant.identifier ?? '')}
                        >
                          Убрать
                        </button>
                      </div>
                    ))
                  ) : (
                    <article className="settings-item room-transfer-empty">
                      <p className="settings-text">В чёрном списке пока никого нет.</p>
                    </article>
                  )}
                </div>
                <div className="room-confirm-actions room-confirm-actions-dual">
                  <button
                    type="button"
                    className="room-confirm-button"
                    onClick={() => {
                      setBlacklistAddMode(true)
                      setBlacklistSearchQuery('')
                    }}
                  >
                    Добавить
                  </button>
                  <button type="button" className="room-confirm-button" onClick={closeBlacklistManager}>
                    Закрыть
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
      </main>
      {mediaViewerAttachment ? (
        <MediaViewerOverlay
          attachment={mediaViewerAttachment}
          onClose={closeMediaViewer}
          allowDownload={mediaViewerDownloadEnabled}
          onPrimaryAction={
            mediaViewerGifAddEnabled ? () => {
              void addOpenedGifToLibrary()
            } : undefined
          }
          primaryActionBusy={mediaViewerGifActionBusy}
          primaryActionLabel={mediaViewerGifAddEnabled ? 'Добавить ГИФ себе' : ''}
          onReport={() => void reportOpenedMediaAttachment()}
          reportBusy={mediaViewerReportBusy}
          reportToast={mediaViewerReportToast}
        />
      ) : null}
      {cookieConsentBanner}
    </>
  )
}

export default App
