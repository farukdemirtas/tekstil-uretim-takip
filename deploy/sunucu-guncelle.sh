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

TS="$(date +%Y%m%d-%H%M%S)"

backup_db_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  cp -a "$f" "${f}.bak.${TS}"
  echo "    → yedek: ${f}.bak.${TS}"
}

restore_db_if_missing() {
  local target="$1"
  [[ -f "$target" ]] && return 0
  local dir pattern latest
  dir="$(dirname "$target")"
  pattern="${target}.bak.*"
  shopt -s nullglob
  local backups=( $pattern )
  shopt -u nullglob
  [[ ${#backups[@]} -eq 0 ]] && return 0
  latest="$(printf '%s\n' "${backups[@]}" | sort -r | head -1)"
  echo "UYARI: $(basename "$target") yoktu; son yedek geri yükleniyor: $latest"
  mkdir -p "$dir"
  cp -a "$latest" "$target"
}

echo "==> Veritabanı yedeği (git pull öncesi — kullanıcılar, loglar, çalışılacak ürün aynı .db içinde)"
backup_db_file "$ROOT/backend/data/production.db"
backup_db_file "/var/lib/tekstil-uretim/production.db"
if [[ -f "$ROOT/backend/.env" ]]; then
  _sqlite="$(grep -E '^[[:space:]]*SQLITE_DATABASE_PATH=' "$ROOT/backend/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
  _datadir="$(grep -E '^[[:space:]]*TEKSTIL_DATA_DIR=' "$ROOT/backend/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
  [[ -n "${_sqlite// }" ]] && backup_db_file "$_sqlite"
  [[ -n "${_datadir// }" ]] && backup_db_file "${_datadir%/}/production.db"
fi

echo "==> git pull"
git pull

restore_db_if_missing "$ROOT/backend/data/production.db"
restore_db_if_missing "/var/lib/tekstil-uretim/production.db"
if [[ -f "$ROOT/backend/.env" ]]; then
  _sqlite="$(grep -E '^[[:space:]]*SQLITE_DATABASE_PATH=' "$ROOT/backend/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
  _datadir="$(grep -E '^[[:space:]]*TEKSTIL_DATA_DIR=' "$ROOT/backend/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
  [[ -n "${_sqlite// }" ]] && restore_db_if_missing "$_sqlite"
  [[ -n "${_datadir// }" ]] && restore_db_if_missing "${_datadir%/}/production.db"
fi

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
