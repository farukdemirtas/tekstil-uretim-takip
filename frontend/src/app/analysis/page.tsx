"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getDailyTrendAnalytics, getTopWorkersAnalytics, getWorkerDailyAnalytics, setAuthToken } from "@/lib/api";
import { DailyTrendPoint, HourFilter, Team, TopWorkerAnalytics, WorkerDailyAnalytics } from "@/lib/types";

const AUTO_REFRESH_MS = 30_000;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function AnalysisPage() {
  const [startDate, setStartDate] = useState(getToday());
  const [endDate, setEndDate] = useState(getToday());
  const [teamFilter, setTeamFilter] = useState<Team | "">("");
  const [hourFilter, setHourFilter] = useState<HourFilter>("");
  const [rows, setRows] = useState<TopWorkerAnalytics[]>([]);
  const [trendRows, setTrendRows] = useState<DailyTrendPoint[]>([]);
  const [workerDailyRows, setWorkerDailyRows] = useState<WorkerDailyAnalytics[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [topWorkers, trend, workerDaily] = await Promise.all([
        getTopWorkersAnalytics({ startDate, endDate, team: teamFilter, hour: hourFilter, limit: 20 }),
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
    const role = window.localStorage.getItem("auth_role");
    if (!token || role !== "admin") {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
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

  function teamLabel(team: Team | "") {
    if (team === "") return "TÜM GRUPLAR";
    if (team === "SAG_ON") return "SAĞ ÖN";
    if (team === "SOL_ON") return "SOL ÖN";
    if (team === "YAKA_HAZIRLIK") return "YAKA HAZIRLIK";
    if (team === "ARKA_HAZIRLIK") return "ARKA HAZIRLIK";
    if (team === "BITIM") return "BİTİM";
    return "ADET";
  }

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
      Grup: teamLabel(row.team),
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
      Grup: teamLabel(row.team),
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
    doc.text(`Grup Filtresi: ${teamLabel(teamFilter)}`, 14, 25);
    doc.text(`Saat Filtresi: ${hourLabel(hourFilter)}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [["#", "Ad Soyad", "Grup", "Proses", "Çalışılan Gün", "Toplam Üretim"]],
      body: rows.map((row, index) => [
        index + 1,
        row.name,
        teamLabel(row.team),
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
            <h1 className="text-xl font-semibold">Analiz - En Çok Çalışan İşçi</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Grafik ve tablo verisi tarih aralığı, grup ve saat filtresine göre hesaplanır.
            </p>
            {lastUpdated && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                Son güncelleme: {lastUpdated} &nbsp;·&nbsp; Her 30 sn otomatik yenilenir
              </p>
            )}
          </div>
          <Link href="/" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
            Üretim Ekranı
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Başlangıç</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Bitiş</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
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
            <option value="ADET">ADET</option>
            <option value="ARKA_HAZIRLIK">ARKA HAZIRLIK</option>
            <option value="BITIM">BİTİM</option>
            <option value="SAG_ON">SAĞ ÖN</option>
            <option value="SOL_ON">SOL ÖN</option>
            <option value="YAKA_HAZIRLIK">YAKA HAZIRLIK</option>
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
        <h2 className="mb-3 text-base font-semibold">Grafik</h2>
        {loading ? (
          <div className="text-sm text-slate-600">Yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-600">Seçilen aralıkta veri bulunamadı.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => {
              const width = maxValue > 0 ? Math.max(4, Math.round((row.totalProduction / maxValue) * 100)) : 0;
              return (
                <div key={row.workerId} className="grid grid-cols-[24px_220px_1fr_80px] items-center gap-2 text-sm">
                  <span className="text-slate-500">{index + 1}</span>
                  <span className="truncate">{row.name}</span>
                  <div className="h-5 rounded bg-slate-200">
                    <div className="h-5 rounded bg-emerald-500" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right font-semibold">{row.totalProduction}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
                return <circle key={row.productionDate} cx={x} cy={y} r="3.5" fill="#16a34a" />;
              })}
            </svg>
            <div className="grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-3">
              {trendRows.map((row) => (
                <div key={`legend-${row.productionDate}`}>
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
                <td className="px-2 py-2">{teamLabel(row.team)}</td>
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
                  <td className="px-2 py-2">{teamLabel(row.team)}</td>
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
