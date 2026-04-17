# Release Contracts

Единый документ по release-blocking контрактам Tinychok. Если хотя бы один из этих пунктов нарушен, релиз считается сломанным даже при зелёных тестах, `healthz=ok` и рабочем UI.

## Зачем это нужно

- В Tinychok уже были регрессии, которые не ломали сборку, но ломали живой продукт:
  - staging уходил в endless basic-auth loop из-за wrong frontend build
  - analytics тихо выключались из-за перетёртого env
  - иконки пропадали из-за неправильных прав на static assets
  - `В сети` зависал из-за session-based presence вместо live websocket presence
- Все такие случаи должны ловиться автоматически до или сразу после deploy.

## Release-Blocking Contracts

### 1. Staging Build Contract

- staging frontend нельзя выкатывать из plain `npm run build`
- единственная допустимая сборка для staging: `npm run build:staging`
- dist обязан содержать runtime references на:
  - `https://api.staging.tinychok.ru`
  - `wss://api.staging.tinychok.ru/ws`
- если frontend падает обратно на same-origin `/api` и `/ws`, Chrome начинает заново открывать basic-auth окно и staging выглядит как "не пускает"
- `scripts/verify-staging-dist.mjs` обязан проверять не только bootstrap `assets/main-*.js`, но и все staged `dist/assets/*.js`, потому что user/admin entry теперь lazy-split
- staging deploy обязан стартовать только из чистого commit-backed worktree; rsync из грязного workspace больше не считается допустимым rollout
- staging VM git remote `origin` обязан смотреть прямо на `git@github.com:devisjjones/tinychok.git`
- кастомные SSH alias вроде `github-tinychok` не считаются допустимым release-контрактом, если из-за них staging теряет воспроизводимый `fetch/pull`
- staging rollout нельзя считать закрытым, пока live VM commit не совпадает с `origin/codex/staging-deploy`

### 2. Runtime Health Contract

- staging runtime после restart обязан пройти:
  - `GET https://api.staging.tinychok.ru/healthz`
  - `GET https://api.staging.tinychok.ru/readyz`
  - `GET https://api.staging.tinychok.ru/api/client-config`
- недостаточно видеть только `systemd active`
- недостаточно видеть только `healthz=ok`
- deploy-script обязан переживать краткое окно `502` сразу после `systemctl restart` и retry-ить runtime verifier, пока backend заново поднимает socket
- deploy должен падать, если runtime-check не прошёл
- stale runtime recovery тоже считается release-blocking контрактом:
  - `GET /api/client-config` обязан отдавать `release.buildId`
  - все `/api/*` ответы, кроме `GET /api/media/preview`, обязаны приходить с `Cache-Control: no-store`
  - user app обязана уметь один раз hard-refresh-нуться при build mismatch и перезапрашивать bootstrap при возврате stale вкладки из mobile Chrome / BFCache
- persisted auth snapshot тоже входит в этот runtime contract:
  - auth snapshot в [src/app/storage.ts](/Users/devisjjones/Documents/tinychok/src/app/storage.ts) обязан оставаться schema-versioned
  - любое несовместимое изменение persisted auth shape должно bump-ать schema version, чтобы stale local storage не воскрешал сломанные сессии после deploy
- implementation ownership после рефакторинга больше не монолитный:
  - [src/app/useDocumentTheme.ts](/Users/devisjjones/Documents/tinychok/src/app/useDocumentTheme.ts)
  - [src/app/useRuntimeSessionRecovery.ts](/Users/devisjjones/Documents/tinychok/src/app/useRuntimeSessionRecovery.ts)
  - [src/app/storage.ts](/Users/devisjjones/Documents/tinychok/src/app/storage.ts)
  - при переносе этого контракта между файлами одновременно обновлять runtime contract tests, а не оставлять их привязанными к старой географии
- file-mode persistence для dev/runtime snapshots тоже считается release-sensitive contract:
  - [server/src/jsonFilePersistence.ts](/Users/devisjjones/Documents/tinychok/server/src/jsonFilePersistence.ts) обязан коалесцировать соседние записи
  - нельзя возвращать hand-written параллельные write-paths в `store.ts`, которые снова создают race-condition между snapshot write-ами

### 3. Analytics / Yandex Metrica Contract

- analytics считаются release-blocking контрактом, а не optional telemetry
- staging не должен запускаться с:
  - `analytics.enabled=false`
  - `provider=disabled`
  - `metricaCounterId=null`
- обязательные staging env keys:
  - `TINYCHOK_ANALYTICS_ENABLED=true`
  - `TINYCHOK_ANALYTICS_PROVIDER=<log|clickhouse>`
  - `TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS=5000`
  - `TINYCHOK_ANALYTICS_MAX_BATCH_SIZE=20`
  - `TINYCHOK_YANDEX_METRICA_COUNTER_ID=108249405`
