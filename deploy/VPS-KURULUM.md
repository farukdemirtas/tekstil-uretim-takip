# VPS kurulumu — takip.yesilimajtekstil.com

Ben (Cursor) sizin sunucunuza bağlanamam; DNS ve panel işleri sizde. Aşağıdaki adımları **SSH ile VPS’te** uygulayın.

## DNS (Natro / alan adı paneli)

**A kaydı:** `takip` → VPS sunucunuzun **IPv4** adresi  
(Yayılma birkaç dakika sürebilir.)

## 1) Projeyi sunucuya alın

```bash
cd /var/www
git clone <repo-url> tekstil-uretim-takip
cd tekstil-uretim-takip
```

## 2) Ortam dosyası

```bash
cp frontend/.env.production.example frontend/.env.production
```

İçerik hazır olmalı:

```env
NEXT_PUBLIC_API_BASE_URL=https://takip.yesilimajtekstil.com/api
```

HTTPS kullanacaksanız yukarıdaki `https://` doğru; sadece HTTP ile test edecekseniz geçici olarak `http://takip.yesilimajtekstil.com/api` yapıp build sonrası HTTPS’e çevirip yeniden build alın.

## 3) Kurulum betiği

```bash
chmod +x deploy/sunucu-kur.sh
./deploy/sunucu-kur.sh
```

`.env.production`’ı sonradan değiştirdiyseniz:

```bash
cd frontend && npm run build && cd ..
```

## 4) Güvenlik (backend)

`ecosystem.config.cjs` içinde `tekstil-api` için `APP_PASSWORD`, `APP_TOKEN_SECRET` tanımlayın.

## 5) PM2

```bash
npm install -g pm2
cd /var/www/tekstil-uretim-takip
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 6) Nginx

```bash
sudo cp deploy/nginx-subdomain.conf.example /etc/nginx/sites-available/tekstil
sudo ln -sf /etc/nginx/sites-available/tekstil /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d takip.yesilimajtekstil.com
```

## Kontrol

- `curl -s http://127.0.0.1:4000/api/health`
- Tarayıcı: **https://takip.yesilimajtekstil.com**

Veritabanı: `backend/data/production.db`
