import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react'

import {
  advancePendingRoomFeedScroll,
  createPendingRoomFeedScroll,
  shouldPreserveStickyRoomFeedScroll,
  type PendingRoomFeedScroll,
  type RoomFeedScrollReason,
} from './roomFeedAutoScroll'
import {
  classifyRoomFeedChange,
  isRoomFeedNearBottom,
  shouldAutoScrollRoomFeed,
  type RoomFeedIntent,
  type RoomFeedSignature,
} from './roomFeedScroll'

type HistoryMutation = {
  kind: 'idle' | 'prepend' | 'reset'
  roomKey: string | null
  seq: number
}

export function useRoomFeedAutoScroll(options: {
  activeRoomFeedKey: string | null
  activeRoomFeedSignature: RoomFeedSignature
  activeRoomHistoryMutation: HistoryMutation
  feedRef: RefObject<HTMLDivElement | null>
}) {
  const { activeRoomFeedKey, activeRoomFeedSignature, activeRoomHistoryMutation, feedRef } = options

  // Critical scroll invariant:
  // - room open always lands on the latest item
  // - local send always lands on the latest item
  // - older-history prepend must preserve viewport and never fight open/send scrolling
  const shouldStickRoomFeedToBottomRef = useRef(true)
  const roomFeedIntentRef = useRef<RoomFeedIntent>(null)
  const previousRoomFeedRef = useRef<{
    roomKey: string | null
    signature: RoomFeedSignature | null
  }>({
    roomKey: null,
    signature: null,
  })
  const lastHandledPrependMutationSeqRef = useRef(0)
  const pendingRoomFeedScrollRef = useRef<PendingRoomFeedScroll | null>(null)
  const pendingRoomFeedScrollFrameRef = useRef<number | null>(null)

  function buildRoomFeedPendingScroll(
    roomKey: string,
    reason: RoomFeedScrollReason,
  ) {
    // High media bubbles can finish layout noticeably later than the append itself.
    // Keep local-send/media-relayout sticky longer so the newest image lands fully above the composer.
    const attempts =
      reason === 'local-send'
        ? 24
        : reason === 'media-relayout'
          ? 18
          : 12
    return createPendingRoomFeedScroll(roomKey, reason, attempts)
  }

  const cancelPendingRoomFeedScrollFrame = useCallback(() => {
    if (pendingRoomFeedScrollFrameRef.current === null) return
    window.cancelAnimationFrame(pendingRoomFeedScrollFrameRef.current)
    pendingRoomFeedScrollFrameRef.current = null
  }, [])

  const runPendingRoomFeedScroll = useCallback(function runPendingRoomFeedScroll() {
    const feed = feedRef.current
    const pendingScroll = pendingRoomFeedScrollRef.current

    if (!feed || !pendingScroll) {
      return
    }

    const nextPendingScroll = advancePendingRoomFeedScroll({
      feed,
      pendingScroll,
      stickyToBottom: shouldStickRoomFeedToBottomRef.current,
    })
    pendingRoomFeedScrollRef.current = nextPendingScroll

    if (!nextPendingScroll) {
      cancelPendingRoomFeedScrollFrame()
      return
    }

    pendingRoomFeedScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingRoomFeedScrollFrameRef.current = null
      runPendingRoomFeedScroll()
    })
  }, [cancelPendingRoomFeedScrollFrame, feedRef])

  const schedulePendingRoomFeedScroll = useCallback((pendingScroll: PendingRoomFeedScroll) => {
    pendingRoomFeedScrollRef.current = pendingScroll
    cancelPendingRoomFeedScrollFrame()
    pendingRoomFeedScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingRoomFeedScrollFrameRef.current = null
      runPendingRoomFeedScroll()
    })
  }, [cancelPendingRoomFeedScrollFrame, runPendingRoomFeedScroll])

  const requestRoomFeedScrollToBottom = useCallback((intent: RoomFeedIntent) => {
    roomFeedIntentRef.current = intent
    shouldStickRoomFeedToBottomRef.current = true

    if (!activeRoomFeedKey) {
      return
    }

    const reason: RoomFeedScrollReason = intent === 'local-send' ? 'local-send' : 'room-open'
    schedulePendingRoomFeedScroll(buildRoomFeedPendingScroll(activeRoomFeedKey, reason))
  }, [activeRoomFeedKey, schedulePendingRoomFeedScroll])

  useEffect(() => {
    if (!activeRoomFeedKey || !feedRef.current) return

    const feed = feedRef.current
    const updateStickyState = () => {
      if (shouldPreserveStickyRoomFeedScroll({
        activeRoomFeedKey,
        pendingScroll: pendingRoomFeedScrollRef.current,
      })) {
        shouldStickRoomFeedToBottomRef.current = true
        return
      }

      const isNearBottom = isRoomFeedNearBottom(feed)
      shouldStickRoomFeedToBottomRef.current = isNearBottom

      if (!isNearBottom) {
        pendingRoomFeedScrollRef.current = null
        cancelPendingRoomFeedScrollFrame()
      }
    }

    updateStickyState()
    feed.addEventListener('scroll', updateStickyState)

    return () => {
      feed.removeEventListener('scroll', updateStickyState)
    }
  }, [activeRoomFeedKey, cancelPendingRoomFeedScrollFrame, feedRef])

  useLayoutEffect(() => {
    if (!activeRoomFeedKey) {
      previousRoomFeedRef.current = { roomKey: null, signature: null }
      pendingRoomFeedScrollRef.current = null
      roomFeedIntentRef.current = null
      cancelPendingRoomFeedScrollFrame()
      return
    }

    const previousRoomFeed = previousRoomFeedRef.current
    const roomChanged = previousRoomFeed.roomKey !== activeRoomFeedKey
    const prependMutation =
      activeRoomHistoryMutation.kind === 'prepend' &&
      activeRoomHistoryMutation.roomKey === activeRoomFeedKey &&
      activeRoomHistoryMutation.seq !== lastHandledPrependMutationSeqRef.current
    const changeKind = classifyRoomFeedChange({
      next: activeRoomFeedSignature,
      prependMutation,
      previous: previousRoomFeed.roomKey === activeRoomFeedKey ? previousRoomFeed.signature : null,
      roomChanged,
    })

    previousRoomFeedRef.current = {
      roomKey: activeRoomFeedKey,
      signature: activeRoomFeedSignature,
    }

    if (prependMutation) {
      lastHandledPrependMutationSeqRef.current = activeRoomHistoryMutation.seq
      return
    }

    if (changeKind === 'room-switch') {
      roomFeedIntentRef.current = 'room-open'
      shouldStickRoomFeedToBottomRef.current = true
    }

    if (!shouldAutoScrollRoomFeed({
      changeKind,
      intent: roomFeedIntentRef.current,
      stickyToBottom: shouldStickRoomFeedToBottomRef.current,
    })) {
      return
    }

    const reason: RoomFeedScrollReason =
      roomFeedIntentRef.current === 'local-send'
        ? 'local-send'
        : changeKind === 'room-switch'
          ? 'room-open'
          : 'remote-append'

    schedulePendingRoomFeedScroll(buildRoomFeedPendingScroll(activeRoomFeedKey, reason))

    if (roomFeedIntentRef.current === 'local-send' || changeKind === 'room-switch') {
      roomFeedIntentRef.current = null
    }
  }, [
    activeRoomHistoryMutation.kind,
    activeRoomHistoryMutation.roomKey,
    activeRoomHistoryMutation.seq,
    activeRoomFeedKey,
    activeRoomFeedSignature,
    cancelPendingRoomFeedScrollFrame,
    schedulePendingRoomFeedScroll,
  ])

  useEffect(() => {
    if (!activeRoomFeedKey || !feedRef.current) return

    const feed = feedRef.current
    const handleMediaLoad = () => {
      if (!activeRoomFeedKey) return
      if (!shouldStickRoomFeedToBottomRef.current && !pendingRoomFeedScrollRef.current) return

      const pendingScroll =
        pendingRoomFeedScrollRef.current ??
        buildRoomFeedPendingScroll(activeRoomFeedKey, 'media-relayout')
      schedulePendingRoomFeedScroll(pendingScroll)
    }

    feed.addEventListener('load', handleMediaLoad, true)

    return () => {
      feed.removeEventListener('load', handleMediaLoad, true)
    }
  }, [activeRoomFeedKey, feedRef, schedulePendingRoomFeedScroll])

  useEffect(() => {
    const feed = feedRef.current
    if (!activeRoomFeedKey || !feed || typeof ResizeObserver === 'undefined') {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!shouldStickRoomFeedToBottomRef.current && !pendingRoomFeedScrollRef.current) {
        return
      }

      const pendingScroll =
        pendingRoomFeedScrollRef.current ??
        buildRoomFeedPendingScroll(activeRoomFeedKey, 'media-relayout')
      schedulePendingRoomFeedScroll(pendingScroll)
    })

    resizeObserver.observe(feed)

    return () => {
      resizeObserver.disconnect()
    }
  }, [activeRoomFeedKey, feedRef, schedulePendingRoomFeedScroll])

  useEffect(() => {
    return () => {
      cancelPendingRoomFeedScrollFrame()
    }
  }, [cancelPendingRoomFeedScrollFrame])

  return {
    requestRoomFeedScrollToBottom,
  }
}
