import { NEW_SLOT_DEFS } from "./productionSlots";

export const UTU_PAKET_STAGES = ["temizleme", "optik", "utu", "paketleme"] as const;
export type UtuPaketStage = (typeof UTU_PAKET_STAGES)[number];

export const UTU_PAKET_STAGE_META: Record<
  UtuPaketStage,
  { label: string; description: string; accent: string }
> = {
  temizleme: {
    label: "Temizleme",
    description: "Ön işlem ve temizleme adedi",
    accent: "sky",
  },
  optik: {
    label: "Optik",
    description: "Optik kontrol geçen adet",
    accent: "violet",
  },
  utu: {
    label: "Ütü",
    description: "Ütülenen adet",
    accent: "amber",
  },
  paketleme: {
    label: "Paketleme",
    description: "Paketlenen adet ve beden dağılımı",
    accent: "emerald",
  },
};

export const UTU_PAKET_SLOT_DEFS = NEW_SLOT_DEFS;

export type UtuPaketSlotKey = (typeof UTU_PAKET_SLOT_DEFS)[number]["key"];

export type UtuPaketSlots = Record<UtuPaketSlotKey, number>;

export const UTU_PAKET_SIZE_CODES = ["XS", "S", "M", "L", "XL"] as const;
export type UtuPaketSizeCode = (typeof UTU_PAKET_SIZE_CODES)[number];

export type UtuPaketTakipsanSnapshot = {
  packageCount: number;
  readCount: number;
  orderQuantity: number;
  orderCode: string;
  syncedAt: string | null;
};

export type TakipsanPackageRow = {
  packageNo: string;
  items: number;
  size: string;
  status: string;
};

export type TakipsanStatus = {
  configured: boolean;
  consignmentId: string | null;
  syncIntervalMs: number;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastReadCount: number | null;
  lastOrderQuantity: number | null;
  lastOrderCode: string | null;
  lastPackageCount: number | null;
  lastPackages: TakipsanPackageRow[];
};

export type UtuPaketDayPayload = {
  date: string;
  stages: Record<UtuPaketStage, UtuPaketSlots>;
  beden: Record<string, number>;
  /** TV bar hedefi — Takipsan sipariş sayısından gelir */
  packagingTarget: number;
  takipsan?: UtuPaketTakipsanSnapshot;
};

export function emptyUtuPaketSlots(): UtuPaketSlots {
  return Object.fromEntries(UTU_PAKET_SLOT_DEFS.map(({ key }) => [key, 0])) as UtuPaketSlots;
}

export function emptyUtuPaketStages(): Record<UtuPaketStage, UtuPaketSlots> {
  return Object.fromEntries(UTU_PAKET_STAGES.map((s) => [s, emptyUtuPaketSlots()])) as Record<
    UtuPaketStage,
    UtuPaketSlots
  >;
}

export function emptyUtuPaketBeden(): Record<UtuPaketSizeCode, number> {
  return Object.fromEntries(UTU_PAKET_SIZE_CODES.map((c) => [c, 0])) as Record<UtuPaketSizeCode, number>;
}

export function sumUtuPaketSlots(slots: UtuPaketSlots): number {
  return UTU_PAKET_SLOT_DEFS.reduce((s, { key }) => s + (Number(slots[key]) || 0), 0);
}

export type UtuPaketDailyAnalytics = {
  date: string;
  stages: Record<UtuPaketStage, number>;
  beden: Record<string, number>;
  pipelineMin: number;
};

export type UtuPaketAnalytics = {
  startDate: string;
  endDate: string;
  daysWithData: number;
  periodTotals: Record<UtuPaketStage, number>;
  bedenTotals: Record<string, number>;
  avgDailyByStage: Record<UtuPaketStage, number>;
  daily: UtuPaketDailyAnalytics[];
  slotTotalsByStage: Record<UtuPaketStage, Record<UtuPaketSlotKey, number>>;
};

export function normalizeUtuPaketPayload(raw: UtuPaketDayPayload): UtuPaketDayPayload {
  const stages = emptyUtuPaketStages();
  for (const st of UTU_PAKET_STAGES) {
    const src = raw.stages?.[st] ?? {};
    for (const { key } of UTU_PAKET_SLOT_DEFS) {
      stages[st][key] = Math.max(0, Math.floor(Number(src[key]) || 0));
    }
  }
  const beden = emptyUtuPaketBeden();
  for (const code of UTU_PAKET_SIZE_CODES) {
    beden[code] = Math.max(0, Math.floor(Number(raw.beden?.[code]) || 0));
  }
  for (const [k, v] of Object.entries(raw.beden || {})) {
    if (!UTU_PAKET_SIZE_CODES.includes(k as UtuPaketSizeCode) && v > 0) {
      (beden as Record<string, number>)[k] = Math.max(0, Math.floor(Number(v) || 0));
    }
  }
  return {
    date: raw.date,
    stages,
    beden,
    packagingTarget: Math.max(0, Math.floor(Number(raw.packagingTarget) || 0)),
  };
}

export function calcUtuPaketPercent(count: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  const pct = (count / target) * 100;
  return Math.max(0, Math.min(100, pct));
}
