/**
 * Ana sayfa üretim saat dilimleri.
 * 21.04.2026 ve sonrası: 9 sütun; öncesi: eski 4 sütun (10:00–18:30).
 */
import type { ProductionRow } from "./types";

export const PRODUCTION_SLOT_CUTOFF = "2026-04-21";

export const NEW_SLOT_DEFS = [
  { key: "h0900" as const, label: "09:00" },
  { key: "h1000" as const, label: "10:00" },
  { key: "h1115" as const, label: "11:15" },
  { key: "h1215" as const, label: "12:15" },
  { key: "h1300" as const, label: "13:00" },
  { key: "h1445" as const, label: "14:45" },
  { key: "h1545" as const, label: "15:45" },
  { key: "h1700" as const, label: "17:00" },
  { key: "h1830" as const, label: "18:30" },
] as const;

export const LEGACY_SLOT_DEFS = [
  { key: "t1000" as const, label: "10:00" },
  { key: "t1300" as const, label: "13:00" },
  { key: "t1600" as const, label: "16:00" },
  { key: "t1830" as const, label: "18:30" },
] as const;

export type NewSlotKey = (typeof NEW_SLOT_DEFS)[number]["key"];
export type LegacySlotKey = (typeof LEGACY_SLOT_DEFS)[number]["key"];
export type ProductionSlotKey = NewSlotKey | LegacySlotKey;

export function isNewSlotLayout(dateIso: string): boolean {
  return dateIso >= PRODUCTION_SLOT_CUTOFF;
}

/** Tüm saat dilimleri toplamı (eski + yeni sütunlar; kullanılmayan taraf 0). */
export function sumProductionRow(row: ProductionRow): number {
  return (
    row.t1000 +
    row.t1300 +
    row.t1600 +
    row.t1830 +
    row.h0900 +
    row.h1000 +
    row.h1115 +
    row.h1215 +
    row.h1300 +
    row.h1445 +
    row.h1545 +
    row.h1700 +
    row.h1830
  );
}
