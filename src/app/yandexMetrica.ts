import type { AnalyticsEventProperties } from '../shared/analytics'

declare global {
  interface Window {
    ym?: YandexMetricaShim
  }
}

type YandexMetricaShim = ((...args: unknown[]) => void) & {
  a?: unknown[][]
  l?: number
}

type MetricaRuntimeConfig = {
  consentGranted: boolean
  counterId: number | null
}

const runtimeState: MetricaRuntimeConfig = {
  consentGranted: false,
  counterId: null,
}

const metricaScriptSrcPrefix = 'https://mc.yandex.ru/metrika/tag.js?id='
const initializedCounters = new Set<number>()
let lastTrackedVirtualPage: string | null = null

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function ensureYmShim() {
  if (!isBrowser() || typeof window.ym === 'function') {
    return
  }

  const ymShim: YandexMetricaShim = (...args: unknown[]) => {
    ;(ymShim.a = ymShim.a || []).push(args)
  }

  ymShim.l = Date.now()
  window.ym = ymShim
}

function ensureMetricaScript(counterId: number) {
  if (!isBrowser()) return

  const scriptSrc = `${metricaScriptSrcPrefix}${counterId}`
  const existingScript = [...document.scripts].some((script) => script.src === scriptSrc)
  if (existingScript) return

  const scriptElement = document.createElement('script')
  scriptElement.async = true
  scriptElement.src = scriptSrc
  document.head.appendChild(scriptElement)
}

function ensureMetricaInitialized(counterId: number) {
  if (!isBrowser() || initializedCounters.has(counterId)) {
    return
  }

  ensureYmShim()
  ensureMetricaScript(counterId)
  window.ym?.(counterId, 'init', {
    accurateTrackBounce: true,
    clickmap: true,
    defer: true,
    trackLinks: true,
  })
  initializedCounters.add(counterId)
}

function getCurrentCounterId() {
  if (!runtimeState.consentGranted) {
    return null
  }

  return runtimeState.counterId
}

export function configureYandexMetricaRuntime(nextRuntime: Partial<MetricaRuntimeConfig>) {
  Object.assign(runtimeState, nextRuntime)

  const counterId = getCurrentCounterId()
  if (!counterId) {
    lastTrackedVirtualPage = null
    return
  }

  ensureMetricaInitialized(counterId)
}

export function trackYandexMetricaGoal(goal: string, params: AnalyticsEventProperties = {}) {
  const counterId = getCurrentCounterId()
  if (!counterId) {
    return
  }

  ensureMetricaInitialized(counterId)
  window.ym?.(counterId, 'reachGoal', goal, params)
}

export function trackYandexMetricaPageView(virtualPath: string, title?: string) {
  const counterId = getCurrentCounterId()
  if (!counterId || !isBrowser()) {
    return
  }

  const normalizedPath = virtualPath.startsWith('/') ? virtualPath : `/${virtualPath}`
  if (lastTrackedVirtualPage === normalizedPath) {
    return
  }

  lastTrackedVirtualPage = normalizedPath
  ensureMetricaInitialized(counterId)
  window.ym?.(counterId, 'hit', normalizedPath, {
    title,
  })
}
