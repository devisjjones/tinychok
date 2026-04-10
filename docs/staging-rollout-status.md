# Staging Rollout Status

Короткий runbook по текущему staging-контуру. Документ описывает только текущее устройство контура, обязательные проверки и стандартный deploy flow.

Отдельный анти-долговый чеклист по самому rollout-процессу лежит в [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md).

## Staging Contour

- staging frontend: `https://staging.tinychok.ru`
- staging admin frontend: `https://admin.staging.tinychok.ru`
- staging backend: `https://api.staging.tinychok.ru`
- websocket: `wss://api.staging.tinychok.ru/ws`
- backend работает как `systemd` service `tinychok-staging.service`
- user frontend и admin frontend отдаются как статические Vite-сборки через `nginx`
- backend и frontend используют один staging state store
- `readyz.storage.layout` должен явно показывать текущий runtime storage layout:
  - `state-store` для legacy режима
  - `hybrid-normalized` для нового postgres slim-state + text tables режима

## Access Model

- frontend staging по умолчанию закрыт через `nginx basic auth`
- admin staging тоже должен быть закрыт через `nginx basic auth`
- backend staging дополнительно ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES`
- эти два уровня нельзя ослаблять ради UI-фиксов, upload flow или realtime
- критичный anti-regression контракт:
  - staging frontend нельзя выкатывать из результата plain `npm run build`
  - только `npm run build:staging`
  - иначе frontend теряет `api.staging` / `wss://api.staging` и начинает ходить в same-origin `/api`
  - это снова открывает basic-auth popup в Chrome и выглядит как "staging перестал пускать"

Подробности guard-а лежат в [docs/staging-access-guard.md](/Users/devisjjones/Documents/tinychok/docs/staging-access-guard.md).

### Temporary Review Exception

- с `2026-04-07` public frontend `https://staging.tinychok.ru` временно открыт без user `basic auth`, чтобы отдать сайт на внешний review без логин/пароль prompt
- это временное исключение, а не новый staging-контракт
- `https://admin.staging.tinychok.ru` остаётся за `basic auth`
- backend allowlist и SmartCaptcha не отключались
- после окончания review окно нужно закрыть обратно:
  - раскомментировать `auth_basic` и `auth_basic_user_file` в `/etc/nginx/sites-available/tinychok-staging-web`
  - `sudo nginx -t`
  - `sudo systemctl reload nginx`

## What Staging Must Validate

### Staging Auth Loop Guard

- в обычном guard-режиме staging root с `tinychok / 1111` должен открываться без повторного endless basic-auth prompt
- smoke-check после каждой frontend выкладки:
  - `npm run build:staging`
  - в обычном guard-режиме: `curl -u tinychok:1111 https://staging.tinychok.ru/api/client-config`
  - во временном review-режиме c `2026-04-07`: `curl https://staging.tinychok.ru/api/client-config`
  - expected result = JSON runtime config, а не `index.html`
  - `curl https://staging.tinychok.ru/api/bootstrap`
  - expected result = обычный JSON `401` от backend при отсутствии bearer token, а не `nginx` basic-auth HTML
- если `staging.tinychok.ru/api/client-config` отдаёт HTML:
  - это значит, что web-host снова начал fallback-ить `/api/*` в `index.html`
  - staging build/deploy нужно считать сломанным
- если frontend уже загрузился, но Chrome снова открывает окно логина:
  - первым делом проверять access log на `401` по `/api/bootstrap`, `/api/client-config`, `/icons/*`
  - это почти всегда означает wrong staging dist or broken `/api` proxy contract
- если в интерфейсе внезапно пропадает иконка без кодовой правки JSX:
  - первым делом проверять права на исходный asset в `public/icons/*`
  - staging static icons должны быть world-readable (`0644`), иначе `nginx` не сможет их отдать после rsync/deploy
  - типичный симптом = broken image только у одной кнопки при полностью рабочем остальном frontend
- favicon / Safari web-app smoke-check после frontend deploy:
  - `curl -I https://staging.tinychok.ru/manifest.webmanifest`
  - expected `Content-Type: application/manifest+json`
  - `curl -I https://staging.tinychok.ru/apple-touch-icon.png`
  - expected `Content-Type: image/png`
  - `curl -I https://staging.tinychok.ru/favicon-32x32.png`
  - expected `Content-Type: image/png`
- в avatar picker для профиля, группы и канала нижний action-row должен оставаться разнесённым:
  - `Отмена` слева
  - `Применить` справа

### Staging Analytics Guard

- staging analytics считаются release-blocking runtime-контрактом:
  - `analytics.enabled` должен быть `true`
  - `analytics.provider` должен быть `log`
  - `metricaCounterId` должен быть положительным числом
- это нужно проверять не только по env template, но и по живому `GET https://api.staging.tinychok.ru/api/client-config`
- deploy staging должен падать, если runtime config внезапно отдаёт:
  - `analytics.enabled=false`
  - `provider=disabled`
  - `metricaCounterId=null`
- staging runtime также должен падать, если counter id отличается от ожидаемого staging значения `108249405`
- причина такого падения обычно не в frontend, а в перетёртом `/etc/tinychok/tinychok-staging.env`
- обязательные analytics keys для staging env:
  - `TINYCHOK_ANALYTICS_ENABLED=true`
  - `TINYCHOK_ANALYTICS_PROVIDER=log`
  - `TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS=5000`
  - `TINYCHOK_ANALYTICS_MAX_BATCH_SIZE=20`
  - `TINYCHOK_YANDEX_METRICA_COUNTER_ID=<real counter id>`
- после каждой env-правки или restart smoke-check:
  - `curl -s https://api.staging.tinychok.ru/api/client-config`
  - expected result = JSON with positive `analytics.metricaCounterId`
  - открыть staging с `?analytics_debug=1` и убедиться, что в console есть `pageview` / `event`
- единый список release-blocking runtime-контрактов лежит в [docs/release-contracts.md](/Users/devisjjones/Documents/tinychok/docs/release-contracts.md)

### Tariff Limit Smoke Checks

- лимит создания групп нельзя считать выкаченным только потому, что:
  - `npm test` зелёный
  - `dist-server/index.js` содержит нужные строки
  - `systemctl status` показывает свежий restart
