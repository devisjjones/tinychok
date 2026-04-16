# Analytics Instrumentation

Подробная схема текущей аналитики Tinychok по состоянию на `2026-04-16`.

## Runtime Model

- на frontend есть два параллельных слоя аналитики:
  - внутренний event batch `POST /api/analytics/events`
  - `Yandex Metrica` для pageview и goals
- оба слоя подчиняются cookie consent:
  - без выбора `analytics` product analytics не отправляются
- `Yandex Metrica` counter id приходит с backend через `GET /api/client-config`
- staging counter сейчас включается через env:

```env
TINYCHOK_YANDEX_METRICA_COUNTER_ID=
```

- клиент не хардкодит код счётчика в HTML, а поднимает `mc.yandex.ru/metrika/tag.js` runtime-ом
- для быстрой runtime-проверки можно включить debug-лог:
  - открыть сайт с `?analytics_debug=1`
  - после этого Tinychok сохранит флаг в `localStorage` и начнёт писать в console:
    - `pageview`
    - `event`
    - `internal-batch-sent`
    - `internal-batch-requeued`
  - выключение: `?analytics_debug=0`
- для ClickHouse / DataLens product-открытие приложения считается отдельным event `app_opened`
  - он отправляется один раз на открытие авторизованного Tinychok
  - это отдельный слой от Metrica pageview, чтобы можно было честно резать открытия по `deviceType`

## SPA Tracking

- Tinychok считается `SPA`, поэтому pageview не должен ограничиваться первым HTML-load
- virtual pageviews отправляются через `ym(counterId, 'hit', virtualPath, { title })`
- pageview должен пересчитываться, когда меняются:
  - auth step
  - активный direct dialog
  - активная группа
  - активный subscription channel
  - stage view
  - settings view
  - channels view
  - top list view
  - runtime готовность Metriка counter id
  - analytics consent

### Current Virtual Routes

- `/auth/phone`
- `/auth/password`
- `/auth/code`
- `/auth/profile-password`
- `/auth/password-setup`
- `/auth/password-reset`
- `/dialogs`
- `/dialogs/:chatId`
- `/groups`
- `/groups/:groupId`
- `/feed/channels`
- `/feed/channels/:channelId`
- `/threads`
- `/settings/profile`
- `/settings/management`
- `/settings/blocked`
- `/premium`
- `/channels`
- `/channels/create`
- `/channels/manage/:channelId`

## Event Catalog

### Consent

- `analytics_consent_granted`

### Navigation

- `app_opened`

### Auth

- `auth_captcha_completed`
- `auth_code_request_succeeded`
- `auth_code_request_failed`
- `auth_code_verify_succeeded`
- `auth_code_verify_failed`
- `auth_password_prompt_shown`
- `auth_password_login_requested`
- `auth_password_login_succeeded`
- `auth_password_login_failed`
- `auth_password_login_captcha_required`
- `auth_password_login_captcha_completed`
- `auth_password_login_rate_limited`
- `auth_password_login_blocked`
- `auth_password_forgot_started`
- `auth_password_reset_code_requested`
- `auth_password_reset_code_verified`
- `auth_password_set_succeeded`
- `auth_password_set_failed`
- `auth_password_reset_succeeded`
- `auth_password_reset_failed`
- `auth_password_change_requested`
- `auth_password_change_succeeded`
- `auth_password_change_failed`
- `account_deletion_requested`
- `account_deletion_succeeded`
- `account_deletion_failed`
- `auth_registration_succeeded`
- `auth_registration_failed`

### Messaging

- `direct_message_send_succeeded`
- `direct_message_send_failed`
- `direct_message_deleted_me`
- `direct_message_deleted_everyone`
- `group_message_send_succeeded`
- `group_message_send_failed`
- `group_message_deleted`
- `channel_post_send_succeeded`
- `channel_post_send_failed`
- `channel_post_deleted`
- `thread_comment_send_succeeded`
- `thread_comment_send_failed`
- `thread_comment_deleted`

### Threads / Support

- `thread_inbox_opened`
- `thread_opened`
- `support_ticket_created`
- `support_ticket_reply_sent`
- `support_ticket_resolved`

### Settings

- `profile_settings_saved`
- `group_settings_saved`
- `channel_settings_saved`
- `theme_switched`
- `quiet_settings_opened`
- `quiet_settings_changed`
- `quiet_settings_locked_interaction`
- `quiet_mode_enabled`
- `quiet_mode_disabled`
- `forced_invisible_mode_enabled`
- `forced_invisible_mode_disabled`
- `storage_manager_opened`
- `storage_file_deleted`

