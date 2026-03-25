# Next Branch Handoff

Короткая техническая точка входа для следующего треда или новой ветки. Документ описывает только текущее устройство системы и рабочие инварианты, без истории коммитов и списков прошлых правок.

## Runtime Topology

- staging frontend: `https://staging.tinychok.ru`
- staging admin frontend: `https://admin.staging.tinychok.ru`
- staging backend API: `https://api.staging.tinychok.ru`
- realtime websocket: `wss://api.staging.tinychok.ru/ws`
- staging живёт на отдельной VM `tinychok-staging-1`
- user frontend, admin frontend и backend деплоятся независимо, но должны использовать один и тот же staging backend и staging state store

## Core Product Mechanics

### Session and Snapshot Model

- клиент поднимается через bootstrap snapshot
- realtime обновления приходят по websocket и синхронизируют текущее состояние клиента
- timeline data считаются `server-authoritative`
- клиентский `saveSnapshot` не должен воскрешать удалённые сообщения, посты или комментарии из устаревшего local state

### History Window

- direct / group / channel при входе не тянут всю историю сразу
- стартовое окно строится по правилу:
  - сначала сообщения за сегодня и вчера
  - если их мало, окно добирается назад до минимального полезного объёма
- при прокрутке вверх история догружается отдельными backend endpoint-ами
- в лентах есть day divider, который показывает полную дату с годом

### Threads

- у сообщений и постов могут быть треды
- у пользователя есть отдельный inbox тредов
- в inbox попадают треды, где пользователь:
  - уже писал комментарий
  - либо явно подписался на тред
- новые ответы в подписанных тредах дают unread-индикаторы
- в самом треде доступны `Подписаться` / `Отписаться`
- автоподписка происходит после отправки комментария

### Reply Flow

- reply поддержан в личках, группах, каналах и тредах
- превью сообщения, на которое отвечают, рендерится отдельным верхним блоком
- этот блок кликабелен и прокручивает ленту к исходному сообщению
- при выборе `Ответить` composer получает фокус сразу

### Media and Attachments

- attach modal разделяет:
  - `Приложить фотографию`
  - `Приложить файл`
- GIF идут отдельной premium-вкладкой в emoji picker
- фото в composer сначала живут локально как draft preview
- upload делается только в send-path
- фото пережимаются на клиенте перед отправкой
- для premium доступен режим отправки оригинала без сжатия
- в ленте фото и GIF открываются через fullscreen viewer

### Avatar Pipeline

- один и тот же avatar pipeline используется для:
  - профиля
  - канала
  - группы
- поддерживаются `JPG`, `PNG`, `WebP`
- изображение автоматически:
  - режется в квадрат по центру
  - уменьшается до нормального размера
  - пережимается перед upload
- пользователь видит preview уже обработанного результата до сохранения

### GIF Library

- GIF-вкладка целиком premium-only
- источник GIF для MVP:
  - только локальный upload `.gif`
  - без внешнего поиска
- библиотека GIF привязана к конкретному пользователю
- выбранная GIF прикладывается к текущему сообщению как одно вложение

### Premium

- premium влияет на:
  - GIF library
  - отправку фото без сжатия
  - увеличенную storage quota
- в проекте есть debug-layer для premium, он описан отдельно в [docs/debug-flags.md](/Users/devisjones/Documents/New%20project/tinychok/docs/debug-flags.md)

### Storage and Quotas

- free quota: `50 MB`
- premium quota: `500 MB`
- квота считается по реально сохранённым пользовательским вложениям
- сервер проверяет квоту до сохранения нового upload
- orphan uploads чистятся по TTL
- usage и quota показываются в настройках пользователя

### Admin Panel MVP

- отдельный internal admin frontend рендерится host-aware через:
  - `admin.staging.tinychok.ru`
  - `admin.tinychok.ru`
- production admin по умолчанию выключен через `ADMIN_PANEL_ENABLED=false`
- авторизация staff идёт через существующий bearer-token auth flow, но доступ к admin API разрешён только аккаунтам с `staffRole`
- роли:
  - `owner`
  - `moderator`
  - `support`
- server-side permission matrix лежит в `server/src/admin-permissions.ts`
- admin API и origin gating лежат в `server/src/admin-routes.ts`
- данные staff/admin хранятся в основном state store:
  - `staffRole`
  - `blockedAt`
  - `blockedReason`
  - `lastActiveAt`
  - `adminReports`
  - `adminAuditLogs`
- bootstrap первого staff делается только через CLI:

```bash
npm run bootstrap:staff -- <identifier> <owner|moderator|support>
```

- перед bootstrap нужный пользователь уже должен существовать как обычный staging account
- admin UI умеет:
  - dashboard metrics
  - user search / detail
  - block / unblock
  - manual premium grant / revoke
  - moderation queue по жалобам
  - media hide / delete
  - audit log
- для admin-списков, где сущность размножается по пользовательским копиям, каналы являются эталонной схемой агрегации:
  - canonical key строится по владельцу канала и нормализованному `@handle`
  - admin UI показывает один канал, даже если backend хранит несколько подписочных копий
  - detail / export / moderation всегда должны цепляться к canonical entity, а не к viewer-copy
  - такой подход нужен, чтобы staff видел продуктовую сущность, а не дубликаты из fan-out storage модели

## Operational Invariants

- staging должен оставаться закрыт сразу двумя уровнями:
  - `basic auth` на frontend
  - allowlist телефонов на backend
- staging admin тоже должен оставаться за `basic auth` и использовать тот же backend allowlist для staff login
- delete-path обязан работать server-side и не должен зависеть только от локального optimistic UI
- premium debug state может использоваться на staging, но не должен попадать в production без отдельного решения
- production deploy обязан идти в режиме `TINYCHOK_APP_ENV=production`, чтобы тестовые сущности не попадали в боевой runtime
- admin production нельзя включать без отдельного ручного решения по env и rollout-проверке staging

## Smoke Checklist

- auth flow на staging через allowlist номер
- direct / group / channel opening с history window
- day divider и догрузка старой истории вверх
- thread inbox и unread badge
- reply flow во всех типах комнат
- photo attachments:
  - preview до отправки
  - `только фото`
  - `текст + фото`
  - fullscreen viewer
- GIF flow для premium
- avatar upload для профиля, канала и группы
- storage quota block при превышении лимита
- delete flow с повторным входом в комнату
- admin login под owner/moderator/support
- user search, block/unblock и premium toggle в admin
- report note / close / restrict user / hide or delete entity
- audit log entry после admin-действия
