import type {
  Account,
  Channel,
  ChannelThreadInboxItem,
  Chat,
  GroupThreadInboxItem,
  GroupPreview,
  MessageAttachment,
  Message,
  SearchResult,
  Session,
  StaffRole,
  StorageUsage,
  SubscriptionChannel,
  UserGifLibraryItem,
} from './types'

export type ExistingAccountPreview = Pick<Account, 'displayName' | 'surname'>

export type AppSnapshot = {
  session: Session
  chats: Chat[]
  groups: GroupPreview[]
  channels: Channel[]
  subscriptionChannels: SubscriptionChannel[]
  threadInbox: Array<GroupThreadInboxItem | ChannelThreadInboxItem>
  discoveryResults: SearchResult[]
}

export type CaptchaProvider = 'disabled' | 'turnstile'

export type AnalyticsProvider = 'disabled' | 'log'

export type AdminPermission =
  | 'admin.access'
  | 'dashboard.read'
  | 'users.read'
  | 'users.block'
  | 'users.premium.write'
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
}

export type RequestCodeBody = {
  captchaToken?: string
  identifier: string
}

export type ClientRuntimeConfigResponse = {
  analytics: {
    enabled: boolean
    flushIntervalMs: number
    maxBatchSize: number
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
    openReports: number
    premiumUsers: number
    totalMediaItems: number
    totalUsers: number
    usedStorageBytes: number
  }
}

export type AdminUserSummary = {
  avatarImage?: string
  blocked: boolean
  blockedAt?: string
  createdAt: string
  displayName: string
  identifier: string
  lastActiveAt?: string
  nickname?: string
  premium: boolean
  premiumExpiresAt?: string
  staffRole?: StaffRole
  status?: string
  storageUsage: StorageUsage
}

export type AdminUsersResponse = {
  users: AdminUserSummary[]
}

export type AdminUserDetailResponse = {
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

export type AdminMediaItem = {
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

export type AdminMediaActionBody = {
  action: 'hide' | 'delete'
  mediaUrl: string
  reason: string
}

export type AdminAuditLogEntry = {
  action: string
  actorDisplayName: string
  actorIdentifier: string
  actorRole: StaffRole
  createdAt: string
  id: string
  nextValue?: unknown
  previousValue?: unknown
  summary: string
  targetId: string
  targetType: string
}

export type AdminAuditLogResponse = {
  entries: AdminAuditLogEntry[]
}

export type DiscoverySearchResponse = {
  results: SearchResult[]
}

export type RequestCodeResponse = {
  delivery: 'sms'
  expiresAt: string
  existingAccount: ExistingAccountPreview | null
}

export type VerifyCodeBody = {
  captchaToken?: string
  identifier: string
  code: string
}

export type VerifyCodeResponse =
  | {
      status: 'authenticated'
      snapshot: AppSnapshot
    }
  | {
      status: 'needs-profile'
      existingAccount: null
    }

export type RegisterBody = {
  captchaToken?: string
  identifier: string
  code: string
  displayName: string
}

export type RegisterResponse = {
  snapshot: AppSnapshot
}

export type SaveSnapshotBody = {
  snapshot: AppSnapshot
}

export type OpenDirectDialogBody = {
  identifier: string
}

export type ComplaintReason = 'spam' | 'fraud' | 'very_unpleasant'

export type MutationResponse = {
  snapshot: AppSnapshot
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

export type OpenDirectDialogResponse = MutationResponse & {
  dialogId: number
}

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

export type RegisterUserGifBody = UserGifLibraryItem

export type DebugPremiumBody = {
  enabled: boolean
  durationDays?: number
}

export type UpdateSessionBody = Partial<
  Pick<
    Session,
    'displayName' | 'surname' | 'nickname' | 'status' | 'blockedContactIds' | 'avatarImage' | 'soundsDisabled'
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
    | 'title'
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

export type ManageSubscriptionChannelSubscriberBody = {
  identifier: string
}

export type SendSubscriptionChannelThreadCommentBody = {
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
  description: string
  directLink: string
  title: string
  visibility: Channel['visibility']
}

export type UpdateManagedChannelBody = Partial<
  Pick<
    Channel,
    | 'title'
    | 'directLink'
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

export type CreateGroupBody = {
  accent?: string
  avatarImage?: string
  commentBlacklistIdentifiers?: string[]
  commentsEnabledForAll?: boolean
  commentsEnabledForPremium?: boolean
  handle?: string
  memberDialogIds: number[]
  title: string
}

export type CreateGroupResponse = MutationResponse & {
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
