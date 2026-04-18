# Production Readiness Checklist

Короткий чек-лист готовности production-контура перед безопасным live rollout.

## Branches And Rollout Path

- staging branch = `codex/staging-deploy`
- production prep branch = `codex/global-release-prep`
- staging VM и production contour не используют одну и ту же release-ветку
- локально зелёный `npm run test:gate`
- есть понятный rollback path на предыдущий production commit

## Domains And SSL

- `tinychok.ru` — production frontend
- `api.tinychok.ru` — production API + WebSocket
- `tinychok.com` редиректит на `tinychok.ru`
- `admin.tinychok.ru` включается только если отдельно решено поднимать production admin
- TLS выпущен для production hosts
- публичные страницы открываются с production host:
  - `/user-agreement.html`
  - `/privacy-policy.html`
  - `/moderation-rules.html`
  - `/premium-terms.html`
  - `/refund-policy.html`
  - `/contacts.html`

## Runtime And Env

- `TINYCHOK_APP_ENV=production`
- `TINYCHOK_STORE_MODE=postgres`
- `TINYCHOK_MEDIA_BACKEND=object-storage`
- `TINYCHOK_TRUST_PROXY=true`
- `ADMIN_PANEL_ENABLED=false` по умолчанию
- `PUBLIC_APP_URL=https://tinychok.ru`
- `PUBLIC_API_URL=https://api.tinychok.ru`
- `PUBLIC_ADMIN_PRODUCTION_URL=https://admin.tinychok.ru`
- `ADMIN_PRODUCTION_HOST=admin.tinychok.ru`
- `SMS_OTP_LENGTH=4`
- `SMS_OTP_TEST_MODE=false`
- `SMS_RU_BASE_URL=https://sms.ru`

## Storage And Data

- folder = `tinychok-prod`
- production bucket = `tinychok-media-prod`
- bucket приватный, без public read/list
- production database отделена от staging
- target database = `Managed PostgreSQL`
- `readyz.storage.layout = hybrid-normalized`
- staging backup / restore артефакты не трогались до успешного production verify

## Analytics

- production `TINYCHOK_YANDEX_METRICA_COUNTER_ID` не совпадает со staging `108249405`
- `TINYCHOK_ANALYTICS_ENABLED=true`
- provider выбран явно:
  - `log` для первого включения
  - `clickhouse`, только если live schema и creds уже подняты
- production goals в Yandex Metrica заведены отдельно
- production charts / datasets фильтруются по `environment = production`

## Auth, Captcha, SMS

- production SmartCaptcha keys выпущены и host list включает production domains
- user auth request-code требует captcha
- admin auth request-code требует captcha
- `sms.ru` path идёт без `from`
- backend видит публичный client IP пользователя
- user-facing copy на code-step говорит о доставке SMS до `15 минут`

## Payments

- `TINYCHOK_PAYMENT_PROVIDER=yookassa`
- `TINYCHOK_YOOKASSA_RETURN_URL=https://tinychok.ru/premium`
- production webhook:
  - `https://api.tinychok.ru/api/payments/webhooks/yookassa`
- события webhook:
  - `payment.succeeded`
  - `payment.canceled`
- premium выдаётся только после backend confirm `succeeded`

## Final Verification

- `npm run verify:production-runtime`
- `curl -I https://tinychok.ru`
- `curl -s https://api.tinychok.ru/healthz`
- `curl -s https://api.tinychok.ru/readyz`
- `curl -I https://tinychok.com`
- реальный login / bootstrap / websocket smoke на production domains
