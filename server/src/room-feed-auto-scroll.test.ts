import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import {
  advancePendingRoomFeedScroll,
  createPendingRoomFeedScroll,
  keepRoomFeedChildVisible,
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

function createFeedWithTarget(options: {
  clientHeight: number
  feedTop: number
  scrollTop: number
  targetHeight: number
  targetTop: number
}) {
  const dom = new JSDOM('<!doctype html><div id="feed"><div id="target"></div></div>')
  const feed = dom.window.document.getElementById('feed') as HTMLElement
  const target = dom.window.document.getElementById('target') as HTMLElement
  let currentScrollTop = options.scrollTop

  Object.defineProperty(feed, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value
    },
  })

  feed.getBoundingClientRect = () =>
    ({
      bottom: options.feedTop + options.clientHeight,
      height: options.clientHeight,
      left: 0,
      right: 0,
      top: options.feedTop,
      width: 0,
      x: 0,
      y: options.feedTop,
      toJSON: () => '',
    }) as DOMRect

  target.getBoundingClientRect = () =>
    ({
      bottom: options.targetTop + options.targetHeight,
      height: options.targetHeight,
      left: 0,
      right: 0,
      top: options.targetTop,
      width: 0,
      x: 0,
      y: options.targetTop,
      toJSON: () => '',
    }) as DOMRect

  return {
    feed,
    target,
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

test('keepRoomFeedChildVisible scrolls the feed down when an expanded child falls below the viewport', () => {
  const { feed, target } = createFeedWithTarget({
    clientHeight: 420,
    feedTop: 100,
    scrollTop: 220,
    targetHeight: 440,
    targetTop: 140,
  })

  const result = keepRoomFeedChildVisible({
    feed,
    paddingBottom: 18,
    paddingTop: 12,
    target,
  })

  assert.equal(result, true)
  assert.equal(feed.scrollTop, 248)
})

test('keepRoomFeedChildVisible aligns an oversized child to the top padding instead of clipping its bottom', () => {
  const { feed, target } = createFeedWithTarget({
    clientHeight: 320,
    feedTop: 80,
    scrollTop: 40,
    targetHeight: 340,
    targetTop: 132,
  })

  const result = keepRoomFeedChildVisible({
    feed,
    paddingBottom: 16,
    paddingTop: 12,
    target,
  })

  assert.equal(result, true)
  assert.equal(feed.scrollTop, 80)
})
