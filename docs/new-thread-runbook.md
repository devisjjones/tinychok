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

## Как работать с владельцем проекта

- если задача понятна, не останавливаться на плане и сразу переходить к реализации
- работать предметно по текущему запросу, не съезжать на соседнюю задачу
- не смешивать несколько незавершённых задач в одном ответе
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
5. прогнать тесты локально
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
- что именно проверено на staging
- какие есть ограничения, риски или недоделки

Если staging не обновился, писать прямо:

- что сделано локально
- что запушено
- что не доехало
- где именно блокер
