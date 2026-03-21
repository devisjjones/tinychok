# Staging Rollout Status

Короткий статус staging-контура по состоянию на `2026-03-21`.

## Что уже подтверждено

- на staging VM `tinychok-staging-1` настроен `GitHub deploy key`
- проверка `ssh -T git@github.com` на VM проходит успешно
- репозиторий склонирован на VM в `/home/devis/tinychok`
- рабочая серверная ветка на staging VM: `codex/staging-deploy`
- staging `.env` создан на VM на основе `.env.staging.example`
- backend собран и переведён на `systemd`
- системный сервис называется `tinychok-staging.service`
- `tinychok-staging.service` включён в автозапуск и находится в состоянии `active (running)`
- `nginx` установлен и работает как reverse proxy для staging API и как отдача frontend-статики
- выпущен `Let's Encrypt` сертификат для `api.staging.tinychok.ru`
- выпущен `Let's Encrypt` сертификат для `staging.tinychok.ru`
- `https://api.staging.tinychok.ru/healthz` отвечает `{"status":"ok"}`
- `https://api.staging.tinychok.ru/readyz` отвечает `status: ok`
- staging API использует:
  - `PostgreSQL` на самой VM (`127.0.0.1:5432`)
  - `Yandex Object Storage`
- staging frontend live на `https://staging.tinychok.ru`
- browser requests идут на `https://api.staging.tinychok.ru`
- websocket подключается к `wss://api.staging.tinychok.ru/ws`
- в `Reg.ru` созданы DNS-записи:
  - `api.staging.tinychok.ru -> 158.160.197.255`
  - `staging.tinychok.ru -> 158.160.197.255`
- внешние резолверы `1.1.1.1` и `8.8.8.8` видят staging-поддомены на `158.160.197.255`

## Access guard status

По состоянию на `2026-03-21` доступ к staging уже закрыт так, как и планировалось:

- basic auth включен на HTTPS-блоке `nginx` для `staging.tinychok.ru`
- `curl -I https://staging.tinychok.ru` возвращал `401 Unauthorized`
- логин basic auth: `tinychok`
- пароль создан через `htpasswd` на VM и не должен попадать в чат или git
- backend staging ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES` в `/home/devis/tinychok/.env`

Подробный runbook лежит в [docs/staging-access-guard.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-access-guard.md).

## Последний подтверждённый bugfix

Коммит `32b3322` (`Sort chats by latest activity`) исправил сортировку списка чатов:

- проблема была в том, что чат с новым сообщением после полуночи нового дня мог оказаться ниже чатов предыдущего дня с временем `13:xx` или `14:xx`
- причиной было отсутствие полного `createdAt` timestamp у новых сообщений и сортировка не по реальной последней активности
- в коде добавлен `createdAt` у новых direct/group сообщений
- список чатов теперь сортируется по latest activity

Изменённые файлы:

- `server/src/store.ts`
- `src/App.tsx`
- `src/app/types.ts`
- `src/app/utils.ts`

Дополнительно подтверждено:

- `git pull` до `32b3322` на staging VM уже был сделан
- ручная проверка владельцем проекта подтвердила, что фикс работал на staging `2026-03-20`

## Полезные operational notes

- локальный `systemd-resolved` на самой VM может продолжать кэшировать старый `NXDOMAIN`
- если нужно проверить свежую DNS-резолюцию с VM, надёжнее спрашивать внешний resolver:
  - `nslookup api.staging.tinychok.ru 1.1.1.1`
  - `nslookup staging.tinychok.ru 8.8.8.8`
- основной backend сейчас работает через:
  - `tinychok-staging.service`
  - `nginx` site `tinychok-staging-api`

## Что теперь закрыто

- staging backend deploy
- staging frontend deploy
- HTTPS для обоих staging-доменов
- browser smoke-check UI + API + websocket
- basic auth для frontend staging-домена
- allowlist тестовых телефонов на backend
- фиксы по account search, seeded mock history и сортировке чатов

## Следующий шаг

Обязательного незакрытого staging rollout шага сейчас нет.

Следующую работу нужно начинать уже от новой продуктовой задачи или нового bugfix, сохраняя текущую точку старта на `32b3322`.
