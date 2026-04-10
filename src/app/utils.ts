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
  isStandaloneEmojiMessageText,
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
  shouldAutoFocusTextInputOnSceneOpen,
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

function resolveComposerTextareaMaxHeight(
  textarea: HTMLTextAreaElement,
  minHeight: number,
) {
  if (typeof window === 'undefined') return minHeight

  const computedStyle = window.getComputedStyle(textarea)
  const cssMaxHeight = Number.parseFloat(computedStyle.maxHeight)
  if (Number.isFinite(cssMaxHeight)) {
    return Math.max(minHeight, cssMaxHeight)
  }

  const nearestScene = textarea.closest<HTMLElement>(
    '.settings-stack-support, .room-thread, .room, .stage, .settings-stack',
  )
  if (nearestScene?.clientHeight) {
    return Math.max(minHeight, nearestScene.clientHeight * 0.5)
  }

  return Math.max(minHeight, window.innerHeight * 0.5)
}

export function resizeComposerTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea || typeof window === 'undefined') {
    return {
      expanded: false,
      height: 0,
      maxHeight: 0,
      minHeight: 0,
      overflowY: 'hidden' as const,
    }
  }

  const computedStyle = window.getComputedStyle(textarea)
  const minHeight = Number.parseFloat(computedStyle.minHeight) || textarea.clientHeight || 48
  const maxHeight = resolveComposerTextareaMaxHeight(textarea, minHeight)

  textarea.style.height = '0px'
  const contentHeight = Math.max(minHeight, textarea.scrollHeight)
  const nextHeight = Math.max(minHeight, Math.min(contentHeight, maxHeight))
  const overflowY = contentHeight > maxHeight + 1 ? 'auto' : 'hidden'

  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = overflowY

  return {
    expanded: nextHeight > minHeight + 1,
    height: nextHeight,
    maxHeight,
    minHeight,
    overflowY,
  }
}
