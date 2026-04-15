import type { FastifyBaseLogger } from 'fastify'
import type { AnalyticsBatchBody, AnalyticsEvent } from '../../src/shared/analytics'
import { analyticsEventCatalog } from '../../src/shared/analytics'
import { writeClickHouseAnalyticsBatch } from './clickhouseAnalytics'
import { runtimeConfig } from './config'

type AnalyticsCategory = (typeof analyticsEventCatalog)[keyof typeof analyticsEventCatalog]['category']

type AnalyticsRequestContext = {
  identifier?: string | null
  ip?: string
  userAgent?: string
}

type SanitizedAnalyticsEvent = {
  category: AnalyticsCategory
  identifier: string | null
  ip: string | null
  name: AnalyticsEvent['name']
  occurredAt: string
  properties: ReturnType<typeof sanitizeEventProperties>
  source: AnalyticsEvent['source']
  userAgent: string | null
}

function sanitizeScalar(value: unknown) {
  if (typeof value === 'string') {
    return value.slice(0, 200)
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }

  return null
}

function sanitizeEventProperties(event: AnalyticsEvent) {
  return Object.fromEntries(
    Object.entries(event.properties ?? {}).slice(0, 32).map(([key, value]) => [key, sanitizeScalar(value)]),
  )
}

function sanitizeEvent(event: AnalyticsEvent, context: AnalyticsRequestContext) {
  const catalogEntry = analyticsEventCatalog[event.name]

  if (!catalogEntry) {
    throw new Error('Неизвестное имя analytics event.')
  }

  return {
    category: catalogEntry.category,
    identifier: context.identifier ?? null,
    ip: context.ip ?? null,
    name: event.name,
    occurredAt: event.occurredAt,
    properties: sanitizeEventProperties(event),
    source: event.source,
    userAgent: context.userAgent ?? null,
  } satisfies SanitizedAnalyticsEvent
}

export function parseAnalyticsBatch(body: unknown) {
  const payload = (body ?? {}) as Partial<AnalyticsBatchBody>
  const events = Array.isArray(payload.events) ? payload.events : []

  if (events.length === 0) {
    return [] as AnalyticsEvent[]
  }

  return events.slice(0, runtimeConfig.analytics.maxBatchSize)
}

export async function ingestAnalyticsBatch(
  logger: FastifyBaseLogger,
  events: AnalyticsEvent[],
  context: AnalyticsRequestContext,
) {
  if (!runtimeConfig.analytics.enabled || runtimeConfig.analytics.provider === 'disabled') {
    return
  }

  const sanitizedEvents = events.map((event) => sanitizeEvent(event, context))

  if (runtimeConfig.analytics.provider === 'log') {
    for (const event of sanitizedEvents) {
      logger.info({ analyticsEvent: event }, 'analytics.event')
    }

    return
  }

  if (runtimeConfig.analytics.provider === 'clickhouse') {
    await writeClickHouseAnalyticsBatch(
      logger,
      runtimeConfig.analytics.clickhouse,
      runtimeConfig.environment,
      sanitizedEvents,
    )
  }
}
