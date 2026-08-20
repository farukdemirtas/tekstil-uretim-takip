/**
 * Dikim — Tela Makinesi Isı Çubuğu Kontrolü
 * Referans: "TELA MAKİNASI ISI ÇUBUĞU KONTROL RAPORU" formu — Model · Tarih ·
 * İstenen Değerler (Isı/Basınç/Süre) · Ölçülen Değerler (Isı/Basınç/Süre) ·
 * Isı Çubuğu Uygulama Örneği (Sol/Orta/Sağ — fiziksel numune fotoğrafı)
 */

export type Pozisyon = "sol" | "orta" | "sag";

export const POZISYONLAR: { key: Pozisyon; label: string }[] = [
  { key: "sol", label: "Sol" },
  { key: "orta", label: "Orta" },
  { key: "sag", label: "Sağ" },
];

export type PozisyonOlcum = {
  istenenIsi: number | null;
  istenenBasinc: number | null;
  istenenSure: number | null;
  olculenIsi: number | null;
  olculenBasinc: number | null;
  olculenSure: number | null;
  /** Isı çubuğundan geçirilen numunenin fotoğrafı (base64 data URL) — fiziksel formda bu alana numune yapıştırılır */
  ornekFoto?: string | null;
};

export function emptyPozisyonOlcum(): PozisyonOlcum {
  return {
    istenenIsi: null,
    istenenBasinc: null,
    istenenSure: null,
    olculenIsi: null,
    olculenBasinc: null,
    olculenSure: null,
    ornekFoto: null,
  };
}

export type IsiCubuguEntry = {
  id: number;
  model: string;
  tarih: string;
  sol: PozisyonOlcum;
  orta: PozisyonOlcum;
  sag: PozisyonOlcum;
};

export function emptyEntry(id: number, tarih: string): IsiCubuguEntry {
  return { id, model: "", tarih, sol: emptyPozisyonOlcum(), orta: emptyPozisyonOlcum(), sag: emptyPozisyonOlcum() };
}

export type StoredIsiCubuguPayload = {
  entries: IsiCubuguEntry[];
};

export function isiCubuguStorageKey(year: number): string {
  return `dikim_isi_cubugu_v2_${year}`;
}

export const ISI_CUBUGU_STORAGE_PREFIX = "dikim_isi_cubugu_v2_";

function defaultIsiCubuguPayload(): StoredIsiCubuguPayload {
  return { entries: [] };
}

export function loadIsiCubuguPayload(year: number): StoredIsiCubuguPayload {
  try {
    const raw = window.localStorage.getItem(isiCubuguStorageKey(year));
    if (!raw) return defaultIsiCubuguPayload();
    const parsed = JSON.parse(raw) as Partial<StoredIsiCubuguPayload>;
    const base = defaultIsiCubuguPayload();
    return { entries: parsed.entries ?? base.entries };
  } catch {
    return defaultIsiCubuguPayload();
  }
}

export function persistIsiCubuguPayload(year: number, payload: StoredIsiCubuguPayload) {
  try {
    window.localStorage.setItem(isiCubuguStorageKey(year), JSON.stringify(payload));
  } catch {
    /* localStorage dolu/kapalı olabilir — sessiz geç */
  }
}
