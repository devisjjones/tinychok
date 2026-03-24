# Staging Rollout Status

Короткий статус staging-контура по состоянию на `2026-03-24`.

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

- последний уже запушенный candidate в `origin/codex/staging-deploy`: `80346d7`
- `80346d7` уже включает весь накопленный batch поверх `55304e7`
- локально ветка уже ушла дальше `80346d7`: текущий `HEAD` содержит photo / attachment batch и свежую актуализацию docs
- staging по-прежнему нельзя считать актуальной по текущему branch state, пока не будет отдельно задеплоен и проверен весь stack после `1b8df3f`

## Что уже включает `55304e7`

- весь product stack `1a037b9 -> 30a8256 -> 2bf7a1e -> a21f0d1 -> a6be3d3 -> 27646e7 -> 4ad9b0b`
- docs refresh `59bf0f1`
- thread inbox / thread subscription layer
- partial refactor `App.tsx` в feature hooks
- optimistic delivery и `clientDeliveryId`
- analytics / captcha groundwork
- reply-flow / avatar / sorting / icon polish fixes

## Что уже добавлено поверх `55304e7`

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
- profile save staging fix:
  - `PUT /api/session` получил fallback через `POST /api/session`
  - это закрывает transport-level `Failed to fetch` при сохранении настроек аккаунта на staging
- delete-path hardening:
  - server-side `saveSnapshot` больше не может воскрешать timeline data из stale client snapshot
  - delete endpoint-ы получили staging-safe `POST` aliases
  - frontend delete-path теперь умеет fallback `DELETE -> POST`
  - это было добавлено после staging-бага, где удалённые сообщения возвращались после повторного входа в канал / группу / тред / личку
- photo / attachment pipeline:
  - attach-photo flow больше не отправляет файл сразу после выбора
  - composer строит локальный preview через `blob:` URL и чистит его после remove / send
  - клиент сжимает `jpeg/png/webp` перед отправкой в MVP-формат
  - premium-переключатель `Отправить без сжатия` для premium отправляет original file, для non-premium открывает premium upsell
  - image attachments работают в direct / group / channel / thread
  - server-side media layer дополнительно валидирует image mime и сигнатуру файла
  - photo message bubble разделён на верхний image block и нижний info/text block
  - metadata photo preview / message теперь умеют показывать `вес, ширина×высота`

## Access guard status

- basic auth включён на `https://staging.tinychok.ru`
- `curl -I https://staging.tinychok.ru` должен возвращать `401 Unauthorized`
- backend staging ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES`
- ни `80346d7`, ни предыдущие commits поверх `1b8df3f` не должны ослаблять эти ограничения

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
- photo attachments:
  - attach photo в direct / group / channel / thread
  - preview до отправки
  - `только фото`
  - `текст + фото`
  - remove до отправки
  - premium / non-premium поведение `Отправить без сжатия`
  - image viewer по tap на фото
  - error path для oversized / unsupported image
- delete consistency:
  - удалить сообщение в direct
  - удалить сообщение в group
  - удалить post в channel
  - удалить thread comment
  - после каждого удаления выйти из комнаты и зайти снова
  - сделать hard reload страницы и убедиться, что deleted item не вернулся

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