### Media

- `gif_uploaded`
- `gif_deleted`
- `gif_search_used`
- `gif_added_from_viewer`
- `photo_attachment_selected`
- `photo_upload_failed`
- `video_attachment_selected`
- `video_upload_failed`
- `file_attachment_selected`
- `file_upload_failed`
- `video_note_record_started`
- `video_note_send_succeeded`
- `video_note_send_failed`
- `image_viewer_opened`
- `video_viewer_opened`
- `video_note_viewer_opened`

### Search

- `search_screen_opened`
- `contact_search_used`
- `contact_search_result_opened`
- `channel_search_used`
- `channel_search_result_opened`
- `search_empty_result_shown`

### Notifications

- `browser_notifications_enabled`
- `browser_notifications_disabled`
- `browser_notifications_prompt_dismissed`

### Premium

- `premium_screen_opened`
- `premium_purchase_started`
- `premium_purchase_started_month`
- `premium_purchase_started_year`
- `premium_purchase_succeeded`
- `premium_purchase_succeeded_month`
- `premium_purchase_succeeded_year`
- `premium_purchase_failed`
- `premium_purchase_failed_month`
- `premium_purchase_failed_year`

### Billing / Refunds

- `refund_processed`

### Entity Creation

- `group_created`
- `group_create_failed`
- `group_deleted`
- `channel_created`
- `channel_create_failed`
- `channel_deleted`

### Moderation / Support

- `blacklist_add_confirmed`
- `auth_support_email_clicked`

### Legal

- `legal_page_opened`
- `legal_pdf_opened`

## Important Event Properties

### Messaging Send Events

Для messaging send events важно передавать не только success/fail, но и shape payload:

- `hasAttachment`
- `hasReply`
- `attachmentKind`
- `presentation`

`attachmentKind` нормализуется так:

- `none`
- `gif`
- `image`
- `video`
- `file`

`presentation` сейчас нормализуется так:

- `regular`
- `video-note`

Обычные success-события по фото / видео / файлам не плодят отдельные event names. Они по-прежнему считаются через существующие send events (`direct_message_send_succeeded`, `group_message_send_succeeded`, `channel_post_send_succeeded`, `thread_comment_send_succeeded`) и режутся по `attachmentKind` + `presentation`.

### App Open Events

- `app_opened`
  - `deviceType`
  - `path`
  - `surface`

`deviceType` для `app_opened` сейчас нормализуется так:

- `mobile`
- `desktop`

### Auth Events

- `auth_code_request_succeeded`
  - `captchaRequired`
  - `existingAccount`
  - `flow`
  - `hasPassword`
- `auth_code_request_failed`
  - `captchaRequired`
  - `flow`
  - `reason`
- `auth_code_verify_succeeded`
  - `flow`
  - `outcome`
- `auth_code_verify_failed`
  - `blocked`
  - `flow`
  - `reason`
- `auth_captcha_completed`
  - `provider`
- `auth_password_prompt_shown`
  - `existingAccount`
  - `hasPassword`
- `auth_password_login_failed`
  - `reason`
- `auth_password_login_captcha_required`
  - `reason`
- `auth_password_login_captcha_completed`
  - `provider`
- `auth_password_login_rate_limited`
  - `reason`
- `auth_password_login_blocked`
  - `reason`
- `auth_password_set_failed`
  - `reason`
- `auth_password_set_succeeded`
  - `revokedPreviousSessions`
- `auth_password_reset_failed`
  - `reason`
- `auth_password_reset_succeeded`
  - `revokedPreviousSessions`
- `auth_password_change_failed`
  - `message`
- `auth_password_change_succeeded`
  - `revokedPreviousSessions`
- `account_deletion_requested`
  - `deleteDataToo`
  - `source`
- `account_deletion_succeeded`
  - `archivedGroupsCount`
  - `archivedOwnedChannelsCount`
  - `deleteDataToo`
  - `source`
  - `transferredGroupsCount`
- `account_deletion_failed`
  - `deleteDataToo`
  - `message`
  - `source`

### Password Auth Funnel

- повторный вход:
  - `auth_password_prompt_shown`
  - `auth_password_login_requested`
  - после 3-й неверной попытки:
    - `auth_password_login_captcha_required`
    - `auth_password_login_captcha_completed`
  - `auth_password_login_succeeded`
  - fallback/abuse guard:
    - `auth_password_login_rate_limited`
    - `auth_password_login_blocked`
