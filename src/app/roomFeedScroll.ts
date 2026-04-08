export type RoomFeedSignature = {
  count: number
  lastItemId: number | null
}

export type RoomFeedIntent = 'local-send' | 'room-open' | null

export type RoomFeedChangeKind =
  | 'append'
  | 'none'
  | 'prepend'
  | 'room-switch'
  | 'tail-replaced'

export function buildRoomFeedSignature(
  items: Array<{ id: number }>,
): RoomFeedSignature {
  return {
    count: items.length,
    lastItemId: items.length > 0 ? items[items.length - 1]?.id ?? null : null,
  }
}

export function isRoomFeedNearBottom(
  metrics: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>,
  threshold = 64,
) {
  const distanceToBottom = metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop
  return distanceToBottom <= threshold
}

export function classifyRoomFeedChange(options: {
  next: RoomFeedSignature
  previous: RoomFeedSignature | null
  prependMutation: boolean
  roomChanged: boolean
}): RoomFeedChangeKind {
  const { next, previous, prependMutation, roomChanged } = options

  if (roomChanged) {
    return 'room-switch'
  }

  if (!previous) {
    return 'room-switch'
  }

  if (prependMutation) {
    return 'prepend'
  }

  if (next.count > previous.count) {
    return 'append'
  }

  if (next.lastItemId !== previous.lastItemId) {
    return 'tail-replaced'
  }

  return 'none'
}

export function shouldAutoScrollRoomFeed(options: {
  changeKind: RoomFeedChangeKind
  intent: RoomFeedIntent
  stickyToBottom: boolean
}): boolean {
  const { changeKind, intent, stickyToBottom } = options

  if (changeKind === 'room-switch') {
    return true
  }

  if (changeKind === 'prepend' || changeKind === 'none') {
    return false
  }

  if (intent === 'local-send') {
    return true
  }

  return stickyToBottom
}
