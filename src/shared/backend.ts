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
  SubscriptionChannel,
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
  captcha: {
    enabled: boolean
    provider: CaptchaProvider
    siteKey: string | null
  }
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

export type UploadMediaKind = 'attachment' | 'channel-avatar' | 'group-avatar' | 'profile-avatar'

export type UploadMediaResponse = {
  fileName: string
  kind: UploadMediaKind
  mediaUrl: string
  mimeType: string
  size: number
  storageKey: string
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
  clientDeliveryId?: string
  replyTo?: Message['replyTo']
  text: string
}

export type ThreadSubscriptionResponse = MutationResponse & {
  threadId: string
}

export type SendManagedChannelPostBody = {
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
