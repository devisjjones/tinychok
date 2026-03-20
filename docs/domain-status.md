# Domain Status

Актуальный статус доменов и DNS, который уже подтверждён в проекте.

## Зарегистрированные домены

По состоянию на `2026-03-21` зарегистрированы:

- `tinychok.com`
- `tinychok.ru`

## Зафиксированные решения

- основной production-домен: `tinychok.ru`
- домен `tinychok.com` должен редиректить на `tinychok.ru`
- рекомендуемый staging-домен: `staging.tinychok.ru`
- рекомендуемый staging API-домен: `api.staging.tinychok.ru`

## Cloudflare

### `tinychok.com`

В `Cloudflare` зона для `tinychok.com` уже заведена.

По видимому состоянию DNS на скриншоте:

- `CNAME` для корня `tinychok.com`
  - target начинается с `tinychok.com.website.y...`
  - proxy status: `DNS only`
  - TTL: `Auto`
- `CNAME` для `www`
  - target начинается с `tinychok.com.website.y...`
  - proxy status: `DNS only`
  - TTL: `Auto`

Примечание:

- по скриншоту это выглядит как Yandex Object Storage website endpoint;
- точное полное значение target нужно при случае ещё раз сверить прямо в панели Cloudflare, потому что на скриншоте строка обрезана.

### `tinychok.ru`

По состоянию на `2026-03-21` фактическая DNS-зона для `.ru` редактировалась в `Reg.ru`.

Подтверждённые записи:

- `A @ -> 95.163.244.138`
- `A www -> 95.163.244.138`
- `A api.staging -> 158.160.197.255`
- `A staging -> 158.160.197.255`

Также подтверждено:

- `api.staging.tinychok.ru` уже резолвится во внешних DNS (`1.1.1.1`, `8.8.8.8`) на `158.160.197.255`
- `staging.tinychok.ru` уже резолвится во внешних DNS (`1.1.1.1`, `8.8.8.8`) на `158.160.197.255`
- `https://api.staging.tinychok.ru/healthz` и `https://api.staging.tinychok.ru/readyz` уже открываются публично
- frontend на `staging.tinychok.ru` пока ещё не выложен
- production DNS-схема для `.ru` ещё не зафиксирована как окончательная

## Что это значит сейчас

- `.com` уже используется как домен, привязанный к текущей статической выдаче через Yandex website endpoint;
- `.ru` зафиксирован как основной production-домен;
- staging API уже реально работает на `api.staging.tinychok.ru` с HTTPS;
- `staging.tinychok.ru` уже зарезервирован DNS-записью под staging frontend;
- `.com` должен стать доменом-редиректом на `.ru`;
- staging логичнее держать на `.ru`, а не на `.com`, чтобы production и staging жили в одной доменной схеме.
