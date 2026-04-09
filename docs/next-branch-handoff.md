# Next Branch Handoff

Короткая техническая точка входа для следующего треда или новой ветки. Документ описывает только текущее устройство системы и рабочие инварианты, без истории коммитов и списков прошлых правок.

## Runtime Topology

- staging frontend: `https://staging.tinychok.ru`
- staging admin frontend: `https://admin.staging.tinychok.ru`
- staging backend API: `https://api.staging.tinychok.ru`
- realtime websocket: `wss://api.staging.tinychok.ru/ws`
- staging живёт на отдельной VM `tinychok-staging-1`
- user frontend, admin frontend и backend деплоятся независимо, но должны использовать один и тот же staging backend и staging state store
- postgres runtime-store теперь имеет два режима данных:
  - legacy `state-store`
  - новый `hybrid-normalized`, где slim `app_runtime_state` отделён от текстовых таблиц
- текущий целевой режим для postgres = `hybrid-normalized`

### Staging Storage Checkpoint

- на `2026-04-08` staging уже прошёл полный live cutover на `hybrid-normalized`
- перед cutover был снят backup:
  - `/home/devis/backups/tinychok-pre-full-hybrid-20260408-123059.dump`
- для сверки старого payload на staging сохранена restore-таблица:
  - `app_runtime_state_restore`
- counts по основным коллекциям уже сверены restore/live и совпадают, кроме `ip_access_logs`, где после cutover зафиксированы новые live события
- backend на staging уже читает и пишет:
  - `groups`
  - `subscriptionChannels`
  - `threadStates`
  - `ipAccessLogs`
  - `adminAuditLogs`
  - `archivedMedia`
  - `pendingGroupInvitations`
  - `pendingChannelInvitations`
  - `pendingMediaUploads`
  - `accountStatusHistories`
- перед prod rollout не трогать staging backup/restore artifacts, пока prod не будет успешно проверен тем же runbook

### Staging Build Contract

- staging frontend нельзя выкатывать из plain `npm run build`
- единственная допустимая frontend-сборка для staging: `npm run build:staging`
- причина жёсткая и уже воспроизводившаяся много раз:
  - если в `dist` не зашиты `https://api.staging.tinychok.ru` и `wss://api.staging.tinychok.ru`
  - клиент падает обратно на same-origin `/api` и `/ws`
  - `staging.tinychok.ru` начинает отвечать `401` на эти запросы через `nginx basic auth`
  - Chrome зацикливает окно логина и выглядит так, будто staging "не пускает"
- `build:staging` теперь обязан проходить через `scripts/verify-staging-dist.mjs`
- если verify-скрипт не видит `api.staging` / `wss://api.staging` ни в одном staged `dist/assets/*.js`, deploy нужно считать заблокированным
- полный release gate снова жёсткий:
  - перед staging deploy должны быть зелёными `npm test`, `npm run audit:release` и `npm run build:staging`
- `scripts/deploy-staging.sh` теперь должен стартовать только из чистого commit-backed worktree:
  - rsync из dirty workspace больше не считается валидным staging rollout
- staging VM git remote `origin` должен быть прямым:
  - `git@github.com:devisjjones/tinychok.git`
  - alias `github-tinychok` больше не использовать, потому что он уже ломал commit-backed sync с origin
- staging VM branch не должен оставаться `ahead 1` / `behind` относительно `origin/codex/staging-deploy` после релизного deploy
- `scripts/deploy-staging.sh` теперь retry-ит runtime verifier после restart:
  - brief `502` на `healthz` в первые секунды после `systemctl restart` больше не должен обрывать deploy раньше времени
- fallback-защита на web-vhost тоже важна:
  - `staging.tinychok.ru/api/*` и `staging.tinychok.ru/ws` должны проксироваться на backend без повторного basic-auth challenge
  - even so, этот proxy не отменяет requirement собирать staging именно через `build:staging`
- текущий подтверждённый user-frontend asset на staging после deploy `2026-04-08`:
  - `assets/main-D-NEgpe-.js`
- временное review-исключение активно с `2026-04-07`:
  - public user frontend `https://staging.tinychok.ru` намеренно открыт без user `basic auth`
  - причина: внешний review с новых устройств без логин/пароль prompt
  - `admin.staging.tinychok.ru` должен оставаться за `basic auth`
  - backend allowlist и SmartCaptcha не отключались
  - как вернуть после review:
    - раскомментировать `auth_basic` и `auth_basic_user_file` в `/etc/nginx/sites-available/tinychok-staging-web`
    - `sudo nginx -t`
    - `sudo systemctl reload nginx`
  - backup guard-конфига на VM:
    - `/etc/nginx/sites-available/tinychok-staging-web.bak-20260407-review-auth`
- static icon contract тоже release-blocking:
  - все файлы в `public/icons/*`, на которые есть ссылки из `src`, должны существовать и быть world-readable (`0644` или эквивалент)
  - private perms вроде `0600` на `quiet.png`, `news_settings.png`, `glasses100.png` уже ломали staging и приводили к broken icons после rsync
  - regression tests теперь держат не только существование icon assets, но и наличие бита `other-read`
- avatar picker actions для профиля, группы и канала используют общий row-контракт:
  - `Отмена` должна быть прижата к левому краю
  - `Применить` к правому
  - generic `.channel-title-popover-actions` нельзя снова перетирать обратно в `justify-content:flex-end`

### Analytics Runtime Contract

- staging и production не должны тихо запускаться с `analytics.disabled`
- если в live env пропадают:
  - `TINYCHOK_ANALYTICS_ENABLED`
  - `TINYCHOK_ANALYTICS_PROVIDER`
  - `TINYCHOK_YANDEX_METRICA_COUNTER_ID`
  frontend продолжает работать, но Яндекс Метрика перестаёт принимать новые события
- это считается release-blocking operational bug, а не допустимым degraded mode
- `.env.staging.example` и `.env.production.example` обязаны содержать analytics keys как явный контракт
- текущий staging Yandex Metrica counter id зафиксирован как `108249405`
- если staging runtime внезапно вернул другой counter id или `null`, deploy нужно считать сломанным
- staging deploy обязан проверять живой `GET /api/client-config` после restart:
  - `analytics.enabled === true`
  - `analytics.provider === 'log'`
  - `analytics.metricaCounterId` должен быть положительным числом
- нельзя считать проблему закрытой только потому, что frontend собрался и `healthz` зелёный:
- analytics regressions ловятся только через runtime config smoke-check
- единый release-blocking список теперь собран в [docs/release-contracts.md](/Users/devisjones/Documents/New%20project/tinychok/docs/release-contracts.md)

## Core Product Mechanics

### Public Legal Pages

- публичные legal/compliance pages считаются release-blocking surface и не должны восприниматься как декоративный маркетинговый контент
- текущий публичный набор страниц:
  - `https://tinychok.ru/user-agreement.html`
  - `https://tinychok.ru/privacy-policy.html`
  - `https://tinychok.ru/premium-terms.html`
  - `https://tinychok.ru/contacts.html`
- у каждой страницы должен оставаться прямой публичный PDF:
  - `/user-agreement.pdf`
  - `/privacy-policy.pdf`
  - `/premium-terms.pdf`
- source-of-truth в коде:
  - `src/userAgreementContent.ts`
  - `src/privacyPolicyContent.ts`
  - `src/premiumTermsContent.ts`
  - `src/ContactsPage.tsx`