- обязательный smoke-check для этой зоны:
  - взять free test-account, у которого уже больше `5` активных групп
  - сделать живой `POST /api/groups`
  - expected result = `400` с продуктовой ошибкой про лимит, а не `200`
  - открыть create-group modal у free-аккаунта и проверить, что CTA `Открыть премиум` держит crown inline-centered, без vertical drift и без прилипания к тексту
- staging уже ловил operational-баг, когда:
  - новый код с лимитом был на VM
  - локальный debug через `TinychokStore` правильно резал создание
  - но публичный `api.staging.tinychok.ru` всё ещё отвечал старым поведением до жёсткого restart
- если live API smoke-check не совпадает с локальным store-debug на VM, rollout нужно считать недокатившимся и повторять:
  - `npm run build:staging`
  - `sudo systemctl restart tinychok-staging`
  - `sudo rsync -av --delete dist/ /var/www/tinychok-staging/`
  - повторный прямой `POST /api/groups`

### PostgreSQL Runtime Layout Guard

- staging postgres runtime больше не должен раздувать один giant `app_runtime_state.payload` history-heavy и high-churn данными
- при новом layout backend хранит slim state в `app_runtime_state`, а вынесенные коллекции кладёт в отдельные таблицы:
  - `app_runtime_state_dialog_messages`
  - `app_runtime_state_group_messages`
  - `app_runtime_state_groups`
  - `app_runtime_state_subscription_channels`
  - `app_runtime_state_subscription_posts`
  - `app_runtime_state_support_tickets`
  - `app_runtime_state_thread_states`
  - `app_runtime_state_ip_access_logs`
  - `app_runtime_state_admin_audit_logs`
  - `app_runtime_state_archived_media`
  - `app_runtime_state_pending_group_invitations`
  - `app_runtime_state_pending_channel_invitations`
  - `app_runtime_state_pending_media_uploads`
  - `app_runtime_state_account_status_histories`
- rollout этого storage-step нельзя считать безопасным, если backend не умеет per-collection bootstrap из старого slim payload:
  - пустая новая hybrid-таблица не должна перетирать данные legacy payload
  - после первого успешного persist backend обязан переписать эти коллекции в новые таблицы
- обязательный smoke-check после restart:
  - `curl -s https://api.staging.tinychok.ru/readyz`
  - expected result includes `"layout":"hybrid-normalized"` inside `storage`
- если `readyz` всё ещё показывает `state-store`, rollout нужно считать недокатившимся даже при зелёных `healthz` и `npm test`

#### Staging Full Hybrid Cutover — 2026-04-08

- полный hybrid rollout на живом staging уже выполнен и подтверждён вручную
- перед cutover был снят backup postgres:
  - `/home/devis/backups/tinychok-pre-full-hybrid-20260408-123059.dump`
- для безопасной сверки на staging временно поднята restore-таблица:
  - `app_runtime_state_restore`
- после rollout slim `app_runtime_state.payload` уже пустой для hybrid-коллекций, а source of truth живёт в отдельных таблицах
- сверенные restore/live counts после cutover:
  - `groups`: `19 -> 19`
  - `subscription_channels`: `20 -> 20`
  - `thread_states`: `17 -> 17`
  - `admin_audit_logs`: `156 -> 156`
  - `archived_media`: `28 -> 28`
  - `pending_group_invitations`: `19 -> 19`
  - `pending_channel_invitations`: `1 -> 1`
  - `pending_media_uploads`: `72 -> 72`
  - `account_status_histories`: `3 -> 3`
  - `ip_access_logs`: `52 -> 54`
- `ip_access_logs` выросли на `+2` уже после cutover, это считается healthy-признаком: новые live events пишутся в новую hybrid-таблицу
- live bootstrap после cutover подтверждён реальными staging сессиями:
  - `+79673215453` → `chats=3`, `groups=7`, `subscriptionChannels=1`, `threadInbox=4`, `supportTickets=6`
  - `+79673215451` → `chats=3`, `groups=7`, `subscriptionChannels=5`, `threadInbox=2`, `supportTickets=6`
- до prod rollout не удалять:
  - backup dump `/home/devis/backups/tinychok-pre-full-hybrid-20260408-123059.dump`
  - restore-таблицу `app_runtime_state_restore`
- prod rollout нужно считать завершённым только после трёх подтверждений:
  - `readyz.storage.layout = hybrid-normalized`
  - slim payload пустой для hybrid-коллекций
  - живой bootstrap хотя бы двух разных аккаунтов отдаёт непустые пользовательские данные

### Legal Pages And Checkout Documents

- `user-agreement.html`, `privacy-policy.html`, `premium-terms.html` и `contacts.html` считаются release-blocking public pages
- на staging нужно проверять:
  - legal pages открываются как отдельные static routes
  - `Скачать` и `Открыть PDF` ведут в соответствующий публичный PDF
  - support email = `tinychok.help@yandex.com`
  - operator requisites совпадают с `Контакты и реквизиты`
  - в `Контактах и реквизитах` нет отдельного блока `Для YooKassa`
  - `Пользовательское соглашение` и `Политика` используют дату `31.03.2026`
  - `Условия Premium` используют дату `31.03.2026`
- premium checkout smoke:
  - на экране покупки premium есть ссылка на `Условия Premium`
  - под CTA есть короткий текст согласия `Нажимая «Купить»...` со ссылкой на `Условия Premium`
  - `Условия Premium` и `premium-terms.pdf` отражают текущие тарифы `199 ₽ / 30 дней` и `1390 ₽ / 365 дней`
  - `Условия Premium` явно говорят, что premium — это цифровой доступ без физической доставки
- любые изменения публичных legal pages требуют:
  - обновить HTML/text source
  - обновить PDF asset
  - прогнать static regression tests
  - перепроверить staging public URLs вручную

### Core Messaging

- bootstrap snapshot загружается без ошибок
- websocket подключается к staging API
- direct / group / channel открываются с актуальным хвостом истории
- optimistic send в direct/group:
  - pending bubble с hourglass не должен подскакивать выше подтверждённого хвоста и потом прыгать вниз после ack
  - при равном `createdAt` confirmed tail items всё равно должны оставаться раньше optimistic local ids `< 0`
  - even при более поздних server-created timestamps у уже подтверждённого хвоста visible room order должен сохранять локально собранный pending tail последним, а не пересортировывать его вверх по сырому `createdAt`
