import type * as XLSX from "xlsx";

/** Geniş personel listesi (Yeşil İmaj): A=sıra, B=ad, C=soyad, L=doğum (index 11) */
const COL_A = 0;
const COL_B = 1;
const COL_C = 2;
const COL_L_TARIH = 11;

export function parseCellToIsoDate(v: unknown, xlsxMod?: typeof XLSX): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = xlsxMod?.SSF?.parse_date_code?.(v);
    if (parsed && parsed.y != null && parsed.m != null && parsed.d != null) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, "0");
      const d = String(Math.floor(parsed.d)).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${dd}`;
  }
  return null;
}

function normHdr(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function rowLooksLikeSiraNo(v: unknown): boolean {
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1_000_000) return true;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^\d{1,6}$/.test(t) && Number(t) > 0 && Number(t) < 1_000_000) return true;
  }
  return false;
}

function countParsedDatesInColumn(rows: unknown[][], col: number, maxRows: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const line = rows[i] as unknown[];
    if (parseCellToIsoDate(line?.[col])) n++;
  }
  return n;
}

function inferDataStart(rows: unknown[][], tarihCol: number): number {
  if (rows.length === 0) return 0;
  const d0 = parseCellToIsoDate((rows[0] as unknown[])[tarihCol]);
  const d1 = rows.length > 1 ? parseCellToIsoDate((rows[1] as unknown[])[tarihCol]) : null;
  if (d0) return 0;
  if (d1) return 1;
  return 1;
}

function findDogumColumnIndex(headerRow: unknown[]): number {
  const h = headerRow.map(normHdr);
  const idx = h.findIndex((x) => x.includes("dogum") || x.includes("birth") || x.includes("dtarih"));
  return idx >= 0 ? idx : COL_L_TARIH;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const line = rows[i] as unknown[];
    if (!line?.length) continue;
    const h = line.map(normHdr);
    const hasAd = h.some(
      (x) => x === "ad" || x === "adi" || x === "isim" || (x.includes("ad") && !x.includes("soyad") && !x.includes("gorev"))
    );
    const hasSoyad = h.some((x) => x.includes("soyad") || x.includes("soyisim") || x === "soy ad");
    if (hasAd && hasSoyad) return i;
  }
  return -1;
}

function resolveColumnsFromHeaderRow(headerRow: unknown[]): { ad: number; soyad: number; tarih: number } {
  const h = headerRow.map(normHdr);
  const ad = h.findIndex(
    (x) => x === "ad" || x === "adi" || x === "isim" || (x.includes("ad") && !x.includes("soyad") && !x.includes("gorev"))
  );
  const soyad = h.findIndex((x) => x.includes("soyad") || x.includes("soyisim") || x === "soy ad");
  return {
    ad: ad >= 0 ? ad : COL_B,
    soyad: soyad >= 0 ? soyad : COL_C,
    tarih: findDogumColumnIndex(headerRow),
  };
}

/**
 * Yeşil İmaj: başlıkta B=AD, C=SOYAD.
 * Dar tablo: A=ad, B=soyad (veya A=sıra, B=ad, C=soyad).
 */
export function resolvePersonnelExcelColumns(rows: unknown[][]): {
  ad: number;
  soyad: number;
  dataStart: number;
} {
  if (rows.length === 0) return { ad: 0, soyad: 1, dataStart: 0 };

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx >= 0) {
    const { ad, soyad } = resolveColumnsFromHeaderRow(rows[headerIdx] as unknown[]);
    return { ad, soyad, dataStart: headerIdx + 1 };
  }

  const r0 = rows[0] as unknown[];
  const h1 = normHdr(r0[COL_B]);
  const h2 = normHdr(r0[COL_C]);
  const headerAdSoyad =
    (h1 === "ad" || h1 === "adı" || h1 === "isim" || (h1.includes("ad") && !h1.includes("soyad"))) &&
    (h2.includes("soyad") || h2.includes("soyisim") || h2 === "soy ad");

  if (headerAdSoyad) {
    return { ad: COL_B, soyad: COL_C, dataStart: 1 };
  }

  const sampleN = Math.min(30, rows.length);
  const countL = countParsedDatesInColumn(rows, COL_L_TARIH, sampleN);
  const countC = countParsedDatesInColumn(rows, COL_C, sampleN);
  const tarihCol = countL >= countC ? COL_L_TARIH : COL_C;
  const dataStart = inferDataStart(rows, tarihCol);
  let ad = COL_A;
  let soyad = COL_B;

  let siraLike = 0;
  let n = 0;
  for (let i = dataStart; i < Math.min(dataStart + 20, rows.length); i++) {
    const line = rows[i] as unknown[];
    if (!line?.length) continue;
    if (!String(line[COL_B] ?? "").trim()) continue;
    n++;
    if (rowLooksLikeSiraNo(line[COL_A])) siraLike++;
  }
  if (n >= 3 && siraLike / n >= 0.6) {
    ad = COL_B;
    soyad = COL_C;
  }

  return { ad, soyad, dataStart };
}

export function resolveBirthdayExcelColumns(rows: unknown[][]): {
  ad: number;
  soyad: number;
  tarih: number;
  dataStart: number;
} {
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx >= 0) {
    const cols = resolveColumnsFromHeaderRow(rows[headerIdx] as unknown[]);
    return { ...cols, dataStart: headerIdx + 1 };
  }
  const { ad, soyad, dataStart } = resolvePersonnelExcelColumns(rows);
  const r0 = rows[0] as unknown[];
  const tarih = rows.length ? findDogumColumnIndex(r0) : COL_L_TARIH;
  return { ad, soyad, tarih, dataStart };
}

export function parsePersonnelNamesFromRows(rows: unknown[][]): string[] {
  const { ad, soyad, dataStart } = resolvePersonnelExcelColumns(rows);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let r = dataStart; r < rows.length; r++) {
    const line = rows[r] as unknown[];
    if (!line || line.length === 0) continue;
    const fn = String(line[ad] ?? "").trim();
    const ln = String(line[soyad] ?? "").trim();
    if (!fn && !ln) continue;
    const full = `${fn} ${ln}`.trim().replace(/\s+/g, " ").toUpperCase();
    if (!full || seen.has(full)) continue;
    seen.add(full);
    out.push(full);
  }
  return out;
}

export function parseBirthdaysFromRows(
  rows: unknown[][],
  xlsxMod?: typeof XLSX
): { firstName: string; lastName: string; birthDate: string }[] {
  const { ad, soyad, tarih, dataStart } = resolveBirthdayExcelColumns(rows);
  const out: { firstName: string; lastName: string; birthDate: string }[] = [];
  for (let r = dataStart; r < rows.length; r++) {
    const line = rows[r] as unknown[];
    if (!line || line.length === 0) continue;
    const fn = String(line[ad] ?? "").trim();
    const ln = String(line[soyad] ?? "").trim();
    const iso = parseCellToIsoDate(line[tarih], xlsxMod);
    if (!fn && !ln) continue;
    if (!iso) continue;
    out.push({ firstName: fn, lastName: ln, birthDate: iso });
  }
  return out;
}
