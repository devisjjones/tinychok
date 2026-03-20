# Staging Rollout Status

Короткий статус staging-контура по состоянию на `2026-03-21`.

## Что уже подтверждено

- на staging VM `tinychok-staging-1` настроен `GitHub deploy key`
- проверка `ssh -T git@github.com` на VM проходит успешно
- репозиторий склонирован на VM в `/home/devis/tinychok`
- рабочая серверная ветка на staging VM: `codex/staging-deploy`
- на VM создан staging `.env` на основе `.env.staging.example`
- backend собран и переведён на `systemd`
- системный сервис называется `tinychok-staging.service`
- `tinychok-staging.service` включён в автозапуск и находится в состоянии `active (running)`
- `nginx` установлен и работает как reverse proxy для staging API
- выпущен `Let's Encrypt` сертификат для `api.staging.tinychok.ru`
- `https://api.staging.tinychok.ru/healthz` отвечает `{"status":"ok"}`
- `https://api.staging.tinychok.ru/readyz` отвечает `status: ok`
- staging API уже использует:
  - `PostgreSQL` на самой VM (`127.0.0.1:5432`)
  - `Yandex Object Storage`
- в `Reg.ru` созданы DNS-записи:
  - `api.staging.tinychok.ru -> 158.160.197.255`
  - `staging.tinychok.ru -> 158.160.197.255`
- внешние резолверы `1.1.1.1` и `8.8.8.8` уже видят staging-поддомены на `158.160.197.255`

## Полезные operational notes

- локальный `systemd-resolved` на самой VM может продолжать кэшировать старый `NXDOMAIN`
- если нужно проверить свежую DNS-резолюцию с VM, надёжнее спрашивать внешний resolver:
  - `nslookup api.staging.tinychok.ru 1.1.1.1`
  - `nslookup staging.tinychok.ru 8.8.8.8`
- основной backend сейчас работает через:
  - `tinychok-staging.service`
  - `nginx` site `tinychok-staging-api`

## Update: staging frontend live

По состоянию на `2026-03-21` staging frontend уже выложен на `https://staging.tinychok.ru`.

Подтверждено:

- frontend собран со staging-конфигом:
  - `VITE_API_BASE_URL=https://api.staging.tinychok.ru`
  - `VITE_WS_BASE_URL=wss://api.staging.tinychok.ru`
- статика отдаётся с staging VM `tinychok-staging-1` через `nginx`
- для `staging.tinychok.ru` выпущен `Let's Encrypt` сертификат
- `https://staging.tinychok.ru` открывается публично
- `https://staging.tinychok.ru/privacy-policy.html` отдаётся корректно
- auth flow через staging API проходит успешно
- browser requests идут на `https://api.staging.tinychok.ru`
- websocket подключается к `wss://api.staging.tinychok.ru/ws` и получает `101 Switching Protocols`

Короткий frontend-only runbook этого deploy шага лежит в [docs/staging-frontend-rollout.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-frontend-rollout.md).

## Что теперь закрыто

- staging frontend deploy
- HTTPS для `staging.tinychok.ru`
- browser smoke-check UI + API + websocket

## Следующий шаг

Следующий практический шаг уже не про базовый staging rollout, а про закрытие доступа к staging:

- пароль на `https://staging.tinychok.ru` через `nginx basic auth`
- allowlist тестовых номеров через `TINYCHOK_ALLOWED_TEST_PHONES`

Короткий runbook лежит в [docs/staging-access-guard.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-access-guard.md).
