#!/usr/bin/env bash
# VPS'te (root veya sudo) çalıştırın. Yalnızca üretim takip uygulaması dizinini ve
# PM2 süreçlerini (tekstil-api, tekstil-web) etkiler. Depo / diğer siteler silinmez.
#
# 1) Yedek + temizlik + (isteğe bağlı) yeniden clone:
#    export TEKSTIL_RESET_CONFIRM=yes
#    export TEKSTIL_REPO_URL='https://github.com/farukdemirtas/tekstil-uretim-takip.git'
#    sudo -E bash /var/www/uretim-takip/deploy/sunucu-proje-sifirla.sh
#
# 2) Sadece silmek (clone siz yaparsınız): TEKSTIL_REPO_URL vermeyin.
#
# Sonra: ortam dosyalarını kontrol edin, ./deploy/sunucu-kur.sh, pm2 start, nginx.
set -euo pipefail

APP_DIR="${TEKSTIL_APP_DIR:-/var/www/uretim-takip}"
BACKUP_ROOT="${TEKSTIL_BACKUP_ROOT:-/root}"

if [[ "${TEKSTIL_RESET_CONFIRM:-}" != "yes" ]]; then
  echo "Güvenlik: Bu işlem '$APP_DIR' dizinini siler."
  echo "Çalıştırmak için: export TEKSTIL_RESET_CONFIRM=yes"
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
BK="$BACKUP_ROOT/tekstil-reset-backup-$TS"
mkdir -p "$BK"

if [[ -d "$APP_DIR" ]]; then
  echo "==> Ortam dosyaları + veritabanı yedekleniyor → $BK"
  for f in backend/.env frontend/.env.production frontend/.env.local ecosystem.config.cjs; do
    if [[ -f "$APP_DIR/$f" ]]; then
      install -D "$APP_DIR/$f" "$BK/$f"
    fi
  done
  if [[ -f "$APP_DIR/backend/data/production.db" ]]; then
    install -D "$APP_DIR/backend/data/production.db" "$BK/backend-data/production.db"
    echo "    + backend/data/production.db"
  fi
else
  echo "Uyarı: '$APP_DIR' yok; yedek atlanıyor."
fi

if command -v pm2 >/dev/null 2>&1; then
  echo "==> PM2: tekstil-api, tekstil-web durduruluyor"
  pm2 delete tekstil-api 2>/dev/null || true
  pm2 delete tekstil-web 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi

echo "==> Dizin siliniyor: $APP_DIR"
rm -rf "$APP_DIR"

if [[ -n "${TEKSTIL_REPO_URL:-}" ]]; then
  echo "==> git clone → $APP_DIR"
  parent="$(dirname "$APP_DIR")"
  name="$(basename "$APP_DIR")"
  mkdir -p "$parent"
  git clone "$TEKSTIL_REPO_URL" "$APP_DIR"
  echo "==> Yedekten .env geri yükleniyor (varsa)"
  for f in backend/.env frontend/.env.production frontend/.env.local ecosystem.config.cjs; do
    if [[ -f "$BK/$f" ]]; then
      install -D "$BK/$f" "$APP_DIR/$f"
      echo "    geri: $f"
    fi
  done
  if [[ -f "$BK/backend-data/production.db" ]]; then
    mkdir -p "$APP_DIR/backend/data"
    install -D "$BK/backend-data/production.db" "$APP_DIR/backend/data/production.db"
    echo "    geri: backend/data/production.db (kullanıcılar + kayıtlar)"
  fi
else
  echo ""
  echo "Clone yapılmadı. Sonra:"
  echo "  cd $(dirname "$APP_DIR") && git clone <repo-url> $(basename "$APP_DIR")"
  echo "  Ortam: yedekten kopyalayın → $BK"
fi

echo ""
echo "Tamam. Sıradakiler:"
echo "  cd $APP_DIR"
echo "  # .env.production yoksa: cp frontend/.env.production.example frontend/.env.production"
echo "  chmod +x deploy/sunucu-kur.sh && ./deploy/sunucu-kur.sh"
echo "  pm2 start ecosystem.config.cjs && pm2 save"
echo "  Nginx: deploy/nginx-yesilimajtekstil.conf ve deploy/nginx-tekstil.conf → sites-available (deploy/VPS-KURULUM.md)"
