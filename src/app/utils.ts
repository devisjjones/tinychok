export {
  buildChannelDirectLinkFromTitle,
  type ComposerTextMarkup,
  type ComposerTextInputElement,
  ensureUniqueChannelDirectLink,
  formatAccountName,
  formatAttachmentImageDimensions,
  formatAttachmentSize,
  formatChannelAvatarLabel,
  formatConversationDayLabel,
  formatContactStatus,
  formatSidebarActivityLabel,
  formatSupportTicketCreatedAt,
  extendPremiumExpiry,
  formatGroupLatestAuthor,
  formatGroupPreview,
  formatGroupTime,
  formatMessageAuthor,
  formatMessagePreview,
  formatNowTime,
  formatPreview,
  formatRoomPresence,
  formatSessionName,
  formatSupportTicketStatus,
  formatSubscriptionChannelPreview,
  formatSubscriptionChannelReaders,
  formatSubscriptionChannelSubscribers,
  formatSubscriptionChannelTime,
  formatUnreadBadgeCount,
  getEffectiveQuietModeSettings,
  getChannelVisibilityDescription,
  getChannelVisibilityLabel,
  getConversationDayKey,
  getNextChannelVisibility,
  getPremiumDaysLeft,
  getSupportTicketStatusSortOrder,
  hasActivePremium,
  insertComposerTextAtCursor,
  isImageMimeType,
  isVideoMimeType,
  isPhoneQuery,
  makeDraftChannel,
  makePremiumExpiry,
  matchesQuery,
  moveUnreadItemsFirst,
  normalizeIdentifier,
  normalizeNickname,
  normalizeQuietModeSettings,
  normalizePremiumExpiry,
  parseMessageTextSegments,
  nonPremiumQuietModeSettings,
  renderComposerMarkupToHtml,
  resolveQuietModeInvisibilityState,
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
  stripMessageFormattingMarkup,
  supportTicketStatusOptions,
  extractComposerMarkupFromEditable,
  wrapComposerVisibleSelectionWithMarkup,
  wrapComposerSelectionWithMarkup,
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
