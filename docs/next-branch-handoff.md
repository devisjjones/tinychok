# Next Branch Handoff

Короткая точка продолжения для следующего треда или новой ветки.

## Git state

- рабочая ветка: `codex/staging-deploy`
- последний уже запушенный commit в `origin/codex/staging-deploy`: `80346d7`
- commit message: `Add staging-safe delete fallbacks`
- последняя подтверждённая staging-выкладка: `1b8df3f`
- подтверждённый staging message: `Polish mobile composer and refresh staging docs`
- текущий staging-кандидат для следующего deploy: текущий `HEAD` ветки `codex/staging-deploy` после photo / attachment batch
- рабочее дерево перед следующим commit / push уже не чистое: в нём лежит image attachment batch и актуализация docs
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
- весь stack после `1b8df3f`, включая `55304e7`, `f0ebbd1`, `ca1459e`, `4b7cc5c` и `80346d7`, пока не подтверждён на staging

## Что уже было в `55304e7`

- весь накопленный product stack после `1b8df3f` до `4ad9b0b`
- follow-up UI / UX batch по тредам, reply-flow, channel/group UX и иконкам
- thread inbox / thread subscription layer
- инженерный batch по refactor / optimistic delivery / `clientDeliveryId`
- infra layer под analytics и captcha

## Что уже добавлено поверх `55304e7`

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
- profile save staging fix:
  - `PUT /api/session` получил staging-safe fallback через `POST /api/session`
  - это закрывает transport-level `Failed to fetch` при сохранении настроек аккаунта за reverse proxy
- delete consistency fixes:
  - server-side `saveSnapshot` больше не имеет права возвращать timeline data из stale client snapshot
  - сообщения / посты / комментарии должны оставаться server-authoritative
  - delete-path на клиенте теперь умеет fallback `DELETE -> POST`
  - backend принимает `POST`-aliases для delete endpoint-ов
  - это было добавлено именно после staging-бага, где удалённые сообщения возвращались после повторного входа в комнату
- photo / attachment batch:
  - composer attachment flow переписан под локальный preview до отправки
  - image upload больше не происходит в момент выбора файла: сначала локальный draft, потом upload только в send-path
  - клиент сжимает `jpeg/png/webp` перед отправкой: длинная сторона до `1600px`, re-encode в `webp`, fallback в `jpeg`
  - premium-переключатель `Отправить без сжатия` открывает existing premium upsell для non-premium и для premium отправляет original file
  - photo preview и image viewer работают в direct / group / channel / thread
  - server-side media validation дополнительно проверяет image mime и сигнатуры `jpeg/png/webp`
  - image message bubble теперь разделён на верхний photo-block и нижний info/text block
  - в metadata фото теперь хранятся `width/height`, чтобы в UI можно было показывать `вес, размер фото`

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
- photo attachments:
  - direct / group / channel / thread composer
  - preview до отправки
  - remove вложения до отправки
  - отправка `только фото`
  - отправка `текст + фото`
  - non-premium tap по `Отправить без сжатия`
  - premium upload original без сжатия
  - fullscreen image viewer
  - unsupported image format / oversized file дают понятную ошибку
- delete flow:
  - удалить сообщение в личке
  - удалить сообщение в группе
  - удалить пост в канале
  - удалить комментарий в треде
  - после каждого удаления выйти из комнаты и зайти снова
  - убедиться, что сообщение не возвращается после повторного входа и reload

## Рекомендованная точка старта для новой ветки

- branch from: текущий `HEAD` ветки `codex/staging-deploy`
- recommended name: `codex/staging-followup`
