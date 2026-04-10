# VPS kurulumu — takip.yesilimajtekstil.com

Ben (Cursor) sizin sunucunuza bağlanamam; DNS ve panel işleri sizde. Aşağıdaki adımları **SSH ile VPS’te** uygulayın.

**Üretim klasörü:** `/var/www/uretim-takip`  
**Depo:** [github.com/farukdemirtas/tekstil-uretim-takip](https://github.com/farukdemirtas/tekstil-uretim-takip)

## DNS (Natro / alan adı paneli)

**A kaydı:** `takip` → VPS sunucunuzun **IPv4** adresi  
(Yayılma birkaç dakika sürebilir.)

## Sıfırdan temiz kurulum (sunucudaki proje karıştıysa)

**Kapsam:** Yalnızca `/var/www/uretim-takip` ve PM2’deki `tekstil-api` / `tekstil-web` silinir; depo veya başka siteler dokunulmaz.

1. **Hâlâ erişebiliyorsanız** (repo dizininde betik varsa):

```bash
export TEKSTIL_RESET_CONFIRM=yes
export TEKSTIL_REPO_URL='https://github.com/farukdemirtas/tekstil-uretim-takip.git'
sudo -E bash /var/www/uretim-takip/deploy/sunucu-proje-sifirla.sh
```

`TEKSTIL_REPO_URL` vermezseniz sadece yedek + silme yapılır; sonra elle `git clone` edersiniz. Yedekler `/root/tekstil-reset-backup-...` altına alınır (`backend/.env`, `frontend/.env.production`, vb.).

2. **Dizin zaten silindiyse / betik yoksa:** `/root` altındaki son `tekstil-reset-backup-*` klasörüne bakın; ardından aşağıdaki “1) Projeyi sunucuya alın” ile devam edin ve `.env` dosyalarını yedekten kopyalayın.

3. **Nginx:** Bozuk site dosyalarını repodaki hazır dosyalarla değiştirin (yapıştırma yerine `cp` kullanın):

```bash
sudo cp /var/www/uretim-takip/deploy/nginx-yesilimajtekstil.conf /etc/nginx/sites-available/yesilimajtekstil
sudo cp /var/www/uretim-takip/deploy/nginx-tekstil.conf /etc/nginx/sites-available/tekstil
sudo ln -sf /etc/nginx/sites-available/yesilimajtekstil /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/tekstil /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

SSL için domain’lere göre `certbot --nginx` ile yenileyin.

## 1) Projeyi sunucuya alın

```bash
cd /var/www
git clone https://github.com/farukdemirtas/tekstil-uretim-takip.git uretim-takip
cd uretim-takip
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
cd /var/www/uretim-takip
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

## Kod güncellemesi (git pull)

```bash
cd /var/www/uretim-takip
chmod +x deploy/sunucu-guncelle.sh
./deploy/sunucu-guncelle.sh
```

Betik `backend/data/production.db` dosyasını pull öncesi zaman damgalı `.pre-pull-...` ile yedekler, sonra `git pull`, `npm run prod:prepare` ve `pm2 reload` yapar.

## Kontrol

- `curl -s http://127.0.0.1:4000/api/health`
- Tarayıcı: **https://takip.yesilimajtekstil.com**
- PM2 loglarında hangi SQLite dosyasının açıldığını görmek için: `pm2 logs tekstil-api` — satır: `[tekstil-db] SQLite: ...`

## Veritabanı

Tek SQLite dosyasında kullanıcılar, loglar, üretim ve personel verisi tutulur. `ecosystem.config.cjs` içinde `TEKSTIL_DB_PATH`, depo köküne göre `backend/data/production.db` olarak ayarlıdır; sunucu dizini `/var/www/uretim-takip` ise dosya **`/var/www/uretim-takip/backend/data/production.db`** olur.

İsterseniz veriyi repodan ayırmak için `/var/lib/tekstil-uretim/production.db` kullanın: dosyayı kopyalayıp `ecosystem.config.cjs` içinde `TEKSTIL_DB_PATH` değerini bu tam yola değiştirin (`path.join` yerine `"/var/lib/tekstil-uretim/production.db"`). `TEKSTIL_DB_PATH` tanımlıyken uygulama yalnızca bu yolu kullanır.

```bash
sudo mkdir -p /var/lib/tekstil-uretim
sudo chown "$USER":"$USER" /var/lib/tekstil-uretim
cp -a /var/www/uretim-takip/backend/data/production.db /var/lib/tekstil-uretim/production.db
# ecosystem: TEKSTIL_DB_PATH → "/var/lib/tekstil-uretim/production.db"  sonra: pm2 reload ecosystem.config.cjs --update-env
```

`TEKSTIL_DB_PATH` kaldırılırsa (önerilmez): üretimde `/var/lib/tekstil-uretim/production.db` dosyası varsa ve yazılabilirse otomatik seçilir; yoksa `backend/data/production.db` kullanılır.

Farklı bir kurulum dizini için: `export TEKSTIL_APP_DIR=/yol` ile `sunucu-proje-sifirla.sh` ve `sunucu-guncelle.sh` kullanılabilir.
