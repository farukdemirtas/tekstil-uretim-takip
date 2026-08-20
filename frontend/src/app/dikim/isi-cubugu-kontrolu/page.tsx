"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { hasPermission, isAdminRole } from "@/lib/permissions";
import { loadExcelJS, downloadWorkbook } from "@/lib/exceljsLazy";
import type { Border } from "exceljs";
import { resizeImageFile } from "@/lib/imageResize";
import { listProductModels, setAuthToken, type ProductModelListItem } from "@/lib/api";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  POZISYONLAR,
  type Pozisyon,
  type PozisyonOlcum,
  type IsiCubuguEntry,
  emptyEntry,
  loadIsiCubuguPayload,
  persistIsiCubuguPayload,
} from "@/lib/isiCubuguKontrolu";

let entryIdCounter = 1;

/** Depodan yüklenen kayıtlar sayaçtan büyük/eşit id taşıyorsa, yeni satır eski biriyle çakışmasın diye sayaç ileri alınır. */
function ensureEntryIdCounterAbove(entries: IsiCubuguEntry[]) {
  for (const e of entries) {
    if (e.id >= entryIdCounter) entryIdCounter = e.id + 1;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const NUMERIC_FIELDS = [
  "istenenIsi",
  "istenenBasinc",
  "istenenSure",
  "olculenIsi",
  "olculenBasinc",
  "olculenSure",
] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

function modelLabel(m: ProductModelListItem): string {
  const name = m.productName?.trim();
  if (name && m.modelCode) return `${name} (${m.modelCode})`;
  return name || m.modelCode;
}

export default function IsiCubuguKontroluPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [entries, setEntries] = useState<IsiCubuguEntry[]>([]);
  const [productModels, setProductModels] = useState<ProductModelListItem[]>([]);

  /* ── Auth ──────────────────────────────────────────────── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!isAdminRole() && !hasPermission("isiCubuguKontrolu")) {
      router.replace("/");
      return;
    }
    setAuthToken(token);
    setAuthorized(true);
    void listProductModels()
      .then(setProductModels)
      .catch(() => setProductModels([]));
  }, [router]);

  /* ── Veri yükle (yıl değişince) ────────────────────────── */
  useEffect(() => {
    if (!authorized) return;
    const payload = loadIsiCubuguPayload(year);
    ensureEntryIdCounterAbove(payload.entries);
    setEntries(payload.entries);
  }, [authorized, year]);

  function persist(nextEntries: IsiCubuguEntry[]) {
    persistIsiCubuguPayload(year, { entries: nextEntries });
  }

  function addEntry() {
    setEntries((prev) => {
      const next = [...prev, emptyEntry(entryIdCounter++, todayIso())];
      persist(next);
      return next;
    });
  }

  function removeEntry(id: number) {
    if (!window.confirm("Bu kayıt (Sol/Orta/Sağ ölçümleriyle birlikte) silinsin mi?")) return;
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      persist(next);
      return next;
    });
  }

  function updateEntryField(id: number, field: "model" | "tarih", value: string) {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, [field]: value } : e));
      persist(next);
      return next;
    });
  }

  function updatePozisyonNumber(id: number, pozisyon: Pozisyon, field: NumericField, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    const value = v !== null && Number.isFinite(v) ? v : null;
    setEntries((prev) => {
      const next = prev.map((e) =>
        e.id === id ? { ...e, [pozisyon]: { ...e[pozisyon], [field]: value } } : e
      );
      persist(next);
      return next;
    });
  }

  async function updatePozisyonFoto(id: number, pozisyon: Pozisyon, file: File | undefined | null) {
    if (!file) return;
    try {
      const { dataUrl } = await resizeImageFile(file);
      setEntries((prev) => {
        const next = prev.map((e) =>
          e.id === id ? { ...e, [pozisyon]: { ...e[pozisyon], ornekFoto: dataUrl } } : e
        );
        persist(next);
        return next;
      });
    } catch {
      window.alert("Fotoğraf yüklenemedi. Lütfen tekrar deneyin.");
    }
  }

  function removePozisyonFoto(id: number, pozisyon: Pozisyon) {
    setEntries((prev) => {
      const next = prev.map((e) =>
        e.id === id ? { ...e, [pozisyon]: { ...e[pozisyon], ornekFoto: null } } : e
      );
      persist(next);
      return next;
    });
  }

  /* ── Excel dışa aktarım ───────────────────────────────── */
  async function exportExcel() {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Isı Çubuğu Kontrolü");

    const thin: Partial<Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
    const totalCols = 9; // No, Model, Tarih, Pozisyon, İstenenx3, Ölçülenx3, Örnek

    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = "LC WAIKIKI — TELA MAKİNASI ISI ÇUBUĞU KONTROL RAPORU";
    titleCell.font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(1).height = 24;

    const h1 = ws.getRow(3);
    const h2 = ws.getRow(4);
    ws.mergeCells(3, 1, 4, 1);
    h1.getCell(1).value = "No";
    ws.mergeCells(3, 2, 4, 2);
    h1.getCell(2).value = "Model";
    ws.mergeCells(3, 3, 4, 3);
    h1.getCell(3).value = "Tarih";
    ws.mergeCells(3, 4, 4, 4);
    h1.getCell(4).value = "Pozisyon";
    ws.mergeCells(3, 5, 3, 7);
    h1.getCell(5).value = "İSTENEN DEĞERLER (Datasheette Yazan Değer)";
    ws.mergeCells(3, 8, 3, 10);
    h1.getCell(8).value = "ÖLÇÜLEN DEĞERLER (Ölçümden Sonra Çıkan Değer)";
    ws.mergeCells(3, 11, 4, 11);
    h1.getCell(11).value = "Isı Çubuğu Uygulama Örneği";
    ["Isı", "Basınç", "Süre", "Isı", "Basınç", "Süre"].forEach((label, i) => {
      h2.getCell(5 + i).value = label;
    });

    const totalColsReal = 11;
    for (let r = 3; r <= 4; r++) {
      for (let c = 1; c <= totalColsReal; c++) {
        const cell = ws.getCell(r, c);
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.border = allBorders;
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      }
    }
    h1.height = 20;
    h2.height = 20;

    const widths = [5, 20, 12, 9, 9, 10, 8, 9, 10, 8, 26];
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

    let rIdx = 5;
    let no = 1;
    for (const entry of entries) {
      const startRow = rIdx;
      for (const poz of POZISYONLAR) {
        const olcum: PozisyonOlcum = entry[poz.key];
        const row = ws.getRow(rIdx);
        const values: (string | number)[] = [
          poz.key === "sol" ? no : "",
          poz.key === "sol" ? entry.model : "",
          poz.key === "sol" ? entry.tarih : "",
          poz.label,
          olcum.istenenIsi ?? "",
          olcum.istenenBasinc ?? "",
          olcum.istenenSure ?? "",
          olcum.olculenIsi ?? "",
          olcum.olculenBasinc ?? "",
          olcum.olculenSure ?? "",
          "",
        ];
        values.forEach((v, i) => {
          const col = i + 1;
          const cell = row.getCell(col);
          cell.value = v;
          cell.border = allBorders;
          cell.alignment = { vertical: "middle", horizontal: col === 2 ? "left" : "center" };
        });
        row.height = olcum.ornekFoto ? 62 : 18;

        if (olcum.ornekFoto) {
          const match = /^data:image\/(png|jpe?g);base64,/i.exec(olcum.ornekFoto);
          const ext = match && /png/i.test(match[1]) ? "png" : "jpeg";
          const imageId = wb.addImage({ base64: olcum.ornekFoto, extension: ext });
          ws.addImage(imageId, {
            tl: { col: 10, row: rIdx - 1 },
            ext: { width: 70, height: 70 },
          });
        }
        rIdx += 1;
      }
      if (rIdx - 1 > startRow) {
        ws.mergeCells(startRow, 1, rIdx - 1, 1);
        ws.mergeCells(startRow, 2, rIdx - 1, 2);
        ws.mergeCells(startRow, 3, rIdx - 1, 3);
      }
      no += 1;
    }

    ws.views = [{ state: "frozen", ySplit: 4 }];
    await downloadWorkbook(wb, `isi-cubugu-kontrolu-${year}.xlsx`);
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5">
      {/* ─── Üst Bar ─────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tela Makinesi Isı Çubuğu Kontrolü</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasPermission("telaBakim") ? (
              <Link
                href="/dikim/tela-bakim"
                className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50"
              >
                Tela Makinesi Bakımı
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              Excel İndir
            </button>
          </div>
        </div>

        {/* Yıl */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Yıl</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setYear((y) => y - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                aria-label="Önceki yıl"
              >
                ‹
              </button>
              <span className="w-16 text-center text-sm font-bold text-slate-800 dark:text-slate-100">{year}</span>
              <button
                type="button"
                onClick={() => setYear((y) => y + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                aria-label="Sonraki yıl"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Kontrol Tablosu ─────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50 px-4 py-2.5 dark:border-slate-700/60 dark:bg-slate-800/60">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Tela Makinası Isı Çubuğu Kontrol Raporu
          </h2>
          <button
            type="button"
            onClick={addEntry}
            className="flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
            </svg>
            Satır Ekle
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Henüz kayıt yok. Yeni kontrol eklemek için &quot;Satır Ekle&quot; butonuna tıklayın.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2 text-center font-semibold">
                    No
                  </th>
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2 text-left font-semibold">
                    Model
                  </th>
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2 text-center font-semibold">
                    Tarih
                  </th>
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2 text-center font-semibold">
                    Pozisyon
                  </th>
                  <th colSpan={3} className="border-r border-b border-slate-600 px-2 py-1 text-center font-semibold">
                    İstenen Değerler
                    <div className="text-[9px] font-normal normal-case text-slate-300">Datasheette yazan değer</div>
                  </th>
                  <th colSpan={3} className="border-r border-b border-slate-600 px-2 py-1 text-center font-semibold">
                    Ölçülen Değerler
                    <div className="text-[9px] font-normal normal-case text-slate-300">Ölçümden sonra çıkan değer</div>
                  </th>
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2 text-center font-semibold">
                    Isı Çubuğu Uygulama Örneği
                    <div className="text-[9px] font-normal normal-case text-slate-300">Numune fotoğrafı</div>
                  </th>
                  <th rowSpan={2} className="w-8 px-1 py-2"></th>
                </tr>
                <tr className="bg-slate-800 text-white">
                  <th className="border-r border-slate-700 px-1 py-1.5 text-center font-semibold">Isı</th>
                  <th className="border-r border-slate-700 px-1 py-1.5 text-center font-semibold">Basınç</th>
                  <th className="border-r border-slate-700 px-1 py-1.5 text-center font-semibold">Süre</th>
                  <th className="border-r border-slate-700 px-1 py-1.5 text-center font-semibold">Isı</th>
                  <th className="border-r border-slate-700 px-1 py-1.5 text-center font-semibold">Basınç</th>
                  <th className="border-r border-slate-700 px-1 py-1.5 text-center font-semibold">Süre</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <EntryRows
                    key={entry.id}
                    entry={entry}
                    no={idx + 1}
                    productModels={productModels}
                    onEntryField={updateEntryField}
                    onNumber={updatePozisyonNumber}
                    onPhoto={updatePozisyonFoto}
                    onRemovePhoto={removePozisyonFoto}
                    onRemoveEntry={removeEntry}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EntryRows({
  entry,
  no,
  productModels,
  onEntryField,
  onNumber,
  onPhoto,
  onRemovePhoto,
  onRemoveEntry,
}: {
  entry: IsiCubuguEntry;
  no: number;
  productModels: ProductModelListItem[];
  onEntryField: (id: number, field: "model" | "tarih", value: string) => void;
  onNumber: (id: number, pozisyon: Pozisyon, field: NumericField, raw: string) => void;
  onPhoto: (id: number, pozisyon: Pozisyon, file: File | undefined | null) => void;
  onRemovePhoto: (id: number, pozisyon: Pozisyon) => void;
  onRemoveEntry: (id: number) => void;
}) {
  return (
    <>
      {POZISYONLAR.map((poz, i) => {
        const olcum = entry[poz.key];
        const isFirst = i === 0;
        return (
          <tr key={poz.key} className="border-b border-slate-100 dark:border-slate-800">
            {isFirst ? (
              <>
                <td
                  rowSpan={3}
                  className="border-r border-slate-200 px-2 py-1.5 text-center align-middle font-semibold text-slate-500 dark:border-slate-700"
                >
                  {no}
                </td>
                <td rowSpan={3} className="border-r border-slate-200 px-1 py-1 align-middle dark:border-slate-700">
                  <select
                    value={entry.model}
                    onChange={(e) => onEntryField(entry.id, "model", e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="">Model seçin…</option>
                    {entry.model && !productModels.some((m) => modelLabel(m) === entry.model) ? (
                      <option value={entry.model}>{entry.model}</option>
                    ) : null}
                    {productModels.map((m) => (
                      <option key={m.id} value={modelLabel(m)}>
                        {modelLabel(m)}
                      </option>
                    ))}
                  </select>
                </td>
                <td rowSpan={3} className="border-r border-slate-200 px-1 py-1 align-middle dark:border-slate-700">
                  <WeekdayDatePicker
                    value={entry.tarih}
                    onChange={(iso) => onEntryField(entry.id, "tarih", iso)}
                    includeWeekends
                    className="text-xs [&_button]:min-h-0 [&_button]:min-w-0 [&_button]:px-2 [&_button]:py-1.5 [&_button]:text-xs [&_svg]:h-3.5 [&_svg]:w-3.5"
                  />
                </td>
              </>
            ) : null}
            <td className="border-r border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {poz.label}
            </td>
            {(["istenenIsi", "istenenBasinc", "istenenSure", "olculenIsi", "olculenBasinc", "olculenSure"] as const).map(
              (field) => (
                <td key={field} className="border-r border-slate-200 px-1 py-1 dark:border-slate-700">
                  <input
                    type="number"
                    value={olcum[field] ?? ""}
                    onChange={(e) => onNumber(entry.id, poz.key, field, e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-center text-xs outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800"
                  />
                </td>
              )
            )}
            <td className="border-r border-slate-200 px-1 py-1 text-center dark:border-slate-700">
              {olcum.ornekFoto ? (
                <div className="relative mx-auto h-12 w-12">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={olcum.ornekFoto}
                    alt={`${poz.label} numune`}
                    className="h-12 w-12 rounded object-cover ring-1 ring-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(entry.id, poz.key)}
                    title="Fotoğrafı kaldır"
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold leading-none text-white shadow"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="mx-auto flex h-12 w-12 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 transition hover:border-teal-400 hover:text-teal-500 dark:border-slate-600">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      void onPhoto(entry.id, poz.key, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                  </svg>
                </label>
              )}
            </td>
            {isFirst ? (
              <td rowSpan={3} className="px-1 py-1 text-center align-middle">
                <button
                  type="button"
                  onClick={() => onRemoveEntry(entry.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  title="Kaydı sil"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </td>
            ) : null}
          </tr>
        );
      })}
    </>
  );
}
