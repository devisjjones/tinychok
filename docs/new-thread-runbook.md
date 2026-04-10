# New Thread Runbook

Инструкция для продолжения работы в новом чате без потери качества. Это не продуктовая документация, а операционная памятка для Codex по тому, как продолжать работу с владельцем проекта.

## С чего начинать новый тред

В начале нового треда сначала перечитать:

1. [docs/next-branch-handoff.md](/Users/devisjjones/Documents/tinychok/docs/next-branch-handoff.md)
2. [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md)
3. [docs/release-contracts.md](/Users/devisjjones/Documents/tinychok/docs/release-contracts.md)
4. [docs/staging-rollout-status.md](/Users/devisjjones/Documents/tinychok/docs/staging-rollout-status.md)
5. [docs/collaboration-instructions.md](/Users/devisjjones/Documents/tinychok/docs/collaboration-instructions.md)

Этого набора достаточно, чтобы быстро восстановить:

- текущее устройство staging
- рабочие release-blocking контракты
- правила общения с владельцем проекта
- обязательный deploy discipline

## Как работать с владельцем проекта

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
- при длинной сессии регулярно переоценивать контекст, чтобы не начать отвечать не на тот запрос

## Staging — обязательная часть работы

Если правка user-facing и относится к staging-потоку, задача не считается закрытой без staging verify.

Минимальный обязательный контур:

1. local HEAD
2. `origin/codex/staging-deploy`
3. staging VM HEAD
4. live `assets/main-*.js`
5. `healthz` / `readyz`

Подробный чеклист лежит в [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md).

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
