/**
 * Eski dört “10:00 / 13:00 / 16:00 / 18:30” görünümü: legacy t* + yeni h* birlikte
 * şu gruplarda toplanır (analiz, ekran3, karşılaştırma vb.).
 */
export type HourlyRawLike = {
  t1000: number;
  t1300: number;
  t1600: number;
  t1830: number;
  h0900?: number;
  h1000?: number;
  h1115?: number;
  h1215?: number;
  h1300?: number;
  h1445?: number;
  h1545?: number;
  h1700?: number;
  h1830?: number;
};

/** Görünür dört dilim (api WorkerHourlyBreakdown anahtarlarıyla uyumlu) */
export type DisplayHourlyBreakdown = {
  t1000: number;
  t1300: number;
  t1600: number;
  t1830: number;
};

const z = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

/** 09+10 | 11:15+12:15+13 | 14:45+15:45 | 17+18:30 (+ ilgili legacy t*) */
export function aggregateDisplaySlots(raw: HourlyRawLike): DisplayHourlyBreakdown {
  return {
    t1000: z(raw.t1000) + z(raw.h0900) + z(raw.h1000),
    t1300: z(raw.t1300) + z(raw.h1115) + z(raw.h1215) + z(raw.h1300),
    t1600: z(raw.t1600) + z(raw.h1445) + z(raw.h1545),
    t1830: z(raw.t1830) + z(raw.h1700) + z(raw.h1830),
  };
}

/** Kısa etiket (filtre düğmeleri) */
export const DISPLAY_SLOT_FILTER_LABELS: readonly string[] = [
  "09+10",
  "11–13",
  "14–15",
  "17+18",
];

/** Ekran3 ve vardiya ipucu: görünür tek saat (toplama formülü ayrı) */
export const DISPLAY_SLOT_SHORT_LABELS = ["10:00", "13:00", "16:00", "18:30"] as const;

/** Grafik / kart başlığı */
export const DISPLAY_SLOT_CHART_LABELS: readonly string[] = [
  "09:00 + 10:00",
  "11:15 + 12:15 + 13:00",
  "14:45 + 15:45",
  "17:00 + 18:30",
];

/** Saat filtresi (HourFilter) için açıklama — PDF / özet */
export function displaySlotLabelForHourFilter(
  hour: "" | "t1000" | "t1300" | "t1600" | "t1830"
): string {
  if (hour === "t1000") return DISPLAY_SLOT_CHART_LABELS[0];
  if (hour === "t1300") return DISPLAY_SLOT_CHART_LABELS[1];
  if (hour === "t1600") return DISPLAY_SLOT_CHART_LABELS[2];
  if (hour === "t1830") return DISPLAY_SLOT_CHART_LABELS[3];
  return "Tüm saatler";
}
