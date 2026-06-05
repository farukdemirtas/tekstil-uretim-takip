import { NEW_SLOT_DEFS } from "./productionSlots";

export const UTU_PAKET_STAGES = ["optik", "utu", "paketleme"] as const;
export type UtuPaketStage = (typeof UTU_PAKET_STAGES)[number];

export const UTU_PAKET_STAGE_META: Record<
  UtuPaketStage,
  { label: string; description: string; accent: string }
> = {
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
  packages?: TakipsanPackageRow[];
};

export type TakipsanPackageRow = {
  packageNo: string;
  items: number;
  size: string;
  status: string;
  createdAt: string;
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

export function normalizeTakipsanPackageRow(
  raw: Partial<TakipsanPackageRow> & { created_at?: string; package_no?: string }
): TakipsanPackageRow {
  return {
    packageNo: String(raw.packageNo ?? raw.package_no ?? "").trim(),
    items: Math.max(0, Math.floor(Number(raw.items) || 0)),
    size: String(raw.size ?? "").trim().toUpperCase(),
    status: String(raw.status ?? "").trim(),
    createdAt: String(raw.createdAt ?? raw.created_at ?? "").trim(),
  };
}

export function normalizeTakipsanPackages(
  rows: Array<Partial<TakipsanPackageRow> & { created_at?: string; package_no?: string }> | undefined
): TakipsanPackageRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeTakipsanPackageRow).filter((row) => row.packageNo);
}

export type UtuPaketDayPayload = {
  date: string;
  stages: Record<UtuPaketStage, UtuPaketSlots>;
  beden: Record<string, number>;
  /** TV bar hedefi — sipariş sayısından gelir */
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
  const takipsan = raw.takipsan
    ? {
        packageCount: Math.max(0, Math.floor(Number(raw.takipsan.packageCount) || 0)),
        readCount: Math.max(0, Math.floor(Number(raw.takipsan.readCount) || 0)),
        orderQuantity: Math.max(0, Math.floor(Number(raw.takipsan.orderQuantity) || 0)),
        orderCode: String(raw.takipsan.orderCode || "").trim(),
        syncedAt: raw.takipsan.syncedAt || null,
        packages: normalizeTakipsanPackages(raw.takipsan.packages),
      }
    : undefined;

  return {
    date: raw.date,
    stages,
    beden,
    packagingTarget: Math.max(0, Math.floor(Number(raw.packagingTarget) || 0)),
    takipsan,
  };
}

export function calcUtuPaketPercent(count: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  const pct = (count / target) * 100;
  return Math.max(0, Math.min(100, pct));
}
