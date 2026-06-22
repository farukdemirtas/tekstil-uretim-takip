"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as RMouseEvent } from "react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getDailyTrendAnalytics,
  getProcesses,
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
import {
  aggregateDisplaySlots,
  DISPLAY_SLOT_CHART_LABELS,
  DISPLAY_SLOT_FILTER_LABELS,
  displaySlotLabelForHourFilter,
} from "@/lib/displaySlotAggregation";
import { computeShiftHourAverages, SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import type { WorkerHourlyBreakdown } from "@/lib/api";
import { DailyTrendPoint, HourFilter, ProductionRow, Team, TopWorkerAnalytics, WorkerDailyAnalytics } from "@/lib/types";
import { getProsesMapForEfficiency } from "@/lib/prosesVeri";
import {
  efficiencyPercentForDayProduction,
  efficiencyPercentFromTotals,
  workerEfficiencyPercent,
} from "@/lib/workerEfficiency";
import { todayWorkdayIsoTurkey } from "@/lib/businessCalendar";
import type * as XLSX from "xlsx";
import { loadXlsx } from "@/lib/xlsxLazy";
import AnalysisSubnav from "@/components/analysis/AnalysisSubnav";
import { useI18n } from "@/components/I18nProvider";

const AUTO_REFRESH_MS = 30_000;
/** Personel verimlilik grafiğinde en fazla gösterilecek satır (üst sıra). */
const EFF_VIZ_TOP = 28;

function hourlyToProductionRow(worker: TopWorkerAnalytics, h: WorkerHourlyBreakdown): ProductionRow {
  return {
    workerId: worker.workerId,
    name: worker.name,
    team: worker.team as Team,
    process: worker.process,
    t1000: h.t1000,
    t1300: h.t1300,
    t1600: h.t1600,
    t1830: h.t1830,
    h0900: h.h0900 ?? 0,
    h1000: h.h1000 ?? 0,
    h1115: h.h1115 ?? 0,
    h1215: h.h1215 ?? 0,
    h1300: h.h1300 ?? 0,
    h1445: h.h1445 ?? 0,
    h1545: h.h1545 ?? 0,
    h1700: h.h1700 ?? 0,
    h1830: h.h1830 ?? 0,
    ekSayim: 0,
  };
}

export default function AnalysisPage() {
  const { t } = useI18n();
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate] = useState(todayWeekdayIso());
  const [teamFilter, setTeamFilter] = useState<Team | "">("");
  const [processFilter, setProcessFilter] = useState("");
  const [groupByProcess, setGroupByProcess] = useState(false);
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
  const [processRows, setProcessRows] = useState<Array<{ name: string }>>([]);

  function resolveTeamLabel(team: Team | "") {
    if (team === "") return t("analysisPage.allGroups");
    return teamRows.find((row) => row.code === team)?.label ?? team;
  }

  function resolveProcessFilterLabel() {
    if (processFilter === "") return t("analysisPage.allProcesses");
    return processFilter;
  }

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [topWorkers, trend, workerDaily] = await Promise.all([
        getTopWorkersAnalytics({
          startDate,
          endDate,
          team: teamFilter,
          process: processFilter,
          hour: hourFilter,
          limit: 9999
        }),
        getDailyTrendAnalytics({ startDate, endDate, team: teamFilter, process: processFilter, hour: hourFilter }),
        getWorkerDailyAnalytics({ startDate, endDate, team: teamFilter, process: processFilter, hour: hourFilter })
      ]);
      hourlyCache.current.clear();
      setRows(topWorkers);
      setTrendRows(trend);
      setWorkerDailyRows(workerDaily);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Analiz verisi yüklenemedi");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [startDate, endDate, teamFilter, processFilter, hourFilter]);

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
    void getProcesses()
      .then((rows) =>
        setProcessRows(
          [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr")).map((p) => ({ name: p.name }))
        )
      )
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

  const { displayRows, groupMeta } = useMemo(() => {
    if (!groupByProcess) {
      return { displayRows: rows, groupMeta: null as null | Array<{ indexInGroup: number; groupLen: number }> };
    }
    const sorted = [...rows].sort((a, b) => {
      const pc = a.process.localeCompare(b.process, "tr");
      if (pc !== 0) return pc;
      if (b.totalProduction !== a.totalProduction) return b.totalProduction - a.totalProduction;
      return a.name.localeCompare(b.name, "tr");
    });
    const meta: Array<{ indexInGroup: number; groupLen: number }> = [];
    let i = 0;
    while (i < sorted.length) {
      const p = sorted[i].process;
      let j = i;
      while (j < sorted.length && sorted[j].process === p) j++;
      const len = j - i;
      for (let k = i; k < j; k++) meta[k] = { indexInGroup: k - i, groupLen: len };
      i = j;
    }
    return { displayRows: sorted, groupMeta: meta };
  }, [rows, groupByProcess]);

  const maxValue = useMemo(
    () => displayRows.reduce((max, row) => (row.totalProduction > max ? row.totalProduction : max), 0),
    [displayRows]
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

  const prosesMap = useMemo(() => getProsesMapForEfficiency(), [lastUpdated]);

  /** Dönem verimliliğine göre sıralı personel (üretim sırasından bağımsız). */
  const personnelEfficiencyAnalysis = useMemo(() => {
    if (hourFilter !== "") {
      return {
        active: false as const,
        sorted: [] as Array<{ row: TopWorkerAnalytics; eff: number }>,
        avg: null as number | null,
        median: null as number | null,
        withTarget: 0,
        withoutTarget: 0,
        below75: 0,
      };
    }
    const sorted: Array<{ row: TopWorkerAnalytics; eff: number }> = [];
    let withoutTarget = 0;
    for (const row of rows) {
      const eff = efficiencyPercentFromTotals(
        prosesMap,
        row.team,
        row.process,
        row.totalProduction,
        Math.max(row.activeDays, 1)
      );
      if (eff === null) withoutTarget++;
      else sorted.push({ row, eff });
    }
    sorted.sort((a, b) => b.eff - a.eff);
    const n = sorted.length;
    const avg = n ? Math.round(sorted.reduce((s, x) => s + x.eff, 0) / n) : null;
    const median =
      n === 0
        ? null
        : n % 2 === 1
          ? sorted[Math.floor(n / 2)]!.eff
          : Math.round((sorted[n / 2 - 1]!.eff + sorted[n / 2]!.eff) / 2);
    const below75 = sorted.filter((x) => x.eff < 75).length;
    return {
      active: true as const,
      sorted,
      avg,
      median,
      withTarget: n,
      withoutTarget,
      below75,
    };
  }, [rows, hourFilter, prosesMap]);

  function rowPeriodEfficiency(row: TopWorkerAnalytics): number | null {
    if (hourFilter !== "") return null;
    return efficiencyPercentFromTotals(
      prosesMap,
      row.team,
      row.process,
      row.totalProduction,
      Math.max(row.activeDays, 1)
    );
  }

  function dailyRowEfficiency(row: WorkerDailyAnalytics): number | null {
    if (hourFilter !== "") return null;
    return efficiencyPercentForDayProduction(prosesMap, row.team, row.process, row.production);
  }

  async function exportExcel() {
    const topSheet = displayRows.map((row, index) => {
      const eff = rowPeriodEfficiency(row);
      const base: Record<string, string | number> = {
        Sıra: groupMeta ? groupMeta[index].indexInGroup + 1 : index + 1,
        "Ad Soyad": row.name,
        Grup: resolveTeamLabel(row.team),
        Proses: row.process,
        "Çalışılan Gün": row.activeDays,
        "Toplam Üretim": row.totalProduction,
        "Verimlilik %": eff !== null ? eff : "",
      };
      if (groupMeta) {
        base["Genel sıra"] = rows.findIndex((r) => r.workerId === row.workerId) + 1;
      }
      return base;
    });
    const trendSheet = trendRows.map((row) => ({
      Tarih: row.productionDate,
      "Günlük Toplam Üretim": row.totalProduction
    }));

    const XLSX = await loadXlsx();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(topSheet), "Top İşçi");
    if (personnelEfficiencyAnalysis.active && personnelEfficiencyAnalysis.sorted.length > 0) {
      const effRankSheet = personnelEfficiencyAnalysis.sorted.map(({ row, eff }, i) => ({
        Sıra: i + 1,
        "Ad Soyad": row.name,
        Grup: resolveTeamLabel(row.team),
        Proses: row.process,
        "Çalışılan Gün": row.activeDays,
        "Toplam Üretim": row.totalProduction,
        "Verimlilik %": eff,
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(effRankSheet), "Personel Verimlilik");
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trendSheet), "Günlük Trend");
    const workerDailySheet = workerDailyRows.map((row) => {
      const eff = dailyRowEfficiency(row);
      return {
        Tarih: row.productionDate,
        "Ad Soyad": row.name,
        Grup: resolveTeamLabel(row.team),
        Proses: row.process,
        Üretim: row.production,
        "Verimlilik %": eff !== null ? eff : "",
      };
    });
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
    doc.text(`Proses Filtresi: ${resolveProcessFilterLabel()}`, 14, 30);
    doc.text(`Saat Filtresi: ${displaySlotLabelForHourFilter(hourFilter)}`, 14, 35);

    const pdfHead = groupMeta
      ? [["# (proses içi)", "Genel", "Ad Soyad", "Grup", "Proses", "Çalışılan Gün", "Toplam Üretim", "Verim %"]]
      : [["#", "Ad Soyad", "Grup", "Proses", "Çalışılan Gün", "Toplam Üretim", "Verim %"]];
    const pdfBody = displayRows.map((row, index) => {
      const rankInView = groupMeta ? groupMeta[index].indexInGroup + 1 : index + 1;
      const globalRank = rows.findIndex((r) => r.workerId === row.workerId) + 1;
      const eff = rowPeriodEfficiency(row);
      const effCell = eff !== null ? `${eff}%` : "—";
      if (groupMeta) {
        return [
          rankInView,
          globalRank,
          row.name,
          resolveTeamLabel(row.team),
          row.process,
          row.activeDays,
          row.totalProduction,
          effCell,
        ];
      }
      return [rankInView, row.name, resolveTeamLabel(row.team), row.process, row.activeDays, row.totalProduction, effCell];
    });

    autoTable(doc, {
      startY: 40,
      head: pdfHead,
      body: pdfBody
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
    autoTable(doc, {
      startY: finalY + 8,
      head: [["Tarih", "Günlük Toplam Üretim"]],
      body: trendRows.map((row) => [row.productionDate, row.totalProduction])
    });

    let yAfterTrend = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
    if (personnelEfficiencyAnalysis.active && personnelEfficiencyAnalysis.sorted.length > 0) {
      if (yAfterTrend > 220) {
        doc.addPage();
        yAfterTrend = 20;
      }
      doc.setFontSize(11);
      doc.text("Personel verimlilik sıralaması (dönem ortalaması / günlük hedef)", 14, yAfterTrend + 6);
      autoTable(doc, {
        startY: yAfterTrend + 12,
        head: [["#", "Ad Soyad", "Grup", "Proses", "Verim %"]],
        body: personnelEfficiencyAnalysis.sorted.slice(0, 45).map((x, i) => [
          i + 1,
          x.row.name,
          resolveTeamLabel(x.row.team),
          x.row.process,
          `${x.eff}%`,
        ]),
      });
    }
    doc.save(`analiz-${startDate}-${endDate}.pdf`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 p-4 md:p-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{t("analysisPage.title")}</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t("analysisPage.subtitle")}
            </p>
            {lastUpdated && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                {t("common.lastUpdated")}: {lastUpdated} &nbsp;·&nbsp; {t("analysisPage.autoRefresh")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/analysis/genel-tamamlanan"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            >
              {t("analysisSubnav.generalCompletedLabel")}
            </Link>
            <Link
              href="/analysis/person"
              className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/40"
            >
              {t("analysisSubnav.personAnalysisLabel")}
            </Link>
            <Link
              href="/ekran2"
              className="rounded-md border border-teal-600/50 bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              EKRAN2
            </Link>
            <Link
              href="/ekran3"
              className="rounded-md border border-emerald-600/50 bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              EKRAN3
            </Link>
            <Link href="/" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
              {t("analysisPage.productionScreen")}
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <WeekdayDatePicker label={t("common.startDate")} value={startDate} onChange={setStartDate} />
          <WeekdayDatePicker label={t("common.endDate")} value={endDate} onChange={setEndDate} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium">{t("analysisPage.group")}</label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value as Team | "")}
                className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">{t("analysisPage.allGroups")}</option>
                {teamRows.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium">{t("common.process")}</label>
              <select
                value={processFilter}
                onChange={(e) => {
                  setProcessFilter(e.target.value);
                  setGroupByProcess(false);
                }}
                className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">{t("analysisPage.allProcesses")}</option>
                {processRows.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm sm:items-center">
            <input
              type="checkbox"
              checked={groupByProcess}
              disabled={processFilter !== ""}
              onChange={(e) => setGroupByProcess(e.target.checked)}
              className="mt-0.5 shrink-0 rounded border-slate-300 sm:mt-0"
            />
            <span
              className={`min-w-0 leading-snug ${processFilter !== "" ? "text-slate-400" : ""}`}
              title={t("analysisPage.groupByProcessTitle")}
            >
              <span className="sm:hidden">{t("analysisPage.groupByProcessShort")}</span>
              <span className="hidden sm:inline">{t("analysisPage.groupByProcessLong")}</span>
            </span>
          </label>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium">{t("common.hour")}</span>
            <div
              className="grid w-full min-w-0 grid-cols-5 gap-1 sm:gap-1.5"
              role="group"
              aria-label={t("analysisPage.hourFilterAria")}
            >
              {(
                [
                  { key: "" as HourFilter, label: t("common.all") },
                  { key: "t1000" as const, label: DISPLAY_SLOT_FILTER_LABELS[0] },
                  { key: "t1300" as const, label: DISPLAY_SLOT_FILTER_LABELS[1] },
                  { key: "t1600" as const, label: DISPLAY_SLOT_FILTER_LABELS[2] },
                  { key: "t1830" as const, label: DISPLAY_SLOT_FILTER_LABELS[3] },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key || "all"}
                  type="button"
                  onClick={() => setHourFilter(key)}
                  className={`min-h-9 rounded-md border px-0.5 py-1.5 text-center text-[11px] font-medium tabular-nums leading-tight sm:min-h-10 sm:px-2 sm:text-sm sm:leading-normal ${
                    hourFilter === key
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200"
                      : "border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportExcel}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              {t("nav.excel")}
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              {t("common.pdf")}
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("analysisPage.fetchAnalysis")}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      )}

      <AnalysisSubnav />

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            {t("common.chart")}
            {rows.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                ({t("analysisPage.workerCount", { count: rows.length })})
              </span>
            )}
          </h2>
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-emerald-500" /> {t("analysisPage.topTercile")}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-blue-500" /> {t("analysisPage.middleTercile")}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-red-500" /> {t("analysisPage.bottomTercile")}</span>
              {groupByProcess && (
                <span className="text-slate-600 dark:text-slate-300">· {t("analysisPage.tercilePerProcess")}</span>
              )}
              <span className="hidden italic opacity-70 sm:inline">{t("analysisPage.clickRowHint")}</span>
            </div>
          )}
        </div>
        {loading ? (
          <div className="text-sm text-slate-600">{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-600">{t("analysisPage.noDataInRange")}</div>
        ) : (
          <div className="space-y-1.5">
            {displayRows.map((row, index) => {
              const width    = maxValue > 0 ? Math.max(4, Math.round((row.totalProduction / maxValue) * 100)) : 0;
              const tercileIndex = groupMeta ? groupMeta[index].indexInGroup : index;
              const tercileTotal = groupMeta ? groupMeta[index].groupLen : rows.length;
              const { bar: barColor, rank: rankColor } = rankTercileStyles(tercileIndex, tercileTotal);
              const rankShown = groupMeta ? groupMeta[index].indexInGroup + 1 : index + 1;
              const isActive = hoveredId === row.workerId;
              const showProcessHeader = groupByProcess && (index === 0 || displayRows[index - 1].process !== row.process);
              const eff = rowPeriodEfficiency(row);
              return (
                <Fragment key={`${row.workerId}-${row.process}-${index}`}>
                  {showProcessHeader && (
                    <div className="border-b border-slate-200 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600 first:pt-0 dark:border-slate-600 dark:text-slate-300">
                      {row.process || "—"}
                    </div>
                  )}
                <div
                  className={`grid cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm transition-colors
                    grid-cols-[24px_minmax(0,1fr)_2fr_56px_2.5rem]
                    sm:grid-cols-[28px_minmax(0,200px)_1fr_72px_2.75rem]
                    ${isActive ? "bg-slate-100 dark:bg-slate-700/60" : "hover:bg-slate-50 dark:hover:bg-slate-700/30"}`}
                  onMouseEnter={(e: RMouseEvent) => {
                    setHoveredId(row.workerId);
                    setTooltipPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e: RMouseEvent) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setHoveredId(isActive ? null : row.workerId)}
                >
                  <span className={`text-xs ${rankColor}`}>{rankShown}</span>
                  <span className="truncate text-xs sm:text-sm">{row.name}</span>
                  <div className="h-4 rounded bg-slate-200 dark:bg-slate-700 sm:h-5">
                    <div className={`h-full rounded ${barColor} transition-all duration-500`} style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right text-xs font-semibold sm:text-sm">{row.totalProduction}</span>
                  <span
                    className="text-right text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300 sm:text-xs"
                    title={hourFilter !== "" ? t("analysisPage.periodEfficiencyHourHint") : t("analysisPage.periodEfficiencyTitle")}
                  >
                    {eff !== null ? `${eff}%` : "—"}
                  </span>
                </div>
                </Fragment>
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
        const globalRank = rows.findIndex((r) => r.workerId === hoveredId) + 1;
        const di = displayRows.findIndex((r) => r.workerId === hoveredId);
        const gm = groupMeta && di >= 0 ? groupMeta[di] : null;
        const rankLabel = gm
          ? `#${gm.indexInGroup + 1}. proses içi (${gm.groupLen}) · genel #${globalRank}`
          : `#${globalRank}. sıra`;

        const isSingleAnalysisDay = startDate === endDate;
        const hourlyRaw: WorkerHourlyBreakdown = hourlyData ?? {
          t1000: 0,
          t1300: 0,
          t1600: 0,
          t1830: 0,
        };
        const showEfficiency = hourFilter === "";
        let tooltipEff: number | null = null;
        if (showEfficiency) {
          if (
            isSingleAnalysisDay &&
            startDate === todayWorkdayIsoTurkey() &&
            !hourlyLoading &&
            hourlyData
          ) {
            const synth = hourlyToProductionRow(worker, hourlyRaw);
            tooltipEff = workerEfficiencyPercent(synth, prosesMap, true);
          } else {
            tooltipEff = efficiencyPercentFromTotals(
              prosesMap,
              worker.team,
              worker.process,
              worker.totalProduction,
              Math.max(worker.activeDays, 1)
            );
          }
        }
        const shiftAvgs =
          isSingleAnalysisDay && !hourlyLoading
            ? computeShiftHourAverages(hourlyRaw, worker.totalProduction)
            : null;

        const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const cardW = 320;
        const cardH = startDate === endDate ? 400 : 300;
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
                <span className="font-medium text-slate-600 dark:text-slate-300">{t("analysisPage.detail")}</span>
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
                <span>{rankLabel}</span>
              </div>
            </div>

            {/* Özet istatistikler */}
            <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/30">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">{worker.totalProduction}</div>
                <div className="text-xs text-slate-500">{t("common.total")}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/30">
                <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{worker.activeDays}</div>
                <div className="text-xs text-slate-500">{t("analysisPage.activeDays")}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/30">
                <div className="text-lg font-bold text-violet-600 dark:text-violet-300">{avg}</div>
                <div className="text-xs text-slate-500">{t("analysisPage.dailyAvgShort")}</div>
              </div>
              <div
                className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/30"
                title={
                  showEfficiency && isSingleAnalysisDay && startDate === todayWorkdayIsoTurkey() && hourlyData
                    ? "Bugün için vardiya içi (intraday) oran; diğer aralıklarda dönem ortalamasına göre tam gün hedefi."
                    : showEfficiency
                      ? "Ortalama günlük üretim ÷ proses günlük hedefi (dk×60×9), en fazla %100."
                      : "Saat filtresi açıkken verimlilik hesaplanmaz."
                }
              >
                <div className="text-lg font-bold text-amber-600 dark:text-amber-300">
                  {tooltipEff !== null ? `${tooltipEff}%` : "—"}
                </div>
                <div className="text-xs text-slate-500">{t("nav.efficiency")}</div>
              </div>
            </div>

            {shiftAvgs ? (
              <div className="mb-3 grid grid-cols-2 gap-2 text-center">
                <div
                  className="rounded-lg bg-sky-50 p-2 dark:bg-sky-950/25"
                  title="09:00 ile son adet girilen ölçüm saati arası; toplam bu süreye bölünür (ör. son giriş 18:30 → 9,5 saat)."
                >
                  <div className="text-lg font-bold tabular-nums text-sky-700 dark:text-sky-300">
                    {shiftAvgs.perHourInWindow}
                  </div>
                  <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600 dark:text-slate-400">
                    Ortalama / saat
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium leading-tight text-slate-500 dark:text-slate-500">
                    {shiftAvgs.windowHint}
                  </div>
                </div>
                <div
                  className="rounded-lg bg-violet-50 p-2 dark:bg-violet-950/25"
                  title={`Seçili gün toplamı ÷ ${SHIFT_NOMINAL_HOURS} saat.`}
                >
                  <div className="text-lg font-bold tabular-nums text-violet-700 dark:text-violet-300">
                    {shiftAvgs.perHourEightHourDay}
                  </div>
                  <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600 dark:text-slate-400">
                    Günlük ortalama
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-500">
                    {SHIFT_NOMINAL_HOURS} saat üzerinden
                  </div>
                </div>
              </div>
            ) : isSingleAnalysisDay && hourlyLoading ? (
              <div className="mb-2 text-center text-[10px] text-slate-400">Saatlik ortalamalar hesaplanıyor…</div>
            ) : null}

            {/* Saatlik bar grafik */}
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("analysisPage.hourlyProduction")}
              </div>
              {hourlyLoading ? (
                <div className="text-xs text-slate-400">{t("common.loading")}</div>
              ) : hourlyData ? (() => {
                const agg = aggregateDisplaySlots(hourlyData);
                const slots = [
                  { label: DISPLAY_SLOT_CHART_LABELS[0], key: "t1000" as const, color: "bg-violet-500" },
                  { label: DISPLAY_SLOT_CHART_LABELS[1], key: "t1300" as const, color: "bg-blue-500" },
                  { label: DISPLAY_SLOT_CHART_LABELS[2], key: "t1600" as const, color: "bg-emerald-500" },
                  { label: DISPLAY_SLOT_CHART_LABELS[3], key: "t1830" as const, color: "bg-amber-500" },
                ];
                const slotMax = Math.max(...slots.map((s) => agg[s.key]), 1);
                return (
                  <div className="space-y-1.5">
                    {slots.map((s) => {
                      const val   = agg[s.key];
                      const pct   = Math.round((val / slotMax) * 100);
                      return (
                        <div key={s.key} className="flex items-center gap-2 text-[10px] leading-tight sm:text-xs">
                          <span className="w-[7.5rem] shrink-0 text-right text-slate-500 dark:text-slate-400 sm:w-36">{s.label}</span>
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
                <div className="text-xs text-slate-400">{t("analysisPage.noHourlyData")}</div>
              )}
            </div>
          </div>
        );
      })()}

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <h2 className="mb-3 text-base font-semibold">{t("analysisPage.trendTitle")}</h2>
        {trendRows.length === 0 ? (
          <div className="text-sm text-slate-600">{t("analysisPage.noTrendData")}</div>
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

      <section className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-emerald-50/50 p-4 shadow-sm dark:border-indigo-900/40 dark:from-indigo-950/40 dark:via-slate-900 dark:to-emerald-950/20 dark:text-slate-100">
        <div className="mb-4 flex flex-col gap-2 border-b border-indigo-100/80 pb-3 dark:border-indigo-900/50 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t("analysisPage.effSectionTitle")}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t("analysisPage.effSectionDesc")}
            </p>
          </div>
        </div>

        {!personnelEfficiencyAnalysis.active ? (
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200/90">
            {t("analysisPage.effNeedsAllHours")}
          </p>
        ) : loading && rows.length === 0 ? (
          <div className="text-sm text-slate-500">{t("common.loading")}</div>
        ) : personnelEfficiencyAnalysis.withTarget === 0 && personnelEfficiencyAnalysis.withoutTarget === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("analysisPage.noWorkersInRange")}</p>
        ) : personnelEfficiencyAnalysis.withTarget === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("analysisPage.noTargetsFound")}
          </p>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-emerald-100 bg-white/90 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-slate-800/80">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  {t("analysisPage.avgEfficiency")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-200">
                  {personnelEfficiencyAnalysis.avg !== null ? `%${personnelEfficiencyAnalysis.avg}` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("analysisPage.medianEfficiency")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
                  {personnelEfficiencyAnalysis.median !== null ? `%${personnelEfficiencyAnalysis.median}` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-violet-100 bg-white/90 p-4 shadow-sm dark:border-violet-900/40 dark:bg-slate-800/80">
                <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                  {t("analysisPage.withTarget")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-violet-800 dark:text-violet-100">
                  {personnelEfficiencyAnalysis.withTarget}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">{t("analysisPage.personRecords")}</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-white/90 p-4 shadow-sm dark:border-amber-900/40 dark:bg-slate-800/80">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {t("analysisPage.below75")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-100">
                  {personnelEfficiencyAnalysis.below75}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">{t("analysisPage.peopleShort")}</p>
              </div>
            </div>

            {personnelEfficiencyAnalysis.withoutTarget > 0 ? (
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                {t("analysisPage.excludedNoTarget", { count: personnelEfficiencyAnalysis.withoutTarget })}
              </p>
            ) : null}

            {personnelEfficiencyAnalysis.sorted.length > 0 ? (
              <>
                <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t("analysisPage.effRankChart", { count: Math.min(EFF_VIZ_TOP, personnelEfficiencyAnalysis.sorted.length) })}
                </h3>
                <div className="mb-6 space-y-2 rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  {personnelEfficiencyAnalysis.sorted.slice(0, EFF_VIZ_TOP).map(({ row, eff }, index) => {
                    const w = Math.max(3, eff);
                    const { rank: rankTextClass } = rankTercileStyles(
                      index,
                      Math.min(EFF_VIZ_TOP, personnelEfficiencyAnalysis.sorted.length)
                    );
                    const barTone =
                      eff >= 85
                        ? "from-emerald-500 to-teal-400"
                        : eff >= 60
                          ? "from-amber-500 to-orange-400"
                          : "from-rose-500 to-orange-600";
                    return (
                      <div
                        key={`${row.workerId}-${row.team}-${row.process}-${index}`}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-[0_1_52%] lg:flex-[0_1_48%]">
                          <span className={`w-6 shrink-0 text-center text-xs font-bold tabular-nums ${rankTextClass}`}>
                            {index + 1}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100"
                            title={row.name}
                          >
                            {row.name}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${barTone}`}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                          <span className="w-28 shrink-0 truncate text-[10px] text-slate-500 dark:text-slate-400 sm:text-xs">
                            {resolveTeamLabel(row.team)}
                          </span>
                          <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-indigo-800 dark:text-indigo-200">
                            %{eff}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t("analysisPage.fullEffRank", { count: personnelEfficiencyAnalysis.sorted.length })}
                </h3>
                <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600">
                  <table className="w-full min-w-[760px] border-collapse text-xs sm:text-sm">
                    <thead className="sticky top-0 z-[1] bg-indigo-50 text-left shadow-sm dark:bg-indigo-950/70">
                      <tr>
                        <th className="px-3 py-2 font-semibold">#</th>
                        <th className="px-3 py-2 font-semibold">{t("workerForm.name")}</th>
                        <th className="px-3 py-2 font-semibold">{t("analysisPage.group")}</th>
                        <th className="px-3 py-2 font-semibold">{t("common.process")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("analysisPage.tableDays")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("analysisPage.tableTotalProduction")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("analysisPage.tableEfficiency")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personnelEfficiencyAnalysis.sorted.map(({ row, eff }, i) => (
                        <tr
                          key={`eff-row-${row.workerId}-${row.team}-${row.process}-${i}`}
                          className="border-b border-slate-100 odd:bg-white dark:border-slate-700 dark:odd:bg-slate-800/50"
                        >
                          <td className="px-3 py-1.5 tabular-nums text-slate-600 dark:text-slate-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-900 dark:text-slate-100">{row.name}</td>
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                            {resolveTeamLabel(row.team)}
                          </td>
                          <td className="max-w-[10rem] truncate px-3 py-1.5 text-slate-700 dark:text-slate-300">
                            {row.process}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{row.activeDays}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{row.totalProduction}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                            %{eff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <h2 className="mb-3 text-base font-semibold">{t("analysisPage.topWorkersTable")}</h2>
        <p className="mb-3 text-sm text-slate-600">
          {t("analysisPage.productionShown", { label: displaySlotLabelForHourFilter(hourFilter) })}
          {groupByProcess && t("analysisPage.groupByProcessNote")}
          {hourFilter !== "" ? (
            <span className="mt-1 block text-xs text-amber-800 dark:text-amber-200/90">
              {t("analysisPage.hourFilterEffWarning")}
            </span>
          ) : null}
        </p>
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              {groupMeta && <th className="px-2 py-2 text-left">{t("common.globalRank")}</th>}
              <th className="px-2 py-2 text-left">{t("workerForm.name")}</th>
              <th className="px-2 py-2 text-left">{t("analysisPage.group")}</th>
              <th className="px-2 py-2 text-left">{t("common.process")}</th>
              <th className="px-2 py-2 text-right">{t("analysisPage.activeDays")}</th>
              <th className="px-2 py-2 text-right">{t("analysisPage.tableTotalProduction")}</th>
              <th className="px-2 py-2 text-right">{t("nav.efficiency")} %</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => {
              const rankInView = groupMeta ? groupMeta[index].indexInGroup + 1 : index + 1;
              const globalRank = rows.findIndex((r) => r.workerId === row.workerId) + 1;
              const tercileIndex = groupMeta ? groupMeta[index].indexInGroup : index;
              const tercileTotal = groupMeta ? groupMeta[index].groupLen : rows.length;
              const { rank: rankColor } = rankTercileStyles(tercileIndex, tercileTotal);
              const eff = rowPeriodEfficiency(row);
              return (
                <tr key={`${row.workerId}-${index}`} className="border-b border-slate-200">
                  <td className={`px-2 py-2 font-medium ${rankColor}`}>{rankInView}</td>
                  {groupMeta && <td className="px-2 py-2 text-slate-600">{globalRank}</td>}
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{resolveTeamLabel(row.team)}</td>
                  <td className="px-2 py-2">{row.process}</td>
                  <td className="px-2 py-2 text-right">{row.activeDays}</td>
                  <td className="px-2 py-2 text-right font-semibold">{row.totalProduction}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                    {eff !== null ? `${eff}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold">{t("analysisPage.dailyEffSection")}</h2>
          <input
            value={workerSearch}
            onChange={(e) => setWorkerSearch(e.target.value)}
            placeholder={t("analysisPage.workerSearchPlaceholder")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:w-72 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
        </div>
        {filteredWorkerDailyRows.length === 0 ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">{t("analysisPage.noDataInRange")}</div>
        ) : (
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="bg-slate-100 dark:bg-slate-700">
              <tr>
                <th className="px-2 py-2 text-left">{t("common.date")}</th>
                <th className="px-2 py-2 text-left">{t("workerForm.name")}</th>
                <th className="px-2 py-2 text-left">{t("analysisPage.group")}</th>
                <th className="px-2 py-2 text-left">{t("common.process")}</th>
                <th className="px-2 py-2 text-right">{t("common.production")}</th>
                <th className="px-2 py-2 text-right">{t("nav.efficiency")} %</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkerDailyRows.map((row) => {
                const eff = dailyRowEfficiency(row);
                return (
                  <tr key={`${row.productionDate}-${row.workerId}`} className="border-b border-slate-200 dark:border-slate-600">
                    <td className="px-2 py-2">{row.productionDate}</td>
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">{resolveTeamLabel(row.team)}</td>
                    <td className="px-2 py-2">{row.process}</td>
                    <td className="px-2 py-2 text-right font-semibold">{row.production}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{eff !== null ? `${eff}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
