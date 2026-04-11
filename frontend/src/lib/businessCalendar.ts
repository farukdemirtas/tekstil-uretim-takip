/** Yerel takvim günü YYYY-MM-DD (UTC kayması yok) */

export function formatIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function parseIsoLocal(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function isWeekendIso(iso: string): boolean {
  const dt = parseIsoLocal(iso);
  if (!dt) return false;
  const day = dt.getDay();
  return day === 0 || day === 6;
}

/** Cumartesi/pazar → geriye doğru en yakın hafta içi */
export function clampToWeekdayIso(iso: string): string {
  const dt0 = parseIsoLocal(iso);
  if (!dt0) return iso;
  let d = dt0;
  while (d.getDay() === 0 || d.getDay() === 6) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return formatIsoLocal(d);
}

export function todayWeekdayIso(): string {
  return clampToWeekdayIso(formatIsoLocal(new Date()));
}

/** Türkiye takvim günü YYYY-MM-DD (log / sunucu filtreleriyle uyumlu) */
export function todayIsoTurkey(): string {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return formatIsoLocal(new Date());
}

/** Takvimden hafta sonu seçilirse hafta içine çeker */
export function coerceWeekdayPickerValue(raw: string): string {
  if (!raw) return raw;
  return isWeekendIso(raw) ? clampToWeekdayIso(raw) : raw;
}