- spacing между bubble в room feeds:
  - direct, group и thread = `3px`
  - channel posts сохраняют более крупный gap и не должны выглядеть как обычный chat stream
- в открытом thread room:
  - между root/source card и первым комментарием обязан оставаться gap `12px`
  - этот gap нельзя добиваться общим `padding-top` у `.room-thread-feed`, чтобы не возвращать пустую полоску под source card при скролле
  - если root/source card состоит только из одного фото без подписи, `time` должно оставаться у правого края карточки, а не липнуть сразу после thumbnail
  - header и root/source card должны держать один и тот же светлый surface; на стыке не должно быть внутренних скруглений и коричневого `mine`-root под светлой шапкой
- group sender-chain в живом room feed:
  - sender-strip показывается только на первом сообщении подряд идущей цепочки автора
  - thread comments повторяют тот же sender-strip contract и не держат имя/аватар внутри самого bubble
  - group root/source card внутри открытого треда тоже держит sender-strip снаружи bubble для текстового сообщения
  - same-author continuation идёт с gap `3px`
  - при смене автора gap возвращается к `12px`
  - sender-strip выровнен по левой линии bubble, без лишнего inset
  - captioned media bubble не должен раздувать header-strip: у avatar/name над фото остаётся компактная высота без лишнего верхнего воздуха
  - media-only photo bubble тоже держит компактный white sender-header: без лишнего верхнего и нижнего воздуха над фото
- selected message overlay в room feed:
  - если сообщение визуально включает sender-strip, selection anchor обязан мериться по полному видимому блоку, а не только по inner bubble
  - при нехватке места room feed может быть подскроллен, но overlay не должен дрейфовать отдельно от исходного сообщения
- standalone emoji contract:
  - top-level direct/group message из одного emoji без вложений и без source/forward chrome идёт без фонового bubble
  - emoji увеличен, а time/delivery meta остаётся бледной отдельной строкой
  - glyph-slot под emoji резервирует примерно две строки обычного текста, чтобы sender-strip в группе не наезжал сверху
  - channel posts, thread comments и reply/thread previews этот bubbleless path не используют
  - если group root-message получает первый комментарий, он должен вернуться к обычному bubbled виду
- карточки групп и каналов в левом списке должны держать одинаковую avatar-геометрию:
  - одинаковый размер и левый inset у avatar
  - одинаковое визуальное центрирование между левым краем карточки и началом текста
- group-card при этом остаётся компактнее по copy-ритму:
  - без лишнего воздуха сверху и снизу
  - с тем же межкарточным gap `3px`, что и у остального `chat-list`
- preview группы должен показывать не текстовое имя автора, а маленькую author-avatar + `:` + preview текста
- thread inbox card contract:
  - root avatar треда прижат к верхней линии карточки
  - у avatar есть нижний-right badge источника (`group` / `channel`) с mask-обводкой
  - отдельная строка `Группа:` / `Канал:` больше не показывается
  - preview последнего комментария = `mini-avatar + : + text`
  - счётчик комментариев остаётся отдельной строкой
- group sender-strip над incoming bubble должен визуально липнуть к своему bubble:
  - воздуха над strip должно быть больше, чем между strip и bubble
  - имя и crown выравниваются по нижней границе avatar
- внешний linkify-flow считается release-blocking UI-контрактом:
  - raw `http://` и `https://` в текстах сообщений/комментариев отображаются ссылками
  - bare domains без протокола не становятся ссылками
  - tap по ссылке открывает warning-modal, а не message-actions menu
  - modal обязан предупреждать о внешнем переходе и советовать не переходить по ссылкам от малоизвестных аккаунтов
  - `Перейти` открывает URL через новый tab с безопасным `noopener,noreferrer`
  - `@контакты`, `@каналы`, invite/source cards остаются на старой in-app логике
- контактные заявки — release-blocking контракт:
  - pending request не создаёт чат у получателя
  - pending request не создаёт обычный видимый чат у инициатора
  - `Контакты` делятся на `Заявки`, `Отправленные запросы` и `Контакты`
  - верхнее меню `Контактов` использует отдельный трёхвкладочный switch `Все / Новые заявки / Отправленные заявки`
  - второй и третий tabs в этом switch рендерятся иконками `handshake.png` и `man-raising-hand.png`, а не текстом
  - badge у верхних tabs `Контактов` рендерятся внутри кнопки справа от иконки, а не в углу
  - badge у верхних tabs `Контактов` прижимаются к правому краю кнопки, а иконка не сдвигается
  - этот switch не должен переиспользовать `quickFilters` из `Диалогов`
  - `Заявки` показывают только входящие pending requests
  - `Отправленные запросы` показывают только исходящие pending requests и скрываются, если список пуст
  - во вкладке `Все` секция `Заявки` скрыта, если входящих pending requests нет
  - tap по входящей заявке открывает общую direct-room с историей
  - у входящей request-card иконка `handshake` работает как отдельная быстрая кнопка `Подтвердить контакт`
  - tap по исходящей заявке открывает ту же hidden direct-room с историей
  - открытие request-room из `Контактов` не должно переводить пользователя в `Диалоги`
  - `pending-incoming` решается только в комнате через полноширинные composer actions
  - `pending-outgoing` решается только в комнате через нейтральную полноширинную кнопку `Отменить заявку`
  - входящие request cards используют `handshake.png`
  - исходящие request cards используют `man-raising-hand.png`
  - empty-state секции `Заявки` = только технадпись `Заявок пока нет`, без белой chat-card
  - direct dialog existence не равно accepted contact
  - обычная direct-доставка разрешена только для `accepted` contact link
  - client-side contacts flow изолирован от общего chat-list UI и не должен возвращаться в разрозненные ветки `App.tsx`
  - accept создаёт system message `Контакт установлен` и unread/notification у инициатора
  - cancel убирает карточку у получателя из `Заявки`, у инициатора из `Отправленные запросы` и возвращает CTA `Отправить запрос`
  - нижняя кнопка `Контакты` считает только входящие заявки
  - при `Тихо` visual badge у `Контактов` скрываются и на нижней кнопке, и на верхних tabs
  - счётчик вкладки `Отправленные заявки` не должен влиять на bottom-nav badge
  - верхние фильтры `Диалогов` используют inline badge внутри кнопки, а не corner badge
  - delete contact hides both sides but keeps per-side direct history
  - former contact reopens through search with request CTA until accept
  - hidden former contact must still appear in search results for both sides
  - repeated delete -> search -> reopen -> accept cycles must keep working without creating a fresh empty dialog
