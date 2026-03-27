import {
  channelAvatarTones,
  channelDirectLinkMaxLength,
  channelDescriptionMaxLength,
  channelTitleMaxLength,
  nicknameFieldMaxLength,
  statusFieldMaxLength,
} from './constants'
import type { Account, Channel, Chat, GroupPreview, Message, Session, SubscriptionChannel } from './types'

export function formatMessagePreview(
  message: Pick<Message, 'attachment' | 'sourceChannel' | 'sourceGroup' | 'text'>,
) {
  const text = message.text.trim()
  if (text) return text
  if (message.sourceChannel?.leadText) return message.sourceChannel.leadText
  if (message.attachment) return `Файл: ${message.attachment.fileName}`
  if (message.sourceChannel) return `Канал: ${message.sourceChannel.title}`
  if (message.sourceGroup) return `Приглашение в группу: ${message.sourceGroup.title}`
  return 'Пока пусто'
}

export function shouldShowDeliveryCaption(message: Pick<Message, 'text' | 'attachment'>) {
  return formatMessagePreview(message).length >= 18
}

function isMobileKeyboardEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )

  return mobileUserAgent || (coarsePointer && navigator.maxTouchPoints > 0)
}

export function shouldSubmitComposerWithEnter(options: {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}) {
  if (options.key !== 'Enter') return false
  if (options.altKey || options.ctrlKey || options.metaKey || options.shiftKey) return false
  if (options.isComposing) return false

  return !isMobileKeyboardEnvironment()
}

export function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

export function formatAttachmentImageDimensions(width?: number, height?: number) {
  if (!width || !height) return 'фото'
  return `${width}×${height}`
}

export function formatUnreadBadgeCount(count: number) {
  if (count > 99) return '99+'
  return String(Math.max(0, count))
}

export function isImageMimeType(mimeType: string) {
  return mimeType.startsWith('image/')
}

export function formatPreview(chat: Chat) {
  const latest = chat.messages.at(-1)
  return latest ? formatMessagePreview(latest) : 'Пока пусто'
}

function parseIsoDate(value?: string) {
  if (!value) return null

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getConversationDayKey(createdAt?: string) {
  const timestamp = parseIsoDate(createdAt)
  return formatLocalDateKey(timestamp === null ? new Date() : new Date(timestamp))
}

export function formatConversationDayLabel(createdAt?: string) {
  const timestamp = parseIsoDate(createdAt)
  const date = timestamp === null ? new Date() : new Date(timestamp)
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return formatter.format(date)
}

function getChatLastActivityTimestamp(chat: Chat) {
  return parseIsoDate(chat.messages.at(-1)?.createdAt)
}

export function sortChatsByRecentActivity(chats: Chat[]) {
  return chats
    .map((chat, index) => ({
      chat,
      index,
      lastActivityTimestamp: getChatLastActivityTimestamp(chat),
    }))
    .sort((left, right) => {
      if (left.lastActivityTimestamp === null && right.lastActivityTimestamp === null) {
        return left.index - right.index
      }

      if (left.lastActivityTimestamp === null) {
        return 1
      }

      if (right.lastActivityTimestamp === null) {
        return -1
      }

      if (left.lastActivityTimestamp === right.lastActivityTimestamp) {
        return left.index - right.index
      }

      return right.lastActivityTimestamp - left.lastActivityTimestamp
    })
    .map(({ chat }) => chat)
}

function getGroupLastActivityTimestamp(group: GroupPreview) {
  return parseIsoDate(group.messages.at(-1)?.createdAt ?? group.latestActivityAt)
}

export function sortGroupsByRecentActivity(groups: GroupPreview[]) {
  return groups
    .map((group, index) => ({
      group,
      index,
      lastActivityTimestamp: getGroupLastActivityTimestamp(group),
    }))
    .sort((left, right) => {
      if (left.lastActivityTimestamp === null && right.lastActivityTimestamp === null) {
        return left.index - right.index
      }

      if (left.lastActivityTimestamp === null) {
        return 1
      }

      if (right.lastActivityTimestamp === null) {
        return -1
      }

      if (left.lastActivityTimestamp === right.lastActivityTimestamp) {
        return left.index - right.index
      }

      return right.lastActivityTimestamp - left.lastActivityTimestamp
    })
    .map(({ group }) => group)
}

export function formatGroupPreview(group: GroupPreview) {
  const latest = group.messages.at(-1)
  return latest ? formatMessagePreview(latest) : group.preview
}

export function formatGroupLatestAuthor(group: GroupPreview) {
  const latest = group.messages.at(-1)
  if (!latest) return ''
  return latest.author === 'me' ? 'Вы' : latest.displayAuthor ?? 'Участник'
}

export function formatGroupTime(group: GroupPreview) {
  const latest = group.messages.at(-1)
  return latest ? latest.time : group.time
}

export function formatSubscriptionChannelPreview(channel: SubscriptionChannel) {
  const latest = channel.posts.at(-1)
  return latest ? formatMessagePreview(latest) : channel.preview
}

export function formatSubscriptionChannelReaders(channel: SubscriptionChannel) {
  return `${channel.readers} читателей`
}

export function formatSubscriptionChannelSubscribers(count: number) {
  const normalizedCount = Math.max(0, Math.trunc(count))
  const remainderTen = normalizedCount % 10
  const remainderHundred = normalizedCount % 100

  if (remainderHundred >= 11 && remainderHundred <= 14) {
    return `${normalizedCount} подписчиков`
  }

  if (remainderTen === 1) {
    return `${normalizedCount} подписчик`
  }

  if (remainderTen >= 2 && remainderTen <= 4) {
    return `${normalizedCount} подписчика`
  }

  return `${normalizedCount} подписчиков`
}

export function formatSubscriptionChannelTime(channel: SubscriptionChannel) {
  const latest = channel.posts.at(-1)
  return latest ? latest.time : channel.time
}

function getSubscriptionChannelLastActivityTimestamp(channel: SubscriptionChannel) {
  return parseIsoDate(channel.posts.at(-1)?.createdAt ?? channel.latestActivityAt)
}

export function sortSubscriptionChannelsByRecentActivity(channels: SubscriptionChannel[]) {
  return channels
    .map((channel, index) => ({
      channel,
      index,
      lastActivityTimestamp: getSubscriptionChannelLastActivityTimestamp(channel),
    }))
    .sort((left, right) => {
      if (left.lastActivityTimestamp === null && right.lastActivityTimestamp === null) {
        return left.index - right.index
      }

      if (left.lastActivityTimestamp === null) {
        return 1
      }

      if (right.lastActivityTimestamp === null) {
        return -1
      }

      if (left.lastActivityTimestamp === right.lastActivityTimestamp) {
        return left.index - right.index
      }

      return right.lastActivityTimestamp - left.lastActivityTimestamp
    })
    .map(({ channel }) => channel)
}

export function formatMessageAuthor(author: Message['author'], chatTitle: string) {
  return author === 'me' ? 'Вы' : chatTitle
}

export function formatContactStatus(chat: Chat) {
  if (chat.archivedAccount) {
    return 'Удалённый аккаунт'
  }

  return chat.status.trim() || '\u00A0'
}

export function formatRoomPresence(chat: Chat) {
  if (chat.archivedAccount) {
    return 'Удалённый аккаунт'
  }

  const parts = []
  const status = chat.status.trim()

  if (status) {
    parts.push(status)
  } else if (chat.online) {
    parts.push('в сети')
  }

  if (!chat.online && chat.lastSeen?.trim()) {
    parts.push(chat.lastSeen.trim())
  }

  return parts.join(' · ')
}

export function normalizeIdentifier(value: string) {
  const trimmed = value.trim()
  const digits = trimmed.replace(/[^\d]/g, '')

  if (digits === '') return ''

  return `+${digits}`
}

export function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase())
}

