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

## Что ещё не сделано

- frontend для `staging.tinychok.ru` ещё не выложен
- HTTPS для `staging.tinychok.ru` ещё не настраивался
- не выбрана финальная схема staging frontend:
  - статика на этой же VM через `nginx`
  - или отдельная статическая выдача через `Object Storage`

## Следующий правильный шаг

Собрать и выложить staging frontend на `staging.tinychok.ru` с backend-конфигом:

- `VITE_API_BASE_URL=https://api.staging.tinychok.ru`
- `VITE_WS_BASE_URL=wss://api.staging.tinychok.ru`

После этого:

1. отдать статику по `staging.tinychok.ru`
2. включить HTTPS для `staging.tinychok.ru`
3. проверить открытие приложения и websocket-подключение через staging API

Короткий frontend-only runbook для этого шага лежит в [docs/staging-frontend-rollout.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-frontend-rollout.md).