- read-state invariant — критичная проверка:
  - если direct / group / channel открыт и видим пользователю, новые входящие должны сразу считаться прочитанными
  - после выхода из комнаты badge не должен показывать уже прочитанные вживую сообщения
- group join history smoke:
  - default group setting = новые участники видят историю группы до вступления
  - если в настройках группы выключить `Отображать историю группы новым пользователям`, следующий приглашённый участник не должен видеть старые сообщения, отправленные до его вступления
- group media smoke:
  - photo/video bubble с подписью не должен показывать accent strip над media
  - top spacing над media допустим только если в bubble реально виден author header
  - media-only photo bubble не должен держать раздутую белую sender-плашку над фото
  - selected overlay bubble при long-press / tap не должен становиться выше базового bubble в ленте
- автоскролл вниз в room feed — критичная проверка:
  - opening room must land on the latest item
  - own send must always land on the latest item
  - incoming should auto-scroll only when already near bottom
  - prepend older history must preserve viewport
  - room feed scrollbar должен оставаться скрытым и не перекрывать bubbles
  - runtime DOM tests для room feed обязательны; static source-contract tests сами по себе недостаточны
- скролл вверх догружает старые страницы истории
- day divider показывает корректную дату

### Threads

- у тредов работают unread badge и inbox
- подписка и отписка треда меняют visibility в inbox
- комментарии не теряются после reload
- тред с `0 комментариев` не должен сам появляться в inbox, если пользователь на него явно не подписывался
- support-thread unread нужно проверять отдельно от `threadInbox`:
  - открытие тикета в `Настройки -> Поддержка` должно слать живой `POST /api/support/tickets/:ticketId/read`
  - badge у тикета и badge на `Написать в поддержку` должны сбрасываться после открытия треда
  - retention cleanup не должен вычищать `app_runtime_state_thread_states` для `support:%`, иначе unread поддержки возвращается после hard refresh
- простое открытие и чтение треда должно снимать unread до `0` без требования отправить свой комментарий
- server-side read marker треда не должен опираться только на timestamp:
  - same-millisecond комментарии не должны оставлять зависшее `unread = 1`
- пока тред открыт и видим пользователю, список тредов не должен дёргаться из-за stale unread-сортировки
- comments-room UI smoke:
  - root card тянется до тех же краёв, что и header comments-room
  - scrolling comments клипаются прямо по нижней границе root-card, без пустой полосы
  - thread inbox card reuse-ит avatar группы/канала-источника; placeholder initials допустим только без `avatarImage`
  - own group/comment bubbles не показывают отдельную строку `Вы`
  - bubble text/time layout остаётся compact и не раздувает высоту карточки лишним whitespace
  - короткий text bubble не должен получать отдельную вторую строку только из-за `time`
  - длинный text bubble держит `time` внутри самого bubble у правого нижнего края, а не выносит его в отдельный footer-row
  - тот же inline-meta contract должен держаться и у text-only root/source card, а не только у самих комментариев
  - bubble с комментариями и нижняя `thread-pill` визуально сливаются без возвращённого нижнего скругления у bubble
- admin archive smoke:
  - в admin detail треда есть `Архивировать тред` / `Разархивировать тред`
  - после архивации тред исчезает из user thread inbox и не открывается пользователю как comments-room
  - корневое сообщение при этом остаётся в основной группе/канале
  - после разархивации тот же тред и его комментарии возвращаются без пересоздания

### Support Chat

- `Написать в поддержку` открывается только из `Настроек`
- support-room не появляется в обычных `Диалогах`
- support root-scene и support-thread остаются plain-text composer surface
- root support-scene intentionally отличается от обычного direct/thread composer:
  - без внешней белой wrapper-card вокруг textarea
  - с увеличенным textarea для стартового описания проблемы
- в support root-scene и support-thread нельзя показывать emoji/GIF и file-attach:
  - допустимо только photo-attach
- textarea contract для этой зоны:
  - support-root textarea растёт по мере ввода новых строк
  - после достижения cap textarea скроллится внутренне и не забирает под себя всю высоту сцены
  - action buttons в idle state центрируются по высоте support-root textarea
  - после роста textarea action buttons прибиваются к правому нижнему углу
- в idle state обычный composer остаётся однострочным; enlarged support-root textarea этим не считается
- у обычного direct / group / channel / thread composer toolbar тоже двухсостояний:
  - однострочный idle state центрирует action buttons по высоте поля
  - expanded state и attachment preview возвращают action buttons в правый нижний угол
- reply preview в сообщениях теперь intentionally без author-label:
  - не показывать `Вы`, `Собеседник` или имя над quoted snippet
  - оставлять только текст / emoji цитируемого сообщения
- mobile smoke для этой зоны обязателен:
  - на `390px` composer должен полностью помещаться в viewport без horizontal overflow
- отправка root message создаёт `Тикет #N`
- первый тикет в чистом state получает номер `0`
- новый тикет стартует со статусом `Открыт`
- в admin queue новый тикет до первого открытия карточки показывается как `Новое`
- после открытия карточки admin status автоматически становится `Открыт`
- сразу второй root-ticket отправить нельзя: показывается cooldown `10 минут`
- во время cooldown новый тикет создать нельзя, но в тред существующего тикета можно дописать комментарий
- support-scene должен сам переключаться в cooldown-card сразу после успешной отправки root-ticket
- cooldown-card должен показывать только поясняющий текст, без отдельного видимого countdown-таймера
- сырой текст `Новую задачу для поддержки пока рано открывать.` не должен рендериться как user-facing ошибка
- ответы поддержки приходят не в общий feed, а только в комментарии соответствующего тикета
- unread ответ поддержки даёт badge/dot на кнопке `Написать в поддержку`
- unread ответ поддержки также дублируется на нижней кнопке `Настройки`
- badge на support-кнопке должен сидеть внутри самой кнопки, без уезжающей точки в углу profile-scene
- открытие треда тикета снимает unread
- tap по всей карточке тикета открывает его thread-room, не только нижняя полоска комментариев
- user-side root ticket и support-thread показывают status-pill
- `Решён` у пользователя виден зелёной плашкой
- комментарий пользователя в тикет не меняет status автоматически
- админский ответ в `Поддержка` обязан отправляться вместе с выбранным статусом
- порядок support queue в админке:
  - `Открыт`
  - `Переоткрыт`
  - `Нужно подтверждение`
  - `Решён`

