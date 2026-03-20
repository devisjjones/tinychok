# Founder Checklist

Этот чек-лист я буду держать актуальным по мере развития production-архитектуры. Если в следующих шагах появятся новые внешние зависимости от тебя, я буду добавлять их сюда и показывать в итоговом сообщении.

Текущее зафиксированное состояние доменов и DNS лежит отдельно в [docs/domain-status.md](/Users/devisjones/Documents/New%20project/tinychok/docs/domain-status.md).
Текущее зафиксированное состояние Yandex Cloud лежит отдельно в [docs/yandex-cloud-status.md](/Users/devisjones/Documents/New%20project/tinychok/docs/yandex-cloud-status.md).

## Домены и DNS

- Зарегистрировать основной домен проекта.
- Подготовить staging-поддомены для тестового онлайна.
- Определить production-домены:
  - `tinychok.ru` как основной frontend-домен
  - `api.tinychok.ru` для backend API и WebSocket
  - `media.tinychok.ru` для медиа или edge-домена Object Storage, если не пойдём через signed URLs
- Определить staging-домены:
  - `staging.tinychok.ru` для frontend
  - `api.staging.tinychok.ru` для backend API и WebSocket
  - `media.staging.tinychok.ru` для staging media, если не пойдём через signed URLs
- Настроить `tinychok.com` как редирект на `tinychok.ru`.
- Подготовить DNS-зону и возможность добавлять `A/CNAME` записи.

## Yandex Cloud

- Создать или подтвердить активный аккаунт в `Yandex Cloud`.
- Production folder `tinychok-prod` создан: `b1g4ldq3ej90fvfmdqcl`
- Staging folder `tinychok-staging` создан: `b1g5c3ai08ckdov60ft0`
- ID вида `b1g...` для cloud/folder являются идентификаторами ресурсов, а не паролями.
- В staging уже создан service account `tinychok-storage-staging` с ролью `storage.editor`.
- В staging уже создан static access key для `tinychok-storage-staging`.
- В staging уже создана VM `tinychok-staging-1` (`158.160.197.255`).
- В staging уже подтверждён рабочий доступ к VM через `Cloud Shell`.
- В staging уже установлен `PostgreSQL 16.13`, база `tinychok` и пользователь `tinychok_app`.
- Подготовить сервисные роли и доступы для:
  - Kubernetes
  - PostgreSQL
  - Valkey
  - Object Storage
  - Lockbox
  - Certificate Manager

## Что надо создать в Yandex Cloud

- `Object Storage` bucket для медиа
  - рекомендованные имена без точек:
  - `tinychok-media-prod`
  - `tinychok-media-staging`
  - для первого релиза bucket должен оставаться приватным:
  - без public read
  - без public list
  - без static website hosting
  - storage class: `Standard`
  - versioning: пока `off`, чтобы не раздувать стоимость на старте
  - staging bucket `tinychok-media-staging` уже создан
- `Managed Service for PostgreSQL` кластер
  - не создавать staging-кластер по дефолтной форме без отдельного решения по бюджету
- `Managed Service for Valkey` кластер
- `Managed Service for Kubernetes` cluster
- `Application Load Balancer`
- `Certificate Manager` сертификаты
- `Lockbox` secrets
- `Monitoring`, `Logging`, `Audit Trails`

## Что надо будет передать мне

- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`
- `PUBLIC_MEDIA_BASE_URL`
- `STAGING_APP_URL`
- `STAGING_API_URL`
- `STAGING_MEDIA_BASE_URL`
- `POSTGRES_URL` или набор:
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
- `VALKEY_HOST`
- `VALKEY_PORT`
- `VALKEY_PASSWORD`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- service account id и key id можно присылать, `secret key` присылать не нужно
- `POSTGRES_PASSWORD` staging-базы у тебя уже сохранён локально, в чат его присылать не нужно

## Что понадобится позже

- SMS-провайдер для production-кодов
- SMS sandbox или тестовые номера
- платёжный провайдер
- sandbox-аккаунт платёжного провайдера
- webhook URL для платежей
- юридические реквизиты для платежного подключения
- support/ops email
- список тестовых пользователей для закрытой альфы
- список устройств и браузеров для ручной проверки
- способ доставки кода на staging VM:
  - `git clone/pull` из удалённого репозитория
- для staging выбираем `GitHub deploy key` с read-only доступом
- staging `.env` на VM
- способ запуска staging backend:
  - временно `node` / `npm run start:server`
  - позже `systemd`

## Как тестировать до live

- `local dev` для UI, багфиксов и быстрых регрессий
- `staging online` для реального backend, WebSocket, upload, multi-device и SMS
- `closed alpha` для ограниченного круга реальных пользователей
- `production` только после staging и закрытой альфы

Для мессенджера онлайн-тест обязателен, но это не значит тестировать сразу на всех. Правильный путь: отдельный staging-контур и затем закрытая альфа по allowlist.

## Зафиксированные решения

- основной production-домен: `tinychok.ru`
- `tinychok.com` редиректит на `tinychok.ru`
- staging frontend: `staging.tinychok.ru`
- staging API: `api.staging.tinychok.ru`
- private attachments: через `signed URLs`
- отдельный public media-домен не обязателен для первого релиза
- production и staging должны быть разделены по folder'ам

## Текущие открытые вопросы

- GitHub deploy key для staging VM ещё не настроен.
- Репозиторий ещё не склонирован на `tinychok-staging-1`.
- staging `.env` ещё не создан на VM.
- backend Tinychok ещё не запускался на staging VM.
- Production target по БД остаётся: `Managed PostgreSQL`.

## Зафиксированные решения по бюджету

- staging `Managed PostgreSQL` по дефолтной managed-конфигурации не создаём;
- причина: стоимость стандартной формы слишком высока для текущего тестового контура;
- staging двигаем через `Compute Cloud VM + self-managed PostgreSQL`;
- production-цель не меняется: для боевого запуска остаётся `Managed PostgreSQL`.
