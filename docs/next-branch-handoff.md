# Next Branch Handoff

Этот файл нужен как короткая точка продолжения, если работа переносится в новую ветку или новый тред.

## Git state

- текущая рабочая ветка: `codex/group-composer`
- последний подтверждённый push: `1af488b`
- commit message: `Add backend foundation and staging cloud setup`
- remote branch синхронизирован с локальной веткой

Если продолжать в новой ветке, безопасная точка старта:

- branch from: `1af488b`
- recommended new branch name: `codex/staging-deploy`

## Что уже сделано в коде

- добавлен backend на `Fastify + WebSocket`
- введён transitional backend store `file | postgres`
- добавлен media backend `local | object-storage`
- `Yandex Object Storage` уже поддерживается кодом через signed URL redirect по `/uploads/...`
- добавлены `.env.production.example` и `.env.staging.example`
- документация по `Yandex Cloud`, доменам и production-архитектуре уже лежит в `docs/`

## Что уже создано в Yandex Cloud

- cloud: `cloud-kurusayd`
- staging folder: `tinychok-staging` (`b1g5c3ai08ckdov60ft0`)
- production folder: `tinychok-prod` (`b1g4ldq3ej90fvfmdqcl`)
- staging bucket: `tinychok-media-staging`
- staging service account: `tinychok-storage-staging`
- для staging service account уже создан static access key
- staging VM: `tinychok-staging-1`
- staging VM id: `fv4gef3170h8s344dmh6`
- staging public ip: `158.160.197.255`
- staging private ip: `10.130.0.34`

## Что уже установлено на staging VM

- рабочий вход через `Cloud Shell`
- `PostgreSQL 16.13`
- PostgreSQL service = `active`
- база `tinychok`
- пользователь `tinychok_app`
- вход в базу под `tinychok_app` уже подтверждён
- `Node.js v24.14.0`
- `npm 11.9.0`

## Какие секреты уже существуют, но не должны храниться в репозитории

- `POSTGRES_PASSWORD` для `tinychok_app`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`

Эти значения уже есть у владельца проекта, но их нельзя писать в git или чат.

## Следующий правильный шаг

Настроить `GitHub deploy key` на staging VM, чтобы сервер мог сам тянуть код без архивов.

Порядок:

1. На VM сгенерировать отдельный deploy key:
   - `~/.ssh/tinychok_github_deploy`
2. Добавить public key в GitHub репозиторий как `Deploy key`
   - read-only
   - без `Allow write access`
3. Проверить `ssh -T git@github.com`
4. Клонировать репозиторий на VM
5. Переключиться на ветку продолжения
6. Создать staging `.env`
7. Запустить `npm install`
8. Запустить backend на staging VM

## Что нужно будет подставить в staging env

- `TINYCHOK_APP_ENV=staging`
- `TINYCHOK_STORE_MODE=postgres`
- `TINYCHOK_MEDIA_BACKEND=object-storage`
- `HOST=0.0.0.0`
- `PORT=8787`
- `PUBLIC_APP_URL=https://staging.tinychok.ru`
- `PUBLIC_API_URL=https://api.staging.tinychok.ru`
- `VITE_API_BASE_URL=https://api.staging.tinychok.ru`
- `VITE_WS_BASE_URL=wss://api.staging.tinychok.ru`
- `POSTGRES_HOST=127.0.0.1`
- `POSTGRES_PORT=5432`
- `POSTGRES_DB=tinychok`
- `POSTGRES_USER=tinychok_app`
- `POSTGRES_PASSWORD=<stored-secret>`
- `POSTGRES_SSL=false`
- `OBJECT_STORAGE_ENDPOINT=https://storage.yandexcloud.net`
- `OBJECT_STORAGE_BUCKET=tinychok-media-staging`
- `OBJECT_STORAGE_REGION=ru-central1`
- `OBJECT_STORAGE_ACCESS_KEY=<stored-secret>`
- `OBJECT_STORAGE_SECRET_KEY=<stored-secret>`

## Что не надо делать

- не создавать staging `Managed PostgreSQL` по дефолтной managed-форме
- не делать bucket публичным
- не хранить ключи и пароли в repo
- не использовать архивы как основной deploy-путь, если deploy key можно настроить нормально
