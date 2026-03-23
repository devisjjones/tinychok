import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  defaultGroupMemberLimit,
  displayNameFieldMaxLength,
  groupTitleMaxLength,
  managedChannelsPerUserLimit,
  premiumGroupMemberLimit,
  surnameFieldMaxLength,
} from '../../src/shared/constants'
import {
  discoveryResults,
  initialChannels,
  initialChats,
  initialGroups,
  initialSubscribedChannels,
} from '../../src/shared/mockData'
import type {
  Account,
  ChannelThreadInboxItem,
  Channel,
  Chat,
  GroupThreadInboxItem,
  GroupParticipant,
  GroupPreview,
  Message,
  SearchResult,
  Session,
  SubscriptionChannel,
  ThreadComment,
  ThreadInboxItem,
} from '../../src/shared/types'
import {
  buildChannelDirectLinkFromTitle,
  ensureUniqueChannelDirectLink,
  formatAccountName,
  formatNowTime,
  hasActivePremium,
  makePremiumExpiry,
  normalizeIdentifier,
  normalizeNickname,
  sanitizeChannelDirectLink,
  sanitizeChannelDescription,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
} from '../../src/shared/utils'
import type {
  AppSnapshot,
  ComplaintReason,
  CreateGroupBody,
  CreateManagedChannelBody,
  InviteManagedChannelMembersBody,
  InviteGroupMemberBody,
  OpenDirectDialogBody,
  ReportContactBody,
  ReportSubscriptionChannelBody,
  RegisterBody,
  RequestCodeResponse,
  SetDialogFavoriteBody,
  SetDialogPinnedMessageBody,
  SendDirectMessageBody,
  SendGroupMessageBody,
  SendManagedChannelPostBody,
  SendGroupThreadCommentBody,
  SendSubscriptionChannelThreadCommentBody,
  UpdateDialogBody,
  UpdateGroupBody,
  UpdateManagedChannelBody,
  UpdateSubscriptionChannelBody,
  UpdateSessionBody,
  VerifyCodeResponse,
} from '../../src/shared/backend'
import { runtimeConfig } from './config'
import { deleteStoredMediaByUrl } from './media'

type PersistedDialog = Omit<Chat, 'messages'> & {
  ownerIdentifier: string
}

type PersistedDialogMessage = Message & {
  dialogId: number
  ownerIdentifier: string
}

type PersistedGroup = Omit<GroupPreview, 'messages'> & {
  ownerIdentifier: string
}

type PersistedGroupMessage = Message & {
  groupId: number
  ownerIdentifier: string
}

type PersistedManagedChannel = Channel & {
  ownerIdentifier: string
}

type PersistedSubscriptionChannel = Omit<SubscriptionChannel, 'posts'> & {
  ownerIdentifier: string
}

type SubscriptionPost = SubscriptionChannel['posts'][number]

type PersistedSubscriptionPost = SubscriptionPost & {
  channelId: number
  ownerIdentifier: string
}

type PersistedThreadState = {
  lastReadCommentCreatedAt?: string
  ownerIdentifier: string
  subscription: 'implicit' | 'subscribed' | 'unsubscribed'
  threadId: string
}

type SessionRecord = {
  createdAt: string
  identifier: string
  token: string
}

type AuthChallenge = {
  code: string
  expiresAt: string
  identifier: string
}

type ContactReportRecord = {
  createdAt: string
  reason: ComplaintReason
  reporterIdentifier: string
  targetIdentifier: string
}

type SubscriptionChannelReportRecord = {
  createdAt: string
  reason: ComplaintReason
  reporterIdentifier: string
  targetHandle: string
}

type LegacyAccountState = {
  channels: Channel[]
  chats: Chat[]
  groups: GroupPreview[]
  subscriptionChannels: SubscriptionChannel[]
}

type LegacyPersistedAccount = Account & {
  state: LegacyAccountState
}

export type Database = {
  accounts: Account[]
  authChallenges: AuthChallenge[]
  contactReports: ContactReportRecord[]
  dialogs: PersistedDialog[]
  dialogMessages: PersistedDialogMessage[]
  groupMessages: PersistedGroupMessage[]
  groups: PersistedGroup[]
  managedChannels: PersistedManagedChannel[]
  sessions: SessionRecord[]
  subscriptionChannelReports: SubscriptionChannelReportRecord[]
  subscriptionChannels: PersistedSubscriptionChannel[]
  subscriptionPosts: PersistedSubscriptionPost[]
  threadStates: PersistedThreadState[]
}

type LegacyDatabase = {
  accounts?: LegacyPersistedAccount[]
  authChallenges?: AuthChallenge[]
  sessions?: SessionRecord[]
}

type MutationResult = {
  broadcastIdentifiers: string[]
  snapshot: AppSnapshot
}

type CreateChannelResult = MutationResult & {
  channelId: number
}

type CreateGroupResult = MutationResult & {
  groupId: number
}

type OpenDirectDialogResult = MutationResult & {
  dialogId: number
}

const AUTH_CODE_TTL_MS = 5 * 60 * 1000
const DEMO_AUTH_CODE = '1111'
export const DEFAULT_DATA_FILE = resolve(process.cwd(), 'server/data/dev-db.json')
const FALLBACK_CHAT_ACCENT = '#8c5738'
const CHAT_ACCENT_PALETTE = Array.from(new Set(initialChats.map((chat) => chat.accent)))
const CONTACT_REPORT_BLOCK_THRESHOLD = 10
const CONTACT_REPORT_BLOCK_MESSAGE =
  'На ваш аккаунт поступило много жалоб, поэтому вход временно заблокирован. Если произошла ошибка, напишите в поддержку и укажите email: devisjjones@gmail.com'
const RESTRICTED_TEST_PHONE_MESSAGE =
  'Этот номер пока не добавлен в список тестеров. Попросите владельца проекта добавить его в staging allowlist.'
const TEST_FIXTURE_CREATED_AT = '2026-03-21T00:00:00.000Z'
const TEST_FIXTURE_PREMIUM_EXPIRES_AT = '2099-01-01T00:00:00.000Z'

function cloneDiscoveryResults() {
  return structuredClone(discoveryResults)
}

function createDefaultDatabase(): Database {
  return {
    accounts: [],
    authChallenges: [],
    contactReports: [],
    dialogs: [],
    dialogMessages: [],
    groupMessages: [],
    groups: [],
    managedChannels: [],
    sessions: [],
    subscriptionChannelReports: [],
    subscriptionChannels: [],
    subscriptionPosts: [],
    threadStates: [],
  }
}

type PersistDatabaseFn = (database: Database) => Promise<void>

function createSeedState() {
  if (runtimeConfig.environment === 'production') {
    return {
      channels: [] as Channel[],
      chats: [] as Chat[],
      groups: [] as GroupPreview[],
      subscriptionChannels: [] as SubscriptionChannel[],
    }
  }

  return {
    channels:
      runtimeConfig.environment === 'development' ? structuredClone(initialChannels) : ([] as Channel[]),
    chats: structuredClone(initialChats),
    groups: structuredClone(initialGroups),
    subscriptionChannels: structuredClone(initialSubscribedChannels),
  }
}

function buildTestAccounts() {
  return initialChats.map((chat) => ({
    avatarImage: undefined,
    blockedContactIds: [],
    createdAt: TEST_FIXTURE_CREATED_AT,
    displayName: chat.title,
    identifier: normalizeIdentifier(chat.phone),
    isTestEntity: true,
    nickname: normalizeNickname(chat.handle.replace(/^@+/u, '')),
    premium: chat.premium ?? false,
    premiumExpiresAt: chat.premium ? TEST_FIXTURE_PREMIUM_EXPIRES_AT : undefined,
    status: chat.status
      ? (chat.status.startsWith('Тестовый аккаунт')
          ? chat.status
          : `Тестовый аккаунт · ${chat.status}`)
      : 'Тестовый аккаунт',
    surname: '',
  } satisfies Account))
}

function getSeedChatByPhone(phone: string) {
  const normalizedPhone = normalizeIdentifier(phone)
  return initialChats.find((chat) => normalizeIdentifier(chat.phone) === normalizedPhone) ?? null
}

function isAllowedTestPhone(identifier: string) {
  if (runtimeConfig.auth.allowedTestPhones.length === 0) {
    return true
  }

  const normalizedIdentifier = normalizeIdentifier(identifier)
  return runtimeConfig.auth.allowedTestPhones.some(
    (phone) => normalizeIdentifier(phone) === normalizedIdentifier,
  )
}

function sanitizeMessageText(value: string) {
  return value.trim()
}

function sanitizeThreadCommentText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 2000)
}

function sanitizeMessageAttachment(attachment: Message['attachment']) {
  if (!attachment) return undefined

  const fileName = attachment.fileName.replace(/\s+/g, ' ').trim().slice(0, 120)
  const mediaUrl = attachment.mediaUrl.trim()
  const mimeType = attachment.mimeType.trim().slice(0, 120)
  const size = Math.max(0, Math.floor(attachment.size))

  if (!fileName || !mediaUrl || !mimeType || size <= 0) {
    throw new Error('Некорректное вложение.')
  }

  return {
    fileName,
    mediaUrl,
    mimeType,
    size,
  } satisfies NonNullable<Message['attachment']>
}

function sanitizeGroupTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, groupTitleMaxLength)
}

function buildGroupHandle(title: string, groupId: number) {
  const normalized = title
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18)

  return `@${normalized || `group_${groupId}`}`
}

function sanitizeGroupHandle(value: string, groupId: number) {
  const normalized = value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)

  return `@${normalized || `group_${groupId}`}`
}

function sanitizeSourceChannel(
  sourceChannel?: Message['sourceChannel'],
): Message['sourceChannel'] | undefined {
  const title = sanitizeChannelTitle(sourceChannel?.title ?? '')
  if (!title) return undefined

  return {
    accent: sourceChannel?.accent?.trim() || undefined,
    draft: sourceChannel?.draft,
    handle: sourceChannel?.handle ? sanitizeChannelDirectLink(sourceChannel.handle) || undefined : undefined,
    id:
      typeof sourceChannel?.id === 'number' && Number.isInteger(sourceChannel.id)
        ? sourceChannel.id
        : undefined,
    title,
    visibility:
      sourceChannel?.visibility === 'private' ||
      sourceChannel?.visibility === 'public' ||
      sourceChannel?.visibility === 'closed'
        ? sourceChannel.visibility
        : undefined,
  }
}

function sanitizeSourceGroup(
  sourceGroup?: Message['sourceGroup'],
): Message['sourceGroup'] | undefined {
  const title = sanitizeGroupTitle(sourceGroup?.title ?? '')
  if (!title) return undefined

  return {
    accent: sourceGroup?.accent?.trim() || undefined,
    avatarImage: sourceGroup?.avatarImage?.trim() || undefined,
    creatorIdentifier: sourceGroup?.creatorIdentifier
      ? normalizeIdentifier(sourceGroup.creatorIdentifier) || undefined
      : undefined,
    handle: sourceGroup?.handle ? sanitizeGroupHandle(sourceGroup.handle, 1) : undefined,
    sharedId: sourceGroup?.sharedId?.trim() || undefined,
    title,
  }
}

function sanitizeForwardedAuthorName(value?: string) {
  return sanitizePersonField(value ?? '', displayNameFieldMaxLength)
}

function sanitizeReplyTarget(replyTo?: Message['replyTo']): Message['replyTo'] | undefined {
  if (!replyTo) return undefined

  const text = sanitizeMessageText(replyTo.text).slice(0, 280)
  if (!text) return undefined

  return {
    author: replyTo.author,
    id: Number.isInteger(replyTo.id) && replyTo.id > 0 ? replyTo.id : 0,
    text,
  }
}

function sanitizeComplaintReason(value: ComplaintReason | undefined) {
  if (value === 'spam' || value === 'fraud' || value === 'very_unpleasant') {
    return value
  }

  throw new Error('Некорректная причина жалобы.')
}

function shouldAllowComments(
  target: Pick<
    Channel | GroupPreview | SubscriptionChannel,
    'commentsEnabledForAll' | 'commentsEnabledForPremium'
  >,
  account?: Pick<Account, 'premium' | 'premiumExpiresAt'> | null,
) {
  if (target.commentsEnabledForPremium) {
    return hasActivePremium(account?.premium, account?.premiumExpiresAt)
  }

  if (target.commentsEnabledForAll) {
    return true
  }

  return false
}

function isIdentifierInCommentBlacklist(
  target: Pick<Channel | GroupPreview | SubscriptionChannel, 'commentBlacklistIdentifiers'>,
  identifier: string,
) {
  const normalizedIdentifier = normalizeIdentifier(identifier)
  return (target.commentBlacklistIdentifiers ?? []).some(
    (candidate) => normalizeIdentifier(candidate) === normalizedIdentifier,
  )
}

function sanitizeIdentifierList(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => normalizeIdentifier(value)).filter(Boolean))]
}

function buildAccountHandle(account: Account) {
  const normalizedDigits = account.identifier.replace(/[^\d]/g, '')
  return account.nickname?.trim()
    ? `@${account.nickname.trim()}`
    : `@user_${normalizedDigits.slice(-6) || 'tinychok'}`
}

function pickAccentForIdentifier(identifier: string) {
  if (CHAT_ACCENT_PALETTE.length === 0) {
    return FALLBACK_CHAT_ACCENT
  }

  const indexSeed = identifier
    .replace(/[^\d]/g, '')
    .split('')
    .reduce((sum, digit) => sum + Number(digit), 0)

  return CHAT_ACCENT_PALETTE[indexSeed % CHAT_ACCENT_PALETTE.length] ?? FALLBACK_CHAT_ACCENT
}

function buildSearchSubtitle(account: Account) {
  const status = account.status?.trim()
  return status || 'зарегистрирован в Tinychok'
}

function invertMessageAuthor(author: Message['author']) {
  return author === 'me' ? 'them' : 'me'
}

function getGroupMemberLimit(account?: Pick<Account, 'premium' | 'premiumExpiresAt'> | null) {
  return hasActivePremium(account?.premium, account?.premiumExpiresAt)
    ? premiumGroupMemberLimit
    : defaultGroupMemberLimit
}

function getStableParticipantId(identifier: string) {
  const normalizedIdentifier = normalizeIdentifier(identifier)
  const digitsOnly = normalizedIdentifier.replace(/[^\d]/g, '')

  if (digitsOnly) {
    return Number.parseInt(digitsOnly.slice(-9), 10)
  }

  let hash = 0

  for (let index = 0; index < normalizedIdentifier.length; index += 1) {
    hash = (hash * 31 + normalizedIdentifier.charCodeAt(index)) | 0
  }

  return Math.max(1, Math.abs(hash))
}

function getGroupMessageThreadId(
  group: Pick<PersistedGroup, 'id' | 'ownerIdentifier' | 'sharedId'>,
  message: Pick<Message, 'threadId' | 'deliveryId' | 'createdAt' | 'id' | 'text' | 'time'>,
) {
  if (message.threadId?.trim()) {
    return message.threadId.trim()
  }

  const sharedId = group.sharedId?.trim() || `${group.ownerIdentifier}:${group.id}`
  if (message.deliveryId?.trim()) {
    return `group:${sharedId}:delivery:${message.deliveryId.trim()}`
  }

  if (message.createdAt?.trim()) {
    return `group:${sharedId}:created:${message.createdAt.trim()}`
  }

  return `group:${sharedId}:legacy:${message.id}:${message.time}:${message.text.trim()}`
}

function getSubscriptionPostThreadId(
  channel: Pick<PersistedSubscriptionChannel, 'handle' | 'id' | 'ownerIdentifier'>,
  post: Pick<SubscriptionPost, 'threadId' | 'createdAt' | 'id' | 'text' | 'time'>,
) {
  if (post.threadId?.trim()) {
    return post.threadId.trim()
  }

  const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
  if (post.createdAt?.trim()) {
    return `channel:${normalizedHandle}:created:${post.createdAt.trim()}`
  }

  return `channel:${normalizedHandle}:legacy:${post.id}:${post.time}:${post.text.trim()}`
}

function materializeThreadComment(
  comment: ThreadComment | undefined,
  fallbackAuthor: 'me' | 'them' = 'them',
): ThreadComment | null {
  if (!comment) return null

  return {
    author: comment.author === 'me' || comment.author === 'them' ? comment.author : fallbackAuthor,
    authorIdentifier: comment.authorIdentifier ? normalizeIdentifier(comment.authorIdentifier) : undefined,
    createdAt: comment.createdAt,
    deliveryId: comment.deliveryId,
    displayAuthor: comment.displayAuthor,
    id: comment.id,
    replyTo: sanitizeReplyTarget(comment.replyTo),
    text: sanitizeThreadCommentText(comment.text),
    time: comment.time,
  } satisfies ThreadComment
}

function compactThreadComments(comments: Array<ThreadComment | undefined> | undefined): ThreadComment[] {
  return (comments ?? []).flatMap((comment) => {
    const materialized = materializeThreadComment(comment)
    return materialized ? [materialized] : []
  })
}

function toPersistedDialog(ownerIdentifier: string, chat: Chat): PersistedDialog {
  return {
    accent: chat.accent,
    handle: chat.handle,
    id: chat.id,
    isTestEntity: chat.isTestEntity,
    lastSeen: chat.lastSeen,
    mood: chat.mood,
    online: chat.online,
    ownerIdentifier,
    phone: chat.phone,
    muted: chat.muted ?? false,
    pinned: chat.pinned,
    pinnedMessageId: chat.pinnedMessageId,
    premium: chat.premium,
    status: chat.status,
    title: chat.title,
    typing: chat.typing,
    unread: chat.unread,
  }
}

function toPersistedDialogMessage(
  ownerIdentifier: string,
  dialogId: number,
  message: Message,
): PersistedDialogMessage {
  return {
    ...message,
    dialogId,
    ownerIdentifier,
  }
}

