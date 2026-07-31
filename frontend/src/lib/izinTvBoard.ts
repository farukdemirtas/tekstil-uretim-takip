import type { IzinTvLeaveRow } from "@/lib/api";

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatDateDMY(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const m = iso.trim().match(YMD);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
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
