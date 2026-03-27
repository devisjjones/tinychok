# Next Branch Handoff

Короткая техническая точка входа для следующего треда или новой ветки. Документ описывает только текущее устройство системы и рабочие инварианты, без истории коммитов и списков прошлых правок.

## Runtime Topology

- staging frontend: `https://staging.tinychok.ru`
- staging admin frontend: `https://admin.staging.tinychok.ru`
- staging backend API: `https://api.staging.tinychok.ru`
- realtime websocket: `wss://api.staging.tinychok.ru/ws`
- staging живёт на отдельной VM `tinychok-staging-1`
- user frontend, admin frontend и backend деплоятся независимо, но должны использовать один и тот же staging backend и staging state store

## Core Product Mechanics

### Session and Snapshot Model

- клиент поднимается через bootstrap snapshot
- realtime обновления приходят по websocket и синхронизируют текущее состояние клиента
- timeline data считаются `server-authoritative`
- клиентский `saveSnapshot` не должен воскрешать удалённые сообщения, посты или комментарии из устаревшего local state

### History Window

- direct / group / channel при входе не тянут всю историю сразу
- стартовое окно строится по правилу:
  - сначала сообщения за сегодня и вчера
  - если их мало, окно добирается назад до минимального полезного объёма
- при прокрутке вверх история догружается отдельными backend endpoint-ами
- в лентах есть day divider, который показывает полную дату с годом

### Threads

- у сообщений и постов могут быть треды
- у пользователя есть отдельный inbox тредов
- в inbox попадают треды, где пользователь:
  - уже писал комментарий
  - либо явно подписался на тред
- новые ответы в подписанных тредах дают unread-индикаторы
- в самом треде доступны `Подписаться` / `Отписаться`
- автоподписка происходит после отправки комментария

### Reply Flow

- reply поддержан в личках, группах, каналах и тредах
- превью сообщения, на которое отвечают, рендерится отдельным верхним блоком
- этот блок кликабелен и прокручивает ленту к исходному сообщению
- при выборе `Ответить` composer получает фокус сразу

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
- в режиме `Тихо` browser notifications жёстко глушатся
- у фичи есть локальный on/off toggle на уровне текущего браузера
- во вкладке диалогов сверху рендерится promo-card включения уведомлений

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
- в проекте есть debug-layer для premium, он описан отдельно в [docs/debug-flags.md](/Users/devisjones/Documents/New%20project/tinychok/docs/debug-flags.md)

### Storage and Quotas

- free quota: `50 MB`
- premium quota: `500 MB`
- квота считается по реально сохранённым пользовательским вложениям
- сервер проверяет квоту до сохранения нового upload
- orphan uploads чистятся по TTL
- usage и quota показываются в настройках пользователя

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
  - групп
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
- для admin-списков, где сущность размножается по пользовательским копиям, canonical aggregation принципиален:
  - staff должен видеть продуктовую сущность один раз
  - moderation, detail-view и CSV должны цепляться к canonical entity, а не к viewer-copy
  - иначе админка начинает показывать фантомные дубликаты, неверные счётчики и разъезжающиеся exports
- каналы являются эталонной схемой агрегации:
  - canonical key строится по владельцу канала и нормализованному `@handle`
  - admin UI показывает один канал, даже если backend хранит несколько подписочных копий
  - detail / export / moderation всегда должны цепляться к canonical entity, а не к viewer-copy
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
- premium debug state может использоваться на staging, но не должен попадать в production без отдельного решения
- production deploy обязан идти в режиме `TINYCHOK_APP_ENV=production`, чтобы тестовые сущности не попадали в боевой runtime
- admin production нельзя включать без отдельного ручного решения по env и rollout-проверке staging

## Smoke Checklist

- auth flow на staging через allowlist номер
- direct / group / channel opening с history window
- day divider и догрузка старой истории вверх
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
- storage quota block при превышении лимита
- delete flow с повторным входом в комнату
- admin login под owner/moderator/support
- dashboard cards в `Сводке` без дубликатов по каналам / группам / тредам
- user search, block/unblock, premium toggle и avatar view в admin
- report unread badge, note trail, close, блокировка пользователя, hide или delete entity
- media download / report content view / avatar view с записью в audit log
- dialogs flow:
  - выбор первого пользователя
  - выбор канонического диалога
  - export CSV
