# Yandex Cloud Status

Актуальный статус того, что уже видно по скриншоту консоли `Yandex Cloud`.

## Cloud и folder

По состоянию на `2026-03-20`, по скриншоту в консоли видны:

- cloud: `cloud-kurusayd`
- cloud id: `b1gmc74rp8gvc5j6p1qa`
- folder: `default`
- folder id: `b1gsl31s6btpgriksgl5`
- staging folder: `tinychok-staging`
- staging folder id: `b1g5c3ai08ckdov60ft0`
- production folder: `tinychok-prod`
- production folder id: `b1g4ldq3ej90fvfmdqcl`

Важно:

- строки вида `b1g...` здесь являются `ID каталогов (folder id)`, а не паролями;
- это не секреты уровня `password` или `access key`;
- они нужны для точной привязки ресурсов, CLI-команд, Terraform и инфраструктурной документации.

## Что уже создано

По скриншоту в `default` folder уже есть:

- `Object Storage`
  - в избранном отображается ресурс `tinychok.com`
  - всего видно `2` бакета
  - суммарный объём: `453.93 KB`
- `Virtual Private Cloud`
  - `1` сеть
  - `3` подсети
  - `1` группа безопасности

По состоянию на `2026-03-20` также подтверждено:

- в folder `tinychok-staging` создан bucket `tinychok-media-staging`
- bucket пустой, что нормально для нового staging media storage
- создан service account `tinychok-storage-staging`
- у service account есть роль `storage.editor` в каталоге `tinychok-staging`
- для `tinychok-storage-staging` создан static access key
- создана staging VM `tinychok-staging-1`
- vm id: `fv4gef3170h8s344dmh6`
- public ip: `158.160.197.255`
- private ip: `10.130.0.34`
- zone: `ru-central1-d`
- параметры VM:
  - `2 vCPU`
  - `20%` guaranteed vCPU
  - `4 GB RAM`
  - `30 GB network-ssd`
  - `Ubuntu`
  - `Running`
- подключение к VM через `Cloud Shell` успешно работает
- на VM установлен `PostgreSQL 16.13`
- PostgreSQL service находится в состоянии `active`
- локальная база `tinychok` и пользователь `tinychok_app` созданы
- вход в базу под `tinychok_app` подтверждён
- на VM установлен `Node.js v24.14.0`
- на VM установлен `npm 11.9.0`

По состоянию на `2026-03-21` также подтверждено:

- на staging VM настроен `GitHub deploy key`
- `ssh -T git@github.com` на VM проходит успешно
- репозиторий склонирован в `/home/devis/tinychok`
- серверная ветка staging на VM: `codex/staging-deploy`
- staging `.env` на VM создан
- backend переведён в `systemd`
- системный сервис `tinychok-staging.service` включён в автозапуск
- `tinychok-staging.service` находится в состоянии `active (running)`
- `nginx` установлен и работает
- для `api.staging.tinychok.ru` настроен reverse proxy на `127.0.0.1:8787`
- для `api.staging.tinychok.ru` выпущен `Let's Encrypt` сертификат
- публичный endpoint `https://api.staging.tinychok.ru/healthz` отвечает `{"status":"ok"}`
- публичный endpoint `https://api.staging.tinychok.ru/readyz` отвечает `status: ok`
- в `Reg.ru` созданы DNS-записи:
  - `api.staging.tinychok.ru -> 158.160.197.255`
  - `staging.tinychok.ru -> 158.160.197.255`
- внешние резолверы `1.1.1.1` и `8.8.8.8` уже видят эти staging-записи

## Интерпретация

- это уже не пустой аккаунт Yandex Cloud;
- тестовая инфраструктура под `tinychok.com` в Object Storage уже начата;
- `default` folder сейчас фактически используется как рабочий тестовый контур;
- production/staging разделение по folder'ам пока ещё не реализовано.

## Зафиксированная рекомендация

Для `Tinychok` правильная схема дальше такая:

- `default` folder не использовать как финальный production folder;
- `tinychok-staging` использовать как staging folder;
- `tinychok-prod` использовать как production folder;
- staging и production держать раздельно по ресурсам и секретам.

## Что ещё не подтверждено

По этому скриншоту не подтверждаются:

- наличие `Managed PostgreSQL`
- наличие `Managed Valkey`
- наличие `Managed Kubernetes`
- наличие `Application Load Balancer`
- наличие `Certificate Manager`
- наличие `Lockbox`

## Что точно не создано

По состоянию на `2026-03-20` создание staging `Managed PostgreSQL` было отменено из-за высокой стоимости формы по умолчанию.

Зафиксированное решение:

- для staging пока не создаём `Managed PostgreSQL` по стандартной конфигурации;
- следующий практический путь для staging: `Compute Cloud VM + self-managed PostgreSQL`;
- production target при этом остаётся `Managed PostgreSQL`.

## Что ещё не сделано на staging VM

- frontend для `staging.tinychok.ru` ещё не выложен;
- отдельный HTTPS для `staging.tinychok.ru` ещё не настраивался;
- локальный resolver `127.0.0.53` на VM может продолжать кэшировать старый `NXDOMAIN`, поэтому для свежих DNS-проверок надёжнее спрашивать внешний resolver.
