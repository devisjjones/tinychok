import { Buffer } from 'node:buffer'
import type { FastifyBaseLogger } from 'fastify'

type AnalyticsScalar = boolean | number | string | null

export type ClickHouseAnalyticsSinkConfig = {
  database: string
  password: string | null
  table: string
  timeoutMs: number
  url: string | null
  user: string | null
}

export type ClickHouseAnalyticsEvent = {
  category: string
  identifier: string | null
  ip: string | null
  name: string
  occurredAt: string
  properties: Record<string, AnalyticsScalar>
  source: string
  userAgent: string | null
}

type ClickHouseAnalyticsRow = {
  anonymous_id: string | null
  environment: string
  event_category: string
  event_name: string
  identifier: string | null
  ingested_at: string
  ip: string | null
  occurred_at: string
  properties_json: string
  source: string
  user_agent: string | null
}

const clickHouseIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u

function assertClickHouseIdentifier(value: string, label: string) {
  if (!clickHouseIdentifierPattern.test(value)) {
    throw new Error(`ClickHouse analytics ${label} должен содержать только буквы, цифры и _.`)
  }
}

function getClickHouseInsertTarget(config: Pick<ClickHouseAnalyticsSinkConfig, 'database' | 'table'>) {
  assertClickHouseIdentifier(config.database, 'database')
  assertClickHouseIdentifier(config.table, 'table')
  return `${config.database}.${config.table}`
}

function getRequiredClickHouseAuth(config: ClickHouseAnalyticsSinkConfig) {
  if (!config.url) {
    throw new Error('ClickHouse analytics url не настроен.')
  }

  if (!config.user) {
    throw new Error('ClickHouse analytics user не настроен.')
  }

  if (!config.password) {
    throw new Error('ClickHouse analytics password не настроен.')
  }

  return {
    password: config.password,
    url: config.url,
    user: config.user,
  }
}

export function formatClickHouseDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error('Некорректная дата analytics event для ClickHouse sink.')
  }

  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}`
}

export function buildClickHouseAnalyticsRow(
  event: ClickHouseAnalyticsEvent,
  environment: string,
  ingestedAt: Date = new Date(),
) {
  return {
    anonymous_id: typeof event.properties.anonymousId === 'string' ? event.properties.anonymousId : null,
    environment,
    event_category: event.category,
    event_name: event.name,
    identifier: event.identifier,
    ingested_at: formatClickHouseDateTime(ingestedAt),
    ip: event.ip,
    occurred_at: formatClickHouseDateTime(event.occurredAt),
    properties_json: JSON.stringify(event.properties),
    source: event.source,
    user_agent: event.userAgent,
  } satisfies ClickHouseAnalyticsRow
}

export function buildClickHouseAnalyticsInsertUrl(
  baseUrl: string,
  config: Pick<ClickHouseAnalyticsSinkConfig, 'database' | 'table'>,
) {
  const url = new URL(baseUrl)
  url.searchParams.set('query', `INSERT INTO ${getClickHouseInsertTarget(config)} FORMAT JSONEachRow`)
  return url.toString()
}

export function serializeClickHouseAnalyticsRows(rows: ReturnType<typeof buildClickHouseAnalyticsRow>[]) {
  if (rows.length === 0) {
    return ''
  }

  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
}

export async function writeClickHouseAnalyticsBatch(
  logger: FastifyBaseLogger,
  config: ClickHouseAnalyticsSinkConfig,
  environment: string,
  events: ClickHouseAnalyticsEvent[],
) {
  const auth = getRequiredClickHouseAuth(config)
  const rows = events.map((event) => buildClickHouseAnalyticsRow(event, environment))
  const response = await fetch(buildClickHouseAnalyticsInsertUrl(auth.url, config), {
    body: serializeClickHouseAnalyticsRows(rows),
    headers: {
      Authorization: `Basic ${Buffer.from(`${auth.user}:${auth.password}`).toString('base64')}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    method: 'POST',
    signal: AbortSignal.timeout(config.timeoutMs),
  })

  if (response.ok) {
    return
  }

  const responseBody = (await response.text()).trim().slice(0, 500)
  logger.error(
    {
      analyticsCount: rows.length,
      clickhouseStatus: response.status,
      responseBody,
    },
    'analytics.clickhouse.insert_failed',
  )
  throw new Error(
    `ClickHouse analytics insert failed with status ${response.status}${responseBody ? `: ${responseBody}` : '.'}`,
  )
}
