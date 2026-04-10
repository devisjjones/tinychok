# Staging Deploy Runbook

Короткий обязательный runbook для staging rollout. Его цель простая: больше не путать `локально сделано`, `запушено в ветку`, `обновлено на VM` и `реально доехало до live staging`.

## Главный принцип

- `git push` не равен deploy
- свежий commit на VM не равен live frontend rollout
- staging нельзя считать обновлённым, пока web-host реально не начал отдавать новый `assets/main-*.js`

## Пять обязательных proof-points

После каждого staging deploy нужно подтвердить все пять пунктов:

1. Локальный HEAD:
   - `git rev-parse --short HEAD`
2. Remote branch HEAD:
   - `git ls-remote origin refs/heads/codex/staging-deploy`
3. VM HEAD:
   - `ssh devis@<staging-ip> 'cd /home/devis/tinychok && git rev-parse --short HEAD && git status --short'`
4. Live frontend bundle:
   - открыть `https://staging.tinychok.ru`
   - вытащить текущий `/assets/main-*.js`
   - убедиться, что хост реально отдаёт уже новый bundle, а не старый
5. Runtime:
   - `GET https://api.staging.tinychok.ru/healthz`
   - `GET https://api.staging.tinychok.ru/readyz`

Пока не подтверждены все пять пунктов, формулировка `на staging уже выкачено` считается неверной.

## Стандартный deploy flow

1. Убедиться, что локальный worktree чистый.
2. Прогнать локальный gate:
   - быстрый контрактный прогон при работе: `npm run test:ui-contracts`
   - обязательный gate перед push и deploy: `npm run test:gate`
3. Запушить `codex/staging-deploy`.
4. На staging VM выполнить:
   - `cd /home/devis/tinychok`
   - `bash scripts/deploy-staging.sh`
5. После deploy подтвердить все пять proof-points сверху.

## Что нельзя больше путать

- `origin/codex/staging-deploy` свежий, а staging root всё ещё отдаёт старый `main-*.js`:
  - deploy не завершён
- VM fast-forward'нулась, но live bundle старый:
  - frontend rollout не завершён
- `systemd` зелёный, но `readyz`/`healthz` не пройдены:
  - deploy не завершён
- `healthz=ok`, но live HTML всё ещё ссылается на старый asset:
  - deploy не завершён

## Если deploy blocked

### 1. SSH не пускает

- сначала проверить, это:
  - `REMOTE HOST IDENTIFICATION HAS CHANGED`
  - `Permission denied (publickey)`
  - `Connection timed out`
- не выпускать новые ключи автоматически, пока не понятен тип проблемы
- базовая диагностика:
  - `ssh -vvv devis@<staging-ip>`

### 2. Host key mismatch

- сравнить новый host key с самой VM
- не обходить mismatch вслепую
- только после подтверждения нового fingerprint обновлять trust

### 3. Нужен fallback-доступ

- включить serial console через metadata:
  - `serial-port-enable=1`
- использовать её только как запасной путь, если обычный SSH действительно сломан

## Базовое правило коммуникации

Если staging реально не обновлён, это нужно писать прямо и сразу:

- `код готов локально`
- `код запушен в origin`
- `staging deploy blocked`
- `live staging ещё старый`

Нельзя маскировать blocked deploy формулировками вроде `почти выкачено`, `уже на стенде` или `ограничение только в проверке`, если новый bundle ещё не отдаётся живым хостом.
