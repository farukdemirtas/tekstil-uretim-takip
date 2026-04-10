"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  getTeams,
  getWorkerProductionDailyDetail,
  getWorkers,
  setAuthToken,
} from "@/lib/api";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";
import { SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import type { Worker, WorkerProductionDayDetail } from "@/lib/types";

const SLOTS = [
  { key: "t1000" as const, label: "10:00" },
  { key: "t1300" as const, label: "13:00" },
  { key: "t1600" as const, label: "16:00" },
  { key: "t1830" as const, label: "18:30" },
];

function dayTotal(r: WorkerProductionDayDetail): number {
  return r.t1000 + r.t1300 + r.t1600 + r.t1830;
}

function formatDateLong(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("tr-TR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function PersonAnalysisPage() {
  const pdfCaptureRef = useRef<HTMLDivElement>(null);
  const chartGradientId = `ptrend-${useId().replace(/:/g, "")}`;
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate] = useState(todayWeekdayIso());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [teamLabels, setTeamLabels] = useState<Record<string, string>>({});
  const [workerId, setWorkerId] = useState<number | "">("");
  const [rows, setRows] = useState<WorkerProductionDayDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string>("");

  const teamLabel = useCallback(
    (code: string) => teamLabels[code] ?? code,
    [teamLabels]
  );

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("analysis")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    void getTeams()
      .then((t) => setTeamLabels(Object.fromEntries(t.map((x) => [x.code, x.label]))))
      .catch(() => {});
    void getWorkers()
      .then((w) => {
        setWorkers(w);
        if (w.length && workerId === "") setWorkerId(w[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (workerId === "") {
      setError("Lütfen personel seçin.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getWorkerProductionDailyDetail({
        workerId: Number(workerId),
        startDate,
        endDate,
      });
      setRows(data);
      setLoadedAt(new Date().toLocaleString("tr-TR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workerId, startDate, endDate]);

  const meta = rows[0];

  const stats = useMemo(() => {
    if (rows.length === 0) {
      return {
        grandTotal: 0,
        activeDays: 0,
        avgPerDay: 0,
        avgPerNominalShift: 0,
        maxDay: null as null | { date: string; total: number },
        minDay: null as null | { date: string; total: number },
        slotTotals: { t1000: 0, t1300: 0, t1600: 0, t1830: 0 },
        slotAvgPerDay: { t1000: 0, t1300: 0, t1600: 0, t1830: 0 },
        dominantSlot: SLOTS[0].label,
        dominantSlotTotal: 0,
      };
    }
    const n = rows.length;
    let grandTotal = 0;
    const slotTotals = { t1000: 0, t1300: 0, t1600: 0, t1830: 0 };
    let maxDay: { date: string; total: number } | null = null;
    let minDay: { date: string; total: number } | null = null;
    for (const r of rows) {
      const t = dayTotal(r);
      grandTotal += t;
      slotTotals.t1000 += r.t1000;
      slotTotals.t1300 += r.t1300;
      slotTotals.t1600 += r.t1600;
      slotTotals.t1830 += r.t1830;
      if (!maxDay || t > maxDay.total) maxDay = { date: r.productionDate, total: t };
      if (!minDay || t < minDay.total) minDay = { date: r.productionDate, total: t };
    }
    const avgPerDay = Math.round(grandTotal / n);
    const avgPerNominalShift = Math.round(grandTotal / SHIFT_NOMINAL_HOURS / n);
    const slotAvgPerDay = {
      t1000: Math.round(slotTotals.t1000 / n),
      t1300: Math.round(slotTotals.t1300 / n),
      t1600: Math.round(slotTotals.t1600 / n),
      t1830: Math.round(slotTotals.t1830 / n),
    };
    let dominantSlot = SLOTS[0].label;
    let dominantSlotTotal = slotTotals.t1000;
    for (const s of SLOTS) {
      const v = slotTotals[s.key];
      if (v > dominantSlotTotal) {
        dominantSlotTotal = v;
        dominantSlot = s.label;
      }
    }
    return {
      grandTotal,
      activeDays: n,
      avgPerDay,
      avgPerNominalShift,
      maxDay,
      minDay,
      slotTotals,
      slotAvgPerDay,
      dominantSlot,
      dominantSlotTotal,
    };
  }, [rows]);

  const trendPoints = useMemo(() => {
    if (rows.length === 0) return "";
    const totals = rows.map(dayTotal);
    const maxT = Math.max(...totals, 1);
    const w = 640;
    const h = 160;
    if (rows.length === 1) {
      const y = h - Math.round((totals[0] / maxT) * h);
      return `0,${y} ${w},${y}`;
    }
    return rows
      .map((r, i) => {
        const x = Math.round((i / (rows.length - 1)) * w);
        const y = h - Math.round((totals[i] / maxT) * h);
        return `${x},${y}`;
      })
      .join(" ");
  }, [rows]);

  const exportExcel = () => {
    if (!meta || rows.length === 0) return;
    const ozet = [
      { Alan: "Personel", Değer: meta.name },
      { Alan: "Bölüm", Değer: teamLabel(meta.team) },
      { Alan: "Proses", Değer: meta.process },
      { Alan: "Tarih aralığı", Değer: `${startDate} — ${endDate}` },
      { Alan: "Üretim günü", Değer: stats.activeDays },
      { Alan: "Toplam üretim", Değer: stats.grandTotal },
      { Alan: "Günlük ortalama (toplam)", Değer: stats.avgPerDay },
      { Alan: `Günlük ort. ÷ ${SHIFT_NOMINAL_HOURS} saat (yaklaşık)`, Değer: stats.avgPerNominalShift },
      { Alan: "En yüksek gün", Değer: stats.maxDay ? `${stats.maxDay.date} (${stats.maxDay.total})` : "—" },
      { Alan: "En düşük gün", Değer: stats.minDay ? `${stats.minDay.date} (${stats.minDay.total})` : "—" },
      { Alan: "Baskın saat dilimi", Değer: `${stats.dominantSlot} (${stats.dominantSlotTotal})` },
    ];
    const gunluk = rows.map((r) => ({
      Tarih: r.productionDate,
      "10:00": r.t1000,
      "13:00": r.t1300,
      "16:00": r.t1600,
      "18:30": r.t1830,
      "Gün toplamı": dayTotal(r),
    }));
    const saatlik = SLOTS.map((s) => ({
      "Saat dilimi": s.label,
      "Aralık toplamı": stats.slotTotals[s.key],
      "Günlük ortalama": stats.slotAvgPerDay[s.key],
      Oran:
        stats.grandTotal > 0
          ? `${Math.round((100 * stats.slotTotals[s.key]) / stats.grandTotal)}%`
          : "0%",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ozet), "Özet");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gunluk), "Günlük saatlik");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(saatlik), "Saatlik özet");
    XLSX.writeFile(wb, `kisi-analiz-${meta.name.slice(0, 24)}-${startDate}-${endDate}.xlsx`);
  };

  const exportPdf = async () => {
    if (!meta || rows.length === 0 || !pdfCaptureRef.current) return;
    setPdfExporting(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const el = pdfCaptureRef.current;
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `kisi-analiz-${startDate}-${endDate}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            logging: false,
            backgroundColor: "#ffffff",
            scrollY: -window.scrollY,
            windowWidth: el.scrollWidth,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
          pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-avoid-break", "tr"] },
        })
        .from(el)
        .save();
    } catch {
      setError("PDF oluşturulamadı. Sayfayı yenileyip tekrar deneyin.");
    } finally {
      setPdfExporting(false);
    }
  };

  const slotMax = Math.max(stats.slotTotals.t1000, stats.slotTotals.t1300, stats.slotTotals.t1600, stats.slotTotals.t1830, 1);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-100/90 via-white to-slate-50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-20 -top-28 h-[22rem] w-[22rem] rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-600/15" />
        <div className="absolute -left-16 top-1/4 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-600/10" />
        <div className="absolute bottom-0 left-1/2 h-64 w-[min(100%,48rem)] -translate-x-1/2 translate-y-1/2 rounded-full bg-slate-300/20 blur-3xl dark:bg-slate-600/10" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <header className="relative mb-8 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/85 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/75 dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)]">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-teal-500 via-emerald-500 to-teal-600" aria-hidden />
          <div className="relative flex flex-col gap-6 p-6 pl-7 md:flex-row md:items-start md:justify-between md:p-8 md:pl-10">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-700 ring-1 ring-teal-600/15 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-500/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />
                  Analiz
                </span>
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Personel detayı</span>
              </div>
              <h1 className="mt-3 text-balance text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl lg:text-[2rem] lg:leading-tight">
                Kişi bazlı üretim analizi
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Günlük ve saat dilimi kırılımı, trend ve dönem özetleri. İsterseniz raporu Excel veya PDF olarak dışa
                aktarın.
              </p>
              {loadedAt ? (
                <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-100/90 px-3 py-1.5 text-xs text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                  <span className="font-medium text-slate-500 dark:text-slate-500">Son yükleme</span>
                  <span className="tabular-nums text-slate-700 dark:text-slate-300">{loadedAt}</span>
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 md:flex-col md:items-stretch lg:flex-row">
              <Link
                href="/analysis"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-300/80 hover:bg-teal-50/80 hover:shadow-md dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:bg-teal-950/50"
              >
                Genel analiz
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:from-slate-800 hover:to-slate-700 dark:from-teal-600 dark:to-emerald-600 dark:shadow-teal-900/30 dark:hover:from-teal-500 dark:hover:to-emerald-500"
              >
                Üretim ekranı
              </Link>
            </div>
          </div>
        </header>

        <section className="mb-8 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_4px_24px_rgb(0,0,0,0.04)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-800/60 dark:shadow-none">
          <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-700/80">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Sorgu</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Personel ve hafta içi tarih aralığını seçin, ardından veriyi yükleyin.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Personel</label>
              <select
                value={workerId === "" ? "" : String(workerId)}
                onChange={(e) => setWorkerId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-inner shadow-slate-900/[0.03] outline-none ring-teal-500/25 transition focus:border-teal-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none"
              >
                <option value="">Seçin…</option>
                {[...workers]
                  .sort((a, b) => a.name.localeCompare(b.name, "tr", { sensitivity: "base" }))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} — {teamLabel(w.team)} / {w.process}
                    </option>
                  ))}
              </select>
            </div>
            <WeekdayDatePicker label="Başlangıç" value={startDate} onChange={setStartDate} />
            <WeekdayDatePicker label="Bitiş" value={endDate} onChange={setEndDate} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 dark:border-slate-700/80">
            <button
              type="button"
              disabled={loading || workerId === ""}
              onClick={() => void load()}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500 hover:shadow-teal-600/30 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? "Yükleniyor…" : "Veriyi getir"}
            </button>
            <span className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-600" aria-hidden />
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={exportExcel}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700/80"
            >
              Excel
            </button>
            <button
              type="button"
              disabled={rows.length === 0 || pdfExporting}
              onClick={() => void exportPdf()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700/80"
            >
              {pdfExporting ? "PDF hazırlanıyor…" : "PDF"}
            </button>
          </div>
        </section>

        {error ? (
          <div
            className="mb-6 flex gap-3 rounded-2xl border border-red-200/90 bg-red-50/95 px-4 py-3.5 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100"
            role="alert"
          >
            <span className="mt-0.5 shrink-0 text-red-500" aria-hidden>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </span>
            <span>{error}</span>
          </div>
        ) : null}

        {rows.length === 0 && !loading && workerId !== "" ? (
          <div className="rounded-3xl border border-dashed border-slate-300/90 bg-gradient-to-b from-slate-50/90 to-white p-10 text-center dark:border-slate-600 dark:from-slate-800/50 dark:to-slate-900/30">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100/80 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v3.75M3 13.125v3.375c0 .621.504 1.125 1.125 1.125h3.75M3 13.125l3.66-3.66a1.125 1.125 0 011.59 0L12 13.125m-9 0L12 13.125m0 0l3.66-3.66a1.125 1.125 0 011.59 0L21 13.125m-9 0v6.375c0 .621.504 1.125 1.125 1.125h3.75m-6-7.5h6"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Bu aralıkta kayıt yok</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Seçilen personel için bu tarihlerde üretim satırı bulunamadı. Tarih aralığını veya personeli değiştirip tekrar
              deneyin.
            </p>
          </div>
        ) : null}

        {rows.length > 0 && meta ? (
          <div
            ref={pdfCaptureRef}
            className="person-pdf-capture mb-10 space-y-8 rounded-3xl border border-slate-200/90 bg-white p-6 text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_20px_50px_-20px_rgba(15,23,42,0.15)] [color-scheme:light] dark:border-slate-600 dark:shadow-none dark:ring-1 dark:ring-slate-700/40"
          >
            <header className="pdf-avoid-break border-b border-slate-200/90 pb-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-teal-600">
                    <span className="h-px w-6 bg-teal-500/60" aria-hidden />
                    Üretim raporu
                  </p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Kişi bazlı analiz</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">{meta.name}</span>
                    {" · "}
                    {teamLabel(meta.team)} · {meta.process}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Dönem: {startDate} — {endDate} · Üretim günü: {stats.activeDays}
                    {loadedAt ? ` · Rapor: ${loadedAt}` : null}
                  </p>
                </div>
                <div className="text-left text-xs text-slate-500 sm:text-right">
                  <p className="font-semibold text-slate-700">Yeşil İmaj Tekstil</p>
                  <p>Kişi bazlı üretim takibi</p>
                </div>
              </div>
            </header>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-teal-500 bg-gradient-to-br from-white to-teal-50/40 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Toplam üretim</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-teal-700">{stats.grandTotal}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-slate-400 bg-gradient-to-br from-white to-slate-50/90 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Üretim günü</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{stats.activeDays}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-blue-500 bg-gradient-to-br from-white to-blue-50/40 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Günlük ortalama</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{stats.avgPerDay}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Aktif günlere göre</p>
              </div>
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-violet-500 bg-gradient-to-br from-white to-violet-50/40 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  ~ / {SHIFT_NOMINAL_HOURS} saat (gün ort.)
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{stats.avgPerNominalShift}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Günlük ort. ÷ {SHIFT_NOMINAL_HOURS}</p>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="pdf-avoid-break rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04]">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden />
                  <h3 className="text-sm font-semibold text-slate-800">Günlük toplam trendi</h3>
                </div>
                <svg viewBox="0 0 640 180" className="h-44 w-full rounded-xl bg-gradient-to-b from-slate-50 to-slate-100/80 ring-1 ring-slate-200/80">
                  <defs>
                    <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(13 148 136)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="rgb(13 148 136)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {rows.length > 1 && trendPoints ? (
                    <polygon fill={`url(#${chartGradientId})`} points={`0,180 ${trendPoints} 640,180`} />
                  ) : null}
                  <polyline
                    fill="none"
                    stroke="rgb(13 148 136)"
                    strokeWidth="2.5"
                    points={trendPoints}
                  />
                  {rows.map((r, i) => {
                    const totals = rows.map(dayTotal);
                    const maxT = Math.max(...totals, 1);
                    const x = rows.length === 1 ? 320 : Math.round((i / (rows.length - 1)) * 640);
                    const y = 180 - Math.round((totals[i] / maxT) * 170) - 5;
                    return <circle key={r.productionDate} cx={x} cy={y} r="4" fill="rgb(15 118 110)" />;
                  })}
                </svg>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                  {stats.maxDay ? (
                    <span>
                      <span className="font-semibold text-emerald-700">En yüksek:</span>{" "}
                      {formatDateLong(stats.maxDay.date)} — {stats.maxDay.total}
                    </span>
                  ) : null}
                  {stats.minDay && stats.activeDays > 1 ? (
                    <span>
                      <span className="font-semibold text-amber-700">En düşük:</span>{" "}
                      {formatDateLong(stats.minDay.date)} — {stats.minDay.total}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="pdf-avoid-break rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04]">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                  <h3 className="text-sm font-semibold text-slate-800">Saat dilimi dağılımı (dönem toplamı)</h3>
                </div>
                <p className="mb-4 text-xs text-slate-500">
                  Baskın dilim: <span className="font-semibold text-slate-700">{stats.dominantSlot}</span>{" "}
                  ({stats.grandTotal > 0 ? Math.round((100 * stats.dominantSlotTotal) / stats.grandTotal) : 0}%)
                </p>
                <ul className="space-y-3">
                  {SLOTS.map((s) => {
                    const v = stats.slotTotals[s.key];
                    const pct = Math.round((v / slotMax) * 100);
                    const share = stats.grandTotal > 0 ? Math.round((100 * v) / stats.grandTotal) : 0;
                    return (
                      <li key={s.key} className="flex items-center gap-3 text-sm text-slate-800">
                        <span className="w-14 shrink-0 font-mono text-xs font-semibold text-slate-600">{s.label}</span>
                        <div className="min-w-0 flex-1">
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-20 shrink-0 text-right tabular-nums">
                          <span className="font-bold">{v}</span>
                          <span className="ml-1 text-[10px] text-slate-500">({share}%)</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  Günlük ortalama / dilim:{" "}
                  {SLOTS.map((s) => (
                    <span key={s.key} className="mr-2 inline-block">
                      {s.label}: <strong className="text-slate-700">{stats.slotAvgPerDay[s.key]}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-teal-50/30 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-700" aria-hidden />
                  <h3 className="text-sm font-semibold text-slate-800">Günlük saatlik detay</h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {meta.name} · {teamLabel(meta.team)} · {meta.process}
                </p>
              </div>
              <div className="overflow-x-auto rounded-b-2xl">
                <table className="w-full min-w-[640px] border-collapse text-sm text-slate-800">
                  <thead className="sticky top-0 z-[1] shadow-sm">
                    <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
                      <th className="px-4 py-3">Tarih</th>
                      <th className="px-3 py-3 text-right">10:00</th>
                      <th className="px-3 py-3 text-right">13:00</th>
                      <th className="px-3 py-3 text-right">16:00</th>
                      <th className="px-3 py-3 text-right">18:30</th>
                      <th className="px-4 py-3 text-right">Gün toplamı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const t = dayTotal(r);
                      return (
                        <tr
                          key={r.productionDate}
                          className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70"
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{r.productionDate}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.t1000}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.t1300}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.t1600}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.t1830}</td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-teal-800">{t}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-teal-50/90 font-semibold text-slate-800">
                      <td className="px-4 py-3">Dönem toplamı</td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1000}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1300}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1600}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1830}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-teal-800">{stats.grandTotal}</td>
                    </tr>
                    <tr className="bg-slate-100/80 text-xs">
                      <td className="px-4 py-2 text-slate-600">Günlük ortalama</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1000}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1300}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1600}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1830}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">{stats.avgPerDay}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
