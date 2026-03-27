import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { zipSync } from 'fflate'
import {
  defaultGroupMemberLimit,
  displayNameFieldMaxLength,
  freeStorageQuotaBytes,
  groupTitleMaxLength,
  managedChannelsPerUserLimit,
  orphanUploadTtlMs,
  premiumStorageQuotaBytes,
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
  Account as SharedAccount,
  StaffRole,
  ChannelThreadInboxItem,
  Channel,
  Chat,
  GroupThreadInboxItem,
  GroupParticipant,
  GroupPreview,
  MessageAttachment,
  Message,
  SearchResult,
  Session,
  StorageUsage,
  SubscriptionChannel,
  ThreadComment,
  ThreadInboxItem,
  UserGifLibraryItem,
} from '../../src/shared/types'
import {
  buildChannelDirectLinkFromTitle,
  ensureUniqueChannelDirectLink,
  formatAccountName,
  formatNowTime,
  getConversationDayKey,
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
  AdminAuditLogEntry,
  AdminAuditLogResponse,
  AdminDashboardResponse,
  AdminDialogSummary,
  AdminIpLogCsvExportBody,
  AdminIpLogEntry,
  AdminIpLogEventType,
  AdminIpLogSource,
  AdminUserIpSummary,
  AdminLegalExportBody,
  AdminLinkedUser,
  AdminManagedChannelSummary,
  AdminManagedGroupSummary,
  AdminMediaItem,
  AdminMediaItemEntityType,
  AdminReportAction,
  AdminReportDetailResponse,
  AdminReportNote,
  AdminReportSummary,
  AdminThreadSummary,
  AdminUserSummary,
  AppSnapshot,
  ComplaintReason,
  CreateGroupBody,
  CreateManagedChannelBody,
  DebugPremiumBody,
  DirectDialogHistoryResponse,
  GroupHistoryResponse,
  InviteManagedChannelMembersBody,
  InviteGroupMemberBody,
  LoginPasswordBody,
  ManageSubscriptionChannelSubscriberBody,
  OpenDirectDialogBody,
  AuthEntrypoint,
  AuthRequestCodeFlow,
  ReportContactBody,
  ReportSubscriptionChannelBody,
  RegisterBody,
  RegisterUserGifBody,
  ResetPasswordBody,
  RequestCodeResponse,
  ReportMediaBody,
  SetPasswordBody,
  SetDialogFavoriteBody,
  SetDialogPinnedMessageBody,
  SendDirectMessageBody,
  SendGroupMessageBody,
  SendManagedChannelPostBody,
  SendGroupThreadCommentBody,
  SendSubscriptionChannelThreadCommentBody,
  SubscriptionChannelHistoryResponse,
  UpdateDialogBody,
  UpdateGroupBody,
  UpdateManagedChannelBody,
  UpdateSubscriptionChannelBody,
  UpdateSessionBody,
  VerifyCodeResponse,
} from '../../src/shared/backend'
import { runtimeConfig } from './config'
import {
  assertValidPassword,
  getPasswordAttemptBlockState,
  hasAccountPassword,
  hashPassword,
  registerFailedPasswordAttempt,
  shouldRequirePasswordCaptcha,
  type PasswordAuthAttemptRecord,
  type StoredAccountPasswordFields,
  verifyPassword,
} from './auth-security'
import { deleteStoredMediaByUrl, readStoredMediaByUrl } from './media'

type StoredAccount = SharedAccount & StoredAccountPasswordFields
type Account = StoredAccount

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

type IpAccessLogRecord = AdminIpLogEntry

type PersistedPasswordAuthAttempt = PasswordAuthAttemptRecord

