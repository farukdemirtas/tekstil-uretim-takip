import type { Workbook } from "exceljs";

/**
 * exceljs kütüphanesini yalnızca gerçekten ihtiyaç duyulduğunda (export butonuna
 * tıklanınca) yükler. Hücre stilleri (kenarlık, dolgu rengi, dikey/yatay yazı
 * yönü) gerektiren tablolar için kullanılır — düz "xlsx" paketi hücre stillerini
 * yazmayı desteklemez.
 *
 * Kullanım:
 *   const ExcelJS = await loadExcelJS();
 *   const wb = new ExcelJS.Workbook();
 */
export async function loadExcelJS() {
  return import("exceljs");
}

export type ExcelJSModule = Awaited<ReturnType<typeof loadExcelJS>>;

/** Workbook'u tarayıcıda .xlsx dosyası olarak indirir. */
export async function downloadWorkbook(workbook: Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
