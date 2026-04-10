import type {
  Account,
  AccountStatusHistoryEntry,
  ArchiveReason,
  Channel,
  ChannelSearchResult,
  ChannelThreadInboxItem,
  Chat,
  ContactRequestPreview,
  GroupThreadInboxItem,
  GroupPreview,
  MessageAttachment,
  Message,
  SearchResult,
  Session,
  StaffRole,
  StorageArchiveReason,
  StorageArchiveUsage,
  StorageQuotaUsage,
  StorageSubjectKind,
  SupportTicket,
  SubscriptionChannel,
  UserGifLibraryItem,
  UserStorageItem,
} from './types'

export type ExistingAccountPreview = Pick<Account, 'displayName' | 'surname'>

export type AppSnapshot = {
  session: Session
  chats: Chat[]
  groups: GroupPreview[]
  channels: Channel[]
  contactRequests: ContactRequestPreview[]
  outgoingContactRequests: ContactRequestPreview[]
  subscriptionChannels: SubscriptionChannel[]
  supportTicketCooldownUntil?: string
  supportTickets: SupportTicket[]
  supportUnreadCount: number
  threadInbox: Array<GroupThreadInboxItem | ChannelThreadInboxItem>
  discoveryResults: SearchResult[]
}

export type CaptchaProvider = 'disabled' | 'turnstile' | 'smartcaptcha'

export type AnalyticsProvider = 'disabled' | 'log'

export type AdminPermission =
  | 'admin.access'
  | 'dashboard.read'
  | 'users.read'
  | 'users.block'
  | 'channels.archive.manage'
  | 'groups.archive.manage'
  | 'threads.archive.manage'
  | 'users.premium.write'
  | 'users.media.export'
  | 'users.archive.export'
  | 'users.archive.manage'
  | 'ip.read'
  | 'legal.export'
  | 'reports.read'
  | 'reports.note'
  | 'reports.resolve'
  | 'media.read'
  | 'media.moderate'
  | 'audit.read'
  | 'staff.manage'

export type AdminReportEntityType =
  | 'user'
  | 'channel'
  | 'group'
  | 'message'
  | 'media'
  | 'avatar'
  | 'gif'

export type AdminReportStatus = 'open' | 'closed'

export type AdminReportAction = 'hide_entity' | 'delete_entity' | 'restrict_user' | 'close_report'

export type AdminMediaItemEntityType =
  | 'pending-upload'
  | 'profile-avatar'
  | 'group-avatar'
  | 'channel-avatar'
  | 'user-gif'
  | 'dialog-message'
  | 'group-message'
  | 'group-comment'
  | 'channel-post'
  | 'channel-comment'

export type AdminLinkedUser = {
  displayName: string
  identifier: string
  lookupIdentifier?: string
  nickname?: string
}

export type AuthEntrypoint = 'admin' | 'user'
export type AuthRequestCodeFlow = 'default' | 'password-reset'

export type RequestCodeBody = {
  captchaToken?: string
  entryPoint?: AuthEntrypoint
  flow?: AuthRequestCodeFlow
  identifier: string
}

export type ClientRuntimeConfigResponse = {
  analytics: {
    enabled: boolean
    flushIntervalMs: number
    maxBatchSize: number
    metricaCounterId: number | null
    provider: AnalyticsProvider
  }
  admin: {
    bannerLabel: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'
    enabled: boolean
    environment: 'development' | 'staging' | 'production'
    hosts: string[]
  }
  captcha: {
    enabled: boolean
    provider: CaptchaProvider
    siteKey: string | null
  }
}

export type AdminActor = {
  displayName: string
  identifier: string
  permissions: AdminPermission[]
  role: StaffRole
}

export type AdminBootstrapResponse = {
  actor: AdminActor
  config: ClientRuntimeConfigResponse['admin']
}

