export {
  buildChannelDirectLinkFromTitle,
  ensureUniqueChannelDirectLink,
  formatAccountName,
  formatAttachmentSize,
  formatChannelAvatarLabel,
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
  formatSubscriptionChannelTime,
  formatUnreadBadgeCount,
  getChannelVisibilityDescription,
  getChannelVisibilityLabel,
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
