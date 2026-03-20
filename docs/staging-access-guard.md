# Staging Access Guard

Самый простой и практичный режим для текущего staging:

1. На `https://staging.tinychok.ru` ставится общий пароль.
2. На backend разрешаются только телефоны тестеров.

Так staging остаётся удобным для тебя и друзей, но случайный человек из интернета не сможет нормально войти и переписываться.

## Почему нужны оба замка

- пароль на сайте закрывает сам UI от случайных посетителей;
- allowlist телефонов на backend не даёт зарегистрироваться любому номеру, даже если кто-то узнает URL API.

## Что уже поддерживает код

Backend теперь умеет читать переменную:

```env
TINYCHOK_ALLOWED_TEST_PHONES=+79990000001,+79990000002,+79990000003
```

Если список не пустой, только эти номера смогут:

- запросить demo-код
- подтвердить код
- зарегистрировать аккаунт

Остальные увидят ошибку:

```text
Этот номер пока не добавлен в список тестеров. Попросите владельца проекта добавить его в staging allowlist.
```

## Что сделать на staging VM

### 1. Добавить номера тестеров в staging env

Открой тот env-файл, который уже использует `tinychok-staging.service`, и добавь строку:

```env
TINYCHOK_ALLOWED_TEST_PHONES=+79990000001,+79990000002,+79990000003
```

После этого перезапусти backend:

```bash
sudo systemctl restart tinychok-staging
```

### 2. Поставить общий пароль на сам сайт

Установить утилиту для файла паролей:

```bash
sudo apt-get update
sudo apt-get install -y apache2-utils
```

Создать логин и пароль для staging:

```bash
sudo htpasswd -c /etc/nginx/.tinychok-staging-passwd tinychok
```

Команда спросит пароль. Его можно дать только своим тестерам.

### 3. Включить пароль в nginx для frontend-домена

В `server` блоке для `staging.tinychok.ru` добавить:

```nginx
auth_basic "Tinychok staging";
auth_basic_user_file /etc/nginx/.tinychok-staging-passwd;
```

Потом проверить и перечитать `nginx`:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Что получится в итоге

- твои друзья сначала вводят общий пароль на сайт;
- потом входят только со своими номерами из allowlist;
- любой левый номер получает отказ ещё на auth шаге.

## Что это не решает

- это не production security;
- это просто нормальная защита staging от случайных людей и лишнего шума;
- для следующего уровня уже нужны VPN, Cloudflare Access или полноценные invite flows.