export type AdminDashboardResponse = {
  metrics: {
    blockedUsers: number
    closedReports: number
    monthlyPremiumUsers: number
    openReports: number
    premiumUsers: number
    totalChannels: number
    totalGroups: number
    totalMediaItems: number
    totalThreads: number
    totalUsers: number
    usedStorageBytes: number
    yearlyPremiumUsers: number
  }
}

export type AdminUserSummary = {
  archiveStorageUsage?: StorageArchiveUsage
  archiveUnlimited?: boolean
  avatarImage?: string
  blocked: boolean
  blockedAt?: string
  blockedReason?: string
  createdAt: string
  deletedAt?: string
  deletedBySelfService?: boolean
  deletionMode?: 'account-and-user-data-hidden' | 'account-only'
  displayName: string
  identifier: string
  lastActiveAt?: string
  nickname?: string
  originalIdentifier?: string
  premium: boolean
  premiumExpiresAt?: string
  reportsMutedInAdmin?: boolean
  staffRole?: StaffRole
  status?: string
  storageUsage: StorageQuotaUsage
}

export type AdminUsersResponse = {
  blockedUsers: number
  totalUsers: number
  users: AdminUserSummary[]
}

export type AdminUserIpSummary = {
  ipChangeCount: number
  lastLoginAt?: string
  lastLoginIp?: string
  latestIp?: string
  latestIpAt?: string
}

export type AdminUserDetailResponse = {
  ipSummary: AdminUserIpSummary
  statusHistory: AccountStatusHistoryEntry[]
  user: AdminUserSummary
}

export type AdminUserBlockBody = {
  reason: string
}

export type AdminUserPremiumBody = {
  durationDays?: number
  enabled: boolean
  reason: string
}

export type AdminUserReportIntakeBody = {
  muted: boolean
}

export type AdminReportNote = {
  authorDisplayName: string
  authorIdentifier: string
  createdAt: string
  id: string
  text: string
}

export type AdminReportSummary = {
  closedAt?: string
  closedByIdentifier?: string
  createdAt: string
  entityKey: string
  entityLabel: string
  entityOwnerIdentifier?: string
  entityPreview?: string
  entityType: AdminReportEntityType
  id: string
  noteCount: number
  reason: ComplaintReason
  relatedUserIdentifier?: string
  reporterIdentifier: string
  status: AdminReportStatus
  updatedAt: string
}

export type AdminReportDetailResponse = {
  report: AdminReportSummary & {
    canDelete: boolean
    canHide: boolean
    canRestrictUser: boolean
    notes: AdminReportNote[]
    relatedUser?: AdminLinkedUser
    reporter: AdminLinkedUser
    resolutionAction?: AdminReportAction
    resolutionReason?: string
  }
}

export type AdminReportsResponse = {
  reports: AdminReportSummary[]
}

export type AdminReportActionBody = {
  action: AdminReportAction
  note?: string
  reason?: string
}

export type AdminReportNoteBody = {
  text: string
}

export type AdminReportViewBody = {
  reason: string
}

export type AdminReportViewResponse = {
  previewUrl: string | null
}

export type AdminMediaItem = {
  createdAt?: string
  contextLabel: string
  entityId?: string
  entityLabel: string
  entityType: AdminMediaItemEntityType
  fileName: string
  hidden: boolean
  id: string
  kind: UploadMediaKind | 'unknown'
  linked: boolean
  mediaUrl: string
  owner: AdminLinkedUser
  relatedReportCount: number
  relatedUsers: AdminLinkedUser[]
  size: number
  typeLabel: string
}

export type AdminMediaListResponse = {
  items: AdminMediaItem[]
}

export type AdminManagedChannelSummary = {
  archiveStorageUsage?: StorageArchiveUsage
  archiveUnlimited?: boolean
  archivedAt?: string
  archiveReason?: Channel['archiveReason']
  csvFileName: string
  handle: string
  id: number
  latestActivityAt?: string
  owner: AdminLinkedUser
  postsCount: number
  readers: number
  relatedReportCount: number
  status: Channel['status']
  storageUsage?: StorageQuotaUsage
  title: string
  visibility: Channel['visibility']
}