### Media

- фото прикладываются и отправляются через новый draft flow
- fullscreen image viewer открывается по tap
- video file-flow тоже считается live user-facing контрактом:
  - `MP4 / MOV / WEBM / M4V` должны определяться как видео
  - видео должно открываться и воспроизводиться внутри Tinychok, а не только скачиваться
  - video draft-preview и bubble copy должны отличаться от обычного файла
  - bubble в direct/group/thread не показывает filename и size
  - bubble использует server preview `GET /api/media/preview?mediaUrl=...` и показывает первый кадр уже загруженного видео
  - поверх превью остаются play icon, send time и delivery ticks как у photo bubble
  - после первого живого запроса backend кэширует derived JPEG в `server/uploads/attachment-previews/`
- если новый файл не помещается в quota, backend сначала автоматически снимает самые старые ранее отправленные вложения пользователя
- auto-cleanup не должен удалять сообщение целиком:
  - в пузыре должна остаться viewer-aware заметка:
  - владелец: `Вложение скрыто. У вас закончилось место. Оформите подписку.` и маленькая inline-иконка `crown64`
  - читатель: `Вложение скрыто.`
  - owner CTA `Оформите подписку.` должен быть светлым, подчёркнутым и по tap открывать premium screen, а не menu сообщения
- composer preview должен заранее предупреждать:
  - без premium показывается copy `Место закончилось. Ваши прошлые фото и файлы будут скрыты. ...`
  - `Премиум подписку` в warning является контрастной подчёркнутой inline-cta и по tap открывает premium screen
- `Хранилище` в настройках открывает отдельный storage-screen
- в storage-screen попадают только message attachments, support/thread attachments и GIF library
- аватарки профиля, группы и канала считаются внешним хранилищем Tinychok и не попадают ни в storage-screen, ни в пользовательскую квоту
- группа больше не имеет собственного storage-subject
- корневые group attachments и group thread attachments считаются в личном хранилище автора
- channel storage сохраняется как отдельная сущность, а primary quota канала поднята до `500 MB`
- если premium истёк, а пользователь раньше уже получил premium storage, квота назад не сжимается:
  - primary quota остаётся premium-sized
  - archive quota тоже остаётся premium-sized
- если auto-cleanup уже отправил вложения пользователя в архив, а потом quota выросла и свободного места снова хватает:
  - backend должен попытаться вернуть такие auto-archived вложения обратно в исходные сообщения / посты / комментарии
  - это особенно важно проверить после покупки premium поверх уже переполненного storage
- ручное удаление из storage-screen не должно давать пустой bubble:
  - владелец видит, что вложение удалено им из хранилища
  - читатель видит, что вложение удалено владельцем из хранилища
- публичная privacy policy синхронизирована с этой механикой:
  - вложения могут удаляться автоматически при достижении лимита пользовательского хранилища
  - сообщение / пост / комментарий при этом может сохраниться без самого вложения
  - временное сохранение в backup/archive системах описывается отдельно и не означает бессрочное хранение
- `PUT /api/snapshot` больше не доверяет клиенту чувствительные session/account поля:
  - premium / premiumExpiresAt / retained storage quota / avatarImage / privacy/security state не принимаются из snapshot
  - snapshot сохраняет только безопасные room UI flags
- все send-path с attachment теперь проходят через единый ownership guard:
  - чужой `mediaUrl`
  - незарегистрированный `mediaUrl`
  - mismatch по `fileName / mimeType / size`
  должны отклоняться сервером с явной ошибкой
- после успешной отправки attachment во всех surface upload обязан становиться `linked`
- orphan cleanup по TTL больше не должен удалять реально используемые вложения из group / support / channel / thread из-за пропущенного `linked=true`
- root-message в открытом треде канала должен оставаться компактным:
  - большие image attachments в `Комментарии` рендерятся как маленькое preview
  - support-thread и channel-thread надо проверять отдельно, потому что это разные UI-ветки
  - корневая card-плашка треда должна доходить по ширине до тех же краёв, что и header comments-room
  - между source-card и scrolling comments не должно оставаться пустой clip-полосы
- GIF работают через premium-вкладку picker-а
- GIF library умеет:
  - локальный upload `.gif`
  - дедуп по имени и размеру
  - auto-attach сразу после upload
  - поиск по общему Tinychok GIF pool по имени файла
  - удаление GIF из личной библиотеки
  - добавление GIF себе из fullscreen viewer
- аватарки профиля, группы и канала обновляются через единый crop/resize pipeline
- `/avatar-upload-rules.html` явно говорит, что аватарка является пользовательским контентом под ответственность автора
- правила аватарок прямо разрешают Tinychok удалить аватарку без уведомления и заблокировать аккаунт за тяжёлое или повторное нарушение
- текущий backend-check для аватарок ограничен форматом, размером и сигнатурой файла; auto-detect запрещённого визуального контента не заявлен
- в admin staff может:
  - просмотреть аватарку с указанием причины
  - удалить или скрыть media
  - заблокировать пользователя

### Ownership And Moderation Surface

- владелец канала видит список подписчиков
- `Удалить подписчика` и `В чёрный список` работают
- invite flow канала отправляет корректное сообщение-приглашение
- invite flow группы тоже идёт через личку:
  - create/invite не должны автодобавлять участника
  - tap по invite-card должен вступать в группу и сразу открывать room
  - после self-leave тот же invite должен снова пускать пользователя в группу
  - owner snapshot после self-leave сразу теряет ушедшего участника
  - обычный join должен публиковать `К группе присоединился ...`
  - popup `Пригласить в группу` показывает уже состоящих участников неактивными строками и рендерит `Этот контакт уже состоит в группе.` inline под конкретным контактом
  - обычный self-leave должен публиковать `... покинул группу`
  - owner transfer должен публиковать `У группы новый организатор: ...`
  - quiet join -> системной надписи нет
  - quiet leave -> системной надписи нет
  - owner transfer -> видно `У группы новый организатор: ...` даже если новый организатор в `Тихо`
