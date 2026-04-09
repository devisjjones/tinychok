import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { zipSync } from 'fflate'
import {
  defaultGroupsPerUserLimit,
  defaultGroupMemberLimit,
  freeArchiveStorageQuotaBytes,
  displayNameFieldMaxLength,
  freeStorageQuotaBytes,
  groupTitleMaxLength,
  managedChannelsPerUserLimit,
  orphanUploadTtlMs,
  premiumArchiveStorageQuotaBytes,
  premiumGroupsPerUserLimit,
  premiumStorageQuotaBytes,
  premiumGroupMemberLimit,
  surnameFieldMaxLength,
  channelArchiveStorageQuotaBytes,
  channelStorageQuotaBytes,
} from '../../src/shared/constants'
import {
  initialChats,
  initialGroups,
  initialSubscribedChannels,
} from '../../src/shared/mockData'
import type {
  Account as SharedAccount,
  AccountStatusHistoryEntry,
  ArchiveReason,
  StaffRole,
  ChannelThreadInboxItem,
  Channel,
  ChannelSearchResult,
  Chat,
  ContactRequestPreview,
  ContactState,
  GroupThreadInboxItem,
  GroupParticipant,
  GroupPreview,
  GroupSystemEvent,
  AttachmentRemovedNotice,
  MessageAttachment,
  Message,
  ChannelPost,
  SearchResult,
  Session,
  StorageArchiveReason,
  StorageArchiveUsage,
  StorageQuotaUsage,
  StorageSubjectKind,
  SupportTicket,
  SupportTicketStatus,
  SubscriptionChannel,
  ThreadComment,
  ThreadInboxItem,
  UserGifLibraryItem,
  UserStorageItem,
} from '../../src/shared/types'
import {
  buildChannelDirectLinkFromTitle,
  extendPremiumExpiry,
  ensureUniqueChannelDirectLink,
  formatAccountName,
  formatNowTime,
  getConversationDayKey,
  getEffectiveQuietModeSettings,
  getAdminSupportTicketStatusSortOrder,
  hasActivePremium,
  makePremiumExpiry,
  normalizeIdentifier,
  normalizeNickname,
  normalizeQuietModeSettings,
  resolveQuietModeInvisibilityState,
  sanitizeChannelDirectLink,
  sanitizeChannelDescription,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
} from '../../src/shared/utils'
import type {
  AdminSupportTicketStatus,
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
  AdminUserMediaExportBody,
  AdminLinkedUser,
  AdminManagedChannelSummary,
  AdminManagedGroupSummary,
  AdminMediaItem,
  AdminMediaItemEntityType,
  AdminReportAction,
  AdminReportDetailResponse,
  AdminReportNote,
  AdminReportSummary,
  AdminSupportTicketDetailResponse,
  AdminSupportTicketReplyBody,
  AdminSupportTicketSummary,
  AdminThreadSummary,
  AdminStorageArchiveToggleBody,
  AdminStorageExportBody,
  AdminUserSummary,
  AppSnapshot,
  ComplaintReason,
  CreateGroupBody,
  CreateManagedChannelBody,
  DeleteAccountBody,
  DeleteDialogMessageBody,
  DeleteAccountResponse,
  DebugPremiumBody,
  DirectDialogHistoryResponse,
  GroupHistoryResponse,
  StorageArchiveManifestItem,
  StoragePrimaryItemsResponse,
  StorageSubjectUsageResponse,
  InviteManagedChannelMembersBody,
  InviteGroupMemberBody,
  LoginPasswordBody,
  ManageGroupParticipantBody,
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
  SendContactRequestBody,
  SendGroupMessageBody,
  SendManagedChannelPostBody,
  SendGroupThreadCommentBody,
  SendSubscriptionChannelThreadCommentBody,
  SendSupportTicketBody,
  SendSupportTicketCommentBody,
  SubscriptionChannelHistoryResponse,
  SubscriptionChannelPreviewResponse,
  TransferManagedChannelBody,
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
import { HttpError } from './http-error'
import { deleteStoredMediaByUrl, readStoredMediaByUrl } from './media'

type StoredAccount = SharedAccount & StoredAccountPasswordFields
type AccountDeletionMode = 'account-and-user-data-hidden' | 'account-only'

type ArchivedPublicProfileSnapshot = {
  avatarImage?: string
  displayName: string
  nickname?: string
  status?: string
  surname?: string
}

type StoredAccountLifecycleFields = {
  accountId: string
  archiveUnlimited?: boolean
  archivedOriginalIdentifier?: string
  archivedProfile?: ArchivedPublicProfileSnapshot
  deletedAt?: string
  deletedBySelfService?: boolean
  deletionMode?: AccountDeletionMode
  publicDeleted?: boolean
}

type StoredAccountRecord = StoredAccount & StoredAccountLifecycleFields
type AccountRecord = StoredAccountRecord
type Account = AccountRecord

type PersistedDialog = Omit<Chat, 'messages' | 'contactState'> & {
  hidden?: boolean
  ownerIdentifier: string
}

type PersistedDialogMessage = Message & {
  archivedAt?: string
  archivedReason?:
    | 'delete-history-everyone'
    | 'delete-message-everyone'
    | 'delete-history-me'
    | 'delete-message-me'
  dialogId: number
  ownerIdentifier: string
}

type ContactLink = {
  blockedByIdentifier?: string
  createdAt: string
  leftIdentifier: string
  requesterIdentifier: string
  rightIdentifier: string
  status: 'pending' | 'accepted' | 'blocked'
  updatedAt: string
}

type PersistedGroup = Omit<GroupPreview, 'messages'> & {
  archiveUnlimited?: boolean
  ownerIdentifier: string
}

type PersistedGroupMessage = Message & {
  groupId: number
  ownerIdentifier: string
}

type PersistedManagedChannel = Channel & {
  archiveUnlimited?: boolean
  ownerIdentifier: string
}

type PersistedSubscriptionChannel = Omit<SubscriptionChannel, 'posts'> & {
  ownerIdentifier: string
  subscribedAt?: string
}

type SubscriptionPost = SubscriptionChannel['posts'][number]

type PersistedSubscriptionPost = SubscriptionPost & {
  channelId: number
  ownerIdentifier: string
}

type PersistedThreadState = {
  lastReadCommentCreatedAt?: string
  lastReadCommentId?: number
  ownerIdentifier: string
  subscription: 'implicit' | 'subscribed' | 'unsubscribed'
  threadId: string
}

type PersistedSupportTicket = {
  attachment?: MessageAttachment
  attachmentRemovedNotice?: Message['attachmentRemovedNotice']
  comments: ThreadComment[]
  createdAt: string
  deliveryId?: string
  id: number
  openedByStaffAt?: string
  ownerIdentifier: string
  replyTo?: Message['replyTo']
  status: SupportTicketStatus
  text: string
  threadId: string
  time: string
  updatedAt: string
}

type SessionRecord = {
  createdAt: string
  expiresAt: string
  identifier: string
  token: string
}

type IpAccessLogRecord = AdminIpLogEntry

type PersistedPasswordAuthAttempt = PasswordAuthAttemptRecord

type AuthCodeSendAttempt = {
  createdAt: string
  entryPoint: AuthEntrypoint
  flow: AuthRequestCodeFlow
  identifier: string
  ip?: string
}

type PendingChannelInvitation = {
  channelHandle: string
  createdAt: string
  recipientIdentifier: string
  senderIdentifier: string
}

type PendingGroupInvitation = {
  createdAt: string
  recipientIdentifier: string
  senderIdentifier: string
  sharedId: string
}

type AuthChallenge = {
  code: string
  expiresAt: string
  identifier: string
  purpose: 'admin' | 'password-reset' | 'password-setup' | 'registration'
}

type AuthChallengePurpose = AuthChallenge['purpose']

type SessionRevocationResult = {
  broadcastIdentifiers: string[]
  revokedTokens: string[]
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

type PersistedArchivedMediaRecord = {
  archivedAt: string
  archiveReason: StorageArchiveReason
  fileName: string
  height?: number
  id: string
  kind: 'attachment' | 'gif'
  mediaUrl: string
  mimeType: string
  originalContext: string
  ownerIdentifier?: string
  primaryLabel: string
  restoreTargets?: PersistedArchivedMediaRestoreTarget[]
  size: number
  storageSubjectId: string
  storageSubjectKind: StorageSubjectKind
  width?: number
}

type PersistedArchivedMediaRestoreTarget =
  | {
      attachment: MessageAttachment
      dialogId: number
      kind: 'dialog-message'
      messageId: number
      ownerIdentifier: string
    }
  | {
      attachment: MessageAttachment
      groupId: number
      kind: 'group-message'
      messageId: number
      ownerIdentifier: string
    }
  | {
      attachment: MessageAttachment
      commentId: number
      groupId: number
      kind: 'group-thread-comment'
      messageId: number
      ownerIdentifier: string
    }
  | {
      attachment: MessageAttachment
      channelId: number
      kind: 'channel-post'
      ownerIdentifier: string
      postId: number
    }
  | {
      attachment: MessageAttachment
      channelId: number
      commentId: number
      kind: 'channel-thread-comment'
      ownerIdentifier: string
      postId: number
    }
  | {
      attachment: MessageAttachment
      kind: 'support-ticket'
      ownerIdentifier: string
      ticketId: number
    }
  | {
      attachment: MessageAttachment
      commentId: number
      kind: 'support-ticket-comment'
      ownerIdentifier: string
      ticketId: number
    }

type StorageCleanupCandidate = {
  createdAt: string
  mediaUrl: string
  storageSubjectId: string
  storageSubjectKind: StorageSubjectKind
}

type LegacyAccountState = {
  channels: Channel[]
  chats: Chat[]
  groups: GroupPreview[]
  subscriptionChannels: SubscriptionChannel[]
}

type LegacyPersistedAccount = AccountRecord & {
  state: LegacyAccountState
}

export type Database = {
  accounts: AccountRecord[]
  archivedMedia: PersistedArchivedMediaRecord[]
  adminAuditLogs: AdminAuditLogRecord[]
  adminReports: AdminReportRecord[]
  authCodeSendAttempts: AuthCodeSendAttempt[]
  authChallenges: AuthChallenge[]
  contactLinks: ContactLink[]
  contactReports: ContactReportRecord[]
  dialogs: PersistedDialog[]
  dialogMessages: PersistedDialogMessage[]
  groupMessages: PersistedGroupMessage[]
  groups: PersistedGroup[]
  ipAccessLogs: IpAccessLogRecord[]
  managedChannels: PersistedManagedChannel[]
  pendingChannelInvitations: PendingChannelInvitation[]
  pendingGroupInvitations: PendingGroupInvitation[]
  pendingMediaUploads: PersistedPendingMediaUpload[]
  passwordAuthAttempts: PersistedPasswordAuthAttempt[]
  sessions: SessionRecord[]
  subscriptionChannelReports: SubscriptionChannelReportRecord[]
  subscriptionChannels: PersistedSubscriptionChannel[]
  subscriptionPosts: PersistedSubscriptionPost[]
  supportTickets: PersistedSupportTicket[]
  threadStates: PersistedThreadState[]
  nextSupportTicketNumber: number
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

type LivePresenceLookup = Pick<ReadonlySet<string>, 'has'>

type SessionAccessContext = {
  ip: string
  source: AdminIpLogSource
  userAgent?: string
}

const AUTH_CODE_TTL_MS = 5 * 60 * 1000
const AUTH_CODE_HOURLY_WINDOW_MS = 60 * 60 * 1000
const AUTH_CODE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_LAST_ACTIVE_TOUCH_THROTTLE_MS = 60 * 1000
const DEMO_AUTH_CODE = '1111'
const SUPPORT_TICKET_COOLDOWN_MS = 10 * 60 * 1000
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
const ADMIN_STAFF_ONLY_MESSAGE = 'Вход в админку разрешён только staff-аккаунтам.'
const AUTH_CODE_COOLDOWN_MESSAGE =
  'Код уже был недавно отправлен. Подождите немного перед новым запросом.'
const AUTH_CODE_RATE_LIMITED_MESSAGE =
  'Слишком много запросов SMS-кода. Повторите позже.'
type AttachmentRemovedNoticePerspective = 'author' | 'peer' | 'self'

function buildStorageQuotaAttachmentRemovedNoticeText(
  perspective: AttachmentRemovedNoticePerspective,
) {
  if (perspective === 'peer') {
    return 'Вложение скрыто.'
  }

  if (perspective === 'author') {
    return 'Вложение скрыто.'
  }

  return 'Вложение скрыто. У вас закончилось место. Оформите подписку.'
}

function buildStorageManualAttachmentRemovedNoticeText(
  perspective: AttachmentRemovedNoticePerspective,
) {
  if (perspective === 'peer' || perspective === 'author') {
    return 'Вложение удалено владельцем из хранилища, чтобы освободить место.'
  }

  return 'Вложение удалено вами из хранилища, чтобы освободить место.'
}
const TEST_FIXTURE_CREATED_AT = '2026-03-21T00:00:00.000Z'
const TEST_FIXTURE_PREMIUM_EXPIRES_AT = '2099-01-01T00:00:00.000Z'
const authRequestCodeLimits = runtimeConfig.auth.requestCodeLimits
const authCodeIdentifierCooldownMs = authRequestCodeLimits.identifierCooldownSeconds * 1000

function buildSyntheticNumericId(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  }

  return Math.abs(hash) || 1
}

function cloneDiscoveryResults() {
  return [] as SearchResult[]
}

function createDefaultDatabase(): Database {
  return {
    accounts: [],
    archivedMedia: [],
    adminAuditLogs: [],
    adminReports: [],
    authCodeSendAttempts: [],
    authChallenges: [],
    contactLinks: [],
    contactReports: [],
    dialogs: [],
    dialogMessages: [],
    groupMessages: [],
    groups: [],
    ipAccessLogs: [],
    managedChannels: [],
    pendingChannelInvitations: [],
    pendingGroupInvitations: [],
    pendingMediaUploads: [],
    passwordAuthAttempts: [],
    sessions: [],
    subscriptionChannelReports: [],
    subscriptionChannels: [],
    subscriptionPosts: [],
    supportTickets: [],
    threadStates: [],
    nextSupportTicketNumber: 0,
  }
}

type PersistDatabaseFn = (database: Database) => Promise<void>

function createSeedState() {
  return {
    channels: [] as Channel[],
    chats: [] as Chat[],
    groups: [] as GroupPreview[],
    subscriptionChannels: [] as SubscriptionChannel[],
  }
}

function buildTestAccounts() {
  return initialChats.map((chat) => ({
    accountId: `test_${encodeIdentifierToken(normalizeIdentifier(chat.phone))}`,
    avatarImage: undefined,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    createdAt: TEST_FIXTURE_CREATED_AT,
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    publicDeleted: undefined,
    displayName: chat.title,
    identifier: normalizeIdentifier(chat.phone),
    invisibilityAutoEnabled: false,
    invisibilityEnabled: false,
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

function hasStaffAccess(account: Pick<AccountRecord, 'staffRole'> | null | undefined) {
  return Boolean(sanitizeStaffRole(account?.staffRole))
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

const invalidOwnedAttachmentMessage = 'Вложение недействительно или больше недоступно. Загрузите файл заново.'

function sanitizeAttachmentRemovedNotice(
  notice: Message['attachmentRemovedNotice'],
): NonNullable<Message['attachmentRemovedNotice']> | undefined {
  if (!notice) return undefined

  const reason = notice.reason === 'storage-manual' ? notice.reason : 'storage-quota'
  const removedAt = notice.removedAt?.trim() || new Date().toISOString()
  const perspective =
    notice.perspective === 'author' || notice.perspective === 'peer' || notice.perspective === 'self'
      ? notice.perspective
      : undefined
  const text =
    notice.text?.replace(/\s+/g, ' ').trim().slice(0, 240) ||
    (reason === 'storage-manual'
      ? buildStorageManualAttachmentRemovedNoticeText('self')
      : buildStorageQuotaAttachmentRemovedNoticeText('self'))

  return {
    perspective,
    reason,
    removedAt,
    text,
  }
}

function sanitizeArchivedMediaRestoreTargets(
  value: PersistedArchivedMediaRecord['restoreTargets'],
): PersistedArchivedMediaRestoreTarget[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined
  }

  const targetsByKey = new Map<string, PersistedArchivedMediaRestoreTarget>()
  const normalizeRestoreOwnerIdentifier = (identifier: string | undefined) => {
    const normalizedIdentifier = normalizeIdentifier(identifier ?? '')
    return normalizedIdentifier || identifier?.trim() || ''
  }

  for (const target of value) {
    const normalizedOwnerIdentifier = normalizeRestoreOwnerIdentifier(target?.ownerIdentifier)
    if (!normalizedOwnerIdentifier) {
      continue
    }

    let attachment: MessageAttachment | undefined
    try {
      attachment = sanitizeMessageAttachment(target?.attachment)
    } catch {
      attachment = undefined
    }
    if (!attachment) {
      continue
    }

    const normalizePositiveInteger = (candidate: number | undefined) => {
      return Number.isInteger(candidate) && (candidate ?? 0) > 0 ? Math.floor(candidate ?? 0) : undefined
    }

    if (target.kind === 'dialog-message') {
      const dialogId = normalizePositiveInteger(target.dialogId)
      const messageId = normalizePositiveInteger(target.messageId)
      if (!dialogId || !messageId) continue
      targetsByKey.set(`dialog:${normalizedOwnerIdentifier}:${dialogId}:${messageId}`, {
        attachment,
        dialogId,
        kind: 'dialog-message',
        messageId,
        ownerIdentifier: normalizedOwnerIdentifier,
      })
      continue
    }

    if (target.kind === 'group-message') {
      const groupId = normalizePositiveInteger(target.groupId)
      const messageId = normalizePositiveInteger(target.messageId)
      if (!groupId || !messageId) continue
      targetsByKey.set(`group:${normalizedOwnerIdentifier}:${groupId}:${messageId}`, {
        attachment,
        groupId,
        kind: 'group-message',
        messageId,
        ownerIdentifier: normalizedOwnerIdentifier,
      })
      continue
    }

    if (target.kind === 'group-thread-comment') {
      const commentId = normalizePositiveInteger(target.commentId)
      const groupId = normalizePositiveInteger(target.groupId)
      const messageId = normalizePositiveInteger(target.messageId)
      if (!commentId || !groupId || !messageId) continue
      targetsByKey.set(`group-comment:${normalizedOwnerIdentifier}:${groupId}:${messageId}:${commentId}`, {
        attachment,
        commentId,
        groupId,
        kind: 'group-thread-comment',
        messageId,
        ownerIdentifier: normalizedOwnerIdentifier,
      })
      continue
    }

    if (target.kind === 'channel-post') {
      const channelId = normalizePositiveInteger(target.channelId)
      const postId = normalizePositiveInteger(target.postId)
      if (!channelId || !postId) continue
      targetsByKey.set(`channel:${normalizedOwnerIdentifier}:${channelId}:${postId}`, {
        attachment,
        channelId,
        kind: 'channel-post',
        ownerIdentifier: normalizedOwnerIdentifier,
        postId,
      })
      continue
    }

    if (target.kind === 'channel-thread-comment') {
      const channelId = normalizePositiveInteger(target.channelId)
      const commentId = normalizePositiveInteger(target.commentId)
      const postId = normalizePositiveInteger(target.postId)
      if (!channelId || !commentId || !postId) continue
      targetsByKey.set(`channel-comment:${normalizedOwnerIdentifier}:${channelId}:${postId}:${commentId}`, {
        attachment,
        channelId,
        commentId,
        kind: 'channel-thread-comment',
        ownerIdentifier: normalizedOwnerIdentifier,
        postId,
      })
      continue
    }

    if (target.kind === 'support-ticket') {
      const ticketId = normalizePositiveInteger(target.ticketId)
      if (!ticketId) continue
      targetsByKey.set(`support:${normalizedOwnerIdentifier}:${ticketId}`, {
        attachment,
        kind: 'support-ticket',
        ownerIdentifier: normalizedOwnerIdentifier,
        ticketId,
      })
      continue
    }

    if (target.kind === 'support-ticket-comment') {
      const commentId = normalizePositiveInteger(target.commentId)
      const ticketId = normalizePositiveInteger(target.ticketId)
      if (!commentId || !ticketId) continue
      targetsByKey.set(`support-comment:${normalizedOwnerIdentifier}:${ticketId}:${commentId}`, {
        attachment,
        commentId,
        kind: 'support-ticket-comment',
        ownerIdentifier: normalizedOwnerIdentifier,
        ticketId,
      })
    }
  }

  return targetsByKey.size > 0 ? [...targetsByKey.values()] : undefined
}

function materializeAttachmentRemovedNoticeForViewer(
  notice: Message['attachmentRemovedNotice'],
  perspective: AttachmentRemovedNoticePerspective,
): NonNullable<Message['attachmentRemovedNotice']> | undefined {
  const sanitizedNotice = sanitizeAttachmentRemovedNotice(notice)
  if (!sanitizedNotice) return undefined

  const textBuilder =
    sanitizedNotice.reason === 'storage-manual'
      ? buildStorageManualAttachmentRemovedNoticeText
      : buildStorageQuotaAttachmentRemovedNoticeText

  // Never leak stored self-copy as-is. The rendered notice must stay
  // viewer-aware so the owner and the reader understand whose storage action caused it.
  return {
    ...sanitizedNotice,
    perspective,
    text: textBuilder(perspective),
  }
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
  archiveReason?: PersistedDialogMessage['archivedReason']
  archivedAt?: string
  createdAt?: string
  kind: PersistedPendingMediaUpload['kind']
  fileName: string
  height?: number
  mediaUrl: string
  mimeType: string
  ownerIdentifier?: string
  primaryLabel: string
  size: number
  storageSubjectId: string
  storageSubjectKind: StorageSubjectKind
  width?: number
}

type UserStorageInventoryItem = UserStorageItem

type StorageSubjectDescriptor = {
  archiveQuotaBytes: number
  archiveUnlimited: boolean
  id: string
  kind: StorageSubjectKind
  primaryQuotaBytes: number
}

type StorageArchiveInventoryItem = PersistedArchivedMediaRecord & {
  usageCount: number
}

type AdminOwnedMediaExportContext = {
  archiveReason?: string
  createdAt?: string
  primaryLabel: string
}

type AdminOwnedMediaExportItem = {
  archiveReason?: string
  archivedAt?: string
  contexts: AdminOwnedMediaExportContext[]
  createdAt?: string
  fileName: string
  height?: number
  kind: 'attachment' | 'gif'
  mediaUrl: string
  mimeType: string
  ownerIdentifier: string
  originalContext?: string
  primaryLabel: string
  retentionOnly: boolean
  size: number
  storageKind: PersistedPendingMediaUpload['kind']
  usageCount: number
  width?: number
}

type CanonicalDirectTranscriptEntry = {
  archiveReason?: string
  archivedAt?: string
  attachment?: PersistedDialogMessage['attachment']
  authorDisplayIdentifier: string
  createdAt?: string
  deliveryId?: string
  id: string
  leftArchivedAt?: string
  leftArchiveReason?: PersistedDialogMessage['archivedReason']
  logicalMessage: PersistedDialogMessage
  readAt?: string
  retentionNote?: string
  replyTo?: PersistedDialogMessage['replyTo']
  rightArchivedAt?: string
  rightArchiveReason?: PersistedDialogMessage['archivedReason']
  text: string
  visibleForLeft: boolean
  visibleForRight: boolean
}

function buildStorageQuotaUsage(usedBytes: number, quotaBytes: number): StorageQuotaUsage {
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
    statusText: sanitizeStatusField(sourceChannel?.statusText ?? '') || undefined,
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
    archivedAt: sourceGroup?.archivedAt?.trim() || undefined,
    archiveReason:
      sourceGroup?.archiveReason === 'admin-archived' ||
      sourceGroup?.archiveReason === 'owner-deleted' ||
      sourceGroup?.archiveReason === 'owner-self-deleted' ||
      sourceGroup?.archiveReason === 'self-service-data-hidden' ||
      sourceGroup?.archiveReason === 'orphaned-group'
        ? sourceGroup.archiveReason
        : undefined,
    avatarImage: sourceGroup?.avatarImage?.trim() || undefined,
    creatorIdentifier: sourceGroup?.creatorIdentifier
      ? normalizeIdentifier(sourceGroup.creatorIdentifier) || undefined
      : undefined,
    groupOwnerIdentifier: sourceGroup?.groupOwnerIdentifier
      ? normalizeIdentifier(sourceGroup.groupOwnerIdentifier) || undefined
      : undefined,
    handle: sourceGroup?.handle ? sanitizeGroupHandle(sourceGroup.handle, 1) : undefined,
    leadText: sanitizeMessageText(sourceGroup?.leadText ?? '') || undefined,
    sharedId: sourceGroup?.sharedId?.trim() || undefined,
    title,
  }
}

function materializeSourceGroupForViewer(
  database: Database,
  sourceGroup?: Message['sourceGroup'],
): Message['sourceGroup'] | undefined {
  const sanitizedSourceGroup = sanitizeSourceGroup(sourceGroup)
  if (!sanitizedSourceGroup) return undefined

  const normalizedSharedId = sanitizedSourceGroup.sharedId?.trim() || ''
  if (!normalizedSharedId) {
    return sanitizedSourceGroup
  }

  const matchingGroup =
    database.groups.find(
      (group) => (group.sharedId?.trim() || `${group.ownerIdentifier}:${group.id}`) === normalizedSharedId,
    ) ?? null

  if (!matchingGroup || !shouldHideArchivedGroupForUsers(matchingGroup)) {
    return {
      ...sanitizedSourceGroup,
      archivedAt: undefined,
      archiveReason: undefined,
    }
  }

  return {
    ...sanitizedSourceGroup,
    archivedAt: matchingGroup.archivedAt,
    archiveReason: matchingGroup.archiveReason,
  }
}

function sanitizeSourceContact(
  database: Database,
  sourceContact?: Message['sourceContact'],
): Message['sourceContact'] | undefined {
  const normalizedIdentifier = normalizeIdentifier(sourceContact?.identifier ?? '')
  if (normalizedIdentifier) {
    const matchedAccount = database.accounts.find(
      (account) =>
        account.identifier === normalizedIdentifier &&
        !isPublicDeletedAccount(account),
    )
    if (matchedAccount) {
      return buildContactMessageSource(matchedAccount)
    }
  }

  const normalizedHandle = normalizeNickname(sourceContact?.handle?.replace(/^@+/u, '') ?? '')
  if (normalizedHandle) {
    const matchedAccount = database.accounts.find((account) => {
      if (isPublicDeletedAccount(account)) {
        return false
      }

      return normalizeNickname(account.nickname ?? '') === normalizedHandle
    })
    if (matchedAccount) {
      return buildContactMessageSource(matchedAccount)
    }
  }

  const title = sanitizePersonField(sourceContact?.title ?? '', displayNameFieldMaxLength + surnameFieldMaxLength + 1)
  if (!title) {
    return undefined
  }

  return {
    accent: sourceContact?.accent?.trim() || undefined,
    avatarImage: sourceContact?.avatarImage?.trim() || undefined,
    handle: normalizedHandle ? `@${normalizedHandle}` : undefined,
    identifier: normalizedIdentifier || undefined,
    status: sanitizeStatusField(sourceContact?.status ?? '') || undefined,
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

function sanitizeSupportTicketStatus(value: string | undefined): SupportTicketStatus {
  if (
    value === 'open' ||
    value === 'needs_confirmation' ||
    value === 'resolved' ||
    value === 'reopened'
  ) {
    return value
  }

  return 'open'
}

function getAdminSupportTicketDisplayStatus(ticket: PersistedSupportTicket): AdminSupportTicketStatus {
  if (!ticket.openedByStaffAt && ticket.status === 'open') {
    return 'new'
  }

  return ticket.status
}

function sanitizeAdminText(value: string | undefined, maxLength = 1000) {
  return value?.replace(/\s+/g, ' ').trim().slice(0, maxLength) || ''
}

function isAccountBlocked(account: Pick<Account, 'blockedAt'> | null | undefined) {
  return Boolean(account?.blockedAt)
}

function hasPremiumStorageHistory(
  account?: Pick<Account, 'premium' | 'premiumExpiresAt'> | null,
) {
  return Boolean(account?.premium || account?.premiumExpiresAt)
}

function sanitizeRetainedQuotaBytes(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value ?? 0 : 0
}

function normalizeRetainedStorageQuotaBytes(
  account?: Pick<Account, 'premium' | 'premiumExpiresAt' | 'retainedStorageQuotaBytes'> | null,
) {
  const retainedQuotaBytes = Math.max(
    sanitizeRetainedQuotaBytes(account?.retainedStorageQuotaBytes),
    hasPremiumStorageHistory(account) ? premiumStorageQuotaBytes : 0,
  )
  return retainedQuotaBytes > freeStorageQuotaBytes ? retainedQuotaBytes : undefined
}

function normalizeRetainedArchiveStorageQuotaBytes(
  account?: Pick<Account, 'premium' | 'premiumExpiresAt' | 'retainedArchiveStorageQuotaBytes'> | null,
) {
  const retainedQuotaBytes = Math.max(
    sanitizeRetainedQuotaBytes(account?.retainedArchiveStorageQuotaBytes),
    hasPremiumStorageHistory(account) ? premiumArchiveStorageQuotaBytes : 0,
  )
  return retainedQuotaBytes > freeArchiveStorageQuotaBytes ? retainedQuotaBytes : undefined
}

function getEffectiveUserStorageQuotaBytes(
  account?: Pick<Account, 'premium' | 'premiumExpiresAt' | 'retainedStorageQuotaBytes'> | null,
) {
  return Math.max(
    freeStorageQuotaBytes,
    sanitizeRetainedQuotaBytes(account?.retainedStorageQuotaBytes),
    hasActivePremium(account?.premium, account?.premiumExpiresAt) ? premiumStorageQuotaBytes : 0,
  )
}

function getEffectiveUserArchiveStorageQuotaBytes(
  account?: Pick<Account, 'premium' | 'premiumExpiresAt' | 'retainedArchiveStorageQuotaBytes'> | null,
) {
  return Math.max(
    freeArchiveStorageQuotaBytes,
    sanitizeRetainedQuotaBytes(account?.retainedArchiveStorageQuotaBytes),
    hasActivePremium(account?.premium, account?.premiumExpiresAt) ? premiumArchiveStorageQuotaBytes : 0,
  )
}

function rememberUnlockedPremiumStorageQuota(
  account: Pick<Account, 'retainedArchiveStorageQuotaBytes' | 'retainedStorageQuotaBytes'>,
) {
  // Once a user unlocks premium storage, don't shrink the quota back on expiry.
  account.retainedStorageQuotaBytes = Math.max(
    sanitizeRetainedQuotaBytes(account.retainedStorageQuotaBytes),
    premiumStorageQuotaBytes,
  )
  account.retainedArchiveStorageQuotaBytes = Math.max(
    sanitizeRetainedQuotaBytes(account.retainedArchiveStorageQuotaBytes),
    premiumArchiveStorageQuotaBytes,
  )
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
  return [...new Set((values ?? []).map((value) => normalizeStoredIdentifierReference(value)).filter(Boolean))]
}

function normalizeStoredIdentifierReference(value: string | undefined | null) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return ''
  }

  return normalizeIdentifier(trimmed) || trimmed
}

function resolveStoredIdentifierReference(value: string | undefined | null, fallback: string) {
  return normalizeStoredIdentifierReference(value) || normalizeStoredIdentifierReference(fallback)
}

function encodeIdentifierToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[0-9]/gu, (digit) => String.fromCharCode(97 + Number(digit)))
    .replace(/[^a-z]/gu, '')
}

function buildArchivedAccountIdentifier(accountId: string) {
  const token = encodeIdentifierToken(accountId) || 'archived'
  return `archived_${token}`
}

function isArchivedSyntheticIdentifier(value: string | undefined | null) {
  return /^archived_[a-z]+$/u.test((value ?? '').trim())
}

function getAccountOriginalIdentifier(account: Pick<AccountRecord, 'archivedOriginalIdentifier' | 'identifier'>) {
  return normalizeIdentifier(account.archivedOriginalIdentifier ?? '') || normalizeIdentifier(account.identifier)
}

function isPublicDeletedAccount(
  account:
    | Pick<AccountRecord, 'deletedBySelfService' | 'publicDeleted'>
    | null
    | undefined,
) {
  return Boolean(account?.publicDeleted || account?.deletedBySelfService)
}

function shouldHideDeletedAccountContentForUsers(
  account:
    | Pick<AccountRecord, 'deletedBySelfService' | 'deletionMode' | 'publicDeleted'>
    | null
    | undefined,
) {
  return Boolean(
    isPublicDeletedAccount(account) && account?.deletionMode === 'account-and-user-data-hidden',
  )
}

function shouldHideArchivedChannelForUsers(
  channel:
    | Pick<PersistedManagedChannel, 'archivedAt' | 'archiveReason'>
    | Pick<PersistedSubscriptionChannel, 'archivedAt' | 'archiveReason'>
    | Pick<Channel, 'archivedAt' | 'archiveReason'>
    | Pick<SubscriptionChannel, 'archivedAt' | 'archiveReason'>,
) {
  return Boolean(
    channel.archivedAt &&
      (channel.archiveReason === 'admin-archived' ||
        channel.archiveReason === 'owner-deleted' ||
        channel.archiveReason === 'owner-self-deleted' ||
        channel.archiveReason === 'self-service-data-hidden'),
  )
}

function shouldHideArchivedGroupForUsers(
  group:
    | Pick<PersistedGroup, 'archivedAt' | 'archiveReason'>
    | Pick<GroupPreview, 'archivedAt' | 'archiveReason'>,
) {
  // User-facing delete policy for groups:
  // - owner-deleted/self-service-data-hidden/admin-archived groups stay archived in server state
  //   but must disappear from normal user snapshots
  // - orphaned-group remains visible as a read-only archive for surviving members
  return Boolean(
    group.archivedAt &&
      (group.archiveReason === 'admin-archived' ||
        group.archiveReason === 'owner-deleted' ||
        group.archiveReason === 'self-service-data-hidden'),
  )
}

function isArchivedAccount(account: Pick<AccountRecord, 'deletedAt'>) {
  return Boolean(account.deletedAt)
}

function isArchivedIdentifier(identifier?: string | null) {
  return Boolean(identifier?.startsWith('archived_'))
}

function buildAccountHandle(
  account: Pick<AccountRecord, 'deletedBySelfService' | 'identifier' | 'nickname' | 'publicDeleted'>,
) {
  if (isPublicDeletedAccount(account)) {
    return ''
  }

  const normalizedDigits = account.identifier.replace(/[^\d]/g, '')
  return account.nickname?.trim()
    ? `@${account.nickname.trim()}`
    : `@user_${normalizedDigits.slice(-6) || 'tinychok'}`
}

function buildAccountDisplayLabel(
  account:
    | Pick<Account, 'displayName' | 'identifier' | 'surname'>
    | Pick<AccountRecord, 'displayName' | 'identifier' | 'surname' | 'archivedProfile'>,
) {
  if ('archivedProfile' in account && account.archivedProfile) {
    return (
      formatAccountName({
        displayName: account.archivedProfile.displayName || account.displayName,
        surname: account.archivedProfile.surname ?? account.surname ?? '',
      }) || account.identifier
    )
  }

  return formatAccountName(account) || account.identifier
}

function buildContactMessageSource(
  account: Pick<AccountRecord, 'avatarImage' | 'displayName' | 'identifier' | 'nickname' | 'status' | 'surname'>,
): NonNullable<Message['sourceContact']> {
  return {
    accent: pickAccentForIdentifier(account.identifier),
    avatarImage: account.avatarImage,
    handle: buildAccountHandle(account),
    identifier: account.identifier,
    status: account.status?.trim() || 'На связи',
    title: formatAccountName(account) || account.identifier,
  }
}

function buildCanonicalContactPair(leftIdentifier: string, rightIdentifier: string) {
  const normalizedLeft = normalizeIdentifier(leftIdentifier)
  const normalizedRight = normalizeIdentifier(rightIdentifier)

  return normalizedLeft <= normalizedRight
    ? { leftIdentifier: normalizedLeft, rightIdentifier: normalizedRight }
    : { leftIdentifier: normalizedRight, rightIdentifier: normalizedLeft }
}

function findContactLink(database: Database, leftIdentifier: string, rightIdentifier: string) {
  const pair = buildCanonicalContactPair(leftIdentifier, rightIdentifier)
  return database.contactLinks.find(
    (link) =>
      link.leftIdentifier === pair.leftIdentifier &&
      link.rightIdentifier === pair.rightIdentifier,
  )
}

function getContactStateForViewer(
  database: Database,
  viewerIdentifier: string,
  peerIdentifier: string,
): ContactState {
  const link = findContactLink(database, viewerIdentifier, peerIdentifier)
  if (!link) {
    return 'none'
  }

  if (link.status === 'accepted') {
    return 'accepted'
  }

  if (link.status === 'blocked') {
    return link.blockedByIdentifier === viewerIdentifier ? 'blocked-by-me' : 'blocked-by-peer'
  }

  return link.requesterIdentifier === viewerIdentifier ? 'pending-outgoing' : 'pending-incoming'
}

function buildContactRequestPreview(account: Account): ContactRequestPreview {
  return {
    accent: pickAccentForIdentifier(account.identifier),
    avatarImage: account.avatarImage,
    createdAt: account.createdAt,
    handle: buildAccountHandle(account),
    identifier: account.identifier,
    premium: hasActivePremium(account.premium, account.premiumExpiresAt),
    status: account.status?.trim() || 'На связи',
    title: formatAccountName(account) || account.identifier,
  }
}

function resolveContactSourceReferenceFromText(
  database: Database,
  text: string,
): Message['sourceContact'] | undefined {
  const trimmedText = text.trim()
  if (!/^@\S+$/u.test(trimmedText)) {
    return undefined
  }

  const normalizedHandle = normalizeNickname(trimmedText.replace(/^@+/u, ''))
  if (!normalizedHandle) {
    return undefined
  }

  const matchedAccount = database.accounts.find((account) => {
    if (isPublicDeletedAccount(account)) {
      return false
    }

    const accountHandle = buildAccountHandle(account)
    return normalizeNickname(accountHandle.replace(/^@+/u, '')) === normalizedHandle
  })

  return matchedAccount ? buildContactMessageSource(matchedAccount) : undefined
}

function resolveChannelSourceReferenceFromText(
  database: Database,
  text: string,
): Message['sourceChannel'] | undefined {
  const trimmedText = text.trim()
  if (!/^@\S+$/u.test(trimmedText)) {
    return undefined
  }

  const normalizedHandle = sanitizeChannelDirectLink(trimmedText)
  if (!normalizedHandle) {
    return undefined
  }

  const matchedChannel = database.managedChannels.find(
    (channel) => (sanitizeChannelDirectLink(channel.directLink) || channel.directLink) === normalizedHandle,
  )
  if (!matchedChannel) {
    return undefined
  }

  return {
    accent: matchedChannel.avatarTone,
    draft: matchedChannel.status === 'draft',
    handle: matchedChannel.directLink,
    id: matchedChannel.id,
    statusText: matchedChannel.statusText?.trim() || undefined,
    title: matchedChannel.title,
    visibility: matchedChannel.visibility,
  }
}

function getGroupSystemEventText(event: GroupSystemEvent) {
  if (event.kind === 'member-joined') {
    return `К группе присоединился ${event.actor.title}`
  }

  if (event.kind === 'member-left') {
    return `${event.actor.title} покинул группу`
  }

  return `У группы новый организатор: ${event.actor.title}`
}

function getAdminVisibleAccount(account: Account) {
  if (!account.archivedProfile) {
    return {
      avatarImage: account.avatarImage,
      displayName: account.displayName,
      nickname: normalizeNickname(account.nickname ?? '') || undefined,
      status: account.status?.trim() || undefined,
      surname: account.surname ?? '',
    }
  }

  return {
    avatarImage: account.archivedProfile.avatarImage ?? account.avatarImage,
    displayName: account.archivedProfile.displayName || account.displayName,
    nickname:
      normalizeNickname(account.archivedProfile.nickname ?? '') ||
      normalizeNickname(account.nickname ?? '') ||
      undefined,
    status: account.archivedProfile.status?.trim() || account.status?.trim() || undefined,
    surname: account.archivedProfile.surname ?? account.surname ?? '',
  }
}

function getUserVisibleDisplayName(account: Account) {
  return isPublicDeletedAccount(account)
    ? 'Аккаунт удалён'
    : buildAccountDisplayLabel(account)
}

function getStoredInvisibilityPreference(
  account: Pick<Account, 'invisibilityEnabled' | 'quietModeEnabled'>,
) {
  // Legacy fallback:
  // older sessions only had `Тихо`, so keep them invisible until the new explicit preference
  // is written server-side. Once `invisibilityEnabled` is persisted, it becomes the single source
  // of truth for the user's invisibility preference.
  return Boolean(account.invisibilityEnabled ?? account.quietModeEnabled)
}

function getStoredQuietModeSettings(
  account: Pick<Account, 'quietModeSettings'>,
) {
  // Quiet settings must always materialize as a full normalized object so legacy snapshots and
  // new UI checkboxes cannot drift into partially-defined category behavior.
  return normalizeQuietModeSettings(account.quietModeSettings)
}

function isInvisibleModeActive(
  account: Pick<Account, 'invisibilityEnabled' | 'premium' | 'premiumExpiresAt' | 'quietModeEnabled'>,
) {
  // Invisibility contract:
  // the checkbox is a premium-only persisted preference and must stay server-authoritative so every
  // viewer sees the same offline-presence result across dialogs, groups and room headers.
  return getStoredInvisibilityPreference(account) && hasActivePremium(account.premium, account.premiumExpiresAt)
}

function shouldHidePresenceFromOthers(
  account: Pick<Account, 'invisibilityEnabled' | 'premium' | 'premiumExpiresAt' | 'quietModeEnabled'>,
) {
  // Keep this delegating through isInvisibleModeActive so presence masking, self-settings and
  // direct read-receipt stealth cannot drift into separate behaviors.
  return isInvisibleModeActive(account)
}

function shouldSuppressDirectReadReceipts(
  account: Pick<Account, 'invisibilityEnabled' | 'premium' | 'premiumExpiresAt' | 'quietModeEnabled'>,
) {
  // Direct read-receipt stealth must follow the exact same gate as invisible mode itself.
  return isInvisibleModeActive(account)
}

function getViewerVisibleOnline(
  account: Pick<Account, 'identifier' | 'invisibilityEnabled' | 'premium' | 'premiumExpiresAt' | 'quietModeEnabled'>,
  viewerIdentifier: string | undefined,
  online: boolean,
) {
  if (!online) {
    return false
  }

  const normalizedViewerIdentifier = normalizeStoredIdentifierReference(viewerIdentifier ?? '')
  if (normalizedViewerIdentifier === account.identifier) {
    return true
  }

  return !shouldHidePresenceFromOthers(account)
}

function getUserVisibleStatus(account: Account, online: boolean) {
  if (isPublicDeletedAccount(account)) {
    return 'Удалённый аккаунт'
  }

  return account.status?.trim() || (online ? 'в сети' : 'был(а) недавно в сети')
}

function getCurrentGroupOwnerIdentifier(
  group: Pick<PersistedGroup, 'creatorIdentifier' | 'groupOwnerIdentifier' | 'ownerIdentifier'>,
) {
  return (
    normalizeStoredIdentifierReference(group.groupOwnerIdentifier ?? '') ||
    normalizeStoredIdentifierReference(group.creatorIdentifier ?? '') ||
    group.ownerIdentifier
  )
}

function isArchivedGroup(
  group: Pick<PersistedGroup, 'archivedAt'> | Pick<GroupPreview, 'archivedAt'>,
) {
  return Boolean(group.archivedAt)
}

function isArchivedChannel(
  channel:
    | Pick<PersistedManagedChannel, 'archivedAt'>
    | Pick<PersistedSubscriptionChannel, 'archivedAt'>
    | Pick<Channel, 'archivedAt'>
    | Pick<SubscriptionChannel, 'archivedAt'>,
) {
  return Boolean(channel.archivedAt)
}

function isArchivedThread(
  threadRoot:
    | Pick<PersistedGroupMessage, 'threadArchivedAt'>
    | Pick<PersistedSubscriptionPost, 'threadArchivedAt'>
    | Pick<Message, 'threadArchivedAt'>
    | Pick<ChannelPost, 'threadArchivedAt'>,
) {
  return Boolean(threadRoot.threadArchivedAt)
}

function buildAdminAuditAccountLabel(
  account:
    | Pick<Account, 'displayName' | 'identifier' | 'nickname' | 'surname'>
    | Pick<AccountRecord, 'displayName' | 'identifier' | 'nickname' | 'surname' | 'archivedProfile'>,
) {
  const adminVisible = 'archivedProfile' in account ? getAdminVisibleAccount(account as Account) : {
    avatarImage: undefined,
    displayName: account.displayName,
    nickname: normalizeNickname(account.nickname ?? '') || undefined,
    status: undefined,
    surname: account.surname ?? '',
  }
  const displayName = formatAccountName({
    displayName: adminVisible.displayName,
    surname: adminVisible.surname,
  }) || account.identifier
  const nickname = normalizeNickname(adminVisible.nickname ?? '')
  return nickname
    ? `${displayName} (@${nickname}, ${account.identifier})`
    : `${displayName} (${account.identifier})`
}

function buildAdminLinkedUserSummary(
  account:
    | Pick<AccountRecord, 'displayName' | 'identifier' | 'nickname' | 'surname' | 'archivedProfile'>
    | undefined,
  identifier: string,
): AdminLinkedUser {
  const adminVisible = account ? getAdminVisibleAccount(account as Account) : null
  const normalizedNickname = normalizeNickname(adminVisible?.nickname ?? '')
  const rawDisplayIdentifier = account
    ? getAccountOriginalIdentifier(account) || (isArchivedSyntheticIdentifier(account.identifier) ? '' : account.identifier)
    : isArchivedSyntheticIdentifier(identifier)
      ? ''
      : identifier
  const displayIdentifier =
    rawDisplayIdentifier && !isArchivedSyntheticIdentifier(rawDisplayIdentifier)
      ? rawDisplayIdentifier
      : ''
  const rawDisplayName = account
    ? formatAccountName({
        displayName:
          isArchivedSyntheticIdentifier(adminVisible?.displayName ?? '')
            ? ''
            : adminVisible?.displayName ?? account.displayName,
        surname: adminVisible?.surname ?? account.surname ?? '',
      }) ||
      rawDisplayIdentifier ||
      (isArchivedSyntheticIdentifier(account.identifier) ? 'Удалённый аккаунт' : account.identifier)
    : isArchivedSyntheticIdentifier(identifier)
      ? 'Удалённый аккаунт'
      : identifier
  const displayName = rawDisplayName && !isArchivedSyntheticIdentifier(rawDisplayName)
    ? rawDisplayName
    : 'Удалённый аккаунт'

  return {
    displayName,
    identifier: displayIdentifier || 'Нет данных',
    lookupIdentifier: account?.identifier || undefined,
    nickname: normalizedNickname || undefined,
  }
}

function getArchivedGroupOwnerTitleFallback(title: string) {
  const match = title.trim().match(/^Группа:\s+(.+)$/u)
  return match?.[1]?.trim() || ''
}

function patchArchivedGroupOwnerSummary(summary: AdminLinkedUser, groupTitle: string) {
  const titleFallback = getArchivedGroupOwnerTitleFallback(groupTitle)
  const needsDisplayNameFallback =
    summary.displayName === 'Удалённый аккаунт' || isArchivedSyntheticIdentifier(summary.displayName)
  const needsIdentifierFallback =
    summary.identifier === 'Нет данных' || isArchivedSyntheticIdentifier(summary.identifier)

  if (!titleFallback && !needsIdentifierFallback) {
    return summary
  }

  return {
    ...summary,
    displayName: needsDisplayNameFallback && titleFallback ? titleFallback : summary.displayName,
    identifier: needsIdentifierFallback ? 'Нет данных' : summary.identifier,
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

function normalizeAccountStatusHistory(
  statusHistory: AccountStatusHistoryEntry[] | undefined,
  fallbackCreatedAt: string,
  fallbackStatus: string | undefined,
) {
  const normalizedEntries = (statusHistory ?? [])
    .map((entry) => ({
      setAt: entry?.setAt || fallbackCreatedAt,
      status: sanitizeStatusField(entry?.status ?? ''),
    }))
    .filter((entry) => Boolean(entry.status && parseIsoDate(entry.setAt) !== null))

  if (normalizedEntries.length === 0) {
    const normalizedFallbackStatus = sanitizeStatusField(fallbackStatus ?? '')
    if (normalizedFallbackStatus) {
      normalizedEntries.push({
        setAt: fallbackCreatedAt,
        status: normalizedFallbackStatus,
      })
    }
  }

  return normalizedEntries.sort((left, right) => {
    const leftTimestamp = parseIsoDate(left.setAt) ?? 0
    const rightTimestamp = parseIsoDate(right.setAt) ?? 0
    return leftTimestamp - rightTimestamp
  })
}

function getAccountStatusHistory(account: Pick<AccountRecord, 'createdAt' | 'status' | 'statusHistory'>) {
  return normalizeAccountStatusHistory(account.statusHistory, account.createdAt, account.status)
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
    .map((participant) => normalizeStoredIdentifierReference(participant.identifier ?? ''))
    .filter(Boolean))].sort()
}

function getAdminGroupCanonicalOwnerIdentifier(
  group: Pick<PersistedGroup, 'creatorIdentifier' | 'groupOwnerIdentifier' | 'ownerIdentifier' | 'participants'>,
) {
  return (
    normalizeStoredIdentifierReference(group.groupOwnerIdentifier ?? '') ||
    normalizeStoredIdentifierReference(group.creatorIdentifier ?? '') ||
    normalizeStoredIdentifierReference(group.participants?.[0]?.identifier ?? '') ||
    group.ownerIdentifier
  )
}

function buildAdminGroupAggregateKey(
  group: Pick<PersistedGroup, 'creatorIdentifier' | 'groupOwnerIdentifier' | 'handle' | 'ownerIdentifier' | 'participants' | 'sharedId' | 'title'>,
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

function getAdminGroupSearchRank(
  group: Pick<AdminManagedGroupSummary, 'owner' | 'sharedId' | 'title'>,
  query: string,
) {
  if (!query) return 0

  const normalizedTitle = group.title.trim().toLowerCase()
  const normalizedSharedId = group.sharedId.trim().toLowerCase()
  const normalizedOwnerName = group.owner.displayName.trim().toLowerCase()
  const normalizedOwnerIdentifier = group.owner.identifier.trim().toLowerCase()

  if (normalizedTitle === query) return 0
  if (normalizedSharedId === query) return 1
  if (normalizedTitle.startsWith(query)) return 2
  if (normalizedSharedId.startsWith(query)) return 3
  if (normalizedTitle.includes(query)) return 4
  if (normalizedSharedId.includes(query)) return 5
  if (normalizedOwnerName === query) return 10
  if (normalizedOwnerIdentifier === query) return 11
  if (normalizedOwnerName.startsWith(query)) return 12
  if (normalizedOwnerIdentifier.startsWith(query)) return 13
  if (normalizedOwnerName.includes(query)) return 14
  if (normalizedOwnerIdentifier.includes(query)) return 15

  return Number.POSITIVE_INFINITY
}

function buildAdminGroupThreadKey(
  group: Pick<PersistedGroup, 'creatorIdentifier' | 'groupOwnerIdentifier' | 'handle' | 'id' | 'ownerIdentifier' | 'participants' | 'sharedId' | 'title'>,
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
  const authorIdentifier = resolveStoredIdentifierReference(comment.authorIdentifier ?? '', fallbackAuthorIdentifier)
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

function findAccountByStoredIdentifier(database: Database, identifier?: string | null) {
  const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
  if (!normalizedIdentifier) {
    return null
  }

  return database.accounts.find((account) => account.identifier === normalizedIdentifier) ?? null
}

function hasLivePresenceInSet(livePresenceIdentifiers: LivePresenceLookup, identifier: string) {
  const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
  if (!normalizedIdentifier) {
    return false
  }

  return livePresenceIdentifiers.has(normalizedIdentifier)
}

function syncPersistedDialogWithAccount(
  dialog: PersistedDialog,
  account: Account,
  options?: {
    online?: boolean
  },
) {
  const online = options?.online ?? false
  const archivedAccount = isPublicDeletedAccount(account)
  // Invisibility invariant:
  // Active invisible mode hides live presence from other viewers everywhere.
  const visibleOnline = archivedAccount
    ? false
    : getViewerVisibleOnline(account, dialog.ownerIdentifier, online)
  const nextState = {
    accent: pickAccentForIdentifier(account.identifier),
    avatarImage: archivedAccount ? undefined : account.avatarImage,
    handle: buildAccountHandle(account),
    lastSeen: archivedAccount || visibleOnline ? undefined : 'был(а) недавно в сети',
    mood: archivedAccount ? 'Удалённый аккаунт' : account.status?.trim() || 'На связи',
    online: archivedAccount ? false : visibleOnline,
    phone: account.identifier,
    premium: archivedAccount ? false : hasActivePremium(account.premium, account.premiumExpiresAt),
    status: getUserVisibleStatus(account, visibleOnline),
    title: getUserVisibleDisplayName(account),
  } as const

  let didMutate = false

  if (dialog.accent !== nextState.accent) {
    dialog.accent = nextState.accent
    didMutate = true
  }
  if (dialog.avatarImage !== nextState.avatarImage) {
    dialog.avatarImage = nextState.avatarImage
    didMutate = true
  }
  if (dialog.handle !== nextState.handle) {
    dialog.handle = nextState.handle
    didMutate = true
  }
  if (dialog.lastSeen !== nextState.lastSeen) {
    dialog.lastSeen = nextState.lastSeen
    didMutate = true
  }
  if (dialog.mood !== nextState.mood) {
    dialog.mood = nextState.mood
    didMutate = true
  }
  if (dialog.online !== nextState.online) {
    dialog.online = nextState.online
    didMutate = true
  }
  if (dialog.phone !== nextState.phone) {
    dialog.phone = nextState.phone
    didMutate = true
  }
  if (dialog.premium !== nextState.premium) {
    dialog.premium = nextState.premium
    didMutate = true
  }
  if (dialog.status !== nextState.status) {
    dialog.status = nextState.status
    didMutate = true
  }
  if (dialog.title !== nextState.title) {
    dialog.title = nextState.title
    didMutate = true
  }

  return didMutate
}

function materializeThreadCommentsForViewer(
  database: Database,
  reporterIdentifier: string,
  comments?: ThreadComment[],
  perspective: AttachmentRemovedNoticePerspective = 'author',
) {
  return compactThreadComments(comments).flatMap((comment) => {
    const authorAccount = findAccountByStoredIdentifier(database, comment.authorIdentifier)
    if (isPublicDeletedAccount(authorAccount)) {
      return []
    }

    const materializedComment = materializeThreadCommentForViewer(comment, perspective)
    if (!materializedComment) {
      return []
    }

    return [{
      ...materializedComment,
      attachment: materializeAttachmentForViewer(database, reporterIdentifier, comment.attachment),
      sourceChannel:
        materializedComment.sourceChannel ??
        (materializedComment.sourceContact
          ? undefined
          : resolveChannelSourceReferenceFromText(database, materializedComment.text)),
      sourceContact:
        materializedComment.sourceContact ??
        resolveContactSourceReferenceFromText(database, materializedComment.text),
      displayAuthor:
        authorAccount && isPublicDeletedAccount(authorAccount)
          ? 'Аккаунт удалён'
          : materializedComment.displayAuthor,
    }]
  })
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

function resolveSubscriptionPostAuthorIdentifier(
  database: Database,
  channel: Pick<PersistedSubscriptionChannel, 'handle'>,
  post: PersistedSubscriptionPost,
) {
  const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
  return (
    database.managedChannels.find(
      (candidate) => (sanitizeChannelDirectLink(candidate.directLink) || candidate.directLink) === normalizedHandle,
    )?.ownerIdentifier ?? post.ownerIdentifier
  )
}

function materializeThreadComment(
  comment: ThreadComment | undefined,
  fallbackAuthor: 'me' | 'them' = 'them',
): ThreadComment | null {
  if (!comment) return null

  return {
    attachment: sanitizeMessageAttachment(comment.attachment),
    attachmentRemovedNotice: sanitizeAttachmentRemovedNotice(comment.attachmentRemovedNotice),
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

function materializeThreadCommentForViewer(
  comment: ThreadComment | undefined,
  perspective: AttachmentRemovedNoticePerspective,
  fallbackAuthor: 'me' | 'them' = 'them',
): ThreadComment | null {
  const materializedComment = materializeThreadComment(comment, fallbackAuthor)
  if (!materializedComment) return null

  const effectivePerspective: AttachmentRemovedNoticePerspective =
    materializedComment.author === 'me'
      ? 'self'
      : perspective === 'peer'
        ? 'peer'
        : 'author'

  return {
    ...materializedComment,
    attachmentRemovedNotice: materializeAttachmentRemovedNoticeForViewer(
      materializedComment.attachmentRemovedNotice,
      effectivePerspective,
    ),
  }
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
    avatarImage: chat.avatarImage,
    handle: chat.handle,
    hidden: Boolean(chat.hidden),
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
    archivedAt: group.archivedAt,
    archiveReason: group.archiveReason,
    avatarImage: group.avatarImage,
    commentBlacklistIdentifiers: sanitizeIdentifierList(group.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(group.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(group.commentsEnabledForPremium),
    creatorIdentifier: group.creatorIdentifier?.trim() || ownerIdentifier,
    description: sanitizeChannelDescription(group.description ?? ''),
    handle: group.handle,
    id: group.id,
    isTestEntity: group.isTestEntity,
    members: group.members,
    muted: group.muted ?? false,
    groupOwnerIdentifier:
      normalizeStoredIdentifierReference(group.groupOwnerIdentifier ?? '') ||
      normalizeStoredIdentifierReference(group.creatorIdentifier ?? '') ||
      ownerIdentifier,
    ownerIdentifier,
    participants: group.participants.map((participant) => ({
      ...participant,
      identifier: participant.identifier ? normalizeIdentifier(participant.identifier) : undefined,
      nickname: normalizeNickname(participant.nickname ?? ''),
    })),
    preview: group.preview,
    showHistoryToNewMembers: group.showHistoryToNewMembers !== false,
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
  const subscribedAt =
    (channel as SubscriptionChannel & { subscribedAt?: string }).subscribedAt?.trim() || undefined
  return {
    accent: channel.accent,
    archivedAt: channel.archivedAt,
    archiveReason: channel.archiveReason,
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
        identifier: participant.identifier ? normalizeStoredIdentifierReference(participant.identifier) : undefined,
        nickname: normalizeNickname(participant.nickname ?? ''),
      })) ?? [],
    preview: channel.preview,
    readers: channel.readers ?? 0,
    statusText: channel.statusText?.trim() || undefined,
    subscribedAt,
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

function resolveGroupMessageAuthorIdentifier(
  group: PersistedGroup,
  message: PersistedGroupMessage,
) {
  return (
    normalizeStoredIdentifierReference(
      group.participants.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
    ) ||
    normalizeStoredIdentifierReference(group.groupOwnerIdentifier ?? '') ||
    normalizeStoredIdentifierReference(group.creatorIdentifier ?? '') ||
    message.ownerIdentifier
  )
}

function materializeDialog(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  dialog: PersistedDialog,
): Omit<Chat, 'messages'> {
  const contactAccount = findAccountByStoredIdentifier(database, dialog.phone)
  const effectiveDialog = { ...dialog }

  if (contactAccount) {
    syncPersistedDialogWithAccount(effectiveDialog, contactAccount, {
      online: hasLivePresenceInSet(livePresenceIdentifiers, contactAccount.identifier),
    })
  }

  const archivedAccount =
    Boolean(contactAccount && isPublicDeletedAccount(contactAccount)) || isArchivedIdentifier(effectiveDialog.phone)
  return {
    accent: effectiveDialog.accent,
    archivedAccount,
    avatarImage: archivedAccount ? undefined : effectiveDialog.avatarImage,
    contactState:
      archivedAccount
        ? 'accepted'
        : getContactStateForViewer(database, effectiveDialog.ownerIdentifier, effectiveDialog.phone),
    handle: archivedAccount ? '' : effectiveDialog.handle,
    hidden: Boolean(effectiveDialog.hidden),
    id: effectiveDialog.id,
    isTestEntity: effectiveDialog.isTestEntity,
    lastSeen: archivedAccount ? undefined : effectiveDialog.lastSeen,
    mood: effectiveDialog.mood,
    muted: Boolean(effectiveDialog.muted),
    online: archivedAccount ? false : effectiveDialog.online,
    phone: effectiveDialog.phone,
    pinned: effectiveDialog.pinned,
    pinnedMessageId: effectiveDialog.pinnedMessageId,
    premium: archivedAccount ? false : effectiveDialog.premium,
    status: archivedAccount ? 'Удалённый аккаунт' : effectiveDialog.status,
    title: archivedAccount ? 'Аккаунт удалён' : effectiveDialog.title,
    typing: effectiveDialog.typing,
    unread: effectiveDialog.unread,
  }
}

function materializeDialogMessage(
  database: Database,
  viewerIdentifier: string,
  message: PersistedDialogMessage,
  replyTo: Message['replyTo'] = message.replyTo,
): Omit<PersistedDialogMessage, 'dialogId' | 'ownerIdentifier'> {
  const resolvedSourceContact = message.sourceContact ?? resolveContactSourceReferenceFromText(database, message.text)
  return {
    attachment: materializeAttachmentForViewer(database, viewerIdentifier, message.attachment),
    attachmentRemovedNotice: materializeAttachmentRemovedNoticeForViewer(
      message.attachmentRemovedNotice,
      message.author === 'me' ? 'self' : 'peer',
    ),
    author: message.author,
    createdAt: message.createdAt,
    deliveryId: message.deliveryId,
    displayAuthor: message.displayAuthor,
    forwarded: message.forwarded,
    forwardedAuthorName: message.forwardedAuthorName,
    id: message.id,
    readAt: message.readAt,
    replyTo,
    sourceChannel:
      message.sourceChannel ??
      (resolvedSourceContact ? undefined : resolveChannelSourceReferenceFromText(database, message.text)),
    sourceContact: resolvedSourceContact,
    sourceGroup: materializeSourceGroupForViewer(database, message.sourceGroup),
    system: Boolean(message.system),
    text: message.text,
    time: message.time,
  }
}

function matchesDirectReplyTarget(
  message: PersistedDialogMessage,
  replyTo: NonNullable<Message['replyTo']>,
) {
  const previewText = sanitizeMessageText(message.text).slice(0, 280)
  const fallbackPreview =
    previewText ||
    message.sourceChannel?.leadText ||
    message.sourceGroup?.leadText ||
    (message.attachment ? `Файл: ${message.attachment.fileName}` : '') ||
    message.attachmentRemovedNotice?.text ||
    (message.sourceChannel ? `Канал: ${message.sourceChannel.title}` : '') ||
    (message.sourceContact ? `Контакт: ${message.sourceContact.title}` : '') ||
    (message.sourceGroup ? `Пользователь приглашает вас в группу: ${message.sourceGroup.title}` : '')

  return (
    message.author === replyTo.author &&
    fallbackPreview === replyTo.text
  )
}

function findMirroredDirectMessageInDialog(
  dialogMessages: PersistedDialogMessage[],
  sourceMessage: PersistedDialogMessage,
) {
  return (
    dialogMessages.find((message) => {
      if (message.archivedAt) {
        return false
      }

      if (sourceMessage.deliveryId && message.deliveryId) {
        return sourceMessage.deliveryId === message.deliveryId
      }

      return (
        message.createdAt === sourceMessage.createdAt &&
        message.text === sourceMessage.text &&
        message.attachment?.mediaUrl === sourceMessage.attachment?.mediaUrl &&
        message.author === invertMessageAuthor(sourceMessage.author)
      )
    }) ?? null
  )
}

function remapDialogReplyTargetForViewer(
  database: Database,
  ownerIdentifier: string,
  dialog: PersistedDialog,
  dialogMessages: PersistedDialogMessage[],
  replyTo?: Message['replyTo'],
): Message['replyTo'] | undefined {
  if (!replyTo || replyTo.id <= 0) {
    return replyTo
  }

  const currentTarget = dialogMessages.find(
    (message) => !message.archivedAt && message.id === replyTo.id,
  )
  if (currentTarget && matchesDirectReplyTarget(currentTarget, replyTo)) {
    return replyTo
  }

  const peerIdentifier = normalizeStoredIdentifierReference(dialog.phone)
  if (!peerIdentifier || isArchivedIdentifier(dialog.phone)) {
    return replyTo
  }

  const peerDialog =
    database.dialogs.find(
      (candidate) =>
        candidate.ownerIdentifier === peerIdentifier &&
        normalizeStoredIdentifierReference(candidate.phone) === ownerIdentifier,
    ) ?? null
  if (!peerDialog) {
    return replyTo
  }

  const peerSourceMessage =
    database.dialogMessages.find(
      (message) =>
        message.ownerIdentifier === peerIdentifier &&
        message.dialogId === peerDialog.id &&
        message.id === replyTo.id &&
        !message.archivedAt &&
        matchesDirectReplyTarget(message, {
          ...replyTo,
          author: invertMessageAuthor(replyTo.author),
        }),
    ) ?? null
  if (!peerSourceMessage) {
    return replyTo
  }

  const mirroredMessage = findMirroredDirectMessageInDialog(dialogMessages, peerSourceMessage)
  if (!mirroredMessage) {
    return replyTo
  }

  return {
    ...replyTo,
    id: mirroredMessage.id,
  }
}

function materializeGroup(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  viewerIdentifier: string,
  group: PersistedGroup,
): Omit<PersistedGroup, 'ownerIdentifier'> {
  const fallbackParticipants =
    initialGroups.find((seedGroup) => seedGroup.id === group.id)?.participants ?? []
  const participants = (group.participants ?? fallbackParticipants).flatMap((participant) => {
    const account = findAccountByStoredIdentifier(database, participant.identifier)
    const archivedAccount =
      Boolean(account && isPublicDeletedAccount(account)) || isArchivedIdentifier(participant.identifier)
    if (archivedAccount) {
      return [] as GroupParticipant[]
    }

    const online = account ? hasLivePresenceInSet(livePresenceIdentifiers, account.identifier) : Boolean(participant.online)
    const visibleOnline = account
      ? getViewerVisibleOnline(account, viewerIdentifier, online)
      : Boolean(participant.online)

    return [{
      ...participant,
      archivedAccount: false,
      avatarImage: account?.avatarImage ?? participant.avatarImage,
      identifier: participant.identifier ? normalizeStoredIdentifierReference(participant.identifier) : undefined,
      nickname: normalizeNickname(account?.nickname ?? participant.nickname ?? ''),
      online: visibleOnline,
      premium: account ? hasActivePremium(account.premium, account.premiumExpiresAt) : participant.premium,
      status: account ? getUserVisibleStatus(account, visibleOnline) : participant.status,
      title: account ? formatAccountName(account) || account.identifier : participant.title,
    }]
  })

  return {
    accent: group.accent,
    archivedAt: group.archivedAt,
    archiveReason: group.archiveReason,
    avatarImage: group.avatarImage,
    commentBlacklistIdentifiers: sanitizeIdentifierList(group.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(group.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(group.commentsEnabledForPremium),
    creatorIdentifier: group.creatorIdentifier ?? group.ownerIdentifier,
    description: sanitizeChannelDescription(group.description ?? '') || undefined,
    groupOwnerIdentifier: getCurrentGroupOwnerIdentifier(group),
    handle: group.handle,
    id: group.id,
    isTestEntity: group.isTestEntity,
    members: participants.length,
    muted: Boolean(group.muted),
    participants,
    preview: group.preview,
    showHistoryToNewMembers: group.showHistoryToNewMembers !== false,
    sharedId: group.sharedId ?? `${group.ownerIdentifier}:${group.id}`,
    time: group.time,
    title: group.title,
    unread: group.unread,
    viewerIsOwner: getCurrentGroupOwnerIdentifier(group) === viewerIdentifier,
  }
}

function materializeGroupMessage(
  database: Database,
  viewerIdentifier: string,
  message: PersistedGroupMessage,
): Omit<PersistedGroupMessage, 'groupId' | 'ownerIdentifier'> {
  const resolvedSourceContact = message.sourceContact ?? resolveContactSourceReferenceFromText(database, message.text)
  const hideThreadForViewer = isArchivedThread(message)
  return {
    attachment: materializeAttachmentForViewer(database, viewerIdentifier, message.attachment),
    attachmentRemovedNotice: materializeAttachmentRemovedNoticeForViewer(
      message.attachmentRemovedNotice,
      message.author === 'me' ? 'self' : 'author',
    ),
    author: message.author,
    createdAt: message.createdAt,
    deliveryId: message.deliveryId,
    displayAuthor: message.displayAuthor,
    forwarded: message.forwarded,
    forwardedAuthorName: message.forwardedAuthorName,
    groupParticipantId: message.groupParticipantId,
    groupSystemEvent: message.groupSystemEvent,
    id: message.id,
    readAt: message.readAt,
    replyTo: message.replyTo,
    sourceChannel:
      message.sourceChannel ??
      (resolvedSourceContact ? undefined : resolveChannelSourceReferenceFromText(database, message.text)),
    sourceContact: resolvedSourceContact,
    sourceGroup: materializeSourceGroupForViewer(database, message.sourceGroup),
    system: Boolean(message.system),
    text: message.text,
    threadArchivedAt: message.threadArchivedAt,
    threadArchiveReason: message.threadArchiveReason,
    threadComments: hideThreadForViewer
      ? []
      : materializeThreadCommentsForViewer(database, viewerIdentifier, message.threadComments, 'author'),
    threadId: hideThreadForViewer ? undefined : message.threadId?.trim() || undefined,
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

function getDirectArchiveReasonForExport(
  leftReason?: PersistedDialogMessage['archivedReason'],
  rightReason?: PersistedDialogMessage['archivedReason'],
) {
  if (leftReason && rightReason) {
    return leftReason === rightReason ? leftReason : `${leftReason}|${rightReason}`
  }
  return leftReason ?? rightReason
}

function buildDirectRetentionNoteForExport(
  leftReason?: PersistedDialogMessage['archivedReason'],
  rightReason?: PersistedDialogMessage['archivedReason'],
) {
  if (!leftReason && !rightReason) return undefined

  if (leftReason === 'delete-message-everyone' || rightReason === 'delete-message-everyone') {
    if (
      (leftReason && leftReason !== 'delete-message-everyone') ||
      (rightReason && rightReason !== 'delete-message-everyone')
    ) {
      return 'Сообщение удалено пользователем у всех; часть локальных копий уже была скрыта, но серверная запись сохранена.'
    }
    return 'Сообщение удалено пользователем у всех, но серверная запись сохранена.'
  }

  if (leftReason === rightReason) {
    if (leftReason === 'delete-message-me') {
      return 'Сообщение скрыто у обоих участников через «Удалить у меня», но серверная запись сохранена.'
    }
    if (leftReason === 'delete-history-me') {
      return 'Сообщение скрыто у обоих участников через «Удалить переписку у меня», но серверная запись сохранена.'
    }
  }

  if (leftReason && rightReason) {
    return `Сообщение скрыто локально у участников (${humanizeDirectArchiveReason(leftReason)}; ${humanizeDirectArchiveReason(rightReason)}), но серверная запись сохранена.`
  }

  return `Сообщение скрыто локально у одного участника (${humanizeDirectArchiveReason(leftReason ?? rightReason)}), но серверная запись сохранена.`
}

function humanizeDirectArchiveReason(reason?: PersistedDialogMessage['archivedReason']) {
  if (reason === 'delete-message-me') return '«Удалить у меня»'
  if (reason === 'delete-history-me') return '«Удалить переписку у меня»'
  if (reason === 'delete-message-everyone') return '«Удалить у всех»'
  return 'локальное скрытие'
}

function materializeManagedChannel(
  channel: PersistedManagedChannel,
): Omit<PersistedManagedChannel, 'ownerIdentifier'> {
  return {
    archivedAt: channel.archivedAt,
    archiveReason: channel.archiveReason,
    avatarImage: channel.avatarImage,
    avatarTone: channel.avatarTone,
    commentBlacklistIdentifiers: sanitizeIdentifierList(channel.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(channel.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(channel.commentsEnabledForPremium),
    description: channel.description,
    statusText: channel.statusText?.trim() || undefined,
    directLink: sanitizeChannelDirectLink(channel.directLink) || '@kanal',
    id: channel.id,
    status: channel.status,
    title: channel.title,
    visibility: channel.visibility,
  }
}

function materializeSubscriptionChannel(
  database: Database,
  channel: PersistedSubscriptionChannel,
): Omit<PersistedSubscriptionChannel, 'ownerIdentifier'> {
  return {
    accent: channel.accent,
    archivedAt: channel.archivedAt,
    archiveReason: channel.archiveReason,
    avatarImage: channel.avatarImage,
    creatorIdentifier: normalizeStoredIdentifierReference(channel.creatorIdentifier ?? '') || undefined,
    description: channel.description?.trim() || undefined,
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
      channel.participants?.flatMap((participant) => {
        const account = findAccountByStoredIdentifier(database, participant.identifier)
        const archivedAccount =
          Boolean(account && isPublicDeletedAccount(account)) || isArchivedIdentifier(participant.identifier)
        if (archivedAccount) {
          return [] as GroupParticipant[]
        }
        return [{
          ...participant,
          archivedAccount: false,
          avatarImage: account?.avatarImage ?? participant.avatarImage,
          identifier: participant.identifier ? normalizeStoredIdentifierReference(participant.identifier) : undefined,
          nickname: normalizeNickname(account?.nickname ?? participant.nickname ?? ''),
          status: account?.status?.trim() || participant.status,
          title: account ? formatAccountName(account) || account.identifier : participant.title,
        }]
      }) ?? [],
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
  const resolvedSourceContact = post.sourceContact ?? resolveContactSourceReferenceFromText(database, post.text)
  const hideThreadForViewer = isArchivedThread(post)
  return {
    attachment: materializeAttachmentForViewer(database, viewerIdentifier, post.attachment),
    attachmentRemovedNotice: materializeAttachmentRemovedNoticeForViewer(
      post.attachmentRemovedNotice,
      post.ownerIdentifier === viewerIdentifier ? 'self' : 'author',
    ),
    createdAt: post.createdAt,
    id: post.id,
    replyTo: post.replyTo,
    sourceChannel:
      post.sourceChannel ??
      (resolvedSourceContact ? undefined : resolveChannelSourceReferenceFromText(database, post.text)),
    sourceContact: resolvedSourceContact,
    system: Boolean(post.system),
    text: post.text,
    threadArchivedAt: post.threadArchivedAt,
    threadArchiveReason: post.threadArchiveReason,
    threadComments: hideThreadForViewer
      ? []
      : materializeThreadCommentsForViewer(database, viewerIdentifier, post.threadComments, 'author'),
    threadId: hideThreadForViewer ? undefined : post.threadId?.trim() || undefined,
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
  const persistedChats = chats.filter(
    (chat) => normalizeIdentifier(chat.phone) !== ownerIdentifier,
  )

  return {
    dialogMessages: persistedChats.flatMap((chat) =>
      chat.messages.map((message) => toPersistedDialogMessage(ownerIdentifier, chat.id, message)),
    ),
    dialogs: persistedChats.map((chat) => toPersistedDialog(ownerIdentifier, chat)),
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
    const legacyPremium = legacyAccount.premium ?? true
    const legacyPremiumExpiresAt = legacyAccount.premiumExpiresAt ?? makePremiumExpiry(30)
    nextDatabase.accounts.push({
      accountId: randomUUID(),
      avatarImage: legacyAccount.avatarImage?.trim() || undefined,
      archivedOriginalIdentifier: undefined,
      archivedProfile: undefined,
      blockedAt: legacyAccount.blockedAt,
      blockedReason: legacyAccount.blockedReason,
      blockedContactIds: legacyAccount.blockedContactIds ?? [],
      createdAt: legacyAccount.createdAt,
      darkThemeEnabled: Boolean(legacyAccount.darkThemeEnabled),
      deletedAt: undefined,
      deletedBySelfService: undefined,
      deletionMode: undefined,
      publicDeleted: undefined,
      displayName: legacyAccount.displayName,
      gifLibrary: [...(legacyAccount.gifLibrary ?? [])],
      identifier: legacyAccount.identifier,
      invisibilityAutoEnabled: Boolean(legacyAccount.invisibilityAutoEnabled),
      invisibilityEnabled: legacyAccount.invisibilityEnabled ?? legacyAccount.quietModeEnabled ?? false,
      isTestEntity: legacyAccount.isTestEntity,
      lastActiveAt: legacyAccount.lastActiveAt ?? legacyAccount.createdAt,
      nickname: legacyAccount.nickname ?? '',
      passwordHash: legacyAccount.passwordHash?.trim() || undefined,
      passwordSetAt: legacyAccount.passwordSetAt || undefined,
      premium: legacyPremium,
      premiumExpiresAt: legacyPremiumExpiresAt,
      retainedArchiveStorageQuotaBytes: normalizeRetainedArchiveStorageQuotaBytes({
        premium: legacyPremium,
        premiumExpiresAt: legacyPremiumExpiresAt,
      }),
      retainedStorageQuotaBytes: normalizeRetainedStorageQuotaBytes({
        premium: legacyPremium,
        premiumExpiresAt: legacyPremiumExpiresAt,
      }),
      quietModeSettings: normalizeQuietModeSettings(legacyAccount.quietModeSettings),
      staffRole: sanitizeStaffRole(legacyAccount.staffRole),
      status: legacyAccount.status ?? '',
      statusHistory: normalizeAccountStatusHistory(undefined, legacyAccount.createdAt, legacyAccount.status ?? ''),
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

function materializeFullChats(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
  options: { includeHidden?: boolean } = {},
): Chat[] {
  const includeHidden = Boolean(options.includeHidden)

  return database.dialogs
    .filter((dialog) => dialog.ownerIdentifier === ownerIdentifier && (includeHidden || !dialog.hidden))
    .flatMap((dialog) => {
      const contactAccount = database.accounts.find(
        (account) => normalizeStoredIdentifierReference(dialog.phone) === account.identifier,
      )
      if ((contactAccount && isPublicDeletedAccount(contactAccount)) || isArchivedIdentifier(dialog.phone)) {
        return []
      }
      const persistedMessages = database.dialogMessages
        .filter(
          (message) =>
            message.ownerIdentifier === ownerIdentifier &&
            message.dialogId === dialog.id &&
            !message.archivedAt,
        )
        // Direct "delete for everyone" archives messages server-side for admin recovery,
        // but those archived copies must disappear from every normal user snapshot/history view.
      const messages = persistedMessages.map((message) =>
        materializeDialogMessage(
          database,
          ownerIdentifier,
          message,
          remapDialogReplyTargetForViewer(
            database,
            ownerIdentifier,
            dialog,
            persistedMessages,
            message.replyTo,
          ),
        ),
      )
      const pinnedMessage =
        dialog.pinnedMessageId === undefined
          ? undefined
          : messages.find((message) => message.id === dialog.pinnedMessageId)

      return [{
        ...materializeDialog(database, livePresenceIdentifiers, dialog),
        blockedByAdmin: Boolean(contactAccount?.blockedAt),
        blockedReason: contactAccount?.blockedReason?.trim() || undefined,
        messages,
        pinnedMessage,
      }]
    })
}

function materializeChats(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
): Chat[] {
  return materializeFullChats(database, livePresenceIdentifiers, ownerIdentifier, { includeHidden: true }).map((chat) => {
    const historySlice = buildInitialHistorySlice(chat.messages)

    return {
      ...chat,
      historyHasMore: historySlice.hasMore,
      messages: historySlice.items,
    }
  })
}

function materializeContactRequests(database: Database, ownerIdentifier: string): ContactRequestPreview[] {
  return database.contactLinks
    .filter(
      (link) =>
        link.status === 'pending' &&
        link.requesterIdentifier !== ownerIdentifier &&
        (link.leftIdentifier === ownerIdentifier || link.rightIdentifier === ownerIdentifier),
    )
    .map((link) => {
      const requester = database.accounts.find((account) => account.identifier === link.requesterIdentifier)
      if (!requester || isPublicDeletedAccount(requester)) {
        return null
      }

      return {
        ...buildContactRequestPreview(requester),
        createdAt: link.createdAt,
      } satisfies ContactRequestPreview
    })
    .filter((request): request is ContactRequestPreview => request !== null)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

function materializeOutgoingContactRequests(database: Database, ownerIdentifier: string): ContactRequestPreview[] {
  return database.contactLinks
    .filter(
      (link) =>
        link.status === 'pending' &&
        link.requesterIdentifier === ownerIdentifier &&
        (link.leftIdentifier === ownerIdentifier || link.rightIdentifier === ownerIdentifier),
    )
    .map((link) => {
      const peerIdentifier =
        link.leftIdentifier === ownerIdentifier ? link.rightIdentifier : link.leftIdentifier
      const peer = database.accounts.find((account) => account.identifier === peerIdentifier)
      if (!peer || isPublicDeletedAccount(peer)) {
        return null
      }

      return {
        ...buildContactRequestPreview(peer),
        createdAt: link.createdAt,
      } satisfies ContactRequestPreview
    })
    .filter((request): request is ContactRequestPreview => request !== null)
}

function materializeFullGroups(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
): GroupPreview[] {
  return database.groups
    .filter((group) => group.ownerIdentifier === ownerIdentifier)
    .filter((group) => !shouldHideArchivedGroupForUsers(group))
    .map((group) => {
      const materializedGroup = materializeGroup(database, livePresenceIdentifiers, ownerIdentifier, group)
      const messages = database.groupMessages
        .filter(
          (message) => message.ownerIdentifier === ownerIdentifier && message.groupId === group.id,
        )
        .flatMap((message) => {
          const authorAccount = findAccountByStoredIdentifier(
            database,
            resolveGroupMessageAuthorIdentifier(group, message),
          )
          if (shouldHideDeletedAccountContentForUsers(authorAccount)) {
            return []
          }
          const materializedMessage = materializeGroupMessage(database, ownerIdentifier, message)
          return [{
            ...materializedMessage,
            displayAuthor:
              authorAccount && isPublicDeletedAccount(authorAccount)
                ? 'Аккаунт удалён'
                : materializedMessage.displayAuthor,
            threadComments: materializedMessage.threadComments ?? [],
            threadId: materializedMessage.threadId,
          }]
        })

      return {
        ...materializedGroup,
        latestActivityAt: messages.at(-1)?.createdAt,
        messages,
      }
    })
}

function materializeGroups(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
): GroupPreview[] {
  return materializeFullGroups(database, livePresenceIdentifiers, ownerIdentifier).map((group) => {
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
    .filter((channel) => !shouldHideArchivedChannelForUsers(channel))
    .map((channel) => materializeManagedChannel(channel))
}

function buildDerivedSubscriptionParticipants(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
  normalizedHandle: string,
) {
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
    .flatMap((account) => {
      const matchingDialog = database.dialogs.find(
        (dialog) =>
          dialog.ownerIdentifier === ownerIdentifier &&
          normalizeIdentifier(dialog.phone) === account.identifier,
      )
      const archivedAccount = isPublicDeletedAccount(account)
      if (archivedAccount) {
        return [] as GroupParticipant[]
      }

      return [{
        accent: pickAccentForIdentifier(account.identifier),
        avatarImage: account.avatarImage,
        archivedAccount,
        favorite: Boolean(matchingDialog?.pinned),
        id: getStableParticipantId(account.identifier),
        identifier: account.identifier,
        nickname: normalizeNickname(account.nickname ?? ''),
        online: hasLivePresenceInSet(livePresenceIdentifiers, account.identifier),
        premium: hasActivePremium(account.premium, account.premiumExpiresAt),
        status: account.status?.trim() || 'в сети',
        title: formatAccountName(account) || account.identifier,
      } satisfies GroupParticipant]
    })
}

function materializeSubscriptionParticipants(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
  channel: PersistedSubscriptionChannel,
) {
  const explicitParticipants = channel.participants ?? []
  const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
  const derivedParticipants = buildDerivedSubscriptionParticipants(
    database,
    livePresenceIdentifiers,
    ownerIdentifier,
    normalizedHandle,
  )

  if (explicitParticipants.length > 0) {
    const materializedExplicitParticipants = explicitParticipants.flatMap((participant) => {
      const account = findAccountByStoredIdentifier(database, participant.identifier)
      const archivedAccount =
        Boolean(account && isPublicDeletedAccount(account)) || isArchivedIdentifier(participant.identifier)
      if (archivedAccount) {
        return [] as GroupParticipant[]
      }
      return [{
        ...participant,
        archivedAccount: false,
        avatarImage: account?.avatarImage ?? participant.avatarImage,
        identifier: participant.identifier ? normalizeStoredIdentifierReference(participant.identifier) : undefined,
        nickname: normalizeNickname(account?.nickname ?? participant.nickname ?? ''),
        status: account?.status?.trim() || participant.status,
        title: account ? formatAccountName(account) || account.identifier : participant.title,
      }]
    })

    if (derivedParticipants.length > materializedExplicitParticipants.length) {
      const mergedParticipants = new Map<string, GroupParticipant>()

      for (const participant of materializedExplicitParticipants.concat(derivedParticipants)) {
        const normalizedIdentifier = normalizeIdentifier(participant.identifier ?? '')
        if (normalizedIdentifier && !mergedParticipants.has(normalizedIdentifier)) {
          mergedParticipants.set(normalizedIdentifier, participant)
        }
      }

      return [...mergedParticipants.values()]
    }

    return materializedExplicitParticipants
  }

  return derivedParticipants
}

function materializeFullSubscriptionChannels(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
): SubscriptionChannel[] {
  return database.subscriptionChannels
    .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
    .filter((channel) => !shouldHideArchivedChannelForUsers(channel))
    .map((channel) => {
      const materializedChannel = materializeSubscriptionChannel(database, channel)
      const participants = materializeSubscriptionParticipants(
        database,
        livePresenceIdentifiers,
        ownerIdentifier,
        channel,
      )
      const normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
      const isManagedChannel = database.managedChannels.some(
        (managedChannel) =>
          (sanitizeChannelDirectLink(managedChannel.directLink) || managedChannel.directLink) === normalizedHandle,
      )
      const hideArchivedOwnerContent = shouldHideArchivedChannelForUsers(channel)
      const posts = hideArchivedOwnerContent
        ? []
        : database.subscriptionPosts
        .filter(
          (post) => post.ownerIdentifier === ownerIdentifier && post.channelId === channel.id,
        )
        .flatMap((post) => {
          const materializedPost = materializeSubscriptionPost(database, ownerIdentifier, post)
          return [{
            ...materializedPost,
            threadComments: materializedPost.threadComments ?? [],
            threadId: materializedPost.threadId,
          }]
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
  livePresenceIdentifiers: LivePresenceLookup,
  ownerIdentifier: string,
): SubscriptionChannel[] {
  return materializeFullSubscriptionChannels(database, livePresenceIdentifiers, ownerIdentifier).map((channel) => {
    const historySlice = buildInitialHistorySlice(channel.posts)

    return {
      ...channel,
      historyHasMore: historySlice.hasMore,
      posts: historySlice.items,
    }
  })
}

function buildEphemeralSubscriptionChannelFromManagedChannel(
  sourceChannel: PersistedManagedChannel,
): PersistedSubscriptionChannel {
  return {
    accent: sourceChannel.avatarTone,
    archivedAt: sourceChannel.archivedAt,
    archiveReason: sourceChannel.archiveReason,
    avatarImage: sourceChannel.avatarImage,
    commentBlacklistIdentifiers: sanitizeIdentifierList(sourceChannel.commentBlacklistIdentifiers),
    commentsEnabledForAll: Boolean(sourceChannel.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(sourceChannel.commentsEnabledForPremium),
    creatorIdentifier: sourceChannel.ownerIdentifier,
    description: sourceChannel.description,
    draft: sourceChannel.status === 'draft',
    handle: sourceChannel.directLink,
    id: 0,
    muted: false,
    ownerIdentifier: sourceChannel.ownerIdentifier,
    participants: [],
    preview: buildManagedChannelFallbackPreview(sourceChannel),
    readers: 0,
    statusText: sourceChannel.statusText?.trim() || undefined,
    time: '',
    title: sourceChannel.title,
    unread: 0,
    visibility: sourceChannel.visibility,
  }
}

function materializeSubscriptionChannelPreview(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  viewerIdentifier: string,
  sourceChannel: PersistedManagedChannel,
): SubscriptionChannel {
  const normalizedHandle = sanitizeChannelDirectLink(sourceChannel.directLink) || sourceChannel.directLink
  const ownerCopy =
    database.subscriptionChannels.find(
      (channel) =>
        channel.ownerIdentifier === sourceChannel.ownerIdentifier &&
        (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
    ) ??
    database.subscriptionChannels.find(
      (channel) => (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
    ) ??
    buildEphemeralSubscriptionChannelFromManagedChannel(sourceChannel)

  const materializedChannel = materializeSubscriptionChannel(database, ownerCopy)
  const participants = materializeSubscriptionParticipants(
    database,
    livePresenceIdentifiers,
    viewerIdentifier,
    ownerCopy,
  )
  const posts = database.subscriptionPosts
    .filter(
      (post) =>
        post.ownerIdentifier === ownerCopy.ownerIdentifier &&
        post.channelId === ownerCopy.id,
    )
    .sort((left, right) => {
      const leftCreatedAt = parseIsoDate(left.createdAt)
      const rightCreatedAt = parseIsoDate(right.createdAt)

      if (leftCreatedAt !== null && rightCreatedAt !== null && leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt
      }
      if (leftCreatedAt !== null && rightCreatedAt === null) return -1
      if (leftCreatedAt === null && rightCreatedAt !== null) return 1
      return left.id - right.id
    })
    .map((post) => {
      const materializedPost = materializeSubscriptionPost(database, viewerIdentifier, post)
      return {
        ...materializedPost,
        threadComments: materializedPost.threadComments ?? [],
        threadId: materializedPost.threadId,
      }
    })

  return {
    ...materializedChannel,
    historyHasMore: false,
    latestActivityAt: posts.at(-1)?.createdAt,
    participants,
    posts,
    readers: Math.max(1, participants.length),
    unread: 0,
  }
}

function compareIsoDateDesc(left?: string, right?: string) {
  const leftValue = left ? Date.parse(left) : Number.NEGATIVE_INFINITY
  const rightValue = right ? Date.parse(right) : Number.NEGATIVE_INFINITY
  return rightValue - leftValue
}

function compareThreadCommentOrder(
  left: Pick<ThreadComment, 'createdAt' | 'id'>,
  right: Pick<ThreadComment, 'createdAt' | 'id'>,
) {
  const leftCreatedAt = Date.parse(left.createdAt ?? '')
  const rightCreatedAt = Date.parse(right.createdAt ?? '')

  if (!Number.isNaN(leftCreatedAt) || !Number.isNaN(rightCreatedAt)) {
    if (Number.isNaN(leftCreatedAt)) return -1
    if (Number.isNaN(rightCreatedAt)) return 1
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt
  } else if ((left.createdAt ?? '') !== (right.createdAt ?? '')) {
    return (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
  }

  return (left.id ?? 0) - (right.id ?? 0)
}

function findLatestThreadComment(comments: ThreadComment[]) {
  let latestComment: ThreadComment | undefined

  for (const comment of comments) {
    if (!comment.createdAt) continue
    if (!latestComment || compareThreadCommentOrder(comment, latestComment) > 0) {
      latestComment = comment
    }
  }

  return latestComment
}

function findLatestOwnThreadComment(comments: ThreadComment[], ownerIdentifier: string) {
  let latestComment: ThreadComment | undefined

  for (const comment of comments) {
    if (!comment.createdAt) continue
    if (normalizeIdentifier(comment.authorIdentifier ?? '') !== ownerIdentifier) continue
    if (!latestComment || compareThreadCommentOrder(comment, latestComment) > 0) {
      latestComment = comment
    }
  }

  return latestComment
}

function buildThreadReadMarker(
  latestComment: Pick<ThreadComment, 'createdAt' | 'id'> | undefined,
  fallbackCreatedAt?: string,
): Pick<PersistedThreadState, 'lastReadCommentCreatedAt' | 'lastReadCommentId'> {
  return {
    lastReadCommentCreatedAt: latestComment?.createdAt ?? fallbackCreatedAt,
    lastReadCommentId:
      latestComment?.id ?? (latestComment?.createdAt || fallbackCreatedAt ? 0 : undefined),
  }
}

function countUnreadThreadReplies(
  comments: ThreadComment[],
  ownerIdentifier: string,
  lastReadCommentCreatedAt?: string,
  lastReadCommentId?: number,
) {
  if (!lastReadCommentCreatedAt) return 0

  const lastReadAt = Date.parse(lastReadCommentCreatedAt)
  if (Number.isNaN(lastReadAt)) return 0

  return comments.reduce((count, comment) => {
    if (!comment.createdAt) return count
    if (normalizeIdentifier(comment.authorIdentifier ?? '') === ownerIdentifier) return count
    const createdAt = Date.parse(comment.createdAt)
    if (Number.isNaN(createdAt)) return count
    if (createdAt < lastReadAt) return count
    if (createdAt === lastReadAt) {
      if (lastReadCommentId === undefined) return count
      if ((comment.id ?? 0) <= lastReadCommentId) return count
    }
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
    if (shouldHideArchivedGroupForUsers(group)) {
      continue
    }

    for (const message of database.groupMessages.filter(
      (candidate) => candidate.ownerIdentifier === ownerIdentifier && candidate.groupId === group.id,
    )) {
      if (isArchivedThread(message)) {
        continue
      }
      const authorAccount = findAccountByStoredIdentifier(
        database,
        resolveGroupMessageAuthorIdentifier(group, message),
      )
      if (shouldHideDeletedAccountContentForUsers(authorAccount)) {
        continue
      }
      const threadId = getGroupMessageThreadId(group, message)
      const comments = materializeThreadCommentsForViewer(database, ownerIdentifier, message.threadComments)
      const threadState = threadStatesById.get(threadId)
      const isRootAuthor =
        normalizeIdentifier(resolveGroupMessageAuthorIdentifier(group, message)) === ownerIdentifier
      const hasParticipation = isRootAuthor || comments.some(
        (comment) => normalizeIdentifier(comment.authorIdentifier ?? '') === ownerIdentifier,
      )
      const isExplicitlySubscribed = threadState?.subscription === 'subscribed'
      const isImplicitlySubscribed =
        comments.length > 0 &&
        hasParticipation &&
        threadState?.subscription !== 'unsubscribed'
      const isSubscribed = isExplicitlySubscribed || isImplicitlySubscribed

      if (!isSubscribed) continue

      const latestComment = findLatestThreadComment(comments)
      const latestCommentAuthorAccount =
        latestComment?.authorIdentifier
          ? findAccountByStoredIdentifier(database, latestComment.authorIdentifier)
          : null
      const latestCommentGroupParticipant =
        (latestComment?.authorIdentifier
          ? group.participants.find(
              (participant) =>
                normalizeIdentifier(participant.identifier ?? '') ===
                normalizeIdentifier(latestComment.authorIdentifier ?? ''),
            ) ?? null
          : null) ??
        (latestComment?.displayAuthor
          ? group.participants.find((participant) => participant.title === latestComment.displayAuthor) ?? null
          : null)
      const latestOwnComment = findLatestOwnThreadComment(comments, ownerIdentifier)
      const lastReadCommentCreatedAt =
        threadState?.lastReadCommentCreatedAt ??
        latestOwnComment?.createdAt ??
        message.createdAt
      const lastReadCommentId =
        threadState?.lastReadCommentId ??
        latestOwnComment?.id ??
        (lastReadCommentCreatedAt ? 0 : undefined)
      const unreadCount = countUnreadThreadReplies(
        comments,
        ownerIdentifier,
        lastReadCommentCreatedAt,
        lastReadCommentId,
      )

      upsertThreadInboxItem({
        avatarImage: group.avatarImage,
        commentCount: comments.length,
        groupAccent: group.accent,
        groupId: group.id,
        groupTitle: group.title,
        kind: 'group',
        latestActivityAt: latestComment?.createdAt ?? message.createdAt,
        latestCommentAuthor: latestComment?.displayAuthor,
        latestCommentAuthorAccent: latestCommentGroupParticipant?.accent ?? '#cfb4a0',
        latestCommentAuthorAvatarImage:
          latestCommentAuthorAccount?.avatarImage ?? latestCommentGroupParticipant?.avatarImage,
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
    const hideArchivedOwnerContent = shouldHideArchivedChannelForUsers(channel)
    if (hideArchivedOwnerContent) {
      continue
    }

    for (const post of database.subscriptionPosts.filter(
      (candidate) => candidate.ownerIdentifier === ownerIdentifier && candidate.channelId === channel.id,
    )) {
      if (isArchivedThread(post)) {
        continue
      }
      const threadId = getSubscriptionPostThreadId(channel, post)
      const comments = materializeThreadCommentsForViewer(database, ownerIdentifier, post.threadComments)
      const threadState = threadStatesById.get(threadId)
      const isRootAuthor =
        normalizeIdentifier(resolveSubscriptionPostAuthorIdentifier(database, channel, post)) === ownerIdentifier
      const hasParticipation = isRootAuthor || comments.some(
        (comment) => normalizeIdentifier(comment.authorIdentifier ?? '') === ownerIdentifier,
      )
      const isExplicitlySubscribed = threadState?.subscription === 'subscribed'
      const isImplicitlySubscribed =
        comments.length > 0 &&
        hasParticipation &&
        threadState?.subscription !== 'unsubscribed'
      const isSubscribed = isExplicitlySubscribed || isImplicitlySubscribed

      if (!isSubscribed) continue

      const latestComment = findLatestThreadComment(comments)
      const latestCommentAuthorAccount =
        latestComment?.authorIdentifier
          ? findAccountByStoredIdentifier(database, latestComment.authorIdentifier)
          : null
      const latestOwnComment = findLatestOwnThreadComment(comments, ownerIdentifier)
      const lastReadCommentCreatedAt =
        threadState?.lastReadCommentCreatedAt ??
        latestOwnComment?.createdAt ??
        post.createdAt
      const lastReadCommentId =
        threadState?.lastReadCommentId ??
        latestOwnComment?.id ??
        (lastReadCommentCreatedAt ? 0 : undefined)
      const unreadCount = countUnreadThreadReplies(
        comments,
        ownerIdentifier,
        lastReadCommentCreatedAt,
        lastReadCommentId,
      )

      upsertThreadInboxItem({
        avatarImage: channel.avatarImage,
        channelAccent: channel.accent,
        channelId: channel.id,
        channelTitle: channel.title,
        commentCount: comments.length,
        kind: 'channel',
        latestActivityAt: latestComment?.createdAt ?? post.createdAt,
        latestCommentAuthor: latestComment?.displayAuthor,
        latestCommentAuthorAccent: '#cfb4a0',
        latestCommentAuthorAvatarImage: latestCommentAuthorAccount?.avatarImage,
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

function materializeSupportTickets(
  database: Database,
  ownerIdentifier: string,
): SupportTicket[] {
  return database.supportTickets
    .filter((ticket) => ticket.ownerIdentifier === ownerIdentifier)
    .map((ticket) => {
      const comments = materializeThreadCommentsForViewer(database, ownerIdentifier, ticket.comments, 'self')
      const threadState = database.threadStates.find(
        (state) => state.ownerIdentifier === ownerIdentifier && state.threadId === ticket.threadId,
      )
      const latestComment = findLatestThreadComment(comments)
      const latestOwnComment = findLatestOwnThreadComment(comments, ownerIdentifier)
      const lastReadCommentCreatedAt =
        threadState?.lastReadCommentCreatedAt ??
        latestOwnComment?.createdAt ??
        ticket.updatedAt
      const lastReadCommentId =
        threadState?.lastReadCommentId ??
        latestOwnComment?.id ??
        (lastReadCommentCreatedAt ? 0 : undefined)
      const unreadCount = countUnreadThreadReplies(
        comments,
        ownerIdentifier,
        lastReadCommentCreatedAt,
        lastReadCommentId,
      )

      return {
        attachment: materializeAttachmentForViewer(database, ownerIdentifier, ticket.attachment),
        attachmentRemovedNotice: materializeAttachmentRemovedNoticeForViewer(
          ticket.attachmentRemovedNotice,
          'self',
        ),
        comments,
        createdAt: ticket.createdAt,
        id: ticket.id,
        latestActivityAt: latestComment?.createdAt ?? ticket.updatedAt,
        replyTo: ticket.replyTo,
        status: ticket.status,
        text: ticket.text,
        threadId: ticket.threadId,
        time: ticket.time,
        unreadCount,
        updatedAt: ticket.updatedAt,
      } satisfies SupportTicket
    })
    .sort((left, right) => compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt))
}

function getSupportTicketCooldownUntil(
  database: Database,
  ownerIdentifier: string,
): string | undefined {
  const latestTicketCreatedAt = database.supportTickets
    .filter((ticket) => ticket.ownerIdentifier === ownerIdentifier)
    .map((ticket) => ticket.createdAt)
    .sort(compareIsoDateDesc)[0]

  if (!latestTicketCreatedAt) {
    return undefined
  }

  const latestTimestamp = Date.parse(latestTicketCreatedAt)
  if (Number.isNaN(latestTimestamp)) {
    return undefined
  }

  const cooldownUntil = new Date(latestTimestamp + SUPPORT_TICKET_COOLDOWN_MS).toISOString()
  return Date.parse(cooldownUntil) > Date.now() ? cooldownUntil : undefined
}

export class TinychokStore {
  private readonly persistDatabase: PersistDatabaseFn
  private database: Database
  private readonly livePresenceConnectionsByToken = new Map<string, number>()
  private readonly livePresenceCountsByIdentifier = new Map<string, number>()

  private constructor(database: Database, persistDatabase: PersistDatabaseFn) {
    this.database = database
    this.persistDatabase = persistDatabase
  }

  private hasLivePresence(identifier: string) {
    const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
    if (!normalizedIdentifier) {
      return false
    }

    // Presence source of truth:
    // "в сети" must only reflect live realtime sockets. Persisted database.sessions are allowed to
    // outlive the browser for retention/audit reasons and must never by themselves keep users online.
    return (this.livePresenceCountsByIdentifier.get(normalizedIdentifier) ?? 0) > 0
  }

  private incrementLivePresence(identifier: string) {
    const nextCount = (this.livePresenceCountsByIdentifier.get(identifier) ?? 0) + 1
    this.livePresenceCountsByIdentifier.set(identifier, nextCount)
  }

  private decrementLivePresence(identifier: string) {
    const nextCount = (this.livePresenceCountsByIdentifier.get(identifier) ?? 0) - 1
    if (nextCount > 0) {
      this.livePresenceCountsByIdentifier.set(identifier, nextCount)
      return
    }

    this.livePresenceCountsByIdentifier.delete(identifier)
  }

  private getPresenceBroadcastIdentifiers(identifier: string) {
    const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
    if (!normalizedIdentifier) {
      return [] as string[]
    }

    const affectedIdentifiers = new Set<string>([normalizedIdentifier])
    const account = this.findAccount(normalizedIdentifier)
    if (account) {
      for (const ownerIdentifier of this.refreshDialogsForAccount(account)) {
        affectedIdentifiers.add(ownerIdentifier)
      }
    }

    for (const group of this.database.groups) {
      const participantIdentifiers = new Set<string>([
        normalizeStoredIdentifierReference(group.groupOwnerIdentifier ?? ''),
        normalizeStoredIdentifierReference(group.creatorIdentifier ?? ''),
        ...(group.participants ?? []).map((participant) => normalizeStoredIdentifierReference(participant.identifier ?? '')),
      ])
      if (participantIdentifiers.has(normalizedIdentifier)) {
        affectedIdentifiers.add(group.ownerIdentifier)
      }
    }

    return [...affectedIdentifiers]
  }

  private clearLivePresenceToken(
    token: string,
    identifierOverride?: string,
  ) {
    const normalizedIdentifier = normalizeStoredIdentifierReference(
      identifierOverride ?? this.getIdentifierByToken(token) ?? '',
    )
    const activeConnections = this.livePresenceConnectionsByToken.get(token) ?? 0
    if (!normalizedIdentifier || activeConnections <= 0) {
      return [] as string[]
    }

    if (activeConnections > 1) {
      this.livePresenceConnectionsByToken.set(token, activeConnections - 1)
      return []
    }

    const wasOnline = this.hasLivePresence(normalizedIdentifier)
    this.livePresenceConnectionsByToken.delete(token)
    this.decrementLivePresence(normalizedIdentifier)
    const isOnline = this.hasLivePresence(normalizedIdentifier)

    if (wasOnline === isOnline) {
      return []
    }

    return this.getPresenceBroadcastIdentifiers(normalizedIdentifier)
  }

  markSessionLive(token: string) {
    const normalizedIdentifier = normalizeStoredIdentifierReference(this.getIdentifierByToken(token) ?? '')
    if (!normalizedIdentifier) {
      return [] as string[]
    }

    const existingConnections = this.livePresenceConnectionsByToken.get(token) ?? 0
    if (existingConnections > 0) {
      this.livePresenceConnectionsByToken.set(token, existingConnections + 1)
      return []
    }

    const wasOnline = this.hasLivePresence(normalizedIdentifier)
    this.livePresenceConnectionsByToken.set(token, 1)
    this.incrementLivePresence(normalizedIdentifier)
    const isOnline = this.hasLivePresence(normalizedIdentifier)

    if (wasOnline === isOnline) {
      return []
    }

    return this.getPresenceBroadcastIdentifiers(normalizedIdentifier)
  }

  markSessionOffline(token: string) {
    return this.clearLivePresenceToken(token)
  }

  private dropLegacyGroupStorageState() {
    const archivedMediaBefore = this.database.archivedMedia.length
    this.database.archivedMedia = this.database.archivedMedia.filter(
      (item) => item.storageSubjectKind !== 'group',
    )
    return this.database.archivedMedia.length !== archivedMediaBefore
  }

  revokeSessionToken(token: string) {
    const normalizedIdentifier = normalizeStoredIdentifierReference(this.getIdentifierByToken(token) ?? '')
    const broadcastIdentifiers = new Set<string>(
      normalizedIdentifier ? this.clearLivePresenceToken(token, normalizedIdentifier) : [],
    )
    const hadSession = this.database.sessions.some((session) => session.token === token)
    if (!hadSession) {
      return {
        broadcastIdentifiers: [...broadcastIdentifiers],
        revokedTokens: [] as string[],
      } satisfies SessionRevocationResult
    }

    this.database.sessions = this.database.sessions.filter((session) => session.token !== token)
    if (normalizedIdentifier) {
      broadcastIdentifiers.add(normalizedIdentifier)
    }

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      revokedTokens: [token],
    } satisfies SessionRevocationResult
  }

  async logoutCurrentSession(token: string) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    // Presence contract:
    // logging out must immediately invalidate the current token and clear live online state instead
    // of waiting for retention cleanup of database.sessions.
    const revocation = this.revokeSessionToken(token)
    await this.persist()
    return {
      broadcastIdentifiers: [...new Set([...revocation.broadcastIdentifiers, account.identifier])],
      ok: true as const,
    }
  }

  static create(database: Database, persistDatabase: PersistDatabaseFn) {
    const store = new TinychokStore(database, persistDatabase)
    store.dropLegacyGroupStorageState()
    return store
  }

  static async load(dataFilePath = DEFAULT_DATA_FILE) {
    const { database, needsPersistenceRewrite } = await loadDatabaseFromFile(dataFilePath)
    const store = new TinychokStore(database, async (nextDatabase) =>
      persistDatabaseToFile(dataFilePath, nextDatabase),
    )

    const droppedLegacyGroupStorage = store.dropLegacyGroupStorageState()
    if (needsPersistenceRewrite || droppedLegacyGroupStorage) {
      await store.persist()
    }

    return store
  }

  async requestCode(
    identifier: string,
    options?: {
      entryPoint?: AuthEntrypoint
      flow?: AuthRequestCodeFlow
      ip?: string
    },
  ): Promise<RequestCodeResponse> {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const entryPoint = options?.entryPoint ?? 'user'
    const flow = options?.flow ?? 'default'
    const sanitizedIp = sanitizeIpAddress(options?.ip)

    if (!normalizedIdentifier || normalizedIdentifier.length < 12) {
      throw new Error('Проверь номер телефона.')
    }

    if (!isAllowedTestPhone(normalizedIdentifier)) {
      throw new Error(RESTRICTED_TEST_PHONE_MESSAGE)
    }

    const existingAccount = this.findAccount(normalizedIdentifier)
    if (entryPoint === 'admin' && !hasStaffAccess(existingAccount)) {
      throw new HttpError(403, ADMIN_STAFF_ONLY_MESSAGE)
    }

    if (entryPoint === 'user' && existingAccount && isAccountBlocked(existingAccount)) {
      return {
        existingAccount: buildExistingAccountPreview(existingAccount),
        hasPassword: hasAccountPassword(existingAccount),
        status: 'blocked',
      }
    }

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

    const didCleanupAuthCodeAttempts = this.cleanupExpiredAuthCodeSendAttempts()
    const authCodeRateLimitError = this.getAuthCodeSendRateLimitError(normalizedIdentifier, sanitizedIp)
    if (authCodeRateLimitError) {
      if (didCleanupAuthCodeAttempts) {
        await this.persist()
      }
      throw authCodeRateLimitError
    }

    this.database.authCodeSendAttempts.push({
      createdAt: new Date().toISOString(),
      entryPoint,
      flow,
      identifier: normalizedIdentifier,
      ip: sanitizedIp ?? undefined,
    })
    this.clearChallenge(normalizedIdentifier, purpose)
    this.database.authChallenges.push({
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

    if (this.isIdentifierBlockedByReports(normalizedIdentifier)) {
      throw new Error(CONTACT_REPORT_BLOCK_MESSAGE)
    }

    const existingAccount = this.findAccount(normalizedIdentifier)
    if (entryPoint === 'admin') {
      const challenge = this.assertValidChallenge(normalizedIdentifier, code, 'admin')

      if (!existingAccount || !hasStaffAccess(existingAccount)) {
        throw new HttpError(403, ADMIN_STAFF_ONLY_MESSAGE)
      }

      if (isAccountBlocked(existingAccount)) {
        throw new Error(existingAccount.blockedReason || 'Аккаунт заблокирован staff-командой.')
      }

      const token = await this.createSessionToken(normalizedIdentifier, {
        ip: options?.accessContext?.ip ?? '',
        source: 'verify-code',
        userAgent: options?.accessContext?.userAgent,
      })
      this.clearChallenge(normalizedIdentifier, challenge.purpose)
      await this.persist()

      return {
        snapshot: this.buildSnapshot(existingAccount, token),
        status: 'authenticated',
      }
    }

    const challenge = this.assertValidChallenge(normalizedIdentifier, code, [
      'registration',
      'password-reset',
      'password-setup',
    ])

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

    const challenge = this.assertValidChallenge(normalizedIdentifier, payload.code, 'registration')

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
      accountId: randomUUID(),
      avatarImage: undefined,
      archivedOriginalIdentifier: undefined,
      archivedProfile: undefined,
      blockedAt: undefined,
      blockedReason: undefined,
      blockedContactIds: [],
      createdAt: new Date().toISOString(),
      deletedAt: undefined,
      deletedBySelfService: undefined,
      deletionMode: undefined,
      publicDeleted: undefined,
      displayName,
      darkThemeEnabled: false,
      gifLibrary: [],
      identifier: normalizedIdentifier,
      invisibilityAutoEnabled: false,
      invisibilityEnabled: false,
      isTestEntity: false,
      lastActiveAt: new Date().toISOString(),
      nickname: '',
      passwordHash,
      passwordSetAt: new Date().toISOString(),
      premium: false,
      premiumExpiresAt: undefined,
      quietModeSettings: normalizeQuietModeSettings(undefined),
      soundsDisabled: true,
      staffRole: undefined,
      status: '',
      statusHistory: [],
      surname: '',
    }

    this.database.accounts.push(nextAccount)
    this.replaceOwnerState(normalizedIdentifier, createSeedState())
    const token = await this.createSessionToken(normalizedIdentifier, {
      ip: accessContext?.ip ?? '',
      source: 'register',
      userAgent: accessContext?.userAgent,
    })
    this.clearChallenge(normalizedIdentifier, challenge.purpose)
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
  ): Promise<{ broadcastIdentifiers: string[]; revokedTokens: string[]; snapshot: AppSnapshot }> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    const challenge = this.assertValidChallenge(normalizedIdentifier, payload.code, 'password-setup')
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
    const revocation = this.revokeSessionsForIdentifier(normalizedIdentifier)
    this.clearPasswordLoginAttempts(normalizedIdentifier)

    const token = await this.createSessionToken(normalizedIdentifier, {
      ip: accessContext?.ip ?? '',
      source: 'password-setup',
      userAgent: accessContext?.userAgent,
    })
    this.clearChallenge(normalizedIdentifier, challenge.purpose)
    await this.persist()
    return {
      broadcastIdentifiers: revocation.broadcastIdentifiers,
      revokedTokens: revocation.revokedTokens,
      snapshot: this.buildSnapshot(existingAccount, token),
    }
  }

  async resetPasswordAfterCode(
    payload: ResetPasswordBody,
    accessContext?: Omit<SessionAccessContext, 'source'>,
  ): Promise<{ broadcastIdentifiers: string[]; revokedTokens: string[]; snapshot: AppSnapshot }> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    const challenge = this.assertValidChallenge(normalizedIdentifier, payload.code, 'password-reset')
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
    const revocation = this.revokeSessionsForIdentifier(normalizedIdentifier)
    this.clearPasswordLoginAttempts(normalizedIdentifier)

    const token = await this.createSessionToken(normalizedIdentifier, {
      ip: accessContext?.ip ?? '',
      source: 'password-reset',
      userAgent: accessContext?.userAgent,
    })
    this.clearChallenge(normalizedIdentifier, challenge.purpose)
    await this.persist()
    return {
      broadcastIdentifiers: revocation.broadcastIdentifiers,
      revokedTokens: revocation.revokedTokens,
      snapshot: this.buildSnapshot(existingAccount, token),
    }
  }

  async changePassword(
    token: string,
    payload: { confirmPassword: string; currentPassword: string; password: string },
    accessContext?: Omit<SessionAccessContext, 'source'>,
  ): Promise<{ broadcastIdentifiers: string[]; revokedTokens: string[]; snapshot: AppSnapshot }> {
    const existingAccount = this.findAccountByToken(token)

    if (!existingAccount) {
      throw new Error('Сессия устарела. Войдите снова.')
    }

    if (!hasAccountPassword(existingAccount)) {
      throw new Error('Для этого аккаунта пароль ещё не задан. Подтвердите номер через SMS.')
    }

    const currentPassword = payload.currentPassword ?? ''
    const nextPassword = payload.password ?? ''
    assertValidPassword(nextPassword, payload.confirmPassword ?? '')

    const currentPasswordMatches = await verifyPassword(currentPassword, existingAccount.passwordHash!)
    if (!currentPasswordMatches) {
      throw new Error('Текущий пароль введён неверно.')
    }

    const isSamePassword = await verifyPassword(nextPassword, existingAccount.passwordHash!)
    if (isSamePassword) {
      throw new Error('Новый пароль должен отличаться от текущего.')
    }

    existingAccount.passwordHash = await hashPassword(nextPassword)
    existingAccount.passwordSetAt = new Date().toISOString()
    const revocation = this.revokeSessionsForIdentifier(existingAccount.identifier, {
      keepToken: token,
    })
    this.clearPasswordLoginAttempts(existingAccount.identifier)
    if (accessContext) {
      await this.recordIpAccessEvent(existingAccount.identifier, {
        ...accessContext,
        source: 'password-change',
      })
    }
    await this.persist()

    return {
      broadcastIdentifiers: revocation.broadcastIdentifiers,
      revokedTokens: revocation.revokedTokens,
      snapshot: this.buildSnapshot(existingAccount, token),
    }
  }

  async deleteAccountSelfService(token: string, payload: DeleteAccountBody): Promise<DeleteAccountResponse> {
    const existingAccount = this.findAccountByToken(token)

    if (!existingAccount) {
      throw new Error('Сессия устарела. Войдите снова.')
    }

    if (!hasAccountPassword(existingAccount)) {
      throw new Error('Для удаления аккаунта сначала задайте пароль.')
    }

    const currentPasswordMatches = await verifyPassword(payload.password ?? '', existingAccount.passwordHash!)
    if (!currentPasswordMatches) {
      throw new Error('Текущий пароль введён неверно.')
    }

    const liveIdentifier = existingAccount.identifier
    const deletedAccountLabel = buildAdminAuditAccountLabel(existingAccount)
    const archivedIdentifier = buildArchivedAccountIdentifier(existingAccount.accountId)
    const deletedAt = new Date().toISOString()
    const deletionMode: AccountDeletionMode = payload.deleteDataToo
      ? 'account-and-user-data-hidden'
      : 'account-only'

    this.revokeSessionsForIdentifier(liveIdentifier)
    this.clearPasswordLoginAttempts(liveIdentifier)
    this.clearChallenge(liveIdentifier)
    this.rewriteAccountIdentifierReferences(liveIdentifier, archivedIdentifier)
    const deletionImpact = this.applyOwnedEntityDeletionPolicy(archivedIdentifier, {
      archivedAt: deletedAt,
      deleteDataToo: Boolean(payload.deleteDataToo),
    })

    existingAccount.archivedOriginalIdentifier = normalizeIdentifier(liveIdentifier)
    existingAccount.archivedProfile = {
      avatarImage: existingAccount.avatarImage,
      displayName: existingAccount.displayName,
      nickname: normalizeNickname(existingAccount.nickname ?? '') || undefined,
      status: existingAccount.status?.trim() || undefined,
      surname: existingAccount.surname ?? '',
    }
    existingAccount.deletedAt = deletedAt
    existingAccount.deletedBySelfService = true
    existingAccount.deletionMode = deletionMode
    existingAccount.identifier = archivedIdentifier
    existingAccount.lastActiveAt = deletedAt
    existingAccount.publicDeleted = true
    existingAccount.displayName = 'Аккаунт удалён'
    existingAccount.surname = ''
    existingAccount.nickname = ''
    existingAccount.avatarImage = undefined
    existingAccount.status = ''
    this.refreshDialogsForAccount(existingAccount)

    await this.appendSystemAuditLog({
      action: 'user.account.delete.self-service',
      nextValue: {
        ...deletionImpact,
        archivedIdentifier,
        deleteDataToo: Boolean(payload.deleteDataToo),
        deletedAt,
        originalIdentifier: existingAccount.archivedOriginalIdentifier,
      },
      summary: `Пользователь ${deletedAccountLabel} удалил аккаунт через настройки`,
      targetId: existingAccount.accountId,
      targetType: 'user-self-service',
    })

    await this.persist()
    return {
      ...deletionImpact,
      success: true,
    }
  }

  getSnapshotByToken(token: string) {
    const account = this.findAccountByToken(token)
    return account ? this.buildSnapshot(account, token) : null
  }

  getRealtimeSnapshotByIdentifier(identifier: string) {
    const account = this.findAccount(identifier)
    return account ? this.buildSnapshot(account, '') : null
  }

  async recordSessionAccessByToken(token: string, context: SessionAccessContext) {
    const account = this.findAccountByToken(token)
    if (!account) {
      return false
    }

    const now = Date.now()
    const lastActiveAt = parseIsoDate(account.lastActiveAt)
    const shouldRefreshLastActiveAt =
      lastActiveAt === null || now - lastActiveAt >= SESSION_LAST_ACTIVE_TOUCH_THROTTLE_MS

    if (shouldRefreshLastActiveAt) {
      // Admin "Последняя активность" must move on ordinary API / websocket traffic too,
      // not only on fresh logins, otherwise restored sessions look stale in moderation UI.
      account.lastActiveAt = new Date(now).toISOString()
    }

    const recordedIpEvent = await this.recordIpAccessEvent(account.identifier, context)
    if (!recordedIpEvent && shouldRefreshLastActiveAt) {
      await this.persist()
    }

    return recordedIpEvent || shouldRefreshLastActiveAt
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

    const persistedDialog = this.findDialog(account.identifier, dialogId)
    if (!persistedDialog) {
      throw new Error('Чат не найден.')
    }

    const directPeer = findAccountByStoredIdentifier(this.database, persistedDialog.phone)
    if ((directPeer && isPublicDeletedAccount(directPeer)) || isArchivedIdentifier(persistedDialog.phone)) {
      return {
        dialogId,
        hasMore: false,
        messages: [],
      }
    }

    const chat = materializeFullChats(
      this.database,
      this.livePresenceCountsByIdentifier,
      account.identifier,
      { includeHidden: true },
    ).find(
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

    const group = materializeFullGroups(
      this.database,
      this.livePresenceCountsByIdentifier,
      account.identifier,
    ).find(
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

    const channel = materializeFullSubscriptionChannels(
      this.database,
      this.livePresenceCountsByIdentifier,
      account.identifier,
    ).find(
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

  getSubscriptionChannelPreviewByHandle(
    token: string,
    handle: string,
  ): SubscriptionChannelPreviewResponse {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    if (!normalizedHandle) {
      throw new Error('Канал не найден.')
    }

    const sourceChannel = this.findManagedChannelByHandle(normalizedHandle)
    if (!sourceChannel) {
      throw new HttpError(403, 'Доступ к каналу не разрешён.')
    }

    if (
      sourceChannel.archiveReason === 'owner-deleted' &&
      this.canAccessDeletedChannelTombstone(sourceChannel, account.identifier)
    ) {
      return {
        channel: this.buildDeletedChannelTombstonePreview(account.identifier, sourceChannel),
      }
    }

    if (sourceChannel.archivedAt) {
      throw new HttpError(403, 'Доступ к каналу не разрешён.')
    }

    if (!this.canAccessChannelPreview(sourceChannel, account.identifier)) {
      throw new HttpError(403, 'Доступ к каналу не разрешён.')
    }

    return {
      channel: materializeSubscriptionChannelPreview(
        this.database,
        this.livePresenceCountsByIdentifier,
        account.identifier,
        sourceChannel,
      ),
    }
  }

  async subscribeToChannelByHandle(
    token: string,
    handle: string,
  ): Promise<MutationResult & { channelId: number }> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    if (!normalizedHandle) {
      throw new Error('Канал не найден.')
    }

    const sourceChannel = this.findManagedChannelByHandle(normalizedHandle)
    if (!sourceChannel || !this.canAccessChannelPreview(sourceChannel, account.identifier)) {
      throw new HttpError(403, 'Доступ к каналу не разрешён.')
    }

    if (sourceChannel.archiveReason === 'owner-deleted') {
      throw new HttpError(403, 'Канал удалён владельцем.')
    }

    if (sourceChannel.archivedAt) {
      throw new Error('Канал находится в архиве.')
    }

    this.ensureManagedChannelOwnerSubscriptionCopy(sourceChannel)
    const channelCopy = this.ensureSubscriptionChannelCopyForOwner(sourceChannel, account.identifier)
    this.clearPendingChannelInvitation(sourceChannel.directLink, account.identifier)

    const broadcastIdentifiers = new Set<string>([account.identifier, sourceChannel.ownerIdentifier])
    for (const subscriptionCopy of this.syncManagedChannelSubscriptionCopies(sourceChannel)) {
      broadcastIdentifiers.add(subscriptionCopy.ownerIdentifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      channelId: channelCopy.id,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async joinGroupBySharedId(
    token: string,
    sharedId: string,
  ): Promise<MutationResult & { groupId: number }> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedSharedId = sharedId.trim()
    if (!normalizedSharedId) {
      throw new HttpError(403, 'Доступ к группе не разрешён.')
    }

    const groupCopiesForJoin = this.listGroupCopies(normalizedSharedId)
    const activeGroupCopies = groupCopiesForJoin.filter((group) => !isArchivedGroup(group))
    const canonicalOwnerIdentifier =
      normalizeStoredIdentifierReference(
        activeGroupCopies[0]?.groupOwnerIdentifier ??
        activeGroupCopies[0]?.creatorIdentifier ??
        activeGroupCopies[0]?.ownerIdentifier ??
        '',
      ) || ''
    const existingGroup =
      activeGroupCopies.find((group) => group.ownerIdentifier === canonicalOwnerIdentifier) ??
      activeGroupCopies[0] ??
      groupCopiesForJoin[0] ??
      null
    if (!existingGroup) {
      throw new HttpError(403, 'Доступ к группе не разрешён.')
    }

    const currentCopy = this.listGroupCopies(normalizedSharedId).find(
      (group) => group.ownerIdentifier === account.identifier,
    )
    if (currentCopy) {
      const repairedPendingInvitation = this.hasPendingGroupInvitation(normalizedSharedId, account.identifier)
      if (repairedPendingInvitation) {
        const participantAccount = this.findAccount(account.identifier)
        const authoritativeParticipants = this.buildAuthoritativeGroupParticipants(normalizedSharedId)
        const nextParticipants =
          participantAccount &&
          !authoritativeParticipants.some(
            (participant) => normalizeIdentifier(participant.identifier ?? '') === participantAccount.identifier,
          )
            ? authoritativeParticipants
                .map((participant) => this.cloneGroupParticipant(participant))
                .concat(this.buildGroupParticipant(participantAccount))
            : authoritativeParticipants.map((participant) => this.cloneGroupParticipant(participant))

        if (nextParticipants.length > 0) {
          this.syncGroupCopiesParticipants(normalizedSharedId, nextParticipants)
        }

        this.clearPendingGroupInvitation(normalizedSharedId, account.identifier)
        if (
          participantAccount &&
          !participantAccount.quietModeEnabled &&
          !this.hasGroupSystemEventForActor(normalizedSharedId, 'member-joined', participantAccount.identifier)
        ) {
          // Defensive repair for invite-accept edge cases:
          // if a participant copy exists while the invitation is still pending,
          // treat this as an incomplete join finalization and emit the missing join event.
          this.appendGroupSystemEvent(normalizedSharedId, {
            actor: this.buildGroupSystemEventActor(participantAccount),
            kind: 'member-joined',
          })
        }

        await this.persist()

        return {
          broadcastIdentifiers: [...new Set(
            this.listGroupCopies(normalizedSharedId).map((group) => group.ownerIdentifier),
          )],
          groupId: currentCopy.id,
          snapshot: this.buildSnapshot(account, token),
        }
      }

      return {
        broadcastIdentifiers: [account.identifier],
        groupId: currentCopy.id,
        snapshot: this.buildSnapshot(account, token),
      }
    }

    if (isArchivedGroup(existingGroup)) {
      throw new HttpError(403, 'Доступ к группе не разрешён.')
    }

    if (!this.hasPendingGroupInvitation(normalizedSharedId, account.identifier)) {
      throw new HttpError(403, 'Доступ к группе не разрешён.')
    }

    const participantAccount = this.findAccount(account.identifier)
    if (!participantAccount) {
      throw new Error('Аккаунт не найден.')
    }

    const authoritativeParticipants = this.buildAuthoritativeGroupParticipants(normalizedSharedId)
    const ownerIdentifier = normalizeIdentifier(
      existingGroup.groupOwnerIdentifier ?? existingGroup.creatorIdentifier ?? existingGroup.ownerIdentifier,
    )
    const ownerAccount = this.findAccount(ownerIdentifier) ?? participantAccount
    const memberLimit = getGroupMemberLimit(ownerAccount)
    if (authoritativeParticipants.length + 1 > memberLimit) {
      throw new Error(
        memberLimit === premiumGroupMemberLimit
          ? `Даже с премиумом владельца в группе может быть максимум ${premiumGroupMemberLimit} человек.`
          : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать больше людей, необходимо активировать премиум владельцу группы.`,
      )
    }

    const nextParticipants = authoritativeParticipants.some(
      (participant) => normalizeIdentifier(participant.identifier ?? '') === account.identifier,
    )
      ? authoritativeParticipants.map((participant) => this.cloneGroupParticipant(participant))
      : authoritativeParticipants
        .map((participant) => this.cloneGroupParticipant(participant))
        .concat(this.buildGroupParticipant(participantAccount))

    const groupCopy = this.ensureGroupCopyForOwner(existingGroup, account.identifier, nextParticipants)
    this.syncGroupCopiesParticipants(normalizedSharedId, nextParticipants)
    if (existingGroup.showHistoryToNewMembers !== false) {
      // Group history visibility for newly joined members is decided at join time.
      // When enabled, we backfill the existing message log into the new owner copy;
      // when disabled, the newcomer starts from an empty visible history.
      this.seedGroupHistoryForOwnerCopy(existingGroup, groupCopy)
    } else {
      groupCopy.preview = 'Можно начинать обсуждение.'
      groupCopy.time = formatNowTime()
      groupCopy.unread = 0
    }
    this.clearPendingGroupInvitation(normalizedSharedId, account.identifier)
    if (!participantAccount.quietModeEnabled) {
      this.appendGroupSystemEvent(normalizedSharedId, {
        actor: this.buildGroupSystemEventActor(participantAccount),
        kind: 'member-joined',
      })
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(
        this.listGroupCopies(normalizedSharedId).map((group) => group.ownerIdentifier),
      )],
      groupId: groupCopy.id,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  getIdentifierByToken(token: string) {
    return this.getActiveSessionRecord(token)?.identifier ?? null
  }

  listTokensByIdentifier(identifier: string) {
    return this.database.sessions
      .filter(
        (session) =>
          session.identifier === identifier &&
          this.getActiveSessionRecord(session.token)?.token === session.token,
      )
      .map((session) => session.token)
  }

  private cleanupExpiredAuthCodeSendAttempts(now = Date.now()) {
    const cutoffTimestamp = now - AUTH_CODE_DAILY_WINDOW_MS
    const nextAttempts = this.database.authCodeSendAttempts.filter((attempt) => {
      const createdAt = parseIsoDate(attempt.createdAt)
      return createdAt !== null && createdAt >= cutoffTimestamp
    })

    if (nextAttempts.length === this.database.authCodeSendAttempts.length) {
      return false
    }

    this.database.authCodeSendAttempts = nextAttempts
    return true
  }

  private getAuthCodeSendRateLimitError(identifier: string, ip?: string | null, now = Date.now()) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!normalizedIdentifier) {
      return null
    }

    const sanitizedIp = sanitizeIpAddress(ip ?? undefined)
    const hourlyCutoffTimestamp = now - AUTH_CODE_HOURLY_WINDOW_MS
    const dailyCutoffTimestamp = now - AUTH_CODE_DAILY_WINDOW_MS
    let latestIdentifierAttemptTimestamp: number | null = null
    let identifierHourlyCount = 0
    let identifierDailyCount = 0
    let ipHourlyCount = 0
    let ipDailyCount = 0
    let globalDailyCount = 0

    for (const attempt of this.database.authCodeSendAttempts) {
      const createdAt = parseIsoDate(attempt.createdAt)
      if (createdAt === null || createdAt < dailyCutoffTimestamp) {
        continue
      }

      globalDailyCount += 1

      if (attempt.identifier === normalizedIdentifier) {
        identifierDailyCount += 1
        if (createdAt >= hourlyCutoffTimestamp) {
          identifierHourlyCount += 1
        }
        if (latestIdentifierAttemptTimestamp === null || createdAt > latestIdentifierAttemptTimestamp) {
          latestIdentifierAttemptTimestamp = createdAt
        }
      }

      if (sanitizedIp && attempt.ip === sanitizedIp) {
        ipDailyCount += 1
        if (createdAt >= hourlyCutoffTimestamp) {
          ipHourlyCount += 1
        }
      }
    }

    if (
      latestIdentifierAttemptTimestamp !== null &&
      now - latestIdentifierAttemptTimestamp < authCodeIdentifierCooldownMs
    ) {
      return new HttpError(429, AUTH_CODE_COOLDOWN_MESSAGE)
    }

    if (
      identifierHourlyCount >= authRequestCodeLimits.identifierHourlyLimit ||
      identifierDailyCount >= authRequestCodeLimits.identifierDailyLimit ||
      globalDailyCount >= authRequestCodeLimits.globalDailyLimit
    ) {
      return new HttpError(429, AUTH_CODE_RATE_LIMITED_MESSAGE)
    }

    if (
      sanitizedIp &&
      (ipHourlyCount >= authRequestCodeLimits.ipHourlyLimit ||
        ipDailyCount >= authRequestCodeLimits.ipDailyLimit)
    ) {
      return new HttpError(429, AUTH_CODE_RATE_LIMITED_MESSAGE)
    }

    return null
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

  private revokeSessionsForIdentifier(
    identifier: string,
    options?: {
      keepToken?: string
    },
  ): SessionRevocationResult {
    const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
    if (!normalizedIdentifier) {
      return {
        broadcastIdentifiers: [],
        revokedTokens: [],
      }
    }

    const revokedTokens = this.database.sessions
      .filter(
        (session) =>
          session.identifier === normalizedIdentifier &&
          (!options?.keepToken || session.token !== options.keepToken),
      )
      .map((session) => session.token)
    const broadcastIdentifiers = new Set<string>()
    for (const token of revokedTokens) {
      for (const affectedIdentifier of this.clearLivePresenceToken(token, normalizedIdentifier)) {
        broadcastIdentifiers.add(affectedIdentifier)
      }
    }
    this.database.sessions = this.database.sessions.filter(
      (session) =>
        session.identifier !== normalizedIdentifier ||
        (options?.keepToken ? session.token === options.keepToken : false),
    )

    if (revokedTokens.length > 0) {
      broadcastIdentifiers.add(normalizedIdentifier)
    }

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      revokedTokens,
    }
  }

  private rewriteAccountIdentifierReferences(
    liveIdentifier: string,
    archivedIdentifier: string,
  ) {
    const nextGroupThreadId = (threadId: string | undefined) =>
      threadId?.replaceAll(`group:${liveIdentifier}:`, `group:${archivedIdentifier}:`)

    for (const entry of this.database.adminAuditLogs) {
      if (entry.actorIdentifier === liveIdentifier) {
        entry.actorIdentifier = archivedIdentifier
      }

      if (entry.targetType === 'user' && entry.targetId === liveIdentifier) {
        entry.targetId = archivedIdentifier
      }
    }

    for (const report of this.database.adminReports) {
      if (report.reporterIdentifier === liveIdentifier) {
        report.reporterIdentifier = archivedIdentifier
      }
      if (report.entityOwnerIdentifier === liveIdentifier) {
        report.entityOwnerIdentifier = archivedIdentifier
      }
      if (report.relatedUserIdentifier === liveIdentifier) {
        report.relatedUserIdentifier = archivedIdentifier
      }
    }

    this.database.authChallenges = this.database.authChallenges.filter(
      (challenge) => challenge.identifier !== liveIdentifier,
    )
    this.database.passwordAuthAttempts = this.database.passwordAuthAttempts.filter(
      (attempt) => attempt.identifier !== liveIdentifier,
    )
    this.revokeSessionsForIdentifier(liveIdentifier)

    for (const report of this.database.contactReports) {
      if (report.reporterIdentifier === liveIdentifier) {
        report.reporterIdentifier = archivedIdentifier
      }
      if (report.targetIdentifier === liveIdentifier) {
        report.targetIdentifier = archivedIdentifier
      }
    }

    for (const dialog of this.database.dialogs) {
      if (dialog.ownerIdentifier === liveIdentifier) {
        dialog.ownerIdentifier = archivedIdentifier
      }
      if (normalizeStoredIdentifierReference(dialog.phone) === liveIdentifier) {
        dialog.phone = archivedIdentifier
      }
    }

    for (const message of this.database.dialogMessages) {
      if (message.ownerIdentifier === liveIdentifier) {
        message.ownerIdentifier = archivedIdentifier
      }
    }

    for (const group of this.database.groups) {
      if (group.ownerIdentifier === liveIdentifier) {
        group.ownerIdentifier = archivedIdentifier
      }
      if (normalizeStoredIdentifierReference(group.groupOwnerIdentifier ?? '') === liveIdentifier) {
        group.groupOwnerIdentifier = archivedIdentifier
      }
      if (resolveStoredIdentifierReference(group.creatorIdentifier, group.ownerIdentifier) === liveIdentifier) {
        group.creatorIdentifier = archivedIdentifier
      }
      if (group.sharedId?.trim() === `${liveIdentifier}:${group.id}`) {
        group.sharedId = `${archivedIdentifier}:${group.id}`
      }
      group.commentBlacklistIdentifiers = (group.commentBlacklistIdentifiers ?? []).map((identifier) =>
        normalizeStoredIdentifierReference(identifier) === liveIdentifier ? archivedIdentifier : identifier,
      )
      group.participants = (group.participants ?? []).map((participant) => ({
        ...participant,
        identifier:
          normalizeStoredIdentifierReference(participant.identifier ?? '') === liveIdentifier
            ? archivedIdentifier
            : participant.identifier,
      }))
    }

    for (const message of this.database.groupMessages) {
      if (message.ownerIdentifier === liveIdentifier) {
        message.ownerIdentifier = archivedIdentifier
      }
      if (message.threadId) {
        message.threadId = nextGroupThreadId(message.threadId)
      }
      message.threadComments = compactThreadComments(message.threadComments).map((comment) => ({
        ...comment,
        authorIdentifier:
          normalizeStoredIdentifierReference(comment.authorIdentifier ?? '') === liveIdentifier
            ? archivedIdentifier
            : comment.authorIdentifier,
      }))
    }

    for (const channel of this.database.managedChannels) {
      if (channel.ownerIdentifier === liveIdentifier) {
        channel.ownerIdentifier = archivedIdentifier
      }
      channel.commentBlacklistIdentifiers = (channel.commentBlacklistIdentifiers ?? []).map((identifier) =>
        normalizeStoredIdentifierReference(identifier) === liveIdentifier ? archivedIdentifier : identifier,
      )
    }

    for (const entry of this.database.ipAccessLogs) {
      if (entry.identifier === liveIdentifier) {
        entry.identifier = archivedIdentifier
      }
    }

    for (const upload of this.database.pendingMediaUploads) {
      if (upload.ownerIdentifier === liveIdentifier) {
        upload.ownerIdentifier = archivedIdentifier
      }
    }

    for (const report of this.database.subscriptionChannelReports) {
      if (report.reporterIdentifier === liveIdentifier) {
        report.reporterIdentifier = archivedIdentifier
      }
    }

    for (const channel of this.database.subscriptionChannels) {
      if (channel.ownerIdentifier === liveIdentifier) {
        channel.ownerIdentifier = archivedIdentifier
      }
      channel.commentBlacklistIdentifiers = (channel.commentBlacklistIdentifiers ?? []).map((identifier) =>
        normalizeStoredIdentifierReference(identifier) === liveIdentifier ? archivedIdentifier : identifier,
      )
      channel.participants = (channel.participants ?? []).map((participant) => ({
        ...participant,
        identifier:
          normalizeStoredIdentifierReference(participant.identifier ?? '') === liveIdentifier
            ? archivedIdentifier
            : participant.identifier,
      }))
    }

    for (const post of this.database.subscriptionPosts) {
      if (post.ownerIdentifier === liveIdentifier) {
        post.ownerIdentifier = archivedIdentifier
      }
      if (post.threadId) {
        post.threadId = post.threadId.replaceAll(
          `channel:${liveIdentifier}:`,
          `channel:${archivedIdentifier}:`,
        )
      }
      post.threadComments = compactThreadComments(post.threadComments).map((comment) => ({
        ...comment,
        authorIdentifier:
          normalizeStoredIdentifierReference(comment.authorIdentifier ?? '') === liveIdentifier
            ? archivedIdentifier
            : comment.authorIdentifier,
      }))
    }

    for (const state of this.database.threadStates) {
      if (state.ownerIdentifier === liveIdentifier) {
        state.ownerIdentifier = archivedIdentifier
      }
      if (state.threadId) {
        state.threadId = state.threadId
          .replaceAll(`group:${liveIdentifier}:`, `group:${archivedIdentifier}:`)
          .replaceAll(`channel:${liveIdentifier}:`, `channel:${archivedIdentifier}:`)
      }
    }
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
    // Search must exclude only currently visible direct dialogs.
    // Hidden former-contact dialogs stay searchable so users can reopen the room
    // and restart the contact-request flow against preserved per-side history.
    const existingDialogPhones = new Set(
      this.database.dialogs
        .filter((dialog) => dialog.ownerIdentifier === account.identifier && !dialog.hidden)
        .map((dialog) => normalizeStoredIdentifierReference(dialog.phone)),
    )

    return this.database.accounts
      .filter((candidate) => !candidate.deletedAt && candidate.identifier !== account.identifier)
      .filter((candidate) => {
        const candidateDigits = (getAccountOriginalIdentifier(candidate) || '').replace(/[^\d]/g, '')
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
        phone: getAccountOriginalIdentifier(candidate) || candidate.identifier,
        subtitle: buildSearchSubtitle(candidate),
        title: formatAccountName(candidate) || getAccountOriginalIdentifier(candidate) || candidate.identifier,
      }))
  }

  searchSubscriptionChannels(token: string, query: string) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return [] as ChannelSearchResult[]
    }

    const normalizedQuery = trimmedQuery.toLowerCase()
    const normalizedHandleQuery = normalizeChannelHandleForComparison(trimmedQuery)

    // Channel discovery is intentionally sourced from managed channels, not the viewer's
    // current subscription copies, so leaving a channel does not erase the ability to
    // find it again via search when preview access is still valid.
    return this.database.managedChannels
      .filter((channel) => {
        if (channel.archiveReason === 'owner-deleted') {
          return this.canAccessDeletedChannelTombstone(channel, account.identifier)
        }
        // Channel discovery must not depend on a current subscription copy:
        // after self-unsubscribe the channel stays searchable while preview access still exists.
        return !channel.archivedAt && this.canAccessChannelPreview(channel, account.identifier)
      })
      .filter((channel) => {
        const title = channel.title.toLowerCase()
        const handle = (sanitizeChannelDirectLink(channel.directLink) || channel.directLink).toLowerCase()
        const statusText = (channel.statusText?.trim() || '').toLowerCase()
        const description = (channel.description?.trim() || '').toLowerCase()

        return (
          title.includes(normalizedQuery) ||
          handle.includes(normalizedQuery) ||
          statusText.includes(normalizedQuery) ||
          description.includes(normalizedQuery)
        )
      })
      .sort((left, right) => {
        const leftHandle = normalizeChannelHandleForComparison(left.directLink)
        const rightHandle = normalizeChannelHandleForComparison(right.directLink)
        const leftExactHandle = normalizedHandleQuery !== '' && leftHandle === normalizedHandleQuery
        const rightExactHandle = normalizedHandleQuery !== '' && rightHandle === normalizedHandleQuery
        if (leftExactHandle !== rightExactHandle) {
          return leftExactHandle ? -1 : 1
        }

        const leftExactTitle = left.title.trim().toLowerCase() === normalizedQuery
        const rightExactTitle = right.title.trim().toLowerCase() === normalizedQuery
        if (leftExactTitle !== rightExactTitle) {
          return leftExactTitle ? -1 : 1
        }

        return left.title.localeCompare(right.title, 'ru')
      })
      .slice(0, 20)
      .map((channel) => ({
        accent: channel.avatarTone,
        archivedAt: channel.archivedAt,
        avatarImage: channel.avatarImage,
        description: channel.description?.trim() || undefined,
        handle: sanitizeChannelDirectLink(channel.directLink) || channel.directLink,
        id: channel.id,
        muted: false,
        statusText: channel.statusText?.trim() || undefined,
        title: channel.archiveReason === 'owner-deleted' ? 'Канал удалён владельцем' : channel.title,
        unread: 0,
        visibility: channel.visibility,
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

        const adminVisible = getAdminVisibleAccount(account)
        const displayLabel = (
          formatAccountName({
            displayName: adminVisible.displayName,
            surname: adminVisible.surname,
          }) || account.identifier
        ).toLowerCase()
        const nickname = normalizeNickname(adminVisible.nickname ?? '').toLowerCase()
        const accountDigits = (getAccountOriginalIdentifier(account) || '').replace(/[^\d]/g, '')

        return (
          account.identifier === trimmedQuery ||
          getAccountOriginalIdentifier(account) === normalizedIdentifier ||
          (digitsQuery !== '' && accountDigits.includes(digitsQuery)) ||
          displayLabel.includes(normalizedQuery) ||
          nickname.includes(normalizedQuery)
        )
      })
      .sort((left, right) => {
        const activeDelta = Number(Boolean(left.deletedAt)) - Number(Boolean(right.deletedAt))
        if (activeDelta !== 0) {
          return activeDelta
        }

        const blockedDelta = Number(isAccountBlocked(right)) - Number(isAccountBlocked(left))
        if (blockedDelta !== 0) {
          return blockedDelta
        }

        return compareIsoDateDesc(left.lastActiveAt, right.lastActiveAt)
      })
      // Admin user search should show one row per real phone identity by default.
      // A deleted self-service archived account can legitimately coexist with a newer
      // active re-registered account that has the same original phone number.
      // Returning both rows in the normal user list looks like a duplicate live account.
      .filter((account, index, accounts) => {
        const originalIdentifier = getAccountOriginalIdentifier(account) || account.identifier
        return (
          accounts.findIndex((candidate) => {
            const candidateOriginalIdentifier =
              getAccountOriginalIdentifier(candidate) || candidate.identifier
            return candidateOriginalIdentifier === originalIdentifier
          }) === index
        )
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
      statusHistory: getAccountStatusHistory(account),
      user: this.buildAdminUserSummary(account),
    }
  }

  async adminExportUserStatusHistoryCsv(actorToken: string, identifier: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const account = this.findAccountForAdmin(identifier)
    if (!account) {
      throw new Error('Пользователь не найден.')
    }

    const rows = getAccountStatusHistory(account)
    const fileName = `user-status-history-${
      sanitizeExportFileName(account.displayName) || account.identifier
    }-${formatExportDateStamp()}.csv`

    await this.appendAdminAuditLog(actor, {
      action: 'admin.user.status-history.export.csv',
      nextValue: {
        fileName,
        rowCount: rows.length,
      },
      summary: `Экспортирована история статусов пользователя ${buildAdminAuditAccountLabel(account)}`,
      targetId: account.identifier,
      targetType: 'user',
    })

    return {
      csv: buildCsv([
        ['Когда установлен', 'Статус', 'Текущий'],
        ...rows.map((entry, index) => [
          entry.setAt,
          entry.status,
          index === rows.length - 1 && account.status?.trim() === entry.status ? 'Да' : 'Нет',
        ]),
      ]),
      fileName,
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
      this.revokeSessionsForIdentifier(target.identifier)
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
    const previousStorageQuotaBytes = getEffectiveUserStorageQuotaBytes(target)
    const durationDays =
      Number.isInteger(options.durationDays) && (options.durationDays ?? 0) > 0
        ? options.durationDays ?? 30
        : 30
    if (options.enabled || hasPremiumStorageHistory(target)) {
      rememberUnlockedPremiumStorageQuota(target)
    }
    target.premium = options.enabled
    target.premiumExpiresAt = options.enabled
      ? extendPremiumExpiry(durationDays, target.premiumExpiresAt)
      : ''
    if (getEffectiveUserStorageQuotaBytes(target) > previousStorageQuotaBytes) {
      this.restoreArchivedMediaIntoPrimaryStorageIfQuotaAllows(this.getUserStorageSubject(target.identifier))
    }
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
          archiveStorageUsage: this.getArchiveStorageUsage(this.getChannelStorageSubjectByHandle(handle)),
          archiveUnlimited: Boolean(channel.archiveUnlimited),
          archivedAt: channel.archivedAt,
          archiveReason: channel.archiveReason,
          csvFileName: `channel-${sanitizeExportFileName(channel.title) || channel.id}-${formatExportDateStamp()}.csv`,
          handle,
          id: channel.id,
          latestActivityAt,
          owner: buildAdminLinkedUser(channel.ownerIdentifier),
          postsCount: uniquePosts.length,
          readers: new Set(copies.map((item) => item.ownerIdentifier)).size,
          relatedReportCount: reportCountByHandle.get(handle) ?? 0,
          status: channel.status,
          storageUsage: this.getStorageSubjectUsage(this.getChannelStorageSubjectByHandle(handle)),
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
        const creatorIdentifier =
          resolveStoredIdentifierReference(primaryGroup.creatorIdentifier ?? '', primaryGroup.ownerIdentifier) ||
          primaryGroup.ownerIdentifier
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

        const owner = patchArchivedGroupOwnerSummary(buildAdminLinkedUser(ownerIdentifier), primaryGroup.title)
        const creator = patchArchivedGroupOwnerSummary(buildAdminLinkedUser(creatorIdentifier), primaryGroup.title)

        return {
          archivedAt: primaryGroup.archivedAt,
          archiveReason: primaryGroup.archiveReason,
          creator,
          csvFileName: `group-${sanitizeExportFileName(primaryGroup.title) || 'group'}-${formatExportDateStamp()}.csv`,
          id: groupKey,
          latestActivityAt,
          members: Math.max(...copies.map((group) => group.members), 0),
          owner,
          relatedReportCount: copies.reduce((count, group) => {
            const sharedId = group.sharedId?.trim()
            return count + (sharedId ? reportCountBySharedId.get(sharedId) ?? 0 : 0)
          }, 0),
          sharedId: this.getSharedGroupId(primaryGroup),
          title: primaryGroup.title,
        }
      })
      .filter((group): group is AdminManagedGroupSummary => Boolean(group))
      .map((group) => ({
        group,
        searchRank: getAdminGroupSearchRank(group, trimmedQuery),
      }))
      .filter(({ searchRank }) => !trimmedQuery || Number.isFinite(searchRank))
      .sort((left, right) => {
        if (trimmedQuery && left.searchRank !== right.searchRank) {
          return left.searchRank - right.searchRank
        }
        return compareIsoDateDesc(left.group.latestActivityAt, right.group.latestActivityAt)
      })
      .map(({ group }) => group)

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
        resolveStoredIdentifierReference(
          group.participants.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
          resolveStoredIdentifierReference(group.creatorIdentifier ?? '', message.ownerIdentifier),
        )

      upsertThread({
        archiveReason: message.threadArchiveReason,
        archivedAt: message.threadArchivedAt,
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
        archiveReason: post.threadArchiveReason,
        archivedAt: post.threadArchivedAt,
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

  adminListSupportTickets(query: string) {
    const trimmedQuery = query.trim().toLowerCase()

    return this.database.supportTickets
      .map((ticket) => this.buildAdminSupportTicketSummary(ticket))
      .filter((ticket) => {
        if (!trimmedQuery) return true
        return (
          ticket.rootText.toLowerCase().includes(trimmedQuery) ||
          String(ticket.ticketNumber).includes(trimmedQuery) ||
          ticket.owner.displayName.toLowerCase().includes(trimmedQuery) ||
          ticket.owner.identifier.toLowerCase().includes(trimmedQuery)
        )
      })
      .sort((left, right) => {
        const statusDelta = getAdminSupportTicketStatusSortOrder(left.status) - getAdminSupportTicketStatusSortOrder(right.status)
        if (statusDelta !== 0) {
          return statusDelta
        }

        return compareIsoDateDesc(left.latestActivityAt, right.latestActivityAt)
      })
      .slice(0, 50)
  }

  async adminGetSupportTicket(
    actorToken: string,
    ticketId: number,
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const ticket = this.findSupportTicketById(ticketId)
    if (!ticket) {
      throw new Error('Тикет поддержки не найден.')
    }

    if (!ticket.openedByStaffAt && ticket.status === 'open') {
      ticket.openedByStaffAt = new Date().toISOString()
      await this.persist()
    }

    await this.appendAdminAuditLog(actor, {
      action: 'admin.support.view',
      summary: `Открыт тикет поддержки #${ticket.id}`,
      targetId: String(ticket.id),
      targetType: 'support-ticket',
    })

    return {
      ...this.buildAdminSupportTicketSummary(ticket),
      attachment: ticket.attachment,
      comments: compactThreadComments(ticket.comments),
      threadId: ticket.threadId,
      time: ticket.time,
    } satisfies AdminSupportTicketDetailResponse['ticket']
  }

  async adminReplySupportTicket(
    actorToken: string,
    ticketId: number,
    payload: AdminSupportTicketReplyBody,
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const ticket = this.findSupportTicketById(ticketId)
    if (!ticket) {
      throw new Error('Тикет поддержки не найден.')
    }

    const text = sanitizeThreadCommentText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(actor.identifier, payload.attachment)
    const status = sanitizeSupportTicketStatus(payload.status)
    if (!text && !attachment) {
      throw new Error('Ответ поддержки не может быть пустым.')
    }
    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    if (this.hasExistingSupportCommentDeliveryId(ticket, actor.identifier, normalizedClientDeliveryId)) {
      return {
        broadcastIdentifiers: [],
        ticket: {
          ...this.buildAdminSupportTicketSummary(ticket),
          attachment: ticket.attachment,
          comments: compactThreadComments(ticket.comments),
          threadId: ticket.threadId,
          time: ticket.time,
        } satisfies AdminSupportTicketDetailResponse['ticket'],
      }
    }

    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getUserStorageSubject(actor.identifier),
        attachment.size,
        attachment.mediaUrl,
      )
    }

    // Staff replies stay inside the ticket thread so support never behaves like a regular dialog.
    this.appendCommentToSupportTicket(
      ticket,
      actor,
      text,
      attachment,
      sanitizeReplyTarget(payload.replyTo),
      normalizedClientDeliveryId,
    )
    ticket.status = status

    await this.persist()
    this.markAttachmentUploadLinked(attachment)
    await this.appendAdminAuditLog(actor, {
      action: 'admin.support.reply',
      summary: `Добавлен комментарий к тикету поддержки #${ticket.id} · статус ${status}`,
      targetId: String(ticket.id),
      targetType: 'support-ticket',
    })

    return {
      broadcastIdentifiers: [ticket.ownerIdentifier],
      ticket: {
        ...this.buildAdminSupportTicketSummary(ticket),
        attachment: ticket.attachment,
        comments: compactThreadComments(ticket.comments),
        threadId: ticket.threadId,
        time: ticket.time,
      } satisfies AdminSupportTicketDetailResponse['ticket'],
    }
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
          normalizeStoredIdentifierReference(dialog.phone) !== owner.identifier,
      )
      .map((dialog): AdminDialogSummary | null => {
        const peerIdentifier = normalizeStoredIdentifierReference(dialog.phone)
        if (!peerIdentifier) {
          return null
        }

        const peer = this.findAccountForAdmin(peerIdentifier)
        const transcript = this.buildCanonicalDirectTranscript(owner.identifier, peerIdentifier)
        const firstMessageAt = transcript[0]?.createdAt
        const latestMessageAt = transcript.at(-1)?.createdAt
        const preview =
          transcript.at(-1)?.text || transcript.at(-1)?.attachment?.fileName || 'Без сообщений'
        const summary: AdminDialogSummary = {
          csvFileName: `dialog-${sanitizeExportFileName(owner.displayName)}-${sanitizeExportFileName(peer?.displayName ?? dialog.title)}-${formatExportDateStamp()}.csv`,
          firstMessageAt,
          messageCount: transcript.length,
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

  private buildCanonicalDirectTranscript(
    ownerIdentifierInput: string,
    peerIdentifierInput: string,
  ): CanonicalDirectTranscriptEntry[] {
    const ownerIdentifier = normalizeIdentifier(ownerIdentifierInput)
    const peerIdentifier = normalizeIdentifier(peerIdentifierInput)
    if (!ownerIdentifier || !peerIdentifier || ownerIdentifier === peerIdentifier) {
      return []
    }

    const [leftIdentifier, rightIdentifier] = [ownerIdentifier, peerIdentifier].sort()
    const transcriptByKey = new Map<
      string,
      {
        leftCopy?: PersistedDialogMessage
        logicalMessage: PersistedDialogMessage
        rightCopy?: PersistedDialogMessage
      }
    >()

    for (const message of this.database.dialogMessages) {
      if (message.ownerIdentifier !== leftIdentifier && message.ownerIdentifier !== rightIdentifier) continue

      const dialog = this.findDialog(message.ownerIdentifier, message.dialogId)
      const counterpartIdentifier = normalizeStoredIdentifierReference(dialog?.phone)
      if (!counterpartIdentifier) continue
      if (
        !(
          (message.ownerIdentifier === leftIdentifier && counterpartIdentifier === rightIdentifier) ||
          (message.ownerIdentifier === rightIdentifier && counterpartIdentifier === leftIdentifier)
        )
      ) {
        continue
      }

      const authorDisplayIdentifier =
        message.author === 'me' ? message.ownerIdentifier : counterpartIdentifier
      const dedupeKey = message.deliveryId?.trim()
        ? `delivery:${message.deliveryId.trim()}`
        : `legacy:${authorDisplayIdentifier}:${getMessageReadReceiptKey(message)}`
      const existing = transcriptByKey.get(dedupeKey)
      const entry = existing ?? { logicalMessage: message }

      if (
        !existing ||
        Boolean(entry.logicalMessage.archivedAt) ||
        (message.createdAt ?? '') < (entry.logicalMessage.createdAt ?? '')
      ) {
        entry.logicalMessage = message
      }

      if (message.ownerIdentifier === leftIdentifier) {
        entry.leftCopy = message
      } else {
        entry.rightCopy = message
      }

      transcriptByKey.set(dedupeKey, entry)
    }

    return [...transcriptByKey.entries()]
      .map(([id, entry]) => {
        const leftCopy = entry.leftCopy
        const rightCopy = entry.rightCopy
        const logicalMessage =
          (!entry.logicalMessage.archivedAt && entry.logicalMessage) ||
          leftCopy ||
          rightCopy ||
          entry.logicalMessage
        const dialog = this.findDialog(logicalMessage.ownerIdentifier, logicalMessage.dialogId)
        const counterpartIdentifier = normalizeStoredIdentifierReference(dialog?.phone) || logicalMessage.ownerIdentifier

        return {
          archiveReason: getDirectArchiveReasonForExport(leftCopy?.archivedReason, rightCopy?.archivedReason),
          archivedAt: leftCopy?.archivedAt ?? rightCopy?.archivedAt,
          attachment: logicalMessage.attachment,
          authorDisplayIdentifier:
            logicalMessage.author === 'me' ? logicalMessage.ownerIdentifier : counterpartIdentifier,
          createdAt: logicalMessage.createdAt,
          deliveryId: logicalMessage.deliveryId,
          id,
          leftArchivedAt: leftCopy?.archivedAt,
          leftArchiveReason: leftCopy?.archivedReason,
          logicalMessage,
          readAt: leftCopy?.readAt ?? rightCopy?.readAt ?? logicalMessage.readAt,
          // Direct export must stay human-readable: raw archiveReason alone is too opaque for staff/legal review.
          retentionNote: buildDirectRetentionNoteForExport(leftCopy?.archivedReason, rightCopy?.archivedReason),
          replyTo: logicalMessage.replyTo,
          rightArchivedAt: rightCopy?.archivedAt,
          rightArchiveReason: rightCopy?.archivedReason,
          text: logicalMessage.text,
          visibleForLeft: Boolean(leftCopy && !leftCopy.archivedAt),
          visibleForRight: Boolean(rightCopy && !rightCopy.archivedAt),
        } satisfies CanonicalDirectTranscriptEntry
      })
      .sort((left, right) => {
        const leftCreatedAt = parseIsoDate(left.createdAt)
        const rightCreatedAt = parseIsoDate(right.createdAt)
        if (leftCreatedAt !== null && rightCreatedAt !== null && leftCreatedAt !== rightCreatedAt) {
          return leftCreatedAt - rightCreatedAt
        }
        if (leftCreatedAt !== null && rightCreatedAt === null) return -1
        if (leftCreatedAt === null && rightCreatedAt !== null) return 1
        return left.id.localeCompare(right.id)
      })
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

  async adminExportChannelSubscribersCsv(actorToken: string, handle: string, reason: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    const channel = this.adminListChannels(normalizedHandle).find((item) => item.handle === normalizedHandle)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    const subscribersByIdentifier = new Map<string, { identifier: string; subscribedAt?: string }>()
    for (const copy of this.listSubscriptionChannelCopiesByHandle(normalizedHandle)) {
      const normalizedIdentifier =
        normalizeStoredIdentifierReference(copy.ownerIdentifier) || copy.ownerIdentifier
      const existing = subscribersByIdentifier.get(normalizedIdentifier)
      const subscribedAt = copy.subscribedAt?.trim() || undefined
      if (!existing) {
        subscribersByIdentifier.set(normalizedIdentifier, {
          identifier: normalizedIdentifier,
          subscribedAt,
        })
        continue
      }
      if (!existing.subscribedAt && subscribedAt) {
        existing.subscribedAt = subscribedAt
        continue
      }
      if (
        existing.subscribedAt &&
        subscribedAt &&
        Date.parse(subscribedAt) < Date.parse(existing.subscribedAt)
      ) {
        existing.subscribedAt = subscribedAt
      }
    }
    const subscribers = [...subscribersByIdentifier.values()]

    const csv = [
      ['Имя', 'Телефон', 'Юзернейм', 'Дата подписки'],
      ...subscribers.map(({ identifier, subscribedAt }) => {
        const account = identifier ? this.findAccount(identifier) : null
        const displayName =
          (account ? formatAccountName(account) : '') ||
          identifier ||
          'Без имени'
        const nickname = normalizeNickname(account?.nickname ?? '')
        return [
          displayName,
          identifier || '',
          nickname ? `@${nickname}` : '',
          subscribedAt || '',
        ]
      }),
    ]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
      .join('\n')

    const normalizedReason = sanitizeAdminText(reason, 280)
    await this.appendAdminAuditLog(actor, {
      action: 'admin.channel.subscribers-export.csv',
      reason: normalizedReason || undefined,
      summary: `Экспортирован CSV подписчиков канала @${normalizedHandle}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: normalizedHandle,
      targetType: 'channel',
    })

    return {
      csv,
      fileName: `channel-subscribers-${sanitizeExportFileName(channel.title) || normalizedHandle.replace(/^@/u, '') || 'channel'}-${formatExportDateStamp()}.csv`,
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
          normalizeIdentifier(parentGroup.groupOwnerIdentifier ?? '') ||
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

  async adminExportGroupParticipantsCsv(actorToken: string, groupId: string, reason: string) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const copies = this.database.groups.filter((group) => buildAdminGroupAggregateKey(group) === groupId)
    const primaryGroup = copies[0]
    if (!primaryGroup) {
      throw new Error('Группа не найдена.')
    }

    const participants = [...new Map(
      copies.flatMap((group) => group.participants ?? []).map((participant) => {
        const normalizedIdentifier = normalizeStoredIdentifierReference(participant.identifier ?? '')
        const key = normalizedIdentifier || `legacy:${participant.id}:${participant.title}`
        return [key, participant] as const
      }),
    ).values()]

    const csv = [
      ['Имя', 'Телефон', 'Юзернейм'],
      ...participants.map((participant) => {
        const normalizedIdentifier = normalizeStoredIdentifierReference(participant.identifier ?? '')
        const account = normalizedIdentifier ? this.findAccount(normalizedIdentifier) : null
        const displayName =
          (account ? formatAccountName(account) : '') ||
          participant.title ||
          normalizedIdentifier ||
          'Без имени'
        const nickname = normalizeNickname(account?.nickname ?? participant.nickname ?? '')
        return [
          displayName,
          normalizedIdentifier || participant.identifier || '',
          nickname ? `@${nickname}` : '',
        ]
      }),
    ]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
      .join('\n')

    const normalizedReason = sanitizeAdminText(reason, 280)
    await this.appendAdminAuditLog(actor, {
      action: 'admin.group.participants-export.csv',
      reason: normalizedReason || undefined,
      summary: `Экспортирован CSV участников группы ${primaryGroup.title}${normalizedReason ? ` · ${normalizedReason}` : ''}`,
      targetId: groupId,
      targetType: 'group',
    })

    return {
      csv,
      fileName: `group-participants-${sanitizeExportFileName(primaryGroup.title) || 'group'}-${formatExportDateStamp()}.csv`,
    }
  }

  async adminSetGroupArchived(
    actorToken: string,
    groupId: string,
    payload: { enabled: boolean; reason: string },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const normalizedReason = sanitizeAdminText(payload.reason, 280)
    if (!normalizedReason) {
      throw new Error('Нужно указать причину изменения статуса архива.')
    }

    const copies = this.database.groups.filter((group) => buildAdminGroupAggregateKey(group) === groupId)
    const primaryGroup = copies[0]
    if (!primaryGroup) {
      throw new Error('Группа не найдена.')
    }

    const sharedId = this.getSharedGroupId(primaryGroup)
    const broadcastIdentifiers = [...new Set(copies.map((group) => group.ownerIdentifier))]
    if (payload.enabled) {
      this.archiveGroupCopies(sharedId, 'admin-archived', new Date().toISOString())
    } else {
      this.unarchiveGroupCopies(sharedId)
    }

    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: payload.enabled ? 'admin.group.archive' : 'admin.group.unarchive',
      reason: normalizedReason,
      summary: `${payload.enabled ? 'Архивирована' : 'Разархивирована'} группа ${primaryGroup.title} · ${normalizedReason}`,
      targetId: groupId,
      targetType: 'group',
    })

    return {
      broadcastIdentifiers,
      groups: this.adminListGroups(''),
    }
  }

  async adminSetManagedChannelArchived(
    actorToken: string,
    handle: string,
    payload: { enabled: boolean; reason: string },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const normalizedReason = sanitizeAdminText(payload.reason, 280)
    if (!normalizedReason) {
      throw new Error('Нужно указать причину изменения статуса архива.')
    }

    const normalizedHandle = sanitizeChannelDirectLink(handle) || handle
    const channel = this.findManagedChannelByHandle(normalizedHandle)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    this.ensureManagedChannelOwnerSubscriptionCopy(channel)
    const channelCopies = this.listSubscriptionChannelCopiesByHandle(normalizedHandle)
    const broadcastIdentifiers = [
      ...new Set(channelCopies.map((copy) => copy.ownerIdentifier).concat(channel.ownerIdentifier)),
    ]

    if (payload.enabled) {
      this.archiveManagedChannel(channel, 'admin-archived', new Date().toISOString())
    } else {
      this.unarchiveManagedChannel(channel)
    }

    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: payload.enabled ? 'admin.channel.archive' : 'admin.channel.unarchive',
      reason: normalizedReason,
      summary: `${payload.enabled ? 'Архивирован' : 'Разархивирован'} канал ${channel.title} · ${normalizedReason}`,
      targetId: normalizedHandle,
      targetType: 'channel',
    })

    return {
      broadcastIdentifiers,
      channels: this.adminListChannels(''),
    }
  }

  async adminSetThreadArchived(
    actorToken: string,
    threadId: string,
    payload: { enabled: boolean; reason: string },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    const normalizedReason = sanitizeAdminText(payload.reason, 280)
    if (!normalizedReason) {
      throw new Error('Нужно указать причину изменения статуса архива.')
    }

    const archivedAt = payload.enabled ? new Date().toISOString() : undefined
    const broadcastIdentifiers = new Set<string>()
    let summaryLabel = threadId

    if (threadId.startsWith('admin-group-thread:')) {
      let canonicalThreadId: string | null = null
      let sharedId: string | null = null
      for (const message of this.database.groupMessages) {
        const group = this.findGroup(message.ownerIdentifier, message.groupId)
        if (!group || buildAdminGroupThreadKey(group, message) !== threadId) continue
        canonicalThreadId = getGroupMessageThreadId(group, message)
        sharedId = this.getSharedGroupId(group)
        summaryLabel = `${group.title} · ${message.text || message.attachment?.fileName || 'Сообщение без текста'}`
        break
      }

      if (!canonicalThreadId || !sharedId) {
        throw new Error('Тред не найден.')
      }

      for (const message of this.database.groupMessages) {
        const group = this.findGroup(message.ownerIdentifier, message.groupId)
        if (!group) continue
        if (this.getSharedGroupId(group) !== sharedId) continue
        if (getGroupMessageThreadId(group, message) !== canonicalThreadId) continue
        message.threadArchivedAt = archivedAt
        message.threadArchiveReason = payload.enabled ? 'admin-archived' : undefined
        broadcastIdentifiers.add(group.ownerIdentifier)
      }
    } else if (threadId.startsWith('admin-channel-thread:')) {
      let canonicalThreadId: string | null = null
      let normalizedHandle: string | null = null
      for (const post of this.database.subscriptionPosts) {
        const channel = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
        if (!channel || buildAdminChannelThreadKey(channel, post) !== threadId) continue
        canonicalThreadId = getSubscriptionPostThreadId(channel, post)
        normalizedHandle = sanitizeChannelDirectLink(channel.handle) || channel.handle
        summaryLabel = `${channel.title} · ${post.text || post.attachment?.fileName || 'Пост без текста'}`
        break
      }

      if (!canonicalThreadId || !normalizedHandle) {
        throw new Error('Тред не найден.')
      }

      for (const post of this.database.subscriptionPosts) {
        const channel = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
        if (!channel) continue
        if ((sanitizeChannelDirectLink(channel.handle) || channel.handle) !== normalizedHandle) continue
        if (getSubscriptionPostThreadId(channel, post) !== canonicalThreadId) continue
        post.threadArchivedAt = archivedAt
        post.threadArchiveReason = payload.enabled ? 'admin-archived' : undefined
        broadcastIdentifiers.add(channel.ownerIdentifier)
      }
    } else {
      throw new Error('Тред не найден.')
    }

    await this.persist()
    await this.appendAdminAuditLog(actor, {
      action: payload.enabled ? 'admin.thread.archive' : 'admin.thread.unarchive',
      reason: normalizedReason,
      summary: `${payload.enabled ? 'Архивирован' : 'Разархивирован'} тред ${summaryLabel} · ${normalizedReason}`,
      targetId: threadId,
      targetType: 'thread',
    })

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      threads: this.adminListThreads(''),
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

    const [leftIdentifier, rightIdentifier] = [dialog.owner.identifier, dialog.peer.identifier].sort()
    const messages = this.buildCanonicalDirectTranscript(dialog.owner.identifier, dialog.peer.identifier)

    const csv = [
      [
        'Когда',
        'Автор',
        'ID автора',
        'Текст',
        'Файл',
        'Media URL',
        'Reply To',
        'Read At',
        'Archived At',
        'Retention Note',
        'Archive Reason',
        `Visible For ${leftIdentifier}`,
        `Visible For ${rightIdentifier}`,
      ],
      ...messages.map((message) => {
        const authorIdentifier = message.authorDisplayIdentifier
        const author = this.findAccount(authorIdentifier)
        return [
          message.createdAt ?? '',
          author ? buildAccountDisplayLabel(author) : authorIdentifier,
          authorIdentifier,
          message.text,
          message.attachment?.fileName ?? '',
          message.attachment?.mediaUrl ?? '',
          message.replyTo?.text ?? '',
          message.readAt ?? '',
          message.archivedAt ?? '',
          message.retentionNote ?? '',
          message.archiveReason ?? '',
          message.visibleForLeft ? 'yes' : 'no',
          message.visibleForRight ? 'yes' : 'no',
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

    const targetAccounts = this.findAccountsByOriginalIdentifier(
      getAccountOriginalIdentifier(target) || body.targetIdentifier,
    )
    const lifecycleAccounts = targetAccounts.length > 0 ? targetAccounts : [target]
    const lifecycleIdentifiers = new Set(lifecycleAccounts.map((account) => account.identifier))
    const lifecycleOriginalIdentifiers = new Set(
      lifecycleAccounts
        .map((account) => getAccountOriginalIdentifier(account))
        .filter((identifier): identifier is string => Boolean(identifier)),
    )
    const primaryTarget =
      lifecycleAccounts.find((account) => !account.deletedAt) ?? lifecycleAccounts[0] ?? target
    const matchesTargetIdentifier = (value: string | undefined | null) => {
      const storedIdentifier = normalizeStoredIdentifierReference(value)
      if (storedIdentifier && lifecycleIdentifiers.has(storedIdentifier)) {
        return true
      }

      const normalizedIdentifier = normalizeIdentifier(value ?? '')
      return normalizedIdentifier ? lifecycleOriginalIdentifiers.has(normalizedIdentifier) : false
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
      const peerIdentifier = normalizeStoredIdentifierReference(dialog.phone)
      if (!peerIdentifier || peerIdentifier === dialog.ownerIdentifier) {
        continue
      }

      if (!matchesTargetIdentifier(dialog.ownerIdentifier) && !matchesTargetIdentifier(peerIdentifier)) {
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
      const [leftIdentifier, rightIdentifier] = [exportTarget.ownerIdentifier, exportTarget.peerIdentifier].sort()
      const messages = this.buildCanonicalDirectTranscript(
        exportTarget.ownerIdentifier,
        exportTarget.peerIdentifier,
      ).filter((message) => isTimestampWithinRange(message.createdAt, fromTimestamp, toTimestamp))

      const fileBaseName = `dialog-${sanitizeExportFileName(ownerAccount ? buildAccountDisplayLabel(ownerAccount) : exportTarget.ownerIdentifier)}-${sanitizeExportFileName(peerAccount ? buildAccountDisplayLabel(peerAccount) : exportTarget.peerIdentifier)}`
      const rows: unknown[][] = [[
        'Когда',
        'Автор',
        'ID автора',
        'Текст',
        'Файл',
        'Media URL',
        'Reply To',
        'Read At',
        'Archived At',
        'Retention Note',
        'Archive Reason',
        `Visible For ${leftIdentifier}`,
        `Visible For ${rightIdentifier}`,
      ]]
      const payloadMessages = messages.map((message) => {
        const authorIdentifier = message.authorDisplayIdentifier
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
          message.archivedAt ?? '',
          message.retentionNote ?? '',
          message.archiveReason ?? '',
          message.visibleForLeft,
          message.visibleForRight,
        ])

        return {
          attachment: message.attachment ?? null,
          authorDisplayName: author ? buildAccountDisplayLabel(author) : authorIdentifier,
          authorIdentifier,
          archiveReason: message.archiveReason ?? null,
          archivedAt: message.archivedAt ?? null,
          createdAt: message.createdAt,
          deliveryId: message.deliveryId,
          id: message.id,
          leftArchivedAt: message.leftArchivedAt ?? null,
          leftArchiveReason: message.leftArchiveReason ?? null,
          readAt: message.readAt,
          retentionNote: message.retentionNote ?? null,
          replyTo: message.replyTo ?? null,
          rightArchivedAt: message.rightArchivedAt ?? null,
          rightArchiveReason: message.rightArchiveReason ?? null,
          text: message.text,
          visibleForLeft: message.visibleForLeft,
          visibleForRight: message.visibleForRight,
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
        normalizeStoredIdentifierReference(participant.identifier ?? ''),
      )
      const creatorIdentifier = resolveStoredIdentifierReference(
        group.groupOwnerIdentifier ?? group.creatorIdentifier ?? '',
        group.ownerIdentifier,
      )
      if (
        matchesTargetIdentifier(group.ownerIdentifier) ||
        matchesTargetIdentifier(creatorIdentifier) ||
        participantIdentifiers.some((identifier) => matchesTargetIdentifier(identifier))
      ) {
        relevantGroupIds.add(this.getSharedGroupId(group))
      }
    }
    for (const message of this.database.groupMessages) {
      const group = this.findGroup(message.ownerIdentifier, message.groupId)
      if (!group) continue
      const authorIdentifier =
        resolveStoredIdentifierReference(
          group.participants?.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
          resolveStoredIdentifierReference(
            group.groupOwnerIdentifier ?? group.creatorIdentifier ?? '',
            message.ownerIdentifier,
          ),
        )
      if (
        matchesTargetIdentifier(authorIdentifier) ||
        compactThreadComments(message.threadComments).some(
          (comment) => matchesTargetIdentifier(comment.authorIdentifier ?? ''),
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
            resolveStoredIdentifierReference(
              parentGroup.participants?.find((participant) => participant.id === message.groupParticipantId)?.identifier ?? '',
              resolveStoredIdentifierReference(
                parentGroup.groupOwnerIdentifier ?? parentGroup.creatorIdentifier ?? '',
                message.ownerIdentifier,
              ),
            )
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
              const resolvedCommentAuthorIdentifier = resolveStoredIdentifierReference(
                comment.authorIdentifier ?? '',
                message.ownerIdentifier,
              )
              const commentAuthor = this.findAccount(resolvedCommentAuthorIdentifier)
              return {
                attachment: comment.attachment ?? null,
                authorDisplayName: commentAuthor ? buildAccountDisplayLabel(commentAuthor) : resolvedCommentAuthorIdentifier,
                authorIdentifier: resolvedCommentAuthorIdentifier,
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
          archivedAt: primaryGroup.archivedAt,
          archiveReason: primaryGroup.archiveReason,
          creatorIdentifier: primaryGroup.creatorIdentifier,
          currentOwnerIdentifier: getCurrentGroupOwnerIdentifier(primaryGroup),
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
      if (matchesTargetIdentifier(channel.ownerIdentifier)) {
        relevantChannelHandles.add(handle)
      }
    }
    for (const channel of this.database.subscriptionChannels) {
      const handle = sanitizeChannelDirectLink(channel.handle) || channel.handle
      const participantIdentifiers = (channel.participants ?? []).map((participant) =>
        normalizeStoredIdentifierReference(participant.identifier ?? ''),
      )
      if (matchesTargetIdentifier(channel.ownerIdentifier) || participantIdentifiers.some((identifier) => matchesTargetIdentifier(identifier))) {
        relevantChannelHandles.add(handle)
      }
    }
    for (const post of this.database.subscriptionPosts) {
      const channel = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)
      if (!channel) continue
      const handle = sanitizeChannelDirectLink(channel.handle) || channel.handle
      if (
        matchesTargetIdentifier(post.ownerIdentifier) ||
        compactThreadComments(post.threadComments).some(
          (comment) => matchesTargetIdentifier(comment.authorIdentifier ?? ''),
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
              const commentAuthorIdentifier = resolveStoredIdentifierReference(comment.authorIdentifier ?? '', post.ownerIdentifier)
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
          archivedAt: managedChannel?.archivedAt ?? primaryCopy?.archivedAt,
          archiveReason: managedChannel?.archiveReason ?? primaryCopy?.archiveReason,
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
          matchesTargetIdentifier(report.reporterIdentifier) ||
          matchesTargetIdentifier(report.entityOwnerIdentifier ?? '') ||
          matchesTargetIdentifier(report.relatedUserIdentifier ?? '')
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

    const auditRows = this.database.adminAuditLogs
      .filter((entry) => {
        const createdAt = parseIsoDate(entry.createdAt)
        if (fromTimestamp !== null && (createdAt === null || createdAt < fromTimestamp)) {
          return false
        }
        if (toTimestamp !== null && (createdAt === null || createdAt > toTimestamp)) {
          return false
        }

        return matchesTargetIdentifier(entry.actorIdentifier) || this.adminAuditEntryTargetsIdentifier(entry, body.targetIdentifier)
      })
      .map((entry) => this.buildAdminAuditEntry(entry))
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

    const ipAccessRows = this.database.ipAccessLogs
      .filter((entry) => matchesTargetIdentifier(entry.identifier))
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
          matchesTargetIdentifier(item.owner.identifier) ||
          item.relatedUsers.some((user) => matchesTargetIdentifier(user.identifier)),
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

    const accountSummary = this.buildAdminUserSummary(primaryTarget)
    registerJson('account.json', accountSummary)
    registerJson('accounts.json', lifecycleAccounts.map((account) => this.buildAdminUserSummary(account)))

    const manifest = {
      accountIdentifier: body.targetIdentifier,
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
        accountLifecycles: lifecycleAccounts.length,
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

    const archiveFileName = `legal-export-${sanitizeExportFileName(accountSummary.displayName) || primaryTarget.identifier}-${formatExportDateStamp()}.zip`
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
      summary: `Сформирована юридическая выгрузка для ${buildAdminAuditAccountLabel(primaryTarget)} · ${normalizedReason}`,
      targetId: body.targetIdentifier,
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

  private async buildAdminStorageArchivePayload(
    actor: ReturnType<TinychokStore['getStaffAccountByTokenOrThrow']>,
    subjectDescriptor: ReturnType<TinychokStore['resolveAdminStorageSubject']>,
    mode: 'current' | 'archive',
    reason: string,
    options?: {
      signal?: AbortSignal
      onProgress?: (progress: {
        failedFiles: number
        fileCount: number
        phase: 'preparing' | 'zipping'
        processedItems: number
        totalItems: number
      }) => void
    },
  ) {
    const throwIfStorageExportAborted = () => {
      if (options?.signal?.aborted) {
        const abortError = new Error('Подготовка архива отменена.')
        abortError.name = 'AbortError'
        throw abortError
      }
    }
    const mediaItems =
      mode === 'archive'
        ? this.collectAdminArchivedMediaExportItems(subjectDescriptor.subject)
        : this.collectAdminOwnedMediaExportItems(subjectDescriptor.subject, { currentOnly: true })
    const archiveEntries: Record<string, Uint8Array> = {}
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

    const manifestEntries: StorageArchiveManifestItem[] = []
    let failedFiles = 0
    let processedItems = 0
    let fileCount = 0
    const totalItems = mediaItems.length
    const reportProgress = (phase: 'preparing' | 'zipping') => {
      options?.onProgress?.({
        failedFiles,
        fileCount,
        phase,
        processedItems,
        totalItems,
      })
    }

    reportProgress('preparing')

    for (const item of mediaItems) {
      throwIfStorageExportAborted()
      const baseRecord: StorageArchiveManifestItem = {
        archiveReason: item.archiveReason as StorageArchiveReason | undefined,
        archivedAt: item.archivedAt,
        fileName: item.fileName,
        kind: item.kind,
        mediaUrl: item.mediaUrl,
        mimeType: item.mimeType,
        originalContext: item.originalContext ?? item.primaryLabel,
        ownerIdentifier: item.ownerIdentifier || undefined,
        primaryLabel: item.primaryLabel,
        retentionOnly: item.retentionOnly,
        size: item.size,
        storageSubject: `${subjectDescriptor.subject.kind}:${subjectDescriptor.subject.id}`,
        storageSubjectKind: subjectDescriptor.subject.kind,
        usageCount: item.usageCount,
      }

      try {
        const buffer = await readStoredMediaByUrl(item.mediaUrl, item.storageKind)
        throwIfStorageExportAborted()
        const archivePath = nextArchiveMediaPath(item.fileName || item.mediaUrl)
        archiveEntries[archivePath] = buffer
        manifestEntries.push({
          ...baseRecord,
          archivePath,
        })
        fileCount += 1
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error
        }
        manifestEntries.push({
          ...baseRecord,
          exportError: error instanceof Error ? error.message : 'Не удалось прочитать media-файл.',
        })
        failedFiles += 1
      } finally {
        processedItems += 1
        reportProgress('preparing')
      }
    }

    registerJson('manifest/media.json', manifestEntries)
    registerCsv('manifest/media.csv', [
      [
        'Media URL',
        'Файл',
        'Вид',
        'MIME',
        'Размер',
        'Владелец',
        'Primary label',
        'Original context',
        'Использований',
        'Retention only',
        'Archive reason',
        'Archived at',
        'Storage subject',
        'Путь в архиве',
        'Ошибка выгрузки',
      ],
      ...manifestEntries.map((entry) => [
        entry.mediaUrl,
        entry.fileName,
        entry.kind,
        entry.mimeType,
        entry.size,
        entry.ownerIdentifier ?? '',
        entry.primaryLabel,
        entry.originalContext,
        entry.usageCount,
        entry.retentionOnly ? 'yes' : 'no',
        entry.archiveReason ?? '',
        entry.archivedAt ?? '',
        entry.storageSubject,
        entry.archivePath ?? '',
        entry.exportError ?? '',
      ]),
    ])
    registerJson('manifest/export.json', {
      actorIdentifier: actor.identifier,
      actorRole: actor.staffRole,
      counts: {
        archiveOnly: manifestEntries.filter((entry) => entry.archivedAt || entry.retentionOnly).length,
        failedFiles: manifestEntries.filter((entry) => entry.exportError).length,
        filesIncluded: manifestEntries.filter((entry) => entry.archivePath).length,
        items: manifestEntries.length,
      },
      createdAt: new Date().toISOString(),
      mode,
      reason,
      subject: {
        id: subjectDescriptor.subject.id,
        kind: subjectDescriptor.subject.kind,
      },
      target: subjectDescriptor.auditLabel,
    })

    const archiveFileName = `${mode === 'archive' ? 'archive' : 'current'}-media-export-${subjectDescriptor.exportBaseName}-${formatExportDateStamp()}.zip`
    throwIfStorageExportAborted()
    reportProgress('zipping')
    return {
      counts: {
        failedFiles: manifestEntries.filter((entry) => entry.exportError).length,
        fileCount: manifestEntries.filter((entry) => entry.archivePath).length,
        itemCount: manifestEntries.length,
      },
      fileName: archiveFileName,
      manifestEntries,
      payload: {
        buffer: Buffer.from(zipSync(archiveEntries, { level: 0 })),
        fileName: archiveFileName,
      },
    }
  }

  async adminExportStorageArchive(
    actorToken: string,
    body: AdminStorageExportBody,
    options?: {
      signal?: AbortSignal
      onProgress?: (progress: {
        failedFiles: number
        fileCount: number
        phase: 'preparing' | 'zipping'
        processedItems: number
        totalItems: number
      }) => void
    },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    if (actor.staffRole !== 'owner') {
      throw new Error('Выгрузка архивного хранилища доступна только владельцу.')
    }
    if (!actor.passwordHash) {
      throw new Error('У owner-аккаунта должен быть настроен пароль для этой выгрузки.')
    }
    const currentPasswordMatches = await verifyPassword(body.currentPassword ?? '', actor.passwordHash)
    if (!currentPasswordMatches) {
      throw new Error('Неверный пароль текущего owner-аккаунта.')
    }

    const normalizedReason = sanitizeAdminText(body.reason, 280) || 'Проверка архивного хранилища'
    const subjectDescriptor = this.resolveAdminStorageSubject(body.subjectKind, body.subjectId)
    const bundle = await this.buildAdminStorageArchivePayload(
      actor,
      subjectDescriptor,
      'archive',
      normalizedReason,
      options,
    )
    await this.appendAdminAuditLog(actor, {
      action: 'admin.storage.archive-export.download',
      nextValue: {
        archiveFileName: bundle.fileName,
        failedFiles: bundle.counts.failedFiles,
        fileCount: bundle.counts.fileCount,
        itemCount: bundle.counts.itemCount,
        subjectId: subjectDescriptor.subject.id,
        subjectKind: subjectDescriptor.subject.kind,
      },
      reason: normalizedReason,
      summary: `Сформирована выгрузка архивного хранилища для ${subjectDescriptor.auditLabel} · ${normalizedReason}`,
      targetId: subjectDescriptor.auditTargetId,
      targetType: subjectDescriptor.auditTargetType,
    })

    return bundle.payload
  }

  async adminExportCurrentStorage(
    actorToken: string,
    body: AdminStorageExportBody,
    options?: {
      signal?: AbortSignal
      onProgress?: (progress: {
        failedFiles: number
        fileCount: number
        phase: 'preparing' | 'zipping'
        processedItems: number
        totalItems: number
      }) => void
    },
  ) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    if (actor.staffRole !== 'owner') {
      throw new Error('Выгрузка хранилища доступна только владельцу.')
    }
    if (!actor.passwordHash) {
      throw new Error('У owner-аккаунта должен быть настроен пароль для этой выгрузки.')
    }
    const currentPasswordMatches = await verifyPassword(body.currentPassword ?? '', actor.passwordHash)
    if (!currentPasswordMatches) {
      throw new Error('Неверный пароль текущего owner-аккаунта.')
    }

    const normalizedReason = sanitizeAdminText(body.reason, 280) || 'Проверка текущего хранилища'
    const subjectDescriptor = this.resolveAdminStorageSubject(body.subjectKind, body.subjectId)
    const bundle = await this.buildAdminStorageArchivePayload(
      actor,
      subjectDescriptor,
      'current',
      normalizedReason,
      options,
    )
    await this.appendAdminAuditLog(actor, {
      action: 'admin.storage.current-export.download',
      nextValue: {
        archiveFileName: bundle.fileName,
        failedFiles: bundle.counts.failedFiles,
        fileCount: bundle.counts.fileCount,
        itemCount: bundle.counts.itemCount,
        subjectId: subjectDescriptor.subject.id,
        subjectKind: subjectDescriptor.subject.kind,
      },
      reason: normalizedReason,
      summary: `Сформирована выгрузка текущего хранилища для ${subjectDescriptor.auditLabel} · ${normalizedReason}`,
      targetId: subjectDescriptor.auditTargetId,
      targetType: subjectDescriptor.auditTargetType,
    })

    return bundle.payload
  }

  async adminSetStorageArchiveUnlimited(actorToken: string, body: AdminStorageArchiveToggleBody) {
    const actor = this.getStaffAccountByTokenOrThrow(actorToken)
    if (actor.staffRole !== 'owner') {
      throw new Error('Управление архивным лимитом доступно только владельцу.')
    }

    const normalizedReason = sanitizeAdminText(body.reason, 280)
    if (!normalizedReason) {
      throw new Error('Нужно указать причину изменения архивного лимита.')
    }

    const subjectDescriptor = this.resolveAdminStorageSubject(body.subjectKind, body.subjectId)
    const previousValue = this.buildStorageSubjectUsageResponse(subjectDescriptor.subject)

    if (body.subjectKind === 'user') {
      const target = this.findAccount(subjectDescriptor.subject.id)
      if (!target) throw new Error('Пользователь не найден.')
      target.archiveUnlimited = Boolean(body.enabled)
    } else if (body.subjectKind === 'group') {
      for (const group of this.database.groups.filter((candidate) => buildAdminGroupAggregateKey(candidate) === body.subjectId.trim())) {
        group.archiveUnlimited = Boolean(body.enabled)
      }
    } else {
      const channel = this.findManagedChannelByHandle(subjectDescriptor.auditTargetId)
      if (!channel) throw new Error('Канал не найден.')
      channel.archiveUnlimited = Boolean(body.enabled)
    }

    await this.persist()
    const nextSubject = this.resolveAdminStorageSubject(body.subjectKind, body.subjectId).subject
    await this.appendAdminAuditLog(actor, {
      action: 'admin.storage.archive-unlimited.toggle',
      nextValue: {
        ...this.buildStorageSubjectUsageResponse(nextSubject),
        enabled: Boolean(body.enabled),
      },
      previousValue,
      reason: normalizedReason,
      summary: `${body.enabled ? 'Снято' : 'Включено'} ограничение архивного хранилища для ${subjectDescriptor.auditLabel} · ${normalizedReason}`,
      targetId: subjectDescriptor.auditTargetId,
      targetType: subjectDescriptor.auditTargetType,
    })

    return this.buildStorageSubjectUsageResponse(nextSubject)
  }

  async adminExportUserMediaArchive(actorToken: string, body: AdminUserMediaExportBody) {
    return this.adminExportCurrentStorage(actorToken, {
      currentPassword: body.currentPassword,
      reason: body.reason,
      subjectId: body.targetIdentifier,
      subjectKind: 'user',
    })
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

    const fullChats = materializeFullChats(
      this.database,
      this.livePresenceCountsByIdentifier,
      account.identifier,
      { includeHidden: true },
    )
    const fullGroups = materializeFullGroups(
      this.database,
      this.livePresenceCountsByIdentifier,
      account.identifier,
    )
    const fullSubscriptionChannels = materializeFullSubscriptionChannels(
      this.database,
      this.livePresenceCountsByIdentifier,
      account.identifier,
    )
    const fullChannels = materializeManagedChannels(this.database, account.identifier)

    const fullChatsById = new Map(fullChats.map((chat) => [chat.id, chat] as const))
    const fullGroupsById = new Map(fullGroups.map((group) => [group.id, group] as const))
    const fullSubscriptionChannelsById = new Map(
      fullSubscriptionChannels.map((channel) => [channel.id, channel] as const),
    )
    const fullChannelsById = new Map(fullChannels.map((channel) => [channel.id, channel] as const))

    // Snapshot sync is not an account/session source of truth. Sensitive profile, premium,
    // privacy and channel-management fields must only change through dedicated server mutations.
    const chats = fullChats.map((chat) => {
      const snapshotChat = fullChatsById.has(chat.id)
        ? snapshot.chats.find((candidate) => candidate.id === chat.id)
        : undefined

      return {
        ...chat,
        hidden: snapshotChat?.hidden ?? chat.hidden,
        muted: snapshotChat?.muted ?? chat.muted,
        pinned: snapshotChat?.pinned ?? chat.pinned,
        pinnedMessageId:
          snapshotChat?.pinnedMessageId !== undefined
            ? snapshotChat.pinnedMessageId
            : chat.pinnedMessageId,
      }
    })
    const groups = fullGroups.map((group) => {
      const snapshotGroup = fullGroupsById.has(group.id)
        ? snapshot.groups.find((candidate) => candidate.id === group.id)
        : undefined

      return {
        ...group,
        muted: snapshotGroup?.muted ?? group.muted,
      }
    })
    const subscriptionChannels = fullSubscriptionChannels.map((channel) => {
      const snapshotChannel = fullSubscriptionChannelsById.has(channel.id)
        ? snapshot.subscriptionChannels.find((candidate) => candidate.id === channel.id)
        : undefined

      return {
        ...channel,
        muted: snapshotChannel?.muted ?? channel.muted,
      }
    })
    const channels = fullChannels.map((channel) => fullChannelsById.get(channel.id) ?? channel)

    this.replaceOwnerState(account.identifier, {
      channels,
      chats,
      groups,
      subscriptionChannels,
    })

    await this.persist()

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
      const nextStatus = sanitizeStatusField(payload.status)
      const previousStatus = sanitizeStatusField(account.status ?? '')
      const statusChanged = nextStatus !== previousStatus
      account.statusHistory = normalizeAccountStatusHistory(
        account.statusHistory,
        account.createdAt,
        previousStatus,
      )
      account.status = nextStatus

      if (statusChanged && nextStatus) {
        account.statusHistory.push({
          setAt: new Date().toISOString(),
          status: nextStatus,
        })
      }
    }

    if (payload.avatarImage !== undefined) {
      account.avatarImage = payload.avatarImage.trim() || undefined
    }

    if (payload.darkThemeEnabled !== undefined) {
      account.darkThemeEnabled = Boolean(payload.darkThemeEnabled)
    }

    if (payload.quietModeSettings !== undefined) {
      account.quietModeSettings = normalizeQuietModeSettings(payload.quietModeSettings)
    }

    if (payload.invisibilityEnabled !== undefined) {
      account.invisibilityEnabled = Boolean(payload.invisibilityEnabled)
      // Manual invisibility preference must always clear the quiet-origin marker; otherwise
      // `Тихо -> off` could incorrectly undo a user decision made in settings.
      account.invisibilityAutoEnabled = false
    }

    if (payload.quietModeEnabled !== undefined) {
      const previousQuietModeEnabled = Boolean(account.quietModeEnabled)
      const currentInvisibilityEnabled = getStoredInvisibilityPreference(account)
      const currentInvisibilityAutoEnabled = Boolean(account.invisibilityAutoEnabled)
      const nextQuietModeEnabled = Boolean(payload.quietModeEnabled)

      account.quietModeEnabled = nextQuietModeEnabled

      // Server-side source of truth:
      // quiet-mode may auto-toggle invisibility, but only auto-enabled invisibility may be
      // auto-disabled again when quiet-mode turns off.
      const nextInvisibilityState = resolveQuietModeInvisibilityState({
        autoInvisibility: getEffectiveQuietModeSettings(
          account.quietModeSettings,
          hasActivePremium(account.premium, account.premiumExpiresAt),
        ).autoInvisibility,
        currentInvisibilityAutoEnabled,
        currentInvisibilityEnabled,
        currentQuietModeEnabled: previousQuietModeEnabled,
        nextQuietModeEnabled,
      })

      account.invisibilityAutoEnabled = nextInvisibilityState.invisibilityAutoEnabled
      account.invisibilityEnabled = nextInvisibilityState.invisibilityEnabled
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

  listUserStorageItems(token: string) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const subject = this.getUserStorageSubject(account.identifier)
    return {
      items: this.buildPrimaryStorageInventoryForSubject(subject),
      usage: this.buildStorageSubjectUsageResponse(subject),
    }
  }

  async removeUserStorageItem(token: string, storageItemId: string): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const parsedStorageItem = this.parseUserStorageItemId(storageItemId.trim())
    if (!parsedStorageItem) {
      throw new Error('Некорректный объект хранилища.')
    }

    const subject = this.getUserStorageSubject(account.identifier)
    const storageItem = this.buildPrimaryStorageInventoryForSubject(subject).find((item) => item.id === storageItemId) ?? null
    if (!storageItem) {
      throw new Error('Объект хранилища не найден.')
    }

    if (parsedStorageItem.kind === 'gif') {
      const currentLibrary = account.gifLibrary ?? []
      await this.archiveReferencesForSubject(subject, parsedStorageItem.mediaUrl, 'manual-delete')
      account.gifLibrary = currentLibrary.filter((gif) => gif.mediaUrl !== parsedStorageItem.mediaUrl)
      await this.persist()
      await this.deleteMediaIfUnreferenced(parsedStorageItem.mediaUrl)
      return {
        broadcastIdentifiers: [account.identifier],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    await this.archiveReferencesForSubject(subject, parsedStorageItem.mediaUrl, 'manual-delete')
    const affectedIdentifiers = this.removeAttachmentReferencesForSubject(
      subject,
      parsedStorageItem.mediaUrl,
      this.buildAttachmentRemovedNoticeForSubject(subject, 'storage-manual'),
    )
    if (affectedIdentifiers.length === 0) {
      throw new Error('Объект хранилища не найден.')
    }

    await this.persist()
    await this.deleteMediaIfUnreferenced(parsedStorageItem.mediaUrl)

    return {
      broadcastIdentifiers: [...new Set([account.identifier, ...affectedIdentifiers])],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  listChannelStorageItems(token: string, channelId: number): StoragePrimaryItemsResponse {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findManagedChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }
    this.assertManagedChannelWritable(channel)

    const subject = this.getChannelStorageSubjectByHandle(channel.directLink)
    return {
      items: this.buildPrimaryStorageInventoryForSubject(subject),
      usage: this.buildStorageSubjectUsageResponse(subject),
    }
  }

  async removeChannelStorageItem(token: string, channelId: number, storageItemId: string): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findManagedChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }
    this.assertManagedChannelWritable(channel)

    const subject = this.getChannelStorageSubjectByHandle(channel.directLink)
    const parsedStorageItem = this.parseUserStorageItemId(storageItemId.trim())
    if (!parsedStorageItem || parsedStorageItem.kind !== 'attachment') {
      throw new Error('Некорректный объект хранилища.')
    }

    const storageItem = this.buildPrimaryStorageInventoryForSubject(subject).find((item) => item.id === storageItemId)
    if (!storageItem) {
      throw new Error('Объект хранилища не найден.')
    }

    await this.archiveReferencesForSubject(subject, parsedStorageItem.mediaUrl, 'manual-delete')
    const affectedIdentifiers = this.removeAttachmentReferencesForSubject(
      subject,
      parsedStorageItem.mediaUrl,
      this.buildAttachmentRemovedNoticeForSubject(subject, 'storage-manual'),
    )
    if (affectedIdentifiers.length === 0) {
      throw new Error('Объект хранилища не найден.')
    }

    await this.persist()
    await this.deleteMediaIfUnreferenced(parsedStorageItem.mediaUrl)

    return {
      broadcastIdentifiers: [...new Set(affectedIdentifiers)],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async setDebugPremiumState(token: string, payload: DebugPremiumBody): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const previousStorageQuotaBytes = getEffectiveUserStorageQuotaBytes(account)
    if (payload.enabled || hasPremiumStorageHistory(account)) {
      rememberUnlockedPremiumStorageQuota(account)
    }
    account.premium = Boolean(payload.enabled)
    account.premiumExpiresAt = payload.enabled
      ? extendPremiumExpiry(
          Number.isInteger(payload.durationDays) && (payload.durationDays ?? 0) > 0
            ? payload.durationDays!
            : 30,
          account.premiumExpiresAt,
        )
      : ''
    const restoredIdentifiers =
      getEffectiveUserStorageQuotaBytes(account) > previousStorageQuotaBytes
        ? this.restoreArchivedMediaIntoPrimaryStorageIfQuotaAllows(this.getUserStorageSubject(account.identifier))
        : []

    const broadcastIdentifiers = this.refreshDialogsForAccount(account)
    broadcastIdentifiers.push(account.identifier)
    broadcastIdentifiers.push(...restoredIdentifiers)

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
    if (isPublicDeletedAccount(contactAccount)) {
      throw new Error('Этот аккаунт удалён и недоступен для переписки.')
    }

    const contactState = this.getContactState(account.identifier, contactAccount.identifier)
    const shouldHideDialog = contactState !== 'accepted'

    // Reopen must reuse hidden former-contact dialogs instead of creating a new empty room,
    // otherwise preserved history and per-side delete semantics are lost.
    const dialog = this.ensureDialogForContact(account.identifier, contactAccount, {
      hidden: shouldHideDialog,
    })
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      dialogId: dialog.id,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendContactRequest(
    token: string,
    payload: SendContactRequestBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    if (!normalizedIdentifier) {
      throw new Error('Нужно указать номер контакта.')
    }

    if (normalizedIdentifier === account.identifier) {
      throw new Error('Нельзя отправить запрос самому себе.')
    }

    const contactAccount = this.findAccount(normalizedIdentifier)
    if (!contactAccount || isPublicDeletedAccount(contactAccount)) {
      throw new Error('Аккаунт не найден.')
    }

    const currentState = this.getContactState(account.identifier, contactAccount.identifier)
    if (currentState === 'accepted') {
      throw new Error('Контакт уже установлен.')
    }
    if (currentState === 'blocked-by-me') {
      throw new Error('Вы заблокировали этот контакт.')
    }
    if (currentState === 'blocked-by-peer') {
      throw new Error('Пользователь заблокировал контакт с вами.')
    }
    if (currentState === 'pending-outgoing') {
      throw new Error('Заявка на контакт уже отправлена.')
    }
    if (currentState === 'pending-incoming') {
      throw new Error('Пользователь уже ждёт вашего ответа в разделе контактов.')
    }

    // Pending contact requests must stay out of the normal chat lists for both sides.
    // We keep a hidden direct room so preserved history can be reopened later through
    // Contacts or Search without granting accepted-contact messaging yet.
    this.ensureDialogForContact(account.identifier, contactAccount, {
      hidden: true,
    })
    this.upsertContactLink(account.identifier, contactAccount.identifier, {
      requesterIdentifier: account.identifier,
      status: 'pending',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier, contactAccount.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async acceptContactRequest(token: string, identifier: string): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedIdentifier = normalizeIdentifier(identifier)
    const requester = this.findAccount(normalizedIdentifier)
    if (!requester || isPublicDeletedAccount(requester)) {
      throw new Error('Пользователь не найден.')
    }

    const link = this.getContactLink(account.identifier, requester.identifier)
    if (!link || link.status !== 'pending' || link.requesterIdentifier !== requester.identifier) {
      throw new Error('Заявка на контакт не найдена.')
    }

    this.upsertContactLink(account.identifier, requester.identifier, {
      requesterIdentifier: requester.identifier,
      status: 'accepted',
    })

    // Accept is the only path that turns a pending request into a visible, canonical
    // direct dialog for both sides. All other pending actions must leave the room hidden.
    const accepterDialog = this.ensureDialogForContact(account.identifier, requester, {
      hidden: false,
    })
    const requesterDialog = this.ensureDialogForContact(requester.identifier, account, {
      hidden: false,
    })
    this.appendDirectSystemMessage(account.identifier, accepterDialog, 'Контакт установлен', {
      author: 'me',
    })
    this.appendDirectSystemMessage(requester.identifier, requesterDialog, 'Контакт установлен', {
      author: 'them',
      incrementUnread: true,
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier, requester.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async rejectContactRequest(token: string, identifier: string): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedIdentifier = normalizeIdentifier(identifier)
    const requester = this.findAccount(normalizedIdentifier)
    if (!requester || isPublicDeletedAccount(requester)) {
      throw new Error('Пользователь не найден.')
    }

    const link = this.getContactLink(account.identifier, requester.identifier)
    if (!link || link.status !== 'pending' || link.requesterIdentifier !== requester.identifier) {
      throw new Error('Заявка на контакт не найдена.')
    }

    // Reject clears only the pending relationship. It must not create or reveal
    // a visible direct chat for the requester.
    this.clearContactLink(account.identifier, requester.identifier)
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier, requester.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async cancelContactRequest(token: string, identifier: string): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedIdentifier = normalizeIdentifier(identifier)
    const recipient = this.findAccount(normalizedIdentifier)
    if (!recipient || isPublicDeletedAccount(recipient)) {
      throw new Error('Пользователь не найден.')
    }

    const link = this.getContactLink(account.identifier, recipient.identifier)
    if (!link || link.status !== 'pending' || link.requesterIdentifier !== account.identifier) {
      throw new Error('Заявка на контакт не найдена.')
    }

    // Cancel mirrors reject from the requester side: remove the pending request and
    // return the pair to request-required state while keeping any hidden history intact.
    this.clearContactLink(account.identifier, recipient.identifier)
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier, recipient.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async blockContactRequest(token: string, identifier: string): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedIdentifier = normalizeIdentifier(identifier)
    const requester = this.findAccount(normalizedIdentifier)
    if (!requester || isPublicDeletedAccount(requester)) {
      throw new Error('Пользователь не найден.')
    }

    // Blocking upgrades the pair into a server-authoritative denied state so future
    // contact requests cannot recreate the pending flow from the requester side.
    this.upsertContactLink(account.identifier, requester.identifier, {
      blockedByIdentifier: account.identifier,
      requesterIdentifier: requester.identifier,
      status: 'blocked',
    })
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier, requester.identifier],
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

    const directContactState = this.getContactState(account.identifier, dialog.phone)
    if (directContactState !== 'accepted') {
      if (directContactState === 'blocked-by-peer') {
        throw new Error('Пользователь заблокировал контакт с вами.')
      }
      if (directContactState === 'blocked-by-me') {
        throw new Error('Вы заблокировали этот контакт.')
      }
      throw new Error('Сначала отправьте запрос на контакт.')
    }

    const text = sanitizeMessageText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(account.identifier, payload.attachment)
    const sourceChannel = sanitizeSourceChannel(payload.sourceChannel)
    const sourceContact =
      sanitizeSourceContact(this.database, payload.sourceContact) ??
      resolveContactSourceReferenceFromText(this.database, text)
    const sourceGroup = sanitizeSourceGroup(payload.sourceGroup)
    if (!text && !attachment && !sourceChannel && !sourceContact && !sourceGroup) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }

    const senderReplyTo = sanitizeReplyTarget(payload.replyTo)
    const forwardedAuthorName = sanitizeForwardedAuthorName(payload.forwardedAuthorName)
    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    const duplicateMessage = this.findExistingDirectMessageByDeliveryId(
      account.identifier,
      dialog.id,
      normalizedClientDeliveryId,
    )
    if (duplicateMessage) {
      return {
        broadcastIdentifiers: [],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getUserStorageSubject(account.identifier),
        attachment.size,
        attachment.mediaUrl,
      )
    }

    const createdAt = new Date().toISOString()
    const deliveryId = this.resolveDeliveryId(normalizedClientDeliveryId)
    const time = formatNowTime()
    const recipientIdentifier = normalizeIdentifier(dialog.phone)
    const recipientAccount =
      recipientIdentifier && recipientIdentifier !== account.identifier
        ? this.findAccount(recipientIdentifier)
        : null

    if (
      !recipientAccount ||
      isPublicDeletedAccount(recipientAccount) ||
      isArchivedIdentifier(dialog.phone)
    ) {
      throw new Error('Нельзя отправить сообщение удалённому аккаунту.')
    }

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
      sourceContact,
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
        ? this.remapDirectReplyTargetForRecipient(
            account.identifier,
            dialog.id,
            recipientAccount.identifier,
            recipientDialog.id,
            senderReplyTo,
          )
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
        sourceContact,
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
    this.markAttachmentUploadLinked(attachment)

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
    options: DeleteDialogMessageBody = {},
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

    if (!removedMessage) {
      throw new Error('Сообщение не найдено.')
    }

    if (options.scope === 'everyone') {
      if (removedMessage.author !== 'me') {
        throw new Error('Удалить у всех можно только своё сообщение.')
      }

      const peerIdentifier = normalizeIdentifier(dialog.phone)
      const peerAccount =
        peerIdentifier && !isArchivedIdentifier(peerIdentifier)
          ? this.findAccount(peerIdentifier)
          : null

      const affectedIdentifiers = new Set<string>([account.identifier])
      const archivedAt = new Date().toISOString()
      const removedMediaUrls = collectMediaUrlsFromAttachment(removedMessage.attachment)

      removedMessage.archivedAt = archivedAt
      removedMessage.archivedReason = 'delete-message-everyone'
      if (dialog.pinnedMessageId === messageId) {
        dialog.pinnedMessageId = undefined
      }

      if (peerIdentifier && peerAccount && !isPublicDeletedAccount(peerAccount)) {
        const peerDialog = this.findDialogByPhone(peerAccount.identifier, account.identifier)
        if (peerDialog) {
          const peerCopy = this.database.dialogMessages.find((message) => {
            if (
              message.ownerIdentifier !== peerAccount.identifier ||
              message.dialogId !== peerDialog.id
            ) {
              return false
            }

            if (removedMessage.deliveryId && message.deliveryId) {
              return message.deliveryId === removedMessage.deliveryId
            }

            return (
              message.createdAt === removedMessage.createdAt &&
              message.text === removedMessage.text &&
              message.attachment?.mediaUrl === removedMessage.attachment?.mediaUrl &&
              message.author === 'them'
            )
          })

          if (peerCopy) {
            peerCopy.archivedAt = archivedAt
            peerCopy.archivedReason = 'delete-message-everyone'
            if (peerDialog.pinnedMessageId === peerCopy.id) {
              peerDialog.pinnedMessageId = undefined
            }
            affectedIdentifiers.add(peerAccount.identifier)
          }
        }
      }

      await this.persist()
      for (const mediaUrl of removedMediaUrls) {
        await this.deleteMediaIfUnreferenced(mediaUrl)
      }

      return {
        broadcastIdentifiers: [...affectedIdentifiers],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    // `Удалить у меня` is a local hide, not a server purge.
    // We retain the direct row for admin/legal recovery and hide it from normal snapshot/history via archive flags.
    removedMessage.archivedAt = new Date().toISOString()
    removedMessage.archivedReason = 'delete-message-me'
    if (dialog.pinnedMessageId === messageId) {
      dialog.pinnedMessageId = undefined
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteDialogHistory(
    token: string,
    dialogId: number,
    options: { scope?: 'everyone' | 'me' } = {},
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    if (options.scope === 'everyone') {
      const peerIdentifier = normalizeIdentifier(dialog.phone)
      const peerAccount =
        peerIdentifier && !isArchivedIdentifier(peerIdentifier)
          ? this.findAccount(peerIdentifier)
          : null

      const affectedIdentifiers = new Set<string>([account.identifier])
      const affectedDialogs: PersistedDialog[] = [dialog]

      if (peerIdentifier && peerAccount && !isPublicDeletedAccount(peerAccount)) {
        const peerDialog = this.findDialogByPhone(peerAccount.identifier, account.identifier)
        if (peerDialog) {
          affectedDialogs.push(peerDialog)
          affectedIdentifiers.add(peerAccount.identifier)
        }
      }

      const archivedAt = new Date().toISOString()
      const affectedDialogKeys = new Set(affectedDialogs.map((item) => `${item.ownerIdentifier}:${item.id}`))

      // `Удалить переписку у всех` must clear the room for both participants without destroying data.
      // The admin/legal layer still needs recoverable server-side history, so we archive direct messages
      // instead of filtering them out of the database permanently.
      for (const message of this.database.dialogMessages) {
        if (!affectedDialogKeys.has(`${message.ownerIdentifier}:${message.dialogId}`)) continue
        message.archivedAt = archivedAt
        message.archivedReason = 'delete-history-everyone'
      }

      for (const affectedDialog of affectedDialogs) {
        affectedDialog.pinnedMessageId = undefined
        affectedDialog.typing = false
        affectedDialog.unread = 0
      }

      await this.persist()

      return {
        broadcastIdentifiers: [...affectedIdentifiers],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    // Direct self-delete must stay recoverable for admin/legal export even if both sides clear the room locally.
    const archivedAt = new Date().toISOString()
    for (const message of this.database.dialogMessages) {
      if (message.ownerIdentifier !== account.identifier || message.dialogId !== dialogId || message.archivedAt) {
        continue
      }
      message.archivedAt = archivedAt
      message.archivedReason = 'delete-history-me'
    }
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

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const peerIdentifier = normalizeIdentifier(dialog.phone)
    const peerAccount =
      peerIdentifier && !isArchivedIdentifier(peerIdentifier)
        ? this.findAccount(peerIdentifier)
        : null

    const affectedIdentifiers = new Set<string>([account.identifier])
    const affectedDialogs: PersistedDialog[] = [dialog]

    if (peerIdentifier && peerAccount && !isPublicDeletedAccount(peerAccount)) {
      const peerDialog = this.findDialogByPhone(peerAccount.identifier, account.identifier)
      if (peerDialog) {
        affectedDialogs.push(peerDialog)
        affectedIdentifiers.add(peerAccount.identifier)
      }
    }

    // `Удалить контакт` is a symmetric hide, not a physical direct-history purge.
    // Per-side history remains attached to the hidden dialog copy and can be reopened via search.
    // The peer must also lose the visible dialog immediately; accepted contact state must not survive.
    for (const affectedDialog of affectedDialogs) {
      affectedDialog.hidden = true
      affectedDialog.typing = false
      affectedDialog.unread = 0
      affectedDialog.pinned = false
      affectedDialog.pinnedMessageId = undefined
    }

    for (const affectedIdentifier of affectedIdentifiers) {
      const ownerAccount = this.findAccount(affectedIdentifier)
      if (!ownerAccount) continue
      const ownerDialogIds = new Set(
        affectedDialogs
          .filter((candidate) => candidate.ownerIdentifier === affectedIdentifier)
          .map((candidate) => candidate.id),
      )
      ownerAccount.blockedContactIds = (ownerAccount.blockedContactIds ?? []).filter(
        (candidateId) => !ownerDialogIds.has(candidateId),
      )
    }

    if (peerIdentifier) {
      this.clearContactLink(account.identifier, peerIdentifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...affectedIdentifiers],
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
    this.assertGroupWritable(group)

    this.assertNotBlacklistedFromGroup(group, account.identifier)

    const text = sanitizeMessageText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(account.identifier, payload.attachment)
    const forwardedAuthorName = sanitizeForwardedAuthorName(payload.forwardedAuthorName)
    const sourceChannel = sanitizeSourceChannel(payload.sourceChannel)
    const sourceContact = resolveContactSourceReferenceFromText(this.database, text)
    const replyTo = sanitizeReplyTarget(payload.replyTo)
    if (!text && !attachment) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }

    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    const duplicateMessage = this.findExistingGroupMessageByDeliveryId(
      account.identifier,
      group.id,
      normalizedClientDeliveryId,
    )
    if (duplicateMessage) {
      return {
        broadcastIdentifiers: [],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getUserStorageSubject(account.identifier),
        attachment.size,
        attachment.mediaUrl,
      )
    }

    const createdAt = new Date().toISOString()
    const deliveryId = this.resolveDeliveryId(normalizedClientDeliveryId)
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
        sourceContact,
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
    this.markAttachmentUploadLinked(attachment)

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
    if (isArchivedThread(target.message)) {
      throw new Error('Тред находится в архиве и недоступен пользователям.')
    }

    this.assertCanCommentInGroup(target.group, account)

    const text = sanitizeThreadCommentText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(account.identifier, payload.attachment)
    if (!text && !attachment) {
      throw new Error('Комментарий не может быть пустым.')
    }
    const replyTo = sanitizeReplyTarget(payload.replyTo)
    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    if (
      this.hasExistingGroupThreadCommentDeliveryId(
        target.message,
        account.identifier,
        normalizedClientDeliveryId,
      )
    ) {
      return {
        broadcastIdentifiers: [],
        snapshot: this.buildSnapshot(account, token),
      }
    }
    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getUserStorageSubject(account.identifier),
        attachment.size,
        attachment.mediaUrl,
      )
    }
    const deliveryId = this.resolveDeliveryId(normalizedClientDeliveryId)

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
    const latestOwnComment = findLatestOwnThreadComment(
      compactThreadComments(target.message.threadComments),
      account.identifier,
    )
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestOwnComment),
      subscription: 'subscribed',
    })

    await this.persist()
    this.markAttachmentUploadLinked(attachment)

    return {
      broadcastIdentifiers,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendSupportTicket(
    token: string,
    payload: SendSupportTicketBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    const duplicateTicket = this.findExistingSupportTicketByDeliveryId(
      account.identifier,
      normalizedClientDeliveryId,
    )
    if (duplicateTicket) {
      return {
        broadcastIdentifiers: [],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    const cooldownUntil = getSupportTicketCooldownUntil(this.database, account.identifier)
    if (cooldownUntil) {
      throw new Error('Новую задачу для поддержки пока рано открывать.')
    }

    const text = sanitizeThreadCommentText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(account.identifier, payload.attachment)
    if (!text && !attachment) {
      throw new Error('Сообщение поддержки не может быть пустым.')
    }

    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getUserStorageSubject(account.identifier),
        attachment.size,
        attachment.mediaUrl,
      )
    }

    const createdAt = new Date().toISOString()
    // Support invariant:
    // root support messages create standalone globally numbered tickets starting from 0.
    // Replies must never create another root item in the feed; they live only inside ticket comments.
    const ticketNumber = Math.max(0, Math.floor(this.database.nextSupportTicketNumber))
    const threadId = this.buildSupportThreadId(ticketNumber)

    this.database.supportTickets.push({
      attachment,
      comments: [],
      createdAt,
      deliveryId: this.resolveDeliveryId(normalizedClientDeliveryId),
      id: ticketNumber,
      ownerIdentifier: account.identifier,
      replyTo: undefined,
      status: 'open',
      text,
      threadId,
      time: formatNowTime(),
      updatedAt: createdAt,
    })
    this.database.nextSupportTicketNumber = ticketNumber + 1
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(undefined, createdAt),
      subscription: 'subscribed',
    })

    await this.persist()
    this.markAttachmentUploadLinked(attachment)

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendSupportTicketComment(
    token: string,
    ticketId: number,
    payload: SendSupportTicketCommentBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const ticket = this.findSupportTicketForOwner(account.identifier, ticketId)
    if (!ticket) {
      throw new Error('Тикет поддержки не найден.')
    }

    const text = sanitizeThreadCommentText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(account.identifier, payload.attachment)
    if (!text && !attachment) {
      throw new Error('Комментарий не может быть пустым.')
    }

    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    if (this.hasExistingSupportCommentDeliveryId(ticket, account.identifier, normalizedClientDeliveryId)) {
      return {
        broadcastIdentifiers: [],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getUserStorageSubject(account.identifier),
        attachment.size,
        attachment.mediaUrl,
      )
    }

    const createdComment = this.appendCommentToSupportTicket(
      ticket,
      account,
      text,
      attachment,
      sanitizeReplyTarget(payload.replyTo),
      normalizedClientDeliveryId,
    )
    this.upsertThreadState(account.identifier, ticket.threadId, {
      ...buildThreadReadMarker(createdComment),
      subscription: 'subscribed',
    })

    await this.persist()
    this.markAttachmentUploadLinked(attachment)

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markSupportTicketRead(
    token: string,
    ticketId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const ticket = this.findSupportTicketForOwner(account.identifier, ticketId)
    if (!ticket) {
      throw new Error('Тикет поддержки не найден.')
    }

    const latestComment = findLatestThreadComment(compactThreadComments(ticket.comments))
    this.upsertThreadState(account.identifier, ticket.threadId, {
      ...buildThreadReadMarker(latestComment),
      subscription: 'subscribed',
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
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
    this.assertManagedChannelWritable(channel)

    const text = sanitizeMessageText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(account.identifier, payload.attachment)
    const sourceContact = resolveContactSourceReferenceFromText(this.database, text)
    if (!text && !attachment) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }
    const replyTo = sanitizeReplyTarget(payload.replyTo)

    this.ensureManagedChannelOwnerSubscriptionCopy(channel)
    const channelCopies = this.syncManagedChannelSubscriptionCopies(channel)

    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    const ownerSubscriptionCopy = this.findSubscriptionChannel(
      account.identifier,
      this.ensureSubscriptionChannelCopyForOwner(channel, account.identifier).id,
    )
    const duplicatePost = ownerSubscriptionCopy
      ? this.findExistingSubscriptionPostByDeliveryId(
          account.identifier,
          ownerSubscriptionCopy.id,
          normalizedClientDeliveryId,
        )
      : null
    if (duplicatePost) {
      return {
        broadcastIdentifiers: [],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getChannelStorageSubjectByHandle(channel.directLink),
        attachment.size,
        attachment.mediaUrl,
      )
    }

    const createdAt = new Date().toISOString()
    const time = formatNowTime()
    const deliveryId = this.resolveDeliveryId(normalizedClientDeliveryId)
    const fallbackPreview = buildManagedChannelFallbackPreview(channel)

    for (const channelCopy of channelCopies) {
      this.database.subscriptionPosts.push({
        channelId: channelCopy.id,
        createdAt,
        attachment,
        deliveryId,
        id: this.getNextSubscriptionPostId(channelCopy.ownerIdentifier, channelCopy.id),
        ownerIdentifier: channelCopy.ownerIdentifier,
        replyTo,
        sourceContact,
        text,
        threadComments: [],
        threadId: getSubscriptionPostThreadId(channelCopy, { createdAt, id: 0, text, time }),
        time,
      })

      channelCopy.preview = text || (attachment ? `Файл: ${attachment.fileName}` : fallbackPreview)
      channelCopy.time = time
      channelCopy.unread =
        channelCopy.ownerIdentifier === account.identifier || channelCopy.muted
          ? 0
          : channelCopy.unread + 1
    }

    await this.persist()
    this.markAttachmentUploadLinked(attachment)

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
    this.assertManagedChannelWritable(managedChannel)

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
    this.assertGroupWritable(group)

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
    this.assertGroupWritable(group)

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

    if (payload.description !== undefined) {
      const nextDescription = sanitizeChannelDescription(payload.description)
      for (const groupCopy of groupCopies) {
        groupCopy.description = nextDescription
      }
    }

    if (payload.showHistoryToNewMembers !== undefined) {
      for (const groupCopy of groupCopies) {
        groupCopy.showHistoryToNewMembers = Boolean(payload.showHistoryToNewMembers)
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
      const currentCreatorIdentifier = normalizeIdentifier(
        group.groupOwnerIdentifier ?? group.creatorIdentifier ?? group.ownerIdentifier,
      )

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

      this.transferGroupOwnership(sharedId, nextCreatorIdentifier)
      const nextOwnerAccount = this.findAccount(nextCreatorIdentifier)
      if (nextOwnerAccount) {
        this.appendGroupSystemEvent(sharedId, {
          actor: this.buildGroupSystemEventActor(nextOwnerAccount),
          kind: 'owner-transferred',
        })
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

    const sharedId = this.getSharedGroupId(group)
    const authoritativeParticipants = this.buildAuthoritativeGroupParticipants(sharedId)
    const alreadyParticipant = authoritativeParticipants.some(
      (participant) => normalizeIdentifier(participant.identifier ?? '') === recipientIdentifier,
    )
    if (alreadyParticipant) {
      throw new Error('Этот контакт уже состоит в группе.')
    }

    const creatorIdentifier = normalizeIdentifier(
      group.groupOwnerIdentifier ?? group.creatorIdentifier ?? group.ownerIdentifier,
    )
    const creatorAccount = this.findAccount(creatorIdentifier) ?? account
    const memberLimit = getGroupMemberLimit(creatorAccount)
    const currentMemberCount = authoritativeParticipants.length

    if (currentMemberCount >= memberLimit) {
      throw new Error(
        memberLimit === premiumGroupMemberLimit
          ? `Даже с премиумом владельца в группе может быть максимум ${premiumGroupMemberLimit} человек.`
          : `Максимальный размер одной группы — ${defaultGroupMemberLimit} человек. Чтобы приглашать больше людей, необходимо активировать премиум владельцу группы.`,
      )
    }

    const existingGroupCopies = this.listGroupCopies(sharedId)

    this.upsertPendingGroupInvitation(sharedId, account.identifier, recipientAccount.identifier)
    this.deliverDirectGroupInvitation(account, recipientAccount, group)

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

  async removeGroupParticipant(
    token: string,
    groupId: number,
    payload: ManageGroupParticipantBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }
    this.assertGroupWritable(group)

    const currentOwnerIdentifier = normalizeIdentifier(getCurrentGroupOwnerIdentifier(group))
    if (currentOwnerIdentifier !== account.identifier) {
      throw new Error('Только владелец группы может управлять участниками.')
    }

    const targetIdentifier = normalizeIdentifier(payload.identifier)
    if (!targetIdentifier) {
      throw new Error('Участник не найден.')
    }

    if (targetIdentifier === currentOwnerIdentifier) {
      throw new Error('Нельзя удалить владельца группы.')
    }

    const sharedId = this.getSharedGroupId(group)
    const authoritativeParticipants = this.buildAuthoritativeGroupParticipants(sharedId)
    if (
      !authoritativeParticipants.some(
        (participant) => normalizeIdentifier(participant.identifier ?? '') === targetIdentifier,
      )
    ) {
      throw new Error('Участник не найден.')
    }

    const groupCopies = this.listGroupCopies(sharedId)
    const removedGroupIds = new Set(
      groupCopies
        .filter((groupCopy) => groupCopy.ownerIdentifier === targetIdentifier)
        .map((groupCopy) => groupCopy.id),
    )
    if (removedGroupIds.size === 0) {
      throw new Error('Участник не найден.')
    }

    const nextParticipants = authoritativeParticipants.filter(
      (participant) => normalizeIdentifier(participant.identifier ?? '') !== targetIdentifier,
    )

    this.database.groups = this.database.groups.filter(
      (candidate) =>
        !(
          candidate.ownerIdentifier === targetIdentifier &&
          this.getSharedGroupId(candidate) === sharedId
        ),
    )
    this.database.groupMessages = this.database.groupMessages.filter(
      (candidate) => !(candidate.ownerIdentifier === targetIdentifier && removedGroupIds.has(candidate.groupId)),
    )
    this.database.threadStates = this.database.threadStates.filter(
      (threadState) =>
        !(
          threadState.ownerIdentifier === targetIdentifier &&
          threadState.threadId.startsWith(`group:${sharedId}:`)
        ),
    )
    this.clearPendingGroupInvitation(sharedId, targetIdentifier)
    this.syncGroupCopiesParticipants(sharedId, nextParticipants)

    const remainingCopies = this.listGroupCopies(sharedId)
    const broadcastIdentifiers = new Set<string>([
      account.identifier,
      targetIdentifier,
      ...remainingCopies.map((groupCopy) => groupCopy.ownerIdentifier),
    ])

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async blacklistGroupParticipant(
    token: string,
    groupId: number,
    payload: ManageGroupParticipantBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }
    this.assertGroupWritable(group)

    const currentOwnerIdentifier = normalizeIdentifier(getCurrentGroupOwnerIdentifier(group))
    if (currentOwnerIdentifier !== account.identifier) {
      throw new Error('Только владелец группы может управлять участниками.')
    }

    const targetIdentifier = normalizeIdentifier(payload.identifier)
    if (!targetIdentifier) {
      throw new Error('Участник не найден.')
    }

    if (targetIdentifier === currentOwnerIdentifier) {
      throw new Error('Нельзя добавить владельца в чёрный список.')
    }

    const sharedId = this.getSharedGroupId(group)
    const authoritativeParticipants = this.buildAuthoritativeGroupParticipants(sharedId)
    if (
      !authoritativeParticipants.some(
        (participant) => normalizeIdentifier(participant.identifier ?? '') === targetIdentifier,
      )
    ) {
      throw new Error('Участник не найден.')
    }

    const groupCopies = this.listGroupCopies(sharedId)
    const nextBlacklist = sanitizeIdentifierList([
      ...(group.commentBlacklistIdentifiers ?? []),
      targetIdentifier,
    ])
    for (const groupCopy of groupCopies) {
      groupCopy.commentBlacklistIdentifiers = nextBlacklist
    }

    const broadcastIdentifiers = new Set<string>([
      account.identifier,
      targetIdentifier,
      ...groupCopies.map((groupCopy) => groupCopy.ownerIdentifier),
    ])

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
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
    const creatorIdentifier = normalizeIdentifier(
      group.groupOwnerIdentifier ?? group.creatorIdentifier ?? group.ownerIdentifier,
    )
    const groupCopies = this.listGroupCopies(sharedId)

    if (creatorIdentifier === account.identifier) {
      this.assertGroupWritable(group)
      const archivedAt = new Date().toISOString()
      // User-facing "Удалить группу" is archival, not physical purge:
      // keep server-side records/history, but remove the group from ordinary user snapshots.
      this.archiveGroupCopies(sharedId, 'owner-deleted', archivedAt)

      await this.persist()

      return {
        broadcastIdentifiers: [...new Set(groupCopies.map((groupCopy) => groupCopy.ownerIdentifier))],
        snapshot: this.buildSnapshot(account, token),
      }
    }

    const nextParticipants = this.buildAuthoritativeGroupParticipants(sharedId).filter(
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
    const currentOwnerIdentifier = normalizeIdentifier(
      remainingCopies[0]
        ? getCurrentGroupOwnerIdentifier(remainingCopies[0])
        : getCurrentGroupOwnerIdentifier(group),
    )
    const hasLiveGroupAccess = remainingCopies.some((copy) => !isArchivedGroup(copy))
    if (hasLiveGroupAccess && currentOwnerIdentifier && currentOwnerIdentifier !== account.identifier) {
      // Group invite lifecycle invariant:
      // invite -> pending -> join clears -> self-leave restores.
      this.upsertPendingGroupInvitation(sharedId, currentOwnerIdentifier, account.identifier)
    }
    if (!account.quietModeEnabled) {
      this.appendGroupSystemEvent(sharedId, {
        actor: this.buildGroupSystemEventActor(account),
        kind: 'member-left',
      })
    }
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
    const suppressReadReceipts = shouldSuppressDirectReadReceipts(account)

    if (
      contactIdentifier &&
      contactIdentifier !== account.identifier &&
      justReadMessages.length > 0 &&
      !suppressReadReceipts
    ) {
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
    // Invisibility invariant:
    // Active invisible mode clears local unread, but must not leak direct read receipts to the peer.
    // Keep this coupled to shouldSuppressDirectReadReceipts so future changes cannot split invisibility
    // from one-tick behavior in direct dialogs.
    if (suppressReadReceipts) {
      for (const message of justReadMessages) {
        message.readAt = undefined
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
    if (isArchivedThread(target.message)) {
      throw new Error('Тред находится в архиве и недоступен пользователям.')
    }

    const threadId = getGroupMessageThreadId(target.group, target.message)
    const latestComment = findLatestThreadComment(compactThreadComments(target.message.threadComments))
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestComment, target.message.createdAt),
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
    const latestComment = findLatestThreadComment(compactThreadComments(target.message.threadComments))
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestComment, target.message.createdAt),
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
    const latestComment = findLatestThreadComment(compactThreadComments(target.message.threadComments))
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestComment, target.message.createdAt),
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

    if (
      isArchivedChannel(channel) &&
      (payload.commentsEnabledForAll !== undefined ||
        payload.commentsEnabledForPremium !== undefined ||
        payload.commentBlacklistIdentifiers !== undefined)
    ) {
      throw new Error('Канал находится в архиве и доступен только для чтения.')
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
    this.assertManagedChannelWritable(sourceManagedChannel)

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
    this.clearPendingChannelInvitation(sourceManagedChannel.directLink, targetIdentifier)

    this.ensureManagedChannelOwnerSubscriptionCopy(sourceManagedChannel)
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
    this.assertSubscriptionChannelWritable(channel)

    const sourceManagedChannel = this.findManagedChannelByHandle(channel.handle)
    if (!sourceManagedChannel || sourceManagedChannel.ownerIdentifier !== account.identifier) {
      throw new Error('Только владелец канала может управлять подписчиками.')
    }
    this.assertManagedChannelWritable(sourceManagedChannel)

    const targetIdentifier = normalizeIdentifier(payload.identifier)
    if (!targetIdentifier) {
      throw new Error('Подписчик не найден.')
    }

    if (targetIdentifier === account.identifier) {
      throw new Error('Нельзя добавить владельца в чёрный список.')
    }

    this.ensureManagedChannelOwnerSubscriptionCopy(sourceManagedChannel)
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
    if (isArchivedThread(target.post)) {
      throw new Error('Тред находится в архиве и недоступен пользователям.')
    }
    this.assertSubscriptionChannelWritable(target.channel)
    if (target.post.system) {
      throw new Error('Техническое сообщение канала не поддерживает комментарии.')
    }

    this.assertCanCommentInSubscriptionChannel(target.channel, account)

    const text = sanitizeThreadCommentText(payload.text)
    const attachment = this.assertOwnedPendingAttachment(account.identifier, payload.attachment)
    if (!text && !attachment) {
      throw new Error('Комментарий не может быть пустым.')
    }
    const replyTo = sanitizeReplyTarget(payload.replyTo)
    const normalizedClientDeliveryId = this.normalizeClientDeliveryId(payload.clientDeliveryId)
    if (
      this.hasExistingSubscriptionThreadCommentDeliveryId(
        target.post,
        account.identifier,
        normalizedClientDeliveryId,
      )
    ) {
      return {
        broadcastIdentifiers: [],
        snapshot: this.buildSnapshot(account, token),
      }
    }
    if (attachment) {
      await this.reclaimStorageForAttachmentUpload(
        this.getUserStorageSubject(account.identifier),
        attachment.size,
        attachment.mediaUrl,
      )
    }
    const deliveryId = this.resolveDeliveryId(normalizedClientDeliveryId)

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
    const latestOwnComment = findLatestOwnThreadComment(
      compactThreadComments(target.post.threadComments),
      account.identifier,
    )
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestOwnComment),
      subscription: 'subscribed',
    })

    await this.persist()
    this.markAttachmentUploadLinked(attachment)

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
    if (isArchivedThread(target.post)) {
      throw new Error('Тред находится в архиве и недоступен пользователям.')
    }
    if (target.post.system) {
      throw new Error('Техническое сообщение канала не поддерживает тред.')
    }

    const threadId = getSubscriptionPostThreadId(target.channel, target.post)
    const latestComment = findLatestThreadComment(compactThreadComments(target.post.threadComments))
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestComment, target.post.createdAt),
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
    if (target.post.system) {
      throw new Error('Техническое сообщение канала не поддерживает тред.')
    }

    const threadId = getSubscriptionPostThreadId(target.channel, target.post)
    const latestComment = findLatestThreadComment(compactThreadComments(target.post.threadComments))
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestComment, target.post.createdAt),
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
    const latestComment = findLatestThreadComment(compactThreadComments(target.post.threadComments))
    this.upsertThreadState(account.identifier, threadId, {
      ...buildThreadReadMarker(latestComment, target.post.createdAt),
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

    const targetChannel = this.database.subscriptionChannels.find(
      (channel) => channel.ownerIdentifier === account.identifier && channel.id === channelId,
    )
    if (!targetChannel) {
      throw new Error('Канал не найден.')
    }
    const normalizedHandle = sanitizeChannelDirectLink(targetChannel.handle) || targetChannel.handle

    this.database.subscriptionChannels = this.database.subscriptionChannels.filter(
      (channel) => !(channel.ownerIdentifier === account.identifier && channel.id === channelId),
    )
    this.database.subscriptionPosts = this.database.subscriptionPosts.filter(
      (post) => !(post.ownerIdentifier === account.identifier && post.channelId === channelId),
    )
    this.database.threadStates = this.database.threadStates.filter(
      (threadState) =>
        !(
          threadState.ownerIdentifier === account.identifier &&
          threadState.threadId.startsWith(`channel:${normalizedHandle}:`)
        ),
    )

    const broadcastIdentifiers = new Set<string>([account.identifier])
    const sourceManagedChannel = this.findManagedChannelByHandle(normalizedHandle)
    if (sourceManagedChannel) {
      this.ensureManagedChannelOwnerSubscriptionCopy(sourceManagedChannel)
      if (sourceManagedChannel.ownerIdentifier !== account.identifier) {
        this.upsertPendingChannelInvitation(
          sourceManagedChannel.directLink,
          sourceManagedChannel.ownerIdentifier,
          account.identifier,
        )
      }
      for (const channelCopy of this.syncManagedChannelSubscriptionCopies(sourceManagedChannel)) {
        broadcastIdentifiers.add(channelCopy.ownerIdentifier)
      }
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
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
    const statusText = sanitizeStatusField(payload.statusText ?? '')
    const description = sanitizeChannelDescription(payload.description ?? '')
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
      statusText: statusText || undefined,
      status: 'draft',
      title,
      visibility,
    })

    const createdChannel = this.findManagedChannel(account.identifier, channelId)
    if (createdChannel) {
      this.ensureManagedChannelOwnerSubscriptionCopy(createdChannel)
      this.createManagedChannelSystemPost(createdChannel, 'Канал создан')
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
    this.assertManagedChannelWritable(channel)

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
    this.ensureManagedChannelOwnerSubscriptionCopy(channel)

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

      if (!this.hasSubscriptionChannelCopyForOwner(channel.directLink, recipientAccount.identifier)) {
        this.upsertPendingChannelInvitation(channel.directLink, account.identifier, recipientAccount.identifier)
      }
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
    this.assertSubscriptionChannelWritable(subscriptionChannel)

    const sourceManagedChannel = this.findManagedChannelByHandle(subscriptionChannel.handle)
    if (!sourceManagedChannel) {
      throw new Error('Исходный канал не найден.')
    }
    this.assertManagedChannelWritable(sourceManagedChannel)

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
    this.ensureManagedChannelOwnerSubscriptionCopy(sourceManagedChannel)

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

      if (!this.hasSubscriptionChannelCopyForOwner(sourceManagedChannel.directLink, recipientAccount.identifier)) {
        this.upsertPendingChannelInvitation(
          sourceManagedChannel.directLink,
          account.identifier,
          recipientAccount.identifier,
        )
      }
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
    this.assertManagedChannelWritable(channel)

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

    if (payload.statusText !== undefined) {
      channel.statusText = sanitizeStatusField(payload.statusText) || undefined
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

    const legacyCopies = [
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
    for (const copy of legacyCopies) {
      if (copy.handle !== channel.directLink) {
        copy.handle = channel.directLink
      }
    }

    this.ensureManagedChannelOwnerSubscriptionCopy(channel)
    const subscriptionChannelCopies = this.syncManagedChannelSubscriptionCopies(channel)

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

  async transferManagedChannel(
    token: string,
    channelId: number,
    payload: TransferManagedChannelBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findManagedChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }
    this.assertManagedChannelWritable(channel)

    const targetIdentifier = normalizeIdentifier(payload.identifier)
    if (!targetIdentifier) {
      throw new Error('Получатель канала не найден.')
    }
    if (targetIdentifier === account.identifier) {
      throw new Error('Нельзя передать канал самому себе.')
    }
    if (!hasAccountPassword(account)) {
      throw new Error('Сначала задайте пароль в настройках профиля.')
    }

    const currentPasswordMatches = await verifyPassword(payload.currentPassword ?? '', account.passwordHash!)
    if (!currentPasswordMatches) {
      throw new Error('Неверный пароль.')
    }

    const targetAccount = this.findAccount(targetIdentifier)
    if (!targetAccount || isArchivedAccount(targetAccount)) {
      throw new Error('Аккаунт получателя не найден.')
    }

    const targetOwnedChannelCount = this.database.managedChannels.filter(
      (candidate) => candidate.ownerIdentifier === targetIdentifier,
    ).length
    if (targetOwnedChannelCount >= managedChannelsPerUserLimit) {
      throw new Error(
        `Один пользователь может управлять только ${managedChannelsPerUserLimit} каналами.`,
      )
    }

    const previousOwnerIdentifier = channel.ownerIdentifier

    // Channel transfer invariant:
    // transfer is a real owner reassignment, never a delete-flow, and must preserve
    // the managed entity plus all subscriber copies/history for every participant.
    channel.ownerIdentifier = targetIdentifier
    channel.id = this.getNextOwnedId(this.database.managedChannels, targetIdentifier)

    this.ensureManagedChannelOwnerSubscriptionCopy(channel)
    this.clearPendingChannelInvitation(channel.directLink, targetIdentifier)
    this.reassignPendingChannelInvitationSender(channel.directLink, targetIdentifier)

    const broadcastIdentifiers = new Set<string>([previousOwnerIdentifier, targetIdentifier])
    for (const channelCopy of this.syncManagedChannelSubscriptionCopies(channel)) {
      broadcastIdentifiers.add(channelCopy.ownerIdentifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...broadcastIdentifiers],
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
    this.assertManagedChannelWritable(channelToDelete)

    this.ensureManagedChannelOwnerSubscriptionCopy(channelToDelete)
    const normalizedHandle = sanitizeChannelDirectLink(channelToDelete.directLink) || channelToDelete.directLink
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
    // User-facing channel delete is also archival:
    // keep the managed entity for tombstone / historical invite resolution,
    // but hide it from active user-facing channel lists.
    this.archiveManagedChannel(channelToDelete, 'owner-deleted', new Date().toISOString())

    await this.persist()

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

    // Tariff limit for active owner groups is server-authoritative.
    // The client mirrors it for earlier UX, but stale bundles or direct API
    // calls must still be rejected here.
    const groupsPerUserLimit = hasActivePremium(account.premium, account.premiumExpiresAt)
      ? premiumGroupsPerUserLimit
      : defaultGroupsPerUserLimit
    // Count distinct active groups owned by this account, not per-participant copies.
    const activeOwnedGroupCount = new Set(
      this.database.groups
        .filter((group) => getCurrentGroupOwnerIdentifier(group) === account.identifier)
        .filter((group) => !shouldHideArchivedGroupForUsers(group))
        .map((group) => this.getSharedGroupId(group)),
    ).size
    if (activeOwnedGroupCount >= groupsPerUserLimit) {
      throw new Error(
        groupsPerUserLimit === premiumGroupsPerUserLimit
          ? `Даже с премиумом можно создать не больше ${premiumGroupsPerUserLimit} активных групп.`
          : `На бесплатном аккаунте можно создать только ${defaultGroupsPerUserLimit} групп. Чтобы создать больше, активируйте премиум.`,
      )
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
    const participants = [creatorParticipant]
    const sharedId = randomUUID()
    const nextGroup: PersistedGroup = {
      accent: payload.accent?.trim() || pickAccentForIdentifier(`${account.identifier}${groupId}`),
      avatarImage: payload.avatarImage?.trim() || undefined,
      commentBlacklistIdentifiers: sanitizeIdentifierList(payload.commentBlacklistIdentifiers),
      commentsEnabledForAll: Boolean(payload.commentsEnabledForAll),
      commentsEnabledForPremium: Boolean(payload.commentsEnabledForPremium),
      creatorIdentifier: account.identifier,
      description: sanitizeChannelDescription(payload.description ?? ''),
      groupOwnerIdentifier: account.identifier,
      handle: payload.handle?.trim()
        ? sanitizeGroupHandle(payload.handle, groupId)
        : buildGroupHandle(title, groupId),
      id: groupId,
      members: participants.length,
      muted: false,
      ownerIdentifier: account.identifier,
      participants,
      preview: 'Группа создана. Можно начинать обсуждение.',
      showHistoryToNewMembers: payload.showHistoryToNewMembers !== false,
      sharedId,
      time: formatNowTime(),
      title,
      unread: 0,
    }

    this.database.groups.push(nextGroup)
    this.clearPendingMediaUpload(nextGroup.avatarImage)

    for (const recipientAccount of recipientAccounts) {
      this.upsertPendingGroupInvitation(sharedId, account.identifier, recipientAccount.identifier)
      this.deliverDirectGroupInvitation(account, recipientAccount, nextGroup)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set([account.identifier, ...recipientAccounts.map((recipient) => recipient.identifier)])],
      groupId,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  private assertValidChallenge(
    identifier: string,
    code: string,
    expectedPurpose?: AuthChallengePurpose | AuthChallengePurpose[],
  ) {
    const allowedPurposes = expectedPurpose
      ? Array.isArray(expectedPurpose)
        ? expectedPurpose
        : [expectedPurpose]
      : null
    const challenge = this.database.authChallenges.find(
      (item) =>
        item.identifier === identifier &&
        (allowedPurposes === null || allowedPurposes.includes(item.purpose)),
    )

    if (!challenge) {
      throw new Error('Сначала запросите код подтверждения.')
    }

    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      this.clearChallenge(identifier, challenge.purpose)
      throw new Error('Код истёк. Запросите новый.')
    }

    if (challenge.code !== code.trim()) {
      throw new Error('Неверный код из SMS.')
    }

    return challenge
  }

  private buildSnapshot(account: Account, token: string): AppSnapshot {
    const supportTickets = materializeSupportTickets(this.database, account.identifier)
    const groups = materializeGroups(this.database, this.livePresenceCountsByIdentifier, account.identifier)
    const managedChannels = materializeManagedChannels(this.database, account.identifier).map((channel) => ({
      ...channel,
      storageUsage: this.getStorageSubjectUsage(
        this.getChannelStorageSubjectByHandle(channel.directLink),
      ),
    }))
    const subscriptionChannels = materializeSubscriptionChannels(
      this.database,
      this.livePresenceCountsByIdentifier,
      account.identifier,
    ).map((channel) => ({
      ...channel,
      storageUsage: this.getStorageSubjectUsage(this.getChannelStorageSubjectByHandle(channel.handle)),
    }))
    return {
      channels: managedChannels,
      chats: materializeChats(this.database, this.livePresenceCountsByIdentifier, account.identifier),
      contactRequests: materializeContactRequests(this.database, account.identifier),
      outgoingContactRequests: materializeOutgoingContactRequests(this.database, account.identifier),
      discoveryResults: cloneDiscoveryResults(),
      groups,
      session: {
        avatarImage: account.avatarImage,
        blockedAt: account.blockedAt,
        blockedReason: account.blockedReason,
        blockedContactIds: [...(account.blockedContactIds ?? [])],
        darkThemeEnabled: Boolean(account.darkThemeEnabled),
        displayName: account.displayName,
        gifLibrary: [...(account.gifLibrary ?? [])],
        identifier: account.identifier,
        invisibilityAutoEnabled: Boolean(account.invisibilityAutoEnabled),
        invisibilityEnabled: getStoredInvisibilityPreference(account),
        lastActiveAt: account.lastActiveAt,
        nickname: account.nickname ?? '',
        premium: account.premium ?? true,
        premiumExpiresAt: account.premiumExpiresAt ?? '',
        quietModeEnabled: Boolean(account.quietModeEnabled),
        quietModeSettings: getStoredQuietModeSettings(account),
        sessionToken: token,
        soundsDisabled: Boolean(account.soundsDisabled),
        staffRole: account.staffRole,
        storageUsage: this.getStorageUsage(account.identifier),
        status: account.status ?? '',
        surname: account.surname ?? '',
      } satisfies Session,
      subscriptionChannels,
      supportTicketCooldownUntil: getSupportTicketCooldownUntil(this.database, account.identifier),
      supportTickets,
      supportUnreadCount: supportTickets.reduce((sum, ticket) => sum + ticket.unreadCount, 0),
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
    if (!trimmed) {
      return null
    }

    const accountById = this.database.accounts.find((account) => account.accountId === trimmed)
    if (accountById) {
      return accountById
    }

    const directMatch = this.findAccount(trimmed)
    if (directMatch) {
      return directMatch
    }

    return this.findAccountsByOriginalIdentifier(trimmed)[0] ?? null
  }

  private buildAdminUserSummary(account: Account): AdminUserSummary {
    const adminVisible = getAdminVisibleAccount(account)
    const subject = this.getUserStorageSubject(account.identifier)
    return {
      archiveStorageUsage: this.getArchiveStorageUsage(subject),
      archiveUnlimited: subject.archiveUnlimited,
      avatarImage: adminVisible.avatarImage,
      blocked: isAccountBlocked(account),
      blockedAt: account.blockedAt,
      blockedReason: account.blockedReason?.trim() || undefined,
      createdAt: account.createdAt,
      deletedAt: account.deletedAt,
      deletedBySelfService: account.deletedBySelfService,
      deletionMode: account.deletionMode,
      displayName:
        formatAccountName({
          displayName: adminVisible.displayName,
          surname: adminVisible.surname,
        }) || account.identifier,
      identifier: account.identifier,
      lastActiveAt: account.lastActiveAt,
      nickname: normalizeNickname(adminVisible.nickname ?? '') || undefined,
      originalIdentifier: account.archivedOriginalIdentifier,
      premium: hasActivePremium(account.premium, account.premiumExpiresAt),
      premiumExpiresAt: account.premiumExpiresAt,
      staffRole: sanitizeStaffRole(account.staffRole),
      status: adminVisible.status,
      storageUsage: this.getStorageSubjectUsage(subject),
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

    if (entry.targetType === 'user-self-service') {
      const account = this.findAccountForAdmin(entry.targetId)
      if (account) {
        return `Self-service удаление аккаунта · ${buildAdminAuditAccountLabel(account)}`
      }

      const originalIdentifier =
        [entry.nextValue, entry.previousValue]
          .flatMap((candidate) => (candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? [candidate] : []))
          .map((candidate) => (candidate as { originalIdentifier?: string }).originalIdentifier?.trim())
          .find((candidate): candidate is string => Boolean(candidate)) ?? entry.targetId

      return `Self-service удаление аккаунта · ${originalIdentifier}`
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

    if (entry.targetType === 'support-ticket') {
      const ticket = this.findSupportTicketById(Number(entry.targetId))
      return ticket ? `Тикет поддержки · #${ticket.id}` : `Тикет поддержки · ${entry.targetId}`
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

    const matchesIdentifier = (value: string | undefined | null) => {
      const storedIdentifier = normalizeStoredIdentifierReference(value)
      if (storedIdentifier) {
        const directAccount = this.findAccount(storedIdentifier)
        if (directAccount && getAccountOriginalIdentifier(directAccount) === normalizedIdentifier) {
          return true
        }
      }

      return normalizeIdentifier(value ?? '') === normalizedIdentifier
    }

    const scan = (value: unknown): boolean => {
      if (!value) return false
      if (typeof value === 'string') {
        return matchesIdentifier(value)
      }
      if (Array.isArray(value)) {
        return value.some((item) => scan(item))
      }
      if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some((item) => scan(item))
      }
      return false
    }

    if (matchesIdentifier(entry.targetId)) {
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
            (user) => matchesIdentifier(user.identifier),
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
        ].some((value) => matchesIdentifier(value ?? ''))
      ) {
        return true
      }
    }

    if (entry.targetType === 'dialog') {
      const [ownerIdentifier, peerIdentifier] = entry.targetId.split('::')
      return (
        matchesIdentifier(ownerIdentifier) ||
        matchesIdentifier(peerIdentifier)
      )
    }

    if (entry.targetType === 'channel') {
      const handle = sanitizeChannelDirectLink(entry.targetId) || entry.targetId
      const channel = this.findManagedChannelByHandle(handle)
      if (channel && matchesIdentifier(channel.ownerIdentifier)) {
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
        resolveStoredIdentifierReference(
          group.groupOwnerIdentifier ?? group.creatorIdentifier ?? '',
          group.ownerIdentifier,
        )
      return (
        matchesIdentifier(group.ownerIdentifier) ||
        matchesIdentifier(creatorIdentifier)
      )
    }

    if (entry.targetType === 'thread') {
      const thread = this.adminListThreads('').find((candidate) => candidate.id === entry.targetId)
      if (thread && matchesIdentifier(thread.owner.identifier)) {
        return true
      }
    }

    if (entry.targetType === 'support-ticket') {
      const ticket = this.findSupportTicketById(Number(entry.targetId))
      if (ticket && matchesIdentifier(ticket.ownerIdentifier)) {
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

  private async appendSystemAuditLog(
    entry: Omit<AdminAuditLogRecord, 'actorIdentifier' | 'actorRole' | 'createdAt' | 'id'>,
  ) {
    this.database.adminAuditLogs.push({
      ...entry,
      actorIdentifier: 'system:self-service',
      actorRole: 'owner',
      createdAt: new Date().toISOString(),
      id: randomUUID(),
    })
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
              group?.groupOwnerIdentifier ||
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
    this.revokeSessionsForIdentifier(target.identifier)
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
      normalizeIdentifier(groupCopies[0]?.groupOwnerIdentifier ?? groupCopies[0]?.creatorIdentifier ?? '') ||
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

  async assertMediaUploadWithinQuota(
    token: string,
    size: number,
    kind: PersistedPendingMediaUpload['kind'] = 'attachment',
  ) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    if (kind === 'attachment') {
      // Upload-time quota can only know the uploader, not the final storage subject.
      // Root group/channel posts are charged to the group/channel at send-time, while
      // direct/support/thread attachments are charged to the author at send-time too.
      return
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
      // `linked` is the invariant that the stored file is already attached to a live entity.
      // Orphan cleanup must only reap uploads that never became part of a message/ticket/avatar flow.
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
    const now = Date.now()
    const cutoffTimestamp = now - historicalRetentionMs
    let didMutate = false
    const removedMediaUrls = new Set<string>()
    const summary = {
      adminAuditLogs: 0,
      adminReports: 0,
      authCodeSendAttempts: 0,
      contactReports: 0,
      dialogMessages: 0,
      dialogs: 0,
      groupMessages: 0,
      groups: 0,
      ipAccessLogs: 0,
      pendingChannelInvitations: 0,
      pendingGroupInvitations: 0,
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

    const authCodeAttemptCountBeforeCleanup = this.database.authCodeSendAttempts.length
    if (this.cleanupExpiredAuthCodeSendAttempts(now)) {
      summary.authCodeSendAttempts =
        authCodeAttemptCountBeforeCleanup - this.database.authCodeSendAttempts.length
      didMutate = true
    }

    const nextPendingChannelInvitations = this.database.pendingChannelInvitations.filter(
      (invitation) => !isTimestampOlderThan(invitation.createdAt, cutoffTimestamp),
    )
    if (nextPendingChannelInvitations.length !== this.database.pendingChannelInvitations.length) {
      summary.pendingChannelInvitations =
        this.database.pendingChannelInvitations.length - nextPendingChannelInvitations.length
      this.database.pendingChannelInvitations = nextPendingChannelInvitations
      didMutate = true
    }

    const nextPendingGroupInvitations = this.database.pendingGroupInvitations.filter(
      (invitation) => !isTimestampOlderThan(invitation.createdAt, cutoffTimestamp),
    )
    if (nextPendingGroupInvitations.length !== this.database.pendingGroupInvitations.length) {
      summary.pendingGroupInvitations =
        this.database.pendingGroupInvitations.length - nextPendingGroupInvitations.length
      this.database.pendingGroupInvitations = nextPendingGroupInvitations
      didMutate = true
    }

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
    for (const ticket of this.database.supportTickets) {
      if (ticket.threadId) {
        retainedThreadIds.add(ticket.threadId)
      }
    }
    const nextThreadStates = this.database.threadStates.filter((state) => retainedThreadIds.has(state.threadId))
    if (nextThreadStates.length !== this.database.threadStates.length) {
      this.database.threadStates = nextThreadStates
      didMutate = true
    }

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

  private getStorageUsage(ownerIdentifier: string): StorageQuotaUsage {
    return this.getStorageSubjectUsage(this.getUserStorageSubject(ownerIdentifier))
  }

  private buildStorageSubjectUsageResponse(subject: StorageSubjectDescriptor): StorageSubjectUsageResponse {
    return {
      archiveUnlimited: subject.archiveUnlimited,
      archiveUsage: this.getArchiveStorageUsage(subject),
      storageUsage: this.getStorageSubjectUsage(subject),
    }
  }

  private buildUserStorageItemId(kind: UserStorageInventoryItem['kind'], mediaUrl: string) {
    // Storage item ids are consumed by a DELETE route, so the mediaUrl part must stay path-safe.
    return `${kind}:${Buffer.from(mediaUrl, 'utf8').toString('base64url')}`
  }

  private parseUserStorageItemId(storageItemId: string): {
    kind: UserStorageInventoryItem['kind']
    mediaUrl: string
  } | null {
    const separatorIndex = storageItemId.indexOf(':')
    if (separatorIndex <= 0) return null

    const kind = storageItemId.slice(0, separatorIndex)
    const encodedMediaUrl = storageItemId.slice(separatorIndex + 1).trim()
    if ((kind !== 'attachment' && kind !== 'gif') || !encodedMediaUrl) {
      return null
    }

    let mediaUrl = ''
    try {
      mediaUrl = Buffer.from(encodedMediaUrl, 'base64url').toString('utf8').trim()
    } catch {
      return null
    }
    if (!mediaUrl) {
      return null
    }

    return {
      kind,
      mediaUrl,
    }
  }

  private assertOwnedPendingAttachment(
    ownerIdentifier: string,
    attachment?: Message['attachment'],
  ): NonNullable<Message['attachment']> | undefined {
    const sanitizedAttachment = sanitizeMessageAttachment(attachment)
    if (!sanitizedAttachment) {
      return undefined
    }

    const ownedGif = (this.findAccount(ownerIdentifier)?.gifLibrary ?? []).find(
      (item) => item.mediaUrl === sanitizedAttachment.mediaUrl,
    )
    if (ownedGif) {
      if (
        ownedGif.fileName !== sanitizedAttachment.fileName ||
        ownedGif.mimeType !== sanitizedAttachment.mimeType ||
        ownedGif.size !== sanitizedAttachment.size
      ) {
        throw new Error(invalidOwnedAttachmentMessage)
      }

      return {
        ...sanitizedAttachment,
        height: sanitizedAttachment.height ?? ownedGif.height,
        width: sanitizedAttachment.width ?? ownedGif.width,
      }
    }

    const pendingUpload = this.database.pendingMediaUploads.find(
      (upload) =>
        upload.ownerIdentifier === ownerIdentifier &&
        upload.mediaUrl === sanitizedAttachment.mediaUrl &&
        upload.kind === 'attachment',
    )
    if (!pendingUpload) {
      throw new Error(invalidOwnedAttachmentMessage)
    }

    // `mediaUrl` is client-provided metadata, not proof of ownership.
    // Every message/comment attachment must resolve back to the sender's own registered upload.
    if (
      pendingUpload.fileName !== sanitizedAttachment.fileName ||
      pendingUpload.mimeType !== sanitizedAttachment.mimeType ||
      pendingUpload.size !== sanitizedAttachment.size
    ) {
      throw new Error(invalidOwnedAttachmentMessage)
    }

    return sanitizedAttachment
  }

  private normalizeClientDeliveryId(clientDeliveryId?: string) {
    const normalizedDeliveryId = clientDeliveryId?.trim()
    return normalizedDeliveryId || undefined
  }

  private findExistingDirectMessageByDeliveryId(
    ownerIdentifier: string,
    dialogId: number,
    deliveryId?: string,
  ) {
    if (!deliveryId) return null
    return (
      this.database.dialogMessages.find(
        (message) =>
          message.ownerIdentifier === ownerIdentifier &&
          message.dialogId === dialogId &&
          message.deliveryId === deliveryId &&
          !message.archivedAt,
      ) ?? null
    )
  }

  private findDirectMessageById(
    ownerIdentifier: string,
    dialogId: number,
    messageId: number,
  ) {
    return (
      this.database.dialogMessages.find(
        (message) =>
          message.ownerIdentifier === ownerIdentifier &&
          message.dialogId === dialogId &&
          message.id === messageId &&
          !message.archivedAt,
      ) ?? null
    )
  }

  private findMirroredDirectMessage(
    ownerIdentifier: string,
    dialogId: number,
    sourceMessage: PersistedDialogMessage,
  ) {
    return (
      this.database.dialogMessages.find((message) => {
        if (
          message.ownerIdentifier !== ownerIdentifier ||
          message.dialogId !== dialogId ||
          message.archivedAt
        ) {
          return false
        }

        if (sourceMessage.deliveryId && message.deliveryId) {
          return sourceMessage.deliveryId === message.deliveryId
        }

        return (
          message.createdAt === sourceMessage.createdAt &&
          message.text === sourceMessage.text &&
          message.attachment?.mediaUrl === sourceMessage.attachment?.mediaUrl &&
          message.author === invertMessageAuthor(sourceMessage.author)
        )
      }) ?? null
    )
  }

  private remapDirectReplyTargetForRecipient(
    senderOwnerIdentifier: string,
    senderDialogId: number,
    recipientOwnerIdentifier: string,
    recipientDialogId: number,
    replyTo: NonNullable<Message['replyTo']>,
  ): Message['replyTo'] {
    const sourceMessage = this.findDirectMessageById(senderOwnerIdentifier, senderDialogId, replyTo.id)
    const mirroredMessage = sourceMessage
      ? this.findMirroredDirectMessage(recipientOwnerIdentifier, recipientDialogId, sourceMessage)
      : null

    return {
      author: invertMessageAuthor(replyTo.author),
      id: mirroredMessage?.id ?? 0,
      text: replyTo.text,
    }
  }

  private findExistingGroupMessageByDeliveryId(
    ownerIdentifier: string,
    groupId: number,
    deliveryId?: string,
  ) {
    if (!deliveryId) return null
    return (
      this.database.groupMessages.find(
        (message) =>
          message.ownerIdentifier === ownerIdentifier &&
          message.groupId === groupId &&
          message.deliveryId === deliveryId,
      ) ?? null
    )
  }

  private findExistingSupportTicketByDeliveryId(
    ownerIdentifier: string,
    deliveryId?: string,
  ) {
    if (!deliveryId) return null
    return (
      this.database.supportTickets.find(
        (ticket) => ticket.ownerIdentifier === ownerIdentifier && ticket.deliveryId === deliveryId,
      ) ?? null
    )
  }

  private hasExistingSupportCommentDeliveryId(
    ticket: PersistedSupportTicket,
    authorIdentifier: string,
    deliveryId?: string,
  ) {
    if (!deliveryId) return false
    return ticket.comments.some(
      (comment) =>
        normalizeIdentifier(comment.authorIdentifier ?? '') === authorIdentifier &&
        comment.deliveryId === deliveryId,
    )
  }

  private hasExistingGroupThreadCommentDeliveryId(
    message: PersistedGroupMessage,
    authorIdentifier: string,
    deliveryId?: string,
  ) {
    if (!deliveryId) return false
    return compactThreadComments(message.threadComments).some(
      (comment) =>
        normalizeIdentifier(comment.authorIdentifier ?? '') === authorIdentifier &&
        comment.deliveryId === deliveryId,
    )
  }

  private findExistingSubscriptionPostByDeliveryId(
    ownerIdentifier: string,
    channelId: number,
    deliveryId?: string,
  ) {
    if (!deliveryId) return null
    return (
      this.database.subscriptionPosts.find(
        (post) =>
          post.ownerIdentifier === ownerIdentifier &&
          post.channelId === channelId &&
          post.deliveryId === deliveryId,
      ) ?? null
    )
  }

  private hasExistingSubscriptionThreadCommentDeliveryId(
    post: PersistedSubscriptionPost,
    authorIdentifier: string,
    deliveryId?: string,
  ) {
    if (!deliveryId) return false
    return compactThreadComments(post.threadComments).some(
      (comment) =>
        normalizeIdentifier(comment.authorIdentifier ?? '') === authorIdentifier &&
        comment.deliveryId === deliveryId,
    )
  }

  private markAttachmentUploadLinked(attachment?: Message['attachment']) {
    if (!attachment) return
    // Every successful send-path must land here so non-direct attachments never stay orphan-cleanup eligible.
    this.clearPendingMediaUpload(attachment.mediaUrl)
  }

  private getDirectMessageAttachmentOwnerIdentifier(message: PersistedDialogMessage) {
    return message.author === 'me'
      ? message.ownerIdentifier
      : normalizeIdentifier(this.findDialog(message.ownerIdentifier, message.dialogId)?.phone ?? '') ||
          message.ownerIdentifier
  }

  private getUserStorageSubject(identifier: string): StorageSubjectDescriptor {
    const account = this.findAccount(identifier)
    return {
      archiveQuotaBytes: getEffectiveUserArchiveStorageQuotaBytes(account),
      archiveUnlimited: Boolean(account?.archiveUnlimited),
      id: identifier,
      kind: 'user',
      primaryQuotaBytes: getEffectiveUserStorageQuotaBytes(account),
    }
  }

  private getChannelStorageSubjectByHandle(handle: string): StorageSubjectDescriptor {
    const managedChannel = this.findManagedChannelByHandle(handle)
    const fallbackOwnerIdentifier = managedChannel ? managedChannel.ownerIdentifier : ''
    const fallbackTitle = managedChannel ? managedChannel.title : handle
    return {
      archiveQuotaBytes: channelArchiveStorageQuotaBytes,
      archiveUnlimited: Boolean(managedChannel?.archiveUnlimited),
      id: buildAdminChannelAggregateKey(
        managedChannel ?? {
          directLink: handle,
          ownerIdentifier: fallbackOwnerIdentifier,
          title: fallbackTitle,
        },
      ),
      kind: 'channel',
      primaryQuotaBytes: channelStorageQuotaBytes,
    }
  }

  private getSubscriptionPostStorageSubject(post: PersistedSubscriptionPost): StorageSubjectDescriptor {
    const handle = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)?.handle ?? ''
    return this.getChannelStorageSubjectByHandle(handle)
  }

  private getStorageSubjectUsage(subject: StorageSubjectDescriptor): StorageQuotaUsage {
    const trackedMedia = new Map<string, number>()

    for (const upload of this.database.pendingMediaUploads) {
      if (subject.kind !== 'user') continue
      if (upload.ownerIdentifier !== subject.id) continue
      if (upload.linked) continue
      trackedMedia.set(upload.mediaUrl, upload.size)
    }

    for (const reference of this.collectOwnedMediaReferences()) {
      if (reference.storageSubjectKind !== subject.kind || reference.storageSubjectId !== subject.id) continue
      if (reference.archiveReason || reference.archivedAt) continue
      if (!trackedMedia.has(reference.mediaUrl)) {
        trackedMedia.set(reference.mediaUrl, reference.size)
      }
    }

    const usedBytes = [...trackedMedia.values()].reduce((total, size) => total + size, 0)
    return buildStorageQuotaUsage(usedBytes, subject.primaryQuotaBytes)
  }

  private isMediaTrackedInPrimaryStorage(subject: StorageSubjectDescriptor, mediaUrl?: string) {
    if (!mediaUrl) return false

    for (const upload of this.database.pendingMediaUploads) {
      if (subject.kind !== 'user') continue
      if (upload.ownerIdentifier !== subject.id) continue
      if (upload.linked) continue
      if (upload.mediaUrl === mediaUrl) {
        return true
      }
    }

    return this.collectOwnedMediaReferences().some(
      (reference) =>
        reference.mediaUrl === mediaUrl &&
        reference.storageSubjectKind === subject.kind &&
        reference.storageSubjectId === subject.id &&
        !reference.archiveReason &&
        !reference.archivedAt,
    )
  }

  private getArchiveStorageUsage(subject: StorageSubjectDescriptor): StorageArchiveUsage {
    const trackedMedia = new Map<string, number>()

    for (const item of this.database.archivedMedia) {
      if (item.storageSubjectKind !== subject.kind || item.storageSubjectId !== subject.id) continue
      trackedMedia.set(item.mediaUrl, item.size)
    }

    // Retention-only direct rows still belong to archive accounting even though they are hidden
    // from the regular storage screen and no longer participate in primary quota.
    for (const reference of this.collectOwnedMediaReferences()) {
      if (reference.storageSubjectKind !== subject.kind || reference.storageSubjectId !== subject.id) continue
      if (!reference.archiveReason && !reference.archivedAt) continue
      if (!trackedMedia.has(reference.mediaUrl)) {
        trackedMedia.set(reference.mediaUrl, reference.size)
      }
    }

    const usedBytes = [...trackedMedia.values()].reduce((total, size) => total + size, 0)
    return {
      ...buildStorageQuotaUsage(usedBytes, subject.archiveQuotaBytes),
      unlimited: subject.archiveUnlimited,
    }
  }

  private getGroupMessageAttachmentOwnerIdentifier(message: PersistedGroupMessage) {
    return message.author === 'me'
      ? message.ownerIdentifier
      : normalizeIdentifier(
          this.findGroup(message.ownerIdentifier, message.groupId)
            ?.participants.find((participant) => participant.id === message.groupParticipantId)
            ?.identifier ?? '',
        ) || message.ownerIdentifier
  }

  private getSubscriptionPostAttachmentOwnerIdentifier(post: PersistedSubscriptionPost) {
    const channelHandle = this.findSubscriptionChannel(post.ownerIdentifier, post.channelId)?.handle ?? ''
    return this.findManagedChannelByHandle(channelHandle)?.ownerIdentifier ?? post.ownerIdentifier
  }

  private buildStorageCleanupCandidates(subject: StorageSubjectDescriptor) {
    const candidatesByMediaUrl = new Map<string, StorageCleanupCandidate>()

    const upsertCandidate = (
      createdAt: string | undefined,
      mediaUrl: string | undefined,
      candidateSubject: StorageSubjectDescriptor,
    ) => {
      if (!createdAt || !mediaUrl) return
      if (candidateSubject.kind !== subject.kind || candidateSubject.id !== subject.id) return

      const existing = candidatesByMediaUrl.get(mediaUrl)
      if (!existing || Date.parse(createdAt) < Date.parse(existing.createdAt)) {
        candidatesByMediaUrl.set(mediaUrl, {
          createdAt,
          mediaUrl,
          storageSubjectId: candidateSubject.id,
          storageSubjectKind: candidateSubject.kind,
        })
      }
    }

    // Product rule: messenger attachments are disposable storage.
    // When quota runs out, we reclaim the oldest previously sent attachments first.
    for (const message of this.database.dialogMessages) {
      // Archived direct rows are retention-only. They stay recoverable for admin/legal export,
      // but must not re-enter user-facing quota cleanup once the user hid them from the dialog UI.
      if (message.archivedAt) continue
      upsertCandidate(
        message.createdAt,
        sanitizeMessageAttachment(message.attachment)?.mediaUrl,
        this.getUserStorageSubject(this.getDirectMessageAttachmentOwnerIdentifier(message)),
      )
    }

    for (const message of this.database.groupMessages) {
      upsertCandidate(
        message.createdAt,
        sanitizeMessageAttachment(message.attachment)?.mediaUrl,
        this.getUserStorageSubject(this.getGroupMessageAttachmentOwnerIdentifier(message)),
      )

      for (const comment of compactThreadComments(message.threadComments)) {
        upsertCandidate(
          comment.createdAt,
          sanitizeMessageAttachment(comment.attachment)?.mediaUrl,
          this.getUserStorageSubject(normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier),
        )
      }
    }

    for (const post of this.database.subscriptionPosts) {
      upsertCandidate(
        post.createdAt,
        sanitizeMessageAttachment(post.attachment)?.mediaUrl,
        this.getSubscriptionPostStorageSubject(post),
      )

      for (const comment of compactThreadComments(post.threadComments)) {
        upsertCandidate(
          comment.createdAt,
          sanitizeMessageAttachment(comment.attachment)?.mediaUrl,
          this.getUserStorageSubject(normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier),
        )
      }
    }

    for (const ticket of this.database.supportTickets) {
      upsertCandidate(
        ticket.createdAt,
        sanitizeMessageAttachment(ticket.attachment)?.mediaUrl,
        this.getUserStorageSubject(ticket.ownerIdentifier),
      )

      for (const comment of compactThreadComments(ticket.comments)) {
        upsertCandidate(
          comment.createdAt,
          sanitizeMessageAttachment(comment.attachment)?.mediaUrl,
          this.getUserStorageSubject(normalizeIdentifier(comment.authorIdentifier ?? '') || ticket.ownerIdentifier),
        )
      }
    }

    return [...candidatesByMediaUrl.values()].sort((left, right) => {
      const leftTimestamp = Date.parse(left.createdAt)
      const rightTimestamp = Date.parse(right.createdAt)
      return leftTimestamp - rightTimestamp
    })
  }

  private getStorageQuotaNoticeText(
    subject: StorageSubjectDescriptor,
    perspective: AttachmentRemovedNoticePerspective,
  ) {
    if (subject.kind === 'user') {
      return buildStorageQuotaAttachmentRemovedNoticeText(perspective)
    }

    return 'Вложение автоматически убрано из активного хранилища канала, чтобы освободить место.'
  }

  private getStorageManualNoticeText(
    subject: StorageSubjectDescriptor,
    perspective: AttachmentRemovedNoticePerspective,
  ) {
    if (subject.kind === 'user') {
      return buildStorageManualAttachmentRemovedNoticeText(perspective)
    }

    return 'Вложение удалено из хранилища канала владельцем настроек.'
  }

  private buildAttachmentRemovedNoticeForSubject(
    subject: StorageSubjectDescriptor,
    reason: AttachmentRemovedNotice['reason'],
  ): NonNullable<Message['attachmentRemovedNotice']> {
    const perspective = subject.kind === 'user' ? 'self' : 'author'
    return {
      perspective,
      reason,
      removedAt: new Date().toISOString(),
      text:
        reason === 'storage-manual'
          ? this.getStorageManualNoticeText(subject, perspective)
          : this.getStorageQuotaNoticeText(subject, perspective),
    }
  }

  private collectArchivedMediaRestoreTargetsForSubject(
    subject: StorageSubjectDescriptor,
    mediaUrl: string,
  ): PersistedArchivedMediaRestoreTarget[] {
    const targetsByKey = new Map<string, PersistedArchivedMediaRestoreTarget>()

    const upsertTarget = (key: string, target: PersistedArchivedMediaRestoreTarget) => {
      targetsByKey.set(key, target)
    }

    for (const message of this.database.dialogMessages) {
      const attachment = sanitizeMessageAttachment(message.attachment)
      if (!attachment || attachment.mediaUrl !== mediaUrl) continue
      const messageSubject = this.getUserStorageSubject(this.getDirectMessageAttachmentOwnerIdentifier(message))
      if (messageSubject.kind !== subject.kind || messageSubject.id !== subject.id) continue
      upsertTarget(`dialog:${message.ownerIdentifier}:${message.dialogId}:${message.id}`, {
        attachment,
        dialogId: message.dialogId,
        kind: 'dialog-message',
        messageId: message.id,
        ownerIdentifier: message.ownerIdentifier,
      })
    }

    for (const message of this.database.groupMessages) {
      const attachment = sanitizeMessageAttachment(message.attachment)
      if (attachment?.mediaUrl === mediaUrl) {
        const messageSubject = this.getUserStorageSubject(this.getGroupMessageAttachmentOwnerIdentifier(message))
        if (messageSubject.kind === subject.kind && messageSubject.id === subject.id) {
          upsertTarget(`group:${message.ownerIdentifier}:${message.groupId}:${message.id}`, {
            attachment,
            groupId: message.groupId,
            kind: 'group-message',
            messageId: message.id,
            ownerIdentifier: message.ownerIdentifier,
          })
        }
      }

      for (const comment of compactThreadComments(message.threadComments)) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment || commentAttachment.mediaUrl !== mediaUrl) continue
        const commentSubject = this.getUserStorageSubject(
          normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier,
        )
        if (commentSubject.kind !== subject.kind || commentSubject.id !== subject.id) continue
        upsertTarget(`group-comment:${message.ownerIdentifier}:${message.groupId}:${message.id}:${comment.id}`, {
          attachment: commentAttachment,
          commentId: comment.id,
          groupId: message.groupId,
          kind: 'group-thread-comment',
          messageId: message.id,
          ownerIdentifier: message.ownerIdentifier,
        })
      }
    }

    for (const post of this.database.subscriptionPosts) {
      const attachment = sanitizeMessageAttachment(post.attachment)
      if (attachment?.mediaUrl === mediaUrl) {
        const postSubject = this.getSubscriptionPostStorageSubject(post)
        if (postSubject.kind === subject.kind && postSubject.id === subject.id) {
          upsertTarget(`channel:${post.ownerIdentifier}:${post.channelId}:${post.id}`, {
            attachment,
            channelId: post.channelId,
            kind: 'channel-post',
            ownerIdentifier: post.ownerIdentifier,
            postId: post.id,
          })
        }
      }

      for (const comment of compactThreadComments(post.threadComments)) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment || commentAttachment.mediaUrl !== mediaUrl) continue
        const commentSubject = this.getUserStorageSubject(
          normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier,
        )
        if (commentSubject.kind !== subject.kind || commentSubject.id !== subject.id) continue
        upsertTarget(
          `channel-comment:${post.ownerIdentifier}:${post.channelId}:${post.id}:${comment.id}`,
          {
            attachment: commentAttachment,
            channelId: post.channelId,
            commentId: comment.id,
            kind: 'channel-thread-comment',
            ownerIdentifier: post.ownerIdentifier,
            postId: post.id,
          },
        )
      }
    }

    for (const ticket of this.database.supportTickets) {
      if (subject.kind !== 'user' || ticket.ownerIdentifier !== subject.id) continue
      const attachment = sanitizeMessageAttachment(ticket.attachment)
      if (attachment?.mediaUrl === mediaUrl) {
        upsertTarget(`support:${ticket.ownerIdentifier}:${ticket.id}`, {
          attachment,
          kind: 'support-ticket',
          ownerIdentifier: ticket.ownerIdentifier,
          ticketId: ticket.id,
        })
      }

      for (const comment of compactThreadComments(ticket.comments)) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment || commentAttachment.mediaUrl !== mediaUrl) continue
        const commentSubject = this.getUserStorageSubject(
          normalizeIdentifier(comment.authorIdentifier ?? '') || ticket.ownerIdentifier,
        )
        if (commentSubject.kind !== subject.kind || commentSubject.id !== subject.id) continue
        upsertTarget(`support-comment:${ticket.ownerIdentifier}:${ticket.id}:${comment.id}`, {
          attachment: commentAttachment,
          commentId: comment.id,
          kind: 'support-ticket-comment',
          ownerIdentifier: ticket.ownerIdentifier,
          ticketId: ticket.id,
        })
      }
    }

    return [...targetsByKey.values()]
  }

  private restoreAttachmentReferencesForArchivedMedia(item: PersistedArchivedMediaRecord) {
    const affectedIdentifiers = new Set<string>()

    const restoreTargetEntity = <
      Entity extends {
        attachment?: MessageAttachment
        attachmentRemovedNotice?: Message['attachmentRemovedNotice']
      },
    >(
      entity: Entity | undefined,
      attachment: MessageAttachment,
      ownerIdentifier: string,
    ) => {
      if (!entity) {
        return
      }

      if (entity.attachment?.mediaUrl === attachment.mediaUrl) {
        if (entity.attachmentRemovedNotice?.reason === 'storage-quota') {
          entity.attachmentRemovedNotice = undefined
        }
        affectedIdentifiers.add(ownerIdentifier)
        return
      }

      if (entity.attachment || entity.attachmentRemovedNotice?.reason !== 'storage-quota') {
        return
      }

      entity.attachment = { ...attachment }
      entity.attachmentRemovedNotice = undefined
      affectedIdentifiers.add(ownerIdentifier)
    }

    for (const target of item.restoreTargets ?? []) {
      if (target.kind === 'dialog-message') {
        restoreTargetEntity(
          this.database.dialogMessages.find(
            (message) =>
              message.ownerIdentifier === target.ownerIdentifier &&
              message.dialogId === target.dialogId &&
              message.id === target.messageId,
          ),
          target.attachment,
          target.ownerIdentifier,
        )
        continue
      }

      if (target.kind === 'group-message') {
        restoreTargetEntity(
          this.database.groupMessages.find(
            (message) =>
              message.ownerIdentifier === target.ownerIdentifier &&
              message.groupId === target.groupId &&
              message.id === target.messageId,
          ),
          target.attachment,
          target.ownerIdentifier,
        )
        continue
      }

      if (target.kind === 'group-thread-comment') {
        const message = this.database.groupMessages.find(
          (candidate) =>
            candidate.ownerIdentifier === target.ownerIdentifier &&
            candidate.groupId === target.groupId &&
            candidate.id === target.messageId,
        )
        restoreTargetEntity(
          compactThreadComments(message?.threadComments).find((comment) => comment.id === target.commentId),
          target.attachment,
          target.ownerIdentifier,
        )
        continue
      }

      if (target.kind === 'channel-post') {
        restoreTargetEntity(
          this.database.subscriptionPosts.find(
            (post) =>
              post.ownerIdentifier === target.ownerIdentifier &&
              post.channelId === target.channelId &&
              post.id === target.postId,
          ),
          target.attachment,
          target.ownerIdentifier,
        )
        continue
      }

      if (target.kind === 'channel-thread-comment') {
        const post = this.database.subscriptionPosts.find(
          (candidate) =>
            candidate.ownerIdentifier === target.ownerIdentifier &&
            candidate.channelId === target.channelId &&
            candidate.id === target.postId,
        )
        restoreTargetEntity(
          compactThreadComments(post?.threadComments).find((comment) => comment.id === target.commentId),
          target.attachment,
          target.ownerIdentifier,
        )
        continue
      }

      if (target.kind === 'support-ticket') {
        restoreTargetEntity(
          this.database.supportTickets.find(
            (ticket) =>
              ticket.ownerIdentifier === target.ownerIdentifier && ticket.id === target.ticketId,
          ),
          target.attachment,
          target.ownerIdentifier,
        )
        continue
      }

      if (target.kind === 'support-ticket-comment') {
        const ticket = this.database.supportTickets.find(
          (candidate) =>
            candidate.ownerIdentifier === target.ownerIdentifier && candidate.id === target.ticketId,
        )
        restoreTargetEntity(
          compactThreadComments(ticket?.comments).find((comment) => comment.id === target.commentId),
          target.attachment,
          target.ownerIdentifier,
        )
      }
    }

    return [...affectedIdentifiers]
  }

  private restoreArchivedMediaIntoPrimaryStorageIfQuotaAllows(subject: StorageSubjectDescriptor) {
    const affectedIdentifiers = new Set<string>()
    const archivedItems = [...this.database.archivedMedia]
      .filter(
        (item) =>
          item.storageSubjectKind === subject.kind &&
          item.storageSubjectId === subject.id &&
          item.archiveReason === 'storage-quota',
      )
      .sort((left, right) => (parseIsoDate(right.archivedAt) ?? 0) - (parseIsoDate(left.archivedAt) ?? 0))

    for (const item of archivedItems) {
      const additionalBytes = this.isMediaTrackedInPrimaryStorage(subject, item.mediaUrl) ? 0 : item.size
      if (this.getStorageSubjectUsage(subject).usedBytes + additionalBytes > subject.primaryQuotaBytes) {
        continue
      }

      for (const identifier of this.restoreAttachmentReferencesForArchivedMedia(item)) {
        affectedIdentifiers.add(identifier)
      }

      if (!this.isMediaTrackedInPrimaryStorage(subject, item.mediaUrl)) {
        continue
      }

      this.database.archivedMedia = this.database.archivedMedia.filter((candidate) => candidate.id !== item.id)
    }

    return [...affectedIdentifiers]
  }

  private archiveMediaForSubject(
    subject: StorageSubjectDescriptor,
    reference: OwnedStoredMediaReference,
    archiveReason: StorageArchiveReason,
  ) {
    const existing = this.database.archivedMedia.find(
      (item) =>
        item.mediaUrl === reference.mediaUrl &&
        item.storageSubjectKind === subject.kind &&
        item.storageSubjectId === subject.id,
    )
    if (existing) {
      existing.archivedAt = new Date().toISOString()
      existing.archiveReason = archiveReason
      existing.originalContext = reference.primaryLabel
      existing.ownerIdentifier = reference.ownerIdentifier
      if (archiveReason !== 'storage-quota') {
        existing.restoreTargets = undefined
      }
      return existing
    }

    const nextArchiveRecord: PersistedArchivedMediaRecord = {
      archivedAt: new Date().toISOString(),
      archiveReason,
      fileName: reference.fileName,
      height: reference.height,
      id: randomUUID(),
      kind: reference.kind === 'user-gif' ? 'gif' : 'attachment',
      mediaUrl: reference.mediaUrl,
      mimeType: reference.mimeType,
      originalContext: reference.primaryLabel,
      ownerIdentifier: reference.ownerIdentifier,
      primaryLabel: reference.primaryLabel,
      restoreTargets: undefined,
      size: reference.size,
      storageSubjectId: subject.id,
      storageSubjectKind: subject.kind,
      width: reference.width,
    }
    this.database.archivedMedia.push(nextArchiveRecord)
    return nextArchiveRecord
  }

  private async rotateArchiveStorageIfNeeded(subject: StorageSubjectDescriptor) {
    if (subject.archiveUnlimited) {
      return
    }

    const items = [...this.database.archivedMedia]
      .filter((item) => item.storageSubjectKind === subject.kind && item.storageSubjectId === subject.id)
      .sort((left, right) => (parseIsoDate(left.archivedAt) ?? 0) - (parseIsoDate(right.archivedAt) ?? 0))

    let usage = this.getArchiveStorageUsage(subject).usedBytes
    const removedMediaUrls: string[] = []

    for (const item of items) {
      if (usage <= subject.archiveQuotaBytes) {
        break
      }
      usage -= item.size
      this.database.archivedMedia = this.database.archivedMedia.filter((candidate) => candidate.id !== item.id)
      removedMediaUrls.push(item.mediaUrl)
    }

    if (removedMediaUrls.length === 0) {
      return
    }

    await this.persist()
    for (const mediaUrl of removedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
    }
  }

  private async archiveReferencesForSubject(
    subject: StorageSubjectDescriptor,
    mediaUrl: string,
    archiveReason: StorageArchiveReason,
  ) {
    for (const reference of this.collectOwnedMediaReferences()) {
      if (reference.mediaUrl !== mediaUrl) continue
      if (reference.storageSubjectKind !== subject.kind || reference.storageSubjectId !== subject.id) continue
      if (reference.archivedAt) continue
      this.archiveMediaForSubject(subject, reference, archiveReason)
    }
    if (archiveReason === 'storage-quota') {
      const restoreTargets = this.collectArchivedMediaRestoreTargetsForSubject(subject, mediaUrl)
      const archivedItem = this.database.archivedMedia.find(
        (item) =>
          item.mediaUrl === mediaUrl &&
          item.storageSubjectKind === subject.kind &&
          item.storageSubjectId === subject.id,
      )
      if (archivedItem) {
        archivedItem.restoreTargets = restoreTargets.length > 0 ? restoreTargets : archivedItem.restoreTargets
      }
    }
    await this.rotateArchiveStorageIfNeeded(subject)
  }

  private removeAttachmentReferencesForSubject(
    subject: StorageSubjectDescriptor,
    mediaUrl: string,
    attachmentRemovedNotice: NonNullable<Message['attachmentRemovedNotice']>,
  ) {
    const affectedIdentifiers = new Set<string>()

    for (const message of this.database.dialogMessages) {
      const messageSubject = this.getUserStorageSubject(this.getDirectMessageAttachmentOwnerIdentifier(message))
      if (messageSubject.kind !== subject.kind || messageSubject.id !== subject.id) continue
      if (message.attachment?.mediaUrl !== mediaUrl) continue
      // Product contract: reclaim only the stored file. The message bubble stays in
      // history with an explanatory notice for both sides instead of disappearing.
      message.attachment = undefined
      message.attachmentRemovedNotice = attachmentRemovedNotice
      affectedIdentifiers.add(message.ownerIdentifier)
    }

    for (const message of this.database.groupMessages) {
      const messageSubject = this.getUserStorageSubject(this.getGroupMessageAttachmentOwnerIdentifier(message))
      if (
        message.attachment?.mediaUrl === mediaUrl &&
        messageSubject.kind === subject.kind &&
        messageSubject.id === subject.id
      ) {
        message.attachment = undefined
        message.attachmentRemovedNotice = attachmentRemovedNotice
        affectedIdentifiers.add(message.ownerIdentifier)
      }

      for (const comment of compactThreadComments(message.threadComments)) {
        if (comment.attachment?.mediaUrl !== mediaUrl) continue
        const commentSubject = this.getUserStorageSubject(
          normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier,
        )
        if (commentSubject.kind !== subject.kind || commentSubject.id !== subject.id) {
          continue
        }

        comment.attachment = undefined
        comment.attachmentRemovedNotice = attachmentRemovedNotice
        affectedIdentifiers.add(message.ownerIdentifier)
      }
    }

    for (const post of this.database.subscriptionPosts) {
      const postSubject = this.getSubscriptionPostStorageSubject(post)
      if (
        post.attachment?.mediaUrl === mediaUrl &&
        postSubject.kind === subject.kind &&
        postSubject.id === subject.id
      ) {
        post.attachment = undefined
        post.attachmentRemovedNotice = attachmentRemovedNotice
        affectedIdentifiers.add(post.ownerIdentifier)
      }

      for (const comment of compactThreadComments(post.threadComments)) {
        if (comment.attachment?.mediaUrl !== mediaUrl) continue
        const commentSubject = this.getUserStorageSubject(
          normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier,
        )
        if (commentSubject.kind !== subject.kind || commentSubject.id !== subject.id) {
          continue
        }

        comment.attachment = undefined
        comment.attachmentRemovedNotice = attachmentRemovedNotice
        affectedIdentifiers.add(post.ownerIdentifier)
      }
    }

    for (const ticket of this.database.supportTickets) {
      if (subject.kind !== 'user' || ticket.ownerIdentifier !== subject.id) continue

      if (ticket.attachment?.mediaUrl === mediaUrl) {
        ticket.attachment = undefined
        ticket.attachmentRemovedNotice = attachmentRemovedNotice
        affectedIdentifiers.add(ticket.ownerIdentifier)
      }

      for (const comment of compactThreadComments(ticket.comments)) {
        if (comment.attachment?.mediaUrl !== mediaUrl) continue
        const commentSubject = this.getUserStorageSubject(
          normalizeIdentifier(comment.authorIdentifier ?? '') || ticket.ownerIdentifier,
        )
        if (commentSubject.kind !== subject.kind || commentSubject.id !== subject.id) {
          continue
        }

        comment.attachment = undefined
        comment.attachmentRemovedNotice = attachmentRemovedNotice
        affectedIdentifiers.add(ticket.ownerIdentifier)
      }
    }

    return [...affectedIdentifiers]
  }

  private async reclaimStorageForAttachmentUpload(
    subject: StorageSubjectDescriptor,
    size: number,
    mediaUrl?: string,
  ) {
    const additionalBytes = this.isMediaTrackedInPrimaryStorage(subject, mediaUrl) ? 0 : size
    const usage = this.getStorageSubjectUsage(subject)
    if (usage.usedBytes + additionalBytes <= usage.quotaBytes) {
      return 0
    }

    const evictedMediaUrls: string[] = []
    // Keep cleanup stable and predictable: evict oldest previously sent attachments first
    // and stop as soon as the new upload fits. This is a messenger, not archival storage.
    for (const candidate of this.buildStorageCleanupCandidates(subject)) {
      if (this.getStorageSubjectUsage(subject).usedBytes + additionalBytes <= usage.quotaBytes) {
        break
      }

      await this.archiveReferencesForSubject(subject, candidate.mediaUrl, 'storage-quota')
      if (
        this.removeAttachmentReferencesForSubject(
          subject,
          candidate.mediaUrl,
          this.buildAttachmentRemovedNoticeForSubject(subject, 'storage-quota'),
        ).length === 0
      ) {
        continue
      }

      evictedMediaUrls.push(candidate.mediaUrl)
    }

    if (evictedMediaUrls.length === 0) {
      return 0
    }

    await this.persist()
    for (const mediaUrl of evictedMediaUrls) {
      await this.deleteMediaIfUnreferenced(mediaUrl)
    }

    return evictedMediaUrls.length
  }

  private collectOwnedMediaReferences(): OwnedStoredMediaReference[] {
    const references: OwnedStoredMediaReference[] = []

    // Product rule: user-manageable storage excludes every avatar surface.
    // Profile/group/channel avatars live in Tinychok-owned external storage and must not
    // inflate user quota or appear in the self-service storage manager.
    for (const account of this.database.accounts) {
      const userSubject = this.getUserStorageSubject(account.identifier)
      for (const gif of account.gifLibrary ?? []) {
        references.push({
          createdAt: gif.createdAt,
          fileName: gif.fileName,
          height: gif.height,
          kind: 'user-gif',
          mediaUrl: gif.mediaUrl,
          mimeType: gif.mimeType,
          ownerIdentifier: account.identifier,
          primaryLabel: 'GIF из библиотеки',
          size: gif.size,
          storageSubjectId: userSubject.id,
          storageSubjectKind: userSubject.kind,
          width: gif.width,
        })
      }
    }

    for (const message of this.database.dialogMessages) {
      const attachment = sanitizeMessageAttachment(message.attachment)
      if (!attachment) continue
      const messageOwnerIdentifier = this.getDirectMessageAttachmentOwnerIdentifier(message)
      const userSubject = this.getUserStorageSubject(messageOwnerIdentifier)
      references.push({
        archiveReason: message.archivedReason,
        archivedAt: message.archivedAt,
        createdAt: message.createdAt,
        fileName: attachment.fileName,
        height: attachment.height,
        kind: inferStoredMediaKind(attachment.mediaUrl) ?? 'attachment',
        mediaUrl: attachment.mediaUrl,
        mimeType: attachment.mimeType,
        ownerIdentifier: messageOwnerIdentifier,
        primaryLabel: 'Вложение в диалоге',
        size: attachment.size,
        storageSubjectId: userSubject.id,
        storageSubjectKind: userSubject.kind,
        width: attachment.width,
      })
    }

    for (const message of this.database.groupMessages) {
      const attachment = sanitizeMessageAttachment(message.attachment)
      if (attachment) {
        const authorSubject = this.getUserStorageSubject(this.getGroupMessageAttachmentOwnerIdentifier(message))
        references.push({
          createdAt: message.createdAt,
          fileName: attachment.fileName,
          height: attachment.height,
          kind: inferStoredMediaKind(attachment.mediaUrl) ?? 'attachment',
          mediaUrl: attachment.mediaUrl,
          mimeType: attachment.mimeType,
          ownerIdentifier: this.getGroupMessageAttachmentOwnerIdentifier(message),
          primaryLabel: 'Вложение в группе',
          size: attachment.size,
          storageSubjectId: authorSubject.id,
          storageSubjectKind: authorSubject.kind,
          width: attachment.width,
        })
      }

      for (const comment of message.threadComments ?? []) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment) continue
        const commentOwnerIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || message.ownerIdentifier
        const commentSubject = this.getUserStorageSubject(commentOwnerIdentifier)
        references.push({
          createdAt: comment.createdAt,
          fileName: commentAttachment.fileName,
          height: commentAttachment.height,
          kind: inferStoredMediaKind(commentAttachment.mediaUrl) ?? 'attachment',
          mediaUrl: commentAttachment.mediaUrl,
          mimeType: commentAttachment.mimeType,
          ownerIdentifier: commentOwnerIdentifier,
          primaryLabel: 'Комментарий в группе',
          size: commentAttachment.size,
          storageSubjectId: commentSubject.id,
          storageSubjectKind: commentSubject.kind,
          width: commentAttachment.width,
        })
      }
    }

    for (const post of this.database.subscriptionPosts) {
      const attachment = sanitizeMessageAttachment(post.attachment)
      if (attachment) {
        const postSubject = this.getSubscriptionPostStorageSubject(post)
        references.push({
          createdAt: post.createdAt,
          fileName: attachment.fileName,
          height: attachment.height,
          kind: inferStoredMediaKind(attachment.mediaUrl) ?? 'attachment',
          mediaUrl: attachment.mediaUrl,
          mimeType: attachment.mimeType,
          ownerIdentifier: this.getSubscriptionPostAttachmentOwnerIdentifier(post),
          primaryLabel: 'Пост в канале',
          size: attachment.size,
          storageSubjectId: postSubject.id,
          storageSubjectKind: postSubject.kind,
          width: attachment.width,
        })
      }

      for (const comment of post.threadComments ?? []) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment) continue
        const commentOwnerIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || post.ownerIdentifier
        const commentSubject = this.getUserStorageSubject(commentOwnerIdentifier)
        references.push({
          createdAt: comment.createdAt,
          fileName: commentAttachment.fileName,
          height: commentAttachment.height,
          kind: inferStoredMediaKind(commentAttachment.mediaUrl) ?? 'attachment',
          mediaUrl: commentAttachment.mediaUrl,
          mimeType: commentAttachment.mimeType,
          ownerIdentifier: commentOwnerIdentifier,
          primaryLabel: 'Комментарий в канале',
          size: commentAttachment.size,
          storageSubjectId: commentSubject.id,
          storageSubjectKind: commentSubject.kind,
          width: commentAttachment.width,
        })
      }
    }

    for (const ticket of this.database.supportTickets) {
      const attachment = sanitizeMessageAttachment(ticket.attachment)
      if (attachment) {
        const ticketSubject = this.getUserStorageSubject(ticket.ownerIdentifier)
        references.push({
          createdAt: ticket.createdAt,
          fileName: attachment.fileName,
          height: attachment.height,
          kind: inferStoredMediaKind(attachment.mediaUrl) ?? 'attachment',
          mediaUrl: attachment.mediaUrl,
          mimeType: attachment.mimeType,
          ownerIdentifier: ticket.ownerIdentifier,
          primaryLabel: 'Обращение в поддержку',
          size: attachment.size,
          storageSubjectId: ticketSubject.id,
          storageSubjectKind: ticketSubject.kind,
          width: attachment.width,
        })
      }

      for (const comment of compactThreadComments(ticket.comments)) {
        const commentAttachment = sanitizeMessageAttachment(comment.attachment)
        if (!commentAttachment) continue
        const commentOwnerIdentifier = normalizeIdentifier(comment.authorIdentifier ?? '') || ticket.ownerIdentifier
        const commentSubject = this.getUserStorageSubject(commentOwnerIdentifier)
        references.push({
          createdAt: comment.createdAt,
          fileName: commentAttachment.fileName,
          height: commentAttachment.height,
          kind: inferStoredMediaKind(commentAttachment.mediaUrl) ?? 'attachment',
          mediaUrl: commentAttachment.mediaUrl,
          mimeType: commentAttachment.mimeType,
          ownerIdentifier: commentOwnerIdentifier,
          primaryLabel: 'Комментарий в поддержке',
          size: commentAttachment.size,
          storageSubjectId: commentSubject.id,
          storageSubjectKind: commentSubject.kind,
          width: commentAttachment.width,
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

  private buildPrimaryStorageInventoryForSubject(subject: StorageSubjectDescriptor): UserStorageInventoryItem[] {
    const itemsByMediaUrl = new Map<string, UserStorageInventoryItem>()

    for (const reference of this.collectOwnedMediaReferences()) {
      if (reference.storageSubjectKind !== subject.kind || reference.storageSubjectId !== subject.id) continue
      if (reference.kind !== 'attachment' && reference.kind !== 'user-gif') continue
      // Storage manager must only show actively user-manageable media, never retention-only direct archives.
      if (reference.archiveReason) continue
      if (reference.archivedAt) continue

      const inventoryKind = reference.kind === 'user-gif' ? 'gif' : 'attachment'
      const existing = itemsByMediaUrl.get(reference.mediaUrl)
      if (!existing) {
        itemsByMediaUrl.set(reference.mediaUrl, {
          createdAt: reference.createdAt ?? new Date(0).toISOString(),
          fileName: reference.fileName,
          height: reference.height,
          id: this.buildUserStorageItemId(inventoryKind, reference.mediaUrl),
          kind: inventoryKind,
          mediaUrl: reference.mediaUrl,
          mimeType: reference.mimeType,
          primaryLabel: reference.primaryLabel,
          size: reference.size,
          usageCount: 1,
          width: reference.width,
        })
        continue
      }

      // Storage manager works with unique media objects, not per-message rows:
      // the same file reused in multiple bubbles must still render as one deletable tile.
      existing.usageCount += 1
      if (Date.parse(reference.createdAt ?? '') > Date.parse(existing.createdAt)) {
        existing.createdAt = reference.createdAt ?? existing.createdAt
        existing.fileName = reference.fileName
        existing.height = reference.height
        existing.mimeType = reference.mimeType
        existing.primaryLabel = reference.primaryLabel
        existing.width = reference.width
      }
    }

    return [...itemsByMediaUrl.values()].sort((left, right) => {
      return Date.parse(right.createdAt) - Date.parse(left.createdAt)
    })
  }

  private buildArchiveStorageInventoryForSubject(subject: StorageSubjectDescriptor): StorageArchiveInventoryItem[] {
    const itemsByMediaUrl = new Map<string, StorageArchiveInventoryItem>()

    for (const item of this.database.archivedMedia) {
      if (item.storageSubjectKind !== subject.kind || item.storageSubjectId !== subject.id) continue
      const existing = itemsByMediaUrl.get(item.mediaUrl)
      if (!existing) {
        itemsByMediaUrl.set(item.mediaUrl, {
          ...item,
          usageCount: 1,
        })
        continue
      }

      existing.usageCount += 1
      if ((parseIsoDate(item.archivedAt) ?? 0) > (parseIsoDate(existing.archivedAt) ?? 0)) {
        itemsByMediaUrl.set(item.mediaUrl, {
          ...item,
          usageCount: existing.usageCount,
        })
      }
    }

    return [...itemsByMediaUrl.values()].sort(
      (left, right) => (parseIsoDate(right.archivedAt) ?? 0) - (parseIsoDate(left.archivedAt) ?? 0),
    )
  }

  private collectAdminOwnedMediaExportItems(
    subject: StorageSubjectDescriptor,
    options?: { archiveOnly?: boolean; currentOnly?: boolean },
  ): AdminOwnedMediaExportItem[] {
    const itemsByMediaUrl = new Map<string, AdminOwnedMediaExportItem>()

    for (const reference of this.collectOwnedMediaReferences()) {
      if (reference.storageSubjectKind !== subject.kind || reference.storageSubjectId !== subject.id) continue
      if (reference.kind !== 'attachment' && reference.kind !== 'user-gif') continue
      if (options?.archiveOnly && !reference.archiveReason && !reference.archivedAt) continue
      if (options?.currentOnly && (reference.archiveReason || reference.archivedAt)) continue

      // Do not reuse the self-service storage screen data here: current/admin inventory
      // still needs canonical live references, not just what the self-service tiles show.
      const normalizedKind: AdminOwnedMediaExportItem['kind'] =
        reference.kind === 'user-gif' ? 'gif' : 'attachment'
      const existing = itemsByMediaUrl.get(reference.mediaUrl)

      if (!existing) {
        itemsByMediaUrl.set(reference.mediaUrl, {
          archiveReason: reference.archiveReason,
          contexts: [{
            archiveReason: reference.archiveReason,
            createdAt: reference.createdAt,
            primaryLabel: reference.primaryLabel,
          }],
          createdAt: reference.createdAt,
        fileName: reference.fileName,
        height: reference.height,
        kind: normalizedKind,
        mediaUrl: reference.mediaUrl,
        mimeType: reference.mimeType,
        ownerIdentifier: reference.ownerIdentifier ?? '',
        primaryLabel: reference.primaryLabel,
        retentionOnly: Boolean(reference.archiveReason),
        size: reference.size,
          storageKind: reference.kind,
          usageCount: 1,
          width: reference.width,
        })
        continue
      }

      existing.usageCount += 1
      existing.contexts.push({
        archiveReason: reference.archiveReason,
        createdAt: reference.createdAt,
        primaryLabel: reference.primaryLabel,
      })
      existing.retentionOnly = existing.retentionOnly && Boolean(reference.archiveReason)
      if (reference.archiveReason) {
        const joinedReasons = [existing.archiveReason, reference.archiveReason].filter(Boolean)
        existing.archiveReason = [...new Set(joinedReasons)].join(', ') || undefined
      }
      if (reference.kind === 'user-gif') {
        existing.kind = 'gif'
        existing.storageKind = 'user-gif'
      }
      if (Date.parse(reference.createdAt ?? '') > Date.parse(existing.createdAt ?? '')) {
        existing.createdAt = reference.createdAt ?? existing.createdAt
        existing.fileName = reference.fileName
        existing.height = reference.height
        existing.mimeType = reference.mimeType
        existing.primaryLabel = reference.primaryLabel
        existing.size = reference.size
        existing.width = reference.width
      }
    }

    return [...itemsByMediaUrl.values()]
      .map((item) => ({
        ...item,
        archiveReason: item.retentionOnly ? item.archiveReason : undefined,
        contexts: [...item.contexts].sort(
          (left, right) => (parseIsoDate(right.createdAt) ?? 0) - (parseIsoDate(left.createdAt) ?? 0),
        ),
      }))
      .sort((left, right) => (parseIsoDate(right.createdAt) ?? 0) - (parseIsoDate(left.createdAt) ?? 0))
  }

  private collectAdminArchivedMediaExportItems(subject: StorageSubjectDescriptor): AdminOwnedMediaExportItem[] {
    const itemsByMediaUrl = new Map<string, AdminOwnedMediaExportItem>()

    for (const item of this.buildArchiveStorageInventoryForSubject(subject)) {
      const storageKind: PersistedPendingMediaUpload['kind'] = item.kind === 'gif' ? 'user-gif' : 'attachment'
      itemsByMediaUrl.set(item.mediaUrl, {
        archiveReason: item.archiveReason,
        archivedAt: item.archivedAt,
        contexts: [{
          archiveReason: item.archiveReason,
          createdAt: item.archivedAt,
          primaryLabel: item.primaryLabel,
        }],
        createdAt: item.archivedAt,
        fileName: item.fileName,
        height: item.height,
        kind: item.kind,
        mediaUrl: item.mediaUrl,
        mimeType: item.mimeType,
        ownerIdentifier: item.ownerIdentifier ?? '',
        originalContext: item.originalContext,
        primaryLabel: item.primaryLabel,
        retentionOnly: item.archiveReason === 'retention-delete',
        size: item.size,
        storageKind,
        usageCount: item.usageCount,
        width: item.width,
      })
    }

    // Archive export must reflect only the real archive storage inventory.
    // Retention-only direct rows stay recoverable through canonical admin/legal exports,
    // but must not leak into archive storage export or duplicate live primary media there.

    return [...itemsByMediaUrl.values()].sort(
      (left, right) => (parseIsoDate(right.archivedAt ?? right.createdAt) ?? 0) - (parseIsoDate(left.archivedAt ?? left.createdAt) ?? 0),
    )
  }

  private resolveAdminStorageSubject(
    kind: StorageSubjectKind,
    subjectId: string,
  ): {
    auditLabel: string
    auditTargetId: string
    auditTargetType: 'user' | 'group' | 'channel'
    exportBaseName: string
    subject: StorageSubjectDescriptor
  } {
    if (kind === 'user') {
      const target = this.findAccountForAdmin(subjectId)
      if (!target) {
        throw new Error('Пользователь не найден.')
      }
      return {
        auditLabel: buildAdminAuditAccountLabel(target),
        auditTargetId: target.identifier,
        auditTargetType: 'user',
        exportBaseName: sanitizeExportFileName(target.displayName) || target.identifier,
        subject: this.getUserStorageSubject(target.identifier),
      }
    }

    if (kind === 'group') {
      throw new Error('Хранилище групп отключено. Медиа группы хранится в личном хранилище автора.')
    }

    const normalizedHandle = sanitizeChannelDirectLink(subjectId) || subjectId.trim()
    const channel = this.findManagedChannelByHandle(normalizedHandle)
    if (!channel) {
      throw new Error('Канал не найден.')
    }
    return {
      auditLabel: `канал ${channel.title}`,
      auditTargetId: normalizedHandle,
      auditTargetType: 'channel',
      exportBaseName: sanitizeExportFileName(channel.title) || normalizedHandle,
      subject: this.getChannelStorageSubjectByHandle(normalizedHandle),
    }
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

    const isStillArchived = this.database.archivedMedia.some((item) => item.mediaUrl === mediaUrl)
    if (isStillArchived) return

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

  private clearChallenge(identifier: string, purpose?: AuthChallengePurpose | AuthChallengePurpose[]) {
    const allowedPurposes = purpose
      ? Array.isArray(purpose)
        ? purpose
        : [purpose]
      : null
    this.database.authChallenges = this.database.authChallenges.filter(
      (challenge) =>
        challenge.identifier !== identifier ||
        (allowedPurposes !== null && !allowedPurposes.includes(challenge.purpose)),
    )
  }

  private async createSessionToken(identifier: string, accessContext?: SessionAccessContext) {
    const account = this.findAccount(identifier)
    if (account) {
      account.lastActiveAt = new Date().toISOString()
    }

    const token = randomUUID()
    const createdAt = new Date().toISOString()
    this.database.sessions.push({
      createdAt,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      identifier,
      token,
    })

    if (accessContext) {
      await this.recordIpAccessEvent(identifier, accessContext)
    }

    return token
  }

  private getActiveSessionRecord(token: string) {
    const session = this.database.sessions.find((candidate) => candidate.token === token)
    if (!session) {
      return null
    }

    const expiresAt = parseIsoDate(session.expiresAt)
    if (expiresAt === null || expiresAt <= Date.now()) {
      return null
    }

    return session
  }

  private getIpAccessLogsForIdentifier(identifier: string) {
    const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
    return this.database.ipAccessLogs
      .filter((entry) => normalizeStoredIdentifierReference(entry.identifier) === normalizedIdentifier)
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
    const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
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
      context.source === 'password-change' ||
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
    const normalizedIdentifier = normalizeStoredIdentifierReference(identifier)
    if (!normalizedIdentifier) {
      return null
    }

    return (
      this.database.accounts.find((account) => account.identifier === normalizedIdentifier) ?? null
    )
  }

  private findAccountsByOriginalIdentifier(identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    if (!normalizedIdentifier) {
      return [] as Account[]
    }

    return this.database.accounts
      .filter((account) => getAccountOriginalIdentifier(account) === normalizedIdentifier)
      .sort((left, right) => {
        const activeDelta = Number(isArchivedAccount(left)) - Number(isArchivedAccount(right))
        if (activeDelta !== 0) {
          return activeDelta
        }

        return compareIsoDateDesc(left.deletedAt ?? left.lastActiveAt, right.deletedAt ?? right.lastActiveAt)
      })
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

  private findDialogByPhone(ownerIdentifier: string, phoneIdentifier: string) {
    const normalizedPhoneIdentifier = normalizeIdentifier(phoneIdentifier)
    if (!normalizedPhoneIdentifier) {
      return null
    }

    return (
      this.database.dialogs.find(
        (dialog) =>
          dialog.ownerIdentifier === ownerIdentifier &&
          normalizeIdentifier(dialog.phone) === normalizedPhoneIdentifier,
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
      archivedAt: sourceChannel.archivedAt,
      archiveReason: sourceChannel.archiveReason,
      avatarImage: sourceChannel.avatarImage,
      commentBlacklistIdentifiers: sanitizeIdentifierList(sourceChannel.commentBlacklistIdentifiers),
      commentsEnabledForAll: Boolean(sourceChannel.commentsEnabledForAll),
      commentsEnabledForPremium: Boolean(sourceChannel.commentsEnabledForPremium),
      creatorIdentifier: sourceChannel.ownerIdentifier,
      description: sourceChannel.description,
      draft: sourceChannel.status === 'draft',
      handle: sourceChannel.directLink,
      id: this.getNextOwnedId(this.database.subscriptionChannels, ownerIdentifier),
      muted: false,
      ownerIdentifier,
      participants: [],
      preview: buildManagedChannelFallbackPreview(sourceChannel),
      readers: 0,
      statusText: sourceChannel.statusText?.trim() || undefined,
      subscribedAt: new Date().toISOString(),
      time: '',
      title: sourceChannel.title,
      unread: 0,
      visibility: sourceChannel.visibility,
    }

    this.database.subscriptionChannels.push(nextCopy)
    this.syncManagedChannelSubscriptionCopies(sourceChannel)
    return nextCopy
  }

  private createManagedChannelSystemPost(
    sourceChannel: PersistedManagedChannel,
    text: string,
  ) {
    this.ensureManagedChannelOwnerSubscriptionCopy(sourceChannel)
    const channelCopies = this.syncManagedChannelSubscriptionCopies(sourceChannel)
    const createdAt = new Date().toISOString()
    const time = formatNowTime()

    for (const channelCopy of channelCopies) {
      this.database.subscriptionPosts.push({
        channelId: channelCopy.id,
        createdAt,
        id: this.getNextSubscriptionPostId(channelCopy.ownerIdentifier, channelCopy.id),
        ownerIdentifier: channelCopy.ownerIdentifier,
        system: true,
        text,
        threadComments: [],
        threadId: getSubscriptionPostThreadId(channelCopy, { createdAt, id: 0, text, time }),
        time,
      })
      channelCopy.preview = text
      channelCopy.time = time
      channelCopy.unread = 0
    }
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
    nextState: Pick<PersistedThreadState, 'lastReadCommentCreatedAt' | 'lastReadCommentId' | 'subscription'>,
  ) {
    const existingState = this.getThreadState(ownerIdentifier, threadId)

    if (existingState) {
      existingState.lastReadCommentCreatedAt = nextState.lastReadCommentCreatedAt
      existingState.lastReadCommentId = nextState.lastReadCommentId
      existingState.subscription = nextState.subscription
      return existingState
    }

    const createdState: PersistedThreadState = {
      lastReadCommentCreatedAt: nextState.lastReadCommentCreatedAt,
      lastReadCommentId: nextState.lastReadCommentId,
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
      sourceContact: resolveContactSourceReferenceFromText(this.database, text),
      text,
      time: formatNowTime(),
    }
  }

  private buildSupportThreadId(ticketNumber: number) {
    return `support:${ticketNumber}`
  }

  private findSupportTicketForOwner(ownerIdentifier: string, ticketId: number) {
    return this.database.supportTickets.find(
      (ticket) => ticket.ownerIdentifier === ownerIdentifier && ticket.id === ticketId,
    ) ?? null
  }

  private findSupportTicketById(ticketId: number) {
    return this.database.supportTickets.find((ticket) => ticket.id === ticketId) ?? null
  }

  private buildAdminSupportTicketSummary(ticket: PersistedSupportTicket): AdminSupportTicketSummary {
    const owner = this.findAccount(ticket.ownerIdentifier)
    const comments = compactThreadComments(ticket.comments)
    const latestComment = comments.at(-1)
    const latestActivityAt = latestComment?.createdAt ?? ticket.updatedAt
    const latestResponderIdentifier = latestComment?.authorIdentifier
    const latestResponder = latestResponderIdentifier ? this.findAccount(latestResponderIdentifier) : null

    const displayStatus = getAdminSupportTicketDisplayStatus(ticket)

    return {
      commentCount: comments.length,
      createdAt: ticket.createdAt,
      id: ticket.id,
      latestActivityAt,
      needsReply: comments.length === 0 || !sanitizeStaffRole(latestResponder?.staffRole),
      owner: buildAdminLinkedUserSummary(owner ?? undefined, ticket.ownerIdentifier),
      rootText: ticket.text,
      status: displayStatus,
      ticketNumber: ticket.id,
      unreadCount: comments.filter(
        (comment) => normalizeIdentifier(comment.authorIdentifier ?? '') === ticket.ownerIdentifier,
      ).length,
    }
  }

  private appendCommentToSupportTicket(
    ticket: PersistedSupportTicket,
    authorAccount: Account,
    text: string,
    attachment?: Message['attachment'],
    replyTo?: Message['replyTo'],
    deliveryId?: string,
  ) {
    const nextComment = this.buildThreadComment(
      authorAccount,
      ticket.ownerIdentifier,
      text,
      attachment,
      deliveryId,
    )
    const previousActivityAt = Date.parse(ticket.updatedAt ?? ticket.createdAt)
    const nextCommentCreatedAt = Date.parse(nextComment.createdAt ?? '')
    if (!Number.isNaN(previousActivityAt) && !Number.isNaN(nextCommentCreatedAt) && nextCommentCreatedAt <= previousActivityAt) {
      nextComment.createdAt = new Date(previousActivityAt + 1).toISOString()
    }
    nextComment.replyTo = replyTo
    const nextComments = [...ticket.comments]
    nextComment.id = nextComments.reduce((maxId, comment) => Math.max(maxId, comment.id), 0) + 1
    nextComments.push(nextComment)
    ticket.comments = nextComments
    ticket.updatedAt = nextComment.createdAt ?? new Date().toISOString()
    return nextComment
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
    if (isArchivedGroup(group)) {
      throw new Error('Группа находится в архиве. Новые сообщения отключены.')
    }

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
    if (isArchivedChannel(channel)) {
      throw new Error('Канал находится в архиве. Новые комментарии отключены.')
    }

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

  private assertGroupWritable(group: PersistedGroup) {
    if (isArchivedGroup(group)) {
      throw new Error('Группа находится в архиве и доступна только для чтения.')
    }
  }

  private assertManagedChannelWritable(channel: PersistedManagedChannel) {
    if (isArchivedChannel(channel)) {
      throw new Error('Канал находится в архиве и доступен только для чтения.')
    }
  }

  private assertSubscriptionChannelWritable(channel: PersistedSubscriptionChannel) {
    if (isArchivedChannel(channel)) {
      throw new Error('Канал находится в архиве и доступен только для чтения.')
    }
  }

  private buildGroupParticipant(account: Account, viewerIdentifier?: string): GroupParticipant {
    const online = this.hasLivePresence(account.identifier)
    const archivedAccount = isPublicDeletedAccount(account)
    // Presence for group members must follow the same viewer-aware invisibility contract as direct dialogs.
    const visibleOnline = archivedAccount
      ? false
      : getViewerVisibleOnline(account, viewerIdentifier, online)

    return {
      accent: pickAccentForIdentifier(account.identifier),
      avatarImage: account.avatarImage,
      archivedAccount,
      favorite: false,
      id: getStableParticipantId(account.identifier),
      identifier: account.identifier,
      nickname: archivedAccount ? '' : normalizeNickname(account.nickname ?? ''),
      online: archivedAccount ? false : visibleOnline,
      premium: archivedAccount ? false : hasActivePremium(account.premium, account.premiumExpiresAt),
      status: getUserVisibleStatus(account, visibleOnline),
      title: getUserVisibleDisplayName(account),
    }
  }

  private buildGroupSystemEventActor(account: Account): GroupSystemEvent['actor'] {
    return {
      identifier: account.identifier,
      premium: hasActivePremium(account.premium, account.premiumExpiresAt),
      title: getUserVisibleDisplayName(account),
    }
  }

  private appendGroupSystemEvent(
    sharedId: string,
    event: GroupSystemEvent,
  ) {
    const createdAt = new Date().toISOString()
    const time = formatNowTime()
    const text = getGroupSystemEventText(event)
    const groupCopies = this.listGroupCopies(sharedId).filter((groupCopy) => !isArchivedGroup(groupCopy))

    for (const groupCopy of groupCopies) {
      this.database.groupMessages.push({
        author: groupCopy.ownerIdentifier === event.actor.identifier ? 'me' : 'them',
        createdAt,
        groupId: groupCopy.id,
        groupSystemEvent: event,
        id: this.getNextGroupMessageId(groupCopy.ownerIdentifier, groupCopy.id),
        ownerIdentifier: groupCopy.ownerIdentifier,
        system: true,
        text,
        threadComments: [],
        threadId: undefined,
        time,
      })

      groupCopy.preview = text
      groupCopy.time = time
      groupCopy.unread =
        groupCopy.ownerIdentifier === event.actor.identifier || groupCopy.muted
          ? 0
          : groupCopy.unread + 1
    }
  }

  private hasGroupSystemEventForActor(
    sharedId: string,
    kind: GroupSystemEvent['kind'],
    actorIdentifier: string,
  ) {
    const normalizedActorIdentifier = normalizeIdentifier(actorIdentifier)
    if (!normalizedActorIdentifier) {
      return false
    }

    const groupCopies = this.listGroupCopies(sharedId)
    if (groupCopies.length === 0) {
      return false
    }

    const groupKey = new Set(groupCopies.map((group) => `${group.ownerIdentifier}:${group.id}`))
    return this.database.groupMessages.some((message) => {
      if (!groupKey.has(`${message.ownerIdentifier}:${message.groupId}`)) {
        return false
      }

      if (message.groupSystemEvent?.kind !== kind) {
        return false
      }

      return (
        normalizeStoredIdentifierReference(message.groupSystemEvent.actor.identifier) ===
        normalizedActorIdentifier
      )
    })
  }

  private cloneGroupParticipant(participant: GroupParticipant): GroupParticipant {
    return { ...participant }
  }

  private cloneGroupMessageForOwner(
    sourceGroup: PersistedGroup,
    sourceMessage: PersistedGroupMessage,
    targetGroup: PersistedGroup,
  ): PersistedGroupMessage {
    const clonedMessage = structuredClone(sourceMessage) as PersistedGroupMessage
    const resolvedAuthorIdentifier =
      normalizeStoredIdentifierReference(clonedMessage.groupSystemEvent?.actor.identifier ?? '') ||
      resolveGroupMessageAuthorIdentifier(sourceGroup, clonedMessage)
    const authorIsTargetOwner = resolvedAuthorIdentifier === targetGroup.ownerIdentifier
    const targetParticipant = targetGroup.participants.find(
      (participant) =>
        normalizeStoredIdentifierReference(participant.identifier ?? '') === resolvedAuthorIdentifier,
    )

    return {
      ...clonedMessage,
      author: authorIsTargetOwner ? 'me' : 'them',
      displayAuthor: authorIsTargetOwner ? undefined : targetParticipant?.title ?? clonedMessage.displayAuthor,
      groupId: targetGroup.id,
      groupParticipantId: authorIsTargetOwner ? undefined : clonedMessage.groupParticipantId,
      id: this.getNextGroupMessageId(targetGroup.ownerIdentifier, targetGroup.id),
      ownerIdentifier: targetGroup.ownerIdentifier,
      threadId: getGroupMessageThreadId(targetGroup, clonedMessage),
    }
  }

  private seedGroupHistoryForOwnerCopy(
    sourceGroup: PersistedGroup,
    targetGroup: PersistedGroup,
  ) {
    const hasExistingMessages = this.database.groupMessages.some(
      (message) =>
        message.ownerIdentifier === targetGroup.ownerIdentifier &&
        message.groupId === targetGroup.id,
    )
    if (hasExistingMessages) {
      return
    }

    const sourceMessages = this.database.groupMessages.filter(
      (message) =>
        message.ownerIdentifier === sourceGroup.ownerIdentifier &&
        message.groupId === sourceGroup.id,
    )

    for (const sourceMessage of sourceMessages) {
      this.database.groupMessages.push(
        this.cloneGroupMessageForOwner(sourceGroup, sourceMessage, targetGroup),
      )
    }
  }

  private getFirstLiveGroupParticipantIdentifier(groupCopies: PersistedGroup[], excludedIdentifier: string) {
    for (const group of groupCopies) {
      for (const participant of group.participants ?? []) {
        const participantIdentifier = normalizeStoredIdentifierReference(participant.identifier ?? '')
        if (!participantIdentifier || participantIdentifier === excludedIdentifier) {
          continue
        }

        const participantAccount = this.findAccount(participantIdentifier)
        if (participantAccount && !isArchivedAccount(participantAccount)) {
          return participantIdentifier
        }
      }
    }

    return null
  }

  private archiveManagedChannel(
    channel: PersistedManagedChannel,
    reason: ArchiveReason,
    archivedAt: string,
  ) {
    channel.archivedAt = archivedAt
    channel.archiveReason = reason
    channel.status = 'active'

    const normalizedHandle = sanitizeChannelDirectLink(channel.directLink) || channel.directLink
    const relatedCopies = this.listSubscriptionChannelCopiesByHandle(normalizedHandle)
    for (const channelCopy of relatedCopies) {
      channelCopy.archivedAt = archivedAt
      channelCopy.archiveReason = reason
    }
  }

  private unarchiveManagedChannel(channel: PersistedManagedChannel) {
    channel.archivedAt = undefined
    channel.archiveReason = undefined
    const normalizedHandle = sanitizeChannelDirectLink(channel.directLink) || channel.directLink
    const relatedCopies = this.listSubscriptionChannelCopiesByHandle(normalizedHandle)
    for (const channelCopy of relatedCopies) {
      channelCopy.archivedAt = undefined
      channelCopy.archiveReason = undefined
    }
  }

  private archiveGroupCopies(
    sharedId: string,
    reason: ArchiveReason,
    archivedAt: string,
  ) {
    for (const group of this.listGroupCopies(sharedId)) {
      group.archivedAt = archivedAt
      group.archiveReason = reason
    }
  }

  private unarchiveGroupCopies(sharedId: string) {
    for (const group of this.listGroupCopies(sharedId)) {
      group.archivedAt = undefined
      group.archiveReason = undefined
    }
  }

  private transferGroupOwnership(
    sharedId: string,
    nextOwnerIdentifier: string,
  ) {
    for (const group of this.listGroupCopies(sharedId)) {
      group.groupOwnerIdentifier = nextOwnerIdentifier
      group.archivedAt = undefined
      group.archiveReason = undefined
    }
  }

  private removeParticipantIdentifierFromGroupCopies(targetIdentifier: string) {
    const normalizedTarget = normalizeStoredIdentifierReference(targetIdentifier)
    if (!normalizedTarget) {
      return new Set<string>()
    }

    const touchedSharedIds = new Set<string>()

    for (const group of this.database.groups) {
      const nextParticipants = (group.participants ?? []).filter(
        (participant) =>
          normalizeStoredIdentifierReference(participant.identifier ?? '') !== normalizedTarget,
      )

      if (nextParticipants.length === (group.participants ?? []).length) {
        continue
      }

      group.participants = nextParticipants
      group.members = nextParticipants.length
      touchedSharedIds.add(this.getSharedGroupId(group))
    }

    return touchedSharedIds
  }

  private removeParticipantIdentifierFromSubscriptionChannelCopies(targetIdentifier: string) {
    const normalizedTarget = normalizeStoredIdentifierReference(targetIdentifier)
    if (!normalizedTarget) {
      return
    }

    for (const channel of this.database.subscriptionChannels) {
      const nextParticipants = (channel.participants ?? []).filter(
        (participant) =>
          normalizeStoredIdentifierReference(participant.identifier ?? '') !== normalizedTarget,
      )

      if (nextParticipants.length === (channel.participants ?? []).length) {
        continue
      }

      channel.participants = nextParticipants
    }
  }

  private applyOwnedEntityDeletionPolicy(
    archivedIdentifier: string,
    options: {
      archivedAt: string
      deleteDataToo: boolean
    },
  ) {
    // Self-service account deletion follows a different policy from ordinary room deletion:
    // channels become hidden owner archives; groups either transfer ownership to a live member
    // or become orphaned-group archives if transfer is impossible.
    const touchedSharedIds = this.removeParticipantIdentifierFromGroupCopies(archivedIdentifier)
    this.removeParticipantIdentifierFromSubscriptionChannelCopies(archivedIdentifier)
    const managedChannels = this.database.managedChannels.filter(
      (channel) => channel.ownerIdentifier === archivedIdentifier,
    )
    const sharedGroupIds = [
      ...new Set(
        this.database.groups
          .filter(
            (group) =>
              getCurrentGroupOwnerIdentifier(group) === archivedIdentifier ||
              normalizeStoredIdentifierReference(group.creatorIdentifier ?? '') === archivedIdentifier,
          )
          .map((group) => this.getSharedGroupId(group))
          .concat([...touchedSharedIds]),
      ),
    ]

    for (const channel of managedChannels) {
      this.archiveManagedChannel(
        channel,
        options.deleteDataToo ? 'self-service-data-hidden' : 'owner-self-deleted',
        options.archivedAt,
      )
    }

    let transferredGroupsCount = 0
    let archivedGroupsCount = 0

    for (const sharedId of sharedGroupIds) {
      const copies = this.listGroupCopies(sharedId)
      if (copies.length === 0) {
        continue
      }

      if (options.deleteDataToo) {
        this.archiveGroupCopies(sharedId, 'self-service-data-hidden', options.archivedAt)
        archivedGroupsCount += 1
        continue
      }

      const nextOwnerIdentifier = this.getFirstLiveGroupParticipantIdentifier(copies, archivedIdentifier)
      if (nextOwnerIdentifier) {
        this.transferGroupOwnership(sharedId, nextOwnerIdentifier)
        const nextOwnerAccount = this.findAccount(nextOwnerIdentifier)
        if (nextOwnerAccount) {
          this.appendGroupSystemEvent(sharedId, {
            actor: this.buildGroupSystemEventActor(nextOwnerAccount),
            kind: 'owner-transferred',
          })
        }
        transferredGroupsCount += 1
        continue
      }

      this.archiveGroupCopies(sharedId, 'orphaned-group', options.archivedAt)
      archivedGroupsCount += 1
    }

    return {
      archivedGroupsCount,
      archivedOwnedChannelsCount: managedChannels.length,
      transferredGroupsCount,
    }
  }

  private syncGroupCopiesParticipants(sharedId: string, participants: GroupParticipant[]) {
    for (const group of this.listGroupCopies(sharedId)) {
      group.members = participants.length
      group.participants = participants.map((participant) => this.cloneGroupParticipant(participant))
    }
  }

  private buildAuthoritativeGroupParticipants(sharedId: string) {
    const participantsByIdentifier = new Map<string, GroupParticipant>()

    for (const group of this.listGroupCopies(sharedId)) {
      for (const participant of group.participants ?? []) {
        const normalizedIdentifier = normalizeIdentifier(participant.identifier ?? '')
        if (!normalizedIdentifier || participantsByIdentifier.has(normalizedIdentifier)) {
          continue
        }

        participantsByIdentifier.set(normalizedIdentifier, this.cloneGroupParticipant(participant))
      }
    }

    return [...participantsByIdentifier.values()]
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
      existingGroup.showHistoryToNewMembers = sourceGroup.showHistoryToNewMembers !== false
      existingGroup.archivedAt = sourceGroup.archivedAt
      existingGroup.archiveReason = sourceGroup.archiveReason
      existingGroup.creatorIdentifier = sourceGroup.creatorIdentifier ?? sourceGroup.ownerIdentifier
      existingGroup.description = sanitizeChannelDescription(sourceGroup.description ?? '')
      existingGroup.groupOwnerIdentifier = getCurrentGroupOwnerIdentifier(sourceGroup)
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
      showHistoryToNewMembers: sourceGroup.showHistoryToNewMembers !== false,
      archivedAt: sourceGroup.archivedAt,
      archiveReason: sourceGroup.archiveReason,
      creatorIdentifier: sourceGroup.creatorIdentifier ?? sourceGroup.ownerIdentifier,
      description: sanitizeChannelDescription(sourceGroup.description ?? ''),
      groupOwnerIdentifier: getCurrentGroupOwnerIdentifier(sourceGroup),
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
      archivedAt: shouldHideArchivedGroupForUsers(group) ? group.archivedAt : undefined,
      archiveReason: shouldHideArchivedGroupForUsers(group) ? group.archiveReason : undefined,
      avatarImage: group.avatarImage,
      creatorIdentifier: group.creatorIdentifier ?? group.ownerIdentifier,
      groupOwnerIdentifier: getCurrentGroupOwnerIdentifier(group),
      handle: group.handle,
      leadText: 'Пользователь приглашает вас в группу',
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
      statusText: channel.statusText?.trim() || undefined,
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

  private ensureManagedChannelOwnerSubscriptionCopy(sourceChannel: PersistedManagedChannel) {
    // Managed channel lifecycle invariant:
    // every managed channel must always have a canonical owner subscription copy.
    return this.ensureSubscriptionChannelCopyForOwner(sourceChannel, sourceChannel.ownerIdentifier)
  }

  private syncManagedChannelSubscriptionCopies(sourceChannel: PersistedManagedChannel) {
    return syncManagedChannelCopiesInDatabase(this.database, this.livePresenceCountsByIdentifier, sourceChannel).copies
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

  private hasSubscriptionChannelCopyForOwner(handle: string, ownerIdentifier: string) {
    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    return this.database.subscriptionChannels.some(
      (channel) =>
        channel.ownerIdentifier === ownerIdentifier &&
        normalizeChannelHandleForComparison(channel.handle) === normalizedHandle,
    )
  }

  private hasPendingChannelInvitation(handle: string, recipientIdentifier: string) {
    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    const normalizedRecipient = normalizeIdentifier(recipientIdentifier)
    if (!normalizedHandle || !normalizedRecipient) {
      return false
    }

    return this.database.pendingChannelInvitations.some(
      (invitation) =>
        normalizeChannelHandleForComparison(invitation.channelHandle) === normalizedHandle &&
        invitation.recipientIdentifier === normalizedRecipient,
    )
  }

  private upsertPendingChannelInvitation(
    handle: string,
    senderIdentifier: string,
    recipientIdentifier: string,
  ) {
    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    const normalizedSender = normalizeIdentifier(senderIdentifier)
    const normalizedRecipient = normalizeIdentifier(recipientIdentifier)
    if (!normalizedHandle || !normalizedSender || !normalizedRecipient) {
      return
    }

    const existingInvitation = this.database.pendingChannelInvitations.find(
      (invitation) =>
        normalizeChannelHandleForComparison(invitation.channelHandle) === normalizedHandle &&
        invitation.recipientIdentifier === normalizedRecipient,
    )

    if (existingInvitation) {
      existingInvitation.channelHandle = normalizedHandle
      existingInvitation.createdAt = new Date().toISOString()
      existingInvitation.senderIdentifier = normalizedSender
      return
    }

    this.database.pendingChannelInvitations.push({
      channelHandle: normalizedHandle,
      createdAt: new Date().toISOString(),
      recipientIdentifier: normalizedRecipient,
      senderIdentifier: normalizedSender,
    })
  }

  private clearPendingChannelInvitation(handle: string, recipientIdentifier: string) {
    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    const normalizedRecipient = normalizeIdentifier(recipientIdentifier)
    if (!normalizedHandle || !normalizedRecipient) {
      return
    }

    this.database.pendingChannelInvitations = this.database.pendingChannelInvitations.filter(
      (invitation) =>
        !(
          normalizeChannelHandleForComparison(invitation.channelHandle) === normalizedHandle &&
          invitation.recipientIdentifier === normalizedRecipient
        ),
    )
  }

  private reassignPendingChannelInvitationSender(handle: string, senderIdentifier: string) {
    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    const normalizedSender = normalizeIdentifier(senderIdentifier)
    if (!normalizedHandle || !normalizedSender) {
      return
    }

    for (const invitation of this.database.pendingChannelInvitations) {
      if (normalizeChannelHandleForComparison(invitation.channelHandle) !== normalizedHandle) {
        continue
      }

      invitation.senderIdentifier = normalizedSender
    }
  }

  private hasPendingGroupInvitation(sharedId: string, recipientIdentifier: string) {
    const normalizedSharedId = sharedId.trim()
    const normalizedRecipient = normalizeIdentifier(recipientIdentifier)
    if (!normalizedSharedId || !normalizedRecipient) {
      return false
    }

    return this.database.pendingGroupInvitations.some(
      (invitation) =>
        invitation.sharedId === normalizedSharedId &&
        invitation.recipientIdentifier === normalizedRecipient,
    )
  }

  private upsertPendingGroupInvitation(
    sharedId: string,
    senderIdentifier: string,
    recipientIdentifier: string,
  ) {
    const normalizedSharedId = sharedId.trim()
    const normalizedSender = normalizeIdentifier(senderIdentifier)
    const normalizedRecipient = normalizeIdentifier(recipientIdentifier)
    if (!normalizedSharedId || !normalizedSender || !normalizedRecipient) {
      return
    }

    const existingInvitation = this.database.pendingGroupInvitations.find(
      (invitation) =>
        invitation.sharedId === normalizedSharedId &&
        invitation.recipientIdentifier === normalizedRecipient,
    )

    if (existingInvitation) {
      existingInvitation.createdAt = new Date().toISOString()
      existingInvitation.senderIdentifier = normalizedSender
      return
    }

    this.database.pendingGroupInvitations.push({
      createdAt: new Date().toISOString(),
      recipientIdentifier: normalizedRecipient,
      senderIdentifier: normalizedSender,
      sharedId: normalizedSharedId,
    })
  }

  private clearPendingGroupInvitation(sharedId: string, recipientIdentifier: string) {
    const normalizedSharedId = sharedId.trim()
    const normalizedRecipient = normalizeIdentifier(recipientIdentifier)
    if (!normalizedSharedId || !normalizedRecipient) {
      return
    }

    this.database.pendingGroupInvitations = this.database.pendingGroupInvitations.filter(
      (invitation) =>
        !(invitation.sharedId === normalizedSharedId && invitation.recipientIdentifier === normalizedRecipient),
    )
  }

  private hasHistoricalChannelInvite(handle: string, viewerIdentifier: string) {
    const normalizedHandle = normalizeChannelHandleForComparison(handle)
    const normalizedViewer = normalizeIdentifier(viewerIdentifier)
    if (!normalizedHandle || !normalizedViewer) {
      return false
    }

    return this.database.dialogMessages.some(
      (message) =>
        message.ownerIdentifier === normalizedViewer &&
        normalizeChannelHandleForComparison(message.sourceChannel?.handle ?? '') === normalizedHandle,
    )
  }

  private buildDeletedChannelTombstonePreview(
    accountIdentifier: string,
    sourceChannel: PersistedManagedChannel,
  ): SubscriptionChannel {
    const sourceHandle = sanitizeChannelDirectLink(sourceChannel.directLink) || sourceChannel.directLink
    const archivedAt = sourceChannel.archivedAt ?? new Date().toISOString()

    return {
      accent: sourceChannel.avatarTone,
      archivedAt,
      archiveReason: 'owner-deleted',
      avatarImage: '/icons/ghost.png',
      commentBlacklistIdentifiers: [],
      commentsEnabledForAll: false,
      commentsEnabledForPremium: false,
      creatorIdentifier: sourceChannel.ownerIdentifier === accountIdentifier ? sourceChannel.ownerIdentifier : undefined,
      description: '',
      draft: false,
      handle: sourceHandle,
      id: buildSyntheticNumericId(`deleted-channel:${sourceHandle}`),
      muted: false,
      participants: [],
      posts: [],
      preview: '',
      readers: 0,
      statusText: '',
      time: '',
      title: 'Канал удалён владельцем',
      unread: 0,
      visibility: sourceChannel.visibility,
    }
  }

  private canAccessChannelPreview(sourceChannel: PersistedManagedChannel, viewerIdentifier: string) {
    const normalizedViewerIdentifier = normalizeIdentifier(viewerIdentifier)
    const normalizedOwnerIdentifier = normalizeIdentifier(sourceChannel.ownerIdentifier)
    if (!normalizedViewerIdentifier) {
      return false
    }

    if (normalizedViewerIdentifier === normalizedOwnerIdentifier) {
      return true
    }

    if (sourceChannel.visibility === 'public') {
      return true
    }

    // Preview access is the single source of truth for both invite-open and search-open:
    // if this returns true, search may show the channel, but subscribe still requires
    // the explicit subscribe mutation and must never happen on plain search tap.
    return (
      this.hasSubscriptionChannelCopyForOwner(sourceChannel.directLink, normalizedViewerIdentifier) ||
      this.hasPendingChannelInvitation(sourceChannel.directLink, normalizedViewerIdentifier)
    )
  }

  private canAccessDeletedChannelTombstone(sourceChannel: PersistedManagedChannel, viewerIdentifier: string) {
    const normalizedViewerIdentifier = normalizeIdentifier(viewerIdentifier)
    const normalizedOwnerIdentifier = normalizeIdentifier(sourceChannel.ownerIdentifier)
    if (!normalizedViewerIdentifier) {
      return false
    }

    if (normalizedViewerIdentifier === normalizedOwnerIdentifier) {
      return true
    }

    return (
      this.hasHistoricalChannelInvite(sourceChannel.directLink, normalizedViewerIdentifier) ||
      this.database.subscriptionChannels.some(
        (channel) =>
          channel.ownerIdentifier === normalizedViewerIdentifier &&
          normalizeChannelHandleForComparison(channel.handle) ===
            normalizeChannelHandleForComparison(sourceChannel.directLink),
      )
    )
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

  private deliverDirectGroupInvitation(
    sender: Account,
    recipient: Account,
    group: PersistedGroup,
  ) {
    const senderDialog = this.ensureDialogForContact(sender.identifier, recipient)
    const recipientDialog = this.ensureDialogForContact(recipient.identifier, sender)
    const createdAt = new Date().toISOString()
    const time = formatNowTime()
    const sourceGroup = this.buildGroupInviteSource(group)

    this.database.dialogMessages.push({
      author: 'me',
      createdAt,
      dialogId: senderDialog.id,
      id: this.getNextDialogMessageId(sender.identifier, senderDialog.id),
      ownerIdentifier: sender.identifier,
      sourceGroup,
      text: '',
      time,
    })

    this.database.dialogMessages.push({
      author: 'them',
      createdAt,
      dialogId: recipientDialog.id,
      id: this.getNextDialogMessageId(recipient.identifier, recipientDialog.id),
      ownerIdentifier: recipient.identifier,
      sourceGroup,
      text: '',
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
    syncPersistedDialogWithAccount(dialog, account, {
      online: this.hasLivePresence(account.identifier),
    })
  }

  private ensureDialogForContact(
    ownerIdentifier: string,
    contactAccount: Account,
    options: { hidden?: boolean } = {},
  ) {
    const existingDialog = this.findDialogByPhone(ownerIdentifier, contactAccount.identifier)
    const shouldHide = Boolean(options.hidden)

    if (existingDialog) {
      this.clearSeededDialogHistoryIfNeeded(existingDialog)
      this.syncDialogContactProfile(existingDialog, contactAccount)
      existingDialog.hidden = shouldHide
      return existingDialog
    }

    const nextDialog: PersistedDialog = {
      accent: pickAccentForIdentifier(contactAccount.identifier),
      avatarImage: contactAccount.avatarImage,
      handle: buildAccountHandle(contactAccount),
      hidden: shouldHide,
      id: this.getNextOwnedId(this.database.dialogs, ownerIdentifier),
      lastSeen: undefined,
      mood: contactAccount.status?.trim() || 'На связи',
      muted: false,
      online: this.hasLivePresence(contactAccount.identifier),
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

  private getContactLink(leftIdentifier: string, rightIdentifier: string) {
    return findContactLink(this.database, leftIdentifier, rightIdentifier)
  }

  private getContactState(viewerIdentifier: string, peerIdentifier: string): ContactState {
    return getContactStateForViewer(this.database, viewerIdentifier, peerIdentifier)
  }

  private upsertContactLink(
    leftIdentifier: string,
    rightIdentifier: string,
    patch: Pick<ContactLink, 'requesterIdentifier' | 'status'> & {
      blockedByIdentifier?: string
    },
  ) {
    const pair = buildCanonicalContactPair(leftIdentifier, rightIdentifier)
    const createdAt = new Date().toISOString()
    const existing = this.getContactLink(pair.leftIdentifier, pair.rightIdentifier)

    if (existing) {
      existing.blockedByIdentifier = patch.blockedByIdentifier
      existing.requesterIdentifier = normalizeIdentifier(patch.requesterIdentifier)
      existing.status = patch.status
      existing.updatedAt = createdAt
      return existing
    }

    const link: ContactLink = {
      blockedByIdentifier: patch.blockedByIdentifier,
      createdAt,
      leftIdentifier: pair.leftIdentifier,
      requesterIdentifier: normalizeIdentifier(patch.requesterIdentifier),
      rightIdentifier: pair.rightIdentifier,
      status: patch.status,
      updatedAt: createdAt,
    }
    this.database.contactLinks.push(link)
    return link
  }

  private clearContactLink(leftIdentifier: string, rightIdentifier: string) {
    const pair = buildCanonicalContactPair(leftIdentifier, rightIdentifier)
    const previousLength = this.database.contactLinks.length
    this.database.contactLinks = this.database.contactLinks.filter(
      (link) =>
        !(
          link.leftIdentifier === pair.leftIdentifier &&
          link.rightIdentifier === pair.rightIdentifier
        ),
    )
    return previousLength !== this.database.contactLinks.length
  }

  private appendDirectSystemMessage(
    ownerIdentifier: string,
    dialog: PersistedDialog,
    text: string,
    options?: {
      author?: 'me' | 'them'
      incrementUnread?: boolean
    },
  ) {
    const createdAt = new Date().toISOString()
    const time = formatNowTime()
    this.database.dialogMessages.push({
      author: options?.author ?? 'them',
      createdAt,
      dialogId: dialog.id,
      id: this.getNextDialogMessageId(ownerIdentifier, dialog.id),
      ownerIdentifier,
      system: true,
      text,
      time,
    })

    if (options?.incrementUnread) {
      dialog.unread = dialog.muted ? 0 : dialog.unread + 1
    }
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
  post: Pick<PersistedSubscriptionPost, 'attachment' | 'createdAt' | 'replyTo' | 'system' | 'text' | 'time'>,
) {
  return JSON.stringify({
    attachmentFileName: post.attachment?.fileName ?? '',
    attachmentMimeType: post.attachment?.mimeType ?? '',
    attachmentSize: post.attachment?.size ?? 0,
    createdAt: post.createdAt ?? '',
    replyAuthor: post.replyTo?.author ?? '',
    replyId: post.replyTo?.id ?? 0,
    replyText: post.replyTo?.text ?? '',
    system: Boolean(post.system),
    text: post.text,
    time: post.time,
  })
}

function buildManagedChannelFallbackPreview(
  channel: Pick<PersistedManagedChannel, 'description' | 'statusText'>,
) {
  return channel.statusText?.trim() || channel.description?.trim() || ''
}

function buildSubscriptionPostPreviewText(
  post: Pick<PersistedSubscriptionPost, 'attachment' | 'system' | 'text'>,
  fallbackPreview: string,
) {
  const text = post.text.trim()
  if (text) {
    return text
  }

  if (post.system) {
    return 'Канал создан'
  }

  if (post.attachment) {
    return `Файл: ${post.attachment.fileName}`
  }

  return fallbackPreview
}

function cloneThreadCommentRecord(comment: ThreadComment): ThreadComment {
  return {
    ...comment,
    attachment: comment.attachment ? { ...comment.attachment } : undefined,
    attachmentRemovedNotice: comment.attachmentRemovedNotice
      ? { ...comment.attachmentRemovedNotice }
      : undefined,
    replyTo: comment.replyTo ? { ...comment.replyTo } : undefined,
    sourceChannel: comment.sourceChannel ? { ...comment.sourceChannel } : undefined,
  }
}

function clonePersistedSubscriptionPostForCopy(
  post: PersistedSubscriptionPost,
  channelCopy: PersistedSubscriptionChannel,
  nextId: number,
): PersistedSubscriptionPost {
  return {
    attachment: post.attachment ? { ...post.attachment } : undefined,
    attachmentRemovedNotice: post.attachmentRemovedNotice ? { ...post.attachmentRemovedNotice } : undefined,
    channelId: channelCopy.id,
    createdAt: post.createdAt,
    id: nextId,
    ownerIdentifier: channelCopy.ownerIdentifier,
    replyTo: post.replyTo ? { ...post.replyTo } : undefined,
    sourceChannel: post.sourceChannel ? { ...post.sourceChannel } : undefined,
    system: Boolean(post.system),
    text: post.text,
    threadArchivedAt: post.threadArchivedAt,
    threadArchiveReason: post.threadArchiveReason,
    threadComments: (post.threadComments ?? []).map(cloneThreadCommentRecord),
    threadId: post.threadId?.trim() || getSubscriptionPostThreadId(channelCopy, post),
    time: post.time,
  }
}

function syncManagedChannelCopiesInDatabase(
  database: Database,
  livePresenceIdentifiers: LivePresenceLookup,
  sourceChannel: PersistedManagedChannel,
) {
  const normalizedHandle = sanitizeChannelDirectLink(sourceChannel.directLink) || sourceChannel.directLink
  const copies = database.subscriptionChannels.filter(
    (channel) =>
      (sanitizeChannelDirectLink(channel.handle) || channel.handle) === normalizedHandle,
  )
  const subscriberCount = Math.max(1, new Set(copies.map((copy) => copy.ownerIdentifier)).size)
  const canonicalCopy =
    copies
      .map((copy) => ({
        copy,
        postCount: database.subscriptionPosts.filter(
          (post) => post.ownerIdentifier === copy.ownerIdentifier && post.channelId === copy.id,
        ).length,
      }))
      .sort((left, right) => {
        if (left.postCount !== right.postCount) {
          return right.postCount - left.postCount
        }
        if (left.copy.ownerIdentifier === sourceChannel.ownerIdentifier) return -1
        if (right.copy.ownerIdentifier === sourceChannel.ownerIdentifier) return 1
        return left.copy.id - right.copy.id
      })[0]?.copy ?? null
  const fallbackPreview = buildManagedChannelFallbackPreview(sourceChannel)
  const canonicalPosts = canonicalCopy
    ? database.subscriptionPosts
      .filter(
        (post) =>
          post.ownerIdentifier === canonicalCopy.ownerIdentifier &&
          post.channelId === canonicalCopy.id,
      )
      .sort((left, right) => {
        const leftCreatedAt = parseIsoDate(left.createdAt)
        const rightCreatedAt = parseIsoDate(right.createdAt)

        if (leftCreatedAt !== null && rightCreatedAt !== null && leftCreatedAt !== rightCreatedAt) {
          return leftCreatedAt - rightCreatedAt
        }
        if (leftCreatedAt !== null && rightCreatedAt === null) return -1
        if (leftCreatedAt === null && rightCreatedAt !== null) return 1
        return left.id - right.id
      })
    : []
  const canonicalSignatures = new Set(
    canonicalPosts.map((post) => getPersistedSubscriptionPostSignature(post)),
  )
  const fallbackSubscribedAt = new Date().toISOString()
  let didMutate = false

  for (const copy of copies) {
    if (copy.accent !== sourceChannel.avatarTone) {
      copy.accent = sourceChannel.avatarTone
      didMutate = true
    }
    if (copy.archivedAt !== sourceChannel.archivedAt) {
      copy.archivedAt = sourceChannel.archivedAt
      didMutate = true
    }
    if (copy.archiveReason !== sourceChannel.archiveReason) {
      copy.archiveReason = sourceChannel.archiveReason
      didMutate = true
    }
    if (copy.avatarImage !== sourceChannel.avatarImage) {
      copy.avatarImage = sourceChannel.avatarImage
      didMutate = true
    }
    const nextBlacklist = sanitizeIdentifierList(sourceChannel.commentBlacklistIdentifiers)
    if (JSON.stringify(copy.commentBlacklistIdentifiers ?? []) !== JSON.stringify(nextBlacklist)) {
      copy.commentBlacklistIdentifiers = nextBlacklist
      didMutate = true
    }
    if (Boolean(copy.commentsEnabledForAll) !== Boolean(sourceChannel.commentsEnabledForAll)) {
      copy.commentsEnabledForAll = Boolean(sourceChannel.commentsEnabledForAll)
      didMutate = true
    }
    if (Boolean(copy.commentsEnabledForPremium) !== Boolean(sourceChannel.commentsEnabledForPremium)) {
      copy.commentsEnabledForPremium = Boolean(sourceChannel.commentsEnabledForPremium)
      didMutate = true
    }
    if (copy.creatorIdentifier !== sourceChannel.ownerIdentifier) {
      copy.creatorIdentifier = sourceChannel.ownerIdentifier
      didMutate = true
    }
    if (copy.description !== sourceChannel.description) {
      copy.description = sourceChannel.description
      didMutate = true
    }
    if (copy.draft !== (sourceChannel.status === 'draft')) {
      copy.draft = sourceChannel.status === 'draft'
      didMutate = true
    }
    if (copy.handle !== sourceChannel.directLink) {
      copy.handle = sourceChannel.directLink
      didMutate = true
    }
    if (copy.statusText !== (sourceChannel.statusText?.trim() || undefined)) {
      copy.statusText = sourceChannel.statusText?.trim() || undefined
      didMutate = true
    }
    if (copy.title !== sourceChannel.title) {
      copy.title = sourceChannel.title
      didMutate = true
    }
    if (copy.visibility !== sourceChannel.visibility) {
      copy.visibility = sourceChannel.visibility
      didMutate = true
    }
    if (copy.readers !== subscriberCount) {
      copy.readers = subscriberCount
      didMutate = true
    }
    if (!copy.subscribedAt?.trim()) {
      copy.subscribedAt = fallbackSubscribedAt
      didMutate = true
    }
    const nextParticipants = buildDerivedSubscriptionParticipants(
      database,
      livePresenceIdentifiers,
      copy.ownerIdentifier,
      normalizedHandle,
    )
    if (JSON.stringify(copy.participants ?? []) !== JSON.stringify(nextParticipants)) {
      copy.participants = nextParticipants
      didMutate = true
    }

    const existingPosts = database.subscriptionPosts
      .filter(
        (post) =>
          post.ownerIdentifier === copy.ownerIdentifier &&
          post.channelId === copy.id,
      )
      .sort((left, right) => left.id - right.id)
    const removablePostIds = new Set(
      existingPosts
        .filter((post) => !canonicalSignatures.has(getPersistedSubscriptionPostSignature(post)))
        .map((post) => `${post.ownerIdentifier}:${post.channelId}:${post.id}`),
    )

    if (removablePostIds.size > 0) {
      database.subscriptionPosts = database.subscriptionPosts.filter(
        (post) => !removablePostIds.has(`${post.ownerIdentifier}:${post.channelId}:${post.id}`),
      )
      didMutate = true
    }

    const keptPosts = database.subscriptionPosts
      .filter(
        (post) =>
          post.ownerIdentifier === copy.ownerIdentifier &&
          post.channelId === copy.id,
      )
      .sort((left, right) => left.id - right.id)
    const existingSignatures = new Set(
      keptPosts.map((post) => getPersistedSubscriptionPostSignature(post)),
    )
    let nextPostId = keptPosts.reduce((maxId, post) => Math.max(maxId, post.id), 0) + 1

    for (const canonicalPost of canonicalPosts) {
      const signature = getPersistedSubscriptionPostSignature(canonicalPost)
      if (existingSignatures.has(signature)) {
        continue
      }

      database.subscriptionPosts.push(
        clonePersistedSubscriptionPostForCopy(canonicalPost, copy, nextPostId),
      )
      existingSignatures.add(signature)
      nextPostId += 1
      didMutate = true
    }

    const latestPost = canonicalPosts.at(-1)
    const nextPreview = latestPost
      ? buildSubscriptionPostPreviewText(latestPost, fallbackPreview)
      : fallbackPreview
    const nextTime = latestPost?.time ?? ''

    if (copy.preview !== nextPreview) {
      copy.preview = nextPreview
      didMutate = true
    }
    if (copy.time !== nextTime) {
      copy.time = nextTime
      didMutate = true
    }
  }

  return {
    copies,
    didMutate,
  }
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
          testAccountIdentifiers.has(normalizeIdentifier(group.groupOwnerIdentifier ?? group.creatorIdentifier ?? '')) ||
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

  const nextAuthCodeSendAttempts = database.authCodeSendAttempts.filter(
    (attempt) => !testAccountIdentifiers.has(attempt.identifier),
  )
  if (nextAuthCodeSendAttempts.length !== database.authCodeSendAttempts.length) {
    database.authCodeSendAttempts = nextAuthCodeSendAttempts
    didMutate = true
  }

  const nextAuthChallenges = database.authChallenges.filter(
    (challenge) => !testAccountIdentifiers.has(challenge.identifier),
  )
  if (nextAuthChallenges.length !== database.authChallenges.length) {
    database.authChallenges = nextAuthChallenges
    didMutate = true
  }

  const nextPendingChannelInvitations = database.pendingChannelInvitations.filter(
    (invitation) =>
      !testAccountIdentifiers.has(invitation.senderIdentifier) &&
      !testAccountIdentifiers.has(invitation.recipientIdentifier),
  )
  if (nextPendingChannelInvitations.length !== database.pendingChannelInvitations.length) {
    database.pendingChannelInvitations = nextPendingChannelInvitations
    didMutate = true
  }

  const nextPendingGroupInvitations = database.pendingGroupInvitations.filter(
    (invitation) =>
      !testAccountIdentifiers.has(invitation.senderIdentifier) &&
      !testAccountIdentifiers.has(invitation.recipientIdentifier),
  )
  if (nextPendingGroupInvitations.length !== database.pendingGroupInvitations.length) {
    database.pendingGroupInvitations = nextPendingGroupInvitations
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

function pruneLegacyNonProductionMockResidue(database: Database) {
  let didMutate = false
  const mockPhoneIdentifiers = new Set(initialChats.map((chat) => normalizeIdentifier(chat.phone)))
  const mockChatHandles = new Set(initialChats.map((chat) => normalizeNickname(chat.handle) || ''))
  const mockChatTitles = new Set(initialChats.map((chat) => chat.title.trim()).filter(Boolean))
  const mockGroupHandles = new Set(initialGroups.map((group) => group.handle.trim()).filter(Boolean))
  const mockSubscriptionHandles = new Set(
    initialSubscribedChannels.map((channel) => normalizeChannelHandleForComparison(channel.handle)),
  )

  const removableDialogKeys = new Set(
    database.dialogs
      .filter((dialog) => {
        const normalizedPhone = normalizeIdentifier(dialog.phone)
        const normalizedHandle = normalizeNickname(dialog.handle) || ''
        const normalizedTitle = dialog.title.trim()

        return (
          dialog.isTestEntity === true ||
          mockPhoneIdentifiers.has(normalizedPhone) ||
          (normalizedHandle.length > 0 && mockChatHandles.has(normalizedHandle)) ||
          (normalizedTitle.length > 0 && mockChatTitles.has(normalizedTitle))
        )
      })
      .map((dialog) => `${dialog.ownerIdentifier}:${dialog.id}`),
  )

  if (removableDialogKeys.size > 0) {
    const nextDialogs = database.dialogs.filter(
      (dialog) => !removableDialogKeys.has(`${dialog.ownerIdentifier}:${dialog.id}`),
    )
    const nextDialogMessages = database.dialogMessages.filter(
      (message) => !removableDialogKeys.has(`${message.ownerIdentifier}:${message.dialogId}`),
    )

    if (nextDialogs.length !== database.dialogs.length) {
      database.dialogs = nextDialogs
      didMutate = true
    }

    if (nextDialogMessages.length !== database.dialogMessages.length) {
      database.dialogMessages = nextDialogMessages
      didMutate = true
    }
  }

  const removableGroupKeys = new Set(
    database.groups
      .filter((group) => {
        const handle = group.handle.trim()
        return group.isTestEntity === true || (handle.length > 0 && mockGroupHandles.has(handle))
      })
      .map((group) => `${group.ownerIdentifier}:${group.id}`),
  )

  if (removableGroupKeys.size > 0) {
    const nextGroups = database.groups.filter(
      (group) => !removableGroupKeys.has(`${group.ownerIdentifier}:${group.id}`),
    )
    const nextGroupMessages = database.groupMessages.filter(
      (message) => !removableGroupKeys.has(`${message.ownerIdentifier}:${message.groupId}`),
    )

    if (nextGroups.length !== database.groups.length) {
      database.groups = nextGroups
      didMutate = true
    }

    if (nextGroupMessages.length !== database.groupMessages.length) {
      database.groupMessages = nextGroupMessages
      didMutate = true
    }
  }

  const removableSubscriptionChannelKeys = new Set(
    database.subscriptionChannels
      .filter((channel) => {
        const normalizedHandle = normalizeChannelHandleForComparison(channel.handle)
        return (
          channel.isTestEntity === true ||
          (normalizedHandle.length > 0 && mockSubscriptionHandles.has(normalizedHandle))
        )
      })
      .map((channel) => `${channel.ownerIdentifier}:${channel.id}`),
  )

  if (removableSubscriptionChannelKeys.size > 0) {
    const nextSubscriptionChannels = database.subscriptionChannels.filter(
      (channel) => !removableSubscriptionChannelKeys.has(`${channel.ownerIdentifier}:${channel.id}`),
    )
    const nextSubscriptionPosts = database.subscriptionPosts.filter(
      (post) => !removableSubscriptionChannelKeys.has(`${post.ownerIdentifier}:${post.channelId}`),
    )

    if (nextSubscriptionChannels.length !== database.subscriptionChannels.length) {
      database.subscriptionChannels = nextSubscriptionChannels
      didMutate = true
    }

    if (nextSubscriptionPosts.length !== database.subscriptionPosts.length) {
      database.subscriptionPosts = nextSubscriptionPosts
      didMutate = true
    }
  }

  return {
    database,
    needsPersistenceRewrite: didMutate,
  }
}

function normalizeDeletedAccountResidue(database: Database) {
  let didMutate = false
  const deletedIdentifiers = new Set(
    database.accounts
      .filter((account) => isPublicDeletedAccount(account))
      .map((account) => normalizeStoredIdentifierReference(account.identifier)),
  )

  if (deletedIdentifiers.size === 0) {
    return {
      database,
      needsPersistenceRewrite: didMutate,
    }
  }

  for (const group of database.groups) {
    const nextParticipants = (group.participants ?? []).filter(
      (participant) =>
        !deletedIdentifiers.has(normalizeStoredIdentifierReference(participant.identifier ?? '')),
    )

    if (nextParticipants.length !== (group.participants ?? []).length || group.members !== nextParticipants.length) {
      group.participants = nextParticipants
      group.members = nextParticipants.length
      didMutate = true
    }
  }

  for (const channel of database.subscriptionChannels) {
    const nextParticipants = (channel.participants ?? []).filter(
      (participant) =>
        !deletedIdentifiers.has(normalizeStoredIdentifierReference(participant.identifier ?? '')),
    )

    if (nextParticipants.length !== (channel.participants ?? []).length) {
      channel.participants = nextParticipants
      didMutate = true
    }
  }

  const nextPendingChannelInvitations = database.pendingChannelInvitations.filter(
    (invitation) =>
      !deletedIdentifiers.has(normalizeStoredIdentifierReference(invitation.senderIdentifier)) &&
      !deletedIdentifiers.has(normalizeStoredIdentifierReference(invitation.recipientIdentifier)),
  )

  if (nextPendingChannelInvitations.length !== database.pendingChannelInvitations.length) {
    database.pendingChannelInvitations = nextPendingChannelInvitations
    didMutate = true
  }

  const nextPendingGroupInvitations = database.pendingGroupInvitations.filter(
    (invitation) =>
      !deletedIdentifiers.has(normalizeStoredIdentifierReference(invitation.senderIdentifier)) &&
      !deletedIdentifiers.has(normalizeStoredIdentifierReference(invitation.recipientIdentifier)),
  )

  if (nextPendingGroupInvitations.length !== database.pendingGroupInvitations.length) {
    database.pendingGroupInvitations = nextPendingGroupInvitations
    didMutate = true
  }

  return {
    database,
    needsPersistenceRewrite: didMutate,
  }
}

function ensureAcceptedContactLinksForLegacyDialogs(database: Database) {
  let didMutate = false
  const dialogOwnersByPair = new Map<string, Set<string>>()
  const messagePresenceByPair = new Map<string, boolean>()
  const dialogMessageKeys = new Set(
    database.dialogMessages.map((message) => `${message.ownerIdentifier}:${message.dialogId}`),
  )

  for (const dialog of database.dialogs) {
    // Hidden direct copies represent intentionally removed contacts and must not auto-resurrect
    // accepted contact links during legacy normalization.
    if (dialog.hidden) {
      continue
    }

    const ownerIdentifier = normalizeStoredIdentifierReference(dialog.ownerIdentifier)
    const peerIdentifier = normalizeStoredIdentifierReference(dialog.phone)
    if (!ownerIdentifier || !peerIdentifier || ownerIdentifier === peerIdentifier) {
      continue
    }

    const ownerAccount = database.accounts.find((account) => account.identifier === ownerIdentifier)
    const peerAccount = database.accounts.find((account) => account.identifier === peerIdentifier)
    if (!ownerAccount || !peerAccount || isPublicDeletedAccount(ownerAccount) || isPublicDeletedAccount(peerAccount)) {
      continue
    }

    const pair = buildCanonicalContactPair(ownerIdentifier, peerIdentifier)
    const pairKey = `${pair.leftIdentifier}:${pair.rightIdentifier}`
    const owners = dialogOwnersByPair.get(pairKey) ?? new Set<string>()
    owners.add(ownerIdentifier)
    dialogOwnersByPair.set(pairKey, owners)

    if (dialogMessageKeys.has(`${dialog.ownerIdentifier}:${dialog.id}`)) {
      messagePresenceByPair.set(pairKey, true)
    }
  }

  for (const [pairKey, owners] of dialogOwnersByPair.entries()) {
    if (owners.size < 2 && !messagePresenceByPair.get(pairKey)) {
      continue
    }

    const [leftIdentifier, rightIdentifier] = pairKey.split(':')
    if (!leftIdentifier || !rightIdentifier) {
      continue
    }

    const existingLink = findContactLink(database, leftIdentifier, rightIdentifier)
    if (existingLink) {
      continue
    }

    const createdAt = new Date().toISOString()
    database.contactLinks.push({
      createdAt,
      leftIdentifier,
      requesterIdentifier: leftIdentifier,
      rightIdentifier,
      status: 'accepted',
      updatedAt: createdAt,
    })
    didMutate = true
  }

  return didMutate
}

function applyEnvironmentFixturePolicy(database: Database, needsPersistenceRewrite: boolean) {
  const fixtureState =
    runtimeConfig.environment === 'development'
      ? applyNonProductionFixtures(database)
      : { database, needsPersistenceRewrite: false }
  const cleanupState =
    runtimeConfig.environment === 'production'
      ? applyProductionFixtureCleanup(fixtureState.database)
      : { database: fixtureState.database, needsPersistenceRewrite: false }
  const prunedLegacyMockResidue =
    runtimeConfig.environment === 'development'
      ? pruneLegacyNonProductionMockResidue(cleanupState.database)
      : { database: cleanupState.database, needsPersistenceRewrite: false }
  const normalizedDeletedResidue = normalizeDeletedAccountResidue(prunedLegacyMockResidue.database)
  const repairedDialogIdCollisions = repairPersistedDialogIdCollisions(prunedLegacyMockResidue.database)
  const normalizedDuplicateDialogs = normalizePersistedDuplicateDialogs(prunedLegacyMockResidue.database)
  const normalizedPersistedDialogs = normalizePersistedDialogs(prunedLegacyMockResidue.database)
  const dedupePersistedMessages = dedupePersistedMessagesByDeliveryId(prunedLegacyMockResidue.database)
  const ensuredAcceptedLegacyContactLinks = ensureAcceptedContactLinksForLegacyDialogs(prunedLegacyMockResidue.database)
  const ensuredManagedChannelOwnerCopies = ensureManagedChannelOwnerCopies(prunedLegacyMockResidue.database)
  const repairedSubscriptionChannelIdentities = repairSubscriptionChannelIdentityConflicts(prunedLegacyMockResidue.database)
  const dedupeSubscriptionPosts = dedupePersistedSubscriptionPosts(prunedLegacyMockResidue.database)

  return {
    database: prunedLegacyMockResidue.database,
    needsPersistenceRewrite:
      needsPersistenceRewrite ||
      fixtureState.needsPersistenceRewrite ||
      prunedLegacyMockResidue.needsPersistenceRewrite ||
      normalizedDeletedResidue.needsPersistenceRewrite ||
      repairedDialogIdCollisions ||
      normalizedDuplicateDialogs ||
      normalizedPersistedDialogs ||
      dedupePersistedMessages ||
      ensuredAcceptedLegacyContactLinks ||
      ensuredManagedChannelOwnerCopies ||
      repairedSubscriptionChannelIdentities ||
      dedupeSubscriptionPosts ||
      cleanupState.needsPersistenceRewrite,
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
    canonicalDialog.hidden = sortedDialogs.every((dialog) => Boolean(dialog.hidden))
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

function normalizePersistedDialogs(database: Database) {
  let didMutate = false
  const accountsByIdentifier = new Map(
    database.accounts.map((account) => [normalizeStoredIdentifierReference(account.identifier), account] as const),
  )
  const onlineIdentifiers = new Set(
    database.sessions
      .map((session) => normalizeStoredIdentifierReference(session.identifier))
      .filter(Boolean),
  )

  for (const dialog of database.dialogs) {
    if (dialog.hidden !== undefined && typeof dialog.hidden !== 'boolean') {
      dialog.hidden = Boolean(dialog.hidden)
      didMutate = true
    }

    const normalizedPhone = normalizeStoredIdentifierReference(dialog.phone)
    if (normalizedPhone && dialog.phone !== normalizedPhone) {
      dialog.phone = normalizedPhone
      didMutate = true
    }

    const account = accountsByIdentifier.get(normalizedPhone)
    if (!account) {
      continue
    }

    if (
      syncPersistedDialogWithAccount(dialog, account, {
        online: onlineIdentifiers.has(account.identifier),
      })
    ) {
      didMutate = true
    }
  }

  return didMutate
}

function ensureManagedChannelOwnerCopies(database: Database) {
  let didMutate = false

  for (const channel of database.managedChannels) {
    // Backfill legacy data into the same invariant enforced at runtime:
    // every managed channel keeps a canonical owner subscription copy.
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
      if (existingCopy.creatorIdentifier !== channel.ownerIdentifier) {
        existingCopy.creatorIdentifier = channel.ownerIdentifier
        didMutate = true
      }
      if (existingCopy.description !== channel.description) {
        existingCopy.description = channel.description
        didMutate = true
      }
      if (existingCopy.statusText !== (channel.statusText?.trim() || undefined)) {
        existingCopy.statusText = channel.statusText?.trim() || undefined
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
      continue
    }

    database.subscriptionChannels.push({
      accent: channel.avatarTone,
      avatarImage: channel.avatarImage,
      creatorIdentifier: channel.ownerIdentifier,
      description: channel.description,
      statusText: channel.statusText?.trim() || undefined,
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
      preview: buildManagedChannelFallbackPreview(channel),
      readers: 0,
      subscribedAt: new Date().toISOString(),
      time: '',
      title: channel.title,
      unread: 0,
      visibility: channel.visibility,
    })
    didMutate = true
  }

  for (const channel of database.managedChannels) {
    const syncState = syncManagedChannelCopiesInDatabase(database, new Set<string>(), channel)
    if (syncState.didMutate) {
      didMutate = true
    }
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
        accountId: account.accountId?.trim() || randomUUID(),
        archiveUnlimited: Boolean(account.archiveUnlimited),
        archivedOriginalIdentifier: normalizeIdentifier(account.archivedOriginalIdentifier ?? '') || undefined,
        archivedProfile: account.archivedProfile
          ? {
              avatarImage: account.archivedProfile.avatarImage?.trim() || undefined,
              displayName: sanitizePersonField(account.archivedProfile.displayName ?? '', displayNameFieldMaxLength),
              nickname: normalizeNickname(account.archivedProfile.nickname ?? '') || undefined,
              status: sanitizeStatusField(account.archivedProfile.status ?? ''),
              surname: sanitizePersonField(account.archivedProfile.surname ?? '', surnameFieldMaxLength),
            }
          : undefined,
        blockedAt: account.blockedAt || undefined,
        blockedReason: account.blockedReason || undefined,
        deletedAt: account.deletedAt || undefined,
        deletedBySelfService: Boolean(account.deletedBySelfService),
        deletionMode:
          account.deletionMode === 'account-and-user-data-hidden'
            ? 'account-and-user-data-hidden'
            : account.deletionMode === 'account-only'
              ? 'account-only'
              : undefined,
        identifier: normalizeStoredIdentifierReference(account.identifier),
        lastActiveAt: account.lastActiveAt || account.createdAt,
        passwordHash: account.passwordHash?.trim() || undefined,
        passwordSetAt: account.passwordSetAt || undefined,
        publicDeleted: Boolean(account.publicDeleted),
        retainedArchiveStorageQuotaBytes: normalizeRetainedArchiveStorageQuotaBytes(account),
        retainedStorageQuotaBytes: normalizeRetainedStorageQuotaBytes(account),
        staffRole: sanitizeStaffRole(account.staffRole),
        statusHistory: normalizeAccountStatusHistory(
          account.statusHistory,
          account.createdAt,
          account.status ?? '',
        ),
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
      authCodeSendAttempts: (normalized.authCodeSendAttempts ?? [])
        .map((attempt): AuthCodeSendAttempt => ({
          createdAt: attempt.createdAt,
          entryPoint: attempt.entryPoint === 'admin' ? 'admin' : 'user',
          flow: attempt.flow === 'password-reset' ? 'password-reset' : 'default',
          identifier: normalizeIdentifier(attempt.identifier),
          ip: sanitizeIpAddress(attempt.ip) ?? undefined,
        }))
        .filter((attempt) => Boolean(attempt.identifier && parseIsoDate(attempt.createdAt) !== null)),
      authChallenges: (normalized.authChallenges ?? []).map((challenge) => ({
        ...challenge,
        purpose:
          challenge.purpose === 'admin' ||
          challenge.purpose === 'password-reset' ||
          challenge.purpose === 'password-setup'
            ? challenge.purpose
            : 'registration',
      })),
      contactLinks: (normalized.contactLinks ?? [])
        .map((link): ContactLink => {
          const pair = buildCanonicalContactPair(link.leftIdentifier, link.rightIdentifier)
          return {
            blockedByIdentifier: normalizeIdentifier(link.blockedByIdentifier ?? '') || undefined,
            createdAt: link.createdAt,
            leftIdentifier: pair.leftIdentifier,
            requesterIdentifier: normalizeIdentifier(link.requesterIdentifier),
            rightIdentifier: pair.rightIdentifier,
            status:
              link.status === 'accepted' || link.status === 'blocked'
                ? link.status
                : 'pending',
            updatedAt: link.updatedAt || link.createdAt,
          }
        })
        .filter(
          (link) =>
            Boolean(
              link.leftIdentifier &&
              link.rightIdentifier &&
              link.requesterIdentifier &&
              link.leftIdentifier !== link.rightIdentifier &&
              parseIsoDate(link.createdAt) !== null &&
              parseIsoDate(link.updatedAt) !== null,
            ),
        ),
      contactReports: normalized.contactReports ?? [],
      dialogs: normalized.dialogs ?? [],
      dialogMessages: normalized.dialogMessages ?? [],
      groupMessages: normalized.groupMessages ?? [],
      groups: (normalized.groups ?? []).map((group) => ({
        ...group,
        archiveUnlimited: Boolean(group.archiveUnlimited),
        description: sanitizeChannelDescription(group.description ?? ''),
      })),
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
      managedChannels: (normalized.managedChannels ?? []).map((channel) => {
        const normalizedStatusText = sanitizeStatusField(channel.statusText ?? '')
        const normalizedDescription = sanitizeChannelDescription(channel.description ?? '')
        const legacyStatusText = normalizedStatusText || normalizedDescription || undefined

        return {
          ...channel,
          archiveUnlimited: Boolean(channel.archiveUnlimited),
          description: normalizedStatusText ? normalizedDescription : '',
          statusText: legacyStatusText,
        }
      }),
      archivedMedia: (normalized.archivedMedia ?? [])
        .map((item): PersistedArchivedMediaRecord => ({
          archivedAt: item.archivedAt || new Date().toISOString(),
          archiveReason: item.archiveReason === 'manual-delete' ? 'manual-delete' : item.archiveReason === 'retention-delete' ? 'retention-delete' : 'storage-quota',
          fileName: item.fileName?.trim() || 'media',
          height: item.height ? Math.max(1, Math.floor(item.height)) : undefined,
          id: item.id?.trim() || randomUUID(),
          kind: item.kind === 'gif' ? 'gif' : 'attachment',
          mediaUrl: item.mediaUrl?.trim() || '',
          mimeType: item.mimeType?.trim() || 'application/octet-stream',
          originalContext: item.originalContext?.trim() || item.primaryLabel?.trim() || 'Архивное медиа',
          ownerIdentifier: normalizeIdentifier(item.ownerIdentifier ?? '') || undefined,
          primaryLabel: item.primaryLabel?.trim() || item.originalContext?.trim() || 'Архивное медиа',
          restoreTargets: sanitizeArchivedMediaRestoreTargets(item.restoreTargets),
          size: Math.max(0, Math.floor(item.size ?? 0)),
          storageSubjectId: item.storageSubjectId?.trim() || '',
          storageSubjectKind: item.storageSubjectKind === 'group' ? 'group' : item.storageSubjectKind === 'channel' ? 'channel' : 'user',
          width: item.width ? Math.max(1, Math.floor(item.width)) : undefined,
        }))
        .filter((item) => Boolean(item.mediaUrl && item.storageSubjectId && item.size > 0)),
      pendingChannelInvitations: (normalized.pendingChannelInvitations ?? [])
        .map((invitation): PendingChannelInvitation => ({
          channelHandle: normalizeChannelHandleForComparison(invitation.channelHandle),
          createdAt: invitation.createdAt,
          recipientIdentifier: normalizeIdentifier(invitation.recipientIdentifier),
          senderIdentifier: normalizeIdentifier(invitation.senderIdentifier),
        }))
        .filter(
          (invitation) =>
            Boolean(
              invitation.channelHandle &&
              invitation.recipientIdentifier &&
              invitation.senderIdentifier &&
              parseIsoDate(invitation.createdAt) !== null,
            ),
        ),
      pendingGroupInvitations: (normalized.pendingGroupInvitations ?? [])
        .map((invitation): PendingGroupInvitation => ({
          createdAt: invitation.createdAt,
          recipientIdentifier: normalizeIdentifier(invitation.recipientIdentifier),
          senderIdentifier: normalizeIdentifier(invitation.senderIdentifier),
          sharedId: invitation.sharedId?.trim() || '',
        }))
        .filter(
          (invitation) =>
            Boolean(
              invitation.sharedId &&
              invitation.recipientIdentifier &&
              invitation.senderIdentifier &&
              parseIsoDate(invitation.createdAt) !== null,
            ),
        ),
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
      sessions: (normalized.sessions ?? [])
        .map((session): SessionRecord => {
          const createdAt = session.createdAt
          const fallbackBaseTimestamp = parseIsoDate(createdAt) ?? Date.now()
          const normalizedExpiresAt =
            parseIsoDate(session.expiresAt) !== null
              ? session.expiresAt
              : new Date(fallbackBaseTimestamp + SESSION_TTL_MS).toISOString()

          return {
            createdAt,
            expiresAt: normalizedExpiresAt,
            identifier: normalizeIdentifier(session.identifier),
            token: session.token,
          }
        })
        .filter(
          (session) =>
            Boolean(
              session.identifier &&
              session.token &&
              parseIsoDate(session.createdAt) !== null &&
              parseIsoDate(session.expiresAt) !== null,
            ),
        ),
      subscriptionChannelReports: normalized.subscriptionChannelReports ?? [],
      subscriptionChannels: normalized.subscriptionChannels ?? [],
      subscriptionPosts: normalized.subscriptionPosts ?? [],
      supportTickets: (normalized.supportTickets ?? [])
        .map((ticket): PersistedSupportTicket => ({
          attachment: sanitizeMessageAttachment(ticket.attachment),
          attachmentRemovedNotice: sanitizeAttachmentRemovedNotice(ticket.attachmentRemovedNotice),
          comments: compactThreadComments(ticket.comments),
          createdAt: ticket.createdAt,
          deliveryId: ticket.deliveryId?.trim() || undefined,
          id: Math.max(0, Math.floor(ticket.id ?? 0)),
          openedByStaffAt: ticket.openedByStaffAt,
          ownerIdentifier: normalizeIdentifier(ticket.ownerIdentifier),
          replyTo: sanitizeReplyTarget(ticket.replyTo),
          status: sanitizeSupportTicketStatus(ticket.status),
          text: sanitizeThreadCommentText(ticket.text ?? ''),
          threadId: ticket.threadId?.trim() || `support:${Math.max(0, Math.floor(ticket.id ?? 0))}`,
          time: ticket.time?.trim() || formatNowTime(),
          updatedAt: ticket.updatedAt,
        }))
        .filter((ticket) =>
          Boolean(
            ticket.ownerIdentifier &&
            ticket.threadId &&
            parseIsoDate(ticket.createdAt) !== null &&
            parseIsoDate(ticket.updatedAt) !== null &&
            (ticket.text || ticket.attachment),
          ),
        ),
      threadStates: (normalized.threadStates ?? [])
        .map((threadState): PersistedThreadState => ({
          lastReadCommentCreatedAt: threadState.lastReadCommentCreatedAt || undefined,
          lastReadCommentId:
            typeof threadState.lastReadCommentId === 'number'
              ? Math.max(0, Math.floor(threadState.lastReadCommentId))
              : undefined,
          ownerIdentifier: normalizeIdentifier(threadState.ownerIdentifier),
          subscription:
            threadState.subscription === 'subscribed' || threadState.subscription === 'unsubscribed'
              ? threadState.subscription
              : 'implicit',
          threadId: threadState.threadId?.trim() || '',
        }))
        .filter((threadState) => Boolean(threadState.ownerIdentifier && threadState.threadId)),
      nextSupportTicketNumber: Math.max(
        0,
        Math.floor(
          normalized.nextSupportTicketNumber ??
            ((normalized.supportTickets ?? []).reduce(
              (maxTicketId, ticket) => Math.max(maxTicketId, Math.max(0, Math.floor(ticket.id ?? 0))),
              -1,
            ) + 1),
        ),
      ),
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
