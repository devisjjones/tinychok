# Staging Rollout Status

Короткий статус staging-контура по состоянию на `2026-03-23`.

## Что уже подтверждено

- staging VM: `tinychok-staging-1`
- staging frontend live на `https://staging.tinychok.ru`
- staging backend live на `https://api.staging.tinychok.ru`
- backend работает как `systemd` service `tinychok-staging.service`
- `nginx` настроен как reverse proxy для API и как отдача frontend-статики
- HTTPS выпущен для `staging.tinychok.ru` и `api.staging.tinychok.ru`
- browser requests идут на `https://api.staging.tinychok.ru`
- websocket подключается к `wss://api.staging.tinychok.ru/ws`
- staging VM подтверждённо была обновлена до commit `1b8df3f`
- latest confirmed deploy sequence:
  - `npm ci`
  - `npm run build`
  - `sudo systemctl restart tinychok-staging`
  - `sudo rsync -av --delete dist/ /var/www/tinychok-staging/`
- владелец проекта после той выкладки подтвердил статус: `Всё работает`

## Текущий кандидат на следующую staging-выкладку

- последний уже запушенный candidate в `origin/codex/staging-deploy`: `55304e7`
- поверх `55304e7` локально уже лежит новый cumulative batch, ещё не запушенный и не подтверждённый на staging
- staging по-прежнему нельзя считать актуальной по текущему branch state, пока не будет отдельно задеплоен и проверен весь stack после `1b8df3f`

## Что уже включает `55304e7`

- весь product stack `1a037b9 -> 30a8256 -> 2bf7a1e -> a21f0d1 -> a6be3d3 -> 27646e7 -> 4ad9b0b`
- docs refresh `59bf0f1`
- thread inbox / thread subscription layer
- partial refactor `App.tsx` в feature hooks
- optimistic delivery и `clientDeliveryId`
- analytics / captcha groundwork
- reply-flow / avatar / sorting / icon polish fixes

## Что добавляет текущий локальный batch поверх `55304e7`

- history window:
  - bootstrap direct / group / channel больше не тянет всю историю комнаты целиком
  - стартовое окно строится по правилу `сегодня + вчера`, либо по последним активным дням, но минимум `10` последних сообщений
  - старая история догружается через backend endpoint-ы при скролле вверх
- conversation day divider:
  - direct / group / channel ленты получили разделитель начала суток
  - divider показывает полную дату с годом
- fixtures and sorting:
  - тестовые сообщения / посты / комментарии распределены по разным датам
  - старые fixture-данные умеют backfill-иться в локальной dev-базе
  - сортировка списков должна смотреть на реальную дату активности, а не только на часы в превью
- test account cleanup:
  - для `+79673215453` убран rollback профиля к seeded `Мира`
  - self-dialog test-аккаунта больше не должен создаваться заново
- channel subscriber management:
  - владелец канала видит кликабельное количество подписчиков
  - доступны поиск, удаление подписчика и blacklist комментариев канала
  - invite flow заменил `Поделиться` на `Пригласить подписаться`
  - приглашение приходит в личный чат как сообщение с подписью `Пользователь приглашает вас подписаться на канал:`
- emoji picker:
  - рядом с `attach` появилась кнопка `smile.png`
  - по умолчанию показывается компактный позитивный набор
  - кнопка `Весь набор` раскрывает полный набор эмодзи
  - для рендера подключён локальный `Noto Color Emoji`

## Access guard status

- basic auth включён на `https://staging.tinychok.ru`
- `curl -I https://staging.tinychok.ru` должен возвращать `401 Unauthorized`
- backend staging ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES`
- ни `55304e7`, ни текущий локальный batch поверх него не должны ослаблять эти ограничения

Подробности лежат в [docs/staging-access-guard.md](docs/staging-access-guard.md).

## Что обязательно smoke-check-нуть при следующем deploy

- thread inbox:
  - список тредов
  - unread badge
  - `Подписаться` / `Отписаться`
- lazy history:
  - direct / group / channel открываются со свежим хвостом истории
  - старая история догружается при скролле вверх
  - divider показывает корректную дату с годом
- channel owner flows:
  - список подписчиков канала
  - поиск
  - `Удалить подписчика`
  - `В чёрный список`
  - invite flow `Пригласить подписаться`
- emoji picker:
  - direct / group / channel / thread composer
  - compact set
  - `Весь набор`

## Базовый deploy flow на staging VM

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

Если используется repo-скрипт:

```bash
cd /home/devis/tinychok
bash scripts/deploy-staging.sh
```
