# Next Branch Handoff

Этот файл нужен как короткая точка продолжения, если работа переносится в новую ветку или новый тред.

## Git state

- текущая рабочая ветка для staging deploy: `codex/staging-deploy`
- последняя подтверждённая staging-выкладка: `1b8df3f`
- commit message подтверждённой staging-выкладки: `Polish mobile composer and refresh staging docs`
- последний уже зафиксированный продуктовый commit в истории ветки: `4ad9b0b`
- commit message последнего уже зафиксированного product commit: `Refine profile save flow and settings prompts`
- поверх `4ad9b0b` в текущем branch state уже есть свежий follow-up UI / UX batch из этого треда:
  - thread pill под bubble подогнана по ширине и стилистике под сообщение
  - в thread room убраны лишние `Назад`, пустое состояние перенесено над composer
  - desktop `Enter` / `Return` отправляет сообщение, но мобильная клавиатура это не триггерит
  - новые аккаунты создаются с `soundsDisabled = true`
  - кнопка `Управление` в настройках канала сдвинута вправо вниз
  - у комментариев в тредах появился полноценный action modal как у сообщения, но без `Закрепить`
  - для thread comments добавлено удаление своих комментариев на frontend/backend
  - отправка в blacklist теперь идёт через confirm-popup с именем пользователя
- staging VM по-прежнему нельзя считать актуальной по `HEAD`, пока не будет отдельно задеплоен и проверен весь накопившийся stack после `1b8df3f`

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
- staging deploy до `1b8df3f` уже подтверждён владельцем проекта
- commits `1a037b9`, `30a8256`, `2bf7a1e`, `a21f0d1`, `a6be3d3`, `27646e7` и `4ad9b0b` пока в staging не подтверждены
- свежий follow-up batch поверх `4ad9b0b` тоже пока не выкатывался на staging и должен считаться частью следующего cumulative deploy-кандидата
- после `npm ci`, `npm run build`, `sudo systemctl restart tinychok-staging` и `sudo rsync -av --delete dist/ /var/www/tinychok-staging/` владелец проекта подтвердил, что staging работает

## Последний подтверждённый change batch

Коммит `1b8df3f` (`Polish mobile composer and refresh staging docs`) сейчас является текущей точкой старта в `origin/codex/staging-deploy`.

До него staging уже был подтверждён на `4fde821`, а `1b8df3f` добавляет поверх этого следующий пакет изменений:

- mobile/narrow chat composer:
  - кнопка `Назад` уже переделана в стрелку и поставлена левее аватарки
  - кнопка `Отправить` заменена на компактную стрелку вправо
  - поле ввода переведено в однострочный auto-grow до половины экрана
  - после отправки фокус возвращается в поле
  - кнопка отправки скрывается, если нет текста и вложения
- mobile alignment polish:
  - скрепка переносится влево внутри поля ввода
  - send-кнопка и скрепка центрируются относительно поля
  - уменьшен лишний нижний воздух в composer на узком экране
- pending delivery indicator:
  - `hourglass-24.gif` заменён на статичную `hourglass-48.png`
  - delivery-иконки предзагружаются заранее, чтобы offline pending-state не показывал пустую картинку
- staging docs обновлены под текущий runbook
- добавлен repo-скрипт `scripts/deploy-staging.sh` для стандартного staging deploy

Ключевые изменённые файлы:

- `scripts/deploy-staging.sh`
- `package.json`
- `src/App.tsx`
- `src/App.css`
- `src/components/SelectedBubbleOverlay.tsx`
- `src/rooms/DirectChatRoom.tsx`
- `src/rooms/GroupRoom.tsx`
- `src/rooms/SubscriptionChannelRoom.tsx`
- `docs/next-branch-handoff.md`
- `docs/staging-rollout-status.md`
- `docs/staging-access-guard.md`
- `public/icons/hourglass-48.png`

Operational note:

- staging VM сейчас последне подтверждённо была на `1b8df3f`
- для следующей выкладки теперь можно использовать либо ручную последовательность, либо `bash scripts/deploy-staging.sh`

## Текущий непроверенный product stack в ветке

После подтверждённого staging commit `1b8df3f` в ветке уже накопился следующий непроверенный стек продуктовых коммитов:

### `1a037b9` `Refine channel and group messaging flows`

- group room:
  - у входящих сообщений участника рендерится уменьшенная аватарка
  - premium crown и online-dot выводятся рядом с именем отправителя
  - у своих сообщений в группе появилась возможность удаления
- channel management:
  - действия `Передать` и `Удалить канал` убраны под кнопку `Управление`
  - кнопка `Управление` перенесена вниз рядом с `Назад`
  - исправлен popover редактирования названия канала: поле снова фокусируется и доступно для ввода
