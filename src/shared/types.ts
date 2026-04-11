export type MessageAttachmentPresentation = 'default' | 'video-note'

export type MessageAttachment = {
  fileName: string
  height?: number
  mediaUrl: string
  mimeType: string
  presentation?: MessageAttachmentPresentation
  reportState?: {
    alreadyReported: boolean
    reportCount: number
  }
  size: number
  width?: number
}

export type AttachmentRemovedNotice = {
  perspective?: 'author' | 'peer' | 'self'
  removedAt: string
  reason: 'storage-quota' | 'storage-manual'
  text: string
}

export type StaffRole = 'owner' | 'moderator' | 'support'

export type UserGifLibraryItem = {
  createdAt: string
  fileName: string
  height?: number
  id: string
  mediaUrl: string
  mimeType: 'image/gif'
  size: number
  width?: number
}

export type UserStorageItem = {
  createdAt: string
  fileName: string
  height?: number
  id: string
  kind: 'attachment'
  mediaUrl: string
  mimeType: string
  primaryLabel: string
  size: number
  usageCount: number
  width?: number
}

export type StorageSubjectKind = 'user' | 'group' | 'channel'

export type StorageUsage = {
  percentUsed: number
  quotaBytes: number
  remainingBytes: number
  usedBytes: number
}

export type StorageQuotaUsage = StorageUsage
export type StorageArchiveUsage = StorageUsage & {
  unlimited?: boolean
}

export type StorageArchiveReason = 'manual-delete' | 'storage-quota' | 'retention-delete'

export type StorageSubjectSummary = {
  archiveUnlimited?: boolean
  archiveUsage?: StorageArchiveUsage
  storageUsage?: StorageQuotaUsage
}

export type ThreadComment = {
  attachment?: MessageAttachment
  attachmentRemovedNotice?: AttachmentRemovedNotice
  id: number
  author: 'me' | 'them'
  authorIdentifier?: string
  createdAt?: string
  deliveryId?: string
  displayAuthor?: string
  replyTo?: Message['replyTo']
  sourceChannel?: ChannelMessageSource
  sourceContact?: ContactMessageSource
  text: string
  time: string
}

export type GroupThreadInboxItem = {
  avatarImage?: string
  kind: 'group'
  commentCount: number
  groupAccent: string
  groupId: number
  groupTitle: string
  latestActivityAt?: string
  latestCommentAuthor?: string
  latestCommentAuthorAccent?: string
  latestCommentAuthorAvatarImage?: string
  latestCommentText: string
  latestCommentTime: string
  messageId: number
  sourceText: string
  sourceTime: string
  subscribed: boolean
  threadId: string
  unreadCount: number
}

export type ChannelThreadInboxItem = {
  avatarImage?: string
  kind: 'channel'
  channelAccent: string
  channelId: number
  channelTitle: string
  commentCount: number
  latestActivityAt?: string
  latestCommentAuthor?: string
  latestCommentAuthorAccent?: string
  latestCommentAuthorAvatarImage?: string
  latestCommentText: string
  latestCommentTime: string
  postId: number
  sourceText: string
  sourceTime: string
  subscribed: boolean
  threadId: string
  unreadCount: number
}

export type ThreadInboxItem = GroupThreadInboxItem | ChannelThreadInboxItem

export type SupportTicketComment = ThreadComment

export type SupportTicketStatus = 'open' | 'needs_confirmation' | 'resolved' | 'reopened'

export type SupportTicket = {
  attachment?: MessageAttachment
  attachmentRemovedNotice?: AttachmentRemovedNotice
  comments: SupportTicketComment[]
  createdAt: string
  deliveryId?: string
  id: number
  latestActivityAt?: string
  replyTo?: Message['replyTo']
  status: SupportTicketStatus
  text: string
  threadId: string
  time: string
  unreadCount: number
  updatedAt: string
}

export type ChannelPost = {
  replyTo?: Message['replyTo']
  id: number
  deliveryId?: string
  sourceChannel?: ChannelMessageSource
  sourceContact?: ContactMessageSource
  text: string
  time: string
  createdAt?: string
  attachment?: MessageAttachment
  attachmentRemovedNotice?: AttachmentRemovedNotice
  system?: boolean
  threadArchivedAt?: string
  threadArchiveReason?: ArchiveReason
  threadComments?: ThreadComment[]
  threadId?: string
}

