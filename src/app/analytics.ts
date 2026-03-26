import type { AnalyticsBatchBody, AnalyticsEventName, AnalyticsEventProperties } from '../shared/analytics'
import { analyticsDebugStorageKey } from './constants'
import {
  configureYandexMetricaRuntime,
  trackYandexMetricaGoal,
  trackYandexMetricaPageView,
} from './yandexMetrica'

const analyticsAnonymousIdStorageKey = 'tinychok.analytics.anonymous-id'

type AnalyticsRuntimeConfig = {
  consentGranted: boolean
  debug: boolean
  enabled: boolean
  flushIntervalMs: number
  maxBatchSize: number
  metricaCounterId: number | null
  sessionToken: string | null
}

const runtimeState: AnalyticsRuntimeConfig = {
  consentGranted: false,
  debug: false,
  enabled: false,
  flushIntervalMs: 5000,
  maxBatchSize: 20,
  metricaCounterId: null,
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

function isBrowser() {
  return typeof window !== 'undefined'
}

function readAnalyticsDebugPreference() {
  if (!isBrowser()) return false

  const searchParams = new URLSearchParams(window.location.search)
  const queryValue = searchParams.get('analytics_debug')

  if (queryValue === '1' || queryValue === 'true') {
    window.localStorage.setItem(analyticsDebugStorageKey, 'true')
    return true
  }

  if (queryValue === '0' || queryValue === 'false') {
    window.localStorage.removeItem(analyticsDebugStorageKey)
    return false
  }

  return window.localStorage.getItem(analyticsDebugStorageKey) === 'true'
}

function debugAnalyticsLog(label: string, payload: Record<string, unknown>) {
  if (!runtimeState.debug) return
  console.info(`[tinychok analytics] ${label}`, payload)
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

    debugAnalyticsLog('internal-batch-sent', {
      eventNames: nextEvents.map((event) => event.name),
      size: nextEvents.length,
    })
  } catch {
    queue = [...nextEvents, ...queue].slice(0, runtimeState.maxBatchSize * 4)
    debugAnalyticsLog('internal-batch-requeued', {
      eventNames: nextEvents.map((event) => event.name),
      size: nextEvents.length,
    })
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
  runtimeState.debug = readAnalyticsDebugPreference()
  configureYandexMetricaRuntime({
    consentGranted: runtimeState.consentGranted,
    counterId: runtimeState.metricaCounterId,
  })

  if (!runtimeState.enabled || !runtimeState.consentGranted) {
    queue = []
    clearFlushTimeout()
  }
}

export function trackAnalyticsEvent(name: AnalyticsEventName, properties: AnalyticsEventProperties = {}) {
  const metricaEnabled = runtimeState.consentGranted && runtimeState.metricaCounterId !== null
  const internalAnalyticsEnabled = runtimeState.enabled && runtimeState.consentGranted

  debugAnalyticsLog('event', {
    internalAnalyticsEnabled,
    metricaEnabled,
    name,
    properties,
  })

  if (metricaEnabled) {
    trackYandexMetricaGoal(name, properties)
  }

  if (!internalAnalyticsEnabled) {
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

export function trackAnalyticsPageView(virtualPath: string, title?: string) {
  const sent = trackYandexMetricaPageView(virtualPath, title)
  if (!sent) {
    return false
  }

  debugAnalyticsLog('pageview', {
    consentGranted: runtimeState.consentGranted,
    counterId: runtimeState.metricaCounterId,
    title,
    virtualPath,
  })
  return true
}