export function formatSessionName(session: Session) {
  return [session.displayName, session.surname ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

export function formatAccountName(account: Pick<Account, 'displayName' | 'surname'>) {
  return [account.displayName, account.surname ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

export function sanitizePersonField(value: string, maxLength: number) {
  const normalizedWhitespace = value
    .replace(/[^\p{L}\p{M}\p{N}\s\p{P}]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+/g, '')

  const nextValue = /\s$/.test(normalizedWhitespace)
    ? normalizedWhitespace
    : normalizedWhitespace.trim()

  return nextValue.slice(0, maxLength)
}

export function normalizeNickname(value: string) {
  return value.replace(/[^A-Za-zА-Яа-яЁё0-9_]/g, '').slice(0, nicknameFieldMaxLength)
}

export function sanitizeStatusField(value: string) {
  return value
    .replace(/[^A-Za-zА-Яа-яЁё0-9 .,!?():;-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, statusFieldMaxLength)
}

export function sanitizeChannelTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, channelTitleMaxLength)
}

function normalizeChannelDirectLinkCore(
  value: string,
  options?: {
    replaceWhitespaceWithUnderscore?: boolean
  },
) {
  const normalizedValue = value
    .trim()
    .replace(/^https?:\/\/[^/]+\/c\//iu, '')
    .replace(/^@+/u, '')
    .replace(/[/?#].*$/u, '')

  const whitespaceNormalized = options?.replaceWhitespaceWithUnderscore
    ? normalizedValue.replace(/\s+/gu, '_')
    : normalizedValue.replace(/\s+/gu, '')

  return Array.from(whitespaceNormalized.toLowerCase())
    .filter((character) => /[\p{Script=Latin}\p{Script=Cyrillic}0-9_-]/u.test(character))
    .slice(0, channelDirectLinkMaxLength)
    .join('')
}

export function sanitizeChannelDirectLink(value: string) {
  const handle = normalizeChannelDirectLinkCore(value)

  return handle ? `@${handle}` : ''
}

export function buildChannelDirectLinkFromTitle(value: string) {
  const handle = normalizeChannelDirectLinkCore(value, {
    replaceWhitespaceWithUnderscore: true,
  })

  return `@${handle || 'kanal'}`
}

export function ensureUniqueChannelDirectLink(
  candidate: string,
  existingLinks: string[],
  fallbackSource = 'kanal',
) {
  const normalizedExistingHandles = new Set(
    existingLinks
      .map((link) => sanitizeChannelDirectLink(link))
      .filter(Boolean)
      .map((link) => link.slice(1)),
  )

  const fallbackHandle = buildChannelDirectLinkFromTitle(fallbackSource).slice(1)
  const baseHandle =
    sanitizeChannelDirectLink(candidate).slice(1) ||
    fallbackHandle ||
    'kanal'

  if (!normalizedExistingHandles.has(baseHandle)) {
    return `@${baseHandle}`
  }

  for (let suffix = 1; ; suffix += 1) {
    const suffixValue = String(suffix)
    const basePart = baseHandle.slice(0, Math.max(1, channelDirectLinkMaxLength - suffixValue.length))
    const nextHandle = `${basePart}${suffixValue}`

    if (!normalizedExistingHandles.has(nextHandle)) {
      return `@${nextHandle}`
    }
  }
}

export function sanitizeChannelDescription(value: string) {
  return sanitizeStatusField(value).slice(0, Math.min(statusFieldMaxLength, channelDescriptionMaxLength))
}

export function makePremiumExpiry(days: number) {
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + days)
  return expiryDate.toISOString()
}

export function normalizePremiumExpiry(premium: boolean | undefined, premiumExpiresAt?: string) {
  if (!premium) return ''
  return premiumExpiresAt || makePremiumExpiry(30)
}

export function getPremiumDaysLeft(premium: boolean | undefined, premiumExpiresAt?: string) {
  if (!premium || !premiumExpiresAt) return null

  const expiresAt = new Date(premiumExpiresAt).getTime()
  if (Number.isNaN(expiresAt)) return null

  const millisecondsLeft = expiresAt - Date.now()
  if (millisecondsLeft <= 0) return 0

  return Math.ceil(millisecondsLeft / (1000 * 60 * 60 * 24))
}

export function hasActivePremium(premium: boolean | undefined, premiumExpiresAt?: string) {
  const daysLeft = getPremiumDaysLeft(premium, premiumExpiresAt)
  return daysLeft !== null && daysLeft > 0
}

export function isPhoneQuery(value: string) {
  return value.replace(/[^\d]/g, '').length >= 3
}

export function formatNowTime() {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatChannelAvatarLabel(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function makeDraftChannel(channelNumber: number, channelId: number): Channel {
  const templates = [
    {
      title: 'Ночной архив',
      directLink: '@night_archive',
      description:
        'Черновик тихого канала для личных заметок, редких анонсов и сохранённых сообщений.',
      avatarTone: '#8c5738',
    },
    {
      title: 'Тихие релизы',
      directLink: '@quiet_releases',
      description: 'Канал для аккуратных обновлений продукта без шума, спама и лишних пингов.',
      avatarTone: '#6eb6ff',
    },
    {
      title: 'Клуб сигналов',
      directLink: '@signal_club',
      description:
        'Подборка коротких сигналов, которые удобно публиковать для своей закрытой аудитории.',
      avatarTone: '#82c9a3',
    },
  ] as const

  const template = templates[channelNumber - 1]

  return {
    id: channelId,
    title: template?.title ?? `Новый канал ${channelNumber}`,
    directLink: template?.directLink ?? '@kanal',
    description:
      template?.description ??
      'Описание канала пока не заполнено. Здесь можно подготовить текст до публикации.',
    avatarTone:
      template?.avatarTone ?? channelAvatarTones[(channelNumber - 1) % channelAvatarTones.length],
    status: 'draft',
    visibility: 'private',
  }
}

export function getChannelVisibilityLabel(visibility: Channel['visibility']) {
  if (visibility === 'public') return 'Публичный'
  if (visibility === 'closed') return 'Закрытый'
  return 'Приватный'
}

export function getChannelVisibilityDescription(visibility: Channel['visibility']) {
  if (visibility === 'public') {
    return 'Канал можно показывать и распространять публично.'
  }

  if (visibility === 'closed') {
    return 'В канал можно попасть только по прямому приглашению от создателя.'
  }

  return 'Канал доступен только по прямой ссылке.'
}

export function getNextChannelVisibility(visibility: Channel['visibility']) {
  if (visibility === 'private') return 'public'
  if (visibility === 'public') return 'closed'
  return 'private'
}

export function moveUnreadItemsFirst<T extends { id: number; unread: number }>(
  items: T[],
  retainedItemId?: number | null,
) {
  const unreadItems = items.filter((item) => item.unread > 0 || item.id === retainedItemId)
  const readItems = items.filter((item) => item.unread <= 0 && item.id !== retainedItemId)

  return [...unreadItems, ...readItems]
}
