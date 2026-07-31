import type { IzinTvLeaveRow } from "@/lib/api";

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatDateDMY(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const m = iso.trim().match(YMD);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

/** TV tablosu — dd.mm.yy (daha dar sütun) */
export function formatDateDMYShort(iso: string | null | undefined): string {
  const full = formatDateDMY(iso);
  if (full === "—") return full;
  const parts = full.split(".");
  if (parts.length !== 3) return full;
  return `${parts[0]}.${parts[1]}.${parts[2].slice(-2)}`;
}

/** İzin panosu tarih aralığı — örn. 31.07.26–15.08.26 */
export function formatLeaveDateRange(start: string, end: string): string {
  const s = formatDateDMYShort(start);
  const e = formatDateDMYShort(end);
  if (s === "—" && e === "—") return "—";
  if (start === end || s === e) return s;
  return `${s}–${e}`;
}

/** EKRAN1 yoklama slaytı başlığı — örn. 31.07.2026 TARİHLİ YEŞİL İMAJ PERSONEL YOKLAMASI */
export function formatYoklamaBoardTitle(attendanceDate: string | null | undefined): string {
  const dateLabel = formatDateDMY(attendanceDate);
  if (dateLabel === "—") return "YEŞİL İMAJ PERSONEL YOKLAMASI";
  return `${dateLabel} TARİHLİ YEŞİL İMAJ PERSONEL YOKLAMASI`;
}

export function normalizeLeaveReason(value: string): string {
  return String(value ?? "").toLocaleUpperCase("tr-TR");
}

export function sortTvLeaves(leaves: IzinTvLeaveRow[]): IzinTvLeaveRow[] {
  return [...leaves].sort((a, b) => {
    const createdCmp = (b.createdAt || "").localeCompare(a.createdAt || "");
    if (createdCmp !== 0) return createdCmp;
    return b.id - a.id;
  });
}

export function normAttendanceDesc(desc: string): string {
  return String(desc ?? "").trim().toLocaleLowerCase("tr");
}

export function isAbsentDescription(desc: string): boolean {
  const d = normAttendanceDesc(desc);
  return d.includes("devamsız") || d.includes("devamsiz");
}

export function isAnnualLeaveDescription(desc: string): boolean {
  const d = normAttendanceDesc(desc);
  return d.includes("yıllık izin") || d.includes("yillik izin");
}

export function isLeaveDescription(desc: string): boolean {
  return normAttendanceDesc(desc).includes("izin");
}

export function attendanceSortRank(description: string): number {
  if (isAbsentDescription(description)) return 0;
  if (isAnnualLeaveDescription(description) || isLeaveDescription(description)) return 2;
  return 1;
}

export function sortTvAttendanceEntries<T extends { fullName: string; description: string }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    const rank = attendanceSortRank(a.description) - attendanceSortRank(b.description);
    if (rank !== 0) return rank;
    return a.fullName.localeCompare(b.fullName, "tr");
  });
}

export function chunkRows<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export const TV_MAX_LEAVE_ROWS = 6;
/** TV yüksekliğinde alt slayt çubuğu + başlık sonrası sığması için */
export const TV_ATTENDANCE_ROWS_PER_SLIDE = 6;
