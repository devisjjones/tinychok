import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'

type TimelineItem = {
  createdAt?: string
  id: number
}

type HistoryPageResult<T> = {
  hasMore: boolean
  items: T[]
}

function compareTimelineItems(left: TimelineItem, right: TimelineItem) {
  const leftTimestamp = left.createdAt ? Date.parse(left.createdAt) : Number.NEGATIVE_INFINITY
  const rightTimestamp = right.createdAt ? Date.parse(right.createdAt) : Number.NEGATIVE_INFINITY

  if (leftTimestamp === rightTimestamp) {
    return left.id - right.id
  }

  return leftTimestamp - rightTimestamp
}

function mergeTimelineItems<T extends TimelineItem>(olderItems: T[], recentItems: T[]) {
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
    setHistoryState({
      hasMore: initialHasOlderHistoryRef.current,
      olderItems: [],
      roomKey,
    })
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
    revealItemById,
    visibleItems,
  }
}
