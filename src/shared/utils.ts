import {
  channelAvatarTones,
  channelDirectLinkMaxLength,
  channelDescriptionMaxLength,
  channelTitleMaxLength,
  nicknameFieldMaxLength,
  statusFieldMaxLength,
} from './constants'
import type {
  Account,
  Channel,
  Chat,
  GroupPreview,
  Message,
  QuietModeSettings,
  Session,
  SupportTicketStatus,
  SubscriptionChannel,
} from './types'
import type { AdminSupportTicketStatus } from './backend'

export const defaultQuietModeSettings: QuietModeSettings = {
  autoInvisibility: true,
  channels: true,
  contactRequests: true,
  dialogs: true,
  groups: true,
  threads: true,
}

export const nonPremiumQuietModeSettings: QuietModeSettings = {
  autoInvisibility: false,
  channels: true,
  contactRequests: true,
  dialogs: true,
  groups: true,
  threads: true,
}

export const supportTicketStatusOptions: ReadonlyArray<{
  label: string
  value: SupportTicketStatus
}> = [
  { value: 'open', label: 'Открыт' },
  { value: 'reopened', label: 'Переоткрыт' },
  { value: 'needs_confirmation', label: 'Нужно подтверждение' },
  { value: 'resolved', label: 'Решён' },
]

export function formatSupportTicketStatus(status: SupportTicketStatus) {
  return supportTicketStatusOptions.find((option) => option.value === status)?.label ?? 'Открыт'
}

export function getSupportTicketStatusSortOrder(status: SupportTicketStatus) {
  const sortOrder = supportTicketStatusOptions.findIndex((option) => option.value === status)
  return sortOrder === -1 ? 0 : sortOrder
}

export const adminSupportTicketStatusOptions: ReadonlyArray<{
  label: string
  value: AdminSupportTicketStatus
}> = [
  { value: 'new', label: 'Новое' },
  { value: 'open', label: 'Открыт' },
  { value: 'reopened', label: 'Переоткрыт' },
  { value: 'needs_confirmation', label: 'Нужно подтверждение' },
  { value: 'resolved', label: 'Решён' },
]

export function formatAdminSupportTicketStatus(status: AdminSupportTicketStatus) {
  return adminSupportTicketStatusOptions.find((option) => option.value === status)?.label ?? 'Открыт'
}

export function getAdminSupportTicketStatusSortOrder(status: AdminSupportTicketStatus) {
  const sortOrder = adminSupportTicketStatusOptions.findIndex((option) => option.value === status)
  return sortOrder === -1 ? 1 : sortOrder
}

export function normalizeQuietModeSettings(
  settings?: Partial<QuietModeSettings> | null,
): QuietModeSettings {
  return {
    autoInvisibility: settings?.autoInvisibility ?? defaultQuietModeSettings.autoInvisibility,
    channels: settings?.channels ?? defaultQuietModeSettings.channels,
    contactRequests: settings?.contactRequests ?? defaultQuietModeSettings.contactRequests,
    dialogs: settings?.dialogs ?? defaultQuietModeSettings.dialogs,
    groups: settings?.groups ?? defaultQuietModeSettings.groups,
    threads: settings?.threads ?? defaultQuietModeSettings.threads,
  }
}

export function getEffectiveQuietModeSettings(
  settings: Partial<QuietModeSettings> | null | undefined,
  hasPremiumAccess: boolean,
): QuietModeSettings {
  return hasPremiumAccess
    ? normalizeQuietModeSettings(settings)
    : nonPremiumQuietModeSettings
}

export function resolveQuietModeInvisibilityState(options: {
  autoInvisibility: boolean
  currentInvisibilityAutoEnabled: boolean
  currentInvisibilityEnabled: boolean
  currentQuietModeEnabled: boolean
  nextQuietModeEnabled: boolean
}) {
  // Keep this helper shared between client and server:
  // `Тихо` may auto-enable invisibility, but only that auto-enabled invisibility is allowed to
  // auto-disable again when quiet-mode turns off.
  const {
    autoInvisibility,
    currentInvisibilityAutoEnabled,
    currentInvisibilityEnabled,
    currentQuietModeEnabled,
    nextQuietModeEnabled,
  } = options

  if (nextQuietModeEnabled === currentQuietModeEnabled) {
    return {
      invisibilityAutoEnabled: currentInvisibilityAutoEnabled,
      invisibilityEnabled: currentInvisibilityEnabled,
    }
  }

  if (nextQuietModeEnabled) {
    if (autoInvisibility && !currentInvisibilityEnabled) {
      return {
        invisibilityAutoEnabled: true,
        invisibilityEnabled: true,
      }
    }

    return {
      invisibilityAutoEnabled: false,
      invisibilityEnabled: currentInvisibilityEnabled,
    }
  }

  if (currentInvisibilityAutoEnabled) {
    return {
      invisibilityAutoEnabled: false,
      invisibilityEnabled: false,
    }
  }

  return {
    invisibilityAutoEnabled: false,
    invisibilityEnabled: currentInvisibilityEnabled,
  }
}