- эти источники должны синхронизироваться с утверждёнными документами и не могут “слегка сокращаться” ради удобства вёрстки
- текущие критичные public invariants:
  - `Пользовательское соглашение` и `Политика` используют дату `31.03.2026`
  - `Условия Premium` используют дату `31.03.2026`
  - support email на публичных legal pages = `tinychok.help@yandex.com`
  - legal/general email = `devisjjones@gmail.com`
  - operator/requisites page использует:
    - ИП Мерзляков Алексей Сергеевич
    - ИНН `100485269510`
    - ОГРНИП `326774600067696`
    - адрес регистрации `г. Москва, ул. Перовское шоссе, д. 2, к. 2, кв. 640`
  - `Контакты и реквизиты` не должны снова содержать отдельный provider-only блок `Для YooKassa`
  - premium checkout сейчас intentionally упрощён:
    - на экране покупки остаётся только ссылка на `Условия Premium`
    - под CTA есть короткая consent-copy `Нажимая «Купить»...`
    - `Пользовательское соглашение`, `Политика` и `Контакты` остаются публичными legal pages, но не дублируются в самом checkout-блоке
  - checkout-link contract для premium считается юридически существенным и не должен исчезать из `App.tsx`
- `Условия Premium` считаются отдельным документом, а не абзацем внутри общего соглашения:
  - месячный тариф = `199 ₽ / 30 дней`
  - годовой тариф = `1390 ₽ / 365 дней`
  - no auto-renew by default, если это прямо не показано в checkout
  - цифровой доступ предоставляется онлайн внутри аккаунта, без физической доставки
  - premium features на публичной странице и PDF должны включать:
    - тонкую настройку режима `Тихо`
    - `Режим невидимки`
    - GIF-анимации
    - отправку фото в оригинальном размере
    - хранилище до `500 МБ`
    - создание тематических каналов
    - группы до `200` участников
- если меняется хоть одна из этих legal pages, нужно обновлять:
  - страницу HTML
  - публичный PDF
  - regression tests
  - staging rollout docs
- public legal pages должны оставаться public/static routes и не должны зависеть от auth/snapshot state

### Session and Snapshot Model

- клиент поднимается через bootstrap snapshot
- realtime обновления приходят по websocket и синхронизируют текущее состояние клиента
- timeline data считаются `server-authoritative`
- клиентский `saveSnapshot` не должен воскрешать удалённые сообщения, посты или комментарии из устаревшего local state
- открытая и видимая комната не должна копить stale unread:
  - если пользователь уже видит входящее сообщение в открытом direct / group / channel room, оно должно сразу считаться прочитанным
  - после выхода из такой комнаты badge unread не должен внезапно показывать уже прочитанные пользователем сообщения
  - этот read-state invariant считается критичным и должен проверяться при каждой правке room/realtime/history logic
- static source-contract tests недостаточны для room feed mechanics:
  - автоскролл и read-state комнаты должны быть покрыты runtime DOM tests
  - зелёные только helper/static tests не считаются достаточной защитой от регресса

### PostgreSQL Runtime Layout

- `server/src/store-factory.ts` больше не должен писать всю history-heavy / high-churn runtime history обратно в один giant `jsonb` blob
- в postgres режиме база хранится так:
  - slim runtime state в `app_runtime_state`
  - вынесенные коллекции в отдельных таблицах:
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
- при чтении backend обязан уметь:
  - подняться из уже готового hybrid layout
  - один раз bootstrap-нуться из legacy full-blob и сразу переписать state в hybrid layout
  - делать это per-collection, чтобы новый список hybrid-таблиц не терял данные старого slim payload, если конкретная таблица ещё пуста
- `GET /readyz` теперь считается частью этого контракта и обязан отдавать `storage.layout`
- reference SQL лежит в:
  - `server/sql/yandex-postgres-state-store.sql`
  - `server/sql/yandex-postgres-hybrid-runtime.sql`

### History Window

- direct / group / channel при входе не тянут всю историю сразу
- стартовое окно строится по правилу:
  - сначала сообщения за сегодня и вчера
  - если их мало, окно добирается назад до минимального полезного объёма
- при прокрутке вверх история догружается отдельными backend endpoint-ами
- в лентах есть day divider, который показывает полную дату с годом
- для subscription channels новый подписчик теперь тоже видит всю накопленную историю канала, включая посты, опубликованные до его подписки
- у групп есть отдельный owner-setting `Отображать историю группы новым пользователям`:
  - default = `on`
  - при `on` новый участник получает backfill старых group messages в свой owner-copy в момент `joinGroupBySharedId`
  - при `off` новый участник видит только сообщения с момента вступления и не должен получать старый preview/history backfill
- room feed spacing split:
  - direct-room, group-room и thread-room используют compact bubble gap `3px`
  - subscription channel room intentionally не использует этот compact gap, чтобы posts оставались отдельными units of attention
- standalone emoji path:
  - direct-room и group-room умеют отдельный bubbleless render только для top-level messages, где текст = один emoji-grapheme и нет attachment/source/forward chrome
  - этот path не должен растекаться в channel posts, thread comments, reply previews и thread source cards
  - если у group root-message появляется первый комментарий, bubbleless path нужно отключать и возвращать обычный bubbled block
  - selected message overlay обязан повторять тот же bubbleless layout, без возврата фона и старых paddings

### Left Rail Group Cards

- карточки групп и каналов в левом списке используют общий avatar-layout:
  - одинаковый размер avatar `56px`
  - одинаковый left inset
  - одинаковое визуальное центрирование avatar относительно текстового блока
- group-card поверх этого держит свой compact-контракт:
  - более плотный vertical padding, чем у default `chat-card`
  - `chat-copy` внутри group-card держит более плотный текстовый gap, чем общий rail-card
  - preview последнего сообщения показывает маленькую author-avatar + `:` + текст preview вместо отдельного текстового имени автора

### Group Captioned Media

- `group-captioned-media-bubble` не должен сам по себе обнулять верхний media inset
- flush layout для media с подписью применяется только через дополнительный `group-captioned-media-bubble-with-header`, когда author header реально рендерится
- это защищает own photo/video with caption от коричневой полосы над media
- selected overlay для group bubble и thread-comment bubble должен получать тот же compact padding/time spacing, что и room feed
- если fixed overlay живёт вне `.group-room-feed` / `.room-thread-feed`, компактную геометрию нужно переносить отдельным overlay class, а не рассчитывать на descendant CSS

### External Links

- raw `http://` и `https://` в текстах сообщений и комментариев считаются отдельным linkify-контрактом:
  - direct
  - group
  - channel
  - thread
  - support
- такие URL рендерятся link-span-ом внутри bubble и не должны оставаться plain text
- bare domains без протокола (`example.com`, `www.example.com`) намеренно не linkify на этом проходе
- тап по самому link-span не должен открывать actions menu сообщения:
  - вместо этого всегда открывается warning-modal
  - modal предупреждает, что пользователь переходит во внешний источник под свою ответственность
  - modal советует не переходить по ссылкам от малоизвестных аккаунтов
  - `Перейти` открывает URL только через `noopener,noreferrer`
- `@контакты`, `@каналы`, invite/source cards и прочие in-app переходы этой механикой не заменяются

### Threads

- у сообщений и постов могут быть треды
- у пользователя есть отдельный inbox тредов
- в inbox попадают треды, где пользователь:
  - уже писал комментарий
  - либо явно подписался на тред
- тред с `0 комментариев` не должен сам попадать в inbox только потому, что пользователь является root-author или находится в fan-out копии группы/канала
- implicit visibility по участию начинается только после первого реального комментария
- новые ответы в подписанных тредах дают unread-индикаторы
- простое открытие и чтение треда должно снимать unread до `0` без необходимости отправлять свой комментарий
- server-side read marker не должен опираться только на timestamp:
  - same-millisecond комментарии не должны оставлять зависшее `unread = 1`
- пока тред открыт и видим пользователю, inbox не должен дёргаться из-за stale unread-sort
- в самом треде доступны `Подписаться` / `Отписаться`
- автоподписка происходит после отправки комментария
- root-message внутри открытого треда считается compact reference-card, а не обычным room-bubble
- root-message с `фото + подпись` живёт как full-width two-column card:
  - thumbnail слева
  - текст справа
  - время в правой части карточки
