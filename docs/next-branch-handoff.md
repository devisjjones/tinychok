# Next Branch Handoff

Короткая точка продолжения для следующего треда или новой ветки.

## Git state

- рабочая ветка: `codex/staging-deploy`
- последний уже запушенный commit в `origin/codex/staging-deploy`: `55304e7`
- commit message: `Add thread inbox and polish messaging flows`
- последняя подтверждённая staging-выкладка: `1b8df3f`
- подтверждённый staging message: `Polish mobile composer and refresh staging docs`
- текущий staging-кандидат для следующего push/deploy: локальный cumulative batch поверх `55304e7`
- рабочее дерево сейчас не чистое: в нём лежат product/server/docs правки из текущего batch
- `public/svf/` по-прежнему не должен попадать в commit / push / deploy

## Что уже подтверждено по staging

- staging backend live на `https://api.staging.tinychok.ru`
- staging frontend live на `https://staging.tinychok.ru`
- frontend и backend крутятся на VM `tinychok-staging-1`
- `nginx` настроен
- HTTPS выпущен для `staging.tinychok.ru` и `api.staging.tinychok.ru`
- `staging.tinychok.ru` закрыт через `nginx basic auth`
- backend staging ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES`
- последняя подтверждённая staging-выкладка всё ещё `1b8df3f`
- весь stack после `1b8df3f`, включая `55304e7` и текущий локальный batch поверх него, пока не подтверждён на staging

## Что уже было в `55304e7`

- весь накопленный product stack после `1b8df3f` до `4ad9b0b`
- follow-up UI / UX batch по тредам, reply-flow, channel/group UX и иконкам
- thread inbox / thread subscription layer
- инженерный batch по refactor / optimistic delivery / `clientDeliveryId`
- infra layer под analytics и captcha

## Что добавляет текущий локальный batch поверх `55304e7`

- server-driven history window:
  - при входе в direct / group / channel не показывается вся история сразу
  - стартовое окно даёт `сегодня + вчера`, либо последние активные дни, но минимум `10` последних сообщений
  - старая история догружается при скролле вверх через отдельные backend endpoint-ы
- day divider:
  - в active room есть разделитель начала суток
  - divider показывает полную дату с годом
- fixture / sorting fixes:
  - тестовые сообщения / посты / комментарии разнесены по разным датам
  - локальная dev-база умеет backfill-ить старые fixture `createdAt`
  - сортировка чатов / групп / каналов снова должна смотреть на реальную последнюю активность
- test-account hygiene:
  - для `+79673215453` backend больше не откатывает вручную изменённые профильные поля к seeded `Мира`
  - self-dialog test-аккаунта не должен появляться заново
- owner flows канала:
  - под названием канала показывается количество подписчиков
  - владелец может открыть список подписчиков с поиском
  - владелец виден как подписчик с тегом `Владелец`
  - владелец может удалить подписчика или отправить его в blacklist комментариев канала
  - вместо `Поделиться` в menu канала используется `Пригласить подписаться`
  - приглашение приходит в direct chat как сообщение с lead text `Пользователь приглашает вас подписаться на канал:`
- emoji picker:
  - рядом с `attach` появилась кнопка `smile.png`
  - по умолчанию открывается компактный позитивный набор
  - внизу picker есть широкая кнопка `Весь набор`
  - полный набор рендерится локальным `Noto Color Emoji`

## Что нужно отдельно smoke-check-нуть на следующем staging deploy

- thread inbox:
  - badge на кнопке `Треды`
  - список тредов с unread
  - `Подписаться` / `Отписаться` в самом треде
  - автоподписка после отправки комментария
- lazy history:
  - direct / group / channel открываются со свежим хвостом истории
  - старая история догружается при скролле вверх
  - day divider показывает корректную дату с годом
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

## Рекомендованная точка старта для новой ветки

- branch from: текущий `HEAD` ветки `codex/staging-deploy`
- recommended name: `codex/staging-followup`
