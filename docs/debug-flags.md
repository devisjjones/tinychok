# Debug Flags And Production Removal

Короткая памятка по текущим debug-механикам, которые допустимы в локальной разработке и на staging, но требуют отдельного решения перед production rollout.

## Premium Debug Layer

- в premium-экране есть debug-тоггл автопокупки
- при включённом тоггле кнопки покупки не запускают реальный платёжный flow, а автоматически включают premium текущему аккаунту
- при выключённом тоггле purchase-кнопки идут в реальный checkout-flow через ЮKassa
- debug-включение и debug-выключение premium сохраняются server-side для текущего аккаунта

## Technical Placement

- debug toggle хранится в `localStorage` по ключу `tinychok.debug.premium-auto-checkout`
- UI-логика живёт в [src/App.tsx](/Users/devisjjones/Documents/tinychok/src/App.tsx)
- стили debug premium layer живут в [src/App.css](/Users/devisjjones/Documents/tinychok/src/App.css)

## What This Covers

- быстрый переход между premium / non-premium состояниями
- проверка locked premium features
- проверка unlocked premium features
- проверка UX premium purchase buttons без прохождения реального платежа

## What Must Be Removed Or Replaced Before Production

- debug-тоггл автопокупки
- любые debug-only affordance вокруг premium purchase
- storage key `tinychok.debug.premium-auto-checkout`

Вместо этого должен появиться реальный платёжный контур с:

- успешной покупкой
- ошибкой оплаты
- отменой оплаты
- восстановлением premium state после reload
