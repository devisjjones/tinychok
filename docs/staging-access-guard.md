# Staging Access Guard

## Current applied state

По состоянию на `2026-03-23` это уже включено на staging и осталось включённым после последнего подтверждённого deploy commit `1b8df3f`:

- basic auth включён на HTTPS-блоке `nginx` для `https://staging.tinychok.ru`
- `curl -I https://staging.tinychok.ru` возвращает `401 Unauthorized`
- логин basic auth: `tinychok`
- пароль хранится только на VM и не должен попадать в чат или git
- allowlist тестовых телефонов уже добавлен в `/home/devis/tinychok/.env` через `TINYCHOK_ALLOWED_TEST_PHONES`

## Что важно для текущего branch state

- последний уже запушенный candidate: `80346d7`
- `80346d7` уже включает thread inbox, delivery fixes, analytics / captcha groundwork, history window, owner flows канала, emoji picker, profile save fallback и delete hardening
- локальный текущий `HEAD` уже добавляет photo / attachment pipeline поверх `80346d7`, но access guard semantics от этого не меняются
- ни `80346d7`, ни предыдущие commits поверх `1b8df3f` не должны менять `basic auth` или `allowlist`
- даже после будущего включения captcha staging всё равно должен оставаться закрыт через `basic auth` и `TINYCHOK_ALLOWED_TEST_PHONES`

## Почему нужны оба замка

- пароль на сайте закрывает сам UI от случайных посетителей
- allowlist телефонов на backend не даёт зарегистрироваться любому номеру, даже если кто-то узнает URL API

## Что уже поддерживает код

Backend умеет читать:

```env
TINYCHOK_ALLOWED_TEST_PHONES=+79990000001,+79990000002,+79990000003
```

Если список не пустой, только эти номера смогут:

- запросить demo-код
- подтвердить код
- зарегистрировать аккаунт

Остальные увидят ошибку:

```text
Этот номер пока не добавлен в список тестеров. Попросите владельца проекта добавить его в staging allowlist.
```

## Что перепроверять после нового deploy

Даже если кодовый deploy не трогает access guard, после выкладки полезно быстро проверить:

```bash
git rev-parse --short HEAD
curl -I https://staging.tinychok.ru
curl -s https://api.staging.tinychok.ru/healthz
```

Если frontend открывается без basic auth или неподдерживаемый номер снова может пройти auth, значит проблема уже не в UI, а в `nginx` или staging `.env`.

Photo / attachment batch тоже не должен требовать ослабления guard-а:

- image upload идёт через уже существующий авторизованный `POST /api/media`
- новый photo flow не должен обходить `Authorization` и не должен открывать публичный upload endpoint без сессии

## Какие секреты нельзя писать в чат или git

- пароль `basic auth`
- содержимое `htpasswd`
- `TINYCHOK_ALLOWED_TEST_PHONES`
- `TINYCHOK_CAPTCHA_SECRET_KEY`
- любые внешние analytics credentials / ingest tokens