export type AdminManagedChannelsResponse = {
  channels: AdminManagedChannelSummary[]
}

export type AdminManagedGroupSummary = {
  archivedAt?: string
  archiveReason?: GroupPreview['archiveReason']
  creator: AdminLinkedUser
  csvFileName: string
  id: string
  latestActivityAt?: string
  members: number
  owner: AdminLinkedUser
  relatedReportCount: number
  sharedId: string
  title: string
}

export type StorageSubjectUsageResponse = {
  archiveUsage?: StorageArchiveUsage
  archiveUnlimited?: boolean
  storageUsage: StorageQuotaUsage
}

export type StoragePrimaryItemsResponse = {
  items: UserStorageItem[]
  usage: StorageSubjectUsageResponse
}

export type UserStorageItemsResponse = StoragePrimaryItemsResponse

export type DeleteStorageItemBody = {
  storageItemId: string
}

export type AdminStorageExportBody = {
  currentPassword: string
  reason: string
  subjectId: string
  subjectKind: StorageSubjectKind
}

export type AdminStorageExportMode = 'archive' | 'current'

export type AdminStorageExportJobPhase = 'preparing' | 'zipping'
export type AdminStorageExportJobStatus = 'running' | 'ready' | 'cancelled' | 'failed'

export type AdminStorageExportJobStartBody = AdminStorageExportBody & {
  mode: AdminStorageExportMode
}

export type AdminStorageExportJobResponse = {
  createdAt: string
  errorMessage?: string
  failedFiles: number
  fileCount: number
  fileName?: string
  jobId: string
  mode: AdminStorageExportMode
  phase: AdminStorageExportJobPhase | null
  processedItems: number
  progressPercent: number
  status: AdminStorageExportJobStatus
  subjectId: string
  subjectKind: StorageSubjectKind
  totalItems: number
  updatedAt: string
}

export type AdminStorageExportJobCancelBody = {
  jobId: string
}

export type AdminStorageArchiveToggleBody = {
  enabled: boolean
  reason: string
  subjectId: string
  subjectKind: StorageSubjectKind
}

export type StorageArchiveManifestItem = {
  archivePath?: string
  archiveReason?: StorageArchiveReason
  archivedAt?: string
  exportError?: string
  fileName: string
  kind: 'attachment' | 'gif'
  mediaUrl: string
  mimeType: string
  originalContext: string
  ownerIdentifier?: string
  primaryLabel: string
  retentionOnly?: boolean
  size: number
  storageSubject: string
  storageSubjectKind: StorageSubjectKind
  usageCount: number
}

export type AdminManagedGroupsResponse = {
  groups: AdminManagedGroupSummary[]
}

export type AdminThreadSummary = {
  archiveReason?: ArchiveReason
  archivedAt?: string
  commentCount: number
  contextLabel: string
  csvFileName: string
  id: string
  kind: 'group' | 'channel'
  latestActivityAt?: string
  owner: AdminLinkedUser
  relatedReportCount: number
  sourceChannelHandle?: string
  sourceGroupId?: string
  sourceText: string
  title: string
}

export type AdminThreadsResponse = {
  threads: AdminThreadSummary[]
}

export type AdminSupportTicketStatus = SupportTicket['status'] | 'new'

export type AdminSupportTicketSummary = {
  commentCount: number
  createdAt: string
  id: number
  latestActivityAt?: string
  needsReply: boolean
  owner: AdminLinkedUser
  rootText: string
  status: AdminSupportTicketStatus
  ticketNumber: number
  unreadCount: number
}

export type AdminSupportTicketsResponse = {
  tickets: AdminSupportTicketSummary[]
}

export type AdminSupportTicketDetailResponse = {
  ticket: AdminSupportTicketSummary & {
    attachment?: SupportTicket['attachment']
    comments: SupportTicket['comments']
    threadId: string
    time: string
  }
}

export type AdminSupportTicketReplyBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  replyTo?: Message['replyTo']
  status: SupportTicket['status']
  text: string
}

