# Next Branch Handoff

Этот файл нужен как короткая точка продолжения, если работа переносится в новую ветку или новый тред.

## Git state

- текущая рабочая ветка для staging deploy: `codex/staging-deploy`
- текущий актуальный commit в `origin/codex/staging-deploy`: `32b3322`
- commit message: `Sort chats by latest activity`
- локальный `HEAD` должен совпадать с `origin/codex/staging-deploy`

Если продолжать в новой ветке, безопасная точка старта:

- branch from: текущий `HEAD` ветки `codex/staging-deploy`
- recommended new branch name: `codex/staging-followup`

## Что уже подтверждено по staging

- staging backend live на `https://api.staging.tinychok.ru`
- staging frontend live на `https://staging.tinychok.ru`
- frontend и backend крутятся на VM `tinychok-staging-1`
- `nginx` настроен
- HTTPS выпущен и для `api.staging.tinychok.ru`, и для `staging.tinychok.ru`
- public IP staging VM переведён в static
- `staging.tinychok.ru` закрыт через `nginx basic auth`
- `curl -I https://staging.tinychok.ru` возвращает `401 Unauthorized`
- логин basic auth: `tinychok`
- пароль basic auth уже создан через `htpasswd` на VM и не должен попадать в чат или git
- backend staging ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES` в `/home/devis/tinychok/.env`
- поиск аккаунтов через backend уже реализован
- баг с seeded mock history для реальных staging-аккаунтов уже исправлен

## Последний подтверждённый фикс

Коммит `32b3322` (`Sort chats by latest activity`) исправляет баг, при котором чат с новым сообщением после полуночи нового дня мог опускаться ниже чатов предыдущего дня.

Что сделано:

- добавлен `createdAt` у новых direct/group сообщений
- список чатов теперь сортируется по реальной latest activity

Изменённые файлы:

- `server/src/store.ts`
- `src/App.tsx`
- `src/app/types.ts`
- `src/app/utils.ts`

Operational note:

- `git pull` до `32b3322` на staging VM уже был сделан
- ручная проверка владельцем проекта подтвердила, что фикс работал на staging `2026-03-20`

## Что уже создано и установлено

- cloud: `cloud-kurusayd`
- staging folder: `tinychok-staging` (`b1g5c3ai08ckdov60ft0`)
- production folder: `tinychok-prod` (`b1g4ldq3ej90fvfmdqcl`)
- staging bucket: `tinychok-media-staging`
- staging service account: `tinychok-storage-staging`
- staging VM: `tinychok-staging-1`
- staging VM id: `fv4gef3170h8s344dmh6`
- staging public ip: `158.160.197.255`
- staging private ip: `10.130.0.34`
- `PostgreSQL 16.13` установлен на VM
- `Node.js v24.14.0`
- `npm 11.9.0`
- `nginx`
- `certbot`

## Полезные команды на staging VM

- `sudo systemctl status tinychok-staging --no-pager`
- `sudo journalctl -u tinychok-staging -n 50 --no-pager`
- `sudo systemctl status nginx --no-pager`
- `curl -s https://api.staging.tinychok.ru/healthz`
- `curl -s https://api.staging.tinychok.ru/readyz`
- `curl -I https://staging.tinychok.ru`

Если нужно повторно применить frontend/backend deploy после нового merge:

```bash
cd /home/devis/tinychok
npm ci
npm run build
sudo systemctl restart tinychok-staging
sudo rsync -av --delete dist/ /var/www/tinychok-staging/
```

## Какие секреты уже существуют, но не должны храниться в репозитории

- `POSTGRES_PASSWORD` для `tinychok_app`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- пароль `nginx basic auth` для `staging.tinychok.ru`

Эти значения уже есть у владельца проекта, но их нельзя писать в git или чат.

## Как продолжать работу

- staging-базовый rollout уже закрыт
- access guard уже включён
- последний staging bugfix по сортировке чатов уже подтверждён
- следующую задачу выбирать уже из продуктовых/bugfix задач, а не из базовой staging-инфраструктуры

Для ручных инструкций человеку использовать формат из [docs/collaboration-instructions.md](/Users/devisjones/Documents/New%20project/tinychok/docs/collaboration-instructions.md).