- root-message с `фото без подписи` не должен превращаться в пустую широкую плашку
- радиусы thumbnail внутри root-card обязаны совпадать с радиусами самой плашки
- корневая плашка треда должна тянуться по ширине до тех же краёв, что и header comments-room
- это особенно важно для channel-thread:
  - base `.channel-post` стили слишком широкие для comments-room
  - поэтому для `.room-thread-source .channel-post.room-thread-source-bubble` есть отдельный зажим по ширине
- support-thread и channel-thread нельзя считать одним и тем же surface при рефакторинге:
  - фикс support-thread preview не гарантирует корректный layout channel-thread preview
- большие image attachments в root-message треда должны ужиматься до маленького preview, по которому можно открыть full attachment
- scrolling comments должны клипаться по нижней границе source-card без пустой полосы
- own group bubbles и thread comments не должны рисовать отдельную строку `Вы`:
  - self-author читается по цвету / выравниванию bubble
  - возврат строки `Вы` почти всегда означает регресс по вертикальной плотности
- group feed и comments-room держат compact spacing:
  - межбабловый gap должен быть tight, а не воздухом на пол-экрана
  - time-row не должен оставлять жирный пустой хвост под текстом
- bubble с `thread-pill` ниже должен оставаться единым блоком:
  - нижние углы bubble не должны снова скругляться из-за новой wrapper-иерархии
- staff archive для треда — отдельный moderation-контур:
  - archive reason = `admin-archived`
  - archived thread пропадает из user thread inbox
  - archived thread перестаёт открываться как comments-room у обычного пользователя
  - корневое сообщение / пост в основной комнате остаётся видимым
  - `threadId` и user-visible comments убираются из snapshot до разархивации
  - новые subscribe/comment actions в такой тред режутся server-side
  - `Разархивировать тред` возвращает тот же thread root и те же comments без пересоздания

### Support Tickets

- `Написать в поддержку` живёт только внутри `Настроек` и не должен попадать в обычный список `Диалоги`
- root message в support-room создаёт отдельный тикет с глобальным номером `0, 1, 2...`
- после создания root-ticket действует cooldown `10 минут` только на новое обращение:
  - второй root-ticket в этот интервал создавать нельзя
  - комментарии в уже созданный тикет отправлять можно сразу
- support-room показывает только корневые тикеты, а ответы живут исключительно в комментариях соответствующего треда
- tap по тикету поддержки должен только открывать его thread-room:
  - он не должен превращать support в direct-chat
  - он не должен создавать новый root item
- staff/support отвечает из admin queue `Поддержка`, а пользователю reply приходит как unread comment внутри тикета
- unread dot на кнопке `Написать в поддержку` в настройках считается release-blocking контрактом
- тот же unread badge обязан зеркалиться и на нижнюю кнопку `Настройки`, чтобы ответ поддержки был виден до входа в support-scene
- support-thread read-sync нельзя завязывать только на `threadInbox`:
  - source of truth для открытого тикета = `supportTicket.unreadCount`
  - opening support-thread должно локально и серверно сбрасывать unread даже без `threadInbox` item
- badge на кнопке `Написать в поддержку` не должен использовать глобальный absolute-layout `badge`:
  - он должен оставаться внутри самой support-кнопки
  - отдельная мигающая точка в правом верхнем углу profile-scene считается регрессией
- support queue не должна смешиваться с moderation `Жалобами`
- у каждого тикета есть явный status:
  - `Новое` в admin queue до первого открытия карточки staff-ом
  - `Открыт`
  - `Переоткрыт`
  - `Нужно подтверждение`
  - `Решён`
- новый тикет всегда стартует со статусом `Открыт`, но в admin queue до первого просмотра показывается как `Новое`
- после первого открытия карточки в админке `Новое` автоматически переходит в `Открыт`
- комментарий пользователя сам по себе не меняет статус тикета
- статус меняется только ответом админа в support queue, и такой апдейт всегда обязан сопровождаться комментарием
- `Решён` у пользователя должен рендериться зелёной плашкой
- tap по всей карточке тикета в support-scene обязан открывать thread-room:
  - нельзя оставлять кликабельной только нижнюю плашку `Открыть комментарии`
- после успешного создания root-ticket support-scene должен мгновенно переходить в cooldown-card:
  - не дожидаясь следующего фонового snapshot-sync
  - без показа сырого backend-text `Новую задачу для поддержки пока рано открывать.`
- admin queue `Поддержка` сортирует тикеты по статусному приоритету:
  - `Открыт`
  - `Переоткрыт`
  - `Нужно подтверждение`
  - `Решён`

### Composer

- текущий стабильный контракт composer-а = обычное plain-text поле ввода
- точка входа для direct / support / thread composer parity теперь общая:
  - `src/components/RoomComposer.tsx`
- допускается различаться только contextual copy placeholder-а и support wrapper modifier class
- live staging smoke на `2026-04-08` подтвердил:
  - direct / support / thread совпадают по textarea styles и tool buttons contract
  - idle textarea у общего composer держим визуально однострочной
  - mobile `390px` не даёт horizontal overflow у composer-а
- rich-text toolbar с `B / I / U / S` и `contenteditable` откатили как регрессивный surface
- если кто-то снова будет возвращать форматирование текста, нужно отдельно перепроверять:
  - direct
  - group
  - channel
  - thread
  - support
  - mobile layout и caret behavior

### Reply Flow

- reply поддержан в личках, группах, каналах и тредах
- превью сообщения, на которое отвечают, рендерится отдельным верхним блоком
- этот блок кликабелен и прокручивает ленту к исходному сообщению
- при выборе `Ответить` composer получает фокус сразу

### Managed Channels

- create-flow управляемого канала больше не использует seeded draft-поля:
  - `title` стартует пустым
  - `statusText` стартует пустым
  - `description` стартует пустым
- `statusText` и `description` теперь разделены:
  - `statusText` — короткая строка под названием в шапке
  - `description` — отдельное описание канала из меню `Описание канала`
- после создания канала пользователь сразу попадает в room этого канала
- канал не должен открываться пустым:
  - первым элементом истории создаётся системный пост `Канал создан`
  - он показывается как техническое сообщение под day divider
- popup `Описание канала` показывает:
  - аватар канала
  - название
  - compact card создателя
  - полное описание или нейтральную заглушку, если описание не задано
- если комментарии в канале были включены, а потом выключены:
  - старые комментарии остаются
  - новые комментарии больше писать нельзя
- invite-link канала теперь должен резолвиться только через backend preview:
  - живой private-канал открывается как read-only preview до подписки
  - удалённый владельцем канал открывается как tombstone-room
  - tombstone-room показывает `Канал удалён владельцем`, ghost-иконку и пустую историю
  - tombstone не даёт подписаться и не показывает старые посты обычному пользователю
- search-flow канала считается таким же строгим preview-контрактом, как и invite-flow:
  - tap по найденному неподписанному каналу не должен подписывать автоматически
  - сначала открывается preview/history канала
  - единственная точка подписки из поиска — явная кнопка `Подписаться`
  - уже подписанный канал из поиска открывается сразу как обычная room
  - после self-unsubscribe канал не должен пропадать из поиска, если у пользователя ещё есть валидный preview-access
  - channel discovery нельзя снова завязывать только на локальный список `subscriptionChannels`

### Media and Attachments

- attach modal разделяет:
  - `Приложить фотографию`
  - `Приложить файл`
