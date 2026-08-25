"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getProduction, getDayProductMeta, setAuthToken } from "@/lib/api";
import type { DayProductMeta } from "@/lib/api";
import type { ProductionRow } from "@/lib/types";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import { loadExcelJS, downloadWorkbook } from "@/lib/exceljsLazy";
import type { Border } from "exceljs";
import {
  DEFECT_TYPES,
  ARA_KONTROL_STORAGE_PREFIX,
  type AraKontrolRow,
  type AraKontrolMode,
  loadAraKontrolPayload,
  emptyDefects,
  sumDefects,
  hataOrani,
  pctColor,
  pctBg,
} from "@/lib/araKontrol";

/* ══════════════════════════════════════════════════════════
   Sayfa
══════════════════════════════════════════════════════════ */
export default function AraKontrolHataRaporPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayWeekdayIso);
  /* Otomatik (üretimden çekilen) ve Manuel (tek tek eklenen) veriler ayrı ayrı tutulur */
  const [autoRows, setAutoRows] = useState<AraKontrolRow[]>([]);
  const [manualRows, setManualRows] = useState<AraKontrolRow[]>([]);
  const [viewMode, setViewMode] = useState<AraKontrolMode>("auto");
  const [dayMeta, setDayMeta] = useState<DayProductMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDates, setSavedDates] = useState<string[]>([]);

  /* ── Auth ──────────────────────────────────────────────── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!isAdminRole() && !hasPermission("hataRapor") && !hasPermission("araKontrol")) {
      router.replace("/");
      return;
    }
    setAuthToken(token);
    setAuthorized(true);

    const dates: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(ARA_KONTROL_STORAGE_PREFIX)) {
        dates.push(k.replace(ARA_KONTROL_STORAGE_PREFIX, ""));
      }
    }
    dates.sort((a, b) => b.localeCompare(a));
    setSavedDates(dates);
  }, [router]);

  /* ── Veri yükle ────────────────────────────────────────── */
  useEffect(() => {
    if (!authorized) return;
    void loadData(selectedDate);
  }, [selectedDate, authorized]);

  async function loadData(date: string) {
    setLoading(true);
    setError(null);
    try {
      const [production, meta] = await Promise.allSettled([getProduction(date), getDayProductMeta(date)]);
      setDayMeta(meta.status === "fulfilled" ? meta.value : null);
      const productionRows: ProductionRow[] = production.status === "fulfilled" ? production.value : [];
      const payload = loadAraKontrolPayload(date);

      /* Otomatik mod verisi: üretimden gelen personel + üretim listesine elle eklenenler */
      const excludedSet = new Set(payload.excludedIds ?? []);
      const fromProduction: AraKontrolRow[] = productionRows
        .filter((p) => !excludedSet.has(p.workerId))
        .map((p) => {
          const saved = payload.kontrolData[p.workerId];
          return {
            workerId: p.workerId,
            name: p.name,
            process: p.process,
            team: p.team,
            kontrolEdilenAdet: saved?.kontrolEdilenAdet ?? 0,
            kontrolTekrarSayisi: saved?.kontrolTekrarSayisi ?? 0,
            defects: { ...emptyDefects(), ...saved?.defects },
            note: saved?.note ?? "",
            kritikOperasyon: saved?.kritikOperasyon ?? false,
          };
        });
      const extraWorkerRows: AraKontrolRow[] = (payload.extraWorkers ?? []).map((w) => {
        const saved = payload.kontrolData[w.workerId];
        return {
          ...w,
          kontrolEdilenAdet: saved?.kontrolEdilenAdet ?? 0,
          kontrolTekrarSayisi: saved?.kontrolTekrarSayisi ?? 0,
          defects: { ...emptyDefects(), ...saved?.defects },
          note: saved?.note ?? "",
          manual: true,
          kritikOperasyon: saved?.kritikOperasyon ?? false,
        };
      });
      setAutoRows([...fromProduction, ...extraWorkerRows]);

      /* Manuel mod verisi: tek tek eklenen serbest satırlar — otomatik veriden ayrı tutulur */
      const freeRows: AraKontrolRow[] = (payload.freeRows ?? []).map((w) => {
        const saved = payload.kontrolData[w.workerId];
        return {
          workerId: w.workerId,
          name: w.name,
          process: w.process,
          team: "",
          kontrolEdilenAdet: saved?.kontrolEdilenAdet ?? 0,
          kontrolTekrarSayisi: saved?.kontrolTekrarSayisi ?? 0,
          defects: { ...emptyDefects(), ...saved?.defects },
          note: saved?.note ?? "",
          manual: true,
          kritikOperasyon: saved?.kritikOperasyon ?? false,
        };
      });
      setManualRows(freeRows);

      setViewMode(payload.mode ?? "auto");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  /* ── Hesaplamalar ──────────────────────────────────────── */
  /* Otomatik ve manuel mod verileri birbirine karışmadan ayrı ayrı tutulur; sekme ile seçilir */
  const rows = viewMode === "manual" ? manualRows : autoRows;
  const totalErrors = rows.reduce((acc, r) => acc + sumDefects(r.defects), 0);
  const totalAdet = rows.reduce((acc, r) => acc + r.kontrolEdilenAdet, 0);
  const overallPct = totalAdet > 0 ? (totalErrors / totalAdet) * 100 : 0;
  const hatasizCount = rows.filter((r) => sumDefects(r.defects) === 0).length;
  const hatalıCount = rows.length - hatasizCount;

  const defectTotals = DEFECT_TYPES.map((d) => ({
    ...d,
    total: rows.reduce((acc, r) => acc + (r.defects[d.key] || 0), 0),
  })).sort((a, b) => b.total - a.total);

  function topDefectLabel(defects: Record<string, number>): string {
    let best: { label: string; n: number } | null = null;
    for (const d of DEFECT_TYPES) {
      const n = defects[d.key] || 0;
      if (n > 0 && (!best || n > best.n)) best = { label: d.short, n };
    }
    return best ? `${best.label} (${best.n})` : "—";
  }

  const sortedByError = [...rows].sort((a, b) => sumDefects(b.defects) - sumDefects(a.defects));
  const topHatalı = sortedByError[0];

  /* ── Excel export — ekrandaki tablolarla aynı görünüm (kenarlık, renk) ── */
  async function exportExcel() {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();

    const thin: Partial<Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
    const pctArgbOf = (p: number) => (p === 0 ? "FF059669" : p < 10 ? "FFD97706" : "FFDC2626");

    /* ─── Sayfa 1 — Personel Detay ─────────────────────────── */
    const ws1 = wb.addWorksheet("Personel Detay");
    const urunStr = [dayMeta?.productModel, dayMeta?.productName].filter(Boolean).join(" — ");
    const infoLines1: [string, string | number][] = [
      ["Tarih", selectedDate],
      ["Veri Girişi", viewMode === "manual" ? "Manuel (Tek Tek Ekle)" : "Otomatik (Üretimden Çek)"],
      ["Ürün", urunStr || "—"],
      ["Toplam Personel", rows.length],
      ["Toplam Kontrol Edilen Adet", totalAdet],
      ["Toplam Hata", totalErrors],
      ["Genel Hata Oranı", `%${overallPct.toFixed(1)}`],
    ];
    infoLines1.forEach(([label, value], i) => {
      const r = ws1.getRow(i + 1);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
      r.getCell(2).value = value;
    });

    const header1Idx = infoLines1.length + 2;
    const header1 = [
      "Sıra",
      "Ad Soyad",
      "Bölüm",
      "Proses",
      "Kontrol Edilen Adet",
      "Kontrol Tekrar Sayısı",
      ...DEFECT_TYPES.map((d) => d.label),
      "Toplam Hata",
      "Hata %",
      "Açıklama",
    ];
    const colToplam1 = 6 + DEFECT_TYPES.length + 1;
    const colHataPct1 = colToplam1 + 1;
    const leftAlign1 = new Set([2, 3, 4, header1.length]);
    const headerRow1 = ws1.getRow(header1Idx);
    header1.forEach((h, i) => {
      const cell = headerRow1.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.border = allBorders;
      cell.alignment = { vertical: "middle", horizontal: leftAlign1.has(i + 1) ? "left" : "center", wrapText: true };
    });
    ws1.getColumn(1).width = 6;
    ws1.getColumn(2).width = 22;
    ws1.getColumn(3).width = 16;
    ws1.getColumn(4).width = 18;
    ws1.getColumn(5).width = 12;
    ws1.getColumn(6).width = 12;
    DEFECT_TYPES.forEach((_, i) => (ws1.getColumn(7 + i).width = 11));
    ws1.getColumn(colToplam1).width = 11;
    ws1.getColumn(colHataPct1).width = 9;
    ws1.getColumn(header1.length).width = 24;

    sortedByError.forEach((r, idx) => {
      const rowIdx = header1Idx + 1 + idx;
      const total = sumDefects(r.defects);
      const pct = parseFloat(hataOrani(total, r.kontrolEdilenAdet));
      const excelRow = ws1.getRow(rowIdx);
      const values: (string | number)[] = [
        idx + 1,
        r.name,
        r.team,
        r.process,
        r.kontrolEdilenAdet,
        r.kontrolTekrarSayisi,
        ...DEFECT_TYPES.map((d) => r.defects[d.key] || 0),
        total,
        pct,
        r.note,
      ];
      values.forEach((v, i) => {
        const col = i + 1;
        const cell = excelRow.getCell(col);
        cell.value = v;
        cell.border = allBorders;
        cell.alignment = { vertical: "middle", horizontal: leftAlign1.has(col) ? "left" : "center" };
        const isDefectCol = col >= 7 && col <= 6 + DEFECT_TYPES.length;
        if (r.manual) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF5FF" } };
        }
        if (isDefectCol && (Number(v) || 0) > 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1F2" } };
          cell.font = { color: { argb: "FFE11D48" }, bold: true };
        }
        if (col === colToplam1 || col === colHataPct1) {
          cell.font = { bold: true, color: { argb: pctArgbOf(pct) } };
          if (col === colHataPct1) cell.numFmt = '"%"0.0';
        }
      });
    });
    ws1.views = [{ state: "frozen", ySplit: header1Idx }];

    /* ─── Sayfa 2 — Hata Tipi Özeti ─────────────────────────── */
    const ws2 = wb.addWorksheet("Hata Tipi Özeti");
    const header2 = ["Hata Tipi", "Toplam", "Yüzde (Genel Hatadan)"];
    header2.forEach((h, i) => {
      const cell = ws2.getRow(1).getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.border = allBorders;
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center" };
    });
    ws2.getColumn(1).width = 32;
    ws2.getColumn(2).width = 12;
    ws2.getColumn(3).width = 20;
    defectTotals.forEach((d, idx) => {
      const rowIdx = idx + 2;
      const pct = totalErrors > 0 ? (d.total / totalErrors) * 100 : 0;
      const row = ws2.getRow(rowIdx);
      row.getCell(1).value = d.label;
      row.getCell(2).value = d.total;
      row.getCell(3).value = pct;
      row.getCell(3).numFmt = '"%"0.0';
      [1, 2, 3].forEach((col) => {
        const cell = row.getCell(col);
        cell.border = allBorders;
        cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
      });
      if (d.total > 0) {
        row.getCell(2).font = { bold: true, color: { argb: "FFE11D48" } };
        row.getCell(3).font = { bold: true, color: { argb: "FF475569" } };
      }
    });

    await downloadWorkbook(wb, `ara_kontrol_hata_rapor_${viewMode}_${selectedDate}.xlsx`);
  }

  /* ── Render ────────────────────────────────────────────── */
  if (!authorized) return null;

  const urunLabel = [dayMeta?.productModel, dayMeta?.productName].filter(Boolean).join(" — ");

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5">
      {/* ─── Üst Bar ─────────────────────────────────────── */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link
              href="/ara-kontrol"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">Ara Kontrol — Hata Rapor Analiz</h1>
              <p className="truncate text-[11px] text-slate-500 sm:text-xs">
                Hat içi (in-line) kontrol uygunsuzluk sonuçları · personel &amp; hata tipi bazlı analiz
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={exportExcel}
            disabled={rows.length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
            Excel İndir
          </button>
        </div>

        {/* Veri Girişi sekmesi — Otomatik / Manuel verisi ayrı ayrı gösterilir */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Veri Girişi</span>
          <div className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode("auto")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "auto" ? "bg-teal-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Otomatik ({autoRows.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("manual")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "manual" ? "bg-teal-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Manuel ({manualRows.length})
            </button>
          </div>
          <span className="text-xs text-slate-400">
            Otomatik ve manuel girilen veriler birbirinden ayrı tutulur; aşağıdaki analiz seçili sekmeye aittir.
          </span>
        </div>

        {/* Tarih + Ürün */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tarih</label>
            <WeekdayDatePicker value={selectedDate} onChange={setSelectedDate} />
          </div>
          <div className="flex min-w-[200px] flex-1 basis-full flex-col gap-1 sm:basis-auto">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Çalışılan Ürün</label>
            <div className="flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {urunLabel ? <span className="font-medium text-slate-800">{urunLabel}</span> : <span className="text-slate-400">—</span>}
            </div>
          </div>

          {/* Kayıtlı tarihler hızlı seçim */}
          {savedDates.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Kayıtlı Günler</label>
              <div className="flex flex-wrap gap-1.5">
                {savedDates.slice(0, 10).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      d === selectedDate ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Hata / Yükleniyor ───────────────────────────── */}
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">⚠ {error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500">Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="text-slate-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V8l-5-5H5a2 2 0 00-2 2v13a2 2 0 002 2z" />
          </svg>
          <p>
            Bu tarihte {viewMode === "manual" ? "manuel" : "otomatik"} modda kontrol kaydı bulunamadı.
          </p>
          <p className="text-xs">Önce Ara Kontrol sayfasından veri girişi yapın veya diğer sekmeyi deneyin.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* ─── Özet Kartları ─────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label="Toplam Personel" value={String(rows.length)} sub="kontrol edildi" color="slate" />
            <SummaryCard
              label="Toplam Hata"
              value={String(totalErrors)}
              sub={`/ ${totalAdet} adet`}
              color={totalErrors === 0 ? "emerald" : totalErrors < 10 ? "amber" : "red"}
            />
            <SummaryCard
              label="Genel Hata Oranı"
              value={`%${overallPct.toFixed(1)}`}
              sub={`${rows.length} personel`}
              color={overallPct === 0 ? "emerald" : overallPct < 10 ? "amber" : "red"}
            />
            <SummaryCard label="Hatasız Personel" value={String(hatasizCount)} sub={`${hatalıCount} personelde hata var`} color="emerald" />
            <SummaryCard
              label="En Çok Hata"
              value={topHatalı && sumDefects(topHatalı.defects) > 0 ? String(sumDefects(topHatalı.defects)) : "—"}
              sub={topHatalı && sumDefects(topHatalı.defects) > 0 ? topHatalı.name : "Hata yok"}
              color={topHatalı && sumDefects(topHatalı.defects) > 0 ? "red" : "emerald"}
            />
          </div>

          {/* ─── Hata Tipi Bazlı Özet ────────────────────── */}
          <Section
            title="Hata Tipi Bazlı Özet"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          >
            <div className="touch-pan-x overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-4 py-2.5 text-left font-semibold">Hata Tipi</th>
                    <th className="px-4 py-2.5 text-center font-semibold">Toplam</th>
                    <th className="px-4 py-2.5 text-center font-semibold">Genel Hatadan Yüzde</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Görsel</th>
                  </tr>
                </thead>
                <tbody>
                  {defectTotals
                    .filter((d) => d.total > 0)
                    .map((d) => {
                      const p = totalErrors > 0 ? (d.total / totalErrors) * 100 : 0;
                      return (
                        <tr key={d.key} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-semibold text-slate-700" title={d.label}>
                            {d.label}
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-rose-600">{d.total}</td>
                          <td className="px-4 py-2.5 text-center font-bold tabular-nums text-slate-600">%{p.toFixed(1)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex h-5 w-48 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${Math.min(100, p)}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  {defectTotals.every((d) => d.total === 0) && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                        Bu tarihte kaydedilmiş hata yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ─── Personel Bazlı Tablo ───────────────────── */}
          <Section
            title="Personel Bazlı Hata Analizi"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          >
            <div className="touch-pan-x overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 980 }}>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-2 py-2.5 text-center font-bold">Sıra</th>
                    <th className="px-3 py-2.5 text-left font-bold">Ad Soyad</th>
                    <th className="px-2 py-2.5 text-left font-bold">Bölüm</th>
                    <th className="px-2 py-2.5 text-left font-bold">Proses</th>
                    <th className="border-l border-slate-700 px-2 py-2.5 text-center font-bold">Kontrol Adedi</th>
                    <th className="px-2 py-2.5 text-left font-bold">En Sık Hata</th>
                    <th className="border-l border-slate-700 px-2 py-2.5 text-center font-bold">Toplam</th>
                    <th className="px-2 py-2.5 text-center font-bold">%</th>
                    <th className="px-3 py-2.5 text-left font-bold">Görsel</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByError.map((row, idx) => {
                    const total = sumDefects(row.defects);
                    const p = parseFloat(hataOrani(total, row.kontrolEdilenAdet));
                    return (
                      <tr
                        key={row.workerId}
                        className={`border-b border-slate-200 align-middle transition-colors ${
                          total > 0 ? "hover:bg-red-50/30" : "hover:bg-emerald-50/30"
                        }`}
                      >
                        <td className="px-2 py-2 text-center tabular-nums text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {row.name}
                          {row.manual && (
                            <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold text-violet-600">EL</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-500">{row.team}</td>
                        <td className="px-2 py-2 text-slate-500">{row.process}</td>
                        <td className="border-l border-slate-100 px-2 py-2 text-center tabular-nums text-slate-600">
                          {row.kontrolEdilenAdet || "—"}
                        </td>
                        <td className="px-2 py-2 text-slate-500">{topDefectLabel(row.defects)}</td>
                        <td className={`border-l border-slate-200 px-2 py-2 text-center text-sm font-bold tabular-nums ${pctColor(p)}`}>
                          {total}
                        </td>
                        <td className={`px-2 py-2 text-center text-sm font-bold tabular-nums ${pctColor(p)}`}>%{hataOrani(total, row.kontrolEdilenAdet)}</td>
                        <td className="px-3 py-2">
                          <div className="flex h-4 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${total > 0 ? pctBg(p) : "bg-emerald-400"}`}
                              style={{ width: total > 0 ? `${Math.min(100, p)}%` : "100%" }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Toplam satırı */}
                <tfoot>
                  <tr className="bg-slate-800 text-white">
                    <td colSpan={4} className="px-3 py-2.5 text-sm font-bold">
                      TOPLAM
                    </td>
                    <td className="border-l border-slate-700 px-2 py-2.5 text-center text-xs font-bold text-amber-300">{totalAdet}</td>
                    <td className="px-2 py-2.5" />
                    <td className="border-l border-slate-700 px-2 py-2.5 text-center text-sm font-bold text-amber-300">{totalErrors}</td>
                    <td className={`px-2 py-2.5 text-center text-sm font-bold ${pctColor(overallPct)}`}>%{overallPct.toFixed(1)}</td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          {/* ─── Hatalı Personel Sıralama ───────────────── */}
          {hatalıCount > 0 && (
            <Section
              title="Hata Sıralaması (Yüksekten Düşüğe)"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              }
            >
              <div className="flex flex-col gap-2 p-1">
                {sortedByError
                  .filter((r) => sumDefects(r.defects) > 0)
                  .map((row, idx) => {
                    const total = sumDefects(row.defects);
                    const p = parseFloat(hataOrani(total, row.kontrolEdilenAdet));
                    const barPct = Math.min(100, p);
                    return (
                      <div key={row.workerId} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 sm:gap-3 sm:px-4">
                        <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-400 sm:w-6">{idx + 1}</span>
                        <div className="w-20 shrink-0 sm:w-36">
                          <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                          <p className="truncate text-xs text-slate-400">
                            {row.team} · {row.process}
                          </p>
                        </div>
                        <div className="flex-1">
                          <div className="flex h-5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`flex h-full items-center justify-end overflow-hidden rounded-full pr-1.5 text-[10px] font-bold text-white transition-all ${pctBg(p)}`}
                              style={{ width: `${Math.max(barPct, 8)}%` }}
                            >
                              {barPct > 15 ? total : ""}
                            </div>
                          </div>
                        </div>
                        <span className={`w-14 text-right text-sm font-bold tabular-nums ${pctColor(p)}`}>%{hataOrani(total, row.kontrolEdilenAdet)}</span>
                        <span className={`w-10 text-right text-sm font-bold tabular-nums ${pctColor(p)}`}>{total}</span>
                      </div>
                    );
                  })}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Alt Bileşenler ─────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "slate" | "emerald" | "amber" | "red";
}) {
  const border = {
    slate: "border-slate-200",
    emerald: "border-emerald-200",
    amber: "border-amber-200",
    red: "border-red-200",
  }[color];
  const valueCls = {
    slate: "text-slate-800",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  }[color];
  return (
    <div className={`rounded-2xl border ${border} bg-white px-4 py-3 shadow-sm`}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-slate-600">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
