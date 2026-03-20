# Тайничок

Репозиторий MVP-мессенджера `Tinychok`.

Production-архитектура под `Yandex Cloud` для `10k+` пользователей описана отдельно в [docs/yandex-production-architecture.md](/Users/devisjones/Documents/New%20project/tinychok/docs/yandex-production-architecture.md).
Постоянный чек-лист того, что нужно от владельца проекта для production, лежит в [docs/founder-checklist.md](/Users/devisjones/Documents/New%20project/tinychok/docs/founder-checklist.md).
Короткая точка продолжения для новой ветки или нового треда лежит в [docs/next-branch-handoff.md](/Users/devisjones/Documents/New%20project/tinychok/docs/next-branch-handoff.md).

Сейчас в проекте уже есть:

- frontend на `React + TypeScript + Vite`
- отдельная страница политики обработки персональных данных
- локальный backend на `Fastify + WebSocket`
- авторизация по телефону с demo-кодом `1111`
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

- `POST /api/auth/request-code` запрашивает demo-код
- `POST /api/auth/verify-code` проверяет код и решает: вход или переход к созданию профиля
- `POST /api/auth/register` создаёт новый аккаунт и seed state
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
- `PUT /api/channels/:channelId` обновляет текстовые поля, аватар и приватность управляемого канала
- `DELETE /api/channels/:channelId` удаляет управляемый канал
- `POST /api/subscription-channels/:channelId/read` помечает канал прочитанным
- UI subscription channels уже умеет рендерить attachment-ready posts и брать preview/time из последнего поста
- `GET /ws` отправляет realtime-обновления snapshot для текущего аккаунта
- внутри dev-backend данные уже хранятся не одним blob, а в нормализованных сущностях `accounts / dialogs / messages / groups / channels / posts`

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
```