export type AdminMediaActionBody = {
  action: 'hide' | 'delete'
  mediaUrl: string
  reason: string
}

export type AdminMediaDownloadBody = {
  mediaUrl: string
  reason: string
}

export type AdminMediaDownloadResponse = {
  downloadUrl: string
  fileName: string
}

export type AdminUserAvatarResponse = {
  avatarUrl: string | null
}

export type AdminUserAvatarBody = {
  reason: string
}

export type AdminAuditActor = {
  displayName: string
  identifier: string
  nickname?: string
  role: StaffRole
}

export type AdminAuditLogEntry = {
  action: string
  actorDisplayName: string
  actorIdentifier: string
  actorNickname?: string
  actorRole: StaffRole
  createdAt: string
  id: string
  nextValue?: unknown
  previousValue?: unknown
  reason?: string
  summary: string
  targetId: string
  targetLabel: string
  targetType: string
}

export type AdminAuditLogResponse = {
  actors: AdminAuditActor[]
  entries: AdminAuditLogEntry[]
}

export type AdminAuditCsvExportBody = {
  actorIdentifier?: string
  from?: string
  reason: string
  targetIdentifier?: string
  to?: string
}

export type AdminContentCsvExportBody = {
  reason: string
}

export type AdminEntityArchiveToggleBody = {
  enabled: boolean
  reason: string
}

export type AdminThreadCsvExportBody = AdminContentCsvExportBody & {
  threadId: string
}

export type AdminThreadArchiveToggleBody = AdminEntityArchiveToggleBody & {
  threadId: string
}

export type AdminLegalExportBody = {
  from?: string
  includeMedia?: boolean
  reason: string
  targetIdentifier: string
  to?: string
}

export type AdminUserMediaExportBody = {
  currentPassword: string
  reason: string
  targetIdentifier: string
}

export type AdminIpLogEventType = 'login' | 'ip-change'

export type AdminIpLogSource =
  | 'verify-code'
  | 'register'
  | 'password-login'
  | 'password-change'
  | 'password-setup'
  | 'password-reset'
  | 'http-api'
  | 'websocket'

export type AdminIpLogEntry = {
  createdAt: string
  eventType: AdminIpLogEventType
  id: string
  identifier: string
  ip: string
  previousIp?: string
  source: AdminIpLogSource
  userAgent?: string
}

export type AdminIpLogCsvExportBody = {
  from?: string
  reason: string
  targetIdentifier: string
  to?: string
}

export type AdminCsvExportResponse = {
  csv: string
  fileName: string
}

export type AdminDialogSummary = {
  csvFileName: string
  firstMessageAt?: string
  messageCount: number
  owner: AdminLinkedUser
  peer: AdminLinkedUser
  preview: string
  sharedKey: string
  updatedAt?: string
}

export type AdminDialogsResponse = {
  dialogs: AdminDialogSummary[]
}

export type AdminDialogLookupBody = {
  ownerIdentifier: string
  peerIdentifier: string
}

export type AdminDialogDetailResponse = {
  dialog: AdminDialogSummary | null
}

export type DiscoverySearchResponse = {
  results: SearchResult[]
}

export type ChannelDiscoverySearchResponse = {
  results: ChannelSearchResult[]
}

export type RequestCodeResponse =
  | {
      existingAccount: ExistingAccountPreview
      hasPassword: boolean
      status: 'blocked'
    }
  | {
      existingAccount: ExistingAccountPreview
      hasPassword: true
      status: 'needs-password-login'
    }
  | {
      delivery: 'sms'
      existingAccount: ExistingAccountPreview | null
      expiresAt: string
      hasPassword: boolean
      status: 'code-sent' | 'needs-sms-password-setup' | 'needs-sms-registration' | 'needs-sms-reset'
    }

export type VerifyCodeBody = {
  code: string
  entryPoint?: AuthEntrypoint
  identifier: string
}

