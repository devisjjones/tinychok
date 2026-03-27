# Analytics Instrumentation

Подробная схема текущей аналитики Tinychok по состоянию на `2026-03-27`.

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
- `auth_registration_succeeded`
- `auth_registration_failed`

### Messaging

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

### Realtime

- `realtime_connected`
- `realtime_disconnected`
- `realtime_error`

### Settings

- `profile_settings_saved`
- `group_settings_saved`
- `channel_settings_saved`

### Media

- `gif_uploaded`
- `gif_deleted`
- `gif_search_used`
- `gif_added_from_viewer`
- `photo_attachment_selected`
- `photo_upload_failed`
- `image_viewer_opened`

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

### Entity Creation

- `group_created`
- `channel_created`

### Moderation / Support

- `blacklist_add_confirmed`
- `auth_support_email_clicked`

## Important Event Properties

### Messaging Send Events

Для messaging send events важно передавать не только success/fail, но и shape payload:

- `hasAttachment`
- `hasReply`
- `attachmentKind`

`attachmentKind` нормализуется так:

- `none`
- `gif`
- `image`
- `file`

Это позволяет в Метрике не плодить отдельные event names вроде `gif_sent_in_direct`, а резать отчёты по свойствам.

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

### Photo / Viewer Events

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
- `image_viewer_opened`
  - `mimeType`
  - `size`
  - `isGif`
  - `allowDownload`

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

### Group / Channel Creation

- `group_created`
  - `memberCount`
  - `hasAvatar`
  - `threadsMode`
- `channel_created`
  - `hasAvatar`
  - `threadsMode`
  - `visibility`

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

На staging goals уже заведены вручную в интерфейсе Яндекс Метрики. Для production тот же список нужно создать отдельно в production counter: цели не копируются автоматически между счётчиками.

## Privacy Rules

В аналитику нельзя отправлять:

- текст сообщений
- SMS code
- полный телефон
- email пользователя
- содержимое жалоб
- internal notes из админки
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

- `thread_comment_retry_started`
- `thread_comment_retry_failed`
- `premium_gift_started`
- `premium_gift_succeeded`
- `group_invite_sent`
- `channel_invite_sent`
- `channel_avatar_update_post_published`
- `support_email_clicked` не только на auth, но и из других entry points
