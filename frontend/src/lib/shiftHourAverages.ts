import type { WorkerHourlyBreakdown } from "@/lib/api";
import { aggregateDisplaySlots, DISPLAY_SLOT_SHORT_LABELS } from "@/lib/displaySlotAggregation";

const z = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/**
 * Üretim ölçüm saatleri (DB: h0900 … h1830). Son dolu dilim → 09:00’den o ana kadar geçen sürede ortalama.
 */
const NINE_MEASUREMENT_SLOTS: {
  key: keyof WorkerHourlyBreakdown;
  startHour: number;
  label: string;
}[] = [
  { key: "h0900", startHour: 9, label: "09:00" },
  { key: "h1000", startHour: 10, label: "10:00" },
  { key: "h1115", startHour: 11.25, label: "11:15" },
  { key: "h1215", startHour: 12.25, label: "12:15" },
  { key: "h1300", startHour: 13, label: "13:00" },
  { key: "h1445", startHour: 14.75, label: "14:45" },
  { key: "h1545", startHour: 15.75, label: "15:45" },
  { key: "h1700", startHour: 17, label: "17:00" },
  { key: "h1830", startHour: 18.5, label: "18:30" },
];

/** Tümleşik 4 dilim (sadece h* yok, eski t* toplu kolon): son dolu gruba göre. */
const LEGACY_DISPLAY_SLOTS: {
  key: "t1000" | "t1300" | "t1600" | "t1830";
  startHour: number;
  label: string;
}[] = [
  { key: "t1000", startHour: 10, label: DISPLAY_SLOT_SHORT_LABELS[0] },
  { key: "t1300", startHour: 13, label: DISPLAY_SLOT_SHORT_LABELS[1] },
  { key: "t1600", startHour: 15.75, label: DISPLAY_SLOT_SHORT_LABELS[2] },
  { key: "t1830", startHour: 18.5, label: DISPLAY_SLOT_SHORT_LABELS[3] },
];

/** Vardiya / ölçüm penceresinin başlangıcı: ilk saat 09:00. */
export const SHIFT_DAY_START_HOUR = 9;
/** Varsayılan günlük bölme: 9 saat. */
export const SHIFT_NOMINAL_HOURS = 9;

function sumNineHours(h: WorkerHourlyBreakdown): number {
  return NINE_MEASUREMENT_SLOTS.reduce((s, { key }) => s + z(h[key]), 0);
}

function lastFromNine(h: WorkerHourlyBreakdown): { lastStartHour: number; lastLabel: string } | null {
  let last: { lastStartHour: number; lastLabel: string } | null = null;
  for (const s of NINE_MEASUREMENT_SLOTS) {
    if (z(h[s.key]) > 0) {
      last = { lastStartHour: s.startHour, lastLabel: s.label };
    }
  }
  return last;
}

/** Son adedi >0 olan kolonun 0-tabanlı indeksi (9 kolon = vardiya saatleri, her biri ~1 saat). */
function lastNonZeroIndexNine(h: WorkerHourlyBreakdown): number | null {
  let lastIdx: number | null = null;
  for (let i = 0; i < NINE_MEASUREMENT_SLOTS.length; i++) {
    if (z(h[NINE_MEASUREMENT_SLOTS[i].key]) > 0) lastIdx = i;
  }
  return lastIdx;
}

function lastFromLegacyAggregated(agg: ReturnType<typeof aggregateDisplaySlots>): {
  lastStartHour: number;
  lastLabel: string;
} | null {
  let last: { lastStartHour: number; lastLabel: string } | null = null;
  for (const s of LEGACY_DISPLAY_SLOTS) {
    if (z(agg[s.key]) > 0) {
      last = { lastStartHour: s.startHour, lastLabel: s.label };
    }
  }
  return last;
}

export type ShiftHourAverages = {
  perHourInWindow: number;
  perHourEightHourDay: number;
  windowHint: string;
};

/**
 * Tek günlük toplam + o güne ait saatlik dağılım:
 * - 9 ayrı kolon (h0900…h1830): her kolon ~1 saatlik üretim; saatlik ortalama = toplam ÷ (son dolu kolon sırası, 1…9).
 *   (Saat damgası farkına bölmek yanlış verim verir: örn. 3 kolonda 150+150+150 → 450÷3=150/saat, ÷2,25 saat değil.)
 * - Yoksa: eski t* 4 grupta saat damgasına kadar geçen süre (yedek).
 * - Nominal: toplam ÷ 9.
 */
export function computeShiftHourAverages(
  h: WorkerHourlyBreakdown,
  totalProduction: number
): ShiftHourAverages {
  if (totalProduction <= 0) {
    return { perHourInWindow: 0, perHourEightHourDay: 0, windowHint: "—" };
  }

  const nominalShiftAvg = Math.round(totalProduction / SHIFT_NOMINAL_HOURS);

  const hasGranular = sumNineHours(h) > 0;
  if (hasGranular) {
    const lastIdx = lastNonZeroIndexNine(h);
    const last = lastFromNine(h);
    if (lastIdx !== null && lastIdx >= 0 && last) {
      const effectiveHours = Math.max(lastIdx + 1, 1);
      const windowAvg = Math.round(totalProduction / effectiveHours);
      const windowHint = `${effectiveHours} dilim → ${last.lastLabel}`;
      return { perHourInWindow: windowAvg, perHourEightHourDay: nominalShiftAvg, windowHint };
    }
  }

  const last = lastFromLegacyAggregated(aggregateDisplaySlots(h));

  if (!last || !Number.isFinite(last.lastStartHour) || last.lastStartHour < SHIFT_DAY_START_HOUR) {
    return {
      perHourInWindow: nominalShiftAvg,
      perHourEightHourDay: nominalShiftAvg,
      windowHint: `${SHIFT_NOMINAL_HOURS} saat (nominal)`,
    };
  }

  const elapsedHours = Math.max(last.lastStartHour - SHIFT_DAY_START_HOUR, 0.25);
  const windowAvg = Math.round(totalProduction / elapsedHours);
  const windowHint = `09:00 → ${last.lastLabel}`;

  return { perHourInWindow: windowAvg, perHourEightHourDay: nominalShiftAvg, windowHint };
}
