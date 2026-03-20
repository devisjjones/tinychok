# Domain Status

Актуальный статус доменов и DNS, который уже подтверждён в проекте.

## Зарегистрированные домены

По состоянию на `2026-03-20` зарегистрированы:

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

- домен куплен;
- в `Cloudflare` он есть среди активов проекта;
- контент на `tinychok.ru` пока не выложен;
- production DNS-схема для `.ru` ещё не зафиксирована как окончательная.

## Что это значит сейчас

- `.com` уже используется как домен, привязанный к текущей статической выдаче через Yandex website endpoint;
- `.ru` зафиксирован как основной production-домен;
- `.com` должен стать доменом-редиректом на `.ru`;
- staging логичнее держать на `.ru`, а не на `.com`, чтобы production и staging жили в одной доменной схеме.
