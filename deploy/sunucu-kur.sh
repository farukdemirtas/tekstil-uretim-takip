#!/usr/bin/env bash
# VPS'te (Ubuntu): depo kökünde — bash deploy/sunucu-kur.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f frontend/.env.production ]]; then
  echo "Hata: frontend/.env.production yok."
  echo "  cp frontend/.env.production.example frontend/.env.production"
  echo "  nano frontend/.env.production   # örnek: https://takip.yesilimajtekstil.com/api"
  exit 1
fi

echo "==> backend/data"
mkdir -p backend/data

echo "==> npm bağımlılıkları + frontend build"
npm run prod:prepare

echo ""
echo "Tamam. Sonraki adımlar:"
echo "  • ecosystem.config.cjs → APP_PASSWORD / APP_TOKEN_SECRET"
echo "  • pm2 start $ROOT/ecosystem.config.cjs && pm2 save && pm2 startup"
echo "  • Nginx: deploy/nginx-subdomain.conf.example → /etc/nginx/sites-available/ (detay: deploy/VPS-KURULUM.md)"
echo ""
