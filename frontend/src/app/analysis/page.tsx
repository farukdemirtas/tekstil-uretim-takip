"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as RMouseEvent } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getDailyTrendAnalytics,
  getTeams,
  getTopWorkersAnalytics,
  getWorkerDailyAnalytics,
  getWorkerHourlyBreakdown,
  setAuthToken,
} from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { rankTercileStyles } from "@/lib/rankTercile";
import type { WorkerHourlyBreakdown } from "@/lib/api";
import { DailyTrendPoint, HourFilter, Team, TopWorkerAnalytics, WorkerDailyAnalytics } from "@/lib/types";

const AUTO_REFRESH_MS = 30_000;

export default function AnalysisPage() {
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate] = useState(todayWeekdayIso());
  const [teamFilter, setTeamFilter] = useState<Team | "">("");
  const [hourFilter, setHourFilter] = useState<HourFilter>("");
  const [rows, setRows] = useState<TopWorkerAnalytics[]>([]);
  const [trendRows, setTrendRows] = useState<DailyTrendPoint[]>([]);
  const [workerDailyRows, setWorkerDailyRows] = useState<WorkerDailyAnalytics[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [hoveredId, setHoveredId]     = useState<number | null>(null);
  const [tooltipPos, setTooltipPos]   = useState({ x: 0, y: 0 });
  const [hourlyData, setHourlyData]   = useState<WorkerHourlyBreakdown | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const hourlyCache = useRef<Map<number, WorkerHourlyBreakdown>>(new Map());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [teamRows, setTeamRows] = useState<Array<{ code: string; label: string }>>([]);

  function resolveTeamLabel(team: Team | "") {
    if (team === "") return "TÜM GRUPLAR";
    return teamRows.find((t) => t.code === team)?.label ?? team;
  }

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [topWorkers, trend, workerDaily] = await Promise.all([
        getTopWorkersAnalytics({ startDate, endDate, team: teamFilter, hour: hourFilter, limit: 9999 }),
        getDailyTrendAnalytics({ startDate, endDate, team: teamFilter, hour: hourFilter }),
        getWorkerDailyAnalytics({ startDate, endDate, team: teamFilter, hour: hourFilter })
      ]);
      setRows(topWorkers);
      setTrendRows(trend);
      setWorkerDailyRows(workerDaily);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Analiz verisi yüklenemedi");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [startDate, endDate, teamFilter, hourFilter]);

  /* ── Kimlik doğrulama + ilk yükleme ── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("analysis")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    void getTeams()
      .then((rows) => setTeamRows(rows.map((t) => ({ code: t.code, label: t.label }))))
      .catch(() => {});
    void loadData();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Otomatik yenileme: filtreler değişince interval sıfırlanır ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      void loadData(true);
    }, AUTO_REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadData]);

  /* ── Hover değişince saatlik veriyi çek (cache ile) ── */
  useEffect(() => {
    if (hoveredId === null) { setHourlyData(null); return; }
    if (hourlyCache.current.has(hoveredId)) {
      setHourlyData(hourlyCache.current.get(hoveredId)!);
      return;
    }
    setHourlyLoading(true);
    setHourlyData(null);
    getWorkerHourlyBreakdown({ workerId: hoveredId, startDate, endDate })
      .then((data) => {
        hourlyCache.current.set(hoveredId, data);
        setHourlyData(data);
      })
      .catch(() => setHourlyData({ t1000: 0, t1300: 0, t1600: 0, t1830: 0 }))
      .finally(() => setHourlyLoading(false));
  }, [hoveredId, startDate, endDate]);

  const maxValue = useMemo(
    () => rows.reduce((max, row) => (row.totalProduction > max ? row.totalProduction : max), 0),
    [rows]
  );
  const maxTrend = useMemo(
    () => trendRows.reduce((max, row) => (row.totalProduction > max ? row.totalProduction : max), 0),
    [trendRows]
  );
  const trendPoints = useMemo(() => {
    if (trendRows.length === 0 || maxTrend === 0) return "";
    const width = 800;
    const height = 220;
    return trendRows
      .map((row, index) => {
        const x = trendRows.length === 1 ? 0 : Math.round((index / (trendRows.length - 1)) * width);
        const y = Math.round(height - (row.totalProduction / maxTrend) * height);
        return `${x},${y}`;
      })
      .join(" ");
  }, [trendRows, maxTrend]);

  const filteredWorkerDailyRows = useMemo(() => {
    const query = workerSearch.trim().toLocaleLowerCase("tr");
    if (!query) return workerDailyRows;
    return workerDailyRows.filter((row) => row.name.toLocaleLowerCase("tr").includes(query));
  }, [workerDailyRows, workerSearch]);

  function hourLabel(hour: HourFilter) {
    if (hour === "t1000") return "10:00";
    if (hour === "t1300") return "13:00";
    if (hour === "t1600") return "16:00";
    if (hour === "t1830") return "18:30";
    return "TÜM SAATLER";
  }

  function exportExcel() {
    const topSheet = rows.map((row, index) => ({
      Sıra: index + 1,
      "Ad Soyad": row.name,
      Grup: resolveTeamLabel(row.team),
      Proses: row.process,
      "Çalışılan Gün": row.activeDays,
      "Toplam Üretim": row.totalProduction
    }));
    const trendSheet = trendRows.map((row) => ({
      Tarih: row.productionDate,
      "Günlük Toplam Üretim": row.totalProduction
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(topSheet), "Top İşçi");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trendSheet), "Günlük Trend");
    const workerDailySheet = workerDailyRows.map((row) => ({
      Tarih: row.productionDate,
      "Ad Soyad": row.name,
      Grup: resolveTeamLabel(row.team),
      Proses: row.process,
      Üretim: row.production
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(workerDailySheet), "İşçi Günlük Verim");
    XLSX.writeFile(workbook, `analiz-${startDate}-${endDate}.xlsx`);
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Yeşil İmaj Tekstil - Analiz Raporu", 14, 14);
    doc.setFontSize(10);
    doc.text(`Tarih Aralığı: ${startDate} - ${endDate}`, 14, 20);
    doc.text(`Grup Filtresi: ${resolveTeamLabel(teamFilter)}`, 14, 25);
    doc.text(`Saat Filtresi: ${hourLabel(hourFilter)}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [["#", "Ad Soyad", "Grup", "Proses", "Çalışılan Gün", "Toplam Üretim"]],
      body: rows.map((row, index) => [
        index + 1,
        row.name,
        resolveTeamLabel(row.team),
        row.process,
        row.activeDays,
        row.totalProduction
      ])
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
    autoTable(doc, {
      startY: finalY + 8,
      head: [["Tarih", "Günlük Toplam Üretim"]],
      body: trendRows.map((row) => [row.productionDate, row.totalProduction])
    });
    doc.save(`analiz-${startDate}-${endDate}.pdf`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 p-4 md:p-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Analiz - İşçi Verim Sıralaması</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Seçilen tarih aralığında veri girilen tüm işçiler sıralanır.
            </p>
            {lastUpdated && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                Son güncelleme: {lastUpdated} &nbsp;·&nbsp; Her 30 sn otomatik yenilenir
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/ekran2"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-teal-600/50 bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              EKRAN2
            </Link>
            <Link href="/" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
              Üretim Ekranı
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <WeekdayDatePicker label="Başlangıç" value={startDate} onChange={setStartDate} />
          <WeekdayDatePicker label="Bitiş" value={endDate} onChange={setEndDate} />
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Grup</label>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value as Team | "")}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">TÜM GRUPLAR</option>
            {teamRows.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Saat</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setHourFilter("")}
              className={`rounded-md border px-3 py-2 text-sm ${
                hourFilter === "" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              TÜM
            </button>
            <button
              onClick={() => setHourFilter("t1000")}
              className={`rounded-md border px-3 py-2 text-sm ${
                hourFilter === "t1000" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              10:00
            </button>
            <button
              onClick={() => setHourFilter("t1300")}
              className={`rounded-md border px-3 py-2 text-sm ${
                hourFilter === "t1300" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              13:00
            </button>
            <button
              onClick={() => setHourFilter("t1600")}
              className={`rounded-md border px-3 py-2 text-sm ${
                hourFilter === "t1600" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              16:00
            </button>
            <button
              onClick={() => setHourFilter("t1830")}
              className={`rounded-md border px-3 py-2 text-sm ${
                hourFilter === "t1830" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              18:30
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">&nbsp;</label>
          <button onClick={exportExcel} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            Excel Export
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">&nbsp;</label>
          <button onClick={exportPdf} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            PDF Export
          </button>
        </div>
        <button onClick={() => void loadData()} className="rounded-md bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">
          Analizi Getir
        </button>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            Grafik
            {rows.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                ({rows.length} işçi)
              </span>
            )}
          </h2>
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-emerald-500" /> Üst üçte bir</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-blue-500" /> Orta üçte bir</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-red-500" /> Alt üçte bir</span>
              <span className="hidden italic opacity-70 sm:inline">Satıra tıkla → detay</span>
            </div>
          )}
        </div>
        {loading ? (
          <div className="text-sm text-slate-600">Yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-600">Seçilen aralıkta veri bulunamadı.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((row, index) => {
              const width    = maxValue > 0 ? Math.max(4, Math.round((row.totalProduction / maxValue) * 100)) : 0;
              const total    = rows.length;
              const { bar: barColor, rank: rankColor } = rankTercileStyles(index, total);
              const isActive = hoveredId === row.workerId;
              return (
                <div
                  key={`${row.workerId}-${index}`}
                  className={`grid cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm transition-colors
                    grid-cols-[24px_minmax(0,1fr)_2fr_56px]
                    sm:grid-cols-[28px_minmax(0,200px)_1fr_72px]
                    ${isActive ? "bg-slate-100 dark:bg-slate-700/60" : "hover:bg-slate-50 dark:hover:bg-slate-700/30"}`}
                  onMouseEnter={(e: RMouseEvent) => {
                    setHoveredId(row.workerId);
                    setTooltipPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e: RMouseEvent) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setHoveredId(isActive ? null : row.workerId)}
                >
                  <span className={`text-xs ${rankColor}`}>{index + 1}</span>
                  <span className="truncate text-xs sm:text-sm">{row.name}</span>
                  <div className="h-4 rounded bg-slate-200 dark:bg-slate-700 sm:h-5">
                    <div className={`h-full rounded ${barColor} transition-all duration-500`} style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right text-xs font-semibold sm:text-sm">{row.totalProduction}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Detay Paneli (Hover=masaüstü, Click=mobil) ── */}
      {hoveredId !== null && (() => {
        const worker   = rows.find((r) => r.workerId === hoveredId);
        if (!worker) return null;
        const days     = workerDailyRows.filter((r) => r.workerId === hoveredId);
        const avg      = days.length > 0 ? Math.round(days.reduce((s, d) => s + d.production, 0) / days.length) : 0;
        const rank     = rows.findIndex((r) => r.workerId === hoveredId) + 1;

        const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const cardW = 320;
        const cardH = 270;
        const left = tooltipPos.x + 16 + cardW > vw ? tooltipPos.x - cardW - 16 : tooltipPos.x + 16;
        const top  = tooltipPos.y + 16 + cardH > vh ? tooltipPos.y - cardH - 8  : tooltipPos.y + 16;

        /* Mobilde ekran altında sabit panel */
        const mobileStyle: React.CSSProperties = {
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
          borderRadius: "12px 12px 0 0",
        };
        const desktopStyle: React.CSSProperties = { position: "fixed", left, top, zIndex: 50 };

        return (
          <div
            className={`w-full border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-80 sm:rounded-xl ${isMobile ? "" : "pointer-events-none"}`}
            style={isMobile ? mobileStyle : desktopStyle}
          >
            {/* Mobilde kapatma çubuğu */}
            {isMobile && (
              <button
                className="mb-3 flex w-full items-center justify-between text-xs text-slate-400 sm:hidden"
                onClick={() => setHoveredId(null)}
              >
                <span className="font-medium text-slate-600 dark:text-slate-300">Detay</span>
                <span className="text-lg leading-none">✕</span>
              </button>
            )}
            {/* Başlık */}
            <div className="mb-3 border-b border-slate-100 pb-2 dark:border-slate-700">
              <div className="font-semibold">{worker.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{resolveTeamLabel(worker.team)}</span>
                <span>·</span>
                <span>{worker.process}</span>
                <span>·</span>
                <span>#{rank}. sıra</span>
              </div>
            </div>

            {/* Özet istatistikler */}
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/30">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">{worker.totalProduction}</div>
                <div className="text-xs text-slate-500">Toplam</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/30">
                <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{worker.activeDays}</div>
                <div className="text-xs text-slate-500">Çalışılan Gün</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/30">
                <div className="text-lg font-bold text-violet-600 dark:text-violet-300">{avg}</div>
                <div className="text-xs text-slate-500">Günlük Ort.</div>
              </div>
            </div>

            {/* Saatlik bar grafik */}
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Saatlik Üretim (seçili tarih aralığı toplamı)
              </div>
              {hourlyLoading ? (
                <div className="text-xs text-slate-400">Yükleniyor...</div>
              ) : hourlyData ? (() => {
                const slots = [
                  { label: "10:00", key: "t1000" as const, color: "bg-violet-500" },
                  { label: "13:00", key: "t1300" as const, color: "bg-blue-500"   },
                  { label: "16:00", key: "t1600" as const, color: "bg-emerald-500" },
                  { label: "18:30", key: "t1830" as const, color: "bg-amber-500"  },
                ];
                const slotMax = Math.max(...slots.map((s) => hourlyData[s.key]), 1);
                return (
                  <div className="space-y-1.5">
                    {slots.map((s) => {
                      const val   = hourlyData[s.key];
                      const pct   = Math.round((val / slotMax) * 100);
                      return (
                        <div key={s.key} className="flex items-center gap-2 text-xs">
                          <span className="w-10 shrink-0 text-right text-slate-500 dark:text-slate-400">{s.label}</span>
                          <div className="flex-1 rounded bg-slate-100 dark:bg-slate-700" style={{ height: 14 }}>
                            <div
                              className={`${s.color} rounded transition-all duration-500`}
                              style={{ width: `${pct}%`, height: 14 }}
                            />
                          </div>
                          <span className="w-10 shrink-0 font-semibold">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div className="text-xs text-slate-400">Veri bulunamadı.</div>
              )}
            </div>
          </div>
        );
      })()}

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <h2 className="mb-3 text-base font-semibold">Günlük Trend Çizgisi</h2>
        {trendRows.length === 0 ? (
          <div className="text-sm text-slate-600">Trend verisi bulunamadı.</div>
        ) : (
          <div className="space-y-3">
            <svg viewBox="0 0 800 220" className="h-56 w-full rounded border border-slate-200 bg-white">
              <polyline fill="none" stroke="#16a34a" strokeWidth="3" points={trendPoints} />
              {trendRows.map((row, index) => {
                const x = trendRows.length === 1 ? 0 : Math.round((index / (trendRows.length - 1)) * 800);
                const y = maxTrend === 0 ? 220 : Math.round(220 - (row.totalProduction / maxTrend) * 220);
                return <circle key={`trend-${row.productionDate}-${index}`} cx={x} cy={y} r="3.5" fill="#16a34a" />;
              })}
            </svg>
            <div className="grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-3">
              {trendRows.map((row, index) => (
                <div key={`legend-${row.productionDate}-${index}`}>
                  {row.productionDate}: <span className="font-semibold">{row.totalProduction}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <h2 className="mb-3 text-base font-semibold">Top İşçi Tablosu</h2>
        <p className="mb-3 text-sm text-slate-600">Gösterilen üretim: {hourLabel(hourFilter)}</p>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Ad Soyad</th>
              <th className="px-2 py-2 text-left">Grup</th>
              <th className="px-2 py-2 text-left">Proses</th>
              <th className="px-2 py-2 text-right">Çalışılan Gün</th>
              <th className="px-2 py-2 text-right">Toplam Üretim</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.workerId} className="border-b border-slate-200">
                <td className="px-2 py-2">{index + 1}</td>
                <td className="px-2 py-2">{row.name}</td>
                <td className="px-2 py-2">{resolveTeamLabel(row.team)}</td>
                <td className="px-2 py-2">{row.process}</td>
                <td className="px-2 py-2 text-right">{row.activeDays}</td>
                <td className="px-2 py-2 text-right font-semibold">{row.totalProduction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold">İşçi Bazlı Günlük Verim</h2>
          <input
            value={workerSearch}
            onChange={(e) => setWorkerSearch(e.target.value)}
            placeholder="İşçi adına göre ara..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:w-72 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
        </div>
        {filteredWorkerDailyRows.length === 0 ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">Seçilen aralıkta veri bulunamadı.</div>
        ) : (
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-slate-100 dark:bg-slate-700">
              <tr>
                <th className="px-2 py-2 text-left">Tarih</th>
                <th className="px-2 py-2 text-left">Ad Soyad</th>
                <th className="px-2 py-2 text-left">Grup</th>
                <th className="px-2 py-2 text-left">Proses</th>
                <th className="px-2 py-2 text-right">Üretim</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkerDailyRows.map((row) => (
                <tr key={`${row.productionDate}-${row.workerId}`} className="border-b border-slate-200 dark:border-slate-600">
                  <td className="px-2 py-2">{row.productionDate}</td>
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{resolveTeamLabel(row.team)}</td>
                  <td className="px-2 py-2">{row.process}</td>
                  <td className="px-2 py-2 text-right font-semibold">{row.production}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