export function formatMessagePreview(
  message: Pick<
    Message,
    'attachment' | 'attachmentRemovedNotice' | 'sourceChannel' | 'sourceContact' | 'sourceGroup' | 'text'
  >,
) {
  const text = stripMessageFormattingMarkup(message.text).trim()
  if (text) return text
  if (message.sourceChannel?.leadText) return message.sourceChannel.leadText
  if (message.sourceGroup?.leadText) return message.sourceGroup.leadText
  if (message.attachment) return `Файл: ${message.attachment.fileName}`
  if (message.attachmentRemovedNotice) return message.attachmentRemovedNotice.text
  if (message.sourceChannel) return `Канал: ${message.sourceChannel.title}`
  if (message.sourceContact) return `Контакт: ${message.sourceContact.title}`
  if (message.sourceGroup) return `Пользователь приглашает вас в группу: ${message.sourceGroup.title}`
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

export function isVideoMimeType(mimeType: string) {
  return mimeType.startsWith('video/')
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

export function formatSupportTicketCreatedAt(createdAt?: string) {
  const timestamp = parseIsoDate(createdAt)
  const date = timestamp === null ? new Date() : new Date(timestamp)
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return formatter.format(date)
}

export function formatSidebarActivityLabel(createdAt?: string, fallback = '', now = new Date()) {
  const timestamp = parseIsoDate(createdAt)
  if (timestamp === null) {
    return fallback
  }

  const date = new Date(timestamp)
  const todayKey = formatLocalDateKey(now)
  const valueKey = formatLocalDateKey(date)

  if (valueKey === todayKey) {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(date)
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
  return formatSidebarActivityLabel(latest?.createdAt ?? group.latestActivityAt, latest?.time ?? group.time)
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
  return formatSidebarActivityLabel(latest?.createdAt ?? channel.latestActivityAt, latest?.time ?? channel.time)
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
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .slice(0, channelDescriptionMaxLength)
}

export type MessageTextSegment =
  | {
      kind: 'text'
      style: MessageTextStyle
      value: string
    }
  | {
      kind: 'external-link'
      href: string
      style: MessageTextStyle
      value: string
    }

export type MessageTextStyle = {
  bold: boolean
  italic: boolean
  strike: boolean
  underline: boolean
}

export type ComposerTextMarkup = 'bold' | 'italic' | 'strikethrough' | 'underline'
export type ComposerTextInputElement = HTMLTextAreaElement | HTMLDivElement

const defaultMessageTextStyle: MessageTextStyle = {
  bold: false,
  italic: false,
  strike: false,
  underline: false,
}

const externalLinkPattern = /https?:\/\/[^\s<>"']+/giu
const formattingTagPattern = /^<(\/)?([bius])>/iu
const formattingMarkupTags: Record<ComposerTextMarkup, { close: string, open: string }> = {
  bold: { open: '<b>', close: '</b>' },
  italic: { open: '<i>', close: '</i>' },
  strikethrough: { open: '<s>', close: '</s>' },
  underline: { open: '<u>', close: '</u>' },
}
const composerBlockTagNames = new Set(['DIV', 'LI', 'P'])

function escapeComposerHtml(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function wrapComposerHtmlWithStyle(value: string, style: MessageTextStyle) {
  let result = escapeComposerHtml(value)

  if (style.bold) {
    result = `<b>${result}</b>`
  }

  if (style.italic) {
    result = `<i>${result}</i>`
  }

  if (style.underline) {
    result = `<u>${result}</u>`
  }

  if (style.strike) {
    result = `<s>${result}</s>`
  }

  return result
}

function wrapComposerMarkupWithStyle(value: string, style: MessageTextStyle) {
  let result = value

  if (style.bold) {
    result = `<b>${result}</b>`
  }

  if (style.italic) {
    result = `<i>${result}</i>`
  }

  if (style.underline) {
    result = `<u>${result}</u>`
  }

  if (style.strike) {
    result = `<s>${result}</s>`
  }

  return result
}

function getComposerInputTagName(input: ComposerTextInputElement | null) {
  if (!input || typeof input !== 'object' || !('tagName' in input)) {
    return ''
  }

  const tagName = input.tagName
  return typeof tagName === 'string' ? tagName.toUpperCase() : ''
}

function isComposerTextareaInput(
  input: ComposerTextInputElement | null,
): input is HTMLTextAreaElement {
  return getComposerInputTagName(input) === 'TEXTAREA'
}

function isComposerEditableInput(
  input: ComposerTextInputElement | null,
): input is HTMLDivElement {
  return getComposerInputTagName(input) === 'DIV' && Boolean((input as HTMLDivElement)?.isContentEditable)
}

function placeComposerEditableCaretAtEnd(input: HTMLDivElement) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null

  const selection = window.getSelection()
  if (!selection) return null

  const range = document.createRange()
  range.selectNodeContents(input)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

function getComposerEditableSelectionRange(input: HTMLDivElement) {
  if (typeof window === 'undefined') return null

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return placeComposerEditableCaretAtEnd(input)
  }

  const range = selection.getRangeAt(0)
  if (!input.contains(range.commonAncestorContainer)) {
    return placeComposerEditableCaretAtEnd(input)
  }

  return range
}

function getComposerEditableSelectionOffsets(input: HTMLDivElement) {
  const range = getComposerEditableSelectionRange(input)
  if (!range || typeof document === 'undefined') {
    return null
  }

  const startRange = document.createRange()
  startRange.selectNodeContents(input)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = document.createRange()
  endRange.selectNodeContents(input)
  endRange.setEnd(range.endContainer, range.endOffset)

  return {
    end: endRange.toString().length,
    start: startRange.toString().length,
  }
}

function resolveComposerEditableSelectionPoint(
  root: Node,
  visibleOffset: number,
): { node: Node, offset: number } | null {
  const normalizedOffset = Math.max(0, visibleOffset)
  let traversed = 0
  const childNodes = Array.from(root.childNodes)

  for (let index = 0; index < childNodes.length; index += 1) {
    const child = childNodes[index]

    if (child.nodeType === Node.TEXT_NODE) {
      const textLength = (child.textContent ?? '').replace(/\u00a0/gu, ' ').replace(/\u200b/gu, '').length
      if (normalizedOffset <= traversed + textLength) {
        return {
          node: child,
          offset: Math.max(0, normalizedOffset - traversed),
        }
      }
      traversed += textLength
      continue
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as HTMLElement
      if (element.tagName.toUpperCase() === 'BR') {
        if (normalizedOffset <= traversed + 1) {
          return {
            node: root,
            offset: index + 1,
          }
        }
        traversed += 1
        continue
      }

      const childTextLength = element.innerText?.length ?? element.textContent?.length ?? 0
      if (normalizedOffset <= traversed + childTextLength) {
        return resolveComposerEditableSelectionPoint(child, normalizedOffset - traversed)
      }
      traversed += childTextLength
    }
  }

  if (root.nodeType === Node.TEXT_NODE) {
    const textLength = (root.textContent ?? '').length
    return {
      node: root,
      offset: Math.min(textLength, normalizedOffset),
    }
  }

  return {
    node: root,
    offset: childNodes.length,
  }
}

function restoreComposerEditableSelection(
  input: HTMLDivElement,
  startOffset: number,
  endOffset: number,
) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  const start = resolveComposerEditableSelectionPoint(input, startOffset)
  const end = resolveComposerEditableSelectionPoint(input, endOffset)
  if (!start || !end) {
    placeComposerEditableCaretAtEnd(input)
    return
  }

  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

function mapVisibleTextOffsetToMarkupOffset(markup: string, visibleOffset: number) {
  if (visibleOffset <= 0) return 0

  let currentMarkupOffset = 0
  let currentVisibleOffset = 0

  while (currentMarkupOffset < markup.length) {
    const tagMatch = markup.slice(currentMarkupOffset).match(formattingTagPattern)
    if (tagMatch) {
      currentMarkupOffset += tagMatch[0].length
      continue
    }

    if (currentVisibleOffset >= visibleOffset) {
      break
    }

    currentMarkupOffset += 1
    currentVisibleOffset += 1
  }

  return currentMarkupOffset
}

function isSameMessageTextStyle(left: MessageTextStyle, right: MessageTextStyle) {
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.strike === right.strike &&
    left.underline === right.underline
  )
}

function applyComposerMarkupToStyle(style: MessageTextStyle, markup: ComposerTextMarkup): MessageTextStyle {
  return {
    bold: style.bold || markup === 'bold',
    italic: style.italic || markup === 'italic',
    strike: style.strike || markup === 'strikethrough',
    underline: style.underline || markup === 'underline',
  }
}

function serializeComposerSegmentsToMarkup(
  segments: ReadonlyArray<{ style: MessageTextStyle, value: string }>,
) {
  const mergedSegments: Array<{ style: MessageTextStyle, value: string }> = []

  segments.forEach((segment) => {
    if (!segment.value) return

    const previous = mergedSegments.at(-1)
    if (previous && isSameMessageTextStyle(previous.style, segment.style)) {
      previous.value += segment.value
      return
    }

    mergedSegments.push({
      style: segment.style,
      value: segment.value,
    })
  })

  return mergedSegments
    .map((segment) => wrapComposerMarkupWithStyle(segment.value, segment.style))
    .join('')
}

export function wrapComposerVisibleSelectionWithMarkup(
  currentValue: string,
  selectionStart: number,
  selectionEnd: number,
  markup: ComposerTextMarkup,
) {
  const { close, open } = formattingMarkupTags[markup]
  const normalizedSelectionStart = Math.max(0, Math.min(selectionStart, selectionEnd))
  const normalizedSelectionEnd = Math.max(selectionStart, selectionEnd)
  if (normalizedSelectionStart === normalizedSelectionEnd) {
    const markupOffset = mapVisibleTextOffsetToMarkupOffset(currentValue, normalizedSelectionStart)
    return currentValue.slice(0, markupOffset) + open + close + currentValue.slice(markupOffset)
  }

  const nextSegments: Array<{ style: MessageTextStyle, value: string }> = []
  let visibleCursor = 0

  parseMessageTextSegments(currentValue).forEach((segment) => {
    const segmentStart = visibleCursor
    const segmentEnd = segmentStart + segment.value.length
    visibleCursor = segmentEnd

    if (!segment.value) return

    if (segmentEnd <= normalizedSelectionStart || segmentStart >= normalizedSelectionEnd) {
      nextSegments.push({
        style: segment.style,
        value: segment.value,
      })
      return
    }

    const beforeLength = Math.max(0, normalizedSelectionStart - segmentStart)
    const selectedLength = Math.min(segmentEnd, normalizedSelectionEnd) - Math.max(segmentStart, normalizedSelectionStart)
    const afterStart = beforeLength + selectedLength

    if (beforeLength > 0) {
      nextSegments.push({
        style: segment.style,
        value: segment.value.slice(0, beforeLength),
      })
    }

    if (selectedLength > 0) {
      nextSegments.push({
        style: applyComposerMarkupToStyle(segment.style, markup),
        value: segment.value.slice(beforeLength, afterStart),
      })
    }

    if (afterStart < segment.value.length) {
      nextSegments.push({
        style: segment.style,
        value: segment.value.slice(afterStart),
      })
    }
  })

  return serializeComposerSegmentsToMarkup(nextSegments)
}

function serializeComposerEditableNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u00a0/gu, ' ').replace(/\u200b/gu, '')
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement
  const tagName = element.tagName.toUpperCase()
  const children = serializeComposerEditableChildren(element)
  const textDecoration = `${element.style.textDecoration ?? ''} ${element.style.textDecorationLine ?? ''}`
  const normalizedFontWeight = element.style.fontWeight.trim().toLowerCase()
  const style: MessageTextStyle = {
    bold:
      tagName === 'B' ||
      tagName === 'STRONG' ||
      normalizedFontWeight === 'bold' ||
      normalizedFontWeight === 'bolder' ||
      Number(normalizedFontWeight) >= 600,
    italic: tagName === 'I' || tagName === 'EM' || element.style.fontStyle.trim().toLowerCase() === 'italic',
    strike:
      tagName === 'S' ||
      tagName === 'STRIKE' ||
      tagName === 'DEL' ||
      /line-through/iu.test(textDecoration),
    underline: tagName === 'U' || /underline/iu.test(textDecoration),
  }

  switch (tagName) {
    case 'BR':
      return '\n'
    default:
      return children ? wrapComposerMarkupWithStyle(children, style) : ''
  }
}

function serializeComposerEditableChildren(parent: Node) {
  const children = Array.from(parent.childNodes)
  let result = ''

  children.forEach((child, index) => {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      composerBlockTagNames.has((child as HTMLElement).tagName.toUpperCase())
    ) {
      const blockContent = serializeComposerEditableNode(child)
      result += blockContent
      if (index < children.length - 1) {
        result += '\n'
      }
      return
    }

    result += serializeComposerEditableNode(child)
  })

  return result
}

