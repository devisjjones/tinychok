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
- если включить `smartcaptcha` или `turnstile`, backend требует `captchaToken` только на `POST /api/auth/request-code`
- `verify-code` и `register` captcha больше не требуют
- admin staff login использует тот же `POST /api/auth/request-code`, поэтому captcha защищает и обычный login, и admin login

### Required Backend Env

```env
TINYCHOK_CAPTCHA_PROVIDER=disabled
TINYCHOK_CAPTCHA_SITE_KEY=
TINYCHOK_CAPTCHA_SECRET_KEY=
TINYCHOK_CAPTCHA_VERIFY_URL=
```

### SmartCaptcha Runtime

- `TINYCHOK_CAPTCHA_PROVIDER=smartcaptcha`
- `TINYCHOK_CAPTCHA_VERIFY_URL` по умолчанию резолвится в `https://smartcaptcha.cloud.yandex.ru/validate`
- user auth показывает обычный видимый SmartCaptcha widget только на шаге ввода телефона
- admin auth показывает отдельный видимый SmartCaptcha widget только на шаге ввода staff-телефона
- токен SmartCaptcha одноразовый и живёт ограниченное время, поэтому после `request-code` виджет сбрасывается
- если challenge не нужен, SmartCaptcha может пропустить пользователя после простой галочки; это нормальная risk-based логика провайдера, а не баг интеграции

### What Is Still Needed Before Enabling Captcha

- периодический smoke-test для:
  - обычного login на staging
  - admin login на staging
  - сценария без прохождения captcha до `request-code`

## Analytics Layer

Подробная схема событий и pageview описана отдельно в [docs/analytics-instrumentation.md](/Users/devisjones/Documents/New%20project/tinychok/docs/analytics-instrumentation.md).

### Current Behavior

- есть shared event catalog
- есть единый ingest endpoint `POST /api/analytics/events`
- frontend analytics работает только при consent `analytics`
- client queue собирает события в пакеты и повторно ставит их в очередь, если ingest ответил `non-2xx` или не ответил совсем
- текущий sink на backend: `log`
- `Yandex Metrica` поднимается отдельным client-side runtime слоем через counter id из `GET /api/client-config`
- staging counter id живёт в env:

```env
TINYCHOK_YANDEX_METRICA_COUNTER_ID=
```

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
- browser notification prompt / enable flow

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
- `gif_uploaded`
- `gif_deleted`
- `gif_search_used`
- `gif_added_from_viewer`
- `auth_support_email_clicked`
- `profile_settings_saved`
- `channel_settings_saved`
- `auth_captcha_completed`
- `browser_notifications_enabled`
- `browser_notifications_disabled`
- `browser_notifications_prompt_dismissed`

## What Must Happen Before Production-Ready Rollout

- analytics нужен не только `log` sink, а нормальный ingestion target
- captcha нельзя включать на staging или production без рабочего frontend widget-а
- support footer на auth-экране должен оставаться видимым, чтобы пользователь мог написать на `tinychok.help@yandex.com`, если login сломан
- transport metrics должны покрывать retries, fallback path и delete consistency