- channel links:
  - прямая ссылка канала переведена на формат `@handle`
  - handle автогенерируется из названия с `_` вместо пробелов
  - при конфликте автоматически добавляется числовой суффикс
  - старые URL формата `https://.../c/...` мягко нормализуются в `@handle`
- linked channel bubbles:
  - standalone `@channel_handle` в сообщении превращается в кликабельную плашку канала
  - по нажатию открывается подписанный канал или preview канала

### `30a8256` `Refine avatar flows and channel limits`

- create/edit channel avatar:
  - отдельный popup для смены аватарки канала
  - загрузка только `JPEG/PNG` до `1 МБ`
  - live preview со скруглением как в UI
  - стоковые аватарки подхватываются из отдельных папок `src/assets/stock-avatars/channels` и `src/assets/stock-avatars/users`
  - при смене аватарки старая server-side аватарка очищается
- profile avatar:
  - у пользователя появилась отдельная смена аватарки с тем же upload flow
  - в настройках аватарка перестроена слева от имени, с кнопкой `Сменить` под ней
- settings/profile polish:
  - заголовок `Настройки` вынесен выше профайл-блока
  - длинное имя в header настроек автоматически уменьшает размер шрифта
  - убрано внутреннее clipping-поведение settings-экрана
  - никнейм теперь принимает кириллицу, лимит `16` символов
- premium and limits:
  - на годовой premium-card добавлен badge `Выгода 42%`
  - один пользователь может управлять максимум `5` каналами

### `2bf7a1e` `Add direct and channel moderation actions`

- direct chats:
  - в меню личного чата добавлены `Заглушить` / `Включить уведомления`
  - заглушённые диалоги показывают иконку `bell-100.png`
  - при mute новые сообщения не поднимают unread counter
- complaints:
  - в личных чатах добавлен popup жалобы с причинами `Спам`, `Обман`, `Очень неприятно`
  - жалобы сохраняются на backend отдельно по контакту и репортёру
  - при количестве жалоб больше `10` вход по номеру временно блокируется на шаге верификации с подсказкой написать на `devisjjones@gmail.com`
  - у создателя группы пункт `Пожаловаться` убран из group menu
- subscription channels:
  - в header канала добавлена кнопка `...`
  - menu канала содержит `Заглушить`, `Покинуть`, `Поделиться`, `Пожаловаться`
  - `Поделиться` отправляет в личный чат plain `@handle` ссылку на канал
  - channel complaints сохраняются отдельно и не блокируют автоматически, решение остаётся за администрацией

### `a21f0d1` `Expand group creation and seed test fixtures`

- group creation:
  - в списке групп добавлена кнопка `Создать группу`
  - из `...` меню личного чата можно открыть тот же flow с уже предвыбранным контактом
  - в modal создания группы можно сразу задать название, аватарку и несколько участников
  - у контактов в списке выбора показываются premium crown и избранное со звездой
  - для узкого окна браузера modal и avatar-picker переведены на безопасный scrollable layout
- group avatar:
  - аватарка группы сохраняется как отдельный upload kind `group-avatar`
  - старая group-avatar очищается при замене или удалении группы
- test fixtures for staging/dev:
  - текущие mock contacts заведены как backend test accounts с явным флагом `isTestEntity`
  - в non-production bootstrap теперь автоматически попадают тестовые аккаунты, группы и каналы
  - добавлены `10` тестовых subscribed channels, у каждого по `20` тестовых сообщений
- production startup автоматически вычищает все test fixtures из runtime state

### `a6be3d3` `Add threads, sound controls, and composer polish`

- threads / comments:
  - у сообщений в группах и каналах появились треды с отдельным экраном комментариев
  - в меню сообщения добавлен пункт `Прокомментировать`
  - под сообщениями показывается плашка с количеством комментариев и иконкой `root-50.png`
  - если комментарии выключены, кнопка остаётся видимой, но показывает notice `В канале выключены комментарии` / `В группе выключены комментарии`
- comment permissions and blacklist:
  - в настройках групп и каналов добавлены режимы комментариев: выключены / для всех / только для премиум
  - для групп и каналов добавлен `Чёрный список`
  - пользователь из blacklist может читать, но не может писать сообщения и комментарии
- group and channel management:
  - в настройках группы вместо прямой destructive-кнопки добавлено `Управление группой`
  - из `Управления группой` можно передать владельца и удалить группу
  - при удалении канала теперь backend удаляет и все subscriber copies / posts, чтобы канал не оставался читатьcя после удаления
  - владелец канала может публиковать сообщения прямо в канал
- seeded fixtures:
  - в test groups и test channels появились seeded треды с тестовыми комментариями
  - comment modes разведены по fixture-данным: часть комнат без комментариев, часть для всех, часть только для premium
