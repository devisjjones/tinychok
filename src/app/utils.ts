export {
  buildChannelDirectLinkFromTitle,
  ensureUniqueChannelDirectLink,
  formatAccountName,
  formatAttachmentImageDimensions,
  formatAttachmentSize,
  formatChannelAvatarLabel,
  formatConversationDayLabel,
  formatContactStatus,
  formatGroupLatestAuthor,
  formatGroupPreview,
  formatGroupTime,
  formatMessageAuthor,
  formatMessagePreview,
  formatNowTime,
  formatPreview,
  formatRoomPresence,
  formatSessionName,
  formatSubscriptionChannelPreview,
  formatSubscriptionChannelReaders,
  formatSubscriptionChannelSubscribers,
  formatSubscriptionChannelTime,
  formatUnreadBadgeCount,
  getChannelVisibilityDescription,
  getChannelVisibilityLabel,
  getConversationDayKey,
  getNextChannelVisibility,
  getPremiumDaysLeft,
  hasActivePremium,
  isImageMimeType,
  isPhoneQuery,
  makeDraftChannel,
  makePremiumExpiry,
  matchesQuery,
  moveUnreadItemsFirst,
  normalizeIdentifier,
  normalizeNickname,
  normalizePremiumExpiry,
  sanitizeChannelDescription,
  sanitizeChannelDirectLink,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
  shouldShowDeliveryCaption,
  shouldSubmitComposerWithEnter,
  sortChatsByRecentActivity,
  sortGroupsByRecentActivity,
  sortSubscriptionChannelsByRecentActivity,
} from '../shared/utils'

export function scrollFeedChildIntoView(
  feed: HTMLDivElement | null,
  selector: string,
) {
  if (!feed) return false

  const target = feed.querySelector<HTMLElement>(selector)
  if (!target) return false

  const feedRect = feed.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const nextTop =
    feed.scrollTop +
    (targetRect.top - feedRect.top) -
    feed.clientHeight / 2 +
    targetRect.height / 2

  feed.scrollTo({
    behavior: 'smooth',
    top: Math.max(0, nextTop),
  })

  return true
}

export function insertComposerTextAtCursor(
  input: HTMLTextAreaElement | null,
  currentValue: string,
  insertedText: string,
  onChange: (value: string) => void,
) {
  if (!input) {
    onChange(`${currentValue}${insertedText}`)
    return
  }

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
}
