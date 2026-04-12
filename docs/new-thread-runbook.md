# New Thread Runbook

Инструкция для продолжения работы в новом чате без потери качества. Это не продуктовая документация, а операционная памятка для Codex по тому, как продолжать работу с владельцем проекта.

## С чего начинать новый тред

В начале нового треда сначала перечитать:

1. [docs/next-branch-handoff.md](/Users/devisjjones/Documents/tinychok/docs/next-branch-handoff.md)
2. [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md)
3. [docs/release-contracts.md](/Users/devisjjones/Documents/tinychok/docs/release-contracts.md)
4. [docs/staging-rollout-status.md](/Users/devisjjones/Documents/tinychok/docs/staging-rollout-status.md)
5. [docs/collaboration-instructions.md](/Users/devisjjones/Documents/tinychok/docs/collaboration-instructions.md)

Если задача касается infra / storage / runtime / migration / deploy, дополнительно перечитать:

6. [docs/yandex-production-architecture.md](/Users/devisjjones/Documents/tinychok/docs/yandex-production-architecture.md)

Этого набора достаточно, чтобы быстро восстановить:

- текущее устройство staging
- рабочие release-blocking контракты
- правила общения с владельцем проекта
- обязательный deploy discipline

## Что перечитывать внутри длинного треда

Если в длинном треде пришла новая содержательная задача, перед новой реализацией нужно быстро перечитать:

1. [docs/new-thread-runbook.md](/Users/devisjjones/Documents/tinychok/docs/new-thread-runbook.md)
2. [docs/collaboration-instructions.md](/Users/devisjjones/Documents/tinychok/docs/collaboration-instructions.md)
3. relevant handoff/status docs по текущей зоне:
   - `next-branch-handoff.md`
   - `staging-rollout-status.md`
   - `release-contracts.md`

Особенно обязательно делать это:

- после сжатия контекста
- после переключения между product/UI и infra/deploy/runtime
- после серии багфиксов, где уже была путаница между `локально`, `origin`, `VM` и `live staging`

## Роли Документов

Чтобы не держать один и тот же контракт в двух местах:

- [docs/new-thread-runbook.md](/Users/devisjjones/Documents/tinychok/docs/new-thread-runbook.md)
  - главный файл с инвариантами работы
  - definition of done
  - test / deploy / staging discipline
  - порядок прохождения задач
  - правила для feature gates, scroll и других чувствительных зон
- [docs/collaboration-instructions.md](/Users/devisjjones/Documents/tinychok/docs/collaboration-instructions.md)
  - только правила общения с владельцем проекта
  - формат ручных инструкций
  - формат визуальных и smoke-check проверок
  - когда и какие скрины просить

Если правило отвечает на вопрос `можно ли считать задачу завершённой`, оно должно жить здесь, а не в `collaboration-instructions.md`.

## Как работать с владельцем проекта

- если задача понятна, не останавливаться на плане и сразу переходить к реализации
- работать предметно по текущему запросу, не съезжать на соседнюю задачу
- не смешивать несколько незавершённых задач в одном ответе
- держать только одну активную пользовательскую задачу за раз
- если новый запрос прилетел до закрытия предыдущего, сначала коротко зафиксировать статус текущей задачи и только потом переключаться
- если задача не сделана, писать это прямо
- если deploy blocked, писать это в явном виде, а не прятать в конце ответа
- если нужна ручная проверка владельца, давать инструкции шагами
- если полезен скрин, просить конкретный скрин после конкретного действия
- не заставлять владельца делать лишнюю диагностику, если её можно сделать самому

## Что особенно важно соблюдать

- не путать:
  - `сделано локально`
  - `запушено в origin`
  - `обновлено на staging VM`
  - `live staging реально отдаёт новый bundle`
