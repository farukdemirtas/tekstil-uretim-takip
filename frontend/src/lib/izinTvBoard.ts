import type { IzinTvAttendanceEntry, IzinTvAttendanceSession, IzinTvLeaveRow } from "@/lib/api";

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

/** İzin panosu tarih aralığı — örn. 31.07.2026–15.08.2026 */
export function formatLeaveDateRange(start: string, end: string): string {
  const s = formatDateDMY(start);
  const e = formatDateDMY(end);
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

/** createdAt (YYYY-MM-DD…) bugün Türkiye tarihine denk gelen talepler */
export function filterLeavesCreatedOnDate(
  leaves: IzinTvLeaveRow[],
  dateIso: string,
): IzinTvLeaveRow[] {
  const day = String(dateIso || "").trim().slice(0, 10);
  if (!day) return leaves;
  return leaves.filter((l) => String(l.createdAt || "").trim().slice(0, 10) === day);
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

export function isRaporluDescription(desc: string): boolean {
  const d = normAttendanceDesc(desc);
  return d.includes("raporlu") || d.includes("rapor");
}

export function isLeaveDescription(desc: string): boolean {
  const d = normAttendanceDesc(desc);
  return d.includes("izin") || isRaporluDescription(desc);
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

/** İzin panosu — ekranda bir slaytta gösterilen satır (6-6-6) */
export const TV_LEAVE_ROWS_PER_SLIDE = 6;
/** Aynı gün en fazla bu kadar talep 6'lı slaytlarla döner; fazlası ek slaytta */
export const TV_MAX_LEAVE_DISPLAY = 24;
/** TV yüksekliğinde alt slayt çubuğu + başlık sonrası sığması için */
export const TV_ATTENDANCE_ROWS_PER_SLIDE = 6;

/** Yoklama kayıtları + izin sisteminden gelen raporlular (aynı isim tekrarlanmaz) */
export function mergeAttendanceWithRaporlu(
  session: IzinTvAttendanceSession | null,
): IzinTvAttendanceEntry[] {
  if (!session) return [];
  const base = session.entries ?? [];
  const names = new Set(base.map((e) => e.fullName.trim().toLocaleLowerCase("tr-TR")));
  const dateLabel = session.attendanceDate ? formatDateDMY(session.attendanceDate) : "";
  const fromLeaves = (session.raporluLeaves ?? [])
    .filter((l) => !names.has(l.fullName.trim().toLocaleLowerCase("tr-TR")))
    .map((l) => ({
      fullName: l.fullName,
      entryDate: dateLabel,
      description: "RAPORLU",
      position: l.position,
    }));
  return [...base, ...fromLeaves];
}

export function attendanceDataFingerprint(session: IzinTvAttendanceSession | null): string {
  if (!session) return "";
  const base =
    session.entries
      ?.map((e) => `${e.id ?? ""}:${e.fullName}:${e.description}:${e.position ?? ""}`)
      .join("|") ?? "";
  const rap =
    session.raporluLeaves?.map((l) => `${l.id}:${l.fullName}:${l.status}`).join("|") ?? "";
  return `${session.attendanceDate ?? ""}#${session.uploadedAt ?? ""}#${base}#${rap}`;
}
