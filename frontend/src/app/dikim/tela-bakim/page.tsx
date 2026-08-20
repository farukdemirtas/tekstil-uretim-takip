"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { hasPermission, isAdminRole } from "@/lib/permissions";
import { loadExcelJS, downloadWorkbook } from "@/lib/exceljsLazy";
import type { Border } from "exceljs";
import {
  MONTH_NAMES,
  DAYS_IN_GRID,
  daysInMonth,
  dayKey,
  TELA_BAKIM_NOTE,
  loadTelaBakimPayload,
  persistTelaBakimPayload,
} from "@/lib/telaBakim";
import { isOfficialHolidayMonthDay, isWeekendMonthDay } from "@/lib/turkishHolidays";

const DAY_COLUMNS = Array.from({ length: DAYS_IN_GRID }, (_, i) => i + 1);

export default function TelaBakimPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [makineAdi, setMakineAdi] = useState("");
  const [sorumlu, setSorumlu] = useState("");
  const [days, setDays] = useState<Record<string, boolean>>({});
  const [monthlyNotes, setMonthlyNotes] = useState<Record<number, string>>({});
  const [blockWeekendHoliday, setBlockWeekendHoliday] = useState(true);

  /* ── Auth ──────────────────────────────────────────────── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!isAdminRole() && !hasPermission("telaBakim")) {
      router.replace("/");
      return;
    }
    setAuthorized(true);
  }, [router]);

  /* ── Veri yükle (yıl değişince) ────────────────────────── */
  useEffect(() => {
    if (!authorized) return;
    const payload = loadTelaBakimPayload(year);
    setMakineAdi(payload.makineAdi);
    setSorumlu(payload.sorumlu);
    setDays(payload.days);
    setMonthlyNotes(payload.monthlyNotes);
    setBlockWeekendHoliday(payload.blockWeekendHoliday);
  }, [authorized, year]);

  function persist(next: {
    makineAdi?: string;
    sorumlu?: string;
    days?: Record<string, boolean>;
    monthlyNotes?: Record<number, string>;
    blockWeekendHoliday?: boolean;
  }) {
    persistTelaBakimPayload(year, {
      makineAdi: next.makineAdi ?? makineAdi,
      sorumlu: next.sorumlu ?? sorumlu,
      days: next.days ?? days,
      monthlyNotes: next.monthlyNotes ?? monthlyNotes,
      blockWeekendHoliday: next.blockWeekendHoliday ?? blockWeekendHoliday,
    });
  }

  function updateMakineAdi(value: string) {
    setMakineAdi(value);
    persist({ makineAdi: value });
  }

  function updateSorumlu(value: string) {
    setSorumlu(value);
    persist({ sorumlu: value });
  }

  function toggleDay(monthIndex: number, day: number) {
    if (
      blockWeekendHoliday &&
      (isWeekendMonthDay(year, monthIndex + 1, day) || isOfficialHolidayMonthDay(year, monthIndex + 1, day))
    )
      return;
    const key = dayKey(monthIndex, day);
    setDays((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persist({ days: next });
      return next;
    });
  }

  function updateBlockWeekendHoliday(value: boolean) {
    setBlockWeekendHoliday(value);
    persist({ blockWeekendHoliday: value });
  }

  function updateMonthlyNote(monthIndex: number, value: string) {
    setMonthlyNotes((prev) => {
      const next = { ...prev, [monthIndex]: value };
      persist({ monthlyNotes: next });
      return next;
    });
  }

  /* ── Excel dışa aktarım ───────────────────────────────── */
  async function exportExcel() {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tela Bakım");

    const thin: Partial<Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
    const totalCols = 1 + DAYS_IN_GRID;

    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `TELA MAKİNESİ BAKIM FORMU — GÜNLÜK BAKIM (${year})`;
    titleCell.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(1).height = 26;

    const infoRow = ws.getRow(2);
    infoRow.getCell(1).value = "Makine Adı/No";
    infoRow.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
    infoRow.getCell(2).value = makineAdi || "—";
    infoRow.getCell(2).font = { bold: true };
    infoRow.getCell(4).value = "Sorumlu";
    infoRow.getCell(4).font = { bold: true, color: { argb: "FF475569" } };
    infoRow.getCell(5).value = sorumlu || "—";
    infoRow.getCell(5).font = { bold: true };

    const headerRowIdx = 4;
    const headerRow = ws.getRow(headerRowIdx);
    headerRow.getCell(1).value = "AY / GÜN";
    DAY_COLUMNS.forEach((d, i) => {
      headerRow.getCell(i + 2).value = d;
    });
    for (let c = 1; c <= totalCols; c++) {
      const cell = headerRow.getCell(c);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.border = allBorders;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
    headerRow.height = 20;

    ws.getColumn(1).width = 12;
    for (let i = 0; i < DAYS_IN_GRID; i++) ws.getColumn(i + 2).width = 3.4;

    let rIdx = headerRowIdx + 1;
    MONTH_NAMES.forEach((monthName, monthIndex) => {
      const row = ws.getRow(rIdx);
      const monthCell = row.getCell(1);
      monthCell.value = monthName.toLocaleUpperCase("tr");
      monthCell.font = { bold: true, color: { argb: "FF1E293B" } };
      monthCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      monthCell.border = allBorders;
      monthCell.alignment = { vertical: "middle", horizontal: "left" };

      const validDays = daysInMonth(year, monthIndex);
      DAY_COLUMNS.forEach((day, i) => {
        const cell = row.getCell(i + 2);
        cell.border = allBorders;
        cell.alignment = { vertical: "middle", horizontal: "center" };
        if (day > validDays) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
          cell.value = "";
          return;
        }
        const isHoliday = isOfficialHolidayMonthDay(year, monthIndex + 1, day);
        const isWeekend = !isHoliday && isWeekendMonthDay(year, monthIndex + 1, day);
        const checked = !!days[dayKey(monthIndex, day)];
        if (blockWeekendHoliday && (isHoliday || isWeekend)) {
          cell.value = "×";
          cell.font = { bold: true, color: { argb: "FFD97706" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
          return;
        }
        if (checked) {
          cell.value = "✓";
          cell.font = { bold: true, color: { argb: "FF059669" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
        } else if (isHoliday || isWeekend) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
        }
      });
      rIdx += 1;
    });

    rIdx += 1;
    ws.mergeCells(rIdx, 1, rIdx, totalCols);
    const noteCell = ws.getCell(rIdx, 1);
    noteCell.value = TELA_BAKIM_NOTE;
    noteCell.font = { italic: true, color: { argb: "FF475569" }, size: 10 };
    noteCell.alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(rIdx).height = 30;
    rIdx += 2;

    ws.mergeCells(rIdx, 1, rIdx, totalCols);
    const notesTitleCell = ws.getCell(rIdx, 1);
    notesTitleCell.value = "AYLIK BAKIM NOTLARI";
    notesTitleCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    notesTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    notesTitleCell.alignment = { vertical: "middle", horizontal: "center" };
    rIdx += 1;

    MONTH_NAMES.forEach((monthName, monthIndex) => {
      const row = ws.getRow(rIdx);
      const labelCell = row.getCell(1);
      labelCell.value = monthName;
      labelCell.font = { bold: true };
      labelCell.border = allBorders;
      labelCell.alignment = { vertical: "middle" };
      ws.mergeCells(rIdx, 2, rIdx, totalCols);
      const noteValCell = ws.getCell(rIdx, 2);
      noteValCell.value = monthlyNotes[monthIndex] || "";
      noteValCell.border = allBorders;
      noteValCell.alignment = { vertical: "middle", wrapText: true };
      rIdx += 1;
    });

    ws.views = [{ state: "frozen", ySplit: headerRowIdx }];
    await downloadWorkbook(wb, `tela-bakim-${year}.xlsx`);
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
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tela Makinesi Bakım Formu</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasPermission("isiCubuguKontrolu") ? (
              <Link
                href="/dikim/isi-cubugu-kontrolu"
                className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-700 shadow-sm transition hover:bg-orange-50"
              >
                Isı Çubuğu Kontrolü
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void exportExcel()}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              Excel İndir
            </button>
          </div>
        </div>

        {/* Yıl · Makine Adı · Sorumlu */}
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
          <div className="flex min-w-[180px] flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Makine Adı / No</label>
            <input
              type="text"
              value={makineAdi}
              onChange={(e) => updateMakineAdi(e.target.value.toLocaleUpperCase("tr"))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex min-w-[180px] flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sorumlu</label>
            <input
              type="text"
              value={sorumlu}
              onChange={(e) => updateSorumlu(e.target.value.toLocaleUpperCase("tr"))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* ─── Günlük Bakım Takvimi ────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50 px-4 py-2.5 dark:border-slate-700/60 dark:bg-slate-800/60">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Günlük Bakım</h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <button
              type="button"
              role="switch"
              aria-checked={blockWeekendHoliday}
              onClick={() => updateBlockWeekendHoliday(!blockWeekendHoliday)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                blockWeekendHoliday ? "bg-teal-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                  blockWeekendHoliday ? "left-4" : "left-0.5"
                }`}
              />
            </button>
            Hafta sonu/resmi tatilde işaretlemeyi engelle
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
            <colgroup>
              <col className="w-16" />
              {DAY_COLUMNS.map((d) => (
                <col key={d} className="w-7" />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="sticky left-0 z-10 border-r border-slate-600 bg-slate-800 px-2 py-2 text-left font-semibold whitespace-nowrap">
                  Ay/Gün
                </th>
                {DAY_COLUMNS.map((d) => (
                  <th key={d} className="border-r border-slate-700 px-0 py-2 text-center font-semibold">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTH_NAMES.map((monthName, monthIndex) => {
                const validDays = daysInMonth(year, monthIndex);
                return (
                  <tr key={monthName} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-2 py-1 font-semibold whitespace-nowrap text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
                      {monthName}
                    </td>
                    {DAY_COLUMNS.map((day) => {
                      const valid = day <= validDays;
                      const checked = !!days[dayKey(monthIndex, day)];
                      const isHoliday = valid && isOfficialHolidayMonthDay(year, monthIndex + 1, day);
                      const isWeekend = valid && !isHoliday && isWeekendMonthDay(year, monthIndex + 1, day);
                      const isSpecial = isHoliday || isWeekend;
                      const blocked = blockWeekendHoliday && isSpecial;
                      return (
                        <td key={day} className="border-r border-slate-100 p-0.5 text-center dark:border-slate-800">
                          {!valid ? (
                            <div className="mx-auto h-5 w-5 rounded bg-slate-100 dark:bg-slate-800/60" />
                          ) : blocked ? (
                            <div
                              title={`${day} ${monthName} — ${isHoliday ? "resmi tatil" : "hafta sonu"}`}
                              className="mx-auto flex h-5 w-5 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-400 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-700"
                            >
                              <svg width="8" height="8" viewBox="0 0 20 20" fill="none" aria-hidden>
                                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                              </svg>
                            </div>
                          ) : (
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              title={
                                checked
                                  ? `${day} ${monthName} — bakım yapıldı`
                                  : `${day} ${monthName}${isSpecial ? ` (${isHoliday ? "resmi tatil" : "hafta sonu"})` : ""} — bakım işaretle`
                              }
                              onClick={() => toggleDay(monthIndex, day)}
                              className={`mx-auto flex h-5 w-5 items-center justify-center rounded border transition ${
                                checked
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : isSpecial
                                    ? "border-amber-200 bg-amber-50 text-transparent hover:border-emerald-300 dark:border-amber-900/50 dark:bg-amber-950/20"
                                    : "border-slate-300 bg-white text-transparent hover:border-emerald-300"
                              }`}
                            >
                              <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden>
                                <path
                                  d="M4 10.5L8 14.5L16 5.5"
                                  stroke="currentColor"
                                  strokeWidth="2.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-200/80 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
          {blockWeekendHoliday ? (
            <span className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
                <svg width="7" height="7" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-amber-400 dark:text-amber-700" />
                </svg>
              </span>
              Hafta sonu / resmi tatil — işaretlenemez
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="h-4 w-4 rounded border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20" />
              Hafta sonu / resmi tatil — işaretlenebilir
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="h-4 w-4 rounded bg-slate-100 dark:bg-slate-800/60" />
            Ayda bu gün yok
          </span>
        </div>
        <p className="border-t border-slate-200/80 px-4 py-3 text-xs italic text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
          {TELA_BAKIM_NOTE}
        </p>
      </div>

      {/* ─── Aylık Bakım Notları ─────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="border-b border-slate-200/80 bg-slate-50 px-4 py-2.5 dark:border-slate-700/60 dark:bg-slate-800/60">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Aylık Bakım Notları</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {MONTH_NAMES.map((monthName, monthIndex) => (
            <div key={monthName} className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{monthName}</label>
              <textarea
                value={monthlyNotes[monthIndex] ?? ""}
                onChange={(e) => updateMonthlyNote(monthIndex, e.target.value)}
                rows={2}
                className="resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Bu ay yapılan bakım / not…"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