export type VerifyCodeResponse =
  | {
      snapshot: AppSnapshot
      status: 'authenticated'
    }
  | {
      existingAccount: ExistingAccountPreview | null
      status: 'needs-password-reset' | 'needs-password-setup' | 'needs-profile-and-password'
    }

export type RegisterBody = {
  captchaToken?: string
  code: string
  confirmPassword: string
  displayName: string
  identifier: string
  password: string
}

export type RegisterResponse = {
  snapshot: AppSnapshot
}

export type LoginPasswordBody = {
  captchaToken?: string
  identifier: string
  password: string
}

export type LoginPasswordResponse = {
  snapshot: AppSnapshot
}

export type SetPasswordBody = {
  code: string
  confirmPassword: string
  identifier: string
  password: string
}

export type SetPasswordResponse = {
  snapshot: AppSnapshot
}

export type ResetPasswordBody = {
  code: string
  confirmPassword: string
  identifier: string
  password: string
}

export type ResetPasswordResponse = {
  snapshot: AppSnapshot
}

export type ChangePasswordBody = {
  confirmPassword: string
  currentPassword: string
  password: string
}

export type ChangePasswordResponse = {
  snapshot: AppSnapshot
}

export type DeleteAccountBody = {
  deleteDataToo: boolean
  password: string
}

export type DeleteAccountResponse = {
  archivedGroupsCount: number
  archivedOwnedChannelsCount: number
  success: true
  transferredGroupsCount: number
}

export type SaveSnapshotBody = {
  snapshot: AppSnapshot
}

export type OpenDirectDialogBody = {
  identifier: string
}

export type SendContactRequestBody = {
  identifier: string
}

export type DeleteDialogHistoryBody = {
  scope?: 'everyone' | 'me'
}

export type DeleteDialogMessageBody = {
  scope?: 'everyone' | 'me'
}

export type ComplaintReason = 'spam' | 'fraud' | 'very_unpleasant'

export type MutationResponse = {
  snapshot: AppSnapshot
}

export type LogoutResponse = {
  ok: true
}

export type DirectDialogHistoryResponse = {
  dialogId: number
  hasMore: boolean
  messages: Chat['messages']
}

export type GroupHistoryResponse = {
  groupId: number
  hasMore: boolean
  messages: GroupPreview['messages']
}

export type SubscriptionChannelHistoryResponse = {
  channelId: number
  hasMore: boolean
  posts: SubscriptionChannel['posts']
}

export type SubscriptionChannelPreviewResponse = {
  channel: SubscriptionChannel
}

export type OpenDirectDialogResponse = MutationResponse & {
  dialogId: number
}

export type ContactRequestActionResponse = MutationResponse

export type UploadMediaKind =
  | 'attachment'
  | 'channel-avatar'
  | 'group-avatar'
  | 'profile-avatar'
  | 'user-gif'

export type UploadMediaResponse = {
  fileName: string
  kind: UploadMediaKind
  mediaUrl: string
  mimeType: string
  size: number
  storageKey: string
}

export type RegisterUserGifBody = UserGifLibraryItem & {
  source?: 'upload' | 'viewer'
}

export type SearchUserGifsResponse = {
  items: UserGifLibraryItem[]
}

export type DeleteUserStorageItemBody = {
  storageItemId: string
}

export type DebugPremiumBody = {
  enabled: boolean
  durationDays?: number
}

export type UpdateSessionBody = Partial<
  Pick<
    Session,
    | 'displayName'
    | 'surname'
    | 'nickname'
    | 'status'
    | 'blockedContactIds'
    | 'avatarImage'
    | 'darkThemeEnabled'
    | 'quietModeEnabled'
    | 'quietModeSettings'
    | 'invisibilityEnabled'
    | 'soundsDisabled'
  >
>

export type SendDirectMessageBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  forwarded?: boolean
  forwardedAuthorName?: string
  markAsRead?: boolean
  replyTo?: Message['replyTo']
  sourceChannel?: Message['sourceChannel']
  sourceContact?: Message['sourceContact']
  sourceGroup?: Message['sourceGroup']
  text: string
}

