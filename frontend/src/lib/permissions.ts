import type { AppPermissions } from "./types";

const STORAGE_PERMS = "auth_permissions";

export const PERMISSION_ROWS: { key: keyof AppPermissions; label: string; description: string }[] = [
  { key: "analysis", label: "Analiz", description: "Analiz grafikleri ve rapor API’leri" },
  { key: "karsilastirma", label: "Karşılaştırma", description: "İki işçi karşılaştırma ekranı" },
  { key: "ayarlar", label: "Ayarlar", description: "İsim havuzu (ekle / düzenle / sil)" },
  { key: "hedefTakip", label: "Hedef takip", description: "Hedef takip ekranı" },
  { key: "ekran1", label: "EKRAN1", description: "Hedef takip TV / tam ekran görünümü" },
  { key: "ekran2", label: "EKRAN2", description: "Aşama analiz panosu (TV)" },
];

export function isAdminRole(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("auth_role") === "admin";
}

export function readStoredPermissions(): AppPermissions | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PERMS);
    if (!raw) return null;
    const p = JSON.parse(raw) as AppPermissions;
    if (!p || typeof p !== "object") return null;
    return p;
  } catch {
    return null;
  }
}

export function hasPermission(key: keyof AppPermissions): boolean {
  if (typeof window === "undefined") return false;
  if (isAdminRole()) return true;
  const p = readStoredPermissions();
  if (!p) return false;
  return Boolean(p[key]);
}

export function persistPermissions(perms: AppPermissions | undefined) {
  if (typeof window === "undefined") return;
  if (!perms) {
    window.localStorage.removeItem(STORAGE_PERMS);
    return;
  }
  window.localStorage.setItem(STORAGE_PERMS, JSON.stringify(perms));
}

export function clearStoredPermissions() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_PERMS);
}