- create-flow канала стартует с пустыми полями:
  - `Название канала`
  - `Статус канала`
  - `Описание канала`
- после создания канала владелец сразу открывает room этого канала, а в истории уже есть системный элемент `Канал создан`
- `Описание канала` открывается из menu popup и показывает аватар, название, создателя и полный description
- owner-only action `Настройки канала` в room popup идёт с leading icon `edit100.png`
- старый invite удалённого владельцем канала должен открывать tombstone-room:
  - title `Канал удалён владельцем`
  - ghost avatar
  - пустая история
  - без возможности подписаться
- передача канала должна:
  - подтверждаться текущим паролем владельца, а не SMS
  - менять владельца server-side без удаления/архивации канала
  - сохранять канал и историю видимыми для подписчиков
- admin archive smoke для канала:
  - в admin detail канала есть `Архивировать канал` / `Разархивировать канал`
  - после архивации канал исчезает у владельца и подписчиков из обычных snapshot lists
  - старые посты не удаляются server-side и возвращаются после разархивации
  - public preview/search для архивированного канала не должны открываться обычному пользователю
- до отдельного возврата фичи `Передача канала` скрыта из пользовательского UI на staging
- новый подписчик канала должен видеть всю историческую ленту канала, включая посты до подписки и системный элемент `Канал создан`
- владелец канала сразу после subscribe должен видеть нового подписчика в `participants` и увеличенный `readers`, в том числе для legacy-каналов после backfill owner-copy
- search smoke для каналов:
  - поиск каналов показывает отдельную секцию `Каналы`
  - tap по неподписанному каналу из поиска открывает preview, а не оформляет автоподписку
  - после self-unsubscribe канал всё ещё находится по названию или `@handle`, если preview-access не отозван
  - уже подписанный канал из поиска открывается сразу как обычная room
- у группы есть отдельное поле `Идеалогия группы` и одноимённый popup из menu
- owner-only action `Настройки группы` в room popup идёт с leading icon `edit100.png`
- в `Настройки группы` есть live avatar preview и `Сменить`, а смена аватарки не ограничена только create-flow
- архивную группу невладелец должен иметь возможность покинуть
- если комментарии в канале были выключены после уже существующих комментариев, старые комментарии должны сохраняться, а новые — блокироваться

### Reliability

- удалённые сообщения, посты и комментарии не возвращаются после повторного входа в комнату
- stale client snapshot не может восстановить удалённый timeline
- user-facing delete не должен физически purge-ить managed entity из server runtime state:
  - channel/group/account переходят в archive/tombstone policy
  - historical invite links продолжают резолвиться либо в live entity, либо в tombstone state
- deletion contract для staging smoke:
  - `Удалить группу` владельцем => группа исчезает из обычных user lists у всех участников
  - `orphaned-group` => архивная группа остаётся видимой и её можно покинуть
  - `Удалить канал` владельцем => канал исчезает из обычных lists, но старый invite открывает tombstone
  - self-leave из группы => участник исчезает у владельца и может вернуться по старому invite
- channels UI smoke:
  - в `Управление каналами` нет отдельного eyebrow `Каналы`
  - если каналов нет, header показывает `Пока нет каналов. Создайте свой первый канал.`
  - transfer-channel modal/action не доступны пользователю
- profile settings сохраняются без transport-level сбоев за reverse proxy
- persisted dark-theme toggle считается частью release-blocking profile contract:
  - setting `darkThemeEnabled` должен приходить из snapshot и переживать hard refresh / relogin
  - live UI должен переключать root `data-theme` contract, а dark mode не должен оставлять brown panel/menu/card surfaces
  - share/subscriber dialogs, thread root source cards, confirm popups and composer inputs must not leak light surfaces in dark mode
  - placeholder avatars without uploaded photos must darken in dark mode, but uploaded avatars must stay visually unchanged
  - menu/star/crown/edit/send/filter icons must switch to the light icon treatment on dark surfaces
- profile settings mobile smoke:
  - на `390px` avatar и display name остаются в одном header-row
  - display name не должен падать под avatar только из-за mobile media-rule
  - длинный direct-room status на mobile по умолчанию должен схлопываться до `2` строк
  - toggle в статусе должен раскрывать и снова сворачивать текст, не ломая desktop header
  - outer mobile gutters у account header, filters, bottom-nav и contact cards должны быть уменьшены; эти surface должны тянуться ближе к краям viewport
  - mobile room headers должны держать узкие tall-pill buttons: back слева уже menu/star, а action-buttons справа не должны возвращаться к круглым `32x32`
  - bottom-nav на mobile main-list должен оставаться pinned к низу viewport; вниз скроллится только лента карточек
  - mobile browser не должен уметь тянуть весь main-list/main-room document вверх или вниз поверх viewport; overscroll остаётся внутри ленты
  - mobile browser не должен уметь утащить весь `html/body/#root` поверх pinned shell; viewport lock должен держаться и на уровне document root
  - gap между `Имя / Фамилия / Статус / Никнейм` должен оставаться compact
  - узкий mobile breakpoint не должен перетирать compact profile headline общим `.settings-heading h2`
  - inline autosize profile headline должен уважать текущий mobile font-size из CSS, а не возвращать desktop `30.4px`
- browser notifications не должны приходить в режиме `Тихо`
- quiet-settings сцена считается release-blocking контрактом:
  - `quietModeSettings` должен нормализоваться к дефолтам
  - первые пять чек-боксов управляют только visual badges и browser notifications по категориям
  - unread продолжает копиться и не должен сбрасываться этой настройкой
  - `Авто-режим невидимки` управляет только авто-включением invisibility при нажатии `Тихо`
  - при non-premium первые пять чек-боксов визуально включены и locked
  - `Авто-режим невидимки` в non-premium сцене визуально выключен и locked
  - `Настройки режима "Тихо"` должны открываться отдельной settings-scene, а не popup-слоем
  - кнопка `Настройки режима "Тихо"` должна жить в профиле над нижним settings action-row
  - quiet browser-notification filtering режется по категориям `dialogs/channels/groups/threads`
  - quiet contact-request badge filtering режется отдельно через `quietModeSettings.contactRequests`
