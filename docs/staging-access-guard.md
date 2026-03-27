# Staging Access Guard

Документ описывает только текущие механики защиты staging-контура и их смысл.

## Active Guard Layers

### Frontend Guard

- `https://staging.tinychok.ru` закрыт через `nginx basic auth`
- `https://admin.staging.tinychok.ru` тоже должен быть закрыт через `nginx basic auth`
- user staging и admin staging используют разные `htpasswd` файлы
- пароли хранятся только на staging VM
- пароль и содержимое `htpasswd` не должны попадать в git или документацию

### Admin Brute-Force Guard

- для `admin.staging.tinychok.ru` включён `fail2ban` по `nginx error.log`
- блокировка идёт по IP после `3` неудачных попыток basic auth
- ступени блокировки:
  - первые `3` ошибки -> `5 минут`
  - следующие `3` -> `10 минут`
  - следующие `3` -> `30 минут`
  - следующие `3` -> `1 час`
  - следующие `3` -> `24 часа`
- история банов хранится дольше суток, чтобы эскалация не сбрасывалась слишком быстро
- practically это lockout по внешнему IP, а не по browser fingerprint

### Backend Guard

- backend читает `TINYCHOK_ALLOWED_TEST_PHONES`
- если список не пустой, только номера из allowlist могут:
  - запросить demo-код
  - подтвердить код
  - зарегистрировать аккаунт
- password-login существующего уже созданного user-аккаунта не использует SMS allowlist напрямую; его защищают:
  - `nginx basic auth`
  - наличие уже существующего аккаунта
  - пароль аккаунта

Остальные получают понятную ошибку о том, что номер пока не включён в список тестеров.

### Captcha Guard

- `request-code` на staging закрыт SmartCaptcha
- обычный user login показывает captcha на шаге ввода телефона
- admin login показывает отдельную captcha на шаге ввода staff-телефона
- `verify-code` и `register` не требуют повторной captcha; бот должен отсекаться до выдачи SMS-кода

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
- password reset через SMS
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

Если `admin.staging.tinychok.ru` внезапно перестаёт банить после серии неверных basic auth, проблема уже не в React/admin UI, а в `fail2ban`, `nginx error.log` или jail-конфиге на VM.

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
