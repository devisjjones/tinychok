# Production Deploy Runbook

Короткий operational runbook для первого production-контура. Его цель: не смешивать `staging reference`, `production prep branch`, `production VM/service`, `live tinychok.ru` и `api.tinychok.ru`.

## Главный принцип

- production deploy не идёт из `codex/staging-deploy`
- live staging branch остаётся `codex/staging-deploy`
- текущая branch под global release / production prep = `codex/global-release-prep`
- production нельзя считать поднятым, пока не подтверждены:
  - live `tinychok.ru`
  - live `api.tinychok.ru`
  - `readyz.environment = production`
  - public URLs у runtime указывают на production-домены
  - analytics не используют staging counter `108249405`

## Перед первым production deploy

1. Убедиться, что production ресурсы отделены от staging:
   - folder = `tinychok-prod`
   - production secrets не reuse staging values
   - production bucket / db / analytics counter отдельные
2. Убедиться, что DNS и TLS готовы:
   - `tinychok.ru`
   - `api.tinychok.ru`
   - `admin.tinychok.ru`, только если admin реально включается
   - `tinychok.com` редиректит на `tinychok.ru`
3. Убедиться, что production env заполнен явно:
   - `TINYCHOK_APP_ENV=production`
   - `TINYCHOK_TRUST_PROXY=true`
   - `ADMIN_PANEL_ENABLED=false` по умолчанию
   - `SMS_OTP_TEST_MODE=false`
   - отдельный production `TINYCHOK_YANDEX_METRICA_COUNTER_ID`
   - SmartCaptcha production keys
   - production YooKassa webhook / return URL
4. Прогнать локальный gate:
   - `npm run test:gate`

## Обязательные production proof-points

После каждого production deploy нужно подтвердить минимум:

1. Локальный HEAD:
   - `git rev-parse --short HEAD`
2. Remote production-prep branch HEAD:
   - `git ls-remote origin refs/heads/codex/global-release-prep`
   - если используется другой production branch, проверить именно её
3. Production runtime:
   - `curl -s https://api.tinychok.ru/healthz`
   - `curl -s https://api.tinychok.ru/readyz`
   - `curl -s https://api.tinychok.ru/api/client-config`
4. Live frontend bundle:
   - `curl -s https://tinychok.ru | rg -o 'assets/main-[^"]+\\.js'`
5. Public web assets:
   - `curl -I https://tinychok.ru/manifest.webmanifest`
   - `curl -I https://tinychok.ru/apple-touch-icon.png`
   - `curl -I https://tinychok.ru/privacy-policy.html`
6. Domain edge:
   - `curl -I https://tinychok.com`
   - expected result = redirect to `https://tinychok.ru`

## Стандартный deploy flow

1. Подготовить clean worktree.
2. Прогнать локальный gate:
   - `npm run test:gate`
3. Запушить production prep branch.
4. На production host выполнить:

```bash
cd /home/devis/tinychok
bash scripts/deploy-production.sh
```

5. После restart подтвердить:
   - `readyz.environment = production`
   - `publicUrls.appBaseUrl = https://tinychok.ru`
   - `publicUrls.apiBaseUrl = https://api.tinychok.ru`
   - `client-config.admin.environment = production`
   - `captcha.provider = smartcaptcha`
   - `server.trustProxy = true`
   - analytics включены и `metricaCounterId` не равен staging `108249405`

## Что проверяет production deploy script

- clean commit-backed worktree
- прямой `origin` remote на `devisjjones/tinychok`
- `npm run audit:release`
- `npm run build:production`
- live runtime verify через `scripts/verify-release-runtime.mjs`
- static web assets contract
- lazy app asset chain на `https://tinychok.ru`

## Что руками проверить после deploy

- `tinychok.com` редиректит на `tinychok.ru`
- legal pages открываются публично
- login / password / SMS / captcha работают на production domains
- `TINYCHOK_YOOKASSA_RETURN_URL=https://tinychok.ru/premium`
- YooKassa webhook смотрит в `https://api.tinychok.ru/api/payments/webhooks/yookassa`
- production analytics идут в отдельный counter / dataset
- object storage выдаёт вложения через тот production path, который реально включён в env

## Если deploy blocked

- если `readyz.environment != production`, deploy считается некорректным
- если runtime отдал staging counter id `108249405`, deploy считается некорректным
- если `server.trustProxy = false`, deploy считается некорректным
- если `tinychok.com` не редиректит на `tinychok.ru`, domain rollout не завершён
- если legal pages или installable icons не открываются публично, frontend rollout не завершён