- `Режим невидимки` считается release-blocking presence-контрактом:
  - это отдельный server-side premium-флаг `invisibilityEnabled`
  - это одна из главных premium/quiet-механик, её нельзя возвращать к derived-only условию `Тихо + premium`
  - кнопка `Тихо` для premium-пользователя при каждом новом включении автоматически включает `Невидимку`
  - если `Невидимка` была auto-enabled самим `Тихо`, выход из `Тихо` обязан автоматически выключать её обратно
  - если `Невидимка` была включена вручную в настройках, выход из `Тихо` не должен её выключать
  - внутренний provenance-флаг допустим только для памяти об auto-enabled origin и не должен превращаться в отдельный пользовательский режим
  - `Невидимку` можно вручную выключить в настройках, не отключая сам `Тихо`
  - в настройках под `Выключить браузерные уведомления` должен быть отдельный блок `Режим невидимки` с crown-иконкой
  - сам пользователь видит серый ring-dot в левой шапке аккаунта и в шапке профиля
  - другие пользователи должны видеть такой аккаунт полностью как офлайн
  - direct room header не должен показывать `В сети`
  - списки диалогов, контактов и участники групп не должны показывать зелёную точку
  - если такой пользователь читает direct-сообщение, у него локально должен очищаться unread, но отправитель не должен получать `readAt`
  - тап по `Режиму невидимки` без premium должен вести в premium-экран
  - `Тихо` без premium не должен скрывать online presence
  - regressions по presence и direct read-receipts обязательны при каждой правке quiet-mode / premium / snapshot materialization
- обычный `В сети` тоже держим как release-blocking контракт:
  - live online должен зависеть только от websocket/realtime presence
  - в обычном direct room header online-state показываем зелёной точкой на avatar-stack, а не отдельным текстом `В сети`
  - persisted `sessions` и retention cleanup не могут сами по себе держать пользователя online
  - `logout` должен проходить через `/api/logout` и сразу гасить presence, если это был последний live socket
  - smoke на staging: открыть аккаунт A и B, увидеть `В сети`, закрыть вкладку или нажать `Выйти` на A и убедиться, что у B статус быстро уходит в `был(а) недавно в сети`
- quiet-mode contract для групп считается критичным:
  - server-side `quietModeEnabled` подавляет group join/leave system events
  - `Выключить звуки` не влияет на stealth join/leave
  - suppression не должна ломать membership, preview, unread или pending invite lifecycle
  - re-invite после self-leave должен работать и не может блокироваться title-based membership check
- direct contact request smoke:
  - первый direct room без контакта показывает CTA `Отправить запрос на контакт`
  - после отправки у инициатора нет обычного чата в списках, но есть карточка в `Контакты -> Отправленные запросы`
  - outgoing request room открывается по тапу на карточку и показывает нейтральную кнопку `Отменить заявку` и дружелюбный коричневый статус отправки
  - у получателя нет чата, но есть badge и карточка в `Контакты -> Заявки`
  - tap по карточке заявки открывает общую room с историей и кнопками `Подтвердить / Отклонить / Заблокировать`
  - cancel убирает заявку у обеих сторон и возвращает CTA у инициатора
  - accept создаёт chat у обоих и system message `Контакт установлен`
  - reject возвращает CTA у инициатора
  - block показывает инициатору `Пользователь заблокировал контакт с вами`
  - delete contact убирает direct chat у обеих сторон из списков
  - reopen удалённого контакта через search показывает старую историю и CTA на новый запрос
  - incoming request после такого reopen не создаёт visible chat у получателя до accept
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
- group detail обязан иметь archive-toggle:
  - `Архивировать группу` для живой группы
  - `Разархивировать группу` для архивной группы
- channel detail обязан иметь archive-toggle:
  - `Архивировать канал` для живого канала
  - `Разархивировать канал` для архивного канала
- thread detail обязан иметь archive-toggle:
  - `Архивировать тред` для живого треда
  - `Разархивировать тред` для архивного треда
- archive-toggle в admin нельзя считать рабочим только по смене плашки `АРХИВ`:
  - после toggle staging smoke-check обязан подтвердить, что affected user snapshots реально обновились через broadcast

## Standard Deploy Flow

```bash
cd /home/devis/tinychok
git remote get-url origin
git fetch origin
git checkout codex/staging-deploy
git pull --ff-only origin codex/staging-deploy
git status --short
npm ci
npm test
npm run audit:release
npm run build:staging
sudo systemctl restart tinychok-staging
sudo rsync -av --delete dist/ /var/www/tinychok-staging/
```

Если используется repo-скрипт:

```bash
cd /home/devis/tinychok
bash scripts/deploy-staging.sh
```

- `scripts/deploy-staging.sh` теперь обязан retry-ить `verify-release-runtime.mjs` после restart:
  - краткий `502` от `healthz` в первые секунды после `systemctl restart` считается startup-race, а не повод оставлять rollout в полудеплое
- тот же deploy-скрипт теперь обязан падать на:
  - грязном worktree без commit-backed состояния
  - `npm audit --audit-level=high`
- staging VM больше не должна использовать alias-based git remote:
  - ожидаемое значение `origin` = `git@github.com:devisjjones/tinychok.git`
  - старый alias `github-tinychok` признан невалидным, потому что ломал воспроизводимый fetch/push path
- staging rollout считается завершённым только если:
  - `/home/devis/tinychok` на VM чистый
  - live commit на VM совпадает с `origin/codex/staging-deploy`

### Verified Staging Checkpoint — 2026-04-10

- локально и на VM полные gates снова зелёные:
  - `npm test`
  - `npm run audit:release`
  - `npm run build:staging`
- после live deploy staging снаружи подтверждён по URL:
  - `https://api.staging.tinychok.ru/healthz` → `{"status":"ok"}`
  - `https://api.staging.tinychok.ru/readyz` → `storage.layout = hybrid-normalized`
  - `https://api.staging.tinychok.ru/api/client-config` → `analytics.enabled=true`, `provider=log`, `metricaCounterId=108249405`
  - `https://staging.tinychok.ru` реально отдаёт `assets/main-_QqNNVPz.js`
  - dist bootstrap больше не монолитный: runtime URLs подтверждаются через split assets, а не через один giant main chunk
  - подтверждённый staging VM commit после live deploy `2026-04-10`: `e5dc0e4`

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
- открыть длинный direct, получить новое входящее в уже открытый room, выйти из комнаты:
  - unread badge не должен появляться на уже прочитанном сообщении
