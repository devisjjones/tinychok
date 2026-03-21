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
- staging VM обновлена до commit `4fde821` (`Add legal pages and polish messaging UI`)
- latest deploy sequence `npm ci -> npm run build -> sudo systemctl restart tinychok-staging -> sudo rsync -av --delete dist/ /var/www/tinychok-staging/` был выполнен успешно `2026-03-21`
- владелец проекта после выкладки подтвердил staging-статус: `Всё работает`

## Access guard status

По состоянию на `2026-03-21` доступ к staging уже закрыт так, как и планировалось, и это состояние сохранилось после последней выкладки:

- basic auth включен на HTTPS-блоке `nginx` для `staging.tinychok.ru`
- `curl -I https://staging.tinychok.ru` возвращает `401 Unauthorized`
- логин basic auth: `tinychok`
- пароль создан через `htpasswd` на VM и не должен попадать в чат или git
- backend staging ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES` в `/home/devis/tinychok/.env`

Подробный runbook лежит в [docs/staging-access-guard.md](docs/staging-access-guard.md).

## Последний подтверждённый deploy batch

Коммит `4fde821` (`Add legal pages and polish messaging UI`) сейчас является последним подтверждённым staging-состоянием.

В этот пакет изменений вошло:

- отдельная страница `Пользовательское соглашение`
- согласие с двумя документами под кнопкой `Получить код`
- ссылка на соглашение в настройках
- обновление размера и tint иконок верхней и нижней панелей
- замена нижней иконки каналов на `news_settings.png`
- корректный overlay выбранного сообщения для direct/group/channel context menu
- состояния delivery для direct/group сообщений:
  - `pending`
  - `delivered`
  - `failed`
- retry/delete flow для failed сообщений
- реальный direct read receipt через `readAt`
- переработанные compact direct chat cards в левом списке:
  - без preview последнего сообщения
  - с typing animation / unread badge / временем в правом слоте
  - с online-dot на аватаре
  - с wide unread badge и ограничением `99+`

Ключевые файлы пакета:

- `server/src/store.ts`
- `src/App.tsx`
- `src/App.css`
- `src/app/types.ts`
- `src/app/utils.ts`
- `src/components/SelectedBubbleOverlay.tsx`
- `src/rooms/DirectChatRoom.tsx`
- `src/rooms/GroupRoom.tsx`
- `src/rooms/SubscriptionChannelRoom.tsx`
- `src/screens/AuthScreen.tsx`
- `src/UserAgreementPage.tsx`
- `src/userAgreementContent.ts`
- `src/user-agreement.tsx`
- `user-agreement.html`
- `vite.config.ts`

## Полезные operational notes

- локальный `systemd-resolved` на самой VM может продолжать кэшировать старый `NXDOMAIN`
- если нужно проверить свежую DNS-резолюцию с VM, надёжнее спрашивать внешний resolver:
  - `nslookup api.staging.tinychok.ru 1.1.1.1`
  - `nslookup staging.tinychok.ru 8.8.8.8`
- основной backend сейчас работает через:
  - `tinychok-staging.service`
  - `nginx` site `tinychok-staging-api`
- после каждого нового deploy полезно отдельно проверять:
  - `git rev-parse --short HEAD`
  - `curl -I https://staging.tinychok.ru`
  - `curl -s https://api.staging.tinychok.ru/healthz`
  - визуальный smoke-check в браузере после basic auth

## Что теперь закрыто

- staging backend deploy
- staging frontend deploy
- HTTPS для обоих staging-доменов
- browser smoke-check UI + API + websocket
- basic auth для frontend staging-домена
- allowlist тестовых телефонов на backend
- фиксы по account search, seeded mock history и сортировке чатов
- legal pages и текущий messaging UI polish batch из `4fde821`

## Следующий шаг

Обязательного незакрытого staging rollout шага сейчас нет.

Следующую работу нужно начинать уже от новой продуктовой задачи или нового bugfix, сохраняя текущую точку старта на `4fde821`.