- forgot-password:
  - `auth_password_forgot_started`
  - `auth_captcha_completed`
  - `auth_password_reset_code_requested`
  - `auth_password_reset_code_verified`
  - `auth_password_reset_succeeded`
  - этот путь теперь всегда проходит через шаг `phone` с обязательной SmartCaptcha до запроса reset SMS
- legacy migration на пароль:
  - `auth_code_request_succeeded(flow=legacy-password-setup)`
  - `auth_code_verify_succeeded(flow=legacy-password-setup)`
  - `auth_password_set_succeeded`
- смена пароля в настройках:
  - `auth_password_change_requested`
  - `auth_password_change_succeeded`
  - `auth_password_change_failed`
- self-service удаление аккаунта:
  - `account_deletion_requested`
  - `account_deletion_succeeded`
  - `account_deletion_failed`
  - success event дополнительно показывает, сколько owned channels архивировалось и сколько групп было передано или архивировано

### Password Security Notes

- password-login режется server-side lockout по связке `identifier + ip`
- после `3` неверных паролей подряд login по этому `identifier + ip` начинает требовать SmartCaptcha до следующей попытки
- эскалация блокировки:
  - `5` ошибок подряд -> `5 минут`
  - ещё `5` -> `30 минут`
  - ещё `5` -> `24 часа`
- success password login сбрасывает счётчик попыток для этой связки
- `auth_password_login_rate_limited` приходит на момент, когда порог впервые срабатывает
- `auth_password_login_blocked` приходит, если пользователь повторно стучится в уже активный блок
- после `auth_password_set_succeeded` и `auth_password_reset_succeeded` сервер отзывает все старые bearer sessions и оставляет только одну новую актуальную сессию

### GIF Events

- `gif_uploaded`
  - `fileName`
  - `size`
  - `source`
- `gif_deleted`
  - `fileName`
  - `source`
- `gif_search_used`
  - `queryLength`
  - `source`
- `gif_added_from_viewer`
  - `fileName`
  - `source`

`source` сейчас показывает, где произошёл action:

- `local`
- `server`
- `upload`

### Media / Viewer Events

- `photo_attachment_selected`
  - `surface`
  - `mimeType`
  - `fileSize`
  - `sendOriginalPreferred`
- `photo_upload_failed`
  - `surface`
  - `mimeType`
  - `fileSize`
  - `reason`
- `video_attachment_selected`
  - `surface`
  - `mimeType`
  - `fileSize`
- `video_upload_failed`
  - `surface`
  - `mimeType`
  - `fileSize`
  - `reason`
- `file_attachment_selected`
  - `surface`
  - `fileKind`
  - `fileSize`
- `file_upload_failed`
  - `surface`
  - `fileKind`
  - `fileSize`
  - `reason`
- `video_note_record_started`
  - `roomKind`
  - `source`
- `video_note_send_succeeded`
  - `durationBucket`
  - `roomKind`
  - `source`
- `video_note_send_failed`
  - `durationBucket`
  - `roomKind`
  - `source`
  - `reason`
- `image_viewer_opened`
  - `mimeType`
  - `size`
  - `isGif`
  - `allowDownload`
- `video_viewer_opened`
  - `mimeType`
  - `size`
  - `allowDownload`
  - `roomKind`
  - `source`
- `video_note_viewer_opened`
  - `allowDownload`
  - `roomKind`
  - `source`

### Browser Notifications

- `browser_notifications_enabled`
  - `source`
- `browser_notifications_disabled`
  - `source`

`source`:

- `browser-permission-prompt`
- `settings-toggle`

### Premium Events

- `premium_screen_opened`
  - `gift`
  - `hasPremium`
- `premium_purchase_started`
  - `plan`
  - `gift`
  - `debugAutoCheckout`
- `premium_purchase_started_month`
  - `plan = month`
  - `gift`
  - `debugAutoCheckout`
- `premium_purchase_started_year`
  - `plan = year`
  - `gift`
  - `debugAutoCheckout`
- `premium_purchase_succeeded`
  - `plan`
  - `gift`
  - `debugAutoCheckout`
- `premium_purchase_succeeded_month`
  - `plan = month`
  - `gift`
  - `debugAutoCheckout`
- `premium_purchase_succeeded_year`
  - `plan = year`
  - `gift`
  - `debugAutoCheckout`
