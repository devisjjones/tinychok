import type { AnalyticsBatchBody, AnalyticsEventName, AnalyticsEventProperties } from '../shared/analytics'

const analyticsAnonymousIdStorageKey = 'tinychok.analytics.anonymous-id'

type AnalyticsRuntimeConfig = {
  consentGranted: boolean
  enabled: boolean
  flushIntervalMs: number
  maxBatchSize: number
  sessionToken: string | null
}

const runtimeState: AnalyticsRuntimeConfig = {
  consentGranted: false,
  enabled: false,
  flushIntervalMs: 5000,
  maxBatchSize: 20,
  sessionToken: null,
}

let flushTimeoutId: number | null = null
let queue: AnalyticsBatchBody['events'] = []

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/u, '')
}

function makeHttpUrl(pathname: string) {
  const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)
  return apiBaseUrl ? `${apiBaseUrl}${pathname}` : pathname
}

function getAnonymousId() {
  if (typeof window === 'undefined') {
    return 'server-render'
  }

  const existingId = window.localStorage.getItem(analyticsAnonymousIdStorageKey)
  if (existingId) return existingId

  const nextId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  window.localStorage.setItem(analyticsAnonymousIdStorageKey, nextId)
  return nextId
}

function clearFlushTimeout() {
  if (flushTimeoutId === null) return

  window.clearTimeout(flushTimeoutId)
  flushTimeoutId = null
}

async function flushAnalyticsQueue() {
  if (!runtimeState.enabled || !runtimeState.consentGranted || queue.length === 0) {
    clearFlushTimeout()
    return
  }

  clearFlushTimeout()

  const nextEvents = queue.slice(0, runtimeState.maxBatchSize)
  queue = queue.slice(nextEvents.length)

  try {
    const response = await fetch(makeHttpUrl('/api/analytics/events'), {
      body: JSON.stringify({ events: nextEvents } satisfies AnalyticsBatchBody),
      headers: {
        'Content-Type': 'application/json',
        ...(runtimeState.sessionToken ? { Authorization: `Bearer ${runtimeState.sessionToken}` } : {}),
      },
      keepalive: true,
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(`Analytics ingest failed with status ${response.status}`)
    }
  } catch {
    queue = [...nextEvents, ...queue].slice(0, runtimeState.maxBatchSize * 4)
  }

  if (queue.length > 0) {
    scheduleAnalyticsFlush()
  }
}

function scheduleAnalyticsFlush() {
  if (typeof window === 'undefined' || flushTimeoutId !== null) return

  flushTimeoutId = window.setTimeout(() => {
    void flushAnalyticsQueue()
  }, runtimeState.flushIntervalMs)
}

export function configureAnalyticsRuntime(nextRuntime: Partial<AnalyticsRuntimeConfig>) {
  Object.assign(runtimeState, nextRuntime)

  if (!runtimeState.enabled || !runtimeState.consentGranted) {
    queue = []
    clearFlushTimeout()
  }
}

export function trackAnalyticsEvent(name: AnalyticsEventName, properties: AnalyticsEventProperties = {}) {
  if (!runtimeState.enabled || !runtimeState.consentGranted) {
    return
  }

  queue.push({
    name,
    occurredAt: new Date().toISOString(),
    properties: {
      anonymousId: getAnonymousId(),
      ...properties,
    },
    source: 'web',
  })

  if (queue.length >= runtimeState.maxBatchSize) {
    void flushAnalyticsQueue()
    return
  }

  scheduleAnalyticsFlush()
}