export type ChannelMessageSource = {
  accent?: string
  draft?: boolean
  handle?: string
  id?: number
  leadText?: string
  statusText?: string
  title: string
  visibility?: SubscriptionChannel['visibility']
}

export type GroupMessageSource = {
  accent?: string
  archivedAt?: string
  archiveReason?: ArchiveReason
  avatarImage?: string
  creatorIdentifier?: string
  groupOwnerIdentifier?: string
  handle?: string
  leadText?: string
  sharedId?: string
  title: string
}

export type GroupSystemEventActor = {
  identifier?: string
  premium: boolean
  title: string
}

export type GroupSystemEvent =
  | {
      kind: 'member-joined'
      actor: GroupSystemEventActor
    }
  | {
      kind: 'member-left'
      actor: GroupSystemEventActor
    }
  | {
      kind: 'owner-transferred'
      actor: GroupSystemEventActor
    }

export type ContactMessageSource = {
  accent?: string
  avatarImage?: string
  handle?: string
  identifier?: string
  status?: string
  title: string
}

export type GroupParticipant = {
  id: number
  identifier?: string
  nickname?: string
  title: string
  accent: string
  avatarImage?: string
  archivedAccount?: boolean
  online?: boolean
  premium?: boolean
  favorite?: boolean
  status: string
}

export type Message = {
  id: number
  author: 'me' | 'them'
  text: string
  time: string
  createdAt?: string
  deliveryId?: string
  displayAuthor?: string
  attachment?: MessageAttachment
  attachmentRemovedNotice?: AttachmentRemovedNotice
  readAt?: string
  system?: boolean
  replyTo?: {
    id: number
    text: string
    author: 'me' | 'them'
  }
  forwarded?: boolean
  forwardedAuthorName?: string
  groupParticipantId?: number
  groupSystemEvent?: GroupSystemEvent
  sourceChannel?: ChannelMessageSource
  sourceContact?: ContactMessageSource
  sourceGroup?: GroupMessageSource
  threadArchivedAt?: string
  threadArchiveReason?: ArchiveReason
  threadComments?: ThreadComment[]
  threadId?: string
}

export type ReplyTarget = {
  id: number
  text: string
  author: Message['author']
}

export type Chat = {
  id: number
  title: string
  handle: string
  phone: string
  avatarImage?: string
  contactState?: ContactState
  hidden?: boolean
  archivedAccount?: boolean
  isTestEntity?: boolean
  accent: string
  mood: string
  status: string
  online?: boolean
  lastSeen?: string
  typing?: boolean
  unread: number
  muted?: boolean
  pinned?: boolean
  premium?: boolean
  blockedByAdmin?: boolean
  blockedReason?: string
  pinnedMessageId?: number
  pinnedMessage?: Message
  historyHasMore?: boolean
  messages: Message[]
}

export type ContactState =
  | 'none'
  | 'pending-outgoing'
  | 'pending-incoming'
  | 'accepted'
  | 'blocked-by-me'
  | 'blocked-by-peer'

export type ContactRequestPreview = {
  accent: string
  avatarImage?: string
  createdAt: string
  handle: string
  identifier: string
  premium?: boolean
  status: string
  title: string
}

export type ArchiveReason =
  | 'admin-archived'
  | 'owner-self-deleted'
  | 'owner-deleted'
  | 'self-service-data-hidden'
  | 'orphaned-group'

export type SearchResult = {
  id: number
  title: string
  handle: string
  phone: string
  accent: string
  subtitle: string
}

export type ChannelSearchResult = {
  accent: string
  archivedAt?: string
  avatarImage?: string
  description?: string
  handle: string
  id: number
  muted?: boolean
  statusText?: string
  title: string
  unread: number
  visibility: SubscriptionChannel['visibility']
}

