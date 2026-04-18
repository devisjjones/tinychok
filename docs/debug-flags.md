# Debug Flags And Production Removal

Короткая памятка по текущим debug-механикам, которые допустимы в локальной разработке и на staging, но требуют отдельного решения перед production rollout.

## Premium Debug Layer

- на `codex/global-release-prep` user-facing debug-тоггл в premium-экране уже убран
- premium-экран в этой ветке всегда запускает реальный checkout-flow через ЮKassa
- server-side debug premium path пока остаётся только как технический staging/dev инструмент без user-facing affordance

## Technical Placement

- UI premium purchase flow живёт в [src/App.tsx](/Users/devisjjones/Documents/tinychok/src/App.tsx)
- технический debug premium endpoint остаётся в:
  - [src/app/backend.ts](/Users/devisjjones/Documents/tinychok/src/app/backend.ts)
  - [server/src/index.ts](/Users/devisjjones/Documents/tinychok/server/src/index.ts)
  - [server/src/store.ts](/Users/devisjjones/Documents/tinychok/server/src/store.ts)

## What This Covers

- техническое server-side переключение premium для dev/staging сценариев
- storage quota regression tests
- premium restore / downgrade tests

## What Must Be Removed Or Replaced Before Production

- технический debug premium endpoint или любой внешний путь к нему
- любые debug-only affordance вокруг premium purchase

Вместо этого должен появиться реальный платёжный контур с:

- успешной покупкой
- ошибкой оплаты
- отменой оплаты
- восстановлением premium state после reload