- GIF идут отдельной premium-вкладкой в emoji picker
- фото в composer сначала живут локально как draft preview
- upload делается только в send-path
- фото пережимаются на клиенте перед отправкой
- для premium доступен режим отправки оригинала без сжатия
- в ленте фото и GIF открываются через fullscreen viewer
- video file-flow тоже считается базовой live-механикой:
  - `MP4 / MOV / WEBM / M4V` определяются как видео
  - видео открывается и воспроизводится внутри Tinychok, а не только скачивается
  - draft-preview и bubble copy различают `Видео` и обычный `Файл`
  - bubble в ленте не должен показывать filename и size
  - первый кадр в bubble приходит не из client-side `video#t=...`, а из server preview route `GET /api/media/preview?mediaUrl=...`
  - backend строит derived JPEG через `ffmpeg-static` и кэширует его в `server/uploads/attachment-previews/`
  - этот путь должен работать и для уже существующих video attachments; message schema не расширялась отдельным `previewUrl`
  - если video bubble снова показывает серую заглушку, первым делом проверять:
    - `curl -I 'https://api.staging.tinychok.ru/api/media/preview?mediaUrl=<video-url>'`
    - есть ли новый JPEG в `server/uploads/attachment-previews/` на staging VM
- вложения в сообщениях считаются disposable-storage, а не вечным файлообменником:
  - если новый upload не помещается в квоту, backend сначала автоматически снимает самые старые ранее отправленные вложения этого пользователя
  - сообщение / комментарий / пост при этом не удаляется целиком, а получает viewer-aware заметку:
  - владелец видит `Вложение скрыто. У вас закончилось место. Оформите подписку.` и маленькую inline-иконку `crown64`
  - собеседник видит только `Вложение скрыто.`
  - `Оформите подписку.` больше нельзя рендерить как мёртвый text-span:
    tap по этой фразе должен открывать stage `premium` и глушить bubble/menu click bubbling
  - это правило касается именно message-attachments; аватарки и GIF-библиотека не попадают под такой auto-evict flow
- в composer preview при подготовке нового файла должен появляться warning, если текущая квота не вмещает upload:
  - copy обязан прямо говорить, что premium расширяет хранилище
  - без premium старые отправленные фото и файлы могут быть удалены автоматически для освобождения места
- экран `Хранилище` внутри настроек показывает только вложения и GIF
- аватарки профиля, группы и канала считаются внешним хранилищем Tinychok и не входят в пользовательскую квоту
- группа больше не имеет собственного хранилища
- все вложения из группы, включая корневые сообщения и треды, считаются в личном хранилище автора
- channel primary quota: `500 MB`
- если premium истёк после активного premium-периода, user storage quota и archive quota не должны сжиматься назад до free
- если auto-cleanup уже отправил вложения пользователя в архив, а затем quota выросла и свободного места снова хватает:
  - backend должен попытаться вернуть такие auto-archived вложения обратно в исходные сообщения / посты / комментарии
  - это работает только для auto-archive записей, где сохранён restore-route
- ручное удаление из `Хранилища` не должно убирать bubble целиком:
  - владелец видит `Вложение удалено вами из хранилища, чтобы освободить место.`
  - читатель видит `Вложение удалено владельцем из хранилища, чтобы освободить место.`

### Groups Tariff Limit

- активные группы владельца ограничены тарифом:
  - free = `5`
  - premium = `20`
- этот контракт держится в двух слоях:
  - ранний UX-guard в `src/App.tsx`
  - server-authoritative guard в `server/src/store.ts#createGroup`
- важный инвариант:
  - клиентский guard никогда не заменяет серверный
  - stale frontend и прямой API request обязаны получать server reject
- в лимит входят только активные группы владельца
- `owner-deleted` и `self-service-data-hidden` группы в лимит не входят
- premium page и create-group modal должны оставаться синхронными с теми же числами `5 / 20`
- staging уже ловил operational баг, где VM имела новый код, но публичный API ещё отвечал старым поведением до жёсткого restart
- поэтому после deploy для этой зоны обязателен live API smoke-check, а не только тесты и grep по bundle

### Avatar Pipeline

- один и тот же avatar pipeline используется для:
  - профиля
  - канала
  - группы
- поддерживаются `JPG`, `PNG`, `WebP`
- изображение автоматически:
  - режется в квадрат по центру
  - уменьшается до нормального размера
  - пережимается перед upload
- пользователь видит preview уже обработанного результата до сохранения
- `Правила загрузки аватарки` на `/avatar-upload-rules.html` считаются публичным moderation-contract:
  - аватарка прямо описана как пользовательский контент под ответственность автора
  - Tinychok вправе удалить такую аватарку без предварительного уведомления
  - повторная загрузка запрещённой аватарки после удаления допускает staff-блокировку аккаунта
- backend avatar upload сейчас защищает только технический периметр:
  - MIME whitelist `JPG/PNG/WebP`
  - размер до `5 МБ`
  - проверка сигнатуры файла
  - это не заменяет содержательную модерацию и не считается авто-детектором запрещённого контента
- staff должен иметь возможность:
  - просмотреть аватарку с обязательной записью причины в audit log
  - удалить или скрыть media через admin
  - заблокировать пользователя при тяжёлом или повторном нарушении

### GIF Library

- GIF-вкладка целиком premium-only
- локальный upload `.gif` остаётся основным способом пополнения библиотеки
- библиотека GIF привязана к конкретному пользователю, но поиск может показывать GIF из общего Tinychok pool
- новые GIF после upload сразу подготавливаются к отправке в текущую комнату
- защита от дублей идёт по `normalized fileName + size`
- GIF можно удалить из личной библиотеки
- fullscreen viewer для GIF не даёт обычный download, а предлагает `Добавить ГИФ себе`
- количество жалоб под GIF в обычном viewer не показывается

### Browser Notifications

- браузерные уведомления работают через стандартный `Notification API`
- они генерируются из роста unread по:
  - direct dialogs
  - groups
  - channels
  - thread inbox
- thread inbox card reuse-ит `avatarImage` source room, а не synthetic initials, когда у группы/канала уже есть avatar
- `Настройки режима "Тихо"` — отдельная settings-scene и release-blocking контракт
- `quietModeSettings` хранится server-side в `Session/Account` и должен нормализоваться к дефолтам:
  - `dialogs=true`
  - `channels=true`
  - `groups=true`
  - `threads=true`
  - `contactRequests=true`
  - `autoInvisibility=true`
- чек-боксы quiet-settings управляют только visual badges и browser notifications:
  - unread должен продолжать накапливаться как обычно
  - room read-state, typing и delivery не должны переназначаться этой настройкой
- при активном `Тихо` suppress режется по категориям:
  - `dialogs`
  - `channels`
  - `groups`
  - `threads`
  - `contactRequests`
- по умолчанию quiet-settings включают глушение всех этих категорий, поэтому без ручной перенастройки `Тихо` продолжает вести себя как глобальный suppress visual/push noise
- без premium quiet-scene доступна, но детальные чек-боксы locked:
  - первые пять чек-боксов визуально включены
  - `Авто-режим невидимки` визуально выключен
- `Авто-режим невидимки` управляет только авто-включением invisibility при нажатии `Тихо`
- ручной чек-бокс `Режим невидимки` в профиле остаётся отдельной premium-настройкой и не заменяется quiet-settings сценой
- у фичи есть локальный on/off toggle на уровне текущего браузера
- во вкладке диалогов сверху рендерится promo-card включения уведомлений
- `Тихо` нельзя трактовать только как локальный UI-toggle:
  - server-side `Session/Account.quietModeEnabled` используется как продуктовый quiet-флаг
- stealth join/leave в группах опираются именно на server-side `quietModeEnabled`, а не на текущее состояние браузера
- `Выключить звуки` управляет только аудио и browser-notification логикой, но не stealth join/leave

### Presence and Invisibility

- эта механика считается release-blocking:
  - любые правки presence, quiet-mode, direct read receipts, snapshot materialization и room headers обязаны прогонять dedicated regression tests