export type SubscriptionChannel = {
  id: number
  title: string
  handle: string
  avatarImage?: string
  creatorIdentifier?: string
  archivedAt?: string
  archiveReason?: ArchiveReason
  statusText?: string
  description?: string
  isTestEntity?: boolean
  latestActivityAt?: string
  historyHasMore?: boolean
  commentsEnabledForAll?: boolean
  commentsEnabledForPremium?: boolean
  commentBlacklistIdentifiers?: string[]
  accent: string
  readers: number
  preview: string
  time: string
  unread: number
  muted?: boolean
  storageUsage?: StorageQuotaUsage
  draft?: boolean
  participants?: GroupParticipant[]
  visibility: 'private' | 'public' | 'closed'
  posts: ChannelPost[]
}

export type GroupPreview = {
  id: number
  title: string
  handle: string
  accent: string
  avatarImage?: string
  archivedAt?: string
  archiveReason?: ArchiveReason
  creatorIdentifier?: string
  description?: string
  groupOwnerIdentifier?: string
  isTestEntity?: boolean
  latestActivityAt?: string
  historyHasMore?: boolean
  showHistoryToNewMembers?: boolean
  viewerIsOwner?: boolean
  commentsEnabledForAll?: boolean
  commentsEnabledForPremium?: boolean
  commentBlacklistIdentifiers?: string[]
  muted?: boolean
  preview: string
  sharedId?: string
  time: string
  unread: number
  members: number
  participants: GroupParticipant[]
  messages: Message[]
}

export type ActionAnchor = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  align: 'start' | 'end'
}

export type Channel = {
  id: number
  title: string
  directLink: string
  statusText?: string
  description: string
  avatarTone: string
  avatarImage?: string
  archivedAt?: string
  archiveReason?: ArchiveReason
  commentsEnabledForAll?: boolean
  commentsEnabledForPremium?: boolean
  commentBlacklistIdentifiers?: string[]
  storageUsage?: StorageQuotaUsage
  status: 'draft' | 'active'
  visibility: 'private' | 'public' | 'closed'
}

export type ChannelsView = 'list' | 'create' | 'detail' | 'invite'
export type TopListView = 'none' | 'channels' | 'groups' | 'threads'
export type AuthStep =
  | 'phone'
  | 'password'
  | 'code'
  | 'profile-password'
  | 'password-setup'
  | 'password-reset'
export type StageView = 'main' | 'settings' | 'premium' | 'channels'
export type SettingsView = 'profile' | 'management' | 'blocked' | 'quiet' | 'support' | 'storage'
export type CookieConsentChoice = 'necessary' | 'analytics'

export type QuietModeSettings = {
  dialogs: boolean
  channels: boolean
  groups: boolean
  threads: boolean
  contactRequests: boolean
  autoInvisibility: boolean
}

export type AccountStatusHistoryEntry = {
  setAt: string
  status: string
}

export type Account = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
  status?: string
  statusHistory?: AccountStatusHistoryEntry[]
  avatarImage?: string
  browserNotificationsEnabled?: boolean
  darkThemeEnabled?: boolean
  quietModeEnabled?: boolean
  quietModeSettings?: QuietModeSettings
  invisibilityEnabled?: boolean
  invisibilityAutoEnabled?: boolean
  soundsDisabled?: boolean
  isTestEntity?: boolean
  premium?: boolean
  premiumExpiresAt?: string
  reportsMutedInAdmin?: boolean
  retainedStorageQuotaBytes?: number
  retainedArchiveStorageQuotaBytes?: number
  staffRole?: StaffRole
  blockedAt?: string
  blockedReason?: string
  lastActiveAt?: string
  blockedContactIds?: number[]
  gifLibrary?: UserGifLibraryItem[]
  storageUsage?: StorageUsage
  createdAt: string
}

export type Session = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
  status?: string
  avatarImage?: string
  browserNotificationsEnabled?: boolean
  darkThemeEnabled?: boolean
  quietModeEnabled?: boolean
  quietModeSettings?: QuietModeSettings
  invisibilityEnabled?: boolean
  invisibilityAutoEnabled?: boolean
  soundsDisabled?: boolean
  premium?: boolean
  premiumExpiresAt?: string
  staffRole?: StaffRole
  blockedAt?: string
  blockedReason?: string
  lastActiveAt?: string
  blockedContactIds?: number[]
  gifLibrary?: UserGifLibraryItem[]
  storageUsage?: StorageUsage
  sessionToken?: string
}
