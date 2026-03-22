# Staging Rollout Status

Короткий статус staging-контура по состоянию на `2026-03-22`.

## Что уже подтверждено

- на staging VM `tinychok-staging-1` настроен `GitHub deploy key`
- проверка `ssh -T git@github.com` на VM проходит успешно
- репозиторий склонирован на VM в `/home/devis/tinychok`
- рабочая серверная ветка на staging VM: `codex/staging-deploy`
- staging `.env` создан на VM на основе `.env.staging.example`
- backend собран и переведён на `systemd`
- системный сервис называется `tinychok-staging.service`
- `tinychok-staging.service` включён в автозапуск и находится в состоянии `active (running)`
- `nginx` установлен и работает как reverse proxy для staging API и как отдача frontend-статики
- выпущен `Let's Encrypt` сертификат для `api.staging.tinychok.ru`
- выпущен `Let's Encrypt` сертификат для `staging.tinychok.ru`
- `https://api.staging.tinychok.ru/healthz` отвечает `{"status":"ok"}`
- `https://api.staging.tinychok.ru/readyz` отвечает `status: ok`
- staging API использует:
  - `PostgreSQL` на самой VM (`127.0.0.1:5432`)
  - `Yandex Object Storage`
- staging frontend live на `https://staging.tinychok.ru`
- browser requests идут на `https://api.staging.tinychok.ru`
- websocket подключается к `wss://api.staging.tinychok.ru/ws`
- в `Reg.ru` созданы DNS-записи:
  - `api.staging.tinychok.ru -> 158.160.197.255`
  - `staging.tinychok.ru -> 158.160.197.255`
- внешние резолверы `1.1.1.1` и `8.8.8.8` видят staging-поддомены на `158.160.197.255`
- staging VM подтверждённо была обновлена до commit `1b8df3f` (`Polish mobile composer and refresh staging docs`)
- в `origin/codex/staging-deploy` уже лежит неподтверждённый product stack `1a037b9 -> 30a8256 -> 2bf7a1e -> a21f0d1 -> a6be3d3 -> 27646e7 -> 4ad9b0b`
- поверх `4ad9b0b` в текущем рабочем branch state уже собран ещё один follow-up batch без staging-подтверждения:
  - thread-pill / thread-room visual polish
  - desktop submit по `Enter` вне mobile keyboard
  - default `soundsDisabled = true` для новых аккаунтов
  - action modal и delete flow для thread comments
  - confirm-popup при добавлении автора комментария / сообщения в blacklist
- latest deploy sequence `npm ci -> npm run build -> sudo systemctl restart tinychok-staging -> sudo rsync -av --delete dist/ /var/www/tinychok-staging/` был выполнен успешно `2026-03-21`
- владелец проекта после выкладки подтвердил staging-статус: `Всё работает`
- для следующих выкладок в репо добавлен скрипт `scripts/deploy-staging.sh`

## Access guard status

По состоянию на `2026-03-22` доступ к staging уже закрыт так, как и планировалось, и это состояние сохранилось после последней подтверждённой выкладки `1b8df3f`:

- basic auth включен на HTTPS-блоке `nginx` для `staging.tinychok.ru`
- `curl -I https://staging.tinychok.ru` возвращает `401 Unauthorized`
- логин basic auth: `tinychok`
- пароль создан через `htpasswd` на VM и не должен попадать в чат или git
- backend staging ограничен allowlist-ом телефонов через `TINYCHOK_ALLOWED_TEST_PHONES` в `/home/devis/tinychok/.env`

Подробный runbook лежит в [docs/staging-access-guard.md](docs/staging-access-guard.md).

## Последний подтверждённый deploy batch

Коммит `1b8df3f` (`Polish mobile composer and refresh staging docs`) сейчас является последним подтверждённым staging-состоянием.

В этот пакет изменений вошло:

- mobile/narrow composer polish
- возврат фокуса в поле после отправки
- скрытие send-кнопки без текста и вложения
- замену `hourglass-24.gif` на `hourglass-48.png`
- предзагрузку delivery-иконок для offline pending-state
- repo-скрипт `scripts/deploy-staging.sh`
- docs update под staging runbook на тот момент

