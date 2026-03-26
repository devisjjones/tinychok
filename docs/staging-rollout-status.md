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

### Reliability

- удалённые сообщения, посты и комментарии не возвращаются после повторного входа в комнату
- stale client snapshot не может восстановить удалённый timeline
- profile settings сохраняются без transport-level сбоев за reverse proxy
- browser notifications не должны приходить в режиме `Тихо`

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

## Manual Smoke Checklist

- login на staging под allowlist номером
- direct message send
- group message send
- channel post send
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
  - пишет `admin.legal-export.download` в audit log
  - при `includeMedia=true` архив включает media-файлы, если storage-объекты доступны