- `premium_purchase_failed`
  - `plan`
  - `gift`
  - `debugAutoCheckout`
  - `reason`
- `premium_purchase_failed_month`
  - `plan = month`
  - `gift`
  - `debugAutoCheckout`
  - `reason`
- `premium_purchase_failed_year`
  - `plan = year`
  - `gift`
  - `debugAutoCheckout`
  - `reason`

### Billing Events

- `refund_processed`
  - `actorRole`
  - `refundSource = admin`
  - `refundTargetType = premium`

`refund_processed` отправляется server-side из admin refund action прямо в ClickHouse batch sink. Текстовая причина возврата из админки в analytics не уходит: она остаётся только в admin audit log.

### Group / Channel Creation

- `group_created`
  - `memberCount`
  - `hasAvatar`
  - `threadsMode`
- `group_create_failed`
  - `memberCount`
  - `reason`
- `group_deleted`
  - `deleteMode`
  - `membersCount`
- `channel_created`
  - `hasAvatar`
  - `threadsMode`
  - `visibility`
- `channel_create_failed`
  - `reason`
  - `visibility`
- `channel_deleted`
  - `hadAvatar`
  - `hadSubscribers`
  - `visibility`

### Search / Discovery Events

- `search_screen_opened`
  - `source`
  - `topFilter`
- `contact_search_used`
  - `queryLength`
  - `source`
  - `topFilter`
- `contact_search_result_opened`
  - `resultSource`
  - `source`
  - `topFilter`
- `channel_search_used`
  - `queryLength`
  - `source`
  - `topFilter`
- `channel_search_result_opened`
  - `resultSource`
  - `source`
  - `topFilter`
- `search_empty_result_shown`
  - `queryLength`
  - `source`
  - `topFilter`

`source` для поиска нормализуется так:

- `contacts-tab`
- `chats-tab`
- `search-screen`

`resultSource` нужен, чтобы различать:

- `myContacts`
- `globalResults`
- `discoveryResults`
- `subscribedPreview`
- `managedPreview`

### Quiet / Storage / Thread Events

- `thread_inbox_opened`
  - `source`
- `thread_opened`
  - `roomKind`
  - `attachmentKind`
  - `presentation`
  - `hasAttachment`
  - `hasReply`
- `quiet_settings_opened`
  - `hasPremium`
  - `source`
- `quiet_settings_changed`
  - `enabled`
  - `hasPremium`
  - `settingKey`
- `quiet_settings_locked_interaction`
  - `hasPremium`
  - `settingKey`
  - `source`
- `quiet_mode_enabled` / `quiet_mode_disabled`
  - `hasPremium`
  - `invisibilityEnabledAfterToggle`
  - `source`
- `forced_invisible_mode_enabled` / `forced_invisible_mode_disabled`
  - `source`
- `storage_manager_opened`
  - `source`
- `storage_file_deleted`
  - `fileKind`
  - `sizeBucket`
  - `source`

### Legal Events

- `legal_page_opened`
  - `document`
  - `source`
- `legal_pdf_opened`
  - `document`
  - `format`
  - `source`

Публичные legal-страницы сами поднимают analytics runtime через `GET /api/client-config`. Runtime boundary теперь остаётся explicit: backend provider должен быть явно задан как `log` или `clickhouse`, а live smoke-check обязан сверять его с ожидаемым sink через `scripts/verify-release-runtime.mjs --expected-analytics-provider ...`.

## ClickHouse Sink

- source of truth для ClickHouse schema: `server/sql/yandex-clickhouse-analytics.sql`
- backend пишет batched events в единый table `tinychok_analytics.analytics_events`
- обычные success-события по фото / видео / файлам по-прежнему считаются через existing send events + `attachmentKind`, без отдельного нового event name
- если runtime переводится на `provider=clickhouse`, live env обязан содержать:
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_URL`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_DATABASE`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_TABLE`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_USER`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_PASSWORD`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_TIMEOUT_MS`

## Current DataLens Reporting

- текущий workbook в `DataLens` сейчас собран поверх staging ClickHouse sink и режется по `environment = staging`
- canonical source для продуктовых открытий приложения и device split:
  - `app_opened`
  - `deviceType = mobile|desktop`