Ключевые файлы пакета:

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

## Что уже готово к следующему deploy

Следующая staging-выкладка теперь должна проверять не один commit, а весь накопившийся stack после `1b8df3f`:

### `1a037b9` `Refine channel and group messaging flows`

- удаление своих сообщений в группе
- корректный popover редактирования названия канала
- кнопку `Управление` для действий с каналом вместо двух отдельных action-card
- group sender metadata:
  - уменьшенная аватарка
  - online-dot
  - premium crown
- channel handles в формате `@...`:
  - автогенерация из названия
  - уникализация числовым суффиксом
  - нормализация старых URL
- standalone `@channel_handle` в сообщениях превращается в кликабельную channel-pill

### `30a8256` `Refine avatar flows and channel limits`

- popup-выбор и upload channel avatar с ограничением `JPEG/PNG` до `1 МБ`
- отдельные стоковые аватарки для каналов и пользователей из репозитория
- user avatar с тем же upload flow и server-side cleanup старого файла
- visual polish settings screen:
  - аватарка слева от имени
  - отдельный заголовок `Настройки`
  - автоуменьшение длинного имени
  - устранение clipping-маски вверху и внизу settings-экрана
- кириллица в никнейме с лимитом `16` символов
- badge `Выгода 42%` на годовом premium plan
- лимит `5` каналов на одного пользователя

### `2bf7a1e` `Add direct and channel moderation actions`

- жалобы на пользователей с выбором причины и backend storage
- временная блокировка логина для аккаунтов, набравших больше `10` жалоб
- mute для direct chat с индикатором перечёркнутого колокольчика
- channel room menu:
  - `Заглушить`
  - `Покинуть`
  - `Поделиться`
  - `Пожаловаться`
- отправка `@handle` канала в личный чат через share flow
- отдельный backend counter для жалоб на каналы без автоматической блокировки

### `a21f0d1` `Expand group creation and seed test fixtures`

- новый modal `Создать группу`:
  - запуск из списка групп
  - запуск из личного чата с предвыбранным контактом
  - выбор нескольких участников, названия и аватарки группы сразу при создании
- visual polish group create flow:
  - premium/status badges в participant list
  - исправления narrow-screen layout и scroll внутри modal
  - popup выбора group avatar вынесен в корректный overlay
- backend test fixtures:
  - mock contacts переведены в реальные test accounts в state store
  - test accounts и test channels помечаются `isTestEntity`
  - в non-production пользователю автоматически доступны `10` test channels по `20` сообщений
- production startup вычищает test fixtures из runtime state

### `a6be3d3` `Add threads, sound controls, and composer polish`

- threads/comments для сообщений в группах и каналах:
  - отдельный thread screen
  - кнопка `Прокомментировать` в menu сообщения
  - thread-pill под сообщением с иконкой `root-50.png` и comment counter
- backend и UI правил комментариев:
  - комментарии выключены / для всех / только для premium
  - чёрный список для группы и канала
  - пользователь из blacklist не может писать сообщения и комментарии
- management fixes:
  - `Управление группой` с передачей владельца и удалением группы
  - удаление канала теперь дочищает все subscribed copies и posts
  - владелец канала может публиковать сообщения прямо в channel room
- seeded test content:
  - в test channels / groups появились seeded треды и комментарии для smoke-check
  - fixture rooms распределены по разным comment modes
- sound and composer polish:
  - `public/sfx/jump.wav` проигрывается при отправке сообщений
  - `public/sfx/take.wav` проигрывается при новом сообщении в открытом direct chat
  - в настройках профиля добавлен чек-бокс `Выключить звуки`
  - send-button переведена на `sent.png`
  - attach-button переведена на `attach.png`, без фоновой капсулы
  - send / attach встроены внутрь поля ввода и выровнены внутри composer-а
  - убран внешний фон composer-контейнера, уменьшен лишний нижний воздух в комнате

### `27646e7` `Split send and receive chat sounds`

