# Data Retention

Текущее server-side хранение данных Tinychok по состоянию на `2026-03-27`.

Документ описывает фактическое поведение кода, а не желаемую future-policy.

## Общий принцип

- исторические данные больше не хранятся бессрочно по умолчанию
- backend запускает retention cleanup:
  - один раз на старте
  - затем периодически по таймеру
- по умолчанию cleanup запускается каждые `24 часа`
- базовое окно хранения для исторических данных: `3 года`

Runtime env:

```env
TINYCHOK_RETENTION_HISTORICAL_DATA_DAYS=1095
TINYCHOK_RETENTION_CLEANUP_INTERVAL_HOURS=24
```

## Что хранится ограниченно

### 5 минут

- `authChallenges` / SMS demo code
- signed URL к приватным media-объектам

### 24 часа

- orphan `pendingMediaUploads`, которые не были привязаны к сообщению / посту / профилю

### 3 года

- server sessions
- IP access history:
  - `login`
  - `ip-change`
- admin audit log
- moderation reports:
  - `adminReports`
  - `contactReports`
  - `subscriptionChannelReports`
- direct message history
- group message history
- channel post history
- thread comments и stale `threadStates`, если корневой контент уже вышел за retention window
- user GIF library items

## Что не режется только по возрасту

Эти сущности intentionally не удаляются просто потому, что аккаунт старый:

- `accounts`
- текущий профиль пользователя
- `passwordHash`
- `passwordSetAt`
- текущий premium state
- текущие аватары профиля / групп / каналов

Причина простая: иначе живой пользователь старше трёх лет потеряет доступ к аккаунту или увидит сломанный профиль.

## Cleanup semantics

- cleanup удаляет только исторические записи старше retention window
- если после удаления истории контейнерная сущность становится пустой и более не нужна, backend подчищает stale copies
- если после удаления ссылок media-объект перестал использоваться, backend удаляет его как unreferenced media
- retention не бэкфиллит прошлые периоды в отчёты и не пишет synthetic audit entries на каждую удалённую запись

## Что это значит practically

- Tinychok не рассчитан на вечное хранение всей истории сообщений и логов
- юридические и admin exports покрывают только то, что осталось внутри retention window
- активные аккаунты и текущий доступ пользователя retention cleanup не должны ломать

## Связанные документы

- [docs/next-branch-handoff.md](/Users/devisjones/Documents/New%20project/tinychok/docs/next-branch-handoff.md)
- [docs/staging-rollout-status.md](/Users/devisjones/Documents/New%20project/tinychok/docs/staging-rollout-status.md)
