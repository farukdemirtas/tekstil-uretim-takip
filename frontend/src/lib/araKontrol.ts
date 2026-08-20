/** Ara Kontrol (hat içi / in-line kontrol) — Proses Kontrol / Ara Kontrol Hata Rapor sayfaları arasında paylaşılan sabitler ve yardımcılar */

/** Form No. FRM 002 — Ara Kontrol Uygunsuzluk Raporu */
export const FORM_NO = "FRM 002";

/** Formdaki hata tipleri (fiziksel forma göre — 22 sütun) */
export const DEFECT_TYPES: { key: string; label: string; short: string }[] = [
  { key: "kopukDikis", label: "Kopuk Dikiş", short: "Kopuk Dikiş" },
  { key: "atlama", label: "Atlama", short: "Atlama" },
  { key: "citlama", label: "Çıtlama", short: "Çıtlama" },
  { key: "dusukDikis", label: "Düşük Dikiş", short: "Düşük Dikiş" },
  { key: "dikisKarsilasmamis", label: "Dikiş Karşılaşmamış", short: "Karşılaşmamış" },
  { key: "egriDikis", label: "Eğri Dikiş", short: "Eğri Dikiş" },
  { key: "igneDeligiAcik", label: "İğne Deliği Açık (Parlak)", short: "İğne Deliği" },
  { key: "dikisBuzgu", label: "Dikiş Büzgü", short: "Büzgü" },
  { key: "makasKesigi", label: "Makas Kesiği", short: "Makas Kesiği" },
  { key: "dikisPilYapmis", label: "Dikiş Pil Yapmış", short: "Pil Yapmış" },
  { key: "kotuDikisTamiri", label: "Kötü Dikiş Tamiri", short: "Kötü Tamir" },
  { key: "puntorezUnutulmus", label: "Puntorez Unutulmuş", short: "Puntorez" },
  { key: "dikisUnutulmus", label: "Dikiş Unutulmuş", short: "Dikiş Unut." },
  { key: "simetrikEsitDegil", label: "Simetrik / Eşit Değil", short: "Simetrik" },
  { key: "yanlisDikisAdimAyari", label: "Yanlış Dikiş Adım Ayarı", short: "Adım Ayarı" },
  { key: "dikisteIgneIzi", label: "Dikişte İğne İzi", short: "İğne İzi" },
  { key: "etiketHatasi", label: "Etiket Hatası", short: "Etiket" },
  { key: "leke", label: "Leke", short: "Leke" },
  { key: "kotuIlik", label: "Kötü İlik", short: "Kötü İlik" },
  { key: "bitimIslemHatasi", label: "Bitim İşlem Hatası", short: "Bitim İşlem" },
  { key: "kesik", label: "Kesik", short: "Kesik" },
  { key: "diger", label: "Diğer (Nakış, Baskı, Aksesuar, vb)", short: "Diğer" },
];

/* ─── Tipler ─────────────────────────────────────────────── */
export type KontrolData = {
  kontrolEdilenAdet: number;
  kontrolTekrarSayisi: number;
  defects: Record<string, number>;
  note: string;
  /** Bu satırdaki proses kritik operasyon olarak işaretlendi mi? */
  kritikOperasyon?: boolean;
};

export type AraKontrolRow = {
  workerId: number; // üretim tablosundan gelen → pozitif; elle eklenen → negatif
  name: string;
  process: string;
  team: string;
  kontrolEdilenAdet: number;
  kontrolTekrarSayisi: number;
  defects: Record<string, number>;
  note: string;
  manual?: boolean; // elle eklendi mi?
  /** Bu satırdaki proses kritik operasyon olarak işaretlendi mi? */
  kritikOperasyon: boolean;
};

/** "auto" — ana ekrandaki üretim verisinden personel otomatik çekilir (proses kontrol gibi)
 *  "manual" — personel/proses elle, satır satır girilir (üretim/personel kaydına bağlı değil) */
export type AraKontrolMode = "auto" | "manual";

export type StoredAraKontrolPayload = {
  bantNo: string;
  articleNo: string;
  orderNo: string;
  kaliteKontrolMuduru: string;
  araKontrolcu: string;
  mode?: AraKontrolMode;
  kontrolData: Record<number, KontrolData>;
  extraWorkers: { workerId: number; name: string; process: string; team: string }[];
  /** Manuel modda elle eklenen serbest satırlar (personel kaydına bağlı değil) */
  freeRows?: { workerId: number; name: string; process: string }[];
  excludedIds?: number[]; // üretimden gelen ama listeden çıkarılan personeller
};

/* ─── localStorage ───────────────────────────────────────── */
export function araKontrolStorageKey(date: string): string {
  return `ara_kontrol_v2_${date}`;
}

export const ARA_KONTROL_STORAGE_PREFIX = "ara_kontrol_v2_";

export function emptyDefects(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const d of DEFECT_TYPES) o[d.key] = 0;
  return o;
}

export function emptyAraKontrolHeader() {
  return { bantNo: "", articleNo: "", orderNo: "", kaliteKontrolMuduru: "", araKontrolcu: "" };
}

function defaultAraKontrolPayload(): StoredAraKontrolPayload {
  return { ...emptyAraKontrolHeader(), mode: "auto", kontrolData: {}, extraWorkers: [], freeRows: [] };
}

export function loadAraKontrolPayload(date: string): StoredAraKontrolPayload {
  try {
    const raw = window.localStorage.getItem(araKontrolStorageKey(date));
    if (!raw) return defaultAraKontrolPayload();
    const parsed = JSON.parse(raw) as Partial<StoredAraKontrolPayload>;
    const base = defaultAraKontrolPayload();
    return {
      bantNo: parsed.bantNo ?? base.bantNo,
      articleNo: parsed.articleNo ?? base.articleNo,
      orderNo: parsed.orderNo ?? base.orderNo,
      kaliteKontrolMuduru: parsed.kaliteKontrolMuduru ?? base.kaliteKontrolMuduru,
      araKontrolcu: parsed.araKontrolcu ?? base.araKontrolcu,
      mode: parsed.mode ?? base.mode,
      kontrolData: parsed.kontrolData ?? base.kontrolData,
      extraWorkers: parsed.extraWorkers ?? base.extraWorkers,
      freeRows: parsed.freeRows ?? base.freeRows,
      excludedIds: parsed.excludedIds,
    };
  } catch {
    return defaultAraKontrolPayload();
  }
}

export function persistAraKontrolPayload(date: string, payload: StoredAraKontrolPayload) {
  try {
    window.localStorage.setItem(araKontrolStorageKey(date), JSON.stringify(payload));
  } catch {
    /* localStorage dolu/kapalı olabilir — sessiz geç */
  }
}

/* ─── Yardımcılar ────────────────────────────────────────── */
export function sumDefects(defects: Record<string, number>): number {
  return DEFECT_TYPES.reduce((acc, d) => acc + (defects[d.key] || 0), 0);
}

export function hataOrani(total: number, adet: number): string {
  return adet > 0 ? ((total / adet) * 100).toFixed(1) : "0.0";
}

export function pctColor(p: number): string {
  if (p === 0) return "text-emerald-600";
  if (p < 10) return "text-amber-600";
  return "text-red-600";
}

export function pctBg(p: number): string {
  if (p === 0) return "bg-emerald-500";
  if (p < 10) return "bg-amber-500";
  return "bg-red-500";
}
