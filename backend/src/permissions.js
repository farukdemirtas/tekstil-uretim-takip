/** Veri girişi kullanıcıları için varsayılanlar (köprü: eskiden bu ekranlar giriş yapan herkese açıktı) */
export const DEFAULT_DATA_ENTRY_PERMISSIONS = {
  analysis: false,
  karsilastirma: true,
  ayarlar: false,
  hedefTakip: true,
  ekran1: true,
  ekran2: false,
  ekran3: false,
  loglar: false,
  /** Ana sayfada “tüm personeli listeden kaldır” (gün / gün ve sonrası) */
  topluListeKaldir: false,
  /** Excel yapıştırma ile toplu üretim kaydı (POST /api/production/bulk) */
  topluEkle: false,
};

export const PERMISSION_KEYS = Object.keys(DEFAULT_DATA_ENTRY_PERMISSIONS);

function allTruePermissions() {
  const o = {};
  for (const k of PERMISSION_KEYS) o[k] = true;
  return o;
}

/** DB JSON + rol → API ve JWT’de kullanılacak etkin yetkiler */
export function normalizePermissions(rawJson, role) {
  if (role === "admin") {
    return allTruePermissions();
  }
  let parsed = {};
  try {
    parsed = JSON.parse(rawJson || "{}");
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};
  } catch {
    parsed = {};
  }
  const out = { ...DEFAULT_DATA_ENTRY_PERMISSIONS };
  for (const k of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parsed, k)) {
      out[k] = Boolean(parsed[k]);
    }
  }
  return out;
}

/** İstemciden gelen gövdeyi güvenli şekilde tam nesneye çevirir */
export function sanitizePermissionsInput(body) {
  const out = { ...DEFAULT_DATA_ENTRY_PERMISSIONS };
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  for (const k of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      out[k] = Boolean(body[k]);
    }
  }
  return out;
}

export function permissionsJsonForDb(perms) {
  return JSON.stringify(sanitizePermissionsInput(perms));
}

/** Mevcut yetkiler üzerine istemciden gelen anahtarları yazar (kısmi PATCH güvenli) */
export function mergePermissionsPatch(currentNormalized, body) {
  const out = { ...currentNormalized };
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  for (const k of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      out[k] = Boolean(body[k]);
    }
  }
  return out;
}
