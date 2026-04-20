/** Bölüm+Proses → dakikalık adet haritasını localStorage'da saklar.
 *  Anahtar formatı: "teamCode|processName"
 */

const STORAGE_KEY = "proses_dk_adet_v1";

export type ProsesMap = Record<string, string>; // key: "teamCode|processName"

export function makeProsesKey(teamCode: string, processName: string): string {
  return `${teamCode}|${processName}`;
}

export function getProsesMap(): ProsesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ProsesMap;
  } catch {
    return {};
  }
}

export function setProsesMap(map: ProsesMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function setProcessDk(teamCode: string, processName: string, dkAdet: string): void {
  const map = getProsesMap();
  const key = makeProsesKey(teamCode, processName);
  if (dkAdet === "" || Number(dkAdet) <= 0) {
    delete map[key];
  } else {
    map[key] = dkAdet;
  }
  setProsesMap(map);
}

/** Hem dk haritasını hem Proses Veri Sayfası satır listesini günceller */
export function setProcessDkAndSyncRows(teamCode: string, processName: string, dkAdet: string): void {
  setProcessDk(teamCode, processName, dkAdet);
  try {
    const raw = window.localStorage.getItem("proses_veri_rows_v1");
    if (!raw) return;
    const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return;
    const updated = rows.map((r) =>
      r["teamCode"] === teamCode && r["processName"] === processName
        ? { ...r, dkAdet }
        : r
    );
    window.localStorage.setItem("proses_veri_rows_v1", JSON.stringify(updated));
  } catch { /* quota / parse hatası */ }
}

export function calcFromDk(dkAdet: string) {
  const dk = Number(dkAdet);
  if (!dkAdet || isNaN(dk) || dk <= 0) return null;
  return {
    saatlik: Math.round(dk * 60 * 100) / 100,
    gunluk: Math.round(dk * 60 * 9 * 100) / 100,
  };
}