- `Режим невидимки` — отдельная server-side premium-настройка `invisibilityEnabled`
- это одна из главных premium/quiet-механик продукта и её нельзя сводить обратно к derived-only UI условию
- активная невидимка скрывает online presence только для других пользователей
- кнопка `Тихо` для premium-пользователя при каждом новом включении должна автоматически выставлять `invisibilityEnabled=true`
- если `Невидимка` была auto-enabled самим `Тихо`, fresh `Тихо -> off` обязан автоматически вернуть `invisibilityEnabled=false`
- если `Невидимка` была включена вручную отдельным чек-боксом в настройках, fresh `Тихо -> off` не должен выключать её
- внутренний provenance-флаг `invisibilityAutoEnabled` допустим только как память о том, что текущее invisibility-состояние было auto-enabled quiet-mode; это не отдельный пользовательский режим
- пользователь может вручную выключить `Режим невидимки` в настройках и снова стать видимым, не отключая сам `Тихо`
- в настройках под `Выключить браузерные уведомления` должен оставаться отдельный блок с чек-боксом `Режим невидимки` и premium crown
- для других пользователей такой аккаунт должен материализоваться глобально как офлайн:
  - `online=false`
  - без зелёной точки
  - без `В сети` в direct room header
  - с обычным offline-presence path (`lastSeen` / `был(а) недавно в сети`)
- для direct read receipts действует тот же stealth-контракт:
  - если пользователь читает личные сообщения при активной невидимке, его собственный `unread` должен сбрасываться
  - но второму участнику нельзя зеркалить `readAt`; сообщение должно оставаться с одной галочкой, как непрочитанное
  - invisibility и one-tick behavior нельзя разводить разными product-facing флагами или client-only условиями; внутренний provenance-флаг допустим только для quiet-origin auto-toggle
- сам пользователь в своих двух шапках должен видеть серый ring-dot `Невидимка`:
  - в левой верхней шапке аккаунта
  - в шапке профиля в настройках
- если premium не активен, `Режим невидимки` нельзя активировать из настроек, а тап по нему должен вести в premium-экран
- если premium не активен, сам по себе `Тихо` не должен скрывать online presence от других
- presence masking должен оставаться server-authoritative и не решаться отдельными client-only условиями по спискам/комнатам
- обычный индикатор `В сети` теперь тоже считается release-blocking presence-контрактом:
  - он не должен вычисляться через `database.sessions` или retention cleanup
  - source of truth только live realtime/websocket presence
  - `logout` обязан делать server-side invalidation текущего token через `/api/logout`, а не только локальную очистку storage
  - если websocket закрыт и живых сокетов у аккаунта больше нет, другим пользователям нужно быстро материализовать офлайн-состояние
  - coarse offline-текст остаётся прежним: `был(а) недавно в сети`

### Contact Requests

- contact links считаются server-authoritative direct contract
- существование пустого direct dialog больше не означает установленный контакт
- для обычной личной переписки source of truth только `contactLinks.status === 'accepted'`
- delete contact hides dialogs for both sides
- hidden former-contact rooms reopen through search with preserved per-side history
- lifecycle direct contact должен оставаться таким:
  - `none -> pending-outgoing / pending-incoming -> accepted`
  - `pending-outgoing -> cancel -> none`
  - `reject -> none`
  - `block -> blocked-by-peer / blocked-by-me`
- pending request не создаёт чат у получателя
- верхние вкладки раздела `Контакты` считаются отдельным UI-контрактом и не должны зависеть от `quickFilters` раздела `Диалоги`
- верхний switch в `Контактах` всегда состоит из трёх равных вкладок:
  - `Все`
  - `Новые заявки`
  - `Отправленные заявки`
- во втором и третьем табе текст не показывается:
  - `Новые заявки` рендерятся иконкой `handshake.png`
  - `Отправленные заявки` рендерятся иконкой `man-raising-hand.png`
- badge у верхних вкладок `Контактов` рендерятся внутри кнопки справа от иконки, а не в углу
- badge у верхних вкладок `Контактов` прижимаются к правому краю кнопки, а иконка не сдвигается
- если включён `Тихо` и `quietModeSettings.contactRequests=true`, visual badge в `Контактах` не показываются:
  - на нижней кнопке `Контакты`
  - на верхних вкладках `Новые заявки` и `Отправленные заявки`
- если включён `Тихо`, но `quietModeSettings.contactRequests=false`, badges у контактных заявок должны оставаться видимыми
- `Заявки` в разделе `Контакты` показывают только входящие pending requests
- `Отправленные запросы` показывают только исходящие pending requests
- секция `Отправленные запросы` не рендерится, если исходящих pending requests нет
- во вкладке `Все` секция `Заявки` не рендерится, если входящих pending requests нет
- pending request не создаёт обычный видимый чат у инициатора:
  - у инициатора живёт hidden direct-room с сохранённой историей
  - эта room открывается через search или карточку в `Отправленные запросы`
- карточка входящей заявки открывает общую direct-room с сохранённой историей, если она уже была
- карточка исходящей заявки тоже открывает общую direct-room с сохранённой историей, если она уже была
- у входящей request-card иконка `handshake` — это отдельная быстрая кнопка `Подтвердить контакт`; тап по самой плашке по-прежнему открывает комнату
- открытие request-room из `Контактов` не должно переводить пользователя в `Диалоги`; пользователь остаётся в `Контактах`, а соответствующая request-card подсвечивается как активная
- icon-contract для request cards:
  - входящие pending requests используют `handshake.png`
  - исходящие pending requests используют `man-raising-hand.png`
- решение по `pending-incoming` принимается только в самой комнате через полноширинные composer actions
- `pending-outgoing` живёт только в комнате через нейтральную полноширинную кнопку `Отменить заявку`
- если входящих заявок нет, секция `Заявки` показывает только технадпись `Заявок пока нет`, без пустой chat-card
- нижняя кнопка `Контакты` в bottom-nav считает только входящие заявки
- вкладка `Отправленные заявки` показывает только счётчик исходящих pending requests и не влияет на bottom-nav badge
- верхние фильтры `Диалогов` тоже используют inline badge внутри кнопки; для узких icon-tabs badge не должен вылезать за кнопку
- при активном `Тихо` suppress в `Диалогах` режется по quiet-settings:
  - `quietModeSettings.dialogs` скрывает direct badges и direct browser notifications
  - `quietModeSettings.channels` скрывает channel badges и channel browser notifications
  - `quietModeSettings.groups` скрывает group badges и group browser notifications
  - `quietModeSettings.threads` скрывает thread badges и thread browser notifications
- `Контакты` в нижнем меню показывают только accepted contacts
- client-side contacts contract должен жить отдельно от общего chat-list UI:
  - tabs/filter contract хранится отдельно от `quickFilters`
  - request-card contract хранится отдельно от обычных chat cards
  - request-room open / accept / cancel / reject / block flow должен оставаться в отдельном contacts-specific client layer, а не размазываться обратно по `App.tsx`
- после accept:
  - у обоих появляется canonical direct chat
  - в чате появляется server-authored системное сообщение `Контакт установлен`
  - инициатор должен получить unread / notification на этот новый чат
- direct dialog existence не равно accepted contact и не может использоваться как shortcut для доставки сообщений
- `Удалить контакт` не должен физически удалять direct history:
  - server скрывает dialog copies у обеих сторон и сбрасывает `contactLinks` в `none`
  - старая история остаётся per-side и показывается снова после reopen через search
  - hidden former-contact не должен пропадать из server-side account search
  - если одна сторона отдельно делала `deleteDialogHistory`, это не должно стирать историю у второй стороны
  - incoming contact request после former-contact reopen не должен сам показывать скрытый чат у получателя до accept
- former-contact lifecycle считается отдельным release-blocking инвариантом:
  - delete contact hides both visible copies immediately
  - both sides must still find each other through search afterwards
  - reopen must reuse hidden history instead of creating a fresh empty dialog
  - repeated delete -> reopen -> accept cycles must preserve этот контракт
- эта механика считается release-blocking при любых правках direct dialogs / contacts / snapshot materialization / notifications

### Groups