export function renderComposerMarkupToHtml(text: string) {
  if (!text) return ''

  return text
    .split('\n')
    .map((line) =>
      parseMessageTextSegments(line)
        .map((segment) => wrapComposerHtmlWithStyle(segment.value, segment.style))
        .join(''),
    )
    .join('<br>')
}

export function extractComposerMarkupFromEditable(input: HTMLDivElement | null) {
  if (!input) return ''

  return serializeComposerEditableChildren(input)
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\n+|\n+$/gu, '')
}

function splitTrailingExternalLinkPunctuation(rawUrl: string) {
  const match = rawUrl.match(/([),.!?:;]+)$/u)
  if (!match) {
    return { punctuation: '', url: rawUrl }
  }

  const punctuation = match[1]
  const trimmedUrl = rawUrl.slice(0, -punctuation.length)
  if (!trimmedUrl) {
    return { punctuation: '', url: rawUrl }
  }

  return {
    punctuation,
    url: trimmedUrl,
  }
}

export function parseMessageTextSegments(text: string): MessageTextSegment[] {
  if (!text) {
    return [{ kind: 'text', style: defaultMessageTextStyle, value: '' }]
  }

  const segments: MessageTextSegment[] = []
  const formattingDepth: Record<'b' | 'i' | 's' | 'u', number> = {
    b: 0,
    i: 0,
    s: 0,
    u: 0,
  }
  let cursor = 0
  let buffer = ''

  function getCurrentStyle(): MessageTextStyle {
    return {
      bold: formattingDepth.b > 0,
      italic: formattingDepth.i > 0,
      strike: formattingDepth.s > 0,
      underline: formattingDepth.u > 0,
    }
  }

  function pushBufferedText(value: string, style: MessageTextStyle) {
    if (!value) return

    let textCursor = 0
    for (const match of value.matchAll(externalLinkPattern)) {
      const rawUrl = match[0]
      const matchIndex = match.index ?? -1
      if (matchIndex < 0) continue

      if (matchIndex > textCursor) {
        segments.push({
          kind: 'text',
          style,
          value: value.slice(textCursor, matchIndex),
        })
      }

      const { punctuation, url } = splitTrailingExternalLinkPunctuation(rawUrl)
      segments.push({
        href: url,
        kind: 'external-link',
        style,
        value: url,
      })

      if (punctuation) {
        segments.push({
          kind: 'text',
          style,
          value: punctuation,
        })
      }

      textCursor = matchIndex + rawUrl.length
    }

    if (textCursor < value.length) {
      segments.push({
        kind: 'text',
        style,
        value: value.slice(textCursor),
      })
    }
  }

  function flushBuffer() {
    if (!buffer) return
    pushBufferedText(buffer, getCurrentStyle())
    buffer = ''
  }

  while (cursor < text.length) {
    const tagMatch = text.slice(cursor).match(formattingTagPattern)
    if (!tagMatch) {
      buffer += text[cursor]
      cursor += 1
      continue
    }

    const rawTag = tagMatch[0]
    const isClosing = tagMatch[1] === '/'
    const tagName = (tagMatch[2] ?? '').toLowerCase() as 'b' | 'i' | 's' | 'u'

    if (isClosing && formattingDepth[tagName] === 0) {
      buffer += rawTag
      cursor += rawTag.length
      continue
    }

    flushBuffer()
    formattingDepth[tagName] = Math.max(0, formattingDepth[tagName] + (isClosing ? -1 : 1))
    cursor += rawTag.length
  }

  flushBuffer()

  return segments.length > 0 ? segments : [{ kind: 'text', style: defaultMessageTextStyle, value: text }]
}

