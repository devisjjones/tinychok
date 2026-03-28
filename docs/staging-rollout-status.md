# Staging Rollout Status

Короткий runbook по текущему staging-контуру. Документ описывает только текущее устройство контура, обязательные проверки и стандартный deploy flow.

## Staging Contour

- staging frontend: `https://staging.tinychok.ru`
- staging admin frontend: `https://admin.staging.tinychok.ru`
- staging backend: `https://api.staging.tinychok.ru`
- websocket: `wss://api.staging.tinychok.ru/ws`
- backend работает как `systemd` service `tinychok-staging.service`
- user frontend и admin frontend отдаются как статические Vite-сборки через `nginx`
- backend и frontend используют один staging state store

## Access Model

- frontend staging закрыт через `nginx basic auth`
- admin staging тоже должен быть закрыт через `nginx basic auth`
- backend staging дополнительно ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES`
- эти два уровня нельзя ослаблять ради UI-фиксов, upload flow или realtime

Подробности guard-а лежат в [docs/staging-access-guard.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-access-guard.md).

## What Staging Must Validate

### Core Messaging

- bootstrap snapshot загружается без ошибок
- websocket подключается к staging API
- direct / group / channel открываются с актуальным хвостом истории
- скролл вверх догружает старые страницы истории
- day divider показывает корректную дату

### Threads

- у тредов работают unread badge и inbox
- подписка и отписка треда меняют visibility в inbox
- комментарии не теряются после reload

### Media

- фото прикладываются и отправляются через новый draft flow
- fullscreen image viewer открывается по tap
- GIF работают через premium-вкладку picker-а
- GIF library умеет:
  - локальный upload `.gif`
  - дедуп по имени и размеру
  - auto-attach сразу после upload
  - поиск по общему Tinychok GIF pool по имени файла
  - удаление GIF из личной библиотеки
  - добавление GIF себе из fullscreen viewer
- аватарки профиля, группы и канала обновляются через единый crop/resize pipeline

### Ownership And Moderation Surface

- владелец канала видит список подписчиков
- `Удалить подписчика` и `В чёрный список` работают
- invite flow канала отправляет корректное сообщение-приглашение
- create-flow канала стартует с пустыми полями:
  - `Название канала`
  - `Статус канала`
  - `Описание канала`
- после создания канала владелец сразу открывает room этого канала, а в истории уже есть системный элемент `Канал создан`
- `Описание канала` открывается из menu popup и показывает аватар, название, создателя и полный description
- новый подписчик канала должен видеть всю историческую ленту канала, включая посты до подписки и системный элемент `Канал создан`
- если комментарии в канале были выключены после уже существующих комментариев, старые комментарии должны сохраняться, а новые — блокироваться

### Reliability

- удалённые сообщения, посты и комментарии не возвращаются после повторного входа в комнату
- stale client snapshot не может восстановить удалённый timeline
- profile settings сохраняются без transport-level сбоев за reverse proxy
- browser notifications не должны приходить в режиме `Тихо`
- исторические данные старше `3 лет` режутся серверным retention cleanup; это не должно ломать живые аккаунты, текущие профили и активные пароли

### Admin Panel

- `ADMIN_PANEL_ENABLED=true` на staging
- `ADMIN_PANEL_ENABLED=false` по умолчанию на production, пока не будет отдельного ручного включения
- `PUBLIC_ADMIN_STAGING_URL` должен указывать на `https://admin.staging.tinychok.ru`
- `PUBLIC_ADMIN_PRODUCTION_URL` должен указывать на `https://admin.tinychok.ru`
- `ADMIN_STAGING_HOST=admin.staging.tinychok.ru`
- `ADMIN_PRODUCTION_HOST=admin.tinychok.ru`
- admin UI открывается только на допустимых host-ах и использует тот же staging API
- admin staff login дополнительно защищён SmartCaptcha на шаге запроса SMS
- admin staging basic auth живёт отдельно от обычного staging basic auth
- на admin basic auth включён lockout через `fail2ban` с эскалацией `5m -> 10m -> 30m -> 1h -> 24h`
- первый owner назначается отдельно bootstrap-командой после создания обычного staging account:

```bash
cd /home/devis/tinychok
npm run bootstrap:staff -- <identifier> owner
```

- channels в admin считаются reference implementation для dedupe:
  - одна строка в списке должна соответствовать одному продуктовому каналу
  - viewer-copies и subscription-copies не должны дублироваться в moderation UI
  - canonical aggregation должна идти по владельцу + нормализованному handle, а не по внутренним fan-out копиям
- groups в admin должны отображаться один раз на группу, а не по числу участников
- threads в admin должны отображаться один раз на корневое сообщение треда, а не по числу комментариев
- dashboard обязан брать метрики из тех же canonical aggregate-источников, что и detail screens, иначе staff увидит рассинхрон между `Сводкой` и самим разделом

## Standard Deploy Flow

```bash
cd /home/devis/tinychok
git fetch origin
git checkout codex/staging-deploy
git pull --ff-only origin codex/staging-deploy
npm ci
npm run build
sudo systemctl restart tinychok-staging
sudo rsync -av --delete dist/ /var/www/tinychok-staging/
```

Если используется repo-скрипт:

```bash
cd /home/devis/tinychok
bash scripts/deploy-staging.sh
```

## Minimal Post-Deploy Check

```bash
curl -I https://staging.tinychok.ru
curl -I https://admin.staging.tinychok.ru
curl -s https://api.staging.tinychok.ru/healthz
```

Ожидается:

- frontend не открывается без basic auth
- admin frontend не открывается без basic auth
- backend отвечает `status: ok`
- user auth показывает support email `tinychok.help@yandex.com` внизу auth-экрана
- user login и admin login показывают SmartCaptcha на шаге запроса SMS
- user auth поддерживает password-login:
  - новый аккаунт после SMS обязан задать пароль
  - существующий аккаунт с паролем после ввода номера идёт сразу на password-step без SMS
  - существующий аккаунт без пароля идёт через SMS и затем обязан задать пароль
  - `Забыли пароль?` переводит на шаг телефона, требует SmartCaptcha и только потом запускает SMS reset-flow
  - после `3` неверных password attempts на шаге пароля появляется обязательная SmartCaptcha
  - password-login режется server-side lockout по `identifier + ip`
  - после `password-setup` и `password-reset` старые bearer sessions перестают работать
  - в `Настройки -> Управление` есть:
    - `Сменить пароль`
    - `Удалить аккаунт`
  - self-service удаление аккаунта:
    - требует текущий пароль
    - умеет чекбокс `Удалить и данные тоже`
    - разлогинивает пользователя
    - освобождает номер для новой регистрации как нового аккаунта
    - не уничтожает серверный архив старого аккаунта для admin/legal
    - убирает удалённый аккаунт из обычного user search и из списка контактов других пользователей
    - не даёт открыть живую direct-переписку с удалённым аккаунтом и не отдаёт direct history в обычный user payload
    - освобождает старый nickname для нового live-аккаунта
    - owned channels переводит в `архив / read-only`
    - архивные каналы не показывают старые посты обычным пользователям
    - owned groups без чекбокса старается передать первому живому участнику
    - owned groups с чекбоксом `Удалить и данные тоже` тоже переводит в `архив / read-only`
    - старый удалённый аккаунт в edge-case UI маскируется как `Аккаунт удалён` с `ghost`-placeholder и не подменяется новым аккаунтом с тем же номером
    - групповой контент удалённого пользователя скрывается только при режиме `Удалить и данные тоже`
- новые live-аккаунты после обычной регистрации больше не получают premium автоматически
- create managed channel flow:
  - не подставляет seeded значения вроде `Ночной архив`
  - использует пустые placeholder-поля для названия, статуса и описания
  - после create сразу открывает room канала
  - room сразу содержит системный элемент `Канал создан`
  - `Описание канала` доступно из меню канала
  - новый подписчик канала видит всю старую историю канала
- публичные статические страницы тоже входят в staging build:
  - `/privacy-policy.html`
  - `/user-agreement.html`
  - `/contacts.html`

## Manual Smoke Checklist

- login на staging под allowlist номером
- login по паролю на существующем аккаунте
- forgot-password через SMS reset и установка нового пароля
- регистрация нового аккаунта без premium по умолчанию
- смена пароля из `Настройки -> Управление`
- self-service удаление аккаунта:
  - удаляет доступ для пользователя
  - после этого тот же номер может заново зарегистрироваться как новый аккаунт
  - старый архивный аккаунт остаётся доступен в admin/legal контуре
  - старый аккаунт больше не должен находиться в user search и не должен висеть в контактах у других пользователей
  - direct room с удалённым аккаунтом должен быть недоступен для обычного пользователя
  - старый nickname должен быть доступен для повторного занятия новым live-аккаунтом
  - старые каналы открываются только в read-only режиме
  - архивные каналы не должны показывать старые посты обычным пользователям
  - группы либо продолжают жить с новым владельцем, либо архивируются если передавать ownership некому
- repeated wrong password attempts:
  - `5` подряд -> блок `5 минут`
  - следующий порог -> `30 минут`
  - следующий порог -> `24 часа`
- direct message send
- group message send
- channel post send
- channel create flow:
  - пустые placeholders
  - отдельные `statusText` и `description`
  - room открывается сразу после create
  - в истории есть `Канал создан`
- channel description popup из меню
- subscriber history backfill:
  - новый подписчик видит старые посты
  - старые комментарии остаются после выключения комментариев
- thread comment send
- delete message / post / comment с повторным входом
- photo send и viewer
- GIF send для premium
- GIF search, delete и add-to-library из viewer
- avatar update
- storage quota warning / block
- browser notification prompt / enable / disable / quiet-mode suppress
- admin login под staff account
- dashboard cards в admin:
  - пользователи
  - открытые / закрытые жалобы
  - monthly / yearly premium split
  - группы
  - каналы
  - треды
- `Пользователи`: search, block / unblock, premium toggle, avatar view
- `Пользователи`: owner-only `Логи IP` CSV по пользователю с reason и optional period
- `Пользователи`: owner-only legal export ZIP по пользователю с reason, optional period и optional media
- `Жалобы`: unread badge, open / close, note trail, блокировка пользователя
- `Жалобы` для media:
  - `Посмотреть` пишет audit entry
  - `Hide` скрывает из чата целиком сообщение / пост / комментарий
  - `Delete` скрывает из UI и физически удаляет media-object
- `Медиа`: timestamp sort, download, hide / delete
- `Каналы` / `Группы` / `Треды`: одна строка на одну каноническую сущность без fan-out дублей
- `Диалоги`: выбор двух пользователей и CSV export одного канонического диалога
- `Аудит лог`: actor filter, period filter, CSV export и запись admin-действий
- owner-only legal export:
  - архив скачивается без server error
  - архив включает `ip/ip-log.csv` и `ip/ip-log.json`
  - `from/to` режет `dialogs`, `groups`, `channels`, `threads`, `reports`, `audit` и `ip`
  - пишет `admin.legal-export.download` в audit log
- owner-only IP CSV export:
  - скачивается без server error
  - пишет `admin.ip-logs.download` в audit log
  - при `includeMedia=true` архив включает media-файлы, если storage-объекты доступны
- `?analytics_debug=1`:
  - показывает local analytics dispatch в `Console`
  - не должен дублировать один и тот же `pageview`/`gif_search_used` без нового фактического действия
