import {
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  accountNameMaxFontSize,
  accountNameMinFontSize,
  accountStatusMaxFontSize,
  accountStatusMinFontSize,
  browserNotificationsBannerDismissedStorageKey,
  defaultGroupsPerUserLimit,
  defaultGroupMemberLimit,
  channelActionMenuHeight,
  channelActionMenuWidth,
  channelAvatarUploadAcceptedMimeTypes,
  channelAvatarTones,
  channelBlockedMenuHeight,
  channelDescriptionMaxLength,
  channelDirectLinkMaxLength,
  channelTitleMaxLength,
  chatActionMenuHeight,
  chatActionMenuWidth,
  displayNameFieldMaxLength,
  passwordFieldMinLength,
  groupActionMenuHeight,
  groupActionMenuWidth,
  groupTitleMaxLength,
  managedChannelsPerUserLimit,
  messageFileUploadMaxSizeBytes,
  messagePhotoSendOriginalPreferenceStorageKey,
  nicknameFieldMaxLength,
  premiumGroupMemberLimit,
  premiumGroupsPerUserLimit,
  premiumMessageFileUploadMaxSizeBytes,
  premiumDebugAutoCheckoutStorageKey,
  quickFilters,
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
import { buildGroupParticipantFromChat, hydrateGroupParticipants } from './app/groupParticipants'
import { prepareAvatarUpload } from './app/avatarProcessing'
import {
  loadAccounts,
  loadPersistedAuthState,
  saveAccounts,
  saveSession,
  type PersistedAuthState,
} from './app/storage'
import {
  buildComposerAttachmentDraft,
  buildGifLibraryAttachmentDraft,
  buildPendingAttachmentDraft,
  createPreparingComposerAttachmentDraft,
  releaseComposerAttachmentDraft,
  setComposerAttachmentFileBaseName,
  setComposerAttachmentSendOriginal,
  type ComposerAttachmentDraft,
} from './app/composerAttachments'
import {
  shouldRenderIncomingAuthorStrip,
  shouldUseAuthorChainBreakSpacing,
} from './app/messageAuthorChains'
import { useBlacklistFlow } from './app/useBlacklistFlow'
import { useGroupSettingsFlow } from './app/useGroupSettingsFlow'
import { createPostAuthMainSurfaceState } from './app/postAuthMainSurface'
import { useRoomHistoryWindow } from './app/useRoomHistoryWindow'
import { useRoomMessageActions } from './app/useRoomMessageActions'
import { hasUsableThreadRoot } from './app/threadRoots'
import { useThreadFlow, type ThreadTarget } from './app/useThreadFlow'
import { getConversationDayKey } from './shared/utils'
import {
  ApiError,
  fetchClientRuntimeConfig,
  fetchDirectDialogHistory,
  fetchGroupHistory,
  fetchSubscriptionChannelPreview,
  fetchSubscriptionChannelHistory,
  fetchUserStorageItems as fetchUserStorageItemsRequest,
  fetchChannelStorageItems as fetchChannelStorageItemsRequest,
  createGroup as createGroupRequest,
  createManagedChannel as createManagedChannelRequest,
  deleteUserGif as deleteUserGifRequest,
  deleteUserStorageItem as deleteUserStorageItemRequest,
  deleteChannelStorageItem as deleteChannelStorageItemRequest,
  deleteDialog as deleteDialogRequest,
  deleteDialogHistory as deleteDialogHistoryRequest,
  deleteDialogMessage as deleteDialogMessageRequest,
  editDirectMessage as editDirectMessageRequest,
  editGroupMessage as editGroupMessageRequest,
  editGroupThreadComment as editGroupThreadCommentRequest,
  editManagedChannelPost as editManagedChannelPostRequest,
  editSubscriptionChannelThreadComment as editSubscriptionChannelThreadCommentRequest,
  deleteGroupMessage as deleteGroupMessageRequest,
  deleteGroupThreadComment as deleteGroupThreadCommentRequest,
  deleteAccount as deleteAccountRequest,
  blacklistGroupParticipant as blacklistGroupParticipantRequest,
  blacklistSubscriptionChannelSubscriber as blacklistSubscriptionChannelSubscriberRequest,
  changePassword as changePasswordRequest,
  deleteManagedChannel as deleteManagedChannelRequest,
  deleteManagedChannelPost as deleteManagedChannelPostRequest,
  deleteSubscriptionChannelThreadComment as deleteSubscriptionChannelThreadCommentRequest,
  markGroupThreadRead as markGroupThreadReadRequest,
  markSubscriptionChannelThreadRead as markSubscriptionChannelThreadReadRequest,
  fetchBootstrap,
  inviteGroupMember as inviteGroupMemberRequest,
  joinGroupFromInvite as joinGroupFromInviteRequest,
  inviteManagedChannelMembers as inviteManagedChannelMembersRequest,
  inviteSubscriptionChannelMembers as inviteSubscriptionChannelMembersRequest,
  leaveGroup as leaveGroupRequest,
  leaveSubscriptionChannel as leaveSubscriptionChannelRequest,
  loginWithPassword,
  logoutSession as logoutSessionRequest,
  markDialogRead as markDialogReadRequest,
  markGroupRead as markGroupReadRequest,
  markSubscriptionChannelRead as markSubscriptionChannelReadRequest,
  openDirectDialog as openDirectDialogRequest,
  openRealtimeConnection,
  reportContact as reportContactRequest,
  reportMediaAttachment as reportMediaAttachmentRequest,
  reportSubscriptionChannel as reportSubscriptionChannelRequest,
  removeSubscriptionChannelSubscriber as removeSubscriptionChannelSubscriberRequest,
  removeGroupParticipant as removeGroupParticipantRequest,
  registerAccount,
  setDebugPremiumState as setDebugPremiumStateRequest,
  registerUserGif,
  requestAuthCode,
  saveSnapshot,
  sendSupportTicket as sendSupportTicketRequest,
  sendSupportTicketComment as sendSupportTicketCommentRequest,
  searchChannelDiscoveryResults as searchChannelDiscoveryResultsRequest,
  searchUserGifs as searchUserGifsRequest,
  setPassword,
  searchDiscoveryResults as searchDiscoveryResultsRequest,
  setDialogFavorite as setDialogFavoriteRequest,
  setDialogPinnedMessage as setDialogPinnedMessageRequest,
  sendDirectMessage as sendDirectMessageRequest,
  sendGroupMessage as sendGroupMessageRequest,
  sendManagedChannelPost as sendManagedChannelPostRequest,
  sendGroupThreadComment as sendGroupThreadCommentRequest,
  sendSubscriptionChannelThreadComment as sendSubscriptionChannelThreadCommentRequest,
  markSupportTicketRead as markSupportTicketReadRequest,
  subscribeToChannel as subscribeToChannelRequest,
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
  resetPassword,
} from './app/backend'
import { configureAnalyticsRuntime, trackAnalyticsEvent, trackAnalyticsPageView } from './app/analytics'
import {
  ensureBrowserNotificationDeliveryReady,
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
import {
  isPasswordLoginBlockedMessage,
  isPasswordLoginRateLimitedMessage,
  mapAuthAnalyticsFlow,
  normalizePasswordLoginFailureMessage,
  shouldActivatePasswordLoginCaptcha,
  type UserAuthAnalyticsFlow,
} from './app/authAnalytics'
import {
  getBottomChannelsActionIconPath,
  getQuietToggleIconPath,
} from './app/iconContracts'
import { resolveSearchChannelOpenTarget } from './app/channelSearch'
import { type ContactsTabKey } from './app/contactsContract'
import {
  createAppNavigationHistoryState,
  getAppNavigationRouteEntryKey,
  readAppNavigationHistoryState,
  type AppNavigationHistoryState,
  type AppNavigationRoute,
  type SearchTopFilter,
} from './app/browserNavigationHistory'
import type { ClientRuntimeConfigResponse } from './shared/backend'
import type {
  Account,
  ActionAnchor,
  AuthStep,
  Channel,
  ChannelSearchResult,
  ChannelPost,
  Chat,
  ChannelsView,
  ContactRequestPreview,
  EditTarget,
  GroupPreview,
  GroupParticipant,
  Message,
  MessageAttachment,
  QuietModeSettings,
  ReplyTarget,
  SearchResult,
  Session,
  SettingsView,
  StageView,
  SupportTicket,
  SubscriptionChannel,
  ThreadComment,
  ThreadInboxItem,
  TopListView,
  UserGifLibraryItem,
  UserStorageItem,
} from './app/types'

import { useCaptcha } from './app/useCaptcha'
import {
  buildRoomFeedSignature,
} from './app/roomFeedScroll'
import {
  getActiveRoomReadKey,
  shouldSyncActiveRoomRead,
  type ActiveRoomReadTarget,
} from './app/roomReadSync'
import { useRoomFeedAutoScroll } from './app/useRoomFeedAutoScroll'
import { scheduleActionAnchor, syncActionAnchorScroll, useAnchoredMenu } from './app/useAnchoredMenu'
import { useContactRequestsFlow } from './app/useContactRequestsFlow'
import {
  formatMessagePreview,
  formatAttachmentPreviewText,
  formatChannelAvatarLabel,
  formatContactStatus,
  formatPreview,
  formatSidebarActivityLabel,
  extendPremiumExpiry,
  formatGroupPreview,
  formatGroupTime,
  formatMessageTimeLabel,
  formatNowTime,
  formatSessionName,
  formatSupportTicketCreatedAt,
  formatSupportTicketStatus,
  formatSubscriptionChannelReaders,
  formatSubscriptionChannelSubscribers,
  formatSubscriptionChannelTime,
  formatUnreadBadgeCount,
  buildChannelDirectLinkFromTitle,
  ensureUniqueChannelDirectLink,
  formatAttachmentSize,
  getChannelVisibilityDescription,
  getChannelVisibilityLabel,
  getEffectiveQuietModeSettings,
  getMessageAttachmentPresentation,
  getNextChannelVisibility,
  getPremiumDaysLeft,
  hasActivePremium,
  isPhoneQuery,
  isMobileBrowserEnvironment,
  makeDraftChannel,
  matchesQuery,
  moveUnreadItemsFirst,
  normalizeIdentifier,
  normalizeNickname,
  normalizeQuietModeSettings,
  nonPremiumQuietModeSettings,
  normalizePremiumExpiry,
  resolveQuietModeInvisibilityState,
  isImageMimeType,
  isVideoNoteAttachment,
  isVideoMimeType,
  sanitizeChannelDirectLink,
  sanitizeChannelDescription,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
  scrollFeedChildIntoView,
  shouldAutoFocusTextInputOnSceneOpen,
  shouldShowPremiumCrown,
  shouldSubmitComposerWithEnter,
  sortChatsByRecentActivity,
  sortGroupsByRecentActivity,
  sortSubscriptionChannelsByRecentActivity,
} from './app/utils'
import { ContactsFilters } from './components/ContactsFilters'
import { ContactsPane } from './components/ContactsPane'
import { AuthScreen } from './screens/AuthScreen'
import { ConfirmLogoutScreen } from './screens/ConfirmLogoutScreen'
import { DirectChatRoom } from './rooms/DirectChatRoom'
import { GroupRoom } from './rooms/GroupRoom'
import { SubscriptionChannelRoom } from './rooms/SubscriptionChannelRoom'
import {
  BubbleImageOverlayMeta,
  BubbleMessageContent,
  BubbleTextInlineMeta,
} from './components/BubbleMessageContent'
import { AttachedReplyBubble } from './components/AttachedReplyBubble'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { MediaOnlyBubbleRow } from './components/MediaOnlyBubbleRow'
import { RoomComposer } from './components/RoomComposer'
import { ThreadedBubble } from './components/ThreadedBubble'
import { useCookieConsent } from './app/useCookieConsent'
import { useDocumentTheme } from './app/useDocumentTheme'
import {
  preserveMatchedOutgoingAttachmentPreview,
  reconcileOutgoingItems,
} from './app/outgoingMessageReconciliation'
import {
  PENDING_ATTACHMENT_FINALIZING_PROGRESS,
  preservePendingAttachmentPreview,
  type PendingAttachmentDraft,
  type PendingDirectMessage,
  type PendingGroupMessage,
  usePendingMessageOutbox,
} from './app/usePendingMessageOutbox'
import { useRuntimeSessionRecovery } from './app/useRuntimeSessionRecovery'
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
import {
  buildComposerMentionCandidates,
  buildMessageMentions,
  buildThreadMentionCandidates,
} from './shared/composerMentions'
import './App.css'

const deliveryIndicatorIconPaths = [
  '/icons/hourglass-48.png',
  '/icons/warning-48.png',
  '/icons/double-tick-50.png',
]

const MediaViewerOverlay = lazy(() =>
  import('./components/MediaViewerOverlay').then((module) => ({ default: module.MediaViewerOverlay })),
)
const SelectedBubbleOverlay = lazy(() =>
  import('./components/SelectedBubbleOverlay').then((module) => ({ default: module.SelectedBubbleOverlay })),
)
const VideoNoteRecorderOverlay = lazy(() =>
  import('./components/VideoNoteRecorderOverlay').then((module) => ({ default: module.VideoNoteRecorderOverlay })),
)

const contactComplaintReasonOptions: Array<{ label: string; value: ComplaintReason }> = [
  { label: 'Спам', value: 'spam' },
  { label: 'Обман', value: 'fraud' },
  { label: 'Очень неприятно', value: 'very_unpleasant' },
]

const quietModeSettingsOptions: Array<{
  key: keyof QuietModeSettings
  label: string
}> = [
  { key: 'dialogs', label: 'Уведомления диалогов' },
  { key: 'channels', label: 'Уведомления каналов' },
  { key: 'groups', label: 'Уведомления групп' },
  { key: 'threads', label: 'Уведомления комментариев' },
  { key: 'contactRequests', label: 'Заявки от контактов' },
  { key: 'autoInvisibility', label: 'Авто-режим невидимки' },
]

const blockedAuthNoticeMessage =
  'На ваш аккаунт поступило много жалоб, поэтому вход временно заблокирован. Если произошла ошибка, напишите в поддержку и укажите email: devisjjones@gmail.com'
const blockedPhoneAuthNoticeMessage = 'Аккаунт заблокирован по решению администрации.'
const supportInfoBannerText =
  'Отправленное сообщение создаёт задачу для поддержки Тайничка. Все ответы будут в комментариях вашего обращения. Пожалуйста, старайтесь сформулировать суть проблемы в одном сообщении.'
const supportCooldownCopy =
  'Новую задачу для поддержки можно открыть через время. Если у вас есть новые подробности по предыдущему обращению, пожалуйста, напишите в комментарии к нему.'
const supportCooldownErrorMessage = 'Новую задачу для поддержки пока рано открывать.'
// Keep this frontend constant aligned with the server-side support cooldown contract.
// We intentionally reuse it on the client so the support scene can enter cooldown immediately
// even when the next snapshot or the browser clock arrives out of order.
const supportTicketCooldownMs = 10 * 60 * 1000

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

function isBrowserNotificationTarget(value: unknown): value is BrowserNotificationTarget {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<BrowserNotificationTarget> & { kind?: unknown }
  switch (candidate.kind) {
    case 'chat':
      return typeof (candidate as { chatId?: unknown }).chatId === 'number'
    case 'group':
      return typeof (candidate as { groupId?: unknown }).groupId === 'number'
    case 'channel':
      return typeof (candidate as { channelId?: unknown }).channelId === 'number'
    case 'thread':
      return Boolean(
        (candidate as { item?: Partial<ThreadInboxItem> }).item &&
          typeof (candidate as { item?: Partial<ThreadInboxItem> }).item?.threadId === 'string',
      )
    default:
      return false
  }
}

type ProfileSettingsDraft = Pick<
  Session,
  | 'displayName'
  | 'surname'
  | 'nickname'
  | 'status'
  | 'avatarImage'
  | 'soundsDisabled'
  | 'darkThemeEnabled'
  | 'premiumBadgeHidden'
>

function resolveSupportCooldownUntilFromTickets(
  supportTickets: Array<{ createdAt: string }>,
  now = Date.now(),
) {
  // Support cooldown is derived from the newest root ticket only. This helper exists as a
  // fallback guard for staging/runtime regressions where the explicit cooldown field could be
  // missing or arrive a beat later than the updated ticket list.
  const latestCreatedAt = supportTickets.reduce<number | null>((latest, ticket) => {
    const createdAtMs = Date.parse(ticket.createdAt)
    if (!Number.isFinite(createdAtMs)) {
      return latest
    }

    return latest === null || createdAtMs > latest ? createdAtMs : latest
  }, null)

  if (latestCreatedAt === null) {
    return undefined
  }

  const cooldownUntilMs = latestCreatedAt + supportTicketCooldownMs
  return cooldownUntilMs > now ? new Date(cooldownUntilMs).toISOString() : undefined
}

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
    darkThemeEnabled: Boolean(session.darkThemeEnabled),
    displayName: session.displayName,
    nickname: session.nickname ?? '',
    premiumBadgeHidden: Boolean(session.premiumBadgeHidden),
    soundsDisabled: Boolean(session.soundsDisabled),
    status: session.status ?? '',
    surname: session.surname ?? '',
  }
}

type QuietNotificationCategory = 'dialogs' | 'channels' | 'groups' | 'threads' | 'contactRequests'

function isQuietCategorySuppressed(
  quietMode: boolean,
  quietModeSettings: QuietModeSettings,
  category: QuietNotificationCategory,
) {
  return quietMode && quietModeSettings[category]
}

function shouldSuppressBrowserNotificationTarget(
  quietMode: boolean,
  quietModeSettings: QuietModeSettings,
  target: BrowserNotificationTarget,
) {
  if (!quietMode) return false

  if (target.kind === 'chat') return quietModeSettings.dialogs
  if (target.kind === 'channel') return quietModeSettings.channels
  if (target.kind === 'group') return quietModeSettings.groups
  return quietModeSettings.threads
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
      body: item.kind === 'group' ? 'Новый комментарий' : 'Новый комментарий к посту',
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

const THREAD_PREVIEW_AUTHOR_FALLBACK_ACCENT = '#cfb4a0'

function renderAccountAvatarContent(title: string, archivedAccount?: boolean, avatarImage?: string) {
  if (archivedAccount) {
    return <img src="/icons/ghost.png" alt="" aria-hidden="true" className="avatar-ghost-icon" />
  }

  if (avatarImage) {
    return <img src={avatarImage} alt="" className="channel-avatar-image" />
  }

  return title.slice(0, 1)
}

function resolveGroupPreviewAuthor(
  group: GroupPreview,
  session: Session | null,
): Pick<GroupParticipant, 'accent' | 'avatarImage' | 'title'> | null {
  const latestMessage = group.messages.at(-1)
  if (!latestMessage || latestMessage.system) {
    return null
  }

  if (latestMessage.author === 'me') {
    const normalizedSessionIdentifier = normalizeIdentifier(session?.identifier ?? '')
    const sessionParticipant =
      normalizedSessionIdentifier
        ? group.participants.find(
            (participant) =>
              normalizeIdentifier(participant.identifier ?? '') === normalizedSessionIdentifier,
          ) ?? null
        : null

    return {
      accent: sessionParticipant?.accent ?? group.accent,
      avatarImage: session?.avatarImage ?? sessionParticipant?.avatarImage,
      title: sessionParticipant?.title ?? (session ? formatSessionName(session) : 'Вы'),
    }
  }

  const matchedParticipant =
    (latestMessage.groupParticipantId !== undefined
      ? group.participants.find((participant) => participant.id === latestMessage.groupParticipantId) ?? null
      : null) ??
    (latestMessage.displayAuthor
      ? group.participants.find((participant) => participant.title === latestMessage.displayAuthor) ?? null
      : null)

  if (matchedParticipant) {
    return {
      accent: matchedParticipant.accent,
      avatarImage: matchedParticipant.avatarImage,
      title: matchedParticipant.title,
    }
  }

  if (!latestMessage.displayAuthor) {
    return null
  }

  return {
    accent: '#cfb4a0',
    avatarImage: undefined,
    title: latestMessage.displayAuthor,
  }
}

function resolveGroupThreadInboxPreviewAuthor(
  group: GroupPreview,
  latestComment: ThreadComment | undefined,
  session: Session | null,
) {
  if (!latestComment) {
    return {
      accent: THREAD_PREVIEW_AUTHOR_FALLBACK_ACCENT,
      avatarImage: undefined,
    }
  }

  const normalizedAuthorIdentifier = normalizeIdentifier(latestComment.authorIdentifier ?? '')

  if (latestComment.author === 'me') {
    const normalizedSessionIdentifier = normalizeIdentifier(session?.identifier ?? '')
    const sessionParticipant =
      normalizedSessionIdentifier
        ? group.participants.find(
            (participant) =>
              normalizeIdentifier(participant.identifier ?? '') === normalizedSessionIdentifier,
          ) ?? null
        : null

    return {
      accent: sessionParticipant?.accent ?? group.accent ?? THREAD_PREVIEW_AUTHOR_FALLBACK_ACCENT,
      avatarImage: session?.avatarImage ?? sessionParticipant?.avatarImage,
    }
  }

  const matchedParticipant =
    (normalizedAuthorIdentifier
      ? group.participants.find(
          (participant) =>
            normalizeIdentifier(participant.identifier ?? '') === normalizedAuthorIdentifier,
        ) ?? null
      : null) ??
    (latestComment.displayAuthor
      ? group.participants.find((participant) => participant.title === latestComment.displayAuthor) ?? null
      : null)

  return {
    accent: matchedParticipant?.accent ?? THREAD_PREVIEW_AUTHOR_FALLBACK_ACCENT,
    avatarImage: matchedParticipant?.avatarImage,
  }
}

function resolveChannelThreadInboxPreviewAuthor(
  latestComment: ThreadComment | undefined,
  session: Session | null,
) {
  if (!latestComment) {
    return {
      accent: THREAD_PREVIEW_AUTHOR_FALLBACK_ACCENT,
      avatarImage: undefined,
    }
  }

  return {
    accent: THREAD_PREVIEW_AUTHOR_FALLBACK_ACCENT,
    avatarImage: latestComment.author === 'me' ? session?.avatarImage : undefined,
  }
}

function buildPreviewSubscriptionChannelFromManagedChannel(channel: Channel): SubscriptionChannel {
  return {
    accent: channel.avatarTone,
    avatarImage: channel.avatarImage,
    commentBlacklistIdentifiers: channel.commentBlacklistIdentifiers ?? [],
    commentsEnabledForAll: channel.commentsEnabledForAll ?? false,
    commentsEnabledForPremium: channel.commentsEnabledForPremium ?? false,
    creatorIdentifier: undefined,
    description: channel.description,
    draft: channel.status === 'draft',
    handle: channel.directLink,
    id: getSyntheticChannelId(`managed-preview:${channel.directLink}:${channel.title}`),
    latestActivityAt: undefined,
    participants: [],
    posts: [],
    preview: channel.statusText || channel.description,
    readers: 1,
    statusText: channel.statusText,
    time: '',
    title: channel.title,
    unread: 0,
    visibility: channel.visibility,
  }
}

function buildLocalChannelSystemPost(): ChannelPost {
  const createdAt = new Date().toISOString()
  return {
    createdAt,
    id: Date.now(),
    system: true,
    text: 'Канал создан',
    threadComments: [],
    time: formatNowTime(),
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

function getThreadsModerationNoticeText() {
  return 'Комментарии заблокированы модерацией.'
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
    'archivedAt' | 'commentBlacklistIdentifiers' | 'commentsEnabledForAll' | 'commentsEnabledForPremium'
  >,
  session: Session | null,
  roomLabel: 'группы' | 'канала',
) {
  if (target.archivedAt) {
    return roomLabel === 'канала'
      ? 'Канал находится в архиве. Новые комментарии недоступны.'
      : 'Группа находится в архиве. Новые сообщения недоступны.'
  }

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

type GroupAvatarPickerTarget =
  | { scope: 'create' }
  | { scope: 'existing'; groupId: number }

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
const STALE_RUNTIME_RECOVERY_INTERVAL_MS = 15_000
const runtimeReloadQueryParam = '__tinychok_reload'
const runtimeReloadAttemptStorageKey = 'tinychok.runtime.reload-build-id'

function replaceCurrentUrl(url: URL) {
  if (typeof window === 'undefined') return
  window.location.replace(url.toString())
}

function triggerOneShotRuntimeReload(serverBuildId: string) {
  if (typeof window === 'undefined') return false

  const previousAttemptBuildId = window.sessionStorage.getItem(runtimeReloadAttemptStorageKey)
  if (previousAttemptBuildId === serverBuildId) {
    return false
  }

  window.sessionStorage.setItem(runtimeReloadAttemptStorageKey, serverBuildId)
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set(runtimeReloadQueryParam, serverBuildId)
  replaceCurrentUrl(nextUrl)
  return true
}

function stripRuntimeReloadQueryParam() {
  if (typeof window === 'undefined') return

  const currentUrl = new URL(window.location.href)
  if (!currentUrl.searchParams.has(runtimeReloadQueryParam)) {
    return
  }

  currentUrl.searchParams.delete(runtimeReloadQueryParam)
  window.history.replaceState(window.history.state, '', currentUrl.toString())
}

const defaultClientRuntimeConfig: ClientRuntimeConfigResponse = {
  analytics: {
    enabled: false,
    flushIntervalMs: 5000,
    maxBatchSize: 20,
    metricaCounterId: null,
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
  release: {
    buildId: __TINYCHOK_FRONTEND_BUILD_ID__,
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

type VideoNoteRecorderTarget =
  | { kind: 'direct'; chatId: number }
  | { kind: 'group'; groupId: number }
  | { kind: 'channel'; channelId: number }
  | { kind: 'thread'; room: 'group'; groupId: number; messageId: number }
  | { kind: 'thread'; room: 'channel'; channelId: number; postId: number }

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
    getMessageAttachmentPresentation(left.presentation) ===
      getMessageAttachmentPresentation(right.presentation) &&
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

function resolvePreviousVisibleItem<T extends { createdAt?: string; id: number }>(
  items: T[],
  targetId: number | null,
  options?: {
    sameDayOnly?: boolean
  },
) {
  if (targetId === null) {
    return null
  }

  const currentIndex = items.findIndex((item) => item.id === targetId)
  if (currentIndex <= 0) {
    return null
  }

  const currentItem = items[currentIndex]
  const previousItem = items[currentIndex - 1]
  if (!currentItem || !previousItem) {
    return null
  }

  if (
    options?.sameDayOnly &&
    getConversationDayKey(previousItem.createdAt) !== getConversationDayKey(currentItem.createdAt)
  ) {
    return null
  }

  return previousItem
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

function getAnalyticsAttachmentKind(attachment?: Message['attachment']) {
  if (!attachment) return 'none'
  if (attachment.mimeType === 'image/gif') return 'gif'
  if (isImageMimeType(attachment.mimeType)) return 'image'
  if (isVideoMimeType(attachment.mimeType)) return 'video'
  return 'file'
}

function getAnalyticsAttachmentPresentation(
  attachment?:
    | Message['attachment']
    | Pick<ComposerAttachmentDraft, 'presentation'>
    | Pick<PendingAttachmentDraft, 'presentation'>
    | null,
) {
  return getMessageAttachmentPresentation(attachment?.presentation) === 'video-note'
    ? 'video-note'
    : 'regular'
}

function isVideoNoteDraft(
  attachmentDraft?:
    | Pick<ComposerAttachmentDraft, 'presentation'>
    | Pick<PendingAttachmentDraft, 'presentation'>
    | null,
) {
  return getMessageAttachmentPresentation(attachmentDraft?.presentation) === 'video-note'
}

function isPhotoMimeType(mimeType: string | undefined) {
  return Boolean(mimeType && isImageMimeType(mimeType) && mimeType !== 'image/gif')
}

function getAnalyticsFileExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase()
  const lastDotIndex = normalizedName.lastIndexOf('.')
  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return 'none'
  }

  return normalizedName.slice(lastDotIndex + 1)
}

function getAnalyticsFileKind(args: {
  fileName?: string
  mimeType?: string
  presentation?: NonNullable<Message['attachment']>['presentation'] | ComposerAttachmentDraft['presentation']
}) {
  const presentation = getMessageAttachmentPresentation(args.presentation)
  if (presentation === 'video-note') return 'video-note'
  if (args.mimeType === 'image/gif') return 'gif'
  if (args.mimeType && isImageMimeType(args.mimeType)) return 'image'
  if (args.mimeType && isVideoMimeType(args.mimeType)) return 'video'
  const extension = getAnalyticsFileExtension(args.fileName ?? '')
  if (extension === 'pdf') return 'document'
  return 'file'
}

function getAnalyticsSizeBucket(size: number) {
  if (size < 1_000_000) return 'under-1mb'
  if (size < 10_000_000) return '1mb-to-10mb'
  if (size < 50_000_000) return '10mb-to-50mb'
  if (size < 200_000_000) return '50mb-to-200mb'
  return '200mb-plus'
}

function getAnalyticsQueryLength(query: string) {
  return query.trim().length
}

function getAnalyticsSearchSource(bottomSection: 'chats' | 'contacts') {
  return bottomSection === 'contacts' ? 'contacts-tab' : 'chats-tab'
}

function getAnalyticsReason(error: unknown, fallbackMessage: string) {
  return getErrorMessage(error, fallbackMessage)
}

function getAnalyticsVideoNoteDurationBucket(durationMs: number) {
  if (durationMs <= 5_000) return '0s-to-5s'
  if (durationMs <= 15_000) return '5s-to-15s'
  if (durationMs <= 30_000) return '15s-to-30s'
  return '30s-plus'
}

function trackAttachmentSelected(
  surface: 'channel' | 'direct' | 'group' | 'support' | 'thread',
  file: File,
  sendOriginalPreferred: boolean,
) {
  if (isPhotoMimeType(file.type)) {
    trackAnalyticsEvent('photo_attachment_selected', {
      fileSize: file.size,
      mimeType: file.type,
      sendOriginalPreferred,
      surface,
    })
    return
  }

  if (isVideoMimeType(file.type)) {
    trackAnalyticsEvent('video_attachment_selected', {
      fileSize: file.size,
      mimeType: file.type,
      surface,
    })
    return
  }

  trackAnalyticsEvent('file_attachment_selected', {
    extension: getAnalyticsFileExtension(file.name),
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    surface,
  })
}

function trackAttachmentUploadFailed(
  attachmentDraft: PendingAttachmentDraft,
  error: unknown,
  surface: 'channel' | 'direct' | 'group' | 'support' | 'thread',
) {
  if (isPhotoMimeType(attachmentDraft.mimeType)) {
    trackAnalyticsEvent('photo_upload_failed', {
      fileSize: attachmentDraft.size,
      mimeType: attachmentDraft.mimeType,
      reason: getAnalyticsReason(error, 'upload-failed'),
      surface,
    })
    return
  }

  if (isVideoMimeType(attachmentDraft.mimeType)) {
    trackAnalyticsEvent('video_upload_failed', {
      fileSize: attachmentDraft.size,
      mimeType: attachmentDraft.mimeType,
      reason: getAnalyticsReason(error, 'upload-failed'),
      surface,
    })
    return
  }

  trackAnalyticsEvent('file_upload_failed', {
    extension: getAnalyticsFileExtension(attachmentDraft.fileName),
    fileSize: attachmentDraft.size,
    mimeType: attachmentDraft.mimeType || 'application/octet-stream',
    reason: getAnalyticsReason(error, 'upload-failed'),
    surface,
  })
}

function buildAnalyticsVirtualPageView(args: {
  activeChannelId: number | null
  activeChatId: number | null
  activeGroupId: number | null
  activeSubscriptionChannelId: number | null
  authStep: AuthStep
  channelsView: ChannelsView
  session: Session | null
  settingsView: SettingsView
  stageView: StageView
  topListView: TopListView
}) {
  const {
    activeChannelId,
    activeChatId,
    activeGroupId,
    activeSubscriptionChannelId,
    authStep,
    channelsView,
    session,
    settingsView,
    stageView,
    topListView,
  } = args

  if (!session) {
    return {
      path: `/auth/${authStep}`,
      title: `Tinychok Auth ${authStep}`,
    }
  }

  if (stageView === 'settings') {
    return {
      path: `/settings/${settingsView}`,
      title: `Tinychok Settings ${settingsView}`,
    }
  }

  if (stageView === 'premium') {
    return {
      path: '/premium',
      title: 'Tinychok Premium',
    }
  }

  if (stageView === 'channels') {
    if (channelsView === 'create') {
      return {
        path: '/channels/create',
        title: 'Tinychok Create Channel',
      }
    }

    if (activeChannelId !== null) {
      return {
        path: `/channels/manage/${activeChannelId}`,
        title: 'Tinychok Channel Management',
      }
    }

    return {
      path: '/channels',
      title: 'Tinychok Channels',
    }
  }

  if (topListView === 'groups') {
    return activeGroupId !== null
      ? {
          path: `/groups/${activeGroupId}`,
          title: 'Tinychok Group Room',
        }
      : {
          path: '/groups',
          title: 'Tinychok Groups',
        }
  }

  if (topListView === 'channels') {
    return activeSubscriptionChannelId !== null
      ? {
          path: `/feed/channels/${activeSubscriptionChannelId}`,
          title: 'Tinychok Channel Feed',
        }
      : {
          path: '/feed/channels',
          title: 'Tinychok Channel Feed',
        }
  }

  if (topListView === 'threads') {
    return {
      path: '/threads',
      title: 'Tinychok Threads',
    }
  }

  return activeChatId !== null
    ? {
        path: `/dialogs/${activeChatId}`,
        title: 'Tinychok Direct Chat',
      }
    : {
        path: '/dialogs',
        title: 'Tinychok Dialogs',
      }
}

function getAnalyticsAppSurface(path: string) {
  if (path === '/dialogs') return 'dialogs'
  if (path.startsWith('/dialogs/')) return 'direct-dialog'
  if (path === '/groups') return 'groups'
  if (path.startsWith('/groups/')) return 'group-room'
  if (path === '/feed/channels') return 'channels-feed'
  if (path.startsWith('/feed/channels/')) return 'channel-room'
  if (path === '/threads') return 'threads'
  if (path === '/premium') return 'premium'
  if (path === '/channels') return 'channels'
  if (path === '/channels/create') return 'channel-create'
  if (path.startsWith('/channels/manage/')) return 'channel-management'
  if (path.startsWith('/settings/')) return 'settings'
  return 'app'
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
  const supportSceneTopRef = useRef<HTMLDivElement | null>(null)
  const channelStorageSceneTopRef = useRef<HTMLDivElement | null>(null)
  const supportComposerInputRef = useRef<HTMLTextAreaElement | null>(null)
  const supportAttachmentInputRef = useRef<HTMLInputElement | null>(null)
  const channelAvatarObjectUrlsRef = useRef(new Set<string>())
  const localMessageAttachmentObjectUrlsRef = useRef(new Set<string>())
  const profileAvatarSelectionTokenRef = useRef(0)
  const channelAvatarSelectionTokenRef = useRef(0)
  const groupAvatarSelectionTokenRef = useRef(0)
  const chatAttachmentSelectionTokenRef = useRef(0)
  const groupAttachmentSelectionTokenRef = useRef(0)
  const channelAttachmentSelectionTokenRef = useRef(0)
  const threadAttachmentSelectionTokenRef = useRef(0)
  const supportAttachmentSelectionTokenRef = useRef(0)
  const lastAnalyticsPageViewKeyRef = useRef<string | null>(null)
  const lastAnalyticsAppOpenedSessionTokenRef = useRef<string | null>(null)
  const lastTrackedGifSearchKeyRef = useRef<string | null>(null)
  const lastTrackedContactSearchKeyRef = useRef<string | null>(null)
  const lastTrackedChannelSearchKeyRef = useRef<string | null>(null)
  const lastTrackedEmptySearchKeyRef = useRef<string | null>(null)
  const previousSearchOpenRef = useRef(false)
  const previousTopListViewRef = useRef<TopListView>('none')
  const previousSettingsViewRef = useRef<SettingsView>('profile')
  const previousSupportTicketStatusesRef = useRef(new Map<number, SupportTicket['status']>())
  const supportTicketSnapshotOwnerRef = useRef<string | null>(null)
  const pendingVideoNoteAnalyticsRef = useRef<{
    durationBucket: string
    roomKind: 'channel' | 'direct' | 'group'
    surface: 'channel' | 'direct' | 'group' | 'thread'
  } | null>(null)
  const nextOptimisticMessageIdRef = useRef(-1)
  const pendingRetryInFlightRef = useRef(false)
  const sessionRecoveryTimeoutRef = useRef<number | null>(null)
  const latestAuthoritativeSnapshotAtRef = useRef(0)
  const staleRuntimeResyncInFlightRef = useRef<Promise<void> | null>(null)
  const pendingGroupThreadCommentsRef = useRef<PendingGroupThreadComment[]>([])
  const pendingChannelThreadCommentsRef = useRef<PendingChannelThreadComment[]>([])
  const backendSyncTimeoutRef = useRef<number | null>(null)
  const skipNextBackendSyncRef = useRef(false)
  const appNavigationHistoryReadyRef = useRef(false)
  const appNavigationHistoryDepthRef = useRef(0)
  const appNavigationRestoringRef = useRef(false)
  const appNavigationIgnoreNextPopstateRef = useRef(false)
  const blockedBrowserPopstateRef = useRef<AppNavigationHistoryState | null>(null)
  const initialPersistedAuthStateRef = useRef<PersistedAuthState | null>(null)
  if (initialPersistedAuthStateRef.current === null) {
    initialPersistedAuthStateRef.current = loadPersistedAuthState()
  }
  const initialPersistedAuthState = initialPersistedAuthStateRef.current
  const initialPersistedSession = initialPersistedAuthState.session

  function clearPendingVideoNoteAnalytics() {
    pendingVideoNoteAnalyticsRef.current = null
  }

  function trackPendingVideoNoteSendSucceeded() {
    const pendingVideoNoteAnalytics = pendingVideoNoteAnalyticsRef.current
    if (!pendingVideoNoteAnalytics) return

    clearPendingVideoNoteAnalytics()
    trackAnalyticsEvent('video_note_send_succeeded', {
      durationBucket: pendingVideoNoteAnalytics.durationBucket,
      roomKind: pendingVideoNoteAnalytics.roomKind,
      source: pendingVideoNoteAnalytics.surface,
    })
  }

  function trackPendingVideoNoteSendFailed(reason: string) {
    const pendingVideoNoteAnalytics = pendingVideoNoteAnalyticsRef.current
    if (!pendingVideoNoteAnalytics) return

    clearPendingVideoNoteAnalytics()
    trackAnalyticsEvent('video_note_send_failed', {
      durationBucket: pendingVideoNoteAnalytics.durationBucket,
      reason,
      roomKind: pendingVideoNoteAnalytics.roomKind,
      source: pendingVideoNoteAnalytics.surface,
    })
  }

  function handleQuietSettingsLockedInteraction(settingKey: keyof QuietModeSettings) {
    trackAnalyticsEvent('quiet_settings_locked_interaction', {
      hasPremium: sessionHasPremium,
      settingKey,
      source: 'settings-profile',
    })
    openPremiumUpsell()
  }
  // These refs keep the debounced write-path transparent: text fields update locally first,
  // then the latest snapshot/patch is flushed through dedicated backend mutations.
  const latestSnapshotRef = useRef<AppSnapshot | null>(null)
  const previousSnapshotSlicesRef = useRef<{
    channels: Channel[]
    chats: typeof initialChats
    contactRequests: ContactRequestPreview[]
    outgoingContactRequests: ContactRequestPreview[]
    groups: typeof initialGroups
    session: Session | null
    supportTicketCooldownUntil?: string
    supportTickets: SupportTicket[]
    supportUnreadCount: number
    subscriptionChannels: typeof initialSubscribedChannels
    threadInbox: ThreadInboxItem[]
  }>({
    channels: initialChannels,
    chats: initialChats,
    contactRequests: [],
    outgoingContactRequests: [],
    groups: initialGroups,
    session: initialPersistedSession,
    supportTicketCooldownUntil: undefined,
    supportTickets: [],
    supportUnreadCount: 0,
    subscriptionChannels: initialSubscribedChannels,
    threadInbox: [],
  })
  const pendingChannelPatchesRef = useRef(new Map<number, UpdateManagedChannelBody>())
  const suppressChannelSnapshotSyncRef = useRef(false)
  const previousChatsRef = useRef(initialChats)
  const browserNotificationDigestRef = useRef<BrowserNotificationDigest | null>(null)
  const browserNotificationOpenTargetRef = useRef<(target: BrowserNotificationTarget) => void>(() => {})
  const suppressNextBrowserNotificationDiffRef = useRef(false)
  const mobileBrowserNotificationsAutoRequestAttemptedRef = useRef(false)
  const previousBrowserNotificationStatusRef = useRef<BrowserNotificationStatus>(
    getBrowserNotificationStatus(),
  )
  const previousStageViewRef = useRef<StageView>('main')
  const [chats, setChats] = useState(initialChats)
  const [contactRequests, setContactRequests] = useState<ContactRequestPreview[]>([])
  const [outgoingContactRequests, setOutgoingContactRequests] = useState<ContactRequestPreview[]>([])
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
  const [contactsTab, setContactsTab] = useState<ContactsTabKey>('all')
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
  const [videoNoteRecorderTarget, setVideoNoteRecorderTarget] = useState<VideoNoteRecorderTarget | null>(null)
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
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
  const [searchTopFilter, setSearchTopFilter] = useState<SearchTopFilter>('all')
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
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(
    () => initialPersistedSession?.browserNotificationsEnabled !== false,
  )
  const [authStep, setAuthStep] = useState<AuthStep>('phone')
  const [displayName, setDisplayName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('')
  const [authCodeFlow, setAuthCodeFlow] = useState<UserAuthAnalyticsFlow>('registration')
  const [authError, setAuthError] = useState('')
  const [authExistingAccount, setAuthExistingAccount] = useState<Pick<Account, 'displayName' | 'surname'> | null>(null)
  const [authBlockedNoticeOpen, setAuthBlockedNoticeOpen] = useState(false)
  const [authPhoneBlockedNotice, setAuthPhoneBlockedNotice] = useState(false)
  const [passwordLoginCaptchaRequired, setPasswordLoginCaptchaRequired] = useState(false)
  const [session, setSession] = useState<Session | null>(() => initialPersistedSession)
  const [sessionRecoveryVersion, setSessionRecoveryVersion] = useState(0)
  const [profileSettingsDraft, setProfileSettingsDraft] = useState<ProfileSettingsDraft | null>(() => {
    const storedSession = initialPersistedSession
    return storedSession ? buildProfileSettingsDraft(storedSession) : null
  })
  const [profileSettingsBusy, setProfileSettingsBusy] = useState(false)
  const [profileSettingsError, setProfileSettingsError] = useState('')
  const [quietSettingsBusy, setQuietSettingsBusy] = useState(false)
  const [quietSettingsError, setQuietSettingsError] = useState('')
  const [confirmProfileSettingsLeaveOpen, setConfirmProfileSettingsLeaveOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [changePasswordBusy, setChangePasswordBusy] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState('')
  const [changePasswordCurrentValue, setChangePasswordCurrentValue] = useState('')
  const [changePasswordNextValue, setChangePasswordNextValue] = useState('')
  const [changePasswordConfirmValue, setChangePasswordConfirmValue] = useState('')
  const [changePasswordCurrentVisible, setChangePasswordCurrentVisible] = useState(false)
  const [changePasswordNextVisible, setChangePasswordNextVisible] = useState(false)
  const [changePasswordConfirmVisible, setChangePasswordConfirmVisible] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState('')
  const [deleteAccountPasswordValue, setDeleteAccountPasswordValue] = useState('')
  const [deleteAccountPasswordVisible, setDeleteAccountPasswordVisible] = useState(false)
  const [deleteAccountDataToo, setDeleteAccountDataToo] = useState(false)
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
  const [directMessageEditTarget, setDirectMessageEditTarget] = useState<EditTarget | null>(null)
  const [groupMessageEditTarget, setGroupMessageEditTarget] = useState<EditTarget | null>(null)
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
  const [channelPostBusy, setChannelPostBusy] = useState(false)
  const [channelPostError, setChannelPostError] = useState('')
  const [channelPostEditTarget, setChannelPostEditTarget] = useState<EditTarget | null>(null)
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
  const [creatingChannelStatusText, setCreatingChannelStatusText] = useState('')
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
  const [creatingGroupDescription, setCreatingGroupDescription] = useState('')
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
  const [groupAvatarPickerDraft, setGroupAvatarPickerDraft] = useState<ChannelAvatarDraft | null>(null)
  const [groupSettingsAvatarDraft, setGroupSettingsAvatarDraft] = useState<ChannelAvatarDraft | null>(null)
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
  const [groupAvatarPickerTarget, setGroupAvatarPickerTarget] = useState<GroupAvatarPickerTarget | null>(
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
  const [channelDetailView, setChannelDetailView] = useState<'main' | 'storage'>('main')
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
  const [pendingExternalLinkUrl, setPendingExternalLinkUrl] = useState<string | null>(null)
  const [discoveryResults, setDiscoveryResults] = useState(initialDiscoveryResults)
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([])
  const [supportUnreadCount, setSupportUnreadCount] = useState(0)
  const [supportTicketCooldownUntil, setSupportTicketCooldownUntil] = useState<string | undefined>(undefined)
  const [supportComposerCooldownUntil, setSupportComposerCooldownUntil] = useState<string | undefined>(undefined)
  const [supportDraft, setSupportDraft] = useState('')
  const [supportAttachmentDraft, setSupportAttachmentDraft] = useState<ComposerAttachmentDraft | undefined>(undefined)
  const [supportBusy, setSupportBusy] = useState(false)
  const [supportError, setSupportError] = useState('')
  const [supportCooldownNow, setSupportCooldownNow] = useState(() => Date.now())
  const [storageItems, setStorageItems] = useState<UserStorageItem[]>([])
  const [storageItemsBusy, setStorageItemsBusy] = useState(false)
  const [storageItemsError, setStorageItemsError] = useState('')
  const [deletingStorageItemId, setDeletingStorageItemId] = useState<string | null>(null)
  const [channelStorageItems, setChannelStorageItems] = useState<UserStorageItem[]>([])
  const [channelStorageItemsBusy, setChannelStorageItemsBusy] = useState(false)
  const [channelStorageItemsError, setChannelStorageItemsError] = useState('')
  const [deletingChannelStorageItemId, setDeletingChannelStorageItemId] = useState<string | null>(null)
  const [threadInbox, setThreadInbox] = useState<ThreadInboxItem[]>([])
  const [liveSearchState, setLiveSearchState] = useState<{
    query: string
    results: SearchResult[]
  } | null>(null)
  const [liveChannelSearchState, setLiveChannelSearchState] = useState<{
    query: string
    results: ChannelSearchResult[]
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
  const [channelDescriptionOpen, setChannelDescriptionOpen] = useState(false)
  const [confirmingLeaveSubscriptionChannelId, setConfirmingLeaveSubscriptionChannelId] = useState<number | null>(null)
  const [channelSubscribersOpen, setChannelSubscribersOpen] = useState(false)
  const [channelSubscribersSearchQuery, setChannelSubscribersSearchQuery] = useState('')
  const [selectedChannelSubscriberIdentifier, setSelectedChannelSubscriberIdentifier] = useState<string | null>(null)
  const [confirmingRemoveChannelSubscriberIdentifier, setConfirmingRemoveChannelSubscriberIdentifier] = useState<string | null>(null)
  const [confirmingBlacklistChannelSubscriberIdentifier, setConfirmingBlacklistChannelSubscriberIdentifier] = useState<string | null>(null)
  const [channelSubscriberActionBusy, setChannelSubscriberActionBusy] = useState(false)
  const [channelSubscriberActionError, setChannelSubscriberActionError] = useState('')
  const [groupParticipantsOpen, setGroupParticipantsOpen] = useState(false)
  const [groupParticipantsSearchQuery, setGroupParticipantsSearchQuery] = useState('')
  const [selectedGroupParticipantIdentifier, setSelectedGroupParticipantIdentifier] = useState<string | null>(null)
  const [confirmingRemoveGroupParticipantIdentifier, setConfirmingRemoveGroupParticipantIdentifier] = useState<string | null>(null)
  const [confirmingBlacklistGroupParticipantIdentifier, setConfirmingBlacklistGroupParticipantIdentifier] = useState<string | null>(null)
  const [groupParticipantActionBusy, setGroupParticipantActionBusy] = useState(false)
  const [groupParticipantActionError, setGroupParticipantActionError] = useState('')
  const [groupActionsAnchor, setGroupActionsAnchor] = useState<ActionAnchor | null>(null)
  const [groupInviteOpen, setGroupInviteOpen] = useState(false)
  const [groupInviteBusy, setGroupInviteBusy] = useState(false)
  const [groupInviteError, setGroupInviteError] = useState('')
  const [groupInviteInlineError, setGroupInviteInlineError] = useState<{ chatId: number; message: string } | null>(null)
  const [groupInviteLimitNoticeOpen, setGroupInviteLimitNoticeOpen] = useState(false)
  const [groupReportNoticeOpen, setGroupReportNoticeOpen] = useState(false)
  const [groupDescriptionOpen, setGroupDescriptionOpen] = useState(false)
  const [threadCommentHintTarget, setThreadCommentHintTarget] = useState<
    | {
        reason: 'archived' | 'disabled'
        target: 'group-message' | 'channel-post'
      }
    | null
  >(null)
  const [messageActionAnchor, setMessageActionAnchor] = useState<ActionAnchor | null>(null)
  const [contactShareOpen, setContactShareOpen] = useState(false)
  const [contactShareBusy, setContactShareBusy] = useState(false)
  const [contactShareError, setContactShareError] = useState('')
  const [contactShareChatIds, setContactShareChatIds] = useState<number[]>([])
  const [contactShareNote, setContactShareNote] = useState('')
  const [contactRequestBusy, setContactRequestBusy] = useState(false)
  const [contactRequestError, setContactRequestError] = useState('')
  const [contactRequestActionBusy, setContactRequestActionBusy] = useState(false)
  const [contactRequestActionError, setContactRequestActionError] = useState('')
  const { cookieConsent, updateCookieConsent } = useCookieConsent()
  const phoneStepCaptchaActive = !session && authStep === 'phone' && Boolean(clientRuntimeConfig.captcha.enabled)
  const passwordStepCaptchaActive =
    !session && authStep === 'password' && passwordLoginCaptchaRequired && Boolean(clientRuntimeConfig.captcha.enabled)
  const {
    captchaBusy,
    captchaContainerRef,
    captchaProvider,
    captchaRequired,
    getCaptchaTokenOrThrow,
    resetCaptcha,
  } = useCaptcha(clientRuntimeConfig.captcha, phoneStepCaptchaActive || passwordStepCaptchaActive)
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
    getDirectMessageUploadProgress,
    getGroupMessageDeliveryIssue,
    getGroupMessageUploadProgress,
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
    setPendingDirectMessageUploadProgress,
    setPendingGroupMessageUploadProgress,
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

  useEffect(() => {
    if (groupSettingsOpen) return

    setGroupSettingsAvatarDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      const draftStillUsedByGroup = groups.some((group) => group.avatarImage === currentDraft.previewUrl)
      if (!draftStillUsedByGroup) {
        releaseChannelAvatarDraft(currentDraft)
      }

      return null
    })
  }, [groupSettingsOpen, groups])
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
    clearThreadEditTarget,
    clearThreadForwarding,
    clearThreadReplyTarget,
    closeThreadCommentActions: closeThreadFlowCommentActions,
    closeThreadView: closeThreadFlowView,
    editThreadComment,
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
    threadEditTarget,
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
    stripRuntimeReloadQueryParam()
  }, [])

  const resetMainSurfaceAfterAuthSuccess = useCallback(() => {
    const nextState = createPostAuthMainSurfaceState()

    setStageView(nextState.stageView)
    setSettingsView(nextState.settingsView)
    setChannelsView(nextState.channelsView)
    setChannelDetailView(nextState.channelDetailView)
    setActiveChannelId(nextState.activeChannelId)
    setBottomSection(nextState.bottomSection)
    setContactsTab(nextState.contactsTab)
    setQuery(nextState.query)
    setActiveFilter(nextState.activeFilter)
    setSearchOpen(nextState.searchOpen)
    setSearchTopFilter(nextState.searchTopFilter)
    setTopListView(nextState.topListView)
    setActiveChatId(nextState.activeChatId)
    setActiveGroupId(nextState.activeGroupId)
    setActiveSubscriptionChannelId(nextState.activeSubscriptionChannelId)
    setPreviewSubscriptionChannel(nextState.previewSubscriptionChannel)
    setPremiumGiftChatId(nextState.premiumGiftChatId)
    setConfirmingLogout(false)
    setMessageActionAnchor(null)
    setThreadCommentHintTarget(null)
    clearThreadEditTarget()
    clearThreadAttachmentDraft()
    resetBlacklistFlow()
    resetRoomMessageActions()
    resetGroupMessageActions()
    resetThreadState()
  }, [
    clearThreadAttachmentDraft,
    clearThreadEditTarget,
    resetBlacklistFlow,
    resetGroupMessageActions,
    resetRoomMessageActions,
    resetThreadState,
  ])

  useEffect(() => {
    let cancelled = false

    void fetchClientRuntimeConfig()
      .then((nextConfig) => {
        if (cancelled) {
          return
        }

        if (nextConfig.release.buildId !== __TINYCHOK_FRONTEND_BUILD_ID__) {
          const reloaded = triggerOneShotRuntimeReload(nextConfig.release.buildId)
          if (!reloaded) {
            console.warn(
              'Tinychok runtime build mismatch persists after a recovery reload attempt',
              {
                frontendBuildId: __TINYCHOK_FRONTEND_BUILD_ID__,
                serverBuildId: nextConfig.release.buildId,
              },
            )
          }
          return
        }

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
      metricaCounterId: clientRuntimeConfig.analytics.metricaCounterId,
      sessionToken: session?.sessionToken ?? null,
    })
  }, [
    clientRuntimeConfig.analytics.enabled,
    clientRuntimeConfig.analytics.flushIntervalMs,
    clientRuntimeConfig.analytics.maxBatchSize,
    clientRuntimeConfig.analytics.metricaCounterId,
    cookieConsent,
    session?.sessionToken,
  ])

  useEffect(() => {
    const pageView = buildAnalyticsVirtualPageView({
      activeChannelId,
      activeChatId,
      activeGroupId,
      activeSubscriptionChannelId,
      authStep,
      channelsView,
      session,
      settingsView,
      stageView,
      topListView,
    })

    const pageViewKey = `${pageView.path}|${pageView.title ?? ''}`
    if (lastAnalyticsPageViewKeyRef.current === pageViewKey) {
      return
    }

    lastAnalyticsPageViewKeyRef.current = pageViewKey
    trackAnalyticsPageView(pageView.path, pageView.title)
  }, [
    activeChannelId,
    activeChatId,
    activeGroupId,
    activeSubscriptionChannelId,
    authStep,
    channelsView,
    clientRuntimeConfig.analytics.metricaCounterId,
    cookieConsent,
    session,
    settingsView,
    stageView,
    topListView,
  ])

  useEffect(() => {
    if (!session?.sessionToken) {
      lastAnalyticsAppOpenedSessionTokenRef.current = null
      return
    }

    if (!documentVisible || cookieConsent !== 'analytics' || !clientRuntimeConfig.analytics.enabled) {
      return
    }

    const pageView = buildAnalyticsVirtualPageView({
      activeChannelId,
      activeChatId,
      activeGroupId,
      activeSubscriptionChannelId,
      authStep,
      channelsView,
      session,
      settingsView,
      stageView,
      topListView,
    })

    if (pageView.path.startsWith('/auth/')) {
      return
    }

    if (lastAnalyticsAppOpenedSessionTokenRef.current === session.sessionToken) {
      return
    }

    lastAnalyticsAppOpenedSessionTokenRef.current = session.sessionToken
    trackAnalyticsEvent('app_opened', {
      deviceType: isMobileBrowserEnvironment() ? 'mobile' : 'desktop',
      path: pageView.path,
      surface: getAnalyticsAppSurface(pageView.path),
    })
  }, [
    activeChannelId,
    activeChatId,
    activeGroupId,
    activeSubscriptionChannelId,
    authStep,
    channelsView,
    clientRuntimeConfig.analytics.enabled,
    cookieConsent,
    documentVisible,
    session,
    settingsView,
    stageView,
    topListView,
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
    closeGroupParticipantsDialog()
    setGroupActionsAnchor(null)
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteLimitNoticeOpen(false)
    setGroupReportNoticeOpen(false)
    setThreadCommentHintTarget(null)
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
    setThreadCommentHintTarget(null)
    setConfirmingLeaveSubscriptionChannelId(null)
    if (threadTargetKind === 'channel') {
      resetThreadState()
      resetBlacklistFlow()
    }
  }, [activeSubscriptionChannelId, previewSubscriptionChannel, resetBlacklistFlow, resetThreadState, threadTargetKind])

  useEffect(() => {
    if (activeChatId !== null) return

    setContactShareOpen(false)
    setContactShareBusy(false)
    setContactShareError('')
    setContactShareChatIds([])
    setContactShareNote('')
  }, [activeChatId])

  useEffect(() => {
    setContactRequestBusy(false)
    setContactRequestError('')
    setContactRequestActionBusy(false)
    setContactRequestActionError('')
  }, [activeChatId])

  const blockedContactIds = session?.blockedContactIds ?? []
  const availableChats = dedupeChatsByNormalizedPhone(
    sortChatsByRecentActivity(
      chats.filter((chat) => !blockedContactIds.includes(chat.id) && !chat.archivedAccount && !chat.hidden),
    ),
  )
  const creatableGroupChats = availableChats.filter(
    (chat) =>
      (chat.contactState ?? 'accepted') === 'accepted' &&
      normalizeIdentifier(chat.phone) !== normalizeIdentifier(session?.identifier ?? ''),
  )
  const blockedChats = dedupeChatsByNormalizedPhone(
    sortChatsByRecentActivity(
      chats.filter((chat) => blockedContactIds.includes(chat.id) && !chat.archivedAccount && !chat.hidden),
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
    if (bottomSection === 'contacts') {
      return (chat.contactState ?? 'accepted') === 'accepted'
    }
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
  const searchShowsContacts = searchTopFilter !== 'channels'
  const searchShowsChannels = searchTopFilter !== 'contacts'

  const activeChat =
    activeChatId === null ? null : chats.find((chat) => chat.id === activeChatId) ?? null
  const activeChatAdminBlockNotice = activeChat?.blockedByAdmin
    ? 'Пользователь заблокирован по решению администрации сервиса, обратитесь в поддержку, если возникла ошибка.'
    : null
  const activeChatContactState = activeChat?.contactState ?? 'accepted'
  const activeChatPendingOutgoingMessageTone: 'danger' | 'friendly' = contactRequestActionError
    ? 'danger'
    : 'friendly'
  const activeChatComposerGate =
    activeChatAdminBlockNotice
      ? {
          kind: 'disabled' as const,
          message: activeChatAdminBlockNotice,
        }
      : activeChatContactState === 'accepted'
        ? null
        : activeChatContactState === 'none'
          ? {
              actionLabel: contactRequestBusy ? 'Отправляем...' : 'Отправить запрос на контакт',
              busy: contactRequestBusy,
              kind: 'action' as const,
              message: contactRequestError,
              tone: 'primary' as const,
            }
          : activeChatContactState === 'pending-outgoing'
            ? {
                actionLabel: contactRequestActionBusy ? 'Отменяем...' : 'Отменить заявку',
                busy: contactRequestActionBusy,
                kind: 'action' as const,
                message:
                  contactRequestActionError || (
                    <span className="composer-disabled-note-friendly-content">
                      <span>Заявка на контакт отправлена</span>
                      <img src="/icons/man-raising-hand.png" alt="" aria-hidden="true" />
                    </span>
                  ),
                messageTone: activeChatPendingOutgoingMessageTone,
                tone: 'neutral' as const,
              }
            : activeChatContactState === 'blocked-by-peer'
              ? {
                  kind: 'status' as const,
                  message: 'Пользователь заблокировал контакт с вами',
                }
              : activeChatContactState === 'blocked-by-me'
                ? {
                    kind: 'status' as const,
                    message: 'Вы заблокировали этот контакт',
                  }
                : {
                    actionError: contactRequestActionError,
                    busy: contactRequestActionBusy,
                    kind: 'incoming-request' as const,
                    message: 'Пользователь хочет выйти на связь. Посмотрите историю комнаты и примите решение.',
                  }
  const contactShareTargets = activeChat
    ? availableChats.filter((chat) => chat.id !== activeChat.id)
    : []
  const selectedContactShareChats = contactShareTargets.filter((chat) => contactShareChatIds.includes(chat.id))
  const canShareActiveContact = Boolean(activeChat) && selectedContactShareChats.length > 0
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
  const isPreviewSubscriptionChannel = previewSubscriptionChannel !== null
  const currentSubscriptionChannelArchived = Boolean(currentSubscriptionChannel?.archivedAt)
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
  const actionableSubscriptionChannel = isPreviewSubscriptionChannel ? null : activeSubscriptionChannel
  const currentSubscriptionChannelStatusText =
    currentSubscriptionChannel?.statusText?.trim() ||
    ownedCurrentManagedChannel?.statusText?.trim() ||
    ''
  const currentSubscriptionChannelDescriptionText =
    currentSubscriptionChannel?.description?.trim() ||
    ownedCurrentManagedChannel?.description?.trim() ||
    ''
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
  const currentSubscriptionChannelCreatorIdentifier = normalizeIdentifier(
    currentSubscriptionChannel?.creatorIdentifier ??
      (isCurrentSubscriptionChannelOwner ? session?.identifier ?? '' : ''),
  )
  const currentSubscriptionChannelCreatorChat =
    currentSubscriptionChannelCreatorIdentifier && currentSubscriptionChannelCreatorIdentifier !== session?.identifier
      ? chats.find(
          (chat) => normalizeIdentifier(chat.phone) === currentSubscriptionChannelCreatorIdentifier,
        ) ?? null
      : null
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
  const activeGroupOwnerIdentifier = normalizeIdentifier(
    persistedActiveGroup?.groupOwnerIdentifier ?? persistedActiveGroup?.creatorIdentifier ?? '',
  )
  const activeGroup = useMemo(() => (
    persistedActiveGroup
      ? {
          ...persistedActiveGroup,
          participants: hydrateGroupParticipants(persistedActiveGroup, chats),
        }
      : null
  ), [chats, persistedActiveGroup])
  const activeGroupArchived = Boolean(activeGroup?.archivedAt)
  const activeGroupDescriptionText = activeGroup?.description?.trim() || ''
  const isActiveGroupCreator =
    activeGroup !== null &&
    session !== null &&
    normalizeIdentifier(
      activeGroup.groupOwnerIdentifier ?? activeGroup.creatorIdentifier ?? session.identifier,
    ) === session.identifier
  const activeGroupCreatorParticipant =
    activeGroup?.participants.find(
      (participant) =>
        normalizeIdentifier(participant.identifier ?? '') ===
        normalizeIdentifier(activeGroup.groupOwnerIdentifier ?? activeGroup.creatorIdentifier ?? ''),
    ) ?? null
  const activeGroupCreatorChat =
    activeGroupOwnerIdentifier
      ? chats.find(
          (chat) =>
            normalizeIdentifier(chat.phone) === activeGroupOwnerIdentifier,
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
  const activeGroupParticipantIdentifiers = useMemo(() => {
    if (!activeGroup) return new Set<string>()

    return new Set(
      activeGroup.participants
        .map((participant) => normalizeIdentifier(participant.identifier ?? ''))
        .filter((identifier) => identifier.length > 0),
    )
  }, [activeGroup])
  const groupMentionCandidates = useMemo(
    () => buildComposerMentionCandidates(activeGroup?.participants ?? []),
    [activeGroup],
  )
  const filteredActiveGroupParticipants = (activeGroup?.participants ?? [])
    .filter((participant) => {
      const searchQuery = groupParticipantsSearchQuery.trim()
      if (!searchQuery) return true

      return (
        matchesExactSearchCandidate(participant.title, searchQuery) ||
        matchesExactSearchCandidate(participant.nickname ? `@${participant.nickname}` : '', searchQuery) ||
        matchesExactSearchCandidate(participant.identifier, searchQuery)
      )
    })
    .sort((left, right) => {
      const leftIdentifier = normalizeIdentifier(left.identifier ?? '')
      const rightIdentifier = normalizeIdentifier(right.identifier ?? '')

      if (leftIdentifier === activeGroupOwnerIdentifier && rightIdentifier !== activeGroupOwnerIdentifier) {
        return -1
      }
      if (rightIdentifier === activeGroupOwnerIdentifier && leftIdentifier !== activeGroupOwnerIdentifier) {
        return 1
      }
      return left.title.localeCompare(right.title, 'ru')
    })
  const selectedActiveGroupParticipant =
    selectedGroupParticipantIdentifier === null
      ? null
      : activeGroup?.participants.find(
          (participant) =>
            normalizeIdentifier(participant.identifier ?? '') === selectedGroupParticipantIdentifier,
        ) ?? null
  const selectedActiveGroupParticipantBlacklisted = Boolean(
    selectedActiveGroupParticipant &&
      activeGroup &&
      isRoomCommentsBlacklisted(
        activeGroup,
        normalizeIdentifier(selectedActiveGroupParticipant.identifier ?? ''),
      ),
  )
  const inviteableGroupChats = useMemo(
    () =>
      activeGroup
        ? creatableGroupChats.map((chat) => ({
            alreadyMember: activeGroupParticipantIdentifiers.has(normalizeIdentifier(chat.phone)),
            chat,
          }))
        : [],
    [activeGroup, activeGroupParticipantIdentifiers, creatableGroupChats],
  )
  const transferableGroupParticipants = activeGroup
    ? activeGroup.participants.filter(
          (participant) =>
            normalizeIdentifier(participant.identifier ?? '') !==
          normalizeIdentifier(activeGroup.groupOwnerIdentifier ?? activeGroup.creatorIdentifier ?? ''),
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

    return matchingChat ? buildGroupParticipantFromChat(matchingChat) : null
  }

  function renderThreadAuthorNode(
    participant: GroupParticipant | null,
    fallbackTitle?: string | null,
  ) {
    if (participant) {
      return (
        <div className="bubble-sender">
          <span className="bubble-sender-avatar-stack">
            <span className="avatar bubble-sender-avatar" style={{ backgroundColor: participant.accent }}>
              {renderAccountAvatarContent(participant.title, participant.archivedAccount)}
            </span>
            {participant.online ? (
              <span className="bubble-sender-presence-dot" aria-label="В сети" />
            ) : null}
          </span>
          <span className="bubble-sender-name">{participant.title}</span>
          {shouldShowPremiumCrown(participant) ? (
            <span className="premium-crown bubble-sender-crown" aria-label="Премиум">
              <img src="/icons/crown64.png" alt="" />
            </span>
          ) : null}
        </div>
      )
    }

    if (!fallbackTitle) return null
    return <span className="bubble-meta">{fallbackTitle}</span>
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

  function handleSupportComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      supportBusy ||
      supportCooldownActive ||
      (!supportAttachmentDraft && !supportDraft.trim()) ||
      (supportAttachmentDraft ? supportAttachmentDraft.status !== 'ready' : false)
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
    void sendSupportMessage()
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
        : threadTarget?.kind === 'support'
          ? null
          : null
  const subscriptionMenuFallbackHeight =
    currentSubscriptionChannel?.visibility === 'closed' ? channelBlockedMenuHeight : channelActionMenuHeight
  const resolvedChannelActionsMenuHeight =
    (currentSubscriptionChannelArchived ? channelBlockedMenuHeight : channelActionMenuHeight) + 54
  const { menuRef: subscriptionPostMenuRef, style: subscriptionPostMenuStyle } = useAnchoredMenu(
    subscriptionPostActionAnchor,
    channelActionMenuWidth,
    subscriptionMenuFallbackHeight,
  )

  const { menuRef: channelActionsMenuRef, style: channelActionsMenuStyle } = useAnchoredMenu(
    channelActionsAnchor,
    channelActionMenuWidth,
    resolvedChannelActionsMenuHeight,
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
  const appNavigationRoute = useMemo<AppNavigationRoute>(() => ({
    activeChannelId,
    activeChatId,
    activeFilter,
    activeGroupId,
    activeSubscriptionChannelId,
    bottomSection,
    channelDetailView,
    channelsView,
    contactsTab,
    premiumGiftChatId,
    previewSubscriptionChannel,
    query,
    searchOpen,
    searchTopFilter,
    settingsView,
    stageView,
    threadTarget,
    topListView,
  }), [
    activeChannelId,
    activeChatId,
    activeFilter,
    activeGroupId,
    activeSubscriptionChannelId,
    bottomSection,
    channelDetailView,
    channelsView,
    contactsTab,
    premiumGiftChatId,
    previewSubscriptionChannel,
    query,
    searchOpen,
    searchTopFilter,
    settingsView,
    stageView,
    threadTarget,
    topListView,
  ])
  const appNavigationRouteEntryKey = useMemo(
    () => getAppNavigationRouteEntryKey(appNavigationRoute),
    [appNavigationRoute],
  )
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
    historyMutation: directHistoryMutation,
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
    historyMutation: groupHistoryMutation,
    removeVisibleItemById: removeVisibleGroupMessageById,
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
    historyMutation: channelHistoryMutation,
    removeVisibleItemById: removeVisibleChannelPostById,
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
  const activeRoomFeedKey = threadTarget
    ? threadTarget.kind === 'group'
      ? `thread:group:${threadTarget.groupId}:${threadTarget.messageId}`
      : threadTarget.kind === 'channel'
        ? `thread:channel:${threadTarget.channelId}:${threadTarget.postId}`
        : `thread:support:${threadTarget.ticketId}`
    : isChatOpen && activeChat
      ? `direct:${activeChat.id}`
      : isGroupOpen && activeGroup
        ? `group:${activeGroup.id}`
        : isSubscriptionChannelOpen && currentSubscriptionChannel
          ? `channel:${currentSubscriptionChannel.id}`
          : null
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
  const confirmingDeleteMessage =
    confirmingDeleteMessageId === null
      ? null
      : visibleDirectMessages.find((message) => message.id === confirmingDeleteMessageId) ??
        activeChat?.messages.find((message) => message.id === confirmingDeleteMessageId) ??
        null
  const canDeleteConfirmedMessageForEveryone = confirmingDeleteMessage?.author === 'me'
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
  const activeGroupMessagePreviousMessage = resolvePreviousVisibleItem(
    visibleGroupMessages,
    activeGroupMessageId,
    { sameDayOnly: true },
  )
  const shouldRenderActiveGroupMessageAuthorStrip = shouldRenderIncomingAuthorStrip(
    activeGroupMessage,
    activeGroupMessagePreviousMessage,
  )
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
  const activeSupportTicket =
    threadTarget?.kind === 'support'
      ? supportTickets.find((ticket) => ticket.id === threadTarget.ticketId) ?? null
      : null
  const buildThreadOpenAnalyticsPayload = useCallback((target: ThreadTarget) => {
    const sourceMessage =
      target.kind === 'group'
        ? groups
            .find((group) => group.id === target.groupId)
            ?.messages.find((message) => message.id === target.messageId) ?? null
        : target.kind === 'channel'
          ? subscriptionChannels
              .find((channel) => channel.id === target.channelId)
              ?.posts.find((post) => post.id === target.postId) ?? null
          : supportTickets.find((ticket) => ticket.id === target.ticketId) ?? null

    return {
      attachmentKind: getAnalyticsAttachmentKind(sourceMessage?.attachment),
      hasAttachment: Boolean(sourceMessage?.attachment),
      hasReply: Boolean(sourceMessage?.replyTo),
      presentation: getAnalyticsAttachmentPresentation(sourceMessage?.attachment),
      roomKind: target.kind,
    }
  }, [groups, subscriptionChannels, supportTickets])

  const openTrackedThread = useCallback((target: ThreadTarget) => {
    trackAnalyticsEvent('thread_opened', buildThreadOpenAnalyticsPayload(target))
    openThread(target)
  }, [buildThreadOpenAnalyticsPayload, openThread])

  const activeThreadComments =
    threadTarget?.kind === 'group'
      ? threadGroupMessage?.threadComments ?? []
      : threadTarget?.kind === 'channel'
        ? threadChannelPost?.threadComments ?? []
        : activeSupportTicket?.comments ?? []
  const activeThreadMentionCandidates = useMemo(() => {
    if (!threadTarget || threadTarget.kind === 'support') {
      return []
    }

    return buildThreadMentionCandidates(
      threadTarget.kind === 'group'
        ? activeGroup?.participants ?? []
        : currentSubscriptionChannel?.participants ?? [],
      activeThreadComments,
      resolveThreadCommentParticipant,
    )
  }, [activeGroup, activeThreadComments, currentSubscriptionChannel, resolveThreadCommentParticipant, threadTarget])
  const activeThreadCommentCount = activeThreadComments.length
  const activeThreadCommentLabel =
    activeThreadCommentCount % 10 === 1 && activeThreadCommentCount % 100 !== 11
      ? 'комментарий'
      : activeThreadCommentCount % 10 >= 2 &&
          activeThreadCommentCount % 10 <= 4 &&
          (activeThreadCommentCount % 100 < 12 || activeThreadCommentCount % 100 > 14)
        ? 'комментария'
        : 'комментариев'
  const activeRoomFeedTimeline = threadTarget
    ? activeThreadComments
    : isChatOpen
      ? visibleDirectMessages
      : isGroupOpen
        ? visibleGroupMessages
        : isSubscriptionChannelOpen
          ? visibleSubscriptionPosts
          : []
  const activeRoomFeedSignature = buildRoomFeedSignature(activeRoomFeedTimeline)
  const activeRoomHistoryMutation = threadTarget
    ? { kind: 'idle' as const, roomKey: null, seq: 0 }
    : isChatOpen
      ? directHistoryMutation
      : isGroupOpen
        ? groupHistoryMutation
        : isSubscriptionChannelOpen
          ? channelHistoryMutation
          : { kind: 'idle' as const, roomKey: null, seq: 0 }
  const activeThreadComment =
    threadCommentActionId === null
      ? null
      : activeThreadComments.find((comment) => comment.id === threadCommentActionId) ?? null
  const activeThreadCommentPreviousComment = resolvePreviousVisibleItem(
    activeThreadComments,
    threadCommentActionId,
  )
  const shouldRenderActiveThreadCommentAuthorStrip = shouldRenderIncomingAuthorStrip(
    activeThreadComment,
    activeThreadCommentPreviousComment,
  )
  const activeThreadCommentParticipant = resolveThreadCommentParticipant(activeThreadComment)
  const activeThreadCommentDialogAction = resolveParticipantDialogAction(activeThreadCommentParticipant)
  const activeThreadCommentAlreadyBlacklisted =
    activeThreadCommentParticipant?.identifier && threadTarget
      ? threadTarget.kind === 'group'
        ? activeGroup
          ? isRoomCommentsBlacklisted(activeGroup, activeThreadCommentParticipant.identifier)
          : false
        : threadTarget.kind === 'channel' && currentSubscriptionChannel
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
  const activeGroupMessageDialogAction = resolveParticipantDialogAction(activeGroupMessageParticipant)

  useLayoutEffect(() => {
    const messageFeed = messageFeedRef.current

    if (!messageFeed) {
      return
    }

    const syncSelectedBubbleScroll = (selector: string, anchor: typeof messageActionAnchor) => {
      if (!anchor) {
        return
      }

      const anchorElement = messageFeed.querySelector<HTMLElement>(selector)

      if (!anchorElement) {
        return
      }

      syncActionAnchorScroll(anchorElement, anchor)
    }

    if (messageActionAnchor && activeMessage) {
      syncSelectedBubbleScroll(`[data-direct-message-id="${activeMessage.id}"]`, messageActionAnchor)
    }

    if (groupMessageActionAnchor && activeGroupMessage && !forwardingGroupMessageText) {
      syncSelectedBubbleScroll(`[data-group-message-id="${activeGroupMessage.id}"]`, groupMessageActionAnchor)
    }

    if (subscriptionPostActionAnchor && activeSubscriptionPost && !forwardingSubscriptionPostText) {
      syncSelectedBubbleScroll(
        `[data-channel-post-id="${activeSubscriptionPost.id}"]`,
        subscriptionPostActionAnchor,
      )
    }

    if (threadCommentActionAnchor && activeThreadComment && !forwardingThreadCommentText) {
      syncSelectedBubbleScroll(`[data-thread-comment-id="${activeThreadComment.id}"]`, threadCommentActionAnchor)
    }
  }, [
    activeGroupMessage,
    activeMessage,
    activeSubscriptionPost,
    activeThreadComment,
    forwardingGroupMessageText,
    forwardingSubscriptionPostText,
    forwardingThreadCommentText,
    groupMessageActionAnchor,
    messageActionAnchor,
    subscriptionPostActionAnchor,
    threadCommentActionAnchor,
  ])

  const activeThreadSourceLabel =
    threadTarget?.kind === 'group'
      ? activeGroup?.title ?? 'Группа'
      : threadTarget?.kind === 'channel'
        ? currentSubscriptionChannel?.title ?? 'Канал'
        : activeSupportTicket
          ? `Тикет #${activeSupportTicket.id}`
          : 'Поддержка'
  const activeThreadId =
    threadTarget?.kind === 'group'
      ? threadGroupMessage?.threadId
      : threadTarget?.kind === 'channel'
        ? threadChannelPost?.threadId
        : activeSupportTicket?.threadId
  const activeThreadInboxItem = activeThreadId
    ? threadInbox.find((item) => item.threadId === activeThreadId) ?? null
    : null
  const activeThreadServerUnreadCount =
    activeThreadInboxItem?.unreadCount ??
    (threadTarget?.kind === 'support' ? activeSupportTicket?.unreadCount ?? 0 : 0)
  const activeThreadLatestActivityAt =
    activeThreadInboxItem?.latestActivityAt ??
    (threadTarget?.kind === 'group'
      ? threadGroupMessage?.threadComments?.at(-1)?.createdAt ?? threadGroupMessage?.createdAt
      : threadTarget?.kind === 'channel'
        ? threadChannelPost?.threadComments?.at(-1)?.createdAt ?? threadChannelPost?.createdAt
        : activeSupportTicket?.comments.at(-1)?.createdAt ?? activeSupportTicket?.updatedAt)
  const activeThreadSubscribed = activeThreadInboxItem !== null
  const activeVisibleThreadId =
    threadTarget && documentVisible && activeThreadId ? activeThreadId : null
  const visibleThreadInbox = activeVisibleThreadId
    ? threadInbox.map((item) =>
        item.threadId === activeVisibleThreadId
          ? {
              ...item,
              unreadCount: 0,
            }
          : item,
      )
    : threadInbox

  useEffect(() => {
    if (!threadTarget) return

    if (threadTarget.kind === 'group' && !hasUsableThreadRoot(threadGroupMessage)) {
      resetThreadState()
      return
    }

    if (threadTarget.kind === 'channel' && !hasUsableThreadRoot(threadChannelPost)) {
      resetThreadState()
    }
  }, [
    resetThreadState,
    threadChannelPost,
    threadGroupMessage,
    threadTarget,
  ])

  const activeRoomReadTarget: ActiveRoomReadTarget | null = threadTarget
    ? null
    : isChatOpen && activeChat
      ? {
          id: activeChat.id,
          kind: 'chat',
          unread: activeChat.unread,
        }
      : isGroupOpen && activeGroup
        ? {
            id: activeGroup.id,
            kind: 'group',
            unread: activeGroup.unread,
          }
        : isSubscriptionChannelOpen && !isPreviewSubscriptionChannel && currentSubscriptionChannel
          ? {
              id: currentSubscriptionChannel.id,
              kind: 'channel',
              unread: currentSubscriptionChannel.unread,
            }
          : null
  const threadSourceText =
    activeThreadInboxItem?.kind === 'group' && threadTarget?.kind === 'group'
      ? activeThreadInboxItem.sourceText
      : activeThreadInboxItem?.kind === 'channel' && threadTarget?.kind === 'channel'
        ? activeThreadInboxItem.sourceText
        : threadTarget?.kind === 'group'
          ? threadGroupMessage?.text ?? ''
          : threadTarget?.kind === 'channel'
            ? threadChannelPost?.text ?? ''
            : activeSupportTicket?.text ?? ''
  const threadSourceTime =
    threadTarget?.kind === 'group'
      ? formatMessageTimeLabel(
          threadGroupMessage?.createdAt,
          activeThreadInboxItem?.kind === 'group'
            ? activeThreadInboxItem.sourceTime
            : threadGroupMessage?.time ?? '',
        )
      : threadTarget?.kind === 'channel'
        ? formatMessageTimeLabel(
            threadChannelPost?.createdAt,
            activeThreadInboxItem?.kind === 'channel'
              ? activeThreadInboxItem.sourceTime
              : threadChannelPost?.time ?? '',
          )
        : formatMessageTimeLabel(activeSupportTicket?.createdAt, activeSupportTicket?.time ?? '')
  const visibleRetainedSubscriptionChannelId =
    isChannelsTopListOpen &&
    stageView === 'main' &&
    !searchOpen &&
    activeSubscriptionChannelId === retainedSubscriptionChannelId
      ? retainedSubscriptionChannelId
      : null
  const searchShowsPhone = isPhoneQuery(query)
  const browserNotificationsSupported = browserNotificationStatus !== 'unsupported'
  const mobileBrowserNotificationsEnabledByDefault =
    Boolean(session) && isMobileBrowserEnvironment() && browserNotificationsEnabled
  const shouldAutoRequestBrowserNotificationsOnMobile =
    mobileBrowserNotificationsEnabledByDefault &&
    browserNotificationsSupported &&
    browserNotificationStatus === 'default'
  const showBrowserNotificationsBanner =
    browserNotificationsSupported &&
    browserNotificationsEnabled &&
    !mobileBrowserNotificationsEnabledByDefault &&
    browserNotificationStatus !== 'granted' &&
    !browserNotificationsBannerDismissed &&
    !searchOpen &&
    topListView === 'none' &&
    bottomSection === 'chats'
  const browserNotificationBannerBody =
    browserNotificationStatus === 'denied'
      ? 'Разрешение сейчас запрещено браузером. Откройте настройки сайта и включите уведомления.'
      : 'Включите уведомления в браузере, чтобы быть в курсе новых сообщений.'
  const browserNotificationsDisabled = !browserNotificationsEnabled
  const browserNotificationsToggleDisabled = browserNotificationStatus === 'unsupported'
  const totalUnreadCount = availableChats.reduce((sum, chat) => sum + chat.unread, 0)
  // Contacts keep two pending-request buckets, but the bottom-nav badge intentionally
  // reflects only incoming requests. Outgoing pending items are a Contacts-local counter.
  const incomingContactRequestCount = contactRequests.length
  const outgoingContactRequestCount = outgoingContactRequests.length
  const totalFavoriteUnreadCount = availableChats.reduce(
    (sum, chat) => sum + (chat.pinned ? chat.unread : 0),
    0,
  )
  const sessionHasPremium = hasActivePremium(session?.premium, session?.premiumExpiresAt)
  // The support composer uses its own cooldown source first because this scene must keep showing
  // the waiting state immediately after ticket creation. Do not collapse this back to the server
  // snapshot field only, or the UI can briefly fall back to the form and leak the raw backend error.
  const effectiveSupportTicketCooldownUntil =
    supportComposerCooldownUntil ??
    supportTicketCooldownUntil ??
    resolveSupportCooldownUntilFromTickets(supportTickets, supportCooldownNow)
  const supportCooldownRemainingMs = effectiveSupportTicketCooldownUntil
    ? Math.max(0, Date.parse(effectiveSupportTicketCooldownUntil) - supportCooldownNow)
    : 0
  const supportCooldownActive = supportCooldownRemainingMs > 0
  const storedQuietModeSettings = useMemo(
    () => normalizeQuietModeSettings(session?.quietModeSettings),
    [session?.quietModeSettings],
  )
  // Quiet settings contract:
  // category checkboxes only control the visual notification layer. Unread keeps accumulating,
  // but badges/browser notifications are suppressed per-category while `Тихо` is active.
  const effectiveQuietModeSettings = useMemo(
    () => getEffectiveQuietModeSettings(session?.quietModeSettings, sessionHasPremium),
    [session?.quietModeSettings, sessionHasPremium],
  )
  const quietDialogsSuppressed = isQuietCategorySuppressed(
    quietMode,
    effectiveQuietModeSettings,
    'dialogs',
  )
  const quietChannelsSuppressed = isQuietCategorySuppressed(
    quietMode,
    effectiveQuietModeSettings,
    'channels',
  )
  const quietGroupsSuppressed = isQuietCategorySuppressed(
    quietMode,
    effectiveQuietModeSettings,
    'groups',
  )
  const quietThreadsSuppressed = isQuietCategorySuppressed(
    quietMode,
    effectiveQuietModeSettings,
    'threads',
  )
  const quietContactRequestsSuppressed = isQuietCategorySuppressed(
    quietMode,
    effectiveQuietModeSettings,
    'contactRequests',
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
  const activeContactIdentifier =
    bottomSection === 'contacts' ? normalizeIdentifier(activeChat?.phone ?? '') : ''
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
  const fallbackChannelSearchResults = orderedSubscriptionChannels
    .filter((channel) => {
      if (trimmedSearchQuery === '') return false

      return (
        matchesQuery(channel.title, trimmedSearchQuery) ||
        matchesQuery(channel.handle, trimmedSearchQuery) ||
        matchesQuery(channel.statusText ?? '', trimmedSearchQuery) ||
        matchesQuery(channel.description ?? '', trimmedSearchQuery)
      )
    })
    .map((channel) => ({
      accent: channel.accent,
      archivedAt: channel.archivedAt,
      avatarImage: channel.avatarImage,
      description: channel.description,
      handle: channel.handle,
      id: channel.id,
      muted: channel.muted,
      statusText: channel.statusText,
      title: channel.title,
      unread: channel.unread,
      visibility: channel.visibility,
    }))
  const liveChannelSearchResults =
    searchOpen &&
    topListView === 'none' &&
    trimmedSearchQuery !== '' &&
    liveChannelSearchState?.query === trimmedSearchQuery
      ? liveChannelSearchState.results
      : null
  // Search channels must not depend only on current local subscriptions:
  // after self-unsubscribe the channel should still be discoverable through backend preview search.
  // At the same time, backend misses or legacy-record quirks must not blank out locally known
  // channels, otherwise freshly created/legacy channels disappear from the search surface.
  const channelSearchResults = (() => {
    if (!liveChannelSearchResults) {
      return fallbackChannelSearchResults
    }

    const deduped = new Map<string, ChannelSearchResult>()
    const makeKey = (channel: ChannelSearchResult) =>
      sanitizeChannelDirectLink(channel.handle) || `channel:${channel.id}`

    for (const channel of liveChannelSearchResults) {
      deduped.set(makeKey(channel), channel)
    }

    for (const channel of fallbackChannelSearchResults) {
      const key = makeKey(channel)
      if (!deduped.has(key)) {
        deduped.set(key, channel)
      }
    }

    return Array.from(deduped.values())
  })()
  const hasVisibleSearchResults =
    (searchShowsContacts && (myContactsResults.length > 0 || searchResults.length > 0)) ||
    (searchShowsChannels && channelSearchResults.length > 0)
  const sortedGroups = sortGroupsByRecentActivity(groups)
  const orderedGroups = sortByUnreadEnabled
    ? moveUnreadItemsFirst(sortedGroups, visibleRetainedGroupId)
    : sortedGroups
  const orderedThreadInbox = [...visibleThreadInbox].sort((left, right) => {
    if (!sortByUnreadEnabled || activeVisibleThreadId) {
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
  const formatThreadInboxTitle = (item: ThreadInboxItem) => {
    const sourceText = item.sourceText.trim()
    if (sourceText) {
      return sourceText
    }

    return item.kind === 'group' ? item.groupTitle : item.channelTitle
  }
  const formatThreadInboxActivityLabel = (item: ThreadInboxItem) =>
    item.commentCount > 0 ? formatThreadCommentCountLabel(item.commentCount) : 'Подписка на комментарии'
  const resolveThreadInboxAvatarImage = (item: ThreadInboxItem) => {
    if (item.kind === 'group') {
      return groups.find((group) => group.id === item.groupId)?.avatarImage ?? item.avatarImage
    }

    return subscriptionChannels.find((channel) => channel.id === item.channelId)?.avatarImage ?? item.avatarImage
  }
  const formatThreadInboxPreviewText = (item: ThreadInboxItem) => {
    const latestCommentText = item.latestCommentText.trim()
    if (!latestCommentText) {
      return item.commentCount > 0 ? 'Пока без комментариев' : 'Подписка на комментарии'
    }

    return latestCommentText
  }
  const resolveThreadInboxPreviewAuthor = (item: ThreadInboxItem) => {
    const title = item.latestCommentAuthor?.trim()
    if (!title || item.latestCommentText.trim().length === 0) {
      return null
    }

    return {
      accent: item.latestCommentAuthorAccent ?? THREAD_PREVIEW_AUTHOR_FALLBACK_ACCENT,
      avatarImage: item.latestCommentAuthorAvatarImage,
      title,
    }
  }
  const totalChannelNotifications = subscriptionChannels.reduce((sum, channel) => sum + channel.unread, 0)
  const totalGroupNotifications = groups.reduce((sum, group) => sum + group.unread, 0)
  const totalThreadNotifications = visibleThreadInbox.reduce((sum, item) => sum + item.unreadCount, 0)
  const quietSettingsToggleValues = sessionHasPremium
    ? storedQuietModeSettings
    : nonPremiumQuietModeSettings
  const invisibilityPreferenceEnabled = Boolean(session?.invisibilityEnabled ?? session?.quietModeEnabled)
  const invisibilityAutoEnabled = Boolean(session?.invisibilityAutoEnabled)
  const invisibilityModeActive = sessionHasPremium && invisibilityPreferenceEnabled
  const invisibilityToggleChecked = sessionHasPremium && invisibilityPreferenceEnabled
  const invisibilitySettingsDescription = !sessionHasPremium
    ? 'Доступно только с премиумом.'
    : invisibilityModeActive
      ? 'Скрывает онлайн и прочтение сообщений для других пользователей.'
      : 'Можно включить отдельно или автоматически через кнопку «Тихо».'
  // Self-presence invariant:
  // own headers always show presence, but active invisible mode flips it into a visible-to-self ring.
  // Do not mirror this condition into chat/contact presence lists; those must stay server-authoritative.
  const selfPresenceIndicatorMode =
    session
      ? invisibilityModeActive
        ? 'invisible'
        : 'online'
      : null
  const activeRoomReadSyncRoomKeyRef = useRef<string | null>(null)
  const activeThreadReadSyncKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const syncDocumentVisibility = () => {
      setDocumentVisible(document.visibilityState === 'visible')
    }

    syncDocumentVisibility()
    document.addEventListener('visibilitychange', syncDocumentVisibility)

    return () => {
      document.removeEventListener('visibilitychange', syncDocumentVisibility)
    }
  }, [])

  useEffect(() => {
    const previousStageView = previousStageViewRef.current
    previousStageViewRef.current = stageView

    if (stageView !== 'premium' || previousStageView === 'premium') {
      return
    }

    trackAnalyticsEvent('premium_screen_opened', {
      gift: Boolean(premiumGiftChatId),
      hasPremium: sessionHasPremium,
    })
  }, [premiumGiftChatId, sessionHasPremium, stageView])

  const openPremiumUpsell = useCallback(() => {
    setStageView('premium')
  }, [])

  function requestOpenExternalLink(url: string) {
    const normalizedUrl = url.trim()
    if (!/^https?:\/\//iu.test(normalizedUrl)) return
    setPendingExternalLinkUrl(normalizedUrl)
  }

  function closeExternalLinkWarning() {
    setPendingExternalLinkUrl(null)
  }

  function confirmOpenExternalLink() {
    if (!pendingExternalLinkUrl) return
    const url = pendingExternalLinkUrl
    setPendingExternalLinkUrl(null)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function getGroupCreationLimitError(limit: number) {
    return limit === premiumGroupsPerUserLimit
      ? `Даже с премиумом можно создать не больше ${premiumGroupsPerUserLimit} активных групп.`
      : `На бесплатном аккаунте можно создать только ${defaultGroupsPerUserLimit} групп. Чтобы создать больше, активируйте премиум.`
  }

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
      premiumExpiresAt: enabled ? extendPremiumExpiry(durationDays, session.premiumExpiresAt) : '',
    })
  }
  const profilePreviewSession =
    session && profileSettingsDraft
      ? {
          ...session,
          ...profileSettingsDraft,
        }
      : session
  const darkThemeEnabled = Boolean(profilePreviewSession?.darkThemeEnabled)
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
  const activeChannelStorageUsage = activeChannel?.storageUsage
  const activeChannelStoragePercent = activeChannelStorageUsage?.percentUsed ?? 0
  const activeChannelStorageTone =
    activeChannelStoragePercent >= 100 ? 'danger' : activeChannelStoragePercent >= 85 ? 'warning' : 'normal'
  const storageManagedItemsCount = storageItems.length
  const storageManagedItemsLabel =
    storageManagedItemsCount === 1
      ? '1 объект'
      : storageManagedItemsCount >= 2 && storageManagedItemsCount <= 4
        ? `${storageManagedItemsCount} объекта`
        : `${storageManagedItemsCount} объектов`
  function formatManagedStorageItemsLabel(count: number) {
    return count === 1 ? '1 объект' : count >= 2 && count <= 4 ? `${count} объекта` : `${count} объектов`
  }
  const channelStorageManagedItemsLabel = formatManagedStorageItemsLabel(channelStorageItems.length)
  function getStorageCleanupWarning(attachmentDraft?: ComposerAttachmentDraft) {
    // Keep this warning aligned with server-side auto-cleanup:
    // if the next upload would overflow quota, older sent attachments may be reclaimed.
    if (!storageUsage || !attachmentDraft || attachmentDraft.status !== 'ready') {
      return null
    }

    const willNeedCleanup = storageUsage.usedBytes + attachmentDraft.size > storageUsage.quotaBytes
    if (!willNeedCleanup) {
      return null
    }

    return sessionHasPremium
      ? 'Место закончилось. Ваши прошлые фото и файлы будут скрыты.'
      : (
        <>
          <span>{'Место закончилось. Ваши прошлые фото и файлы будут скрыты. Оформите '}</span>
          <button
            type="button"
            className="composer-attachment-storage-warning-link"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openPremiumUpsell()
            }}
          >
            <span className="composer-attachment-inline-premium">
              <span>Премиум подписку</span>
              <span
                className="premium-crown composer-attachment-premium-crown"
                aria-hidden="true"
              >
                <img src="/icons/crown64.png" alt="" />
              </span>
            </span>
          </button>
          <span>{' чтобы избежать удаления файлов.'}</span>
        </>
      )
  }
  const loadUserStorageItems = useCallback(async () => {
    if (!backendReady || !session?.sessionToken) {
      setStorageItems([])
      return
    }

    setStorageItemsBusy(true)
    setStorageItemsError('')
    try {
      const response = await fetchUserStorageItemsRequest(session.sessionToken)
      setStorageItems(response.items)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Не удалось загрузить хранилище.'
      setStorageItemsError(message)
    } finally {
      setStorageItemsBusy(false)
    }
  }, [backendReady, session?.sessionToken])
  const loadChannelStorageItems = useCallback(async () => {
    if (!backendReady || !session?.sessionToken || !activeChannel) {
      setChannelStorageItems([])
      return
    }

    setChannelStorageItemsBusy(true)
    setChannelStorageItemsError('')
    try {
      const response = await fetchChannelStorageItemsRequest(session.sessionToken, activeChannel.id)
      setChannelStorageItems(response.items)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Не удалось загрузить хранилище канала.'
      setChannelStorageItemsError(message)
    } finally {
      setChannelStorageItemsBusy(false)
    }
  }, [activeChannel, backendReady, session?.sessionToken])
  const profileSettingsDirty =
    session !== null &&
    profileSettingsDraft !== null &&
    (
      profileSettingsDraft.displayName !== session.displayName ||
      (profileSettingsDraft.surname ?? '') !== (session.surname ?? '') ||
      normalizeNickname(profileSettingsDraft.nickname ?? '') !== (session.nickname ?? '') ||
      sanitizeStatusField(profileSettingsDraft.status ?? '') !== (session.status ?? '') ||
      (profileSettingsDraft.avatarImage?.trim() || undefined) !== session.avatarImage ||
      Boolean(profileSettingsDraft.darkThemeEnabled) !== Boolean(session.darkThemeEnabled) ||
      Boolean(profileSettingsDraft.premiumBadgeHidden) !== Boolean(session.premiumBadgeHidden) ||
      Boolean(profileSettingsDraft.soundsDisabled) !== Boolean(session.soundsDisabled)
    )
  const changePasswordDirty =
    changePasswordCurrentValue.trim().length > 0 ||
    changePasswordNextValue.trim().length > 0 ||
    changePasswordConfirmValue.trim().length > 0
  const deleteAccountDirty = deleteAccountPasswordValue.trim().length > 0
  const creatingGroupMemberLimit = sessionHasPremium ? premiumGroupMemberLimit : defaultGroupMemberLimit
  const creatingGroupsPerUserLimit = sessionHasPremium ? premiumGroupsPerUserLimit : defaultGroupsPerUserLimit
  const currentSessionIdentifier = normalizeIdentifier(session?.identifier ?? '')
  const ownedManagedChannelHandles = new Set(
    channels
      .map((channel) => sanitizeChannelDirectLink(channel.directLink))
      .filter((handle): handle is string => Boolean(handle)),
  )
  function isOwnedGroupPreview(
    group: Pick<GroupPreview, 'creatorIdentifier' | 'groupOwnerIdentifier' | 'viewerIsOwner'>,
  ) {
    if (group.viewerIsOwner !== undefined) {
      return group.viewerIsOwner
    }
    const ownerIdentifier = normalizeIdentifier(
      group.groupOwnerIdentifier ?? group.creatorIdentifier ?? '',
    )
    return Boolean(ownerIdentifier) && ownerIdentifier === currentSessionIdentifier
  }
  function isOwnedSubscriptionChannelPreview(
    channel: Pick<SubscriptionChannel, 'creatorIdentifier' | 'handle'>,
  ) {
    const creatorIdentifier = normalizeIdentifier(channel.creatorIdentifier ?? '')
    const normalizedHandle = sanitizeChannelDirectLink(channel.handle)
    return (
      (Boolean(creatorIdentifier) && creatorIdentifier === currentSessionIdentifier) ||
      (Boolean(normalizedHandle) && ownedManagedChannelHandles.has(normalizedHandle))
    )
  }
  const activeOwnedGroupCount = groups.filter((group) => {
    const hiddenArchivedGroup = Boolean(
      group.archivedAt &&
        (group.archiveReason === 'admin-archived' ||
          group.archiveReason === 'owner-deleted' ||
          group.archiveReason === 'self-service-data-hidden'),
    )
    return isOwnedGroupPreview(group) && !hiddenArchivedGroup
  }).length
  const creatingGroupLimitReached = activeOwnedGroupCount >= creatingGroupsPerUserLimit
  const selectedGroupCreateChats = creatableGroupChats.filter((chat) =>
    creatingGroupMemberChatIds.includes(chat.id),
  )
  const canCreateGroup = selectedGroupCreateChats.length > 0
  const creatingGroupSelectionRequiredMessage =
    creatableGroupChats.length === 0
      ? 'Сначала добавьте хотя бы один контакт, чтобы создать группу.'
      : 'Чтобы создать группу, добавьте хотя бы одного человека кроме себя.'
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
    trackAnalyticsEvent('premium_purchase_started', {
      debugAutoCheckout: premiumDebugAutoCheckout,
      gift: Boolean(premiumGiftChatId),
      plan,
    })
    trackAnalyticsEvent(
      plan === 'year' ? 'premium_purchase_started_year' : 'premium_purchase_started_month',
      {
        debugAutoCheckout: premiumDebugAutoCheckout,
        gift: Boolean(premiumGiftChatId),
        plan,
      },
    )

    try {
      if (premiumDebugAutoCheckout) {
        await applyPremiumDebugState(true, plan === 'year' ? 365 : 30)
        trackAnalyticsEvent('premium_purchase_succeeded', {
          debugAutoCheckout: true,
          gift: Boolean(premiumGiftChatId),
          plan,
        })
        trackAnalyticsEvent(
          plan === 'year' ? 'premium_purchase_succeeded_year' : 'premium_purchase_succeeded_month',
          {
            debugAutoCheckout: true,
            gift: Boolean(premiumGiftChatId),
            plan,
          },
        )
        return
      }

      await startRealPremiumCheckout(plan)
      trackAnalyticsEvent('premium_purchase_succeeded', {
        debugAutoCheckout: false,
        gift: Boolean(premiumGiftChatId),
        plan,
      })
      trackAnalyticsEvent(
        plan === 'year' ? 'premium_purchase_succeeded_year' : 'premium_purchase_succeeded_month',
        {
          debugAutoCheckout: false,
          gift: Boolean(premiumGiftChatId),
          plan,
        },
      )
    } catch (error) {
      trackAnalyticsEvent('premium_purchase_failed', {
        debugAutoCheckout: premiumDebugAutoCheckout,
        gift: Boolean(premiumGiftChatId),
        plan,
        reason: getErrorMessage(error, 'premium-purchase-failed'),
      })
      trackAnalyticsEvent(
        plan === 'year' ? 'premium_purchase_failed_year' : 'premium_purchase_failed_month',
        {
          debugAutoCheckout: premiumDebugAutoCheckout,
          gift: Boolean(premiumGiftChatId),
          plan,
          reason: getErrorMessage(error, 'premium-purchase-failed'),
        },
      )
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
  const activeMessageUploadProgress =
    activeMessage?.author === 'me' && activeMessageDeliveryIssue === 'pending'
      ? getDirectMessageUploadProgress(activeMessage.id)
      : null
  const activeGroupMessageDeliveryIssue =
    activeGroupMessage?.author === 'me' ? getGroupMessageDeliveryIssue(activeGroupMessage.id) : null
  const activeGroupMessageUploadProgress =
    activeGroupMessage?.author === 'me' && activeGroupMessageDeliveryIssue === 'pending'
      ? getGroupMessageUploadProgress(activeGroupMessage.id)
      : null
  const nextCookieConsentChoice = cookieConsent === 'analytics' ? 'necessary' : 'analytics'
  const cookieConsentToggleLabel = cookieConsent === null ? 'Сохранить выбор' : 'Изменить выбор'
  const cookieConsentBanner = (
    <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
  )
  const { requestRoomFeedScrollToBottom } = useRoomFeedAutoScroll({
    activeRoomFeedKey,
    activeRoomFeedSignature,
    activeRoomHistoryMutation,
    feedRef: messageFeedRef,
  })

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
    if (!shouldAutoFocusTextInputOnSceneOpen()) return

    window.requestAnimationFrame(() => {
      threadComposerInputRef.current?.focus()
    })
  }, [threadTarget])

  useEffect(() => {
    if (!isSettingsView || settingsView !== 'support' || supportCooldownActive) return
    if (!shouldAutoFocusTextInputOnSceneOpen()) return

    window.requestAnimationFrame(() => {
      supportComposerInputRef.current?.focus()
    })
  }, [isSettingsView, settingsView, supportCooldownActive, threadTarget])

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

    nameNode.style.removeProperty('font-size')

    if (!sessionName.trim()) {
      return
    }

    const responsiveFontSize = Number.parseFloat(window.getComputedStyle(nameNode).fontSize)
    let nextFontSize =
      Number.isFinite(responsiveFontSize) && responsiveFontSize > 0
        ? Math.min(accountNameMaxFontSize, responsiveFontSize)
        : accountNameMaxFontSize
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

  useEffect(() => {
    if (!isSettingsView || settingsView !== 'storage') {
      return
    }

    void loadUserStorageItems()
  }, [isSettingsView, loadUserStorageItems, settingsView])

  useEffect(() => {
    if (!isChannelDetailView || !activeChannel) {
      setChannelStorageItems([])
      setChannelStorageItemsError('')
      return
    }

    void loadChannelStorageItems()
  }, [activeChannel, isChannelDetailView, loadChannelStorageItems])

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
    setQuietMode(Boolean(session?.quietModeEnabled))
  }, [session?.quietModeEnabled])

  useDocumentTheme(darkThemeEnabled)

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

    saveSession(nextSession)
  }, [])

  const clearQueuedSessionRecovery = useCallback(() => {
    if (typeof window === 'undefined') return
    if (sessionRecoveryTimeoutRef.current === null) return
    window.clearTimeout(sessionRecoveryTimeoutRef.current)
    sessionRecoveryTimeoutRef.current = null
  }, [])

  const queueSessionRecovery = useCallback((message?: string) => {
    setBackendReady(false)
    if (message) {
      setAuthError(message)
    }

    if (typeof window === 'undefined') return
    if (sessionRecoveryTimeoutRef.current !== null) return

    sessionRecoveryTimeoutRef.current = window.setTimeout(() => {
      sessionRecoveryTimeoutRef.current = null
      setSessionRecoveryVersion((current) => current + 1)
    }, 2500)
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
                browserNotificationsEnabled: nextSession.browserNotificationsEnabled !== false,
                darkThemeEnabled: Boolean(nextSession.darkThemeEnabled),
                displayName: nextSession.displayName,
                surname: nextSession.surname ?? '',
                nickname: nextSession.nickname ?? '',
                quietModeEnabled: Boolean(nextSession.quietModeEnabled),
                quietModeSettings: normalizeQuietModeSettings(nextSession.quietModeSettings),
                invisibilityAutoEnabled: Boolean(nextSession.invisibilityAutoEnabled),
                invisibilityEnabled: Boolean(nextSession.invisibilityEnabled ?? nextSession.quietModeEnabled),
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
            browserNotificationsEnabled: nextSession.browserNotificationsEnabled !== false,
            createdAt: new Date().toISOString(),
            darkThemeEnabled: Boolean(nextSession.darkThemeEnabled),
            displayName: nextSession.displayName,
            identifier: nextSession.identifier,
            invisibilityAutoEnabled: Boolean(nextSession.invisibilityAutoEnabled),
            invisibilityEnabled: Boolean(nextSession.invisibilityEnabled ?? nextSession.quietModeEnabled),
            nickname: nextSession.nickname ?? '',
            quietModeEnabled: Boolean(nextSession.quietModeEnabled),
            quietModeSettings: normalizeQuietModeSettings(nextSession.quietModeSettings),
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

    saveAccounts(nextAccounts)
  }, [persistSession])

  const syncBrowserNotificationStatus = useCallback(() => {
    setBrowserNotificationStatus(getBrowserNotificationStatus())
  }, [])

  const logout = useCallback(async () => {
    const activeSessionToken = session?.sessionToken
    if (activeSessionToken) {
      // Presence/logout invariant:
      // local storage cleanup alone must never be the only logout step, otherwise other users can
      // keep seeing a stale "в сети" badge until long-running session retention prunes the token.
      await logoutSessionRequest(activeSessionToken).catch((error) => {
        console.error('Failed to invalidate Tinychok session during logout', error)
      })
    }

    clearQueuedSessionRecovery()
    Object.values(chatAttachmentDrafts).forEach((draft) => releaseComposerAttachmentDraft(draft))
    Object.values(groupAttachmentDrafts).forEach((draft) => releaseComposerAttachmentDraft(draft))
    Object.values(channelAttachmentDrafts).forEach((draft) => releaseComposerAttachmentDraft(draft))
    releaseComposerAttachmentDraft(threadAttachmentDraft)
    releaseComposerAttachmentDraft(supportAttachmentDraft)
    persistSession(null)
    setBackendReady(false)
    setIdentifier('')
    setDisplayName('')
    setSmsCode('')
    setAuthPassword('')
    setAuthPasswordConfirm('')
    setAuthCodeFlow('registration')
    setAuthStep('phone')
    setAuthExistingAccount(null)
    setChatMessageDrafts({})
    setGroupMessageDrafts({})
    setChannelPostDrafts({})
    setChatAttachmentDrafts({})
    setGroupAttachmentDrafts({})
    setChannelAttachmentDrafts({})
    setThreadAttachmentDraft(undefined)
    setSupportAttachmentDraft(undefined)
    setChannelPostBusy(false)
    setChannelPostError('')
    setChannelPostReplyTarget(null)
    setConfirmingLogout(false)
    setDeleteAccountOpen(false)
    resetDeleteAccountForm()
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
    setTopListView('none')
    setStageView('main')
    setSettingsView('profile')
    setChannelsView('list')
    setSearchOpen(false)
    setActiveChatId(null)
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
    clearQueuedSessionRecovery,
    clearPendingMessages,
    groupAttachmentDrafts,
    persistSession,
    resetRoomMessageActions,
    session?.sessionToken,
    supportAttachmentDraft,
    threadAttachmentDraft,
  ])

  useEffect(() => {
    return () => {
      clearQueuedSessionRecovery()
    }
  }, [clearQueuedSessionRecovery])

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
    if (browserNotificationStatus !== 'granted') {
      return
    }

    void ensureBrowserNotificationDeliveryReady()
  }, [browserNotificationStatus])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined
    }

    const handleBrowserNotificationClick = (event: MessageEvent) => {
      const payload = event.data
      if (!payload || typeof payload !== 'object') {
        return
      }

      const candidate = payload as {
        target?: unknown
        type?: string
      }
      if (candidate.type !== 'tinychok.browser-notification.click') {
        return
      }
      if (!isBrowserNotificationTarget(candidate.target)) {
        return
      }

      void window.focus()
      browserNotificationOpenTargetRef.current(candidate.target)
    }

    navigator.serviceWorker.addEventListener('message', handleBrowserNotificationClick)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleBrowserNotificationClick)
    }
  }, [])

  useEffect(() => {
    setBrowserNotificationsEnabled(session?.browserNotificationsEnabled !== false)
  }, [session?.browserNotificationsEnabled])

  useEffect(() => {
    mobileBrowserNotificationsAutoRequestAttemptedRef.current = false
  }, [session?.identifier])

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

      const reconciledMessages = reconcileOutgoingItems(
        queuedMessagesForChat,
        chat.messages,
        matchesOutgoingDirectMessage,
        preserveMatchedOutgoingAttachmentPreview,
      )
      const existingIds = new Set(reconciledMessages.confirmedItems.map((message) => message.id))
      const localMessages = reconciledMessages.unconfirmedLocalItems
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
        messages: [...reconciledMessages.confirmedItems, ...localMessages],
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

      const reconciledMessages = reconcileOutgoingItems(
        queuedMessagesForGroup,
        group.messages,
        matchesOutgoingGroupMessage,
        preserveMatchedOutgoingAttachmentPreview,
      )
      const existingIds = new Set(reconciledMessages.confirmedItems.map((message) => message.id))
      const localMessages = reconciledMessages.unconfirmedLocalItems
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
        messages: [...reconciledMessages.confirmedItems, ...localMessages],
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
    if (supportTicketSnapshotOwnerRef.current !== snapshot.session.identifier) {
      supportTicketSnapshotOwnerRef.current = snapshot.session.identifier
      previousSupportTicketStatusesRef.current = new Map()
    }

    const previousSupportTicketStatuses = previousSupportTicketStatusesRef.current
    const nextSupportTicketStatuses = new Map<number, SupportTicket['status']>()
    for (const ticket of snapshot.supportTickets) {
      nextSupportTicketStatuses.set(ticket.id, ticket.status)
      const previousStatus = previousSupportTicketStatuses.get(ticket.id)
      if (previousStatus && previousStatus !== 'resolved' && ticket.status === 'resolved') {
        trackAnalyticsEvent('support_ticket_resolved', {
          previousStatus,
          source: 'support-snapshot-sync',
          threadId: ticket.threadId,
          unreadCount: ticket.unreadCount,
        })
      }
    }
    previousSupportTicketStatusesRef.current = nextSupportTicketStatuses

    skipNextBackendSyncRef.current = true
    setChats(mergedChats)
    setChannels(snapshot.channels)
    setContactRequests(snapshot.contactRequests)
    setOutgoingContactRequests(snapshot.outgoingContactRequests)
    setDiscoveryResults(snapshot.discoveryResults)
    setGroups(mergedGroups)
    setSupportTicketCooldownUntil(snapshot.supportTicketCooldownUntil)
    setSupportComposerCooldownUntil((currentCooldownUntil) =>
      snapshot.supportTicketCooldownUntil ??
      currentCooldownUntil ??
      resolveSupportCooldownUntilFromTickets(snapshot.supportTickets)
    )
    setSupportTickets(snapshot.supportTickets)
    setSupportUnreadCount(snapshot.supportUnreadCount)
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
    latestAuthoritativeSnapshotAtRef.current = Date.now()
    syncSession(snapshot.session)
  }, [
    mergeDirectOutboxMessagesIntoChats,
    mergeGroupOutboxMessagesIntoGroups,
    mergePendingChannelThreadCommentsIntoChannels,
    mergePendingGroupThreadCommentsIntoGroups,
    syncSession,
    trackAnalyticsEvent,
  ])

  const refreshVisibleSessionSnapshot = useCallback(async (reason: 'focus' | 'pageshow' | 'visibilitychange') => {
    const sessionToken = session?.sessionToken
    if (!sessionToken) {
      return
    }

    if (staleRuntimeResyncInFlightRef.current) {
      return staleRuntimeResyncInFlightRef.current
    }

    const refreshTask = (async () => {
      try {
        const snapshot = await fetchBootstrap(sessionToken)
        suppressNextBrowserNotificationDiffRef.current = true
        clearQueuedSessionRecovery()
        applySnapshot(snapshot)
        setBackendReady(true)
      } catch (error) {
        console.error(`Failed to refresh Tinychok snapshot after ${reason}`, error)
        if (isExpiredSessionError(error)) {
          queueSessionRecovery('Подключение к сессии временно прервано. Пытаемся восстановить доступ.')
          return
        }
        queueSessionRecovery()
      }
    })()

    staleRuntimeResyncInFlightRef.current = refreshTask
    await refreshTask.finally(() => {
      if (staleRuntimeResyncInFlightRef.current === refreshTask) {
        staleRuntimeResyncInFlightRef.current = null
      }
    })
  }, [applySnapshot, clearQueuedSessionRecovery, queueSessionRecovery, session?.sessionToken])

  const persistBrowserNotificationsEnabled = useCallback(async (enabled: boolean) => {
    setBrowserNotificationsEnabled(enabled)

    if (!session) {
      return
    }

    if (backendReady && session.sessionToken) {
      try {
        const response = await updateSessionRequest(session.sessionToken, {
          browserNotificationsEnabled: enabled,
        })
        applySnapshot(response.snapshot)
        return
      } catch (error) {
        console.error('Failed to update browser notifications preference', error)
      }
    }

    syncSession({
      ...session,
      browserNotificationsEnabled: enabled,
    })
  }, [applySnapshot, backendReady, session, syncSession])

  const dismissBrowserNotificationsBanner = useCallback(() => {
    setBrowserNotificationsBannerDismissed(true)
    trackAnalyticsEvent('browser_notifications_prompt_dismissed', {})

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(browserNotificationsBannerDismissedStorageKey, 'true')
    }
  }, [])

  const requestBrowserNotificationsAccess = useCallback(async (source: string) => {
    const nextStatus = await requestBrowserNotificationPermission()
    setBrowserNotificationStatus(nextStatus)
    if (nextStatus === 'granted') {
      await persistBrowserNotificationsEnabled(true)
      trackAnalyticsEvent('browser_notifications_enabled', {
        source,
      })
    }
    return nextStatus
  }, [persistBrowserNotificationsEnabled])

  const enableBrowserNotifications = useCallback(async () => {
    if (browserNotificationStatus === 'granted') {
      await persistBrowserNotificationsEnabled(true)
      trackAnalyticsEvent('browser_notifications_enabled', {
        source: 'settings-toggle',
      })
      return 'granted'
    }

    return requestBrowserNotificationsAccess('settings-toggle')
  }, [browserNotificationStatus, persistBrowserNotificationsEnabled, requestBrowserNotificationsAccess])

  const disableBrowserNotifications = useCallback(async () => {
    await persistBrowserNotificationsEnabled(false)
    trackAnalyticsEvent('browser_notifications_disabled', {
      source: 'settings-toggle',
    })
  }, [persistBrowserNotificationsEnabled])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!shouldAutoRequestBrowserNotificationsOnMobile) return undefined
    if (mobileBrowserNotificationsAutoRequestAttemptedRef.current) return undefined

    const handleAutoRequest = () => {
      if (mobileBrowserNotificationsAutoRequestAttemptedRef.current) return
      mobileBrowserNotificationsAutoRequestAttemptedRef.current = true
      void requestBrowserNotificationsAccess('mobile-auto-request')
    }

    window.addEventListener('pointerdown', handleAutoRequest, { once: true })

    return () => {
      window.removeEventListener('pointerdown', handleAutoRequest)
    }
  }, [requestBrowserNotificationsAccess, shouldAutoRequestBrowserNotificationsOnMobile])

  const removeStorageItem = useCallback(async (storageItem: UserStorageItem) => {
    if (!backendReady || !session?.sessionToken) {
      return
    }

    setDeletingStorageItemId(storageItem.id)
    setStorageItemsError('')
    try {
      const response = await deleteUserStorageItemRequest(session.sessionToken, storageItem.id)
      applySnapshot(response.snapshot)
      const nextItems = await fetchUserStorageItemsRequest(session.sessionToken)
      setStorageItems(nextItems.items)
      trackAnalyticsEvent('storage_file_deleted', {
        fileKind: getAnalyticsFileKind({
          fileName: storageItem.fileName,
          mimeType: storageItem.mimeType,
        }),
        sizeBucket: getAnalyticsSizeBucket(storageItem.size),
        source: 'settings-storage',
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Не удалось удалить объект из хранилища.'
      setStorageItemsError(message)
    } finally {
      setDeletingStorageItemId(null)
    }
  }, [applySnapshot, backendReady, session?.sessionToken])
  const removeChannelStorageItem = useCallback(async (storageItem: UserStorageItem) => {
    if (!backendReady || !session?.sessionToken || !activeChannel) {
      return
    }

    setDeletingChannelStorageItemId(storageItem.id)
    setChannelStorageItemsError('')
    try {
      const response = await deleteChannelStorageItemRequest(session.sessionToken, activeChannel.id, storageItem.id)
      applySnapshot(response.snapshot)
      const nextItems = await fetchChannelStorageItemsRequest(session.sessionToken, activeChannel.id)
      setChannelStorageItems(nextItems.items)
      trackAnalyticsEvent('storage_file_deleted', {
        fileKind: getAnalyticsFileKind({
          fileName: storageItem.fileName,
          mimeType: storageItem.mimeType,
        }),
        sizeBucket: getAnalyticsSizeBucket(storageItem.size),
        source: 'channel-storage',
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Не удалось удалить объект из хранилища канала.'
      setChannelStorageItemsError(message)
    } finally {
      setDeletingChannelStorageItemId(null)
    }
  }, [activeChannel, applySnapshot, backendReady, session?.sessionToken])
  function renderStorageItemsGrid(args: {
    busy: boolean
    compact?: boolean
    deletingId: string | null
    emptyCopy: string
    error: string
    items: UserStorageItem[]
    onDelete: (item: UserStorageItem) => void
  }) {
    const { busy, compact = false, deletingId, emptyCopy, error, items, onDelete } = args

    return (
      <>
        {busy ? (
          <article className="settings-item settings-storage-empty-state">
            <p className="settings-text">Загружаем объекты хранилища...</p>
          </article>
        ) : null}
        {!busy && items.length > 0 ? (
          <div
            className={`settings-storage-grid${compact ? ' compact' : ''}`}
            role="list"
            aria-label="Объекты хранилища"
          >
            {items.map((item) => {
              const deleting = deletingId === item.id
              const isImage = item.mimeType.startsWith('image/')
              return (
                <article
                  key={item.id}
                  className={`settings-storage-card${compact ? ' compact' : ''}${deleting ? ' deleting' : ''}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="settings-storage-delete"
                    aria-label={`Удалить ${item.fileName} из хранилища`}
                    disabled={Boolean(deletingId)}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDelete(item)
                    }}
                  >
                    ×
                  </button>
                  {isImage ? (
                    <div className="settings-storage-thumb-wrap">
                      <img src={item.mediaUrl} alt={item.fileName} className="settings-storage-thumb" />
                    </div>
                  ) : (
                    <div className="settings-storage-file-card">
                      <span className="settings-storage-file-badge">Файл</span>
                      <strong>{item.fileName}</strong>
                      {!compact ? <span>{formatAttachmentSize(item.size)}</span> : null}
                    </div>
                  )}
                  {!compact ? (
                    <div className="settings-storage-card-copy">
                      <strong title={item.fileName}>{item.fileName}</strong>
                      <span>{item.primaryLabel}</span>
                      <span>{formatAttachmentSize(item.size)}</span>
                      <span>{formatSupportTicketCreatedAt(item.createdAt)}</span>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}
        {!busy && items.length === 0 ? (
          <article className="settings-item settings-storage-empty-state">
            <p className="settings-text">{emptyCopy}</p>
          </article>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
      </>
    )
  }
  function renderManagedStorageSummaryButton(args: {
    managedItemsLabel: string
    onOpen: () => void
    openCopy: string
    subjectLabel?: string
    title: string
    tone: 'danger' | 'normal' | 'warning'
    usage?: Session['storageUsage']
  }) {
    const { managedItemsLabel, onOpen, openCopy, subjectLabel, title, tone, usage } = args
    const percentUsed = Math.max(0, Math.min(100, usage?.percentUsed ?? 0))
    return (
      <button
        type="button"
        className={`settings-item settings-storage-section storage-usage-card storage-usage-card-button ${tone}`}
        onClick={onOpen}
      >
        <div className="storage-usage-header">
          <div className="storage-usage-title-stack">
            <span className="settings-label">{title}</span>
            {subjectLabel ? <span className="storage-usage-subject-label">{subjectLabel}</span> : null}
          </div>
          <strong>
            {usage
              ? `${formatAttachmentSize(usage.usedBytes)} из ${formatAttachmentSize(usage.quotaBytes)}`
              : 'Нет данных'}
          </strong>
        </div>
        {usage ? (
          <>
            <div
              className="storage-usage-bar"
              role="progressbar"
              aria-label={`Использование хранилища: ${title}`}
              aria-valuemin={0}
              aria-valuemax={usage.quotaBytes}
              aria-valuenow={usage.usedBytes}
            >
              <span className="storage-usage-bar-fill" style={{ width: `${Math.max(4, percentUsed)}%` }} />
            </div>
            <div className="settings-storage-meta">
              <p className="settings-text">{`Осталось ${formatAttachmentSize(usage.remainingBytes)}`}</p>
              <p className="settings-text">{managedItemsLabel}</p>
            </div>
            <p className="settings-text storage-usage-open-copy">
              <span className="storage-usage-open-pill">{openCopy}</span>
            </p>
          </>
        ) : (
          <p className="settings-text">Использование хранилища пока не посчитано.</p>
        )}
      </button>
    )
  }

  useEffect(() => {
    if (!session) {
      latestSnapshotRef.current = null
      return
    }

    latestSnapshotRef.current = {
      channels,
      chats,
      contactRequests,
      outgoingContactRequests,
      discoveryResults,
      groups,
      session,
      supportTicketCooldownUntil,
      supportTickets,
      supportUnreadCount,
      subscriptionChannels,
      threadInbox,
    }
  }, [
    channels,
    chats,
    contactRequests,
    discoveryResults,
    groups,
    outgoingContactRequests,
    session,
    supportTicketCooldownUntil,
    supportTickets,
    supportUnreadCount,
    subscriptionChannels,
    threadInbox,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!effectiveSupportTicketCooldownUntil) {
      setSupportCooldownNow(Date.now())
      return
    }

    setSupportCooldownNow(Date.now())
    const intervalId = window.setInterval(() => {
      setSupportCooldownNow(Date.now())
    }, 250)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [effectiveSupportTicketCooldownUntil])

  useEffect(() => {
    if (effectiveSupportTicketCooldownUntil) {
      return
    }

    const fallbackCooldownUntil = resolveSupportCooldownUntilFromTickets(supportTickets, supportCooldownNow)
    if (fallbackCooldownUntil) {
      setSupportComposerCooldownUntil(fallbackCooldownUntil)
    }
  }, [effectiveSupportTicketCooldownUntil, supportCooldownNow, supportTickets])

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
        clearQueuedSessionRecovery()
        applySnapshot(snapshot)
        setBackendReady(true)
      } catch (error) {
        if (cancelled) return
        console.error('Failed to bootstrap Tinychok backend', error)
        if (isExpiredSessionError(error)) {
          queueSessionRecovery('Подключение к сессии временно прервано. Пытаемся восстановить доступ.')
          return
        }
        queueSessionRecovery()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [applySnapshot, clearQueuedSessionRecovery, queueSessionRecovery, session?.sessionToken, sessionRecoveryVersion])

  useRuntimeSessionRecovery({
    backendReady,
    latestAuthoritativeSnapshotAtRef,
    refreshVisibleSessionSnapshot,
    sessionToken: session?.sessionToken,
    staleRuntimeRecoveryIntervalMs: STALE_RUNTIME_RECOVERY_INTERVAL_MS,
  })

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
      // Search keeps people and channels on the same debounced request cadence,
      // but channel results must come from backend discovery so self-unsubscribed
      // channels remain searchable without silently resubscribing the user.
      Promise.all([
        searchDiscoveryResultsRequest(session.sessionToken!, trimmedQuery),
        searchChannelDiscoveryResultsRequest(session.sessionToken!, trimmedQuery),
      ])
        .then(([results, channelResults]) => {
          if (!cancelled) {
            setLiveSearchState({
              query: trimmedQuery,
              results,
            })
            setLiveChannelSearchState({
              query: trimmedQuery,
              results: channelResults,
            })
          }
        })
        .catch((error) => {
          if (cancelled) return
          console.error('Failed to search discovery results', error)
          setLiveSearchState({
            query: trimmedQuery,
            results: [],
          })
          setLiveChannelSearchState({
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
    if (searchOpen && !previousSearchOpenRef.current) {
      trackAnalyticsEvent('search_screen_opened', {
        source: getAnalyticsSearchSource(bottomSection),
        topFilter: searchTopFilter,
      })
    }

    previousSearchOpenRef.current = searchOpen
  }, [bottomSection, searchOpen, searchTopFilter])

  useEffect(() => {
    if (!searchOpen || topListView !== 'none' || trimmedSearchQuery === '') {
      return
    }

    const searchKey = `${searchTopFilter}:${trimmedSearchQuery}`
    const queryLength = getAnalyticsQueryLength(trimmedSearchQuery)
    const source = getAnalyticsSearchSource(bottomSection)

    if (searchShowsContacts && lastTrackedContactSearchKeyRef.current !== searchKey) {
      trackAnalyticsEvent('contact_search_used', {
        queryLength,
        source,
        topFilter: searchTopFilter,
      })
      lastTrackedContactSearchKeyRef.current = searchKey
    }

    if (searchShowsChannels && lastTrackedChannelSearchKeyRef.current !== searchKey) {
      trackAnalyticsEvent('channel_search_used', {
        queryLength,
        source,
        topFilter: searchTopFilter,
      })
      lastTrackedChannelSearchKeyRef.current = searchKey
    }
  }, [
    bottomSection,
    searchOpen,
    searchShowsChannels,
    searchShowsContacts,
    searchTopFilter,
    topListView,
    trimmedSearchQuery,
  ])

  useEffect(() => {
    if (!searchOpen || topListView !== 'none' || trimmedSearchQuery === '' || hasVisibleSearchResults) {
      return
    }

    const searchKey = `${searchTopFilter}:${trimmedSearchQuery}`
    if (lastTrackedEmptySearchKeyRef.current === searchKey) {
      return
    }

    trackAnalyticsEvent('search_empty_result_shown', {
      queryLength: getAnalyticsQueryLength(trimmedSearchQuery),
      source: getAnalyticsSearchSource(bottomSection),
      topFilter: searchTopFilter,
    })
    lastTrackedEmptySearchKeyRef.current = searchKey
  }, [bottomSection, hasVisibleSearchResults, searchOpen, searchTopFilter, topListView, trimmedSearchQuery])

  useEffect(() => {
    if (topListView === 'threads' && previousTopListViewRef.current !== 'threads') {
      trackAnalyticsEvent('thread_inbox_opened', {
        source: 'top-list-filter',
      })
    }

    previousTopListViewRef.current = topListView
  }, [topListView])

  useEffect(() => {
    if (!isSettingsView) {
      previousSettingsViewRef.current = settingsView
      return
    }

    if (settingsView === 'quiet' && previousSettingsViewRef.current !== 'quiet') {
      trackAnalyticsEvent('quiet_settings_opened', {
        hasPremium: sessionHasPremium,
        source: 'settings-profile',
      })
    }

    if (settingsView === 'storage' && previousSettingsViewRef.current !== 'storage') {
      trackAnalyticsEvent('storage_manager_opened', {
        source: 'settings-profile',
      })
    }

    previousSettingsViewRef.current = settingsView
  }, [isSettingsView, sessionHasPremium, settingsView])

  useEffect(() => {
    if (!backendReady || !session?.sessionToken) return

    const sessionToken = session.sessionToken
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectAttempt = 0
    let reconnectTimeoutId: number | null = null
    let fallbackRefreshIntervalId: number | null = null

    const clearFallbackRefresh = () => {
      if (fallbackRefreshIntervalId === null) return
      window.clearInterval(fallbackRefreshIntervalId)
      fallbackRefreshIntervalId = null
    }

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutId === null) return
      window.clearTimeout(reconnectTimeoutId)
      reconnectTimeoutId = null
    }

    const refreshSnapshot = async () => {
      try {
        const snapshot = await fetchBootstrap(sessionToken)
        if (cancelled) return
        clearQueuedSessionRecovery()
        suppressNextBrowserNotificationDiffRef.current = true
        applySnapshot(snapshot)
        setBackendReady(true)
      } catch (error) {
        if (cancelled) return
        console.error('Failed to refresh Tinychok snapshot while realtime is offline', error)
        if (isExpiredSessionError(error)) {
          queueSessionRecovery('Подключение к сессии временно прервано. Пытаемся восстановить доступ.')
          return
        }
        queueSessionRecovery()
      }
    }

    const ensureFallbackRefresh = () => {
      if (fallbackRefreshIntervalId !== null) return
      void refreshSnapshot()
      fallbackRefreshIntervalId = window.setInterval(() => {
        void refreshSnapshot()
      }, 3000)
    }

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimeoutId !== null) return
      const delay = Math.min(5000, 500 * 2 ** reconnectAttempt)
      reconnectAttempt += 1
      reconnectTimeoutId = window.setTimeout(() => {
        reconnectTimeoutId = null
        connectRealtime()
      }, delay)
    }

    const handleRealtimeDisconnect = () => {
      ensureFallbackRefresh()
      scheduleReconnect()
    }

    const connectRealtime = () => {
      if (cancelled || socket) return

      socket = openRealtimeConnection(sessionToken, (event) => {
        if (cancelled) return
        if (event.type === 'connection.ready') {
          reconnectAttempt = 0
          clearFallbackRefresh()
          suppressNextBrowserNotificationDiffRef.current = true
        }
        applySnapshot(event.snapshot)
      })

      socket.addEventListener('error', () => {
        if (cancelled) return
        socket?.close()
      })

      socket.addEventListener('close', () => {
        if (cancelled) return
        socket = null
        handleRealtimeDisconnect()
      })
    }

    connectRealtime()

    return () => {
      cancelled = true
      clearFallbackRefresh()
      clearReconnectTimeout()
      socket?.close()
    }
  }, [applySnapshot, backendReady, clearQueuedSessionRecovery, queueSessionRecovery, session?.sessionToken])

  useEffect(() => {
    const previousSlices = previousSnapshotSlicesRef.current
    const chatsChanged = previousSlices.chats !== chats
    const contactRequestsChanged = previousSlices.contactRequests !== contactRequests
    const outgoingContactRequestsChanged =
      previousSlices.outgoingContactRequests !== outgoingContactRequests
    const groupsChanged = previousSlices.groups !== groups
    const sessionChanged = previousSlices.session !== session
    const supportTicketCooldownChanged =
      previousSlices.supportTicketCooldownUntil !== supportTicketCooldownUntil
    const supportTicketsChanged = previousSlices.supportTickets !== supportTickets
    const supportUnreadCountChanged = previousSlices.supportUnreadCount !== supportUnreadCount
    const channelsChanged = previousSlices.channels !== channels
    const subscriptionChannelsChanged =
      previousSlices.subscriptionChannels !== subscriptionChannels
    const threadInboxChanged = previousSlices.threadInbox !== threadInbox

    previousSnapshotSlicesRef.current = {
      channels,
      chats,
      contactRequests,
      outgoingContactRequests,
      groups,
      session,
      supportTicketCooldownUntil,
      supportTickets,
      supportUnreadCount,
      subscriptionChannels,
      threadInbox,
    }

    if (!backendReady || !session?.sessionToken) return

    if (skipNextBackendSyncRef.current) {
      skipNextBackendSyncRef.current = false
      return
    }

    if (
      contactRequestsChanged &&
      !outgoingContactRequestsChanged &&
      !chatsChanged &&
      !groupsChanged &&
      !sessionChanged &&
      !supportTicketCooldownChanged &&
      !supportTicketsChanged &&
      !supportUnreadCountChanged &&
      !channelsChanged &&
      !subscriptionChannelsChanged &&
      !threadInboxChanged
    ) {
      return
    }

    if (
      outgoingContactRequestsChanged &&
      !contactRequestsChanged &&
      !chatsChanged &&
      !groupsChanged &&
      !sessionChanged &&
      !channelsChanged &&
      !subscriptionChannelsChanged &&
      !threadInboxChanged
    ) {
      return
    }

    if (
      threadInboxChanged &&
      !outgoingContactRequestsChanged &&
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
      contactRequests,
      outgoingContactRequests,
      discoveryResults,
      groups,
      session,
      supportTicketCooldownUntil,
      supportTickets,
      supportUnreadCount,
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
    contactRequests,
    discoveryResults,
    groups,
    hasLocalOutboxMessages,
    hasPendingOutgoingMessages,
    outgoingContactRequests,
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
    const requestFlow = authCodeFlow === 'password-reset' ? 'password-reset' : 'default'

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
      const response = await requestAuthCode({
        captchaToken,
        entryPoint: 'user',
        flow: requestFlow,
        identifier: normalized,
      })
      setIdentifier(normalized)
      setAuthExistingAccount(response.existingAccount)
      setAuthBlockedNoticeOpen(false)
      setPasswordLoginCaptchaRequired(false)
      if (phoneStepCaptchaActive) {
        trackAnalyticsEvent('auth_captcha_completed', {
          context: authCodeFlow === 'password-reset' ? 'password-reset' : 'phone',
          provider: clientRuntimeConfig.captcha.provider,
        })
      }

      if (response.status === 'needs-password-login') {
        setAuthError('')
        setAuthPhoneBlockedNotice(false)
        setAuthPassword('')
        setAuthPasswordConfirm('')
        setAuthStep('password')
        trackAnalyticsEvent('auth_password_prompt_shown', {
          existingAccount: true,
          hasPassword: true,
        })
        return
      }

      if (response.status === 'blocked') {
        setAuthError('')
        setAuthPhoneBlockedNotice(true)
        setAuthPassword('')
        setAuthPasswordConfirm('')
        setSmsCode('')
        setAuthStep('phone')
        trackAnalyticsEvent('auth_code_request_failed', {
          blocked: true,
          captchaRequired,
          flow: requestFlow === 'password-reset' ? 'password-reset' : 'registration',
          reason: blockedPhoneAuthNoticeMessage,
        })
        return
      }

      const nextFlow =
        response.status === 'needs-sms-reset'
          ? 'password-reset'
          : response.status === 'needs-sms-password-setup'
            ? 'password-setup'
            : 'registration'
      setAuthCodeFlow(nextFlow)
      setAuthError('')
      setAuthPhoneBlockedNotice(false)
      setSmsCode('')
      setAuthStep('code')
      if (nextFlow === 'password-reset') {
        trackAnalyticsEvent('auth_password_reset_code_requested', {
          captchaRequired,
          existingAccount: Boolean(response.existingAccount),
        })
      }
      trackAnalyticsEvent('auth_code_request_succeeded', {
        captchaRequired,
        existingAccount: Boolean(response.existingAccount),
        flow:
          nextFlow === 'password-setup'
            ? 'legacy-password-setup'
            : nextFlow === 'password-reset'
              ? 'password-reset'
              : 'registration',
        hasPassword: Boolean(response.hasPassword),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось запросить код.'
      setAuthError(message)
      setAuthPhoneBlockedNotice(false)
      trackAnalyticsEvent('auth_code_request_failed', {
        captchaRequired,
        flow: requestFlow === 'password-reset' ? 'password-reset' : 'registration',
        reason: message,
      })
    } finally {
      resetCaptcha()
    }
  }

  async function startForgotPasswordFlow() {
    const normalized = normalizeIdentifier(identifier)

    if (!normalized || normalized.length < 12) {
      setAuthError('Проверь номер телефона.')
      return
    }

    try {
      setAuthError('')
      trackAnalyticsEvent('auth_password_forgot_started', {
        identifier: normalized,
      })
      setIdentifier(normalized)
      setAuthExistingAccount(authExistingAccount)
      setAuthCodeFlow('password-reset')
      setAuthPhoneBlockedNotice(false)
      setPasswordLoginCaptchaRequired(false)
      setAuthPassword('')
      setAuthPasswordConfirm('')
      setSmsCode('')
      setAuthStep('phone')
      setAuthError('Подтвердите номер через SmartCaptcha, чтобы сбросить пароль.')
      resetCaptcha()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось переключить вход на сброс пароля.')
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
        entryPoint: 'user',
        identifier: normalized,
      })

      if (response.status === 'authenticated') {
        resetMainSurfaceAfterAuthSuccess()
        applySnapshot(response.snapshot)
        setBackendReady(true)
        setAuthError('')
        setAuthPassword('')
        setAuthPasswordConfirm('')
        trackAnalyticsEvent('auth_code_verify_succeeded', {
          outcome: 'authenticated',
          flow: mapAuthAnalyticsFlow(authCodeFlow),
        })
        return
      }

      setAuthError('')
      setAuthPassword('')
      setAuthPasswordConfirm('')
      setPasswordLoginCaptchaRequired(false)

      if (response.status === 'needs-profile-and-password') {
        setAuthExistingAccount(null)
        setAuthCodeFlow('registration')
        setAuthStep('profile-password')
        trackAnalyticsEvent('auth_code_verify_succeeded', {
          flow: 'registration',
          outcome: 'needs-profile-and-password',
        })
        return
      }

      if (response.status === 'needs-password-setup') {
        setAuthCodeFlow('password-setup')
        setAuthStep('password-setup')
        trackAnalyticsEvent('auth_code_verify_succeeded', {
          flow: 'legacy-password-setup',
          outcome: 'needs-password-setup',
        })
        return
      }

      setAuthCodeFlow('password-reset')
      setAuthStep('password-reset')
      trackAnalyticsEvent('auth_password_reset_code_verified', {
        existingAccount: true,
      })
      trackAnalyticsEvent('auth_code_verify_succeeded', {
        flow: 'password-reset',
        outcome: 'needs-password-reset',
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
          flow: mapAuthAnalyticsFlow(authCodeFlow),
          reason: nextMessage,
        })
    }
  }

  async function submitPasswordStep() {
    const normalized = normalizeIdentifier(identifier)
    const usedPasswordCaptcha = passwordStepCaptchaActive

    if (!authPassword.trim()) {
      setAuthError('Введи пароль.')
      return
    }

    try {
      const captchaToken = usedPasswordCaptcha ? getCaptchaTokenOrThrow() : undefined
      setAuthError('')
      trackAnalyticsEvent('auth_password_login_requested', {
        captchaRequired: usedPasswordCaptcha,
      })
      if (usedPasswordCaptcha) {
        trackAnalyticsEvent('auth_password_login_captcha_completed', {
          provider: clientRuntimeConfig.captcha.provider,
        })
      }
      const response = await loginWithPassword({
        captchaToken,
        identifier: normalized,
        password: authPassword,
      })
      resetMainSurfaceAfterAuthSuccess()
      applySnapshot(response.snapshot)
      setBackendReady(true)
      setAuthPassword('')
      setAuthPasswordConfirm('')
      setPasswordLoginCaptchaRequired(false)
      trackAnalyticsEvent('auth_password_login_succeeded', {})
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Не удалось войти по паролю.'
      const message = normalizePasswordLoginFailureMessage(rawMessage)
      setAuthError(message)
      if (shouldActivatePasswordLoginCaptcha(rawMessage)) {
        setPasswordLoginCaptchaRequired(true)
        trackAnalyticsEvent('auth_password_login_captcha_required', {
          reason: message,
        })
      }
      if (isPasswordLoginRateLimitedMessage(message)) {
        trackAnalyticsEvent('auth_password_login_rate_limited', {
          reason: message,
        })
      }
      if (isPasswordLoginBlockedMessage(message)) {
        trackAnalyticsEvent('auth_password_login_blocked', {
          reason: message,
        })
      }
      trackAnalyticsEvent('auth_password_login_failed', {
        reason: message,
      })
    } finally {
      if (usedPasswordCaptcha) {
        resetCaptcha()
      }
    }
  }

  async function submitProfilePasswordStep() {
    const normalized = normalizeIdentifier(identifier)
    const trimmedName = sanitizePersonField(displayName, displayNameFieldMaxLength)

    if (!trimmedName) {
      setAuthError('Для регистрации нужен ник или имя.')
      return
    }

    try {
      setAuthError('')
      const response = await registerAccount({
        code: smsCode.trim(),
        confirmPassword: authPasswordConfirm,
        displayName: trimmedName,
        identifier: normalized,
        password: authPassword,
      })
      resetMainSurfaceAfterAuthSuccess()
      applySnapshot(response.snapshot)
      setBackendReady(true)
      setAuthError('')
      setAuthPassword('')
      setAuthPasswordConfirm('')
      trackAnalyticsEvent('auth_registration_succeeded', {})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось завершить регистрацию.'
      setAuthError(message)
      trackAnalyticsEvent('auth_registration_failed', {
        reason: message,
      })
    }
  }

  async function submitPasswordSetupStep() {
    const normalized = normalizeIdentifier(identifier)

    try {
      setAuthError('')
      const response = await setPassword({
        code: smsCode.trim(),
        confirmPassword: authPasswordConfirm,
        identifier: normalized,
        password: authPassword,
      })
      resetMainSurfaceAfterAuthSuccess()
      applySnapshot(response.snapshot)
      setBackendReady(true)
      setAuthError('')
      setAuthPassword('')
      setAuthPasswordConfirm('')
      trackAnalyticsEvent('auth_password_set_succeeded', {
        revokedPreviousSessions: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить пароль.'
      setAuthError(message)
      trackAnalyticsEvent('auth_password_set_failed', {
        reason: message,
      })
    }
  }

  async function submitPasswordResetStep() {
    const normalized = normalizeIdentifier(identifier)

    try {
      setAuthError('')
      const response = await resetPassword({
        code: smsCode.trim(),
        confirmPassword: authPasswordConfirm,
        identifier: normalized,
        password: authPassword,
      })
      resetMainSurfaceAfterAuthSuccess()
      applySnapshot(response.snapshot)
      setBackendReady(true)
      setAuthError('')
      setAuthPassword('')
      setAuthPasswordConfirm('')
      trackAnalyticsEvent('auth_password_reset_succeeded', {
        revokedPreviousSessions: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сбросить пароль.'
      setAuthError(message)
      trackAnalyticsEvent('auth_password_reset_failed', {
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

  function cancelDirectMessageEdit(chatId: number) {
    setDirectMessageEditTarget(null)
    updateChatDraft(chatId, '')
  }

  function cancelGroupMessageEdit(groupId: number) {
    setGroupMessageEditTarget(null)
    updateGroupDraft(groupId, '')
  }

  function cancelChannelPostEdit(channelId: number) {
    setChannelPostEditTarget(null)
    setChannelPostError('')
    updateChannelPostDraft(channelId, '')
  }

  function cancelThreadCommentEdit() {
    clearThreadEditTarget()
    setThreadDraft('')
    setThreadError('')
  }

  function clearSupportAttachmentDraft() {
    supportAttachmentSelectionTokenRef.current += 1
    setSupportAttachmentDraft((currentDraft) => {
      releaseComposerAttachmentDraft(currentDraft)
      return undefined
    })
  }

  function openMediaViewer(
    attachment: MessageAttachment,
    options?: { allowDownload?: boolean; allowGifAdd?: boolean },
  ) {
    if (isImageMimeType(attachment.mimeType)) {
      trackAnalyticsEvent('image_viewer_opened', {
        allowDownload: options?.allowDownload ?? attachment.mimeType !== 'image/gif',
        isGif: attachment.mimeType === 'image/gif',
        mimeType: attachment.mimeType,
        size: attachment.size,
      })
    } else if (isVideoMimeType(attachment.mimeType)) {
      const roomKind = threadTarget
        ? 'thread'
        : isChatOpen
          ? 'direct'
          : isGroupOpen
            ? 'group'
            : isSubscriptionChannelOpen
              ? 'channel'
              : isSettingsView && settingsView === 'support'
                ? 'support'
                : 'unknown'

      if (isVideoNoteAttachment(attachment)) {
        trackAnalyticsEvent('video_note_viewer_opened', {
          allowDownload: options?.allowDownload ?? true,
          roomKind,
          source: 'media-viewer',
        })
      } else {
        trackAnalyticsEvent('video_viewer_opened', {
          allowDownload: options?.allowDownload ?? true,
          mimeType: attachment.mimeType,
          size: attachment.size,
        })
      }
    }

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
    if (
      !attachmentDraft ||
      (!isImageMimeType(attachmentDraft.mimeType) && !isVideoMimeType(attachmentDraft.mimeType))
    ) {
      return
    }

    openMediaViewer({
      fileName: attachmentDraft.fileName,
      height: attachmentDraft.height,
      mediaUrl: attachmentDraft.previewUrl,
      mimeType: attachmentDraft.mimeType,
      presentation: attachmentDraft.presentation,
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
      const latestCommentAuthor = resolveGroupThreadInboxPreviewAuthor(group, latestComment, session)

      return {
        avatarImage: group.avatarImage,
        commentCount: comments.length,
        groupAccent: group.accent,
        groupId: group.id,
        groupTitle: group.title,
        kind: 'group' as const,
        latestActivityAt: latestComment?.createdAt ?? message.createdAt,
        latestCommentAuthor: latestComment?.displayAuthor,
        latestCommentAuthorAccent: latestCommentAuthor.accent,
        latestCommentAuthorAvatarImage: latestCommentAuthor.avatarImage,
        latestCommentText: latestComment ? formatMessagePreview(latestComment) : 'Пока без комментариев',
        latestCommentTime: latestComment?.time ?? message.time,
        messageId: message.id,
        sourceText: formatMessagePreview(message),
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
    const latestCommentAuthor = resolveChannelThreadInboxPreviewAuthor(latestComment, session)

    return {
      avatarImage: channel.avatarImage,
      channelAccent: channel.accent,
      channelId: channel.id,
      channelTitle: channel.title,
      commentCount: comments.length,
      kind: 'channel' as const,
      latestActivityAt: latestComment?.createdAt ?? post.createdAt,
      latestCommentAuthor: latestComment?.displayAuthor,
      latestCommentAuthorAccent: latestCommentAuthor.accent,
      latestCommentAuthorAvatarImage: latestCommentAuthor.avatarImage,
      latestCommentText: latestComment ? formatMessagePreview(latestComment) : 'Пока без комментариев',
      latestCommentTime: latestComment?.time ?? post.time,
      postId: post.id,
      sourceText: post.system ? 'Канал создан' : formatMessagePreview(post),
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

  function applyLocalSupportTicketRead(ticketId: number) {
    const unreadCount = supportTickets.find((ticket) => ticket.id === ticketId)?.unreadCount ?? 0
    if (unreadCount <= 0) return

    setSupportTickets((currentTickets) =>
      currentTickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              unreadCount: 0,
            }
          : ticket,
      ),
    )
    setSupportUnreadCount((currentUnreadCount) => Math.max(0, currentUnreadCount - unreadCount))
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
      sourceContact?: Message['sourceContact']
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
              sourceContact: options?.sourceContact,
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
      mentions?: Message['mentions']
      replyTo?: Message['replyTo']
      sourceChannel?: Message['sourceChannel']
      sourceContact?: Message['sourceContact']
      time?: string
    },
  ) {
    const time = options?.time ?? formatNowTime()
    const createdAt = options?.createdAt ?? new Date().toISOString()

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? (() => {
              const nextMessage: Message = {
                attachment: options?.attachment,
                author: 'me',
                createdAt,
                deliveryId: options?.deliveryId,
                forwarded: options?.forwarded,
                forwardedAuthorName: options?.forwardedAuthorName,
                id: options?.localId ?? Date.now() + group.id,
                mentions: options?.mentions,
                replyTo: options?.replyTo,
                sourceChannel: options?.sourceChannel,
                sourceContact: options?.sourceContact,
                text,
                threadComments: [],
                threadId: `local-group:${group.id}:${createdAt}:${options?.localId ?? Date.now()}`,
                time,
              }

              return {
                ...group,
                latestActivityAt: createdAt,
                preview: formatMessagePreview(nextMessage) || group.preview,
                time,
                unread: 0,
                messages: [...group.messages, nextMessage],
              }
            })()
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
      mentions?: Message['mentions']
      sourceContact?: Message['sourceContact']
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
                          mentions: options?.mentions,
                          replyTo,
                          sourceContact: options?.sourceContact,
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
      mentions?: Message['mentions']
      sourceContact?: Message['sourceContact']
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
                          mentions: options?.mentions,
                          replyTo,
                          sourceContact: options?.sourceContact,
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

  function isEditableOwnTextMessage(
    message: Pick<
      Message,
      | 'attachment'
      | 'attachmentRemovedNotice'
      | 'author'
      | 'forwarded'
      | 'sourceChannel'
      | 'sourceContact'
      | 'sourceGroup'
      | 'system'
      | 'text'
    >,
  ) {
    return (
      message.author === 'me' &&
      !message.attachment &&
      !message.attachmentRemovedNotice &&
      !message.forwarded &&
      !message.sourceChannel &&
      !message.sourceContact &&
      !message.sourceGroup &&
      !message.system &&
      message.text.trim().length > 0
    )
  }

  function isEditableOwnChannelPost(post: {
    attachment?: ChannelPost['attachment']
    attachmentRemovedNotice?: ChannelPost['attachmentRemovedNotice']
    forwarded?: boolean
    sourceContact?: ChannelPost['sourceContact']
    system?: ChannelPost['system']
    text: string
  }) {
    return (
      !post.attachment &&
      !post.attachmentRemovedNotice &&
      !post.forwarded &&
      !post.sourceContact &&
      !post.system &&
      post.text.trim().length > 0
    )
  }

  function isEditableOwnThreadComment(comment: {
    attachment?: ThreadComment['attachment']
    attachmentRemovedNotice?: ThreadComment['attachmentRemovedNotice']
    author: ThreadComment['author']
    forwarded?: boolean
    sourceChannel?: ThreadComment['sourceChannel']
    sourceContact?: ThreadComment['sourceContact']
    sourceGroup?: Message['sourceGroup']
    system?: Message['system']
    text: string
  }) {
    return (
      comment.author === 'me' &&
      !comment.attachment &&
      !comment.attachmentRemovedNotice &&
      !comment.forwarded &&
      !comment.sourceChannel &&
      !comment.sourceContact &&
      !comment.sourceGroup &&
      !comment.system &&
      comment.text.trim().length > 0
    )
  }

  function applyLocalEditedTextRecord<
    T extends {
      createdAt?: string
      editedAt?: string
      text: string
      time: string
    },
  >(record: T, nextText: string, patch?: Partial<T>): T {
    const editedAt = new Date().toISOString()
    return {
      ...record,
      ...patch,
      createdAt: editedAt,
      editedAt,
      text: nextText,
      time: formatNowTime(),
    } as T
  }

  function applyLocalDirectMessageEdit(chatId: number, messageId: number, nextText: string) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id !== chatId
          ? chat
          : {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId ? applyLocalEditedTextRecord(message, nextText) : message,
              ),
            },
      ),
    )
  }

  function applyLocalGroupMessageEdit(groupId: number, messageId: number, nextText: string) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id !== groupId) {
          return group
        }

        const mentions = buildMessageMentions(nextText, group.participants)
        const nextMentions = mentions.length > 0 ? mentions : undefined
        const sourceContact =
          nextMentions && nextMentions.length > 0
            ? undefined
            : resolveEmbeddedContactFromText(nextText) ?? undefined
        const isLastMessage = group.messages.at(-1)?.id === messageId
        const nextMessages = group.messages.map((message) =>
          message.id === messageId
            ? applyLocalEditedTextRecord(message, nextText, {
                mentions: nextMentions,
                sourceContact,
              })
            : message,
        )
        const editedMessage = nextMessages.find((message) => message.id === messageId)

        return {
          ...group,
          latestActivityAt: isLastMessage ? editedMessage?.createdAt ?? group.latestActivityAt : group.latestActivityAt,
          messages: nextMessages,
          preview: isLastMessage && editedMessage ? formatMessagePreview(editedMessage) : group.preview,
          time: isLastMessage ? editedMessage?.time ?? group.time : group.time,
        }
      }),
    )
  }

  function applyLocalChannelPostEdit(channelId: number, postId: number, nextText: string) {
    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) => {
        if (channel.id !== channelId) {
          return channel
        }

        const isLastPost = channel.posts.at(-1)?.id === postId
        const nextPosts = channel.posts.map((post) =>
          post.id === postId ? applyLocalEditedTextRecord(post, nextText) : post,
        )
        const editedPost = nextPosts.find((post) => post.id === postId)

        return {
          ...channel,
          latestActivityAt: isLastPost ? editedPost?.createdAt ?? channel.latestActivityAt : channel.latestActivityAt,
          posts: nextPosts,
          preview: isLastPost ? nextText || channel.preview : channel.preview,
          time: isLastPost ? editedPost?.time ?? channel.time : channel.time,
        }
      }),
    )

    setPreviewSubscriptionChannel((currentChannel) => {
      if (!currentChannel || currentChannel.id !== channelId) {
        return currentChannel
      }

      const isLastPost = currentChannel.posts.at(-1)?.id === postId
      const nextPosts = currentChannel.posts.map((post) =>
        post.id === postId ? applyLocalEditedTextRecord(post, nextText) : post,
      )
      const editedPost = nextPosts.find((post) => post.id === postId)

      return {
        ...currentChannel,
        latestActivityAt: isLastPost ? editedPost?.createdAt ?? currentChannel.latestActivityAt : currentChannel.latestActivityAt,
        posts: nextPosts,
        preview: isLastPost ? nextText || currentChannel.preview : currentChannel.preview,
        time: isLastPost ? editedPost?.time ?? currentChannel.time : currentChannel.time,
      }
    })
  }

  function applyLocalGroupThreadCommentEdit(groupId: number, messageId: number, commentId: number, nextText: string) {
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
                      ...(function buildUpdatedMessage() {
                        const mentions = buildMessageMentions(nextText, group.participants)
                        const nextMentions = mentions.length > 0 ? mentions : undefined
                        const sourceContact =
                          nextMentions && nextMentions.length > 0
                            ? undefined
                            : resolveEmbeddedContactFromText(nextText) ?? undefined
                        return {
                          ...message,
                          threadComments: (message.threadComments ?? []).map((comment) =>
                            comment.id === commentId
                              ? applyLocalEditedTextRecord(comment, nextText, {
                                  mentions: nextMentions,
                                  sourceContact,
                                })
                              : comment,
                          ),
                        }
                      })(),
                    },
              ),
            },
      ),
    )
  }

  function applyLocalSubscriptionThreadCommentEdit(
    channelId: number,
    postId: number,
    commentId: number,
    nextText: string,
  ) {
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
                      ...(function buildUpdatedPost() {
                        const mentions = buildMessageMentions(nextText, channel.participants)
                        const nextMentions = mentions.length > 0 ? mentions : undefined
                        const sourceContact =
                          nextMentions && nextMentions.length > 0
                            ? undefined
                            : resolveEmbeddedContactFromText(nextText) ?? undefined
                        return {
                          ...post,
                          threadComments: (post.threadComments ?? []).map((comment) =>
                            comment.id === commentId
                              ? applyLocalEditedTextRecord(comment, nextText, {
                                  mentions: nextMentions,
                                  sourceContact,
                                })
                              : comment,
                          ),
                        }
                      })(),
                    },
              ),
            },
      ),
    )

    setPreviewSubscriptionChannel((currentChannel) =>
      !currentChannel || currentChannel.id !== channelId
        ? currentChannel
        : {
            ...currentChannel,
            posts: currentChannel.posts.map((post) =>
              post.id !== postId
                ? post
                : {
                    ...(function buildUpdatedPost() {
                      const mentions = buildMessageMentions(nextText, currentChannel.participants)
                      const nextMentions = mentions.length > 0 ? mentions : undefined
                      const sourceContact =
                        nextMentions && nextMentions.length > 0
                          ? undefined
                          : resolveEmbeddedContactFromText(nextText) ?? undefined
                      return {
                        ...post,
                        threadComments: (post.threadComments ?? []).map((comment) =>
                          comment.id === commentId
                            ? applyLocalEditedTextRecord(comment, nextText, {
                                mentions: nextMentions,
                                sourceContact,
                              })
                            : comment,
                        ),
                      }
                    })(),
                  },
            ),
          },
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
      sourceContact?: Message['sourceContact']
      system?: boolean
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
      sourceContact: options?.sourceContact,
      system: Boolean(options?.system),
      text,
      threadComments: [],
      time,
    }
    const normalizedHandle = sanitizeChannelDirectLink(managedChannel.directLink)
    const fallbackPreview = managedChannel.statusText || managedChannel.description || 'Канал'

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
              description: managedChannel.description,
              latestActivityAt: createdAt,
              posts: [...channel.posts, nextPost],
              preview: text || formatAttachmentPreviewText(options?.attachment) || fallbackPreview,
              statusText: managedChannel.statusText,
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
            description: managedChannel.description,
            latestActivityAt: createdAt,
            posts: [...currentChannel.posts, nextPost],
            preview: text || formatAttachmentPreviewText(options?.attachment) || fallbackPreview,
            statusText: managedChannel.statusText,
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
      managedChannel?.statusText ?? managedChannel?.description ?? previewSubscriptionChannel?.preview ?? 'Пока пусто'
    const matchingSubscriptionChannelIds = new Set(
      subscriptionChannels
        .filter((channel) =>
          channel.id === channelId ||
          (managedChannelHandle !== '' && sanitizeChannelDirectLink(channel.handle) === managedChannelHandle),
        )
        .map((channel) => channel.id),
    )
    if (
      previewSubscriptionChannel &&
      (previewSubscriptionChannel.id === channelId ||
        (managedChannelHandle !== '' &&
          sanitizeChannelDirectLink(previewSubscriptionChannel.handle) === managedChannelHandle))
    ) {
      matchingSubscriptionChannelIds.add(previewSubscriptionChannel.id)
    }

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

    setThreadInbox((currentThreadInbox) =>
      currentThreadInbox.filter(
        (item) =>
          item.kind !== 'channel' ||
          !matchingSubscriptionChannelIds.has(item.channelId) ||
          item.postId !== postId,
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
    presentation?: NonNullable<Message['attachment']>['presentation']
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
        presentation: attachmentDraft.presentation,
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
      presentation: attachmentDraft.presentation,
      size: attachmentDraft.size,
      width: attachmentDraft.width,
    } satisfies NonNullable<Message['attachment']>
  }

  async function resolvePendingAttachmentForSend(
    sessionToken: string,
    attachmentDraft?: PendingAttachmentDraft,
    options?: {
      onProgress?: (progress: number) => void
      surface: 'channel' | 'direct' | 'group' | 'support' | 'thread'
    },
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
          presentation: attachmentDraft.presentation,
          size: attachmentDraft.size,
          width: attachmentDraft.width,
        } satisfies NonNullable<Message['attachment']>,
        attachmentDraft: {
          ...attachmentDraft,
          uploadProgress: attachmentDraft.uploadProgress,
        },
      }
    }

    if (!attachmentDraft.file) {
      throw new Error('Вложение больше недоступно локально. Добавьте файл заново.')
    }

    let uploadedMedia

    try {
      uploadedMedia = await uploadMediaFile(
        sessionToken,
        attachmentDraft.file,
        'attachment',
        attachmentDraft.fileName,
        { onProgress: options?.onProgress },
      )
    } catch (error) {
      trackAttachmentUploadFailed(attachmentDraft, error, options?.surface ?? 'direct')

      throw error
    }

    return {
      attachment: {
        // The server validates attachments against the registered pending upload metadata.
        // After image compression/re-encode the stored upload can have a different file name,
        // so sends must use the uploaded descriptor rather than the stale local draft name.
        fileName: uploadedMedia.fileName,
        height: attachmentDraft.height,
        mediaUrl: uploadedMedia.mediaUrl,
        mimeType: uploadedMedia.mimeType,
        presentation: attachmentDraft.presentation,
        size: uploadedMedia.size,
        width: attachmentDraft.width,
      } satisfies NonNullable<Message['attachment']>,
      attachmentDraft: {
        fileName: uploadedMedia.fileName,
        height: attachmentDraft.height,
        mediaUrl: uploadedMedia.mediaUrl,
        mimeType: uploadedMedia.mimeType,
        presentation: attachmentDraft.presentation,
        size: uploadedMedia.size,
        uploadProgress: PENDING_ATTACHMENT_FINALIZING_PROGRESS,
        width: attachmentDraft.width,
      } satisfies PendingAttachmentDraft,
    }
  }

  function applyLocalDeleteGroupMessage(groupId: number, messageId: number) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id !== groupId) return group

        const nextMessages = group.messages.filter((message) => message.id !== messageId)
        const latestMessage = nextMessages.at(-1)

        return {
          ...group,
          latestActivityAt: latestMessage?.createdAt,
          messages: nextMessages,
          preview: latestMessage ? formatMessagePreview(latestMessage) || group.preview : 'Группа создана. Можно начинать обсуждение.',
          time: latestMessage?.time ?? '',
        }
      }),
    )

    setThreadInbox((currentThreadInbox) =>
      currentThreadInbox.filter(
        (item) => item.kind !== 'group' || item.groupId !== groupId || item.messageId !== messageId,
      ),
    )
  }

  async function createComposerDraft(
    file: File,
    options?: {
      presentation?: NonNullable<Message['attachment']>['presentation']
      previewUrl?: string
    },
  ) {
    return await buildComposerAttachmentDraft(file, {
      ...options,
      // Keep file-size validation aligned with the server: free users can attach
      // files up to 10 MB, premium users up to 200 MB.
      maxFileUploadCopy: sessionHasPremium
        ? 'Максимальный размер 200 МБ.'
        : 'Максимальный размер 10 МБ. С премиумом доступно до 200 МБ.',
      maxFileUploadSizeBytes: sessionHasPremium
        ? premiumMessageFileUploadMaxSizeBytes
        : messageFileUploadMaxSizeBytes,
    })
  }

  async function prepareVideoNoteDraftForImmediateSend(file: File) {
    const nextAttachmentDraft = await createComposerDraft(file, {
      presentation: 'video-note',
    })

    if (nextAttachmentDraft.status === 'error') {
      const nextErrorMessage =
        nextAttachmentDraft.error?.trim() || 'Не удалось подготовить видеосообщение.'
      releaseComposerAttachmentDraft(nextAttachmentDraft)
      throw new Error(nextErrorMessage)
    }

    if (nextAttachmentDraft.status !== 'ready') {
      releaseComposerAttachmentDraft(nextAttachmentDraft)
      throw new Error('Не удалось подготовить видеосообщение.')
    }

    return nextAttachmentDraft
  }

  function getClipboardImageFile(event: ReactClipboardEvent<HTMLElement>) {
    const clipboardItems = event.clipboardData?.items
    if (!clipboardItems || clipboardItems.length === 0) {
      return null
    }

    for (const item of Array.from(clipboardItems)) {
      if (!item.type.startsWith('image/')) continue
      return item.getAsFile()
    }

    return null
  }

  async function handlePastedComposerImage(
    event: ReactClipboardEvent<HTMLElement>,
    options: {
      getSelectionToken: () => number
      replaceDraft: (draft: ComposerAttachmentDraft) => void
      restorePreparedDraft: (selectionToken: number, draft: ComposerAttachmentDraft) => void
      surface: 'channel' | 'direct' | 'group' | 'support' | 'thread'
    },
  ) {
    // Clipboard images must go through the exact same composer draft pipeline as picker uploads.
    // If there is no image in the clipboard, we must not block the regular text paste behavior.
    const file = getClipboardImageFile(event)
    if (!file) {
      return
    }

    event.preventDefault()

    const selectionToken = options.getSelectionToken()
    const preparingDraft = createPreparingComposerAttachmentDraft(file)
    options.replaceDraft(preparingDraft)

    const nextAttachmentDraft = applyPhotoSendOriginalPreferenceToDraft(
      await createComposerDraft(file, { previewUrl: preparingDraft.previewUrl }),
    )
    trackAttachmentSelected(
      options.surface,
      file,
      sessionHasPremium && photoSendOriginalPreference,
    )
    options.restorePreparedDraft(selectionToken, nextAttachmentDraft)
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
      trackAnalyticsEvent('gif_uploaded', {
        fileName: file.name,
        size: file.size,
        source: 'local',
      })
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
        trackAnalyticsEvent('gif_uploaded', {
          fileName: file.name,
          size: uploadedMedia.size,
          source: 'upload',
        })

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
      if (error instanceof ApiError && error.status === 429) {
        throw error
      }

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

  async function uploadAndAttachSupportGif(file: File) {
    const gif = await uploadUserGifToLibrary(file)
    attachSupportGif(gif)
  }

  async function searchAvailableGifs(query: string) {
    const normalizedQuery = query.trim()

    if (!normalizedQuery) {
      lastTrackedGifSearchKeyRef.current = null
      return []
    }

    const source = !session?.sessionToken || !backendReady ? 'local' : 'server'
    const searchAnalyticsKey = `${source}:${normalizedQuery.toLowerCase()}`
    if (lastTrackedGifSearchKeyRef.current !== searchAnalyticsKey) {
      lastTrackedGifSearchKeyRef.current = searchAnalyticsKey
      trackAnalyticsEvent('gif_search_used', {
        queryLength: normalizedQuery.length,
        source,
      })
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
      trackAnalyticsEvent('gif_deleted', {
        fileName: gif.fileName,
        source: 'local',
      })
      return
    }

    const response = await deleteUserGifRequest(session.sessionToken, gif.id)
    applySnapshot(response.snapshot)
    trackAnalyticsEvent('gif_deleted', {
      fileName: gif.fileName,
      source: 'server',
    })
  }

  async function addGifAttachmentToLibrary(attachment: MessageAttachment) {
    if (!session) {
      throw new Error('Нужна активная сессия.')
    }

    const existingDuplicate = findDuplicateUserGif(session.gifLibrary ?? [], attachment)
    if (existingDuplicate) {
      throw new Error(duplicateUserGifMessage)
    }

    if (!(backendReady && session.sessionToken)) {
      const nextGif = buildUserGifRegistrationBodyFromAttachment(attachment)
      applyLocalGifLibrary([nextGif, ...(session.gifLibrary ?? [])])
      trackAnalyticsEvent('gif_added_from_viewer', {
        fileName: attachment.fileName,
        source: 'local',
      })
      return nextGif
    }

    const response = await registerUserGif(
      session.sessionToken,
      buildUserGifRegistrationBodyFromAttachment(attachment),
    )
    applySnapshot(response.snapshot)
    trackAnalyticsEvent('gif_added_from_viewer', {
      fileName: attachment.fileName,
      source: 'server',
    })

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

  function attachSupportGif(gif: UserGifLibraryItem) {
    supportAttachmentSelectionTokenRef.current += 1
    setSupportAttachmentDraft((currentDraft) => {
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

  function renameChatAttachmentFileBaseName(chatId: number, nextBaseName: string) {
    setChatAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[chatId]
      if (!currentDraft) return currentAttachments

      return {
        ...currentAttachments,
        [chatId]: setComposerAttachmentFileBaseName(currentDraft, nextBaseName),
      }
    })
  }

  function renameGroupAttachmentFileBaseName(groupId: number, nextBaseName: string) {
    setGroupAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[groupId]
      if (!currentDraft) return currentAttachments

      return {
        ...currentAttachments,
        [groupId]: setComposerAttachmentFileBaseName(currentDraft, nextBaseName),
      }
    })
  }

  function renameChannelAttachmentFileBaseName(channelId: number, nextBaseName: string) {
    setChannelAttachmentDrafts((currentAttachments) => {
      const currentDraft = currentAttachments[channelId]
      if (!currentDraft) return currentAttachments

      return {
        ...currentAttachments,
        [channelId]: setComposerAttachmentFileBaseName(currentDraft, nextBaseName),
      }
    })
  }

  function renameThreadAttachmentFileBaseName(nextBaseName: string) {
    setThreadAttachmentDraft((currentDraft) => {
      if (!currentDraft) return currentDraft
      return setComposerAttachmentFileBaseName(currentDraft, nextBaseName)
    })
  }

  function renameSupportAttachmentFileBaseName(nextBaseName: string) {
    setSupportAttachmentDraft((currentDraft) => {
      if (!currentDraft) return currentDraft
      return setComposerAttachmentFileBaseName(currentDraft, nextBaseName)
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

  function getCurrentGroupAvatarPreview() {
    if (!groupAvatarPickerTarget) return null

    if (groupAvatarPickerDraft) {
      return groupAvatarPickerDraft.previewUrl
    }

    if (groupAvatarPickerTarget.scope === 'create') {
      return creatingGroupAvatarDraft?.previewUrl ?? null
    }

    return (
      groupSettingsAvatarDraft?.previewUrl ??
      groupSettingsDraft?.avatarImage ??
      groups.find((group) => group.id === groupAvatarPickerTarget.groupId)?.avatarImage ??
      null
    )
  }

  function getCurrentGroupAvatarTone() {
    if (!groupAvatarPickerTarget) return creatingGroupAccent

    if (groupAvatarPickerTarget.scope === 'create') {
      return creatingGroupAccent
    }

    return groups.find((group) => group.id === groupAvatarPickerTarget.groupId)?.accent ?? creatingGroupAccent
  }

  function getCurrentGroupAvatarTitle() {
    if (!groupAvatarPickerTarget) {
      return creatingGroupTitle.trim() || buildDefaultGroupTitle(session)
    }

    if (groupAvatarPickerTarget.scope === 'create') {
      return creatingGroupTitle.trim() || buildDefaultGroupTitle(session)
    }

    return (
      groupSettingsDraft?.title.trim() ||
      groups.find((group) => group.id === groupAvatarPickerTarget.groupId)?.title ||
      'Группа'
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
    setCreatingGroupDescription('')
    setCreatingGroupAccent(channelAvatarTones[0])
    setCreatingGroupAvatarDraft(null)
    setCreatingGroupCommentsForAll(false)
    setCreatingGroupCommentsForPremium(false)
    setCreatingGroupBlacklistIdentifiers([])
    setCreatingGroupMemberChatIds(nextSelectedChatIds)
    setCreatingGroupBusy(false)
    setCreatingGroupError('')
    setCreatingGroupSelectionHint('')
    setGroupAvatarPickerTarget(null)
    setGroupAvatarPickerDraft(null)
    setGroupSettingsAvatarDraft(null)
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
    setCreatingGroupDescription('')
    setCreatingGroupAccent(channelAvatarTones[0])
    setCreatingGroupAvatarDraft(null)
    setCreatingGroupCommentsForAll(false)
    setCreatingGroupCommentsForPremium(false)
    setCreatingGroupBlacklistIdentifiers([])
    setCreatingGroupMemberChatIds([])
    setCreatingGroupBusy(false)
    setCreatingGroupError('')
    setCreatingGroupSelectionHint('')
    setGroupAvatarPickerTarget(null)
    setGroupAvatarPickerDraft(null)
    setGroupSettingsAvatarDraft(null)
    setGroupAvatarPickerError('')
    setGroupAvatarPickerMode('device')
    setGroupAvatarPickerBusy(false)

    if (groupAvatarInputRef.current) {
      groupAvatarInputRef.current.value = ''
    }
  }

  function openGroupAvatarPicker(target: GroupAvatarPickerTarget) {
    groupAvatarSelectionTokenRef.current += 1
    setGroupAvatarPickerTarget(target)
    setGroupAvatarPickerError('')
    setGroupAvatarPickerMode('device')
    setGroupAvatarPickerBusy(false)

    if (target.scope === 'create') {
      setGroupAvatarPickerDraft(creatingGroupAvatarDraft)
      return
    }

    setGroupAvatarPickerDraft(groupSettingsAvatarDraft)
  }

  function closeGroupAvatarPicker(options?: { preserveCurrentDraft?: boolean }) {
    groupAvatarSelectionTokenRef.current += 1

    if (!options?.preserveCurrentDraft) {
      const shouldPreserveSavedDraft =
        groupAvatarPickerDraft !== null &&
        (
          (groupAvatarPickerTarget?.scope === 'create' &&
            groupAvatarPickerDraft === creatingGroupAvatarDraft) ||
          (groupAvatarPickerTarget?.scope === 'existing' &&
            groupAvatarPickerDraft === groupSettingsAvatarDraft)
        )

      if (!shouldPreserveSavedDraft) {
        releaseChannelAvatarDraft(groupAvatarPickerDraft)
      }
    }

    setGroupAvatarPickerTarget(null)
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
          currentDraft !== null &&
          (
            currentDraft === creatingGroupAvatarDraft ||
            currentDraft === groupSettingsAvatarDraft
          )

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

  async function applyGroupAvatarSelection() {
    if (!groupAvatarPickerTarget || !groupAvatarPickerDraft) return

    setGroupAvatarPickerBusy(true)
    setGroupAvatarPickerError('')

    try {
      let nextDraft = groupAvatarPickerDraft

      if (groupAvatarPickerDraft.kind === 'upload') {
        if (!groupAvatarPickerDraft.file) {
          throw new Error('Сначала выберите изображение для загрузки.')
        }

        if (backendReady && session?.sessionToken) {
          const uploadedMedia = await uploadMediaFile(
            session.sessionToken,
            groupAvatarPickerDraft.file,
            'group-avatar',
          )

          releaseChannelAvatarDraft(groupAvatarPickerDraft)
          nextDraft = {
            kind: 'uploaded',
            attachment: {
              fileName: uploadedMedia.fileName,
              mediaUrl: uploadedMedia.mediaUrl,
              mimeType: uploadedMedia.mimeType,
              size: uploadedMedia.size,
            },
            label: groupAvatarPickerDraft.label,
            previewUrl: uploadedMedia.mediaUrl,
          }
        } else {
          nextDraft = {
            kind: 'uploaded',
            attachment: groupAvatarPickerDraft.file
              ? {
                  fileName: groupAvatarPickerDraft.file.name,
                  mediaUrl: groupAvatarPickerDraft.previewUrl,
                  mimeType: groupAvatarPickerDraft.file.type,
                  size: groupAvatarPickerDraft.file.size,
                }
              : groupAvatarPickerDraft.attachment,
            label: groupAvatarPickerDraft.label,
            previewUrl: groupAvatarPickerDraft.previewUrl,
          }
        }
      }

      if (groupAvatarPickerTarget.scope === 'create') {
        if (creatingGroupAvatarDraft && creatingGroupAvatarDraft !== groupAvatarPickerDraft) {
          releaseChannelAvatarDraft(creatingGroupAvatarDraft)
        }

        setCreatingGroupAvatarDraft(nextDraft)
      } else {
        setGroupSettingsAvatarDraft((currentDraft) => {
          if (currentDraft && currentDraft !== groupAvatarPickerDraft) {
            releaseChannelAvatarDraft(currentDraft)
          }

          return nextDraft
        })
        updateGroupSettingsDraft({ avatarImage: nextDraft.previewUrl })
      }

      closeGroupAvatarPicker({ preserveCurrentDraft: true })
    } catch (error) {
      console.error('Failed to apply group avatar selection', error)
      setGroupAvatarPickerError(
        error instanceof Error ? error.message : 'Не удалось применить аватарку группы.',
      )
      setGroupAvatarPickerBusy(false)
    }
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

  async function toggleQuietMode() {
    const nextQuietModeEnabled = !quietMode
    setQuietMode(nextQuietModeEnabled)

    if (!session) return

    // Product invariant:
    // quiet-mode may temporarily auto-enable invisibility, but only an auto-enabled invisibility
    // is allowed to auto-disable again when `Тихо` is turned off.
    const nextInvisibilityState = resolveQuietModeInvisibilityState({
      autoInvisibility: effectiveQuietModeSettings.autoInvisibility,
      currentInvisibilityAutoEnabled: invisibilityAutoEnabled,
      currentInvisibilityEnabled: invisibilityPreferenceEnabled,
      currentQuietModeEnabled: quietMode,
      nextQuietModeEnabled,
    })

    if (backendReady && session.sessionToken) {
      try {
        const response = await updateSessionRequest(session.sessionToken, {
          quietModeEnabled: nextQuietModeEnabled,
        })
        applySnapshot(response.snapshot)
        trackAnalyticsEvent(nextQuietModeEnabled ? 'quiet_mode_enabled' : 'quiet_mode_disabled', {
          hasPremium: sessionHasPremium,
          invisibilityEnabledAfterToggle: nextInvisibilityState.invisibilityEnabled,
          source: 'main-quiet-toggle',
        })
        return
      } catch (error) {
        console.error('Failed to update quiet mode', error)
      }
    }

    syncSession({
      ...session,
      invisibilityAutoEnabled: nextInvisibilityState.invisibilityAutoEnabled,
      invisibilityEnabled: nextInvisibilityState.invisibilityEnabled,
      quietModeEnabled: nextQuietModeEnabled,
    })
    trackAnalyticsEvent(nextQuietModeEnabled ? 'quiet_mode_enabled' : 'quiet_mode_disabled', {
      hasPremium: sessionHasPremium,
      invisibilityEnabledAfterToggle: nextInvisibilityState.invisibilityEnabled,
      source: 'main-quiet-toggle',
    })
  }

  async function updateQuietModeSettingsPreference(
    patch: Partial<QuietModeSettings>,
  ) {
    if (!session) return

    const nextQuietModeSettings = normalizeQuietModeSettings({
      ...storedQuietModeSettings,
      ...patch,
    })
    const changedSettingEntries = Object.entries(patch) as Array<[keyof QuietModeSettings, boolean | undefined]>
    const changedSetting = changedSettingEntries.find(([, value]) => value !== undefined) ?? null

    setQuietSettingsBusy(true)
    setQuietSettingsError('')

    if (backendReady && session.sessionToken) {
      try {
        const response = await updateSessionRequest(session.sessionToken, {
          quietModeSettings: nextQuietModeSettings,
        })
        applySnapshot(response.snapshot)
        if (changedSetting) {
          trackAnalyticsEvent('quiet_settings_changed', {
            enabled: Boolean(changedSetting[1]),
            hasPremium: sessionHasPremium,
            settingKey: changedSetting[0],
          })
        }
        return
      } catch (error) {
        console.error('Failed to update quiet mode settings', error)
        setQuietSettingsError(
          error instanceof Error ? error.message : 'Не удалось сохранить настройки режима «Тихо».',
        )
      } finally {
        setQuietSettingsBusy(false)
      }

      return
    }

    syncSession({
      ...session,
      quietModeSettings: nextQuietModeSettings,
    })
    setQuietSettingsBusy(false)
    if (changedSetting) {
      trackAnalyticsEvent('quiet_settings_changed', {
        enabled: Boolean(changedSetting[1]),
        hasPremium: sessionHasPremium,
        settingKey: changedSetting[0],
      })
    }
  }

  async function setInvisibilityPreference(nextInvisibilityEnabled: boolean) {
    if (!session) return

    // Premium gate invariant:
    // the settings checkbox must never locally fake-enable invisible mode for free users.
    // The only allowed non-premium action here is redirecting into the premium purchase flow.
    if (!sessionHasPremium) {
      openPremiumUpsell()
      return
    }

    if (backendReady && session.sessionToken) {
      try {
        const response = await updateSessionRequest(session.sessionToken, {
          invisibilityEnabled: nextInvisibilityEnabled,
        })
        applySnapshot(response.snapshot)
        trackAnalyticsEvent(
          nextInvisibilityEnabled
            ? 'forced_invisible_mode_enabled'
            : 'forced_invisible_mode_disabled',
          {
            source: 'settings-profile',
          },
        )
        return
      } catch (error) {
        console.error('Failed to update invisibility mode', error)
      }
    }

    syncSession({
      ...session,
      invisibilityAutoEnabled: false,
      invisibilityEnabled: nextInvisibilityEnabled,
    })
    trackAnalyticsEvent(
      nextInvisibilityEnabled ? 'forced_invisible_mode_enabled' : 'forced_invisible_mode_disabled',
      {
        source: 'settings-profile',
      },
    )
  }

  async function sendSupportMessage() {
    const text = supportDraft.trim()
    const attachmentDraft = supportAttachmentDraft
    if (supportBusy) return
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    if (!text && !attachment) return
    if (supportCooldownActive) {
      setSupportError('')
      return
    }

    if (!backendReady || !session?.sessionToken) {
      setSupportError('Поддержка временно недоступна без подключения к серверу.')
      return
    }

    setSupportBusy(true)
    setSupportError('')

    try {
      const resolvedAttachment = await resolvePendingAttachmentForSend(
        session.sessionToken,
        attachmentDraft,
        { surface: 'support' },
      )
      const response = await sendSupportTicketRequest(session.sessionToken, {
        attachment: resolvedAttachment.attachment,
        clientDeliveryId: getClientDeliveryId(),
        text,
      })
      // Enter cooldown locally right away. This protects the support scene from transient ordering
      // issues between the mutation response, background snapshot sync, and the browser clock.
      const localCooldownUntil = new Date(Date.now() + supportTicketCooldownMs).toISOString()
      const nextCooldownUntil =
        localCooldownUntil ??
        response.snapshot.supportTicketCooldownUntil ??
        resolveSupportCooldownUntilFromTickets(response.snapshot.supportTickets)
      applySnapshot(response.snapshot)
      setSupportComposerCooldownUntil(nextCooldownUntil)
      setSupportTicketCooldownUntil(nextCooldownUntil)
      setSupportError('')
      setSupportDraft('')
      clearSupportAttachmentDraft()
      trackAnalyticsEvent('support_ticket_created', {
        hasAttachment: Boolean(resolvedAttachment.attachment),
        source: 'settings-support',
      })
    } catch (error) {
      console.error('Failed to create support ticket', error)
      const errorMessage = error instanceof Error ? error.message : 'Не удалось отправить обращение.'
      if (errorMessage === supportCooldownErrorMessage) {
        const fallbackCooldownUntil =
          resolveSupportCooldownUntilFromTickets(supportTickets) ??
          new Date(Date.now() + supportTicketCooldownMs).toISOString()
        if (fallbackCooldownUntil) {
          setSupportComposerCooldownUntil(fallbackCooldownUntil)
          setSupportTicketCooldownUntil(fallbackCooldownUntil)
          setSupportError('')
          return
        }
      }
      setSupportError(errorMessage)
    } finally {
      setSupportBusy(false)
    }
  }

  function openSupportTicketThread(ticketId: number) {
    // Support invariant:
    // opening a support ticket must only open its thread. Root tickets are created separately,
    // and replies live exclusively in comments so support never behaves like a normal direct chat.
    openTrackedThread({ kind: 'support', ticketId })
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

  useEffect(() => {
    const syncInFlightRoomKey = activeRoomReadSyncRoomKeyRef.current

    if (!shouldSyncActiveRoomRead({
      documentVisible,
      syncInFlightRoomKey,
      target: activeRoomReadTarget,
    })) {
      return
    }

    const roomKey = getActiveRoomReadKey(activeRoomReadTarget)
    if (!roomKey || !activeRoomReadTarget) {
      return
    }

    // Read-state invariant:
    // if a room is open and visible, incoming direct/group/channel items that the
    // user already sees must be acknowledged immediately and must never come back
    // as stale unread badges after leaving the room.
    activeRoomReadSyncRoomKeyRef.current = roomKey

    const syncPromise =
      activeRoomReadTarget.kind === 'chat'
        ? syncDialogRead(activeRoomReadTarget.id)
        : activeRoomReadTarget.kind === 'group'
          ? syncGroupRead(activeRoomReadTarget.id)
          : syncSubscriptionChannelRead(activeRoomReadTarget.id)

    void syncPromise.finally(() => {
      if (activeRoomReadSyncRoomKeyRef.current === roomKey) {
        activeRoomReadSyncRoomKeyRef.current = null
      }
    })
  }, [
    activeRoomReadTarget,
    documentVisible,
  ])

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
    } | {
      kind: 'support'
      ticketId: number
      threadId: string
    },
  ) => {
    if (target.kind === 'support') {
      applyLocalSupportTicketRead(target.ticketId)
    } else {
      applyLocalThreadRead(target.threadId)
    }

    if (!backendReady || !session?.sessionToken) {
      return
    }

    try {
      const response =
        target.kind === 'group'
          ? await markGroupThreadReadRequest(session.sessionToken, target.groupId, target.messageId)
          : target.kind === 'channel'
            ? await markSubscriptionChannelThreadReadRequest(
              session.sessionToken,
              target.channelId,
              target.postId,
            )
            : await markSupportTicketReadRequest(session.sessionToken, target.ticketId)
      applySnapshot(response.snapshot)
    } catch (error) {
      console.error('Failed to mark thread as read', error)
    }
  }, [applySnapshot, backendReady, session?.sessionToken, supportTickets])

  useEffect(() => {
    if (!threadTarget || !activeThreadId || !documentVisible || activeThreadServerUnreadCount <= 0) {
      activeThreadReadSyncKeyRef.current = null
      return
    }

    const syncKey = `${activeThreadId}:${activeThreadLatestActivityAt ?? ''}:${activeThreadServerUnreadCount}`
    if (activeThreadReadSyncKeyRef.current === syncKey) return
    activeThreadReadSyncKeyRef.current = syncKey

    void syncActiveThreadRead(
      threadTarget.kind === 'group'
        ? {
            groupId: threadTarget.groupId,
            kind: 'group',
            messageId: threadTarget.messageId,
            threadId: activeThreadId,
          }
        : threadTarget.kind === 'channel'
          ? {
            channelId: threadTarget.channelId,
            kind: 'channel',
            postId: threadTarget.postId,
            threadId: activeThreadId,
          }
          : {
            kind: 'support',
            ticketId: threadTarget.ticketId,
            threadId: activeThreadId,
          },
    )
  }, [
    activeThreadId,
    activeThreadLatestActivityAt,
    activeThreadServerUnreadCount,
    documentVisible,
    syncActiveThreadRead,
    threadTarget,
  ])

  useEffect(() => {
    if (threadTarget && activeThreadId && documentVisible && activeThreadServerUnreadCount > 0) return
    activeThreadReadSyncKeyRef.current = null
  }, [activeThreadId, activeThreadServerUnreadCount, documentVisible, threadTarget])

  async function toggleThreadSubscription(subscribe: boolean) {
    if (!threadTarget || !activeThreadId) return
    if (threadTarget.kind === 'support') return

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

  async function sendMessage(attachmentDraftOverride?: ComposerAttachmentDraft) {
    if (!activeChat) return
    if (activeChat.blockedByAdmin) return
    if ((activeChat.contactState ?? 'accepted') !== 'accepted') return

    const chatId = activeChat.id
    const attachmentDraft = attachmentDraftOverride ?? chatAttachmentDrafts[chatId]
    const text = isVideoNoteDraft(attachmentDraft) ? '' : (chatMessageDrafts[chatId] ?? '').trim()
    if (directMessageEditTarget) {
      if (text === directMessageEditTarget.text) {
        cancelDirectMessageEdit(chatId)
        return
      }

      if (!text) return

      if (backendReady && session?.sessionToken) {
        try {
          const response = await editDirectMessageRequest(
            session.sessionToken,
            chatId,
            directMessageEditTarget.id,
            { text },
          )
          applySnapshot(response.snapshot)
          cancelDirectMessageEdit(chatId)
        } catch (error) {
          console.error('Failed to edit direct message', error)
        }
      } else {
        applyLocalDirectMessageEdit(chatId, directMessageEditTarget.id, text)
        cancelDirectMessageEdit(chatId)
      }
      return
    }
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const replyTo = replyTarget
      ? {
          author: replyTarget.author,
          id: replyTarget.id,
          text: replyTarget.text,
        }
      : undefined
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    const sourceContact = resolveEmbeddedContactFromText(text)
    if (attachmentDraftOverride) {
      releaseComposerAttachmentDraft(attachmentDraftOverride)
    }

    if (!text && !attachment) return

    playSendSound()
    requestRoomFeedScrollToBottom('local-send')

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

    applyLocalDirectMessage(chatId, text, {
      attachment,
      createdAt,
      deliveryId,
      localId,
      replyTo,
      sourceContact: sourceContact ?? undefined,
      time,
    })
    queuePendingDirectMessage(pendingMessage)
    clearChatComposer(chatId)
    setReplyTarget(null)

    if (backendReady && session?.sessionToken) {
      try {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          pendingMessage.attachmentDraft,
          {
            onProgress: (progress) => setPendingDirectMessageUploadProgress(localId, progress),
            surface: 'direct',
          },
        )

        if (
          resolvedAttachment.attachmentDraft?.mediaUrl &&
          resolvedAttachment.attachmentDraft.mediaUrl !== pendingMessage.attachmentDraft?.mediaUrl
        ) {
          updatePendingDirectMessage(localId, (message) => ({
            ...message,
            attachment: preservePendingAttachmentPreview(message.attachment, resolvedAttachment.attachment),
            attachmentDraft: resolvedAttachment.attachmentDraft,
          }))
        }

        const response = await sendDirectMessageRequest(session.sessionToken, chatId, {
          attachment: resolvedAttachment.attachment,
          clientDeliveryId: deliveryId,
          markAsRead: true,
          replyTo,
          sourceContact: sourceContact ?? undefined,
          text,
        })
        removePendingDirectMessage(localId)
        applySnapshot(response.snapshot)
        trackAnalyticsEvent('direct_message_send_succeeded', {
          attachmentKind: getAnalyticsAttachmentKind(attachment),
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
          presentation: getAnalyticsAttachmentPresentation(attachment),
        })
        trackPendingVideoNoteSendSucceeded()
      } catch (error) {
        console.error('Failed to send direct message', error)
        if (isExpiredSessionError(error)) {
          markPendingDirectMessageAttemptFailed(localId)
          trackPendingVideoNoteSendFailed(
            getAnalyticsReason(error, 'Не удалось отправить видеосообщение в диалог.'),
          )
          queueSessionRecovery('Подключение к сессии временно прервано. Пытаемся восстановить доступ.')
          return
        }
        markPendingDirectMessageAttemptFailed(localId)
        trackAnalyticsEvent('direct_message_send_failed', {
          attachmentKind: getAnalyticsAttachmentKind(attachment),
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
          presentation: getAnalyticsAttachmentPresentation(attachment),
        })
        trackPendingVideoNoteSendFailed(
          getAnalyticsReason(error, 'Не удалось отправить видеосообщение в диалог.'),
        )
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

  async function sendGroupMessage(attachmentDraftOverride?: ComposerAttachmentDraft) {
    if (!activeGroup) return
    if (activeGroupWriteBlockReason) return

    const groupId = activeGroup.id
    const attachmentDraft = attachmentDraftOverride ?? groupAttachmentDrafts[groupId]
    const text = isVideoNoteDraft(attachmentDraft) ? '' : (groupMessageDrafts[groupId] ?? '').trim()
    if (groupMessageEditTarget) {
      if (text === groupMessageEditTarget.text) {
        cancelGroupMessageEdit(groupId)
        return
      }

      if (!text) return

      if (backendReady && session?.sessionToken) {
        try {
          const response = await editGroupMessageRequest(
            session.sessionToken,
            groupId,
            groupMessageEditTarget.id,
            { text },
          )
          applySnapshot(response.snapshot)
          cancelGroupMessageEdit(groupId)
        } catch (error) {
          console.error('Failed to edit group message', error)
        }
      } else {
        applyLocalGroupMessageEdit(groupId, groupMessageEditTarget.id, text)
        cancelGroupMessageEdit(groupId)
      }
      return
    }
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const replyTo = replyTarget
      ? {
          author: replyTarget.author,
          id: replyTarget.id,
          text: replyTarget.text,
        }
      : undefined
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    if (attachmentDraftOverride) {
      releaseComposerAttachmentDraft(attachmentDraftOverride)
    }
    const mentions = buildMessageMentions(text, activeGroup.participants)
    const sourceContact =
      mentions.length > 0 ? undefined : resolveEmbeddedContactFromText(text) ?? undefined
    if (!text && !attachment) return

    playSendSound()
    requestRoomFeedScrollToBottom('local-send')

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

    applyLocalGroupMessage(groupId, text, {
      attachment,
      createdAt,
      deliveryId,
      localId,
      mentions: mentions.length > 0 ? mentions : undefined,
      replyTo,
      sourceContact,
      time,
    })
    queuePendingGroupMessage(pendingMessage)
    clearGroupComposer(groupId)
    setReplyTarget(null)
    closeGroupMessageActions()

    if (backendReady && session?.sessionToken) {
      try {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          pendingMessage.attachmentDraft,
          {
            onProgress: (progress) => setPendingGroupMessageUploadProgress(localId, progress),
            surface: 'group',
          },
        )

      if (
        resolvedAttachment.attachmentDraft?.mediaUrl &&
        resolvedAttachment.attachmentDraft.mediaUrl !== pendingMessage.attachmentDraft?.mediaUrl
      ) {
        updatePendingGroupMessage(localId, (message) => ({
          ...message,
          attachment: preservePendingAttachmentPreview(message.attachment, resolvedAttachment.attachment),
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
          attachmentKind: getAnalyticsAttachmentKind(attachment),
          groupId,
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
          presentation: getAnalyticsAttachmentPresentation(attachment),
        })
        trackPendingVideoNoteSendSucceeded()
      } catch (error) {
        console.error('Failed to send group message', error)
        if (isExpiredSessionError(error)) {
          markPendingGroupMessageAttemptFailed(localId)
          trackPendingVideoNoteSendFailed(
            getAnalyticsReason(error, 'Не удалось отправить видеосообщение в группу.'),
          )
          queueSessionRecovery('Подключение к сессии временно прервано. Пытаемся восстановить доступ.')
          return
        }
        markPendingGroupMessageAttemptFailed(localId)
        trackAnalyticsEvent('group_message_send_failed', {
          attachmentKind: getAnalyticsAttachmentKind(attachment),
          groupId,
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
          presentation: getAnalyticsAttachmentPresentation(attachment),
        })
        trackPendingVideoNoteSendFailed(
          getAnalyticsReason(error, 'Не удалось отправить видеосообщение в группу.'),
        )
      }
    }
  }

  async function sendManagedChannelPost(attachmentDraftOverride?: ComposerAttachmentDraft) {
    if (!ownedCurrentManagedChannel || !currentSubscriptionChannel) return

    const attachmentDraft = attachmentDraftOverride ?? channelAttachmentDrafts[currentSubscriptionChannel.id]
    const text = isVideoNoteDraft(attachmentDraft)
      ? ''
      : (channelPostDrafts[currentSubscriptionChannel.id] ?? '').trim()
    if (channelPostEditTarget) {
      if (text === channelPostEditTarget.text) {
        cancelChannelPostEdit(currentSubscriptionChannel.id)
        return
      }

      if (!text) return

      setChannelPostBusy(true)
      setChannelPostError('')

      try {
        if (backendReady && session?.sessionToken) {
          const response = await editManagedChannelPostRequest(
            session.sessionToken,
            ownedCurrentManagedChannel.id,
            channelPostEditTarget.id,
            { text },
          )
          applySnapshot(response.snapshot)
        } else {
          applyLocalChannelPostEdit(currentSubscriptionChannel.id, channelPostEditTarget.id, text)
        }
        cancelChannelPostEdit(currentSubscriptionChannel.id)
      } catch (error) {
        console.error('Failed to edit managed channel post', error)
        setChannelPostError(error instanceof Error ? error.message : 'Не удалось обновить сообщение.')
        return
      } finally {
        setChannelPostBusy(false)
      }
      return
    }
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    if (attachmentDraftOverride) {
      releaseComposerAttachmentDraft(attachmentDraftOverride)
    }
    if (!text && !attachment) return
    const replyTo = channelPostReplyTarget
      ? {
          author: channelPostReplyTarget.author,
          id: channelPostReplyTarget.id,
          text: channelPostReplyTarget.text,
        }
      : undefined

    playSendSound()
    requestRoomFeedScrollToBottom('local-send')

    setChannelPostBusy(true)
    setChannelPostError('')

    if (backendReady && session?.sessionToken) {
      try {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          buildPendingAttachmentDraft(attachmentDraft),
          { surface: 'channel' },
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
          attachmentKind: getAnalyticsAttachmentKind(attachment),
          channelId: ownedCurrentManagedChannel.id,
          hasAttachment: Boolean(attachment),
          hasReply: Boolean(replyTo),
          presentation: getAnalyticsAttachmentPresentation(attachment),
        })
        trackPendingVideoNoteSendSucceeded()

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
        setChannelPostError('Подключение к каналу временно прервано. Пытаемся восстановить доступ.')
        setChannelPostBusy(false)
        trackPendingVideoNoteSendFailed(
          getAnalyticsReason(error, 'Не удалось отправить видеосообщение в канал.'),
        )
        queueSessionRecovery()
        return
      }
      setChannelPostError(error instanceof Error ? error.message : 'Не удалось отправить сообщение.')
      setChannelPostBusy(false)
      trackAnalyticsEvent('channel_post_send_failed', {
        attachmentKind: getAnalyticsAttachmentKind(attachment),
        channelId: ownedCurrentManagedChannel.id,
        hasAttachment: Boolean(attachment),
        hasReply: Boolean(replyTo),
        presentation: getAnalyticsAttachmentPresentation(attachment),
      })
      trackPendingVideoNoteSendFailed(
        getAnalyticsReason(error, 'Не удалось отправить видеосообщение в канал.'),
      )
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

  function openChatVideoNoteRecorder(chatId: number) {
    setVideoNoteRecorderTarget({ kind: 'direct', chatId })
  }

  function openGroupVideoNoteRecorder(groupId: number) {
    setVideoNoteRecorderTarget({ kind: 'group', groupId })
  }

  function openChannelVideoNoteRecorder(channelId: number) {
    setVideoNoteRecorderTarget({ kind: 'channel', channelId })
  }

  function openThreadVideoNoteRecorder() {
    if (!threadTarget || threadTarget.kind === 'support') {
      return
    }

    if (threadTarget.kind === 'group') {
      setVideoNoteRecorderTarget({
        groupId: threadTarget.groupId,
        kind: 'thread',
        messageId: threadTarget.messageId,
        room: 'group',
      })
      return
    }

    setVideoNoteRecorderTarget({
      channelId: threadTarget.channelId,
      kind: 'thread',
      postId: threadTarget.postId,
      room: 'channel',
    })
  }

  async function handleVideoNoteRecorderUse(file: File, meta?: { durationMs: number }) {
    if (!videoNoteRecorderTarget) {
      clearPendingVideoNoteAnalytics()
      throw new Error('Окно записи уже не привязано к комнате. Откройте его заново.')
    }

    const nextAttachmentDraft = await prepareVideoNoteDraftForImmediateSend(file)
    pendingVideoNoteAnalyticsRef.current = {
      durationBucket: getAnalyticsVideoNoteDurationBucket(meta?.durationMs ?? 0),
      roomKind: videoNoteRecorderTarget.kind === 'thread' ? videoNoteRecorderTarget.room : videoNoteRecorderTarget.kind,
      surface: videoNoteRecorderTarget.kind === 'thread' ? 'thread' : videoNoteRecorderTarget.kind,
    }

    if (videoNoteRecorderTarget.kind === 'direct') {
      if (activeChatId !== videoNoteRecorderTarget.chatId) {
        clearPendingVideoNoteAnalytics()
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        throw new Error('Откройте нужный диалог и попробуйте ещё раз.')
      }
      void sendMessage(nextAttachmentDraft)
      return
    }

    if (videoNoteRecorderTarget.kind === 'group') {
      if (activeGroupId !== videoNoteRecorderTarget.groupId) {
        clearPendingVideoNoteAnalytics()
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        throw new Error('Откройте нужную группу и попробуйте ещё раз.')
      }
      void sendGroupMessage(nextAttachmentDraft)
      return
    }

    if (videoNoteRecorderTarget.kind === 'channel') {
      if (currentSubscriptionChannel?.id !== videoNoteRecorderTarget.channelId) {
        clearPendingVideoNoteAnalytics()
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        throw new Error('Откройте нужный канал и попробуйте ещё раз.')
      }
      void sendManagedChannelPost(nextAttachmentDraft)
      return
    }

    if (!threadTarget || threadTarget.kind === 'support') {
      clearPendingVideoNoteAnalytics()
      releaseComposerAttachmentDraft(nextAttachmentDraft)
      throw new Error('Откройте нужные комментарии и попробуйте ещё раз.')
    }

    const threadTargetMatches =
      (videoNoteRecorderTarget.room === 'group' &&
        threadTarget.kind === 'group' &&
        threadTarget.groupId === videoNoteRecorderTarget.groupId &&
        threadTarget.messageId === videoNoteRecorderTarget.messageId) ||
      (videoNoteRecorderTarget.room === 'channel' &&
        threadTarget.kind === 'channel' &&
        threadTarget.channelId === videoNoteRecorderTarget.channelId &&
        threadTarget.postId === videoNoteRecorderTarget.postId)

    if (!threadTargetMatches) {
      clearPendingVideoNoteAnalytics()
      releaseComposerAttachmentDraft(nextAttachmentDraft)
      throw new Error('Откройте нужные комментарии и попробуйте ещё раз.')
    }

    void submitThreadComment(nextAttachmentDraft)
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
    trackAttachmentSelected('direct', file, sessionHasPremium && photoSendOriginalPreference)
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
    trackAttachmentSelected('group', file, sessionHasPremium && photoSendOriginalPreference)
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
    trackAttachmentSelected('channel', file, sessionHasPremium && photoSendOriginalPreference)
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

  function openSupportAttachmentPicker(mode: 'file' | 'photo') {
    if (!supportAttachmentInputRef.current) return

    supportAttachmentInputRef.current.accept = mode === 'photo' ? 'image/*' : ''
    supportAttachmentInputRef.current.click()
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
    trackAttachmentSelected('thread', file, sessionHasPremium && photoSendOriginalPreference)
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

  async function handleSupportAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      event.target.value = ''
      event.target.accept = ''
      return
    }

    const selectionToken = ++supportAttachmentSelectionTokenRef.current
    const preparingDraft = createPreparingComposerAttachmentDraft(file)
    setSupportAttachmentDraft((currentDraft) => {
      releaseComposerAttachmentDraft(currentDraft)
      return preparingDraft
    })

    const nextAttachmentDraft = applyPhotoSendOriginalPreferenceToDraft(
      await createComposerDraft(file, { previewUrl: preparingDraft.previewUrl }),
    )
    trackAttachmentSelected('support', file, sessionHasPremium && photoSendOriginalPreference)
    setSupportAttachmentDraft((currentDraft) => {
      if (selectionToken !== supportAttachmentSelectionTokenRef.current) {
        releaseComposerAttachmentDraft(nextAttachmentDraft)
        return currentDraft
      }

      return nextAttachmentDraft
    })

    event.target.value = ''
    event.target.accept = ''
  }

  async function handleChatComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    if (!activeChat) return

    const chatId = activeChat.id
    await handlePastedComposerImage(event, {
      getSelectionToken: () => ++chatAttachmentSelectionTokenRef.current,
      replaceDraft: (draft) => {
        setChatAttachmentDrafts((currentAttachments) => {
          releaseComposerAttachmentDraft(currentAttachments[chatId])
          return {
            ...currentAttachments,
            [chatId]: draft,
          }
        })
      },
      restorePreparedDraft: (selectionToken, draft) => {
        setChatAttachmentDrafts((currentAttachments) => {
          if (selectionToken !== chatAttachmentSelectionTokenRef.current) {
            releaseComposerAttachmentDraft(draft)
            return currentAttachments
          }

          return {
            ...currentAttachments,
            [chatId]: draft,
          }
        })
      },
      surface: 'direct',
    })
  }

  async function handleGroupComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    if (!activeGroup) return

    const groupId = activeGroup.id
    await handlePastedComposerImage(event, {
      getSelectionToken: () => ++groupAttachmentSelectionTokenRef.current,
      replaceDraft: (draft) => {
        setGroupAttachmentDrafts((currentAttachments) => {
          releaseComposerAttachmentDraft(currentAttachments[groupId])
          return {
            ...currentAttachments,
            [groupId]: draft,
          }
        })
      },
      restorePreparedDraft: (selectionToken, draft) => {
        setGroupAttachmentDrafts((currentAttachments) => {
          if (selectionToken !== groupAttachmentSelectionTokenRef.current) {
            releaseComposerAttachmentDraft(draft)
            return currentAttachments
          }

          return {
            ...currentAttachments,
            [groupId]: draft,
          }
        })
      },
      surface: 'group',
    })
  }

  async function handleChannelComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    if (!currentSubscriptionChannel) return

    const channelId = currentSubscriptionChannel.id
    await handlePastedComposerImage(event, {
      getSelectionToken: () => ++channelAttachmentSelectionTokenRef.current,
      replaceDraft: (draft) => {
        setChannelAttachmentDrafts((currentAttachments) => {
          releaseComposerAttachmentDraft(currentAttachments[channelId])
          return {
            ...currentAttachments,
            [channelId]: draft,
          }
        })
      },
      restorePreparedDraft: (selectionToken, draft) => {
        setChannelAttachmentDrafts((currentAttachments) => {
          if (selectionToken !== channelAttachmentSelectionTokenRef.current) {
            releaseComposerAttachmentDraft(draft)
            return currentAttachments
          }

          return {
            ...currentAttachments,
            [channelId]: draft,
          }
        })
      },
      surface: 'channel',
    })
  }

  async function handleThreadComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    if (!threadTarget) return

    await handlePastedComposerImage(event, {
      getSelectionToken: () => ++threadAttachmentSelectionTokenRef.current,
      replaceDraft: (draft) => {
        setThreadAttachmentDraft((currentDraft) => {
          releaseComposerAttachmentDraft(currentDraft)
          return draft
        })
      },
      restorePreparedDraft: (selectionToken, draft) => {
        setThreadAttachmentDraft((currentDraft) => {
          if (selectionToken !== threadAttachmentSelectionTokenRef.current) {
            releaseComposerAttachmentDraft(draft)
            return currentDraft
          }

          return draft
        })
      },
      surface: 'thread',
    })
  }

  async function handleSupportComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    await handlePastedComposerImage(event, {
      getSelectionToken: () => ++supportAttachmentSelectionTokenRef.current,
      replaceDraft: (draft) => {
        setSupportAttachmentDraft((currentDraft) => {
          releaseComposerAttachmentDraft(currentDraft)
          return draft
        })
      },
      restorePreparedDraft: (selectionToken, draft) => {
        setSupportAttachmentDraft((currentDraft) => {
          if (selectionToken !== supportAttachmentSelectionTokenRef.current) {
            releaseComposerAttachmentDraft(draft)
            return currentDraft
          }

          return draft
        })
      },
      surface: 'support',
    })
  }

  function closeActiveRoom() {
    setVideoNoteRecorderTarget(null)
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
    closeGroupParticipantsDialog()
    setGroupActionsAnchor(null)
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteLimitNoticeOpen(false)
    setGroupReportNoticeOpen(false)
    setThreadCommentHintTarget(null)
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
    setThreadCommentHintTarget(null)
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

        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          nextDirectMessage.attachmentDraft,
          {
            onProgress: (progress) =>
              setPendingDirectMessageUploadProgress(nextDirectMessage.localId, progress),
            surface: 'direct',
          },
        )

        if (
          resolvedAttachment.attachmentDraft?.mediaUrl &&
          resolvedAttachment.attachmentDraft.mediaUrl !== nextDirectMessage.attachmentDraft?.mediaUrl
        ) {
          updatePendingDirectMessage(nextDirectMessage.localId, (message) => ({
            ...message,
            attachment: preservePendingAttachmentPreview(message.attachment, resolvedAttachment.attachment),
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

      const resolvedAttachment = await resolvePendingAttachmentForSend(
        session.sessionToken,
        nextGroupMessage.attachmentDraft,
        {
          onProgress: (progress) =>
            setPendingGroupMessageUploadProgress(nextGroupMessage.localId, progress),
          surface: 'group',
        },
      )

      if (
        resolvedAttachment.attachmentDraft?.mediaUrl &&
        resolvedAttachment.attachmentDraft.mediaUrl !== nextGroupMessage.attachmentDraft?.mediaUrl
      ) {
        updatePendingGroupMessage(nextGroupMessage.localId, (message) => ({
          ...message,
          attachment: preservePendingAttachmentPreview(message.attachment, resolvedAttachment.attachment),
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
        if (attemptedDirectMessage) {
          markPendingDirectMessageAttemptFailed(attemptedDirectMessage.localId)
        }
        if (attemptedGroupMessage) {
          markPendingGroupMessageAttemptFailed(attemptedGroupMessage.localId)
        }
        queueSessionRecovery('Подключение к сессии временно прервано. Пытаемся восстановить доступ.')
        return
      }
      if (attemptedDirectMessage) {
        markPendingDirectMessageAttemptFailed(attemptedDirectMessage.localId)
      } else {
        if (attemptedGroupMessage) {
          markPendingGroupMessageAttemptFailed(attemptedGroupMessage.localId)
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
        openTrackedThread({ groupId: item.groupId, kind: 'group', messageId: item.messageId })
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
      openTrackedThread({ channelId: item.channelId, kind: 'channel', postId: item.postId })
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

    // Switching rooms from the left rail must always drop the previously open thread.
    // Otherwise the new room can inherit a stale threadTarget and render an empty
    // comments scene for the wrong entity instead of opening the room itself.
    resetThreadState()
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
    setDirectMessageEditTarget(null)
    setGroupMessageEditTarget(null)
    setChannelPostEditTarget(null)
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
      setDirectMessageEditTarget(null)
      setGroupMessageEditTarget(null)
      setChannelPostEditTarget(null)
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
      preview: previewPost?.text ?? sourceChannel.statusText ?? '',
      readers: 0,
      statusText: sourceChannel.statusText,
      time: previewPost?.time ?? '',
      title: sourceChannel.title,
      unread: 0,
      visibility: sourceChannel.visibility ?? 'public',
    } satisfies SubscriptionChannel
  }

  function showPreviewSubscriptionChannel(channel: SubscriptionChannel) {
    resetThreadState()
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
    setChannelPostBusy(false)
    setChannelPostError('')
    setPreviewSubscriptionChannel(channel)
    setActiveSubscriptionChannelId(null)
    setChannelPostReplyTarget(null)
    resetSubscriptionPostActions()
    setTopListView('channels')
    setSearchOpen(false)
  }

  function openSourceChannel(
    sourceChannel: NonNullable<Message['sourceChannel']>,
    previewPost?: ChannelPost,
  ) {
    void openSourceChannelAsync(sourceChannel, previewPost)
  }

  async function openSourceChannelAsync(
    sourceChannel: NonNullable<Message['sourceChannel']>,
    previewPost?: ChannelPost,
  ) {
    if (!sourceChannel) return
    const normalizedHandle = sourceChannel.handle ? sanitizeChannelDirectLink(sourceChannel.handle) : ''

    if (sourceChannel.id !== undefined) {
      const existingChannel = subscriptionChannels.find((channel) => channel.id === sourceChannel.id)
      if (existingChannel) {
        openSubscriptionChannel(existingChannel.id)
        return
      }
    }

    if (normalizedHandle) {
      const existingByHandle = subscriptionChannels.find(
        (channel) => sanitizeChannelDirectLink(channel.handle) === normalizedHandle,
      )
      if (existingByHandle) {
        openSubscriptionChannel(existingByHandle.id)
        return
      }

      if (backendReady && session?.sessionToken) {
        try {
          const response = await fetchSubscriptionChannelPreview(session.sessionToken, normalizedHandle)
          showPreviewSubscriptionChannel(response.channel)
          return
        } catch (error) {
          if (!(error instanceof ApiError) || (error.status !== 403 && error.status !== 404)) {
            console.error('Failed to fetch channel preview', error)
            setChannelPostError(
              error instanceof Error ? error.message : 'Не удалось открыть канал.',
            )
          }
          return
        }
      }

      const managedChannel = channels.find(
        (channel) => sanitizeChannelDirectLink(channel.directLink) === normalizedHandle,
      )
      if (managedChannel) {
        showPreviewSubscriptionChannel(buildPreviewSubscriptionChannelFromManagedChannel(managedChannel))
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

    showPreviewSubscriptionChannel(buildPreviewSubscriptionChannel(sourceChannel, previewPost))
  }

  async function openSourceGroupAsync(
    sourceGroup: NonNullable<Message['sourceGroup']>,
  ) {
    if (!sourceGroup) return
    if (sourceGroup.archivedAt) return
    const normalizedSharedId = sourceGroup.sharedId?.trim() || ''
    if (!normalizedSharedId) return

    const existingGroup = groups.find((group) => group.sharedId === normalizedSharedId)
    if (existingGroup) {
      openGroup(existingGroup.id)
      return
    }

    if (backendReady && session?.sessionToken) {
      try {
        const response = await joinGroupFromInviteRequest(session.sessionToken, normalizedSharedId)
        applySnapshot(response.snapshot)
        openGroup(response.groupId)
        return
      } catch (error) {
        console.error('Failed to join group from invite', error)
        // In backend mode we trust the server as the authority for invite access and
        // never materialize a fake local group after a denied or broken join attempt.
        return
      }
    }

    const nextGroupId = groups.reduce((maxId, group) => Math.max(maxId, group.id), 0) + 1
    const nextGroup: GroupPreview = {
      accent: sourceGroup.accent ?? '#8c5738',
      avatarImage: sourceGroup.avatarImage,
      creatorIdentifier: sourceGroup.creatorIdentifier,
      description: '',
      groupOwnerIdentifier: sourceGroup.groupOwnerIdentifier,
      handle: sourceGroup.handle ?? `@group_${nextGroupId}`,
      id: nextGroupId,
      members: 1,
      messages: [],
      participants: [],
      preview: '',
      sharedId: normalizedSharedId,
      time: '',
      title: sourceGroup.title,
      unread: 0,
      viewerIsOwner: false,
    }

    setGroups((currentGroups) => [nextGroup, ...currentGroups])
    openGroup(nextGroupId)
  }

  function openSourceGroup(sourceGroup: NonNullable<Message['sourceGroup']>) {
    void openSourceGroupAsync(sourceGroup)
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

  async function subscribeToPreviewSubscriptionChannel() {
    if (!previewSubscriptionChannel) return
    setChannelPostError('')

    const existingChannel = subscriptionChannels.find(
      (channel) =>
        channel.id === previewSubscriptionChannel.id ||
        channel.title === previewSubscriptionChannel.title,
    )

    if (existingChannel) {
      openSubscriptionChannel(existingChannel.id)
      return
    }

    const previewHandle = sanitizeChannelDirectLink(previewSubscriptionChannel.handle)

    if (backendReady && session?.sessionToken && previewHandle) {
      setChannelPostBusy(true)
      try {
        const response = await subscribeToChannelRequest(session.sessionToken, previewHandle)
        applySnapshot(response.snapshot)
        openSubscriptionChannel(response.channelId)
        return
      } catch (error) {
        console.error('Failed to subscribe to preview channel', error)
        if (isExpiredSessionError(error)) {
          setChannelPostError('Подключение к каналу временно прервано. Пытаемся восстановить доступ.')
          queueSessionRecovery()
          return
        }

        setChannelPostError(
          error instanceof Error ? error.message : 'Не удалось подписаться на канал.',
        )
        return
      } finally {
        setChannelPostBusy(false)
      }
    }

    setSubscriptionChannels((currentChannels) => [previewSubscriptionChannel, ...currentChannels])
    openSubscriptionChannel(previewSubscriptionChannel.id)
  }

  function openGroup(groupId: number) {
    const shouldRetainGroupInList =
      topListView === 'groups' &&
      groups.some((group) => group.id === groupId && (group.unread > 0 || group.id === retainedGroupId))

    resetThreadState()
    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setActiveChatId(null)
    setPreviewSubscriptionChannel(null)
    setActiveSubscriptionChannelId(null)
    setDirectMessageEditTarget(null)
    setGroupMessageEditTarget(null)
    setChannelPostEditTarget(null)
    resetSubscriptionPostActions()
    setTopListView('groups')
    setSearchOpen(false)
    closeGroupParticipantsDialog()
    setRetainedGroupId(shouldRetainGroupInList ? groupId : null)
    setActiveGroupId(groupId)
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteLimitNoticeOpen(false)
    setGroupReportNoticeOpen(false)
    setGroupDescriptionOpen(false)
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
    setGroupInviteInlineError(null)
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
    setGroupInviteInlineError(null)
    setGroupInviteOpen(true)
  }

  async function inviteChatToActiveGroup(chatId: number) {
    if (!activeGroup) return

    if (activeGroupAtMemberLimit) {
      openGroupInviteLimitNotice()
      return
    }

    const invitedChat = availableChats.find((chat) => chat.id === chatId)
    if (!invitedChat) {
      setGroupInviteError('Контакт не найден.')
      setGroupInviteInlineError(null)
      return
    }

    if (activeGroupParticipantIdentifiers.has(normalizeIdentifier(invitedChat.phone))) {
      setGroupInviteError('')
      setGroupInviteInlineError({
        chatId,
        message: 'Этот контакт уже состоит в группе.',
      })
      return
    }

    setGroupInviteBusy(true)
    setGroupInviteError('')
    setGroupInviteInlineError(null)

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

        if (nextMessage.includes('Этот контакт уже состоит в группе')) {
          setGroupInviteInlineError({
            chatId,
            message: 'Этот контакт уже состоит в группе.',
          })
          setGroupInviteError('')
          setGroupInviteBusy(false)
          return
        }

        setGroupInviteError(nextMessage)
        setGroupInviteBusy(false)
        return
      }
    }

    applyLocalDirectMessage(invitedChat.id, '', {
      markAsRead: invitedChat.id === activeChatId,
      sourceGroup: {
        accent: activeGroup.accent,
        avatarImage: activeGroup.avatarImage,
        creatorIdentifier: activeGroup.creatorIdentifier,
        leadText: 'Пользователь приглашает вас в группу',
        groupOwnerIdentifier: activeGroup.groupOwnerIdentifier,
        handle: activeGroup.handle,
        sharedId: activeGroup.sharedId,
        title: activeGroup.title,
      },
    })
    closeGroupInvite()
  }

  async function leaveCurrentGroup(groupId: number) {
    const targetGroup =
      groups.find((group) => group.id === groupId) ??
      (activeGroupId === groupId ? activeGroup : null) ??
      null
    const deletingOwnedGroup = targetGroup ? isOwnedGroupPreview(targetGroup) : false

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

    if (deletingOwnedGroup) {
      trackAnalyticsEvent('group_deleted', {
        deleteMode: 'owner-delete',
        membersCount: targetGroup?.members ?? 1,
      })
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
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.showHistoryToNewMembers !== undefined
        ? { showHistoryToNewMembers: patch.showHistoryToNewMembers }
        : {}),
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
    openTrackedThread({ groupId: activeGroup.id, kind: 'group', messageId })
    resetGroupMessageActions()
  }

  function openChannelThread(postId: number) {
    if (!currentSubscriptionChannel || isPreviewSubscriptionChannel) return
    clearThreadAttachmentDraft()
    openTrackedThread({ channelId: currentSubscriptionChannel.id, kind: 'channel', postId })
    resetSubscriptionPostActions()
  }

  const closeThreadView = useCallback(() => {
    const previousThreadTarget = threadTarget

    setVideoNoteRecorderTarget(null)
    clearThreadAttachmentDraft()
    closeThreadFlowView()
    resetBlacklistFlow()

    // Thread back should restore the source room surface too. Leaving the stage on
    // the thread inbox is a known regression because the sidebar still looks like
    // the thread is active even after the room has returned to the source channel/group.
    if (previousThreadTarget?.kind === 'group') {
      openGroup(previousThreadTarget.groupId)
      return
    }

    if (previousThreadTarget?.kind === 'channel') {
      openSubscriptionChannel(previousThreadTarget.channelId)
    }
  }, [
    clearThreadAttachmentDraft,
    closeThreadFlowView,
    openGroup,
    openSubscriptionChannel,
    resetBlacklistFlow,
    threadTarget,
  ])

  async function submitThreadComment(attachmentDraftOverride?: ComposerAttachmentDraft) {
    const attachmentDraft = attachmentDraftOverride ?? threadAttachmentDraft
    const text = isVideoNoteDraft(attachmentDraft) ? '' : threadDraft.trim()
    if (!threadTarget) return
    if (threadEditTarget) {
      if (text === threadEditTarget.text) {
        cancelThreadCommentEdit()
        return
      }

      if (!text) return

      setThreadBusy(true)
      setThreadError('')

      try {
        if (threadTarget.kind === 'group') {
          if (backendReady && session?.sessionToken) {
            const response = await editGroupThreadCommentRequest(
              session.sessionToken,
              threadTarget.groupId,
              threadTarget.messageId,
              threadEditTarget.id,
              { text },
            )
            applySnapshot(response.snapshot)
          } else {
            applyLocalGroupThreadCommentEdit(
              threadTarget.groupId,
              threadTarget.messageId,
              threadEditTarget.id,
              text,
            )
          }
        } else if (threadTarget.kind === 'channel') {
          if (backendReady && session?.sessionToken) {
            const response = await editSubscriptionChannelThreadCommentRequest(
              session.sessionToken,
              threadTarget.channelId,
              threadTarget.postId,
              threadEditTarget.id,
              { text },
            )
            applySnapshot(response.snapshot)
          } else {
            applyLocalSubscriptionThreadCommentEdit(
              threadTarget.channelId,
              threadTarget.postId,
              threadEditTarget.id,
              text,
            )
          }
        } else {
          cancelThreadCommentEdit()
          setThreadBusy(false)
          return
        }

        cancelThreadCommentEdit()
        setThreadBusy(false)
      } catch (error) {
        console.error('Failed to edit thread comment', error)
        setThreadBusy(false)
        setThreadError(error instanceof Error ? error.message : 'Не удалось обновить комментарий.')
      }
      return
    }
    if (attachmentDraft && attachmentDraft.status !== 'ready') return
    const replyTo = threadReplyTarget
      ? {
          author: threadReplyTarget.author,
          id: threadReplyTarget.id,
          text: threadReplyTarget.text,
        }
      : undefined
    const attachment = buildMessageAttachmentFromDraft(attachmentDraft)
    if (attachmentDraftOverride) {
      releaseComposerAttachmentDraft(attachmentDraftOverride)
    }

    if (!text && !attachment) return

    if (threadTarget.kind === 'support') {
      if (!backendReady || !session?.sessionToken) {
        setThreadError('Поддержка временно недоступна без подключения к серверу.')
        return
      }

      playSendSound()
      requestRoomFeedScrollToBottom('local-send')
      setThreadBusy(true)
      setThreadError('')

      try {
        const resolvedAttachment = await resolvePendingAttachmentForSend(
          session.sessionToken,
          attachmentDraft,
          { surface: 'thread' },
        )

        const response = await sendSupportTicketCommentRequest(session.sessionToken, threadTarget.ticketId, {
          attachment: resolvedAttachment.attachment,
          clientDeliveryId: getClientDeliveryId(),
          replyTo,
          text,
        })
        applySnapshot(response.snapshot)
        resetThreadComposer()
        clearThreadAttachmentDraft()
        setThreadBusy(false)
        trackAnalyticsEvent('support_ticket_reply_sent', {
          hasAttachment: Boolean(resolvedAttachment.attachment),
          threadId: activeSupportTicket?.threadId ?? `support:${threadTarget.ticketId}`,
        })
      } catch (error) {
        console.error('Failed to send support ticket comment', error)
        setThreadBusy(false)
        setThreadError(error instanceof Error ? error.message : 'Не удалось отправить комментарий.')
      }
      return
    }

    playSendSound()
    requestRoomFeedScrollToBottom('local-send')

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

    const mentions = buildMessageMentions(text, activeThreadMentionCandidates)
    const sourceContact =
      mentions.length > 0 ? undefined : resolveEmbeddedContactFromText(text) ?? undefined

    if (threadTarget.kind === 'group') {
      applyLocalGroupThreadComment(threadTarget.groupId, threadTarget.messageId, text, replyTo, {
        attachment,
        authorIdentifier: session?.identifier,
        createdAt,
        deliveryId,
        displayAuthor: sessionName,
        localId,
        mentions: mentions.length > 0 ? mentions : undefined,
        sourceContact,
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
        mentions: mentions.length > 0 ? mentions : undefined,
        sourceContact,
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
            { surface: 'thread' },
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
            attachmentKind: getAnalyticsAttachmentKind(pendingGroupThreadComment?.attachment),
            hasAttachment: Boolean(pendingGroupThreadComment?.attachment),
            hasReply: Boolean(replyTo),
            presentation: getAnalyticsAttachmentPresentation(pendingGroupThreadComment?.attachment),
            roomKind: 'group',
          })
          trackPendingVideoNoteSendSucceeded()
        }
      } else {
        if (backendReady && session?.sessionToken) {
          const resolvedAttachment = await resolvePendingAttachmentForSend(
            session.sessionToken,
            pendingChannelThreadComment?.attachmentDraft,
            { surface: 'thread' },
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
            attachmentKind: getAnalyticsAttachmentKind(pendingChannelThreadComment?.attachment),
            hasAttachment: Boolean(pendingChannelThreadComment?.attachment),
            hasReply: Boolean(replyTo),
            presentation: getAnalyticsAttachmentPresentation(pendingChannelThreadComment?.attachment),
            roomKind: 'channel',
          })
          trackPendingVideoNoteSendSucceeded()
        }
      }

      setThreadBusy(false)
    } catch (error) {
      console.error('Failed to send thread comment', error)
      if (isExpiredSessionError(error)) {
        if (threadTarget.kind === 'group') {
          removePendingGroupThreadComment(localId)
          applyLocalDeleteGroupThreadComment(threadTarget.groupId, threadTarget.messageId, localId)
        } else {
          removePendingChannelThreadComment(localId)
          applyLocalDeleteSubscriptionThreadComment(threadTarget.channelId, threadTarget.postId, localId)
        }
        setThreadBusy(false)
        trackPendingVideoNoteSendFailed(
          getAnalyticsReason(error, 'Не удалось отправить видеосообщение в тред.'),
        )
        queueSessionRecovery('Подключение к сессии временно прервано. Пытаемся восстановить доступ.')
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
        attachmentKind:
          threadTarget.kind === 'group'
            ? getAnalyticsAttachmentKind(pendingGroupThreadComment?.attachment)
            : getAnalyticsAttachmentKind(pendingChannelThreadComment?.attachment),
        presentation:
          threadTarget.kind === 'group'
            ? getAnalyticsAttachmentPresentation(pendingGroupThreadComment?.attachment)
            : getAnalyticsAttachmentPresentation(pendingChannelThreadComment?.attachment),
        roomKind: threadTarget.kind,
      })
      trackPendingVideoNoteSendFailed(
        getAnalyticsReason(error, 'Не удалось отправить видеосообщение в тред.'),
      )
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

  function openChat(chatId: number, options?: { bottomSection?: 'chats' | 'contacts' }) {
    const nextBottomSection = options?.bottomSection ?? 'chats'
    const shouldRetainChatInAllFilter =
      activeFilter === 'Все' &&
      availableChats.some((chat) => chat.id === chatId && (chat.unread > 0 || chat.id === retainedAllChatId))
    const shouldRetainChatInFavoritesFilter =
      activeFilter === '★' &&
      availableChats.some(
        (chat) =>
          chat.id === chatId && Boolean(chat.pinned) && (chat.unread > 0 || chat.id === retainedFavoriteChatId),
      )

    resetThreadState()
    setStageView('main')
    setSettingsView('profile')
    setConfirmingLogout(false)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setPremiumGiftChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setDirectMessageEditTarget(null)
    setGroupMessageEditTarget(null)
    setChannelPostEditTarget(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteChannelId(null)
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
    setBottomSection(nextBottomSection)
    setActiveChatId(chatId)
    void syncDialogRead(chatId)
  }

  const canNavigateBackWithinApp = useCallback(() => {
    if (typeof window === 'undefined') {
      return false
    }

    const historyState = readAppNavigationHistoryState(window.history.state)
    return historyState !== null && historyState.depth > 0
  }, [])

  const clearBlockedBrowserBackNavigation = useCallback(() => {
    blockedBrowserPopstateRef.current = null
  }, [])

  const continueBlockedBrowserBackNavigation = useCallback(() => {
    if (typeof window === 'undefined' || !blockedBrowserPopstateRef.current) {
      return false
    }

    blockedBrowserPopstateRef.current = null
    window.requestAnimationFrame(() => {
      window.history.back()
    })
    return true
  }, [])

  const navigateBackWithinApp = useCallback((fallback: () => void) => {
    if (typeof window !== 'undefined' && canNavigateBackWithinApp()) {
      window.history.back()
      return
    }

    fallback()
  }, [canNavigateBackWithinApp])

  const applyNavigationRoute = useCallback((route: AppNavigationRoute) => {
    setVideoNoteRecorderTarget(null)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setChannelActionsAnchor(null)
    setChannelManagementOpenId(null)
    setChannelPostEditTarget(null)
    setChannelPostError('')
    setChannelPostReplyTarget(null)
    setChannelReportOpen(false)
    setChannelReportBusy(false)
    setChannelReportError('')
    setChannelReportSuccessOpen(false)
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelSubscribersOpen(false)
    setChannelSubscribersSearchQuery('')
    setSelectedChannelSubscriberIdentifier(null)
    setConfirmChannelSettingsLeaveOpen(false)
    setConfirmProfileSettingsLeaveOpen(false)
    setConfirmingBlacklistChannelSubscriberIdentifier(null)
    setConfirmingDeleteChannelId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingLeaveGroupId(null)
    setConfirmingLeaveSubscriptionChannelId(null)
    setConfirmingLogout(false)
    setForwardingMessageId(null)
    setDirectMessageEditTarget(null)
    setGroupActionsAnchor(null)
    setGroupDescriptionOpen(false)
    setGroupInviteOpen(false)
    setGroupInviteBusy(false)
    setGroupInviteError('')
    setGroupInviteInlineError(null)
    setGroupInviteLimitNoticeOpen(false)
    setGroupParticipantActionBusy(false)
    setGroupParticipantActionError('')
    setGroupParticipantsOpen(false)
    setGroupParticipantsSearchQuery('')
    setGroupReportNoticeOpen(false)
    setManagedChannelLimitErrorOpen(false)
    setMessageActionAnchor(null)
    setMessageActionMessageId(null)
    setPendingAvatarPostPrompt(null)
    setPendingAvatarPostCaption('')
    setPremiumGiftChatId(route.premiumGiftChatId)
    setProfileAvatarPickerOpen(false)
    setProfileAvatarPickerBusy(false)
    setProfileAvatarPickerError('')
    setGroupMessageEditTarget(null)
    setReplyTarget(null)
    setReportingChatId(null)
    setReportContactBusy(false)
    setReportContactError('')
    setReportContactSuccessOpen(false)
    setSelectedGroupParticipantIdentifier(null)
    setSupportError('')
    setThreadCommentHintTarget(null)
    clearThreadEditTarget()
    clearThreadAttachmentDraft()
    resetBlacklistFlow()
    resetRoomMessageActions()

    setStageView(route.stageView)
    setSettingsView(route.settingsView)
    setChannelsView(route.channelsView)
    setChannelDetailView(route.channelDetailView)
    setActiveChannelId(route.activeChannelId)
    setBottomSection(route.bottomSection)
    setContactsTab(route.contactsTab)
    setQuery(route.query)
    setActiveFilter(route.activeFilter)
    setSearchOpen(route.searchOpen)
    setSearchTopFilter(route.searchTopFilter)
    setTopListView(route.topListView)
    setActiveChatId(route.activeChatId)
    setActiveGroupId(route.activeGroupId)
    setActiveSubscriptionChannelId(route.activeSubscriptionChannelId)
    setPreviewSubscriptionChannel(route.previewSubscriptionChannel)

    if (route.threadTarget) {
      openTrackedThread(route.threadTarget)
      return
    }

    resetThreadState()
  }, [
    clearThreadEditTarget,
    clearThreadAttachmentDraft,
    openTrackedThread,
    resetBlacklistFlow,
    resetRoomMessageActions,
    resetThreadState,
  ])

  const shouldBlockBrowserPopstateNavigation = useCallback((nextState: AppNavigationHistoryState) => {
    const nextRouteKey = getAppNavigationRouteEntryKey(nextState.route)

    if (nextRouteKey === appNavigationRouteEntryKey) {
      return false
    }

    if (
      stageView === 'channels' &&
      channelsView === 'detail' &&
      channelDetailView === 'main' &&
      activeChannelSettingsDirty
    ) {
      setConfirmChannelSettingsLeaveOpen(true)
      return true
    }

    if (stageView === 'settings' && settingsView === 'profile' && profileSettingsDirty) {
      setConfirmProfileSettingsLeaveOpen(true)
      return true
    }

    return false
  }, [
    activeChannelSettingsDirty,
    appNavigationRouteEntryKey,
    channelDetailView,
    channelsView,
    profileSettingsDirty,
    settingsView,
    stageView,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = (event: PopStateEvent) => {
      if (appNavigationIgnoreNextPopstateRef.current) {
        appNavigationIgnoreNextPopstateRef.current = false
        return
      }

      const nextState = readAppNavigationHistoryState(event.state)
      if (!nextState) {
        return
      }

      if (channelSettingsBusy || profileSettingsBusy) {
        appNavigationIgnoreNextPopstateRef.current = true
        window.history.forward()
        return
      }

      if (shouldBlockBrowserPopstateNavigation(nextState)) {
        blockedBrowserPopstateRef.current = nextState
        appNavigationIgnoreNextPopstateRef.current = true
        window.history.forward()
        return
      }

      clearBlockedBrowserBackNavigation()
      appNavigationHistoryDepthRef.current = nextState.depth
      appNavigationRestoringRef.current = true
      applyNavigationRoute(nextState.route)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [
    applyNavigationRoute,
    channelSettingsBusy,
    clearBlockedBrowserBackNavigation,
    profileSettingsBusy,
    shouldBlockBrowserPopstateNavigation,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!appNavigationHistoryReadyRef.current) {
      const currentState = readAppNavigationHistoryState(window.history.state)
      const initialDepth = currentState?.depth ?? 0
      appNavigationHistoryDepthRef.current = initialDepth
      window.history.replaceState(
        createAppNavigationHistoryState(appNavigationRoute, initialDepth),
        '',
        window.location.href,
      )
      appNavigationHistoryReadyRef.current = true
      return
    }

    if (appNavigationRestoringRef.current) {
      appNavigationRestoringRef.current = false
      const restoredDepth = appNavigationHistoryDepthRef.current
      window.history.replaceState(
        createAppNavigationHistoryState(appNavigationRoute, restoredDepth),
        '',
        window.location.href,
      )
      return
    }

    const currentState = readAppNavigationHistoryState(window.history.state)
    const currentDepth = currentState?.depth ?? appNavigationHistoryDepthRef.current
    const currentRouteKey = currentState ? getAppNavigationRouteEntryKey(currentState.route) : null

    if (currentRouteKey === appNavigationRouteEntryKey) {
      window.history.replaceState(
        createAppNavigationHistoryState(appNavigationRoute, currentDepth),
        '',
        window.location.href,
      )
      appNavigationHistoryDepthRef.current = currentDepth
      return
    }

    const nextDepth = currentDepth + 1
    appNavigationHistoryDepthRef.current = nextDepth
    window.history.pushState(
      createAppNavigationHistoryState(appNavigationRoute, nextDepth),
      '',
      window.location.href,
    )
  }, [appNavigationRoute, appNavigationRouteEntryKey])

  const handleRoomBack = useCallback(() => {
    navigateBackWithinApp(() => {
      closeActiveRoom()
    })
  }, [navigateBackWithinApp])

  const handleThreadRoomBack = useCallback(() => {
    navigateBackWithinApp(() => {
      closeThreadView()
    })
  }, [closeThreadView, navigateBackWithinApp])

  const handleSettingsBack = useCallback(() => {
    if (settingsView === 'quiet') {
      navigateBackWithinApp(() => {
        setQuietSettingsError('')
        setSettingsView('profile')
        setConfirmingLogout(false)
      })
      return
    }

    if (settingsView === 'profile' && profileSettingsDirty) {
      setConfirmProfileSettingsLeaveOpen(true)
      return
    }

    navigateBackWithinApp(() => {
      leaveSettingsToMain()
    })
  }, [leaveSettingsToMain, navigateBackWithinApp, profileSettingsDirty, settingsView])

  const handleSupportSettingsBack = useCallback(() => {
    setSupportError('')
    leaveSettingsToMain()
  }, [leaveSettingsToMain])

  const handlePremiumBack = useCallback(() => {
    navigateBackWithinApp(() => {
      setStageView('main')
      setPremiumGiftChatId(null)
    })
  }, [navigateBackWithinApp])

  const handleChannelsListBack = useCallback(() => {
    navigateBackWithinApp(() => {
      setStageView('main')
    })
  }, [navigateBackWithinApp])

  const handleChannelsCreateBack = useCallback(() => {
    navigateBackWithinApp(() => {
      openChannelsListView()
    })
  }, [navigateBackWithinApp, openChannelsListView])

  const handleChannelInviteBack = useCallback(() => {
    navigateBackWithinApp(() => {
      openChannelsListView()
    })
  }, [navigateBackWithinApp, openChannelsListView])

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

    if (browserNotificationStatus !== 'granted' || !browserNotificationsEnabled) {
      return
    }

    nextDigest.forEach((entry, key) => {
      const previousUnread = previousDigest.get(key)?.unread ?? 0
      if (entry.unread <= 0 || entry.unread <= previousUnread) {
        return
      }

      if (shouldSuppressBrowserNotificationTarget(quietMode, effectiveQuietModeSettings, entry.target)) {
        return
      }

      void showBrowserNotification(entry.title, {
        body: entry.body,
        clickData: entry.target,
        icon: '/logo/round/512round.png',
        onClick: () => browserNotificationOpenTargetRef.current(entry.target),
        tag: `tinychok:${key}`,
      })
    })
  }, [
    availableChats,
    backendReady,
    browserNotificationsEnabled,
    browserNotificationStatus,
    effectiveQuietModeSettings,
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
        contactState: 'none',
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

  function createLocalDialogFromSourceContact(
    sourceContact: NonNullable<Message['sourceContact']>,
  ) {
    const normalizedIdentifier = normalizeIdentifier(sourceContact.identifier ?? '')
    const normalizedHandle = normalizeNickname(sourceContact.handle?.replace(/^@+/u, '') ?? '')
    const existingChat = chats.find((chat) => {
      const chatIdentifier = normalizeIdentifier(chat.phone)
      const chatHandle = normalizeNickname(chat.handle.replace(/^@+/u, ''))
      return (
        (normalizedIdentifier && chatIdentifier === normalizedIdentifier) ||
        (normalizedHandle && chatHandle === normalizedHandle)
      )
    })
    if (existingChat) {
      return existingChat.id
    }

    const nextChatId = chats.reduce((maxId, chat) => Math.max(maxId, chat.id), 0) + 1
    setChats((currentChats) => [
      ...currentChats,
      {
        accent: sourceContact.accent ?? '#8c5738',
        avatarImage: sourceContact.avatarImage,
        contactState: 'none',
        handle: sourceContact.handle ?? '',
        id: nextChatId,
        messages: [],
        mood: sourceContact.status ?? 'На связи',
        phone:
          normalizedIdentifier ||
          sourceContact.identifier ||
          sourceContact.handle ||
          `contact:${nextChatId}`,
        status: sourceContact.status ?? 'На связи',
        title: sourceContact.title,
        unread: 0,
      },
    ])

    return nextChatId
  }

  async function openSearchResult(result: SearchResult) {
    trackAnalyticsEvent('contact_search_result_opened', {
      resultSource: 'globalResults',
      source: 'search-screen',
      topFilter: searchTopFilter,
    })

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

  function openSearchChannelResult(channel: ChannelSearchResult) {
    void openSearchChannelResultAsync(channel)
  }

  async function openSearchChannelResultAsync(channel: ChannelSearchResult) {
    // Search results must reuse the same preview contract as channel invites:
    // tap opens preview/history first, and explicit subscribe is the only join point.
    // Search channel taps must resolve the exact clicked result first:
    // never fall back by title, otherwise one visible result can open another.
    const target = resolveSearchChannelOpenTarget(channel, subscriptionChannels, channels)
    const resultSource =
      target.kind === 'subscribed'
        ? 'subscribedPreview'
        : target.kind === 'managed-preview'
          ? 'managedPreview'
          : 'discoveryResults'

    trackAnalyticsEvent('channel_search_result_opened', {
      resultSource,
      source: 'search-screen',
      topFilter: searchTopFilter,
    })

    if (target.kind === 'subscribed') {
      openSubscriptionChannel(target.channelId)
      return
    }

    if (target.kind === 'managed-preview') {
      const managedChannel = channels.find((candidate) => candidate.id === target.managedChannelId)
      if (managedChannel) {
        showPreviewSubscriptionChannel(buildPreviewSubscriptionChannelFromManagedChannel(managedChannel))
        return
      }
    }

    const previewHandle = target.kind === 'preview-by-handle' ? target.handle : channel.handle
    const normalizedHandle = sanitizeChannelDirectLink(previewHandle)
    if (backendReady && session?.sessionToken && normalizedHandle) {
      try {
        const response = await fetchSubscriptionChannelPreview(session.sessionToken, normalizedHandle)
        if (sanitizeChannelDirectLink(response.channel.handle) === normalizedHandle) {
          showPreviewSubscriptionChannel(response.channel)
          return
        }
      } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 403 && error.status !== 404)) {
          console.error('Failed to fetch channel preview from search result', error)
        }
      }
    }

    const managedByHandle = normalizedHandle
      ? channels.find(
          (candidate) => sanitizeChannelDirectLink(candidate.directLink) === normalizedHandle,
        )
      : null
    if (managedByHandle) {
      showPreviewSubscriptionChannel(buildPreviewSubscriptionChannelFromManagedChannel(managedByHandle))
      return
    }

    showPreviewSubscriptionChannel({
      accent: channel.accent,
      archivedAt: channel.archivedAt,
      avatarImage: channel.avatarImage,
      description: channel.description,
      draft: false,
      handle: channel.handle,
      id: channel.id,
      latestActivityAt: undefined,
      muted: channel.muted,
      posts: [],
      preview: channel.statusText ?? channel.description ?? '',
      readers: 0,
      statusText: channel.statusText,
      time: '',
      title: channel.title,
      unread: 0,
      visibility: channel.visibility,
    })
  }

  async function openSourceContactAsync(
    sourceContact: NonNullable<Message['sourceContact']>,
  ) {
    const normalizedIdentifier = normalizeIdentifier(sourceContact.identifier ?? '')
    const normalizedHandle = normalizeNickname(sourceContact.handle?.replace(/^@+/u, '') ?? '')

    if (normalizedIdentifier && normalizedIdentifier === normalizeIdentifier(session?.identifier ?? '')) {
      return
    }

    const existingChat = chats.find((chat) => {
      const chatIdentifier = normalizeIdentifier(chat.phone)
      const chatHandle = normalizeNickname(chat.handle.replace(/^@+/u, ''))
      return (
        (normalizedIdentifier && chatIdentifier === normalizedIdentifier) ||
        (normalizedHandle && chatHandle === normalizedHandle)
      )
    })
    if (existingChat) {
      openChat(existingChat.id)
      return
    }

    if (backendReady && session?.sessionToken && normalizedIdentifier) {
      try {
        const response = await openDirectDialogRequest(session.sessionToken, {
          identifier: normalizedIdentifier,
        })
        applySnapshot(response.snapshot)
        openChat(response.dialogId)
        return
      } catch (error) {
        console.error('Failed to open direct dialog from contact link', error)
      }
    }

    openChat(createLocalDialogFromSourceContact(sourceContact))
  }

  function openSourceContact(sourceContact: NonNullable<Message['sourceContact']>) {
    void openSourceContactAsync(sourceContact)
  }

  const openChatInContacts = useCallback((chatId: number) => {
    openChat(chatId, { bottomSection: 'contacts' })
  }, [openChat])

  const {
    actOnContactRequest,
    openIncomingContactRequest,
    openContactRequestRoom,
    openOutgoingContactRequest,
    sendContactRequestForIdentifier,
  } = useContactRequestsFlow({
    applySnapshot,
    backendReady,
    chats,
    openChatInContacts,
    sessionToken: session?.sessionToken,
    setContactRequestActionBusy,
    setContactRequestActionError,
    setContactRequestBusy,
    setContactRequestError,
  })

  const openGroupParticipantContact = useCallback((participant: GroupParticipant) => {
    const participantIdentifier = normalizeIdentifier(participant.identifier ?? '')
    const ownIdentifier = normalizeIdentifier(session?.identifier ?? '')
    if (!participantIdentifier || participantIdentifier === ownIdentifier || participant.archivedAccount) {
      return
    }

    const acceptedChat = chats.find(
      (chat) =>
        normalizeIdentifier(chat.phone) === participantIdentifier && chat.contactState === 'accepted',
    )

    closeGroupParticipantsDialog()

    if (acceptedChat) {
      openChat(acceptedChat.id)
      return
    }

    void openContactRequestRoom(participantIdentifier)
  }, [chats, openChat, openContactRequestRoom, session?.identifier])

  function resolveParticipantDialogAction(participant: GroupParticipant | null) {
    const participantIdentifier = normalizeIdentifier(participant?.identifier ?? '')
    const ownIdentifier = normalizeIdentifier(session?.identifier ?? '')
    if (
      !participant ||
      !participantIdentifier ||
      participantIdentifier === ownIdentifier ||
      participant.archivedAccount
    ) {
      return null
    }

    const acceptedChat = chats.find(
      (chat) =>
        !chat.hidden &&
        normalizeIdentifier(chat.phone) === participantIdentifier &&
        chat.contactState === 'accepted',
    )

    if (acceptedChat) {
      return {
        chatId: acceptedChat.id,
        kind: 'chat' as const,
      }
    }

    return {
      identifier: participantIdentifier,
      kind: 'request' as const,
    }
  }

  const openParticipantDialogAction = useCallback((
    participant: GroupParticipant | null,
    onBeforeOpen?: () => void,
  ) => {
    const action = resolveParticipantDialogAction(participant)
    if (!action) {
      return
    }

    onBeforeOpen?.()

    if (action.kind === 'chat') {
      openChat(action.chatId)
      return
    }

    void openContactRequestRoom(action.identifier)
  }, [chats, openChat, openContactRequestRoom, session?.identifier])

  async function sendContactRequestForActiveChat() {
    if (!activeChat) return

    await sendContactRequestForIdentifier(activeChat.phone)
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

  function resetChangePasswordForm() {
    setChangePasswordBusy(false)
    setChangePasswordError('')
    setChangePasswordCurrentValue('')
    setChangePasswordNextValue('')
    setChangePasswordConfirmValue('')
    setChangePasswordCurrentVisible(false)
    setChangePasswordNextVisible(false)
    setChangePasswordConfirmVisible(false)
  }

  function resetDeleteAccountForm() {
    setDeleteAccountBusy(false)
    setDeleteAccountError('')
    setDeleteAccountPasswordValue('')
    setDeleteAccountPasswordVisible(false)
    setDeleteAccountDataToo(false)
  }

  async function saveChangedPassword() {
    if (!session?.sessionToken) {
      setChangePasswordError('Смена пароля сейчас недоступна. Войдите снова.')
      return false
    }

    setChangePasswordBusy(true)
    setChangePasswordError('')

    try {
      const response = await changePasswordRequest(session.sessionToken, {
        confirmPassword: changePasswordConfirmValue,
        currentPassword: changePasswordCurrentValue,
        password: changePasswordNextValue,
      })
      applySnapshot(response.snapshot)
      resetChangePasswordForm()
      setChangePasswordOpen(false)
      window.alert('Пароль обновлён!')
      trackAnalyticsEvent('auth_password_change_succeeded', {
        revokedPreviousSessions: true,
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обновить пароль.'
      setChangePasswordError(message)
      trackAnalyticsEvent('auth_password_change_failed', {
        message,
      })
      return false
    } finally {
      setChangePasswordBusy(false)
    }
  }

  async function deleteCurrentAccount() {
    if (!session?.sessionToken) {
      setDeleteAccountError('Удаление аккаунта сейчас недоступно. Войдите снова.')
      return false
    }

    setDeleteAccountBusy(true)
    setDeleteAccountError('')
    trackAnalyticsEvent('account_deletion_requested', {
      deleteDataToo: deleteAccountDataToo,
      source: 'settings-management',
    })

    try {
      const deleteDataToo = deleteAccountDataToo
      const response = await deleteAccountRequest(session.sessionToken, {
        deleteDataToo,
        password: deleteAccountPasswordValue,
      })

      const currentAccounts = loadAccounts()
      const nextAccounts = currentAccounts.filter((account) => account.identifier !== session.identifier)
      saveAccounts(nextAccounts)

      resetDeleteAccountForm()
      setDeleteAccountOpen(false)
      trackAnalyticsEvent('account_deletion_succeeded', {
        archivedGroupsCount: response.archivedGroupsCount,
        archivedOwnedChannelsCount: response.archivedOwnedChannelsCount,
        deleteDataToo,
        source: 'settings-management',
        transferredGroupsCount: response.transferredGroupsCount,
      })
      window.alert('Аккаунт удалён. Для входа нужно будет зарегистрироваться заново.')
      logout()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить аккаунт.'
      setDeleteAccountError(message)
      trackAnalyticsEvent('account_deletion_failed', {
        deleteDataToo: deleteAccountDataToo,
        message,
        source: 'settings-management',
      })
      return false
    } finally {
      setDeleteAccountBusy(false)
    }
  }

  async function saveProfileSettings() {
    if (!session || !profileSettingsDraft || !profileSettingsDirty) return

    const nextDisplayName = sanitizePersonField(profileSettingsDraft.displayName, displayNameFieldMaxLength)
    const nextSurname = sanitizePersonField(profileSettingsDraft.surname ?? '', surnameFieldMaxLength)
    const nextNickname = normalizeNickname(profileSettingsDraft.nickname ?? '')
    const nextStatus = sanitizeStatusField(profileSettingsDraft.status ?? '')
    const nextAvatarImage = profileSettingsDraft.avatarImage?.trim() || undefined
    const nextDarkThemeEnabled = Boolean(profileSettingsDraft.darkThemeEnabled)
    const nextPremiumBadgeHidden = Boolean(profileSettingsDraft.premiumBadgeHidden)
    const nextSoundsDisabled = Boolean(profileSettingsDraft.soundsDisabled)

    if (!nextDisplayName) {
      setProfileSettingsError('Имя не может быть пустым.')
      return
    }

    const sanitizedPatchMatchesSession =
      nextDisplayName === session.displayName &&
      nextSurname === (session.surname ?? '') &&
      nextNickname === (session.nickname ?? '') &&
      nextStatus === (session.status ?? '') &&
      nextAvatarImage === session.avatarImage &&
      nextDarkThemeEnabled === Boolean(session.darkThemeEnabled) &&
      nextPremiumBadgeHidden === Boolean(session.premiumBadgeHidden) &&
      nextSoundsDisabled === Boolean(session.soundsDisabled)

    if (sanitizedPatchMatchesSession) {
      discardProfileSettingsDraft()
      return true
    }

    const patch: UpdateSessionBody = {
      avatarImage: nextAvatarImage,
      darkThemeEnabled: nextDarkThemeEnabled,
      displayName: nextDisplayName,
      nickname: nextNickname,
      premiumBadgeHidden: nextPremiumBadgeHidden,
      soundsDisabled: nextSoundsDisabled,
      status: nextStatus,
      surname: nextSurname,
    }

    const nextSession: Session = {
      ...session,
      avatarImage: nextAvatarImage,
      darkThemeEnabled: nextDarkThemeEnabled,
      displayName: nextDisplayName,
      nickname: nextNickname,
      premiumBadgeHidden: nextPremiumBadgeHidden,
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

      trackAnalyticsEvent('profile_settings_saved', {
        changedAvatar: nextAvatarImage !== (session.avatarImage ?? undefined),
        changedDarkTheme: nextDarkThemeEnabled !== Boolean(session.darkThemeEnabled),
        changedNickname: nextNickname !== (session.nickname ?? ''),
        changedPremiumBadgeHidden: nextPremiumBadgeHidden !== Boolean(session.premiumBadgeHidden),
        changedStatus: nextStatus !== (session.status ?? ''),
      })
      if (nextDarkThemeEnabled !== Boolean(session.darkThemeEnabled)) {
        trackAnalyticsEvent('theme_switched', {
          fromTheme: session.darkThemeEnabled ? 'dark' : 'light',
          source: 'settings-profile',
          toTheme: nextDarkThemeEnabled ? 'dark' : 'light',
        })
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

  function closeContactShareDialog() {
    setContactShareOpen(false)
    setContactShareBusy(false)
    setContactShareError('')
    setContactShareChatIds([])
    setContactShareNote('')
  }

  function toggleContactShareChat(chatId: number) {
    setContactShareChatIds((currentChatIds) =>
      currentChatIds.includes(chatId)
        ? currentChatIds.filter((currentId) => currentId !== chatId)
        : [...currentChatIds, chatId],
    )
    setContactShareError('')
  }

  function closeChannelShareDialog() {
    setChannelShareOpen(false)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelShareChatIds([])
  }

  function openChannelShareDialog() {
    closeChannelActions()
    setChannelShareOpen(true)
    setChannelShareBusy(false)
    setChannelShareError('')
    setChannelShareChatIds([])
    setChannelReportOpen(false)
    setChannelReportError('')
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

  function closeGroupParticipantsDialog() {
    setGroupParticipantsOpen(false)
    setGroupParticipantsSearchQuery('')
    setSelectedGroupParticipantIdentifier(null)
    setConfirmingRemoveGroupParticipantIdentifier(null)
    setConfirmingBlacklistGroupParticipantIdentifier(null)
    setGroupParticipantActionBusy(false)
    setGroupParticipantActionError('')
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
    channel: Pick<SubscriptionChannel, 'accent' | 'draft' | 'handle' | 'statusText' | 'title' | 'visibility'>,
  ): NonNullable<Message['sourceChannel']> {
    return {
      accent: channel.accent,
      draft: channel.draft,
      handle: channel.handle,
      leadText: 'Пользователь приглашает вас подписаться на канал:',
      statusText: channel.statusText,
      title: channel.title,
      visibility: channel.visibility,
    }
  }

  async function shareCurrentContactToSelectedChats() {
    if (!activeChat) return
    if (!canShareActiveContact) return

    const sourceContact = buildSourceContactFromChat(activeChat)
    const note = contactShareNote.trim()

    setContactShareBusy(true)
    setContactShareError('')

    try {
      if (backendReady && session?.sessionToken) {
        let latestSnapshot: AppSnapshot | null = null

        for (const chat of selectedContactShareChats) {
          const response = await sendDirectMessageRequest(session.sessionToken, chat.id, {
            sourceContact,
            text: note,
          })
          latestSnapshot = response.snapshot
        }

        if (latestSnapshot) {
          applySnapshot(latestSnapshot)
        }
      } else {
        for (const chat of selectedContactShareChats) {
          applyLocalDirectMessage(chat.id, note, {
            markAsRead: chat.id === activeChatId,
            sourceContact,
          })
        }
      }

      closeContactShareDialog()
      setChatActionsOpen(false)
    } catch (error) {
      console.error('Failed to share contact', error)
      setContactShareError(
        error instanceof Error ? error.message : 'Не удалось поделиться контактом.',
      )
      setContactShareBusy(false)
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

  async function removeCurrentGroupParticipant(identifier: string) {
    if (!activeGroup || !backendReady || !session?.sessionToken) return

    setGroupParticipantActionBusy(true)
    setGroupParticipantActionError('')

    try {
      const response = await removeGroupParticipantRequest(session.sessionToken, activeGroup.id, { identifier })
      applySnapshot(response.snapshot)
      closeGroupParticipantsDialog()
      closeGroupActions()
    } catch (error) {
      console.error('Failed to remove group participant', error)
      setGroupParticipantActionError(
        error instanceof Error ? error.message : 'Не удалось удалить участника из группы.',
      )
      setGroupParticipantActionBusy(false)
    }
  }

  async function blacklistCurrentGroupParticipant(identifier: string) {
    if (!activeGroup || !backendReady || !session?.sessionToken) return

    setGroupParticipantActionBusy(true)
    setGroupParticipantActionError('')

    try {
      const response = await blacklistGroupParticipantRequest(session.sessionToken, activeGroup.id, { identifier })
      applySnapshot(response.snapshot)
      closeGroupParticipantsDialog()
      closeGroupActions()
    } catch (error) {
      console.error('Failed to blacklist group participant', error)
      setGroupParticipantActionError(
        error instanceof Error ? error.message : 'Не удалось добавить участника в чёрный список.',
      )
      setGroupParticipantActionBusy(false)
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

  async function deleteChatHistory(chatId: number, scope: 'everyone' | 'me' = 'me') {
    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteDialogHistoryRequest(session.sessionToken, chatId, { scope })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to delete chat history', error)
        // `Удалить у всех` is a server-authoritative destructive action.
        // If the backend call fails, the initiator must not locally fake success,
        // otherwise the two direct copies diverge again.
        if (scope === 'everyone') {
          window.alert('Не удалось удалить переписку у всех. Попробуйте ещё раз.')
        } else {
          applyLocalDeleteChatHistory(chatId)
        }
      }
    } else {
      if (scope === 'everyone') {
        window.alert('Удаление переписки у всех сейчас недоступно без подключения к серверу.')
      } else {
        applyLocalDeleteChatHistory(chatId)
      }
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
    setDirectMessageEditTarget(null)
    setGroupMessageEditTarget(null)
    setReplyTarget({
      id: message.id,
      text: formatMessagePreview(message),
      author: message.author,
    })
    setMessageActionMessageId(null)
  }

  function startDirectMessageEdit(message: Message) {
    if (!activeChat || !isEditableOwnTextMessage(message)) return

    clearChatAttachmentDraft(activeChat.id)
    setReplyTarget(null)
    setDirectMessageEditTarget({
      author: message.author,
      id: message.id,
      text: message.text,
    })
    updateChatDraft(activeChat.id, message.text)
    setMessageActionMessageId(null)
    setMessageActionAnchor(null)
    setForwardingMessageId(null)
  }

  function startGroupMessageEdit(message: Message) {
    if (!activeGroup || !isEditableOwnTextMessage(message)) return

    clearGroupAttachmentDraft(activeGroup.id)
    setReplyTarget(null)
    setGroupMessageEditTarget({
      author: message.author,
      id: message.id,
      text: message.text,
    })
    updateGroupDraft(activeGroup.id, message.text)
    closeGroupMessageActions()
  }

  function startChannelPostEdit(post: ChannelPost) {
    if (!currentSubscriptionChannel || !isEditableOwnChannelPost(post)) return

    clearChannelAttachmentDraft(currentSubscriptionChannel.id)
    setChannelPostReplyTarget(null)
    setChannelPostEditTarget({
      author: 'me',
      id: post.id,
      text: post.text,
    })
    updateChannelPostDraft(currentSubscriptionChannel.id, post.text)
    closeSubscriptionPostActions()
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
    const sourceContact = resolveEmbeddedContactFromText(trimmedText)
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
      sourceContact: sourceContact ?? undefined,
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
    const sourceContact = resolveEmbeddedContactFromText(trimmedText)
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
      sourceContact: sourceContact ?? undefined,
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
    const targetMessage =
      groups.find((group) => group.id === groupId)?.messages.find((message) => message.id === messageId) ??
      null
    removeVisibleGroupMessageById(messageId)

    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteGroupMessageRequest(session.sessionToken, groupId, messageId)
        applySnapshot(response.snapshot)
        trackAnalyticsEvent('group_message_deleted', {
          hasAttachment: Boolean(targetMessage?.attachment),
          hasReply: Boolean(targetMessage?.replyTo),
        })
      } catch (error) {
        console.error('Failed to delete group message', error)
        applyLocalDeleteGroupMessage(groupId, messageId)
        trackAnalyticsEvent('group_message_deleted', {
          hasAttachment: Boolean(targetMessage?.attachment),
          hasReply: Boolean(targetMessage?.replyTo),
        })
      }
    } else {
      applyLocalDeleteGroupMessage(groupId, messageId)
      trackAnalyticsEvent('group_message_deleted', {
        hasAttachment: Boolean(targetMessage?.attachment),
        hasReply: Boolean(targetMessage?.replyTo),
      })
    }

    resetGroupMessageActions()
  }

  async function deleteManagedChannelPost(channelId: number, postId: number) {
    const targetPost =
      subscriptionChannels
        .find((channel) => channel.id === channelId)
        ?.posts.find((post) => post.id === postId) ?? null
    removeVisibleChannelPostById(postId)

    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteManagedChannelPostRequest(session.sessionToken, channelId, postId)
        applySnapshot(response.snapshot)
        trackAnalyticsEvent('channel_post_deleted', {
          hasAttachment: Boolean(targetPost?.attachment),
          hasThread: Boolean(targetPost?.threadId || targetPost?.threadComments?.length),
        })
      } catch (error) {
        console.error('Failed to delete managed channel post', error)
        applyLocalDeleteManagedChannelPost(channelId, postId)
        trackAnalyticsEvent('channel_post_deleted', {
          hasAttachment: Boolean(targetPost?.attachment),
          hasThread: Boolean(targetPost?.threadId || targetPost?.threadComments?.length),
        })
      }
    } else {
      applyLocalDeleteManagedChannelPost(channelId, postId)
      trackAnalyticsEvent('channel_post_deleted', {
        hasAttachment: Boolean(targetPost?.attachment),
        hasThread: Boolean(targetPost?.threadId || targetPost?.threadComments?.length),
      })
    }

    if (channelPostReplyTarget?.id === postId) {
      setChannelPostReplyTarget(null)
    }

    resetSubscriptionPostActions()
  }

  async function deleteMessage(chatId: number, messageId: number, scope: 'everyone' | 'me' = 'me') {
    const targetMessage = chats.find((chat) => chat.id === chatId)?.messages.find((message) => message.id === messageId) ?? null
    let messageDeleted = false

    if (backendReady && session?.sessionToken) {
      try {
        const response = await deleteDialogMessageRequest(session.sessionToken, chatId, messageId, { scope })
        applySnapshot(response.snapshot)
        messageDeleted = true
      } catch (error) {
        console.error('Failed to delete message', error)
        if (scope === 'everyone') {
          if (error instanceof Error && error.message.trim()) {
            window.alert(error.message)
          } else {
            window.alert('Не удалось удалить сообщение у всех. Попробуйте ещё раз.')
          }
        } else {
          applyLocalDeleteMessage(chatId, messageId)
          messageDeleted = true
        }
      }
    } else {
      if (scope === 'everyone') {
        window.alert('Удаление сообщения у всех сейчас недоступно без подключения к серверу.')
      } else {
        applyLocalDeleteMessage(chatId, messageId)
        messageDeleted = true
      }
    }

    if (messageDeleted) {
      trackAnalyticsEvent(
        scope === 'everyone' ? 'direct_message_deleted_everyone' : 'direct_message_deleted_me',
        {
          hasAttachment: Boolean(targetMessage?.attachment),
          hasReply: Boolean(targetMessage?.replyTo),
        },
      )
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
    const targetComment = activeThreadComments.find((comment) => comment.id === commentId) ?? null

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
          trackAnalyticsEvent('thread_comment_deleted', {
            hasAttachment: Boolean(targetComment?.attachment),
            hasReply: Boolean(targetComment?.replyTo),
            roomKind: 'group',
          })
        } catch (error) {
          console.error('Failed to delete group thread comment', error)
          applyLocalDeleteGroupThreadComment(threadTarget.groupId, threadTarget.messageId, commentId)
          trackAnalyticsEvent('thread_comment_deleted', {
            hasAttachment: Boolean(targetComment?.attachment),
            hasReply: Boolean(targetComment?.replyTo),
            roomKind: 'group',
          })
        }
      } else {
        applyLocalDeleteGroupThreadComment(threadTarget.groupId, threadTarget.messageId, commentId)
        trackAnalyticsEvent('thread_comment_deleted', {
          hasAttachment: Boolean(targetComment?.attachment),
          hasReply: Boolean(targetComment?.replyTo),
          roomKind: 'group',
        })
      }
    } else if (threadTarget.kind === 'channel') {
      if (backendReady && session?.sessionToken) {
        try {
          const response = await deleteSubscriptionChannelThreadCommentRequest(
            session.sessionToken,
            threadTarget.channelId,
            threadTarget.postId,
            commentId,
          )
          applySnapshot(response.snapshot)
          trackAnalyticsEvent('thread_comment_deleted', {
            hasAttachment: Boolean(targetComment?.attachment),
            hasReply: Boolean(targetComment?.replyTo),
            roomKind: 'channel',
          })
        } catch (error) {
          console.error('Failed to delete subscription thread comment', error)
          applyLocalDeleteSubscriptionThreadComment(threadTarget.channelId, threadTarget.postId, commentId)
          trackAnalyticsEvent('thread_comment_deleted', {
            hasAttachment: Boolean(targetComment?.attachment),
            hasReply: Boolean(targetComment?.replyTo),
            roomKind: 'channel',
          })
        }
      } else {
        applyLocalDeleteSubscriptionThreadComment(threadTarget.channelId, threadTarget.postId, commentId)
        trackAnalyticsEvent('thread_comment_deleted', {
          hasAttachment: Boolean(targetComment?.attachment),
          hasReply: Boolean(targetComment?.replyTo),
          roomKind: 'channel',
        })
      }
    } else {
      setThreadError('Комментарии поддержки нельзя удалять из пользовательского интерфейса.')
    }

    clearThreadDeleteConfirmation()
    clearThreadForwarding()
    closeThreadCommentActions()
  }

  function prepareChannelDraft(channelNumber: number, channelId: number) {
    releaseChannelAvatarDraft(creatingChannelAvatarDraft)
    const nextDraft = makeDraftChannel(channelNumber, channelId)
    setCreatingChannelTitle(nextDraft.title)
    setCreatingChannelDirectLink('')
    setCreatingChannelDirectLinkDirty(false)
    setCreatingChannelStatusText(nextDraft.statusText ?? '')
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
    closeGroupParticipantsDialog()
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
    setMessageActionAnchor(null)
    if (nextView !== 'invite') {
      resetChannelInviteState()
    }
  }

  function openChannelsListView() {
    setActiveChannelId(null)
    setChannelDetailView('main')
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
    setChannelDescriptionOpen(false)
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
      nextPatch.statusText !== undefined &&
      nextPatch.statusText !== baselineChannel.statusText
    ) {
      normalizedPatch.statusText = nextPatch.statusText
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
          description: nextChannelState.description,
          draft: nextChannelState.status === 'draft',
          handle: nextChannelState.directLink,
          statusText: nextChannelState.statusText,
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
        description: nextChannelState.description,
        draft: nextChannelState.status === 'draft',
        handle: nextChannelState.directLink,
        statusText: nextChannelState.statusText,
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
    setChannelDetailView('main')
    setConfirmChannelSettingsLeaveOpen(false)
    setPendingAvatarPostPrompt(null)
    setPendingAvatarPostCaption('')
    const nextChannel = channels.find((channel) => channel.id === channelId) ?? null
    setChannelSettingsBaseline(nextChannel ? cloneManagedChannel(nextChannel) : null)
    setActiveChannelId(channelId)
    openChannelsView('detail')
  }

  async function saveManagedChannelSettings(
    channelId: number,
    options?: { exitAfterSave?: boolean },
  ): Promise<'saved' | 'pending-avatar-post' | false> {
    setChannelSettingsBusy(true)
    setChannelSettingsError('')

    try {
      clearScheduledBackendSnapshotSync()
      const pendingPatch = pendingChannelPatchesRef.current.get(channelId) ?? null

      if (!pendingPatch || Object.keys(pendingPatch).length === 0) {
        return 'saved'
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

      trackAnalyticsEvent('channel_settings_saved', {
        channelId,
        changedAvatar: pendingPatch.avatarImage !== undefined,
        changedDescription: pendingPatch.description !== undefined,
        changedStatus: pendingPatch.statusText !== undefined,
        changedTitle: pendingPatch.title !== undefined,
      })

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
        return 'pending-avatar-post'
      }

      if (options?.exitAfterSave && savedChannel) {
        openManagedChannelRoom(savedChannel, savedSnapshot.subscriptionChannels)
      }

      return 'saved'
    } finally {
      setChannelSettingsBusy(false)
    }
  }

  async function handleActiveChannelDetailSave() {
    if (!activeChannel || channelSettingsBusy) return

    await saveManagedChannelSettings(activeChannel.id, { exitAfterSave: true })
  }

  async function handleActiveChannelDetailBack() {
    if (channelDetailView === 'storage') {
      navigateBackWithinApp(() => {
        setChannelStorageItemsError('')
        setChannelDetailView('main')
      })
      return
    }

    if (!activeChannel || channelSettingsBusy) {
      if (!activeChannel) {
        handleChannelsCreateBack()
      }
      return
    }

    if (activeChannelSettingsDirty) {
      setConfirmChannelSettingsLeaveOpen(true)
      return
    }

    navigateBackWithinApp(() => {
      openManagedChannelRoom(activeChannel)
    })
  }

  function closeChannelSettingsLeaveConfirm() {
    if (channelSettingsBusy) return
    setConfirmChannelSettingsLeaveOpen(false)
    clearBlockedBrowserBackNavigation()
  }

  function discardActiveChannelDetailChangesAndExit() {
    if (!activeChannel || !channelSettingsBaseline) return

    discardManagedChannelChanges(activeChannel.id, channelSettingsBaseline)
    setConfirmChannelSettingsLeaveOpen(false)
    if (continueBlockedBrowserBackNavigation()) {
      return
    }

    openManagedChannelRoom(channelSettingsBaseline)
  }

  async function confirmActiveChannelLeaveWithSave() {
    if (!activeChannel) return

    setConfirmChannelSettingsLeaveOpen(false)
    const saveResult = await saveManagedChannelSettings(activeChannel.id, { exitAfterSave: false })
    if (!saveResult) {
      return
    }

    if (saveResult === 'pending-avatar-post') {
      return
    }

    if (continueBlockedBrowserBackNavigation()) {
      return
    }

    const currentChannel =
      channels.find((channel) => channel.id === activeChannel.id) ??
      channelSettingsBaseline ??
      activeChannel
    openManagedChannelRoom(currentChannel)
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

  function buildSourceContactFromChat(chat: Chat): NonNullable<Message['sourceContact']> {
    return {
      accent: chat.accent,
      avatarImage: chat.avatarImage,
      handle: chat.handle,
      identifier: normalizeIdentifier(chat.phone) || chat.phone,
      status: chat.status.trim() || 'На связи',
      title: chat.title,
    }
  }

  function buildSourceContactFromSession(): NonNullable<Message['sourceContact']> | null {
    if (!session?.identifier) {
      return null
    }

    const normalizedNickname = normalizeNickname(session.nickname ?? '')
    const handle = normalizedNickname ? `@${normalizedNickname}` : ''

    return {
      accent: '#8c5738',
      avatarImage: session.avatarImage,
      handle,
      identifier: session.identifier,
      status: session.status?.trim() || 'На связи',
      title: formatSessionName(session) || session.identifier,
    }
  }

  function resolveEmbeddedContactFromText(text: string): NonNullable<Message['sourceContact']> | null {
    const trimmedText = text.trim()
    if (!/^@\S+$/u.test(trimmedText)) return null

    const normalizedHandle = normalizeNickname(trimmedText.replace(/^@+/u, ''))
    if (!normalizedHandle) return null

    const sessionContact = buildSourceContactFromSession()
    if (
      sessionContact?.handle &&
      normalizeNickname(sessionContact.handle.replace(/^@+/u, '')) === normalizedHandle
    ) {
      return sessionContact
    }

    const matchedChat = chats.find((chat) => {
      if (chat.archivedAccount) return false
      return normalizeNickname(chat.handle.replace(/^@+/u, '')) === normalizedHandle
    })

    return matchedChat ? buildSourceContactFromChat(matchedChat) : null
  }

  function resolveEmbeddedChannelFromMessage(
    message: Pick<Message, 'sourceChannel' | 'sourceContact' | 'text'>,
  ): NonNullable<Message['sourceChannel']> | null {
    if (message.sourceChannel || message.sourceContact) return null

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
      normalizedPatch.statusText !== undefined ||
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
                ...(normalizedPatch.statusText !== undefined
                  ? {
                      statusText: normalizedPatch.statusText || undefined,
                      ...(channel.posts.length === 0 && normalizedPatch.statusText
                        ? { preview: normalizedPatch.statusText }
                        : {}),
                    }
                  : {}),
                ...(normalizedPatch.description !== undefined
                  ? {
                      description: normalizedPatch.description,
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
              ...(normalizedPatch.statusText !== undefined
                ? {
                    statusText: normalizedPatch.statusText || undefined,
                    ...(currentChannel.posts.length === 0 && normalizedPatch.statusText
                      ? { preview: normalizedPatch.statusText }
                      : {}),
                  }
                : {}),
              ...(normalizedPatch.description !== undefined
                ? {
                    description: normalizedPatch.description,
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

    if (normalizedPatch.statusText !== undefined) {
      serverPatch.statusText = normalizedPatch.statusText
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

    // UX-only early guard. The backend createGroup check remains authoritative
    // and must keep rejecting overflow creation even if this client is stale.
    if (creatingGroupLimitReached) {
      setCreatingGroupError(getGroupCreationLimitError(creatingGroupsPerUserLimit))
      setCreatingGroupSelectionHint('')
      trackAnalyticsEvent('group_create_failed', {
        memberCount: selectedGroupCreateChats.length + 1,
        reason: 'group-limit-reached',
      })
      return
    }

    if (!canCreateGroup) {
      setCreatingGroupSelectionHint(creatingGroupSelectionRequiredMessage)
      trackAnalyticsEvent('group_create_failed', {
        memberCount: selectedGroupCreateChats.length + 1,
        reason: 'selection-required',
      })
      return
    }

    if (selectedGroupCreateChats.length + 1 > creatingGroupMemberLimit) {
      setCreatingGroupError(
        creatingGroupMemberLimit === premiumGroupMemberLimit
          ? `Даже с премиумом владельца в группе может быть максимум ${premiumGroupMemberLimit} человек.`
          : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать больше людей, необходимо активировать премиум владельцу группы.`,
      )
      trackAnalyticsEvent('group_create_failed', {
        memberCount: selectedGroupCreateChats.length + 1,
        reason: 'member-limit-reached',
      })
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
          description: sanitizeChannelDescription(creatingGroupDescription),
          memberDialogIds: selectedGroupCreateChats.map((chat) => chat.id),
          showHistoryToNewMembers: true,
          title: nextTitle,
        } satisfies CreateGroupBody)
        applySnapshot(response.snapshot)
        trackAnalyticsEvent('group_created', {
          hasAvatar: Boolean(nextAvatarImage),
          memberCount: selectedGroupCreateChats.length + 1,
          threadsMode: creatingGroupCommentsForAll
            ? 'all'
            : creatingGroupCommentsForPremium
              ? 'premium'
              : 'off',
        })
        closeGroupCreateDialog({ preserveCurrentDraft })
        openGroup(response.groupId)
        return
      }

      const nextGroupId = groups.reduce((maxId, group) => Math.max(maxId, group.id), 0) + 1
      const creatorParticipant: GroupParticipant = {
        accent: creatingGroupAccent,
        avatarImage: session.avatarImage,
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
        description: sanitizeChannelDescription(creatingGroupDescription),
        groupOwnerIdentifier: session.identifier,
        handle: buildLocalGroupHandle(nextGroupId),
        showHistoryToNewMembers: true,
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
        viewerIsOwner: true,
      }

      setGroups((currentGroups) => [nextGroup, ...currentGroups])
      trackAnalyticsEvent('group_created', {
        hasAvatar: Boolean(nextAvatarImage),
        memberCount: participants.length,
        threadsMode: creatingGroupCommentsForAll
          ? 'all'
          : creatingGroupCommentsForPremium
            ? 'premium'
            : 'off',
      })

      selectedGroupCreateChats.forEach((chat) => {
        applyLocalDirectMessage(chat.id, '', {
          markAsRead: chat.id === activeChatId,
          sourceGroup: {
            accent: nextGroup.accent,
            avatarImage: nextGroup.avatarImage,
            creatorIdentifier: nextGroup.creatorIdentifier,
            leadText: 'Пользователь приглашает вас в группу',
            groupOwnerIdentifier: nextGroup.groupOwnerIdentifier,
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
      trackAnalyticsEvent('group_create_failed', {
        memberCount: selectedGroupCreateChats.length + 1,
        reason: getAnalyticsReason(error, 'Не удалось создать группу.'),
      })
    }
  }

  async function createChannel() {
    if (channels.length >= managedChannelsPerUserLimit) {
      openManagedChannelLimitError()
      trackAnalyticsEvent('channel_create_failed', {
        reason: 'channel-limit-reached',
        visibility: 'private',
      })
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
          statusText: creatingChannelStatusText,
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
        trackAnalyticsEvent('channel_created', {
          hasAvatar: Boolean(creatingChannelAvatarDraft?.previewUrl),
          threadsMode: creatingChannelCommentsForAll
            ? 'all'
            : creatingChannelCommentsForPremium
              ? 'premium'
              : 'off',
          visibility: 'private',
        })
        const createdManagedChannel =
          response.snapshot.channels.find((channel) => channel.id === response.channelId) ?? null
        setCreatingChannelAvatarDraft(null)
        resetChannelInviteState()
        setChannelManagementOpenId(null)
        if (createdManagedChannel) {
          openManagedChannelRoom(createdManagedChannel, response.snapshot.subscriptionChannels)
        } else {
          setActiveChannelId(response.channelId)
          openChannelsView('detail')
        }
        return
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === `Один пользователь может управлять только ${managedChannelsPerUserLimit} каналами.`
        ) {
          openManagedChannelLimitError()
          trackAnalyticsEvent('channel_create_failed', {
            reason: 'channel-limit-reached',
            visibility: 'private',
          })
          return
        }

        console.error('Failed to create managed channel', error)
        trackAnalyticsEvent('channel_create_failed', {
          reason: getAnalyticsReason(error, 'Не удалось создать канал.'),
          visibility: 'private',
        })
      }
    }

    if (channels.length >= managedChannelsPerUserLimit) {
      openManagedChannelLimitError()
      trackAnalyticsEvent('channel_create_failed', {
        reason: 'channel-limit-reached',
        visibility: 'private',
      })
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
      sanitizeChannelDescription(creatingChannelDescription)
    const statusText = sanitizeStatusField(creatingChannelStatusText) || undefined
    const nextChannel: Channel = {
      avatarImage: creatingChannelAvatarDraft?.previewUrl,
      avatarTone: creatingChannelAvatarTone,
      commentBlacklistIdentifiers: creatingChannelBlacklistIdentifiers,
      commentsEnabledForAll: creatingChannelCommentsForAll,
      commentsEnabledForPremium: creatingChannelCommentsForPremium,
      description,
      directLink,
      id: nextId,
      statusText,
      status: 'draft',
      title,
      visibility: 'private',
    }
    const createdSystemPost = buildLocalChannelSystemPost()
    const nextPreviewChannel: SubscriptionChannel = {
      ...buildPreviewSubscriptionChannelFromManagedChannel(nextChannel),
      creatorIdentifier: session?.identifier,
      latestActivityAt: createdSystemPost.createdAt,
      posts: [createdSystemPost],
      preview: createdSystemPost.text,
      time: createdSystemPost.time,
    }

    setChannels((currentChannels) => [...currentChannels, nextChannel])
    setSubscriptionChannels((currentChannels) => [
      nextPreviewChannel,
      ...currentChannels,
    ])
    trackAnalyticsEvent('channel_created', {
      hasAvatar: Boolean(nextChannel.avatarImage),
      threadsMode: creatingChannelCommentsForAll
        ? 'all'
        : creatingChannelCommentsForPremium
          ? 'premium'
          : 'off',
      visibility: nextChannel.visibility,
    })
    setCreatingChannelAvatarDraft(null)
    resetChannelInviteState()
    setChannelManagementOpenId(null)
    openManagedChannelRoom(nextChannel, [
      nextPreviewChannel,
      ...subscriptionChannels,
    ])
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

  function closeSubscriptionPostActions() {
    closeRoomSubscriptionPostActions()
    setThreadCommentHintTarget(null)
  }

  function closeGroupMessageActions() {
    closeRoomGroupMessageActions()
    clearBlacklistHint()
    setThreadCommentHintTarget(null)
  }

  async function deleteChannel(channelId: number) {
    const targetChannel =
      channels.find((channel) => channel.id === channelId) ??
      (activeChannel?.id === channelId ? activeChannel : null) ??
      null
    const previewChannel =
      subscriptionChannels.find((channel) => channel.id === channelId) ??
      (currentSubscriptionChannel?.id === channelId ? currentSubscriptionChannel : null) ??
      null

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
    trackAnalyticsEvent('channel_deleted', {
      hadAvatar: Boolean(targetChannel?.avatarImage),
      hadSubscribers: Boolean(previewChannel?.readers),
      visibility: targetChannel?.visibility ?? previewChannel?.visibility ?? 'private',
    })
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

  if (!session) {
    return (
      <>
        <AuthScreen
          authCodeFlow={authCodeFlow}
          authError={authError}
          authExistingAccount={authExistingAccount}
          authPhoneBlockedNotice={authPhoneBlockedNotice}
          authStep={authStep}
          captchaBusy={captchaBusy}
          captchaContainerRef={captchaContainerRef}
          captchaPlacement={
            phoneStepCaptchaActive ? 'phone' : passwordStepCaptchaActive ? 'password' : null
          }
          captchaProvider={captchaProvider}
          displayName={displayName}
          displayNameMaxLength={displayNameFieldMaxLength}
          identifier={identifier}
          password={authPassword}
          passwordConfirm={authPasswordConfirm}
          passwordMinLength={passwordFieldMinLength}
          smsCode={smsCode}
          onDisplayNameChange={(value) =>
            setDisplayName(sanitizePersonField(value, displayNameFieldMaxLength))
          }
          onForgotPassword={() => {
            void startForgotPasswordFlow()
          }}
          onIdentifierChange={(value) => {
            setIdentifier(value)
            setAuthExistingAccount(null)
            setAuthBlockedNoticeOpen(false)
            setAuthPhoneBlockedNotice(false)
            setAuthCodeFlow('registration')
            setAuthPassword('')
            setAuthPasswordConfirm('')
            setPasswordLoginCaptchaRequired(false)
          }}
          onPasswordChange={(value) => {
            setAuthPassword(value)
            setAuthBlockedNoticeOpen(false)
            setAuthPhoneBlockedNotice(false)
          }}
          onPasswordConfirmChange={(value) => {
            setAuthPasswordConfirm(value)
            setAuthBlockedNoticeOpen(false)
            setAuthPhoneBlockedNotice(false)
          }}
          onSupportEmailClick={() => {
            trackAnalyticsEvent('auth_support_email_clicked', {
              location: 'auth-footer',
            })
          }}
          onSmsCodeChange={(value) => {
            setSmsCode(value.replace(/[^\d]/g, ''))
            setAuthBlockedNoticeOpen(false)
            setAuthPhoneBlockedNotice(false)
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

            if (authStep === 'password') {
              void submitPasswordStep()
              return
            }

            if (authStep === 'profile-password') {
              void submitProfilePasswordStep()
              return
            }

            if (authStep === 'password-setup') {
              void submitPasswordSetupStep()
              return
            }

            void submitPasswordResetStep()
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

  // Support UI invariant:
  // opening ticket comments inside settings must replace the support scene itself,
  // not stack the thread under the existing support/settings panel. In the same flow
  // the support thread must behave like a fixed-height room with inner scrolling,
  // not stretch the whole settings page vertically.
  const isSupportSettingsThreadOpen =
    isSettingsView && settingsView === 'support' && threadTarget?.kind === 'support'

  const shellClassName = [
    'shell',
    isPremiumView
      ? 'shell-settings shell-premium'
      : isSettingsView || isChannelsView
        ? 'shell-settings'
        : '',
    isSupportSettingsThreadOpen ? 'shell-support-thread-open' : '',
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
        <Suspense fallback={null}>
          <SelectedBubbleOverlay
            anchor={subscriptionPostActionAnchor}
            channelTitle={currentSubscriptionChannel?.title ?? ''}
            kind="channel"
            onOpenAttachment={openMediaViewer}
            onOpenExternalLink={requestOpenExternalLink}
            onOpenPremiumUpsell={openPremiumUpsell}
            post={activeSubscriptionPost}
            draft={Boolean(currentSubscriptionChannel?.draft)}
          />
        </Suspense>
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
                  setChannelPostEditTarget(null)
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
            {isCurrentSubscriptionChannelOwner && isEditableOwnChannelPost(activeSubscriptionPost) ? (
              <button
                type="button"
                className="message-menu-item"
                onClick={() => startChannelPostEdit(activeSubscriptionPost)}
              >
                Редактировать
              </button>
            ) : null}
            {!isPreviewSubscriptionChannel ? (
              <>
                <button
                  type="button"
                  className={`message-menu-item${
                    hasRoomThreadsEnabled(currentSubscriptionChannel) ? '' : ' disabled'
                  }`}
                  aria-disabled={!hasRoomThreadsEnabled(currentSubscriptionChannel)}
                  onClick={() => {
                    if (activeSubscriptionPost.threadArchivedAt) {
                      setThreadCommentHintTarget({
                        reason: 'archived',
                        target: 'channel-post',
                      })
                      return
                    }

                    if (!hasRoomThreadsEnabled(currentSubscriptionChannel)) {
                      setThreadCommentHintTarget({
                        reason: 'disabled',
                        target: 'channel-post',
                      })
                      return
                    }

                    openChannelThread(activeSubscriptionPost.id)
                  }}
                >
                  Прокомментировать
                </button>
                {threadCommentHintTarget?.target === 'channel-post' ? (
                  <p className="settings-text message-menu-note">
                    {threadCommentHintTarget.reason === 'archived'
                      ? getThreadsModerationNoticeText()
                      : getThreadsDisabledNoticeText('channel')}
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
                      {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
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
                setChannelPostEditTarget(null)
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
          {isCurrentSubscriptionChannelOwner && isEditableOwnChannelPost(activeSubscriptionPost) ? (
            <button
              type="button"
              className="message-menu-item"
              onClick={() => startChannelPostEdit(activeSubscriptionPost)}
            >
              Редактировать
            </button>
          ) : null}
          <button
            type="button"
            className="message-menu-item"
            onClick={() => startSubscriptionPostForwarding(formatMessagePreview(activeSubscriptionPost))}
          >
            Переслать
          </button>
          {!activeSubscriptionPost.attachment ? (
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
          ) : null}
            {currentSubscriptionChannel && !isPreviewSubscriptionChannel ? (
              <>
                <button
                  type="button"
                  className={`message-menu-item${hasRoomThreadsEnabled(currentSubscriptionChannel) ? '' : ' disabled'}`}
                aria-disabled={!hasRoomThreadsEnabled(currentSubscriptionChannel)}
                onClick={() => {
                  if (activeSubscriptionPost.threadArchivedAt) {
                    setThreadCommentHintTarget({
                      reason: 'archived',
                      target: 'channel-post',
                    })
                    return
                  }

                  if (!hasRoomThreadsEnabled(currentSubscriptionChannel)) {
                    setThreadCommentHintTarget({
                      reason: 'disabled',
                      target: 'channel-post',
                    })
                    return
                  }

                  openChannelThread(activeSubscriptionPost.id)
                }}
              >
                Прокомментировать
              </button>
              {threadCommentHintTarget?.target === 'channel-post' ? (
                <p className="settings-text message-menu-note">
                  {threadCommentHintTarget.reason === 'archived'
                    ? getThreadsModerationNoticeText()
                    : getThreadsDisabledNoticeText('channel')}
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
      <section className={`chat-room room-thread${isSupportSettingsThreadOpen ? ' room-thread-settings' : ''}`}>
        <header className="room-header room-thread-header">
          <button
            type="button"
            className="soft-button room-mobile-back room-thread-back"
            onClick={handleThreadRoomBack}
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
                  {threadTarget.kind === 'support' && activeSupportTicket ? (
                    <span
                      className={`support-ticket-status-badge support-ticket-status-badge-${activeSupportTicket.status}`}
                    >
                      {formatSupportTicketStatus(activeSupportTicket.status)}
                    </span>
                  ) : null}
                  <span className="chat-star room-thread-entity-icon" aria-hidden="true">
                    <img
                      src={
                        threadTarget.kind === 'group'
                          ? '/icons/group100.png'
                          : threadTarget.kind === 'channel'
                            ? '/icons/news100.svg'
                            : '/icons/man-raising-hand.png'
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
          {activeThreadId && threadTarget.kind !== 'support' ? (
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
                threadGroupMessage.attachment &&
                (
                  isImageMimeType(threadGroupMessage.attachment.mimeType) ||
                  isVideoMimeType(threadGroupMessage.attachment.mimeType)
                ),
              )
              const isImageOnlyBubble =
                hasImageAttachment &&
                !resolveEmbeddedChannelFromMessage(threadGroupMessage) &&
                !threadGroupMessage.sourceChannel &&
                !threadGroupMessage.sourceGroup &&
                threadSourceText.trim().length === 0
              const isVideoNoteOnlyBubble =
                isImageOnlyBubble &&
                Boolean(threadGroupMessage.attachment && isVideoNoteAttachment(threadGroupMessage.attachment))
              const useMediaOnlyBubble = isImageOnlyBubble && !hasImageAttachment
              const usesInlineTimeLayout =
                !hasImageAttachment &&
                (threadSourceText.trim().length > 0 || Boolean(threadGroupMessage.attachment)) &&
                !resolveEmbeddedChannelFromMessage(threadGroupMessage) &&
                !threadGroupMessage.sourceChannel &&
                !threadGroupMessage.sourceGroup &&
                !threadGroupMessage.sourceContact &&
                !threadGroupMessage.attachmentRemovedNotice
              const usesCaptionedImageCardLayout =
                hasImageAttachment &&
                threadSourceText.trim().length > 0 &&
                !resolveEmbeddedChannelFromMessage(threadGroupMessage) &&
                !threadGroupMessage.sourceChannel &&
                !threadGroupMessage.sourceGroup &&
                !threadGroupMessage.sourceContact &&
                !threadGroupMessage.attachmentRemovedNotice
              const usesImageOnlyCardLayout =
                hasImageAttachment &&
                threadSourceText.trim().length === 0 &&
                !resolveEmbeddedChannelFromMessage(threadGroupMessage) &&
                !threadGroupMessage.sourceChannel &&
                !threadGroupMessage.sourceGroup &&
                !threadGroupMessage.sourceContact &&
                !threadGroupMessage.attachmentRemovedNotice
              const usesThumbnailImageLayout =
                hasImageAttachment && !usesCaptionedImageCardLayout && !usesImageOnlyCardLayout
              const threadSourceBubble = isImageOnlyBubble ? (
                <MediaOnlyBubbleRow
                  bubbleClassName={`bubble room-thread-source-bubble${threadGroupMessage.author === 'me' ? ' mine' : ''}${threadGroupMessage.replyTo ? ' has-attached-reply' : ''}${useMediaOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}${usesInlineTimeLayout ? ' room-thread-source-bubble-inline-time' : ''}${usesThumbnailImageLayout ? ' room-thread-source-bubble-thumbnail' : ''}${usesCaptionedImageCardLayout ? ' room-thread-source-bubble-thumbnail-captioned' : ''}${usesImageOnlyCardLayout ? ' room-thread-source-bubble-thumbnail-image-only-card' : ''}`}
                  mine={threadGroupMessage.author === 'me'}
                  semantic="article"
                >
                  <BubbleMessageContent
                    attachmentLayout={
                      usesCaptionedImageCardLayout || usesImageOnlyCardLayout
                        ? 'thread-source-card'
                        : usesThumbnailImageLayout
                          ? 'thread-source-thumbnail'
                          : undefined
                    }
                    imageOverlay={
                      hasImageAttachment && !usesCaptionedImageCardLayout && !usesImageOnlyCardLayout ? (
                        <BubbleImageOverlayMeta time={threadSourceTime} />
                      ) : undefined
                    }
                    inlineMeta={
                      usesInlineTimeLayout ? (
                        <BubbleTextInlineMeta
                          edited={Boolean(threadGroupMessage.editedAt)}
                          time={threadSourceTime}
                        />
                      ) : undefined
                    }
                    linkedChannel={resolveEmbeddedChannelFromMessage(threadGroupMessage)}
                    message={{
                      ...threadGroupMessage,
                      text: threadSourceText,
                    }}
                    onOpenAttachment={openMediaViewer}
                    onOpenExternalLink={requestOpenExternalLink}
                    onOpenPremiumUpsell={openPremiumUpsell}
                    onOpenSourceContact={
                      threadGroupMessage.sourceContact
                        ? () =>
                            openSourceContact(
                              threadGroupMessage.sourceContact as NonNullable<Message['sourceContact']>,
                            )
                        : undefined
                    }
                    showReplyInline={false}
                  />
                  {!usesInlineTimeLayout && (!hasImageAttachment || usesCaptionedImageCardLayout || usesImageOnlyCardLayout) ? (
                    <time>{threadSourceTime}</time>
                  ) : null}
                </MediaOnlyBubbleRow>
              ) : (
                <article
                  className={`bubble room-thread-source-bubble${threadGroupMessage.author === 'me' ? ' mine' : ''}${threadGroupMessage.replyTo ? ' has-attached-reply' : ''}${useMediaOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}${usesInlineTimeLayout ? ' room-thread-source-bubble-inline-time' : ''}${usesThumbnailImageLayout ? ' room-thread-source-bubble-thumbnail' : ''}${usesCaptionedImageCardLayout ? ' room-thread-source-bubble-thumbnail-captioned' : ''}${usesImageOnlyCardLayout ? ' room-thread-source-bubble-thumbnail-image-only-card' : ''}`}
                >
                  <BubbleMessageContent
                    attachmentLayout={
                      usesCaptionedImageCardLayout || usesImageOnlyCardLayout
                        ? 'thread-source-card'
                        : usesThumbnailImageLayout
                          ? 'thread-source-thumbnail'
                          : undefined
                    }
                    imageOverlay={
                      hasImageAttachment && !usesCaptionedImageCardLayout && !usesImageOnlyCardLayout ? (
                        <BubbleImageOverlayMeta time={threadSourceTime} />
                      ) : undefined
                    }
                    inlineMeta={
                      usesInlineTimeLayout ? (
                        <BubbleTextInlineMeta
                          edited={Boolean(threadGroupMessage.editedAt)}
                          time={threadSourceTime}
                        />
                      ) : undefined
                    }
                    linkedChannel={resolveEmbeddedChannelFromMessage(threadGroupMessage)}
                    message={{
                      ...threadGroupMessage,
                      text: threadSourceText,
                    }}
                    onOpenAttachment={openMediaViewer}
                    onOpenExternalLink={requestOpenExternalLink}
                    onOpenPremiumUpsell={openPremiumUpsell}
                    onOpenSourceContact={
                      threadGroupMessage.sourceContact
                        ? () =>
                            openSourceContact(
                              threadGroupMessage.sourceContact as NonNullable<Message['sourceContact']>,
                            )
                        : undefined
                    }
                    showReplyInline={false}
                  />
                  {!usesInlineTimeLayout && (!hasImageAttachment || usesCaptionedImageCardLayout || usesImageOnlyCardLayout) ? (
                    <time>{threadSourceTime}</time>
                  ) : null}
                </article>
              )
              const threadSourceBubbleWithReply = (
                <AttachedReplyBubble
                  mine={threadGroupMessage.author === 'me'}
                  replyTo={threadGroupMessage.replyTo}
                  bubble={threadSourceBubble}
                />
              )

              return threadSourceBubbleWithReply
            })()
          ) : threadTarget.kind === 'channel' && threadChannelPost ? (
            (() => {
              // Important: channel-thread source is not the same surface as support-thread source.
              // The root channel post inside an opened thread must stay a compact preview surface,
              // but it should now stretch full-width like a proper reference card instead of a tiny bubble.
              const hasImageAttachment = Boolean(
                threadChannelPost.attachment &&
                (
                  isImageMimeType(threadChannelPost.attachment.mimeType) ||
                  isVideoMimeType(threadChannelPost.attachment.mimeType)
                ),
              )
              const isImageOnlyBubble =
                hasImageAttachment && threadSourceText.trim().length === 0
              const isVideoNoteOnlyBubble =
                isImageOnlyBubble &&
                Boolean(threadChannelPost.attachment && isVideoNoteAttachment(threadChannelPost.attachment))
              const useMediaOnlyBubble = isImageOnlyBubble && !hasImageAttachment
              const usesInlineTimeLayout =
                !hasImageAttachment &&
                (threadSourceText.trim().length > 0 || Boolean(threadChannelPost.attachment)) &&
                !threadChannelPost.sourceContact &&
                !threadChannelPost.attachmentRemovedNotice
              const usesCaptionedImageCardLayout =
                hasImageAttachment &&
                threadSourceText.trim().length > 0 &&
                !threadChannelPost.sourceContact &&
                !threadChannelPost.attachmentRemovedNotice
              const usesImageOnlyCardLayout =
                hasImageAttachment &&
                threadSourceText.trim().length === 0 &&
                !threadChannelPost.sourceContact &&
                !threadChannelPost.attachmentRemovedNotice
              const usesThumbnailImageLayout =
                hasImageAttachment && !usesCaptionedImageCardLayout && !usesImageOnlyCardLayout

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
                  className={`bubble channel-post room-thread-source-bubble${threadChannelPost.replyTo ? ' has-attached-reply' : ''}${useMediaOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}${usesInlineTimeLayout ? ' room-thread-source-bubble-inline-time' : ''}${usesThumbnailImageLayout ? ' room-thread-source-bubble-thumbnail' : ''}${usesCaptionedImageCardLayout ? ' room-thread-source-bubble-thumbnail-captioned' : ''}${usesImageOnlyCardLayout ? ' room-thread-source-bubble-thumbnail-image-only-card' : ''}`}
                >
                  <BubbleMessageContent
                    attachmentLayout={
                      usesCaptionedImageCardLayout || usesImageOnlyCardLayout
                        ? 'thread-source-card'
                        : usesThumbnailImageLayout
                          ? 'thread-source-thumbnail'
                          : undefined
                    }
                    imageOverlay={
                      hasImageAttachment && !usesCaptionedImageCardLayout && !usesImageOnlyCardLayout ? (
                        <BubbleImageOverlayMeta time={threadSourceTime} />
                      ) : undefined
                    }
                    inlineMeta={
                      usesInlineTimeLayout ? (
                        <BubbleTextInlineMeta
                          edited={Boolean(threadChannelPost.editedAt)}
                          time={threadSourceTime}
                        />
                      ) : undefined
                    }
                    message={{
                      ...threadChannelPost,
                      text: threadSourceText,
                    }}
                    onOpenAttachment={openMediaViewer}
                    onOpenExternalLink={requestOpenExternalLink}
                    onOpenPremiumUpsell={openPremiumUpsell}
                    onOpenSourceContact={
                      threadChannelPost.sourceContact
                        ? () =>
                            openSourceContact(
                              threadChannelPost.sourceContact as NonNullable<Message['sourceContact']>,
                            )
                        : undefined
                    }
                    showReplyInline={false}
                  />
                  {!usesInlineTimeLayout && (!hasImageAttachment || usesCaptionedImageCardLayout || usesImageOnlyCardLayout) ? (
                    <time>{threadSourceTime}</time>
                  ) : null}
                </article>
              }
            />
              )
            })()
          ) : threadTarget.kind === 'support' && activeSupportTicket ? (
            <article className="bubble room-thread-source-bubble mine">
              <div className="settings-support-ticket-topline">
                <span className="bubble-meta">{`Тикет #${activeSupportTicket.id}`}</span>
                <span
                  className={`support-ticket-status-badge support-ticket-status-badge-${activeSupportTicket.status}`}
                >
                  {formatSupportTicketStatus(activeSupportTicket.status)}
                </span>
              </div>
              <BubbleMessageContent
                inlineMeta={
                  threadSourceText.trim().length > 0 || activeSupportTicket.attachment ? (
                    <BubbleTextInlineMeta time={threadSourceTime} />
                  ) : undefined
                }
                message={{
                  attachment: activeSupportTicket.attachment,
                  replyTo: activeSupportTicket.replyTo,
                  sourceContact: undefined,
                  sourceGroup: undefined,
                  text: threadSourceText,
                }}
                onOpenAttachment={openMediaViewer}
                onOpenExternalLink={requestOpenExternalLink}
                onOpenPremiumUpsell={openPremiumUpsell}
                showReplyInline={false}
              />
              {threadSourceText.trim().length === 0 && !activeSupportTicket.attachment ? (
                <time>{threadSourceTime}</time>
              ) : null}
            </article>
          ) : null}
        </div>

        <div className="message-feed room-thread-feed" ref={messageFeedRef}>
          {activeThreadComments.length > 0 ? (
            activeThreadComments.map((comment, index) => {
              const previousComment = index > 0 ? activeThreadComments[index - 1] : null
              const participant = resolveThreadCommentParticipant(comment)
              const mine = comment.author === 'me'
              const shouldRenderCommentAuthorNode = shouldRenderIncomingAuthorStrip(
                comment,
                previousComment,
              )
              const shouldUseCommentAuthorBreakSpacing = shouldUseAuthorChainBreakSpacing(
                comment,
                previousComment,
              )
              const hasImageAttachment = Boolean(
                comment.attachment &&
                (
                  isImageMimeType(comment.attachment.mimeType) ||
                  isVideoMimeType(comment.attachment.mimeType)
                ),
              )
              const isImageOnlyBubble = hasImageAttachment && comment.text.trim().length === 0
              const isVideoNoteOnlyBubble =
                isImageOnlyBubble &&
                Boolean(comment.attachment && isVideoNoteAttachment(comment.attachment))
              const replyReference = comment.replyTo
              const threadCommentTime = formatMessageTimeLabel(comment.createdAt, comment.time)
              const commentAuthorNode =
                !mine && shouldRenderCommentAuthorNode
                  ? renderThreadAuthorNode(participant, comment.displayAuthor ?? 'Участник')
                  : null
              const shouldRenderExternalCommentAuthor =
                Boolean(commentAuthorNode) && (!isImageOnlyBubble || isVideoNoteOnlyBubble)
              const threadCommentRowClassName = shouldUseCommentAuthorBreakSpacing
                ? 'thread-comment-row thread-comment-row-author-break'
                : 'thread-comment-row'

              return (
                <div key={`thread-comment-${comment.id}`} className={threadCommentRowClassName}>
                  <AttachedReplyBubble
                    mine={mine}
                    onReplyClick={
                      replyReference && Number.isInteger(replyReference.id) && replyReference.id > 0
                        ? () => scrollToThreadComment(replyReference.id)
                        : undefined
                    }
                    replyTo={replyReference}
                    bubble={
                      isImageOnlyBubble ? (
                        (() => {
                          const threadCommentMediaBubbleRow = (
                            <MediaOnlyBubbleRow
                              actionLabel="Открыть действия комментария"
                              bubbleAttributes={{ 'data-thread-comment-id': comment.id }}
                              bubbleClassName={`bubble bubble-button${mine ? ' mine' : ''}${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}`}
                              mine={mine}
                              onOpenActions={(anchorElement) => {
                                scheduleActionAnchor(
                                  anchorElement,
                                  mine ? 'end' : 'start',
                                  (anchor) => openThreadFlowCommentActions(comment.id, anchor),
                                )
                              }}
                            >
                              {commentAuthorNode && !isVideoNoteOnlyBubble ? (
                                <button
                                  type="button"
                                  className="bubble-media-header bubble-media-header-button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    scheduleActionAnchor(
                                      event.currentTarget,
                                      mine ? 'end' : 'start',
                                      (anchor) => openThreadFlowCommentActions(comment.id, anchor),
                                    )
                                  }}
                                >
                                  {commentAuthorNode}
                                </button>
                              ) : null}
                              <BubbleMessageContent
                                imageOverlay={
                                  hasImageAttachment
                                    ? <BubbleImageOverlayMeta time={threadCommentTime} />
                                    : undefined
                                }
                                message={{
                                  attachment: comment.attachment,
                                  replyTo: comment.replyTo,
                                  sourceContact: comment.sourceContact,
                                  sourceGroup: undefined,
                                  text: comment.text,
                                }}
                                onOpenAttachment={openMediaViewer}
                                onOpenExternalLink={requestOpenExternalLink}
                                onOpenPremiumUpsell={openPremiumUpsell}
                                onOpenSourceContact={
                                  comment.sourceContact
                                    ? () =>
                                        openSourceContact(
                                          comment.sourceContact as NonNullable<Message['sourceContact']>,
                                        )
                                    : undefined
                                }
                                showReplyInline={false}
                              />
                            </MediaOnlyBubbleRow>
                          )

                          return shouldRenderExternalCommentAuthor ? (
                            <div className="bubble-author-layout">
                              <div className="bubble-author-strip">{commentAuthorNode}</div>
                              {threadCommentMediaBubbleRow}
                            </div>
                          ) : (
                            threadCommentMediaBubbleRow
                          )
                        })()
                      ) : (
                        (() => {
                          const shouldUseInlineTextMeta =
                            !hasImageAttachment &&
                            (comment.text.trim().length > 0 || Boolean(comment.attachment))
                          const threadCommentBubbleButton = (
                            <button
                              type="button"
                              data-bubble-measure={shouldRenderExternalCommentAuthor ? 'true' : undefined}
                              data-thread-comment-id={comment.id}
                              className={`bubble bubble-button${mine ? ' mine' : ''}${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}`}
                              onClick={(event) => {
                                scheduleActionAnchor(
                                  event.currentTarget,
                                  mine ? 'end' : 'start',
                                  (anchor) => openThreadFlowCommentActions(comment.id, anchor),
                                )
                              }}
                            >
                              <BubbleMessageContent
                                imageOverlay={
                                  hasImageAttachment
                                    ? <BubbleImageOverlayMeta time={threadCommentTime} />
                                    : undefined
                                }
                                inlineMeta={
                                  shouldUseInlineTextMeta ? (
                                    <BubbleTextInlineMeta
                                      edited={Boolean(comment.editedAt)}
                                      time={threadCommentTime}
                                    />
                                  ) : undefined
                                }
                                message={{
                                  attachment: comment.attachment,
                                  replyTo: comment.replyTo,
                                  sourceContact: comment.sourceContact,
                                  sourceGroup: undefined,
                                  text: comment.text,
                                }}
                                onOpenAttachment={openMediaViewer}
                                onOpenExternalLink={requestOpenExternalLink}
                                onOpenPremiumUpsell={openPremiumUpsell}
                                onOpenSourceContact={
                                  comment.sourceContact
                                    ? () =>
                                        openSourceContact(
                                          comment.sourceContact as NonNullable<Message['sourceContact']>,
                                        )
                                    : undefined
                                }
                                showReplyInline={false}
                              />
                              {!hasImageAttachment && !shouldUseInlineTextMeta ? <time>{threadCommentTime}</time> : null}
                            </button>
                          )

                          return shouldRenderExternalCommentAuthor ? (
                            <div className="bubble-author-layout">
                              <div className="bubble-author-strip">{commentAuthorNode}</div>
                              {threadCommentBubbleButton}
                            </div>
                          ) : (
                            threadCommentBubbleButton
                          )
                        })()
                      )
                    }
                  />
                </div>
              )
            })
          ) : null}
        </div>

        {activeThreadBlockReason ? (
          <div className="composer composer-disabled">
            <p className="composer-disabled-note">{activeThreadBlockReason}</p>
          </div>
        ) : (
          <RoomComposer
            attachmentDraft={threadAttachmentDraft}
            attachmentInputRef={threadAttachmentInputRef}
            attachmentName={threadAttachmentDraft?.fileName ?? ''}
            attachmentModes={threadTarget.kind === 'support' ? ['photo'] : undefined}
            draftDisabled={threadAttachmentDraft?.kind === 'video-note'}
            draft={threadDraft}
            draftInputRef={threadComposerInputRef}
            gifLibrary={session?.gifLibrary ?? []}
            gifSelectionBlockedReason={getGifSelectionBlockedReason(threadAttachmentDraft)}
            mentionCandidates={activeThreadMentionCandidates}
            onAttachmentChange={handleThreadAttachmentChange}
            onAttachmentClear={clearThreadAttachmentDraft}
            onAttachmentPreviewOpen={
              threadAttachmentDraft ? () => openAttachmentDraftPreview(threadAttachmentDraft) : undefined
            }
            onRenameAttachmentFileBaseName={renameThreadAttachmentFileBaseName}
            onComposerPaste={handleThreadComposerPaste}
            onDeleteGif={deleteGifFromLibrary}
            onDraftChange={setThreadDraft}
            onKeyDown={handleThreadComposerKeyDown}
            onOpenAttachmentPicker={openThreadAttachmentPicker}
            onOpenPremiumUpsell={openPremiumUpsell}
            onOpenVideoNoteRecorder={threadTarget.kind !== 'support' ? openThreadVideoNoteRecorder : undefined}
            onEditCancel={cancelThreadCommentEdit}
            onReplyCancel={clearThreadReplyTarget}
            onSearchGifs={searchAvailableGifs}
            onSelectGif={attachThreadGif}
            onSubmit={submitThreadComment}
            onToggleSendOriginal={toggleThreadAttachmentSendOriginal}
            onUploadGif={uploadAndAttachThreadGif}
            placeholder={
              threadAttachmentDraft
                ? threadAttachmentDraft.kind === 'video-note'
                  ? 'Видеосообщение отправится без подписи.'
                  : threadAttachmentDraft.mimeType.startsWith('image/')
                  ? 'Добавьте подпись к фотографии...'
                  : isVideoMimeType(threadAttachmentDraft.mimeType)
                    ? 'Добавьте подпись к видео...'
                    : 'Добавьте подпись к файлу...'
                : 'Напишите комментарий...'
            }
            premiumUnlocked={sessionHasPremium}
            editTarget={threadEditTarget}
            replyTarget={threadReplyTarget}
            showEmojiPicker={threadTarget.kind !== 'support'}
            storageCleanupWarning={getStorageCleanupWarning(threadAttachmentDraft)}
            submitAriaLabel="Отправить комментарий"
            submitDisabled={
              threadBusy ||
              (threadAttachmentDraft ? threadAttachmentDraft.status !== 'ready' : !threadDraft.trim())
            }
            submitTitle="Отправить комментарий"
            videoNoteDisabled={Boolean(threadAttachmentDraft) || threadDraft.trim().length > 0}
            videoNoteTitle={
              Boolean(threadAttachmentDraft) || threadDraft.trim().length > 0
                ? 'Уберите текст или текущее вложение, чтобы записать видеосообщение'
                : 'Записать видеосообщение'
            }
            topContent={
              activeThreadComments.length === 0 ? (
                <p className="room-thread-empty-copy">Будьте первым, кто оставит комментарий</p>
              ) : null
            }
            bottomContent={threadError ? <p className="auth-error">{threadError}</p> : null}
          />
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
            <Suspense fallback={null}>
              <SelectedBubbleOverlay
                anchor={threadCommentActionAnchor}
                kind="thread-comment"
                comment={activeThreadComment}
                mine={activeThreadComment.author === 'me'}
                onOpenAttachment={openMediaViewer}
                onOpenExternalLink={requestOpenExternalLink}
                onOpenPremiumUpsell={openPremiumUpsell}
                participant={activeThreadCommentParticipant}
                showAuthor={shouldRenderActiveThreadCommentAuthorStrip}
              />
            </Suspense>
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
                      {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
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
              {activeThreadCommentDialogAction ? (
                <button
                  type="button"
                  className="message-menu-item message-menu-item-with-icon"
                  onClick={() =>
                    openParticipantDialogAction(activeThreadCommentParticipant, closeThreadCommentActions)
                  }
                >
                  <img
                    src={
                      activeThreadCommentDialogAction.kind === 'chat'
                        ? '/icons/chat100.png'
                        : '/icons/man-raising-hand.png'
                    }
                    alt=""
                    aria-hidden="true"
                  />
                  <span>{activeThreadCommentDialogAction.kind === 'chat' ? 'В личку' : 'Добавить'}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="message-menu-item"
                onClick={() => replyToThreadComment(activeThreadComment)}
              >
                Ответить
              </button>
              {threadTarget.kind !== 'support' && isEditableOwnThreadComment(activeThreadComment) ? (
                <button
                  type="button"
                  className="message-menu-item"
                  onClick={() => {
                    editThreadComment(activeThreadComment)
                    clearBlacklistHint()
                  }}
                >
                  Редактировать
                </button>
              ) : null}
              {!activeThreadComment.attachment ? (
                <button
                  type="button"
                  className="message-menu-item"
                  onClick={() => {
                    // Media bubbles do not support binary clipboard export, so the
                    // copy action stays text-only and must be hidden for attachments.
                    copyToClipboard(activeThreadComment.text, 'Сообщение скопировано')
                    closeThreadCommentActions()
                  }}
                >
                  Скопировать
                </button>
              ) : null}
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
            {isCurrentSubscriptionChannelOwner && ownedCurrentManagedChannel && !currentSubscriptionChannelArchived ? (
              <button
                type="button"
                className="message-menu-item message-menu-item-with-icon"
                onClick={() => {
                  closeChannelActions()
                  openChannelDetailView(ownedCurrentManagedChannel.id)
                }}
              >
                <img src="/icons/edit100.png" alt="" aria-hidden="true" />
                <span>Настройки канала</span>
              </button>
            ) : null}
            <button
              type="button"
              className="message-menu-item"
              onClick={() => {
                closeChannelActions()
                setChannelDescriptionOpen(true)
                setChannelShareOpen(false)
                setChannelReportOpen(false)
                setChannelShareError('')
                setChannelReportError('')
              }}
            >
              Описание канала
            </button>
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
            {!currentSubscriptionChannelArchived ? (
              <button
                type="button"
                className="message-menu-item"
                onClick={openChannelShareDialog}
              >
                Пригласить подписаться
              </button>
            ) : null}
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
                          {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
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

      {channelDescriptionOpen && currentSubscriptionChannel ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть описание канала"
            onClick={() => setChannelDescriptionOpen(false)}
          />
          <div className="room-confirm channel-description-dialog">
            <div className="channel-description-dialog-header">
              <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: currentSubscriptionChannel.accent }}>
                {currentSubscriptionChannel.avatarImage ? (
                  <img src={currentSubscriptionChannel.avatarImage} alt="" className="channel-avatar-image" />
                ) : (
                  formatChannelAvatarLabel(currentSubscriptionChannel.title)
                )}
              </span>
              <div className="channel-description-dialog-copy">
                <h3>{currentSubscriptionChannel.title}</h3>
                {currentSubscriptionChannelStatusText ? (
                  <p className="channel-description-dialog-status">{currentSubscriptionChannelStatusText}</p>
                ) : (
                  <p className="channel-description-dialog-status channel-description-dialog-empty">
                    Статус канала пока не заполнен.
                  </p>
                )}
              </div>
            </div>
            <div className="channel-description-dialog-body">
              <p className="channel-description-dialog-label">Описание</p>
              {currentSubscriptionChannelDescriptionText ? (
                <p className="channel-description-dialog-text">{currentSubscriptionChannelDescriptionText}</p>
              ) : (
                <p className="channel-description-dialog-text channel-description-dialog-empty">
                  Описание канала пока не заполнено.
                </p>
              )}
            </div>
            <div className="room-forward-list">
              <div className="room-forward-item channel-description-contact-card">
                <span className="chat-avatar-stack">
                  <span
                    className="avatar"
                    style={{ backgroundColor: currentSubscriptionChannelCreatorChat?.accent ?? currentSubscriptionChannel.accent ?? '#8c5738' }}
                  >
                    {session?.avatarImage && currentSubscriptionChannelCreatorIdentifier === session?.identifier ? (
                      <img src={session.avatarImage} alt="" className="channel-avatar-image" />
                    ) : (
                      renderAccountAvatarContent(
                        currentSubscriptionChannelCreatorChat?.title ??
                          (currentSubscriptionChannelCreatorIdentifier === session?.identifier
                            ? formatSessionName(session)
                            : 'Создатель канала'),
                        currentSubscriptionChannelCreatorChat?.archivedAccount,
                        currentSubscriptionChannelCreatorChat?.avatarImage,
                      )
                    )}
                  </span>
                </span>
                <span className="group-create-member-copy">
                  <strong className="group-create-member-name-row">
                    <span>
                      {currentSubscriptionChannelCreatorChat?.title ??
                        (currentSubscriptionChannelCreatorIdentifier === session?.identifier
                          ? formatSessionName(session)
                          : 'Создатель канала')}
                    </span>
                  </strong>
                  <span>
                    {currentSubscriptionChannelCreatorChat
                      ? currentSubscriptionChannelCreatorChat.handle || currentSubscriptionChannelCreatorChat.phone
                      : currentSubscriptionChannelCreatorIdentifier === session?.identifier
                        ? (session?.nickname ? `@${session.nickname}` : session?.identifier)
                        : 'Контакт создателя'}
                  </span>
                </span>
              </div>
            </div>
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setChannelDescriptionOpen(false)}
              >
                Назад
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
                          {renderAccountAvatarContent(participant.title, participant.archivedAccount)}
                        </span>
                        {participant.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                      </span>
                      <span className="room-participant-copy">
                        <span className="room-participant-name-row">
                          <strong>{participant.title}</strong>
                          {participant.archivedAccount ? (
                            <span className="room-participant-role room-participant-role-archived">Архив</span>
                          ) : null}
                          {isOwner ? (
                            <span className="room-participant-role">Владелец</span>
                          ) : null}
                          {shouldShowPremiumCrown(participant) ? (
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
            <div
              className={`room-confirm-actions ${
                currentSubscriptionChannelArchived ? 'room-confirm-actions-single' : 'room-confirm-actions-dual'
              }`}
            >
              {!currentSubscriptionChannelArchived ? (
                <button
                  type="button"
                  className="room-confirm-button room-confirm-button-primary"
                  onClick={() => {
                    closeChannelSubscribersDialog()
                    openChannelShareDialog()
                  }}
                  disabled={channelSubscriberActionBusy}
                >
                  Пригласить пользователя
                </button>
              ) : null}
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
        <Suspense fallback={null}>
          <SelectedBubbleOverlay
            anchor={groupMessageActionAnchor}
            deliveryIssue={activeGroupMessageDeliveryIssue ?? undefined}
            kind="group"
            linkedChannel={activeGroupMessage ? resolveEmbeddedChannelFromMessage(activeGroupMessage) : null}
            message={activeGroupMessage}
            mine={activeGroupMessage.author === 'me'}
            onOpenAttachment={openMediaViewer}
            onOpenExternalLink={requestOpenExternalLink}
            onOpenPremiumUpsell={openPremiumUpsell}
            participant={activeGroupMessageParticipant}
            showAuthor={shouldRenderActiveGroupMessageAuthorStrip}
            uploadProgress={activeGroupMessageUploadProgress ?? undefined}
          />
        </Suspense>
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
                  {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
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
              {activeGroupMessageDialogAction ? (
                <button
                  type="button"
                  className="message-menu-item message-menu-item-with-icon"
                  onClick={() =>
                    openParticipantDialogAction(activeGroupMessageParticipant, closeGroupMessageActions)
                  }
                >
                  <img
                    src={
                      activeGroupMessageDialogAction.kind === 'chat'
                        ? '/icons/chat100.png'
                        : '/icons/man-raising-hand.png'
                    }
                    alt=""
                    aria-hidden="true"
                  />
                  <span>{activeGroupMessageDialogAction.kind === 'chat' ? 'В личку' : 'Добавить'}</span>
                </button>
              ) : null}
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
              {isEditableOwnTextMessage(activeGroupMessage) ? (
                <button
                  type="button"
                  className="message-menu-item"
                  onClick={() => startGroupMessageEdit(activeGroupMessage)}
                >
                  Редактировать
                </button>
              ) : null}
              <button
                type="button"
                className="message-menu-item"
                onClick={() => startGroupMessageForwarding(formatMessagePreview(activeGroupMessage))}
              >
                Переслать
              </button>
              {!activeGroupMessage.attachment ? (
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
              ) : null}
              {activeGroup ? (
                <>
                  <button
                    type="button"
                    className={`message-menu-item${hasRoomThreadsEnabled(activeGroup) ? '' : ' disabled'}`}
                    aria-disabled={!hasRoomThreadsEnabled(activeGroup)}
                    onClick={() => {
                      if (activeGroupMessage.threadArchivedAt) {
                        setThreadCommentHintTarget({
                          reason: 'archived',
                          target: 'group-message',
                        })
                        return
                      }

                      if (!hasRoomThreadsEnabled(activeGroup)) {
                        setThreadCommentHintTarget({
                          reason: 'disabled',
                          target: 'group-message',
                        })
                        return
                      }

                      openGroupThread(activeGroupMessage.id)
                    }}
                  >
                    Прокомментировать
                  </button>
                  {threadCommentHintTarget?.target === 'group-message' ? (
                    <p className="settings-text message-menu-note">
                      {threadCommentHintTarget.reason === 'archived'
                        ? getThreadsModerationNoticeText()
                        : getThreadsDisabledNoticeText('group')}
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
              {activeGroupMessage.author === 'me' || isActiveGroupCreator ? (
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
            {isActiveGroupCreator && !activeGroupArchived ? (
              <button
                type="button"
                className="message-menu-item message-menu-item-with-icon"
                onClick={openGroupSettingsDialog}
              >
                <img src="/icons/edit100.png" alt="" aria-hidden="true" />
                <span>Настройки группы</span>
              </button>
            ) : null}
            <button
              type="button"
              className="message-menu-item"
              onClick={() => {
                closeGroupActions()
                setGroupDescriptionOpen(true)
              }}
            >
              Идеалогия группы
            </button>
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
            {!activeGroupArchived ? (
              <button
                type="button"
                className={`message-menu-item${activeGroupAtMemberLimit ? ' disabled' : ''}`}
                onClick={openGroupInvitePopup}
              >
                Пригласить в группу
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
                inviteableGroupChats.map(({ chat, alreadyMember }) => (
                  <div key={`group-invite-${chat.id}`} className="room-forward-item-slot">
                    <button
                      type="button"
                      className={`room-forward-item${alreadyMember ? ' room-forward-item-disabled room-forward-item-existing-member' : ''}`}
                      onClick={() => {
                        if (alreadyMember) {
                          setGroupInviteError('')
                          setGroupInviteInlineError({
                            chatId: chat.id,
                            message: 'Этот контакт уже состоит в группе.',
                          })
                          return
                        }

                        void inviteChatToActiveGroup(chat.id)
                      }}
                      disabled={groupInviteBusy}
                      aria-disabled={alreadyMember || groupInviteBusy}
                    >
                      <span className="avatar" style={{ backgroundColor: chat.accent }}>
                        {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
                      </span>
                      <span className="room-forward-item-copy">
                        <span>{chat.title}</span>
                        {alreadyMember ? (
                          <span className="room-forward-item-status">Уже в группе</span>
                        ) : null}
                      </span>
                    </button>
                    {groupInviteInlineError?.chatId === chat.id ? (
                      <p className="room-forward-item-inline-error">{groupInviteInlineError.message}</p>
                    ) : null}
                  </div>
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
          onClick={closeGroupParticipantsDialog}
        />
        <div className="room-confirm room-transfer-list room-participants">
          <p className="room-confirm-copy">{`Участники группы ${activeGroup.title}`}</p>
          <label className="search room-transfer-search">
            <span className="search-label">Поиск участника</span>
            <input
              type="search"
              placeholder="Имя, фамилия или @никнейм"
              value={groupParticipantsSearchQuery}
              onChange={(event) => setGroupParticipantsSearchQuery(event.target.value)}
            />
          </label>
          <div className="room-forward-list room-participants-list">
            {filteredActiveGroupParticipants.length > 0 ? (
              filteredActiveGroupParticipants.map((participant) => {
                const participantIdentifier = normalizeIdentifier(participant.identifier ?? '')
                const isOwner = participantIdentifier === activeGroupOwnerIdentifier
                const isSelf = participantIdentifier === normalizeIdentifier(session?.identifier ?? '')
                const isBlacklisted =
                  participantIdentifier.length > 0 &&
                  isRoomCommentsBlacklisted(activeGroup, participantIdentifier)
                const acceptedChat = participantIdentifier
                  ? chats.find(
                      (chat) =>
                        !chat.hidden &&
                        normalizeIdentifier(chat.phone) === participantIdentifier &&
                        chat.contactState === 'accepted',
                    ) ?? null
                  : null
                const actionKind =
                  !participant.archivedAccount && !isSelf && participantIdentifier
                    ? acceptedChat
                      ? 'chat'
                      : 'request'
                    : null
                const canManageParticipant =
                  isActiveGroupCreator &&
                  !participant.archivedAccount &&
                  !isOwner &&
                  !isSelf &&
                  participantIdentifier.length > 0

                const participantCard = (
                  <>
                    <span className="chat-avatar-stack room-participant-avatar-stack">
                      <span className="avatar" style={{ backgroundColor: participant.accent }}>
                        {renderAccountAvatarContent(participant.title, participant.archivedAccount)}
                      </span>
                      {participant.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                    </span>
                    <span className="room-participant-copy">
                      <span className="room-participant-name-row">
                        <strong>{participant.title}</strong>
                        {participant.archivedAccount ? (
                          <span className="room-participant-role room-participant-role-archived">Архив</span>
                        ) : null}
                        {isOwner ? (
                          <span className="room-participant-role">Владелец</span>
                        ) : null}
                        {isBlacklisted ? (
                          <span className="room-participant-role room-participant-role-blacklisted">
                            Чёрный список
                          </span>
                        ) : null}
                        {shouldShowPremiumCrown(participant) ? (
                          <span className="premium-crown chat-crown" aria-label="Премиум">
                            <img src="/icons/crown64.png" alt="" />
                          </span>
                        ) : null}
                      </span>
                      <span className="room-participant-status">
                        {participant.nickname ? `@${participant.nickname}` : participant.status}
                      </span>
                    </span>
                    {actionKind ? (
                      <button
                        type="button"
                        className="room-participant-action"
                        aria-label={
                          actionKind === 'chat'
                            ? `Открыть диалог с ${participant.title}`
                            : `Начать диалог с ${participant.title}`
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          openGroupParticipantContact(participant)
                        }}
                      >
                        <img
                          src={actionKind === 'chat' ? '/icons/chat100.png' : '/icons/man-raising-hand.png'}
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                    ) : null}
                  </>
                )

                return canManageParticipant ? (
                  <div
                    key={participant.id}
                    className="room-forward-item room-participant-item room-participant-item-button"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedGroupParticipantIdentifier(participantIdentifier)
                      setGroupParticipantActionError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      setSelectedGroupParticipantIdentifier(participantIdentifier)
                      setGroupParticipantActionError('')
                    }}
                  >
                    {participantCard}
                  </div>
                ) : (
                  <div key={participant.id} className="room-forward-item room-participant-item">
                    {participantCard}
                  </div>
                )
              })
            ) : (
              <article className="settings-item room-transfer-empty">
                <p className="settings-text">Подходящие участники не найдены.</p>
              </article>
            )}
          </div>
          {groupParticipantActionError ? <p className="auth-error">{groupParticipantActionError}</p> : null}
          <div
            className={`room-confirm-actions ${
              isActiveGroupCreator && !activeGroupArchived
                ? 'room-confirm-actions-dual'
                : 'room-confirm-actions-single'
            }`}
          >
            {isActiveGroupCreator && !activeGroupArchived ? (
              <button
                type="button"
                className={`room-confirm-button room-confirm-button-primary${activeGroupAtMemberLimit ? ' disabled' : ''}`}
                aria-disabled={activeGroupAtMemberLimit}
                onClick={() => {
                  closeGroupParticipantsDialog()
                  openGroupInvitePopup()
                }}
                disabled={groupParticipantActionBusy}
              >
                Пригласить пользователя
              </button>
            ) : null}
            <button
              type="button"
              className="room-confirm-button"
              onClick={closeGroupParticipantsDialog}
              disabled={groupParticipantActionBusy}
            >
              Закрыть
            </button>
          </div>
        </div>
      </>
    ) : null

  const selectedActiveGroupParticipantDialog =
    selectedActiveGroupParticipant && activeGroup && isActiveGroupCreator ? (
      <>
        <button
          type="button"
          className="room-confirm-scrim"
          aria-label="Закрыть действия участника группы"
          onClick={() => {
            setSelectedGroupParticipantIdentifier(null)
            setGroupParticipantActionError('')
          }}
        />
        <div className="room-confirm room-confirm-compact">
          <p className="room-confirm-copy">{selectedActiveGroupParticipant.title}</p>
          <div className="room-forward-list room-report-reason-list">
            <button
              type="button"
              className="room-forward-item room-report-reason-item room-report-danger"
              onClick={() => {
                setConfirmingRemoveGroupParticipantIdentifier(
                  normalizeIdentifier(selectedActiveGroupParticipant.identifier ?? ''),
                )
              }}
            >
              <span>Удалить участника</span>
            </button>
            {selectedActiveGroupParticipantBlacklisted ? (
              <div className="room-forward-item room-report-reason-item room-forward-item-static">
                <span>Уже в чёрном списке</span>
              </div>
            ) : (
              <button
                type="button"
                className="room-forward-item room-report-reason-item room-report-danger"
                onClick={() => {
                  setConfirmingBlacklistGroupParticipantIdentifier(
                    normalizeIdentifier(selectedActiveGroupParticipant.identifier ?? ''),
                  )
                }}
              >
                <span>В чёрный список</span>
              </button>
            )}
          </div>
          <div className="room-confirm-actions room-confirm-actions-single">
            <button
              type="button"
              className="room-confirm-button"
              onClick={() => {
                setSelectedGroupParticipantIdentifier(null)
                setGroupParticipantActionError('')
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      </>
    ) : null

  const confirmingRemoveGroupParticipantDialog =
    confirmingRemoveGroupParticipantIdentifier && selectedActiveGroupParticipant ? (
      <>
        <button
          type="button"
          className="room-confirm-scrim"
          aria-label="Закрыть подтверждение удаления участника группы"
          onClick={() => setConfirmingRemoveGroupParticipantIdentifier(null)}
        />
        <div className="room-confirm room-confirm-compact">
          <p className="room-confirm-copy">{`Удалить ${selectedActiveGroupParticipant.title} из группы?`}</p>
          <div className="room-confirm-actions room-confirm-actions-dual">
            <button
              type="button"
              className="room-confirm-button room-confirm-danger"
              onClick={() => {
                void removeCurrentGroupParticipant(confirmingRemoveGroupParticipantIdentifier)
              }}
              disabled={groupParticipantActionBusy}
            >
              Удалить
            </button>
            <button
              type="button"
              className="room-confirm-button"
              onClick={() => setConfirmingRemoveGroupParticipantIdentifier(null)}
              disabled={groupParticipantActionBusy}
            >
              Отмена
            </button>
          </div>
        </div>
      </>
    ) : null

  const confirmingBlacklistGroupParticipantDialog =
    confirmingBlacklistGroupParticipantIdentifier && selectedActiveGroupParticipant ? (
      <>
        <button
          type="button"
          className="room-confirm-scrim"
          aria-label="Закрыть подтверждение чёрного списка участника группы"
          onClick={() => setConfirmingBlacklistGroupParticipantIdentifier(null)}
        />
        <div className="room-confirm room-confirm-compact">
          <p className="room-confirm-copy">{`Добавить ${selectedActiveGroupParticipant.title} в чёрный список группы?`}</p>
          <div className="room-confirm-actions room-confirm-actions-dual">
            <button
              type="button"
              className="room-confirm-button room-confirm-danger"
              onClick={() => {
                void blacklistCurrentGroupParticipant(confirmingBlacklistGroupParticipantIdentifier)
              }}
              disabled={groupParticipantActionBusy}
            >
              В чёрный список
            </button>
            <button
              type="button"
              className="room-confirm-button"
              onClick={() => setConfirmingBlacklistGroupParticipantIdentifier(null)}
              disabled={groupParticipantActionBusy}
            >
              Отмена
            </button>
          </div>
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

  const externalLinkWarningDialog = pendingExternalLinkUrl ? (
    <>
      <button
        type="button"
        className="room-confirm-scrim"
        aria-label="Закрыть предупреждение о внешней ссылке"
        onClick={closeExternalLinkWarning}
      />
      <div className="room-confirm room-confirm-compact external-link-warning-dialog">
        <p className="room-confirm-copy external-link-warning-title">Внешняя ссылка</p>
        <p className="settings-text room-confirm-note external-link-warning-copy">
          Вы переходите во внешний источник под свою ответственность.
        </p>
        <p className="settings-text room-confirm-note external-link-warning-copy">
          Не переходите по ссылкам от малоизвестных аккаунтов, если не уверены в источнике.
        </p>
        <p className="external-link-warning-url">{pendingExternalLinkUrl}</p>
        <div className="room-confirm-actions room-confirm-actions-dual">
          <button type="button" className="room-confirm-button" onClick={closeExternalLinkWarning}>
            Отмена
          </button>
          <button
            type="button"
            className="room-confirm-button room-confirm-danger"
            onClick={confirmOpenExternalLink}
          >
            Перейти
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
                <span className="self-presence-avatar-stack account-avatar">
                  <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: '#8c5738' }}>
                    {session?.avatarImage ? (
                      <img src={session.avatarImage} alt="" className="channel-avatar-image" />
                    ) : (
                      sessionAvatarLabel
                    )}
                  </span>
                  {selfPresenceIndicatorMode ? (
                    <span
                      className={
                        selfPresenceIndicatorMode === 'invisible'
                          ? 'self-presence-indicator invisible'
                          : 'self-presence-indicator'
                      }
                      aria-label={selfPresenceIndicatorMode === 'invisible' ? 'Режим невидимки' : 'В сети'}
                    />
                  ) : null}
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
                onClick={toggleQuietMode}
                aria-label="Тихо"
                title="Тихо"
              >
                <img src={getQuietToggleIconPath(quietMode)} alt="" />
              </button>
            </div>
          </div>
          {session.status?.trim() ? (
            <div className="account-status-row">
              <p ref={accountStatusRef}>{session.status}</p>
            </div>
          ) : null}
        </div>

        <div
          className={
            searchOpen
              ? 'filters search-filters'
              : bottomSection === 'contacts'
                ? 'filters contacts-filters'
                : 'filters'
          }
          aria-label={
            searchOpen
              ? 'Фильтры поиска'
              : bottomSection === 'contacts'
                ? 'Фильтры контактов'
                : 'Фильтры чатов'
          }
        >
          {searchOpen ? (
            <>
              <button
                type="button"
                className={searchTopFilter === 'all' ? 'filter active' : 'filter'}
                onClick={() => setSearchTopFilter('all')}
              >
                <span className="filter-inline-content">
                  <span>Все</span>
                </span>
              </button>
              <button
                type="button"
                className={searchTopFilter === 'contacts' ? 'filter active search-filter' : 'filter search-filter'}
                onClick={() => setSearchTopFilter('contacts')}
                aria-label="Контакты"
                title="Контакты"
              >
                <span className="filter-inline-content">
                  <img className="filter-icon" src="/icons/contacts100.svg" alt="" />
                  <span>Контакты</span>
                </span>
              </button>
              <button
                type="button"
                className={searchTopFilter === 'channels' ? 'filter active search-filter' : 'filter search-filter'}
                onClick={() => setSearchTopFilter('channels')}
                aria-label="Каналы"
                title="Каналы"
              >
                <span className="filter-inline-content">
                  <img className="filter-icon" src="/icons/news100.svg" alt="" />
                  <span>Каналы</span>
                </span>
              </button>
            </>
          ) : bottomSection === 'contacts' ? (
            <ContactsFilters
              contactsTab={contactsTab}
              formatUnreadBadgeCount={formatUnreadBadgeCount}
              incomingContactRequestCount={incomingContactRequestCount}
              outgoingContactRequestCount={outgoingContactRequestCount}
              suppressContactRequestBadges={quietContactRequestsSuppressed}
              onSelectTab={(tab) => {
                setContactsTab(tab)
                setSearchOpen(false)
                setTopListView('none')
                setActiveSubscriptionChannelId(null)
                setActiveGroupId(null)
                resetGroupMessageActions()
              }}
            />
          ) : (
            <>
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
                    <span
                      className={
                        !quietDialogsSuppressed && totalFavoriteUnreadCount > 0
                          ? 'filter-inline-content filter-inline-content-compact'
                          : 'filter-inline-content'
                      }
                    >
                      <img className="filter-icon" src="/icons/star100.png" alt="Избранное" />
                      {!quietDialogsSuppressed && totalFavoriteUnreadCount > 0 ? (
                        <span
                          className={
                            totalFavoriteUnreadCount > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'
                          }
                        >
                          {formatUnreadBadgeCount(totalFavoriteUnreadCount)}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="filter-inline-content">
                      <span>Все</span>
                      {!quietDialogsSuppressed && totalUnreadCount > 0 ? (
                        <span
                          className={totalUnreadCount > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'}
                        >
                          {formatUnreadBadgeCount(totalUnreadCount)}
                        </span>
                      ) : null}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                className={
                  isChannelsTopListOpen
                    ? !quietChannelsSuppressed && totalChannelNotifications > 0
                      ? 'filter active filter-with-inline-badge filter-with-inline-badge-compact'
                      : 'filter active'
                    : !quietChannelsSuppressed && totalChannelNotifications > 0
                      ? 'filter filter-with-inline-badge filter-with-inline-badge-compact'
                      : 'filter'
                }
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
                <span
                  className={
                    !quietChannelsSuppressed && totalChannelNotifications > 0
                      ? 'filter-inline-content filter-inline-content-compact'
                      : 'filter-inline-content'
                  }
                >
                  <img className="filter-icon" src="/icons/news100.svg" alt="Каналы" />
                  {!quietChannelsSuppressed && totalChannelNotifications > 0 ? (
                    <span
                      className={
                        totalChannelNotifications > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'
                      }
                    >
                      {formatUnreadBadgeCount(totalChannelNotifications)}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                className={
                  isGroupsTopListOpen
                    ? !quietGroupsSuppressed && totalGroupNotifications > 0
                      ? 'filter active filter-with-inline-badge filter-with-inline-badge-compact'
                      : 'filter active'
                    : !quietGroupsSuppressed && totalGroupNotifications > 0
                      ? 'filter filter-with-inline-badge filter-with-inline-badge-compact'
                      : 'filter'
                }
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
                <span
                  className={
                    !quietGroupsSuppressed && totalGroupNotifications > 0
                      ? 'filter-inline-content filter-inline-content-compact'
                      : 'filter-inline-content'
                  }
                >
                  <img className="filter-icon" src="/icons/group100.png" alt="Группы" />
                  {!quietGroupsSuppressed && totalGroupNotifications > 0 ? (
                    <span className={totalGroupNotifications > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'}>
                      {formatUnreadBadgeCount(totalGroupNotifications)}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                className={
                  isThreadsTopListOpen
                    ? !quietThreadsSuppressed && totalThreadNotifications > 0
                      ? 'filter active filter-icon-only filter-with-inline-badge filter-with-inline-badge-compact'
                      : 'filter active filter-icon-only'
                    : !quietThreadsSuppressed && totalThreadNotifications > 0
                      ? 'filter filter-icon-only filter-with-inline-badge filter-with-inline-badge-compact'
                      : 'filter filter-icon-only'
                }
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
                aria-label="Комментарии"
                title="Комментарии"
              >
                <span
                  className={
                    !quietThreadsSuppressed && totalThreadNotifications > 0
                      ? 'filter-inline-content filter-inline-content-compact'
                      : 'filter-inline-content'
                  }
                >
                  <img className="filter-icon" src="/icons/root-50.png" alt="" />
                  {!quietThreadsSuppressed && totalThreadNotifications > 0 ? (
                    <span
                      className={
                        totalThreadNotifications > 9 ? 'filter-badge filter-badge-wide' : 'filter-badge'
                      }
                    >
                      {formatUnreadBadgeCount(totalThreadNotifications)}
                    </span>
                  ) : null}
                </span>
              </button>
            </>
          )}
        </div>

        {searchOpen && topListView === 'none' ? (
          <label className="search">
            <span className="search-label">Поиск</span>
            <input
              type="search"
              placeholder="Имя, канал или @handle"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}

        {searchOpen && topListView === 'none' ? (
          <div className="chat-list search-results">
            {searchShowsContacts && myContactsResults.length > 0 ? (
              <section className="search-group">
                <p className="search-group-title">Мои контакты</p>
                {myContactsResults.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={chat.id === activeChat?.id ? 'chat-card dialog-list-card active' : 'chat-card dialog-list-card'}
                    onClick={() => {
                      trackAnalyticsEvent('contact_search_result_opened', {
                        resultSource: 'myContacts',
                        source: 'search-screen',
                        topFilter: searchTopFilter,
                      })
                      openChat(chat.id)
                    }}
                  >
                    <span className="chat-avatar-stack">
                      <span className="avatar" style={{ backgroundColor: chat.accent }}>
                        {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
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
                        {shouldShowPremiumCrown(chat) ? (
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
                      <span>{formatSidebarActivityLabel(chat.messages.at(-1)?.createdAt, chat.messages.at(-1)?.time ?? '')}</span>
                    </span>
                    <span className="chat-handle">
                      {searchShowsPhone ? chat.phone : chat.handle}
                    </span>
                  </span>
                  {!quietDialogsSuppressed && chat.unread > 0 ? (
                    <span className={chat.unread > 9 ? 'badge badge-wide' : 'badge'}>
                      {formatUnreadBadgeCount(chat.unread)}
                    </span>
                  ) : null}
                </button>
                ))}
              </section>
            ) : null}

            {searchShowsChannels && channelSearchResults.length > 0 ? (
              <section className="search-group">
                <p className="search-group-title">Каналы</p>
                {channelSearchResults.map((channel) => (
                  <button
                    key={`channel:${channel.id}:${channel.handle}`}
                    type="button"
                    className={[
                      'chat-card',
                      'chat-card-compact',
                      'channel-list-card',
                      'search-card',
                      channel.id === activeSubscriptionChannelId ||
                      sanitizeChannelDirectLink(channel.handle) ===
                        sanitizeChannelDirectLink(currentSubscriptionChannel?.handle ?? '')
                        ? 'active'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => openSearchChannelResult(channel)}
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
                          <span className="chat-star">
                            <img src="/icons/news100.svg" alt="Канал" />
                          </span>
                          {isOwnedSubscriptionChannelPreview(channel) ? (
                            <span className="chat-owner-edit-badge" aria-label="Вы владелец канала" title="Вы владелец канала">
                              <img src="/icons/edit100.png" alt="" aria-hidden="true" />
                            </span>
                          ) : null}
                          {channel.archivedAt ? <span className="chat-archive-badge">Архив</span> : null}
                          {channel.muted ? (
                            <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                              <img src="/icons/bell-100.png" alt="" />
                            </span>
                          ) : null}
                        </span>
                        {!quietChannelsSuppressed && channel.unread > 0 ? (
                          <span
                            className={
                              channel.unread > 9
                                ? 'chat-topline-badge chat-topline-badge-wide'
                                : 'chat-topline-badge'
                            }
                          >
                            {formatUnreadBadgeCount(channel.unread)}
                          </span>
                        ) : null}
                      </span>
                      <span className="chat-handle">{channel.handle || channel.statusText || 'Канал Тайничка'}</span>
                    </span>
                  </button>
                ))}
              </section>
            ) : null}

            {searchShowsContacts ? (
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
              </section>
            ) : null}
            {query.trim() !== '' && !hasVisibleSearchResults ? (
              <section className="search-group">
                <article className="chat-card search-card">
                  <span className="chat-copy">
                    <strong>Ничего не найдено</strong>
                    <span className="chat-handle">Попробуйте имя, номер, канал или @handle</span>
                  </span>
                </article>
              </section>
            ) : null}
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
                          <span className="chat-star">
                            <img src="/icons/news100.svg" alt="Канал" />
                          </span>
                          {isOwnedSubscriptionChannelPreview(channel) ? (
                            <span className="chat-owner-edit-badge" aria-label="Вы владелец канала" title="Вы владелец канала">
                              <img src="/icons/edit100.png" alt="" aria-hidden="true" />
                            </span>
                          ) : null}
                          {channel.archivedAt ? <span className="chat-archive-badge">Архив</span> : null}
                          {channel.muted ? (
                            <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                          <img src="/icons/bell-100.png" alt="" />
                        </span>
                      ) : null}
                    </span>
                    {!quietChannelsSuppressed && channel.unread > 0 ? (
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
                const groupPreviewAuthor = resolveGroupPreviewAuthor(group, session)
                const groupPreviewText = formatGroupPreview(group)

                return (
                  <button
                    key={group.id}
                    type="button"
                    className={group.id === activeGroupId ? 'chat-card group-list-card active' : 'chat-card group-list-card'}
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
                          <span className="chat-star">
                            <img src="/icons/group100.png" alt="Группа" />
                          </span>
                          {isOwnedGroupPreview(group) ? (
                            <span className="chat-owner-edit-badge" aria-label="Вы владелец группы" title="Вы владелец группы">
                              <img src="/icons/edit100.png" alt="" aria-hidden="true" />
                            </span>
                          ) : null}
                          {group.archivedAt ? <span className="chat-archive-badge">Архив</span> : null}
                          {group.muted ? (
                            <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                              <img src="/icons/bell-100.png" alt="" />
                            </span>
                          ) : null}
                        </span>
                        {!quietGroupsSuppressed && group.unread > 0 ? (
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
                      <span className="chat-handle">{`${group.members} участников`}</span>
                      {groupPreviewAuthor && groupPreviewText ? (
                        <span className="chat-preview group-preview-row">
                          <span
                            className="avatar group-preview-author-avatar"
                            style={{ backgroundColor: groupPreviewAuthor.accent }}
                            aria-hidden="true"
                          >
                            {renderAccountAvatarContent(
                              groupPreviewAuthor.title,
                              false,
                              groupPreviewAuthor.avatarImage,
                            )}
                          </span>
                          <span className="group-preview-author-separator">:</span>
                          <span className="group-preview-text">{groupPreviewText}</span>
                        </span>
                      ) : (
                        <span className="chat-preview">{groupPreviewText}</span>
                      )}
                    </span>
                  </button>
                )
              })()
            ))}
          </div>
        ) : isThreadsTopListOpen ? (
          <div className="chat-list">
            {orderedThreadInbox.length > 0 ? (
              orderedThreadInbox.map((item) => {
                const threadInboxAvatarImage = resolveThreadInboxAvatarImage(item)
                const threadInboxPreviewAuthor = resolveThreadInboxPreviewAuthor(item)
                const threadInboxPreviewText = formatThreadInboxPreviewText(item)

                return (
                  <button
                    key={item.threadId}
                    type="button"
                    className={[
                      'chat-card',
                      'chat-card-compact',
                      'thread-inbox-card',
                      activeThreadId === item.threadId ? 'active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => openThreadInboxItem(item)}
                  >
                    <span className="chat-avatar-stack thread-inbox-avatar-stack">
                      <span
                        className="avatar thread-inbox-avatar"
                        style={{
                          backgroundColor: item.kind === 'group' ? item.groupAccent : item.channelAccent,
                        }}
                      >
                        {threadInboxAvatarImage ? (
                          <img src={threadInboxAvatarImage} alt="" className="channel-avatar-image" />
                        ) : item.kind === 'group' ? (
                          formatChannelAvatarLabel(item.groupTitle)
                        ) : (
                          formatChannelAvatarLabel(item.channelTitle)
                        )}
                      </span>
                      <span className="thread-inbox-source-badge" aria-hidden="true">
                        <img src={item.kind === 'group' ? '/icons/group100.png' : '/icons/news100.svg'} alt="" />
                      </span>
                    </span>
                    <span className="chat-copy">
                      <span className="chat-topline">
                        <span className="chat-name-row">
                          <strong className="chat-name-text">{formatThreadInboxTitle(item)}</strong>
                        </span>
                        {!quietThreadsSuppressed && item.unreadCount > 0 ? (
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
                          <span className="chat-topline-meta">
                            {formatSidebarActivityLabel(item.latestActivityAt, item.latestCommentTime)}
                          </span>
                        )}
                      </span>
                      <span className="chat-handle thread-inbox-activity">{formatThreadInboxActivityLabel(item)}</span>
                      {threadInboxPreviewAuthor ? (
                        <span className="chat-preview thread-preview-row">
                          <span
                            className="avatar thread-preview-author-avatar"
                            style={{ backgroundColor: threadInboxPreviewAuthor.accent }}
                            aria-hidden="true"
                          >
                            {renderAccountAvatarContent(
                              threadInboxPreviewAuthor.title,
                              false,
                              threadInboxPreviewAuthor.avatarImage,
                            )}
                          </span>
                          <span className="thread-preview-author-separator">:</span>
                          <span className="thread-preview-text">{threadInboxPreviewText}</span>
                        </span>
                      ) : (
                        <span className="chat-preview thread-inbox-preview">{threadInboxPreviewText}</span>
                      )}
                    </span>
                  </button>
                )
              })
            ) : (
              <article className="chat-card search-card">
                <span className="chat-copy">
                  <strong>Комментариев пока нет</strong>
                  <span className="chat-handle">
                    Оставьте комментарий или подпишитесь на обсуждение, чтобы оно появилось здесь.
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
                    void requestBrowserNotificationsAccess('browser-permission-prompt')
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
              {bottomSection === 'contacts' ? (
                <ContactsPane
                  activeChatId={activeChat?.id ?? null}
                  activeContactIdentifier={activeContactIdentifier}
                  contactRequestActionBusy={contactRequestActionBusy}
                  contactRequests={contactRequests}
                  contactsTab={contactsTab}
                  onAcceptIncomingRequest={(identifier) => {
                    void actOnContactRequest(identifier, 'accept')
                  }}
                  onOpenAcceptedContact={(chatId) => openChat(chatId)}
                  onOpenIncomingRequest={openIncomingContactRequest}
                  onOpenOutgoingRequest={openOutgoingContactRequest}
                  orderedVisibleChats={orderedVisibleChats}
                  outgoingContactRequests={outgoingContactRequests}
                  renderAdminBlockedChatBadge={renderAdminBlockedChatBadge}
                  renderAvatarContent={renderAccountAvatarContent}
                />
              ) : (
                orderedVisibleChats.map((chat) => {
                  const latestMessage = chat.messages.at(-1)
                  const chatPreview = chat.messages.length > 0 ? formatPreview(chat) : formatContactStatus(chat)

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      className={[
                        'chat-card',
                        'chat-card-compact',
                        'dialog-list-card',
                        chat.id === activeChat?.id ? 'active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => openChat(chat.id)}
                    >
                      <span className="chat-avatar-stack">
                        <span className="avatar" style={{ backgroundColor: chat.accent }}>
                          {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
                        </span>
                        {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                      </span>
                      <span className="chat-copy">
                        <span className="chat-topline">
                          <span className="chat-name-row">
                            <strong className="chat-name-text">{chat.title}</strong>
                            {chat.archivedAccount ? <span className="chat-archive-badge">Удалён</span> : null}
                            {renderAdminBlockedChatBadge(chat)}
                            {chat.muted ? (
                              <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                                <img src="/icons/bell-100.png" alt="" />
                              </span>
                            ) : null}
                            {shouldShowPremiumCrown(chat) ? (
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
                          {chat.typing && !quietMode ? (
                            <span className="chat-topline-typing" aria-label={`${chat.title} печатает`}>
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                            </span>
                          ) : !quietDialogsSuppressed && chat.unread > 0 ? (
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
                            <span className="chat-topline-meta">
                              {formatSidebarActivityLabel(latestMessage?.createdAt, latestMessage?.time ?? '')}
                            </span>
                          )}
                        </span>
                        <span className="chat-preview chat-status-preview">{chatPreview}</span>
                      </span>
                    </button>
                  )
                })
              )}
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
              setContactsTab('all')
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
              setContactsTab('all')
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
            {/* Contacts badge contract:
                only the contact-request quiet setting may hide this badge. The incoming count
                itself must stay intact so request rooms and counters survive quiet-mode toggles. */}
            {!quietContactRequestsSuppressed && incomingContactRequestCount > 0 ? (
              <span
                className={
                  incomingContactRequestCount > 9
                    ? 'icon-button-badge icon-button-badge-wide'
                    : 'icon-button-badge'
                }
              >
                {formatUnreadBadgeCount(incomingContactRequestCount)}
              </span>
            ) : null}
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
              setSearchTopFilter('all')
              setContactsTab('all')
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
              <img src={getBottomChannelsActionIconPath(true)} alt="" />
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
              <img src={getBottomChannelsActionIconPath(false)} alt="" />
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
            {/* Keep support unread mirrored on the settings launcher. Support lives inside Settings,
                so users must be able to notice fresh staff replies before opening the scene. */}
            {supportUnreadCount > 0 ? (
              <span
                className={supportUnreadCount > 9 ? 'icon-button-badge icon-button-badge-wide' : 'icon-button-badge'}
              >
                {formatUnreadBadgeCount(supportUnreadCount)}
              </span>
            ) : null}
          </button>
        </div>
        </aside>
      ) : null}

      <section
        className={
          isPremiumView
            ? 'stage settings-open premium-open'
            : isSupportSettingsThreadOpen
              ? 'stage settings-thread-open'
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

        {isSettingsView && !isSupportSettingsThreadOpen ? (
          <section className="settings-view">
            <div className={`settings-panel${settingsView === 'storage' ? ' settings-panel-storage' : ''}`}>
              <div className={`settings-heading${settingsView === 'profile' ? ' settings-heading-profile' : ''}`}>
                {settingsView === 'profile' ? (
                  <>
                    <p className="eyebrow">Настройки</p>
                    <div className="settings-profile-header">
                      <div className="settings-profile-avatar-stack">
                        <span className="self-presence-avatar-stack">
                          <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: '#8c5738' }}>
                            {profilePreviewSession?.avatarImage ? (
                              <img src={profilePreviewSession.avatarImage} alt="" className="channel-avatar-image" />
                            ) : (
                              profileSettingsAvatarLabel
                            )}
                          </span>
                          {selfPresenceIndicatorMode ? (
                            <span
                              className={
                                selfPresenceIndicatorMode === 'invisible'
                                  ? 'self-presence-indicator invisible'
                                  : 'self-presence-indicator'
                              }
                              aria-label={selfPresenceIndicatorMode === 'invisible' ? 'Режим невидимки' : 'В сети'}
                            />
                          ) : null}
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
                    <h2>
                      {settingsView === 'quiet'
                        ? 'Настройки режима "Тихо"'
                        : settingsView === 'support'
                          ? 'Чат с поддержкой'
                          : settingsView === 'storage'
                            ? 'Хранилище'
                          : formatSessionName(session)}
                    </h2>
                    {settingsView === 'quiet' || settingsView === 'support' || settingsView === 'storage' ? null : (
                      <p className="settings-identity">{session.identifier}</p>
                    )}
                  </>
                )}
              </div>

              {settingsView === 'quiet' ? (
                <p className="settings-copy settings-quiet-scene-copy">
                  Мы заботимся о том, чтобы вас не побеспокоила реклама или ненужные контакты.
                  Пожалуйста, настройте режим "Тихо", как вам более удобно.
                </p>
              ) : settingsView === 'support' ? (
                <p className="settings-copy settings-support-scene-copy">
                  {supportInfoBannerText}
                </p>
              ) : settingsView === 'storage' ? (
                <p className="settings-copy settings-storage-scene-copy">
                  Здесь собраны только ваши удаляемые файлы и вложения. Аватарки и общая GIF-библиотека живут отдельно во внешнем хранилище Тайничка и сюда не попадают.
                </p>
              ) : null}

              {settingsView === 'profile' ? (
                <div className="settings-stack settings-stack-profile">
                  <article className="settings-item settings-item-profile-field">
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
                  <article className="settings-item settings-item-profile-field">
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
                  <article className="settings-item settings-item-profile-field">
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
                  <article className="settings-item settings-item-profile-field">
                    <span className="settings-label">Никнейм</span>
                    <label className="settings-handle settings-handle-copyable">
                      <span>@</span>
                      <input
                        type="text"
                        className="settings-input handle-input handle-input-with-inline-icon"
                        value={profileSettingsDraft?.nickname ?? ''}
                        placeholder="nickname"
                        maxLength={nicknameFieldMaxLength}
                        onChange={(event) =>
                          updateSessionProfile({
                            nickname: normalizeNickname(event.target.value),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="settings-inline-copy-button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          copyToClipboard(`@${profileSettingsDraft?.nickname ?? ''}`, 'Никнейм скопирован')
                        }}
                        aria-label="Копировать никнейм"
                        title="Копировать никнейм"
                        disabled={!profileSettingsDraft?.nickname?.trim()}
                      >
                        <img src="/icons/copy100.png" alt="" />
                      </button>
                    </label>
                  </article>
                  <article className="settings-item settings-item-profile-section-start">
                    <label className="settings-checkbox settings-checkbox-expanded">
                      <input
                        type="checkbox"
                        checked={Boolean(profileSettingsDraft?.darkThemeEnabled)}
                        onChange={(event) =>
                          updateSessionProfile({ darkThemeEnabled: event.target.checked })
                        }
                      />
                      <span className="settings-quiet-copy">
                        <span>Тёмная тема</span>
                        <span className="settings-text">
                          Перекрасить интерфейс в спокойные серые оттенки.
                        </span>
                      </span>
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
                  <article className="settings-item">
                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={browserNotificationsDisabled}
                        disabled={browserNotificationsToggleDisabled}
                        onChange={(event) => {
                          if (event.target.checked) {
                            void disableBrowserNotifications()
                            return
                          }

                          void enableBrowserNotifications()
                        }}
                      />
                      <span>Выключить браузерные уведомления</span>
                    </label>
                  </article>
                  <article className="settings-item settings-item-invisibility">
                    {/* Settings invariant:
                        invisibility is a premium setting of its own. Quiet may auto-enable it,
                        but this checkbox remains the manual override that can turn stealth off again. */}
                    {!sessionHasPremium ? (
                      <button
                        type="button"
                        className="settings-invisibility-button"
                        onClick={openPremiumUpsell}
                        aria-label="Режим невидимки доступен в премиуме"
                      >
                        <span className="settings-checkbox settings-checkbox-disabled">
                          <input
                            type="checkbox"
                            checked={false}
                            readOnly
                            disabled
                          />
                          <span className="settings-invisibility-copy">
                            <span className="settings-invisibility-title">
                              <span>Режим невидимки</span>
                              <span className="premium-crown settings-invisibility-crown" aria-hidden="true">
                                <img src="/icons/crown64.png" alt="" />
                              </span>
                            </span>
                            <span className="settings-text">{invisibilitySettingsDescription}</span>
                          </span>
                        </span>
                      </button>
                    ) : (
                      <label className="settings-checkbox settings-checkbox-expanded">
                        <input
                          type="checkbox"
                          checked={invisibilityToggleChecked}
                          onChange={(event) => {
                            void setInvisibilityPreference(event.target.checked)
                          }}
                        />
                        <span className="settings-invisibility-copy">
                          <span className="settings-invisibility-title">
                            <span>Режим невидимки</span>
                            <span className="premium-crown settings-invisibility-crown" aria-hidden="true">
                              <img src="/icons/crown64.png" alt="" />
                            </span>
                          </span>
                          <span className="settings-text">{invisibilitySettingsDescription}</span>
                        </span>
                      </label>
                    )}
                  </article>
                  {sessionHasPremium ? (
                    <article className="settings-item">
                      <label className="settings-checkbox settings-checkbox-expanded">
                        <input
                          type="checkbox"
                          checked={Boolean(profileSettingsDraft?.premiumBadgeHidden)}
                          onChange={(event) =>
                            updateSessionProfile({ premiumBadgeHidden: event.target.checked })
                          }
                        />
                        <span className="settings-quiet-copy">
                          <span>Скрыть корону</span>
                          <span className="settings-text">
                            Не показывать значок премиума рядом с вашим именем в диалогах, группах и тредах.
                          </span>
                        </span>
                      </label>
                    </article>
                  ) : null}
                  {storageUsage ? (
                    <button
                      type="button"
                      className={`settings-item storage-usage-card storage-usage-card-button settings-item-profile-section-start ${storageUsageTone}`}
                      onClick={() => {
                        // Storage scene is the single self-service surface for reclaimable media.
                        // Avatars intentionally stay out of this flow so users cannot wipe them by accident.
                        setStorageItemsError('')
                        setSettingsView('storage')
                        setConfirmingLogout(false)
                      }}
                    >
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
                      <p className="settings-text storage-usage-open-copy">Открыть хранилище и освободить место</p>
                      {!sessionHasPremium ? (
                        <span className="soft-button storage-usage-upsell" aria-hidden="true">
                          <span className="storage-usage-upsell-icon" aria-hidden="true">
                            <img src="/icons/crown64.png" alt="" />
                          </span>
                          <span>Больше места с премиумом</span>
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              ) : settingsView === 'quiet' ? (
                <div className="settings-stack settings-stack-quiet">
                  {/* Quiet settings invariant:
                      this scene controls only badge/browser-notification suppression categories.
                      It must not replace the separate manual invisibility toggle in the profile scene. */}
                  <p className="room-forward-section-title settings-quiet-section-title">Режим заглушает:</p>
                  {quietModeSettingsOptions.map((option) => (
                    <article
                      key={option.key}
                      className="settings-item settings-item-quiet-option"
                    >
                      <label
                        className="settings-checkbox settings-checkbox-expanded"
                        onClick={
                          !sessionHasPremium
                            ? (event) => {
                                event.preventDefault()
                                handleQuietSettingsLockedInteraction(option.key)
                              }
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={quietSettingsToggleValues[option.key]}
                          disabled={!sessionHasPremium || quietSettingsBusy}
                          onChange={(event) => {
                            const nextValue = event.target.checked
                            void updateQuietModeSettingsPreference({
                              [option.key]: nextValue,
                            } as Partial<QuietModeSettings>)
                          }}
                        />
                        <span className="settings-quiet-copy">
                          <span>{option.label}</span>
                          {option.key === 'autoInvisibility' ? (
                            <span className="settings-text">
                              Автоматически включает невидимку при нажатии кнопки "Тихо".
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </article>
                  ))}
                  {!sessionHasPremium ? (
                    <article className="settings-item settings-quiet-upsell">
                      <p className="settings-text">
                        Оформите подписку, чтобы открыть возможности детальной настройки режима.
                      </p>
                      <button
                        type="button"
                        className="soft-button settings-quiet-upsell-button"
                        onClick={openPremiumUpsell}
                      >
                        <span className="premium-crown settings-invisibility-crown" aria-hidden="true">
                          <img src="/icons/crown64.png" alt="" />
                        </span>
                        <span>Приобрести подписку</span>
                      </button>
                    </article>
                  ) : null}
                  {quietSettingsError ? <p className="auth-error">{quietSettingsError}</p> : null}
                </div>
              ) : settingsView === 'storage' ? (
                <div className="settings-stack settings-stack-storage">
                  {storageUsage ? (
                    <article className={`settings-item storage-usage-card storage-usage-card-scene ${storageUsageTone}`}>
                      <div className="storage-usage-header">
                        <span className="settings-label">Занято</span>
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
                      <div className="settings-storage-meta">
                        <p className="settings-text">{storageRemainingLabel}</p>
                        <p className="settings-text">{storageManagedItemsLabel}</p>
                      </div>
                    </article>
                  ) : null}
                  {renderStorageItemsGrid({
                    busy: storageItemsBusy,
                    deletingId: deletingStorageItemId,
                    emptyCopy: 'Хранилище пока свободно. Здесь будут появляться только ваши вложения.',
                    error: storageItemsError,
                    items: storageItems,
                    onDelete: (item) => {
                      void removeStorageItem(item)
                    },
                  })}
                  {!sessionHasPremium ? (
                    <button
                      type="button"
                      className="soft-button storage-usage-upsell-button"
                      onClick={() => setStageView('premium')}
                    >
                      <span className="storage-usage-upsell-icon" aria-hidden="true">
                        <img src="/icons/crown64.png" alt="" />
                      </span>
                      <span>Больше места с премиумом</span>
                    </button>
                  ) : null}
                </div>
              ) : settingsView === 'support' ? (
                <div className="settings-stack settings-stack-support">
                  <div ref={supportSceneTopRef} />
                  {supportCooldownActive ? (
                    <article className="settings-item settings-support-cooldown-card">
                      <p className="settings-text">{supportCooldownCopy}</p>
                    </article>
                  ) : (
                    <RoomComposer
                      attachmentDraft={supportAttachmentDraft}
                      attachmentInputRef={supportAttachmentInputRef}
                      attachmentName={supportAttachmentDraft?.fileName ?? ''}
                      attachmentModes={['photo']}
                      className="settings-item settings-support-composer"
                      draft={supportDraft}
                      draftInputRef={supportComposerInputRef}
                      gifLibrary={session?.gifLibrary ?? []}
                      gifSelectionBlockedReason={getGifSelectionBlockedReason(supportAttachmentDraft)}
                      onAttachmentChange={handleSupportAttachmentChange}
                      onAttachmentClear={clearSupportAttachmentDraft}
                      onAttachmentPreviewOpen={
                        supportAttachmentDraft ? () => openAttachmentDraftPreview(supportAttachmentDraft) : undefined
                      }
                      onRenameAttachmentFileBaseName={renameSupportAttachmentFileBaseName}
                      onComposerPaste={handleSupportComposerPaste}
                      onDeleteGif={deleteGifFromLibrary}
                      onDraftChange={setSupportDraft}
                      onKeyDown={handleSupportComposerKeyDown}
                      onOpenAttachmentPicker={openSupportAttachmentPicker}
                      onOpenPremiumUpsell={openPremiumUpsell}
                      onSearchGifs={searchAvailableGifs}
                      onSelectGif={attachSupportGif}
                      onSubmit={sendSupportMessage}
                      onToggleSendOriginal={
                        supportAttachmentDraft?.compressionEligible
                          ? () =>
                              setSupportAttachmentDraft((currentDraft) => {
                                if (!currentDraft) return currentDraft
                                const nextSendOriginal = !currentDraft.sendOriginal
                                return setComposerAttachmentSendOriginal(currentDraft, nextSendOriginal)
                              })
                          : undefined
                      }
                      onUploadGif={uploadAndAttachSupportGif}
                      placeholder="Опишите проблему одним сообщением..."
                      premiumUnlocked={sessionHasPremium}
                      showEmojiPicker={false}
                      storageCleanupWarning={getStorageCleanupWarning(supportAttachmentDraft)}
                      submitAriaLabel="Отправить в поддержку"
                      submitDisabled={
                        supportBusy ||
                        (supportAttachmentDraft
                          ? supportAttachmentDraft.status !== 'ready'
                          : !supportDraft.trim())
                      }
                      submitTitle="Отправить в поддержку"
                      bottomContent={
                        supportError && supportError !== supportCooldownErrorMessage ? (
                          <p className="auth-error">{supportError}</p>
                        ) : null
                      }
                    />
                  )}
                  <div className="settings-actions settings-actions-support-scene">
                    <button
                      type="button"
                      className="soft-button"
                      onClick={handleSupportSettingsBack}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => {
                        closeThreadView()
                        setSettingsView('management')
                        setConfirmingLogout(false)
                        setBlockedActionChatId(null)
                      }}
                    >
                      Управление
                    </button>
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
                      <img src="/icons/crown64.png" alt="" />
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setConfirmingLogout(true)}
                    >
                      Выйти
                    </button>
                  </div>
                  <div className="settings-support-ticket-section">
                    <h3 className="settings-section-title settings-support-ticket-section-title">Ваши тикеты</h3>
                    <div className="settings-support-ticket-list">
                      {supportTickets.map((ticket) => (
                        <article
                          key={`support-ticket-${ticket.id}`}
                          className="settings-item settings-support-ticket-item"
                        >
                          <ThreadedBubble
                            isMine
                            onOpenThread={() => openSupportTicketThread(ticket.id)}
                            threadCount={ticket.comments.length}
                            showOpenWhenEmpty
                            emptyLabel="Открыть комментарии"
                            bubble={(
                              <article
                                className="bubble room-thread-source-bubble mine settings-support-ticket-bubble"
                                role="button"
                                tabIndex={0}
                                // The whole ticket card opens the thread on purpose. Reverting this
                                // back to the lower thread-pill only is a known UX regression.
                                onClick={() => openSupportTicketThread(ticket.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    openSupportTicketThread(ticket.id)
                                  }
                                }}
                              >
                                <div className="settings-support-ticket-topline">
                                  <span className="bubble-meta">{`Тикет #${ticket.id}`}</span>
                                  <span
                                    className={`support-ticket-status-badge support-ticket-status-badge-${ticket.status}`}
                                  >
                                    {formatSupportTicketStatus(ticket.status)}
                                  </span>
                                </div>
                                <BubbleMessageContent
                                  message={{
                                    attachment: ticket.attachment,
                                    replyTo: ticket.replyTo,
                                    sourceContact: undefined,
                                    sourceGroup: undefined,
                                    text: ticket.text,
                                  }}
                                  onOpenAttachment={openMediaViewer}
                                  onOpenExternalLink={requestOpenExternalLink}
                                  onOpenPremiumUpsell={openPremiumUpsell}
                                  showReplyInline={false}
                                />
                                <div className="settings-support-ticket-footer">
                                  <div className="settings-support-ticket-created-at" aria-label="Дата и время создания">
                                    <span className="settings-support-ticket-created-at-label">Дата и время создания</span>
                                    <time dateTime={ticket.createdAt}>
                                      {formatSupportTicketCreatedAt(ticket.createdAt)}
                                    </time>
                                  </div>
                                  {ticket.unreadCount > 0 ? (
                                    <span className="badge">{formatUnreadBadgeCount(ticket.unreadCount)}</span>
                                  ) : null}
                                </div>
                              </article>
                            )}
                          />
                        </article>
                      ))}
                      {supportTickets.length === 0 ? (
                        <article className="settings-item settings-support-empty-state">
                          <p className="settings-text">
                            У вас пока нет обращений в поддержку. Опишите проблему одним сообщением, и Тайничок создаст новую задачу.
                          </p>
                        </article>
                      ) : null}
                      {supportTickets.length > 0 ? (
                        <button
                          type="button"
                          className="soft-button settings-support-scroll-top-button"
                          onClick={() => {
                            supportSceneTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }}
                        >
                          Наверх
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : settingsView === 'management' ? (
                <div className="settings-stack">
                  <button
                    type="button"
                    className="settings-action-card"
                    onClick={() => setSettingsView('blocked')}
                  >
                    Заблокированные контакты
                  </button>
                  <button
                    type="button"
                    className="settings-action-card"
                    onClick={() => {
                      setChangePasswordOpen((current) => {
                        const nextOpen = !current
                        if (!nextOpen) {
                          resetChangePasswordForm()
                        } else {
                          setChangePasswordError('')
                          setDeleteAccountOpen(false)
                          resetDeleteAccountForm()
                        }
                        return nextOpen
                      })
                    }}
                  >
                    Сменить пароль
                  </button>
                  {changePasswordOpen ? (
                    <article className="settings-item settings-password-change-card">
                      <label className="settings-password-field">
                        <span className="settings-label">Текущий пароль</span>
                        <div className="auth-password-input">
                          <input
                            type={changePasswordCurrentVisible ? 'text' : 'password'}
                            className="settings-input"
                            autoComplete="current-password"
                            placeholder="Введите текущий пароль"
                            value={changePasswordCurrentValue}
                            onChange={(event) => setChangePasswordCurrentValue(event.target.value)}
                          />
                          <button
                            type="button"
                            className="auth-password-visibility"
                            aria-label={changePasswordCurrentVisible ? 'Скрыть пароль' : 'Показать пароль'}
                            onClick={() => setChangePasswordCurrentVisible((current) => !current)}
                          >
                            <img
                              src={changePasswordCurrentVisible ? '/icons/eyeoff.png' : '/icons/eyeon.png'}
                              alt=""
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </label>
                      <label className="settings-password-field">
                        <span className="settings-label">Новый пароль</span>
                        <div className="auth-password-input">
                          <input
                            type={changePasswordNextVisible ? 'text' : 'password'}
                            className="settings-input"
                            autoComplete="new-password"
                            placeholder={`Минимум ${passwordFieldMinLength} символов`}
                            value={changePasswordNextValue}
                            onChange={(event) => setChangePasswordNextValue(event.target.value)}
                          />
                          <button
                            type="button"
                            className="auth-password-visibility"
                            aria-label={changePasswordNextVisible ? 'Скрыть пароль' : 'Показать пароль'}
                            onClick={() => setChangePasswordNextVisible((current) => !current)}
                          >
                            <img
                              src={changePasswordNextVisible ? '/icons/eyeoff.png' : '/icons/eyeon.png'}
                              alt=""
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </label>
                      <label className="settings-password-field">
                        <span className="settings-label">Подтверждение пароля</span>
                        <div className="auth-password-input">
                          <input
                            type={changePasswordConfirmVisible ? 'text' : 'password'}
                            className="settings-input"
                            autoComplete="new-password"
                            placeholder="Повторите новый пароль"
                            value={changePasswordConfirmValue}
                            onChange={(event) => setChangePasswordConfirmValue(event.target.value)}
                          />
                          <button
                            type="button"
                            className="auth-password-visibility"
                            aria-label={changePasswordConfirmVisible ? 'Скрыть пароль' : 'Показать пароль'}
                            onClick={() => setChangePasswordConfirmVisible((current) => !current)}
                          >
                            <img
                              src={changePasswordConfirmVisible ? '/icons/eyeoff.png' : '/icons/eyeon.png'}
                              alt=""
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </label>
                      {changePasswordError ? <p className="auth-error">{changePasswordError}</p> : null}
                      <div className="settings-actions settings-management-inline-actions">
                        <button
                          type="button"
                          className="send-button"
                          disabled={changePasswordBusy || !changePasswordDirty}
                          onClick={() => {
                            trackAnalyticsEvent('auth_password_change_requested', {
                              source: 'settings',
                            })
                            void saveChangedPassword()
                          }}
                        >
                          {changePasswordBusy ? 'Сохраняем...' : 'Сохранить пароль'}
                        </button>
                        <button
                          type="button"
                          className="soft-button"
                          disabled={changePasswordBusy}
                          onClick={() => {
                            setChangePasswordOpen(false)
                            resetChangePasswordForm()
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    </article>
                  ) : null}
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
                  <button
                    type="button"
                    className="settings-action-card danger"
                    onClick={() => {
                      setDeleteAccountOpen((current) => {
                        const nextValue = !current
                        if (!nextValue) {
                          resetDeleteAccountForm()
                        }
                        setChangePasswordOpen(false)
                        return nextValue
                      })
                    }}
                  >
                    Удалить аккаунт
                  </button>
                  {deleteAccountOpen ? (
                    <article className="settings-item settings-inline-form">
                      <span className="settings-label">Удаление аккаунта</span>
                      <p className="settings-text">
                        После удаления доступ к текущему аккаунту закроется. Чтобы войти снова,
                        нужно будет зарегистрироваться заново по этому номеру телефона.
                      </p>
                      <div className="auth-password-input">
                        <input
                          type={deleteAccountPasswordVisible ? 'text' : 'password'}
                          className="auth-input"
                          placeholder="Текущий пароль"
                          value={deleteAccountPasswordValue}
                          onChange={(event) => setDeleteAccountPasswordValue(event.target.value)}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          className="auth-password-visibility"
                          aria-label={deleteAccountPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                          onClick={() => setDeleteAccountPasswordVisible((current) => !current)}
                        >
                          <img
                            src={deleteAccountPasswordVisible ? '/icons/eyeoff.png' : '/icons/eyeon.png'}
                            alt=""
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      <label className="settings-checkbox-row">
                        <input
                          type="checkbox"
                          checked={deleteAccountDataToo}
                          onChange={(event) => setDeleteAccountDataToo(event.target.checked)}
                        />
                        <span>Удалить и данные тоже</span>
                      </label>
                      {deleteAccountError ? <p className="auth-error">{deleteAccountError}</p> : null}
                      <div className="settings-actions settings-management-inline-actions settings-inline-actions">
                        <button
                          type="button"
                          className="soft-button danger"
                          onClick={() => {
                            void deleteCurrentAccount()
                          }}
                          disabled={deleteAccountBusy || !deleteAccountDirty}
                        >
                          {deleteAccountBusy ? 'Удаляем...' : 'Удалить аккаунт'}
                        </button>
                        <button
                          type="button"
                          className="soft-button"
                          onClick={() => {
                            setDeleteAccountOpen(false)
                            resetDeleteAccountForm()
                          }}
                          disabled={deleteAccountBusy}
                        >
                          Отмена
                        </button>
                      </div>
                    </article>
                  ) : null}
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
              {settingsView === 'profile' ? (
                <button
                  type="button"
                  className="settings-action-card settings-action-card-with-icon settings-action-card-subtle settings-support-chat-button"
                  onClick={() => {
                    // Support room lives only inside settings and must not leak into the regular dialog list.
                    setSupportError('')
                    setSettingsView('support')
                    setConfirmingLogout(false)
                  }}
                >
                  <span className="settings-action-card-icon" aria-hidden="true">
                    <img src="/icons/man-raising-hand.png" alt="" />
                  </span>
                    <span className="settings-support-chat-button-copy">
                      <span>Написать в поддержку</span>
                      {supportUnreadCount > 0 ? (
                        <span className="badge settings-support-chat-badge">
                          {formatUnreadBadgeCount(supportUnreadCount)}
                        </span>
                      ) : null}
                    </span>
                  </button>
              ) : null}
              {settingsView === 'profile' ? (
                <button
                  type="button"
                  className="settings-action-card settings-action-card-with-icon settings-action-card-subtle settings-quiet-settings-button"
                  onClick={() => {
                    setQuietSettingsError('')
                    setSettingsView('quiet')
                    setConfirmingLogout(false)
                  }}
                >
                  <span className="settings-action-card-icon" aria-hidden="true">
                    <img src="/icons/quiet.png" alt="" />
                  </span>
                  <span>Настройки режима "Тихо"</span>
                </button>
              ) : null}
              {settingsView !== 'support' ? (
              <div className="settings-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={handleSettingsBack}
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
	                ) : settingsView === 'quiet' ? (
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
                  <img src="/icons/crown64.png" alt="" />
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setConfirmingLogout(true)}
                >
                  Выйти
                </button>
              </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {confirmProfileSettingsLeaveOpen ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть подтверждение сохранения настроек профиля"
              onClick={() => {
                setConfirmProfileSettingsLeaveOpen(false)
                clearBlockedBrowserBackNavigation()
              }}
            />
            <div className="room-confirm room-confirm-compact">
              <p className="room-confirm-copy">Сохранить изменения настроек профиля?</p>
              <div className="room-confirm-actions room-confirm-actions-dual">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-danger"
                  onClick={() => {
                    discardProfileSettingsDraft()
                    setConfirmProfileSettingsLeaveOpen(false)
                    if (continueBlockedBrowserBackNavigation()) {
                      return
                    }

                    leaveSettingsToMain()
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
                        setConfirmProfileSettingsLeaveOpen(false)
                        if (continueBlockedBrowserBackNavigation()) {
                          return
                        }

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
                      <img src="/icons/crown64.png" alt="" />
                    </div>
                  ) : (
                    <h2>{sessionHasPremium ? 'Продли премиум Тайничок' : 'Премиум Тайничок'}</h2>
                  )}
                  <div className="premium-debug-block">
                    <div className="premium-debug-toggle-row">
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
                    </div>
                    {sessionHasPremium ? (
                      <button
                        type="button"
                        className="soft-button premium-debug-disable-button"
                        onClick={disablePremiumForDebug}
                      >
                        Выключить премиум
                      </button>
                    ) : null}
                  </div>
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
                <article className="premium-card premium-card-monthly">
                  <div className="premium-price">
                    <strong>199р</strong>
                    <span>/ месяц</span>
                  </div>
                  <p className="premium-note">Для доступа ко всем премиум-возможностям.</p>
                  <ul className="premium-features">
                    <li>
                      <span className="premium-feature-crown">
                        <span>Добавляет к имени</span>
                        <img src="/icons/crown64.png" alt="" aria-hidden="true" />
                      </span>
                    </li>
                    <li>Тонкая настройка режима "Тихо"</li>
                    <li>Режим невидимки!</li>
                    <li>Загрузка своих GIF animation</li>
                    <li>Отправка фотографий в оригинальном размере</li>
                    <li>Хранилище файлов до 1000 МБ</li>
                    <li>До 20 групп вместо 5 на бесплатном аккаунте</li>
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
                    {premiumPurchaseBusy
                      ? 'Обрабатываем...'
                      : sessionHasPremium
                        ? 'Продлить на месяц'
                        : 'Купить на месяц'}
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
                    <li>Тонкая настройка режима "Тихо"</li>
                    <li>Режим невидимки!</li>
                    <li>Загрузка своих GIF animation</li>
                    <li>Отправка фотографий в оригинальном размере</li>
                    <li>Хранилище файлов до 1000 МБ</li>
                    <li>До 20 групп вместо 5 на бесплатном аккаунте</li>
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
                    {premiumPurchaseBusy
                      ? 'Обрабатываем...'
                      : sessionHasPremium
                        ? 'Продлить на год'
                        : 'Купить на год'}
                  </button>
                </article>
              </div>

              <div className="settings-actions premium-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={handlePremiumBack}
                >
                  Назад
                </button>
              </div>
            </div>
            <div className="premium-legal-links premium-legal-links-outside" aria-label="Условия Premium и политика возвратов перед оплатой">
              {/* Premium checkout keeps one primary legal surface here: explicit purchase
                  must reference Premium terms and refund policy directly, while other public
                  legal pages stay available elsewhere on the site and inside the linked documents. */}
              <p className="premium-consent-copy">
                Нажимая «Купить», вы подтверждаете, что ознакомились и соглашаетесь с{' '}
                <a className="settings-inline-link" href="/premium-terms.html">
                  Условиями Premium
                </a>
                {' '}и{' '}
                <a className="settings-inline-link" href="/refund-policy.html">
                  Политикой возвратов
                </a>
                .
              </p>
            </div>
          </section>
        ) : null}

        {isChannelsListView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-manager-panel">
              <div className="channels-screen-header">
                <h2>Управление каналами</h2>
                <p className="settings-copy">
                  {channels.length > 0
                    ? 'Каналы, которыми вы управляете сейчас.'
                    : 'Пока нет каналов. Создайте свой первый канал.'}
                </p>
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
                ) : null}
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
                <button
                  type="button"
                  className="soft-button channels-manager-back"
                  onClick={handleChannelsListBack}
                >
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
                    placeholder="Введите название канала"
                    value={creatingChannelTitle}
                    onChange={(event) => {
                      const nextTitle = event.target.value.slice(0, channelTitleMaxLength)
                      setCreatingChannelTitle(nextTitle)

                      if (!creatingChannelDirectLinkDirty) {
                        setCreatingChannelDirectLink(
                          nextTitle.trim() ? buildUniqueChannelDirectLinkFromTitle(nextTitle) : '',
                        )
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
                    className="channel-status-input"
                    maxLength={statusFieldMaxLength}
                    placeholder="Введите статус канала"
                    rows={2}
                    value={creatingChannelStatusText}
                    onChange={(event) =>
                      setCreatingChannelStatusText(
                        sanitizeStatusField(event.target.value),
                      )
                    }
                  />
                </article>

                <article className="settings-item channel-description-card">
                  <span className="settings-label">Описание канала</span>
                  <textarea
                    className="channel-description-input"
                    maxLength={channelDescriptionMaxLength}
                    placeholder="Добавьте описание канала"
                    rows={6}
                    value={creatingChannelDescription}
                    onChange={(event) =>
                      setCreatingChannelDescription(
                        sanitizeChannelDescription(event.target.value),
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
                <button type="button" className="soft-button" onClick={handleChannelsCreateBack}>
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
                                    {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
                                  </span>
                                  {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                                </span>
                                <span className="group-create-member-copy">
                                  <strong className="group-create-member-name-row">
                                    <span>{chat.title}</span>
                                    {shouldShowPremiumCrown(chat) ? (
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
                      onClick={handleChannelInviteBack}
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
                    <button type="button" className="soft-button" onClick={handleChannelInviteBack}>
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

                  {channelDetailView === 'storage' ? (
                    <div className="settings-stack settings-stack-storage settings-stack-channel-storage">
                      <div ref={channelStorageSceneTopRef} />
                      <div className="settings-actions channels-detail-actions channels-detail-actions-top">
                        <button
                          type="button"
                          className="soft-button"
                          onClick={() => {
                            setChannelStorageItemsError('')
                            setChannelDetailView('main')
                          }}
                          disabled={channelSettingsBusy}
                        >
                          Назад
                        </button>
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
                      </div>
                      {activeChannelStorageUsage ? (
                        <article className={`settings-item storage-usage-card storage-usage-card-scene ${activeChannelStorageTone}`}>
                          <div className="storage-usage-header">
                            <span className="settings-label">Хранилище канала</span>
                            <strong>{`${formatAttachmentSize(activeChannelStorageUsage.usedBytes)} из ${formatAttachmentSize(activeChannelStorageUsage.quotaBytes)}`}</strong>
                          </div>
                          <div
                            className="storage-usage-bar"
                            role="progressbar"
                            aria-label="Использование хранилища канала"
                            aria-valuemin={0}
                            aria-valuemax={activeChannelStorageUsage.quotaBytes}
                            aria-valuenow={activeChannelStorageUsage.usedBytes}
                          >
                            <span
                              className="storage-usage-bar-fill"
                              style={{ width: `${Math.max(4, Math.min(100, activeChannelStoragePercent))}%` }}
                            />
                          </div>
                          <div className="settings-storage-meta">
                            <p className="settings-text">{`Осталось ${formatAttachmentSize(activeChannelStorageUsage.remainingBytes)}`}</p>
                            <p className="settings-text">{channelStorageManagedItemsLabel}</p>
                          </div>
                        </article>
                      ) : null}
                      <article className="settings-item settings-storage-items-panel">
                        <div className="storage-usage-header">
                          <span className="settings-label">Файлы хранилища</span>
                          <strong>{channelStorageManagedItemsLabel}</strong>
                        </div>
                        {renderStorageItemsGrid({
                          busy: channelStorageItemsBusy,
                          compact: true,
                          deletingId: deletingChannelStorageItemId,
                          emptyCopy:
                            'Хранилище канала пока свободно. Здесь будут появляться только вложения постов этого канала. Комментарии считаются в хранилище автора.',
                          error: channelStorageItemsError,
                          items: channelStorageItems,
                          onDelete: (item) => {
                            void removeChannelStorageItem(item)
                          },
                        })}
                        {channelStorageItems.length > 0 ? (
                          <button
                            type="button"
                            className="soft-button settings-storage-scroll-top-button"
                            onClick={() => {
                              channelStorageSceneTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }}
                          >
                            Наверх
                          </button>
                        ) : null}
                      </article>
                    </div>
                  ) : (
                    <div className="channels-fields">
                      <article className="settings-item">
                        <span className="settings-label">Прямая ссылка</span>
                        <div className="channel-link-field">
                          <input
                            type="text"
                            className="settings-input channel-link-input settings-input-with-inline-icon"
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
                            className="settings-inline-copy-button"
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
                          className="channel-status-input"
                          maxLength={statusFieldMaxLength}
                          placeholder="Введите статус канала"
                          rows={2}
                          value={activeChannel.statusText ?? ''}
                          onChange={(event) =>
                            updateChannel(activeChannel.id, {
                              statusText: sanitizeStatusField(event.target.value),
                            })
                          }
                        />
                      </article>

                      <article className="settings-item channel-description-card">
                        <span className="settings-label">Описание канала</span>
                        <textarea
                          className="channel-description-input"
                          maxLength={channelDescriptionMaxLength}
                          placeholder="Добавьте описание канала"
                          rows={6}
                          value={activeChannel.description}
                          onChange={(event) =>
                            updateChannel(activeChannel.id, {
                              description: sanitizeChannelDescription(event.target.value),
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

                      {renderManagedStorageSummaryButton({
                        managedItemsLabel: channelStorageManagedItemsLabel,
                        onOpen: () => {
                          setChannelStorageItemsError('')
                          setChannelDetailView('storage')
                        },
                        openCopy: 'Открыть хранилище канала',
                        subjectLabel: 'Канала',
                        title: 'Хранилище',
                        tone: activeChannelStorageTone,
                        usage: activeChannelStorageUsage,
                      })}
                    </div>
                  )}

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
                        <p className="room-confirm-copy room-confirm-copy-centered">Управление каналом</p>
                        <div className="room-confirm-actions room-confirm-actions-single">
                          <button
                            type="button"
                            className="room-confirm-button room-confirm-danger"
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

              {channelDetailView === 'main' ? (
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
              ) : null}
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

	        {threadTarget && (threadTarget.kind !== 'support' || isSupportSettingsThreadOpen) ? (
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
            onBack={handleRoomBack}
            onOpenThread={isPreviewSubscriptionChannel ? undefined : openChannelThread}
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
            onPostSelect={(anchorElement, postId) => {
              scheduleActionAnchor(anchorElement, 'start', (anchor) =>
                openSubscriptionPostActions(postId, anchor),
              )
            }}
            onReplyReferenceJump={scrollToChannelPost}
            visiblePosts={visibleSubscriptionPosts}
            publisher={
              ownedCurrentManagedChannel && !currentSubscriptionChannelArchived
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
                    onRenameAttachmentFileBaseName: (nextBaseName: string) =>
                      renameChannelAttachmentFileBaseName(currentSubscriptionChannel!.id, nextBaseName),
                    onDraftChange: (value) => updateChannelPostDraft(currentSubscriptionChannel!.id, value),
                    onComposerPaste: handleChannelComposerPaste,
                    onOpenAttachmentPicker: openChannelAttachmentPicker,
                    onOpenPremiumUpsell: openPremiumUpsell,
                    onOpenVideoNoteRecorder: () => openChannelVideoNoteRecorder(currentSubscriptionChannel!.id),
                    onReplyCancel: () => setChannelPostReplyTarget(null),
                    onSelectGif: (gif) => attachChannelGif(currentSubscriptionChannel!.id, gif),
                    onToggleSendOriginal: () =>
                      toggleChannelAttachmentSendOriginal(currentSubscriptionChannel!.id),
                    onUploadGif: (file) => uploadAndAttachChannelGif(currentSubscriptionChannel!.id, file),
                    premiumUnlocked: sessionHasPremium,
                    editTarget: channelPostEditTarget,
                    gifLibrary: session?.gifLibrary ?? [],
                    gifSelectionBlockedReason: getGifSelectionBlockedReason(
                      channelAttachmentDrafts[currentSubscriptionChannel!.id],
                    ),
                    onDeleteGif: deleteGifFromLibrary,
                    onEditCancel: () => cancelChannelPostEdit(currentSubscriptionChannel!.id),
                    onSearchGifs: searchAvailableGifs,
                    replyTarget: channelPostReplyTarget,
                    storageCleanupWarning: getStorageCleanupWarning(
                      channelAttachmentDrafts[currentSubscriptionChannel!.id],
                    ),
                    onSubmit: () => {
                      void sendManagedChannelPost()
                    },
                  }
                : undefined
            }
            subscriptionAction={
              previewSubscriptionChannel && previewSubscriptionChannel.archiveReason !== 'owner-deleted'
                ? {
                    busy: channelPostBusy,
                    error: channelPostError,
                    label: 'Подписаться на канал',
                    onClick: () => {
                      void subscribeToPreviewSubscriptionChannel()
                    },
                  }
                : undefined
            }
            subscriberCountLabel={currentSubscriptionChannelSubscriberLabel}
            onOpenAttachment={openMediaViewer}
            onOpenExternalLink={requestOpenExternalLink}
            onOpenSourceContact={openSourceContact}
            showOwnerEditIcon={isCurrentSubscriptionChannelOwner}
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
            getMessageUploadProgress={getGroupMessageUploadProgress}
            group={activeGroup}
            mentionCandidates={groupMentionCandidates}
            messageFeedRef={messageFeedRef}
            onAttachmentChange={handleGroupAttachmentChange}
            onAttachmentClear={() => clearGroupAttachmentDraft(activeGroup.id)}
            onAttachmentPreviewOpen={() => openAttachmentDraftPreview(groupAttachmentDrafts[activeGroup.id])}
            onRenameAttachmentFileBaseName={(nextBaseName) =>
              renameGroupAttachmentFileBaseName(activeGroup.id, nextBaseName)
            }
            onOpenGroupActions={(event) => {
              scheduleActionAnchor(event.currentTarget, 'end', setGroupActionsAnchor)
              resetGroupMessageActions()
              setGroupInviteOpen(false)
              setGroupInviteError('')
              setGroupInviteLimitNoticeOpen(false)
              setGroupReportNoticeOpen(false)
              setConfirmingLeaveGroupId(null)
            }}
            onBack={handleRoomBack}
            onComposerFocus={() => {
              closeGroupMessageActions()
              closeGroupActions()
            }}
            composerDisabledNotice={activeGroupWriteBlockReason}
            onDraftChange={(value) => updateGroupDraft(activeGroup.id, value)}
            onComposerPaste={handleGroupComposerPaste}
            onMessageSelect={(anchorElement, message) => {
              scheduleActionAnchor(
                anchorElement,
                message.author === 'me' ? 'end' : 'start',
                (anchor) => openGroupMessageActions(message.id, anchor),
              )
            }}
            onOpenAttachment={openMediaViewer}
            onOpenExternalLink={requestOpenExternalLink}
            onOpenLinkedChannel={openSourceChannel}
            onOpenSourceContact={openSourceContact}
            onOpenParticipants={() => {
              setGroupParticipantsSearchQuery('')
              setSelectedGroupParticipantIdentifier(null)
              setConfirmingRemoveGroupParticipantIdentifier(null)
              setConfirmingBlacklistGroupParticipantIdentifier(null)
              setGroupParticipantActionBusy(false)
              setGroupParticipantActionError('')
              setGroupParticipantsOpen(true)
            }}
            onReplyCancel={() => setReplyTarget(null)}
            onReplyReferenceJump={scrollToGroupMessage}
            onOpenPremiumUpsell={openPremiumUpsell}
            onOpenVideoNoteRecorder={() => openGroupVideoNoteRecorder(activeGroup.id)}
            onOpenSourceChannel={openSourceChannelFromMessage}
            onOpenAttachmentPicker={openGroupAttachmentPicker}
            onOpenThread={openGroupThread}
            onSelectGif={(gif) => attachGroupGif(activeGroup.id, gif)}
            onToggleSendOriginal={() => toggleGroupAttachmentSendOriginal(activeGroup.id)}
            onUploadGif={(file) => uploadAndAttachGroupGif(activeGroup.id, file)}
            showOwnerEditIcon={isOwnedGroupPreview(activeGroup)}
            gifLibrary={session?.gifLibrary ?? []}
            gifSelectionBlockedReason={getGifSelectionBlockedReason(groupAttachmentDrafts[activeGroup.id])}
            onDeleteGif={deleteGifFromLibrary}
            premiumUnlocked={sessionHasPremium}
            onSearchGifs={searchAvailableGifs}
            editTarget={groupMessageEditTarget}
            replyTarget={replyTarget}
            resolveLinkedChannelFromMessage={resolveEmbeddedChannelFromMessage}
            storageCleanupWarning={getStorageCleanupWarning(groupAttachmentDrafts[activeGroup.id])}
            visibleMessages={visibleGroupMessages}
            onEditCancel={() => cancelGroupMessageEdit(activeGroup.id)}
            onSubmit={sendGroupMessage}
          />
        ) : null}
        {groupParticipantsDialog}
        {selectedActiveGroupParticipantDialog}
        {confirmingRemoveGroupParticipantDialog}
        {confirmingBlacklistGroupParticipantDialog}
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
              getMessageUploadProgress={getDirectMessageUploadProgress}
              messageFeedRef={messageFeedRef}
              onAttachmentClear={() => clearChatAttachmentDraft(activeChat.id)}
              onAttachmentPreviewOpen={() => openAttachmentDraftPreview(chatAttachmentDrafts[activeChat.id])}
              onRenameAttachmentFileBaseName={(nextBaseName) =>
                renameChatAttachmentFileBaseName(activeChat.id, nextBaseName)
              }
              pinnedMessage={pinnedMessage}
              quietMode={quietMode}
              editTarget={directMessageEditTarget}
              replyTarget={replyTarget}
              visibleMessages={visibleDirectMessages}
              composerDisabledNotice={activeChatAdminBlockNotice}
              composerGate={activeChatComposerGate}
              onAttachmentChange={handleChatAttachmentChange}
              onBack={handleRoomBack}
              onBlockChat={() => blockChat(activeChat.id)}
              onCloseChatActions={() => setChatActionsOpen(false)}
              onCreateGroup={() => {
                setChatActionsOpen(false)
                openGroupCreateDialog([activeChat.id])
              }}
              onShareContact={() => {
                setContactShareOpen(true)
                setContactShareBusy(false)
                setContactShareError('')
                setContactShareChatIds([])
                setContactShareNote('')
                setChatActionsOpen(false)
              }}
              onDraftChange={(value) => updateChatDraft(activeChat.id, value)}
              onComposerPaste={handleChatComposerPaste}
              onMessageSelect={(anchorElement, message) => {
                setMessageActionMessageId(message.id)
                scheduleActionAnchor(
                  anchorElement,
                  message.author === 'me' ? 'end' : 'start',
                  setMessageActionAnchor,
                )
              }}
              onOpenAttachment={openMediaViewer}
              onOpenExternalLink={requestOpenExternalLink}
              onOpenLinkedChannel={openSourceChannel}
              onOpenSourceContact={openSourceContact}
              onOpenSourceGroup={openSourceGroup}
              onOpenSourceChannel={openSourceChannelFromMessage}
              onOpenAttachmentPicker={openAttachmentPicker}
              onOpenPremiumUpsell={openPremiumUpsell}
              onOpenVideoNoteRecorder={() => openChatVideoNoteRecorder(activeChat.id)}
              onOpenPremiumGift={() => {
                setPremiumGiftChatId(activeChat.id)
                setStageView('premium')
                setChatActionsOpen(false)
              }}
              onComposerGateAction={() => {
                if ((activeChat.contactState ?? 'accepted') === 'pending-outgoing') {
                  void actOnContactRequest(activeChat.phone, 'cancel')
                  return
                }

                void sendContactRequestForActiveChat()
              }}
              onComposerGateAccept={() => {
                void actOnContactRequest(activeChat.phone, 'accept')
              }}
              onComposerGateReject={() => {
                void actOnContactRequest(activeChat.phone, 'reject')
              }}
              onComposerGateBlock={() => {
                void actOnContactRequest(activeChat.phone, 'block')
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
              onEditCancel={() => cancelDirectMessageEdit(activeChat.id)}
              gifLibrary={session?.gifLibrary ?? []}
              gifSelectionBlockedReason={getGifSelectionBlockedReason(chatAttachmentDrafts[activeChat.id])}
              onDeleteGif={deleteGifFromLibrary}
              premiumUnlocked={sessionHasPremium}
              onSearchGifs={searchAvailableGifs}
              onUnpinMessage={() => {
                void unpinMessage(activeChat.id)
              }}
              storageCleanupWarning={getStorageCleanupWarning(chatAttachmentDrafts[activeChat.id])}
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
                  <Suspense fallback={null}>
                    <SelectedBubbleOverlay
                      anchor={messageActionAnchor}
                      deliveryIssue={activeMessageDeliveryIssue ?? undefined}
                      kind="direct"
                      linkedChannel={resolveEmbeddedChannelFromMessage(activeMessage)}
                      message={activeMessage}
                      mine={activeMessage.author === 'me'}
                      onOpenAttachment={openMediaViewer}
                      onOpenExternalLink={requestOpenExternalLink}
                      onOpenPremiumUpsell={openPremiumUpsell}
                      replyChatTitle={activeChat.title}
                      uploadProgress={activeMessageUploadProgress ?? undefined}
                    />
                  </Suspense>
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
                        {isEditableOwnTextMessage(activeMessage) ? (
                          <button
                            type="button"
                            className="message-menu-item"
                            onClick={() => startDirectMessageEdit(activeMessage)}
                          >
                            Редактировать
                          </button>
                        ) : null}
                        {!activeMessage.attachment ? (
                          <button
                            type="button"
                            className="message-menu-item"
                            onClick={() => copyMessageText(activeMessage)}
                          >
                            Скопировать
                          </button>
                        ) : null}
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
                          {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
                        </span>
                        <span>{chat.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {contactShareOpen && activeChat ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть отправку контакта"
                  onClick={closeContactShareDialog}
                />
                <div className="room-confirm room-forward room-transfer-list">
                  <p className="room-confirm-copy">{`Кому отправить контакт ${activeChat.title}?`}</p>
                  <label className="room-forward-note">
                    <span className="settings-label">Подпись</span>
                    <textarea
                      className="settings-input room-forward-note-input"
                      rows={3}
                      value={contactShareNote}
                      onChange={(event) => setContactShareNote(event.target.value)}
                      placeholder="Напишите, почему делитесь этим контактом"
                      disabled={contactShareBusy}
                    />
                  </label>
                  <div className="room-forward-list">
                    {contactShareTargets.length > 0 ? (
                      contactShareTargets.map((chat) => {
                        const isSelected = contactShareChatIds.includes(chat.id)

                        return (
                          <button
                            key={`contact-share-${chat.id}`}
                            type="button"
                            className={`room-forward-item group-create-member-item${isSelected ? ' active' : ''}`}
                            onClick={() => {
                              if (contactShareBusy) return
                              toggleContactShareChat(chat.id)
                            }}
                            disabled={contactShareBusy}
                          >
                            <span className="chat-avatar-stack">
                              <span className="avatar" style={{ backgroundColor: chat.accent }}>
                                {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
                              </span>
                              {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                            </span>
                            <span className="group-create-member-copy">
                              <strong className="group-create-member-name-row">
                                <span>{chat.title}</span>
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
                        <p className="settings-text">Контакты не найдены.</p>
                      </article>
                    )}
                  </div>
                  {contactShareError ? <p className="auth-error">{contactShareError}</p> : null}
                  <div className="room-confirm-actions room-confirm-actions-dual">
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={closeContactShareDialog}
                      disabled={contactShareBusy}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className={`room-confirm-button room-confirm-button-primary${canShareActiveContact ? '' : ' disabled'}`}
                      aria-disabled={!canShareActiveContact}
                      onClick={() => {
                        if (contactShareBusy || !canShareActiveContact) return
                        void shareCurrentContactToSelectedChats()
                      }}
                      disabled={contactShareBusy}
                    >
                      {contactShareBusy ? 'Отправляем...' : 'Поделиться'}
                    </button>
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
                <div className="room-confirm room-confirm-compact">
                  <p className="room-confirm-copy">
                    Вы точно хотите удалить всю переписку с этим контактом?
                  </p>
                  <div
                    className={`room-confirm-actions${
                      canDeleteConfirmedMessageForEveryone ? '' : ' room-confirm-actions-dual'
                    }`}
                  >
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteChatHistory(confirmingDeleteHistoryChatId, 'me')
                      }}
                    >
                      Удалить у меня
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteChatHistory(confirmingDeleteHistoryChatId, 'everyone')
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
                <div className="room-confirm room-confirm-compact">
                  <p className="room-confirm-copy">Удалить это сообщение?</p>
                  <div
                    className={`room-confirm-actions${
                      canDeleteConfirmedMessageForEveryone ? '' : ' room-confirm-actions-dual'
                    }`}
                  >
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => {
                        void deleteMessage(activeChat.id, confirmingDeleteMessageId, 'me')
                      }}
                    >
                      Удалить у меня
                    </button>
                    {canDeleteConfirmedMessageForEveryone ? (
                      <button
                        type="button"
                        className="room-confirm-button room-confirm-danger"
                        onClick={() => {
                          void deleteMessage(activeChat.id, confirmingDeleteMessageId, 'everyone')
                        }}
                      >
                        Удалить у всех
                      </button>
                    ) : null}
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
                      onClick={() => openGroupAvatarPicker({ scope: 'create' })}
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
              </article>

              <article className="settings-item channel-description-card">
                <span className="settings-label">Идеалогия группы</span>
                <textarea
                  className="channel-description-input"
                  maxLength={channelDescriptionMaxLength}
                  rows={5}
                  value={creatingGroupDescription}
                  placeholder="Опишите, ради чего создана группа."
                  onChange={(event) => {
                    setCreatingGroupDescription(sanitizeChannelDescription(event.target.value))
                    setCreatingGroupError('')
                  }}
                />
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
              <article className="settings-item group-create-limit-card">
                <span className="settings-label">Ограничения</span>
                <p className="settings-text group-create-limit-copy">
                  {sessionHasPremium
                    ? `С премиумом можно создать до ${premiumGroupsPerUserLimit} активных групп.`
                    : `На бесплатном аккаунте можно создать до ${defaultGroupsPerUserLimit} активных групп.`}
                </p>
                <p className="settings-text group-create-limit-copy">
                  {`Сейчас у вас ${activeOwnedGroupCount} из ${creatingGroupsPerUserLimit}.`}
                </p>
                {!sessionHasPremium ? (
                  <button
                    type="button"
                    className="soft-button group-create-limit-upsell"
                    onClick={() => {
                      closeGroupCreateDialog()
                      openPremiumUpsell()
                    }}
                  >
                    <span className="premium-crown settings-invisibility-crown" aria-hidden="true">
                      <img src="/icons/crown64.png" alt="" />
                    </span>
                    <span>Открыть премиум</span>
                  </button>
                ) : null}
                {creatingGroupLimitReached ? (
                  <p className="auth-error">{getGroupCreationLimitError(creatingGroupsPerUserLimit)}</p>
                ) : null}
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
                              {renderAccountAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
                            </span>
                            {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                          </span>
                          <span className="group-create-member-copy">
                            <strong className="group-create-member-name-row">
                              <span>{chat.title}</span>
                              {shouldShowPremiumCrown(chat) ? (
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
                      <p className="settings-text">{creatingGroupSelectionRequiredMessage}</p>
                    </article>
                  )}
                </div>
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
                className={`room-confirm-button room-confirm-button-primary${creatingGroupLimitReached ? ' disabled' : ''}`}
                aria-disabled={creatingGroupBusy || creatingGroupLimitReached}
                onClick={() => {
                  if (creatingGroupBusy || creatingGroupLimitReached) return
                  void createGroup()
                }}
              >
                {creatingGroupBusy ? 'Создаём...' : 'Создать'}
              </button>
            </div>
          </div>
        </>
      ) : null}
      {groupAvatarPickerTarget ? (
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
                style={{ backgroundColor: getCurrentGroupAvatarTone() }}
              >
                {getCurrentGroupAvatarPreview() ? (
                  <img
                    src={getCurrentGroupAvatarPreview()!}
                    alt=""
                    className="channel-avatar-image"
                  />
                ) : (
                  formatChannelAvatarLabel(getCurrentGroupAvatarTitle())
                )}
              </span>
              <div className="channel-avatar-picker-preview-copy">
                <strong>{getCurrentGroupAvatarTitle()}</strong>
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
      {groupDescriptionOpen && activeGroup ? (
        <>
          <button
            type="button"
            className="room-confirm-scrim"
            aria-label="Закрыть идеалогию группы"
            onClick={() => setGroupDescriptionOpen(false)}
          />
          <div className="room-confirm channel-description-dialog">
            <div className="channel-description-dialog-header">
              <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: activeGroup.accent }}>
                {activeGroup.avatarImage ? (
                  <img src={activeGroup.avatarImage} alt="" className="channel-avatar-image" />
                ) : (
                  formatChannelAvatarLabel(activeGroup.title)
                )}
              </span>
              <div className="channel-description-dialog-copy">
                <h3>{activeGroup.title}</h3>
              </div>
            </div>
            <div className="channel-description-dialog-body">
              <p className="channel-description-dialog-label">Идеалогия группы</p>
              {activeGroupDescriptionText ? (
                <p className="channel-description-dialog-text">{activeGroupDescriptionText}</p>
              ) : (
                <p className="channel-description-dialog-text channel-description-dialog-empty">
                  Идеалогия группы пока не заполнена.
                </p>
              )}
            </div>
            <div className="room-forward-list">
              <div className="room-forward-item channel-description-contact-card">
                <span className="chat-avatar-stack">
                  <span
                    className="avatar"
                    style={{ backgroundColor: activeGroupCreatorChat?.accent ?? activeGroup.accent ?? '#8c5738' }}
                  >
                    {session?.avatarImage && activeGroupOwnerIdentifier === session?.identifier ? (
                      <img src={session.avatarImage} alt="" className="channel-avatar-image" />
                    ) : (
                      renderAccountAvatarContent(
                        activeGroupCreatorChat?.title ??
                          (activeGroupOwnerIdentifier === session?.identifier
                            ? formatSessionName(session)
                            : 'Создатель группы'),
                        activeGroupCreatorChat?.archivedAccount,
                        activeGroupCreatorChat?.avatarImage,
                      )
                    )}
                  </span>
                </span>
                <span className="group-create-member-copy">
                  <strong className="group-create-member-name-row">
                    <span>
                      {activeGroupCreatorChat?.title ??
                        (activeGroupOwnerIdentifier === session?.identifier
                          ? formatSessionName(session)
                          : 'Создатель группы')}
                    </span>
                  </strong>
                  <span>
                    {activeGroupCreatorChat
                      ? activeGroupCreatorChat.handle || activeGroupCreatorChat.phone
                      : activeGroupOwnerIdentifier === session?.identifier
                        ? (session?.nickname ? `@${session.nickname}` : session?.identifier)
                        : 'Контакт создателя'}
                  </span>
                </span>
              </div>
            </div>
            <div className="room-confirm-actions room-confirm-actions-single">
              <button
                type="button"
                className="room-confirm-button"
                onClick={() => setGroupDescriptionOpen(false)}
              >
                Назад
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
                <span className="settings-label">Аватарка группы</span>
                <div className="channel-avatar-settings">
                  <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: activeGroup.accent }}>
                    {groupSettingsDraft?.avatarImage ? (
                      <img src={groupSettingsDraft.avatarImage} alt="" className="channel-avatar-image" />
                    ) : (
                      formatChannelAvatarLabel(
                        groupSettingsDraft?.title.trim() || activeGroup.title,
                      )
                    )}
                  </span>
                  <div className="channel-avatar-copy">
                    <p className="settings-text">
                      Можно загрузить JPG, PNG либо WebP до 5 МБ.
                    </p>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => openGroupAvatarPicker({ groupId: activeGroup.id, scope: 'existing' })}
                    >
                      Сменить
                    </button>
                  </div>
                </div>
              </article>
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
              <article className="settings-item channel-description-card">
                <span className="settings-label">Идеалогия группы</span>
                <textarea
                  className="channel-description-input"
                  maxLength={channelDescriptionMaxLength}
                  rows={5}
                  value={groupSettingsDraft?.description ?? ''}
                  onChange={(event) =>
                    updateGroupSettingsDraft({
                      description: sanitizeChannelDescription(event.target.value),
                    })
                  }
                />
              </article>
              <article className="settings-item">
                <span className="settings-label">История группы</span>
                <label className="settings-checkbox settings-checkbox-expanded">
                  <input
                    type="checkbox"
                    checked={groupSettingsDraft?.showHistoryToNewMembers !== false}
                    onChange={(event) =>
                      updateGroupSettingsDraft({
                        showHistoryToNewMembers: event.target.checked,
                      })
                    }
                  />
                  <span>Отображать историю группы новым пользователям</span>
                </label>
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
            <p className="room-confirm-copy room-confirm-copy-centered">Управление группой</p>
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
                            {renderAccountAvatarContent(participant.title, participant.archivedAccount)}
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
                <div className="room-forward-list room-management-actions">
                  <button
                    type="button"
                    className="room-forward-item room-management-item"
                    onClick={() => setGroupTransferOwnerOpen(true)}
                  >
                    Передать владельца
                  </button>
                  <button
                    type="button"
                    className="room-forward-item room-management-item room-confirm-danger"
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
      {externalLinkWarningDialog}
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
                          {renderAccountAvatarContent(participant.title, participant.archivedAccount)}
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
                          {renderAccountAvatarContent(participant.title, participant.archivedAccount)}
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
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}
      {videoNoteRecorderTarget ? (
        <Suspense fallback={null}>
          <VideoNoteRecorderOverlay
            onClose={() => {
              setVideoNoteRecorderTarget(null)
            }}
            onRecordingStart={() => {
              trackAnalyticsEvent('video_note_record_started', {
                roomKind:
                  videoNoteRecorderTarget.kind === 'thread'
                    ? videoNoteRecorderTarget.room
                    : videoNoteRecorderTarget.kind,
                source: videoNoteRecorderTarget.kind === 'thread' ? 'thread' : videoNoteRecorderTarget.kind,
              })
            }}
            onUse={handleVideoNoteRecorderUse}
          />
        </Suspense>
      ) : null}
      {cookieConsentBanner}
    </>
  )
}

export default App
