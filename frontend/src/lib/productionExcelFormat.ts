/**
 * Ana sayfa Excel dışa / içe aktarımı — tek kaynak (başlıklar ve sayfa adı uyumu).
 */
import { isNewSlotLayout } from "./productionSlots";

export const PRODUCTION_EXCEL_SHEET_NAME = "Üretim";

/** Eski düzen (21.04.2026 öncesi) — dört saat sütunu */
export const LEGACY_PRODUCTION_EXCEL_SLOT_LABELS = ["10:00", "13:00", "16:00", "18:30"] as const;

/** Yeni düzen (21.04.2026 ve sonrası) — dokuz saat sütunu */
export const NEW_PRODUCTION_EXCEL_SLOT_LABELS = [
  "09:00",
  "10:00",
  "11:15",
  "12:15",
  "13:00",
  "14:45",
  "15:45",
  "17:00",
  "18:30",
] as const;

export function getProductionExcelSlotLabels(dateIso: string): readonly string[] {
  return isNewSlotLayout(dateIso) ? NEW_PRODUCTION_EXCEL_SLOT_LABELS : LEGACY_PRODUCTION_EXCEL_SLOT_LABELS;
}

/** Günlük tek sayfa: Sıra | … | saatler | Toplam */
export function getProductionExcelHeaders(dateIso: string): readonly string[] {
  const slots = getProductionExcelSlotLabels(dateIso);
  return ["Sıra", "Ad Soyad", "Bölüm", "Proses", ...slots, "Toplam"];
}

/** Toplu rapor satırı: Tarih | … | saatler | Günlük Toplam */
export function getConsolidatedProductionExcelHeaders(dateIso: string): readonly string[] {
  const slots = getProductionExcelSlotLabels(dateIso);
  return ["Tarih", "Ad Soyad", "Bölüm", "Proses", ...slots, "Günlük Toplam"];
}

/** @deprecated — yalnızca eski 4 sütun; `getProductionExcelHeaders(dateIso)` kullanın */
export const PRODUCTION_EXCEL_HEADERS = [
  "Sıra",
  "Ad Soyad",
  "Bölüm",
  "Proses",
  "10:00",
  "13:00",
  "16:00",
  "18:30",
  "Toplam",
] as const;

/** Meta satırları (import için okunur) */
export const PRODUCTION_EXCEL_META_PRODUCT = "Ürün adı";
export const PRODUCTION_EXCEL_META_MODEL = "Model";
