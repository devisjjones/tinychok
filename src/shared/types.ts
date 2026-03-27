export type MessageAttachment = {
  fileName: string
  height?: number
  mediaUrl: string
  mimeType: string
  reportState?: {
    alreadyReported: boolean
    reportCount: number
  }
  size: number
  width?: number
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

export type StorageUsage = {
  percentUsed: number
  quotaBytes: number
  remainingBytes: number
  usedBytes: number
}

export type ThreadComment = {
  attachment?: MessageAttachment
  id: number
  author: 'me' | 'them'
  authorIdentifier?: string
  createdAt?: string
  deliveryId?: string
  displayAuthor?: string
  replyTo?: Message['replyTo']
  text: string
  time: string
}

export type GroupThreadInboxItem = {
  kind: 'group'
  commentCount: number
  groupAccent: string
  groupId: number
  groupTitle: string
  latestActivityAt?: string
  latestCommentAuthor?: string
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
  kind: 'channel'
  channelAccent: string
  channelId: number
  channelTitle: string
  commentCount: number
  latestActivityAt?: string
  latestCommentAuthor?: string
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

export type ChannelPost = {
  replyTo?: Message['replyTo']
  id: number
  text: string
  time: string
  createdAt?: string
  attachment?: MessageAttachment
  threadComments?: ThreadComment[]
  threadId?: string
}

export type ChannelMessageSource = {
  accent?: string
  draft?: boolean
  handle?: string
  id?: number
  leadText?: string
  title: string
  visibility?: SubscriptionChannel['visibility']
}

export type GroupMessageSource = {
  accent?: string
  avatarImage?: string
  creatorIdentifier?: string
  handle?: string
  sharedId?: string
  title: string
}

export type GroupParticipant = {
  id: number
  identifier?: string
  nickname?: string
  title: string
  accent: string
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
  readAt?: string
  replyTo?: {
    id: number
    text: string
    author: 'me' | 'them'
  }
  forwarded?: boolean
  forwardedAuthorName?: string
  groupParticipantId?: number
  sourceChannel?: ChannelMessageSource
  sourceGroup?: GroupMessageSource
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

export type SearchResult = {
  id: number
  title: string
  handle: string
  phone: string
  accent: string
  subtitle: string
}

export type SubscriptionChannel = {
  id: number
  title: string
  handle: string
  avatarImage?: string
  statusText?: string
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
  creatorIdentifier?: string
  isTestEntity?: boolean
  latestActivityAt?: string
  historyHasMore?: boolean
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
  description: string
  avatarTone: string
  avatarImage?: string
  commentsEnabledForAll?: boolean
  commentsEnabledForPremium?: boolean
  commentBlacklistIdentifiers?: string[]
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
export type SettingsView = 'profile' | 'management' | 'blocked'
export type CookieConsentChoice = 'necessary' | 'analytics'

export type Account = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
  status?: string
  avatarImage?: string
  soundsDisabled?: boolean
  isTestEntity?: boolean
  premium?: boolean
  premiumExpiresAt?: string
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
