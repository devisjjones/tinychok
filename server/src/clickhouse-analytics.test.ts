import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeConfig } from './config'
import {
  buildClickHouseAnalyticsInsertUrl,
  buildClickHouseAnalyticsRow,
  formatClickHouseDateTime,
  serializeClickHouseAnalyticsRows,
} from './clickhouseAnalytics'

test('createRuntimeConfig parses clickhouse analytics settings and fails closed when they are incomplete', () => {
  const config = createRuntimeConfig({
    TINYCHOK_ANALYTICS_CLICKHOUSE_PASSWORD: 'secret',
    TINYCHOK_ANALYTICS_CLICKHOUSE_URL: 'https://rc1b-example.mdb.yandexcloud.net:8443/',
    TINYCHOK_ANALYTICS_CLICKHOUSE_USER: 'tinychok_admin',
    TINYCHOK_ANALYTICS_ENABLED: 'true',
    TINYCHOK_ANALYTICS_PROVIDER: 'clickhouse',
  })

  assert.equal(config.analytics.provider, 'clickhouse')
  assert.equal(config.analytics.clickhouse.url, 'https://rc1b-example.mdb.yandexcloud.net:8443')
  assert.equal(config.analytics.clickhouse.database, 'tinychok_analytics')
  assert.equal(config.analytics.clickhouse.table, 'analytics_events')
  assert.equal(config.analytics.clickhouse.timeoutMs, 5000)

  assert.throws(
    () =>
      createRuntimeConfig({
        TINYCHOK_ANALYTICS_ENABLED: 'true',
        TINYCHOK_ANALYTICS_PROVIDER: 'clickhouse',
      }),
    /ClickHouse analytics url обязателен/u,
  )
})

test('clickhouse analytics rows keep stable timestamps, identifiers and serialized properties', () => {
  const row = buildClickHouseAnalyticsRow(
    {
      category: 'messaging',
      identifier: '+79990000001',
      ip: '203.0.113.10',
      name: 'direct_message_send_succeeded',
      occurredAt: '2026-04-14T10:11:12.345Z',
      properties: {
        anonymousId: 'anon-1',
        attachmentKind: 'image',
        hasReply: true,
      },
      source: 'web',
      userAgent: 'Mozilla/5.0',
    },
    'staging',
    new Date('2026-04-14T10:12:13.456Z'),
  )

  assert.deepEqual(row, {
    anonymous_id: 'anon-1',
    environment: 'staging',
    event_category: 'messaging',
    event_name: 'direct_message_send_succeeded',
    identifier: '+79990000001',
    ingested_at: '2026-04-14 10:12:13.456',
    ip: '203.0.113.10',
    occurred_at: '2026-04-14 10:11:12.345',
    properties_json: '{"anonymousId":"anon-1","attachmentKind":"image","hasReply":true}',
    source: 'web',
    user_agent: 'Mozilla/5.0',
  })

  assert.equal(
    serializeClickHouseAnalyticsRows([row]),
    `${JSON.stringify(row)}\n`,
  )
  assert.equal(formatClickHouseDateTime('2026-04-14T00:00:00.000Z'), '2026-04-14 00:00:00.000')
})

test('clickhouse analytics insert url validates table identifiers before building query string', () => {
  const url = buildClickHouseAnalyticsInsertUrl('https://example.com:8443', {
    database: 'tinychok_analytics',
    table: 'analytics_events',
  })

  assert.match(url, /INSERT\+INTO\+tinychok_analytics\.analytics_events\+FORMAT\+JSONEachRow/u)

  assert.throws(
    () =>
      buildClickHouseAnalyticsInsertUrl('https://example.com:8443', {
        database: 'tinychok-analytics',
        table: 'analytics_events',
      }),
    /ClickHouse analytics database/u,
  )
})