- если `TINYCHOK_ANALYTICS_PROVIDER=clickhouse`, дополнительно обязательны:
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_URL`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_DATABASE`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_TABLE`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_USER`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_PASSWORD`
  - `TINYCHOK_ANALYTICS_CLICKHOUSE_TIMEOUT_MS`
  - schema из `server/sql/yandex-clickhouse-analytics.sql`
- `108249405` — это текущий staging Yandex Metrica counter id
- production должен использовать отдельный production counter id и не должен молча наследовать staging id
- deploy staging обязан валидировать именно живой `/api/client-config`, а не только env template
- `npm run verify:staging-runtime` теперь по умолчанию ждёт `provider=clickhouse` для staging
- если staging временно откатывается обратно на `log`, verify/deploy нужно запускать с `TINYCHOK_EXPECTED_ANALYTICS_PROVIDER=log`

### 4. Staging Access Contract

- базовый контракт: `staging.tinychok.ru` и `admin.staging.tinychok.ru` закрыты через `nginx basic auth`
- временное исключение с `2026-04-07`: public user frontend `staging.tinychok.ru` намеренно открыт для внешнего review без basic auth
- это исключение нужно откатить сразу после review, раскомментировав guard в `/etc/nginx/sites-available/tinychok-staging-web`
- `admin.staging.tinychok.ru` при этом должен оставаться закрытым через `nginx basic auth`
- wrong staging build не должен снова ломать access flow
- `/api/*` и `/ws` на staging web-host должны проксироваться без повторного basic-auth challenge
- smoke-check после deploy:
  - default guard mode: `curl -u tinychok:1111 https://staging.tinychok.ru/api/client-config`
  - review exception mode: `curl https://staging.tinychok.ru/api/client-config`
  - expected result = JSON, а не `index.html`

### 5. Static Icons Contract

- все assets из `public/icons/*`, на которые ссылается frontend, должны:
  - существовать
  - быть world-readable
- права уровня `0600` считаются release-blocking багом
- минимально допустимый контракт: `0644` или эквивалент
- favicon / installable web-app icon contract тоже release-blocking:
  - `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` и `manifest.webmanifest` должны реально отдаваться staging/prod web-hostом
  - `manifest.webmanifest` обязан отдаваться как `application/manifest+json`, а не как `application/octet-stream`
  - installable icon set должен включать как минимум square `192x192` и `512x512`
  - Safari/macOS web-app install path не требует SVG для обычной app icon: PNG достаточно
  - отдельный Safari pinned-tab `mask-icon` — это уже отдельный SVG surface и его нельзя подменять ожиданием, что `manifest` или `apple-touch-icon` автоматически закроют pinned-tab поведение

### 6. Public Legal Pages Contract

- публичные legal pages и их PDF считаются release-blocking surface:
  - `/user-agreement.html`
  - `/privacy-policy.html`
  - `/premium-terms.html`
  - `/refund-policy.html`
  - `/contacts.html`
  - `/user-agreement.pdf`
  - `/privacy-policy.pdf`
  - `/premium-terms.pdf`
- premium checkout legal consent должен держать обе ссылки:
  - `/premium-terms.html`
  - `/refund-policy.html`
- support email на публичных страницах:
  - `tinychok.help@yandex.com`
- legal/general email:
  - `devisjjones@gmail.com`
- legal pages не должны тихо расходиться с утверждёнными документами
- privacy policy должна прямо покрывать текущую storage-механику:
  - пользовательские вложения не обещаны к бессрочному хранению
  - отдельные вложения могут быть автоматически удалены при достижении лимита пользовательского хранилища
  - после такого удаления связанное сообщение, пост или комментарий могут сохраниться без самого вложения
  - это не отменяет отдельные сроки хранения резервных копий и обязательные требования законодательства РФ

### 7. Presence Contract

- `В сети` = только живое websocket-соединение
- online нельзя снова завязывать на наличие записи в `database.sessions`
- `logout` обязан инвалидировать текущую server session и сразу выбрасывать token из live presence registry
- отсутствие активного websocket должно быстро убирать `В сети`
- в шапке direct room online presence показываем зелёной точкой на аватарке, а не текстом `В сети`
- mobile room headers не должны раздуваться круглыми action-buttons: back остаётся узким tall-pill слева, а star/menu — чуть более широкими tall-pill кнопками с лёгкой тенью

### 8. Websocket / Realtime Contract

- user app и admin app должны использовать тот же staging backend:
  - `https://api.staging.tinychok.ru`
  - `wss://api.staging.tinychok.ru/ws`
- Session TTL = 30 days
- password change/reset revokes every other session, but keeps the current password-change session alive
- websocket reconnect must be connection-safe:
  - stale `close/error` from an old socket must not mark a newer live socket offline
  - one token may temporarily have multiple live sockets during reconnect / multi-tab overlap
- query-token websocket auth is still legacy transport v1 and therefore must stay behind strict origin allowlisting
- snapshot fan-out builds once per identifier and reuses that payload across live tokens instead of rebuilding per token
- realtime regressions считаются release-blocking:
  - chat delivery
  - presence
  - support unread
  - thread unread
- room feed spacing contract:
  - direct, group и thread bubble feeds должны держать compact gap `3px`
  - subscription channel posts не должны автоматически наследовать этот compact gap и остаются более воздушными
  - в открытом thread room между root/source card и первым комментарием должен быть отдельный gap `12px`, как между сообщениями разных авторов
- optimistic direct/group send contract:
  - локальное pending-сообщение с hourglass не должно появляться выше уже подтверждённого хвоста ленты
  - visible room slice не должен заново пересортировывать уже собранный local tail по одному `createdAt`, если server-created timestamps у последних confirmed сообщений уже стали позже клиентского pending timestamp
  - если `createdAt` совпал, confirmed items всё равно должны оставаться раньше optimistic local ids `< 0`
  - server ack не должен визуально переставлять только что отправленное сообщение на 1-2 строки вниз
- browser history contract:
  - браузерная кнопка `Назад` на desktop и mobile browser должна сначала проходить по внутреннему стеку Tinychok
  - порядок такой: тред / комната / настройки / premium / экраны каналов / открытый поиск и только потом выход со страницы
  - первый экран, который может отдать `Back` наружу браузеру, это main-shell без открытой комнаты
  - in-app кнопки `Назад` для комнаты, треда, настроек, premium и channel-manager должны использовать тот же browser history stack, а не создавать новый fake-root entry
  - dirty `Профиль` и dirty `Настройки канала` не должны терять изменения из-за browser back: сначала открывается существующее confirm-сохранение
- thread inbox card contract:
  - avatar root-message треда должен быть прижат к верхней линии карточки, а не болтаться по vertical center
  - у avatar должен быть нижний-right badge источника треда (`group` / `channel`) с mask-обводкой, чтобы иконка не сливалась с картинкой
  - secondary row не должна дублировать `Группа:` / `Канал:` и название сущности текстом
  - preview последнего комментария должен идти как `mini-avatar + : + text`, а не как текстовое `Имя: текст`
  - счётчик комментариев должен оставаться отдельной строкой на карточке
  - image-only root/source card внутри открытого треда должен держать `time` у правого края карточки, а не сразу после thumbnail
  - header треда и root/source card должны визуально сливаться в один светлый surface:
    стык без внутренних скруглений, а root/source card не должен уходить в `mine`-коричневый цвет даже для сообщений текущего пользователя
- group sender-strip contract:
  - author avatar/name над bubble должны быть ближе к своему bubble, чем к предыдущему сообщению
  - sender name и premium-crown должны выравниваться по нижней границе avatar, а не по vertical center
  - captioned media bubble в группе не должен раздувать отдельную белую шапку сверху: верхний inset и нижний padding header-strip должны оставаться компактными
  - media-only bubble в группе тоже не должен держать раздутый white sender-header над фото: vertical padding у avatar/name strip должен оставаться компактным
  - в group room sender-strip показывается только на первом сообщении новой author-chain
  - thread comments используют тот же внешний sender-strip contract: имя/аватар живут над bubble, а не внутри bubble-body
  - group root/source card внутри треда тоже использует внешний sender-strip contract для текстовых bubble, а не вшивает имя/аватар в bubble-body
  - подряд идущие сообщения того же автора не должны повторно рендерить sender-strip
  - same-author gap в group room должен оставаться `3px`, а при смене автора возвращаться к `12px`
  - sender-strip должен стартовать по той же левой линии, что и bubble под ним, без дополнительного horizontal inset
  - selected message overlay не должен мериться только по inner bubble, если визуальный блок сообщения включает sender-strip
  - при открытии message-menu overlay и исходное сообщение должны совпадать по геометрии; если block не помещается, подскролливается room feed, а не уезжает сам overlay-bubble относительно оригинала
- support scene contracts считаются release-blocking:
  - unread staff reply должен быть виден и на кнопке `Написать в поддержку`, и на launcher-кнопке `Настройки`
  - tap по всей карточке тикета должен открывать его thread-room
  - открытый support-thread обязан сбрасывать unread по самому `supportTicket.unreadCount`, даже если у него нет записи в общем `threadInbox`
  - server retention cleanup не должен вычищать `threadStates` для `support:%`:
    иначе уже прочитанные ответы поддержки снова возвращаются как unread после hard refresh
  - после создания тикета support composer обязан сразу переходить в cooldown-card с пояснением
  - countdown может оставаться только внутренней логикой cooldown; отдельный видимый таймер пользователю не показывать
  - сырой backend-text cooldown нельзя показывать как финальный user-facing error

### 9. Direct Delete-For-Everyone Contract

- direct-message action `Удалить у всех` считается release-blocking фичей
- контракт состоит из двух частей одновременно:
  - своё сообщение можно удалить у обеих сторон
  - входящее сообщение нельзя удалить у всех
- UI не должен показывать `Удалить у всех` для входящего direct-сообщения
- backend не должен полагаться только на UI:
  - если запрос на delete-for-everyone пришёл для входящего сообщения, сервер обязан отказать
  - ни одна из двух message copies не должна исчезать или архивироваться
- ошибка delete-for-everyone не должна приводить к локальному fake-success у инициатора
- direct self-delete is retention-safe and admin/legal exports use a canonical transcript
- `Удалить у меня` в direct не должно снова становиться физическим purge сервера: запись скрывается из обычного UI, но остаётся recoverable для admin/legal до retention cutoff
- owner storage exports не должны смешивать разные продукты хранения:
  - `Выгрузка активного хранилища` и `Выгрузка архивного хранилища` не должны пересекаться по одному `mediaUrl`
  - retention-only direct attachments после `Удалить у меня` остаются только в canonical admin/legal export, а не в archive storage export
- этот контракт должен держаться:
  - runtime-тестами store
  - source-contract регрессиями UI
  - staging smoke-check перед релизом

### 10. Avatar Moderation Contract

- `/avatar-upload-rules.html` должен явно фиксировать, что аватарка является пользовательским контентом и загружается под ответственность пользователя
- avatar picker для профиля, канала и группы должен держать action-row с разнесёнными кнопками:
  - `Отмена` у левого края
  - `Применить` у правого края
- правила должны прямо разрешать Tinychok:
  - удалить аватарку без предварительного уведомления
  - ограничить или заблокировать аккаунт при тяжёлом или повторном нарушении
  - сохранить минимально необходимый moderation / audit trail для жалобы, проверки и lawful request
- backend avatar upload обязан держать хотя бы технический фильтр:
  - только `JPG`, `PNG`, `WebP`
  - максимум `5 МБ`
  - проверка сигнатуры файла
- нельзя создавать ложное впечатление, будто сервис уже умеет автоматически распознавать запрещённый визуальный контент, если такого детектора нет
- admin должен сохранять рабочий remediation-path:
  - просмотр аватарки с audit reason
  - hide / delete media
  - block user

### 11. Storage Auto-Cleanup Contract

- Tinychok — мессенджер, а не вечный файлообменник:
  - message-attachments считаются disposable-storage
  - при нехватке места backend должен сначала попытаться освободить quota автоудалением самых старых ранее отправленных вложений пользователя
- экран `Хранилище` внутри настроек показывает только вложения, которыми пользователь реально может управлять
- аватарки профиля, группы и канала не входят в пользовательскую квоту и считаются внешним хранилищем Tinychok
- общая GIF-библиотека Tinychok хранится отдельно от пользовательской quota и не должна исчезать при удалении GIF из личной библиотеки или удалении аккаунта-загрузчика
- group root attachments и group thread attachments хранятся в storage автора
- channel post attachments остаются в storage канала с квотой `500 MB`
- истечение premium снова сжимает user storage quota до free:
  - active storage quota возвращается к free-лимиту
  - archive storage quota тоже возвращается к free-лимиту
- файлы пользователя сверх free-лимита после истечения premium не должны автоматически переезжать в archive:
  - такие файлы сверх free-лимита остаются в active storage и замораживаются
  - для самого пользователя это выглядит как исчезнувшие / недоступные вложения
  - admin export активного хранилища при этом всё равно должен включать такие frozen media
- если auto-cleanup уже отправил вложения пользователя в архив из-за переполнения quota, а затем quota выросла и свободного места снова хватает:
  - backend обязан попытаться вернуть такие auto-archived вложения обратно в исходные сообщения / посты / комментарии
  - это server-side restore контракт, а не ручная клиентская операция
  - новые auto-archive записи обязаны хранить достаточный restore-route, чтобы восстановление было воспроизводимым
  - legacy `storage-quota` архив без `restoreTargets` тоже обязан восстанавливаться через unresolved `attachmentRemovedNotice` holes
- если premium возвращается после downgrade:
  - frozen active media должны снова становиться доступными без ручного migrate
  - restore archived media должен считать реальный active footprint целиком, включая ранее frozen active файлы, а не только видимый free-слой
  - если часть старых archive rows уже успела исчезнуть из archive storage, restore не должен промахиваться в более старые orphan placeholders; матчинг обязан идти по контексту и tail chronology оставшихся archive items
- auto-cleanup не должен удалять сообщение / комментарий / пост целиком:
  - в UI обязана оставаться viewer-aware заметка:
  - владелец видит `Вложение скрыто. У вас закончилось место. Оформите подписку.` с маленькой inline-иконкой `crown64`
  - собеседник / читатель видит нейтральное `Вложение скрыто.` без пояснения, у кого именно переполнено хранилище
  - фраза `Оформите подписку.` в owner-notice обязана быть светлой, подчёркнутой и открывать in-app premium screen
  - клик по этой фразе не должен открывать actions menu сообщения вместо premium-экрана
- ручное удаление из storage-screen оставляет placeholder вместо пустого bubble:
  - владелец видит текст, что вложение удалено им из хранилища
  - читатель видит текст, что вложение удалено владельцем из хранилища
- перед отправкой нового вложения composer обязан показывать warning, если upload уже не помещается в текущую квоту:
  - без premium copy должен быть `Место закончилось. Ваши прошлые фото и файлы будут скрыты. Оформите Премиум подписку ... чтобы избежать удаления файлов.`
  - `Премиум подписку` в composer-warning обязано быть контрастной подчёркнутой inline-cta на светлом warning-блоке и открывать in-app premium screen

### 11.1. Group Creation Tariff Limit Contract

- лимит активных групп владельца считается release-blocking тарифным контрактом:
  - free: максимум `5`
  - premium: максимум `20`
- create-group modal держит только UX-предупреждение и не считается источником истины
- backend `createGroup` обязан повторно проверять лимит до создания группы и возвращать понятную продуктовую ошибку даже при:
  - stale frontend bundle
  - прямом API-вызове без UI
  - частично докатившемся staging rollout
- в лимит входят только активные группы владельца
- архивные группы с `owner-deleted` и `self-service-data-hidden` в лимит не входят
- premium page обязана держать benefit-copy:
  - `До 20 групп вместо 5 на бесплатном аккаунте`
- create-group modal обязан держать:
  - явный тарифный лимит
  - текущий счётчик
  - CTA / ссылку на premium flow у free-аккаунта
  - premium crown в CTA `Открыть премиум` должна быть inline-centered и не липнуть к первой букве текста
- staging smoke-check этого контракта нельзя считать пройденным только по зелёным тестам и наличию новых строк в `dist-server/index.js`:
  - нужно подтверждать живым `POST /api/groups`, что over-limit free account получает `400`, а не `200`

### 11.1.1. Group Join History Visibility Contract

- у группы есть owner-setting `Отображать историю группы новым пользователям`
- default = `on`
- при `on` новый участник после вступления видит историю группы, которая была до его вступления
- при `off` новый участник начинает с пустой видимой истории и не должен получать backfill старых group messages
- этот контракт решается server-side в `joinGroupBySharedId`, а не только UI-флагом в настройках группы

### 11.1.2. Group And Channel Left Rail Card Contract

- group/channel cards в левом списке должны использовать одинаковую avatar-геометрию:
  - одинаковый размер
  - одинаковый left inset
  - одинаковый visual centering между краем карточки и текстовым блоком
- вертикальный padding у group-card должен оставаться компактным, без лишнего воздуха над верхней строкой и под preview
- group preview не должен дублировать текстовое `Вы` / имя последнего автора в отдельной meta-строке
- вместо этого group preview должен показывать маленькую avatar автора последнего сообщения, затем `:`, затем сам preview-text
- если для автора нет avatarImage, допустим fallback на цветной initials-avatar
- gap между карточками групп должен совпадать с общим `chat-list` gap и не разъезжаться относительно соседних списков
- переключение этого чекбокса влияет только на будущие вступления и не должно ретроактивно удалять историю у уже существующих участников

### 11.1.3. Direct Dialog Left Rail Avatar Contract

- direct dialog cards в левом списке должны использовать отдельный `dialog-list-card` avatar-slot
- avatar прямого диалога должна быть увеличена почти до group/channel размера и занимать почти всё доступное avatar-space карточки
- direct dialog avatar-stack должен быть визуально отцентрирован по высоте карточки и не прилипать к верхней кромке
- этот контракт относится только к direct dialog cards и не должен менять размеры avatar у group/channel/thread cards

### 11.1.4. Group And Channel Owner Menu Contract

- в owner-only popup menu для room action `Настройки группы` и `Настройки канала` должны рендериться с leading icon `edit100.png`
- иконка относится именно к settings action и не должна заменяться отдельным badge, вынесенным за пределы строки кнопки
- non-owner menu paths этот icon contract не получают
- `Настройки группы` не могут оставаться create-only по avatar flow:
  - в самой settings-scene должен быть live preview аватарки группы
  - должен быть доступен `Сменить`, открывающий тот же group avatar picker уже для existing group

### 11.1.4. Group Captioned Media Bubble Contract

- group photo/video bubble с подписью не должен показывать accent/background-strip над media
- специальный top-flush layout разрешён только когда над media реально есть group author header
- own media с подписью в группе не должен получать header-only spacing, если header не рендерится
- selected overlay bubble в группе и в комментариях треда не должен возвращаться к старым vertical paddings:
  - open context menu должен сохранять ту же compact высоту bubble, что и в самой ленте

### 11.1.5. Standalone Emoji Message Contract

- top-level direct-room и group-room message без вложений, без source/forward chrome и с текстом ровно в один emoji-grapheme рендерится без фонового bubble
- такой emoji визуально увеличен примерно в `2x`, а time/delivery meta остаётся отдельной бледной строкой рядом с ним
- под увеличенный emoji резервируется glyph-slot примерно в две строки обычного текста, чтобы incoming group sender-strip не слипался со смайлом
- этот contract не распространяется на:
  - subscription channel posts
  - thread comments
  - reply/thread source previews
- если group root-message с bubbleless emoji получает первый комментарий, он обязан вернуться к обычному bubbled layout, чтобы thread pill и root-card не разваливались
- selected overlay для такого сообщения не должен внезапно возвращать фон, старые paddings или outline

### 11.1.6. Inline Text Bubble Meta Contract

- обычные text-only bubbles в:
  - direct-room
  - group-room
  - subscription channel room
  - thread comments
  - thread source cards
  - selected message overlay
  должны держать `time` внутри самого bubble, а не отдельным footer-row снаружи
- короткое сообщение не должно раздуваться во вторую строку только потому, что рядом есть `time`
- длинное сообщение может занимать несколько строк, но `time` обязано оставаться внутри bubble у правого нижнего края
- если `thread source card` перекрашена в светлую surface, любые inline CTA внутри notice-copy, включая premium upsell link для скрытого вложения, должны тоже переключаться на контрастный тёмный link-style
- этот inline-meta path не должен применяться к:
  - media-only bubbles
  - standalone emoji path
  - delivery-caption path

### 11.2. Snapshot Trust Boundary

- `PUT /api/snapshot` не является источником истины для аккаунта и session-security state
- через snapshot разрешено сохранять только безопасные UI-флаги комнатного состояния, которые должны переживать клиентский sync:
  - chat `hidden / muted / pinned / pinnedMessageId`
  - group `muted`
  - subscription channel `muted`
- через snapshot запрещено менять любые чувствительные поля аккаунта:
  - `premium`
  - `premiumExpiresAt`
  - `retainedStorageQuotaBytes`
  - `retainedArchiveStorageQuotaBytes`
  - `avatarImage`
  - `blockedContactIds`
  - `quietModeSettings`
  - `invisibilityEnabled`
- premium/admin/avatar/privacy state должны меняться только через dedicated server mutations, а не через клиентский snapshot

### 11.3. PostgreSQL Hybrid Runtime Layout

- PostgreSQL runtime-store больше не должен хранить history-heavy и high-churn данные только внутри одного `app_runtime_state.payload`
- базовая `app_runtime_state` запись теперь считается slim-state и обязана исключать коллекции:
  - `dialogMessages`
  - `groupMessages`
  - `groups`
  - `subscriptionChannels`
  - `subscriptionPosts`
  - `supportTickets`
  - `threadStates`
  - `ipAccessLogs`
  - `adminAuditLogs`
  - `archivedMedia`
  - `pendingGroupInvitations`
  - `pendingChannelInvitations`
  - `pendingMediaUploads`
  - `accounts.statusHistory` через отдельную hybrid-таблицу
- эти коллекции обязаны жить в отдельных postgres-таблицах:
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
- bootstrap из legacy full-blob допускается, но после первого успешного persist runtime обязан переписаться в hybrid-normalized layout
- migration contract обязан быть per-collection:
  - если новая hybrid-таблица уже имеет строки, backend читает её как source of truth
  - если hybrid-таблица пока пуста, а legacy slim payload всё ещё содержит данные этой коллекции, backend обязан временно подняться из legacy payload и затем переписать state в новый hybrid layout
  - расширение списка hybrid-таблиц не должно молча терять данные старого postgres-state
- `GET /readyz` должен явно отдавать `storage.layout = hybrid-normalized`, если backend работает на новом postgres-layout
- reference SQL для этого контура должна лежать рядом с state-store схемой:
  - `server/sql/yandex-postgres-state-store.sql`
  - `server/sql/yandex-postgres-hybrid-runtime.sql`
- operational rollout считается завершённым только если после миграции подтверждены:
  - parity key counts между backup/restore snapshot и новыми hybrid-таблицами
  - пустой slim `app_runtime_state.payload` для всех hybrid-коллекций
  - живой bootstrap хотя бы двух аккаунтов с непустыми `chats / groups / subscriptionChannels / threadInbox`
- этот контракт нужен, чтобы message fanout, group/channel copies, thread unread state и append-only audit/ip logs не раздували один giant `jsonb` blob и не увеличивали лишний TOAST/VACUUM overhead при росте истории

### 11.3. Attachment Ownership Contract

- `mediaUrl`, пришедший от клиента, не считается доверенным сам по себе
- любой send-path с attachment обязан прогонять вложение через единый ownership guard:
  - direct message
  - group message
  - group thread comment
  - managed channel post
  - channel thread comment
  - support ticket
  - support ticket comment
  - staff support reply
- валидным считается только attachment, который:
  - принадлежит текущему owner
  - зарегистрирован в `pendingMediaUploads` как его upload
  - совпадает по `fileName / mimeType / size` с серверной записью
  - проходит сравнение после нормализации pending-upload metadata, чтобы длинные video filenames и browser-renamed uploads не ломали валидный send-path
- reuse из GIF library допустим только через server-owned shared GIF pool Tinychok
- GIF picker contract:
  - вход во вкладку, поиск и отправка GIF не требуют premium
  - локальный upload новой GIF в личную библиотеку остаётся premium-only
  - upload своих GIF имеет скрытый server-side лимит `100` штук на пользователя в календарный месяц
  - add-to-library из viewer допустим только для уже существующего в Tinychok GIF mediaUrl; произвольный чужой `mediaUrl` сервер принимать не должен
- при провале ownership-check сервер обязан жёстко отклонять send с явной ошибкой, а не пытаться молча отправить сообщение без файла

### 11.4. Pending Upload Linking Invariant

- любой attachment, который уже попал в сообщение / комментарий / тикет, обязан быть помечен как `linked`
- это инвариант живого вложения, а не только housekeeping-флаг
- orphan cleanup по TTL не должен уметь удалить вложение, которое уже записано в:
  - group
  - support
  - managed channel
  - channel thread
  - direct dialog
- новые send-path с attachment считаются неполными, если после `persist()` они не вызывают server-side helper, который отмечает upload как `linked`

### 11.5. Delivery Idempotency Contract

- одинаковый `clientDeliveryId` в одном и том же surface считается успешным no-op, а не новой отправкой
- dedupe обязателен до записи сообщения и до побочных эффектов вроде unread/update counters
- контракт должен одинаково держаться для:
  - direct message
  - group message
  - group thread comment
  - support ticket
  - support ticket comment
  - staff support reply
  - managed channel post
  - channel thread comment

### 11.5.1. Video Attachment Playback Contract

- file-flow вложений обязан распознавать video media как отдельный тип, а не оставлять его download-only файлом
- минимально поддерживаемый user-facing набор форматов:
  - `MP4`
  - `MOV`
  - `WEBM`
  - `M4V`
- backend и frontend обязаны согласованно определять video media по `mimeType` и extension inference, даже если upload пришёл через общий file picker
- video attachment внутри Tinychok должен:
  - открываться во встроенном viewer/player
  - воспроизводиться без обязательного скачивания на устройство
  - поддерживать обычный caption-flow
- video bubble в ленте не должен снова откатываться к file-card copy:
  - имя файла и размер в bubble не показываются
  - по центру поверх превью остаётся play-иконка
  - time и delivery ticks лежат поверх превью так же, как у photo bubble
- preview для video bubble обязан строиться от первого кадра уже загруженного видео:
  - source of truth = server-side `GET /api/media/preview?mediaUrl=...`
  - backend обязан уметь отдать preview и для старых video attachments без миграции message schema
  - derived JPEG preview должен кэшироваться по `mediaUrl`, чтобы повторное открытие bubble не гоняло `ffmpeg` заново
- draft-preview и bubble copy обязаны различать `Видео` и обычный `Файл`

### 11.6. External Link Warning Contract

- явные `http://` и `https://` в тексте сообщений и комментариев считаются linkify-контрактом:
  - direct
  - group
  - channel
  - thread
  - support
- raw `http/https` не должны оставаться голым текстом
- bare domains без протокола (`example.com`, `www.example.com`) не linkify в этом контракте
- переход наружу всегда проходит через warning-modal:
  - красный warning-title
  - предупреждение, что пользователь переходит во внешний источник под свою ответственность
  - совет не переходить по ссылкам от малоизвестных аккаунтов
  - кнопки `Отмена` и `Перейти`
- `Перейти` обязан открывать URL через `noopener,noreferrer`
- внутренние механики не должны ломаться этим контрактом:
  - `@контакты`
  - `@каналы`
  - invite/source cards
  - media actions
- tap по самому link-span не должен открывать menu действий сообщения

### 11.7. Quiet / Invisibility Auto-Origin Contract

- `Тихо` и `Невидимка` остаются одним product-сценарием stealth-поведения, но server/client вправе хранить внутренний provenance-флаг, чтобы помнить, была ли невидимка включена автоматически самим quiet-mode
- fresh `Тихо -> on` при `autoInvisibility=true`:
  - автоматически включает `Невидимку`, только если пользователь не включил её заранее вручную
- fresh `Тихо -> off`:
  - автоматически выключает `Невидимку`, только если она была auto-enabled самим `Тихо`
  - не должен выключать вручную включённую `Невидимку`
- ручной toggle `Режим невидимки` обязан сбрасывать auto-origin, чтобы дальнейший выход из `Тихо` не менял пользовательское решение задним числом
- это считается release-blocking контрактом:
  - auto-enabled invisibility должна сниматься обратно
  - manually-enabled invisibility должна переживать выход из `Тихо`

### 11.8. Admin User Status History Contract

- в admin user list карточки пользователей не должны показывать текущий пользовательский статус строкой в списке
- текущий статус должен жить только в detail-панели выбранного пользователя как отдельное информационное поле
- backend обязан сохранять timeline всех непустых смен статуса пользователя с датой установки
- повторное сохранение того же самого статуса не должно плодить дубликат в history
- admin detail обязан иметь CSV-выгрузку полной истории статусов через кнопку с `dwnl.png`
- IP-история пользователя должна жить в таком же отдельном info-card в detail-panel, а не только в нижнем наборе action-кнопок
- CSV IP-истории должен скачиваться из этой карточки той же icon-button механикой
- CSV должен содержать как минимум:
  - дату установки статуса
  - сам текст статуса
  - отметку, какой статус является текущим
- group detail обязан иметь inline icon-button CSV-выгрузки всех участников:
  - имя
  - телефон
  - юзернейм
- channel detail обязан иметь такую же inline icon-button CSV-выгрузки всех подписчиков канала:
  - имя
  - телефон
  - юзернейм
- group/channel participant exports считаются canonical admin exports:
  - выгрузка строится по канонической сущности, а не по viewer-copy
  - строки не должны дублироваться из-за fan-out копий
  - точка входа остаётся в detail-card рядом со счётчиком участников / читателей

### 11.8.1. Admin Large Export Progress Contract

- owner-only большие архивы в админке не должны запускаться "вслепую" по серии повторных кликов
- подготовка большого user-storage/legal export обязана идти через блокирующий popup поверх админки:
  - progress bar
  - текущая стадия
  - processed counters, если сервер их знает
  - кнопка `Отмена`
- repeated click по export action не должен стартовать несколько параллельных архивов одного и того же набора данных
- когда серверная сборка уже дошла до `100%`, но браузер ещё только принимает файл, UI не должен зависать в ложной стадии "готово":
  - должна существовать отдельная фаза передачи архива браузеру
  - если размер известен, progress показывается по байтам
  - если размер неизвестен, UI обязан показывать indeterminate transfer phase, а не статичные `100%`
- `Отмена` должна прерывать и подготовку архива, и клиентское скачивание, если оно уже началось

### 11.8.2. Plain Composer Contract

- текущий stable-контракт composer-а = обычное plain-text поле ввода
- direct dialog и generic thread room используют общий textarea-based composer contract
- support composer тоже обязан оставаться plain-text, но теперь имеет intentional split:
  - root support-scene рендерится без внешней белой wrapper-card
  - root support-scene использует увеличенный textarea вместо стандартного компактного idle-height
  - support root-scene и support-thread не показывают emoji/GIF UI
  - support root-scene и support-thread не должны давать file-attach path; допустимо только photo-attach
- runtime autoresize textarea теперь считается release-blocking контрактом, а не cosmetic detail:
  - direct, group, channel, thread и support используют общий runtime resize helper
  - textarea растёт по мере ввода новых строк, пока не упирается в свой cap
  - после достижения cap textarea обязана скроллиться внутренне, не растягивая комнату дальше
- enlarged support-root textarea держит отдельный toolbar contract:
  - в idle состоянии action buttons центрируются по высоте textarea
  - после роста textarea или при наличии attachment action buttons обязаны липнуть к правому нижнему углу
- idle textarea должна выглядеть как однострочное поле там, где не включён intentional enlarged support-root variant
- у обычного direct / group / channel / thread composer toolbar тоже stateful:
  - пока textarea остаётся однострочным и без attachment, action buttons центрируются по высоте поля
  - как только textarea вырос или появился attachment preview, action buttons возвращаются в правый нижний угол
- reply preview contract:
  - quoted reply-preview больше не должен показывать автора как `Вы`, `Собеседник` или имя
  - и inline `bubble-reply`, и attached `reply-reference` показывают только сам текст/emoji цитируемого сообщения
  - это нужно, чтобы viewer-facing UI не подменял автора цитаты двусмысленным `Вы`
- mobile viewport тоже входит в контракт:
  - composer не должен давать horizontal overflow на `390px` ширине
  - mobile composer обязан держать справа safe-area под cluster `emoji + attach + primary action`, чтобы текст даже на второй строке не наезжал на иконки
  - если пользователь уже печатает в composer на mobile browser, tap по primary submit-button не должен схлопывать клавиатуру и потом открывать её заново
  - mobile submit обязан сохранять фокус на textarea до тех пор, пока пользователь сам не закроет клавиатуру или не уйдёт из комнаты
  - direct-room status на mobile по умолчанию clamp-ится до `2` строк
  - если статус длиннее двух строк, toggle обязан раскрывать и обратно сворачивать весь текст без ломания desktop header
- profile-scene на узком mobile не должен ронять avatar и display name в две отдельные вертикальные колонки:
  - avatar и profile-copy должны оставаться в одном row-layout
  - mobile headline справа от avatar должен ужиматься, чтобы имя помещалось в header-block
  - mobile rail не должен съедать лишнюю ширину двойными outer gutters: `shell` + `rail` + `chat-list` должны держать уменьшенные боковые отступы, чтобы header, filters, bottom-nav и contact cards тянулись ближе к краям viewport
  - mobile main-list shell не должен растягиваться по контенту: нижний nav закреплён у нижней границы viewport, а вертикально скроллится только `chat-list`
  - mobile room lists не должны схлопываться после relogin/bootstrap: `rail-list-region` остаётся отдельным flex-контейнером, а `shell-main-list .rail-list-region > .chat-list` держит `height: 0` + `flex: 1 1 0` как Safari-safe контракт
  - mobile stale-tab room-list recovery: последний authoritative room-list snapshot хранится локально в урезанном виде, stale mobile/browser tab сначала гидрирует `chats / groups / subscriptionChannels / threadInbox`, а протухшая persisted session обязана уводить пользователя в auth-flow вместо пустого authenticated shell
  - mobile main-list/main-room shell не должен поддаваться document scroll/overscroll: shell pinned к viewport, scroll chaining наружу запрещён
  - mobile `html/body/#root` тоже locked к viewport: браузер не должен уметь утянуть вверх или вниз весь document поверх pinned shell
  - stack полей `Имя / Фамилия / Статус / Никнейм` должен держать compact vertical spacing без лишних пустот между input-блоками
  - узкий breakpoint `<=420px` не должен снова раздувать profile headline общим `.settings-heading h2`: у profile-scene должен оставаться свой более поздний mobile override
  - runtime autosize profile headline не должен стартовать с desktop `30.4px`, если mobile CSS уже задал меньший baseline: inline resize обязан уважать текущий computed font-size
- profile settings теперь включают persisted user setting `darkThemeEnabled`:
  - toggle `Тёмная тема` сохраняется через обычный `updateSession` flow и переживает refresh / relogin
  - root `html/body` обязаны получать `data-theme="dark"` или `data-theme="light"` от live session draft
  - dark theme должен переводить интерфейс в серые dark-surfaces; brown-only panel/menu/card surfaces в dark mode считаются регрессией
  - confirm dialogs, filters, share/subscriber popups, thread root cards and inputs must stay on gray dark-surfaces; white modal carryover in dark mode is a regression
  - monochrome icons in dark mode must use the light icon treatment; black-on-black crowns, stars, menu/edit/send icons are regressions
  - placeholder avatars without uploaded images must switch to a darker neutral background in dark mode; uploaded avatars stay untouched
- rich-text toolbar с `B / I / U / S` и `contenteditable` не считается разрешённым user-facing surface, пока не будет возвращён без regressions в:
  - direct
  - group
  - channel
  - thread
  - support
- попытка вернуть форматирование текста не должна снова ломать:
  - геометрию composer
  - caret / selection
  - отправку текста
  - одинаковое поведение во всех комнатах

### 12. Thread Root Preview Contract

- root message в открытом треде не должен визуально вести себя как обычный room-bubble
- это особенно критично для тредов к постам канала:
  - `channel-post` в обычной комнате может быть широким
  - но тот же `channel-post` внутри `Комментарии` обязан ужиматься до компактной reference-card
- support-thread и channel-thread идут разными UI-ветками, поэтому регресс в одном не гарантирует исправность другого
- большие картинки в root-message треда должны рендериться как маленькое preview, по которому можно открыть attachment детально
- root-message с `фото + подпись` обязан рендериться как full-width reference-card:
  - thumbnail слева
  - текст справа
  - время в правой части карточки, а не поверх thumbnail
- корневая плашка треда должна тянуться по ширине до тех же краёв, что и header comments-room
- root-message с `фото без подписи` не должен рендериться как пустая широкая плашка:
  - image-only preview тоже обязан занимать компактный card-layout без гигантского пустого whitespace
- радиусы thumbnail внутри root-card обязаны совпадать с радиусами самой плашки, чтобы углы bubble не торчали из-под изображения
- scrolling comments должны клипаться по нижней границе source-card без пустой полосы между root-card и первым комментарием
- group bubbles и thread comments не должны рендерить отдельную self-label строку `Вы`:
  - own-author читается по цвету и выравниванию bubble
  - лишняя строка `Вы` считается регрессией по высоте и плотности ленты
- вертикальный ритм group bubbles и thread comments должен оставаться compact:
  - зазор между bubble cards = tight, на уровне плотности карточек в левом rail
  - time-row не должен оставлять лишний пустой block под текстом
- bubble с открываемыми комментариями и нижняя `thread-pill` должны визуально сливаться в один block:
  - нижние углы bubble не должны возвращаться после рефакторинга обёрток
  - в light theme outgoing `thread-pill` у сообщения текущего пользователя не должна возвращаться к коричневой accent surface; это светлая neutral-плашка того же семейства, что и остальные comment pills
- если root-message в треде снова начинает занимать почти всю ширину/высоту comments-room, это release-blocking UI regression

### 12.1. Thread Inbox Unread Contract

- в thread inbox не должны появляться треды с `0 комментариев`, если пользователь на них явно не подписывался
- auto-participation по root-author / implicit membership начинает делать тред видимым только после первого реального комментария
- opening visible thread и чтение его комментариев должны снимать unread до `0` без требования отправить свой комментарий
- read-marker треда не должен опираться только на timestamp:
  - при same-millisecond комментариях server-side mark-read обязан использовать identity последнего видимого комментария
  - сценарий `unread = 1` после простого чтения считается регрессией
- пока тред открыт и видим пользователю, client/server не должны оставлять stale unread и не должны дёргать сортировку inbox так, будто unread всё ещё висит
- visible scrollbar поверх bubbles в room feed считается release-blocking visual bug:
  - room scroll остаётся рабочим, но сама полоска не должна перекрывать сообщения
- thread inbox card обязана reuse-ить avatar источника:
  - group-thread тянет avatar группы
  - channel-thread тянет avatar канала
  - initials допустимы только как fallback, когда `avatarImage` отсутствует

### 13. Admin Archive Contract For Groups And Threads

- archive/unarchive из админки считаются server-authoritative moderation-действиями, а не локальным UI-фильтром
- `Архивировать канал`:
  - скрывает канал у обычных пользователей и подписчиков
  - не удаляет server-side канал, посты и подписки
  - `Разархивировать канал` возвращает тот же канал тем же пользователям без пересоздания
- `Архивировать группу`:
  - скрывает группу у обычных пользователей, у которых она была
  - не удаляет server-side историю и membership-тело
  - `Разархивировать группу` возвращает ту же группу тем же пользователям без пересоздания
- `Архивировать тред`:
  - скрывает сам тред из user snapshots и из inbox тредов
  - оставляет корневое сообщение / пост в основной комнате
  - очищает user-visible `threadId` и comments list до разархивирования
  - запрещает новые subscribe/comment actions, пока тред архивирован
  - `Разархивировать тред` возвращает исходный thread root, комментарии и inbox-видимость
- и group archive, и thread archive обязаны после admin toggle делать realtime fan-out affected users:
- и channel archive, и group archive, и thread archive обязаны после admin toggle делать realtime fan-out affected users:
  - изменение не считается выкаченным, если staff-кнопка переключается, а пользовательский snapshot остаётся старым до hard reload
- archived thread/group reason `admin-archived` считается отдельным контрактным reason-code и не должен смешиваться с `owner-deleted`
- archived channel reason `admin-archived` тоже считается отдельным контрактным reason-code и не должен смешиваться с `owner-deleted`

## Обязательные Operational Rules

### Env и секреты

- нельзя редактировать runtime env на сервере без backup
- source of truth для env должен быть один и воспроизводимый
- если env-файл пересоздаётся, analytics/captcha/public URL keys нельзя оставлять "по умолчанию"
- перед restart нужно сохранять копию текущего env

### После каждого deploy

- прогнать runtime verifier
- проверить `client-config`
- проверить, что staging root реально отдаёт новый `assets/main-*.js`
- проверить staging login
- проверить хотя бы одну legal page
- проверить, что иконки не побились
- проверить, что analytics реально включены
- не считать rollout завершённым, пока не подтверждены:
  - local HEAD
  - `origin/codex/staging-deploy`
  - VM HEAD
  - live `assets/main-*.js`
  - `healthz` / `readyz`
- полный anti-confusion checklist лежит в [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md)
- текущее подтверждённое состояние staging после live deploy `2026-04-13`:
  - `origin/codex/staging-deploy = 5af9915`
  - staging VM `HEAD = 5af9915`
  - live frontend bundle = `assets/main-DSXa58mu.js`

## Автоматические проверки

- `npm test`
- `npm run audit:release`
- `npm run build:staging`
- `npm run verify:staging-runtime`

## Что считается инцидентом

- analytics перестали поступать в Метрику
- staging начал бесконечно требовать basic auth
- legal page/PDF пропали или рассинхронизировались
- icon asset перестал грузиться
- `В сети` не гаснет после logout/close
- mirrored direct reply-preview у второго участника не скроллит к оригиналу, даже если reply был отправлен до фикса и в базе остался старый чужой `replyTo.id`
- mirrored direct reply-preview у второго участника не скроллит к attachment-only оригиналу без текста, если legacy persisted reply хранит `replyTo.id` от чужой копии

Такие случаи нужно чинить как release-blocking bugs и фиксировать в тестах, deploy-скриптах и `.md`, а не только в переписке.

- mobile media/video bubble не должен раздвигать room по ширине:
  - `media-bubble-row` обязан clamp-иться к viewport
  - bubble track обязан быть shrinkable через `minmax(0, 1fr)`
  - portrait video не должен создавать horizontal scroll
- в открытом треде корневая `room-thread-source` карточка не должна показывать автора сообщения:
  - author-strip и media-header автора допустимы только у комментариев внутри треда
  - root source остаётся compact reference-card без имени/аватарки автора
- mobile browser scene-open contract:
  - dialog, group, channel, thread и support composer не должны автозахватывать фокус при входе в экран
  - клавиатура не должна открываться без явного тапа по полю ввода
  - intentional action-flow вроде `Ответ` может фокусить поле отдельно и не подпадает под этот запрет
