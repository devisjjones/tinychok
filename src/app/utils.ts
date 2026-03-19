import {
  channelAvatarTones,
  channelDescriptionMaxLength,
  channelTitleMaxLength,
  nicknameFieldMaxLength,
  statusFieldMaxLength,
} from './constants'
import type { Account, Channel, Chat, GroupPreview, Message, Session } from './types'

export function formatPreview(chat: Chat) {
  const latest = chat.messages.at(-1)
  return latest ? latest.text : 'Пока пусто'
}

export function formatGroupPreview(group: GroupPreview) {
  const latest = group.messages.at(-1)
  return latest ? latest.text : group.preview
}

export function formatGroupTime(group: GroupPreview) {
  const latest = group.messages.at(-1)
  return latest ? latest.time : group.time
}

export function formatMessageAuthor(author: Message['author'], chatTitle: string) {
  return author === 'me' ? 'Вы' : chatTitle
}

export function formatContactStatus(chat: Chat) {
  return chat.status.trim() || '\u00A0'
}

export function formatRoomPresence(chat: Chat) {
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
    .replace(/[^\p{L}\p{M}\s\p{P}]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+/g, '')

  const nextValue = /\s$/.test(normalizedWhitespace)
    ? normalizedWhitespace
    : normalizedWhitespace.trim()

  return nextValue.slice(0, maxLength)
}

export function normalizeNickname(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, '').slice(0, nicknameFieldMaxLength)
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

export function sanitizeChannelDescription(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, channelDescriptionMaxLength)
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
      directLink: 'https://tinychok.app/c/night-archive',
      description:
        'Черновик тихого канала для личных заметок, редких анонсов и сохранённых сообщений.',
      avatarTone: '#8c5738',
    },
    {
      title: 'Тихие релизы',
      directLink: 'https://tinychok.app/c/quiet-releases',
      description: 'Канал для аккуратных обновлений продукта без шума, спама и лишних пингов.',
      avatarTone: '#6eb6ff',
    },
    {
      title: 'Клуб сигналов',
      directLink: 'https://tinychok.app/c/signal-club',
      description:
        'Подборка коротких сигналов, которые удобно публиковать для своей закрытой аудитории.',
      avatarTone: '#82c9a3',
    },
  ] as const

  const template = templates[channelNumber - 1]

  return {
    id: channelId,
    title: template?.title ?? `Новый канал ${channelNumber}`,
    directLink: template?.directLink ?? `https://tinychok.app/c/draft-${channelId}`,
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
