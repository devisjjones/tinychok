import type {
  Account,
  Channel,
  Chat,
  GroupPreview,
  MessageAttachment,
  Message,
  SearchResult,
  Session,
  SubscriptionChannel,
} from '../app/types'

export type ExistingAccountPreview = Pick<Account, 'displayName' | 'surname'>

export type AppSnapshot = {
  session: Session
  chats: Chat[]
  groups: GroupPreview[]
  channels: Channel[]
  subscriptionChannels: SubscriptionChannel[]
  discoveryResults: SearchResult[]
}

export type RequestCodeBody = {
  identifier: string
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
  forwarded?: boolean
  forwardedAuthorName?: string
  sourceChannel?: Message['sourceChannel']
  text: string
}

export type SendGroupThreadCommentBody = {
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

export type SendSubscriptionChannelThreadCommentBody = {
  text: string
}

export type SendManagedChannelPostBody = {
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