- то же для group / channel room
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
- delete history for everyone in direct dialogs:
  - очищает комнату у обеих сторон
  - server-side история не удаляется физически, а архивируется
  - history endpoint после этого тоже пустой у обеих сторон
  - ошибка server-side delete-for-everyone не должна приводить к локальному fake-success у инициатора
- delete single message for everyone in direct dialogs:
  - это release-blocking проверка
  - на своём сообщении видны `Удалить у меня` и `Удалить у всех`
  - на входящем сообщении `Удалить у всех` не должно отображаться
  - если backend всё же получает такой запрос для входящего сообщения, он должен отказать без удаления у обеих сторон
  - `Удалить у меня` и `Удалить переписку у меня` в direct остаются локальным hide в UI, но сервер хранит retention-архив для admin/legal export
  - admin/legal export должен собираться из canonical direct transcript по обеим копиям, а не из single-owner copy
  - storage exports должны оставаться disjoint:
    - `Выгрузка активного хранилища` не пересекается по `mediaUrl` с `Выгрузкой архивного хранилища`
    - retention-only direct attachments не должны протекать в archive storage export
- group message send
- group system events:
  - normal join => видно `К группе присоединился ...`
  - quiet join => системной надписи нет
  - normal leave => видно `... покинул группу`
  - quiet leave => системной надписи нет
  - owner transfer => видно `У группы новый организатор: ...`
  - если у актёра есть premium, у system event видна crown-иконка
- channel post send
- room feed autoscroll:
  - open long direct / group / channel / thread => сразу на последнем элементе
  - own send => сразу на последнем элементе
  - incoming while near bottom => остаёмся у актуального низа
  - incoming while reading older history => не должно срывать вниз
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
- session expiry now applies equally to HTTP bootstrap and websocket realtime
- password change / reset revokes every other session and should kick old devices out immediately
- duplicate retries with the same `clientDeliveryId` no longer create duplicate messages / tickets / comments
- websocket reconnect must not briefly flip `В сети` to offline when an older socket closes after a newer one is already live
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
- `Пользователи`: user list без inline-статуса; текущий статус показывается только в detail-panel
- `Пользователи`: из detail-panel скачивается CSV всей истории статусов пользователя с датами установки
- `Пользователи`: IP-история тоже вынесена в отдельную detail-card с той же icon-button выгрузкой CSV
- `Пользователи`: owner-only `Логи IP` CSV по пользователю с reason и optional period
- `Пользователи`: owner-only legal export ZIP по пользователю с reason, optional period и optional media
- `Жалобы`: unread badge, open / close, note trail, блокировка пользователя
- `Жалобы` для media:
  - `Посмотреть` пишет audit entry
  - `Hide` скрывает из чата целиком сообщение / пост / комментарий
  - `Delete` скрывает из UI и физически удаляет media-object
- `Медиа`: timestamp sort, download, hide / delete
- `Каналы` / `Группы` / `Треды`: одна строка на одну каноническую сущность без fan-out дублей
- карточки прямых диалогов должны использовать увеличенный `dialog-list-card` avatar-slot, без уменьшения avatar у group/channel/thread cards
- в светлой root-card треда premium upsell link внутри notice про скрытое вложение не должен оставаться белым; он обязан переключаться на контрастный тёмный link-style этой карточки
- `Группы`: из detail-card рядом с `Участников` скачивается CSV со всеми участниками
- `Каналы`: из detail-card рядом с `Читателей` скачивается CSV со всеми подписчиками
- `Диалоги`: выбор двух пользователей и CSV export одного канонического диалога
- `Аудит лог`: actor filter, period filter, CSV export и запись admin-действий
- owner-only legal export:
  - архив скачивается без server error
  - архив включает `ip/ip-log.csv` и `ip/ip-log.json`
  - `from/to` режет `dialogs`, `groups`, `channels`, `threads`, `reports`, `audit` и `ip`
  - пишет `admin.legal-export.download` в audit log
  - large export идёт через блокирующий popup с progress bar
  - repeated click не должен стартовать несколько параллельных архивов
  - после server-side `100%` UI должен показывать отдельную фазу передачи архива браузеру, а не зависать на полном баре
  - `Отмена` должна реально прерывать подготовку архива
- owner-only IP CSV export:
  - скачивается без server error
  - пишет `admin.ip-logs.download` в audit log
  - при `includeMedia=true` архив включает media-файлы, если storage-объекты доступны
- `?analytics_debug=1`:
  - показывает local analytics dispatch в `Console`
  - не должен дублировать один и тот же `pageview`/`gif_search_used` без нового фактического действия
- direct reply-preview:
  - у второго участника tap по reply-preview обязан скроллить к оригиналу так же, как у автора ответа
  - это должно работать и для новых direct replies, и для legacy сообщений, где в persisted mirrored copy раньше сохранился чужой `replyTo.id`
  - attachment-only оригинал без текста тоже входит в этот контракт: legacy mirrored reply не должен оставаться привязанным к чужому id только потому, что preview хранится как `Файл: <name>`
- mobile media/video bubble:
  - отправленное видео не должно раздвигать direct room вправо
  - `media-bubble-row` остаётся зажатым в viewport, bubble track shrinkable, horizontal overflow отсутствует
- premium archive restore:
  - при выдаче premium пользователю auto-archived `storage-quota` вложения должны возвращаться в primary storage, если квота позволяет
  - это должно работать и для legacy archived rows без `restoreTargets`
  - если часть старых archived rows уже исчезла из archive storage, restore не должен попадать в более старые orphan placeholders; восстанавливаются только реально оставшиеся archive rows
- thread root source:
  - в открытом треде корневое сообщение не должно показывать author-strip автора
  - author/avatar допустимы только у самих комментариев, а не у `room-thread-source`
- mobile browser scene-open contract: dialog, group, channel, thread и support composer не должны автозахватывать фокус при входе в экран
  - клавиатура на телефоне не должна открываться сама при первом входе в сцену
  - отдельные intentional flows вроде `Ответ` остаются вне этого ограничения