- приглашение в группу больше не должно автодобавлять пользователя в группу в момент invite-send
- server хранит `pendingGroupInvitations` и direct invite message отдельно от реального membership
- tap по invite-card в личке автоматически вступает в группу и сразу открывает room
- lifecycle group invite должен оставаться таким:
  - `invite -> pending`
  - `join -> pending cleared`
  - `self-leave -> pending restored`
  - после self-leave владелец сразу перестаёт видеть ушедшего участника в `participants`
- popup группы называется `Идеалогия группы`:
  - это отдельное длинное поле `description`
  - оно не смешивается с preview последнего сообщения
- owner-only пункт `Настройки группы` в room actions menu идёт с leading icon `edit100.png`
- `Настройки группы` держат existing avatar path:
  - live preview текущей аватарки
  - `Сменить` открывает тот же group avatar picker, что и create-flow
- архивную группу невладелец всё ещё может покинуть через `Покинуть группу`, даже если группа уже read-only
- group membership events считаются критичным server-authoritative контрактом:
  - обычный join публикует системное сообщение `К группе присоединился Имя Фамилия`
  - обычный self-leave публикует системное сообщение `Имя Фамилия покинул группу`
  - смена организатора публикует системное сообщение `У группы новый организатор: Имя Фамилия`
  - эти события должны реплицироваться во все актуальные group copies одного `sharedId`
  - UI рендерит их отдельным system-row, а не обычным bubble
- quiet bonus для групп зафиксирован жёстко:
  - если у участника включён server-side `Тихо` (`quietModeEnabled`), системная надпись о join не создаётся
  - если у участника включён server-side `Тихо` (`quietModeEnabled`), системная надпись о leave не создаётся
  - `Выключить звуки` не влияет на stealth join/leave
  - смена организатора группы всегда публикует системное событие, даже если новый организатор в `Тихо`
- premium crown в group system events — часть контракта:
  - join / leave / owner-transfer сохраняют snapshot premium-флага актёра прямо в событии
  - историческое системное сообщение не должно менять текст или crown задним числом из-за последующих profile changes
- source of truth для membership / re-invite в группах:
  - membership определяется только active membership copies / normalized identifier
  - display title, nickname и status не участвуют в решении `состоит ли пользователь в группе`
  - после self-leave владелец обязан снова видеть контакт в inviteable списке и может отправить рабочий re-invite
  - popup `Пригласить в группу` держит уже состоящих участников неактивными строками
  - tap по такой строке не должен пытаться слать invite и показывает inline hint `Этот контакт уже состоит в группе.` прямо под этой плашкой
- staff archive для группы — отдельный moderation-контур:
  - admin detail показывает `Архивировать группу` / `Разархивировать группу`
  - archived group скрывается у обычных пользователей, но не удаляется server-side
  - unarchive возвращает её тем же участникам без пересоздания и без потери истории
  - group/thread archive toggle обязан триггерить broadcast affected user snapshots сразу после admin action

### Managed Channel Projection Invariant

- у каждого `managedChannel` должна существовать canonical owner `subscription copy`
- все subscriber-affecting пути (`invite`, `subscribe`, `post`, `update`, `remove subscriber`) должны сначала обеспечивать этот owner-copy invariant
- owner-side список подписчиков и `readers` считаются сломанными, если этот invariant нарушен даже на legacy данных; normalization и runtime-path обязаны его восстанавливать
- передача канала должна быть только реальной server-side сменой `ownerIdentifier`, а не delete-flow:
  - transfer никогда не должен архивировать или удалять канал
  - history и subscriber copies должны сохраняться для всех участников
  - подтверждение передачи канала идёт только текущим паролем владельца, без SMS
- до отдельного продуктового возврата фичи channel transfer скрыт из обычного пользовательского UI
- owner-only пункт `Настройки канала` в room actions menu идёт с leading icon `edit100.png`
- staff archive для канала — отдельный moderation-контур:
  - admin detail показывает `Архивировать канал` / `Разархивировать канал`
  - archive reason = `admin-archived`
  - архивированный канал скрывается у владельца и подписчиков из обычных snapshot lists
  - archived channel не должен открываться через preview/search обычному пользователю
  - unarchive возвращает тот же канал и ту же историю без пересоздания
  - channel archive toggle обязан триггерить broadcast affected user snapshots сразу после admin action

### Archive Invariant

- user-facing delete не должен физически purge-ить сущность из runtime store по умолчанию
- вместо hard delete сервер переводит сущность в `архив / tombstone`, а уже клиентские projection-слои решают:
  - скрывать ли сущность из активных списков
  - оставлять ли архивную room видимой участнику
  - открывать ли historical invite как live preview или tombstone preview
- это особенно важно для:
  - managed channels
  - orphaned groups
  - historical invite links в личных диалогах

### Deletion Policy Matrix

- `Удалить канал`:
  - на сервере канал архивируется с `owner-deleted`
  - из обычных user channel lists он исчезает
  - старые invite-ссылки могут резолвиться только в tombstone-preview
- `Удалить группу` владельцем:
  - на сервере group copies архивируются с `owner-deleted`
  - из обычных user group lists группа исчезает у всех участников
  - это не `orphaned-group` и не read-only room для обычного UI
- `Покинуть группу` невладельцем:
  - удаляет membership copy у ушедшего участника
  - сразу убирает его из `participants` у владельца
  - для живой группы восстанавливает `pendingGroupInvitation`, чтобы старый invite снова работал
- self-service удаление аккаунта:
  - owned channels архивируются как скрытые owner archives
  - owned groups сначала пытаются передать ownership живому участнику
  - если передавать некому, группа становится `orphaned-group` и остаётся видимой архивной room для выживших участников
- `orphaned-group`:
  - это единственный обычный user-facing архивный режим для группы
  - такую группу невладелец всё ещё видит и может покинуть

### Channels UI Contract

- в list-view `Управление каналами` не должно быть отдельного eyebrow `Каналы`
- если каналов нет, header copy должен быть `Пока нет каналов. Создайте свой первый канал.`
- в empty-state не должно быть отдельной белой карточки с текстом; остаётся только copy в header и CTA `Создать канал`

### Auth and Support Entry Points

- login на staging закрыт SmartCaptcha на шаге запроса SMS
- пользовательский auth-flow теперь password-aware:
  - новый пользователь: `phone -> sms -> profile + password -> authenticated`
  - существующий пользователь с паролем: `phone -> password -> authenticated`
  - существующий пользователь без пароля: `phone -> sms -> password-setup -> authenticated`
  - `Забыли пароль?`: `password -> phone + SmartCaptcha -> sms reset -> password-reset -> authenticated`
- password-login защищён server-side lockout по связке `identifier + ip`
- после `3` неверных password attempts следующий login по этой связке требует SmartCaptcha прямо на шаге пароля
- после `password-setup` и `password-reset` все старые bearer sessions пользователя отзываются; активной остаётся только новая сессия текущего входа
- в `Настройки -> Управление` доступны:
  - `Сменить пароль`
  - `Удалить аккаунт`
- self-service удаление аккаунта требует текущий пароль, разлогинивает пользователя, архивирует старый аккаунт на сервере и освобождает номер для новой регистрации как нового жизненного цикла
- checkbox `Удалить и данные тоже` не делает hard-delete сервера; он только усиливает архивный режим для пользовательских данных, при этом admin/legal доступ к историческим данным сохраняется
- для обычных пользователей self-service deleted аккаунт больше не участвует в живом продукте:
  - не попадает в user search
  - исчезает из списка контактов
  - direct history с ним не отдаётся
  - писать ему нельзя
- публичный fallback-образ удалённого аккаунта:
  - имя `Аккаунт удалён`
  - пустой nickname
  - ghost-placeholder вместо аватара в edge-case рендерах
  - старый nickname освобождается и может быть занят новым live-аккаунтом
