# Staging Frontend Rollout

Короткий frontend-only rollout для `staging.tinychok.ru` по состоянию на `2026-04-13`.

## Решение

Использовать ту же VM `tinychok-staging-1` и текущий `nginx`.

Почему это нормальный путь:

- frontend собирается в обычную статическую Vite-статику;
- client-side router не используется;
- отдельные публичные страницы уже входят в `dist/`:
  - `privacy-policy.html`
  - `user-agreement.html`
  - `contacts.html`
  - `premium-terms.html`
  - `refund-policy.html`
- websocket идёт напрямую в `wss://api.staging.tinychok.ru/ws`, так что frontend site не должен сам проксировать websocket.

Если меняется не только frontend, а ещё backend/runtime, этот файл уже недостаточен: использовать полный [docs/staging-deploy-runbook.md](/Users/devisjjones/Documents/tinychok/docs/staging-deploy-runbook.md).

Явной кодовой причины уводить staging frontend в отдельный bucket или отдельный runtime сейчас нет.

## 1. Собрать staging frontend

На staging VM в `/home/devis/tinychok`:

```bash
git fetch origin
git checkout codex/staging-deploy
git pull --ff-only origin codex/staging-deploy
npm ci
npm run build:frontend:staging
```

Эта команда собирает `dist/` с уже зафиксированными frontend URL:

- `VITE_API_BASE_URL=https://api.staging.tinychok.ru`
- `VITE_WS_BASE_URL=wss://api.staging.tinychok.ru`

## 2. Выложить статику

```bash
sudo mkdir -p /var/www/tinychok-staging
sudo rsync -av --delete dist/ /var/www/tinychok-staging/
sudo chown -R www-data:www-data /var/www/tinychok-staging
```

## 3. Подключить nginx для `staging.tinychok.ru`

Создать `/etc/nginx/sites-available/tinychok-staging-web`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name staging.tinychok.ru;

    root /var/www/tinychok-staging;
    index index.html;

    location /assets/ {
        try_files $uri =404;
        expires 1h;
        add_header Cache-Control "public, max-age=3600, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Включить site и перезагрузить `nginx`:

```bash
sudo ln -s /etc/nginx/sites-available/tinychok-staging-web /etc/nginx/sites-enabled/tinychok-staging-web
sudo nginx -t
sudo systemctl reload nginx
```

Если symlink уже существует, просто обновить конфиг и снова выполнить `nginx -t` и reload.

Для текущего staging поверх этого конфига уже используются:

- `basic auth` на user frontend;
- отдельный `basic auth` на `admin.staging.tinychok.ru`;
- после `rsync` нужно удалять `/var/www/tinychok-staging/svf`, чтобы `public/svf/` не оставался в web root.

## 4. Выпустить HTTPS

```bash
sudo certbot --nginx -d staging.tinychok.ru
```

После выпуска ещё раз проверить конфиг и reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Проверить UI и websocket

Быстрые HTTP-проверки:

```bash
curl -I http://staging.tinychok.ru
curl -I https://staging.tinychok.ru
curl -I https://staging.tinychok.ru/privacy-policy.html
curl -I https://staging.tinychok.ru/user-agreement.html
curl -I https://staging.tinychok.ru/premium-terms.html
curl -I https://staging.tinychok.ru/refund-policy.html
curl -I https://staging.tinychok.ru/contacts.html
```

Smoke-check websocket endpoint через staging API:

```bash
node --input-type=module <<'EOF'
const socket = new WebSocket('wss://api.staging.tinychok.ru/ws?token=invalid')
const timer = setTimeout(() => {
  console.error('websocket timeout')
  process.exit(1)
}, 5000)

socket.addEventListener('close', (event) => {
  clearTimeout(timer)
  console.log(`close:${event.code}:${event.reason}`)
  process.exit(event.code === 4002 ? 0 : 1)
})

socket.addEventListener('error', () => {
  clearTimeout(timer)
  console.error('websocket handshake failed')
  process.exit(1)
})
EOF
```

Ожидаемый результат: `close:4002:Unknown session`.

Проверка live bundle после rsync обязательна:

```bash
curl -s https://staging.tinychok.ru | rg -o 'assets/main-[^"]+\\.js'
```

Если VM уже на новом commit, а `https://staging.tinychok.ru` всё ещё отдаёт старый `assets/main-*.js`, frontend rollout не завершён: нужно повторить build/rsync на VM, а не считать выкладку успешной по одному `git pull`.

Финальная browser-проверка:

1. открыть `https://staging.tinychok.ru`;
2. убедиться, что UI загружается без mixed-content и CORS ошибок;
3. пройти auth flow с demo-кодом `1111`;
4. в DevTools Network подтвердить:
   - HTTP запросы уходят на `https://api.staging.tinychok.ru`;
   - websocket открывается на `wss://api.staging.tinychok.ru/ws?...`;
   - upgrade проходит с `101 Switching Protocols`.
