# Next Branch Handoff

Этот файл нужен как короткая точка продолжения, если работа переносится в новую ветку или новый тред.

## Git state

- текущая рабочая ветка для staging deploy: `codex/staging-deploy`
- последний подтверждённый push до этого handoff refresh: `f1bc8c1`
- commit message: `Align staging deploy docs with VM setup`
- продолжать дальше нужно от актуального `HEAD` ветки `codex/staging-deploy`

Если продолжать в новой ветке, безопасная точка старта:

- branch from: текущий `HEAD` ветки `codex/staging-deploy`
- recommended new branch name: `codex/staging-frontend`

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
- `nginx`
- `certbot`

## Что уже реально поднято

- на VM настроен `GitHub deploy key`
- `ssh -T git@github.com` на staging VM проходит успешно
- репозиторий склонирован в `/home/devis/tinychok`
- staging `.env` создан на VM
- backend переведён в `systemd`
- системный сервис: `tinychok-staging.service`
- `tinychok-staging.service` находится в состоянии `active`
- `nginx` проксирует `api.staging.tinychok.ru` на `127.0.0.1:8787`
- выпущен `Let's Encrypt` сертификат для `api.staging.tinychok.ru`
- подтверждены ответы:
  - `https://api.staging.tinychok.ru/healthz`
  - `https://api.staging.tinychok.ru/readyz`
- staging DNS уже создан в `Reg.ru`:
  - `api.staging.tinychok.ru -> 158.160.197.255`
  - `staging.tinychok.ru -> 158.160.197.255`

## Какие секреты уже существуют, но не должны храниться в репозитории

- `POSTGRES_PASSWORD` для `tinychok_app`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`

Эти значения уже есть у владельца проекта, но их нельзя писать в git или чат.

## Следующий правильный шаг

Выложить staging frontend на `staging.tinychok.ru`.

Практический порядок:

1. Решить, где отдаём frontend:
   - на этой же VM через `nginx`
   - или как статическую выдачу вне VM
2. Собрать frontend со staging-конфигом:
   - `VITE_API_BASE_URL=https://api.staging.tinychok.ru`
   - `VITE_WS_BASE_URL=wss://api.staging.tinychok.ru`
3. Подключить выдачу `staging.tinychok.ru`
4. Выпустить HTTPS для `staging.tinychok.ru`
5. Проверить загрузку UI, auth и websocket через staging API

## Полезные команды на staging VM

- `sudo systemctl status tinychok-staging --no-pager`
- `sudo journalctl -u tinychok-staging -n 50 --no-pager`
- `sudo systemctl status nginx --no-pager`
- `curl -s https://api.staging.tinychok.ru/healthz`
- `curl -s https://api.staging.tinychok.ru/readyz`

## Что нужно будет подставить в staging env

- `TINYCHOK_APP_ENV=staging`
- `TINYCHOK_STORE_MODE=postgres`
- `TINYCHOK_MEDIA_BACKEND=object-storage`
- `HOST=0.0.0.0`
- `PORT=8787`
- `PUBLIC_APP_URL=https://staging.tinychok.ru`
- `PUBLIC_API_URL=https://api.staging.tinychok.ru`
- `PUBLIC_MEDIA_BASE_URL=`
- `VITE_API_BASE_URL=https://api.staging.tinychok.ru`
- `VITE_WS_BASE_URL=wss://api.staging.tinychok.ru`
- `POSTGRES_URL=`
- `POSTGRES_HOST=127.0.0.1`
- `POSTGRES_PORT=5432`
- `POSTGRES_DB=tinychok`
- `POSTGRES_USER=tinychok_app`
- `POSTGRES_PASSWORD=<stored-secret>`
- `POSTGRES_SSL=false`
- `POSTGRES_BOOTSTRAP_FROM_FILE=true`
- `OBJECT_STORAGE_ENDPOINT=https://storage.yandexcloud.net`
- `OBJECT_STORAGE_BUCKET=tinychok-media-staging`
- `OBJECT_STORAGE_REGION=ru-central1`
- `OBJECT_STORAGE_ACCESS_KEY=<stored-secret>`
- `OBJECT_STORAGE_SECRET_KEY=<stored-secret>`
- `OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS=300`

## Что не надо делать

- не трогать рабочий `tinychok-staging.service`, если задача не про backend deploy
- не коммитить `.env` и не писать секреты в чат
- не полагаться на локальный resolver `127.0.0.53` на VM как на единственный DNS-check
- не делать bucket публичным
- не создавать staging `Managed PostgreSQL` по дефолтной managed-форме