export function stripMessageFormattingMarkup(text: string) {
  return text.replace(/<\/?[bius]>/giu, '')
}

const standaloneEmojiSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

const regionalIndicatorPairPattern = /^[\p{Regional_Indicator}]{2}$/u
const keycapEmojiPattern = /^[0-9#*]\uFE0F?\u20E3$/u
const standaloneEmojiPattern = /\p{Extended_Pictographic}/u

export function isStandaloneEmojiMessageText(text: string) {
  const normalizedText = stripMessageFormattingMarkup(text).trim()
  if (!normalizedText) {
    return false
  }

  const graphemeClusters = standaloneEmojiSegmenter
    ? Array.from(standaloneEmojiSegmenter.segment(normalizedText), (segment) => segment.segment)
    : Array.from(normalizedText)

  if (graphemeClusters.length !== 1) {
    return false
  }

  const [grapheme] = graphemeClusters

  return (
    standaloneEmojiPattern.test(grapheme) ||
    regionalIndicatorPairPattern.test(grapheme) ||
    keycapEmojiPattern.test(grapheme)
  )
}

export function wrapComposerSelectionWithMarkup(
  input: ComposerTextInputElement | null,
  currentValue: string,
  markup: ComposerTextMarkup,
  onChange: (value: string) => void,
) {
  const { close, open } = formattingMarkupTags[markup]

  if (!input) {
    onChange(`${currentValue}${open}${close}`)
    return
  }

  if (isComposerTextareaInput(input)) {
    const selectionStart = input.selectionStart ?? currentValue.length
    const selectionEnd = input.selectionEnd ?? currentValue.length
    const selectedText = currentValue.slice(selectionStart, selectionEnd)
    const nextValue =
      currentValue.slice(0, selectionStart) +
      open +
      selectedText +
      close +
      currentValue.slice(selectionEnd)

    onChange(nextValue)

    const nextSelectionStart = selectionStart + open.length
    const nextSelectionEnd = nextSelectionStart + selectedText.length
    window.requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(nextSelectionStart, nextSelectionEnd)
    })
    return
  }

  if (!isComposerEditableInput(input) || typeof document === 'undefined') {
    onChange(`${currentValue}${open}${close}`)
    return
  }

  input.focus()
  const selectionOffsets = getComposerEditableSelectionOffsets(input)
  if (!selectionOffsets) {
    onChange(`${currentValue}${open}${close}`)
    return
  }

  const nextValue = wrapComposerVisibleSelectionWithMarkup(
    currentValue,
    selectionOffsets.start,
    selectionOffsets.end,
    markup,
  )
  onChange(nextValue)

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      input.focus()
      restoreComposerEditableSelection(input, selectionOffsets.start, selectionOffsets.end)
    })
  }
}