- orphan policy после self-service удаления:
  - owned managed channels переводятся в `архив / read-only` с archive reason
  - owned groups без чекбокса `Удалить и данные тоже` передают ownership первому живому участнику из текущего списка
  - owned groups с чекбоксом или без живых участников переводятся в `архив / read-only`
  - старые исторические ссылки сохраняют архивную сущность удалённого аккаунта и не матчатся автоматически на новый live-аккаунт с тем же номером
  - архивные каналы не отдают старые посты в обычный user-facing payload
  - групповой контент удалённого пользователя скрывается из обычного UI только при режиме `account-and-user-data-hidden`
- admin login на staging тоже закрыт SmartCaptcha на шаге запроса SMS
- admin login остаётся отдельным SMS-only flow через `entryPoint=admin`; password login в админку не включён
- внизу auth-экрана есть support footer:
  - `tinychok.help@yandex.com`
  - он должен оставаться доступным даже если auth flow сломан

### Premium

- premium влияет на:
  - GIF library
  - отправку фото без сжатия
  - увеличенную storage quota
- новые live-аккаунты при обычной регистрации больше не создаются с premium по умолчанию
- в проекте есть debug-layer для premium, он описан отдельно в [docs/debug-flags.md](/Users/devisjones/Documents/New%20project/tinychok/docs/debug-flags.md)

### Storage and Quotas

- free quota: `100 MB`
- premium quota: `1000 MB`
- квота считается по реально сохранённым пользовательским вложениям и GIF library
- у группы собственного quota/storage больше нет: group media считается в хранилище автора
- у канала собственная primary quota: `500 MB`
- аватарки профиля, группы и канала в эту квоту не входят
- сервер проверяет квоту до сохранения нового upload
- для message-attachments этот check больше не только блокирующий:
  - сначала backend пытается освободить место автоудалением самых старых ранее отправленных вложений
  - только если после auto-cleanup места всё ещё не хватает, upload отклоняется
- orphan uploads чистятся по TTL
- orphan cleanup не должен удалять уже отправленные attachments:
  - после любого успешного send-path вложение обязано становиться `linked`
  - это касается direct / group / support / managed channel / channel thread
- usage и quota показываются в настройках пользователя
- в settings есть отдельный storage-screen, где пользователь видит и удаляет только свои вложения и GIF
- если premium истёк после уже активированного premium-периода, active quota и archive quota не должны сжиматься назад
- при росте quota backend может восстановить часть auto-archived вложений обратно в live message surfaces, если для них сохранён restore-route

### Snapshot and Attachment Security Boundaries

- `PUT /api/snapshot` не является trusted path для account/session state
- через snapshot можно сохранять только безопасные UI-флаги комнат:
  - chat `hidden / muted / pinned / pinnedMessageId`
  - group `muted`
  - subscription channel `muted`
- через snapshot нельзя менять:
  - `premium`
  - `premiumExpiresAt`
  - `avatarImage`
  - `blockedContactIds`
  - `quietModeSettings`
  - `invisibilityEnabled`
- если это правило сломать, клиент сможет снова попытаться восстановить privilege/security state из локального snapshot

- любой `attachment.mediaUrl`, пришедший от клиента, должен считаться недоверенным
- все send-path с attachment обязаны использовать единый server-side ownership guard
- валидным считается только attachment, который:
  - принадлежит текущему owner
  - подтверждён как его pending upload или его GIF library item
  - совпадает по `fileName / mimeType / size` с серверной записью
- если ownership-check не проходит, send должен падать с явной ошибкой `загрузите файл заново`, а не отправлять сообщение как будто всё в порядке

- этот security-контракт считается regression-sensitive:
  - нельзя возвращаться к голому `sanitizeMessageAttachment`
  - нельзя снова писать чувствительные account/session поля через `saveSnapshot`

### Data Retention

- исторические данные по умолчанию больше не хранятся бессрочно
- server-side cleanup режет исторические данные старше `3 лет`
- под retention сейчас попадают:
  - server sessions
  - IP-история логинов и смен IP
  - admin audit log
  - moderation reports
  - direct / group / channel history
  - thread comments и state, если корневой контент уже вышел за retention window
  - user GIF library
- намеренно не удаляются только по возрасту:
  - сам `account`
  - текущий профиль
  - активный `passwordHash`
  - current premium state
  - текущие аватары
- cleanup запускается на старте backend и затем периодически по runtime env
- отдельный актуальный документ по retention лежит в [docs/data-retention.md](/Users/devisjones/Documents/New%20project/tinychok/docs/data-retention.md)

### Admin Panel MVP

- отдельный internal admin frontend рендерится host-aware через:
  - `admin.staging.tinychok.ru`
  - `admin.tinychok.ru`
- production admin по умолчанию выключен через `ADMIN_PANEL_ENABLED=false`
- авторизация staff идёт через существующий bearer-token auth flow, но доступ к admin API разрешён только аккаунтам с `staffRole`
- роли:
  - `owner`
  - `moderator`
  - `support`
- server-side permission matrix лежит в `server/src/admin-permissions.ts`
- admin API и origin gating лежат в `server/src/admin-routes.ts`
- данные staff/admin хранятся в основном state store:
  - `staffRole`
  - `blockedAt`
  - `blockedReason`
  - `lastActiveAt`
  - `adminReports`
  - `adminAuditLogs`
- bootstrap первого staff делается только через CLI:

```bash
npm run bootstrap:staff -- <identifier> <owner|moderator|support>
```

- перед bootstrap нужный пользователь уже должен существовать как обычный staging account
- admin UI локализован под русский интерфейс и сейчас состоит из разделов:
  - `Сводка`
  - `Пользователи`
  - `Жалобы`
  - `Каналы`
  - `Группы`
  - `Треды`
  - `Диалоги`
  - `Медиа`
  - `Аудит лог`
- `Сводка` показывает только агрегированные продуктовые сущности, а не fan-out копии:
  - пользователи
  - открытые и закрытые жалобы
  - premium с разбиением на месячные и годовые планы
  - группы
  - каналы
  - треды
  - медиаобъекты
  - суммарное storage usage
- `Пользователи` дают:
  - поиск по `id`, `username`, телефону
  - вкладки `Все` и `Заблокированные`
  - просмотр карточки пользователя
  - user list намеренно не показывает profile-status строкой прямо в списке
  - текущий статус пользователя показывается только в detail-card выбранного пользователя
  - backend хранит полную историю непустых смен статуса пользователя с датой установки
  - из detail-card можно скачать CSV всей истории статусов через кнопку с `dwnl.png`
  - IP-история тоже вынесена в отдельную detail-card и скачивается той же icon-button механикой
  - для архивных self-service deleted аккаунтов карточка должна показывать:
    - исходный телефон через `originalIdentifier`
    - флаг `Удалён пользователем`
    - дату удаления
    - режим удаления
  - просмотр сводки IP-истории:
    - последний IP
    - когда он был замечен
    - IP последнего логина
    - дата последнего логина
    - число смен IP
  - блокировку / разблокировку
  - ручную выдачу / снятие premium
  - просмотр аватарки с обязательной записью в audit log
  - export CSV по admin-аудиту этого пользователя
  - owner-only `Логи IP`:
    - требует подтверждения staff-идентификатором
    - требует обязательное основание
    - умеет период `from/to`
    - пишет отдельную запись `admin.ip-logs.download` в audit log
  - owner-only `Юр. выгрузка ZIP`:
    - требует подтверждения staff-идентификатором
    - требует обязательное основание
    - умеет период `from/to`
    - умеет опционально включать media-файлы
    - период `from/to` применяется ко всем разделам архива одинаково, включая `reports`, `audit` и `ip`
    - пишет отдельную запись `admin.legal-export.download` в audit log
- `Жалобы` работают как moderation queue:
  - новые непросмотренные тикеты дают badge в левой навигации и точку в списке
  - открытие тикета снимает unread-статус
  - в `Internal notes` живут как ручные заметки, так и trail по admin-действиям внутри тикета
  - кнопка просмотра контента из `Entity preview` всегда логируется в audit log
  - действие `Заблокировать пользователя` в тикете намеренно унифицировано с обычной блокировкой пользователя; это тот же server-side block flow, а не отдельная softer-механика
