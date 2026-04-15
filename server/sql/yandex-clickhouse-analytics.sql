CREATE DATABASE IF NOT EXISTS tinychok_analytics;

CREATE TABLE IF NOT EXISTS tinychok_analytics.analytics_events (
  occurred_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC'),
  environment LowCardinality(String),
  event_name LowCardinality(String),
  event_category LowCardinality(String),
  source LowCardinality(String),
  identifier Nullable(String),
  anonymous_id Nullable(String),
  ip Nullable(String),
  user_agent Nullable(String),
  properties_json String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (environment, event_name, occurred_at, ifNull(anonymous_id, ''), ifNull(identifier, ''));