export function insertComposerTextAtCursor(
  input: ComposerTextInputElement | null,
  currentValue: string,
  insertedText: string,
  onChange: (value: string) => void,
) {
  if (!input) {
    onChange(`${currentValue}${insertedText}`)
    return
  }

  if (isComposerTextareaInput(input)) {
    const selectionStart = input.selectionStart ?? currentValue.length
    const selectionEnd = input.selectionEnd ?? currentValue.length
    const nextValue =
      currentValue.slice(0, selectionStart) +
      insertedText +
      currentValue.slice(selectionEnd)

    onChange(nextValue)

    const nextCursorPosition = selectionStart + insertedText.length
    window.requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(nextCursorPosition, nextCursorPosition)
    })
    return
  }

  if (!isComposerEditableInput(input) || typeof document === 'undefined' || typeof window === 'undefined') {
    onChange(`${currentValue}${insertedText}`)
    return
  }

  input.focus()
  const range = getComposerEditableSelectionRange(input)
  if (!range) {
    onChange(`${currentValue}${insertedText}`)
    return
  }

  range.deleteContents()
  const textNode = document.createTextNode(insertedText)
  range.insertNode(textNode)
  range.setStartAfter(textNode)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  onChange(extractComposerMarkupFromEditable(input))
}

export function makePremiumExpiry(days: number) {
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + days)
  return expiryDate.toISOString()
}

export function extendPremiumExpiry(
  days: number,
  premiumExpiresAt?: string,
  now = Date.now(),
) {
  const nextDays = Number.isInteger(days) && days > 0 ? days : 30
  const currentExpiry = premiumExpiresAt ? Date.parse(premiumExpiresAt) : Number.NaN
  const baseTimestamp =
    Number.isNaN(currentExpiry) || currentExpiry <= now
      ? now
      : currentExpiry
  const expiryDate = new Date(baseTimestamp)
  expiryDate.setDate(expiryDate.getDate() + nextDays)
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
  return {
    id: channelId,
    title: '',
    directLink: '',
    statusText: '',
    description: '',
    avatarTone: channelAvatarTones[(channelNumber - 1) % channelAvatarTones.length],
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
