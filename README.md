# Тайничок

Репозиторий MVP-мессенджера `Tinychok`.

Production-архитектура под `Yandex Cloud` для `10k+` пользователей описана отдельно в [docs/yandex-production-architecture.md](/Users/devisjones/Documents/New%20project/tinychok/docs/yandex-production-architecture.md).
Постоянный чек-лист того, что нужно от владельца проекта для production, лежит в [docs/founder-checklist.md](/Users/devisjones/Documents/New%20project/tinychok/docs/founder-checklist.md).
Короткая точка продолжения для новой ветки или нового треда лежит в [docs/next-branch-handoff.md](/Users/devisjones/Documents/New%20project/tinychok/docs/next-branch-handoff.md).
Текущее состояние staging rollout зафиксировано в [docs/staging-rollout-status.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-rollout-status.md).
Короткий runbook по защите staging для тестеров лежит в [docs/staging-access-guard.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-access-guard.md).
Текущая схема аналитики и goals описана в [docs/analytics-instrumentation.md](/Users/devisjones/Documents/New%20project/tinychok/docs/analytics-instrumentation.md).
Текущая политика хранения данных описана в [docs/data-retention.md](/Users/devisjones/Documents/New%20project/tinychok/docs/data-retention.md).

Сейчас в проекте уже есть:

