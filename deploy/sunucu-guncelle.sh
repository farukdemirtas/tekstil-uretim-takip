#!/usr/bin/env bash
# VPS: depo güncellemesi — /var/www/uretim-takip (veya TEKSTIL_APP_DIR)
# Kullanım: cd /var/www/uretim-takip && bash deploy/sunucu-guncelle.sh
#
# Not: Kullanıcılar, activity log ve üretim verisi tek SQLite dosyasındadır.
# git pull bu dosyayı silmez (.gitignore). Asla bu dizinde `git clean -fdx` çalıştırmayın
# (ignored dosyaları da siler, veritabanını yok eder).
set -euo pipefail

APP_DIR="${TEKSTIL_APP_DIR:-/var/www/uretim-takip}"
cd "$APP_DIR"

if [[ ! -f frontend/.env.production ]]; then
  echo "Hata: frontend/.env.production yok."
  echo "  cp frontend/.env.production.example frontend/.env.production"
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
# ecosystem.config.cjs ile aynı varsayılan; özelleştirdiyseniz: export TEKSTIL_DB_PATH=/tam/yol/production.db
DB="${TEKSTIL_DB_PATH:-$APP_DIR/backend/data/production.db}"
if [[ "$DB" != /* ]]; then
  DB="$APP_DIR/$DB"
fi

LAST_BACKUP=""
if [[ -f "$DB" ]]; then
  LAST_BACKUP="${DB}.pre-pull-${TS}"
  cp -a "$DB" "$LAST_BACKUP"
  echo "==> DB yedek: $LAST_BACKUP"
fi

echo "==> git pull"
git pull

if [[ -n "$LAST_BACKUP" ]] && [[ ! -f "$DB" ]]; then
  echo "!!! UYARI: Pull sonrası veritabanı dosyası yoktu; son yedek geri yükleniyor."
  mkdir -p "$(dirname "$DB")"
  cp -a "$LAST_BACKUP" "$DB"
fi

echo "==> bağımlılık + frontend build"
npm run prod:prepare

echo "==> PM2"
if pm2 describe tekstil-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "Tamam."
