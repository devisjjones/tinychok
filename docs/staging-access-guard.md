# Staging Access Guard

Документ описывает только текущие механики защиты staging-контура и их смысл.

## Active Guard Layers

### Frontend Guard

- `https://staging.tinychok.ru` закрыт через `nginx basic auth`
- `https://admin.staging.tinychok.ru` тоже должен быть закрыт через `nginx basic auth`
- пароль хранится только на staging VM
- пароль и содержимое `htpasswd` не должны попадать в чат, git или документацию

### Backend Guard

- backend читает `TINYCHOK_ALLOWED_TEST_PHONES`
- если список не пустой, только номера из allowlist могут:
  - запросить demo-код
  - подтвердить код
  - зарегистрировать аккаунт

Остальные получают понятную ошибку о том, что номер пока не включён в список тестеров.

### Admin Guard

- одного `basic auth` для админки недостаточно
- admin frontend должен открываться только на разрешённых admin host-ах
- admin API дополнительно режется server-side:
  - по staff role
  - по permission matrix
  - по admin origin / host gating
- production admin остаётся выключенным по умолчанию через `ADMIN_PANEL_ENABLED=false`

## Why Both Locks Matter

- frontend guard закрывает сам UI от случайных посетителей
- отдельный guard на `admin.staging.tinychok.ru` закрывает internal staff UI от случайного открытия
- backend allowlist не даёт использовать staging auth любому номеру, даже если кто-то знает URL API
- staff role и permission matrix не дают обычному staging-пользователю получить доступ к admin API даже после логина

Эти два замка дополняют друг друга и не заменяют один другой.

## What Must Not Bypass The Guard

- image upload
- file upload
- GIF upload
- avatar upload
- admin login
- admin API
- websocket connect
- auth request / verify / register flow
- CSV export из admin
- content preview и media download из admin

Новые product-механики не должны требовать ослабления `basic auth` или allowlist-а.

## Post-Deploy Verification

Полезно быстро проверять:

```bash
curl -I https://staging.tinychok.ru
curl -I https://admin.staging.tinychok.ru
curl -s https://api.staging.tinychok.ru/healthz
```

Если user frontend или admin frontend внезапно открываются без basic auth, либо неподдерживаемый номер снова может пройти auth, проблема уже не в UI, а в `nginx` или staging `.env`.

Если браузер показывает предупреждение о сертификате, а `curl -Iv https://admin.staging.tinychok.ru` возвращает:

- `subjectAltName matched`
- `issuer: Let's Encrypt`
- `SSL certificate verify ok`

то проблема уже не в серверном сертификате, а в локальном кэше браузера / stale site state.

## Secrets That Must Stay Out Of Chat And Git

- пароль `basic auth`
- содержимое `htpasswd`
- полное значение `TINYCHOK_ALLOWED_TEST_PHONES`
- `TINYCHOK_CAPTCHA_SECRET_KEY`
- любые analytics ingest tokens и внешние credentials