- текущие staging-репорты, которые уже настроены поверх ClickHouse / DataLens:
  - открытия приложения по дням с split `mobile` / `desktop`
  - auth breakdown
  - onboarding funnel `код -> регистрация -> пароль -> первое сообщение`
  - D1 / D7 retention
  - messaging / media / search / settings / support category charts
  - premium starts / succeeds по дням
  - premium estimated revenue по `day` / `week` / `month`
  - refunds по `day` / `week` / `month` с split по `refundTargetType`
  - support tickets `created` / `resolved`
- часть чартов живёт прямо на base table `tinychok_analytics.analytics_events`, а часть использует SQL-источники внутри самого workbook:
  - funnel
  - retention
  - premium revenue rollups
- эти SQL-источники сейчас не versioned в репозитории и считаются workbook-side конфигом
- для продуктовых дашбордов нельзя снова брать технические websocket-события подключения, разрыва и ошибок realtime
- они intentionally исключены из текущего product catalog и не должны занимать top slots в DataLens
- day-level business charts лучше строить по derived local date, а не по raw UTC timestamp:
  - `occurred_at` в ClickHouse хранится в `UTC`
  - для продуктового среза по дням важнее локальный московский день
- если chart внезапно пустой:
  - сначала проверить, что событие уже доехало в ClickHouse / WebSQL
  - потом обновить preview / dataset fields в DataLens
  - для retention пустой график в тот же день — нормален: `D1` появляется только после next-day возврата, `D7` только после `7+` дней
- premium revenue charts на staging сейчас считаются оценочными, а не бухгалтерским source-of-truth:
  - frontend premium checkout всё ещё не подключён к реальному payment provider
  - success-события могут приходить из `debugAutoCheckout`
  - текущие цены в коде: `199 ₽ / month` и `1390 ₽ / year`
- production cutover для текущих charts ожидается без полной пересборки логики:
  - дублировать dataset/chart
  - поменять фильтр `environment` на `production`
  - перепроверить реальные billing-события уже на production-трафике

### Refund Dataset SQL

Для DataLens refunds-дашборда достаточно SQL-источника поверх `tinychok_analytics.analytics_events`:

```sql
WITH refunds AS (
  SELECT
    toTimeZone(occurred_at, 'Europe/Moscow') AS occurred_at_msk,
    coalesce(JSONExtractString(properties_json, 'refundTargetType'), 'unknown') AS refund_target_type
  FROM tinychok_analytics.analytics_events
  WHERE environment = 'staging'
    AND event_name = 'refund_processed'
)
SELECT
  'day' AS period_grain,
  toDate(occurred_at_msk) AS period_start,
  refund_target_type,
  count() AS refund_events
FROM refunds
GROUP BY period_start, refund_target_type

UNION ALL

SELECT
  'week' AS period_grain,
  toStartOfWeek(occurred_at_msk, 1) AS period_start,
  refund_target_type,
  count() AS refund_events
FROM refunds
GROUP BY period_start, refund_target_type

UNION ALL

SELECT
  'month' AS period_grain,
  toStartOfMonth(occurred_at_msk) AS period_start,
  refund_target_type,
  count() AS refund_events
FROM refunds
GROUP BY period_start, refund_target_type

ORDER BY period_grain, period_start, refund_target_type
```

Рекомендация по графикам в DataLens:

- сделать один SQL dataset из запроса выше
- `X` = `period_start`
- `Y` = `refund_events`
- `Color` = `refund_target_type`
- либо повесить dataset filter `period_grain`, либо продублировать chart в три версии: `day`, `week`, `month`
- возвраты товаров потом попадут в тот же график новым цветом через другой `refundTargetType`, без смены схемы dataset

## Yandex Metrica Goals

В интерфейсе Метрики goals лучше заводить с теми же именами, что и event names:

