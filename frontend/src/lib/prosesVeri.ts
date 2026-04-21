/** Bölüm+Proses → dakikalık adet haritasını localStorage'da saklar.
 *  v2: Her ürün modeli için ayrı veri seti destekler.
 */

/* ── Storage anahtar sabitleri ───────────────────────────── */
const DK_KEY_V1      = "proses_dk_adet_v1";    // eski global anahtar (geriye dönük)
const ROWS_KEY_V1    = "proses_veri_rows_v1";   // eski global satırlar
const MODEL_LIST_KEY = "proses_model_list_v1";  // kayıtlı model adları

/* ── Tipler ──────────────────────────────────────────────── */
export type ProsesMap = Record<string, string>; // key: "teamCode|processName"

/* ── Yardımcı key fonksiyonları ──────────────────────────── */
export function makeProsesKey(teamCode: string, processName: string): string {
  return `${teamCode}|${processName}`;
}

export function dkKeyForModel(modelKey: string): string {
  return `proses_dk_v2_${modelKey}`;
}

export function rowsKeyForModel(modelKey: string): string {
  return `proses_rows_v2_${modelKey}`;
}

/** Verilen modele ait dk storage anahtarını döner; model yoksa eski v1 anahtarı */
export function resolveDkKey(modelKey?: string | null): string {
  return modelKey ? dkKeyForModel(modelKey) : DK_KEY_V1;
}

/** Verilen modele ait rows storage anahtarını döner; model yoksa eski v1 anahtarı */
export function resolveRowsKey(modelKey?: string | null): string {
  return modelKey ? rowsKeyForModel(modelKey) : ROWS_KEY_V1;
}

/* ── Model listesi yönetimi ──────────────────────────────── */
export function getModelList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MODEL_LIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch { return []; }
}

export function saveModelList(list: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODEL_LIST_KEY, JSON.stringify(list));
}

export function addModelToList(modelName: string): string[] {
  const list = getModelList();
  if (list.includes(modelName)) return list;
  const next = [...list, modelName];
  saveModelList(next);
  return next;
}

export function removeModelFromList(modelName: string): string[] {
  const next = getModelList().filter((m) => m !== modelName);
  saveModelList(next);
  return next;
}

/* ── V1 → ilk model otomatik geçiş ──────────────────────── */
/**
 * Eski v1 verisi varken henüz model listesi oluşturulmamışsa,
 * verileri "Varsayılan" modeli altına taşır (bir kerelik).
 * Veri sayfası mount sırasında çağrılmalı.
 */
export function migrateV1IfNeeded(): string | null {
  if (typeof window === "undefined") return null;
  const models = getModelList();
  if (models.length > 0) return null; // zaten geçiş yapılmış

  const v1Rows = window.localStorage.getItem(ROWS_KEY_V1);
  const v1Dk   = window.localStorage.getItem(DK_KEY_V1);
  if (!v1Rows && !v1Dk) return null; // eski veri yok, geçiş gerekmez

  const name = "Varsayılan";
  if (v1Rows) window.localStorage.setItem(rowsKeyForModel(name), v1Rows);
  if (v1Dk)   window.localStorage.setItem(dkKeyForModel(name), v1Dk);
  saveModelList([name]);
  return name;
}

/* ── ProsesMap okuma / yazma ─────────────────────────────── */
export function getProsesMap(modelKey?: string | null): ProsesMap {
  if (typeof window === "undefined") return {};
  try {
    const key = resolveDkKey(modelKey);
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ProsesMap;
  } catch {
    return {};
  }
}

export function setProsesMap(map: ProsesMap, modelKey?: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(resolveDkKey(modelKey), JSON.stringify(map));
}

/* ── Hem dk hem rows güncelle (ProductionTable modalından) ── */
export function setProcessDkAndSyncRows(
  teamCode: string,
  processName: string,
  dkAdet: string,
  modelKey?: string | null,
  /** localStorage’da satır yokken ilk satırı oluşturmak için (bölüm etiketi) */
  teamLabelForNewRow?: string,
): void {
  // dk haritasını güncelle
  const map = getProsesMap(modelKey);
  const k   = makeProsesKey(teamCode, processName);
  if (!dkAdet || Number(dkAdet) <= 0) delete map[k];
  else map[k] = dkAdet;
  setProsesMap(map, modelKey);

  // Veri sayfası satırlarını güncelle
  const rowsKey = resolveRowsKey(modelKey);
  try {
    const raw = window.localStorage.getItem(rowsKey);
    if (!raw) {
      if (!dkAdet || Number(dkAdet) <= 0) return;
      const row = {
        id: Date.now(),
        teamCode,
        teamLabel: teamLabelForNewRow ?? teamCode,
        processName,
        dkAdet,
      };
      window.localStorage.setItem(rowsKey, JSON.stringify([row]));
      return;
    }
    const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return;
    const updated = rows.map((r) =>
      r["teamCode"] === teamCode && r["processName"] === processName
        ? { ...r, dkAdet }
        : r
    );
    window.localStorage.setItem(rowsKey, JSON.stringify(updated));
  } catch { /* quota / parse hatası */ }
}

/** Sunucuya PUT için satırlar (ProductionTable kaydı sonrası) */
export function getStoredRowsForServerSave(modelKey?: string | null): Array<{
  teamCode: string;
  teamLabel: string;
  processName: string;
  dkAdet: string;
}> {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(resolveRowsKey(modelKey));
    if (!raw) return [];
    const rows = JSON.parse(raw) as Array<{
      teamCode: string;
      teamLabel?: string;
      processName: string;
      dkAdet: string;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      teamCode: r.teamCode,
      teamLabel: r.teamLabel ?? r.teamCode,
      processName: r.processName,
      dkAdet: String(r.dkAdet ?? ""),
    }));
  } catch {
    return [];
  }
}

/** Sunucudan gelen satırlarla tarayıcı önbelleğini güncelle (tüm kullanıcılar aynı veriyi görsün) */
export function replaceLocalProsesCacheFromServerRows(
  modelKey: string,
  rows: Array<{ id: number; teamCode: string; teamLabel: string; processName: string; dkAdet: string }>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(rowsKeyForModel(modelKey), JSON.stringify(rows));
    const map: ProsesMap = {};
    for (const r of rows) {
      if (r.dkAdet && Number(r.dkAdet) > 0) {
        map[makeProsesKey(r.teamCode, r.processName)] = String(r.dkAdet);
      }
    }
    setProsesMap(map, modelKey);
  } catch {
    /* quota */
  }
}

/* ── Hesaplama yardımcısı ────────────────────────────────── */
export function calcFromDk(dkAdet: string) {
  const dk = Number(dkAdet);
  if (!dkAdet || isNaN(dk) || dk <= 0) return null;
  return {
    saatlik: Math.round(dk * 60 * 100) / 100,
    gunluk:  Math.round(dk * 60 * 9 * 100) / 100,
  };
}