- не писать `на staging уже выкачено`, пока это не подтверждено по live URL
- не считать `git push` эквивалентом deploy
- не считать `healthz=ok` достаточным доказательством фронтенд-выкатки
- не считать staging обновлённым только потому, что:
  - код изменён
  - локально тесты зелёные
  - dist собрался
  - staging VM на новом commit
- при длинной сессии регулярно переоценивать контекст, чтобы не начать отвечать не на тот запрос
- если меняется feature gate / premium gate, нельзя считать задачу закрытой после правки только одного слоя

Для feature gate обязательно проверять весь контур:

1. entrypoint в UI
2. async loader / search / secondary CTA
3. server endpoint / store rule
4. docs с текущим продуктовым контрактом
5. staging сценарий под нужной ролью аккаунта

Если изменился только `onClick`, label или один фронтовый экран, нельзя писать, что гейт уже изменён.

## Чувствительные зоны

Особенно внимательно относиться к этим зонам и по умолчанию усиливать там проверки и тесты:

- realtime / websocket
- unread / read state
- thread inbox / thread notifications
- storage / archive / auto-cleanup / restore
- billing / premium / quota
- group / channel ownership
- admin exports / audit / csv / legal export
- staging deploy / runtime config / analytics
- legal/public pages
- mobile layout
- media / file / image / video flows
- scroll / overflow / touch scrolling

## Staging — обязательная часть работы

Если правка user-facing и относится к staging-потоку, задача не считается закрытой без staging verify.

Минимальный обязательный контур:

1. local HEAD
2. `origin/codex/staging-deploy`
3. staging VM HEAD
4. live `assets/main-*.js`
5. `healthz` / `readyz`

Если правка касается frontend / backend / runtime, staging-проверка должна включать не только ассеты и health, но и живой или максимально прямой user-facing сценарий.

Подробный чеклист лежит в [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md).

## Обязательный инженерный workflow

На каждую задачу придерживаться одного и того же порядка:

1. быстро прочитать relevant code и актуальные docs
2. найти реальную точку изменений в коде
3. внести кодовые изменения
4. добавить или обновить автотесты
5. прогнать обязательный test-gate локально:
   - быстрый контрактный прогон во время работы: `npm run test:ui-contracts`
   - перед финальным ответом и любым staging deploy: `npm run test:gate`
   - новые автотесты добавлять только в те `*.test.ts` пути и наборы, которые реально попадают в `npm run test:gate`; нельзя считать задачу покрытой тестом, если тест лежит вне текущей gate-маски и фактически не исполняется
6. если задача влияет на frontend / backend / runtime, выкатить на staging
7. после выкладки проверить staging:
   - `healthz`
   - `readyz`
   - если это frontend, убедиться, что реально отдаются новые ассеты
   - если это backend / runtime, проверить живой сценарий, а не только сборку
8. после этого обновить high-signal docs
9. только потом давать финальный ответ

Если для серьёзного изменения отсутствует хотя бы один из пунктов:

- код
- тесты
- staging
- docs

задача считается незавершённой.

Если задача не `docs-only`, нельзя писать `готово`, `исправлено` или `задеплоено`, пока локально не зелёный `npm run test:gate`.

Если задача `docs-only`, staging deploy не требуется, но это нужно писать прямо, чтобы не создавать ложного ощущения, будто rollout просто забыли.

## Отдельное Правило Для Feature Gates

Если правка меняет `premium-only`, `staff-only`, `owner-only`, `viewer-only` или любой другой продуктовый гейт:

1. найти все entrypoints этого гейта через `rg`, а не править первое найденное место
2. отдельно проверить:
   - UI-кнопку / вкладку / меню
   - data loader / search / submit path
   - server/store guard
   - вторичные сценарии вроде viewer / modal / retry / empty-state
3. обновить автотесты так, чтобы новый контракт был зафиксирован и на фронте, и на сервере
4. обновить relevant `.md`, если продуктовый контракт реально поменялся
5. только после staging verify писать, что правка завершена

Отдельный запрет:

- нельзя отчитываться о смене feature gate по одному визуальному изменению
- нельзя считать задачу сделанной, если изменился только фронт или только сервер

## Что обязательно актуализировать после значимых правок

Если правка меняет продуктовый контракт, rollout или операционную базу, обновлять high-signal docs:

- [docs/release-contracts.md](/Users/devisjjones/Documents/tinychok/docs/release-contracts.md)
  - если меняется release-blocking поведение
- [docs/staging-rollout-status.md](/Users/devisjjones/Documents/tinychok/docs/staging-rollout-status.md)
  - если меняется staging rollout reality, live asset, доступ или обязательный smoke-check
- [docs/next-branch-handoff.md](/Users/devisjjones/Documents/tinychok/docs/next-branch-handoff.md)
  - если меняется текущая техническая база для следующего треда
- [docs/collaboration-instructions.md](/Users/devisjjones/Documents/tinychok/docs/collaboration-instructions.md)
  - если обнаружено новое устойчивое правило совместной работы или ручной проверки
- [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md)
  - если меняется deploy discipline, access recovery или proof-points
- [docs/yandex-production-architecture.md](/Users/devisjjones/Documents/tinychok/docs/yandex-production-architecture.md)
  - если меняется infra / storage layout / runtime topology / deploy path / migration contract

Не надо механически трогать все `.md`. Обновлять только те документы, где реально изменился контракт.

## Что делать, если снова начинается путаница

Если в треде уже были признаки контекстной деградации:

- сначала коротко зафиксировать текущее состояние
- отдельно перечислить:
  - что сделано локально
  - что запушено
  - что реально задеплоено
- только после этого продолжать новую задачу

Если становится видно, что тред перегружен, лучше рекомендовать переход в новый чат и опираться на этот файл плюс handoff docs.

## Формат честного статуса

Правильные формулировки:

- `локально исправлено`
- `запушено в codex/staging-deploy`
- `на staging VM ещё не выкачено`
- `deploy blocked из-за SSH / host key / доступа`
- `live staging уже отдаёт новый bundle`

Неправильные формулировки:

- `почти на staging`
- `ограничение только в проверке`
- `считаем выкаченным`

если live host ещё старый.

## Что должно быть в финальном ответе

Если задача не docs-only, в финальном ответе обязательно должны быть:

- что именно изменено
- какие файлы были затронуты
- какие автотесты прошли
- отдельный блок `Автотесты` с актуальными числами последнего прогона:
  - `npm run test:ui-contracts = <N>`
  - `npm run test:gate = <M>`
- отдельный блок `Покрытие`:
- `добавил новый тест`
- или `усилил существующий тест`
- короткое пояснение `Что именно покрыто`
- в явном виде название теста, если он был добавлен или усилен
- если число тестов не выросло, потому что усилен существующий `test(...)`, это нужно написать явно
- если новый тест не добавлялся, это тоже нужно написать прямо и коротко объяснить почему
- что именно проверено на staging
- какие есть ограничения, риски или недоделки

Если staging не обновился, писать прямо:

- что сделано локально
- что запушено
- что не доехало
- где именно блокер

## Отдельное Правило Для Scroll / Overflow Правок

Если правка касается:

- room feed scroll
- mobile touch scroll
- overflow / fixed shell / `100vh` / `100dvh`
- `touch-action`
- `overscroll-behavior`

то нельзя закрывать задачу только по source-contract тестам или по одной платформе.

Обязательный минимум:

1. локально обновить автотесты
2. прогнать `npm run test:ui-contracts`
3. прогнать `npm run test:gate`
4. проверить staging руками на desktop
5. проверить staging руками на mobile

Отдельный запрет:

- нельзя делать широкий CSS-фикс через глобальный `touch-action` на реальных scroll-контейнерах, пока не доказано, что это именно их правильный контракт
- если scroll сломался на одной платформе, нельзя считать задачу закрытой после проверки только другой платформы
