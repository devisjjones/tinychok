# Next Branch Handoff

Этот файл нужен как короткая точка продолжения, если работа переносится в новую ветку или новый тред.

## Git state

- текущая рабочая ветка для staging deploy: `codex/staging-deploy`
- последняя подтверждённая staging-выкладка: `1b8df3f`
- commit message подтверждённой staging-выкладки: `Polish mobile composer and refresh staging docs`
- последний продуктовый batch в ветке после этого: `1a037b9`
- commit message последнего продуктового batch: `Refine channel and group messaging flows`
- локальный `HEAD` на staging VM сейчас не должен считаться актуальным, пока commit `1a037b9` не будет отдельно задеплоен и проверен

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
- фикс сортировки чатов по latest activity уже включён в staging
- staging deploy до `1b8df3f` уже подтверждён владельцем проекта
- commit `1a037b9` пока в staging не подтверждён
- после `npm ci`, `npm run build`, `sudo systemctl restart tinychok-staging` и `sudo rsync -av --delete dist/ /var/www/tinychok-staging/` владелец проекта подтвердил, что staging работает

## Последний подтверждённый change batch

Коммит `1b8df3f` (`Polish mobile composer and refresh staging docs`) сейчас является текущей точкой старта в `origin/codex/staging-deploy`.

До него staging уже был подтверждён на `4fde821`, а `1b8df3f` добавляет поверх этого следующий пакет изменений:

- mobile/narrow chat composer:
  - кнопка `Назад` уже переделана в стрелку и поставлена левее аватарки
  - кнопка `Отправить` заменена на компактную стрелку вправо
  - поле ввода переведено в однострочный auto-grow до половины экрана
  - после отправки фокус возвращается в поле
  - кнопка отправки скрывается, если нет текста и вложения
- mobile alignment polish:
  - скрепка переносится влево внутри поля ввода
  - send-кнопка и скрепка центрируются относительно поля
  - уменьшен лишний нижний воздух в composer на узком экране
- pending delivery indicator:
  - `hourglass-24.gif` заменён на статичную `hourglass-48.png`
  - delivery-иконки предзагружаются заранее, чтобы offline pending-state не показывал пустую картинку
- staging docs обновлены под текущий runbook
- добавлен repo-скрипт `scripts/deploy-staging.sh` для стандартного staging deploy

Ключевые изменённые файлы:

- `scripts/deploy-staging.sh`
- `package.json`
- `src/App.tsx`
- `src/App.css`
- `src/components/SelectedBubbleOverlay.tsx`
- `src/rooms/DirectChatRoom.tsx`
- `src/rooms/GroupRoom.tsx`
- `src/rooms/SubscriptionChannelRoom.tsx`
- `docs/next-branch-handoff.md`
- `docs/staging-rollout-status.md`
- `docs/staging-access-guard.md`
- `public/icons/hourglass-48.png`

Operational note:

- staging VM сейчас последне подтверждённо была на `1b8df3f`
- для следующей выкладки теперь можно использовать либо ручную последовательность, либо `bash scripts/deploy-staging.sh`

## Текущий непроверенный batch в ветке

После подтверждённого staging commit `1b8df3f` в ветке уже лежит новый продуктовый batch `1a037b9` (`Refine channel and group messaging flows`).

В него входят:

- group room:
  - у входящих сообщений участника рендерится уменьшенная аватарка
  - premium crown и online-dot выводятся рядом с именем отправителя
  - у своих сообщений в группе появилась возможность удаления
- channel management:
  - действия `Передать` и `Удалить канал` убраны под кнопку `Управление`
  - кнопка `Управление` перенесена вниз рядом с `Назад`
  - исправлен popover редактирования названия канала: поле снова фокусируется и доступно для ввода
- channel links:
  - прямая ссылка канала переведена на формат `@handle`
  - handle автогенерируется из названия с `_` вместо пробелов
  - при конфликте автоматически добавляется числовой суффикс
  - старые URL формата `https://.../c/...` мягко нормализуются в `@handle`
- linked channel bubbles:
  - standalone `@channel_handle` в сообщении превращается в кликабельную плашку канала
  - по нажатию открывается подписанный канал или preview канала

Этот batch уже собран локально через `npm run build`, но staging-подтверждения для него ещё нет.

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

- `git rev-parse --short HEAD`
- `sudo systemctl status tinychok-staging --no-pager`
- `sudo journalctl -u tinychok-staging -n 50 --no-pager`
- `sudo systemctl status nginx --no-pager`
- `curl -s https://api.staging.tinychok.ru/healthz`
- `curl -s https://api.staging.tinychok.ru/readyz`
- `curl -I https://staging.tinychok.ru`

Если нужно повторно применить frontend/backend deploy после нового merge:

```bash
cd /home/devis/tinychok
git fetch origin
git checkout codex/staging-deploy
git pull origin codex/staging-deploy
npm ci
npm run build
sudo systemctl restart tinychok-staging
sudo rsync -av --delete dist/ /var/www/tinychok-staging/
```

Альтернатива тем же шагам одним запуском на staging VM:

```bash
cd /home/devis/tinychok
bash scripts/deploy-staging.sh
```

Если хочется запуск без `cd`, есть разовая установка wrapper-команды:

```bash
cd /home/devis/tinychok
bash scripts/install-staging-deploy-command.sh
```

После этого deploy можно запускать из любой директории:

```bash
tinychok-staging-deploy
```

## Какие секреты уже существуют, но не должны храниться в репозитории

- `POSTGRES_PASSWORD` для `tinychok_app`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- пароль `nginx basic auth` для `staging.tinychok.ru`

Эти значения уже есть у владельца проекта, но их нельзя писать в git или чат.

## Как продолжать работу

- базовый staging rollout уже закрыт
- access guard уже включён и после последней выкладки не менялся
- текущая подтверждённая staging-точка старта: `1b8df3f`
- следующий непроверенный batch для deploy: `1a037b9`
- следующую работу выбирать уже из продуктовых/bugfix задач, а не из базовой staging-инфраструктуры
- после следующего подтверждённого deploy обновлять этот файл, если commit staging-состояния поменялся

Для ручных инструкций человеку использовать формат из [docs/collaboration-instructions.md](docs/collaboration-instructions.md).
