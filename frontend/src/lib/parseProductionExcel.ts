import * as XLSX from "xlsx";
import {
  PRODUCTION_EXCEL_META_MODEL,
  PRODUCTION_EXCEL_META_PRODUCT,
  PRODUCTION_EXCEL_SHEET_NAME,
} from "@/lib/productionExcelFormat";

/** Tüm üretim slotları (kullanılmayan düzen 0) */
export type ParsedExcelProductionRow = {
  name: string;
  teamLabel: string;
  process: string;
  t1000: number;
  t1300: number;
  t1600: number;
  t1830: number;
  h0900: number;
  h1000: number;
  h1115: number;
  h1215: number;
  h1300: number;
  h1445: number;
  h1545: number;
  h1700: number;
  h1830: number;
};

export type ParsedProductionExcel = {
  meta: { productName: string; productModel: string };
  rows: ParsedExcelProductionRow[];
  parseWarnings: string[];
};

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim();
}

function cellNum(v: unknown): number {
  if (v === "" || v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function normHeader(s: string): string {
  return cellStr(s).toLocaleLowerCase("tr-TR");
}

const HEADER_KEYS = {
  ad: normHeader("Ad Soyad"),
  bolum: normHeader("Bölüm"),
  proses: normHeader("Proses"),
  t10: normHeader("10:00"),
  t13: normHeader("13:00"),
  t16: normHeader("16:00"),
  t18: normHeader("18:30"),
} as const;

const NEW_SLOT_LABELS = [
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

function headerColIndex(labels: unknown[], key: keyof typeof HEADER_KEYS): number {
  const nLabels = labels.map((c) => normHeader(cellStr(c)));
  const want = HEADER_KEYS[key];
  return nLabels.indexOf(want);
}

function headerColIndexLabel(labels: unknown[], label: string): number {
  const nLabels = labels.map((c) => normHeader(cellStr(c)));
  return nLabels.indexOf(normHeader(label));
}

function pickSheet(wb: XLSX.WorkBook): { sheet: XLSX.WorkSheet; sheetName: string } | null {
  const names = wb.SheetNames;
  if (!names.length) return null;
  const byName = names.find((n) => n === PRODUCTION_EXCEL_SHEET_NAME);
  const name = byName ?? names[0];
  const sheet = wb.Sheets[name];
  if (!sheet) return null;
  return { sheet, sheetName: name };
}

const ZERO_ROW = (): Omit<ParsedExcelProductionRow, "name" | "teamLabel" | "process"> => ({
  t1000: 0,
  t1300: 0,
  t1600: 0,
  t1830: 0,
  h0900: 0,
  h1000: 0,
  h1115: 0,
  h1215: 0,
  h1300: 0,
  h1445: 0,
  h1545: 0,
  h1700: 0,
  h1830: 0,
});

/**
 * Ana sayfa Excel export’u ile aynı yapı: sayfa "Üretim", başlık satırı Sıra|Ad Soyad|Bölüm|Proses|saatler|Toplam.
 * 21.04.2026 sonrası dosyalarda 09:00 sütunu varsa yeni düzen okunur.
 */
export function parseProductionExcelBuffer(buf: ArrayBuffer): ParsedProductionExcel {
  const warnings: string[] = [];
  const meta = { productName: "", productModel: "" };

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch {
    return { meta, rows: [], parseWarnings: ["Dosya okunamadı veya geçerli bir Excel değil."] };
  }

  const picked = pickSheet(wb);
  if (!picked) return { meta, rows: [], parseWarnings: ["Çalışma sayfası yok."] };
  if (picked.sheetName !== PRODUCTION_EXCEL_SHEET_NAME) {
    warnings.push(
      `Sayfa adı "${PRODUCTION_EXCEL_SHEET_NAME}" değil ("${picked.sheetName}" kullanıldı). Yine de içerik okunmaya çalışıldı.`
    );
  }

  const ws = picked.sheet;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  const metaProductN = normHeader(PRODUCTION_EXCEL_META_PRODUCT);
  const metaModelN = normHeader(PRODUCTION_EXCEL_META_MODEL);

  for (const row of aoa) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const k = normHeader(cellStr(row[0]));
    if (k === metaProductN) meta.productName = cellStr(row[1]);
    if (k === metaModelN) meta.productModel = cellStr(row[1]);
  }

  let headerRow = -1;
  let layout: "legacy" | "new" = "legacy";
  const col: Record<string, number> = {};

  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    const ad = headerColIndex(row, "ad");
    if (ad < 0) continue;
    const bolum = headerColIndex(row, "bolum");
    const proses = headerColIndex(row, "proses");
    if (bolum < 0 || proses < 0) {
      warnings.push("Tablo başlığı eksik (Bölüm veya Proses bulunamadı).");
      continue;
    }

    const idx09 = headerColIndexLabel(row, "09:00");
    if (idx09 >= 0) {
      const newIdxs = NEW_SLOT_LABELS.map((lab) => headerColIndexLabel(row, lab));
      if (newIdxs.some((ix) => ix < 0)) {
        warnings.push("Yeni saat başlıkları eksik (09:00–18:30 dokuz sütun).");
        continue;
      }
      layout = "new";
      headerRow = i;
      col.ad = ad;
      col.bolum = bolum;
      col.proses = proses;
      NEW_SLOT_LABELS.forEach((lab, j) => {
        col[`h${j}`] = newIdxs[j];
      });
      break;
    }

    const t10 = headerColIndex(row, "t10");
    const t13 = headerColIndex(row, "t13");
    const t16 = headerColIndex(row, "t16");
    const t18 = headerColIndex(row, "t18");
    if (t10 < 0 || t13 < 0 || t16 < 0 || t18 < 0) {
      warnings.push("Tablo başlığı eksik (Bölüm, Proses veya saat sütunları bulunamadı).");
      continue;
    }
    layout = "legacy";
    headerRow = i;
    col.ad = ad;
    col.bolum = bolum;
    col.proses = proses;
    col.t10 = t10;
    col.t13 = t13;
    col.t16 = t16;
    col.t18 = t18;
    break;
  }

  if (headerRow < 0) {
    return {
      meta,
      rows: [],
      parseWarnings: [
        ...warnings,
        `“Ad Soyad” sütunlu tablo başlığı bulunamadı. Dışa aktarılan dosyada başlık satırını değiştirmeyin (${PRODUCTION_EXCEL_SHEET_NAME} sayfası).`,
      ],
    };
  }

  const rows: ParsedExcelProductionRow[] = [];

  for (let i = headerRow + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;

    const col0 = cellStr(row[0]);
    if (col0.toLocaleUpperCase("tr-TR") === "TOPLAM") break;

    const nameVal = cellStr(row[col.ad]);
    if (!nameVal) continue;

    const base = ZERO_ROW();
    if (layout === "new") {
      rows.push({
        name: nameVal,
        teamLabel: cellStr(row[col.bolum]),
        process: cellStr(row[col.proses]),
        ...base,
        h0900: cellNum(row[col.h0]),
        h1000: cellNum(row[col.h1]),
        h1115: cellNum(row[col.h2]),
        h1215: cellNum(row[col.h3]),
        h1300: cellNum(row[col.h4]),
        h1445: cellNum(row[col.h5]),
        h1545: cellNum(row[col.h6]),
        h1700: cellNum(row[col.h7]),
        h1830: cellNum(row[col.h8]),
      });
    } else {
      rows.push({
        name: nameVal,
        teamLabel: cellStr(row[col.bolum]),
        process: cellStr(row[col.proses]),
        ...base,
        t1000: cellNum(row[col.t10]),
        t1300: cellNum(row[col.t13]),
        t1600: cellNum(row[col.t16]),
        t1830: cellNum(row[col.t18]),
      });
    }
  }

  if (rows.length === 0) warnings.push("Tabloda veri satırı yok.");

  return { meta, rows, parseWarnings: warnings };
}
