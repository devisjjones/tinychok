import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import {
  advancePendingRoomFeedScroll,
  createPendingRoomFeedScroll,
  shouldPreserveStickyRoomFeedScroll,
} from '../../src/app/roomFeedAutoScroll'

function createFeed(options: {
  clientHeight: number
  onScrollTo?: (top: number) => number
  scrollHeight: number
  scrollTop: number
}) {
  const dom = new JSDOM('<!doctype html><div id="feed"></div>')
  const feed = dom.window.document.getElementById('feed') as HTMLElement
  let currentClientHeight = options.clientHeight
  let currentScrollHeight = options.scrollHeight
  let currentScrollTop = options.scrollTop

  Object.defineProperty(feed, 'clientHeight', {
    configurable: true,
    get: () => currentClientHeight,
  })
  Object.defineProperty(feed, 'scrollHeight', {
    configurable: true,
    get: () => currentScrollHeight,
  })
  Object.defineProperty(feed, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value
    },
  })

  feed.scrollTo = ((valueOrOptions?: number | ScrollToOptions, _y?: number) => {
    const resolvedTop =
      typeof valueOrOptions === 'number'
        ? valueOrOptions
        : Number(valueOrOptions?.top ?? 0)

    currentScrollTop = options.onScrollTo
      ? options.onScrollTo(resolvedTop)
      : Math.max(0, currentScrollHeight - currentClientHeight)
  }) as HTMLElement['scrollTo']

  return {
    feed,
    setMetrics(next: Partial<{ clientHeight: number; scrollHeight: number; scrollTop: number }>) {
      if (next.clientHeight !== undefined) currentClientHeight = next.clientHeight
      if (next.scrollHeight !== undefined) currentScrollHeight = next.scrollHeight
      if (next.scrollTop !== undefined) currentScrollTop = next.scrollTop
    },
  }
}

test('pending room feed scroll settles once the DOM feed reaches the bottom', () => {
  const { feed } = createFeed({
    clientHeight: 300,
    scrollHeight: 1000,
    scrollTop: 120,
  })

  const result = advancePendingRoomFeedScroll({
    feed,
    pendingScroll: createPendingRoomFeedScroll('direct:7', 'room-open'),
    stickyToBottom: true,
  })

  assert.equal(result, null)
  assert.equal(feed.scrollTop, 700)
})

test('pending room feed scroll keeps converging while layout is still settling', () => {
  let attempt = 0
  const { feed, setMetrics } = createFeed({
    clientHeight: 300,
    onScrollTo: () => {
      attempt += 1
      return attempt === 1 ? 520 : 780
    },
    scrollHeight: 1080,
    scrollTop: 0,
  })

  const firstResult = advancePendingRoomFeedScroll({
    feed,
    pendingScroll: createPendingRoomFeedScroll('direct:9', 'room-open', 4),
    stickyToBottom: true,
  })
  assert.notEqual(firstResult, null)
  assert.equal(firstResult?.attemptsRemaining, 3)

  setMetrics({ scrollHeight: 1080 })
  const secondResult = advancePendingRoomFeedScroll({
    feed,
    pendingScroll: firstResult!,
    stickyToBottom: true,
  })
  assert.equal(secondResult, null)
  assert.equal(feed.scrollTop, 780)
})

test('pending room feed scroll cancels immediately when sticky mode is lost', () => {
  const { feed } = createFeed({
    clientHeight: 300,
    scrollHeight: 1000,
    scrollTop: 100,
  })

  const result = advancePendingRoomFeedScroll({
    feed,
    pendingScroll: createPendingRoomFeedScroll('group:4', 'remote-append'),
    stickyToBottom: false,
  })

  assert.equal(result, null)
  assert.equal(feed.scrollTop, 100)
})

test('room-open pending scroll preserves sticky mode during initial mount race', () => {
  const pendingScroll = createPendingRoomFeedScroll('direct:44', 'room-open')

  assert.equal(
    shouldPreserveStickyRoomFeedScroll({
      activeRoomFeedKey: 'direct:44',
      pendingScroll,
    }),
    true,
  )
  assert.equal(
    shouldPreserveStickyRoomFeedScroll({
      activeRoomFeedKey: 'direct:44',
      pendingScroll: {
        ...pendingScroll,
        reason: 'remote-append',
      },
    }),
    false,
  )
})
