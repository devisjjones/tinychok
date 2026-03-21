export type MessageAttachment = {
  fileName: string
  mediaUrl: string
  mimeType: string
  size: number
}

export type ChannelPost = {
  id: number
  text: string
  time: string
  createdAt?: string
  attachment?: MessageAttachment
}

export type ChannelMessageSource = {
  accent?: string
  draft?: boolean
  handle?: string
  id?: number
  title: string
  visibility?: SubscriptionChannel['visibility']
}

export type GroupParticipant = {
  id: number
  title: string
  accent: string
  online?: boolean
  premium?: boolean
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
    text: string
    author: 'me' | 'them'
  }
  forwarded?: boolean
  forwardedAuthorName?: string
  groupParticipantId?: number
  sourceChannel?: ChannelMessageSource
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
  accent: string
  mood: string
  status: string
  online?: boolean
  lastSeen?: string
  typing?: boolean
  unread: number
  pinned?: boolean
  premium?: boolean
  pinnedMessageId?: number
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
  accent: string
  readers: number
  preview: string
  time: string
  unread: number
  draft?: boolean
  visibility: 'private' | 'public' | 'closed'
  posts: ChannelPost[]
}

export type GroupPreview = {
  id: number
  title: string
  handle: string
  accent: string
  preview: string
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
  status: 'draft' | 'active'
  visibility: 'private' | 'public' | 'closed'
}

export type ChannelsView = 'list' | 'create' | 'detail'
export type TopListView = 'none' | 'channels' | 'groups'
export type AuthStep = 'phone' | 'code' | 'profile'
export type StageView = 'main' | 'settings' | 'premium' | 'channels'
export type SettingsView = 'profile' | 'management' | 'blocked'
export type CookieConsentChoice = 'necessary' | 'analytics'

export type Account = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
  status?: string
  premium?: boolean
  premiumExpiresAt?: string
  blockedContactIds?: number[]
  createdAt: string
}

export type Session = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
  status?: string
  premium?: boolean
  premiumExpiresAt?: string
  blockedContactIds?: number[]
  sessionToken?: string
}
