# Observability And Captcha

Короткий технический runbook по текущей инфраструктуре аналитики, доставки и captcha по состоянию на последний уже запушенный candidate `80346d7` и текущий локальный photo / attachment batch поверх него.

## Что уже подготовлено

- backend отдаёт публичный runtime config через `GET /api/client-config`
- frontend читает этот config до auth / main flow
- auth request bodies умеют нести `captchaToken`
- backend auth endpoints умеют вызывать server-side captcha verification
- analytics events получили общий shared catalog и единый ingest endpoint
- frontend analytics работает только при consent `analytics`
- отправка direct / group / thread messages опирается на `clientDeliveryId` для точной корреляции с backend snapshot
- timeline data в snapshot sync должны считаться server-authoritative и не должны восстанавливаться из stale client state

## Что не меняет текущий локальный batch

Текущий локальный batch не меняет captcha semantics напрямую, но добавляет новые UI-surface area, которые позже стоит покрыть событиями:

- history lazy loading
- emoji picker
- channel subscriber management
- channel invitation flow
- photo attachment compose preview
- premium toggle `Отправить без сжатия`
- image upload validation / processing
- fullscreen image viewer

## Новые backend env vars

Captcha:

```env
TINYCHOK_CAPTCHA_PROVIDER=disabled
TINYCHOK_CAPTCHA_SITE_KEY=
TINYCHOK_CAPTCHA_SECRET_KEY=
TINYCHOK_CAPTCHA_VERIFY_URL=https://challenges.cloudflare.com/turnstile/v0/siteverify
```

Analytics:

```env
TINYCHOK_ANALYTICS_ENABLED=false
TINYCHOK_ANALYTICS_PROVIDER=disabled
TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS=5000
TINYCHOK_ANALYTICS_MAX_BATCH_SIZE=20
```

## Что умеет captcha layer сейчас

- если `TINYCHOK_CAPTCHA_PROVIDER=disabled`, auth flow работает как сейчас
- если включить `turnstile`, backend начнёт требовать `captchaToken` на:
  - `POST /api/auth/request-code`
  - `POST /api/auth/verify-code`
  - `POST /api/auth/register`
- публичный `siteKey` и флаг включения доступны через `/api/client-config`

## Что ещё нужно для полного включения captcha

- добавить реальный frontend widget / adapter для Turnstile
- пробросить полученный token в auth screen без ручного вмешательства
- решить UX на refresh / expiry captcha token
- добавить smoke-test сценарий `request-code -> verify -> register` при включённой captcha

## Что умеет analytics layer сейчас

- shared event catalog в коде
- client queue с batching и consent gating
- client queue повторно ставит batch в очередь, если ingest ответил `non-2xx` или не ответил совсем
- server ingest `POST /api/analytics/events`
- текущий sink: `log`
- auth header для analytics-запроса используется, если у клиента уже есть session token

## Какие события уже есть

- `analytics_consent_granted`
- `auth_code_request_succeeded`
- `auth_code_request_failed`
- `auth_code_verify_succeeded`
- `auth_code_verify_failed`
- `auth_registration_succeeded`
- `auth_registration_failed`
- `direct_message_send_succeeded`
- `direct_message_send_failed`
- `direct_message_retry_started`
- `direct_message_retry_failed`
- `group_message_send_succeeded`
- `group_message_send_failed`
- `group_message_retry_started`
- `group_message_retry_failed`
- `channel_post_send_succeeded`
- `channel_post_send_failed`
- `thread_comment_send_succeeded`
- `thread_comment_send_failed`
- `realtime_connected`
- `realtime_disconnected`
- `realtime_error`
- `group_settings_saved`
- `blacklist_add_confirmed`

## Какие события стоит добавить следующим этапом

Messaging and delivery:

- `thread_comment_retry_started`
- `thread_comment_retry_failed`
- `message_delivery_confirmed_late`
- `message_delivery_duplicate_detected`
- `history_initial_window_loaded`
- `history_page_loaded`
- `delete_request_fell_back_to_post`
- `delete_request_failed_after_fallback`

Realtime and sync:

- `bootstrap_loaded`
- `bootstrap_failed`
- `snapshot_merge_duration`
- `realtime_reconnect_started`
- `realtime_reconnect_succeeded`

Growth and activation:

- `group_created`
- `channel_created`
- `channel_joined`
- `thread_opened`
- `channel_invite_sent`
- `channel_subscriber_removed`
- `channel_subscriber_blacklisted`
- `emoji_picker_opened`
- `emoji_inserted`
- `photo_attachment_selected`
- `photo_attachment_processing_succeeded`
- `photo_attachment_processing_failed`
- `photo_attachment_removed`
- `photo_send_original_toggled`
- `photo_send_original_paywall_opened`
- `photo_upload_succeeded`
- `photo_upload_failed`
- `image_viewer_opened`

## Что важно для мессенджера прямо сейчас

- `clientDeliveryId` должен считаться обязательной опорой для future send-path work
- эвристическую дедупликацию по тексту и времени нужно считать только fallback-механикой
- перед production-ready rollout аналитики нужен не `log` sink, а нормальный ingestion target
- перед включением captcha на staging нужен frontend widget, иначе auth будет блокироваться backend-ом
