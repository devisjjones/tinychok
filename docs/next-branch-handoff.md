# Next Branch Handoff

Этот файл нужен как короткая точка продолжения, если работа переносится в новую ветку или новый тред.

## Git state

- текущая рабочая ветка для staging deploy: `codex/staging-deploy`
- текущий актуальный commit в `origin/codex/staging-deploy`: `4fde821`
- commit message: `Add legal pages and polish messaging UI`
- локальный `HEAD` и `HEAD` на staging VM перед новой задачей должны совпадать с `4fde821`

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
- deploy до `4fde821` на staging VM был применён `2026-03-21`
- после `npm ci`, `npm run build`, `sudo systemctl restart tinychok-staging` и `sudo rsync -av --delete dist/ /var/www/tinychok-staging/` владелец проекта подтвердил, что staging работает

## Последний подтверждённый change batch

Коммит `4fde821` (`Add legal pages and polish messaging UI`) сейчас является подтверждённой точкой старта и уже задеплоен на staging.

Что вошло в этот пакет изменений:

- добавлена отдельная страница `Пользовательское соглашение` и ссылка на неё из auth flow
- под кнопкой `Получить код` добавлен текст согласия с двумя документами
- ссылка на соглашение добавлена и в настройки рядом с privacy policy
- нижняя и верхняя панели получили обновлённые размеры и tint иконок
- нижняя кнопка каналов переведена на `news_settings.png`
- затемнение при открытом контекстном меню теперь работает через отдельный overlay выбранного сообщения, а не затемняет сам bubble
- для direct/group сообщений добавлены состояния delivery:
  - `pending` с `hourglass-24.gif`
  - `delivered` с `double-tick-50.png`
  - `failed` с `warning-48.png`
  - retry/delete actions для failed сообщения
- для direct chat добавлен реальный read receipt:
  - backend сохраняет `readAt`
  - исходящее сообщение светлеет после фактического прочтения собеседником
- compact direct chat cards в списке чатов были переработаны:
  - убран preview последнего сообщения
  - карточки и аватары стали компактнее
  - online-dot перенесён на правый нижний угол аватара
  - справа теперь показывается либо typing animation, либо unread badge, либо время последнего сообщения
  - unread badge растягивается для двухзначных значений и ограничивается отображением `99+`

Ключевые изменённые файлы:

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
- `public/icons/news_settings.png`
- `public/icons/hourglass-24.gif`
- `public/icons/check-mark-50.png`
- `public/icons/double-tick-50.png`
- `public/icons/warning-48.png`

Operational note:

- staging VM уже подтянута до `4fde821`
- сборка и выкладка на staging были подтверждены `2026-03-21`
- ручной smoke-check владельцем проекта после выкладки: `Всё работает`

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

## Какие секреты уже существуют, но не должны храниться в репозитории

- `POSTGRES_PASSWORD` для `tinychok_app`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- пароль `nginx basic auth` для `staging.tinychok.ru`

Эти значения уже есть у владельца проекта, но их нельзя писать в git или чат.

## Как продолжать работу

- базовый staging rollout уже закрыт
- access guard уже включён и после последней выкладки не менялся
- текущая подтверждённая staging-точка старта: `4fde821`
- следующую работу выбирать уже из продуктовых/bugfix задач, а не из базовой staging-инфраструктуры
- после следующего подтверждённого deploy обновлять этот файл, если commit staging-состояния поменялся

Для ручных инструкций человеку использовать формат из [docs/collaboration-instructions.md](docs/collaboration-instructions.md).
