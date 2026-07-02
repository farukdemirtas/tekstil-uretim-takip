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
  secondaryConsignmentId: string | null;
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

/** Takipsan created_at → YYYY-MM-DD (ISO ve TR formatları) */
export function packageDateIso(createdAt: string): string | null {
  const raw = String(createdAt || "").trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${d}`;
  }
  return null;
}

export function packageCreatedOnDate(createdAt: string, dateIso: string): boolean {
  const iso = packageDateIso(createdAt);
  return iso ? iso === dateIso : false;
}

export function sumGunPaketlenen(
  packages: TakipsanPackageRow[] | undefined,
  dateIso: string
): { adet: number; paket: number } {
  const rows = normalizeTakipsanPackages(packages).filter((row) =>
    packageCreatedOnDate(row.createdAt, dateIso)
  );
  return {
    adet: rows.reduce((s, row) => s + row.items, 0),
    paket: rows.length,
  };
}

/**
 * Ham beden stringinden en uygun size kodunu döndürür.
 * Önce tam eşleşme (===) aranır; yoksa raw içinde geçen en uzun kod seçilir.
 * Bu sayede "XL" → "L" yanlış eşleşmesinin önüne geçilir.
 */
function matchSizeCode(raw: string): UtuPaketSizeCode | undefined {
  const exact = UTU_PAKET_SIZE_CODES.find((c) => c === raw);
  if (exact) return exact;
  // En uzun eşleşeni bul (XL, L gibi prefix çakışmalarında XL kazanır)
  return [...UTU_PAKET_SIZE_CODES]
    .sort((a, b) => b.length - a.length)
    .find((c) => raw.includes(c));
}

/** Takipsan paket listesinden beden → koli (paket) sayısı */
export function countKoliByBeden(
  packages: TakipsanPackageRow[] | undefined,
  dateIso?: string
): Record<UtuPaketSizeCode, number> {
  const out = emptyUtuPaketBeden();
  for (const row of normalizeTakipsanPackages(packages)) {
    if (dateIso && !packageCreatedOnDate(row.createdAt, dateIso)) continue;
    const raw = String(row.size || "").trim().toUpperCase();
    const code = matchSizeCode(raw);
    if (code) out[code] += 1;
  }
  return out;
}

/** Takipsan paket listesinden beden → adet (items) sayısı — bugünkü canlı veri için */
export function countAdetByBeden(
  packages: TakipsanPackageRow[] | undefined,
  dateIso?: string
): Record<UtuPaketSizeCode, number> {
  const out = emptyUtuPaketBeden();
  for (const row of normalizeTakipsanPackages(packages)) {
    if (dateIso && !packageCreatedOnDate(row.createdAt, dateIso)) continue;
    const raw = String(row.size || "").trim().toUpperCase();
    const code = matchSizeCode(raw);
    if (code) out[code] += row.items;
  }
  return out;
}

export type UtuPaketModelRef = {
  modelId: number;
  productName: string;
  productModel: string;
};

export type UtuPaketDayPayload = {
  date: string;
  /** @deprecated Ayarlardan utuPaketModel kullanın */
  modelReferenceDate?: string;
  /** Ayarlar → Ütü-paket için uygula ile atanan model */
  utuPaketModel?: UtuPaketModelRef | null;
  stages: Record<UtuPaketStage, UtuPaketSlots>;
  /** Optik ve ütü için saat toplamına eklenen ek adet */
  stageEkSayim?: Partial<Record<UtuPaketStage, number>>;
  beden: Record<string, number>;
  /** TV bar hedefi — sipariş sayısından gelir */
  packagingTarget: number;
  /** Ayarlardan atanan manuel model — Takipsan paketleme kapalı */
  manualPackaging?: boolean;
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
  const stageEkSayim: Partial<Record<UtuPaketStage, number>> = {};
  for (const st of UTU_PAKET_STAGES) {
    stageEkSayim[st] = Math.max(0, Math.floor(Number(raw.stageEkSayim?.[st]) || 0));
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
    modelReferenceDate: raw.modelReferenceDate ? String(raw.modelReferenceDate).trim() : raw.date,
    utuPaketModel: raw.utuPaketModel?.modelId
      ? {
          modelId: Number(raw.utuPaketModel.modelId),
          productName: String(raw.utuPaketModel.productName || ""),
          productModel: String(raw.utuPaketModel.productModel || ""),
        }
      : null,
    stages,
    stageEkSayim,
    beden,
    packagingTarget: Math.max(0, Math.floor(Number(raw.packagingTarget) || 0)),
    manualPackaging: raw.manualPackaging === true,
    takipsan,
  };
}

export function calcUtuPaketPercent(count: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  const pct = (count / target) * 100;
  return Math.max(0, Math.min(100, pct));
}

export type BedenProgressTier = "red" | "yellow" | "green" | "done";

/** Beden çeki ilerleme rengi: 0–50 kırmızı, 50–80 sarı, 80–100 yeşil, tamamlandı */
export function bedenProgressTier(total: number, target: number): BedenProgressTier {
  if (target > 0 && total >= target) return "done";
  const pct = calcUtuPaketPercent(total, target);
  if (pct >= 80) return "green";
  if (pct >= 50) return "yellow";
  return "red";
}

export const BEDEN_PROGRESS_FRAME: Record<
  BedenProgressTier,
  { ring: string; glow: string; bg: string; label: string }
> = {
  red: {
    ring: "ring-red-400",
    glow: "shadow-[0_0_28px_rgba(239,68,68,0.45)]",
    bg: "bg-gradient-to-b from-red-50 to-white",
    label: "text-red-700",
  },
  yellow: {
    ring: "ring-amber-400",
    glow: "shadow-[0_0_28px_rgba(245,158,11,0.4)]",
    bg: "bg-gradient-to-b from-amber-50 to-white",
    label: "text-amber-800",
  },
  green: {
    ring: "ring-emerald-400",
    glow: "shadow-[0_0_28px_rgba(16,185,129,0.4)]",
    bg: "bg-gradient-to-b from-emerald-50 to-white",
    label: "text-emerald-800",
  },
  done: {
    ring: "ring-emerald-500",
    glow: "shadow-[0_0_32px_rgba(16,185,129,0.55)]",
    bg: "bg-gradient-to-b from-emerald-100 to-emerald-50",
    label: "text-emerald-900",
  },
};

export const BEDEN_BAR_GRADIENT: Record<BedenProgressTier, string> = {
  red: "from-red-500 via-red-500 to-orange-500",
  yellow: "from-amber-500 via-yellow-500 to-amber-400",
  green: "from-emerald-500 via-teal-500 to-cyan-500",
  done: "from-emerald-500 via-teal-500 to-cyan-500",
};

export const BEDEN_BAR_GLOW: Record<BedenProgressTier, string> = {
  red: "shadow-[0_0_20px_rgba(239,68,68,0.45)]",
  yellow: "shadow-[0_0_20px_rgba(245,158,11,0.4)]",
  green: "shadow-[0_0_20px_rgba(16,185,129,0.4)]",
  done: "shadow-[0_0_24px_rgba(16,185,129,0.5)]",
};

export function emptyBedenCekiTargets(): Record<UtuPaketSizeCode, number> {
  return emptyUtuPaketBeden();
}

/** Model hedefi ile birleştirilmiş Takipsan sipariş hedefinin büyük olanı */
export function resolveUtuPaketLineTarget(
  payload: Pick<UtuPaketDayPayload, "packagingTarget" | "takipsan">,
  productionTarget = 0
): number {
  const takipsanTarget = Math.max(
    0,
    Math.floor(Number(payload.takipsan?.orderQuantity) || Number(payload.packagingTarget) || 0)
  );
  const prod = Math.max(0, Math.floor(Number(productionTarget) || 0));
  return Math.max(prod, takipsanTarget);
}
