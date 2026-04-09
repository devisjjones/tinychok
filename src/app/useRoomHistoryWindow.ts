import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'

type TimelineItem = {
  createdAt?: string
  id: number
}

type HistoryPageResult<T> = {
  hasMore: boolean
  items: T[]
}

function resolveTimelineTimestamp(item: TimelineItem) {
  const timestamp = item.createdAt ? Date.parse(item.createdAt) : Number.NEGATIVE_INFINITY
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function compareTimelineItemIds(leftId: number, rightId: number) {
  const leftOptimistic = leftId < 0
  const rightOptimistic = rightId < 0

  if (leftOptimistic !== rightOptimistic) {
    return leftOptimistic ? 1 : -1
  }

  if (leftOptimistic && rightOptimistic) {
    return rightId - leftId
  }

  return leftId - rightId
}

export function compareTimelineItems(left: TimelineItem, right: TimelineItem) {
  const leftTimestamp = resolveTimelineTimestamp(left)
  const rightTimestamp = resolveTimelineTimestamp(right)

  if (leftTimestamp === rightTimestamp) {
    // Optimistic room messages use negative local ids. When the timestamp matches the confirmed
    // tail, they still belong after already-confirmed items; otherwise the pending bubble renders
    // too high and then "jumps" down once the server ack replaces it.
    return compareTimelineItemIds(left.id, right.id)
  }

  return leftTimestamp - rightTimestamp
}

export function mergeTimelineItems<T extends TimelineItem>(olderItems: T[], recentItems: T[]) {
  const itemsById = new Map<number, T>()

  olderItems.forEach((item) => {
    itemsById.set(item.id, item)
  })
  recentItems.forEach((item) => {
    itemsById.set(item.id, item)
  })

  return [...itemsById.values()].sort(compareTimelineItems)
}

export function useRoomHistoryWindow<T extends TimelineItem>(options: {
  feedRef: RefObject<HTMLDivElement | null>
  hasOlderHistory: boolean
  items: T[]
  loadOlderPage?: (beforeItemId: number) => Promise<HistoryPageResult<T>>
  roomKey: string | null
}) {
  const { feedRef, hasOlderHistory, items, loadOlderPage, roomKey } = options
  const [historyMutation, setHistoryMutation] = useState<{
    kind: 'idle' | 'prepend' | 'reset'
    roomKey: string | null
    seq: number
  }>({
    kind: roomKey ? 'reset' : 'idle',
    roomKey,
    seq: 0,
  })
  const [historyState, setHistoryState] = useState<{
    hasMore: boolean
    olderItems: T[]
    roomKey: string | null
  }>({
    hasMore: hasOlderHistory,
    olderItems: [],
    roomKey,
  })
  const prependScrollStateRef = useRef<{
    previousScrollHeight: number
    previousScrollTop: number
  } | null>(null)
  const activeRoomKeyRef = useRef(roomKey)
  const initialHasOlderHistoryRef = useRef(hasOlderHistory)
  const hasMoreRef = useRef(hasOlderHistory)
  const visibleItems = useMemo(() => {
    const olderItems = historyState.roomKey === roomKey ? historyState.olderItems : []
    return mergeTimelineItems(olderItems, items)
  }, [historyState.olderItems, historyState.roomKey, items, roomKey])
  const visibleItemsRef = useRef(visibleItems)
  const loadOlderPromiseRef = useRef<Promise<boolean> | null>(null)
  const olderItemsRefreshSignatureRef = useRef<string | null>(null)
  const recentItemsSignature = useMemo(
    () => items.map((item) => `${item.id}:${item.createdAt ?? ''}`).join('|'),
    [items],
  )

  useEffect(() => {
    activeRoomKeyRef.current = roomKey
  }, [roomKey])

  useEffect(() => {
    initialHasOlderHistoryRef.current = hasOlderHistory
  }, [hasOlderHistory])

  useEffect(() => {
    visibleItemsRef.current = visibleItems
  }, [visibleItems])

  useEffect(() => {
    hasMoreRef.current =
      historyState.roomKey === roomKey ? historyState.hasMore : hasOlderHistory
  }, [hasOlderHistory, historyState.hasMore, historyState.roomKey, roomKey])

  useEffect(() => {
    prependScrollStateRef.current = null
    loadOlderPromiseRef.current = null
    olderItemsRefreshSignatureRef.current = null
    setHistoryState({
      hasMore: initialHasOlderHistoryRef.current,
      olderItems: [],
      roomKey,
    })
    setHistoryMutation((currentMutation) => ({
      kind: roomKey ? 'reset' : 'idle',
      roomKey,
      seq: currentMutation.seq + 1,
    }))
  }, [roomKey])

  useEffect(() => {
    setHistoryState((currentState) => {
      if (currentState.roomKey !== roomKey || currentState.olderItems.length > 0) {
        return currentState
      }

      if (currentState.hasMore === hasOlderHistory) {
        return currentState
      }

      return {
        ...currentState,
        hasMore: hasOlderHistory,
      }
    })
  }, [hasOlderHistory, roomKey])

  useEffect(() => {
    setHistoryState((currentState) => {
      if (currentState.roomKey !== roomKey) {
        return currentState
      }

      if (items.length > 0 || currentState.olderItems.length === 0) {
        return currentState
      }

      // A destructive room reset (for example "delete history for everyone") can keep the
      // same roomKey while replacing the recent slice with an empty list. In that case the
      // previously prepended olderItems must be dropped too, otherwise the UI rehydrates
      // stale history on top of an already-cleared snapshot.
      return {
        hasMore: hasOlderHistory,
        olderItems: [],
        roomKey,
      }
    })
  }, [hasOlderHistory, items.length, roomKey])

  useEffect(() => {
    if (!roomKey || !loadOlderPage) return
    if (historyState.roomKey !== roomKey || historyState.olderItems.length === 0) return

    const oldestRecentItem = items[0]
    if (!oldestRecentItem) return

    const refreshSignature = `${roomKey}:${recentItemsSignature}:${historyState.olderItems.length}`
    if (olderItemsRefreshSignatureRef.current === refreshSignature) {
      return
    }
    olderItemsRefreshSignatureRef.current = refreshSignature

    let cancelled = false

    void (async () => {
      let beforeItemId = oldestRecentItem.id
      let remainingOlderItems = historyState.olderItems.length
      let refreshedOlderItems: T[] = []

      while (!cancelled && remainingOlderItems > 0) {
        const page = await loadOlderPage(beforeItemId)
        if (cancelled || page.items.length === 0) {
          break
        }

        // When a live snapshot updates already-visible history (for example storage cleanup
        // replacing an old attachment with a removal note), refresh the loaded older window too.
        // This is important for the reader side: without it, the owner sees the quota notice
        // but the other participant can stay stuck with an empty stale bubble until full reload.
        refreshedOlderItems = mergeTimelineItems(refreshedOlderItems, page.items)
        remainingOlderItems = historyState.olderItems.length - refreshedOlderItems.length

        const nextBeforeItem = page.items[0]
        if (!page.hasMore || !nextBeforeItem) {
          break
        }

        beforeItemId = nextBeforeItem.id
      }

      if (cancelled || refreshedOlderItems.length === 0) {
        return
      }

      setHistoryState((currentState) => {
        if (currentState.roomKey !== roomKey) {
          return currentState
        }

        return {
          ...currentState,
          olderItems: mergeTimelineItems(currentState.olderItems, refreshedOlderItems),
        }
      })
    })()

    return () => {
      cancelled = true
    }
  }, [historyState.olderItems, historyState.roomKey, items, loadOlderPage, recentItemsSignature, roomKey])

  const loadOlderItems = useCallback(async () => {
    if (loadOlderPromiseRef.current) {
      return loadOlderPromiseRef.current
    }

    if (!roomKey || !loadOlderPage || !hasMoreRef.current) {
      return false
    }

    const oldestVisibleItem = visibleItemsRef.current[0]
    if (!oldestVisibleItem) {
      hasMoreRef.current = false
      setHistoryState({
        hasMore: false,
        olderItems: [],
        roomKey,
      })
      return false
    }

    const feed = feedRef.current
    if (feed) {
      prependScrollStateRef.current = {
        previousScrollHeight: feed.scrollHeight,
        previousScrollTop: feed.scrollTop,
      }
    }

    const activeRoomKey = roomKey
    let pendingRequest: Promise<boolean> | null = null
    pendingRequest = (async () => {
      try {
        const page = await loadOlderPage(oldestVisibleItem.id)
        if (activeRoomKeyRef.current !== activeRoomKey) {
          return false
        }

        hasMoreRef.current = page.hasMore
        // Older history is prepended into the feed and must preserve viewport.
        // Consumers use this explicit mutation signal to avoid treating prepend as append.
        if (page.items.length > 0) {
          setHistoryMutation((currentMutation) => ({
            kind: 'prepend',
            roomKey: activeRoomKey,
            seq: currentMutation.seq + 1,
          }))
        }
        setHistoryState((currentState) => {
          if (currentState.roomKey !== activeRoomKey) {
            return currentState
          }

          return {
            hasMore: page.hasMore,
            olderItems: mergeTimelineItems(page.items, currentState.olderItems),
            roomKey: activeRoomKey,
          }
        })

        return page.items.length > 0
      } catch (error) {
        console.error('Failed to load older room history', error)
        return false
      } finally {
        if (loadOlderPromiseRef.current === pendingRequest) {
          loadOlderPromiseRef.current = null
        }
      }
    })()

    loadOlderPromiseRef.current = pendingRequest
    return pendingRequest
  }, [feedRef, loadOlderPage, roomKey])

  const revealItemById = useCallback(
    (itemId: number) => {
      const isAlreadyVisible = visibleItemsRef.current.some((item) => item.id === itemId)
      if (isAlreadyVisible) {
        return false
      }

      if (!roomKey || !loadOlderPage || !hasMoreRef.current) {
        return false
      }

      void (async () => {
        while (hasMoreRef.current) {
          const didLoadOlderItems = await loadOlderItems()
          if (
            !didLoadOlderItems ||
            visibleItemsRef.current.some((item) => item.id === itemId)
          ) {
            break
          }
        }
      })()

      return true
    },
    [loadOlderItems, loadOlderPage, roomKey],
  )

  useLayoutEffect(() => {
    const pendingScrollState = prependScrollStateRef.current
    const feed = feedRef.current
    if (!pendingScrollState || !feed) return

    // Prepending older history must keep the reader anchored to the same visible viewport.
    prependScrollStateRef.current = null
    feed.scrollTop =
      feed.scrollHeight -
      pendingScrollState.previousScrollHeight +
      pendingScrollState.previousScrollTop
  }, [feedRef, visibleItems.length])

  useEffect(() => {
    if (!roomKey || !loadOlderPage) return

    const feed = feedRef.current
    if (!feed) return

    const handleScroll = () => {
      if (
        feed.scrollTop > 48 ||
        !hasMoreRef.current ||
        loadOlderPromiseRef.current !== null
      ) {
        return
      }

      void loadOlderItems()
    }

    feed.addEventListener('scroll', handleScroll)

    return () => {
      feed.removeEventListener('scroll', handleScroll)
    }
  }, [feedRef, loadOlderItems, loadOlderPage, roomKey])

  return {
    canLoadOlder: Boolean(roomKey && loadOlderPage && hasMoreRef.current),
    historyMutation,
    revealItemById,
    visibleItems,
  }
}
