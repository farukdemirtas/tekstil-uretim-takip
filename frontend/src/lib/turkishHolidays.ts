/**
 * Türkiye resmi tatilleri.
 * - Sabit (millî) günler her yıl aynı ay/gündedir.
 * - Dini bayramlar (Ramazan/Kurban) ay takvimine göre kayar; Diyanet'in yayımladığı/öngördüğü
 *   tarihlere göre bilinen yıllar için "AA-GG" listesi tutulur (arife günü dahil — arife öğleden
 *   sonra yarım gün resmi tatil olduğundan burada tam gün olarak işaretlenir).
 * - Listede olmayan bir yıl için yalnızca sabit millî günler tatil sayılır.
 */

const FIXED_HOLIDAYS_MD: string[] = [
  "01-01", // Yılbaşı
  "04-23", // Ulusal Egemenlik ve Çocuk Bayramı
  "05-01", // Emek ve Dayanışma Günü
  "05-19", // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  "07-15", // Demokrasi ve Milli Birlik Günü
  "08-30", // Zafer Bayramı
  "10-28", // Cumhuriyet Bayramı Arifesi (yarım gün)
  "10-29", // Cumhuriyet Bayramı
];

/** Ramazan/Kurban Bayramı (arife dahil) — "AA-GG" biçiminde, yıl → gün listesi */
const RELIGIOUS_HOLIDAYS_BY_YEAR: Record<number, string[]> = {
  2024: ["04-09", "04-10", "04-11", "04-12", "06-15", "06-16", "06-17", "06-18", "06-19"],
  2025: ["03-29", "03-30", "03-31", "04-01", "06-05", "06-06", "06-07", "06-08", "06-09"],
  2026: ["03-19", "03-20", "03-21", "03-22", "05-26", "05-27", "05-28", "05-29", "05-30"],
  2027: ["03-08", "03-09", "03-10", "03-11", "05-15", "05-16", "05-17", "05-18", "05-19"],
  2028: ["02-26", "02-27", "02-28", "02-29", "05-04", "05-05", "05-06", "05-07", "05-08"],
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** month1: 1-12 tabanlı ay, day: 1-31 tabanlı gün */
export function isOfficialHolidayMonthDay(year: number, month1: number, day: number): boolean {
  const md = `${pad2(month1)}-${pad2(day)}`;
  if (FIXED_HOLIDAYS_MD.includes(md)) return true;
  const religious = RELIGIOUS_HOLIDAYS_BY_YEAR[year];
  return religious ? religious.includes(md) : false;
}

export function isOfficialHolidayIso(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;
  return isOfficialHolidayMonthDay(y, m, d);
}

/** Bu ay/gün hafta sonu mu (Cumartesi/Pazar)? */
export function isWeekendMonthDay(year: number, month1: number, day: number): boolean {
  const dow = new Date(year, month1 - 1, day).getDay();
  return dow === 0 || dow === 6;
}
