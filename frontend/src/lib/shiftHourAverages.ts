import type { WorkerHourlyBreakdown } from "@/lib/api";
import { DISPLAY_SLOT_SHORT_LABELS } from "@/lib/displaySlotAggregation";

const SLOT_KEYS = [
  { key: "t1000" as const, label: DISPLAY_SLOT_SHORT_LABELS[0] },
  { key: "t1300" as const, label: DISPLAY_SLOT_SHORT_LABELS[1] },
  { key: "t1600" as const, label: DISPLAY_SLOT_SHORT_LABELS[2] },
  { key: "t1830" as const, label: DISPLAY_SLOT_SHORT_LABELS[3] },
];

/** Vardiya başlangıcı (saat). */
export const SHIFT_DAY_START_HOUR = 8;
/** Günlük ortalama kutusu paydası (ör. 900 ÷ 9 = 100). */
export const SHIFT_NOMINAL_HOURS = 9;

/** Grubun “son üretim” zamanı (ondalık saat) — vardiya penceresi ipucu için. */
const SLOT_START_HOUR: Record<(typeof SLOT_KEYS)[number]["key"], number> = {
  t1000: 10,
  t1300: 13,
  t1600: 15.75,
  t1830: 18.5,
};

export type ShiftHourAverages = {
  perHourInWindow: number;
  perHourEightHourDay: number;
  windowHint: string;
};

/**
 * Tek günlük (veya aynı günün toplamı + o güne ait saatlik dağılım) için:
 * - Ortalama/saat: 08:00 ile son dolu dilim başlangıcı arası süreye bölünür.
 * - Günlük ortalama: toplam ÷ 9 saat.
 */
export function computeShiftHourAverages(
  h: WorkerHourlyBreakdown,
  totalProduction: number
): ShiftHourAverages {
  let lastStartHour = -Infinity;
  let lastSlotLabel = "—";
  for (const s of SLOT_KEYS) {
    if (h[s.key] > 0) {
      const start = SLOT_START_HOUR[s.key];
      if (start > lastStartHour) {
        lastStartHour = start;
        lastSlotLabel = s.label;
      }
    }
  }

  if (totalProduction <= 0) {
    return { perHourInWindow: 0, perHourEightHourDay: 0, windowHint: "—" };
  }

  const nominalShiftAvg = Math.round(totalProduction / SHIFT_NOMINAL_HOURS);

  if (!Number.isFinite(lastStartHour) || lastStartHour < SHIFT_DAY_START_HOUR) {
    return {
      perHourInWindow: nominalShiftAvg,
      perHourEightHourDay: nominalShiftAvg,
      windowHint: `${SHIFT_NOMINAL_HOURS} saatlik süre`,
    };
  }

  const elapsedHours = Math.max(lastStartHour - SHIFT_DAY_START_HOUR, 0.25);
  const windowAvg = Math.round(totalProduction / elapsedHours);
  const windowHint = `08:00 → ${lastSlotLabel}`;

  return { perHourInWindow: windowAvg, perHourEightHourDay: nominalShiftAvg, windowHint };
}