- `jump.wav` используется на отправку
- `take.wav` используется на получение в открытом direct chat
- `public/svf` не участвует в runtime и в deploy не нужен

### `4ad9b0b` `Refine profile save flow and settings prompts`

- профиль больше не сохраняется на каждый символ
- в настройках аккаунта появилась явная кнопка `Сохранить` только при изменениях
- назад с несохранёнными изменениями открывает confirm-popup про сохранение
- `Тихо` форсит UI-отображение `Выключить звуки`, но возвращает старое значение после отключения `Тихо`
- в `Управление группой` и `Управление каналом` добавлена кнопка `Отмена`

### Follow-up batch поверх `4ad9b0b`

- thread comment / thread pill polish:
  - thread-pill визуально слита с bubble, подгоняется по ширине bubble и режет длинный текст с `...`
  - у bubble с тредом убраны нижние скругления
  - в thread room оставлена одна стрелка `Назад`, она видна всегда
  - пустой тред показывает текст `Будьте первым, кто оставит комментарий` над composer
- desktop keyboard submit:
  - на desktop `Enter` / `Return` отправляет сообщение или комментарий, если send активен
  - на mobile keyboard это поведение отключено
- новые аккаунты:
  - новые пользователи создаются с выключенными звуками по умолчанию
- channel settings:
  - кнопка `Управление` в настройках канала перенесена вправо вниз
- thread comment actions:
  - по тапу на комментарий открывается action modal как у сообщения
  - для своих комментариев есть удаление
  - для чужих комментариев есть blacklist action без `Закрепить`
- blacklist UX:
  - перед добавлением в blacklist показывается confirm-popup с именем пользователя
  - если пользователь уже в blacklist, кнопка визуально disabled и показывает локальный hint

Если выкладка делается вручную, используется тот же flow:

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

Если выкладка делается через repo-скрипт:

```bash
cd /home/devis/tinychok
bash scripts/deploy-staging.sh
```

Если нужен one-command deploy из любой папки на VM, есть разовая установка wrapper-команды:

```bash
cd /home/devis/tinychok
bash scripts/install-staging-deploy-command.sh
```

После этого достаточно:

```bash
tinychok-staging-deploy
```

## Полезные operational notes

- локальный `systemd-resolved` на самой VM может продолжать кэшировать старый `NXDOMAIN`
- если нужно проверить свежую DNS-резолюцию с VM, надёжнее спрашивать внешний resolver:
  - `nslookup api.staging.tinychok.ru 1.1.1.1`
  - `nslookup staging.tinychok.ru 8.8.8.8`
- основной backend сейчас работает через:
  - `tinychok-staging.service`
  - `nginx` site `tinychok-staging-api`
- после каждого нового deploy полезно отдельно проверять:
  - `git rev-parse --short HEAD`
  - `curl -I https://staging.tinychok.ru`
  - `curl -s https://api.staging.tinychok.ru/healthz`
  - визуальный smoke-check в браузере после basic auth

## Что теперь закрыто

- staging backend deploy
- staging frontend deploy
- HTTPS для обоих staging-доменов
- browser smoke-check UI + API + websocket
- basic auth для frontend staging-домена
- allowlist тестовых телефонов на backend
- фиксы по account search, seeded mock history и сортировке чатов
- legal pages и mobile composer batch из `1b8df3f`
- product stack `1a037b9 -> 30a8256 -> 2bf7a1e -> a21f0d1 -> a6be3d3 -> 27646e7 -> 4ad9b0b` ещё не выкатывался на staging и ждёт deploy + smoke-check
- свежий follow-up batch поверх `4ad9b0b` тоже не выкатывался на staging и должен считаться частью следующего cumulative smoke-check

## Следующий шаг

Обязательного незакрытого staging rollout шага сейчас нет.

Следующую работу нужно начинать уже от новой продуктовой задачи или нового bugfix, сохраняя подтверждённую staging-точку на `1b8df3f` и понимая, что staging-кандидат сейчас представляет собой cumulative stack до `4ad9b0b` плюс follow-up batch поверх него, который ещё ждёт deploy и smoke-check.
