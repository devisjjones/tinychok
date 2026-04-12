import { isRoomFeedNearBottom } from './roomFeedScroll'

export type RoomFeedScrollReason =
  | 'local-send'
  | 'media-relayout'
  | 'remote-append'
  | 'room-open'

export type PendingRoomFeedScroll = {
  attemptsRemaining: number
  reason: RoomFeedScrollReason
  roomKey: string
}

export function shouldPreserveStickyRoomFeedScroll(options: {
  activeRoomFeedKey: string | null
  pendingScroll: PendingRoomFeedScroll | null
}) {
  const { activeRoomFeedKey, pendingScroll } = options
  if (!activeRoomFeedKey || !pendingScroll || pendingScroll.roomKey !== activeRoomFeedKey) {
    return false
  }

  return pendingScroll.reason === 'local-send' || pendingScroll.reason === 'room-open'
}

export function createPendingRoomFeedScroll(
  roomKey: string,
  reason: RoomFeedScrollReason,
  attempts = 12,
): PendingRoomFeedScroll {
  return {
    attemptsRemaining: attempts,
    reason,
    roomKey,
  }
}

export function advancePendingRoomFeedScroll(options: {
  feed: HTMLElement
  pendingScroll: PendingRoomFeedScroll
  stickyToBottom: boolean
}) {
  const { feed, pendingScroll, stickyToBottom } = options

  if (!stickyToBottom) {
    return null
  }

  feed.scrollTo({
    behavior: 'auto',
    top: feed.scrollHeight,
  })

  if (isRoomFeedNearBottom(feed)) {
    return null
  }

  if (pendingScroll.attemptsRemaining <= 1) {
    return null
  }

  return {
    ...pendingScroll,
    attemptsRemaining: pendingScroll.attemptsRemaining - 1,
  } satisfies PendingRoomFeedScroll
}

export function keepRoomFeedChildVisible(options: {
  feed: HTMLElement
  paddingBottom?: number
  paddingTop?: number
  target: HTMLElement
}) {
  const { feed, target, paddingBottom = 16, paddingTop = 16 } = options
  const feedRect = feed.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const visibleTop = feedRect.top + paddingTop
  const visibleBottom = feedRect.bottom - paddingBottom
  const visibleHeight = Math.max(0, visibleBottom - visibleTop)
  const currentScrollTop = feed.scrollTop

  let nextScrollTop = currentScrollTop

  if (targetRect.height > visibleHeight) {
    if (targetRect.top !== visibleTop) {
      nextScrollTop += targetRect.top - visibleTop
    }
  } else if (targetRect.bottom > visibleBottom) {
    nextScrollTop += targetRect.bottom - visibleBottom
  } else if (targetRect.top < visibleTop) {
    nextScrollTop -= visibleTop - targetRect.top
  }

  nextScrollTop = Math.max(0, nextScrollTop)

  if (Math.abs(nextScrollTop - currentScrollTop) < 1) {
    return false
  }

  feed.scrollTop = nextScrollTop
  return true
}
