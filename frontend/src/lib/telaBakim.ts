/** Dikim — Tela Makinesi Bakım Formu: yıllık günlük bakım takvimi + aylık bakım notları */

export const MONTH_NAMES: string[] = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export const DAYS_IN_GRID = 31;

/** Ayın gerçek gün sayısı (artık yıl dahil); grid her zaman 31 sütun gösterir, taşan hücreler pasif olur */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function dayKey(monthIndex: number, day: number): string {
  return `${monthIndex}-${day}`;
}

export type StoredTelaBakimPayload = {
  makineAdi: string;
  sorumlu: string;
  /** "ay-gün" → o gün günlük bakım (bant temizliği) yapıldı mı */
  days: Record<string, boolean>;
  /** Ay index (0-11) → aylık bakım notu */
  monthlyNotes: Record<number, string>;
  /** true ise hafta sonu/resmi tatil günleri işaretlenemez (varsayılan davranış) */
  blockWeekendHoliday: boolean;
};

export function telaBakimStorageKey(year: number): string {
  return `dikim_tela_bakim_v1_${year}`;
}

export const TELA_BAKIM_STORAGE_PREFIX = "dikim_tela_bakim_v1_";

function defaultTelaBakimPayload(): StoredTelaBakimPayload {
  return { makineAdi: "", sorumlu: "", days: {}, monthlyNotes: {}, blockWeekendHoliday: true };
}

export function loadTelaBakimPayload(year: number): StoredTelaBakimPayload {
  try {
    const raw = window.localStorage.getItem(telaBakimStorageKey(year));
    if (!raw) return defaultTelaBakimPayload();
    const parsed = JSON.parse(raw) as Partial<StoredTelaBakimPayload>;
    const base = defaultTelaBakimPayload();
    return {
      makineAdi: parsed.makineAdi ?? base.makineAdi,
      sorumlu: parsed.sorumlu ?? base.sorumlu,
      days: parsed.days ?? base.days,
      monthlyNotes: parsed.monthlyNotes ?? base.monthlyNotes,
      blockWeekendHoliday: parsed.blockWeekendHoliday ?? base.blockWeekendHoliday,
    };
  } catch {
    return defaultTelaBakimPayload();
  }
}

export function persistTelaBakimPayload(year: number, payload: StoredTelaBakimPayload) {
  try {
    window.localStorage.setItem(telaBakimStorageKey(year), JSON.stringify(payload));
  } catch {
    /* localStorage dolu/kapalı olabilir — sessiz geç */
  }
}

export const TELA_BAKIM_NOTE =
  "Not: Günlük olarak, temizleme spreyi ve nemli bez kullanılarak, çok fazla baskı uygulanmadan makinenin bandı silinerek temizlenmelidir.";