- frontend на `React + TypeScript + Vite`
- staging frontend на [https://staging.tinychok.ru](https://staging.tinychok.ru)
- staging admin panel на [https://admin.staging.tinychok.ru](https://admin.staging.tinychok.ru)
- staging backend API на [https://api.staging.tinychok.ru/healthz](https://api.staging.tinychok.ru/healthz)
- локальный backend на `Fastify + WebSocket`
- password-aware auth flow:
  - новый пользователь: `phone -> SMS -> profile + password`
  - существующий пользователь с паролем: `phone -> password`
  - `forgot password`: `password -> SMS reset -> new password`
  - в `Настройки -> Управление` пользователь может `Сменить пароль`
  - новые live-аккаунты по умолчанию создаются без premium
- SmartCaptcha на user и admin auth request-code шаге
- browser notifications promo/toggle и `Notification API`
- отдельная user/admin аналитика через `Yandex Metrica` на staging
- owner-only admin exports:
  - `Логи IP` CSV
  - `Юр. выгрузка ZIP`
- публичные страницы:
  - `privacy-policy.html`
  - `user-agreement.html`
  - `contacts.html`
- серверный bootstrap, realtime snapshot fanout и mutation API для горячих сценариев
- файловое dev-хранилище в `server/data/dev-db.json`

## Локальный запуск

```bash
npm install
npm run dev
```

После запуска:

- клиент доступен на [http://127.0.0.1:5174/](http://127.0.0.1:5174/)
- backend слушает `http://127.0.0.1:8787`
- websocket endpoint: `ws://127.0.0.1:8787/ws`

## Основные команды

```bash
npm run dev
npm run dev:client
npm run dev:server
npm run build
npm run start:server
```

## Production env

Пример production-переменных под Яндекс Облако лежит в [.env.production.example](/Users/devisjones/Documents/New%20project/tinychok/.env.production.example).
Пример staging-переменных лежит в [.env.staging.example](/Users/devisjones/Documents/New%20project/tinychok/.env.staging.example).
Текущий staging-пример уже синхронизирован с реальным staging-контуром на VM: локальный `PostgreSQL` на `127.0.0.1:5432`, `POSTGRES_SSL=false`.

Сейчас особенно важны:

- `TINYCHOK_STORE_MODE=file|postgres` для выбора текущего backend store;
- `TINYCHOK_MEDIA_BACKEND=local|object-storage` для выбора media backend;
- `TINYCHOK_ALLOWED_TEST_PHONES=+79990000001,+79990000002` для закрытия staging по списку тестовых номеров;
- `VITE_API_BASE_URL` и `VITE_WS_BASE_URL` для раздельных frontend/backend доменов;
- `PUBLIC_API_URL` и `PUBLIC_MEDIA_BASE_URL` для корректных media URL в snapshot и upload response;
- `POSTGRES_*` и `OBJECT_STORAGE_*` как текущий deploy-конфиг backend.

`Valkey` остаётся частью целевой production-архитектуры, но текущий backend и runtime env его ещё не используют.

Сейчас backend поддерживает два режима state storage:

- `TINYCHOK_STORE_MODE=file` — текущий dev JSON store;
- `TINYCHOK_STORE_MODE=postgres` — transitional PostgreSQL-backed state store.

Сейчас backend поддерживает два режима media storage:

- `TINYCHOK_MEDIA_BACKEND=local` — текущий dev media store в `server/uploads`;
- `TINYCHOK_MEDIA_BACKEND=object-storage` — Yandex Object Storage upload с выдачей стабильного `/uploads/...` URL через серверный redirect на короткоживущий signed URL.

## Что backend делает сейчас

- `POST /api/auth/request-code` определяет следующий auth-step:
  - `needs-password-login`
  - `needs-sms-registration`
  - `needs-sms-password-setup`
  - `needs-sms-reset`
- `POST /api/auth/login-password` логинит существующий аккаунт без SMS
- `POST /api/auth/verify-code` проверяет код и решает следующий шаг:
  - `needs-profile-and-password`
  - `needs-password-setup`
  - `needs-password-reset`
- `POST /api/auth/register` создаёт новый аккаунт сразу с паролем и seed state
  - новый аккаунт создаётся как free-tier аккаунт без `premiumExpiresAt`
- `POST /api/auth/set-password` завершает migration-flow для legacy аккаунта без пароля
- `POST /api/auth/reset-password` завершает forgot-password flow после SMS
- `POST /api/session/delete-account` архивирует self-service удалённый аккаунт, отзывает его сессии и освобождает номер для новой регистрации как нового жизненного цикла
- auth flow на staging можно ограничить списком тестовых номеров через `TINYCHOK_ALLOWED_TEST_PHONES`
- `GET /api/bootstrap` отдаёт серверный snapshot аккаунта
- `PUT /api/snapshot` сохраняет актуальное состояние приложения
- `POST /api/dialogs/:dialogId/messages` отправляет direct message через сервер и умеет доставлять его второму аккаунту, если у контакта есть зарегистрированный Tinychok-профиль
- `PUT /api/session` обновляет серверное состояние аккаунта, включая `blockedContactIds`
- `POST /api/media?kind=attachment|channel-avatar` загружает файл и возвращает стабильный media URL
- `PUT /api/dialogs/:dialogId/favorite` переключает direct-чат в избранное
- `PUT /api/dialogs/:dialogId/pinned-message` закрепляет или снимает закреплённое сообщение
- `DELETE /api/dialogs/:dialogId/messages/:messageId` удаляет одно сообщение в direct-чате
- `DELETE /api/dialogs/:dialogId/history` очищает историю direct-чата
- `DELETE /api/dialogs/:dialogId` удаляет direct-чат у текущего аккаунта
- `POST /api/dialogs/:dialogId/read` помечает direct-чат прочитанным
- `POST /api/dialogs/:dialogId/messages` теперь поддерживает attachment metadata и attachment-only сообщения
- direct room уже рендерит image/file attachments из стабильных `/uploads/...` URL
- `POST /api/groups` создаёт новую группу
- `POST /api/groups/:groupId/messages` отправляет сообщение в группу и теперь тоже поддерживает attachment metadata и attachment-only сообщения
- `POST /api/groups/:groupId/read` помечает группу прочитанной
- `POST /api/channels` создаёт управляемый канал
  - create-flow стартует с пустыми `title`, `statusText` и `description`, без seeded draft-значений
  - после создания в истории сразу появляется системный элемент `Канал создан`
- `PUT /api/channels/:channelId` обновляет текстовые поля, аватар и приватность управляемого канала
  - `statusText` и `description` хранятся и редактируются раздельно
- `DELETE /api/channels/:channelId` удаляет управляемый канал
- `POST /api/subscription-channels/:channelId/read` помечает канал прочитанным
- UI subscription channels уже умеет:
  - рендерить attachment-ready posts
  - показывать системный элемент `Канал создан`
  - хранить отдельные `statusText` и `description`
  - отдавать новым подписчикам всю историческую ленту канала, а не только посты после подписки
- `GET /ws` отправляет realtime-обновления snapshot для текущего аккаунта
- внутри dev-backend данные уже хранятся не одним blob, а в нормализованных сущностях `accounts / dialogs / messages / groups / channels / posts`
- сервер пишет IP-историю успешных логинов и смен IP
- server-side retention cleanup подрезает исторические данные старше `3 лет`
- self-service deletion orphan-policy:
  - owned channels архивируются и становятся `read-only`
  - owned groups без флага `Удалить и данные тоже` стараются передать ownership первому живому участнику
  - owned groups с этим флагом или без живых участников архивируются и становятся `read-only`
  - новый аккаунт по тому же номеру не наследует старые чаты, группы, каналы, треды и медиа-связи

Текущий backend уже не опирается только на общий `saveSnapshot`: direct/group messaging, attachments, moderation direct-чата, blocklist, profile/session updates, channel detail edits, создание и удаление каналов идут отдельными командами. Но часть второстепенных сценариев фронта пока всё ещё сохраняется через полный snapshot, так что это промежуточный production-oriented шаг, а не финальная доменная модель мессенджера.

## Прод-архитектура под Яндекс Облако

Для production-развёртывания под мгновенные сообщения целевая схема должна быть такой:

- `Yandex Compute Cloud` или `Managed Service for Kubernetes` для backend-контейнеров
- `Yandex Application Load Balancer` перед HTTP/WebSocket-трафиком
- `Yandex Managed Service for PostgreSQL` как основное хранилище пользователей, чатов, групп, каналов и сообщений
- `Yandex Managed Service for Valkey` для pub/sub, presence, fanout и очередей realtime-событий
- `Yandex Object Storage` для медиа и вложений
- отдельный realtime-gateway для websocket-соединений

SQL-схема под PostgreSQL уже подготовлена в [server/sql/yandex-postgres-schema.sql](/Users/devisjones/Documents/New%20project/tinychok/server/sql/yandex-postgres-schema.sql).
Переходный PostgreSQL state store для первого migration-шага лежит в [server/sql/yandex-postgres-state-store.sql](/Users/devisjones/Documents/New%20project/tinychok/server/sql/yandex-postgres-state-store.sql).

Следующий архитектурный этап после текущего dev-backend:

1. Перевести оставшиеся write-path'ы с snapshot-sync на отдельные mutation API: channel posts, transfer, privacy и редкие management-сценарии.
2. Добрать auth-гейтинг для приватной раздачи `/uploads/...` и cleanup orphaned media в `Yandex Object Storage`.
3. Уйти от остаточного snapshot-sync и перевести весь write-path на нормализованные сущности `users / dialogs / groups / channels / messages`.
4. Вынести realtime-события в Valkey Pub/Sub.
5. Разделить auth, profile, messaging и channels на отдельные серверные модули.
6. Добавить реальные SMS/email-провайдеры и server-side delivery status.

## Сборка

```bash
npm run build
npm run build:frontend:staging
```

Для отдельной выкладки staging frontend использовать `npm run build:frontend:staging`. Эта команда собирает только клиентский `dist/` и сразу вшивает `https://api.staging.tinychok.ru` и `wss://api.staging.tinychok.ru`. Короткий VM+`nginx` rollout лежит в [docs/staging-frontend-rollout.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-frontend-rollout.md).