- moderation для media и entity устроена так:
  - `Hide` убирает продуктовую сущность из пользовательского UI целиком, вместе с сообщением / постом / комментарием, а не только с вложением
  - `Delete` делает то же для UI, но дополнительно удаляет media-объект из storage / pending uploads
  - `Скачать` и `Посмотреть` в moderation flow всегда логируются в audit log
- `Медиа` показывает:
  - тип вложения человеческим языком (`Фото`, `GIF`, `Файл`, `Аватарка` и т.д.)
  - владельца как ссылку в `Пользователи`
  - продуктовый контекст (`Личный диалог`, канал, группа)
  - имя файла
  - дату и время
  - размер
  - количество связанных жалоб
  - действия `Скачать`, `Hide`, `Delete`
- `Диалоги` работают через выбор двух пользователей:
  - сначала выбирается первый пользователь
  - затем staff видит список его диалогов
  - выбор диалога автоматически подставляет второго пользователя
  - CSV выгружается уже для канонического диалога между двумя пользователями
- CSV export сейчас есть для:
  - audit log
  - пользователя
  - каналов
  - подписчиков каналов
  - групп
  - участников групп
  - тредов
  - диалогов
- помимо CSV export теперь есть owner-only legal export:
  - один ZIP архив по конкретному пользователю
  - внутри:
    - `manifest.json`
    - `account.json`
    - `ip/`
    - `dialogs/`
    - `groups/`
    - `channels/`
    - `threads/`
    - `reports/`
    - `audit/`
  - `media/` metadata
  - при `includeMedia=true` архив дополнительно подтягивает сами media-файлы из storage
- большие owner-only архивы теперь идут через блокирующий popup подготовки:
  - progress bar
  - отдельная стадия подготовки и отдельная стадия передачи браузеру
  - `Отмена` должна реально прерывать job, а repeated click не должен плодить несколько экспортов
- для admin-списков, где сущность размножается по пользовательским копиям, canonical aggregation принципиален:
  - staff должен видеть продуктовую сущность один раз
  - moderation, detail-view и CSV должны цепляться к canonical entity, а не к viewer-copy
  - иначе админка начинает показывать фантомные дубликаты, неверные счётчики и разъезжающиеся exports
- каналы являются эталонной схемой агрегации:
  - canonical key строится по владельцу канала и нормализованному `@handle`
  - admin UI показывает один канал, даже если backend хранит несколько подписочных копий
  - detail / export / moderation всегда должны цепляться к canonical entity, а не к viewer-copy
  - CSV подписчиков канала тоже должен собираться по canonical handle и дедупить ownerIdentifier
- группы должны агрегироваться как одна сущность группы, привязанная к создателю, а не к каждому участнику
- треды должны агрегироваться по корневому сообщению треда:
  - корневое сообщение = сама сущность треда
  - все остальные сообщения внутри треда = комментарии к этому треду
  - owner треда = автор корневого сообщения

## Operational Invariants

- staging должен оставаться закрыт сразу двумя уровнями:
  - `basic auth` на frontend
  - allowlist телефонов на backend
- staging admin тоже должен оставаться за `basic auth` и использовать backend allowlist для staff SMS login
- user staging и admin staging используют разные basic-auth credential stores
- admin basic auth дополнительно прикрыт `fail2ban` lockout-ом по IP
- backend allowlist на staging режет `request-code`, `verify-code` и `register`; существующий user password-login после уже созданного аккаунта опирается на `basic auth + password`, а не на SMS allowlist
- delete-path обязан работать server-side и не должен зависеть только от локального optimistic UI
- `Удалить переписку у всех` в direct-диалоге должен очищать комнату у обеих сторон
- server-side direct history при этом не удаляется физически, а архивируется для admin restore
- если server delete-for-everyone не выполнился, клиент не должен локально имитировать успешное удаление
- автоскролл вниз в комнатах — критичный UI-инвариант:
  - opening room must land on the latest item
  - own send must land on the latest item
  - incoming should auto-scroll only when the user is already near bottom
  - prepend older history must preserve viewport and must never fight open/send scroll-to-bottom
  - visible scrollbar в room feed считается дефектом layout и не должен ложиться поверх bubbles
- premium debug state может использоваться на staging, но не должен попадать в production без отдельного решения
- production deploy обязан идти в режиме `TINYCHOK_APP_ENV=production`, чтобы тестовые сущности не попадали в боевой runtime
- admin production нельзя включать без отдельного ручного решения по env и rollout-проверке staging

## Smoke Checklist

- auth flow на staging через allowlist номер
- регистрация нового live-аккаунта без premium по умолчанию
- direct / group / channel opening с history window
- автоскролл вниз в room feed:
  - open long direct / group / channel / thread => сразу на последнем элементе
  - own send => сразу на последнем элементе
  - incoming while near bottom => остаёмся внизу
  - incoming while reading older history => не должно срывать вниз
  - scrollbar не должен быть видим поверх сообщений
- day divider и догрузка старой истории вверх
- create-flow канала:
  - пустые поля `title`, `statusText`, `description`
  - после create room открывается сразу
  - в истории есть системный элемент `Канал создан`
- новый подписчик канала видит всю предыдущую историю канала, а не только посты после join
- thread inbox и unread badge
- reply flow во всех типах комнат
- photo attachments:
  - preview до отправки
  - `только фото`
  - `текст + фото`
  - fullscreen viewer
- GIF flow для premium
- browser notifications prompt + permission flow
- avatar upload для профиля, канала и группы
- storage quota auto-cleanup / warning при превышении лимита
- storage-screen с удалением вложений / GIF и исключением аватарок из пользовательской квоты
- websocket reconnect must never let a stale close event mark a newer live socket offline
- query-token websocket auth is legacy and must stay behind strict origin allowlisting
- session TTL = 30 дней для user bearer sessions; expired session должна одинаково падать в bootstrap, HTTP API и `/ws`
- password change/reset must revoke every other session of the user and close their live realtime sockets
- same `clientDeliveryId` in the same direct/group/channel/support surface must be treated as a successful no-op, not as a duplicate send
- публичная privacy policy теперь тоже говорит об этой модели:
  - вложения могут удаляться автоматически при достижении лимита пользовательского хранилища
  - сообщение, пост или комментарий могут сохраниться без самого вложения
  - отдельные backup сроки не означают обещание бессрочного хранения пользовательских файлов
- delete flow с повторным входом в комнату
- delete history for everyone in direct dialogs:
  - очищает комнату у обеих сторон
  - server-side история не удаляется физически, а архивируется
  - history endpoint после этого тоже должен быть пустым у обеих сторон
  - ошибка server-side delete-for-everyone не должна приводить к локальному fake-success у инициатора
- delete single message for everyone in direct dialogs:
  - это release-blocking фича
  - удаляет сообщение у обеих сторон только если сообщение отправил сам инициатор
  - для входящего сообщения action `Удалить у всех` не должен показываться вообще
  - если такой запрос всё же ушёл на backend, сервер обязан отказать и не архивировать ни одну копию
  - локальный direct self-delete теперь retention-safe: `Удалить у меня` и `Удалить переписку у меня` архивируют owner-copy вместо физического purge
  - admin/legal export и dialog summary должны смотреть на canonical transcript по обеим копиям, иначе локальный self-delete превращается в обход server retention
- admin login под owner/moderator/support
- dashboard cards в `Сводке` без дубликатов по каналам / группам / тредам
- user search, block/unblock, premium toggle и avatar view в admin
- report unread badge, note trail, close, блокировка пользователя, hide или delete entity
- media download / report content view / avatar view с записью в audit log
- dialogs flow:
  - выбор первого пользователя
  - выбор канонического диалога
  - export CSV
