# VPS kurulumu — takip.yesilimajtekstil.com

Ben (Cursor) sizin sunucunuza bağlanamam; DNS ve panel işleri sizde. Aşağıdaki adımları **SSH ile VPS’te** uygulayın.

## DNS (Natro / alan adı paneli)

**A kaydı:** `takip` → VPS sunucunuzun **IPv4** adresi  
(Yayılma birkaç dakika sürebilir.)

## Sıfırdan temiz kurulum (sunucudaki proje karıştıysa)

**Kapsam:** Yalnızca `/var/www/tekstil-uretim-takip` ve PM2’deki `tekstil-api` / `tekstil-web` silinir; depo veya başka siteler dokunulmaz.

1. **Hâlâ erişebiliyorsanız** (repo dizininde betik varsa):

```bash
export TEKSTIL_RESET_CONFIRM=yes
export TEKSTIL_REPO_URL='https://github.com/KULLANICI/tekstil-uretim-takip.git'
sudo -E bash /var/www/tekstil-uretim-takip/deploy/sunucu-proje-sifirla.sh
```

`TEKSTIL_REPO_URL` vermezseniz sadece yedek + silme yapılır; sonra elle `git clone` edersiniz. Yedekler `/root/tekstil-reset-backup-...` altına alınır (`backend/.env`, `frontend/.env.production`, vb.).

2. **Dizin zaten silindiyse / betik yoksa:** `/root` altındaki son `tekstil-reset-backup-*` klasörüne bakın; ardından aşağıdaki “1) Projeyi sunucuya alın” ile devam edin ve `.env` dosyalarını yedekten kopyalayın.

3. **Nginx:** Bozuk site dosyalarını repodaki hazır dosyalarla değiştirin (yapıştırma yerine `cp` kullanın):

```bash
sudo cp /var/www/tekstil-uretim-takip/deploy/nginx-yesilimajtekstil.conf /etc/nginx/sites-available/yesilimajtekstil
sudo cp /var/www/tekstil-uretim-takip/deploy/nginx-tekstil.conf /etc/nginx/sites-available/tekstil
sudo ln -sf /etc/nginx/sites-available/yesilimajtekstil /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/tekstil /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

SSL için domain’lere göre `certbot --nginx` ile yenileyin.

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

## Veritabanı ve güncelleme (kullanıcıların silinmemesi)

Tek SQLite dosyasında tutulur: **kullanıcılar**, **activity_logs**, **çalışılacak ürün** (`daily_product_meta`), üretim ve personel verisi. Uygulama bu tabloları güncellemede silmez; veri kaybı genelde **yanlış veya yeni boş .db dosyasına** bağlanmaktan olur.

Varsayılan geliştirme: `backend/data/production.db`.

**Üretim (`NODE_ENV=production`):**

1. Açık ortam değişkeni yoksa ve `/var/lib/tekstil-uretim/production.db` **dosyası varsa**, backend otomatik bu dosyayı kullanır (repodan bağımsız).
2. Yoksa `backend/data/production.db` kullanılır (`git pull` tek başına bu dosyayı silmez; `git clean -fdx` veya klasörü silmek risklidir).

**Önerilen:** Kalıcı dizini bir kez oluşturup mevcut veritabanını kopyalayın:

```bash
sudo mkdir -p /var/lib/tekstil-uretim
sudo chown "$USER":"$USER" /var/lib/tekstil-uretim
cp -a /var/www/tekstil-uretim-takip/backend/data/production.db /var/lib/tekstil-uretim/production.db
```

İsterseniz `ecosystem.config.cjs` (`tekstil-api`) veya `backend/.env` ile sabitleyin:

- `SQLITE_DATABASE_PATH=/var/lib/tekstil-uretim/production.db`  
  **veya** `TEKSTIL_DATA_DIR=/var/lib/tekstil-uretim`

Sonra: `pm2 restart tekstil-api --update-env`.

PM2 loglarında açılışta `[tekstil-db] SQLite: ...` satırı hangi dosyanın kullanıldığını gösterir.

`deploy/sunucu-guncelle.sh` git pull öncesi **bulabildiği tüm** olası `production.db` konumlarını zaman damgalı `.bak` ile yedekler; pull sonrası dosya kaybolmuşsa son yedeği geri yüklemeyi dener (`backend/.env` içindeki `SQLITE_DATABASE_PATH` / `TEKSTIL_DATA_DIR` dahil).
