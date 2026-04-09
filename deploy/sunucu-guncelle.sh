#!/usr/bin/env bash
# VPS'te depo kökünde: bash deploy/sunucu-guncelle.sh
# git pull + bağımlılık + frontend build + PM2 yeniden başlatma
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f frontend/.env.production ]]; then
  echo "Hata: frontend/.env.production yok. Önce sunucu-kur.sh veya .env.production oluşturun."
  exit 1
fi

echo "==> git pull"
git pull

echo "==> npm + frontend build (Next.js .next yenilenir)"
npm run prod:prepare

echo "==> PM2"
if pm2 describe tekstil-web >/dev/null 2>&1; then
  pm2 restart tekstil-api tekstil-web
else
  echo "Uyarı: tekstil-web PM2'de yok. İlk kurulum: pm2 start $ROOT/ecosystem.config.cjs"
  exit 1
fi

echo "Tamam. Tarayıcıda Ctrl+F5 veya gizli pencere ile deneyin."
