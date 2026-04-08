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

### 3. Analytics / Yandex Metrica Contract

- analytics считаются release-blocking контрактом, а не optional telemetry
- staging не должен запускаться с:
  - `analytics.enabled=false`
  - `provider=disabled`
  - `metricaCounterId=null`
- обязательные staging env keys:
  - `TINYCHOK_ANALYTICS_ENABLED=true`
  - `TINYCHOK_ANALYTICS_PROVIDER=log`
  - `TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS=5000`
  - `TINYCHOK_ANALYTICS_MAX_BATCH_SIZE=20`
  - `TINYCHOK_YANDEX_METRICA_COUNTER_ID=108249405`
- `108249405` — это текущий staging Yandex Metrica counter id
- production должен использовать отдельный production counter id и не должен молча наследовать staging id
- deploy staging обязан валидировать именно живой `/api/client-config`, а не только env template

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

### 6. Public Legal Pages Contract

- публичные legal pages и их PDF считаются release-blocking surface:
  - `/user-agreement.html`
  - `/privacy-policy.html`
  - `/premium-terms.html`
  - `/contacts.html`
  - `/user-agreement.pdf`
  - `/privacy-policy.pdf`
  - `/premium-terms.pdf`
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
- support scene contracts считаются release-blocking:
  - unread staff reply должен быть виден и на кнопке `Написать в поддержку`, и на launcher-кнопке `Настройки`
  - tap по всей карточке тикета должен открывать его thread-room
  - после создания тикета support composer обязан сразу переходить в cooldown-card с таймером и пояснением
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
- этот контракт должен держаться:
  - runtime-тестами store
  - source-contract регрессиями UI
  - staging smoke-check перед релизом

### 10. Avatar Moderation Contract

- `/avatar-upload-rules.html` должен явно фиксировать, что аватарка является пользовательским контентом и загружается под ответственность пользователя
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
- экран `Хранилище` внутри настроек показывает только вложения и GIF, которыми пользователь реально может управлять
- аватарки профиля, группы и канала не входят в пользовательскую квоту и считаются внешним хранилищем Tinychok
- group root attachments и group thread attachments хранятся в storage автора
- channel post attachments остаются в storage канала с квотой `500 MB`
- если пользователь уже разблокировал premium storage, истечение premium не должно сжимать user storage quota назад:
  - active storage остаётся на premium-объёме
  - archive storage тоже остаётся на premium-объёме
  - это server-side sticky quota контракт, а не UI-подсказка
- если auto-cleanup уже отправил вложения пользователя в архив из-за переполнения quota, а затем quota выросла и свободного места снова хватает:
  - backend обязан попытаться вернуть такие auto-archived вложения обратно в исходные сообщения / посты / комментарии
  - это server-side restore контракт, а не ручная клиентская операция
  - новые auto-archive записи обязаны хранить достаточный restore-route, чтобы восстановление было воспроизводимым
- auto-cleanup не должен удалять сообщение / комментарий / пост целиком:
  - в UI обязана оставаться viewer-aware заметка:
    - владелец видит `Вложение скрыто. У вас закончилось место. Оформите подписку.` с маленькой inline-иконкой `crown64`
    - собеседник / читатель видит нейтральное `Вложение скрыто.` без пояснения, у кого именно переполнено хранилище
- ручное удаление из storage-screen оставляет placeholder вместо пустого bubble:
  - владелец видит текст, что вложение удалено им из хранилища
  - читатель видит текст, что вложение удалено владельцем из хранилища
- перед отправкой нового вложения composer обязан показывать warning, если upload уже не помещается в текущую квоту:
  - premium расширяет хранилище
  - без premium старые отправленные фото и файлы могут быть удалены автоматически

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
- staging smoke-check этого контракта нельзя считать пройденным только по зелёным тестам и наличию новых строк в `dist-server/index.js`:
  - нужно подтверждать живым `POST /api/groups`, что over-limit free account получает `400`, а не `200`

### 11.1.1. Group Join History Visibility Contract

- у группы есть owner-setting `Отображать историю группы новым пользователям`
- default = `on`
- при `on` новый участник после вступления видит историю группы, которая была до его вступления
- при `off` новый участник начинает с пустой видимой истории и не должен получать backfill старых group messages
- этот контракт решается server-side в `joinGroupBySharedId`, а не только UI-флагом в настройках группы
- переключение этого чекбокса влияет только на будущие вступления и не должно ретроактивно удалять историю у уже существующих участников

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
- reuse из GIF library допустим только через server-owned gif flow того же владельца
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
- direct dialog, support root-scene и thread room должны использовать один и тот же textarea-based composer contract
- допускается различаться только contextual copy:
  - placeholder
  - support wrapper modifier class
- textarea geometry, tool buttons и send-path layout не должны расходиться между direct / support / thread
- mobile viewport тоже входит в контракт:
  - composer не должен давать horizontal overflow на `390px` ширине
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
- если root-message в треде снова начинает занимать почти всю ширину/высоту comments-room, это release-blocking UI regression

### 12.1. Thread Inbox Unread Contract

- в thread inbox не должны появляться треды с `0 комментариев`, если пользователь на них явно не подписывался
- auto-participation по root-author / implicit membership начинает делать тред видимым только после первого реального комментария
- opening visible thread и чтение его комментариев должны снимать unread до `0` без требования отправить свой комментарий
- read-marker треда не должен опираться только на timestamp:
  - при same-millisecond комментариях server-side mark-read обязан использовать identity последнего видимого комментария
  - сценарий `unread = 1` после простого чтения считается регрессией
- пока тред открыт и видим пользователю, client/server не должны оставлять stale unread и не должны дёргать сортировку inbox так, будто unread всё ещё висит

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

Такие случаи нужно чинить как release-blocking bugs и фиксировать в тестах, deploy-скриптах и `.md`, а не только в переписке.