- `auth_captcha_completed`
- `auth_code_request_succeeded`
- `auth_code_request_failed`
- `auth_code_verify_succeeded`
- `auth_code_verify_failed`
- `auth_password_prompt_shown`
- `auth_password_login_requested`
- `auth_password_login_succeeded`
- `auth_password_login_failed`
- `auth_password_forgot_started`
- `auth_password_reset_code_requested`
- `auth_password_reset_code_verified`
- `auth_password_set_succeeded`
- `auth_password_set_failed`
- `auth_password_reset_succeeded`
- `auth_password_reset_failed`
- `auth_registration_succeeded`
- `auth_registration_failed`
- `direct_message_send_succeeded`
- `direct_message_send_failed`
- `group_message_send_succeeded`
- `group_message_send_failed`
- `channel_post_send_succeeded`
- `channel_post_send_failed`
- `thread_comment_send_succeeded`
- `thread_comment_send_failed`
- `profile_settings_saved`
- `group_settings_saved`
- `channel_settings_saved`
- `gif_uploaded`
- `gif_deleted`
- `gif_search_used`
- `gif_added_from_viewer`
- `photo_attachment_selected`
- `photo_upload_failed`
- `image_viewer_opened`
- `browser_notifications_enabled`
- `browser_notifications_disabled`
- `browser_notifications_prompt_dismissed`
- `auth_support_email_clicked`
- `premium_screen_opened`
- `premium_purchase_started`
- `premium_purchase_started_month`
- `premium_purchase_started_year`
- `premium_purchase_succeeded`
- `premium_purchase_succeeded_month`
- `premium_purchase_succeeded_year`
- `premium_purchase_failed`
- `premium_purchase_failed_month`
- `premium_purchase_failed_year`
- `group_created`
- `channel_created`
- `group_create_failed`
- `group_deleted`
- `channel_create_failed`
- `channel_deleted`
- `support_ticket_created`
- `support_ticket_reply_sent`
- `support_ticket_resolved`
- `thread_inbox_opened`
- `thread_opened`
- `direct_message_deleted_me`
- `direct_message_deleted_everyone`
- `group_message_deleted`
- `channel_post_deleted`
- `thread_comment_deleted`
- `theme_switched`
- `quiet_settings_opened`
- `quiet_settings_changed`
- `quiet_settings_locked_interaction`
- `quiet_mode_enabled`
- `quiet_mode_disabled`
- `forced_invisible_mode_enabled`
- `forced_invisible_mode_disabled`
- `storage_manager_opened`
- `storage_file_deleted`
- `video_attachment_selected`
- `video_upload_failed`
- `file_attachment_selected`
- `file_upload_failed`
- `video_note_record_started`
- `video_note_send_succeeded`
- `video_note_send_failed`
- `video_viewer_opened`
- `video_note_viewer_opened`
- `search_screen_opened`
- `contact_search_used`
- `contact_search_result_opened`
- `channel_search_used`
- `channel_search_result_opened`
- `search_empty_result_shown`
- `legal_page_opened`
- `legal_pdf_opened`

На staging goals уже заведены вручную в интерфейсе Яндекс Метрики. Для production тот же список нужно создать отдельно в production counter: цели не копируются автоматически между счётчиками.

`refund_processed` не нужно заводить как Metrica goal: это server-side admin/billing событие для ClickHouse / DataLens, а не публичная web-goal метрика.

## Privacy Rules

В аналитику нельзя отправлять:

- текст сообщений
- SMS code
- полный телефон
- email пользователя
- содержимое жалоб
- internal notes из админки
- текстовую причину возврата из админки
- содержимое каналов, групп и тредов

Допустимо отправлять:

- булевы флаги
- тип action
- факт успеха / ошибки
- тип вложения
- длину запроса без самого текста
- product entity id, если он нужен для технической диагностики на staging

## Staging Policy

- staging и production должны жить на разных counter id
- staging нужен для smoke analytics и не должен загрязнять production dashboard
- staging DataLens dashboard тоже считается smoke/reporting surface, а не production source-of-truth
- переход на production reporting ожидается через отдельные production-filtered charts / datasets, а не через смешивание `staging` и `production` в одном графике
- если на staging данные не приходят, сначала проверить:
  - выбран ли период `Сегодня`, а не `Вчера`
  - принят ли analytics consent
  - отдал ли `/api/client-config` корректный `metricaCounterId`
  - загружается ли `mc.yandex.ru/metrika/tag.js`
  - не блокирует ли браузер внешние tracking requests
  - открыт ли debug-режим `?analytics_debug=1`, чтобы увидеть локальный dispatch в console до того, как Метрика дорисует цель в UI

## Google Sheet Sync

Технический лист аналитики для Tinychok должен содержать минимум такие колонки:

- `event_name`
- `category`
- `status`
- `trigger`
- `properties`
- `metrica_goal`
- `implemented_in`
- `notes`

`status` сейчас должен разделять:

- `implemented`
- `planned`

## Next Expansion

Следующий слой после текущего:

- `premium_gift_started`
- `premium_gift_succeeded`
- `group_invite_sent`
- `channel_invite_sent`
- `channel_avatar_update_post_published`
- `support_email_clicked` не только на auth, но и из других entry points