function toPersistedGroup(ownerIdentifier: string, group: GroupPreview): PersistedGroup {
  return {
    accent: group.accent,
    avatarImage: group.avatarImage,
    commentBlacklistIdentifiers: sanitizeIdentifierList(group.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(group.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(group.commentsEnabledForPremium),
    creatorIdentifier: group.creatorIdentifier?.trim() || ownerIdentifier,
    handle: group.handle,
    id: group.id,
    isTestEntity: group.isTestEntity,
    members: group.members,
    muted: group.muted ?? false,
    ownerIdentifier,
    participants: group.participants.map((participant) => ({
      ...participant,
      identifier: participant.identifier ? normalizeIdentifier(participant.identifier) : undefined,
      nickname: normalizeNickname(participant.nickname ?? ''),
    })),
    preview: group.preview,
    sharedId: group.sharedId?.trim() || `${ownerIdentifier}:${group.id}`,
    time: group.time,
    title: group.title,
    unread: group.unread,
  }
}

function toPersistedGroupMessage(
  ownerIdentifier: string,
  groupId: number,
  message: Message,
): PersistedGroupMessage {
  return {
    ...message,
    groupId,
    ownerIdentifier,
  }
}

function toPersistedManagedChannel(
  ownerIdentifier: string,
  channel: Channel,
): PersistedManagedChannel {
  return {
    ...channel,
    ownerIdentifier,
  }
}

function toPersistedSubscriptionChannel(
  ownerIdentifier: string,
  channel: SubscriptionChannel,
): PersistedSubscriptionChannel {
  return {
    accent: channel.accent,
    commentBlacklistIdentifiers: sanitizeIdentifierList(channel.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(channel.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(channel.commentsEnabledForPremium),
    draft: channel.draft,
    handle: channel.handle,
    id: channel.id,
    isTestEntity: channel.isTestEntity,
    muted: channel.muted ?? false,
    ownerIdentifier,
    participants:
      channel.participants?.map((participant) => ({
        ...participant,
        identifier: participant.identifier ? normalizeIdentifier(participant.identifier) : undefined,
        nickname: normalizeNickname(participant.nickname ?? ''),
      })) ?? [],
    preview: channel.preview,
    readers: channel.readers ?? 0,
    time: channel.time,
    title: channel.title,
    unread: channel.unread,
    visibility: channel.visibility,
  }
}

function toPersistedSubscriptionPost(
  ownerIdentifier: string,
  channelId: number,
  post: SubscriptionPost,
): PersistedSubscriptionPost {
  return {
    ...post,
    channelId,
    threadComments: compactThreadComments(post.threadComments),
    threadId: post.threadId?.trim() || undefined,
    ownerIdentifier,
  }
}

function materializeDialog(dialog: PersistedDialog): Omit<PersistedDialog, 'ownerIdentifier'> {
  return {
    accent: dialog.accent,
    handle: dialog.handle,
    id: dialog.id,
    isTestEntity: dialog.isTestEntity,
    lastSeen: dialog.lastSeen,
    mood: dialog.mood,
    muted: Boolean(dialog.muted),
    online: dialog.online,
    phone: dialog.phone,
    pinned: dialog.pinned,
    pinnedMessageId: dialog.pinnedMessageId,
    premium: dialog.premium,
    status: dialog.status,
    title: dialog.title,
    typing: dialog.typing,
    unread: dialog.unread,
  }
}

function materializeDialogMessage(
  message: PersistedDialogMessage,
): Omit<PersistedDialogMessage, 'dialogId' | 'ownerIdentifier'> {
  return {
    attachment: message.attachment,
    author: message.author,
    createdAt: message.createdAt,
    deliveryId: message.deliveryId,
    displayAuthor: message.displayAuthor,
    forwarded: message.forwarded,
    forwardedAuthorName: message.forwardedAuthorName,
    id: message.id,
    readAt: message.readAt,
    replyTo: message.replyTo,
    sourceChannel: message.sourceChannel,
    sourceGroup: message.sourceGroup,
    text: message.text,
    time: message.time,
  }
}

function materializeGroup(group: PersistedGroup): Omit<PersistedGroup, 'ownerIdentifier'> {
  const fallbackParticipants =
    initialGroups.find((seedGroup) => seedGroup.id === group.id)?.participants ?? []

  return {
    accent: group.accent,
    avatarImage: group.avatarImage,
    commentBlacklistIdentifiers: sanitizeIdentifierList(group.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(group.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(group.commentsEnabledForPremium),
    creatorIdentifier: group.creatorIdentifier ?? group.ownerIdentifier,
    handle: group.handle,
    id: group.id,
    isTestEntity: group.isTestEntity,
    members: group.members,
    muted: Boolean(group.muted),
    participants: (group.participants ?? fallbackParticipants).map((participant) => ({
      ...participant,
      identifier: participant.identifier ? normalizeIdentifier(participant.identifier) : undefined,
      nickname: normalizeNickname(participant.nickname ?? ''),
    })),
    preview: group.preview,
    sharedId: group.sharedId ?? `${group.ownerIdentifier}:${group.id}`,
    time: group.time,
    title: group.title,
    unread: group.unread,
  }
}

function materializeGroupMessage(
  message: PersistedGroupMessage,
): Omit<PersistedGroupMessage, 'groupId' | 'ownerIdentifier'> {
  return {
    attachment: message.attachment,
    author: message.author,
    createdAt: message.createdAt,
    deliveryId: message.deliveryId,
    displayAuthor: message.displayAuthor,
    forwarded: message.forwarded,
    forwardedAuthorName: message.forwardedAuthorName,
    groupParticipantId: message.groupParticipantId,
    id: message.id,
    readAt: message.readAt,
    replyTo: message.replyTo,
    sourceChannel: message.sourceChannel,
    sourceGroup: message.sourceGroup,
    text: message.text,
    threadComments: compactThreadComments(message.threadComments),
    threadId: message.threadId?.trim() || undefined,
    time: message.time,
  }
}

function getMessageReadReceiptKey(
  message: Pick<
    Message,
    | 'attachment'
    | 'createdAt'
    | 'deliveryId'
    | 'forwarded'
    | 'forwardedAuthorName'
    | 'replyTo'
    | 'sourceChannel'
    | 'sourceGroup'
    | 'text'
    | 'time'
  >,
) {
  if (message.deliveryId?.trim()) {
    return `delivery:${message.deliveryId.trim()}`
  }

  if (message.createdAt?.trim()) {
    return `created:${message.createdAt.trim()}`
  }

  return JSON.stringify({
    attachment: message.attachment?.fileName ?? '',
    forwarded: Boolean(message.forwarded),
    forwardedAuthorName: message.forwardedAuthorName ?? '',
    replyAuthor: message.replyTo?.author ?? '',
    replyId: message.replyTo?.id ?? 0,
    replyText: message.replyTo?.text ?? '',
    sourceChannelTitle: message.sourceChannel?.title ?? '',
    sourceGroupTitle: message.sourceGroup?.title ?? '',
    text: message.text,
    time: message.time,
  })
}

function materializeManagedChannel(
  channel: PersistedManagedChannel,
): Omit<PersistedManagedChannel, 'ownerIdentifier'> {
  return {
    avatarImage: channel.avatarImage,
    avatarTone: channel.avatarTone,
    commentBlacklistIdentifiers: sanitizeIdentifierList(channel.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(channel.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(channel.commentsEnabledForPremium),
    description: channel.description,
    directLink: sanitizeChannelDirectLink(channel.directLink) || '@kanal',
    id: channel.id,
    status: channel.status,
    title: channel.title,
    visibility: channel.visibility,
  }
}

function materializeSubscriptionChannel(
  channel: PersistedSubscriptionChannel,
): Omit<PersistedSubscriptionChannel, 'ownerIdentifier'> {
  return {
    accent: channel.accent,
    avatarImage: channel.avatarImage,
    commentBlacklistIdentifiers: sanitizeIdentifierList(channel.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(channel.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(channel.commentsEnabledForPremium),
    draft: channel.draft,
    handle: channel.handle,
    id: channel.id,
    isTestEntity: channel.isTestEntity,
    muted: Boolean(channel.muted),
    preview: channel.preview,
    participants:
      channel.participants?.map((participant) => ({
        ...participant,
        identifier: participant.identifier ? normalizeIdentifier(participant.identifier) : undefined,
        nickname: normalizeNickname(participant.nickname ?? ''),
      })) ?? [],
    readers: channel.readers ?? 0,
    time: channel.time,
    title: channel.title,
    unread: channel.unread,
    visibility: channel.visibility,
  }
}

function materializeSubscriptionPost(
  post: PersistedSubscriptionPost,
): Omit<PersistedSubscriptionPost, 'channelId' | 'ownerIdentifier'> {
  return {
    attachment: post.attachment,
    id: post.id,
    replyTo: post.replyTo,
    text: post.text,
    threadComments: compactThreadComments(post.threadComments),
    threadId: post.threadId?.trim() || undefined,
    time: post.time,
  }
}

function normalizeChats(ownerIdentifier: string, chats: Chat[]) {
  return {
    dialogMessages: chats.flatMap((chat) =>
      chat.messages.map((message) => toPersistedDialogMessage(ownerIdentifier, chat.id, message)),
    ),
    dialogs: chats.map((chat) => toPersistedDialog(ownerIdentifier, chat)),
  }
}

function normalizeGroups(ownerIdentifier: string, groups: GroupPreview[]) {
  return {
    groupMessages: groups.flatMap((group) =>
      group.messages.map((message) => toPersistedGroupMessage(ownerIdentifier, group.id, message)),
    ),
    groups: groups.map((group) => toPersistedGroup(ownerIdentifier, group)),
  }
}

function normalizeManagedChannels(ownerIdentifier: string, channels: Channel[]) {
  return channels.map((channel) => toPersistedManagedChannel(ownerIdentifier, channel))
}

function normalizeSubscriptionChannels(ownerIdentifier: string, channels: SubscriptionChannel[]) {
  return {
    subscriptionChannels: channels.map((channel) =>
      toPersistedSubscriptionChannel(ownerIdentifier, channel),
    ),
    subscriptionPosts: channels.flatMap((channel) =>
      channel.posts.map((post) =>
        toPersistedSubscriptionPost(ownerIdentifier, channel.id, post),
      ),
    ),
  }
}

function isLegacyDatabase(
  value: Partial<Database | LegacyDatabase>,
): value is LegacyDatabase {
  return Array.isArray(value.accounts) && value.accounts.some((account) => 'state' in account)
}

function migrateLegacyDatabase(value: LegacyDatabase): Database {
  const nextDatabase = createDefaultDatabase()
  nextDatabase.authChallenges = value.authChallenges ?? []
  nextDatabase.contactReports = []
  nextDatabase.sessions = value.sessions ?? []
  nextDatabase.subscriptionChannelReports = []
  nextDatabase.threadStates = []

  for (const legacyAccount of value.accounts ?? []) {
    nextDatabase.accounts.push({
      avatarImage: legacyAccount.avatarImage?.trim() || undefined,
      blockedContactIds: legacyAccount.blockedContactIds ?? [],
      createdAt: legacyAccount.createdAt,
      displayName: legacyAccount.displayName,
      identifier: legacyAccount.identifier,
      isTestEntity: legacyAccount.isTestEntity,
      nickname: legacyAccount.nickname ?? '',
      premium: legacyAccount.premium ?? true,
      premiumExpiresAt: legacyAccount.premiumExpiresAt ?? makePremiumExpiry(30),
      status: legacyAccount.status ?? '',
      surname: legacyAccount.surname ?? '',
    })

    const chats = normalizeChats(legacyAccount.identifier, legacyAccount.state.chats)
    const groups = normalizeGroups(legacyAccount.identifier, legacyAccount.state.groups)
    const managedChannels = normalizeManagedChannels(
      legacyAccount.identifier,
      legacyAccount.state.channels,
    )
    const subscriptionChannels = normalizeSubscriptionChannels(
      legacyAccount.identifier,
      legacyAccount.state.subscriptionChannels,
    )

    nextDatabase.dialogs.push(...chats.dialogs)
    nextDatabase.dialogMessages.push(...chats.dialogMessages)
    nextDatabase.groups.push(...groups.groups)
    nextDatabase.groupMessages.push(...groups.groupMessages)
    nextDatabase.managedChannels.push(...managedChannels)
    nextDatabase.subscriptionChannels.push(...subscriptionChannels.subscriptionChannels)
    nextDatabase.subscriptionPosts.push(...subscriptionChannels.subscriptionPosts)
  }

  return nextDatabase
}

function materializeChats(database: Database, ownerIdentifier: string): Chat[] {
  return database.dialogs
    .filter((dialog) => dialog.ownerIdentifier === ownerIdentifier)
    .map((dialog) => ({
      ...materializeDialog(dialog),
      messages: database.dialogMessages
        .filter(
          (message) =>
            message.ownerIdentifier === ownerIdentifier && message.dialogId === dialog.id,
        )
        .map((message) => materializeDialogMessage(message)),
    }))
}

function materializeGroups(database: Database, ownerIdentifier: string): GroupPreview[] {
  return database.groups
    .filter((group) => group.ownerIdentifier === ownerIdentifier)
    .map((group) => {
      const materializedGroup = materializeGroup(group)
      const messages = database.groupMessages
        .filter(
          (message) => message.ownerIdentifier === ownerIdentifier && message.groupId === group.id,
        )
        .map((message) => {
          const materializedMessage = materializeGroupMessage(message)
          return {
            ...materializedMessage,
            threadComments: materializedMessage.threadComments ?? [],
            threadId: getGroupMessageThreadId(group, materializedMessage),
          }
        })

      return {
        ...materializedGroup,
        latestActivityAt: messages.at(-1)?.createdAt,
        messages,
      }
    })
}

function materializeManagedChannels(database: Database, ownerIdentifier: string): Channel[] {
  return database.managedChannels
    .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
    .map((channel) => materializeManagedChannel(channel))
}

function materializeSubscriptionParticipants(
  database: Database,
  ownerIdentifier: string,
  channel: PersistedSubscriptionChannel,
) {
  const explicitParticipants = channel.participants ?? []
  if (explicitParticipants.length > 0) {
    return explicitParticipants.map((participant) => ({
      ...participant,
      identifier: participant.identifier ? normalizeIdentifier(participant.identifier) : undefined,
      nickname: normalizeNickname(participant.nickname ?? ''),
    }))
  }

  const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
  const matchingOwners = new Set(
    database.subscriptionChannels
      .filter(
        (candidate) =>
          (sanitizeChannelDirectLink(candidate.handle) || candidate.handle) === normalizedHandle,
      )
      .map((candidate) => candidate.ownerIdentifier),
  )
  const fallbackOwnerAccount = database.accounts.find((account) => account.identifier === ownerIdentifier)
  if (matchingOwners.size === 0 && fallbackOwnerAccount) {
    matchingOwners.add(fallbackOwnerAccount.identifier)
  }

  return database.accounts
    .filter((account) => matchingOwners.has(account.identifier))
    .map((account) => {
      const matchingDialog = database.dialogs.find(
        (dialog) =>
          dialog.ownerIdentifier === ownerIdentifier &&
          normalizeIdentifier(dialog.phone) === account.identifier,
      )

      return {
        accent: pickAccentForIdentifier(account.identifier),
        favorite: Boolean(matchingDialog?.pinned),
        id: getStableParticipantId(account.identifier),
        identifier: account.identifier,
        nickname: normalizeNickname(account.nickname ?? ''),
        online: database.sessions.some((session) => session.identifier === account.identifier),
        premium: hasActivePremium(account.premium, account.premiumExpiresAt),
        status: account.status?.trim() || 'в сети',
        title: formatAccountName(account) || account.identifier,
      } satisfies GroupParticipant
    })
}

function materializeSubscriptionChannels(
  database: Database,
  ownerIdentifier: string,
): SubscriptionChannel[] {
  return database.subscriptionChannels
    .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
    .map((channel) => {
      const materializedChannel = materializeSubscriptionChannel(channel)
      const posts = database.subscriptionPosts
        .filter(
          (post) => post.ownerIdentifier === ownerIdentifier && post.channelId === channel.id,
        )
        .map((post) => {
          const materializedPost = materializeSubscriptionPost(post)
          return {
            ...materializedPost,
            threadComments: materializedPost.threadComments ?? [],
            threadId: getSubscriptionPostThreadId(channel, materializedPost),
          }
        })

      return {
        ...materializedChannel,
        latestActivityAt: posts.at(-1)?.createdAt,
        participants: materializeSubscriptionParticipants(database, ownerIdentifier, channel),
        posts,
      }
    })
}

function compareIsoDateDesc(left?: string, right?: string) {
  const leftValue = left ? Date.parse(left) : Number.NEGATIVE_INFINITY
  const rightValue = right ? Date.parse(right) : Number.NEGATIVE_INFINITY
  return rightValue - leftValue
}

function findLatestThreadCommentCreatedAt(comments: ThreadComment[]) {
  let latestCreatedAt: string | undefined

  for (const comment of comments) {
    if (!comment.createdAt) continue
    if (!latestCreatedAt || Date.parse(comment.createdAt) > Date.parse(latestCreatedAt)) {
      latestCreatedAt = comment.createdAt
    }
  }

  return latestCreatedAt
}

function findLatestOwnThreadCommentCreatedAt(comments: ThreadComment[], ownerIdentifier: string) {
  let latestCreatedAt: string | undefined

  for (const comment of comments) {
    if (!comment.createdAt) continue
    if (normalizeIdentifier(comment.authorIdentifier ?? '') !== ownerIdentifier) continue
    if (!latestCreatedAt || Date.parse(comment.createdAt) > Date.parse(latestCreatedAt)) {
      latestCreatedAt = comment.createdAt
    }
  }

  return latestCreatedAt
}

function countUnreadThreadReplies(
  comments: ThreadComment[],
  ownerIdentifier: string,
  lastReadCommentCreatedAt?: string,
) {
  if (!lastReadCommentCreatedAt) return 0

  const lastReadAt = Date.parse(lastReadCommentCreatedAt)
  if (Number.isNaN(lastReadAt)) return 0

  return comments.reduce((count, comment) => {
    if (!comment.createdAt) return count
    if (normalizeIdentifier(comment.authorIdentifier ?? '') === ownerIdentifier) return count
    const createdAt = Date.parse(comment.createdAt)
    if (Number.isNaN(createdAt) || createdAt <= lastReadAt) return count
    return count + 1
  }, 0)
}

function buildThreadInbox(
  database: Database,
  ownerIdentifier: string,
): ThreadInboxItem[] {
  const threadStatesById = new Map(
    database.threadStates
      .filter((threadState) => threadState.ownerIdentifier === ownerIdentifier)
      .map((threadState) => [threadState.threadId, threadState] as const),
  )
  const itemsByThreadId = new Map<string, ThreadInboxItem>()

  function upsertThreadInboxItem(nextItem: ThreadInboxItem) {
    const existingItem = itemsByThreadId.get(nextItem.threadId)
    if (!existingItem) {
      itemsByThreadId.set(nextItem.threadId, nextItem)
      return
    }

    const existingActivityAt = Date.parse(existingItem.latestActivityAt ?? '') || 0
    const nextActivityAt = Date.parse(nextItem.latestActivityAt ?? '') || 0

    itemsByThreadId.set(
      nextItem.threadId,
      nextActivityAt >= existingActivityAt
        ? {
            ...nextItem,
            unreadCount: Math.max(existingItem.unreadCount, nextItem.unreadCount),
          }
        : {
            ...existingItem,
            unreadCount: Math.max(existingItem.unreadCount, nextItem.unreadCount),
          },
    )
  }

  for (const group of database.groups.filter((candidate) => candidate.ownerIdentifier === ownerIdentifier)) {
    for (const message of database.groupMessages.filter(
      (candidate) => candidate.ownerIdentifier === ownerIdentifier && candidate.groupId === group.id,
    )) {
      const threadId = getGroupMessageThreadId(group, message)
      const comments = compactThreadComments(message.threadComments)
      const threadState = threadStatesById.get(threadId)
      const hasParticipation = comments.some(
        (comment) => normalizeIdentifier(comment.authorIdentifier ?? '') === ownerIdentifier,
      )
      const isSubscribed =
        threadState?.subscription === 'subscribed' ||
        (hasParticipation && threadState?.subscription !== 'unsubscribed')

      if (!isSubscribed) continue

      const latestComment = comments.at(-1)
      const lastReadCommentCreatedAt =
        threadState?.lastReadCommentCreatedAt ??
        findLatestOwnThreadCommentCreatedAt(comments, ownerIdentifier)
      const unreadCount = countUnreadThreadReplies(comments, ownerIdentifier, lastReadCommentCreatedAt)

      upsertThreadInboxItem({
        commentCount: comments.length,
        groupAccent: group.accent,
        groupId: group.id,
        groupTitle: group.title,
        kind: 'group',
        latestActivityAt: latestComment?.createdAt ?? message.createdAt,
        latestCommentAuthor: latestComment?.displayAuthor,
        latestCommentText: latestComment?.text ?? 'Пока без комментариев',
        latestCommentTime: latestComment?.time ?? message.time,
        messageId: message.id,
        sourceText: message.text,
        sourceTime: message.time,
        subscribed: true,
        threadId,
        unreadCount,
      } satisfies GroupThreadInboxItem)
    }
  }

  for (const channel of database.subscriptionChannels.filter(
    (candidate) => candidate.ownerIdentifier === ownerIdentifier,
  )) {
    for (const post of database.subscriptionPosts.filter(
      (candidate) => candidate.ownerIdentifier === ownerIdentifier && candidate.channelId === channel.id,
    )) {
      const threadId = getSubscriptionPostThreadId(channel, post)
      const comments = compactThreadComments(post.threadComments)
      const threadState = threadStatesById.get(threadId)
      const hasParticipation = comments.some(
        (comment) => normalizeIdentifier(comment.authorIdentifier ?? '') === ownerIdentifier,
      )
      const isSubscribed =
        threadState?.subscription === 'subscribed' ||
        (hasParticipation && threadState?.subscription !== 'unsubscribed')

      if (!isSubscribed) continue

      const latestComment = comments.at(-1)
      const lastReadCommentCreatedAt =
        threadState?.lastReadCommentCreatedAt ??
        findLatestOwnThreadCommentCreatedAt(comments, ownerIdentifier)
      const unreadCount = countUnreadThreadReplies(comments, ownerIdentifier, lastReadCommentCreatedAt)

      upsertThreadInboxItem({
        channelAccent: channel.accent,
        channelId: channel.id,
        channelTitle: channel.title,
        commentCount: comments.length,
        kind: 'channel',
        latestActivityAt: latestComment?.createdAt ?? post.createdAt,
        latestCommentAuthor: latestComment?.displayAuthor,
        latestCommentText: latestComment?.text ?? 'Пока без комментариев',
        latestCommentTime: latestComment?.time ?? post.time,
        postId: post.id,
        sourceText: post.text,
        sourceTime: post.time,
        subscribed: true,
        threadId,
        unreadCount,
      } satisfies ChannelThreadInboxItem)
    }
  }

  return [...itemsByThreadId.values()].sort((left, right) =>
    compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt),
  )
}

export class TinychokStore {
  private readonly persistDatabase: PersistDatabaseFn
  private database: Database

  private constructor(database: Database, persistDatabase: PersistDatabaseFn) {
    this.database = database
    this.persistDatabase = persistDatabase
  }

  static create(database: Database, persistDatabase: PersistDatabaseFn) {
    return new TinychokStore(database, persistDatabase)
  }

  static async load(dataFilePath = DEFAULT_DATA_FILE) {
    const { database, needsPersistenceRewrite } = await loadDatabaseFromFile(dataFilePath)
    const store = new TinychokStore(database, async (nextDatabase) =>
      persistDatabaseToFile(dataFilePath, nextDatabase),
    )

    if (needsPersistenceRewrite) {
      await store.persist()
    }

    return store
  }

  async requestCode(identifier: string): Promise<RequestCodeResponse> {
    const normalizedIdentifier = normalizeIdentifier(identifier)

    if (!normalizedIdentifier || normalizedIdentifier.length < 12) {
      throw new Error('Проверь номер телефона.')
    }

    if (!isAllowedTestPhone(normalizedIdentifier)) {
      throw new Error(RESTRICTED_TEST_PHONE_MESSAGE)
    }

    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString()
    const existingAccount = this.findAccount(normalizedIdentifier)

    this.database.authChallenges = this.database.authChallenges
      .filter((challenge) => challenge.identifier !== normalizedIdentifier)
      .concat({
        code: DEMO_AUTH_CODE,
        expiresAt,
        identifier: normalizedIdentifier,
      })

    await this.persist()
    console.info(`[tinychok-server] demo code for ${normalizedIdentifier}: ${DEMO_AUTH_CODE}`)

    return {
      delivery: 'sms',
      existingAccount: existingAccount
        ? {
            displayName: existingAccount.displayName,
            surname: existingAccount.surname ?? '',
          }
        : null,
      expiresAt,
    }
  }

  async verifyCode(identifier: string, code: string): Promise<VerifyCodeResponse> {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!isAllowedTestPhone(normalizedIdentifier)) {
      throw new Error(RESTRICTED_TEST_PHONE_MESSAGE)
    }

    this.assertValidChallenge(normalizedIdentifier, code)

    if (this.isIdentifierBlockedByReports(normalizedIdentifier)) {
      throw new Error(CONTACT_REPORT_BLOCK_MESSAGE)
    }

    const existingAccount = this.findAccount(normalizedIdentifier)
    if (!existingAccount) {
      return {
        existingAccount: null,
        status: 'needs-profile',
      }
    }

    const token = await this.createSessionToken(normalizedIdentifier)
    this.clearChallenge(normalizedIdentifier)
    await this.persist()

    return {
      snapshot: this.buildSnapshot(existingAccount, token),
      status: 'authenticated',
    }
  }

  async registerAccount(payload: RegisterBody): Promise<AppSnapshot> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    if (!isAllowedTestPhone(normalizedIdentifier)) {
      throw new Error(RESTRICTED_TEST_PHONE_MESSAGE)
    }

    this.assertValidChallenge(normalizedIdentifier, payload.code)

    if (this.findAccount(normalizedIdentifier)) {
      throw new Error('Аккаунт уже существует. Попробуйте войти.')
    }

    const displayName = sanitizePersonField(payload.displayName, displayNameFieldMaxLength)
    if (!displayName) {
      throw new Error('Для регистрации нужен ник или имя.')
    }

    const nextAccount: Account = {
      avatarImage: undefined,
      blockedContactIds: [],
      createdAt: new Date().toISOString(),
      displayName,
      identifier: normalizedIdentifier,
      isTestEntity: false,
      nickname: '',
      premium: true,
      premiumExpiresAt: makePremiumExpiry(30),
      soundsDisabled: true,
      status: '',
      surname: '',
    }

    this.database.accounts.push(nextAccount)
    this.replaceOwnerState(normalizedIdentifier, createSeedState())
    const token = await this.createSessionToken(normalizedIdentifier)
    this.clearChallenge(normalizedIdentifier)
    await this.persist()

    return this.buildSnapshot(nextAccount, token)
  }

  getSnapshotByToken(token: string) {
    const account = this.findAccountByToken(token)
    return account ? this.buildSnapshot(account, token) : null
  }

  getIdentifierByToken(token: string) {
    return this.database.sessions.find((session) => session.token === token)?.identifier ?? null
  }

  listTokensByIdentifier(identifier: string) {
    return this.database.sessions
      .filter((session) => session.identifier === identifier)
      .map((session) => session.token)
  }

  searchAccounts(token: string, query: string) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return [] as SearchResult[]
    }

    const normalizedIdentifierQuery = normalizeIdentifier(trimmedQuery)
    const normalizedDigitsQuery = trimmedQuery.replace(/[^\d]/g, '')
    const normalizedQuery = trimmedQuery.toLowerCase()
    const existingDialogPhones = new Set(
      this.database.dialogs
        .filter((dialog) => dialog.ownerIdentifier === account.identifier)
        .map((dialog) => normalizeIdentifier(dialog.phone)),
    )

    return this.database.accounts
      .filter((candidate) => candidate.identifier !== account.identifier)
      .filter((candidate) => {
        const candidateDigits = candidate.identifier.replace(/[^\d]/g, '')
        const displayName = formatAccountName(candidate).toLowerCase()
        const handle = buildAccountHandle(candidate).toLowerCase()

        return (
          (normalizedDigitsQuery !== '' && candidateDigits.includes(normalizedDigitsQuery)) ||
          displayName.includes(normalizedQuery) ||
          handle.includes(normalizedQuery)
        )
      })
      .filter((candidate) => !existingDialogPhones.has(candidate.identifier))
      .sort((left, right) => {
        const leftExactPhone = normalizedIdentifierQuery !== '' && left.identifier === normalizedIdentifierQuery
        const rightExactPhone = normalizedIdentifierQuery !== '' && right.identifier === normalizedIdentifierQuery
        if (leftExactPhone !== rightExactPhone) {
          return leftExactPhone ? -1 : 1
        }

        const leftHandle = buildAccountHandle(left).toLowerCase()
        const rightHandle = buildAccountHandle(right).toLowerCase()
        const leftExactHandle = leftHandle === normalizedQuery
        const rightExactHandle = rightHandle === normalizedQuery
        if (leftExactHandle !== rightExactHandle) {
          return leftExactHandle ? -1 : 1
        }

        return formatAccountName(left).localeCompare(formatAccountName(right), 'ru')
      })
      .slice(0, 20)
      .map((candidate, index) => ({
        accent: pickAccentForIdentifier(candidate.identifier),
        handle: buildAccountHandle(candidate),
        id: index + 1,
        phone: candidate.identifier,
        subtitle: buildSearchSubtitle(candidate),
        title: formatAccountName(candidate) || candidate.identifier,
      }))
  }

  async saveSnapshot(token: string, snapshot: AppSnapshot) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const previousAvatarImage = account.avatarImage

    account.displayName = sanitizePersonField(snapshot.session.displayName, displayNameFieldMaxLength)
    account.surname = sanitizePersonField(snapshot.session.surname ?? '', surnameFieldMaxLength)
    account.nickname = normalizeNickname(snapshot.session.nickname ?? '')
    account.status = sanitizeStatusField(snapshot.session.status ?? '')
    account.avatarImage = snapshot.session.avatarImage?.trim() || undefined
    account.blockedContactIds = [...(snapshot.session.blockedContactIds ?? [])]
    account.premium = snapshot.session.premium ?? true
    account.premiumExpiresAt = snapshot.session.premiumExpiresAt ?? account.premiumExpiresAt

    this.replaceOwnerState(account.identifier, {
      channels: snapshot.channels,
      chats: snapshot.chats,
      groups: snapshot.groups,
      subscriptionChannels: snapshot.subscriptionChannels,
    })

    await this.persist()

    if (previousAvatarImage && previousAvatarImage !== account.avatarImage) {
      try {
        await deleteStoredMediaByUrl(previousAvatarImage, 'profile-avatar')
      } catch (error) {
        console.error('Failed to delete replaced profile avatar', error)
      }
    }

    return this.buildSnapshot(account, token)
  }

  async updateSession(token: string, payload: UpdateSessionBody): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const previousAvatarImage = account.avatarImage

    if (payload.displayName !== undefined) {
      const nextDisplayName = sanitizePersonField(payload.displayName, displayNameFieldMaxLength)
      if (!nextDisplayName) {
        throw new Error('Имя не может быть пустым.')
      }
      account.displayName = nextDisplayName
    }

    if (payload.surname !== undefined) {
      account.surname = sanitizePersonField(payload.surname, surnameFieldMaxLength)
    }

    if (payload.nickname !== undefined) {
      account.nickname = normalizeNickname(payload.nickname)
    }

    if (payload.status !== undefined) {
      account.status = sanitizeStatusField(payload.status)
    }

    if (payload.avatarImage !== undefined) {
      account.avatarImage = payload.avatarImage.trim() || undefined
    }

    if (payload.soundsDisabled !== undefined) {
      account.soundsDisabled = Boolean(payload.soundsDisabled)
    }

    if (payload.blockedContactIds !== undefined) {
      account.blockedContactIds = [...new Set(
        payload.blockedContactIds.filter((id) => Number.isInteger(id) && id > 0),
      )]
    }

    const broadcastIdentifiers = this.refreshDialogsForAccount(account)
    broadcastIdentifiers.push(account.identifier)

    await this.persist()

    if (previousAvatarImage && previousAvatarImage !== account.avatarImage) {
      try {
        await deleteStoredMediaByUrl(previousAvatarImage, 'profile-avatar')
      } catch (error) {
        console.error('Failed to delete replaced profile avatar', error)
      }
    }

    return {
      broadcastIdentifiers: [...new Set(broadcastIdentifiers)],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async openDirectDialog(token: string, payload: OpenDirectDialogBody): Promise<OpenDirectDialogResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    if (!normalizedIdentifier) {
      throw new Error('Нужно указать номер контакта.')
    }

    if (normalizedIdentifier === account.identifier) {
      throw new Error('Нельзя открыть чат с самим собой.')
    }

    const contactAccount = this.findAccount(normalizedIdentifier)
    if (!contactAccount) {
      throw new Error('Аккаунт не найден.')
    }

    const dialog = this.ensureDialogForContact(account.identifier, contactAccount)
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      dialogId: dialog.id,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendDirectMessage(
    token: string,
    dialogId: number,
    payload: SendDirectMessageBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const text = sanitizeMessageText(payload.text)
    const attachment = sanitizeMessageAttachment(payload.attachment)
    const sourceChannel = sanitizeSourceChannel(payload.sourceChannel)
    const sourceGroup = sanitizeSourceGroup(payload.sourceGroup)
    if (!text && !attachment && !sourceChannel && !sourceGroup) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }

    const senderReplyTo = sanitizeReplyTarget(payload.replyTo)
    const forwardedAuthorName = sanitizeForwardedAuthorName(payload.forwardedAuthorName)
    const createdAt = new Date().toISOString()
    const deliveryId = this.resolveDeliveryId(payload.clientDeliveryId)
    const time = formatNowTime()
    const recipientIdentifier = normalizeIdentifier(dialog.phone)
    const recipientAccount =
      recipientIdentifier && recipientIdentifier !== account.identifier
        ? this.findAccount(recipientIdentifier)
        : null

    if (recipientAccount) {
      this.clearSeededDialogHistoryIfNeeded(dialog)
      this.syncDialogContactProfile(dialog, recipientAccount)
    }

    this.database.dialogMessages.push({
      attachment,
      author: 'me',
      dialogId: dialog.id,
      forwarded: payload.forwarded,
      forwardedAuthorName,
      id: this.getNextDialogMessageId(account.identifier, dialog.id),
      ownerIdentifier: account.identifier,
      replyTo: senderReplyTo,
      sourceChannel,
      sourceGroup,
      text,
      createdAt,
      deliveryId,
      time,
    })

    dialog.typing = false
    dialog.unread = payload.markAsRead === false ? dialog.unread : 0
    dialog.status = 'только что был(а) здесь'

    const broadcastIdentifiers = [account.identifier]

    if (recipientAccount) {
      const recipientDialog = this.ensureDialogForContact(recipientAccount.identifier, account)
      const recipientReplyTo: Message['replyTo'] = senderReplyTo
        ? {
            author: invertMessageAuthor(senderReplyTo.author),
            id: senderReplyTo.id,
            text: senderReplyTo.text,
          }
        : undefined

      // Messages carry only attachment metadata and a stable media URL.
      // The file itself is already stored by the dedicated media upload endpoint.
      this.database.dialogMessages.push({
        attachment,
        author: 'them',
        dialogId: recipientDialog.id,
        forwarded: payload.forwarded,
        forwardedAuthorName,
        id: this.getNextDialogMessageId(recipientAccount.identifier, recipientDialog.id),
        ownerIdentifier: recipientAccount.identifier,
        replyTo: recipientReplyTo,
        sourceChannel,
        sourceGroup,
        text,
        createdAt,
        deliveryId,
        time,
      })

      recipientDialog.typing = false
      recipientDialog.unread = recipientDialog.muted ? 0 : recipientDialog.unread + 1
      this.syncDialogContactProfile(recipientDialog, account)
      broadcastIdentifiers.push(recipientAccount.identifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(broadcastIdentifiers)],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async setDialogFavorite(
    token: string,
    dialogId: number,
    payload: SetDialogFavoriteBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    dialog.pinned = payload.pinned
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async reportContact(
    token: string,
    dialogId: number,
    payload: ReportContactBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const targetIdentifier = normalizeIdentifier(dialog.phone)
    if (!targetIdentifier || targetIdentifier === account.identifier) {
      throw new Error('Некорректный контакт для жалобы.')
    }

    const reason = sanitizeComplaintReason(payload.reason)
    const existingReport = this.database.contactReports.find(
      (report) =>
        report.reporterIdentifier === account.identifier &&
        report.targetIdentifier === targetIdentifier,
    )

    if (existingReport) {
      existingReport.createdAt = new Date().toISOString()
      existingReport.reason = reason
    } else {
      this.database.contactReports.push({
        createdAt: new Date().toISOString(),
        reason,
        reporterIdentifier: account.identifier,
        targetIdentifier,
      })
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async updateDialog(
    token: string,
    dialogId: number,
    payload: UpdateDialogBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    if (payload.muted !== undefined) {
      dialog.muted = Boolean(payload.muted)
      if (dialog.muted) {
        dialog.unread = 0
      }
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async setDialogPinnedMessage(
    token: string,
    dialogId: number,
    payload: SetDialogPinnedMessageBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    if (payload.messageId === null) {
      dialog.pinnedMessageId = undefined
    } else {
      const hasMessage = this.database.dialogMessages.some(
        (message) =>
          message.ownerIdentifier === account.identifier &&
          message.dialogId === dialogId &&
          message.id === payload.messageId,
      )

      if (!hasMessage) {
        throw new Error('Сообщение не найдено.')
      }

      dialog.pinnedMessageId = payload.messageId
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteDialogMessage(
    token: string,
    dialogId: number,
    messageId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const beforeCount = this.database.dialogMessages.length
    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) =>
        !(
          message.ownerIdentifier === account.identifier &&
          message.dialogId === dialogId &&
          message.id === messageId
        ),
    )

    if (this.database.dialogMessages.length === beforeCount) {
      throw new Error('Сообщение не найдено.')
    }

    if (dialog.pinnedMessageId === messageId) {
      dialog.pinnedMessageId = undefined
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteDialogHistory(token: string, dialogId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) => !(message.ownerIdentifier === account.identifier && message.dialogId === dialogId),
    )
    dialog.pinnedMessageId = undefined
    dialog.typing = false
    dialog.unread = 0

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteDialog(token: string, dialogId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const hasDialog = this.database.dialogs.some(
      (dialog) => dialog.ownerIdentifier === account.identifier && dialog.id === dialogId,
    )
    if (!hasDialog) {
      throw new Error('Диалог не найден.')
    }

    this.database.dialogs = this.database.dialogs.filter(
      (dialog) => !(dialog.ownerIdentifier === account.identifier && dialog.id === dialogId),
    )
    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) => !(message.ownerIdentifier === account.identifier && message.dialogId === dialogId),
    )
    account.blockedContactIds = (account.blockedContactIds ?? []).filter((id) => id !== dialogId)

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendGroupMessage(
    token: string,
    groupId: number,
    payload: SendGroupMessageBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    this.assertNotBlacklistedFromGroup(group, account.identifier)

    const text = sanitizeMessageText(payload.text)
    const attachment = sanitizeMessageAttachment(payload.attachment)
    const forwardedAuthorName = sanitizeForwardedAuthorName(payload.forwardedAuthorName)
    const sourceChannel = sanitizeSourceChannel(payload.sourceChannel)
    const replyTo = sanitizeReplyTarget(payload.replyTo)
    if (!text && !attachment) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }

    const createdAt = new Date().toISOString()
    const deliveryId = this.resolveDeliveryId(payload.clientDeliveryId)
    const time = formatNowTime()
    const sharedId = this.getSharedGroupId(group)
    const senderParticipant = group.participants.find(
      (participant) => normalizeIdentifier(participant.identifier ?? '') === account.identifier,
    ) ?? this.buildGroupParticipant(account)
    const groupCopies = this.listGroupCopies(sharedId)

    for (const groupCopy of groupCopies) {
      this.database.groupMessages.push({
        attachment,
        author: groupCopy.ownerIdentifier === account.identifier ? 'me' : 'them',
        createdAt,
        deliveryId,
        displayAuthor:
          groupCopy.ownerIdentifier === account.identifier ? undefined : senderParticipant.title,
        forwarded: payload.forwarded,
        forwardedAuthorName,
        groupId: groupCopy.id,
        groupParticipantId:
          groupCopy.ownerIdentifier === account.identifier ? undefined : senderParticipant.id,
        id: this.getNextGroupMessageId(groupCopy.ownerIdentifier, groupCopy.id),
        ownerIdentifier: groupCopy.ownerIdentifier,
        replyTo,
        sourceChannel,
        text,
        threadComments: [],
        threadId: getGroupMessageThreadId(groupCopy, { createdAt, deliveryId, id: 0, text, time }),
        time,
      })

      groupCopy.preview = text || (attachment ? `Файл: ${attachment.fileName}` : groupCopy.preview)
      groupCopy.time = time
      groupCopy.unread =
        groupCopy.ownerIdentifier === account.identifier || groupCopy.muted
          ? 0
          : groupCopy.unread + 1
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(groupCopies.map((groupCopy) => groupCopy.ownerIdentifier))],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendGroupThreadComment(
    token: string,
    groupId: number,
    messageId: number,
    payload: SendGroupThreadCommentBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getGroupMessageById(account.identifier, groupId, messageId)
    if (!target) {
      throw new Error('Сообщение группы не найдено.')
    }

    this.assertCanCommentInGroup(target.group, account)

    const text = sanitizeThreadCommentText(payload.text)
    if (!text) {
      throw new Error('Комментарий не может быть пустым.')
    }
    const replyTo = sanitizeReplyTarget(payload.replyTo)
    const deliveryId = this.resolveDeliveryId(payload.clientDeliveryId)

    const sharedId = this.getSharedGroupId(target.group)
    const threadId = getGroupMessageThreadId(target.group, target.message)
    const broadcastIdentifiers = this.assignCommentToGroupThread(
      sharedId,
      threadId,
      account,
      text,
      replyTo,
      deliveryId,
    )
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: new Date().toISOString(),
      subscription: 'subscribed',
    })

    await this.persist()

    return {
      broadcastIdentifiers,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteGroupThreadComment(
    token: string,
    groupId: number,
    messageId: number,
    commentId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getGroupMessageById(account.identifier, groupId, messageId)
    if (!target) {
      throw new Error('Сообщение группы не найдено.')
    }

    const targetComment = (target.message.threadComments ?? []).find((comment) => comment.id === commentId)
    if (!targetComment) {
      throw new Error('Комментарий не найден.')
    }

    if (normalizeIdentifier(targetComment.authorIdentifier ?? '') !== account.identifier) {
      throw new Error('Можно удалить только свой комментарий.')
    }

    const sharedId = this.getSharedGroupId(target.group)
    const threadId = getGroupMessageThreadId(target.group, target.message)
    const broadcastIdentifiers = new Set<string>()
    const groupCopies = this.listGroupCopies(sharedId)

    for (const groupCopy of groupCopies) {
      const targetMessages = this.database.groupMessages.filter(
        (message) =>
          message.ownerIdentifier === groupCopy.ownerIdentifier &&
          message.groupId === groupCopy.id &&
          getGroupMessageThreadId(groupCopy, message) === threadId,
      )

      for (const targetMessage of targetMessages) {
        const currentComments = targetMessage.threadComments ?? []
        const nextComments = currentComments.filter((comment) => comment.id !== commentId)
        if (nextComments.length === currentComments.length) continue
        targetMessage.threadComments = nextComments
        broadcastIdentifiers.add(groupCopy.ownerIdentifier)
      }
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendManagedChannelPost(
    token: string,
    channelId: number,
    payload: SendManagedChannelPostBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findManagedChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const text = sanitizeMessageText(payload.text)
    if (!text) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }
    const replyTo = sanitizeReplyTarget(payload.replyTo)

    let channelCopies = this.listSubscriptionChannelCopiesByHandle(channel.directLink)

    if (channelCopies.length === 0) {
      const ownerCopy: PersistedSubscriptionChannel = {
        accent: channel.avatarTone,
        commentBlacklistIdentifiers: sanitizeIdentifierList(channel.commentBlacklistIdentifiers),
        commentsEnabledForAll: Boolean(channel.commentsEnabledForAll),
        commentsEnabledForPremium: Boolean(channel.commentsEnabledForPremium),
        draft: channel.status === 'draft',
        handle: channel.directLink,
        id: this.getNextOwnedId(this.database.subscriptionChannels, account.identifier),
        muted: false,
        ownerIdentifier: account.identifier,
        participants: [],
        preview: channel.description,
        readers: 0,
        time: '',
        title: channel.title,
        unread: 0,
        visibility: channel.visibility,
      }

      this.database.subscriptionChannels.push(ownerCopy)
      channelCopies = [ownerCopy]
    }

    const createdAt = new Date().toISOString()
    const time = formatNowTime()

    for (const channelCopy of channelCopies) {
      this.database.subscriptionPosts.push({
        channelId: channelCopy.id,
        createdAt,
        id: this.getNextSubscriptionPostId(channelCopy.ownerIdentifier, channelCopy.id),
        ownerIdentifier: channelCopy.ownerIdentifier,
        replyTo,
        text,
        threadComments: [],
        threadId: getSubscriptionPostThreadId(channelCopy, { createdAt, id: 0, text, time }),
        time,
      })

      channelCopy.preview = text
      channelCopy.time = time
      channelCopy.unread =
        channelCopy.ownerIdentifier === account.identifier || channelCopy.muted
          ? 0
          : channelCopy.unread + 1
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(channelCopies.map((channelCopy) => channelCopy.ownerIdentifier))],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteManagedChannelPost(
    token: string,
    channelId: number,
    postId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const managedChannel = this.findManagedChannel(account.identifier, channelId)
    if (!managedChannel) {
      throw new Error('Канал не найден.')
    }

    const ownerCopy = this.listSubscriptionChannelCopiesByHandle(managedChannel.directLink).find(
      (channel) => channel.ownerIdentifier === account.identifier,
    )
    if (!ownerCopy) {
      throw new Error('Пост не найден.')
    }

    const ownerPost = this.database.subscriptionPosts.find(
      (post) =>
        post.ownerIdentifier === account.identifier &&
        post.channelId === ownerCopy.id &&
        post.id === postId,
    )
    if (!ownerPost) {
      throw new Error('Пост не найден.')
    }

    const targetThreadId = getSubscriptionPostThreadId(ownerCopy, ownerPost)
    const broadcastIdentifiers = new Set<string>()
    const channelCopies = this.listSubscriptionChannelCopiesByHandle(managedChannel.directLink)

    for (const channelCopy of channelCopies) {
      const targetPosts = this.database.subscriptionPosts.filter(
        (post) =>
          post.ownerIdentifier === channelCopy.ownerIdentifier &&
          post.channelId === channelCopy.id &&
          getSubscriptionPostThreadId(channelCopy, post) === targetThreadId,
      )

      if (targetPosts.length === 0) {
        continue
      }

      this.database.subscriptionPosts = this.database.subscriptionPosts.filter(
        (post) =>
          !(
            post.ownerIdentifier === channelCopy.ownerIdentifier &&
            post.channelId === channelCopy.id &&
            getSubscriptionPostThreadId(channelCopy, post) === targetThreadId
          ),
      )

      const remainingChannelPosts = this.database.subscriptionPosts
        .filter(
          (post) => post.ownerIdentifier === channelCopy.ownerIdentifier && post.channelId === channelCopy.id,
        )
        .sort(
          (left, right) => Date.parse(left.createdAt ?? '') - Date.parse(right.createdAt ?? ''),
        )
      const latestPost = remainingChannelPosts.at(-1)

      channelCopy.preview = latestPost?.text.trim() || managedChannel.description
      channelCopy.time = latestPost?.time ?? ''
      if (channelCopy.ownerIdentifier !== account.identifier && channelCopy.unread > 0) {
        channelCopy.unread = Math.max(0, channelCopy.unread - targetPosts.length)
      }
      broadcastIdentifiers.add(channelCopy.ownerIdentifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteGroupMessage(
    token: string,
    groupId: number,
    messageId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    const message = this.database.groupMessages.find(
      (candidate) =>
        candidate.ownerIdentifier === account.identifier &&
        candidate.groupId === groupId &&
        candidate.id === messageId,
    )

    if (!message) {
      throw new Error('Сообщение не найдено.')
    }

    if (message.author !== 'me') {
      throw new Error('Можно удалять только свои сообщения.')
    }

    const sharedId = this.getSharedGroupId(group)
    const groupCopies = this.listGroupCopies(sharedId)
    const groupCopyIds = new Set(groupCopies.map((groupCopy) => `${groupCopy.ownerIdentifier}:${groupCopy.id}`))
    const messageReceiptKey = getMessageReadReceiptKey(message)

    this.database.groupMessages = this.database.groupMessages.filter((candidate) => {
      if (!groupCopyIds.has(`${candidate.ownerIdentifier}:${candidate.groupId}`)) {
        return true
      }

      if (message.deliveryId?.trim()) {
        return candidate.deliveryId !== message.deliveryId
      }

      return getMessageReadReceiptKey(candidate) !== messageReceiptKey
    })

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(groupCopies.map((groupCopy) => groupCopy.ownerIdentifier))],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async updateGroup(
    token: string,
    groupId: number,
    payload: UpdateGroupBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    const previousAvatarImage = group.avatarImage
    const sharedId = this.getSharedGroupId(group)
    const groupCopies = this.listGroupCopies(sharedId)
    const broadcastIdentifiers = [...new Set(groupCopies.map((groupCopy) => groupCopy.ownerIdentifier))]

    if (payload.muted !== undefined) {
      group.muted = Boolean(payload.muted)
    }

    if (payload.title !== undefined) {
      const nextTitle = sanitizeGroupTitle(payload.title)
      if (!nextTitle) {
        throw new Error('Название группы не может быть пустым.')
      }

      for (const groupCopy of groupCopies) {
        groupCopy.title = nextTitle
      }
    }

    if (payload.avatarImage !== undefined) {
      const nextAvatarImage = payload.avatarImage.trim() || undefined

      for (const groupCopy of groupCopies) {
        groupCopy.avatarImage = nextAvatarImage
      }
    }

    if (payload.commentsEnabledForAll !== undefined) {
      for (const groupCopy of groupCopies) {
        groupCopy.commentsEnabledForAll = Boolean(payload.commentsEnabledForAll)
      }
    }

    if (payload.commentsEnabledForPremium !== undefined) {
      for (const groupCopy of groupCopies) {
        groupCopy.commentsEnabledForPremium = Boolean(payload.commentsEnabledForPremium)
      }
    }

    if (payload.commentBlacklistIdentifiers !== undefined) {
      const nextBlacklist = sanitizeIdentifierList(payload.commentBlacklistIdentifiers)
      for (const groupCopy of groupCopies) {
        groupCopy.commentBlacklistIdentifiers = nextBlacklist
      }
    }

    if (payload.creatorIdentifier !== undefined) {
      const nextCreatorIdentifier = normalizeIdentifier(payload.creatorIdentifier)
      const currentCreatorIdentifier = normalizeIdentifier(group.creatorIdentifier ?? group.ownerIdentifier)

      if (currentCreatorIdentifier !== account.identifier) {
        throw new Error('Только владелец группы может передать права.')
      }

      if (!nextCreatorIdentifier) {
        throw new Error('Новый владелец группы не найден.')
      }

      const creatorExistsInGroup = groupCopies.some((groupCopy) =>
        (groupCopy.participants ?? []).some(
          (participant) => normalizeIdentifier(participant.identifier ?? '') === nextCreatorIdentifier,
        ),
      )

      if (!creatorExistsInGroup) {
        throw new Error('Новый владелец должен состоять в группе.')
      }

      for (const groupCopy of groupCopies) {
        groupCopy.creatorIdentifier = nextCreatorIdentifier
      }
    }

    await this.persist()

    if (previousAvatarImage && previousAvatarImage !== group.avatarImage) {
      await deleteStoredMediaByUrl(previousAvatarImage, 'group-avatar')
    }

    return {
      broadcastIdentifiers,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async inviteGroupMember(
    token: string,
    groupId: number,
    payload: InviteGroupMemberBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    const dialog = this.findDialog(account.identifier, payload.dialogId)
    if (!dialog) {
      throw new Error('Контакт не найден.')
    }

    const recipientIdentifier = normalizeIdentifier(dialog.phone)
    if (!recipientIdentifier || recipientIdentifier === account.identifier) {
      throw new Error('Нельзя пригласить этого пользователя в группу.')
    }

    const recipientAccount = this.findAccount(recipientIdentifier)
    if (!recipientAccount) {
      throw new Error('Аккаунт контакта не найден.')
    }

    const recipientTitle = formatAccountName(recipientAccount) || recipientAccount.identifier
    const alreadyParticipant = group.participants.some(
      (participant) =>
        normalizeIdentifier(participant.identifier ?? '') === recipientIdentifier ||
        participant.title === recipientTitle,
    )
    if (alreadyParticipant) {
      throw new Error('Этот контакт уже состоит в группе.')
    }

    const creatorIdentifier = normalizeIdentifier(group.creatorIdentifier ?? group.ownerIdentifier)
    const creatorAccount = this.findAccount(creatorIdentifier) ?? account
    const memberLimit = getGroupMemberLimit(creatorAccount)
    const currentMemberCount = group.participants.length

    if (currentMemberCount >= memberLimit) {
      throw new Error(
        memberLimit === premiumGroupMemberLimit
          ? `Даже с премиумом владельца в группе может быть максимум ${premiumGroupMemberLimit} человек.`
          : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать больше людей, необходимо активировать премиум владельцу группы.`,
      )
    }

    const nextParticipants = group.participants
      .map((participant) => this.cloneGroupParticipant(participant))
      .concat(this.buildGroupParticipant(recipientAccount))
    const sharedId = this.getSharedGroupId(group)
    const existingGroupCopies = this.listGroupCopies(sharedId)

    this.ensureGroupCopyForOwner(group, recipientAccount.identifier, nextParticipants)
    this.syncGroupCopiesParticipants(sharedId, nextParticipants)

    const senderDialog = this.ensureDialogForContact(account.identifier, recipientAccount)
    const recipientDialog = this.ensureDialogForContact(recipientAccount.identifier, account)
    const createdAt = new Date().toISOString()
    const deliveryId = randomUUID()
    const time = formatNowTime()
    const sourceGroup = this.buildGroupInviteSource(group)

    this.database.dialogMessages.push({
      author: 'me',
      createdAt,
      deliveryId,
      dialogId: senderDialog.id,
      id: this.getNextDialogMessageId(account.identifier, senderDialog.id),
      ownerIdentifier: account.identifier,
      sourceGroup,
      text: '',
      time,
    })

    this.database.dialogMessages.push({
      author: 'them',
      createdAt,
      deliveryId,
      dialogId: recipientDialog.id,
      id: this.getNextDialogMessageId(recipientAccount.identifier, recipientDialog.id),
      ownerIdentifier: recipientAccount.identifier,
      sourceGroup,
      text: '',
      time,
    })

    senderDialog.typing = false
    senderDialog.unread = 0
    senderDialog.status = 'только что был(а) здесь'
    recipientDialog.typing = false
    recipientDialog.unread += 1
    this.syncDialogContactProfile(recipientDialog, account)

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(
        existingGroupCopies
          .map((groupCopy) => groupCopy.ownerIdentifier)
          .concat(account.identifier, recipientAccount.identifier),
      )],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async leaveGroup(token: string, groupId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    const sharedId = this.getSharedGroupId(group)
    const creatorIdentifier = normalizeIdentifier(group.creatorIdentifier ?? group.ownerIdentifier)
    const groupCopies = this.listGroupCopies(sharedId)

    if (creatorIdentifier === account.identifier) {
      const groupCopyKeys = new Set(groupCopies.map((groupCopy) => `${groupCopy.ownerIdentifier}:${groupCopy.id}`))
      const removedAvatarImage = group.avatarImage
      this.database.groups = this.database.groups.filter(
        (candidate) => this.getSharedGroupId(candidate) !== sharedId,
      )
      this.database.groupMessages = this.database.groupMessages.filter(
        (candidate) => !groupCopyKeys.has(`${candidate.ownerIdentifier}:${candidate.groupId}`),
      )

      await this.persist()

      if (removedAvatarImage) {
        await deleteStoredMediaByUrl(removedAvatarImage, 'group-avatar')
      }

      return {
        broadcastIdentifiers: [...new Set(groupCopies.map((groupCopy) => groupCopy.ownerIdentifier))],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    const nextParticipants = group.participants.filter(
      (participant) => normalizeIdentifier(participant.identifier ?? '') !== account.identifier,
    )
    const currentGroupCopyKeys = new Set(groupCopies.map((groupCopy) => `${groupCopy.ownerIdentifier}:${groupCopy.id}`))

    this.database.groups = this.database.groups.filter(
      (candidate) =>
        !(
          candidate.ownerIdentifier === account.identifier &&
          this.getSharedGroupId(candidate) === sharedId
        ),
    )
    this.database.groupMessages = this.database.groupMessages.filter(
      (candidate) => !(candidate.ownerIdentifier === account.identifier && currentGroupCopyKeys.has(`${candidate.ownerIdentifier}:${candidate.groupId}`)),
    )
    this.syncGroupCopiesParticipants(sharedId, nextParticipants)

    const remainingCopies = this.listGroupCopies(sharedId)
    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(
        remainingCopies.map((groupCopy) => groupCopy.ownerIdentifier).concat(account.identifier),
      )],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markDialogRead(token: string, dialogId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const readAt = new Date().toISOString()
    const justReadMessages = this.database.dialogMessages.filter(
      (message) =>
        message.ownerIdentifier === account.identifier &&
        message.dialogId === dialog.id &&
        message.author === 'them' &&
        !message.readAt,
    )

    for (const message of justReadMessages) {
      message.readAt = readAt
    }

    const broadcastIdentifiers = [account.identifier]
    const contactIdentifier = normalizeIdentifier(dialog.phone)

    if (contactIdentifier && contactIdentifier !== account.identifier && justReadMessages.length > 0) {
      const senderDialog = this.database.dialogs.find(
        (candidate) =>
          candidate.ownerIdentifier === contactIdentifier &&
          normalizeIdentifier(candidate.phone) === account.identifier,
      )

      if (senderDialog) {
        const justReadKeys = new Set(justReadMessages.map((message) => getMessageReadReceiptKey(message)))
        let senderMessagesUpdated = false

        for (const message of this.database.dialogMessages) {
          if (
            message.ownerIdentifier !== contactIdentifier ||
            message.dialogId !== senderDialog.id ||
            message.author !== 'me' ||
            message.readAt
          ) {
            continue
          }

          if (!justReadKeys.has(getMessageReadReceiptKey(message))) {
            continue
          }

          message.readAt = readAt
          senderMessagesUpdated = true
        }

        if (senderMessagesUpdated) {
          broadcastIdentifiers.push(contactIdentifier)
        }
      }
    }

    dialog.unread = 0
    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(broadcastIdentifiers)],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markGroupRead(token: string, groupId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    group.unread = 0
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markSubscriptionChannelRead(token: string, channelId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findSubscriptionChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    channel.unread = 0
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async subscribeToGroupThread(
    token: string,
    groupId: number,
    messageId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getGroupMessageById(account.identifier, groupId, messageId)
    if (!target) {
      throw new Error('Сообщение группы не найдено.')
    }

    const threadId = getGroupMessageThreadId(target.group, target.message)
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: findLatestThreadCommentCreatedAt(compactThreadComments(target.message.threadComments)),
      subscription: 'subscribed',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async unsubscribeFromGroupThread(
    token: string,
    groupId: number,
    messageId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getGroupMessageById(account.identifier, groupId, messageId)
    if (!target) {
      throw new Error('Сообщение группы не найдено.')
    }

    const threadId = getGroupMessageThreadId(target.group, target.message)
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: findLatestThreadCommentCreatedAt(compactThreadComments(target.message.threadComments)),
      subscription: 'unsubscribed',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markGroupThreadRead(
    token: string,
    groupId: number,
    messageId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getGroupMessageById(account.identifier, groupId, messageId)
    if (!target) {
      throw new Error('Сообщение группы не найдено.')
    }

    const threadId = getGroupMessageThreadId(target.group, target.message)
    const existingState = this.getThreadState(account.identifier, threadId)
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: findLatestThreadCommentCreatedAt(compactThreadComments(target.message.threadComments)),
      subscription: existingState?.subscription ?? 'implicit',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async updateSubscriptionChannel(
    token: string,
    channelId: number,
    payload: UpdateSubscriptionChannelBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findSubscriptionChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const channelCopies = this.listSubscriptionChannelCopiesByHandle(channel.handle)
    let broadcastIdentifiers = [account.identifier]

    if (payload.muted !== undefined) {
      channel.muted = Boolean(payload.muted)
      if (channel.muted) {
        channel.unread = 0
      }
    }

    if (payload.commentsEnabledForAll !== undefined) {
      for (const channelCopy of channelCopies) {
        channelCopy.commentsEnabledForAll = Boolean(payload.commentsEnabledForAll)
      }
      broadcastIdentifiers = [...new Set(channelCopies.map((channelCopy) => channelCopy.ownerIdentifier))]
    }

    if (payload.commentsEnabledForPremium !== undefined) {
      for (const channelCopy of channelCopies) {
        channelCopy.commentsEnabledForPremium = Boolean(payload.commentsEnabledForPremium)
      }
      broadcastIdentifiers = [...new Set(channelCopies.map((channelCopy) => channelCopy.ownerIdentifier))]
    }

    if (payload.commentBlacklistIdentifiers !== undefined) {
      const nextBlacklist = sanitizeIdentifierList(payload.commentBlacklistIdentifiers)
      for (const channelCopy of channelCopies) {
        channelCopy.commentBlacklistIdentifiers = nextBlacklist
      }
      broadcastIdentifiers = [...new Set(channelCopies.map((channelCopy) => channelCopy.ownerIdentifier))]
    }

    await this.persist()

    return {
      broadcastIdentifiers,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendSubscriptionChannelThreadComment(
    token: string,
    channelId: number,
    postId: number,
    payload: SendSubscriptionChannelThreadCommentBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getSubscriptionPostById(account.identifier, channelId, postId)
    if (!target) {
      throw new Error('Пост канала не найден.')
    }

    this.assertCanCommentInSubscriptionChannel(target.channel, account)

    const text = sanitizeThreadCommentText(payload.text)
    if (!text) {
      throw new Error('Комментарий не может быть пустым.')
    }
    const replyTo = sanitizeReplyTarget(payload.replyTo)
    const deliveryId = this.resolveDeliveryId(payload.clientDeliveryId)

    const normalizedHandle = sanitizeChannelDirectLink(target.channel.handle) || target.channel.handle
    const threadId = getSubscriptionPostThreadId(target.channel, target.post)
    const broadcastIdentifiers = this.assignCommentToSubscriptionThread(
      normalizedHandle,
      threadId,
      account,
      text,
      replyTo,
      deliveryId,
    )
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: new Date().toISOString(),
      subscription: 'subscribed',
    })

    await this.persist()

    return {
      broadcastIdentifiers,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async subscribeToSubscriptionChannelThread(
    token: string,
    channelId: number,
    postId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getSubscriptionPostById(account.identifier, channelId, postId)
    if (!target) {
      throw new Error('Пост канала не найден.')
    }

    const threadId = getSubscriptionPostThreadId(target.channel, target.post)
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: findLatestThreadCommentCreatedAt(compactThreadComments(target.post.threadComments)),
      subscription: 'subscribed',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async unsubscribeFromSubscriptionChannelThread(
    token: string,
    channelId: number,
    postId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getSubscriptionPostById(account.identifier, channelId, postId)
    if (!target) {
      throw new Error('Пост канала не найден.')
    }

    const threadId = getSubscriptionPostThreadId(target.channel, target.post)
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: findLatestThreadCommentCreatedAt(compactThreadComments(target.post.threadComments)),
      subscription: 'unsubscribed',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markSubscriptionChannelThreadRead(
    token: string,
    channelId: number,
    postId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getSubscriptionPostById(account.identifier, channelId, postId)
    if (!target) {
      throw new Error('Пост канала не найден.')
    }

    const threadId = getSubscriptionPostThreadId(target.channel, target.post)
    const existingState = this.getThreadState(account.identifier, threadId)
    this.upsertThreadState(account.identifier, threadId, {
      lastReadCommentCreatedAt: findLatestThreadCommentCreatedAt(compactThreadComments(target.post.threadComments)),
      subscription: existingState?.subscription ?? 'implicit',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteSubscriptionChannelThreadComment(
    token: string,
    channelId: number,
    postId: number,
    commentId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const target = this.getSubscriptionPostById(account.identifier, channelId, postId)
    if (!target) {
      throw new Error('Пост канала не найден.')
    }

    const targetComment = (target.post.threadComments ?? []).find((comment) => comment.id === commentId)
    if (!targetComment) {
      throw new Error('Комментарий не найден.')
    }

    if (normalizeIdentifier(targetComment.authorIdentifier ?? '') !== account.identifier) {
      throw new Error('Можно удалить только свой комментарий.')
    }

    const normalizedHandle = sanitizeChannelDirectLink(target.channel.handle) || target.channel.handle
    const threadId = getSubscriptionPostThreadId(target.channel, target.post)
    const broadcastIdentifiers = new Set<string>()
    const channelCopies = this.listSubscriptionChannelCopiesByHandle(normalizedHandle)

    for (const channelCopy of channelCopies) {
      const targetPosts = this.database.subscriptionPosts.filter(
        (post) =>
          post.ownerIdentifier === channelCopy.ownerIdentifier &&
          post.channelId === channelCopy.id &&
          getSubscriptionPostThreadId(channelCopy, post) === threadId,
      )

      for (const targetPost of targetPosts) {
        const currentComments = targetPost.threadComments ?? []
        const nextComments = currentComments.filter((comment) => comment.id !== commentId)
        if (nextComments.length === currentComments.length) continue
        targetPost.threadComments = nextComments
        broadcastIdentifiers.add(channelCopy.ownerIdentifier)
      }
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteSubscriptionChannel(
    token: string,
    channelId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const hasChannel = this.database.subscriptionChannels.some(
      (channel) => channel.ownerIdentifier === account.identifier && channel.id === channelId,
    )
    if (!hasChannel) {
      throw new Error('Канал не найден.')
    }

    this.database.subscriptionChannels = this.database.subscriptionChannels.filter(
      (channel) => !(channel.ownerIdentifier === account.identifier && channel.id === channelId),
    )
    this.database.subscriptionPosts = this.database.subscriptionPosts.filter(
      (post) => !(post.ownerIdentifier === account.identifier && post.channelId === channelId),
    )

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async reportSubscriptionChannel(
    token: string,
    channelId: number,
    payload: ReportSubscriptionChannelBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findSubscriptionChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const reason = sanitizeComplaintReason(payload.reason)
    const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
    const existingReport = this.database.subscriptionChannelReports.find(
      (report) =>
        report.reporterIdentifier === account.identifier && report.targetHandle === normalizedHandle,
    )

    if (existingReport) {
      existingReport.createdAt = new Date().toISOString()
      existingReport.reason = reason
    } else {
      this.database.subscriptionChannelReports.push({
        createdAt: new Date().toISOString(),
        reason,
        reporterIdentifier: account.identifier,
        targetHandle: normalizedHandle,
      })
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async createManagedChannel(
    token: string,
    payload: CreateManagedChannelBody,
  ): Promise<CreateChannelResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const ownedChannelCount = this.database.managedChannels.filter(
      (channel) => channel.ownerIdentifier === account.identifier,
    ).length
    if (ownedChannelCount >= managedChannelsPerUserLimit) {
      throw new Error(
        `Один пользователь может управлять только ${managedChannelsPerUserLimit} каналами.`,
      )
    }

    const channelId = this.getNextOwnedId(this.database.managedChannels, account.identifier)
    const channelNumber = ownedChannelCount + 1
    const title = sanitizeChannelTitle(payload.title) || `Новый канал ${channelNumber}`
    const directLink = ensureUniqueChannelDirectLink(
      sanitizeChannelDirectLink(payload.directLink) || buildChannelDirectLinkFromTitle(title),
      [
        ...this.database.managedChannels.map((channel) => channel.directLink),
        ...this.database.subscriptionChannels.map((channel) => channel.handle),
      ],
      title,
    )
    const description =
      sanitizeChannelDescription(payload.description) ||
      'Описание канала пока не заполнено. Здесь можно подготовить текст до публикации.'
    const visibility =
      payload.visibility === 'public' || payload.visibility === 'closed'
        ? payload.visibility
        : 'private'

    this.database.managedChannels.push({
      avatarImage: payload.avatarImage?.trim() || undefined,
      avatarTone: payload.avatarTone.trim() || pickAccentForIdentifier(`${account.identifier}${channelId}`),
      commentBlacklistIdentifiers: sanitizeIdentifierList(payload.commentBlacklistIdentifiers),
      commentsEnabledForAll: Boolean(payload.commentsEnabledForAll),
      commentsEnabledForPremium: Boolean(payload.commentsEnabledForPremium),
      description,
      directLink,
      id: channelId,
      ownerIdentifier: account.identifier,
      status: 'draft',
      title,
      visibility,
    })

    const createdChannel = this.findManagedChannel(account.identifier, channelId)
    if (createdChannel) {
      this.ensureSubscriptionChannelCopyForOwner(createdChannel, account.identifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      channelId,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async inviteManagedChannelMembers(
    token: string,
    channelId: number,
    payload: InviteManagedChannelMembersBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findManagedChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const uniqueDialogIds = Array.from(
      new Set(
        (payload.dialogIds ?? []).filter(
          (dialogId): dialogId is number => Number.isInteger(dialogId) && dialogId > 0,
        ),
      ),
    )

    if (uniqueDialogIds.length === 0) {
      throw new Error('Выберите хотя бы один контакт.')
    }

    const broadcastIdentifiers = new Set<string>([account.identifier])
    this.ensureSubscriptionChannelCopyForOwner(channel, account.identifier)

    for (const dialogId of uniqueDialogIds) {
      const dialog = this.database.dialogs.find(
        (candidate) => candidate.ownerIdentifier === account.identifier && candidate.id === dialogId,
      )
      if (!dialog) {
        continue
      }

      const recipientIdentifier = normalizeIdentifier(dialog.phone)
      if (!recipientIdentifier || recipientIdentifier === account.identifier) {
        continue
      }

      const recipientAccount = this.findAccount(recipientIdentifier)
      if (!recipientAccount) {
        continue
      }

      this.ensureSubscriptionChannelCopyForOwner(channel, recipientAccount.identifier)
      broadcastIdentifiers.add(recipientAccount.identifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async updateManagedChannel(
    token: string,
    channelId: number,
    payload: UpdateManagedChannelBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findManagedChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const previousAvatarImage = channel.avatarImage
    const previousDirectLink = channel.directLink

    if (payload.title !== undefined) {
      const nextTitle = sanitizeChannelTitle(payload.title)
      if (!nextTitle) {
        throw new Error('Название канала не может быть пустым.')
      }
      channel.title = nextTitle
    }

    if (payload.directLink !== undefined) {
      channel.directLink = ensureUniqueChannelDirectLink(
        sanitizeChannelDirectLink(payload.directLink) || channel.directLink,
        [
          ...this.database.managedChannels
            .filter((candidate) => candidate.id !== channel.id)
            .map((candidate) => candidate.directLink),
          ...this.database.subscriptionChannels
            .filter(
              (candidate) =>
                sanitizeChannelDirectLink(candidate.handle) !==
                sanitizeChannelDirectLink(channel.directLink),
            )
            .map((candidate) => candidate.handle),
        ],
        channel.title,
      )
    }

    if (payload.description !== undefined) {
      channel.description =
        sanitizeChannelDescription(payload.description) || channel.description
    }

    if (payload.visibility !== undefined) {
      channel.visibility =
        payload.visibility === 'public' || payload.visibility === 'closed'
          ? payload.visibility
          : 'private'
    }

    if (payload.avatarTone !== undefined && payload.avatarTone.trim()) {
      channel.avatarTone = payload.avatarTone.trim()
    }

    if (payload.avatarImage !== undefined) {
      channel.avatarImage = payload.avatarImage.trim() || undefined
    }

    if (payload.commentsEnabledForAll !== undefined) {
      channel.commentsEnabledForAll = Boolean(payload.commentsEnabledForAll)
    }

    if (payload.commentsEnabledForPremium !== undefined) {
      channel.commentsEnabledForPremium = Boolean(payload.commentsEnabledForPremium)
    }

    if (payload.commentBlacklistIdentifiers !== undefined) {
      channel.commentBlacklistIdentifiers = sanitizeIdentifierList(payload.commentBlacklistIdentifiers)
    }

    if (payload.status !== undefined) {
      channel.status = payload.status === 'active' ? 'active' : 'draft'
    }

    const subscriptionChannelCopies = [
      ...new Map(
        [previousDirectLink, channel.directLink]
          .map((handle) => sanitizeChannelDirectLink(handle) || handle)
          .flatMap((handle) =>
            handle
              ? this.listSubscriptionChannelCopiesByHandle(handle).map((copy) => [`${copy.ownerIdentifier}:${copy.id}`, copy] as const)
              : [],
          ),
      ).values(),
    ]

    for (const channelCopy of subscriptionChannelCopies) {
      channelCopy.accent = channel.avatarTone
      channelCopy.avatarImage = channel.avatarImage
      channelCopy.draft = channel.status === 'draft'
      channelCopy.handle = channel.directLink
      channelCopy.preview = channelCopy.preview || channel.description
      channelCopy.title = channel.title
      channelCopy.visibility = channel.visibility
    }

    if (payload.commentsEnabledForAll !== undefined) {
      for (const channelCopy of subscriptionChannelCopies) {
        channelCopy.commentsEnabledForAll = Boolean(payload.commentsEnabledForAll)
      }
    }

    if (payload.commentsEnabledForPremium !== undefined) {
      for (const channelCopy of subscriptionChannelCopies) {
        channelCopy.commentsEnabledForPremium = Boolean(payload.commentsEnabledForPremium)
      }
    }

    if (payload.commentBlacklistIdentifiers !== undefined) {
      const nextBlacklist = sanitizeIdentifierList(payload.commentBlacklistIdentifiers)
      for (const channelCopy of subscriptionChannelCopies) {
        channelCopy.commentBlacklistIdentifiers = nextBlacklist
      }
    }

    await this.persist()

    if (
      previousAvatarImage &&
      previousAvatarImage !== channel.avatarImage
    ) {
      try {
        await deleteStoredMediaByUrl(previousAvatarImage, 'channel-avatar')
      } catch (error) {
        console.error('Failed to delete replaced channel avatar', error)
      }
    }

    return {
      broadcastIdentifiers: [
        ...new Set([
          account.identifier,
          ...subscriptionChannelCopies.map((channelCopy) => channelCopy.ownerIdentifier),
        ]),
      ],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteManagedChannel(token: string, channelId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channelToDelete = this.database.managedChannels.find(
      (channel) => channel.ownerIdentifier === account.identifier && channel.id === channelId,
    )

    if (!channelToDelete) {
      throw new Error('Канал не найден.')
    }

    const removedAvatarImage = channelToDelete.avatarImage
    const normalizedHandle = sanitizeChannelDirectLink(channelToDelete.directLink) || channelToDelete.directLink
    const removableSubscriptionChannelKeys = new Set(
      this.database.subscriptionChannels
        .filter(
          (channel) =>
            (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
        )
        .map((channel) => `${channel.ownerIdentifier}:${channel.id}`),
    )
    const broadcastIdentifiers = [
      ...new Set(
        this.database.subscriptionChannels
          .filter(
            (channel) =>
              (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
          )
          .map((channel) => channel.ownerIdentifier)
          .concat(account.identifier),
      ),
    ]

    this.database.managedChannels = this.database.managedChannels.filter(
      (channel) => !(channel.ownerIdentifier === account.identifier && channel.id === channelId),
    )
    this.database.subscriptionChannels = this.database.subscriptionChannels.filter(
      (channel) => !removableSubscriptionChannelKeys.has(`${channel.ownerIdentifier}:${channel.id}`),
    )
    this.database.subscriptionPosts = this.database.subscriptionPosts.filter(
      (post) => !removableSubscriptionChannelKeys.has(`${post.ownerIdentifier}:${post.channelId}`),
    )

    await this.persist()

    if (removedAvatarImage) {
      try {
        await deleteStoredMediaByUrl(removedAvatarImage, 'channel-avatar')
      } catch (error) {
        console.error('Failed to delete removed channel avatar', error)
      }
    }

    return {
      broadcastIdentifiers,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async createGroup(token: string, payload: CreateGroupBody): Promise<CreateGroupResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const uniqueDialogIds = [...new Set(payload.memberDialogIds.filter((dialogId) => Number.isInteger(dialogId) && dialogId > 0))]
    if (uniqueDialogIds.length === 0) {
      throw new Error('Добавьте хотя бы одного пользователя в группу с вами.')
    }

    const recipientAccounts: Account[] = []
    const recipientIdentifiers = new Set<string>()

    for (const dialogId of uniqueDialogIds) {
      const dialog = this.findDialog(account.identifier, dialogId)
      if (!dialog) {
        throw new Error('Контакт не найден.')
      }

      const recipientIdentifier = normalizeIdentifier(dialog.phone)
      if (!recipientIdentifier) {
        throw new Error('Нельзя добавить этого пользователя в группу.')
      }

      if (recipientIdentifier === account.identifier) {
        continue
      }

      if (recipientIdentifiers.has(recipientIdentifier)) {
        continue
      }

      const recipientAccount = this.findAccount(recipientIdentifier)
      if (!recipientAccount) {
        throw new Error('Аккаунт контакта не найден.')
      }

      recipientIdentifiers.add(recipientIdentifier)
      recipientAccounts.push(recipientAccount)
    }

    if (recipientAccounts.length === 0) {
      throw new Error('Добавьте хотя бы одного пользователя в группу с вами.')
    }

    const memberLimit = getGroupMemberLimit(account)
    if (recipientAccounts.length + 1 > memberLimit) {
      throw new Error(
        memberLimit === premiumGroupMemberLimit
          ? `Даже с премиумом владельца в группе может быть максимум ${premiumGroupMemberLimit} человек.`
          : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать больше людей, необходимо активировать премиум владельцу группы.`,
      )
    }

    const groupId = this.getNextOwnedId(this.database.groups, account.identifier)
    const title = sanitizeGroupTitle(payload.title) || `Группа: ${formatAccountName(account) || account.identifier}`
    const creatorParticipant = this.buildGroupParticipant(account)
    const participants = [creatorParticipant, ...recipientAccounts.map((recipient) => this.buildGroupParticipant(recipient))]
    const sharedId = randomUUID()
    const nextGroup: PersistedGroup = {
      accent: payload.accent?.trim() || pickAccentForIdentifier(`${account.identifier}${groupId}`),
      avatarImage: payload.avatarImage?.trim() || undefined,
      commentBlacklistIdentifiers: sanitizeIdentifierList(payload.commentBlacklistIdentifiers),
      commentsEnabledForAll: Boolean(payload.commentsEnabledForAll),
      commentsEnabledForPremium: Boolean(payload.commentsEnabledForPremium),
      creatorIdentifier: account.identifier,
      handle: payload.handle?.trim()
        ? sanitizeGroupHandle(payload.handle, groupId)
        : buildGroupHandle(title, groupId),
      id: groupId,
      members: participants.length,
      muted: false,
      ownerIdentifier: account.identifier,
      participants,
      preview: 'Группа создана. Можно начинать обсуждение.',
      sharedId,
      time: formatNowTime(),
      title,
      unread: 0,
    }

    this.database.groups.push(nextGroup)

    for (const recipientAccount of recipientAccounts) {
      this.ensureGroupCopyForOwner(nextGroup, recipientAccount.identifier, participants)

      const senderDialog = this.ensureDialogForContact(account.identifier, recipientAccount)
      const recipientDialog = this.ensureDialogForContact(recipientAccount.identifier, account)
      const createdAt = new Date().toISOString()
      const deliveryId = randomUUID()
      const time = formatNowTime()
      const sourceGroup = this.buildGroupInviteSource(nextGroup)

      this.database.dialogMessages.push({
        author: 'me',
        createdAt,
        deliveryId,
        dialogId: senderDialog.id,
        id: this.getNextDialogMessageId(account.identifier, senderDialog.id),
        ownerIdentifier: account.identifier,
        sourceGroup,
        text: '',
        time,
      })

      this.database.dialogMessages.push({
        author: 'them',
        createdAt,
        deliveryId,
        dialogId: recipientDialog.id,
        id: this.getNextDialogMessageId(recipientAccount.identifier, recipientDialog.id),
        ownerIdentifier: recipientAccount.identifier,
        sourceGroup,
        text: '',
        time,
      })

      senderDialog.typing = false
      senderDialog.unread = 0
      senderDialog.status = 'только что был(а) здесь'
      recipientDialog.typing = false
      recipientDialog.unread += 1
      this.syncDialogContactProfile(recipientDialog, account)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set([account.identifier, ...recipientAccounts.map((recipient) => recipient.identifier)])],
      groupId,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  private assertValidChallenge(identifier: string, code: string) {
    const challenge = this.database.authChallenges.find((item) => item.identifier === identifier)

    if (!challenge) {
      throw new Error('Сначала запросите код подтверждения.')
    }

    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      this.clearChallenge(identifier)
      throw new Error('Код истёк. Запросите новый.')
    }

    if (challenge.code !== code.trim()) {
      throw new Error('Неверный код из SMS.')
    }
  }

  private buildSnapshot(account: Account, token: string): AppSnapshot {
    return {
      channels: materializeManagedChannels(this.database, account.identifier),
      chats: materializeChats(this.database, account.identifier),
      discoveryResults: cloneDiscoveryResults(),
      groups: materializeGroups(this.database, account.identifier),
      session: {
        avatarImage: account.avatarImage,
        blockedContactIds: [...(account.blockedContactIds ?? [])],
        displayName: account.displayName,
        identifier: account.identifier,
        nickname: account.nickname ?? '',
        premium: account.premium ?? true,
        premiumExpiresAt: account.premiumExpiresAt ?? '',
        sessionToken: token,
        soundsDisabled: Boolean(account.soundsDisabled),
        status: account.status ?? '',
        surname: account.surname ?? '',
      } satisfies Session,
      subscriptionChannels: materializeSubscriptionChannels(this.database, account.identifier),
      threadInbox: buildThreadInbox(this.database, account.identifier),
    }
  }

  private clearChallenge(identifier: string) {
    this.database.authChallenges = this.database.authChallenges.filter(
      (challenge) => challenge.identifier !== identifier,
    )
  }

  private async createSessionToken(identifier: string) {
    const token = randomUUID()
    this.database.sessions.push({
      createdAt: new Date().toISOString(),
      identifier,
      token,
    })
    return token
  }

  private findAccount(identifier: string) {
    return this.database.accounts.find((account) => account.identifier === identifier) ?? null
  }

  private resolveDeliveryId(clientDeliveryId?: string) {
    const normalizedDeliveryId = clientDeliveryId?.trim()
    return normalizedDeliveryId || randomUUID()
  }

  private getContactReportCount(identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    return this.database.contactReports.filter(
      (report) => report.targetIdentifier === normalizedIdentifier,
    ).length
  }

  private isIdentifierBlockedByReports(identifier: string) {
    return this.getContactReportCount(identifier) > CONTACT_REPORT_BLOCK_THRESHOLD
  }

  private findAccountByToken(token: string) {
    const identifier = this.getIdentifierByToken(token)
    return identifier ? this.findAccount(identifier) : null
  }

  private hasActiveSession(identifier: string) {
    return this.database.sessions.some((session) => session.identifier === identifier)
  }

  private getNextOwnedId<T extends { id: number; ownerIdentifier: string }>(
    records: T[],
    ownerIdentifier: string,
  ) {
    return (
      records
        .filter((record) => record.ownerIdentifier === ownerIdentifier)
        .reduce((maxId, record) => Math.max(maxId, record.id), 0) + 1
    )
  }

  private getNextDialogMessageId(ownerIdentifier: string, dialogId: number) {
    return (
      this.database.dialogMessages
        .filter(
          (message) =>
            message.ownerIdentifier === ownerIdentifier && message.dialogId === dialogId,
        )
        .reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1
    )
  }

  private getNextGroupMessageId(ownerIdentifier: string, groupId: number) {
    return (
      this.database.groupMessages
        .filter(
          (message) => message.ownerIdentifier === ownerIdentifier && message.groupId === groupId,
        )
        .reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1
    )
  }

  private getNextSubscriptionPostId(ownerIdentifier: string, channelId: number) {
    return (
      this.database.subscriptionPosts
        .filter(
          (post) => post.ownerIdentifier === ownerIdentifier && post.channelId === channelId,
        )
        .reduce((maxId, post) => Math.max(maxId, post.id), 0) + 1
    )
  }

  private findDialog(ownerIdentifier: string, dialogId: number) {
    return (
      this.database.dialogs.find(
        (dialog) => dialog.ownerIdentifier === ownerIdentifier && dialog.id === dialogId,
      ) ?? null
    )
  }

  private findGroup(ownerIdentifier: string, groupId: number) {
    return (
      this.database.groups.find(
        (group) => group.ownerIdentifier === ownerIdentifier && group.id === groupId,
      ) ?? null
    )
  }

  private getSharedGroupId(group: Pick<PersistedGroup, 'id' | 'ownerIdentifier' | 'sharedId'>) {
    return group.sharedId?.trim() || `${group.ownerIdentifier}:${group.id}`
  }

  private listGroupCopies(sharedId: string) {
    return this.database.groups.filter((group) => this.getSharedGroupId(group) === sharedId)
  }

  private listSubscriptionChannelCopiesByHandle(handle: string) {
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    return this.database.subscriptionChannels.filter(
      (channel) => (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
    )
  }

  private ensureSubscriptionChannelCopyForOwner(
    sourceChannel: PersistedManagedChannel,
    ownerIdentifier: string,
  ) {
    const normalizedHandle = sanitizeChannelDirectLink(sourceChannel.directLink) || sourceChannel.directLink
    const existingCopy = this.database.subscriptionChannels.find(
      (channel) =>
        channel.ownerIdentifier === ownerIdentifier &&
        (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
    )

    if (existingCopy) {
      existingCopy.accent = sourceChannel.avatarTone
      existingCopy.avatarImage = sourceChannel.avatarImage
      existingCopy.commentBlacklistIdentifiers = sanitizeIdentifierList(
        sourceChannel.commentBlacklistIdentifiers,
      )
      existingCopy.commentsEnabledForAll = Boolean(sourceChannel.commentsEnabledForAll)
      existingCopy.commentsEnabledForPremium = Boolean(sourceChannel.commentsEnabledForPremium)
      existingCopy.draft = sourceChannel.status === 'draft'
      existingCopy.handle = sourceChannel.directLink
      existingCopy.preview = existingCopy.preview || sourceChannel.description
      existingCopy.title = sourceChannel.title
      existingCopy.visibility = sourceChannel.visibility
      return existingCopy
    }

    const nextCopy: PersistedSubscriptionChannel = {
      accent: sourceChannel.avatarTone,
      avatarImage: sourceChannel.avatarImage,
      commentBlacklistIdentifiers: sanitizeIdentifierList(sourceChannel.commentBlacklistIdentifiers),
      commentsEnabledForAll: Boolean(sourceChannel.commentsEnabledForAll),
      commentsEnabledForPremium: Boolean(sourceChannel.commentsEnabledForPremium),
      draft: sourceChannel.status === 'draft',
      handle: sourceChannel.directLink,
      id: this.getNextOwnedId(this.database.subscriptionChannels, ownerIdentifier),
      muted: false,
      ownerIdentifier,
      participants: [],
      preview: sourceChannel.description,
      readers: 0,
      time: '',
      title: sourceChannel.title,
      unread: 0,
      visibility: sourceChannel.visibility,
    }

    this.database.subscriptionChannels.push(nextCopy)
    return nextCopy
  }

  private getGroupMessageById(ownerIdentifier: string, groupId: number, messageId: number) {
    const group = this.findGroup(ownerIdentifier, groupId)
    if (!group) {
      return null
    }

    const message =
      this.database.groupMessages.find(
        (candidate) =>
          candidate.ownerIdentifier === ownerIdentifier &&
          candidate.groupId === groupId &&
          candidate.id === messageId,
      ) ?? null

    return message ? { group, message } : null
  }

  private getSubscriptionPostById(ownerIdentifier: string, channelId: number, postId: number) {
    const channel = this.findSubscriptionChannel(ownerIdentifier, channelId)
    if (!channel) {
      return null
    }

    const post =
      this.database.subscriptionPosts.find(
        (candidate) =>
          candidate.ownerIdentifier === ownerIdentifier &&
          candidate.channelId === channelId &&
          candidate.id === postId,
      ) ?? null

    return post ? { channel, post } : null
  }

  private getThreadState(ownerIdentifier: string, threadId: string) {
    return (
      this.database.threadStates.find(
        (threadState) =>
          threadState.ownerIdentifier === ownerIdentifier && threadState.threadId === threadId,
      ) ?? null
    )
  }

  private upsertThreadState(
    ownerIdentifier: string,
    threadId: string,
    nextState: Pick<PersistedThreadState, 'lastReadCommentCreatedAt' | 'subscription'>,
  ) {
    const existingState = this.getThreadState(ownerIdentifier, threadId)

    if (existingState) {
      existingState.lastReadCommentCreatedAt = nextState.lastReadCommentCreatedAt
      existingState.subscription = nextState.subscription
      return existingState
    }

    const createdState: PersistedThreadState = {
      lastReadCommentCreatedAt: nextState.lastReadCommentCreatedAt,
      ownerIdentifier,
      subscription: nextState.subscription,
      threadId,
    }
    this.database.threadStates.push(createdState)
    return createdState
  }

  private buildThreadComment(
    account: Account,
    ownerIdentifier: string,
    text: string,
    deliveryId?: string,
  ): ThreadComment {
    return {
      author: ownerIdentifier === account.identifier ? 'me' : 'them',
      authorIdentifier: account.identifier,
      createdAt: new Date().toISOString(),
      deliveryId: this.resolveDeliveryId(deliveryId),
      displayAuthor: formatAccountName(account) || account.identifier,
      id: 0,
      replyTo: undefined,
      text,
      time: formatNowTime(),
    }
  }

  private assignCommentToGroupThread(
    sharedId: string,
    threadId: string,
    authorAccount: Account,
    text: string,
    replyTo?: Message['replyTo'],
    deliveryId?: string,
  ) {
    const broadcastIdentifiers = new Set<string>()
    const groupCopies = this.listGroupCopies(sharedId)

    for (const groupCopy of groupCopies) {
      const targetMessages = this.database.groupMessages.filter(
        (message) =>
          message.ownerIdentifier === groupCopy.ownerIdentifier &&
          message.groupId === groupCopy.id &&
          getGroupMessageThreadId(groupCopy, message) === threadId,
      )

      for (const targetMessage of targetMessages) {
        const nextComment = this.buildThreadComment(authorAccount, groupCopy.ownerIdentifier, text, deliveryId)
        nextComment.replyTo = replyTo
        const nextComments = [...(targetMessage.threadComments ?? [])]
        nextComment.id = nextComments.reduce((maxId, comment) => Math.max(maxId, comment.id), 0) + 1
        nextComments.push(nextComment)
        targetMessage.threadComments = nextComments
        targetMessage.threadId = threadId
        broadcastIdentifiers.add(groupCopy.ownerIdentifier)
      }
    }

    return [...broadcastIdentifiers]
  }

  private assignCommentToSubscriptionThread(
    handle: string,
    threadId: string,
    authorAccount: Account,
    text: string,
    replyTo?: Message['replyTo'],
    deliveryId?: string,
  ) {
    const broadcastIdentifiers = new Set<string>()
    const channelCopies = this.listSubscriptionChannelCopiesByHandle(handle)

    for (const channelCopy of channelCopies) {
      const targetPosts = this.database.subscriptionPosts.filter(
        (post) =>
          post.ownerIdentifier === channelCopy.ownerIdentifier &&
          post.channelId === channelCopy.id &&
          getSubscriptionPostThreadId(channelCopy, post) === threadId,
      )

      for (const targetPost of targetPosts) {
        const nextComment = this.buildThreadComment(authorAccount, channelCopy.ownerIdentifier, text, deliveryId)
        nextComment.replyTo = replyTo
        const nextComments = [...(targetPost.threadComments ?? [])]
        nextComment.id = nextComments.reduce((maxId, comment) => Math.max(maxId, comment.id), 0) + 1
        nextComments.push(nextComment)
        targetPost.threadComments = nextComments
        targetPost.threadId = threadId
        broadcastIdentifiers.add(channelCopy.ownerIdentifier)
      }
    }

    return [...broadcastIdentifiers]
  }

  private assertNotBlacklistedFromGroup(group: PersistedGroup, identifier: string) {
    if (isIdentifierInCommentBlacklist(group, identifier)) {
      throw new Error('Вы не можете отправлять сообщения. Вы в чёрном списке группы.')
    }
  }

  private assertCanCommentInGroup(group: PersistedGroup, account: Account) {
    if (isIdentifierInCommentBlacklist(group, account.identifier)) {
      throw new Error('Вы не можете отправлять сообщения. Вы в чёрном списке группы.')
    }

    if (!shouldAllowComments(group, account)) {
      throw new Error(
        group.commentsEnabledForPremium
          ? 'Комментарии в этой группе доступны только премиум-пользователям.'
          : 'Комментарии в этой группе выключены.',
      )
    }
  }

  private assertCanCommentInSubscriptionChannel(
    channel: PersistedSubscriptionChannel,
    account: Account,
  ) {
    if (isIdentifierInCommentBlacklist(channel, account.identifier)) {
      throw new Error('Вы не можете отправлять сообщения. Вы в чёрном списке канала.')
    }

    if (!shouldAllowComments(channel, account)) {
      throw new Error(
        channel.commentsEnabledForPremium
          ? 'Комментарии в этом канале доступны только премиум-пользователям.'
          : 'Комментарии в этом канале выключены.',
      )
    }
  }

  private buildGroupParticipant(account: Account): GroupParticipant {
    const online = this.hasActiveSession(account.identifier)

    return {
      accent: pickAccentForIdentifier(account.identifier),
      favorite: false,
      id: getStableParticipantId(account.identifier),
      identifier: account.identifier,
      nickname: normalizeNickname(account.nickname ?? ''),
      online,
      premium: hasActivePremium(account.premium, account.premiumExpiresAt),
      status: account.status?.trim() || (online ? 'в сети' : 'был(а) недавно в сети'),
      title: formatAccountName(account) || account.identifier,
    }
  }

  private cloneGroupParticipant(participant: GroupParticipant): GroupParticipant {
    return { ...participant }
  }

  private syncGroupCopiesParticipants(sharedId: string, participants: GroupParticipant[]) {
    for (const group of this.listGroupCopies(sharedId)) {
      group.members = participants.length
      group.participants = participants.map((participant) => this.cloneGroupParticipant(participant))
    }
  }

  private ensureGroupCopyForOwner(
    sourceGroup: PersistedGroup,
    ownerIdentifier: string,
    participants: GroupParticipant[],
  ) {
    const sharedId = this.getSharedGroupId(sourceGroup)
    const existingGroup = this.database.groups.find(
      (group) =>
        group.ownerIdentifier === ownerIdentifier && this.getSharedGroupId(group) === sharedId,
    )

    if (existingGroup) {
      existingGroup.accent = sourceGroup.accent
      existingGroup.avatarImage = sourceGroup.avatarImage
      existingGroup.commentBlacklistIdentifiers = sanitizeIdentifierList(
        sourceGroup.commentBlacklistIdentifiers,
      )
      existingGroup.commentsEnabledForAll = Boolean(sourceGroup.commentsEnabledForAll)
      existingGroup.commentsEnabledForPremium = Boolean(sourceGroup.commentsEnabledForPremium)
      existingGroup.creatorIdentifier = sourceGroup.creatorIdentifier ?? sourceGroup.ownerIdentifier
      existingGroup.handle = sourceGroup.handle
      existingGroup.isTestEntity = sourceGroup.isTestEntity
      existingGroup.members = participants.length
      existingGroup.participants = participants.map((participant) => this.cloneGroupParticipant(participant))
      existingGroup.preview = sourceGroup.preview
      existingGroup.sharedId = sharedId
      existingGroup.time = sourceGroup.time
      existingGroup.title = sourceGroup.title
      return existingGroup
    }

    const nextGroup: PersistedGroup = {
      accent: sourceGroup.accent,
      avatarImage: sourceGroup.avatarImage,
      commentBlacklistIdentifiers: sanitizeIdentifierList(sourceGroup.commentBlacklistIdentifiers),
      commentsEnabledForAll: Boolean(sourceGroup.commentsEnabledForAll),
      commentsEnabledForPremium: Boolean(sourceGroup.commentsEnabledForPremium),
      creatorIdentifier: sourceGroup.creatorIdentifier ?? sourceGroup.ownerIdentifier,
      handle: sourceGroup.handle,
      id: this.getNextOwnedId(this.database.groups, ownerIdentifier),
      isTestEntity: sourceGroup.isTestEntity,
      members: participants.length,
      muted: false,
      ownerIdentifier,
      participants: participants.map((participant) => this.cloneGroupParticipant(participant)),
      preview: sourceGroup.preview,
      sharedId,
      time: sourceGroup.time,
      title: sourceGroup.title,
      unread: 0,
    }

    this.database.groups.push(nextGroup)
    return nextGroup
  }

  private buildGroupInviteSource(group: PersistedGroup): NonNullable<Message['sourceGroup']> {
    return {
      accent: group.accent,
      avatarImage: group.avatarImage,
      creatorIdentifier: group.creatorIdentifier ?? group.ownerIdentifier,
      handle: group.handle,
      sharedId: this.getSharedGroupId(group),
      title: group.title,
    }
  }

  private findSubscriptionChannel(ownerIdentifier: string, channelId: number) {
    return (
      this.database.subscriptionChannels.find(
        (channel) => channel.ownerIdentifier === ownerIdentifier && channel.id === channelId,
      ) ?? null
    )
  }

  private findManagedChannel(ownerIdentifier: string, channelId: number) {
    return (
      this.database.managedChannels.find(
        (channel) => channel.ownerIdentifier === ownerIdentifier && channel.id === channelId,
      ) ?? null
    )
  }

  private refreshDialogsForAccount(account: Account) {
    const affectedOwners = new Set<string>()

    for (const dialog of this.database.dialogs) {
      if (normalizeIdentifier(dialog.phone) !== account.identifier) continue

      this.clearSeededDialogHistoryIfNeeded(dialog)
      this.syncDialogContactProfile(dialog, account)
      affectedOwners.add(dialog.ownerIdentifier)
    }

    return [...affectedOwners]
  }

  private syncDialogContactProfile(dialog: PersistedDialog, account: Account) {
    const online = this.hasActiveSession(account.identifier)

    dialog.title = formatAccountName(account) || account.identifier
    dialog.handle = buildAccountHandle(account)
    dialog.phone = account.identifier
    dialog.accent = pickAccentForIdentifier(account.identifier)
    dialog.mood = account.status?.trim() || 'На связи'
    dialog.status = account.status?.trim() || (online ? 'в сети' : 'был(а) недавно в сети')
    dialog.online = online
    dialog.lastSeen = online ? undefined : 'был(а) недавно в сети'
    dialog.premium = hasActivePremium(account.premium, account.premiumExpiresAt)
  }

  private ensureDialogForContact(ownerIdentifier: string, contactAccount: Account) {
    const existingDialog = this.database.dialogs.find(
      (dialog) =>
        dialog.ownerIdentifier === ownerIdentifier && dialog.phone === contactAccount.identifier,
    )

    if (existingDialog) {
      this.clearSeededDialogHistoryIfNeeded(existingDialog)
      this.syncDialogContactProfile(existingDialog, contactAccount)
      return existingDialog
    }

    const nextDialog: PersistedDialog = {
      accent: pickAccentForIdentifier(contactAccount.identifier),
      handle: buildAccountHandle(contactAccount),
      id: this.getNextOwnedId(this.database.dialogs, ownerIdentifier),
      lastSeen: undefined,
      mood: contactAccount.status?.trim() || 'На связи',
      muted: false,
      online: this.hasActiveSession(contactAccount.identifier),
      ownerIdentifier,
      phone: contactAccount.identifier,
      pinned: false,
      premium: hasActivePremium(contactAccount.premium, contactAccount.premiumExpiresAt),
      status: contactAccount.status?.trim() || 'в сети',
      title: formatAccountName(contactAccount) || contactAccount.identifier,
      typing: false,
      unread: 0,
    }

    this.syncDialogContactProfile(nextDialog, contactAccount)
    this.database.dialogs.push(nextDialog)
    return nextDialog
  }

  private clearSeededDialogHistoryIfNeeded(dialog: PersistedDialog) {
    if (dialog.isTestEntity) return

    const seedChat = getSeedChatByPhone(dialog.phone)
    if (!seedChat) return

    const dialogMessages = this.database.dialogMessages
      .filter(
        (message) =>
          message.ownerIdentifier === dialog.ownerIdentifier && message.dialogId === dialog.id,
      )
      .sort((left, right) => left.id - right.id)

    if (dialogMessages.length !== seedChat.messages.length) return

    const matchesSeedHistory = dialogMessages.every((message, index) => {
      const seedMessage = seedChat.messages[index]
      return (
        seedMessage !== undefined &&
        message.author === seedMessage.author &&
        message.text === seedMessage.text &&
        message.time === seedMessage.time &&
        message.attachment === undefined &&
        message.replyTo === undefined &&
        message.forwarded === undefined
      )
    })

    if (!matchesSeedHistory) return

    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) =>
        !(
          message.ownerIdentifier === dialog.ownerIdentifier &&
          message.dialogId === dialog.id
        ),
    )
    dialog.unread = 0
    dialog.pinned = false
    dialog.pinnedMessageId = undefined
    dialog.typing = false
  }

  private replaceOwnerState(
    ownerIdentifier: string,
    state: {
      channels: Channel[]
      chats: Chat[]
      groups: GroupPreview[]
      subscriptionChannels: SubscriptionChannel[]
    },
  ) {
    const dialogs = normalizeChats(ownerIdentifier, state.chats)
    const groups = normalizeGroups(ownerIdentifier, state.groups)
    const managedChannels = normalizeManagedChannels(ownerIdentifier, state.channels)
    const subscriptionChannels = normalizeSubscriptionChannels(
      ownerIdentifier,
      state.subscriptionChannels,
    )

    this.database.dialogs = this.database.dialogs
      .filter((dialog) => dialog.ownerIdentifier !== ownerIdentifier)
      .concat(dialogs.dialogs)
    this.database.dialogMessages = this.database.dialogMessages
      .filter((message) => message.ownerIdentifier !== ownerIdentifier)
      .concat(dialogs.dialogMessages)
    this.database.groups = this.database.groups
      .filter((group) => group.ownerIdentifier !== ownerIdentifier)
      .concat(groups.groups)
    this.database.groupMessages = this.database.groupMessages
      .filter((message) => message.ownerIdentifier !== ownerIdentifier)
      .concat(groups.groupMessages)
    this.database.managedChannels = this.database.managedChannels
      .filter((channel) => channel.ownerIdentifier !== ownerIdentifier)
      .concat(managedChannels)
    this.database.subscriptionChannels = this.database.subscriptionChannels
      .filter((channel) => channel.ownerIdentifier !== ownerIdentifier)
      .concat(subscriptionChannels.subscriptionChannels)
    this.database.subscriptionPosts = this.database.subscriptionPosts
      .filter((post) => post.ownerIdentifier !== ownerIdentifier)
      .concat(subscriptionChannels.subscriptionPosts)
  }

  private async persist() {
    await this.persistDatabase(this.database)
  }
}

function normalizeChannelHandleForComparison(handle: string | undefined) {
  const trimmed = handle?.trim()
  if (!trimmed) {
    return ''
  }

  return sanitizeChannelDirectLink(trimmed) || trimmed
}

function getPersistedSubscriptionPostSignature(
  post: Pick<PersistedSubscriptionPost, 'attachment' | 'createdAt' | 'replyTo' | 'text' | 'time'>,
) {
  return JSON.stringify({
    attachmentFileName: post.attachment?.fileName ?? '',
    attachmentMimeType: post.attachment?.mimeType ?? '',
    attachmentSize: post.attachment?.size ?? 0,
    createdAt: post.createdAt ?? '',
    replyAuthor: post.replyTo?.author ?? '',
    replyId: post.replyTo?.id ?? 0,
    replyText: post.replyTo?.text ?? '',
    text: post.text,
    time: post.time,
  })
}

function repairSubscriptionChannelIdentityConflicts(database: Database) {
  let didMutate = false
  const seedPostSignaturesByHandle = new Map<string, Set<string>>()

  for (const channel of initialSubscribedChannels) {
    seedPostSignaturesByHandle.set(
      normalizeChannelHandleForComparison(channel.handle),
      new Set(channel.posts.map((post) => getPersistedSubscriptionPostSignature(post))),
    )
  }

  const ownerIdentifiers = new Set(
    database.subscriptionChannels.map((channel) => channel.ownerIdentifier),
  )

  for (const ownerIdentifier of ownerIdentifiers) {
    const ownerChannels = database.subscriptionChannels.filter(
      (channel) => channel.ownerIdentifier === ownerIdentifier,
    )
    if (ownerChannels.length < 2) continue

    const ownerManagedHandles = new Set(
      database.managedChannels
        .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
        .map((channel) => normalizeChannelHandleForComparison(channel.directLink)),
    )
    const channelsById = new Map<number, PersistedSubscriptionChannel[]>()

    for (const channel of ownerChannels) {
      const bucket = channelsById.get(channel.id)
      if (bucket) {
        bucket.push(channel)
      } else {
        channelsById.set(channel.id, [channel])
      }
    }

    let nextChannelId = ownerChannels.reduce((maxId, channel) => Math.max(maxId, channel.id), 0) + 1

    for (const bucket of channelsById.values()) {
      if (bucket.length < 2) continue

      const orderedBucket = [...bucket].sort((left, right) => {
        const leftHandle = normalizeChannelHandleForComparison(left.handle)
        const rightHandle = normalizeChannelHandleForComparison(right.handle)
        const leftPriority =
          (left.isTestEntity ? 0 : 1) + (ownerManagedHandles.has(leftHandle) ? 1 : 0)
        const rightPriority =
          (right.isTestEntity ? 0 : 1) + (ownerManagedHandles.has(rightHandle) ? 1 : 0)

        return leftPriority - rightPriority
      })

      const canonicalChannel = orderedBucket[0]
      const canonicalHandle = normalizeChannelHandleForComparison(canonicalChannel.handle)
      const canonicalSeedPostSignatures = canonicalChannel.isTestEntity
        ? seedPostSignaturesByHandle.get(canonicalHandle) ?? new Set<string>()
        : null

      for (const channel of orderedBucket.slice(1)) {
        const previousChannelId = channel.id
        const nextId = nextChannelId
        nextChannelId += 1
        channel.id = nextId
        didMutate = true

        const channelHandle = normalizeChannelHandleForComparison(channel.handle)
        if (!ownerManagedHandles.has(channelHandle) || canonicalSeedPostSignatures === null) {
          continue
        }

        for (const post of database.subscriptionPosts) {
          if (post.ownerIdentifier !== ownerIdentifier || post.channelId !== previousChannelId) {
            continue
          }

          const postSignature = getPersistedSubscriptionPostSignature(post)
          if (canonicalSeedPostSignatures.has(postSignature)) {
            continue
          }

          post.channelId = nextId
          didMutate = true
        }
      }
    }
  }

  return didMutate
}

function markKnownTestFixtures(database: Database) {
  let didMutate = false
  const testAccountIdentifiers = new Set(buildTestAccounts().map((account) => account.identifier))
  const testGroupHandles = new Set(initialGroups.map((group) => group.handle.trim()))
  const testSubscriptionHandles = new Set(
    initialSubscribedChannels.map((channel) => normalizeChannelHandleForComparison(channel.handle)),
  )

  for (const account of database.accounts) {
    if (!testAccountIdentifiers.has(account.identifier) || account.isTestEntity) {
      continue
    }

    account.isTestEntity = true
    didMutate = true
  }

  for (const dialog of database.dialogs) {
    if (dialog.isTestEntity || !testAccountIdentifiers.has(normalizeIdentifier(dialog.phone))) {
      continue
    }

    dialog.isTestEntity = true
    didMutate = true
  }

  for (const group of database.groups) {
    if (group.isTestEntity || !testGroupHandles.has(group.handle.trim())) {
      continue
    }

    group.isTestEntity = true
    didMutate = true
  }

  for (const channel of database.subscriptionChannels) {
    if (
      channel.isTestEntity ||
      !testSubscriptionHandles.has(normalizeChannelHandleForComparison(channel.handle))
    ) {
      continue
    }

    channel.isTestEntity = true
    didMutate = true
  }

  return didMutate
}

function upsertNonProductionTestAccounts(database: Database) {
  let didMutate = false

  for (const testAccount of buildTestAccounts()) {
    const existingAccount = database.accounts.find(
      (account) => account.identifier === testAccount.identifier,
    )

    if (!existingAccount) {
      database.accounts.push(structuredClone(testAccount))
      didMutate = true
      continue
    }

    const nextPremiumExpiresAt = testAccount.premium ? testAccount.premiumExpiresAt : undefined

    if (existingAccount.displayName !== testAccount.displayName) {
      existingAccount.displayName = testAccount.displayName
      didMutate = true
    }
    if ((existingAccount.nickname ?? '') !== testAccount.nickname) {
      existingAccount.nickname = testAccount.nickname
      didMutate = true
    }
    if ((existingAccount.status ?? '') !== testAccount.status) {
      existingAccount.status = testAccount.status
      didMutate = true
    }
    if ((existingAccount.surname ?? '') !== '') {
      existingAccount.surname = ''
      didMutate = true
    }
    if (existingAccount.avatarImage !== undefined) {
      existingAccount.avatarImage = undefined
      didMutate = true
    }
    if (existingAccount.isTestEntity !== true) {
      existingAccount.isTestEntity = true
      didMutate = true
    }
    if ((existingAccount.premium ?? false) !== (testAccount.premium ?? false)) {
      existingAccount.premium = testAccount.premium
      didMutate = true
    }
    if ((existingAccount.premiumExpiresAt ?? '') !== (nextPremiumExpiresAt ?? '')) {
      existingAccount.premiumExpiresAt = nextPremiumExpiresAt
      didMutate = true
    }
    if ((existingAccount.createdAt ?? '') !== testAccount.createdAt) {
      existingAccount.createdAt = testAccount.createdAt
      didMutate = true
    }
    if ((existingAccount.blockedContactIds ?? []).length > 0) {
      existingAccount.blockedContactIds = []
      didMutate = true
    }
  }

  return didMutate
}

function ensureOwnerTestDialogs(database: Database, ownerIdentifier: string) {
  const ownerDialogs = database.dialogs.filter((dialog) => dialog.ownerIdentifier === ownerIdentifier)
  const ownerHasKnownTestDialog = ownerDialogs.some((dialog) => dialog.isTestEntity)
  if (ownerHasKnownTestDialog) {
    return false
  }

  const seedState = createSeedState()
  const chats = normalizeChats(ownerIdentifier, seedState.chats)
  database.dialogs.push(...chats.dialogs)
  database.dialogMessages.push(...chats.dialogMessages)
  return chats.dialogs.length > 0 || chats.dialogMessages.length > 0
}

function ensureOwnerTestGroups(database: Database, ownerIdentifier: string) {
  const ownerGroups = database.groups.filter((group) => group.ownerIdentifier === ownerIdentifier)
  const ownerHasKnownTestGroup = ownerGroups.some((group) => group.isTestEntity)
  if (ownerHasKnownTestGroup) {
    return false
  }

  const seedState = createSeedState()
  const groups = normalizeGroups(ownerIdentifier, seedState.groups)
  database.groups.push(...groups.groups)
  database.groupMessages.push(...groups.groupMessages)
  return groups.groups.length > 0 || groups.groupMessages.length > 0
}

function ensureOwnerTestSubscriptionChannels(database: Database, ownerIdentifier: string) {
  const existingHandles = new Set(
    database.subscriptionChannels
      .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
      .map((channel) => normalizeChannelHandleForComparison(channel.handle)),
  )
  const missingChannels = createSeedState().subscriptionChannels.filter(
    (channel) => !existingHandles.has(normalizeChannelHandleForComparison(channel.handle)),
  )

  if (missingChannels.length === 0) {
    return false
  }

  const normalizedChannels = normalizeSubscriptionChannels(ownerIdentifier, missingChannels)
  database.subscriptionChannels.push(...normalizedChannels.subscriptionChannels)
  database.subscriptionPosts.push(...normalizedChannels.subscriptionPosts)
  return true
}

function applyNonProductionFixtures(database: Database) {
  let didMutate = markKnownTestFixtures(database)
  didMutate = upsertNonProductionTestAccounts(database) || didMutate

  for (const account of database.accounts) {
    didMutate = ensureOwnerTestDialogs(database, account.identifier) || didMutate
    didMutate = ensureOwnerTestGroups(database, account.identifier) || didMutate
    didMutate = ensureOwnerTestSubscriptionChannels(database, account.identifier) || didMutate
  }

  return {
    database,
    needsPersistenceRewrite: didMutate,
  }
}

function applyProductionFixtureCleanup(database: Database) {
  let didMutate = false
  const knownTestAccountIdentifiers = new Set(
    buildTestAccounts().map((account) => normalizeIdentifier(account.identifier)),
  )
  const testAccountIdentifiers = new Set(
    database.accounts
      .filter((account) => account.isTestEntity)
      .map((account) => normalizeIdentifier(account.identifier))
      .concat([...knownTestAccountIdentifiers]),
  )
  const testGroupHandles = new Set(initialGroups.map((group) => group.handle.trim()))
  const testSubscriptionHandles = new Set(
    initialSubscribedChannels.map((channel) => normalizeChannelHandleForComparison(channel.handle)),
  )

  const removableDialogKeys = new Set(
    database.dialogs
      .filter(
        (dialog) =>
          dialog.isTestEntity ||
          testAccountIdentifiers.has(dialog.ownerIdentifier) ||
          testAccountIdentifiers.has(normalizeIdentifier(dialog.phone)),
      )
      .map((dialog) => `${dialog.ownerIdentifier}:${dialog.id}`),
  )
  const removableGroupKeys = new Set(
    database.groups
      .filter(
        (group) =>
          group.isTestEntity ||
          testAccountIdentifiers.has(group.ownerIdentifier) ||
          testAccountIdentifiers.has(normalizeIdentifier(group.creatorIdentifier ?? '')) ||
          testGroupHandles.has(group.handle.trim()),
      )
      .map((group) => `${group.ownerIdentifier}:${group.id}`),
  )
  const removableSubscriptionChannelKeys = new Set(
    database.subscriptionChannels
      .filter(
        (channel) =>
          channel.isTestEntity ||
          testAccountIdentifiers.has(channel.ownerIdentifier) ||
          testSubscriptionHandles.has(normalizeChannelHandleForComparison(channel.handle)),
      )
      .map((channel) => `${channel.ownerIdentifier}:${channel.id}`),
  )

  const nextAccounts = database.accounts.filter((account) => !account.isTestEntity)
  if (nextAccounts.length !== database.accounts.length) {
    database.accounts = nextAccounts
    didMutate = true
  }

  const nextAuthChallenges = database.authChallenges.filter(
    (challenge) => !testAccountIdentifiers.has(challenge.identifier),
  )
  if (nextAuthChallenges.length !== database.authChallenges.length) {
    database.authChallenges = nextAuthChallenges
    didMutate = true
  }

  const nextSessions = database.sessions.filter(
    (session) => !testAccountIdentifiers.has(session.identifier),
  )
  if (nextSessions.length !== database.sessions.length) {
    database.sessions = nextSessions
    didMutate = true
  }

  const nextContactReports = database.contactReports.filter(
    (report) =>
      !testAccountIdentifiers.has(report.reporterIdentifier) &&
      !testAccountIdentifiers.has(report.targetIdentifier),
  )
  if (nextContactReports.length !== database.contactReports.length) {
    database.contactReports = nextContactReports
    didMutate = true
  }

  const nextDialogs = database.dialogs.filter(
    (dialog) => !removableDialogKeys.has(`${dialog.ownerIdentifier}:${dialog.id}`),
  )
  if (nextDialogs.length !== database.dialogs.length) {
    database.dialogs = nextDialogs
    didMutate = true
  }

  const nextDialogMessages = database.dialogMessages.filter(
    (message) =>
      !testAccountIdentifiers.has(message.ownerIdentifier) &&
      !removableDialogKeys.has(`${message.ownerIdentifier}:${message.dialogId}`),
  )
  if (nextDialogMessages.length !== database.dialogMessages.length) {
    database.dialogMessages = nextDialogMessages
    didMutate = true
  }

  const nextGroups = database.groups.filter(
    (group) => !removableGroupKeys.has(`${group.ownerIdentifier}:${group.id}`),
  )
  if (nextGroups.length !== database.groups.length) {
    database.groups = nextGroups
    didMutate = true
  }

  const nextGroupMessages = database.groupMessages.filter(
    (message) =>
      !testAccountIdentifiers.has(message.ownerIdentifier) &&
      !removableGroupKeys.has(`${message.ownerIdentifier}:${message.groupId}`),
  )
  if (nextGroupMessages.length !== database.groupMessages.length) {
    database.groupMessages = nextGroupMessages
    didMutate = true
  }

  const nextManagedChannels = database.managedChannels.filter(
    (channel) => !testAccountIdentifiers.has(channel.ownerIdentifier),
  )
  if (nextManagedChannels.length !== database.managedChannels.length) {
    database.managedChannels = nextManagedChannels
    didMutate = true
  }

  const nextSubscriptionChannels = database.subscriptionChannels.filter(
    (channel) => !removableSubscriptionChannelKeys.has(`${channel.ownerIdentifier}:${channel.id}`),
  )
  if (nextSubscriptionChannels.length !== database.subscriptionChannels.length) {
    database.subscriptionChannels = nextSubscriptionChannels
    didMutate = true
  }

  const nextSubscriptionPosts = database.subscriptionPosts.filter(
    (post) =>
      !testAccountIdentifiers.has(post.ownerIdentifier) &&
      !removableSubscriptionChannelKeys.has(`${post.ownerIdentifier}:${post.channelId}`),
  )
  if (nextSubscriptionPosts.length !== database.subscriptionPosts.length) {
    database.subscriptionPosts = nextSubscriptionPosts
    didMutate = true
  }

  const nextSubscriptionChannelReports = database.subscriptionChannelReports.filter(
    (report) =>
      !testAccountIdentifiers.has(report.reporterIdentifier) &&
      !testSubscriptionHandles.has(normalizeChannelHandleForComparison(report.targetHandle)),
  )
  if (nextSubscriptionChannelReports.length !== database.subscriptionChannelReports.length) {
    database.subscriptionChannelReports = nextSubscriptionChannelReports
    didMutate = true
  }

  const nextThreadStates = database.threadStates.filter(
    (threadState) => !testAccountIdentifiers.has(threadState.ownerIdentifier),
  )
  if (nextThreadStates.length !== database.threadStates.length) {
    database.threadStates = nextThreadStates
    didMutate = true
  }

  return {
    database,
    needsPersistenceRewrite: didMutate,
  }
}

function applyEnvironmentFixturePolicy(database: Database, needsPersistenceRewrite: boolean) {
  const dedupePersistedMessages = dedupePersistedMessagesByDeliveryId(database)
  const ensuredManagedChannelOwnerCopies = ensureManagedChannelOwnerCopies(database)
  const repairedSubscriptionChannelIdentities = repairSubscriptionChannelIdentityConflicts(database)
  const dedupeSubscriptionPosts = dedupePersistedSubscriptionPosts(database)
  const nextState =
    runtimeConfig.environment === 'production'
      ? applyProductionFixtureCleanup(database)
      : applyNonProductionFixtures(database)

  return {
    database: nextState.database,
    needsPersistenceRewrite:
      needsPersistenceRewrite ||
      dedupePersistedMessages ||
      ensuredManagedChannelOwnerCopies ||
      repairedSubscriptionChannelIdentities ||
      dedupeSubscriptionPosts ||
      nextState.needsPersistenceRewrite,
  }
}

function ensureManagedChannelOwnerCopies(database: Database) {
  let didMutate = false

  for (const channel of database.managedChannels) {
    const normalizedHandle = sanitizeChannelDirectLink(channel.directLink) || channel.directLink
    const existingCopy = database.subscriptionChannels.find(
      (subscriptionChannel) =>
        subscriptionChannel.ownerIdentifier === channel.ownerIdentifier &&
        (sanitizeChannelDirectLink(subscriptionChannel.handle) || subscriptionChannel.handle) ===
          normalizedHandle,
    )

    if (existingCopy) {
      if (existingCopy.accent !== channel.avatarTone) {
        existingCopy.accent = channel.avatarTone
        didMutate = true
      }
      if (existingCopy.avatarImage !== channel.avatarImage) {
        existingCopy.avatarImage = channel.avatarImage
        didMutate = true
      }
      if (existingCopy.draft !== (channel.status === 'draft')) {
        existingCopy.draft = channel.status === 'draft'
        didMutate = true
      }
      if (existingCopy.handle !== channel.directLink) {
        existingCopy.handle = channel.directLink
        didMutate = true
      }
      if (existingCopy.title !== channel.title) {
        existingCopy.title = channel.title
        didMutate = true
      }
      if (existingCopy.visibility !== channel.visibility) {
        existingCopy.visibility = channel.visibility
        didMutate = true
      }
      if (
        (!existingCopy.preview || existingCopy.preview === 'Пока пусто') &&
        existingCopy.preview !== channel.description
      ) {
        existingCopy.preview = channel.description
        didMutate = true
      }
      continue
    }

    database.subscriptionChannels.push({
      accent: channel.avatarTone,
      avatarImage: channel.avatarImage,
      commentBlacklistIdentifiers: sanitizeIdentifierList(channel.commentBlacklistIdentifiers),
      commentsEnabledForAll: Boolean(channel.commentsEnabledForAll),
      commentsEnabledForPremium: Boolean(channel.commentsEnabledForPremium),
      draft: channel.status === 'draft',
      handle: channel.directLink,
      id:
        database.subscriptionChannels
          .filter(
            (subscriptionChannel) =>
              subscriptionChannel.ownerIdentifier === channel.ownerIdentifier,
          )
          .reduce((maxId, subscriptionChannel) => Math.max(maxId, subscriptionChannel.id), 0) + 1,
      muted: false,
      ownerIdentifier: channel.ownerIdentifier,
      participants: [],
      preview: channel.description,
      readers: 0,
      time: '',
      title: channel.title,
      unread: 0,
      visibility: channel.visibility,
    })
    didMutate = true
  }

  return didMutate
}

function dedupePersistedMessagesByDeliveryId(database: Database) {
  let didMutate = false
  const seenDialogDeliveryIds = new Set<string>()
  const seenGroupDeliveryIds = new Set<string>()

  const nextDialogMessages = database.dialogMessages.filter((message) => {
    const deliveryId = message.deliveryId?.trim()
    if (!deliveryId) return true

    const key = `${message.ownerIdentifier}:${message.dialogId}:${deliveryId}`
    if (seenDialogDeliveryIds.has(key)) {
      didMutate = true
      return false
    }

    seenDialogDeliveryIds.add(key)
    return true
  })

  if (nextDialogMessages.length !== database.dialogMessages.length) {
    database.dialogMessages = nextDialogMessages
  }

  const nextGroupMessages = database.groupMessages.filter((message) => {
    const deliveryId = message.deliveryId?.trim()
    if (!deliveryId) return true

    const key = `${message.ownerIdentifier}:${message.groupId}:${deliveryId}`
    if (seenGroupDeliveryIds.has(key)) {
      didMutate = true
      return false
    }

    seenGroupDeliveryIds.add(key)
    return true
  })

  if (nextGroupMessages.length !== database.groupMessages.length) {
    database.groupMessages = nextGroupMessages
  }

  return didMutate
}

function dedupePersistedSubscriptionPosts(database: Database) {
  let didMutate = false
  const seenPostKeys = new Set<string>()

  const nextSubscriptionPosts = database.subscriptionPosts.filter((post) => {
    const key = `${post.ownerIdentifier}:${post.channelId}:${getPersistedSubscriptionPostSignature(post)}`
    if (seenPostKeys.has(key)) {
      didMutate = true
      return false
    }

    seenPostKeys.add(key)
    return true
  })

  if (nextSubscriptionPosts.length !== database.subscriptionPosts.length) {
    database.subscriptionPosts = nextSubscriptionPosts
  }

  return didMutate
}

function normalizeDatabasePayload(parsed: Partial<Database | LegacyDatabase>) {
  if (isLegacyDatabase(parsed)) {
    return applyEnvironmentFixturePolicy(migrateLegacyDatabase(parsed), true)
  }

  const normalized = parsed as Partial<Database>
  return applyEnvironmentFixturePolicy(
    {
      ...createDefaultDatabase(),
      ...normalized,
      accounts: normalized.accounts ?? [],
      authChallenges: normalized.authChallenges ?? [],
      contactReports: normalized.contactReports ?? [],
      dialogs: normalized.dialogs ?? [],
      dialogMessages: normalized.dialogMessages ?? [],
      groupMessages: normalized.groupMessages ?? [],
      groups: normalized.groups ?? [],
      managedChannels: normalized.managedChannels ?? [],
      sessions: normalized.sessions ?? [],
      subscriptionChannelReports: normalized.subscriptionChannelReports ?? [],
      subscriptionChannels: normalized.subscriptionChannels ?? [],
      subscriptionPosts: normalized.subscriptionPosts ?? [],
      threadStates: normalized.threadStates ?? [],
    } satisfies Database,
    false,
  )
}

export function coerceDatabasePayload(value: unknown) {
  if (!value || typeof value !== 'object') {
    return applyEnvironmentFixturePolicy(createDefaultDatabase(), false)
  }

  return normalizeDatabasePayload(value as Partial<Database | LegacyDatabase>)
}

export async function loadDatabaseFromFile(dataFilePath = DEFAULT_DATA_FILE) {
  try {
    const raw = await readFile(dataFilePath, 'utf8')
    return coerceDatabasePayload(JSON.parse(raw) as Partial<Database | LegacyDatabase>)
  } catch {
    return applyEnvironmentFixturePolicy(createDefaultDatabase(), false)
  }
}

export async function persistDatabaseToFile(dataFilePath: string, database: Database) {
  await mkdir(dirname(dataFilePath), { recursive: true })
  await writeFile(dataFilePath, JSON.stringify(database, null, 2))
}
