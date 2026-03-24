# Staging Rollout Status

Короткий runbook по текущему staging-контуру. Документ описывает только текущее устройство контура, обязательные проверки и стандартный deploy flow.

## Staging Contour

- staging frontend: `https://staging.tinychok.ru`
- staging backend: `https://api.staging.tinychok.ru`
- websocket: `wss://api.staging.tinychok.ru/ws`
- backend работает как `systemd` service `tinychok-staging.service`
- frontend отдаётся как статическая Vite-сборка через `nginx`
- backend и frontend используют один staging state store

## Access Model

- frontend staging закрыт через `nginx basic auth`
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
- аватарки профиля, группы и канала обновляются через единый crop/resize pipeline

### Ownership And Moderation Surface

- владелец канала видит список подписчиков
- `Удалить подписчика` и `В чёрный список` работают
- invite flow канала отправляет корректное сообщение-приглашение

### Reliability

- удалённые сообщения, посты и комментарии не возвращаются после повторного входа в комнату
- stale client snapshot не может восстановить удалённый timeline
- profile settings сохраняются без transport-level сбоев за reverse proxy

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
curl -s https://api.staging.tinychok.ru/healthz
```

Ожидается:

- frontend не открывается без basic auth
- backend отвечает `status: ok`

## Manual Smoke Checklist

- login на staging под allowlist номером
- direct message send
- group message send
- channel post send
- thread comment send
- delete message / post / comment с повторным входом
- photo send и viewer
- GIF send для premium
- avatar update
- storage quota warning / block