export type SetDialogFavoriteBody = {
  pinned: boolean
}

export type UpdateDialogBody = Partial<Pick<Chat, 'muted'>>

export type ReportContactBody = {
  reason: ComplaintReason
}

export type ReportMediaBody = {
  mediaUrl: string
  reason?: ComplaintReason
}

export type SetDialogPinnedMessageBody = {
  messageId: number | null
}

export type SendGroupMessageBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  forwarded?: boolean
  forwardedAuthorName?: string
  replyTo?: Message['replyTo']
  sourceChannel?: Message['sourceChannel']
  text: string
}

export type SendGroupThreadCommentBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  replyTo?: Message['replyTo']
  text: string
}

export type UpdateGroupBody = Partial<
  Pick<
    GroupPreview,
    | 'muted'
    | 'avatarImage'
    | 'creatorIdentifier'
    | 'description'
    | 'title'
    | 'showHistoryToNewMembers'
    | 'commentsEnabledForAll'
    | 'commentsEnabledForPremium'
    | 'commentBlacklistIdentifiers'
  >
>

export type InviteGroupMemberBody = {
  dialogId: number
}

export type InviteManagedChannelMembersBody = {
  dialogIds: number[]
}

export type ManageGroupParticipantBody = {
  identifier: string
}

export type ManageSubscriptionChannelSubscriberBody = {
  identifier: string
}

export type TransferManagedChannelBody = {
  currentPassword: string
  identifier: string
}

export type SendSubscriptionChannelThreadCommentBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  replyTo?: Message['replyTo']
  text: string
}

export type SendSupportTicketBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  text: string
}

export type SendSupportTicketCommentBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  replyTo?: Message['replyTo']
  text: string
}

export type ThreadSubscriptionResponse = MutationResponse & {
  threadId: string
}

export type SendManagedChannelPostBody = {
  attachment?: MessageAttachment
  clientDeliveryId?: string
  replyTo?: Message['replyTo']
  text: string
}

export type UpdateSubscriptionChannelBody = Partial<
  Pick<
    SubscriptionChannel,
    'muted' | 'commentsEnabledForAll' | 'commentsEnabledForPremium' | 'commentBlacklistIdentifiers'
  >
>

export type ReportSubscriptionChannelBody = {
  reason: ComplaintReason
}

export type CreateManagedChannelBody = {
  avatarImage?: string
  avatarTone: string
  commentBlacklistIdentifiers?: string[]
  commentsEnabledForAll?: boolean
  commentsEnabledForPremium?: boolean
  description?: string
  directLink: string
  statusText?: string
  title: string
  visibility: Channel['visibility']
}

export type UpdateManagedChannelBody = Partial<
  Pick<
    Channel,
    | 'title'
    | 'directLink'
    | 'statusText'
    | 'description'
    | 'visibility'
    | 'avatarTone'
    | 'avatarImage'
    | 'status'
    | 'commentsEnabledForAll'
    | 'commentsEnabledForPremium'
    | 'commentBlacklistIdentifiers'
  >
>

export type CreateManagedChannelResponse = MutationResponse & {
  channelId: number
}

export type SubscribeToChannelResponse = MutationResponse & {
  channelId: number
}

export type CreateGroupBody = {
  accent?: string
  avatarImage?: string
  commentBlacklistIdentifiers?: string[]
  commentsEnabledForAll?: boolean
  commentsEnabledForPremium?: boolean
  description?: string
  handle?: string
  memberDialogIds: number[]
  showHistoryToNewMembers?: boolean
  title: string
}

export type CreateGroupResponse = MutationResponse & {
  groupId: number
}

export type JoinGroupFromInviteResponse = MutationResponse & {
  groupId: number
}

export type RealtimeEvent =
  | {
      type: 'connection.ready'
      snapshot: AppSnapshot
    }
  | {
      type: 'snapshot.updated'
      snapshot: AppSnapshot
    }
