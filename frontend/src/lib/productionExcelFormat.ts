/**
 * Ana sayfa Excel dışa / içe aktarımı — tek kaynak (başlıklar ve sayfa adı uyumu).
 */
export const PRODUCTION_EXCEL_SHEET_NAME = "Üretim";

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
