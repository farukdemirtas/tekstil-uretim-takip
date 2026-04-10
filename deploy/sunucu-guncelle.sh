#!/usr/bin/env bash
# VPS: depo güncellemesi — /var/www/uretim-takip (veya TEKSTIL_APP_DIR)
# Kullanım: cd /var/www/uretim-takip && bash deploy/sunucu-guncelle.sh
set -euo pipefail

APP_DIR="${TEKSTIL_APP_DIR:-/var/www/uretim-takip}"
cd "$APP_DIR"

if [[ ! -f frontend/.env.production ]]; then
  echo "Hata: frontend/.env.production yok."
  echo "  cp frontend/.env.production.example frontend/.env.production"
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
DB="backend/data/production.db"
if [[ -f "$DB" ]]; then
  cp -a "$DB" "${DB}.pre-pull-${TS}"
  echo "==> DB yedek: ${DB}.pre-pull-${TS}"
fi

echo "==> git pull"
git pull

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
