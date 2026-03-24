# Observability And Captcha

Короткий runbook по текущей инфраструктуре runtime config, аналитики, доставки и captcha.

## Runtime Config

- backend отдаёт публичный runtime config через `GET /api/client-config`
- frontend читает этот config до auth и main flow
- через runtime config клиент узнаёт:
  - состояние captcha
  - публичный `siteKey`
  - состояние analytics

## Delivery And Sync Invariants

- direct / group / thread send-path опираются на `clientDeliveryId`
- timeline data должны оставаться `server-authoritative`
- stale client snapshot не должен восстанавливать удалённые сообщения, посты и комментарии
- delete и retry path должны считаться частью transport layer, а не только UI-логикой

## Captcha Layer

### Current Behavior

- если `TINYCHOK_CAPTCHA_PROVIDER=disabled`, auth flow работает без captcha
- если включить `turnstile`, backend начинает требовать `captchaToken` на:
  - `POST /api/auth/request-code`
  - `POST /api/auth/verify-code`
  - `POST /api/auth/register`

### Required Backend Env

```env
TINYCHOK_CAPTCHA_PROVIDER=disabled
TINYCHOK_CAPTCHA_SITE_KEY=
TINYCHOK_CAPTCHA_SECRET_KEY=
TINYCHOK_CAPTCHA_VERIFY_URL=https://challenges.cloudflare.com/turnstile/v0/siteverify
```

### What Is Still Needed Before Enabling Captcha

- реальный frontend widget / adapter
- автоматический проброс token в auth flow
- понятный UX на refresh / expiry token
- отдельный smoke-test для полного auth flow при включённой captcha

## Analytics Layer

### Current Behavior

- есть shared event catalog
- есть единый ingest endpoint `POST /api/analytics/events`
- frontend analytics работает только при consent `analytics`
- client queue собирает события в пакеты и повторно ставит их в очередь, если ingest ответил `non-2xx` или не ответил совсем
- текущий sink на backend: `log`

### Analytics Env

```env
TINYCHOK_ANALYTICS_ENABLED=false
TINYCHOK_ANALYTICS_PROVIDER=disabled
TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS=5000
TINYCHOK_ANALYTICS_MAX_BATCH_SIZE=20
```

### Existing Event Groups

- auth
- direct message send / retry
- group message send / retry
- channel post send
- thread comment send
- realtime connected / disconnected / error
- consent and selected product actions

### Recommended Next Events

Messaging and sync:

- `thread_comment_retry_started`
- `thread_comment_retry_failed`
- `message_delivery_confirmed_late`
- `message_delivery_duplicate_detected`
- `history_initial_window_loaded`
- `history_page_loaded`
- `delete_request_fell_back_to_post`
- `delete_request_failed_after_fallback`

Growth and activation:

- `thread_opened`
- `channel_invite_sent`
- `channel_subscriber_removed`
- `channel_subscriber_blacklisted`
- `emoji_picker_opened`
- `emoji_inserted`
- `photo_attachment_selected`
- `photo_attachment_processing_failed`
- `photo_upload_failed`
- `image_viewer_opened`

## What Must Happen Before Production-Ready Rollout

- analytics нужен не только `log` sink, а нормальный ingestion target
- captcha нельзя включать на staging или production без frontend widget-а
- transport metrics должны покрывать retries, fallback path и delete consistency