type AuthChallenge = {
  code: string
  expiresAt: string
  identifier: string
  purpose: 'admin' | 'password-reset' | 'password-setup' | 'registration'
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

type AdminReportRecord = {
  closedAt?: string
  closedByIdentifier?: string
  createdAt: string
  entityKey: string
  entityLabel: string
  entityOwnerIdentifier?: string
  entityPreview?: string
  entityType: AdminReportSummary['entityType']
  id: string
  notes: AdminReportNote[]
  reason: ComplaintReason
  relatedUserIdentifier?: string
  reporterIdentifier: string
  resolutionAction?: AdminReportAction
  resolutionReason?: string
  status: AdminReportSummary['status']
  updatedAt: string
}

type AdminAuditLogRecord = Omit<AdminAuditLogEntry, 'actorDisplayName' | 'actorNickname' | 'targetLabel'>

type PersistedPendingMediaUpload = {
  createdAt: string
  fileName: string
  kind: 'attachment' | 'channel-avatar' | 'group-avatar' | 'profile-avatar' | 'user-gif'
  linked: boolean
  mediaUrl: string
  mimeType: string
  ownerIdentifier: string
  size: number
  storageKey: string
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
  adminAuditLogs: AdminAuditLogRecord[]
  adminReports: AdminReportRecord[]
  authChallenges: AuthChallenge[]
  contactReports: ContactReportRecord[]
  dialogs: PersistedDialog[]
  dialogMessages: PersistedDialogMessage[]
  groupMessages: PersistedGroupMessage[]
  groups: PersistedGroup[]
  ipAccessLogs: IpAccessLogRecord[]
  managedChannels: PersistedManagedChannel[]
  pendingMediaUploads: PersistedPendingMediaUpload[]
  passwordAuthAttempts: PersistedPasswordAuthAttempt[]
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

type SessionAccessContext = {
  ip: string
  source: AdminIpLogSource
  userAgent?: string
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
const PASSWORD_LOGIN_BLOCKED_MESSAGE =
  'Вход временно заблокирован после нескольких неудачных попыток. Повторите позже.'
const PASSWORD_LOGIN_RATE_LIMITED_MESSAGE =
  'Слишком много неудачных попыток входа. Повторите позже.'
const PASSWORD_LOGIN_CAPTCHA_REQUIRED_MESSAGE =
  'Подтвердите, что вы не робот, чтобы продолжить вход по паролю.'
const TEST_FIXTURE_CREATED_AT = '2026-03-21T00:00:00.000Z'
const TEST_FIXTURE_PREMIUM_EXPIRES_AT = '2099-01-01T00:00:00.000Z'

function cloneDiscoveryResults() {
  return structuredClone(discoveryResults)
}

function createDefaultDatabase(): Database {
  return {
    accounts: [],
    adminAuditLogs: [],
    adminReports: [],
    authChallenges: [],
    contactReports: [],
    dialogs: [],
    dialogMessages: [],
    groupMessages: [],
    groups: [],
    ipAccessLogs: [],
    managedChannels: [],
    pendingMediaUploads: [],
    passwordAuthAttempts: [],
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
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    createdAt: TEST_FIXTURE_CREATED_AT,
    displayName: chat.title,
    identifier: normalizeIdentifier(chat.phone),
    isTestEntity: true,
    lastActiveAt: TEST_FIXTURE_CREATED_AT,
    nickname: normalizeNickname(chat.handle.replace(/^@+/u, '')),
    premium: chat.premium ?? false,
    premiumExpiresAt: chat.premium ? TEST_FIXTURE_PREMIUM_EXPIRES_AT : undefined,
    staffRole: undefined,
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

function buildExistingAccountPreview(account: Pick<Account, 'displayName' | 'surname'>): {
  displayName: string
  surname: string
} {
  return {
    displayName: account.displayName,
    surname: account.surname ?? '',
  }
}

function sanitizeThreadCommentText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 2000)
}

function sanitizeMessageAttachment(attachment: Message['attachment']) {
  if (!attachment) return undefined

  const fileName = attachment.fileName.replace(/\s+/g, ' ').trim().slice(0, 120)
  const height = attachment.height ? Math.max(1, Math.floor(attachment.height)) : undefined
  const mediaUrl = attachment.mediaUrl.trim()
  const mimeType = attachment.mimeType.trim().slice(0, 120)
  const size = Math.max(0, Math.floor(attachment.size))
  const width = attachment.width ? Math.max(1, Math.floor(attachment.width)) : undefined

  if (!fileName || !mediaUrl || !mimeType || size <= 0) {
    throw new Error('Некорректное вложение.')
  }

  return {
    fileName,
    height,
    mediaUrl,
    mimeType,
    size,
    width,
  } satisfies NonNullable<Message['attachment']>
}

function sanitizeUserGifLibraryItem(item: UserGifLibraryItem) {
  const fileName = item.fileName.replace(/\s+/g, ' ').trim().slice(0, 120)
  const mediaUrl = item.mediaUrl.trim()
  const mimeType = item.mimeType.trim()
  const size = Math.max(0, Math.floor(item.size))
  const width = item.width ? Math.max(1, Math.floor(item.width)) : undefined
  const height = item.height ? Math.max(1, Math.floor(item.height)) : undefined

  if (!item.id.trim() || !fileName || !mediaUrl || mimeType !== 'image/gif' || size <= 0) {
    throw new Error('Некорректная GIF.')
  }

  if (!fileName.toLowerCase().endsWith('.gif') || size > 5 * 1024 * 1024) {
    throw new Error('GIF не прошла проверку.')
  }

  return {
    createdAt: item.createdAt,
    fileName,
    height,
    id: item.id.trim(),
    mediaUrl,
    mimeType: 'image/gif',
    size,
    width,
  } satisfies UserGifLibraryItem
}

function normalizeGifFileNameForMatching(fileName: string) {
  return fileName
    .replace(/\.gif$/iu, '')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function buildUserGifDuplicateKey(fileName: string, size: number) {
  return `${normalizeGifFileNameForMatching(fileName)}:${Math.max(0, Math.floor(size))}`
}

function inferStoredMediaKind(mediaUrl: string): PersistedPendingMediaUpload['kind'] | null {
  const trimmed = mediaUrl.trim()
  if (!trimmed) return null

  let pathname = trimmed
  if (/^https?:\/\//u.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname
    } catch {
      return null
    }
  }

  pathname = pathname.replace(/^\/+uploads\/?/u, '').replace(/^\/+/u, '')

  if (pathname.startsWith('attachments/')) return 'attachment'
  if (pathname.startsWith('channel-avatars/')) return 'channel-avatar'
  if (pathname.startsWith('group-avatars/')) return 'group-avatar'
  if (pathname.startsWith('profile-avatars/')) return 'profile-avatar'
  if (pathname.startsWith('user-gifs/')) return 'user-gif'
  return null
}

type OwnedStoredMediaReference = {
  kind: PersistedPendingMediaUpload['kind']
  mediaUrl: string
  ownerIdentifier: string
  size: number
}

function buildStorageUsage(usedBytes: number, premium?: boolean, premiumExpiresAt?: string): StorageUsage {
  const quotaBytes = hasActivePremium(premium, premiumExpiresAt) ? premiumStorageQuotaBytes : freeStorageQuotaBytes
  const remainingBytes = Math.max(0, quotaBytes - usedBytes)
  const percentUsed = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0

  return {
    percentUsed,
    quotaBytes,
    remainingBytes,
    usedBytes,
  }
}

function collectMediaUrlsFromAttachment(attachment?: MessageAttachment) {
  return attachment?.mediaUrl ? [attachment.mediaUrl] : []
}

function collectMediaUrlsFromThreadComments(comments?: ThreadComment[]) {
  return (comments ?? []).flatMap((comment) => collectMediaUrlsFromAttachment(comment.attachment))
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
    leadText: sanitizeMessageText(sourceChannel?.leadText ?? '') || undefined,
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

function sanitizeStaffRole(value: string | undefined): StaffRole | undefined {
  if (value === 'owner' || value === 'moderator' || value === 'support') {
    return value
  }

  return undefined
}

function sanitizeAdminText(value: string | undefined, maxLength = 1000) {
  return value?.replace(/\s+/g, ' ').trim().slice(0, maxLength) || ''
}

function isAccountBlocked(account: Pick<Account, 'blockedAt'> | null | undefined) {
  return Boolean(account?.blockedAt)
}

function isContentReportEntityType(entityType: AdminReportSummary['entityType']) {
  return (
    entityType === 'channel' ||
    entityType === 'group' ||
    entityType === 'message' ||
    entityType === 'media' ||
    entityType === 'avatar' ||
    entityType === 'gif'
  )
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

function buildAccountDisplayLabel(account: Pick<Account, 'displayName' | 'identifier' | 'surname'>) {
  return formatAccountName(account) || account.identifier
}

function buildAdminAuditAccountLabel(
  account: Pick<Account, 'displayName' | 'identifier' | 'nickname' | 'surname'>,
) {
  const displayName = buildAccountDisplayLabel(account)
  const nickname = normalizeNickname(account.nickname ?? '')
  return nickname
    ? `${displayName} (@${nickname}, ${account.identifier})`
    : `${displayName} (${account.identifier})`
}

function buildAdminLinkedUserSummary(
  account: Pick<Account, 'displayName' | 'identifier' | 'nickname' | 'surname'> | undefined,
  identifier: string,
): AdminLinkedUser {
  const normalizedNickname = normalizeNickname(account?.nickname ?? '')
  return {
    displayName: account ? buildAccountDisplayLabel(account) : identifier,
    identifier,
    nickname: normalizedNickname || undefined,
  }
}

function parseIsoDate(value?: string) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

const historicalRetentionMs = runtimeConfig.storage.retention.historicalDataDays * 24 * 60 * 60 * 1000

function isTimestampOlderThan(value: string | undefined, cutoffTimestamp: number) {
  const timestamp = parseIsoDate(value)
  return timestamp !== null && timestamp < cutoffTimestamp
}

function getLatestActivityTimestamp(
  rootCreatedAt: string | undefined,
  comments: Array<Pick<ThreadComment, 'createdAt'> | undefined> | undefined,
) {
  let latestTimestamp = parseIsoDate(rootCreatedAt)

  for (const comment of comments ?? []) {
    const commentTimestamp = parseIsoDate(comment?.createdAt)
    if (commentTimestamp === null) {
      continue
    }

    if (latestTimestamp === null || commentTimestamp > latestTimestamp) {
      latestTimestamp = commentTimestamp
    }
  }

  return latestTimestamp
}

function escapeCsvCell(value: unknown) {
  const normalized =
    typeof value === 'string'
      ? value
      : value === undefined || value === null
        ? ''
        : JSON.stringify(value)

  return `"${normalized.replace(/"/g, '""')}"`
}

function sanitizeExportFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/giu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatExportDateStamp(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isTimestampWithinRange(value: string | undefined, fromTimestamp: number | null, toTimestamp: number | null) {
  const timestamp = parseIsoDate(value)
  if (timestamp === null) {
    return false
  }

  if (fromTimestamp !== null && timestamp < fromTimestamp) {
    return false
  }

  if (toTimestamp !== null && timestamp > toTimestamp) {
    return false
  }

  return true
}

function buildCsv(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')
}

function sanitizeIpAddress(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized.slice(0, 200) : ''
}

function sanitizeUserAgent(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized.slice(0, 1000) : undefined
}

function toJsonBuffer(value: unknown) {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8')
}

function toTextBuffer(value: string) {
  return Buffer.from(value, 'utf8')
}

function classifyAdminMediaType(
  attachment?: Pick<MessageAttachment, 'mimeType'> | null,
  fallbackKind?: PersistedPendingMediaUpload['kind'] | 'pending-upload' | 'unknown',
) {
  if (fallbackKind === 'profile-avatar') {
    return 'Аватарка профиля'
  }

  if (fallbackKind === 'group-avatar') {
    return 'Аватарка группы'
  }

  if (fallbackKind === 'channel-avatar') {
    return 'Аватарка канала'
  }

  if (fallbackKind === 'user-gif') {
    return 'GIF'
  }

  const mimeType = attachment?.mimeType?.toLowerCase().trim() ?? ''
  if (mimeType === 'image/gif') {
    return 'GIF'
  }

  if (mimeType.startsWith('image/')) {
    return 'Фото'
  }

  if (mimeType) {
    return 'Файл'
  }

  if (fallbackKind === 'attachment') {
    return 'Файл'
  }

  if (fallbackKind === 'pending-upload') {
    return 'Черновик'
  }

  return 'Медиа'
}

function buildAdminMessageEntityKey(
  scope: 'dialog' | 'group-message' | 'group-comment' | 'channel-post' | 'channel-comment',
  ownerIdentifier: string,
  parentId: number,
  messageId: number,
) {
  return `${scope}:${ownerIdentifier}:${parentId}:${messageId}`
}

function buildAdminChannelAggregateKey(channel: Pick<PersistedManagedChannel, 'directLink' | 'ownerIdentifier' | 'title'>) {
  const handle = sanitizeChannelDirectLink(channel.directLink) || channel.directLink.trim()
  return `${channel.ownerIdentifier}:${handle || sanitizeExportFileName(channel.title)}`
}

function getAdminGroupParticipantIdentifiers(
  group: Pick<PersistedGroup, 'participants'>,
) {
  return [...new Set((group.participants ?? [])
    .map((participant) => normalizeIdentifier(participant.identifier ?? ''))
    .filter(Boolean))].sort()
}

function getAdminGroupCanonicalOwnerIdentifier(
  group: Pick<PersistedGroup, 'creatorIdentifier' | 'ownerIdentifier' | 'participants'>,
) {
  return (
    normalizeIdentifier(group.creatorIdentifier ?? '') ||
    normalizeIdentifier(group.participants?.[0]?.identifier ?? '') ||
    group.ownerIdentifier
  )
}

function buildAdminGroupAggregateKey(
  group: Pick<PersistedGroup, 'creatorIdentifier' | 'handle' | 'ownerIdentifier' | 'participants' | 'sharedId' | 'title'>,
) {
  const normalizedHandle = group.handle.trim().toLowerCase()
  const handleKey =
    normalizedHandle && !/^@?group[_-]?\d+$/u.test(normalizedHandle)
      ? normalizedHandle
      : ''
  const titleKey = sanitizeExportFileName(group.title).toLowerCase() || 'group'
  const participantKey = getAdminGroupParticipantIdentifiers(group).join(',')
  const ownerKey = getAdminGroupCanonicalOwnerIdentifier(group)
  return `${handleKey || titleKey}:${participantKey || ownerKey}`
}

function buildAdminGroupThreadKey(
  group: Pick<PersistedGroup, 'creatorIdentifier' | 'handle' | 'id' | 'ownerIdentifier' | 'participants' | 'sharedId' | 'title'>,
  message: Pick<Message, 'attachment' | 'createdAt' | 'deliveryId' | 'id' | 'text' | 'threadId' | 'time'>,
) {
  const groupKey = buildAdminGroupAggregateKey(group)
  if (message.threadId?.trim()) {
    return `admin-group-thread:${groupKey}:${message.threadId.trim()}`
  }

  if (message.deliveryId?.trim()) {
    return `admin-group-thread:${groupKey}:delivery:${message.deliveryId.trim()}`
  }

  if (message.createdAt?.trim()) {
    return `admin-group-thread:${groupKey}:created:${message.createdAt.trim()}`
  }

  return `admin-group-thread:${groupKey}:legacy:${message.id}:${message.time}:${message.text.trim()}:${message.attachment?.fileName ?? ''}`
}

function buildAdminChannelThreadKey(
  channel: Pick<PersistedSubscriptionChannel, 'handle' | 'id' | 'ownerIdentifier'>,
  post: Pick<SubscriptionPost, 'attachment' | 'createdAt' | 'id' | 'text' | 'threadId' | 'time'>,
) {
  const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle.trim()
  if (post.threadId?.trim()) {
    return `admin-channel-thread:${normalizedHandle}:${post.threadId.trim()}`
  }

  if (post.createdAt?.trim()) {
    return `admin-channel-thread:${normalizedHandle}:created:${post.createdAt.trim()}`
  }

  return `admin-channel-thread:${normalizedHandle}:legacy:${post.id}:${post.time}:${post.text.trim()}:${post.attachment?.fileName ?? ''}`
}

function buildAdminThreadCommentAggregateKey(
  parentThreadKey: string,
  fallbackAuthorIdentifier: string,
  comment: Pick<ThreadComment, 'attachment' | 'authorIdentifier' | 'createdAt' | 'id' | 'text'>,
) {
  const authorIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || fallbackAuthorIdentifier
  return `${parentThreadKey}:${authorIdentifier}:${comment.createdAt?.trim() ?? ''}:${comment.id}:${comment.text.trim()}:${comment.attachment?.fileName ?? ''}`
}

function buildAttachmentReportState(
  database: Database,
  reporterIdentifier: string,
  mediaUrl: string,
) {
  const relatedReports = database.adminReports.filter(
    (report) => report.entityType === 'media' && report.entityKey === mediaUrl,
  )

  return {
    alreadyReported: relatedReports.some(
      (report) => report.reporterIdentifier === reporterIdentifier,
    ),
    reportCount: relatedReports.length,
  }
}

function materializeAttachmentForViewer(
  database: Database,
  reporterIdentifier: string,
  attachment?: MessageAttachment,
) {
  if (!attachment) {
    return undefined
  }

  return {
    ...attachment,
    reportState: buildAttachmentReportState(database, reporterIdentifier, attachment.mediaUrl),
  } satisfies MessageAttachment
}

function materializeThreadCommentsForViewer(
  database: Database,
  reporterIdentifier: string,
  comments?: ThreadComment[],
) {
  return compactThreadComments(comments).map((comment) => ({
    ...comment,
    attachment: materializeAttachmentForViewer(database, reporterIdentifier, comment.attachment),
  }))
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
    attachment: sanitizeMessageAttachment(comment.attachment),
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
    avatarImage: channel.avatarImage,
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
    statusText: channel.statusText?.trim() || undefined,
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
  database: Database,
  viewerIdentifier: string,
  message: PersistedDialogMessage,
): Omit<PersistedDialogMessage, 'dialogId' | 'ownerIdentifier'> {
  return {
    attachment: materializeAttachmentForViewer(database, viewerIdentifier, message.attachment),
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
  database: Database,
  viewerIdentifier: string,
  message: PersistedGroupMessage,
): Omit<PersistedGroupMessage, 'groupId' | 'ownerIdentifier'> {
  return {
    attachment: materializeAttachmentForViewer(database, viewerIdentifier, message.attachment),
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
    threadComments: materializeThreadCommentsForViewer(database, viewerIdentifier, message.threadComments),
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
    statusText: channel.statusText?.trim() || undefined,
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
  database: Database,
  viewerIdentifier: string,
  post: PersistedSubscriptionPost,
): Omit<PersistedSubscriptionPost, 'channelId' | 'ownerIdentifier'> {
  return {
    attachment: materializeAttachmentForViewer(database, viewerIdentifier, post.attachment),
    createdAt: post.createdAt,
    id: post.id,
    replyTo: post.replyTo,
    text: post.text,
    threadComments: materializeThreadCommentsForViewer(database, viewerIdentifier, post.threadComments),
    threadId: post.threadId?.trim() || undefined,
    time: post.time,
  }
}

type HistoryTimelineItem = {
  createdAt?: string
  id: number
}

type HistorySliceResult<T> = {
  hasMore: boolean
  items: T[]
}

const minimumHistoryPageSize = 10

function buildHistoryDayGroups<T extends HistoryTimelineItem>(items: T[]) {
  const groups: Array<{ dayKey: string; end: number; start: number }> = []

  items.forEach((item, index) => {
    const dayKey = getConversationDayKey(item.createdAt)
    const previousGroup = groups.at(-1)

    if (!previousGroup || previousGroup.dayKey !== dayKey) {
      groups.push({
        dayKey,
        end: index,
        start: index,
      })
      return
    }

    previousGroup.end = index
  })

  return groups
}

function getInitialHistoryStartGroupIndex<T extends HistoryTimelineItem>(
  dayGroups: Array<{ dayKey: string; end: number; start: number }>,
  items: T[],
) {
  if (dayGroups.length <= 1) return 0

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const todayKey = getConversationDayKey(today.toISOString())
  const yesterdayKey = getConversationDayKey(yesterday.toISOString())

  const targetIndexes = dayGroups.reduce<number[]>((indexes, group, index) => {
    if (group.dayKey === todayKey || group.dayKey === yesterdayKey) {
      indexes.push(index)
    }

    return indexes
  }, [])

  let startGroupIndex =
    targetIndexes.length > 0
      ? Math.min(...targetIndexes)
      : Math.max(dayGroups.length - 2, 0)

  while (
    startGroupIndex > 0 &&
    items.length - dayGroups[startGroupIndex].start < minimumHistoryPageSize
  ) {
    startGroupIndex -= 1
  }

  return startGroupIndex
}

function buildInitialHistorySlice<T extends HistoryTimelineItem>(items: T[]): HistorySliceResult<T> {
  if (items.length === 0) {
    return {
      hasMore: false,
      items,
    }
  }

  const dayGroups = buildHistoryDayGroups(items)
  const startGroupIndex = getInitialHistoryStartGroupIndex(dayGroups, items)

  return {
    hasMore: startGroupIndex > 0,
    items: items.slice(dayGroups[startGroupIndex].start),
  }
}

function buildOlderHistorySlice<T extends HistoryTimelineItem>(
  items: T[],
  beforeItemId: number,
): HistorySliceResult<T> {
  const beforeItemIndex = items.findIndex((item) => item.id === beforeItemId)
  if (beforeItemIndex <= 0) {
    return {
      hasMore: false,
      items: [],
    }
  }

  const olderItems = items.slice(0, beforeItemIndex)
  const dayGroups = buildHistoryDayGroups(olderItems)

  if (dayGroups.length === 0) {
    return {
      hasMore: false,
      items: [],
    }
  }

  let startGroupIndex = dayGroups.length - 1

  while (
    startGroupIndex > 0 &&
    olderItems.length - dayGroups[startGroupIndex].start < minimumHistoryPageSize
  ) {
    startGroupIndex -= 1
  }

  return {
    hasMore: startGroupIndex > 0,
    items: olderItems.slice(dayGroups[startGroupIndex].start),
  }
}

function normalizeChats(ownerIdentifier: string, chats: Chat[]) {
  const visibleChats = chats.filter(
    (chat) => normalizeIdentifier(chat.phone) !== ownerIdentifier,
  )

  return {
    dialogMessages: visibleChats.flatMap((chat) =>
      chat.messages.map((message) => toPersistedDialogMessage(ownerIdentifier, chat.id, message)),
    ),
    dialogs: visibleChats.map((chat) => toPersistedDialog(ownerIdentifier, chat)),
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
      blockedAt: legacyAccount.blockedAt,
      blockedReason: legacyAccount.blockedReason,
      blockedContactIds: legacyAccount.blockedContactIds ?? [],
      createdAt: legacyAccount.createdAt,
      displayName: legacyAccount.displayName,
      gifLibrary: [...(legacyAccount.gifLibrary ?? [])],
      identifier: legacyAccount.identifier,
      isTestEntity: legacyAccount.isTestEntity,
      lastActiveAt: legacyAccount.lastActiveAt ?? legacyAccount.createdAt,
      nickname: legacyAccount.nickname ?? '',
      passwordHash: legacyAccount.passwordHash?.trim() || undefined,
      passwordSetAt: legacyAccount.passwordSetAt || undefined,
      premium: legacyAccount.premium ?? true,
      premiumExpiresAt: legacyAccount.premiumExpiresAt ?? makePremiumExpiry(30),
      staffRole: sanitizeStaffRole(legacyAccount.staffRole),
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

function materializeFullChats(database: Database, ownerIdentifier: string): Chat[] {
  return database.dialogs
    .filter((dialog) => dialog.ownerIdentifier === ownerIdentifier)
    .map((dialog) => {
      const contactAccount = database.accounts.find(
        (account) => normalizeIdentifier(dialog.phone) === account.identifier,
      )
      const messages = database.dialogMessages
        .filter(
          (message) =>
            message.ownerIdentifier === ownerIdentifier && message.dialogId === dialog.id,
        )
        .map((message) => materializeDialogMessage(database, ownerIdentifier, message))
      const pinnedMessage =
        dialog.pinnedMessageId === undefined
          ? undefined
          : messages.find((message) => message.id === dialog.pinnedMessageId)

      return {
        ...materializeDialog(dialog),
        blockedByAdmin: Boolean(contactAccount?.blockedAt),
        blockedReason: contactAccount?.blockedReason?.trim() || undefined,
        messages,
        pinnedMessage,
      }
    })
}

function materializeChats(database: Database, ownerIdentifier: string): Chat[] {
  return materializeFullChats(database, ownerIdentifier).map((chat) => {
    const historySlice = buildInitialHistorySlice(chat.messages)

    return {
      ...chat,
      historyHasMore: historySlice.hasMore,
      messages: historySlice.items,
    }
  })
}

function materializeFullGroups(database: Database, ownerIdentifier: string): GroupPreview[] {
  return database.groups
    .filter((group) => group.ownerIdentifier === ownerIdentifier)
    .map((group) => {
      const materializedGroup = materializeGroup(group)
      const messages = database.groupMessages
        .filter(
          (message) => message.ownerIdentifier === ownerIdentifier && message.groupId === group.id,
        )
        .map((message) => {
          const materializedMessage = materializeGroupMessage(database, ownerIdentifier, message)
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

function materializeGroups(database: Database, ownerIdentifier: string): GroupPreview[] {
  return materializeFullGroups(database, ownerIdentifier).map((group) => {
    const historySlice = buildInitialHistorySlice(group.messages)

    return {
      ...group,
      historyHasMore: historySlice.hasMore,
      messages: historySlice.items,
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

function materializeFullSubscriptionChannels(
  database: Database,
  ownerIdentifier: string,
): SubscriptionChannel[] {
  return database.subscriptionChannels
    .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
    .map((channel) => {
      const materializedChannel = materializeSubscriptionChannel(channel)
      const participants = materializeSubscriptionParticipants(database, ownerIdentifier, channel)
      const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
      const isManagedChannel = database.managedChannels.some(
        (managedChannel) =>
          (sanitizeChannelDirectLink(managedChannel.directLink) || managedChannel.directLink) === normalizedHandle,
      )
      const posts = database.subscriptionPosts
        .filter(
          (post) => post.ownerIdentifier === ownerIdentifier && post.channelId === channel.id,
        )
        .map((post) => {
          const materializedPost = materializeSubscriptionPost(database, ownerIdentifier, post)
          return {
            ...materializedPost,
            threadComments: materializedPost.threadComments ?? [],
            threadId: getSubscriptionPostThreadId(channel, materializedPost),
          }
        })

      return {
        ...materializedChannel,
        latestActivityAt: posts.at(-1)?.createdAt,
        participants,
        readers: isManagedChannel ? participants.length : materializedChannel.readers,
        posts,
      }
    })
}

function materializeSubscriptionChannels(
  database: Database,
  ownerIdentifier: string,
): SubscriptionChannel[] {
  return materializeFullSubscriptionChannels(database, ownerIdentifier).map((channel) => {
    const historySlice = buildInitialHistorySlice(channel.posts)

    return {
      ...channel,
      historyHasMore: historySlice.hasMore,
      posts: historySlice.items,
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

  async requestCode(
    identifier: string,
    options?: {
      entryPoint?: AuthEntrypoint
      flow?: AuthRequestCodeFlow
    },
  ): Promise<RequestCodeResponse> {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const entryPoint = options?.entryPoint ?? 'user'
    const flow = options?.flow ?? 'default'

    if (!normalizedIdentifier || normalizedIdentifier.length < 12) {
      throw new Error('Проверь номер телефона.')
    }

    if (!isAllowedTestPhone(normalizedIdentifier)) {
      throw new Error(RESTRICTED_TEST_PHONE_MESSAGE)
    }

    const existingAccount = this.findAccount(normalizedIdentifier)
    if (entryPoint === 'user' && flow === 'default' && existingAccount && hasAccountPassword(existingAccount)) {
      return {
        existingAccount: buildExistingAccountPreview(existingAccount),
        hasPassword: true,
        status: 'needs-password-login',
      }
    }

    if (entryPoint === 'user' && flow === 'password-reset' && !existingAccount) {
      throw new Error('Аккаунт с таким номером не найден.')
    }

    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString()
    const purpose =
      entryPoint === 'admin'
        ? 'admin'
        : flow === 'password-reset'
          ? 'password-reset'
          : existingAccount
            ? 'password-setup'
            : 'registration'

    this.database.authChallenges = this.database.authChallenges
      .filter((challenge) => challenge.identifier !== normalizedIdentifier)
      .concat({
        code: DEMO_AUTH_CODE,
        expiresAt,
        identifier: normalizedIdentifier,
        purpose,
      })

    await this.persist()
    console.info(`[tinychok-server] demo code for ${normalizedIdentifier}: ${DEMO_AUTH_CODE}`)

    return {
      delivery: 'sms',
      existingAccount: existingAccount ? buildExistingAccountPreview(existingAccount) : null,
      expiresAt,
      hasPassword: hasAccountPassword(existingAccount),
      status:
        entryPoint === 'admin'
          ? 'code-sent'
          : flow === 'password-reset'
            ? 'needs-sms-reset'
            : existingAccount
              ? 'needs-sms-password-setup'
              : 'needs-sms-registration',
    }
  }

  async verifyCode(
    identifier: string,
    code: string,
    options?: {
      accessContext?: Omit<SessionAccessContext, 'source'>
      entryPoint?: AuthEntrypoint
    },
  ): Promise<VerifyCodeResponse> {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const entryPoint = options?.entryPoint ?? 'user'
    if (!isAllowedTestPhone(normalizedIdentifier)) {
      throw new Error(RESTRICTED_TEST_PHONE_MESSAGE)
    }

    const challenge = this.assertValidChallenge(normalizedIdentifier, code)

    if (this.isIdentifierBlockedByReports(normalizedIdentifier)) {
      throw new Error(CONTACT_REPORT_BLOCK_MESSAGE)
    }

    const existingAccount = this.findAccount(normalizedIdentifier)
    if (entryPoint === 'admin') {
      if (!existingAccount) {
        return {
          existingAccount: null,
          status: 'needs-profile-and-password',
        }
      }

      if (isAccountBlocked(existingAccount)) {
        throw new Error(existingAccount.blockedReason || 'Аккаунт заблокирован staff-командой.')
      }

      const token = await this.createSessionToken(normalizedIdentifier, {
        ip: options?.accessContext?.ip ?? '',
        source: 'verify-code',
        userAgent: options?.accessContext?.userAgent,
      })
      this.clearChallenge(normalizedIdentifier)
      await this.persist()

      return {
        snapshot: this.buildSnapshot(existingAccount, token),
        status: 'authenticated',
      }
    }

    if (!existingAccount && challenge.purpose !== 'registration') {
      throw new Error('Аккаунт с таким номером не найден.')
    }

    if (!existingAccount) {
      return {
        existingAccount: null,
        status: 'needs-profile-and-password',
      }
    }

    if (isAccountBlocked(existingAccount)) {
      throw new Error(existingAccount.blockedReason || 'Аккаунт заблокирован staff-командой.')
    }

    if (challenge.purpose === 'password-reset') {
      return {
        existingAccount: buildExistingAccountPreview(existingAccount),
        status: 'needs-password-reset',
      }
    }

    if (!hasAccountPassword(existingAccount)) {
      return {
        existingAccount: buildExistingAccountPreview(existingAccount),
        status: 'needs-password-setup',
      }
    }

    throw new Error('Для этого аккаунта уже задан пароль. Войдите по паролю.')
  }

  async registerAccount(payload: RegisterBody, accessContext?: Omit<SessionAccessContext, 'source'>): Promise<AppSnapshot> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    if (!isAllowedTestPhone(normalizedIdentifier)) {
      throw new Error(RESTRICTED_TEST_PHONE_MESSAGE)
    }

    const challenge = this.assertValidChallenge(normalizedIdentifier, payload.code)

    if (this.findAccount(normalizedIdentifier)) {
      throw new Error('Аккаунт уже существует. Попробуйте войти.')
    }

    if (challenge.purpose !== 'registration') {
      throw new Error('Для этого шага нужен код подтверждения регистрации.')
    }

    const displayName = sanitizePersonField(payload.displayName, displayNameFieldMaxLength)
    if (!displayName) {
      throw new Error('Для регистрации нужен ник или имя.')
    }

    assertValidPassword(payload.password, payload.confirmPassword)
    const passwordHash = await hashPassword(payload.password)

    const nextAccount: Account = {
      avatarImage: undefined,
      blockedAt: undefined,
      blockedReason: undefined,
      blockedContactIds: [],
      createdAt: new Date().toISOString(),
      displayName,
      gifLibrary: [],
      identifier: normalizedIdentifier,
      isTestEntity: false,
      lastActiveAt: new Date().toISOString(),
      nickname: '',
      passwordHash,
      passwordSetAt: new Date().toISOString(),
      premium: true,
      premiumExpiresAt: makePremiumExpiry(30),
      soundsDisabled: true,
      staffRole: undefined,
      status: '',
      surname: '',
    }

    this.database.accounts.push(nextAccount)
    this.replaceOwnerState(normalizedIdentifier, createSeedState())
    const token = await this.createSessionToken(normalizedIdentifier, {
      ip: accessContext?.ip ?? '',
      source: 'register',
      userAgent: accessContext?.userAgent,
    })
    this.clearChallenge(normalizedIdentifier)
    await this.persist()

    return this.buildSnapshot(nextAccount, token)
  }

  async loginWithPassword(
    payload: LoginPasswordBody,
    accessContext?: Omit<SessionAccessContext, 'source'>,
    options?: { captchaVerified?: boolean },
  ): Promise<AppSnapshot> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    const sanitizedIp = sanitizeIpAddress(accessContext?.ip)
    const existingAccount = this.findAccount(normalizedIdentifier)

    if (!existingAccount) {
      throw new Error('Аккаунт с таким номером не найден.')
    }

    if (isAccountBlocked(existingAccount)) {
      throw new Error(existingAccount.blockedReason || 'Аккаунт заблокирован staff-командой.')
    }

    if (!hasAccountPassword(existingAccount)) {
      throw new Error('Для этого аккаунта пароль ещё не задан. Подтвердите номер через SMS.')
    }

    const activeBlock = this.getPasswordAuthBlock(normalizedIdentifier, sanitizedIp)
    if (activeBlock) {
      throw new Error(PASSWORD_LOGIN_BLOCKED_MESSAGE)
    }

    if (this.shouldRequirePasswordLoginCaptcha(normalizedIdentifier, sanitizedIp) && !options?.captchaVerified) {
      throw new Error(PASSWORD_LOGIN_CAPTCHA_REQUIRED_MESSAGE)
    }

    const passwordMatches = await verifyPassword(payload.password, existingAccount.passwordHash!)
    if (!passwordMatches) {
      const didTriggerBlock = this.registerFailedPasswordLoginAttempt(normalizedIdentifier, sanitizedIp)
      await this.persist()
      if (didTriggerBlock) {
        throw new Error(PASSWORD_LOGIN_RATE_LIMITED_MESSAGE)
      }

      if (this.shouldRequirePasswordLoginCaptcha(normalizedIdentifier, sanitizedIp)) {
        throw new Error(PASSWORD_LOGIN_CAPTCHA_REQUIRED_MESSAGE)
      }

      throw new Error('Неверный пароль.')
    }

    this.clearPasswordLoginAttempts(normalizedIdentifier, sanitizedIp)
    const token = await this.createSessionToken(normalizedIdentifier, {
      ip: accessContext?.ip ?? '',
      source: 'password-login',
      userAgent: accessContext?.userAgent,
    })
    await this.persist()
    return this.buildSnapshot(existingAccount, token)
  }

  async setPasswordAfterCode(
    payload: SetPasswordBody,
    accessContext?: Omit<SessionAccessContext, 'source'>,
  ): Promise<AppSnapshot> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    const challenge = this.assertValidChallenge(normalizedIdentifier, payload.code)
    const existingAccount = this.findAccount(normalizedIdentifier)

    if (!existingAccount) {
      throw new Error('Аккаунт с таким номером не найден.')
    }

    if (challenge.purpose !== 'password-setup') {
      throw new Error('Для этого шага нужен код подтверждения установки пароля.')
    }

    if (hasAccountPassword(existingAccount)) {
      throw new Error('Для этого аккаунта уже задан пароль. Войдите по паролю.')
    }

    assertValidPassword(payload.password, payload.confirmPassword)
    existingAccount.passwordHash = await hashPassword(payload.password)
    existingAccount.passwordSetAt = new Date().toISOString()
    this.revokeSessionsForIdentifier(normalizedIdentifier)
    this.clearPasswordLoginAttempts(normalizedIdentifier)

    const token = await this.createSessionToken(normalizedIdentifier, {
      ip: accessContext?.ip ?? '',
      source: 'password-setup',
      userAgent: accessContext?.userAgent,
    })
    this.clearChallenge(normalizedIdentifier)
    await this.persist()
    return this.buildSnapshot(existingAccount, token)
  }

  async resetPasswordAfterCode(
    payload: ResetPasswordBody,
    accessContext?: Omit<SessionAccessContext, 'source'>,
  ): Promise<AppSnapshot> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    const challenge = this.assertValidChallenge(normalizedIdentifier, payload.code)
    const existingAccount = this.findAccount(normalizedIdentifier)

    if (!existingAccount) {
      throw new Error('Аккаунт с таким номером не найден.')
    }

    if (challenge.purpose !== 'password-reset') {
      throw new Error('Для этого шага нужен код подтверждения сброса пароля.')
    }

    assertValidPassword(payload.password, payload.confirmPassword)
    existingAccount.passwordHash = await hashPassword(payload.password)
    existingAccount.passwordSetAt = new Date().toISOString()
    this.revokeSessionsForIdentifier(normalizedIdentifier)
    this.clearPasswordLoginAttempts(normalizedIdentifier)

    const token = await this.createSessionToken(normalizedIdentifier, {
      ip: accessContext?.ip ?? '',
      source: 'password-reset',
      userAgent: accessContext?.userAgent,
    })
    this.clearChallenge(normalizedIdentifier)
    await this.persist()
    return this.buildSnapshot(existingAccount, token)
  }

  getSnapshotByToken(token: string) {
    const account = this.findAccountByToken(token)
    return account ? this.buildSnapshot(account, token) : null
  }

  async recordSessionAccessByToken(token: string, context: SessionAccessContext) {
    const account = this.findAccountByToken(token)
    if (!account) {
      return false
    }

    return this.recordIpAccessEvent(account.identifier, context)
  }

  getDirectDialogHistory(
    token: string,
    dialogId: number,
    beforeMessageId: number,
  ): DirectDialogHistoryResponse {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const chat = materializeFullChats(this.database, account.identifier).find(
      (candidate) => candidate.id === dialogId,
    )
    if (!chat) {
      throw new Error('Чат не найден.')
    }

    const historySlice = buildOlderHistorySlice(chat.messages, beforeMessageId)

    return {
      dialogId,
      hasMore: historySlice.hasMore,
      messages: historySlice.items,
    }
  }

  getGroupHistory(token: string, groupId: number, beforeMessageId: number): GroupHistoryResponse {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = materializeFullGroups(this.database, account.identifier).find(
      (candidate) => candidate.id === groupId,
    )
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    const historySlice = buildOlderHistorySlice(group.messages, beforeMessageId)

    return {
      groupId,
      hasMore: historySlice.hasMore,
      messages: historySlice.items,
    }
  }

  getSubscriptionChannelHistory(
    token: string,
    channelId: number,
    beforePostId: number,
  ): SubscriptionChannelHistoryResponse {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = materializeFullSubscriptionChannels(this.database, account.identifier).find(
      (candidate) => candidate.id === channelId,
    )
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const historySlice = buildOlderHistorySlice(channel.posts, beforePostId)

    return {
      channelId,
      hasMore: historySlice.hasMore,
      posts: historySlice.items,
    }
  }

  getIdentifierByToken(token: string) {
    return this.database.sessions.find((session) => session.token === token)?.identifier ?? null
  }

  listTokensByIdentifier(identifier: string) {
    return this.database.sessions
      .filter((session) => session.identifier === identifier)
      .map((session) => session.token)
  }

  private getPasswordAttemptRecord(identifier: string, ip?: string | null) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const sanitizedIp = sanitizeIpAddress(ip ?? undefined)
    if (!normalizedIdentifier || !sanitizedIp) {
      return null
    }

    return (
      this.database.passwordAuthAttempts.find(
        (entry) => entry.identifier === normalizedIdentifier && entry.ip === sanitizedIp,
      ) ?? null
    )
  }

  private getPasswordAuthBlock(identifier: string, ip?: string | null) {
    return getPasswordAttemptBlockState(this.getPasswordAttemptRecord(identifier, ip))
  }

  shouldRequirePasswordLoginCaptcha(identifier: string, ip?: string | null) {
    return shouldRequirePasswordCaptcha(this.getPasswordAttemptRecord(identifier, ip))
  }

  private registerFailedPasswordLoginAttempt(identifier: string, ip?: string | null) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const sanitizedIp = sanitizeIpAddress(ip ?? undefined)
    if (!normalizedIdentifier || !sanitizedIp) {
      return false
    }

    const existingRecord = this.getPasswordAttemptRecord(normalizedIdentifier, sanitizedIp)
    const { didTriggerBlock, record } = registerFailedPasswordAttempt(existingRecord, {
      identifier: normalizedIdentifier,
      ip: sanitizedIp,
    })

    if (existingRecord) {
      Object.assign(existingRecord, record)
    } else {
      this.database.passwordAuthAttempts.push(record)
    }

    return didTriggerBlock
  }

  private clearPasswordLoginAttempts(identifier: string, ip?: string | null) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!normalizedIdentifier) {
      return
    }

    const sanitizedIp = sanitizeIpAddress(ip ?? undefined)
    this.database.passwordAuthAttempts = this.database.passwordAuthAttempts.filter((entry) => {
      if (entry.identifier !== normalizedIdentifier) {
        return true
      }

      if (!sanitizedIp) {
        return false
      }

      return entry.ip !== sanitizedIp
    })
  }

  private revokeSessionsForIdentifier(identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!normalizedIdentifier) {
      return
    }

    this.database.sessions = this.database.sessions.filter(
      (session) => session.identifier !== normalizedIdentifier,
    )
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

  getAdminActorByToken(token: string) {
    const account = this.findAccountByToken(token)
    const role = sanitizeStaffRole(account?.staffRole)

    return account && role
      ? {
          displayName: buildAccountDisplayLabel(account),
          identifier: account.identifier,
          permissions: [],
          role,
        }
      : null
  }

  getAdminDashboard(): AdminDashboardResponse {
    const totalUsers = this.database.accounts.length
    const blockedUsers = this.database.accounts.filter((account) => isAccountBlocked(account)).length
    let premiumUsers = 0
    let monthlyPremiumUsers = 0
    let yearlyPremiumUsers = 0

    for (const account of this.database.accounts) {
      if (!hasActivePremium(account.premium, account.premiumExpiresAt)) continue
      premiumUsers += 1

      const expiresAt = account.premiumExpiresAt ? Date.parse(account.premiumExpiresAt) : NaN
      const daysLeft = Number.isNaN(expiresAt)
        ? 30
        : Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))

      if (daysLeft >= 180) {
        yearlyPremiumUsers += 1
      } else {
        monthlyPremiumUsers += 1
      }
    }

    const openReports = this.database.adminReports.filter((report) => report.status === 'open').length
    const closedReports = this.database.adminReports.filter((report) => report.status === 'closed').length
    const mediaItems = this.collectAdminMediaItems()
    const totalChannels = new Set(this.database.managedChannels.map((channel) => buildAdminChannelAggregateKey(channel))).size
    const totalGroups = new Set(this.database.groups.map((group) => buildAdminGroupAggregateKey(group))).size
    const threadIds = new Set<string>()

    for (const message of this.database.groupMessages) {
      const group = this.findGroup(message.ownerIdentifier, message.groupId)
      if (!group) continue
      if (compactThreadComments(message.threadComments).length === 0) continue
      threadIds.add(buildAdminGroupThreadKey(group, message))
    }

    for (const post of this.database.subscriptionPosts) {
      const channel = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
      if (!channel) continue
      if (compactThreadComments(post.threadComments).length === 0) continue
      threadIds.add(buildAdminChannelThreadKey(channel, post))
    }

    const usedStorageBytes = this.database.accounts.reduce(
      (total, account) => total + this.getStorageUsage(account.identifier).usedBytes,
      0,
    )

    return {
      metrics: {
        blockedUsers,
        closedReports,
        monthlyPremiumUsers,
        openReports,
        premiumUsers,
        totalChannels,
        totalGroups,
        totalMediaItems: mediaItems.length,
        totalThreads: threadIds.size,
        totalUsers,
        usedStorageBytes,
        yearlyPremiumUsers,
      },
    }
  }

  adminSearchUsers(query: string) {
    const trimmedQuery = query.trim()
    const normalizedQuery = trimmedQuery.toLowerCase()
    const normalizedIdentifier = normalizeIdentifier(trimmedQuery)
    const digitsQuery = trimmedQuery.replace(/[^\d]/g, '')

    const users = this.database.accounts
      .filter((account) => {
        if (!trimmedQuery) return true

        const displayLabel = buildAccountDisplayLabel(account).toLowerCase()
        const nickname = normalizeNickname(account.nickname ?? '').toLowerCase()
        const accountDigits = account.identifier.replace(/[^\d]/g, '')

        return (
          account.identifier === normalizedIdentifier ||
          (digitsQuery !== '' && accountDigits.includes(digitsQuery)) ||
          displayLabel.includes(normalizedQuery) ||
          nickname.includes(normalizedQuery)
        )
      })
      .sort((left, right) => {
        const blockedDelta = Number(isAccountBlocked(right)) - Number(isAccountBlocked(left))
        if (blockedDelta !== 0) {
          return blockedDelta
        }

        return compareIsoDateDesc(left.lastActiveAt, right.lastActiveAt)
      })
      .slice(0, 20)
      .map((account) => this.buildAdminUserSummary(account))

    return {
      blockedUsers: this.database.accounts.filter((account) => isAccountBlocked(account)).length,
      totalUsers: this.database.accounts.length,
      users,
    }
  }

  adminGetUser(identifier: string) {
    const account = this.findAccountForAdmin(identifier)
    if (!account) {
      throw new Error('Пользователь не найден.')
    }

    return {
      ipSummary: this.buildAdminUserIpSummary(account.identifier),
      user: this.buildAdminUserSummary(account),
    }
  }

  async adminViewUserAvatar(actorToken: string, identifier: string, reason?: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const target = this.findAccountForAdmin(identifier)
    if (!target) {
      throw new Error('Пользователь не найден.')
    }

    const avatarUrl = target.avatarImage?.trim() || null
    if (target.identifier !== actor.identifier) {
      const normalizedReason = sanitizeAdminText(reason, 280)
      await this.appendAdminAuditLog(actor, {
        action: 'admin.user.avatar.view',
        nextValue: {
          avatarUrl,
          identifier: target.identifier,
        },
        reason: normalizedReason || undefined,
        summary: avatarUrl
          ? `Просмотрена аватарка пользователя ${buildAdminAuditAccountLabel(target)}${normalizedReason ? ` · ${normalizedReason}` : ''}`
          : `Проверено отсутствие аватарки у пользователя ${buildAdminAuditAccountLabel(target)}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
        targetId: target.identifier,
        targetType: 'user-avatar',
      })
    }

    return {
      avatarUrl,
    }
  }

  async adminSetUserBlocked(
    actorToken: string,
    identifier: string,
    options: {
      blocked: boolean
      reason?: string
    },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const target = this.findAccountForAdmin(identifier)
    if (!target) {
      throw new Error('Пользователь не найден.')
    }

    if (target.identifier === actor.identifier && options.blocked) {
      throw new Error('Нельзя заблокировать собственный staff-аккаунт.')
    }

    const previousValue = this.buildAdminUserSummary(target)
    const normalizedReason = sanitizeAdminText(options.reason, 280)
    if (options.blocked) {
      target.blockedAt = new Date().toISOString()
      target.blockedReason = normalizedReason || 'Аккаунт заблокирован staff-командой.'
      this.database.sessions = this.database.sessions.filter(
        (session) => session.identifier !== target.identifier,
      )
    } else {
      target.blockedAt = undefined
      target.blockedReason = undefined
    }

    target.lastActiveAt = target.lastActiveAt ?? target.createdAt
    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: options.blocked ? 'admin.user.block' : 'admin.user.unblock',
      nextValue: this.buildAdminUserSummary(target),
      previousValue,
      reason: normalizedReason || undefined,
      summary: `${options.blocked ? 'Заблокирован' : 'Разблокирован'} пользователь ${buildAdminAuditAccountLabel(target)}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: target.identifier,
      targetType: 'user',
    })

    return this.buildAdminUserSummary(target)
  }

  async adminSetUserPremium(
    actorToken: string,
    identifier: string,
    options: {
      durationDays?: number
      enabled: boolean
      reason?: string
    },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const target = this.findAccountForAdmin(identifier)
    if (!target) {
      throw new Error('Пользователь не найден.')
    }

    const previousValue = this.buildAdminUserSummary(target)
    const normalizedReason = sanitizeAdminText(options.reason, 280)
    const durationDays =
      Number.isInteger(options.durationDays) && (options.durationDays ?? 0) > 0
        ? options.durationDays ?? 30
        : 30
    target.premium = options.enabled
    target.premiumExpiresAt = options.enabled ? makePremiumExpiry(durationDays) : ''
    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: options.enabled ? 'admin.user.premium.grant' : 'admin.user.premium.revoke',
      nextValue: this.buildAdminUserSummary(target),
      previousValue,
      reason: normalizedReason || undefined,
      summary: `${options.enabled ? 'Выдан' : 'Снят'} premium для ${buildAdminAuditAccountLabel(target)}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: target.identifier,
      targetType: 'user',
    })

    return this.buildAdminUserSummary(target)
  }

  adminListReports(status?: AdminReportSummary['status']) {
    return this.database.adminReports
      .filter((report) => (status ? report.status === status : true))
      .sort((left, right) => compareIsoDateDesc(left.updatedAt, right.updatedAt))
      .slice(0, 20)
      .map((report) => this.buildAdminReportSummary(report))
  }

  async adminGetReport(actorToken: string, reportId: string): Promise<AdminReportDetailResponse['report']> {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const report = this.findAdminReport(reportId)
    if (!report) {
      throw new Error('Жалоба не найдена.')
    }

    if (isContentReportEntityType(report.entityType)) {
      await this.appendAdminAuditLog(actor, {
        action: 'admin.report.view-content',
        summary: `Открыт контент жалобы ${report.id}`,
        targetId: report.id,
        targetType: 'report',
      })
    }

    return this.buildAdminReportDetail(report)
  }

  async adminViewReportEntity(actorToken: string, reportId: string, reason?: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const report = this.findAdminReport(reportId)
    if (!report) {
      throw new Error('Жалоба не найдена.')
    }

    const previewUrl =
      report.entityType === 'media' || report.entityType === 'avatar' || report.entityType === 'gif'
        ? report.entityKey
        : null
    const normalizedReason = sanitizeAdminText(reason, 280)

    await this.appendAdminAuditLog(actor, {
      action: 'admin.report.view-entity',
      nextValue: {
        previewUrl,
        reportId,
      },
      reason: normalizedReason || undefined,
      summary: `Просмотрено содержимое жалобы ${report.id}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: report.id,
      targetType: 'report',
    })

    return {
      previewUrl,
    }
  }

  async adminAddReportNote(actorToken: string, reportId: string, text: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const report = this.findAdminReport(reportId)
    if (!report) {
      throw new Error('Жалоба не найдена.')
    }

    const noteText = sanitizeAdminText(text, 1500)
    if (!noteText) {
      throw new Error('Нужен текст заметки.')
    }

    report.notes.push(this.createAdminNote(actor, noteText))
    report.updatedAt = new Date().toISOString()
    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: 'admin.report.note',
      summary: `Добавлена внутренняя заметка к жалобе ${report.id}`,
      targetId: report.id,
      targetType: 'report',
    })

    return this.buildAdminReportDetail(report)
  }

  async adminApplyReportAction(
    actorToken: string,
    reportId: string,
    payload: {
      action: AdminReportAction
      note?: string
      reason?: string
    },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const report = this.findAdminReport(reportId)
    if (!report) {
      throw new Error('Жалоба не найдена.')
    }

    const reason = sanitizeAdminText(payload.reason, 500)
    const note = sanitizeAdminText(payload.note, 1500)

    if (note) {
      report.notes.push(this.createAdminNote(actor, note))
    }

    const previousValue = this.buildAdminReportDetail(report)
    if (payload.action === 'restrict_user') {
      const targetIdentifier = report.relatedUserIdentifier ?? (report.entityType === 'user' ? report.entityKey : undefined)
      if (!targetIdentifier) {
        throw new Error('Для этой жалобы не найден пользователь для ограничения.')
      }

      await this.applyAdminUserBlockFromActor(actor, targetIdentifier, reason || `Жалоба ${report.id}`)
    } else if (payload.action === 'hide_entity') {
      await this.applyAdminEntityModeration(actor, report, 'hide', reason)
    } else if (payload.action === 'delete_entity') {
      await this.applyAdminEntityModeration(actor, report, 'delete', reason)
    }

    report.closedAt = new Date().toISOString()
    report.closedByIdentifier = actor.identifier
    report.resolutionAction = payload.action
    report.resolutionReason = reason || undefined
    report.status = 'closed'
    report.updatedAt = report.closedAt
    report.notes.push(
      this.createAdminNote(
        actor,
        `Действие по тикету: ${payload.action}${reason ? ` · ${reason}` : ''}`,
      ),
    )

    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: `admin.report.${payload.action}`,
      nextValue: this.buildAdminReportDetail(report),
      previousValue,
      reason: reason || undefined,
      summary: `Применено действие ${payload.action} к жалобе ${report.id}`,
      targetId: report.id,
      targetType: 'report',
    })

    return this.buildAdminReportDetail(report)
  }

  adminListChannels(query: string) {
    const trimmedQuery = query.trim().toLowerCase()
    const reportCountByHandle = new Map<string, number>()

    for (const report of this.database.adminReports) {
      if (report.entityType !== 'channel') continue
      const handle = sanitizeChannelDirectLink(report.entityKey) || report.entityKey
      reportCountByHandle.set(handle, (reportCountByHandle.get(handle) ?? 0) + 1)
    }

    const buildAdminLinkedUser = (identifier: string): AdminLinkedUser => {
      const account = this.findAccount(identifier)
      return buildAdminLinkedUserSummary(account ?? undefined, identifier)
    }

    const channelsByKey = new Map<string, AdminManagedChannelSummary>()

    for (const channel of this.database.managedChannels) {
        const handle = sanitizeChannelDirectLink(channel.directLink) || channel.directLink
        const copies = this.database.subscriptionChannels.filter(
          (item) => (sanitizeChannelDirectLink(item.handle) || item.handle) === handle,
        )
        const posts = this.database.subscriptionPosts.filter(
          (post) => {
            const parent = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
            return Boolean(parent && (sanitizeChannelDirectLink(parent.handle) || parent.handle) === handle)
          },
        )
        const uniquePosts = [...new Map(
          posts.map((post) => {
            const parent = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
            const key = parent ? buildAdminChannelThreadKey(parent, post) : `${post.ownerIdentifier}:${post.channelId}:${post.id}`
            return [key, post] as const
          }),
        ).values()]
        const latestActivityAt = [
          ...copies.map((item) => item.latestActivityAt),
          ...uniquePosts.map((post) => post.createdAt),
          ...uniquePosts.flatMap((post) => compactThreadComments(post.threadComments).map((comment) => comment.createdAt)),
        ]
          .filter((value): value is string => Boolean(value))
          .sort(compareIsoDateDesc)[0]

        const summary: AdminManagedChannelSummary = {
          csvFileName: `channel-${sanitizeExportFileName(channel.title) || channel.id}-${formatExportDateStamp()}.csv`,
          handle,
          id: channel.id,
          latestActivityAt,
          owner: buildAdminLinkedUser(channel.ownerIdentifier),
          postsCount: uniquePosts.length,
          readers: new Set(copies.map((item) => item.ownerIdentifier)).size,
          relatedReportCount: reportCountByHandle.get(handle) ?? 0,
          status: channel.status,
          title: channel.title,
          visibility: channel.visibility,
        }
        const key = buildAdminChannelAggregateKey(channel)
        const existing = channelsByKey.get(key)
        if (!existing || compareIsoDateDesc(summary.latestActivityAt, existing.latestActivityAt) < 0) {
          channelsByKey.set(key, summary)
        }
      }

    const channels = [...channelsByKey.values()]
      .filter((channel) => {
        if (!trimmedQuery) return true
        return (
          channel.title.toLowerCase().includes(trimmedQuery) ||
          channel.handle.toLowerCase().includes(trimmedQuery) ||
          channel.owner.displayName.toLowerCase().includes(trimmedQuery) ||
          channel.owner.identifier.toLowerCase().includes(trimmedQuery)
        )
      })
      .sort((left, right) => compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt))

    return channels.slice(0, 20)
  }

  adminListGroups(query: string) {
    const trimmedQuery = query.trim().toLowerCase()
    const reportCountBySharedId = new Map<string, number>()

    for (const report of this.database.adminReports) {
      if (report.entityType !== 'group') continue
      reportCountBySharedId.set(report.entityKey, (reportCountBySharedId.get(report.entityKey) ?? 0) + 1)
    }

    const buildAdminLinkedUser = (identifier: string): AdminLinkedUser => {
      const account = this.findAccount(identifier)
      return buildAdminLinkedUserSummary(account ?? undefined, identifier)
    }

    const groupKeys = [...new Set(this.database.groups.map((group) => buildAdminGroupAggregateKey(group)))]
    const groups = groupKeys
      .map((groupKey): AdminManagedGroupSummary | null => {
        const copies = this.database.groups.filter((group) => buildAdminGroupAggregateKey(group) === groupKey)
        const primaryGroup = [...copies].sort((left, right) => compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt))[0]
        if (!primaryGroup) return null

        const ownerIdentifier = getAdminGroupCanonicalOwnerIdentifier(primaryGroup)
        const messages = this.database.groupMessages.filter((message) =>
          copies.some(
            (group) =>
              group.ownerIdentifier === message.ownerIdentifier &&
              group.id === message.groupId,
          ),
        )
        const latestActivityAt = [
          ...copies.map((group) => group.latestActivityAt),
          ...messages.map((message) => message.createdAt),
          ...messages.flatMap((message) =>
            compactThreadComments(message.threadComments).map((comment) => comment.createdAt),
          ),
        ]
          .filter((value): value is string => Boolean(value))
          .sort(compareIsoDateDesc)[0]

        return {
          csvFileName: `group-${sanitizeExportFileName(primaryGroup.title) || 'group'}-${formatExportDateStamp()}.csv`,
          id: groupKey,
          latestActivityAt,
          members: Math.max(...copies.map((group) => group.members), 0),
          owner: buildAdminLinkedUser(ownerIdentifier),
          relatedReportCount: copies.reduce((count, group) => {
            const sharedId = group.sharedId?.trim()
            return count + (sharedId ? reportCountBySharedId.get(sharedId) ?? 0 : 0)
          }, 0),
          title: primaryGroup.title,
        }
      })
      .filter((group): group is AdminManagedGroupSummary => Boolean(group))
      .filter((group) => {
        if (!trimmedQuery) return true
        return (
          group.title.toLowerCase().includes(trimmedQuery) ||
          group.id.toLowerCase().includes(trimmedQuery) ||
          group.owner.displayName.toLowerCase().includes(trimmedQuery) ||
          group.owner.identifier.toLowerCase().includes(trimmedQuery)
        )
      })
      .sort((left, right) => compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt))

    return groups.slice(0, 20)
  }

  adminListThreads(query: string) {
    const trimmedQuery = query.trim().toLowerCase()
    const threadsById = new Map<string, AdminThreadSummary>()

    const buildAdminLinkedUser = (identifier: string): AdminLinkedUser => {
      const account = this.findAccount(identifier)
      return buildAdminLinkedUserSummary(account ?? undefined, identifier)
    }

    const upsertThread = (summary: AdminThreadSummary) => {
      const existing = threadsById.get(summary.id)
      if (!existing || compareIsoDateDesc(summary.latestActivityAt, existing.latestActivityAt) < 0) {
        threadsById.set(summary.id, summary)
      }
    }

    for (const message of this.database.groupMessages) {
      const group = this.findGroup(message.ownerIdentifier, message.groupId)
      if (!group) continue

      const comments = compactThreadComments(message.threadComments)
      if (comments.length === 0) continue
      const rootAuthorIdentifier =
        normalizeIdentifier(
          group.participants.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
        ) ||
        normalizeIdentifier(group.creatorIdentifier ?? '') ||
        message.ownerIdentifier

      upsertThread({
        commentCount: comments.length,
        contextLabel: `Группа: ${group.title}`,
        csvFileName: `thread-${sanitizeExportFileName(group.title) || 'group'}-${message.id}-${formatExportDateStamp()}.csv`,
        id: buildAdminGroupThreadKey(group, message),
        kind: 'group',
        latestActivityAt: comments.at(-1)?.createdAt ?? message.createdAt,
        owner: buildAdminLinkedUser(rootAuthorIdentifier),
        relatedReportCount: 0,
        sourceGroupId: buildAdminGroupAggregateKey(group),
        sourceText: message.text || message.attachment?.fileName || 'Без текста',
        title: message.text || message.attachment?.fileName || 'Сообщение без текста',
      })
    }

    for (const post of this.database.subscriptionPosts) {
      const channel = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
      if (!channel) continue
      const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
      const managedChannel = this.findManagedChannelByHandle(normalizedHandle)

      const comments = compactThreadComments(post.threadComments)
      if (comments.length === 0) continue

      upsertThread({
        commentCount: comments.length,
        contextLabel: `Канал: ${channel.title}`,
        csvFileName: `thread-${sanitizeExportFileName(channel.title) || 'channel'}-${post.id}-${formatExportDateStamp()}.csv`,
        id: buildAdminChannelThreadKey(channel, post),
        kind: 'channel',
        latestActivityAt: comments.at(-1)?.createdAt ?? post.createdAt,
        owner: buildAdminLinkedUser(managedChannel?.ownerIdentifier ?? post.ownerIdentifier),
        relatedReportCount: 0,
        sourceChannelHandle: normalizedHandle,
        sourceText: post.text || post.attachment?.fileName || 'Без текста',
        title: post.text || post.attachment?.fileName || 'Пост без текста',
      })
    }

    return [...threadsById.values()]
      .filter((thread) => {
        if (!trimmedQuery) return true
        return (
          thread.title.toLowerCase().includes(trimmedQuery) ||
          thread.id.toLowerCase().includes(trimmedQuery) ||
          thread.sourceText.toLowerCase().includes(trimmedQuery) ||
          thread.owner.displayName.toLowerCase().includes(trimmedQuery) ||
          thread.owner.identifier.toLowerCase().includes(trimmedQuery)
        )
      })
      .sort((left, right) => compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt))
      .slice(0, 20)
  }

  adminListDialogs(ownerIdentifierInput: string, query: string) {
    const owner = this.findAccountForAdmin(ownerIdentifierInput)
    if (!owner) {
      return []
    }

    const trimmedQuery = query.trim().toLowerCase()
    const dialogs = this.database.dialogs
      .filter(
        (dialog) =>
          dialog.ownerIdentifier === owner.identifier &&
          normalizeIdentifier(dialog.phone) !== owner.identifier,
      )
      .map((dialog): AdminDialogSummary | null => {
        const peerIdentifier = normalizeIdentifier(dialog.phone)
        if (!peerIdentifier) {
          return null
        }

        const peer = this.findAccountForAdmin(peerIdentifier)
        const messages = this.database.dialogMessages
          .filter(
            (message) =>
              message.ownerIdentifier === owner.identifier &&
              message.dialogId === dialog.id,
          )
          .sort((left, right) => compareIsoDateDesc(right.createdAt, left.createdAt))

        const firstMessageAt = messages[0]?.createdAt
        const latestMessageAt = messages.at(-1)?.createdAt
        const preview =
          messages.at(-1)?.text || messages.at(-1)?.attachment?.fileName || 'Без сообщений'
        const summary: AdminDialogSummary = {
          csvFileName: `dialog-${sanitizeExportFileName(owner.displayName)}-${sanitizeExportFileName(peer?.displayName ?? dialog.title)}-${formatExportDateStamp()}.csv`,
          firstMessageAt,
          messageCount: messages.length,
          owner: {
            displayName: buildAccountDisplayLabel(owner),
            identifier: owner.identifier,
          },
          peer: {
            displayName: peer ? buildAccountDisplayLabel(peer) : dialog.title,
            identifier: peerIdentifier,
          },
          preview,
          sharedKey: [owner.identifier, peerIdentifier].sort().join('::'),
          updatedAt: latestMessageAt,
        }

        if (!trimmedQuery) {
          return summary
        }

        const searchable = [
          summary.peer.displayName,
          summary.peer.identifier,
          preview,
        ].join(' ').toLowerCase()

        return searchable.includes(trimmedQuery) ? summary : null
      })
      .filter((dialog): dialog is AdminDialogSummary => Boolean(dialog))
      .sort((left, right) => compareIsoDateDesc(left.updatedAt, right.updatedAt))

    return dialogs.slice(0, 20)
  }

  async adminExportChannelCsv(actorToken: string, handle: string, reason: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    const channel = this.adminListChannels(normalizedHandle).find((item) => item.handle === normalizedHandle)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const posts = this.database.subscriptionPosts.filter((post) => {
      const parent = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
      return Boolean(parent && (sanitizeChannelDirectLink(parent.handle) || parent.handle) === normalizedHandle)
    })
    const uniquePosts = [...new Map(
      posts.map((post) => {
        const parent = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
        const key = parent ? buildAdminChannelThreadKey(parent, post) : `${post.ownerIdentifier}:${post.channelId}:${post.id}`
        return [key, post] as const
      }),
    ).values()]

    const csv = [
      ['Когда', 'Тип', 'Автор', 'ID автора', 'Текст', 'Файл'],
      ...uniquePosts.flatMap((post) => {
        const parent = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
        const threadKey = parent ? buildAdminChannelThreadKey(parent, post) : `${post.ownerIdentifier}:${post.channelId}:${post.id}`
        const normalizedHandleForPost = parent ? sanitizeChannelDirectLink(parent.handle) || parent.handle : normalizedHandle
        const managedChannel = this.findManagedChannelByHandle(normalizedHandleForPost)
        const authorIdentifier = managedChannel?.ownerIdentifier ?? post.ownerIdentifier
        const author = this.findAccount(authorIdentifier)
        const rows: string[][] = [[
          post.createdAt ?? '',
          'post',
          author ? buildAccountDisplayLabel(author) : authorIdentifier,
          authorIdentifier,
          post.text,
          post.attachment?.fileName ?? '',
        ]]

        const uniqueComments = [...new Map(
          compactThreadComments(post.threadComments).map((comment) => {
            const key = buildAdminThreadCommentAggregateKey(threadKey, authorIdentifier, comment)
            return [key, comment] as const
          }),
        ).values()]

        for (const comment of uniqueComments) {
          const commentAuthorIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier
          const commentAuthor = this.findAccount(commentAuthorIdentifier)
          rows.push([
            comment.createdAt ?? '',
            'comment',
            commentAuthor ? buildAccountDisplayLabel(commentAuthor) : commentAuthorIdentifier,
            commentAuthorIdentifier,
            comment.text,
            comment.attachment?.fileName ?? '',
          ])
        }

        return rows
      }),
    ]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
      .join('\n')

    const normalizedReason = sanitizeAdminText(reason, 280)
    await this.appendAdminAuditLog(actor, {
      action: 'admin.channel.export.csv',
      reason: normalizedReason || undefined,
      summary: `Экспортирован CSV канала @${normalizedHandle}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: normalizedHandle,
      targetType: 'channel',
    })

    return {
      csv,
      fileName: channel.csvFileName,
    }
  }

  async adminExportGroupCsv(actorToken: string, groupId: string, reason: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const copies = this.database.groups.filter((group) => buildAdminGroupAggregateKey(group) === groupId)
    const primaryGroup = copies[0]
    if (!primaryGroup) {
      throw new Error('Группа не найдена.')
    }

    const messages = this.database.groupMessages.filter((message) =>
      copies.some((group) => group.ownerIdentifier === message.ownerIdentifier && group.id === message.groupId),
    )
    const uniqueMessages = [...new Map(
      messages.map((message) => {
        const parentGroup = this.findGroup(message.ownerIdentifier, message.groupId)
        const key = parentGroup ? buildAdminGroupThreadKey(parentGroup, message) : `${message.ownerIdentifier}:${message.groupId}:${message.id}`
        return [key, message] as const
      }),
    ).values()]

    const csv = [
      ['Когда', 'Тип', 'Автор', 'ID автора', 'Текст', 'Файл'],
      ...uniqueMessages.flatMap((message) => {
        const parentGroup = this.findGroup(message.ownerIdentifier, message.groupId) ?? primaryGroup
        const messageKey = buildAdminGroupThreadKey(parentGroup, message)
        const messageAuthorIdentifier =
          normalizeIdentifier(
            parentGroup.participants.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
          ) ||
          normalizeIdentifier(parentGroup.creatorIdentifier ?? '') ||
          message.ownerIdentifier
        const author = this.findAccount(messageAuthorIdentifier)
        const rows: string[][] = [[
          message.createdAt ?? '',
          'message',
          author ? buildAccountDisplayLabel(author) : messageAuthorIdentifier,
          messageAuthorIdentifier,
          message.text,
          message.attachment?.fileName ?? '',
        ]]

        const uniqueComments = [...new Map(
          compactThreadComments(message.threadComments).map((comment) => {
            const key = buildAdminThreadCommentAggregateKey(messageKey, messageAuthorIdentifier, comment)
            return [key, comment] as const
          }),
        ).values()]

        for (const comment of uniqueComments) {
          const commentAuthorIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier
          const commentAuthor = this.findAccount(commentAuthorIdentifier)
          rows.push([
            comment.createdAt ?? '',
            'thread-comment',
            commentAuthor ? buildAccountDisplayLabel(commentAuthor) : commentAuthorIdentifier,
            commentAuthorIdentifier,
            comment.text,
            comment.attachment?.fileName ?? '',
          ])
        }

        return rows
      }),
    ]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
      .join('\n')

    const normalizedReason = sanitizeAdminText(reason, 280)
    await this.appendAdminAuditLog(actor, {
      action: 'admin.group.export.csv',
      reason: normalizedReason || undefined,
      summary: `Экспортирован CSV группы ${primaryGroup.title}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: groupId,
      targetType: 'group',
    })

    return {
      csv,
      fileName: `group-${sanitizeExportFileName(primaryGroup.title) || 'group'}-${formatExportDateStamp()}.csv`,
    }
  }

  async adminExportThreadCsv(actorToken: string, threadId: string, reason: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const groupThread = this.adminListThreads('').find((thread) => thread.id === threadId)
    if (!groupThread) {
      throw new Error('Тред не найден.')
    }

    const csvRows: string[][] = [['Когда', 'Тип', 'Автор', 'ID автора', 'Текст', 'Файл']]

    if (threadId.startsWith('admin-group-thread:')) {
      const message = this.database.groupMessages.find((candidate) => {
        const group = this.findGroup(candidate.ownerIdentifier, candidate.groupId)
        return Boolean(group && buildAdminGroupThreadKey(group, candidate) === threadId)
      })
      if (!message) throw new Error('Тред группы не найден.')

      csvRows.push([
        message.createdAt ?? '',
        'root-message',
        groupThread.owner.displayName,
        groupThread.owner.identifier,
        message.text,
        message.attachment?.fileName ?? '',
      ])
      for (const comment of compactThreadComments(message.threadComments)) {
        const commentAuthorIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier
        const commentAuthor = this.findAccount(commentAuthorIdentifier)
        csvRows.push([
          comment.createdAt ?? '',
          'thread-comment',
          commentAuthor ? buildAccountDisplayLabel(commentAuthor) : commentAuthorIdentifier,
          commentAuthorIdentifier,
          comment.text,
          comment.attachment?.fileName ?? '',
        ])
      }
    } else {
      const post = this.database.subscriptionPosts.find((candidate) => {
        const channel = this.findSubscriptionChannel(candidate.ownerIdentifier, candidate.channelId)
        return Boolean(channel && buildAdminChannelThreadKey(channel, candidate) === threadId)
      })
      if (!post) throw new Error('Тред канала не найден.')

      csvRows.push([
        post.createdAt ?? '',
        'root-post',
        groupThread.owner.displayName,
        groupThread.owner.identifier,
        post.text,
        post.attachment?.fileName ?? '',
      ])
      for (const comment of compactThreadComments(post.threadComments)) {
        const commentAuthorIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier
        const commentAuthor = this.findAccount(commentAuthorIdentifier)
        csvRows.push([
          comment.createdAt ?? '',
          'thread-comment',
          commentAuthor ? buildAccountDisplayLabel(commentAuthor) : commentAuthorIdentifier,
          commentAuthorIdentifier,
          comment.text,
          comment.attachment?.fileName ?? '',
        ])
      }
    }

    const normalizedReason = sanitizeAdminText(reason, 280)
    await this.appendAdminAuditLog(actor, {
      action: 'admin.thread.export.csv',
      reason: normalizedReason || undefined,
      summary: `Экспортирован CSV треда ${threadId}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: threadId,
      targetType: 'thread',
    })

    return {
      csv: csvRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n'),
      fileName: groupThread.csvFileName,
    }
  }

  adminLookupDialog(ownerIdentifierInput: string, peerIdentifierInput: string): AdminDialogSummary | null {
    const owner = this.findAccountForAdmin(ownerIdentifierInput)
    const peer = this.findAccountForAdmin(peerIdentifierInput)
    if (!owner || !peer) {
      return null
    }

    return (
      this.adminListDialogs(owner.identifier, peer.identifier).find(
        (dialog) => normalizeIdentifier(dialog.peer.identifier) === peer.identifier,
      ) ?? null
    )
  }

  async adminExportDialogCsv(actorToken: string, sharedKey: string, reason: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const [ownerIdentifier, peerIdentifier] = sharedKey.split('::')
    const dialog = this.adminLookupDialog(ownerIdentifier, peerIdentifier)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const ownerDialog = this.database.dialogs.find(
      (item) =>
        item.ownerIdentifier === dialog.owner.identifier &&
        normalizeIdentifier(item.phone) === dialog.peer.identifier,
    )
    if (!ownerDialog) {
      throw new Error('Диалог не найден.')
    }

    const messages = this.database.dialogMessages
      .filter(
        (message) =>
          message.ownerIdentifier === dialog.owner.identifier &&
          message.dialogId === ownerDialog.id,
      )
      .sort((left, right) => compareIsoDateDesc(right.createdAt, left.createdAt))

    const csv = [
      ['Когда', 'Автор', 'ID автора', 'Текст', 'Файл'],
      ...messages.map((message) => {
        const authorIdentifier =
          message.author === 'me' ? dialog.owner.identifier : dialog.peer.identifier
        const author = this.findAccount(authorIdentifier)
        return [
          message.createdAt ?? '',
          author ? buildAccountDisplayLabel(author) : authorIdentifier,
          authorIdentifier,
          message.text,
          message.attachment?.fileName ?? '',
        ]
      }),
    ]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
      .join('\n')

    const normalizedReason = sanitizeAdminText(reason, 280)
    await this.appendAdminAuditLog(actor, {
      action: 'admin.dialog.export.csv',
      reason: normalizedReason || undefined,
      summary: `Экспортирован CSV диалога ${buildAdminAuditAccountLabel(this.findAccountForAdmin(dialog.owner.identifier) ?? { displayName: dialog.owner.displayName, identifier: dialog.owner.identifier, nickname: '', surname: '' })} ↔ ${buildAdminAuditAccountLabel(this.findAccountForAdmin(dialog.peer.identifier) ?? { displayName: dialog.peer.displayName, identifier: dialog.peer.identifier, nickname: '', surname: '' })}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: dialog.sharedKey,
      targetType: 'dialog',
    })

    return {
      csv,
      fileName: dialog.csvFileName,
    }
  }

  async adminExportLegalArchive(actorToken: string, body: AdminLegalExportBody) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const target = this.findAccountForAdmin(body.targetIdentifier)
    if (!target) {
      throw new Error('Пользователь для выгрузки не найден.')
    }

    const normalizedReason = sanitizeAdminText(body.reason, 500)
    if (!normalizedReason) {
      throw new Error('Нужно указать основание для выгрузки.')
    }

    const fromTimestamp = parseIsoDate(body.from)
    const toTimestamp = parseIsoDate(body.to)
    const includeMedia = Boolean(body.includeMedia)
    const archiveEntries: Record<string, Uint8Array> = {}
    const mediaFailures: Array<{ error: string; fileName: string; mediaUrl: string }> = []
    const threadRows: Array<{
      commentCount: number
      contextLabel: string
      id: string
      kind: 'group' | 'channel'
      latestActivityAt?: string
      ownerIdentifier: string
      title: string
    }> = []

    const registerJson = (pathname: string, payload: unknown) => {
      archiveEntries[pathname] = toJsonBuffer(payload)
    }

    const registerCsv = (pathname: string, rows: unknown[][]) => {
      archiveEntries[pathname] = toTextBuffer(buildCsv(rows))
    }

    const fileNameCounters = new Map<string, number>()
    const nextArchiveMediaPath = (fileName: string) => {
      const extension = extname(fileName).toLowerCase()
      const basename = sanitizeExportFileName(fileName.slice(0, fileName.length - extension.length) || 'media') || 'media'
      const counterKey = `${basename}${extension}`
      const nextIndex = (fileNameCounters.get(counterKey) ?? 0) + 1
      fileNameCounters.set(counterKey, nextIndex)
      return nextIndex === 1
        ? `media/${basename}${extension}`
        : `media/${basename}-${nextIndex}${extension}`
    }

    const sortByCreatedAtAsc = <T extends { createdAt?: string }>(items: T[]) =>
      [...items].sort((left, right) => (parseIsoDate(left.createdAt) ?? 0) - (parseIsoDate(right.createdAt) ?? 0))

    const dialogExports = new Map<
      string,
      {
        dialogId: number
        ownerIdentifier: string
        peerIdentifier: string
      }
    >()

    for (const dialog of this.database.dialogs) {
      const peerIdentifier = normalizeIdentifier(dialog.phone)
      if (!peerIdentifier || peerIdentifier === dialog.ownerIdentifier) {
        continue
      }

      if (dialog.ownerIdentifier !== target.identifier && peerIdentifier !== target.identifier) {
        continue
      }

      const sharedKey = [dialog.ownerIdentifier, peerIdentifier].sort().join('::')
      const currentValue = dialogExports.get(sharedKey)
      if (!currentValue || dialog.ownerIdentifier === target.identifier) {
        dialogExports.set(sharedKey, {
          dialogId: dialog.id,
          ownerIdentifier: dialog.ownerIdentifier,
          peerIdentifier,
        })
      }
    }

    const dialogManifest: Array<{
      fileBaseName: string
      messageCount: number
      ownerIdentifier: string
      peerIdentifier: string
      sharedKey: string
    }> = []

    for (const [sharedKey, exportTarget] of dialogExports.entries()) {
      const ownerAccount = this.findAccount(exportTarget.ownerIdentifier)
      const peerAccount = this.findAccount(exportTarget.peerIdentifier)
      const messages = sortByCreatedAtAsc(
        this.database.dialogMessages.filter(
          (message) =>
            message.ownerIdentifier === exportTarget.ownerIdentifier &&
            message.dialogId === exportTarget.dialogId &&
            isTimestampWithinRange(message.createdAt, fromTimestamp, toTimestamp),
        ),
      )

      const fileBaseName = `dialog-${sanitizeExportFileName(ownerAccount ? buildAccountDisplayLabel(ownerAccount) : exportTarget.ownerIdentifier)}-${sanitizeExportFileName(peerAccount ? buildAccountDisplayLabel(peerAccount) : exportTarget.peerIdentifier)}`
      const rows: unknown[][] = [['Когда', 'Автор', 'ID автора', 'Текст', 'Файл', 'Media URL', 'Reply To', 'Read At']]
      const payloadMessages = messages.map((message) => {
        const authorIdentifier =
          message.author === 'me' ? exportTarget.ownerIdentifier : exportTarget.peerIdentifier
        const author = this.findAccount(authorIdentifier)
        rows.push([
          message.createdAt ?? '',
          author ? buildAccountDisplayLabel(author) : authorIdentifier,
          authorIdentifier,
          message.text,
          message.attachment?.fileName ?? '',
          message.attachment?.mediaUrl ?? '',
          message.replyTo?.text ?? '',
          message.readAt ?? '',
        ])

        return {
          attachment: message.attachment ?? null,
          authorDisplayName: author ? buildAccountDisplayLabel(author) : authorIdentifier,
          authorIdentifier,
          createdAt: message.createdAt,
          deliveryId: message.deliveryId,
          id: message.id,
          readAt: message.readAt,
          replyTo: message.replyTo ?? null,
          text: message.text,
        }
      })

      registerJson(`dialogs/${fileBaseName}.json`, {
        messageCount: payloadMessages.length,
        owner: ownerAccount ? this.buildAdminUserSummary(ownerAccount) : exportTarget.ownerIdentifier,
        peer: peerAccount ? this.buildAdminUserSummary(peerAccount) : exportTarget.peerIdentifier,
        sharedKey,
        messages: payloadMessages,
      })
      registerCsv(`dialogs/${fileBaseName}.csv`, rows)
      dialogManifest.push({
        fileBaseName,
        messageCount: payloadMessages.length,
        ownerIdentifier: exportTarget.ownerIdentifier,
        peerIdentifier: exportTarget.peerIdentifier,
        sharedKey,
      })
    }

    const relevantGroupIds = new Set<string>()
    for (const group of this.database.groups) {
      const participantIdentifiers = (group.participants ?? []).map((participant) =>
        normalizeIdentifier(participant.identifier ?? ''),
      )
      const creatorIdentifier = normalizeIdentifier(group.creatorIdentifier ?? '') || group.ownerIdentifier
      if (
        normalizeIdentifier(group.ownerIdentifier) === target.identifier ||
        creatorIdentifier === target.identifier ||
        participantIdentifiers.includes(target.identifier)
      ) {
        relevantGroupIds.add(this.getSharedGroupId(group))
      }
    }
    for (const message of this.database.groupMessages) {
      const group = this.findGroup(message.ownerIdentifier, message.groupId)
      if (!group) continue
      const authorIdentifier =
        normalizeIdentifier(
          group.participants?.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
        ) ||
        normalizeIdentifier(group.creatorIdentifier ?? '') ||
        message.ownerIdentifier
      if (
        authorIdentifier === target.identifier ||
        compactThreadComments(message.threadComments).some(
          (comment) => normalizeIdentifier(comment.authorIdentifier ?? '') === target.identifier,
        )
      ) {
        relevantGroupIds.add(this.getSharedGroupId(group))
      }
    }

    const groupManifest: Array<{ fileBaseName: string; groupId: string; messageCount: number; title: string }> = []
    for (const groupId of relevantGroupIds) {
      const copies = this.listGroupCopies(groupId)
      const primaryGroup = copies[0]
      if (!primaryGroup) continue

      const messages = this.database.groupMessages.filter((message) =>
        copies.some((group) => group.ownerIdentifier === message.ownerIdentifier && group.id === message.groupId),
      )
      const uniqueMessages = sortByCreatedAtAsc(
        [...new Map(
          messages.map((message) => {
            const parentGroup = this.findGroup(message.ownerIdentifier, message.groupId) ?? primaryGroup
            return [buildAdminGroupThreadKey(parentGroup, message), message] as const
          }),
        ).values()],
      )

      const payloadMessages = uniqueMessages
        .map((message) => {
          const parentGroup = this.findGroup(message.ownerIdentifier, message.groupId) ?? primaryGroup
          const messageAuthorIdentifier =
            normalizeIdentifier(
              parentGroup.participants?.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
            ) ||
            normalizeIdentifier(parentGroup.creatorIdentifier ?? '') ||
            message.ownerIdentifier
          const author = this.findAccount(messageAuthorIdentifier)
          const comments = compactThreadComments(message.threadComments).filter(
            (comment) =>
              fromTimestamp === null && toTimestamp === null
                ? true
                : isTimestampWithinRange(comment.createdAt, fromTimestamp, toTimestamp),
          )
          const includeMessage =
            isTimestampWithinRange(message.createdAt, fromTimestamp, toTimestamp) || comments.length > 0
          if (!includeMessage) {
            return null
          }

          return {
            attachment: message.attachment ?? null,
            authorDisplayName: author ? buildAccountDisplayLabel(author) : messageAuthorIdentifier,
            authorIdentifier: messageAuthorIdentifier,
            comments: comments.map((comment) => {
              const commentAuthorIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier
              const commentAuthor = this.findAccount(commentAuthorIdentifier)
              return {
                attachment: comment.attachment ?? null,
                authorDisplayName: commentAuthor ? buildAccountDisplayLabel(commentAuthor) : commentAuthorIdentifier,
                authorIdentifier: commentAuthorIdentifier,
                createdAt: comment.createdAt,
                deliveryId: comment.deliveryId,
                id: comment.id,
                replyTo: comment.replyTo ?? null,
                text: comment.text,
              }
            }),
            createdAt: message.createdAt,
            id: message.id,
            text: message.text,
            threadId: getGroupMessageThreadId(parentGroup, message),
          }
        })
        .filter((message): message is NonNullable<typeof message> => Boolean(message))

      const fileBaseName = `group-${sanitizeExportFileName(primaryGroup.title) || 'group'}`
      const rows: unknown[][] = [['Когда', 'Тип', 'Автор', 'ID автора', 'Текст', 'Файл', 'Thread ID']]
      for (const message of payloadMessages) {
        rows.push([
          message.createdAt ?? '',
          'message',
          message.authorDisplayName,
          message.authorIdentifier,
          message.text,
          message.attachment?.fileName ?? '',
          message.threadId ?? '',
        ])
        for (const comment of message.comments) {
          rows.push([
            comment.createdAt ?? '',
            'thread-comment',
            comment.authorDisplayName,
            comment.authorIdentifier,
            comment.text,
            comment.attachment?.fileName ?? '',
            message.threadId ?? '',
          ])
        }
      }

      registerJson(`groups/${fileBaseName}.json`, {
        group: {
          handle: primaryGroup.handle,
          id: groupId,
          members: primaryGroup.members,
          ownerIdentifier: primaryGroup.ownerIdentifier,
          title: primaryGroup.title,
        },
        participants: (primaryGroup.participants ?? []).map((participant) => ({
          displayName: participant.title,
          id: participant.id,
          identifier: participant.identifier,
          nickname: participant.nickname,
        })),
        messages: payloadMessages,
      })
      registerCsv(`groups/${fileBaseName}.csv`, rows)
      groupManifest.push({
        fileBaseName,
        groupId,
        messageCount: payloadMessages.length,
        title: primaryGroup.title,
      })

      for (const message of payloadMessages) {
        if (message.comments.length > 0 || message.threadId) {
          threadRows.push({
            commentCount: message.comments.length,
            contextLabel: primaryGroup.title,
            id: message.threadId ?? `${groupId}:${message.id}`,
            kind: 'group',
            latestActivityAt: message.comments.at(-1)?.createdAt ?? message.createdAt,
            ownerIdentifier: primaryGroup.ownerIdentifier,
            title: message.text || `Тред группы ${primaryGroup.title}`,
          })
        }
      }
    }

    const relevantChannelHandles = new Set<string>()
    for (const channel of this.database.managedChannels) {
      const handle = sanitizeChannelDirectLink(channel.directLink) || channel.directLink
      if (normalizeIdentifier(channel.ownerIdentifier) === target.identifier) {
        relevantChannelHandles.add(handle)
      }
    }
    for (const channel of this.database.subscriptionChannels) {
      const handle = sanitizeChannelDirectLink(channel.handle) || channel.handle
      const participantIdentifiers = (channel.participants ?? []).map((participant) =>
        normalizeIdentifier(participant.identifier ?? ''),
      )
      if (normalizeIdentifier(channel.ownerIdentifier) === target.identifier || participantIdentifiers.includes(target.identifier)) {
        relevantChannelHandles.add(handle)
      }
    }
    for (const post of this.database.subscriptionPosts) {
      const channel = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
      if (!channel) continue
      const handle = sanitizeChannelDirectLink(channel.handle) || channel.handle
      if (
        post.ownerIdentifier === target.identifier ||
        compactThreadComments(post.threadComments).some(
          (comment) => normalizeIdentifier(comment.authorIdentifier ?? '') === target.identifier,
        )
      ) {
        relevantChannelHandles.add(handle)
      }
    }

    const channelManifest: Array<{ fileBaseName: string; handle: string; postCount: number; title: string }> = []
    for (const handle of relevantChannelHandles) {
      const copies = this.listSubscriptionChannelCopiesByHandle(handle)
      const primaryCopy = copies[0]
      const managedChannel = this.findManagedChannelByHandle(handle)
      if (!primaryCopy && !managedChannel) continue

      const posts = this.database.subscriptionPosts.filter((post) =>
        copies.some((channel) => channel.ownerIdentifier === post.ownerIdentifier && channel.id === post.channelId),
      )
      const uniquePosts = sortByCreatedAtAsc(
        [...new Map(
          posts.map((post) => {
            const parent = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId) ?? primaryCopy
            const key = parent ? buildAdminChannelThreadKey(parent, post) : `${post.ownerIdentifier}:${post.channelId}:${post.id}`
            return [key, post] as const
          }),
        ).values()],
      )

      const payloadPosts = uniquePosts
        .map((post) => {
          const comments = compactThreadComments(post.threadComments).filter(
            (comment) =>
              fromTimestamp === null && toTimestamp === null
                ? true
                : isTimestampWithinRange(comment.createdAt, fromTimestamp, toTimestamp),
          )
          const includePost =
            isTimestampWithinRange(post.createdAt, fromTimestamp, toTimestamp) || comments.length > 0
          if (!includePost) {
            return null
          }

          const channelOwnerIdentifier = managedChannel?.ownerIdentifier ?? post.ownerIdentifier
          const channelOwner = this.findAccount(channelOwnerIdentifier)
          const threadId = primaryCopy ? getSubscriptionPostThreadId(primaryCopy, post) : post.threadId?.trim() || undefined

          return {
            attachment: post.attachment ?? null,
            authorDisplayName: channelOwner ? buildAccountDisplayLabel(channelOwner) : channelOwnerIdentifier,
            authorIdentifier: channelOwnerIdentifier,
            comments: comments.map((comment) => {
              const commentAuthorIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier
              const commentAuthor = this.findAccount(commentAuthorIdentifier)
              return {
                attachment: comment.attachment ?? null,
                authorDisplayName: commentAuthor ? buildAccountDisplayLabel(commentAuthor) : commentAuthorIdentifier,
                authorIdentifier: commentAuthorIdentifier,
                createdAt: comment.createdAt,
                deliveryId: comment.deliveryId,
                id: comment.id,
                replyTo: comment.replyTo ?? null,
                text: comment.text,
              }
            }),
            createdAt: post.createdAt,
            id: post.id,
            text: post.text,
            threadId,
          }
        })
        .filter((post): post is NonNullable<typeof post> => Boolean(post))

      const channelTitle = managedChannel?.title ?? primaryCopy?.title ?? handle
      const fileBaseName = `channel-${sanitizeExportFileName(channelTitle) || 'channel'}`
      const rows: unknown[][] = [['Когда', 'Тип', 'Автор', 'ID автора', 'Текст', 'Файл', 'Thread ID']]
      for (const post of payloadPosts) {
        rows.push([
          post.createdAt ?? '',
          'post',
          post.authorDisplayName,
          post.authorIdentifier,
          post.text,
          post.attachment?.fileName ?? '',
          post.threadId ?? '',
        ])
        for (const comment of post.comments) {
          rows.push([
            comment.createdAt ?? '',
            'thread-comment',
            comment.authorDisplayName,
            comment.authorIdentifier,
            comment.text,
            comment.attachment?.fileName ?? '',
            post.threadId ?? '',
          ])
        }
      }

      registerJson(`channels/${fileBaseName}.json`, {
        channel: {
          handle,
          ownerIdentifier: managedChannel?.ownerIdentifier ?? primaryCopy?.ownerIdentifier ?? '',
          readers: primaryCopy?.readers ?? 0,
          title: channelTitle,
          visibility: managedChannel?.visibility ?? primaryCopy?.visibility ?? 'private',
        },
        posts: payloadPosts,
      })
      registerCsv(`channels/${fileBaseName}.csv`, rows)
      channelManifest.push({
        fileBaseName,
        handle,
        postCount: payloadPosts.length,
        title: channelTitle,
      })

      for (const post of payloadPosts) {
        if (post.comments.length > 0 || post.threadId) {
          threadRows.push({
            commentCount: post.comments.length,
            contextLabel: channelTitle,
            id: post.threadId ?? `${handle}:${post.id}`,
            kind: 'channel',
            latestActivityAt: post.comments.at(-1)?.createdAt ?? post.createdAt,
            ownerIdentifier: managedChannel?.ownerIdentifier ?? primaryCopy?.ownerIdentifier ?? post.authorIdentifier,
            title: post.text || `Тред канала ${channelTitle}`,
          })
        }
      }
    }

    const uniqueThreads = [...new Map(threadRows.map((thread) => [thread.id, thread] as const)).values()]
      .sort((left, right) => compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt))
    registerJson('threads/threads.json', uniqueThreads)
    registerCsv('threads/threads.csv', [
      ['ID', 'Тип', 'Контекст', 'Владелец', 'Комментариев', 'Последняя активность', 'Заголовок'],
      ...uniqueThreads.map((thread) => [
        thread.id,
        thread.kind,
        thread.contextLabel,
        thread.ownerIdentifier,
        thread.commentCount,
        thread.latestActivityAt ?? '',
        thread.title,
      ]),
    ])

    const relatedReports = this.database.adminReports
      .filter((report) => {
        if (!isTimestampWithinRange(report.updatedAt || report.createdAt, fromTimestamp, toTimestamp)) {
          return false
        }

        return (
          report.reporterIdentifier === target.identifier ||
          normalizeIdentifier(report.entityOwnerIdentifier ?? '') === target.identifier ||
          normalizeIdentifier(report.relatedUserIdentifier ?? '') === target.identifier
        )
      })
      .map((report) => this.buildAdminReportSummary(report))
      .sort((left, right) => compareIsoDateDesc(left.updatedAt, right.updatedAt))
    registerJson('reports/reports.json', relatedReports)
    registerCsv('reports/reports.csv', [
      ['ID', 'Статус', 'Тип', 'Entity', 'Репортёр', 'Связанный пользователь', 'Создана', 'Обновлена', 'Причина'],
      ...relatedReports.map((report) => [
        report.id,
        report.status,
        report.entityType,
        report.entityLabel,
        report.reporterIdentifier,
        report.relatedUserIdentifier ?? '',
        report.createdAt,
        report.updatedAt,
        report.reason,
      ]),
    ])

    const auditRows = [
      ...this.adminListAuditLogs({
        from: body.from,
        limit: Number.MAX_SAFE_INTEGER,
        targetIdentifier: target.identifier,
        to: body.to,
      }),
      ...this.adminListAuditLogs({
        actorIdentifier: target.identifier,
        from: body.from,
        limit: Number.MAX_SAFE_INTEGER,
        to: body.to,
      }),
    ]
    const uniqueAuditRows = [...new Map(auditRows.map((entry) => [entry.id, entry] as const)).values()]
      .sort((left, right) => compareIsoDateDesc(left.createdAt, right.createdAt))
    registerJson('audit/audit.json', uniqueAuditRows)
    registerCsv('audit/audit.csv', [
      ['Когда', 'Актор', 'Роль', 'Action', 'Target', 'Причина', 'Summary'],
      ...uniqueAuditRows.map((entry) => [
        entry.createdAt,
        entry.actorDisplayName,
        entry.actorRole,
        entry.action,
        entry.targetLabel,
        entry.reason ?? '',
        entry.summary,
      ]),
    ])

    const ipAccessRows = this.getIpAccessLogsForIdentifier(target.identifier)
      .filter((entry) => isTimestampWithinRange(entry.createdAt, fromTimestamp, toTimestamp))
    registerJson('ip/ip-log.json', ipAccessRows)
    registerCsv('ip/ip-log.csv', [
      ['Когда', 'Тип события', 'IP', 'Предыдущий IP', 'Источник', 'User-Agent'],
      ...ipAccessRows.map((entry) => [
        entry.createdAt,
        entry.eventType,
        entry.ip,
        entry.previousIp ?? '',
        entry.source,
        entry.userAgent ?? '',
      ]),
    ])

    const mediaItems = this.collectAdminMediaItems()
      .filter(
        (item) =>
          item.owner.identifier === target.identifier ||
          item.relatedUsers.some((user) => normalizeIdentifier(user.identifier) === target.identifier),
      )
      .sort((left, right) => compareIsoDateDesc(left.createdAt, right.createdAt))

    const mediaManifest: Array<{
      archivePath?: string
      contextLabel: string
      downloadStatus: 'included' | 'skipped' | 'failed'
      error?: string
      fileName: string
      kind: string
      mediaUrl: string
      ownerIdentifier: string
      relatedUserIdentifiers: string[]
      size: number
      typeLabel: string
    }> = []

    for (const item of mediaItems) {
      const baseRecord = {
        contextLabel: item.contextLabel,
        fileName: item.fileName,
        kind: item.kind,
        mediaUrl: item.mediaUrl,
        ownerIdentifier: item.owner.identifier,
        relatedUserIdentifiers: item.relatedUsers.map((user) => user.identifier),
        size: item.size,
        typeLabel: item.typeLabel,
      }

      if (!includeMedia || item.kind === 'unknown') {
        mediaManifest.push({
          ...baseRecord,
          downloadStatus: 'skipped',
        })
        continue
      }

      try {
        const buffer = await readStoredMediaByUrl(item.mediaUrl, item.kind)
        const archivePath = nextArchiveMediaPath(item.fileName || item.id)
        archiveEntries[archivePath] = buffer
        mediaManifest.push({
          ...baseRecord,
          archivePath,
          downloadStatus: 'included',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось прочитать media-объект.'
        mediaFailures.push({
          error: message,
          fileName: item.fileName,
          mediaUrl: item.mediaUrl,
        })
        mediaManifest.push({
          ...baseRecord,
          downloadStatus: 'failed',
          error: message,
        })
      }
    }

    registerJson('media/media.json', mediaManifest)
    if (mediaFailures.length > 0) {
      registerJson('media/media-errors.json', mediaFailures)
    }

    const accountSummary = this.buildAdminUserSummary(target)
    registerJson('account.json', accountSummary)

    const manifest = {
      accountIdentifier: target.identifier,
      actorIdentifier: actor.identifier,
      actorRole: actor.staffRole,
      archiveVersion: 1,
      createdAt: new Date().toISOString(),
      dateRange: {
        from: body.from ?? null,
        to: body.to ?? null,
      },
      includeMedia,
      counts: {
        auditEntries: uniqueAuditRows.length,
        channels: channelManifest.length,
        dialogs: dialogManifest.length,
        groups: groupManifest.length,
        ipAccessLogs: ipAccessRows.length,
        media: mediaManifest.length,
        mediaFilesIncluded: mediaManifest.filter((item) => item.downloadStatus === 'included').length,
        reports: relatedReports.length,
        threads: uniqueThreads.length,
      },
      reason: normalizedReason,
      targetDisplayName: accountSummary.displayName,
    }
    registerJson('manifest.json', manifest)

    const archiveFileName = `legal-export-${sanitizeExportFileName(accountSummary.displayName) || target.identifier}-${formatExportDateStamp()}.zip`
    await this.appendAdminAuditLog(actor, {
      action: 'admin.legal-export.download',
      nextValue: {
        archiveFileName,
        counts: manifest.counts,
        from: body.from,
        includeMedia,
        to: body.to,
      },
      reason: normalizedReason,
      summary: `Сформирована юридическая выгрузка для ${buildAdminAuditAccountLabel(target)} · ${normalizedReason}`,
      targetId: target.identifier,
      targetType: 'user',
    })

    return {
      buffer: Buffer.from(zipSync(archiveEntries, { level: 0 })),
      fileName: archiveFileName,
    }
  }

  adminListMedia(query: string) {
    const trimmedQuery = query.trim().toLowerCase()

    return this.collectAdminMediaItems()
      .filter((item) => {
        if (!trimmedQuery) return true

        return (
          item.owner.identifier.toLowerCase().includes(trimmedQuery) ||
          item.owner.displayName.toLowerCase().includes(trimmedQuery) ||
          item.typeLabel.toLowerCase().includes(trimmedQuery) ||
          item.entityLabel.toLowerCase().includes(trimmedQuery) ||
          item.fileName.toLowerCase().includes(trimmedQuery) ||
          item.relatedUsers.some(
            (user) =>
              user.identifier.toLowerCase().includes(trimmedQuery) ||
              user.displayName.toLowerCase().includes(trimmedQuery),
          ) ||
          item.mediaUrl.toLowerCase().includes(trimmedQuery)
        )
      })
      .slice(0, 20)
  }

  async adminModerateMedia(
    actorToken: string,
    mediaUrlOrId: string,
    action: 'hide' | 'delete',
    reason: string,
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const decodedMediaUrl = decodeURIComponent(mediaUrlOrId)
    const mediaItem = this.collectAdminMediaItems().find((item) => item.mediaUrl === decodedMediaUrl)
    if (!mediaItem) {
      throw new Error('Media-объект не найден.')
    }

    await this.applyMediaModerationAction(actor, mediaItem.mediaUrl, action, sanitizeAdminText(reason, 500))
    return this.adminListMedia('')
  }

  async adminGetMediaDownload(actorToken: string, mediaUrlOrId: string, reason?: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const decodedMediaUrl = decodeURIComponent(mediaUrlOrId)
    const mediaItem = this.collectAdminMediaItems().find((item) => item.mediaUrl === decodedMediaUrl)
    if (!mediaItem) {
      throw new Error('Media-объект не найден.')
    }

    const ownerAccount = this.findAccount(mediaItem.owner.identifier)
    const normalizedReason = sanitizeAdminText(reason, 280)

    await this.appendAdminAuditLog(actor, {
      action: 'admin.media.download',
      nextValue: {
        contextLabel: mediaItem.contextLabel,
        fileName: mediaItem.fileName,
        mediaUrl: mediaItem.mediaUrl,
        ownerDisplayName: mediaItem.owner.displayName,
        ownerIdentifier: mediaItem.owner.identifier,
      },
      reason: normalizedReason || undefined,
      summary: `Скачан media-объект ${mediaItem.fileName} · владелец ${
        ownerAccount ? buildAdminAuditAccountLabel(ownerAccount) : `${mediaItem.owner.displayName} (${mediaItem.owner.identifier})`
      }${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: mediaItem.mediaUrl,
      targetType: 'media',
    })

    return {
      downloadUrl: mediaItem.mediaUrl,
      fileName: mediaItem.fileName,
    }
  }

  adminListAuditActors() {
    const actors = new Map<string, AdminAuditLogResponse['actors'][number]>()

    for (const entry of this.database.adminAuditLogs) {
      const account = this.findAccount(entry.actorIdentifier)
      if (!account) {
        actors.set(entry.actorIdentifier, {
          displayName: entry.actorIdentifier,
          identifier: entry.actorIdentifier,
          role: entry.actorRole,
        })
        continue
      }

      actors.set(entry.actorIdentifier, {
        displayName: buildAccountDisplayLabel(account),
        identifier: account.identifier,
        nickname: normalizeNickname(account.nickname ?? '') || undefined,
        role: entry.actorRole,
      })
    }

    return [...actors.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName, 'ru'),
    )
  }

  adminListAuditLogs(filters?: {
    actorIdentifier?: string
    from?: string
    limit?: number
    targetIdentifier?: string
    to?: string
  }) {
    const fromTimestamp = parseIsoDate(filters?.from)
    const toTimestamp = parseIsoDate(filters?.to)
    const limit = filters?.limit ?? 20

    return [...this.database.adminAuditLogs]
      .filter((entry) => {
        if (
          filters?.actorIdentifier &&
          entry.actorIdentifier !== filters.actorIdentifier
        ) {
          return false
        }

        const createdAt = parseIsoDate(entry.createdAt)
        if (fromTimestamp !== null && (createdAt === null || createdAt < fromTimestamp)) {
          return false
        }
        if (toTimestamp !== null && (createdAt === null || createdAt > toTimestamp)) {
          return false
        }

        if (
          filters?.targetIdentifier &&
          !this.adminAuditEntryTargetsIdentifier(entry, filters.targetIdentifier)
        ) {
          return false
        }

        return true
      })
      .sort((left, right) => compareIsoDateDesc(left.createdAt, right.createdAt))
      .slice(0, Math.max(1, limit))
      .map((entry) => this.buildAdminAuditEntry(entry))
  }

  async adminExportAuditLogsCsv(
    actorToken: string,
    filters?: {
      actorIdentifier?: string
      from?: string
      reason?: string
      targetIdentifier?: string
      to?: string
    },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const targetAccount = filters?.targetIdentifier
      ? this.findAccountForAdmin(filters.targetIdentifier)
      : null
    const actorFilterAccount = filters?.actorIdentifier
      ? this.findAccountForAdmin(filters.actorIdentifier)
      : null
    const rows = this.adminListAuditLogs({
      ...filters,
      limit: Number.MAX_SAFE_INTEGER,
    })
    const normalizedReason = sanitizeAdminText(filters?.reason, 280)

    await this.appendAdminAuditLog(actor, {
      action: 'admin.audit.export.csv',
      nextValue: {
        actorIdentifier: filters?.actorIdentifier,
        from: filters?.from,
        rowCount: rows.length,
        targetIdentifier: filters?.targetIdentifier,
        to: filters?.to,
      },
      reason: normalizedReason || undefined,
      summary: targetAccount
        ? `Экспортирован CSV audit логов пользователя ${buildAdminAuditAccountLabel(targetAccount)}${normalizedReason ? ` · ${normalizedReason}` : ''}`
        : actorFilterAccount
          ? `Экспортирован CSV audit log для актора ${buildAdminAuditAccountLabel(actorFilterAccount)}${normalizedReason ? ` · ${normalizedReason}` : ''}`
          : `Экспортирован CSV audit log${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: filters?.targetIdentifier ?? 'audit-log',
      targetType: filters?.targetIdentifier ? 'user' : 'audit-log',
    })

    const fileNameBase = targetAccount
      ? `audit-${sanitizeExportFileName(targetAccount.displayName) || targetAccount.identifier}`
      : actorFilterAccount
        ? `audit-actor-${sanitizeExportFileName(actorFilterAccount.displayName) || actorFilterAccount.identifier}`
        : 'audit-log'

    return {
      csv: [
        ['Когда', 'Актор', 'Роль', 'Action', 'Target', 'Причина', 'Summary'],
      ...rows.map((entry) => [
        entry.createdAt,
        entry.actorNickname
          ? `${entry.actorDisplayName} (@${entry.actorNickname})`
          : entry.actorDisplayName,
        entry.actorRole,
        entry.action,
        entry.targetLabel,
        entry.reason ?? '',
        entry.summary,
      ]),
      ]
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
        .join('\n'),
      fileName: `${fileNameBase}-${formatExportDateStamp()}.csv`,
    }
  }

  async adminExportIpLogsCsv(actorToken: string, body: AdminIpLogCsvExportBody) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const target = this.findAccountForAdmin(body.targetIdentifier)
    if (!target) {
      throw new Error('Пользователь для выгрузки IP логов не найден.')
    }

    const normalizedReason = sanitizeAdminText(body.reason, 280)
    if (!normalizedReason) {
      throw new Error('Нужно указать основание для выгрузки IP логов.')
    }

    const fromTimestamp = parseIsoDate(body.from)
    const toTimestamp = parseIsoDate(body.to)
    const rows = this.getIpAccessLogsForIdentifier(target.identifier)
      .filter((entry) => isTimestampWithinRange(entry.createdAt, fromTimestamp, toTimestamp))
      .sort((left, right) => (parseIsoDate(left.createdAt) ?? 0) - (parseIsoDate(right.createdAt) ?? 0))

    const ipSummary = this.buildAdminUserIpSummary(target.identifier)
    const fileName = `ip-log-${sanitizeExportFileName(target.displayName) || target.identifier}-${formatExportDateStamp()}.csv`
    await this.appendAdminAuditLog(actor, {
      action: 'admin.ip-logs.download',
      nextValue: {
        fileName,
        from: body.from,
        latestIp: ipSummary.latestIp,
        rowCount: rows.length,
        to: body.to,
      },
      reason: normalizedReason,
      summary: `Экспортирован CSV IP логов пользователя ${buildAdminAuditAccountLabel(target)} · ${normalizedReason}`,
      targetId: target.identifier,
      targetType: 'user',
    })

    return {
      csv: buildCsv([
        ['Когда', 'Тип события', 'IP', 'Предыдущий IP', 'Источник', 'User-Agent'],
        ...rows.map((entry) => [
          entry.createdAt,
          entry.eventType,
          entry.ip,
          entry.previousIp ?? '',
          entry.source,
          entry.userAgent ?? '',
        ]),
      ]),
      fileName,
    }
  }

  async bootstrapStaffRole(identifier: string, role: StaffRole) {
    const target = this.findAccountForAdmin(identifier)
    if (!target) {
      throw new Error('Пользователь для bootstrap не найден.')
    }

    target.staffRole = role
    target.lastActiveAt = target.lastActiveAt ?? target.createdAt
    await this.persist()
    return this.buildAdminUserSummary(target)
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

    const fullChats = materializeFullChats(this.database, account.identifier)
    const fullGroups = materializeFullGroups(this.database, account.identifier)
    const fullSubscriptionChannels = materializeFullSubscriptionChannels(this.database, account.identifier)

    const fullChatsById = new Map(fullChats.map((chat) => [chat.id, chat] as const))
    const fullGroupsById = new Map(fullGroups.map((group) => [group.id, group] as const))
    const fullSubscriptionChannelsById = new Map(
      fullSubscriptionChannels.map((channel) => [channel.id, channel] as const),
    )

    const chats = snapshot.chats.map((chat) => {
      const persistedChat = fullChatsById.get(chat.id)

      return {
        ...chat,
        // Message history must stay server-authoritative. Client snapshot sync is allowed
        // to update room metadata, but it must not resurrect deleted messages from stale UI state.
        messages: persistedChat?.messages ?? [],
        pinnedMessage: persistedChat?.pinnedMessage,
      }
    })
    const groups = snapshot.groups.map((group) => {
      const persistedGroup = fullGroupsById.get(group.id)

      return {
        ...group,
        // Group timelines and thread comments are persisted through dedicated mutations only.
        messages: persistedGroup?.messages ?? [],
      }
    })
    const subscriptionChannels = snapshot.subscriptionChannels.map((channel) => {
      const persistedChannel = fullSubscriptionChannelsById.get(channel.id)

      return {
        ...channel,
        // Channel posts and thread comments must never be restored from a stale client snapshot.
        posts: persistedChannel?.posts ?? [],
      }
    })

    this.replaceOwnerState(account.identifier, {
      channels: snapshot.channels,
      chats,
      groups,
      subscriptionChannels,
    })

    await this.persist()

    this.clearPendingMediaUpload(account.avatarImage)

    if (previousAvatarImage && previousAvatarImage !== account.avatarImage) {
      await this.deleteMediaIfUnreferenced(previousAvatarImage)
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

    this.clearPendingMediaUpload(account.avatarImage)

    if (previousAvatarImage && previousAvatarImage !== account.avatarImage) {
      await this.deleteMediaIfUnreferenced(previousAvatarImage)
    }

    return {
      broadcastIdentifiers: [...new Set(broadcastIdentifiers)],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async addUserGif(token: string, payload: RegisterUserGifBody): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    if (!hasActivePremium(account.premium, account.premiumExpiresAt)) {
      throw new Error('GIF доступны только в премиуме.')
    }

    const nextGif = sanitizeUserGifLibraryItem(payload)
    const currentLibrary = account.gifLibrary ?? []
    const duplicateKey = buildUserGifDuplicateKey(nextGif.fileName, nextGif.size)

    if (
      currentLibrary.some(
        (item) =>
          item.mediaUrl === nextGif.mediaUrl ||
          item.id === nextGif.id ||
          buildUserGifDuplicateKey(item.fileName, item.size) === duplicateKey,
      )
    ) {
      await this.discardPendingMediaUpload(nextGif.mediaUrl)
      throw new Error('У вас такая GIF уже загружена.')
    }

    account.gifLibrary = [nextGif, ...currentLibrary].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    )

    await this.persist()
    this.clearPendingMediaUpload(nextGif.mediaUrl)

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  searchUserGifs(token: string, query: string) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    if (!hasActivePremium(account.premium, account.premiumExpiresAt)) {
      throw new Error('GIF доступны только в премиуме.')
    }

    const normalizedQuery = normalizeGifFileNameForMatching(query)
    if (!normalizedQuery) {
      return { items: [] as UserGifLibraryItem[] }
    }

    const uniqueItems = new Map<string, UserGifLibraryItem>()

    for (const candidateAccount of this.database.accounts) {
      for (const gif of candidateAccount.gifLibrary ?? []) {
        const sanitizedGif = sanitizeUserGifLibraryItem(gif)
        if (!normalizeGifFileNameForMatching(sanitizedGif.fileName).includes(normalizedQuery)) {
          continue
        }

        if (!uniqueItems.has(sanitizedGif.mediaUrl)) {
          uniqueItems.set(sanitizedGif.mediaUrl, sanitizedGif)
        }
      }
    }

    const items = [...uniqueItems.values()].sort((left, right) => {
      const leftName = normalizeGifFileNameForMatching(left.fileName)
      const rightName = normalizeGifFileNameForMatching(right.fileName)
      const leftStartsWith = leftName.startsWith(normalizedQuery)
      const rightStartsWith = rightName.startsWith(normalizedQuery)

      if (leftStartsWith !== rightStartsWith) {
        return leftStartsWith ? -1 : 1
      }

      return Date.parse(right.createdAt) - Date.parse(left.createdAt)
    })

    return { items }
  }

  async removeUserGif(token: string, gifId: string): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const currentLibrary = account.gifLibrary ?? []
    const removedGif = currentLibrary.find((gif) => gif.id === gifId.trim()) ?? null
    if (!removedGif) {
      throw new Error('GIF не найдена.')
    }

    account.gifLibrary = currentLibrary.filter((gif) => gif.id !== gifId.trim())

    await this.persist()
    await this.deleteMediaIfUnreferenced(removedGif.mediaUrl)

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async setDebugPremiumState(token: string, payload: DebugPremiumBody): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    account.premium = Boolean(payload.enabled)
    account.premiumExpiresAt = payload.enabled
      ? makePremiumExpiry(
          Number.isInteger(payload.durationDays) && (payload.durationDays ?? 0) > 0
            ? payload.durationDays!
            : 30,
        )
      : ''

    const broadcastIdentifiers = this.refreshDialogsForAccount(account)
    broadcastIdentifiers.push(account.identifier)

    await this.persist()

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
    this.clearPendingMediaUpload(attachment?.mediaUrl)

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

    const targetAccount = this.findAccount(targetIdentifier)
    const latestDialogMessage = this.database.dialogMessages
      .filter(
        (message) => message.ownerIdentifier === account.identifier && message.dialogId === dialogId,
      )
      .sort((left, right) => left.id - right.id)
      .at(-1)
    this.upsertAdminReport({
      createdAt: new Date().toISOString(),
      entityKey: targetIdentifier,
      entityLabel: targetAccount ? buildAccountDisplayLabel(targetAccount) : targetIdentifier,
      entityOwnerIdentifier: targetIdentifier,
      entityPreview: latestDialogMessage?.text || latestDialogMessage?.attachment?.fileName || undefined,
      entityType: 'user',
      reason,
      relatedUserIdentifier: targetIdentifier,
      reporterIdentifier: account.identifier,
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async reportMediaAttachment(
    token: string,
    payload: ReportMediaBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const mediaUrl = payload.mediaUrl.trim()
    if (!mediaUrl) {
      throw new Error('Не найден media-объект для жалобы.')
    }

    const relatedContext = this.findVisibleMediaContextForReporter(account.identifier, mediaUrl)
    if (!relatedContext) {
      throw new Error('Это вложение недоступно для жалобы.')
    }

    const alreadyReported = this.database.adminReports.some(
      (report) =>
        report.reporterIdentifier === account.identifier &&
        report.entityType === 'media' &&
        report.entityKey === mediaUrl,
    )
    if (alreadyReported) {
      throw new Error('Вы уже отправляли жалобу.')
    }

    const reason = sanitizeComplaintReason(payload.reason ?? 'very_unpleasant')
    this.upsertAdminReport({
      createdAt: new Date().toISOString(),
      entityKey: mediaUrl,
      entityLabel: relatedContext.entityLabel,
      entityOwnerIdentifier: relatedContext.entityOwnerIdentifier,
      entityPreview: relatedContext.entityPreview,
      entityType: 'media',
      reason,
      relatedUserIdentifier:
        relatedContext.relatedUserIdentifier ?? relatedContext.entityOwnerIdentifier,
      reporterIdentifier: account.identifier,
    })

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

    const removedMessage = this.database.dialogMessages.find(
      (message) =>
        message.ownerIdentifier === account.identifier &&
        message.dialogId === dialogId &&
        message.id === messageId,
    )

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
    await this.deleteMediaIfUnreferenced(removedMessage?.attachment?.mediaUrl)

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

    const removedMediaUrls = this.database.dialogMessages
      .filter((message) => message.ownerIdentifier === account.identifier && message.dialogId === dialogId)
      .flatMap((message) => collectMediaUrlsFromAttachment(message.attachment))

    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) => !(message.ownerIdentifier === account.identifier && message.dialogId === dialogId),
    )
    dialog.pinnedMessageId = undefined
    dialog.typing = false
    dialog.unread = 0

    await this.persist()
    for (const mediaUrl of removedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
    }

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

    const removedMediaUrls = this.database.dialogMessages
      .filter((message) => message.ownerIdentifier === account.identifier && message.dialogId === dialogId)
      .flatMap((message) => collectMediaUrlsFromAttachment(message.attachment))

    this.database.dialogs = this.database.dialogs.filter(
      (dialog) => !(dialog.ownerIdentifier === account.identifier && dialog.id === dialogId),
    )
    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) => !(message.ownerIdentifier === account.identifier && message.dialogId === dialogId),
    )
    account.blockedContactIds = (account.blockedContactIds ?? []).filter((id) => id !== dialogId)

    await this.persist()
    for (const mediaUrl of removedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
    }

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
    const attachment = sanitizeMessageAttachment(payload.attachment)
    if (!text && !attachment) {
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
      attachment,
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

    const removedMediaUrl = targetComment.attachment?.mediaUrl

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
    await this.deleteMediaIfUnreferenced(removedMediaUrl)

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
    const attachment = sanitizeMessageAttachment(payload.attachment)
    if (!text && !attachment) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }
    const replyTo = sanitizeReplyTarget(payload.replyTo)

    let channelCopies = this.listSubscriptionChannelCopiesByHandle(channel.directLink)

    if (channelCopies.length === 0) {
      const ownerCopy: PersistedSubscriptionChannel = {
        accent: channel.avatarTone,
        avatarImage: channel.avatarImage,
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
      this.syncManagedChannelSubscriptionCopies(channel)
      channelCopies = [ownerCopy]
    }

    const createdAt = new Date().toISOString()
    const time = formatNowTime()

    for (const channelCopy of channelCopies) {
      this.database.subscriptionPosts.push({
        channelId: channelCopy.id,
        createdAt,
        attachment,
        id: this.getNextSubscriptionPostId(channelCopy.ownerIdentifier, channelCopy.id),
        ownerIdentifier: channelCopy.ownerIdentifier,
        replyTo,
        text,
        threadComments: [],
        threadId: getSubscriptionPostThreadId(channelCopy, { createdAt, id: 0, text, time }),
        time,
      })

      channelCopy.preview = text || (attachment ? `Файл: ${attachment.fileName}` : channelCopy.preview)
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
    const removedMediaUrls = [
      ...collectMediaUrlsFromAttachment(ownerPost.attachment),
      ...collectMediaUrlsFromThreadComments(ownerPost.threadComments),
    ]
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
    for (const mediaUrl of removedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
    }

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
    const removedMediaUrls = [
      ...collectMediaUrlsFromAttachment(message.attachment),
      ...collectMediaUrlsFromThreadComments(message.threadComments),
    ]
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
    for (const mediaUrl of removedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
    }

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

    this.clearPendingMediaUpload(group.avatarImage)

    if (previousAvatarImage && previousAvatarImage !== group.avatarImage) {
      await this.deleteMediaIfUnreferenced(previousAvatarImage)
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
      const removedMediaUrls = this.database.groupMessages
        .filter((candidate) => groupCopyKeys.has(`${candidate.ownerIdentifier}:${candidate.groupId}`))
        .flatMap((candidate) => [
          ...collectMediaUrlsFromAttachment(candidate.attachment),
          ...collectMediaUrlsFromThreadComments(candidate.threadComments),
        ])
      this.database.groups = this.database.groups.filter(
        (candidate) => this.getSharedGroupId(candidate) !== sharedId,
      )
      this.database.groupMessages = this.database.groupMessages.filter(
        (candidate) => !groupCopyKeys.has(`${candidate.ownerIdentifier}:${candidate.groupId}`),
      )

      await this.persist()

      if (removedAvatarImage) {
        await this.deleteMediaIfUnreferenced(removedAvatarImage)
      }
      for (const mediaUrl of removedMediaUrls) {
        await this.deleteMediaIfUnreferenced(mediaUrl)
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

  async removeSubscriptionChannelSubscriber(
    token: string,
    channelId: number,
    payload: ManageSubscriptionChannelSubscriberBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findSubscriptionChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const sourceManagedChannel = this.findManagedChannelByHandle(channel.handle)
    if (!sourceManagedChannel || sourceManagedChannel.ownerIdentifier !== account.identifier) {
      throw new Error('Только владелец канала может управлять подписчиками.')
    }

    const targetIdentifier = normalizeIdentifier(payload.identifier)
    if (!targetIdentifier) {
      throw new Error('Подписчик не найден.')
    }

    if (targetIdentifier === account.identifier) {
      throw new Error('Нельзя удалить владельца канала.')
    }

    const wasRemoved = this.revokeSubscriptionChannelAccess(sourceManagedChannel.directLink, targetIdentifier)
    if (!wasRemoved) {
      throw new Error('Подписчик не найден.')
    }

    const broadcastIdentifiers = new Set<string>([account.identifier, targetIdentifier])
    for (const channelCopy of this.syncManagedChannelSubscriptionCopies(sourceManagedChannel)) {
      broadcastIdentifiers.add(channelCopy.ownerIdentifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async blacklistSubscriptionChannelSubscriber(
    token: string,
    channelId: number,
    payload: ManageSubscriptionChannelSubscriberBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findSubscriptionChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const sourceManagedChannel = this.findManagedChannelByHandle(channel.handle)
    if (!sourceManagedChannel || sourceManagedChannel.ownerIdentifier !== account.identifier) {
      throw new Error('Только владелец канала может управлять подписчиками.')
    }

    const targetIdentifier = normalizeIdentifier(payload.identifier)
    if (!targetIdentifier) {
      throw new Error('Подписчик не найден.')
    }

    if (targetIdentifier === account.identifier) {
      throw new Error('Нельзя добавить владельца в чёрный список.')
    }

    sourceManagedChannel.commentBlacklistIdentifiers = sanitizeIdentifierList([
      ...(sourceManagedChannel.commentBlacklistIdentifiers ?? []),
      targetIdentifier,
    ])

    const broadcastIdentifiers = new Set<string>([account.identifier, targetIdentifier])
    for (const channelCopy of this.syncManagedChannelSubscriptionCopies(sourceManagedChannel)) {
      broadcastIdentifiers.add(channelCopy.ownerIdentifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
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
    const attachment = sanitizeMessageAttachment(payload.attachment)
    if (!text && !attachment) {
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
      attachment,
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

    const removedMediaUrl = targetComment.attachment?.mediaUrl

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
    await this.deleteMediaIfUnreferenced(removedMediaUrl)

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

    const sourceManagedChannel = this.findManagedChannelByHandle(normalizedHandle)
    this.upsertAdminReport({
      createdAt: new Date().toISOString(),
      entityKey: normalizedHandle,
      entityLabel: channel.title,
      entityOwnerIdentifier: sourceManagedChannel?.ownerIdentifier,
      entityPreview: channel.preview,
      entityType: 'channel',
      reason,
      relatedUserIdentifier: sourceManagedChannel?.ownerIdentifier,
      reporterIdentifier: account.identifier,
    })

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
      'Статус канала не задан.'
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
      this.clearPendingMediaUpload(createdChannel.avatarImage)
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
      this.deliverDirectChannelInvitation(account, recipientAccount, channel)
      broadcastIdentifiers.add(recipientAccount.identifier)
    }

    for (const channelCopy of this.syncManagedChannelSubscriptionCopies(channel)) {
      broadcastIdentifiers.add(channelCopy.ownerIdentifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async inviteSubscriptionChannelMembers(
    token: string,
    channelId: number,
    payload: InviteManagedChannelMembersBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const subscriptionChannel = this.findSubscriptionChannel(account.identifier, channelId)
    if (!subscriptionChannel) {
      throw new Error('Канал не найден.')
    }

    const sourceManagedChannel = this.findManagedChannelByHandle(subscriptionChannel.handle)
    if (!sourceManagedChannel) {
      throw new Error('Исходный канал не найден.')
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

    const broadcastIdentifiers = new Set<string>([account.identifier, sourceManagedChannel.ownerIdentifier])
    this.ensureSubscriptionChannelCopyForOwner(sourceManagedChannel, account.identifier)

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

      this.ensureSubscriptionChannelCopyForOwner(sourceManagedChannel, recipientAccount.identifier)
      this.deliverDirectChannelInvitation(account, recipientAccount, sourceManagedChannel)
      broadcastIdentifiers.add(recipientAccount.identifier)
    }

    for (const channelCopy of this.syncManagedChannelSubscriptionCopies(sourceManagedChannel)) {
      broadcastIdentifiers.add(channelCopy.ownerIdentifier)
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
      channel.description = sanitizeChannelDescription(payload.description)
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
      channelCopy.statusText = channel.description
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

    this.clearPendingMediaUpload(channel.avatarImage)

    if (
      previousAvatarImage &&
      previousAvatarImage !== channel.avatarImage
    ) {
      await this.deleteMediaIfUnreferenced(previousAvatarImage)
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
    const removedMediaUrls = this.database.subscriptionPosts
      .filter((post) => removableSubscriptionChannelKeys.has(`${post.ownerIdentifier}:${post.channelId}`))
      .flatMap((post) => [
        ...collectMediaUrlsFromAttachment(post.attachment),
        ...collectMediaUrlsFromThreadComments(post.threadComments),
      ])

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
      await this.deleteMediaIfUnreferenced(removedAvatarImage)
    }
    for (const mediaUrl of removedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
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
    this.clearPendingMediaUpload(nextGroup.avatarImage)

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

    return challenge
  }

  private buildSnapshot(account: Account, token: string): AppSnapshot {
    return {
      channels: materializeManagedChannels(this.database, account.identifier),
      chats: materializeChats(this.database, account.identifier),
      discoveryResults: cloneDiscoveryResults(),
      groups: materializeGroups(this.database, account.identifier),
      session: {
        avatarImage: account.avatarImage,
        blockedAt: account.blockedAt,
        blockedReason: account.blockedReason,
        blockedContactIds: [...(account.blockedContactIds ?? [])],
        displayName: account.displayName,
        gifLibrary: [...(account.gifLibrary ?? [])],
        identifier: account.identifier,
        lastActiveAt: account.lastActiveAt,
        nickname: account.nickname ?? '',
        premium: account.premium ?? true,
        premiumExpiresAt: account.premiumExpiresAt ?? '',
        sessionToken: token,
        soundsDisabled: Boolean(account.soundsDisabled),
        staffRole: account.staffRole,
        storageUsage: this.getStorageUsage(account.identifier),
        status: account.status ?? '',
        surname: account.surname ?? '',
      } satisfies Session,
      subscriptionChannels: materializeSubscriptionChannels(this.database, account.identifier),
      threadInbox: buildThreadInbox(this.database, account.identifier),
    }
  }

  private getStaffAccountByTokenOrThrow(token: string) {
    const account = this.findAccountByToken(token)
    const role = sanitizeStaffRole(account?.staffRole)

    if (!account || !role) {
      throw new Error('Доступ к admin panel разрешён только staff-аккаунтам.')
    }

    return {
      ...account,
      staffRole: role,
    }
  }

  private findAccountForAdmin(identifier: string) {
    const trimmed = identifier.trim()
    const normalizedIdentifier = normalizeIdentifier(trimmed)
    return this.findAccount(normalizedIdentifier || trimmed)
  }

  private buildAdminUserSummary(account: Account): AdminUserSummary {
    return {
      avatarImage: account.avatarImage,
      blocked: isAccountBlocked(account),
      blockedAt: account.blockedAt,
      blockedReason: account.blockedReason?.trim() || undefined,
      createdAt: account.createdAt,
      displayName: buildAccountDisplayLabel(account),
      identifier: account.identifier,
      lastActiveAt: account.lastActiveAt,
      nickname: normalizeNickname(account.nickname ?? '') || undefined,
      premium: hasActivePremium(account.premium, account.premiumExpiresAt),
      premiumExpiresAt: account.premiumExpiresAt,
      staffRole: sanitizeStaffRole(account.staffRole),
      status: account.status?.trim() || undefined,
      storageUsage: this.getStorageUsage(account.identifier),
    }
  }

  private createAdminNote(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    text: string,
  ): AdminReportNote {
    return {
      authorDisplayName: buildAccountDisplayLabel(actor),
      authorIdentifier: actor.identifier,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      text,
    }
  }

  private buildAdminReportSummary(report: AdminReportRecord): AdminReportSummary {
    return {
      closedAt: report.closedAt,
      closedByIdentifier: report.closedByIdentifier,
      createdAt: report.createdAt,
      entityKey: report.entityKey,
      entityLabel: report.entityLabel,
      entityOwnerIdentifier: report.entityOwnerIdentifier,
      entityPreview: report.entityPreview,
      entityType: report.entityType,
      id: report.id,
      noteCount: report.notes.length,
      reason: report.reason,
      relatedUserIdentifier: report.relatedUserIdentifier,
      reporterIdentifier: report.reporterIdentifier,
      status: report.status,
      updatedAt: report.updatedAt,
    }
  }

  private buildAdminReportDetail(report: AdminReportRecord): AdminReportDetailResponse['report'] {
    const summary = this.buildAdminReportSummary(report)

    return {
      ...summary,
      canDelete: summary.entityType !== 'user',
      canHide: summary.entityType !== 'user',
      canRestrictUser: Boolean(summary.relatedUserIdentifier || summary.entityType === 'user'),
      notes: report.notes.map((note) => ({ ...note })),
      resolutionAction: report.resolutionAction,
      resolutionReason: report.resolutionReason,
    }
  }

  private buildAdminAuditEntry(entry: AdminAuditLogRecord): AdminAuditLogEntry {
    const actor = this.findAccount(entry.actorIdentifier)

    return {
      ...entry,
      actorDisplayName: actor ? buildAccountDisplayLabel(actor) : entry.actorIdentifier,
      actorNickname: actor ? normalizeNickname(actor.nickname ?? '') || undefined : undefined,
      targetLabel: this.buildAdminAuditTargetLabel(entry),
    }
  }

  private buildAdminAuditTargetLabel(entry: AdminAuditLogRecord) {
    const describeUser = (identifier: string, prefix: string) => {
      const account = this.findAccountForAdmin(identifier)
      if (account) {
        return `${prefix} · ${buildAdminAuditAccountLabel(account)}`
      }

      const queue = [entry.nextValue, entry.previousValue]
      for (const candidate of queue) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
        const record = candidate as Partial<AdminUserSummary> & { identifier?: string; nickname?: string; displayName?: string }
        if (normalizeIdentifier(record.identifier ?? '') !== normalizeIdentifier(identifier)) continue
        const nickname = normalizeNickname(record.nickname ?? '')
        const displayName = record.displayName?.trim() || record.identifier || identifier
        return `${prefix} · ${
          nickname ? `${displayName} (@${nickname}, ${record.identifier || identifier})` : `${displayName} (${record.identifier || identifier})`
        }`
      }

      return `${prefix} · ${identifier}`
    }

    if (entry.targetType === 'user') {
      return describeUser(entry.targetId, 'Пользователь')
    }

    if (entry.targetType === 'user-avatar') {
      return describeUser(entry.targetId, 'Аватарка пользователя')
    }

    if (entry.targetType === 'report') {
      const report =
        this.findAdminReport(entry.targetId) ??
        [entry.nextValue, entry.previousValue].find(
          (candidate): candidate is Pick<AdminReportSummary, 'entityLabel' | 'id'> =>
            Boolean(
              candidate &&
                typeof candidate === 'object' &&
                !Array.isArray(candidate) &&
                'entityLabel' in candidate &&
                'id' in candidate,
            ),
        )

      if (report) {
        return `Жалоба · ${report.entityLabel} · ${report.id}`
      }

      return `Жалоба · ${entry.targetId}`
    }

    if (entry.targetType === 'media') {
      const currentItem = this.collectAdminMediaItems().find((item) => item.mediaUrl === entry.targetId)
      const storedItem =
        currentItem ??
        [entry.nextValue, entry.previousValue]
          .flatMap((candidate) => (Array.isArray(candidate) ? candidate : candidate ? [candidate] : []))
          .find(
            (candidate): candidate is Pick<AdminMediaItem, 'contextLabel' | 'fileName' | 'mediaUrl' | 'owner' | 'typeLabel'> =>
              Boolean(
                candidate &&
                  typeof candidate === 'object' &&
                  'mediaUrl' in candidate &&
                  'fileName' in candidate &&
                  'contextLabel' in candidate,
              ) &&
              String((candidate as { mediaUrl?: string }).mediaUrl) === entry.targetId,
          )

      if (storedItem) {
        const ownerAccount = this.findAccount(storedItem.owner.identifier)
        const ownerLabel = ownerAccount
          ? buildAdminAuditAccountLabel(ownerAccount)
          : `${storedItem.owner.displayName} (${storedItem.owner.identifier})`
        return `Медиа · ${storedItem.typeLabel} · ${storedItem.fileName} · ${storedItem.contextLabel} · ${ownerLabel}`
      }

      return `Медиа · ${entry.targetId}`
    }

    if (entry.targetType === 'channel') {
      const handle = sanitizeChannelDirectLink(entry.targetId) || entry.targetId
      const channel =
        this.findManagedChannelByHandle(handle) ??
        this.database.subscriptionChannels.find(
          (item) => (sanitizeChannelDirectLink(item.handle) || item.handle) === handle,
        )
      return channel ? `Канал · ${channel.title} · @${handle}` : `Канал · @${handle}`
    }

    if (entry.targetType === 'group') {
      const group = this.database.groups.find((candidate) => buildAdminGroupAggregateKey(candidate) === entry.targetId)
      return group ? `Группа · ${group.title} · ${entry.targetId}` : `Группа · ${entry.targetId}`
    }

    if (entry.targetType === 'thread') {
      const thread = this.adminListThreads('').find((candidate) => candidate.id === entry.targetId)
      return thread ? `Тред · ${thread.contextLabel} · ${thread.title}` : `Тред · ${entry.targetId}`
    }

    if (entry.targetType === 'dialog') {
      const [ownerIdentifier, peerIdentifier] = entry.targetId.split('::')
      const dialog = ownerIdentifier && peerIdentifier ? this.adminLookupDialog(ownerIdentifier, peerIdentifier) : null
      return dialog
        ? `Диалог · ${dialog.owner.displayName} ↔ ${dialog.peer.displayName}`
        : `Диалог · ${entry.targetId}`
    }

    if (entry.targetType === 'audit-log') {
      return 'Audit log'
    }

    return `${entry.targetType} · ${entry.targetId}`
  }

  private adminAuditEntryTargetsIdentifier(entry: AdminAuditLogRecord, identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!normalizedIdentifier) {
      return false
    }

    const scan = (value: unknown): boolean => {
      if (!value) return false
      if (typeof value === 'string') {
        return normalizeIdentifier(value) === normalizedIdentifier
      }
      if (Array.isArray(value)) {
        return value.some((item) => scan(item))
      }
      if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some((item) => scan(item))
      }
      return false
    }

    if (normalizeIdentifier(entry.targetId) === normalizedIdentifier) {
      return true
    }

    if (scan(entry.nextValue) || scan(entry.previousValue)) {
      return true
    }

    if (entry.targetType === 'media') {
      const mediaItem = this.collectAdminMediaItems().find((item) => item.mediaUrl === entry.targetId)
      if (
        mediaItem &&
        (normalizeIdentifier(mediaItem.owner.identifier) === normalizedIdentifier ||
          mediaItem.relatedUsers.some(
            (user) => normalizeIdentifier(user.identifier) === normalizedIdentifier,
          ))
      ) {
        return true
      }
    }

    if (entry.targetType === 'report') {
      const report = this.findAdminReport(entry.targetId)
      if (
        report &&
        [
          report.entityOwnerIdentifier,
          report.relatedUserIdentifier,
          report.reporterIdentifier,
        ].some((value) => normalizeIdentifier(value ?? '') === normalizedIdentifier)
      ) {
        return true
      }
    }

    if (entry.targetType === 'dialog') {
      const [ownerIdentifier, peerIdentifier] = entry.targetId.split('::')
      return (
        normalizeIdentifier(ownerIdentifier) === normalizedIdentifier ||
        normalizeIdentifier(peerIdentifier) === normalizedIdentifier
      )
    }

    if (entry.targetType === 'channel') {
      const handle = sanitizeChannelDirectLink(entry.targetId) || entry.targetId
      const channel = this.findManagedChannelByHandle(handle)
      if (channel && normalizeIdentifier(channel.ownerIdentifier) === normalizedIdentifier) {
        return true
      }
    }

    if (entry.targetType === 'group') {
      const group = this.database.groups.find(
        (candidate) => buildAdminGroupAggregateKey(candidate) === entry.targetId,
      )
      if (!group) {
        return false
      }

      const creatorIdentifier =
        normalizeIdentifier(group.creatorIdentifier ?? '') || group.ownerIdentifier
      return (
        normalizeIdentifier(group.ownerIdentifier) === normalizedIdentifier ||
        creatorIdentifier === normalizedIdentifier
      )
    }

    if (entry.targetType === 'thread') {
      const thread = this.adminListThreads('').find((candidate) => candidate.id === entry.targetId)
      if (thread && normalizeIdentifier(thread.owner.identifier) === normalizedIdentifier) {
        return true
      }
    }

    return false
  }

  private findAdminReport(reportId: string) {
    return this.database.adminReports.find((report) => report.id === reportId) ?? null
  }

  private async appendAdminAuditLog(
    actor: Pick<Account, 'identifier'> & { staffRole: StaffRole },
    entry: Omit<AdminAuditLogRecord, 'actorIdentifier' | 'actorRole' | 'createdAt' | 'id'>,
  ) {
    this.database.adminAuditLogs.push({
      ...entry,
      actorIdentifier: actor.identifier,
      actorRole: actor.staffRole,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
    })
    await this.persist()
  }

  private upsertAdminReport(record: Omit<AdminReportRecord, 'closedAt' | 'closedByIdentifier' | 'id' | 'notes' | 'resolutionAction' | 'resolutionReason' | 'status' | 'updatedAt'>) {
    const existingReport = this.database.adminReports.find(
      (report) =>
        report.reporterIdentifier === record.reporterIdentifier &&
        report.entityType === record.entityType &&
        report.entityKey === record.entityKey,
    )

    if (existingReport) {
      existingReport.closedAt = undefined
      existingReport.closedByIdentifier = undefined
      existingReport.entityLabel = record.entityLabel
      existingReport.entityOwnerIdentifier = record.entityOwnerIdentifier
      existingReport.entityPreview = record.entityPreview
      existingReport.reason = record.reason
      existingReport.relatedUserIdentifier = record.relatedUserIdentifier
      existingReport.resolutionAction = undefined
      existingReport.resolutionReason = undefined
      existingReport.status = 'open'
      existingReport.updatedAt = new Date().toISOString()
      return existingReport
    }

    const nextReport: AdminReportRecord = {
      ...record,
      id: randomUUID(),
      notes: [],
      status: 'open',
      updatedAt: record.createdAt,
    }
    this.database.adminReports.push(nextReport)
    return nextReport
  }

  private collectAdminMediaItems(): AdminMediaItem[] {
    const items: AdminMediaItem[] = []
    const reportCountByKey = new Map<string, number>()

    for (const report of this.database.adminReports) {
      reportCountByKey.set(report.entityKey, (reportCountByKey.get(report.entityKey) ?? 0) + 1)
    }

    const buildAdminLinkedUser = (identifier: string): AdminLinkedUser => {
      const account = this.findAccount(identifier)
      return buildAdminLinkedUserSummary(account ?? undefined, identifier)
    }

    const countRelatedReports = (...keys: Array<string | undefined>) =>
      [...new Set(keys.filter(Boolean))]
        .map((key) => reportCountByKey.get(key!) ?? 0)
        .reduce((total, count) => total + count, 0)

    const pushItem = (payload: {
      attachment?: Pick<MessageAttachment, 'fileName' | 'mimeType'> | null
      createdAt?: string
      entityId?: string
      entityLabel: string
      entityType: AdminMediaItemEntityType
      fileName: string
      kindOverride?: PersistedPendingMediaUpload['kind'] | 'pending-upload' | 'unknown'
      linked?: boolean
      mediaUrl: string
      ownerIdentifier: string
      relatedReportKeys?: string[]
      relatedUsers?: AdminLinkedUser[]
      size: number
      typeLabel?: string
    }) => {
      const owner = buildAdminLinkedUser(payload.ownerIdentifier)
      const resolvedKind = payload.kindOverride ?? inferStoredMediaKind(payload.mediaUrl) ?? 'unknown'

      items.push({
        createdAt: payload.createdAt,
        contextLabel: payload.entityLabel,
        entityId: payload.entityId,
        entityLabel: payload.entityLabel,
        entityType: payload.entityType,
        fileName: payload.fileName,
        hidden: false,
        id: encodeURIComponent(payload.mediaUrl),
        kind: resolvedKind === 'pending-upload' ? 'unknown' : resolvedKind,
        linked: payload.linked ?? true,
        mediaUrl: payload.mediaUrl,
        owner,
        relatedReportCount: countRelatedReports(...(payload.relatedReportKeys ?? [])),
        relatedUsers: payload.relatedUsers?.length ? payload.relatedUsers : [owner],
        size: payload.size,
        typeLabel:
          payload.typeLabel ??
          classifyAdminMediaType(payload.attachment, resolvedKind),
      })
    }

    for (const upload of this.database.pendingMediaUploads) {
      pushItem({
        attachment: { fileName: upload.fileName, mimeType: upload.mimeType },
        createdAt: upload.createdAt,
        entityLabel: upload.linked ? 'Черновик вложения' : 'Сиротский media upload',
        entityType: 'pending-upload',
        fileName: upload.fileName,
        kindOverride: 'pending-upload',
        linked: upload.linked,
        mediaUrl: upload.mediaUrl,
        ownerIdentifier: upload.ownerIdentifier,
        size: upload.size,
        typeLabel: classifyAdminMediaType({ mimeType: upload.mimeType }, upload.kind),
      })
    }

    for (const account of this.database.accounts) {
      if (account.avatarImage) {
        pushItem({
          entityLabel: `Профиль: ${buildAccountDisplayLabel(account)}`,
          entityType: 'profile-avatar',
          fileName: 'Аватар профиля',
          kindOverride: 'profile-avatar',
          mediaUrl: account.avatarImage,
          ownerIdentifier: account.identifier,
          relatedReportKeys: [account.avatarImage],
          relatedUsers: [buildAdminLinkedUser(account.identifier)],
          size: 0,
        })
      }

      for (const gif of account.gifLibrary ?? []) {
        pushItem({
          attachment: { fileName: gif.fileName, mimeType: gif.mimeType },
          createdAt: gif.createdAt,
          entityLabel: `GIF-панель: ${buildAccountDisplayLabel(account)}`,
          entityType: 'user-gif',
          fileName: gif.fileName,
          kindOverride: 'user-gif',
          mediaUrl: gif.mediaUrl,
          ownerIdentifier: account.identifier,
          relatedReportKeys: [gif.mediaUrl],
          relatedUsers: [buildAdminLinkedUser(account.identifier)],
          size: gif.size,
        })
      }
    }

    for (const group of this.database.groups) {
      if (group.avatarImage) {
        pushItem({
          entityLabel: `Группа: ${group.title}`,
          entityType: 'group-avatar',
          fileName: 'Аватар группы',
          kindOverride: 'group-avatar',
          mediaUrl: group.avatarImage,
          ownerIdentifier: group.ownerIdentifier,
          relatedReportKeys: [group.avatarImage],
          relatedUsers: [buildAdminLinkedUser(group.ownerIdentifier)],
          size: 0,
        })
      }
    }

    for (const channel of this.database.managedChannels) {
      if (channel.avatarImage) {
        pushItem({
          entityLabel: `Канал: ${channel.title}`,
          entityType: 'channel-avatar',
          fileName: 'Аватар канала',
          kindOverride: 'channel-avatar',
          mediaUrl: channel.avatarImage,
          ownerIdentifier: channel.ownerIdentifier,
          relatedReportKeys: [channel.avatarImage],
          relatedUsers: [buildAdminLinkedUser(channel.ownerIdentifier)],
          size: 0,
        })
      }
    }

    for (const message of this.database.dialogMessages) {
      if (!message.attachment?.mediaUrl) continue

      const dialog = this.findDialog(message.ownerIdentifier, message.dialogId)
      const dialogPeerIdentifier = normalizeIdentifier(dialog?.phone ?? '')
      const dialogOwner = buildAdminLinkedUser(message.ownerIdentifier)
      const dialogPeer = dialogPeerIdentifier ? buildAdminLinkedUser(dialogPeerIdentifier) : null
      const dialogEntityId = buildAdminMessageEntityKey(
        'dialog',
        message.ownerIdentifier,
        message.dialogId,
        message.id,
      )

      pushItem({
        attachment: message.attachment,
        createdAt: message.createdAt,
        entityId: dialogEntityId,
        entityLabel: 'Личный диалог',
        entityType: 'dialog-message',
        fileName: message.attachment.fileName,
        mediaUrl: message.attachment.mediaUrl,
        ownerIdentifier: message.ownerIdentifier,
        relatedReportKeys: [dialogEntityId, message.attachment.mediaUrl],
        relatedUsers: dialogPeer ? [dialogOwner, dialogPeer] : [dialogOwner],
        size: message.attachment.size,
      })
    }

    for (const message of this.database.groupMessages) {
      const group = this.findGroup(message.ownerIdentifier, message.groupId)

      if (message.attachment?.mediaUrl) {
        const groupMessageEntityId = buildAdminMessageEntityKey(
          'group-message',
          message.ownerIdentifier,
          message.groupId,
          message.id,
        )

        pushItem({
          attachment: message.attachment,
          createdAt: message.createdAt,
          entityId: groupMessageEntityId,
          entityLabel: `Группа: ${group?.title ?? `#${message.groupId}`}`,
          entityType: 'group-message',
          fileName: message.attachment.fileName,
          mediaUrl: message.attachment.mediaUrl,
          ownerIdentifier: message.ownerIdentifier,
          relatedReportKeys: [groupMessageEntityId, message.attachment.mediaUrl],
          relatedUsers: [buildAdminLinkedUser(message.ownerIdentifier)],
          size: message.attachment.size,
        })
      }

      for (const comment of message.threadComments ?? []) {
        if (!comment.attachment?.mediaUrl) continue
        const commentOwnerIdentifier =
          normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier
        const groupCommentEntityId = buildAdminMessageEntityKey(
          'group-comment',
          commentOwnerIdentifier,
          message.groupId,
          comment.id,
        )

        pushItem({
          attachment: comment.attachment,
          createdAt: comment.createdAt,
          entityId: groupCommentEntityId,
          entityLabel: `Комментарии группы: ${group?.title ?? `#${message.groupId}`}`,
          entityType: 'group-comment',
          fileName: comment.attachment.fileName,
          mediaUrl: comment.attachment.mediaUrl,
          ownerIdentifier: commentOwnerIdentifier,
          relatedReportKeys: [groupCommentEntityId, comment.attachment.mediaUrl],
          relatedUsers: [buildAdminLinkedUser(commentOwnerIdentifier)],
          size: comment.attachment.size,
        })
      }
    }

    for (const post of this.database.subscriptionPosts) {
      const channel =
        this.findSubscriptionChannel(post.ownerIdentifier, post.channelId) ??
        this.findManagedChannel(post.ownerIdentifier, post.channelId)

      if (post.attachment?.mediaUrl) {
        const channelPostEntityId = buildAdminMessageEntityKey(
          'channel-post',
          post.ownerIdentifier,
          post.channelId,
          post.id,
        )

        pushItem({
          attachment: post.attachment,
          createdAt: post.createdAt,
          entityId: channelPostEntityId,
          entityLabel: `Канал: ${channel?.title ?? `#${post.channelId}`}`,
          entityType: 'channel-post',
          fileName: post.attachment.fileName,
          mediaUrl: post.attachment.mediaUrl,
          ownerIdentifier: post.ownerIdentifier,
          relatedReportKeys: [channelPostEntityId, post.attachment.mediaUrl],
          relatedUsers: [buildAdminLinkedUser(post.ownerIdentifier)],
          size: post.attachment.size,
        })
      }

      for (const comment of post.threadComments ?? []) {
        if (!comment.attachment?.mediaUrl) continue
        const commentOwnerIdentifier =
          normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier
        const channelCommentEntityId = buildAdminMessageEntityKey(
          'channel-comment',
          commentOwnerIdentifier,
          post.channelId,
          comment.id,
        )

        pushItem({
          attachment: comment.attachment,
          createdAt: comment.createdAt,
          entityId: channelCommentEntityId,
          entityLabel: `Комментарии канала: ${channel?.title ?? `#${post.channelId}`}`,
          entityType: 'channel-comment',
          fileName: comment.attachment.fileName,
          mediaUrl: comment.attachment.mediaUrl,
          ownerIdentifier: commentOwnerIdentifier,
          relatedReportKeys: [channelCommentEntityId, comment.attachment.mediaUrl],
          relatedUsers: [buildAdminLinkedUser(commentOwnerIdentifier)],
          size: comment.attachment.size,
        })
      }
    }

    return items.sort((left, right) => {
      const timeDiff = (parseIsoDate(right.createdAt) ?? 0) - (parseIsoDate(left.createdAt) ?? 0)
      if (timeDiff !== 0) {
        return timeDiff
      }

      return right.size - left.size
    })
  }

  private findVisibleMediaContextForReporter(viewerIdentifier: string, mediaUrl: string) {
    const viewerAccount = this.findAccount(viewerIdentifier)
    const viewerLabel = viewerAccount ? buildAccountDisplayLabel(viewerAccount) : viewerIdentifier
    const buildLabelForIdentifier = (identifier?: string) => {
      if (!identifier) {
        return undefined
      }

      const account = this.findAccount(identifier)
      return account ? buildAccountDisplayLabel(account) : identifier
    }

    for (const message of this.database.dialogMessages) {
      if (
        message.ownerIdentifier !== viewerIdentifier ||
        message.attachment?.mediaUrl !== mediaUrl
      ) {
        continue
      }

      const dialog = this.findDialog(viewerIdentifier, message.dialogId)
      const peerIdentifier = normalizeIdentifier(dialog?.phone ?? '')
      const peerLabel = buildLabelForIdentifier(peerIdentifier)
      const actualOwnerIdentifier =
        message.author === 'me' ? viewerIdentifier : peerIdentifier || viewerIdentifier

      return {
        entityLabel: peerLabel ? `Личный диалог: ${viewerLabel} ↔ ${peerLabel}` : 'Личный диалог',
        entityOwnerIdentifier: actualOwnerIdentifier,
        entityPreview: message.text || message.attachment.fileName || undefined,
        relatedUserIdentifier: actualOwnerIdentifier,
      }
    }

    for (const message of this.database.groupMessages) {
      if (message.ownerIdentifier !== viewerIdentifier) {
        continue
      }

      const group = this.findGroup(viewerIdentifier, message.groupId)
      if (message.attachment?.mediaUrl === mediaUrl) {
        const actualOwnerIdentifier =
          message.author === 'me'
            ? viewerIdentifier
            : normalizeIdentifier(
                group?.participants.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
              ) ||
              group?.creatorIdentifier ||
              viewerIdentifier

        return {
          entityLabel: `Группа: ${group?.title ?? `#${message.groupId}`}`,
          entityOwnerIdentifier: actualOwnerIdentifier,
          entityPreview: message.text || message.attachment.fileName || undefined,
          relatedUserIdentifier: actualOwnerIdentifier,
        }
      }

      for (const comment of message.threadComments ?? []) {
        if (comment.attachment?.mediaUrl !== mediaUrl) {
          continue
        }

        const actualOwnerIdentifier =
          normalizeIdentifier(comment.authorIdentifier ?? '') || viewerIdentifier

        return {
          entityLabel: `Комментарии группы: ${group?.title ?? `#${message.groupId}`}`,
          entityOwnerIdentifier: actualOwnerIdentifier,
          entityPreview: comment.text || comment.attachment.fileName || undefined,
          relatedUserIdentifier: actualOwnerIdentifier,
        }
      }
    }

    for (const post of this.database.subscriptionPosts) {
      if (post.ownerIdentifier !== viewerIdentifier) {
        continue
      }

      const channel = this.findSubscriptionChannel(viewerIdentifier, post.channelId)
      const channelHandle = channel?.handle
        ? sanitizeChannelDirectLink(channel.handle) || channel.handle
        : undefined
      const managedChannel = channelHandle ? this.findManagedChannelByHandle(channelHandle) : null

      if (post.attachment?.mediaUrl === mediaUrl) {
        const actualOwnerIdentifier = managedChannel?.ownerIdentifier || viewerIdentifier

        return {
          entityLabel: `Канал: ${channel?.title ?? `#${post.channelId}`}`,
          entityOwnerIdentifier: actualOwnerIdentifier,
          entityPreview: post.text || post.attachment.fileName || undefined,
          relatedUserIdentifier: actualOwnerIdentifier,
        }
      }

      for (const comment of post.threadComments ?? []) {
        if (comment.attachment?.mediaUrl !== mediaUrl) {
          continue
        }

        const actualOwnerIdentifier =
          normalizeIdentifier(comment.authorIdentifier ?? '') || viewerIdentifier

        return {
          entityLabel: `Комментарии канала: ${channel?.title ?? `#${post.channelId}`}`,
          entityOwnerIdentifier: actualOwnerIdentifier,
          entityPreview: comment.text || comment.attachment.fileName || undefined,
          relatedUserIdentifier: actualOwnerIdentifier,
        }
      }
    }

    return null
  }

  private async applyAdminUserBlockFromActor(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    identifier: string,
    reason: string,
  ) {
    const target = this.findAccountForAdmin(identifier)
    if (!target) {
      throw new Error('Пользователь не найден.')
    }

    const previousValue = this.buildAdminUserSummary(target)
    target.blockedAt = new Date().toISOString()
    target.blockedReason = reason || 'Аккаунт ограничен staff-командой.'
    this.database.sessions = this.database.sessions.filter((session) => session.identifier !== target.identifier)
    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: 'admin.user.block',
      nextValue: this.buildAdminUserSummary(target),
      previousValue,
      reason: reason || undefined,
      summary: `Ограничен пользователь ${buildAdminAuditAccountLabel(target)}${reason ? ` · ${reason}` : ''}`,
      targetId: target.identifier,
      targetType: 'user',
    })
  }

  private async applyAdminEntityModeration(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    report: AdminReportRecord,
    action: 'hide' | 'delete',
    reason: string,
  ) {
    if (report.entityType === 'channel') {
      if (action === 'hide') {
        await this.hideChannelByHandle(actor, report.entityKey, reason)
      } else {
        await this.deleteChannelByHandle(actor, report.entityKey, reason)
      }
      return
    }

    if (report.entityType === 'group') {
      if (action === 'hide') {
        await this.hideGroupBySharedId(actor, report.entityKey, reason)
      } else {
        await this.deleteGroupBySharedId(actor, report.entityKey, reason)
      }
      return
    }

    if (
      report.entityType === 'media' ||
      report.entityType === 'avatar' ||
      report.entityType === 'gif'
    ) {
      await this.applyMediaModerationAction(actor, report.entityKey, action, reason)
      return
    }

    throw new Error('Для этого типа жалобы пока нет moderation action.')
  }

  private async hideChannelByHandle(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    handle: string,
    reason: string,
  ) {
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    const managedChannel = this.findManagedChannelByHandle(normalizedHandle)
    const keptOwnerIdentifier = managedChannel?.ownerIdentifier

    if (managedChannel) {
      managedChannel.status = 'draft'
      managedChannel.visibility = 'closed'
    }

    this.removeSubscriptionChannelCopiesByHandle(normalizedHandle, keptOwnerIdentifier)
    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: 'admin.channel.hide',
      reason: reason || undefined,
      summary: `Скрыт канал ${normalizedHandle}${reason ? ` · ${reason}` : ''}`,
      targetId: normalizedHandle,
      targetType: 'channel',
    })
  }

  private async deleteChannelByHandle(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    handle: string,
    reason: string,
  ) {
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    const mediaUrls = new Set<string>()

    for (const channel of this.database.managedChannels) {
      if ((sanitizeChannelDirectLink(channel.directLink) || channel.directLink) !== normalizedHandle) continue
      if (channel.avatarImage) {
        mediaUrls.add(channel.avatarImage)
      }
    }

    for (const channel of this.listSubscriptionChannelCopiesByHandle(normalizedHandle)) {
      if (channel.avatarImage) {
        mediaUrls.add(channel.avatarImage)
      }
    }

    for (const post of this.database.subscriptionPosts) {
      const parentChannel = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
      if (!parentChannel) continue
      if ((sanitizeChannelDirectLink(parentChannel.handle) || parentChannel.handle) !== normalizedHandle) continue

      if (post.attachment?.mediaUrl) {
        mediaUrls.add(post.attachment.mediaUrl)
      }

      for (const comment of post.threadComments ?? []) {
        if (comment.attachment?.mediaUrl) {
          mediaUrls.add(comment.attachment.mediaUrl)
        }
      }
    }

    this.database.managedChannels = this.database.managedChannels.filter(
      (channel) => (sanitizeChannelDirectLink(channel.directLink) || channel.directLink) !== normalizedHandle,
    )
    this.removeSubscriptionChannelCopiesByHandle(normalizedHandle)
    await this.persist()

    for (const mediaUrl of mediaUrls) {
      await this.applyMediaModerationAction(actor, mediaUrl, 'delete', reason)
    }

    await this.appendAdminAuditLog(actor, {
      action: 'admin.channel.delete',
      reason: reason || undefined,
      summary: `Удалён канал ${normalizedHandle}${reason ? ` · ${reason}` : ''}`,
      targetId: normalizedHandle,
      targetType: 'channel',
    })
  }

  private removeSubscriptionChannelCopiesByHandle(handle: string, keepOwnerIdentifier?: string) {
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    const removableCopies = this.database.subscriptionChannels.filter(
      (channel) =>
        (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle &&
        (!keepOwnerIdentifier || channel.ownerIdentifier !== keepOwnerIdentifier),
    )
    const removableKeys = new Set(removableCopies.map((copy) => `${copy.ownerIdentifier}:${copy.id}`))

    this.database.subscriptionChannels = this.database.subscriptionChannels.filter(
      (channel) => !removableKeys.has(`${channel.ownerIdentifier}:${channel.id}`),
    )
    this.database.subscriptionPosts = this.database.subscriptionPosts.filter(
      (post) => !removableKeys.has(`${post.ownerIdentifier}:${post.channelId}`),
    )
    this.database.threadStates = this.database.threadStates.filter(
      (state) => !state.threadId.startsWith(`channel:${normalizedHandle}:`),
    )
  }

  private async hideGroupBySharedId(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    sharedId: string,
    reason: string,
  ) {
    const groupCopies = this.listGroupCopies(sharedId)
    const ownerIdentifier =
      normalizeIdentifier(groupCopies[0]?.creatorIdentifier ?? '') ||
      groupCopies[0]?.ownerIdentifier

    this.removeGroupCopiesBySharedId(sharedId, ownerIdentifier)
    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: 'admin.group.hide',
      reason: reason || undefined,
      summary: `Скрыта группа ${sharedId}${reason ? ` · ${reason}` : ''}`,
      targetId: sharedId,
      targetType: 'group',
    })
  }

  private async deleteGroupBySharedId(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    sharedId: string,
    reason: string,
  ) {
    const mediaUrls = new Set<string>()

    for (const group of this.listGroupCopies(sharedId)) {
      if (group.avatarImage) {
        mediaUrls.add(group.avatarImage)
      }
    }

    for (const message of this.database.groupMessages) {
      const parentGroup = this.findGroup(message.ownerIdentifier, message.groupId)
      if (!parentGroup || this.getSharedGroupId(parentGroup) !== sharedId) continue

      if (message.attachment?.mediaUrl) {
        mediaUrls.add(message.attachment.mediaUrl)
      }

      for (const comment of message.threadComments ?? []) {
        if (comment.attachment?.mediaUrl) {
          mediaUrls.add(comment.attachment.mediaUrl)
        }
      }
    }

    this.removeGroupCopiesBySharedId(sharedId)
    await this.persist()

    for (const mediaUrl of mediaUrls) {
      await this.applyMediaModerationAction(actor, mediaUrl, 'delete', reason)
    }

    await this.appendAdminAuditLog(actor, {
      action: 'admin.group.delete',
      reason: reason || undefined,
      summary: `Удалена группа ${sharedId}${reason ? ` · ${reason}` : ''}`,
      targetId: sharedId,
      targetType: 'group',
    })
  }

  private removeGroupCopiesBySharedId(sharedId: string, keepOwnerIdentifier?: string) {
    const removableCopies = this.listGroupCopies(sharedId).filter(
      (group) => !keepOwnerIdentifier || group.ownerIdentifier !== keepOwnerIdentifier,
    )
    const removableKeys = new Set(removableCopies.map((group) => `${group.ownerIdentifier}:${group.id}`))

    this.database.groups = this.database.groups.filter(
      (group) => !removableKeys.has(`${group.ownerIdentifier}:${group.id}`),
    )
    this.database.groupMessages = this.database.groupMessages.filter(
      (message) => !removableKeys.has(`${message.ownerIdentifier}:${message.groupId}`),
    )
    this.database.threadStates = this.database.threadStates.filter(
      (state) => !state.threadId.startsWith(`group:${sharedId}:`),
    )
  }

  private async applyMediaModerationAction(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    mediaUrl: string,
    action: 'hide' | 'delete',
    reason: string,
  ) {
    const previousValue = this.collectAdminMediaItems().filter((item) => item.mediaUrl === mediaUrl)
    const changed = this.stripMediaReferences(mediaUrl)
    if (!changed && action === 'delete') {
      const hadPendingUpload = this.database.pendingMediaUploads.some((upload) => upload.mediaUrl === mediaUrl)
      if (!hadPendingUpload) {
        throw new Error('Media-объект не найден для moderation.')
      }
    }

    if (action === 'delete') {
      this.database.pendingMediaUploads = this.database.pendingMediaUploads.filter(
        (upload) => upload.mediaUrl !== mediaUrl,
      )
    }

    await this.persist()

    if (action === 'delete') {
      const kind = inferStoredMediaKind(mediaUrl)
      if (kind) {
        try {
          await deleteStoredMediaByUrl(mediaUrl, kind)
        } catch (error) {
          console.error('Failed to delete moderated media', error)
        }
      }
    }

    await this.appendAdminAuditLog(actor, {
      action: `admin.media.${action}`,
      nextValue: this.collectAdminMediaItems().filter((item) => item.mediaUrl === mediaUrl),
      previousValue,
      reason: reason || undefined,
      summary: `${action === 'hide' ? 'Скрыт' : 'Удалён'} media-объект ${mediaUrl}${reason ? ` · ${reason}` : ''}`,
      targetId: mediaUrl,
      targetType: 'media',
    })
  }

  private stripMediaReferences(mediaUrl: string) {
    let didChange = false
    const removedThreadIds = new Set<string>()

    for (const account of this.database.accounts) {
      if (account.avatarImage === mediaUrl) {
        account.avatarImage = undefined
        didChange = true
      }

      const nextGifLibrary = (account.gifLibrary ?? []).filter((gif) => gif.mediaUrl !== mediaUrl)
      if (nextGifLibrary.length !== (account.gifLibrary ?? []).length) {
        account.gifLibrary = nextGifLibrary
        didChange = true
      }
    }

    for (const group of this.database.groups) {
      if (group.avatarImage === mediaUrl) {
        group.avatarImage = undefined
        didChange = true
      }
    }

    for (const channel of this.database.managedChannels) {
      if (channel.avatarImage === mediaUrl) {
        channel.avatarImage = undefined
        didChange = true
      }
    }

    for (const channel of this.database.subscriptionChannels) {
      if (channel.avatarImage === mediaUrl) {
        channel.avatarImage = undefined
        didChange = true
      }
    }

    const removedDialogMessages = this.database.dialogMessages.filter(
      (message) => message.attachment?.mediaUrl === mediaUrl,
    )
    if (removedDialogMessages.length > 0) {
      const removedKeys = new Set(
        removedDialogMessages.map((message) => `${message.ownerIdentifier}:${message.dialogId}:${message.id}`),
      )
      this.database.dialogMessages = this.database.dialogMessages.filter(
        (message) => !removedKeys.has(`${message.ownerIdentifier}:${message.dialogId}:${message.id}`),
      )
      for (const dialog of this.database.dialogs) {
        if (
          dialog.pinnedMessageId !== undefined &&
          removedDialogMessages.some(
            (message) =>
              message.ownerIdentifier === dialog.ownerIdentifier &&
              message.dialogId === dialog.id &&
              message.id === dialog.pinnedMessageId,
          )
        ) {
          dialog.pinnedMessageId = undefined
        }
      }
      didChange = true
    }

    const nextGroupMessages: PersistedGroupMessage[] = []
    for (const message of this.database.groupMessages) {
      if (message.attachment?.mediaUrl === mediaUrl) {
        if (message.threadId) {
          removedThreadIds.add(message.threadId)
        }
        didChange = true
        continue
      }

      const originalComments = compactThreadComments(message.threadComments)
      const filteredComments = originalComments.filter(
        (comment) => comment.attachment?.mediaUrl !== mediaUrl,
      )
      if (filteredComments.length !== originalComments.length) {
        didChange = true
        nextGroupMessages.push({
          ...message,
          threadComments: filteredComments,
        })
        continue
      }

      nextGroupMessages.push(message)
    }
    this.database.groupMessages = nextGroupMessages

    const nextSubscriptionPosts: PersistedSubscriptionPost[] = []
    for (const post of this.database.subscriptionPosts) {
      if (post.attachment?.mediaUrl === mediaUrl) {
        if (post.threadId) {
          removedThreadIds.add(post.threadId)
        }
        didChange = true
        continue
      }

      const originalComments = compactThreadComments(post.threadComments)
      const filteredComments = originalComments.filter(
        (comment) => comment.attachment?.mediaUrl !== mediaUrl,
      )
      if (filteredComments.length !== originalComments.length) {
        didChange = true
        nextSubscriptionPosts.push({
          ...post,
          threadComments: filteredComments,
        })
        continue
      }

      nextSubscriptionPosts.push(post)
    }
    this.database.subscriptionPosts = nextSubscriptionPosts

    if (removedThreadIds.size > 0) {
      this.database.threadStates = this.database.threadStates.filter(
        (state) => !removedThreadIds.has(state.threadId),
      )
    }

    return didChange
  }

  getStorageUsageByToken(token: string) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    return this.getStorageUsage(account.identifier)
  }

  assertMediaUploadWithinQuota(token: string, size: number) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const usage = this.getStorageUsage(account.identifier)
    if (usage.usedBytes + size > usage.quotaBytes) {
      if (usage.usedBytes > usage.quotaBytes) {
        throw new Error('Ваше хранилище уже превышает текущий лимит. Освободите место или включите премиум.')
      }

      throw new Error('Недостаточно места в хранилище для нового вложения.')
    }
  }

  async registerPendingMediaUpload(
    token: string,
    payload: Omit<PersistedPendingMediaUpload, 'createdAt' | 'linked' | 'ownerIdentifier'>,
  ) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const existingUpload = this.database.pendingMediaUploads.find(
      (upload) => upload.ownerIdentifier === account.identifier && upload.mediaUrl === payload.mediaUrl,
    )
    if (existingUpload) {
      existingUpload.createdAt = new Date().toISOString()
      existingUpload.fileName = payload.fileName
      existingUpload.kind = payload.kind
      existingUpload.linked = false
      existingUpload.mimeType = payload.mimeType
      existingUpload.size = payload.size
      existingUpload.storageKey = payload.storageKey
    } else {
      this.database.pendingMediaUploads.push({
        ...payload,
        createdAt: new Date().toISOString(),
        linked: false,
        ownerIdentifier: account.identifier,
      })
    }

    await this.persist()
  }

  async cleanupExpiredPendingMediaUploads() {
    const now = Date.now()
    const staleUploads = this.database.pendingMediaUploads.filter((upload) => {
      const createdAt = Date.parse(upload.createdAt)
      return !upload.linked && !Number.isNaN(createdAt) && now - createdAt >= orphanUploadTtlMs
    })

    if (staleUploads.length === 0) {
      return 0
    }

    this.database.pendingMediaUploads = this.database.pendingMediaUploads.filter(
      (upload) => !staleUploads.some((staleUpload) => staleUpload.mediaUrl === upload.mediaUrl),
    )
    await this.persist()

    for (const upload of staleUploads) {
      try {
        await deleteStoredMediaByUrl(upload.mediaUrl, upload.kind)
      } catch (error) {
        console.error('Failed to cleanup orphan upload', error)
      }
    }

    return staleUploads.length
  }

  async cleanupExpiredRetentionData() {
    const cutoffTimestamp = Date.now() - historicalRetentionMs
    let didMutate = false
    const removedMediaUrls = new Set<string>()
    const summary = {
      adminAuditLogs: 0,
      adminReports: 0,
      contactReports: 0,
      dialogMessages: 0,
      dialogs: 0,
      groupMessages: 0,
      groups: 0,
      ipAccessLogs: 0,
      passwordAuthAttempts: 0,
      sessions: 0,
      subscriptionChannelReports: 0,
      subscriptionChannels: 0,
      subscriptionPosts: 0,
      userGifs: 0,
    }

    const collectRemovedMediaUrls = (urls: string[]) => {
      urls.forEach((mediaUrl) => {
        if (mediaUrl) {
          removedMediaUrls.add(mediaUrl)
        }
      })
    }

    this.database.accounts = this.database.accounts.map((account) => {
      const currentGifLibrary = account.gifLibrary ?? []
      if (currentGifLibrary.length === 0) {
        return account
      }

      const nextGifLibrary = currentGifLibrary.filter((gif) => !isTimestampOlderThan(gif.createdAt, cutoffTimestamp))
      if (nextGifLibrary.length === currentGifLibrary.length) {
        return account
      }

      summary.userGifs += currentGifLibrary.length - nextGifLibrary.length
      collectRemovedMediaUrls(
        currentGifLibrary
          .filter((gif) => isTimestampOlderThan(gif.createdAt, cutoffTimestamp))
          .map((gif) => gif.mediaUrl),
      )
      didMutate = true

      return {
        ...account,
        gifLibrary: nextGifLibrary.length > 0 ? nextGifLibrary : undefined,
      }
    })

    const nextSessions = this.database.sessions.filter((session) => !isTimestampOlderThan(session.createdAt, cutoffTimestamp))
    if (nextSessions.length !== this.database.sessions.length) {
      summary.sessions = this.database.sessions.length - nextSessions.length
      this.database.sessions = nextSessions
      didMutate = true
    }

    const nextIpAccessLogs = this.database.ipAccessLogs.filter((entry) => !isTimestampOlderThan(entry.createdAt, cutoffTimestamp))
    if (nextIpAccessLogs.length !== this.database.ipAccessLogs.length) {
      summary.ipAccessLogs = this.database.ipAccessLogs.length - nextIpAccessLogs.length
      this.database.ipAccessLogs = nextIpAccessLogs
      didMutate = true
    }

    const nextPasswordAuthAttempts = this.database.passwordAuthAttempts.filter(
      (entry) => !isTimestampOlderThan(entry.lastFailedAt, cutoffTimestamp),
    )
    if (nextPasswordAuthAttempts.length !== this.database.passwordAuthAttempts.length) {
      summary.passwordAuthAttempts =
        this.database.passwordAuthAttempts.length - nextPasswordAuthAttempts.length
      this.database.passwordAuthAttempts = nextPasswordAuthAttempts
      didMutate = true
    }

    const nextAdminAuditLogs = this.database.adminAuditLogs.filter((entry) => !isTimestampOlderThan(entry.createdAt, cutoffTimestamp))
    if (nextAdminAuditLogs.length !== this.database.adminAuditLogs.length) {
      summary.adminAuditLogs = this.database.adminAuditLogs.length - nextAdminAuditLogs.length
      this.database.adminAuditLogs = nextAdminAuditLogs
      didMutate = true
    }

    const nextAdminReports = this.database.adminReports.filter((report) => {
      const reportTimestamp = parseIsoDate(report.updatedAt) ?? parseIsoDate(report.createdAt)
      return reportTimestamp === null || reportTimestamp >= cutoffTimestamp
    })
    if (nextAdminReports.length !== this.database.adminReports.length) {
      summary.adminReports = this.database.adminReports.length - nextAdminReports.length
      this.database.adminReports = nextAdminReports
      didMutate = true
    }

    const nextContactReports = this.database.contactReports.filter((report) => !isTimestampOlderThan(report.createdAt, cutoffTimestamp))
    if (nextContactReports.length !== this.database.contactReports.length) {
      summary.contactReports = this.database.contactReports.length - nextContactReports.length
      this.database.contactReports = nextContactReports
      didMutate = true
    }

    const nextSubscriptionChannelReports = this.database.subscriptionChannelReports.filter(
      (report) => !isTimestampOlderThan(report.createdAt, cutoffTimestamp),
    )
    if (nextSubscriptionChannelReports.length !== this.database.subscriptionChannelReports.length) {
      summary.subscriptionChannelReports =
        this.database.subscriptionChannelReports.length - nextSubscriptionChannelReports.length
      this.database.subscriptionChannelReports = nextSubscriptionChannelReports
      didMutate = true
    }

    const latestDialogActivityByKey = new Map<string, number>()
    for (const message of this.database.dialogMessages) {
      const createdAt = parseIsoDate(message.createdAt)
      if (createdAt === null) {
        continue
      }

      const key = `${message.ownerIdentifier}:${message.dialogId}`
      const existing = latestDialogActivityByKey.get(key)
      if (existing === undefined || createdAt > existing) {
        latestDialogActivityByKey.set(key, createdAt)
      }
    }

    const nextDialogMessages = this.database.dialogMessages.filter((message) => {
      if (!isTimestampOlderThan(message.createdAt, cutoffTimestamp)) {
        return true
      }

      collectRemovedMediaUrls(collectMediaUrlsFromAttachment(message.attachment))
      summary.dialogMessages += 1
      didMutate = true
      return false
    })
    if (nextDialogMessages.length !== this.database.dialogMessages.length) {
      this.database.dialogMessages = nextDialogMessages
    }

    const retainedDialogKeys = new Set(
      this.database.dialogMessages.map((message) => `${message.ownerIdentifier}:${message.dialogId}`),
    )
    const nextDialogs = this.database.dialogs.filter((dialog) => {
      const key = `${dialog.ownerIdentifier}:${dialog.id}`
      if (retainedDialogKeys.has(key)) {
        return true
      }

      const latestActivity = latestDialogActivityByKey.get(key)
      if (latestActivity !== undefined && latestActivity < cutoffTimestamp) {
        summary.dialogs += 1
        didMutate = true
        return false
      }

      return true
    })
    if (nextDialogs.length !== this.database.dialogs.length) {
      this.database.dialogs = nextDialogs
    }

    const latestGroupActivityByKey = new Map<string, number>()
    const nextGroupMessages: PersistedGroupMessage[] = []
    for (const message of this.database.groupMessages) {
      const key = `${message.ownerIdentifier}:${message.groupId}`
      const latestActivityTimestamp = getLatestActivityTimestamp(message.createdAt, compactThreadComments(message.threadComments))
      if (latestActivityTimestamp !== null) {
        const existing = latestGroupActivityByKey.get(key)
        if (existing === undefined || latestActivityTimestamp > existing) {
          latestGroupActivityByKey.set(key, latestActivityTimestamp)
        }
      }

      const retainedComments = compactThreadComments(message.threadComments).filter(
        (comment) => !isTimestampOlderThan(comment.createdAt, cutoffTimestamp),
      )
      const originalComments = compactThreadComments(message.threadComments)
      if (retainedComments.length !== originalComments.length) {
        collectRemovedMediaUrls(
          originalComments
            .filter((comment) => isTimestampOlderThan(comment.createdAt, cutoffTimestamp))
            .flatMap((comment) => collectMediaUrlsFromAttachment(comment.attachment)),
        )
        didMutate = true
      }

      if (latestActivityTimestamp !== null && latestActivityTimestamp < cutoffTimestamp) {
        collectRemovedMediaUrls(collectMediaUrlsFromAttachment(message.attachment))
        collectRemovedMediaUrls(collectMediaUrlsFromThreadComments(originalComments))
        summary.groupMessages += 1
        didMutate = true
        continue
      }

      nextGroupMessages.push(
        retainedComments.length === originalComments.length
          ? message
          : {
              ...message,
              threadComments: retainedComments,
            },
      )
    }
    if (nextGroupMessages.length !== this.database.groupMessages.length) {
      this.database.groupMessages = nextGroupMessages
    } else if (didMutate) {
      this.database.groupMessages = nextGroupMessages
    }

    const retainedGroupKeys = new Set(
      this.database.groupMessages.map((message) => `${message.ownerIdentifier}:${message.groupId}`),
    )
    const nextGroups = this.database.groups.filter((group) => {
      const key = `${group.ownerIdentifier}:${group.id}`
      if (retainedGroupKeys.has(key)) {
        return true
      }

      const latestActivity = latestGroupActivityByKey.get(key) ?? parseIsoDate(group.latestActivityAt)
      if (latestActivity !== null && latestActivity !== undefined && latestActivity < cutoffTimestamp) {
        summary.groups += 1
        didMutate = true
        return false
      }

      return true
    })
    if (nextGroups.length !== this.database.groups.length) {
      this.database.groups = nextGroups
    }

    const latestChannelActivityByKey = new Map<string, number>()
    const nextSubscriptionPosts: PersistedSubscriptionPost[] = []
    for (const post of this.database.subscriptionPosts) {
      const key = `${post.ownerIdentifier}:${post.channelId}`
      const latestActivityTimestamp = getLatestActivityTimestamp(post.createdAt, compactThreadComments(post.threadComments))
      if (latestActivityTimestamp !== null) {
        const existing = latestChannelActivityByKey.get(key)
        if (existing === undefined || latestActivityTimestamp > existing) {
          latestChannelActivityByKey.set(key, latestActivityTimestamp)
        }
      }

      const retainedComments = compactThreadComments(post.threadComments).filter(
        (comment) => !isTimestampOlderThan(comment.createdAt, cutoffTimestamp),
      )
      const originalComments = compactThreadComments(post.threadComments)
      if (retainedComments.length !== originalComments.length) {
        collectRemovedMediaUrls(
          originalComments
            .filter((comment) => isTimestampOlderThan(comment.createdAt, cutoffTimestamp))
            .flatMap((comment) => collectMediaUrlsFromAttachment(comment.attachment)),
        )
        didMutate = true
      }

      if (latestActivityTimestamp !== null && latestActivityTimestamp < cutoffTimestamp) {
        collectRemovedMediaUrls(collectMediaUrlsFromAttachment(post.attachment))
        collectRemovedMediaUrls(collectMediaUrlsFromThreadComments(originalComments))
        summary.subscriptionPosts += 1
        didMutate = true
        continue
      }

      nextSubscriptionPosts.push(
        retainedComments.length === originalComments.length
          ? post
          : {
              ...post,
              threadComments: retainedComments,
            },
      )
    }
    if (nextSubscriptionPosts.length !== this.database.subscriptionPosts.length) {
      this.database.subscriptionPosts = nextSubscriptionPosts
    } else if (didMutate) {
      this.database.subscriptionPosts = nextSubscriptionPosts
    }

    const retainedSubscriptionChannelKeys = new Set(
      this.database.subscriptionPosts.map((post) => `${post.ownerIdentifier}:${post.channelId}`),
    )
    const nextSubscriptionChannels = this.database.subscriptionChannels.filter((channel) => {
      const key = `${channel.ownerIdentifier}:${channel.id}`
      if (retainedSubscriptionChannelKeys.has(key)) {
        return true
      }

      const latestActivity = latestChannelActivityByKey.get(key)
      if (latestActivity !== undefined && latestActivity < cutoffTimestamp) {
        summary.subscriptionChannels += 1
        didMutate = true
        return false
      }

      return true
    })
    if (nextSubscriptionChannels.length !== this.database.subscriptionChannels.length) {
      this.database.subscriptionChannels = nextSubscriptionChannels
    }

    const retainedThreadIds = new Set<string>()
    for (const message of this.database.groupMessages) {
      if (message.threadId) {
        retainedThreadIds.add(message.threadId)
      }
    }
    for (const post of this.database.subscriptionPosts) {
      if (post.threadId) {
        retainedThreadIds.add(post.threadId)
      }
    }
    this.database.threadStates = this.database.threadStates.filter((state) => retainedThreadIds.has(state.threadId))

    for (const account of this.database.accounts) {
      const existingDialogIds = new Set(
        this.database.dialogs
          .filter((dialog) => dialog.ownerIdentifier === account.identifier)
          .map((dialog) => dialog.id),
      )
      if ((account.blockedContactIds?.length ?? 0) > 0) {
        const nextBlockedContactIds = (account.blockedContactIds ?? []).filter((dialogId) => existingDialogIds.has(dialogId))
        if (nextBlockedContactIds.length !== (account.blockedContactIds ?? []).length) {
          account.blockedContactIds = nextBlockedContactIds.length > 0 ? nextBlockedContactIds : undefined
          didMutate = true
        }
      }
    }

    if (!didMutate) {
      return summary
    }

    await this.persist()

    for (const mediaUrl of removedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
    }

    return summary
  }

  private getStorageUsage(ownerIdentifier: string): StorageUsage {
    const account = this.findAccount(ownerIdentifier)
    const trackedMedia = new Map<string, number>()

    for (const upload of this.database.pendingMediaUploads) {
      if (upload.ownerIdentifier !== ownerIdentifier) continue
      trackedMedia.set(upload.mediaUrl, upload.size)
    }

    for (const reference of this.collectOwnedMediaReferences()) {
      if (reference.ownerIdentifier !== ownerIdentifier) continue
      if (!trackedMedia.has(reference.mediaUrl)) {
        trackedMedia.set(reference.mediaUrl, reference.size)
      }
    }

    const usedBytes = [...trackedMedia.values()].reduce((total, size) => total + size, 0)
    return buildStorageUsage(usedBytes, account?.premium, account?.premiumExpiresAt)
  }

  private collectOwnedMediaReferences(): OwnedStoredMediaReference[] {
    const references: OwnedStoredMediaReference[] = []

    for (const account of this.database.accounts) {
      if (account.avatarImage) {
        references.push({
          kind: 'profile-avatar',
          mediaUrl: account.avatarImage,
          ownerIdentifier: account.identifier,
          size: 0,
        })
      }

      for (const gif of account.gifLibrary ?? []) {
        references.push({
          kind: 'user-gif',
          mediaUrl: gif.mediaUrl,
          ownerIdentifier: account.identifier,
          size: gif.size,
        })
      }
    }

    for (const group of this.database.groups) {
      if (!group.avatarImage) continue
      references.push({
        kind: 'group-avatar',
        mediaUrl: group.avatarImage,
        ownerIdentifier: group.ownerIdentifier,
        size: 0,
      })
    }

    for (const channel of this.database.managedChannels) {
      if (!channel.avatarImage) continue
      references.push({
        kind: 'channel-avatar',
        mediaUrl: channel.avatarImage,
        ownerIdentifier: channel.ownerIdentifier,
        size: 0,
      })
    }

    for (const message of this.database.dialogMessages) {
      const attachment = sanitizeMessageAttachment(message.attachment)
      if (!attachment) continue
      const ownerIdentifier =
        message.author === 'me'
          ? message.ownerIdentifier
          : normalizeIdentifier(
              this.findDialog(message.ownerIdentifier, message.dialogId)?.phone ?? '',
            ) || message.ownerIdentifier
      references.push({
        kind: inferStoredMediaKind(attachment.mediaUrl) ?? 'attachment',
        mediaUrl: attachment.mediaUrl,
        ownerIdentifier,
        size: attachment.size,
      })
    }

    for (const message of this.database.groupMessages) {
      const attachment = sanitizeMessageAttachment(message.attachment)
      if (attachment) {
        const ownerIdentifier =
          message.author === 'me'
            ? message.ownerIdentifier
            : normalizeIdentifier(
                this.findGroup(message.ownerIdentifier, message.groupId)
                  ?.participants.find((participant) => participant.id === message.groupParticipantId)
                  ?.identifier ?? '',
              ) || message.ownerIdentifier
        references.push({
          kind: inferStoredMediaKind(attachment.mediaUrl) ?? 'attachment',
          mediaUrl: attachment.mediaUrl,
          ownerIdentifier,
          size: attachment.size,
        })
      }

      for (const comment of message.threadComments ?? []) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment) continue
        references.push({
          kind: inferStoredMediaKind(commentAttachment.mediaUrl) ?? 'attachment',
          mediaUrl: commentAttachment.mediaUrl,
          ownerIdentifier: normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier,
          size: commentAttachment.size,
        })
      }
    }

    for (const post of this.database.subscriptionPosts) {
      const attachment = sanitizeMessageAttachment(post.attachment)
      if (attachment) {
        const channelHandle =
          this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)?.handle ?? ''
        const channelOwnerIdentifier =
          this.findManagedChannelByHandle(channelHandle)?.ownerIdentifier ?? post.ownerIdentifier
        references.push({
          kind: inferStoredMediaKind(attachment.mediaUrl) ?? 'attachment',
          mediaUrl: attachment.mediaUrl,
          ownerIdentifier: channelOwnerIdentifier,
          size: attachment.size,
        })
      }

      for (const comment of post.threadComments ?? []) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment) continue
        references.push({
          kind: inferStoredMediaKind(commentAttachment.mediaUrl) ?? 'attachment',
          mediaUrl: commentAttachment.mediaUrl,
          ownerIdentifier: normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier,
          size: commentAttachment.size,
        })
      }
    }

    return references.map((reference) => {
      if (reference.size > 0) return reference

      const pendingSize = this.database.pendingMediaUploads.find(
        (upload) =>
          upload.ownerIdentifier === reference.ownerIdentifier && upload.mediaUrl === reference.mediaUrl,
      )?.size

      return {
        ...reference,
        size: pendingSize ?? 0,
      }
    })
  }

  private clearPendingMediaUpload(mediaUrl?: string) {
    if (!mediaUrl) return
    for (const upload of this.database.pendingMediaUploads) {
      if (upload.mediaUrl === mediaUrl) {
        upload.linked = true
      }
    }
  }

  private async discardPendingMediaUpload(mediaUrl?: string) {
    if (!mediaUrl) return

    const pendingUpload = this.database.pendingMediaUploads.find(
      (upload) => upload.mediaUrl === mediaUrl && !upload.linked,
    )
    if (!pendingUpload) return

    this.database.pendingMediaUploads = this.database.pendingMediaUploads.filter(
      (upload) => upload.mediaUrl !== mediaUrl,
    )
    await this.persist()

    try {
      await deleteStoredMediaByUrl(mediaUrl, pendingUpload.kind)
    } catch (error) {
      console.error('Failed to discard duplicate pending media upload', error)
    }
  }

  private async deleteMediaIfUnreferenced(mediaUrl?: string) {
    if (!mediaUrl) return

    const kind = inferStoredMediaKind(mediaUrl)
    if (!kind) return

    const hasPendingUpload = this.database.pendingMediaUploads.some(
      (upload) => upload.mediaUrl === mediaUrl && !upload.linked,
    )
    if (hasPendingUpload) return

    const isStillReferenced = this.collectOwnedMediaReferences().some(
      (reference) => reference.mediaUrl === mediaUrl,
    )
    if (isStillReferenced) return

    try {
      await deleteStoredMediaByUrl(mediaUrl, kind)
      this.database.pendingMediaUploads = this.database.pendingMediaUploads.filter(
        (upload) => upload.mediaUrl !== mediaUrl,
      )
      await this.persist()
    } catch (error) {
      console.error('Failed to delete unreferenced media', error)
    }
  }

  private clearChallenge(identifier: string) {
    this.database.authChallenges = this.database.authChallenges.filter(
      (challenge) => challenge.identifier !== identifier,
    )
  }

  private async createSessionToken(identifier: string, accessContext?: SessionAccessContext) {
    const account = this.findAccount(identifier)
    if (account) {
      account.lastActiveAt = new Date().toISOString()
    }

    const token = randomUUID()
    this.database.sessions.push({
      createdAt: new Date().toISOString(),
      identifier,
      token,
    })

    if (accessContext) {
      await this.recordIpAccessEvent(identifier, accessContext)
    }

    return token
  }

  private getIpAccessLogsForIdentifier(identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    return this.database.ipAccessLogs
      .filter((entry) => normalizeIdentifier(entry.identifier) === normalizedIdentifier)
      .sort((left, right) => (parseIsoDate(left.createdAt) ?? 0) - (parseIsoDate(right.createdAt) ?? 0))
  }

  private buildAdminUserIpSummary(identifier: string): AdminUserIpSummary {
    const ipLogs = this.getIpAccessLogsForIdentifier(identifier)
    const latestEvent = ipLogs.at(-1)
    const lastLoginEvent = [...ipLogs].reverse().find((entry) => entry.eventType === 'login')

    return {
      ipChangeCount: ipLogs.filter((entry) => entry.eventType === 'ip-change').length,
      lastLoginAt: lastLoginEvent?.createdAt,
      lastLoginIp: lastLoginEvent?.ip,
      latestIp: latestEvent?.ip,
      latestIpAt: latestEvent?.createdAt,
    }
  }

  private async recordIpAccessEvent(identifier: string, context: SessionAccessContext) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const ip = sanitizeIpAddress(context.ip)
    if (!normalizedIdentifier || !ip) {
      return false
    }

    const existingLogs = this.getIpAccessLogsForIdentifier(normalizedIdentifier)
    const latestEvent = existingLogs.at(-1)
    const latestIp = latestEvent?.ip
    const isLoginSource =
      context.source === 'register' ||
      context.source === 'verify-code' ||
      context.source === 'password-login' ||
      context.source === 'password-setup' ||
      context.source === 'password-reset'
    const eventType: AdminIpLogEventType = isLoginSource
      ? 'login'
      : latestIp && latestIp !== ip
        ? 'ip-change'
        : 'login'

    if (!isLoginSource && latestIp === ip) {
      return false
    }

    this.database.ipAccessLogs.push({
      createdAt: new Date().toISOString(),
      eventType,
      id: randomUUID(),
      identifier: normalizedIdentifier,
      ip,
      previousIp: eventType === 'ip-change' ? latestIp : undefined,
      source: context.source,
      userAgent: sanitizeUserAgent(context.userAgent),
    })
    await this.persist()
    return true
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
    const account = identifier ? this.findAccount(identifier) : null
    return account && !isAccountBlocked(account) ? account : null
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
      this.syncManagedChannelSubscriptionCopies(sourceChannel)
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
      statusText: sourceChannel.description,
      time: '',
      title: sourceChannel.title,
      unread: 0,
      visibility: sourceChannel.visibility,
    }

    this.database.subscriptionChannels.push(nextCopy)
    this.syncManagedChannelSubscriptionCopies(sourceChannel)
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
    attachment?: Message['attachment'],
    deliveryId?: string,
  ): ThreadComment {
    return {
      attachment,
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
    attachment?: Message['attachment'],
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
        const nextComment = this.buildThreadComment(
          authorAccount,
          groupCopy.ownerIdentifier,
          text,
          attachment,
          deliveryId,
        )
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
    attachment?: Message['attachment'],
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
        const nextComment = this.buildThreadComment(
          authorAccount,
          channelCopy.ownerIdentifier,
          text,
          attachment,
          deliveryId,
        )
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

  private buildChannelInviteSource(channel: PersistedManagedChannel): NonNullable<Message['sourceChannel']> {
    return {
      accent: channel.avatarTone,
      draft: channel.status === 'draft',
      handle: channel.directLink,
      leadText: 'Пользователь приглашает вас подписаться на канал:',
      title: channel.title,
      visibility: channel.visibility,
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

  private findManagedChannelByHandle(handle: string) {
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    return (
      this.database.managedChannels.find(
        (channel) =>
          (sanitizeChannelDirectLink(channel.directLink) || channel.directLink) === normalizedHandle,
      ) ?? null
    )
  }

  private syncManagedChannelSubscriptionCopies(sourceChannel: PersistedManagedChannel) {
    const normalizedHandle = sanitizeChannelDirectLink(sourceChannel.directLink) || sourceChannel.directLink
    const copies = this.database.subscriptionChannels.filter(
      (channel) =>
        (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
    )
    const subscriberCount = Math.max(1, new Set(copies.map((copy) => copy.ownerIdentifier)).size)

    for (const copy of copies) {
      copy.accent = sourceChannel.avatarTone
      copy.avatarImage = sourceChannel.avatarImage
      copy.commentBlacklistIdentifiers = sanitizeIdentifierList(sourceChannel.commentBlacklistIdentifiers)
      copy.commentsEnabledForAll = Boolean(sourceChannel.commentsEnabledForAll)
      copy.commentsEnabledForPremium = Boolean(sourceChannel.commentsEnabledForPremium)
      copy.draft = sourceChannel.status === 'draft'
      copy.handle = sourceChannel.directLink
      copy.preview = copy.preview || sourceChannel.description
      copy.statusText = sourceChannel.description
      copy.readers = subscriberCount
      copy.title = sourceChannel.title
      copy.visibility = sourceChannel.visibility
    }

    return copies
  }

  private revokeSubscriptionChannelAccess(handle: string, targetIdentifier: string) {
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    const targetCopies = this.database.subscriptionChannels.filter(
      (channel) =>
        channel.ownerIdentifier === targetIdentifier &&
        (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
    )

    if (targetCopies.length === 0) {
      return false
    }

    const removedChannelIds = new Set(targetCopies.map((copy) => copy.id))
    this.database.subscriptionChannels = this.database.subscriptionChannels.filter(
      (channel) => !removedChannelIds.has(channel.id) || channel.ownerIdentifier !== targetIdentifier,
    )
    this.database.subscriptionPosts = this.database.subscriptionPosts.filter(
      (post) => !(post.ownerIdentifier === targetIdentifier && removedChannelIds.has(post.channelId)),
    )
    this.database.threadStates = this.database.threadStates.filter(
      (threadState) =>
        !(
          threadState.ownerIdentifier === targetIdentifier &&
          threadState.threadId.startsWith(`channel:${normalizedHandle}:`)
        ),
    )

    return true
  }

  private deliverDirectChannelInvitation(
    sender: Account,
    recipient: Account,
    channel: PersistedManagedChannel,
  ) {
    const senderDialog = this.ensureDialogForContact(sender.identifier, recipient)
    const recipientDialog = this.ensureDialogForContact(recipient.identifier, sender)
    const createdAt = new Date().toISOString()
    const time = formatNowTime()
    const sourceChannel = this.buildChannelInviteSource(channel)

    this.database.dialogMessages.push({
      author: 'me',
      dialogId: senderDialog.id,
      id: this.getNextDialogMessageId(sender.identifier, senderDialog.id),
      ownerIdentifier: sender.identifier,
      sourceChannel,
      text: '',
      createdAt,
      time,
    })

    this.database.dialogMessages.push({
      author: 'them',
      dialogId: recipientDialog.id,
      id: this.getNextDialogMessageId(recipient.identifier, recipientDialog.id),
      ownerIdentifier: recipient.identifier,
      sourceChannel,
      text: '',
      createdAt,
      time,
    })

    senderDialog.typing = false
    senderDialog.unread = 0
    senderDialog.status = 'только что был(а) здесь'
    recipientDialog.typing = false
    recipientDialog.unread = recipientDialog.muted ? 0 : recipientDialog.unread + 1
    this.syncDialogContactProfile(senderDialog, recipient)
    this.syncDialogContactProfile(recipientDialog, sender)
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
        dialog.ownerIdentifier === ownerIdentifier &&
        normalizeIdentifier(dialog.phone) === contactAccount.identifier,
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

    if (existingAccount.isTestEntity !== true) {
      existingAccount.isTestEntity = true
      didMutate = true
    }
    if ((existingAccount.createdAt ?? '') !== testAccount.createdAt) {
      existingAccount.createdAt = testAccount.createdAt
      didMutate = true
    }
  }

  return didMutate
}

function createNextOwnedDialogIdAllocator(dialogs: PersistedDialog[]) {
  const nextIdByOwner = new Map<string, number>()

  for (const dialog of dialogs) {
    const currentMaxId = nextIdByOwner.get(dialog.ownerIdentifier) ?? 0
    if (dialog.id > currentMaxId) {
      nextIdByOwner.set(dialog.ownerIdentifier, dialog.id)
    }
  }

  return (ownerIdentifier: string) => {
    const nextId = (nextIdByOwner.get(ownerIdentifier) ?? 0) + 1
    nextIdByOwner.set(ownerIdentifier, nextId)
    return nextId
  }
}

function ensureOwnerTestDialogs(database: Database, ownerIdentifier: string) {
  const ownerDialogs = database.dialogs.filter((dialog) => dialog.ownerIdentifier === ownerIdentifier)
  const ownerHasKnownTestDialog = ownerDialogs.some(
    (dialog) => dialog.isTestEntity && normalizeIdentifier(dialog.phone) !== ownerIdentifier,
  )
  if (ownerHasKnownTestDialog) {
    return false
  }

  const seedState = createSeedState()
  const chats = normalizeChats(ownerIdentifier, seedState.chats)
  if (chats.dialogs.length === 0) {
    return false
  }

  let nextDialogId = ownerDialogs.reduce((maxId, dialog) => Math.max(maxId, dialog.id), 0)
  const dialogIdMap = new Map<number, number>()
  const remappedDialogs = chats.dialogs.map((dialog) => {
    nextDialogId += 1
    dialogIdMap.set(dialog.id, nextDialogId)
    return {
      ...dialog,
      id: nextDialogId,
    }
  })
  const remappedMessages = chats.dialogMessages.map((message) => ({
    ...message,
    dialogId: dialogIdMap.get(message.dialogId) ?? message.dialogId,
  }))

  database.dialogs.push(...remappedDialogs)
  database.dialogMessages.push(...remappedMessages)
  return remappedDialogs.length > 0 || remappedMessages.length > 0
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

function removeOwnerSelfDialogs(database: Database) {
  let didMutate = false
  const removableDialogKeys = new Set<string>()

  for (const dialog of database.dialogs) {
    if (normalizeIdentifier(dialog.phone) !== dialog.ownerIdentifier) continue
    removableDialogKeys.add(`${dialog.ownerIdentifier}:${dialog.id}`)
  }

  if (removableDialogKeys.size === 0) {
    return false
  }

  const nextDialogs = database.dialogs.filter(
    (dialog) => !removableDialogKeys.has(`${dialog.ownerIdentifier}:${dialog.id}`),
  )
  if (nextDialogs.length !== database.dialogs.length) {
    database.dialogs = nextDialogs
    didMutate = true
  }

  const nextDialogMessages = database.dialogMessages.filter(
    (message) => !removableDialogKeys.has(`${message.ownerIdentifier}:${message.dialogId}`),
  )
  if (nextDialogMessages.length !== database.dialogMessages.length) {
    database.dialogMessages = nextDialogMessages
    didMutate = true
  }

  return didMutate
}

function backfillTestFixtureCreatedAt(database: Database) {
  let didMutate = false
  const seedChatsByPhone = new Map(
    initialChats.map((chat) => [normalizeIdentifier(chat.phone), chat] as const),
  )
  const seedGroupsByHandle = new Map(
    initialGroups.map((group) => [group.handle.trim(), group] as const),
  )
  const seedChannelsByHandle = new Map(
    initialSubscribedChannels.map(
      (channel) => [normalizeChannelHandleForComparison(channel.handle), channel] as const,
    ),
  )

  for (const dialog of database.dialogs) {
    if (!dialog.isTestEntity) continue
    const seedChat = seedChatsByPhone.get(normalizeIdentifier(dialog.phone))
    if (!seedChat) continue

    for (const message of database.dialogMessages) {
      if (message.ownerIdentifier !== dialog.ownerIdentifier || message.dialogId !== dialog.id) continue
      const seedMessage = seedChat.messages.find((candidate) => candidate.id === message.id)
      if (!seedMessage?.createdAt || message.createdAt === seedMessage.createdAt) continue
      message.createdAt = seedMessage.createdAt
      didMutate = true
    }
  }

  for (const group of database.groups) {
    if (!group.isTestEntity) continue
    const seedGroup = seedGroupsByHandle.get(group.handle.trim())
    if (!seedGroup) continue

    for (const message of database.groupMessages) {
      if (message.ownerIdentifier !== group.ownerIdentifier || message.groupId !== group.id) continue
      const seedMessage = seedGroup.messages.find((candidate) => candidate.id === message.id)
      if (!seedMessage) continue

      if (seedMessage.createdAt && message.createdAt !== seedMessage.createdAt) {
        message.createdAt = seedMessage.createdAt
        didMutate = true
      }

      const seedComments = seedMessage.threadComments ?? []
      const persistedComments = message.threadComments ?? []

      persistedComments.forEach((comment) => {
        const seedComment = seedComments.find((candidate) => candidate.id === comment.id)
        if (!seedComment?.createdAt || comment.createdAt === seedComment.createdAt) return
        comment.createdAt = seedComment.createdAt
        didMutate = true
      })
    }
  }

  for (const channel of database.subscriptionChannels) {
    if (!channel.isTestEntity) continue
    const seedChannel = seedChannelsByHandle.get(normalizeChannelHandleForComparison(channel.handle))
    if (!seedChannel) continue

    for (const post of database.subscriptionPosts) {
      if (post.ownerIdentifier !== channel.ownerIdentifier || post.channelId !== channel.id) continue
      const seedPost = seedChannel.posts.find((candidate) => candidate.id === post.id)
      if (!seedPost) continue

      if (seedPost.createdAt && post.createdAt !== seedPost.createdAt) {
        post.createdAt = seedPost.createdAt
        didMutate = true
      }

      const seedComments = seedPost.threadComments ?? []
      const persistedComments = post.threadComments ?? []

      persistedComments.forEach((comment) => {
        const seedComment = seedComments.find((candidate) => candidate.id === comment.id)
        if (!seedComment?.createdAt || comment.createdAt === seedComment.createdAt) return
        comment.createdAt = seedComment.createdAt
        didMutate = true
      })
    }
  }

  return didMutate
}

function applyNonProductionFixtures(database: Database) {
  let didMutate = markKnownTestFixtures(database)
  didMutate = upsertNonProductionTestAccounts(database) || didMutate
  didMutate = removeOwnerSelfDialogs(database) || didMutate

  for (const account of database.accounts) {
    didMutate = ensureOwnerTestDialogs(database, account.identifier) || didMutate
    didMutate = ensureOwnerTestGroups(database, account.identifier) || didMutate
    didMutate = ensureOwnerTestSubscriptionChannels(database, account.identifier) || didMutate
  }

  didMutate = backfillTestFixtureCreatedAt(database) || didMutate

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

  const nextAdminAuditLogs = database.adminAuditLogs.filter(
    (entry) => !testAccountIdentifiers.has(entry.actorIdentifier),
  )
  if (nextAdminAuditLogs.length !== database.adminAuditLogs.length) {
    database.adminAuditLogs = nextAdminAuditLogs
    didMutate = true
  }

  const nextAdminReports = database.adminReports.filter(
    (report) =>
      !testAccountIdentifiers.has(report.reporterIdentifier) &&
      !testAccountIdentifiers.has(report.entityOwnerIdentifier ?? '') &&
      !testAccountIdentifiers.has(report.relatedUserIdentifier ?? ''),
  )
  if (nextAdminReports.length !== database.adminReports.length) {
    database.adminReports = nextAdminReports
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

  const nextPasswordAuthAttempts = database.passwordAuthAttempts.filter(
    (attempt) => !testAccountIdentifiers.has(attempt.identifier),
  )
  if (nextPasswordAuthAttempts.length !== database.passwordAuthAttempts.length) {
    database.passwordAuthAttempts = nextPasswordAuthAttempts
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
  const nextState =
    runtimeConfig.environment === 'production'
      ? applyProductionFixtureCleanup(database)
      : applyNonProductionFixtures(database)
  const repairedDialogIdCollisions = repairPersistedDialogIdCollisions(nextState.database)
  const normalizedDuplicateDialogs = normalizePersistedDuplicateDialogs(nextState.database)
  const dedupePersistedMessages = dedupePersistedMessagesByDeliveryId(nextState.database)
  const ensuredManagedChannelOwnerCopies = ensureManagedChannelOwnerCopies(nextState.database)
  const repairedSubscriptionChannelIdentities = repairSubscriptionChannelIdentityConflicts(nextState.database)
  const dedupeSubscriptionPosts = dedupePersistedSubscriptionPosts(nextState.database)

  return {
    database: nextState.database,
    needsPersistenceRewrite:
      needsPersistenceRewrite ||
      repairedDialogIdCollisions ||
      normalizedDuplicateDialogs ||
      dedupePersistedMessages ||
      ensuredManagedChannelOwnerCopies ||
      repairedSubscriptionChannelIdentities ||
      dedupeSubscriptionPosts ||
      nextState.needsPersistenceRewrite,
  }
}

function repairPersistedDialogIdCollisions(database: Database) {
  let didMutate = false
  const getNextDialogId = createNextOwnedDialogIdAllocator(database.dialogs)
  const dialogGroups = new Map<string, PersistedDialog[]>()

  for (const dialog of database.dialogs) {
    const groupKey = `${dialog.ownerIdentifier}:${dialog.id}`
    const currentGroup = dialogGroups.get(groupKey)
    if (currentGroup) {
      currentGroup.push(dialog)
    } else {
      dialogGroups.set(groupKey, [dialog])
    }
  }

  for (const dialogs of dialogGroups.values()) {
    if (dialogs.length < 2) continue

    const distinctPhones = new Set(
      dialogs
        .map((dialog) => normalizeIdentifier(dialog.phone) || dialog.phone)
        .filter(Boolean),
    )
    if (distinctPhones.size < 2) continue

    const canonicalDialog = dialogs.find((dialog) => !dialog.isTestEntity) ?? dialogs[0]
    if (!canonicalDialog) continue

    for (const dialog of dialogs) {
      if (dialog === canonicalDialog) continue

      dialog.id = getNextDialogId(dialog.ownerIdentifier)
      dialog.pinnedMessageId = undefined
      dialog.typing = false
      dialog.unread = 0
      didMutate = true
    }
  }

  return didMutate
}

function normalizePersistedDuplicateDialogs(database: Database) {
  let didMutate = false
  const accountsByIdentifier = new Map(database.accounts.map((account) => [account.identifier, account] as const))
  const dialogGroups = new Map<string, PersistedDialog[]>()

  for (const dialog of database.dialogs) {
    const normalizedPhone = normalizeIdentifier(dialog.phone)
    if (!normalizedPhone) continue

    const groupKey = `${dialog.ownerIdentifier}:${normalizedPhone}`
    const currentGroup = dialogGroups.get(groupKey)
    if (currentGroup) {
      currentGroup.push(dialog)
    } else {
      dialogGroups.set(groupKey, [dialog])
    }
  }

  for (const dialogs of dialogGroups.values()) {
    if (dialogs.length < 2) continue

    const sortedDialogs = [...dialogs].sort((left, right) => {
      const leftExact = Number(normalizeIdentifier(left.phone) !== left.phone)
      const rightExact = Number(normalizeIdentifier(right.phone) !== right.phone)
      if (leftExact !== rightExact) {
        return leftExact - rightExact
      }

      return left.id - right.id
    })
    const canonicalDialog = sortedDialogs[0]
    if (!canonicalDialog) continue

    const dialogIds = new Set(sortedDialogs.map((dialog) => dialog.id))
    const duplicateDialogIds = new Set(sortedDialogs.slice(1).map((dialog) => dialog.id))
    if (duplicateDialogIds.size === 0) continue

    const mergedSourceMessages = database.dialogMessages
      .filter(
        (message) =>
          message.ownerIdentifier === canonicalDialog.ownerIdentifier && dialogIds.has(message.dialogId),
      )
      .sort((left, right) => {
        const leftCreatedAt = parseIsoDate(left.createdAt)
        const rightCreatedAt = parseIsoDate(right.createdAt)

        if (leftCreatedAt !== null && rightCreatedAt !== null && leftCreatedAt !== rightCreatedAt) {
          return leftCreatedAt - rightCreatedAt
        }

        if (leftCreatedAt !== null && rightCreatedAt === null) return -1
        if (leftCreatedAt === null && rightCreatedAt !== null) return 1
        if (left.dialogId !== right.dialogId) return left.dialogId - right.dialogId
        return left.id - right.id
      })

    const seenMessageKeys = new Set<string>()
    const mergedMessages = mergedSourceMessages.flatMap((message) => {
      const deliveryId = message.deliveryId?.trim()
      const dedupeKey = deliveryId
        ? `delivery:${deliveryId}`
        : `legacy:${message.dialogId}:${message.id}:${message.author}:${message.createdAt ?? ''}:${message.text.trim()}`

      if (seenMessageKeys.has(dedupeKey)) {
        didMutate = true
        return []
      }

      seenMessageKeys.add(dedupeKey)
      return [{
        message,
        sourceDialogId: message.dialogId,
        sourceMessageId: message.id,
      }]
    })

    const oldToNewMessageId = new Map<string, number>()
    mergedMessages.forEach((entry, index) => {
      oldToNewMessageId.set(`${entry.sourceDialogId}:${entry.sourceMessageId}`, index + 1)
    })

    const rewrittenMessages = mergedMessages.map(({ message, sourceDialogId }, index) => {
      const replyToId = message.replyTo?.id
      const remappedReplyToId =
        replyToId === undefined ? undefined : oldToNewMessageId.get(`${sourceDialogId}:${replyToId}`)

      return {
        ...message,
        dialogId: canonicalDialog.id,
        id: index + 1,
        replyTo:
          message.replyTo && remappedReplyToId !== undefined
            ? {
                ...message.replyTo,
                id: remappedReplyToId,
              }
            : undefined,
      } satisfies PersistedDialogMessage
    })

    const pinnedMessageId = sortedDialogs
      .flatMap((dialog) =>
        dialog.pinnedMessageId === undefined
          ? []
          : [oldToNewMessageId.get(`${dialog.id}:${dialog.pinnedMessageId}`)],
      )
      .find((value): value is number => typeof value === 'number')

    canonicalDialog.phone = normalizeIdentifier(canonicalDialog.phone) || canonicalDialog.phone
    canonicalDialog.muted = sortedDialogs.some((dialog) => Boolean(dialog.muted))
    canonicalDialog.pinned = sortedDialogs.some((dialog) => Boolean(dialog.pinned))
    canonicalDialog.pinnedMessageId = pinnedMessageId
    canonicalDialog.typing = sortedDialogs.some((dialog) => Boolean(dialog.typing))
    canonicalDialog.unread = sortedDialogs.reduce(
      (maxUnread, dialog) => Math.max(maxUnread, dialog.unread),
      canonicalDialog.unread,
    )
    canonicalDialog.isTestEntity = sortedDialogs.some((dialog) => Boolean(dialog.isTestEntity))

    database.dialogMessages = database.dialogMessages
      .filter(
        (message) =>
          !(
            message.ownerIdentifier === canonicalDialog.ownerIdentifier &&
            dialogIds.has(message.dialogId)
          ),
      )
      .concat(rewrittenMessages)

    database.dialogs = database.dialogs.filter(
      (dialog) =>
        !(
          dialog.ownerIdentifier === canonicalDialog.ownerIdentifier &&
          duplicateDialogIds.has(dialog.id)
        ),
    )

    const ownerAccount = accountsByIdentifier.get(canonicalDialog.ownerIdentifier)
    if (ownerAccount?.blockedContactIds?.length) {
      ownerAccount.blockedContactIds = [...new Set(
        ownerAccount.blockedContactIds.map((dialogId) =>
          dialogIds.has(dialogId) ? canonicalDialog.id : dialogId,
        ),
      )]
    }

    didMutate = true
  }

  return didMutate
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
      if (existingCopy.statusText !== channel.description) {
        existingCopy.statusText = channel.description
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
      statusText: channel.description,
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
      accounts: (normalized.accounts ?? []).map((account) => ({
        ...account,
        blockedAt: account.blockedAt || undefined,
        blockedReason: account.blockedReason || undefined,
        lastActiveAt: account.lastActiveAt || account.createdAt,
        passwordHash: account.passwordHash?.trim() || undefined,
        passwordSetAt: account.passwordSetAt || undefined,
        staffRole: sanitizeStaffRole(account.staffRole),
      })),
      adminAuditLogs: (normalized.adminAuditLogs ?? []).filter(
        (entry): entry is AdminAuditLogRecord => Boolean(sanitizeStaffRole(entry.actorRole)),
      ).map((entry) => ({
        ...entry,
        actorRole: sanitizeStaffRole(entry.actorRole)!,
      })),
      adminReports: (normalized.adminReports ?? []).map((report) => ({
        ...report,
        notes: report.notes ?? [],
        status: report.status === 'closed' ? 'closed' : 'open',
      })),
      authChallenges: (normalized.authChallenges ?? []).map((challenge) => ({
        ...challenge,
        purpose:
          challenge.purpose === 'admin' ||
          challenge.purpose === 'password-reset' ||
          challenge.purpose === 'password-setup'
            ? challenge.purpose
            : 'registration',
      })),
      contactReports: normalized.contactReports ?? [],
      dialogs: normalized.dialogs ?? [],
      dialogMessages: normalized.dialogMessages ?? [],
      groupMessages: normalized.groupMessages ?? [],
      groups: normalized.groups ?? [],
      ipAccessLogs: (normalized.ipAccessLogs ?? []).map((entry) => ({
        ...entry,
        eventType: entry.eventType === 'ip-change' ? 'ip-change' : 'login',
        source:
          entry.source === 'register' ||
          entry.source === 'password-login' ||
          entry.source === 'password-reset' ||
          entry.source === 'password-setup' ||
          entry.source === 'verify-code' ||
          entry.source === 'websocket'
            ? entry.source
            : 'http-api',
      })),
      managedChannels: normalized.managedChannels ?? [],
      pendingMediaUploads: (normalized.pendingMediaUploads ?? []).map((upload) => ({
        ...upload,
        linked: Boolean(upload.linked),
      })),
      passwordAuthAttempts: (normalized.passwordAuthAttempts ?? []).map((attempt) => ({
        blockLevel: Math.max(0, Math.floor(attempt.blockLevel ?? 0)),
        blockedUntil: attempt.blockedUntil || undefined,
        failedCount: Math.max(0, Math.floor(attempt.failedCount ?? 0)),
        identifier: normalizeIdentifier(attempt.identifier),
        ip: sanitizeIpAddress(attempt.ip) ?? '',
        lastFailedAt: attempt.lastFailedAt,
      })).filter((attempt) => Boolean(attempt.identifier && attempt.ip && attempt.lastFailedAt)),
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