- sound settings and composer polish:
  - `public/sfx/jump.wav` проигрывается на отправку сообщений
  - `public/sfx/take.wav` проигрывается на входящее сообщение в открытом личном чате
  - в настройках профиля появился чек-бокс `Выключить звуки`
  - send-кнопка заменена на иконку `sent.png`
  - attach-кнопка переведена на `attach.png`, убран фоновый capsule, добавлен tint-filter
  - send и attach встроены внутрь поля ввода и выровнены в правом нижнем углу composer-а
  - у composer убрана внешняя фоновая подложка, поджаты нижние отступы комнаты

### `27646e7` `Split send and receive chat sounds`

- звук отправки и звук получения теперь разведены явно:
  - `jump.wav` используется на отправку
  - `take.wav` используется на получение в открытом direct chat
- `public/svf` не участвует в приложении и не должен попадать в deploy/push
- актуальные используемые файлы лежат в `public/sfx/jump.wav` и `public/sfx/take.wav`

### `4ad9b0b` `Refine profile save flow and settings prompts`

- в профиле больше нет autosave по символам
- в настройках аккаунта появилась широкая кнопка `Сохранить`, которая показывается только при изменениях
- при выходе назад с несохранёнными изменениями профиля появляется popup `Сохранить изменения настроек профиля?`
- если включён глобальный режим `Тихо`, чек-бокс `Выключить звуки` автоматически считается включённым
- при отключении `Тихо` возвращается прежнее пользовательское значение чек-бокса звуков
- в popup `Управление группой` и `Управление каналом` добавлена кнопка `Отмена`

### Follow-up batch поверх `4ad9b0b` из текущего рабочего цикла

- thread / comments polish:
  - thread-pill визуально слита с bubble, подстраивается по ширине bubble и у своих сообщений получает единый плоский тон без градиента
  - у bubble с thread-pill убраны нижние скругления, чтобы блок читался как единая карточка
  - длинный текст на thread-pill не переносится на вторую строку, а режется с `...`
  - в thread room оставлена только стрелка `Назад`, и она всегда видна
  - пустое состояние заменено на `Будьте первым, кто оставит комментарий` над composer без подложки
- desktop keyboard submit:
  - если send-кнопка активна, на desktop `Enter` / `Return` отправляет сообщение или комментарий
  - на мобильной клавиатуре это поведение отключено
- default sound setting:
  - новые зарегистрированные пользователи создаются с выключенными звуками по умолчанию
- channel settings layout:
  - в `Настройках канала` кнопка `Управление` перенесена вправо в нижний action-row
- thread comment actions:
  - у комментариев в тредах появился action modal по тапу на bubble
  - для своих комментариев: `Скопировать`, `Переслать`, `Удалить`
  - для чужих комментариев: `Скопировать`, `Переслать`, `В чёрный список`
  - пункта `Закрепить` в thread comments нет
  - удаление своих thread comments теперь поддержано и на backend
- blacklist UX:
  - добавление в blacklist теперь требует confirm-popup с именем пользователя
  - если пользователь уже в blacklist, destructive-кнопка рендерится в disabled-style
  - при повторном нажатии показывается локальная подсказка рядом с кнопкой

Весь этот stack уже собран локально через `npm run build`, но staging-подтверждения для него ещё нет.

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

Альтернатива тем же шагам одним запуском на staging VM:

```bash
cd /home/devis/tinychok
bash scripts/deploy-staging.sh
```

Если хочется запуск без `cd`, есть разовая установка wrapper-команды:

```bash
cd /home/devis/tinychok
bash scripts/install-staging-deploy-command.sh
```

После этого deploy можно запускать из любой директории:

```bash
tinychok-staging-deploy
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
- следующий staging smoke-check уже должен проверять cumulative candidate не до `a6be3d3`, а до `4ad9b0b` плюс свежий follow-up batch поверх него
- при ручной проверке отдельно прогнать:
  - профиль без autosave и popup сохранения
  - default `Выключить звуки` у нового аккаунта
  - desktop submit по `Enter`
  - thread room, thread-pill, action modal комментария и confirm-popup blacklist
- текущая подтверждённая staging-точка старта: `1b8df3f`
- следующий непроверенный deploy-candidate: cumulative stack до `4ad9b0b` плюс свежий follow-up batch поверх него
- следующую работу выбирать уже из продуктовых/bugfix задач, а не из базовой staging-инфраструктуры
- после следующего подтверждённого deploy обновлять этот файл, если commit staging-состояния поменялся

Для ручных инструкций человеку использовать формат из [docs/collaboration-instructions.md](docs/collaboration-instructions.md).
