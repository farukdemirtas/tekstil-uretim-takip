#!/usr/bin/env bash
# Sunucuda her güncelleme: depo kökünden çalıştırın (chmod gerekmez)
#   cd /var/www/uretim-takip && bash guncelle.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec bash "$ROOT/deploy/sunucu-guncelle.sh"
