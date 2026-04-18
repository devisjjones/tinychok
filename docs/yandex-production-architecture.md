# Production Architecture For 10k+ Users

Этот документ фиксирует целевую архитектуру `Tinychok` для первого нормального production-запуска в `Yandex Cloud`, когда продукт уже выходит за пределы одного сервера и локального JSON-store.

## Цель

- выдерживать `10 000+` зарегистрированных пользователей;
- не зависеть от одного backend-процесса;
- хранить сообщения и медиа в отказоустойчивых managed-сервисах;
- безопасно подключить платежи и premium-выдачу;
- иметь понятный путь роста без полной переписки приложения.

## Целевая схема

### Frontend

- `Object Storage + CDN` для статической выдачи фронтенда;
- основной домен: `https://tinychok.ru`;
- frontend не должен быть жёстко привязан к same-origin API.
- installable web-app surfaces нельзя оставлять на implicit mime fallback:
  - `manifest.webmanifest` должен отдаваться как `application/manifest+json`
  - square install icons `192x192` и `512x512` должны реально долетать до web-host/CDN
  - Safari/macOS web-app icon для add-to-dock path нормально работает с PNG; отдельный pinned-tab `mask-icon` — это уже отдельный SVG surface

### API и realtime

- `Yandex Managed Service for Kubernetes` как основная площадка для backend-контейнеров;
- отдельный deployment для `api` и отдельный deployment для `realtime-gateway`, когда уйдём от snapshot fanout;
- `Yandex Application Load Balancer` перед HTTP и WebSocket;
- отдельный API-домен: `https://api.tinychok.ru`.

### Данные

- `Yandex Managed Service for PostgreSQL` как основная база:
  - accounts
  - sessions
  - dialogs
  - messages
  - groups
  - channels
  - subscription posts
  - payments
  - premium entitlements

### Realtime

- `Yandex Managed Service for Valkey` для:
  - pub/sub realtime events;
  - presence;
  - fanout между backend-инстансами;
  - rate limiting и короткоживущих ключей.

### Медиа

- `Yandex Object Storage` для:
  - avatar images;
  - attachments;
  - channel media;
  - будущих voice/photo/video upload flows.
- отдельный media-домен: `https://media.tinychok.ru` или signed URL через API.

### Рекомендуемая стратегия media для мессенджера

- `public media` и `private media` лучше разделять;
- для приватных вложений мессенджера правильнее использовать `private bucket + pre-signed URL`, а не постоянный публичный URL;
- отдельный `media.tinychok.ru` полезен в первую очередь для:
  - публичных статики и изображений;
  - landing assets;
  - публичных channel assets, если они реально публичные по продукту;
- для direct/group/private channel вложений безопаснее выдавать короткоживущие signed URL через backend.

Практический вывод для `Tinychok`:

- на раннем этапе можно не спешить с отдельным media-доменом для приватных файлов;
- лучше сначала строить схему вокруг `Object Storage + signed URLs`;
- отдельный `media.tinychok.ru` добавлять позже для публичной выдачи, если он действительно нужен.
- bucket names для private media лучше держать без точек, например `tinychok-media-prod`, чтобы не упираться в HTTPS-ограничения wildcard-сертификатов на storage endpoint.

### Секреты, TLS и аудит

- `Yandex Lockbox` для секретов;
- `Yandex Certificate Manager` для TLS-сертификатов;
- `Yandex Monitoring`, `Yandex Logging`, `Audit Trails` для операционного контура.

## Почему именно так

Текущий dev-backend ещё пишет всё в один JSON-файл и хранит WebSocket-состояние в памяти одного процесса. Это удобно для разработки, но плохо подходит для настоящего мессенджера:

- один процесс становится bottleneck;
- локальные uploads не переживают нормальное масштабирование;
- несколько инстансов не могут согласованно раздавать realtime без общей шины;
- платежи и premium нельзя надёжно вести поверх file-store.

## Доменная граница backend

Backend надо держать не как один большой `store.ts`, а как модули:

- `auth`
- `accounts`
- `dialogs`
- `groups`
- `channels`
- `media`
- `payments`
- `realtime`

Это не “архитектура ради архитектуры”, а способ не потерять контроль, когда появятся:

- webhook-и платежей;
- premium lifecycle;
- антиспам и rate limit;
- delivery/read state;
- разные типы вложений;
- операционные инструменты.

## Рекомендуемые домены

- `tinychok.ru` — frontend
- `tinychok.com` — редирект на `tinychok.ru`
- `staging.tinychok.ru` — staging frontend
- `api.tinychok.ru` — REST + WebSocket
- `api.staging.tinychok.ru` — staging REST + WebSocket
- `media.tinychok.ru` — public media или edge-домен для Object Storage

Именно поэтому в коде уже стоит поддерживать конфигурируемые `PUBLIC_*` и `VITE_*` URL, а не полагаться только на относительные пути.

## Первый production rollout

### Phase 1

- сохранить текущий API-контракт;
- вынести frontend и backend на разные домены;
- оставить один backend deployment, но уже в Kubernetes;
- перевести хранение из JSON в PostgreSQL;
- перевести media из локального диска в Object Storage;
- оставить текущий snapshot-based realtime как временный режим.

### Phase 2

- заменить snapshot fanout на событийную модель;
- добавить Valkey pub/sub;
- разделить API и realtime-gateway;
- ввести delivery statuses и presence.

### Phase 3

- добавить payments и premium entitlement service;
- webhook processing;
- idempotency keys;
- fraud/rate-limit checks;
- admin/support tooling.

## Что уже подготовлено в коде

- backend и frontend больше не обязаны жить только на одном origin;
- media URL можно публиковать через отдельный public base URL;
- PostgreSQL schema уже лежит в `server/sql/yandex-postgres-schema.sql`;
- backend уже поддерживает transitional `file | postgres` state store;
- для первого PostgreSQL migration-шага есть `server/sql/yandex-postgres-state-store.sql`;
- следующим safe-step уже введён расширенный hybrid runtime layout:
  - slim `app_runtime_state`
  - отдельные postgres-таблицы под `dialogMessages`, `groupMessages`, `groups`, `subscriptionChannels`, `subscriptionPosts`, `supportTickets`, `threadStates`, `ipAccessLogs`, `adminAuditLogs`, `archivedMedia`, `pendingGroupInvitations`, `pendingChannelInvitations`, `pendingMediaUploads`
  - `accounts.statusHistory` тоже вынесен из slim payload в отдельную hybrid-таблицу
  - backend умеет per-collection подняться из старого slim payload и затем переписать runtime в новый layout без потери данных
  - reference SQL для этого перехода лежит в `server/sql/yandex-postgres-hybrid-runtime.sql`
- есть `.env.production.example` с production-переменными под Yandex Cloud;
- тестовые staging/dev fixtures теперь помечаются флагом `isTestEntity` и на production startup автоматически вычищаются из runtime state.

## Правило Production Deploy

- production deploy обязан идти с `TINYCHOK_APP_ENV=production`;
- при таком запуске backend автоматически удаляет из state store все тестовые аккаунты, тестовые группы, тестовые подписки на каналы и связанные с ними сообщения/сессии/репорты;
- staging/dev fixtures можно держать в file-store или PostgreSQL staging-среды, но они не должны переноситься в production runtime;
- если production backend стартовал не в `production`-режиме, deploy считается некорректным, потому что auto-cleanup тестовых сущностей не сработает.

## Что делаем следующим практическим шагом

1. Вводим PostgreSQL repository layer рядом с текущим dev store.
2. Вводим Object Storage adapter для media.
3. После этого переносим realtime на Valkey pub/sub.
4. Только затем подключаем платежный контур.

Текущий operational prep для этого шага теперь разнесён так:

- live staging branch = `codex/staging-deploy`
- global release / production prep branch = `codex/global-release-prep`
- production rollout path описан в [docs/production-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/production-deploy-runbook.md)
- readiness checklist описан в [docs/production-readiness-checklist.md](/Users/devisjjones/Documents/tinychok/docs/production-readiness-checklist.md)
