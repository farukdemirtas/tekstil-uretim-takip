"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  formatTurkishPeriodDescription,
  PersonOnePageSummaryReport,
} from "@/components/person-analysis/PersonOnePageSummaryReport";
import {
  getTeams,
  getTopWorkersAnalytics,
  getWorkerProductionDailyDetail,
  getWorkers,
  setAuthToken,
} from "@/lib/api";
import {
  addDaysToIso,
  calendarMonthWeekdayBounds,
  mondayOfWeekFromIso,
  previousMondayFridayWeekFromIso,
  rollingCalendarDaysWeekdayRange,
  todayWeekdayIso,
  todayWorkdayIsoTurkey,
} from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";
import { downloadEachElementAsOwnPdfPage, downloadElementAsMultiPagePdf } from "@/lib/exportHtmlElementToPdf";
import { injectPdfCloneLightTextFix } from "@/lib/pdfHtml2CloneFix";
import {
  aggregateDisplaySlots,
  DISPLAY_SLOT_CHART_LABELS,
  DISPLAY_SLOT_ORDER,
  DISPLAY_SLOT_PDF_LABELS,
  displaySlotChartLabel,
  displaySlotPdfLabel,
  type DisplaySlotKey,
} from "@/lib/displaySlotAggregation";
import { sumProductionRow } from "@/lib/productionSlots";
import { SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { getProsesMapForEfficiency } from "@/lib/prosesVeri";
import {
  efficiencyPercentForDayProduction,
  efficiencyPercentFromTotals,
  workerEfficiencyPercent,
} from "@/lib/workerEfficiency";
import type { HourFilter, ProductionRow, Worker, WorkerProductionDayDetail } from "@/lib/types";
import type * as XLSX from "xlsx";
import { loadXlsx } from "@/lib/xlsxLazy";

function dayTotal(r: WorkerProductionDayDetail): number {
  return sumProductionRow(r as unknown as ProductionRow);
}

function detailToProductionRow(r: WorkerProductionDayDetail): ProductionRow {
  return {
    workerId: r.workerId ?? 0,
    name: r.name,
    team: r.team as ProductionRow["team"],
    process: r.process,
    t1000: r.t1000,
    t1300: r.t1300,
    t1600: r.t1600,
    t1830: r.t1830,
    h0900: r.h0900 ?? 0,
    h1000: r.h1000 ?? 0,
    h1115: r.h1115 ?? 0,
    h1215: r.h1215 ?? 0,
    h1300: r.h1300 ?? 0,
    h1445: r.h1445 ?? 0,
    h1545: r.h1545 ?? 0,
    h1700: r.h1700 ?? 0,
    h1830: r.h1830 ?? 0,
    ekSayim: 0,
  };
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

/** Trend ekseni için kısa etiket (gg.aa) */
function formatDateAxis(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return iso.slice(5);
  }
}

const SLOT_COLORS = ["#0d9488", "#0891b2", "#7c3aed", "#ea580c"] as const;

const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

function ensureIsoRangeOrder(start: string, end: string): { start: string; end: string } {
  return start <= end ? { start, end } : { start: end, end: start };
}

function EfficiencyBadge({ pct, tight }: { pct: number; tight?: boolean }) {
  const tone =
    pct >= 85
      ? "bg-emerald-100 text-emerald-900 ring-emerald-700/15 dark:bg-emerald-950/70 dark:text-emerald-100 dark:ring-emerald-500/35"
      : pct >= 70
        ? "bg-amber-100 text-amber-950 ring-amber-700/15 dark:bg-amber-950/45 dark:text-amber-50 dark:ring-amber-500/30"
        : "bg-rose-50 text-rose-900 ring-rose-700/15 dark:bg-rose-950/40 dark:text-rose-50 dark:ring-rose-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold tabular-nums ring-1 ${tone} ${
        tight ? "px-1.5 py-px text-[10px]" : "justify-end px-2 py-0.5 text-[11px]"
      }`}
    >
      %{Math.round(pct)}
    </span>
  );
}

export default function PersonAnalysisPage() {
  const pdfCaptureRef = useRef<HTMLDivElement>(null);
  const bulkPdfHostRef = useRef<HTMLDivElement>(null);
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
  const [includeSameNameWorkers, setIncludeSameNameWorkers] = useState(true);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkPdfJob, setBulkPdfJob] = useState<null | {
    pages: WorkerProductionDayDetail[][];
    periodDescription: string;
    startDate: string;
    endDate: string;
    reportTimeLabel: string;
  }>(null);
  const [presetYear, setPresetYear] = useState(() => {
    const [y] = todayWorkdayIsoTurkey().split("-").map(Number);
    return y;
  });
  const [presetMonth, setPresetMonth] = useState(() => {
    const [, m] = todayWorkdayIsoTurkey().split("-").map(Number);
    return m;
  });

  const teamLabel = useCallback(
    (code: string) => teamLabels[code] ?? code,
    [teamLabels]
  );

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    const canAccess = hasPermission("analysis") || hasPermission("ekran2");
    if (!token || !canAccess) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    void getTeams()
      .then((t) => setTeamLabels(Object.fromEntries(t.map((x) => [x.code, x.label]))))
      .catch(() => {});
    setWorkersLoading(true);
    setWorkersError(null);
    void getWorkers()
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "tr", { sensitivity: "base" }));
        setWorkers(sorted);
        setWorkerId((prev) => {
          if (sorted.length === 0) return "";
          const current = typeof prev === "number" ? prev : null;
          if (current != null && sorted.some((w) => w.id === current)) return current;
          return sorted[0]!.id;
        });
      })
      .catch((e) => {
        setWorkersError(e instanceof Error ? e.message : "Personel listesi yüklenemedi");
        setWorkers([]);
      })
      .finally(() => setWorkersLoading(false));
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
        includeSameNameWorkers,
      });
      setRows(data);
      setLoadedAt(new Date().toLocaleString("tr-TR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workerId, startDate, endDate, includeSameNameWorkers]);

  const applyQuickRange = useCallback((rangeStart: string, rangeEnd: string) => {
    const o = ensureIsoRangeOrder(rangeStart, rangeEnd);
    setStartDate(o.start);
    setEndDate(o.end);
  }, []);

  const presetPreviousWeek = useCallback(() => {
    const { start, end } = previousMondayFridayWeekFromIso(todayWorkdayIsoTurkey());
    applyQuickRange(start, end);
  }, [applyQuickRange]);

  const presetLast15Days = useCallback(() => {
    const end = todayWorkdayIsoTurkey();
    const { start, end: e } = rollingCalendarDaysWeekdayRange(end, 15);
    applyQuickRange(start, e);
  }, [applyQuickRange]);

  const presetThisMonth = useCallback(() => {
    const [y, m] = todayWorkdayIsoTurkey().split("-").map(Number);
    const { start, end } = calendarMonthWeekdayBounds(y, m);
    applyQuickRange(start, end);
  }, [applyQuickRange]);

  const presetThisWeekToToday = useCallback(() => {
    const ref = todayWorkdayIsoTurkey();
    const mon = mondayOfWeekFromIso(ref);
    const fri = addDaysToIso(mon, 4);
    const end = ref < fri ? ref : fri;
    applyQuickRange(mon, end);
  }, [applyQuickRange]);

  const applySelectedCalendarMonth = useCallback(() => {
    const { start, end } = calendarMonthWeekdayBounds(presetYear, presetMonth);
    applyQuickRange(start, end);
  }, [applyQuickRange, presetYear, presetMonth]);

  const yearPresetChoices = useMemo(() => {
    const y = Number(todayWorkdayIsoTurkey().split("-")[0]);
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const meta = rows[0];

  /** Takvim günü başına toplam (aynı gün birden fazla bölüm/proses satırı varsa toplanır) */
  const dateTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const t = dayTotal(r);
      m.set(r.productionDate, (m.get(r.productionDate) ?? 0) + t);
    }
    return m;
  }, [rows]);

  const sortedDates = useMemo(() => [...dateTotals.keys()].sort(), [dateTotals]);

  /** Çalışan kayıt no + bölüm/proses bazında dönem özeti */
  const processBreakdown = useMemo(() => {
    const byWorker = new Map<
      number,
      { team: string; process: string; days: Set<string>; total: number }
    >();
    for (const r of rows) {
      const id = r.workerId ?? 0;
      if (!byWorker.has(id)) {
        byWorker.set(id, { team: r.team, process: r.process, days: new Set(), total: 0 });
      }
      const e = byWorker.get(id)!;
      e.days.add(r.productionDate);
      e.total += dayTotal(r);
    }
    return [...byWorker.entries()]
      .map(([workerId, v]) => ({
        workerId,
        team: v.team,
        process: v.process,
        dayCount: v.days.size,
        total: v.total,
      }))
      .sort(
        (a, b) =>
          a.team.localeCompare(b.team, "tr", { sensitivity: "base" }) ||
          a.process.localeCompare(b.process, "tr", { sensitivity: "base" }) ||
          a.workerId - b.workerId
      );
  }, [rows]);

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
        dominantSlotKey: "t1000" as DisplaySlotKey,
        dominantSlotTotal: 0,
      };
    }
    const dayCount = sortedDates.length;
    let grandTotal = 0;
    const slotTotals = { t1000: 0, t1300: 0, t1600: 0, t1830: 0 };
    for (const r of rows) {
      const t = dayTotal(r);
      grandTotal += t;
      const d = aggregateDisplaySlots(r);
      slotTotals.t1000 += d.t1000;
      slotTotals.t1300 += d.t1300;
      slotTotals.t1600 += d.t1600;
      slotTotals.t1830 += d.t1830;
    }
    let maxDay: { date: string; total: number } | null = null;
    let minDay: { date: string; total: number } | null = null;
    for (const d of sortedDates) {
      const dt = dateTotals.get(d) ?? 0;
      if (!maxDay || dt > maxDay.total) maxDay = { date: d, total: dt };
      if (!minDay || dt < minDay.total) minDay = { date: d, total: dt };
    }
    const denom = dayCount > 0 ? dayCount : 1;
    const avgPerDay = Math.round(grandTotal / denom);
    const avgPerNominalShift = Math.round(grandTotal / SHIFT_NOMINAL_HOURS / denom);
    const slotAvgPerDay = {
      t1000: Math.round(slotTotals.t1000 / denom),
      t1300: Math.round(slotTotals.t1300 / denom),
      t1600: Math.round(slotTotals.t1600 / denom),
      t1830: Math.round(slotTotals.t1830 / denom),
    };
    let dominantSlotKey: DisplaySlotKey = "t1000";
    let dominantSlotTotal = -1;
    for (const key of DISPLAY_SLOT_ORDER) {
      const v = slotTotals[key];
      if (v > dominantSlotTotal) {
        dominantSlotTotal = v;
        dominantSlotKey = key;
      }
    }
    return {
      grandTotal,
      activeDays: dayCount,
      avgPerDay,
      avgPerNominalShift,
      maxDay,
      minDay,
      slotTotals,
      slotAvgPerDay,
      dominantSlotKey,
      dominantSlotTotal,
    };
  }, [rows, sortedDates, dateTotals]);

  const slotLabelForCapture = pdfExporting ? displaySlotPdfLabel : displaySlotChartLabel;
  const slotColumnLabels = pdfExporting ? DISPLAY_SLOT_PDF_LABELS : DISPLAY_SLOT_CHART_LABELS;

  const prosesMap = useMemo(() => getProsesMapForEfficiency(), [loadedAt]);

  const periodEfficiencyPercent = useMemo(() => {
    if (rows.length === 0) return null;
    if (processBreakdown.length === 1) {
      const pb = processBreakdown[0];
      return efficiencyPercentFromTotals(
        prosesMap,
        pb.team,
        pb.process,
        stats.grandTotal,
        Math.max(stats.activeDays, 1)
      );
    }
    let sumW = 0;
    let sumTW = 0;
    for (const pb of processBreakdown) {
      const e = efficiencyPercentFromTotals(
        prosesMap,
        pb.team,
        pb.process,
        pb.total,
        Math.max(pb.dayCount, 1)
      );
      if (e === null) continue;
      sumTW += e * pb.total;
      sumW += pb.total;
    }
    if (sumW <= 0) return null;
    return Math.min(Math.round(sumTW / sumW), 100);
  }, [rows.length, processBreakdown, prosesMap, stats.grandTotal, stats.activeDays]);

  const pdfHeaderDepartmentLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of processBreakdown) {
      const label = teamLabel(p.team);
      if (!seen.has(label)) {
        seen.add(label);
        out.push(label);
      }
    }
    return out;
  }, [processBreakdown, teamLabel]);

  const pdfHeaderProcessEffRows = useMemo(
    () =>
      processBreakdown.map((pb) => ({
        process: pb.process,
        bolum: teamLabel(pb.team),
        eff: efficiencyPercentFromTotals(
          prosesMap,
          pb.team,
          pb.process,
          pb.total,
          Math.max(pb.dayCount, 1)
        ),
      })),
    [processBreakdown, prosesMap, teamLabel]
  );

  /** Okunabilir özet satırları (TV / masaüstü) */
  const insightLines = useMemo(() => {
    if (!meta || rows.length === 0) return [] as string[];
    const lines: string[] = [];
    const nDays = stats.activeDays;
    const total = stats.grandTotal;
    lines.push(
      `${nDays} üretim gününde toplam ${total.toLocaleString("tr-TR")} adet toplandı. Seçilen tarih aralığında girilmiş günlük kayıtların birleşik tutarıdır.`
    );
    if (nDays > 0) {
      lines.push(
        `Gün başına ortalama ${stats.avgPerDay.toLocaleString(
          "tr-TR"
        )} adet. Yaklaşık tam bir ${SHIFT_NOMINAL_HOURS} saatlik vardiya için ~${stats.avgPerNominalShift.toLocaleString(
          "tr-TR"
        )} adet (günlük ortalamanın saate yayılması) olarak okunabilir.`
      );
    }
    const domPct =
      stats.grandTotal > 0 ? Math.round((100 * stats.dominantSlotTotal) / stats.grandTotal) : 0;
    lines.push(
      `Üretim; sabah / öğle / öğleden sonra / akşam olmak üzere dört dilimde gösterilir. Bu dönemde en fazla çıktı «${displaySlotChartLabel(
        stats.dominantSlotKey
      )}» diliminde (toplamın ~%${domPct}).`
    );
    if (periodEfficiencyPercent !== null) {
      lines.push(
        `Dönem verimliliği yaklaşık %${Math.round(
          periodEfficiencyPercent
        )}: ayarlardaki dk hedefine göre hesaplanır. Bugün satırında tam gün kapanmadan önce vardiya içi oran kullanılabilir.`
      );
    } else if (processBreakdown.length > 1) {
      lines.push(
        "Verim yüzdesi burada bileşik döneme gösterilir; ayrıntı için aşağıdaki bölüm/proses özetindeki kolonları inceleyin."
      );
    }
    if (stats.maxDay && stats.minDay && stats.activeDays > 1) {
      lines.push(
        `Tek günlük en yüksek ${stats.maxDay.total.toLocaleString("tr-TR")} (${stats.maxDay.date}), en düşük ${stats.minDay.total.toLocaleString("tr-TR")} (${stats.minDay.date}).`
      );
    }
    return lines;
  }, [
    meta,
    rows.length,
    stats.activeDays,
    stats.avgPerDay,
    stats.avgPerNominalShift,
    stats.grandTotal,
    stats.dominantSlotKey,
    stats.dominantSlotTotal,
    stats.maxDay,
    stats.minDay,
    periodEfficiencyPercent,
    processBreakdown.length,
  ]);

  function dayRowEfficiencyPercent(r: WorkerProductionDayDetail): number | null {
    const isToday = r.productionDate === todayWorkdayIsoTurkey();
    if (isToday) {
      return workerEfficiencyPercent(detailToProductionRow(r), prosesMap, true);
    }
    return efficiencyPercentForDayProduction(prosesMap, r.team, r.process, dayTotal(r));
  }

  const trendPoints = useMemo(() => {
    if (sortedDates.length === 0) return "";
    const totals = sortedDates.map((d) => dateTotals.get(d) ?? 0);
    const maxT = Math.max(...totals, 1);
    const w = 640;
    const h = 160;
    if (sortedDates.length === 1) {
      const y = h - Math.round((totals[0] / maxT) * h);
      return `0,${y} ${w},${y}`;
    }
    return sortedDates
      .map((_, i) => {
        const x = Math.round((i / (sortedDates.length - 1)) * w);
        const y = h - Math.round((totals[i] / maxT) * h);
        return `${x},${y}`;
      })
      .join(" ");
  }, [sortedDates, dateTotals]);

  /** Trend altı: çok güne kırıldığında sık etiketleri seyreltir */
  const trendAxisLabelIndexes = useMemo(() => {
    const n = sortedDates.length;
    if (n === 0) return new Set<number>();
    const idx = new Set<number>([0, n - 1]);
    if (n <= 8) {
      for (let i = 1; i < n - 1; i++) idx.add(i);
      return idx;
    }
    const inner = 5;
    for (let k = 1; k < inner; k++) {
      const i = Math.round((k / inner) * (n - 1));
      if (i > 0 && i < n - 1) idx.add(i);
    }
    return idx;
  }, [sortedDates]);

  const exportExcel = async () => {
    if (!meta || rows.length === 0) return;
    const ozet = [
      { Alan: "Personel", Değer: meta.name },
      { Alan: "Aynı isim birleştirme", Değer: includeSameNameWorkers ? "Açık (tüm kayıtlar)" : "Kapalı (yalnızca seçilen kayıt)" },
      { Alan: "Bölüm (özet)", Değer: teamLabel(meta.team) },
      { Alan: "Proses (özet)", Değer: meta.process },
      { Alan: "Tarih aralığı", Değer: `${startDate} — ${endDate}` },
      { Alan: "Takvim günü (birleşik)", Değer: stats.activeDays },
      { Alan: "Toplam üretim", Değer: stats.grandTotal },
      { Alan: "Günlük ortalama (toplam)", Değer: stats.avgPerDay },
      { Alan: "Saatlik ortalama", Değer: stats.avgPerNominalShift },
      { Alan: "En yüksek gün", Değer: stats.maxDay ? `${stats.maxDay.date} (${stats.maxDay.total})` : "—" },
      { Alan: "En düşük gün", Değer: stats.minDay ? `${stats.minDay.date} (${stats.minDay.total})` : "—" },
      { Alan: "Baskın saat dilimi", Değer: `${displaySlotChartLabel(stats.dominantSlotKey)} (${stats.dominantSlotTotal})` },
      {
        Alan: "Dönem verimliliği",
        Değer: periodEfficiencyPercent !== null ? `${periodEfficiencyPercent}%` : "—",
      },
    ];
    const gunluk = rows.map((r) => {
      const d = aggregateDisplaySlots(r);
      const eff = dayRowEfficiencyPercent(r);
      return {
        Tarih: r.productionDate,
        "Kayıt no": r.workerId ?? "",
        Bölüm: teamLabel(r.team),
        Proses: r.process,
        [DISPLAY_SLOT_CHART_LABELS[0]]: d.t1000,
        [DISPLAY_SLOT_CHART_LABELS[1]]: d.t1300,
        [DISPLAY_SLOT_CHART_LABELS[2]]: d.t1600,
        [DISPLAY_SLOT_CHART_LABELS[3]]: d.t1830,
        "Gün toplamı": dayTotal(r),
        "Verimlilik %": eff !== null ? eff : "",
      };
    });
    const bolumOzet = processBreakdown.map((row) => {
      const eff = efficiencyPercentFromTotals(
        prosesMap,
        row.team,
        row.process,
        row.total,
        Math.max(row.dayCount, 1)
      );
      return {
        Bölüm: teamLabel(row.team),
        Proses: row.process,
        "Kayıt no": row.workerId,
        "Üretim günü": row.dayCount,
        Toplam: row.total,
        "Verimlilik %": eff !== null ? eff : "",
      };
    });
    const saatlik = DISPLAY_SLOT_ORDER.map((key) => ({
      "Saat dilimi": displaySlotChartLabel(key),
      "Aralık toplamı": stats.slotTotals[key],
      "Günlük ortalama": stats.slotAvgPerDay[key],
      Oran:
        stats.grandTotal > 0
          ? `${Math.round((100 * stats.slotTotals[key]) / stats.grandTotal)}%`
          : "0%",
    }));
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ozet), "Özet");
    if (bolumOzet.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bolumOzet), "Bölüm proses özeti");
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gunluk), "Günlük saatlik");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(saatlik), "Saatlik özet");
    XLSX.writeFile(wb, `kisi-analiz-${meta.name.slice(0, 24)}-${startDate}-${endDate}.xlsx`);
  };

  const exportPdf = async () => {
    if (!meta || rows.length === 0 || !pdfCaptureRef.current) return;
    setPdfExporting(true);
    const el = pdfCaptureRef.current;
    const omitEls = Array.from(el.querySelectorAll<HTMLElement>(".omit-from-person-pdf"));
    const omitDisplayPrev = omitEls.map((node) => node.style.display);
    omitEls.forEach((node) => {
      node.style.display = "none";
    });
    el.classList.add("person-pdf-compact-export");
    el.scrollIntoView({ block: "nearest", behavior: "instant" });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      await downloadElementAsMultiPagePdf({
        element: el,
        fileName: `kisi-analiz-${startDate}-${endDate}.pdf`,
        marginMm: 10,
        scale: 2,
        imageQuality: 0.95,
        onclone: (clonedDoc) => injectPdfCloneLightTextFix(clonedDoc),
      });
    } catch {
      setError("PDF oluşturulamadı. Sayfayı yenileyip tekrar deneyin.");
    } finally {
      el.classList.remove("person-pdf-compact-export");
      omitEls.forEach((node, i) => {
        node.style.display = omitDisplayPrev[i] ?? "";
      });
      setPdfExporting(false);
    }
  };

  const fetchBulkSummaryData = useCallback(async () => {
    const pm = getProsesMapForEfficiency();
    const top = await getTopWorkersAnalytics({
      startDate,
      endDate,
      team: "",
      process: "",
      hour: "" as HourFilter,
      limit: 9999,
    });
    return { pm, top };
  }, [startDate, endDate]);

  const exportAllPersonnelSummaryExcel = useCallback(async () => {
    setBulkExporting(true);
    setError(null);
    try {
      const XLSX = await loadXlsx();
      const { pm, top } = await fetchBulkSummaryData();
      const sheetRows = top.map((row) => {
        const eff = efficiencyPercentFromTotals(
          pm,
          row.team,
          row.process,
          row.totalProduction,
          Math.max(row.activeDays, 1)
        );
        return {
          "Kayıt no": row.workerId,
          Personel: row.name,
          Bölüm: teamLabel(row.team),
          Proses: row.process,
          "Üretim günü": row.activeDays,
          "Toplam adet": row.totalProduction,
          "Verimlilik %": eff !== null ? eff : "",
        };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), "Kişi özeti");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          { Alan: "Tarih aralığı", Değer: `${startDate} — ${endDate}` },
          { Alan: "Personel satırı", Değer: top.length },
          {
            Alan: "Not",
            Değer: "Dönemde üretim kaydı olan tüm personel (Genel analiz / sıralama ile uyumlu özet).",
          },
        ]),
        "Rapor"
      );
      XLSX.writeFile(wb, `kisi-bazli-toplu-ozet-${startDate}-${endDate}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toplu özet indirilemedi");
    } finally {
      setBulkExporting(false);
    }
  }, [fetchBulkSummaryData, teamLabel, startDate, endDate]);

  const exportAllPersonnelSummaryPdf = useCallback(async () => {
    setBulkExporting(true);
    setError(null);
    try {
      const { top } = await fetchBulkSummaryData();
      if (top.length === 0) {
        setError("Bu tarih aralığında üretim kaydı olan personel yok.");
        setBulkExporting(false);
        return;
      }
      const pages: WorkerProductionDayDetail[][] = [];
      const seenMergedName = new Set<string>();
      for (const row of top) {
        if (includeSameNameWorkers) {
          const key = row.name.trim().toLowerCase();
          if (seenMergedName.has(key)) continue;
          seenMergedName.add(key);
        }
        const detail = await getWorkerProductionDailyDetail({
          workerId: row.workerId,
          startDate,
          endDate,
          includeSameNameWorkers,
        });
        if (detail.length > 0) pages.push(detail);
      }
      if (pages.length === 0) {
        setError("Rapor için yeterli veri alınamadı.");
        setBulkExporting(false);
        return;
      }
      setBulkPdfJob({
        pages,
        periodDescription: formatTurkishPeriodDescription(startDate, endDate),
        startDate,
        endDate,
        reportTimeLabel: new Date().toLocaleString("tr-TR"),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toplu PDF hazırlanamadı");
      setBulkExporting(false);
    }
  }, [fetchBulkSummaryData, startDate, endDate, includeSameNameWorkers]);

  useEffect(() => {
    if (!bulkPdfJob) return;
    const host = bulkPdfHostRef.current;
    if (!host) {
      setBulkPdfJob(null);
      setBulkExporting(false);
      return;
    }
    void (async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      await new Promise<void>((r) => setTimeout(r, 80));
      const captureEl = bulkPdfHostRef.current;
      if (!captureEl) {
        setBulkPdfJob(null);
        setBulkExporting(false);
        return;
      }
      try {
        const prevLeft = captureEl.style.left;
        const prevTop = captureEl.style.top;
        captureEl.style.left = "0px";
        captureEl.style.top = "0px";
        try {
          const sheets = Array.from(
            captureEl.querySelectorAll<HTMLElement>("[data-bulk-pdf-person-page]")
          );
          await downloadEachElementAsOwnPdfPage({
            elements: sheets,
            fileName: `kisi-bazli-toplu-ozet-${bulkPdfJob.startDate}-${bulkPdfJob.endDate}.pdf`,
            marginMm: 8,
            scale: 2,
            imageQuality: 0.92,
            onclone: (clonedDoc) => injectPdfCloneLightTextFix(clonedDoc),
          });
        } finally {
          captureEl.style.left = prevLeft;
          captureEl.style.top = prevTop;
        }
      } catch {
        setError("Toplu PDF oluşturulamadı. Sayfayı yenileyip tekrar deneyin.");
      } finally {
        setBulkPdfJob(null);
        setBulkExporting(false);
      }
    })();
  }, [bulkPdfJob]);

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
                Üretim listesinde yer alan aktif personeli seçin; günlük toplamlar, dört saat diliminde dağılım, verim ve
                trend tek ekranda özetlenir. İsteğe bağlı olarak aylık veya son 15 gün gibi dönem kısayolu ve tüm
                personel özeti (Excel veya her çalışan için bir sayfa PDF) kullanılabilir; tekil raporu Excel veya PDF olarak
                dışa aktarabilirsiniz.
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
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Sorgu</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                <strong className="font-semibold text-slate-800 dark:text-slate-200">Aktif personel</strong> listesinden
                kişiyi seçin. Hafta içi tarihlerde günlük ve saat dilimi kırılımını yüklersiniz; aşağıdan hafta / ay /
                son 15 gün gibi dönem kısayolları veya tüm personel için toplu özet (Excel veya çok sayfalı tek PDF:
                kişi başına bir sayfa, günlük saatlik tablo olmadan) kullanılabilir.
              </p>
            </div>
          {workersError ? (
            <div
              className="mb-4 rounded-xl border border-red-200/90 bg-red-50/95 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-100"
              role="alert"
            >
              Personel listesi alınamadı: {workersError}. Oturumunuzun açık olduğundan ve Analiz veya EKRAN2 yetkisinin
              tanımlı olduğundan emin olun; sayfayı yenileyin.
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Aktif personel
              </label>
              <select
                value={workerId === "" ? "" : String(workerId)}
                onChange={(e) => setWorkerId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={workersLoading || !!workersError}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-inner shadow-slate-900/[0.03] outline-none ring-teal-500/25 transition focus:border-teal-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none"
              >
                <option value="">
                  {workersLoading ? "Liste yükleniyor…" : "Kişi seçin…"}
                </option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {teamLabel(w.team)} / {w.process}
                  </option>
                ))}
              </select>
              {!workersLoading && !workersError && workers.length === 0 ? (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">
                  Aktif kayıtlı personel yok. Ana üretim ekranından personel ekleyin veya oturumu kontrol edin.
                </p>
              ) : null}
            </div>
            <WeekdayDatePicker label="Başlangıç" value={startDate} onChange={setStartDate} />
            <WeekdayDatePicker label="Bitiş" value={endDate} onChange={setEndDate} />
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-600/80 dark:bg-slate-900/35">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Hızlı dönem
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={presetThisWeekToToday}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:bg-teal-950/40"
              >
                Bu hafta (Pts–bugün)
              </button>
              <button
                type="button"
                onClick={presetPreviousWeek}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:bg-teal-950/40"
              >
                Önceki hafta (Pts–Cum)
              </button>
              <button
                type="button"
                onClick={presetLast15Days}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:bg-teal-950/40"
              >
                Son 15 gün
              </button>
              <button
                type="button"
                onClick={presetThisMonth}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:bg-teal-950/40"
              >
                Bu ay
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Yıl</label>
                <select
                  value={presetYear}
                  onChange={(e) => setPresetYear(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-inner outline-none ring-teal-500/25 focus:border-teal-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {yearPresetChoices.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ay</label>
                <select
                  value={presetMonth}
                  onChange={(e) => setPresetMonth(Number(e.target.value))}
                  className="min-w-[9.5rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-inner outline-none ring-teal-500/25 focus:border-teal-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {TR_MONTHS.map((label, idx) => (
                    <option key={label} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={applySelectedCalendarMonth}
                className="rounded-xl border border-teal-200/90 bg-teal-50/90 px-3 py-2 text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 dark:border-teal-800/60 dark:bg-teal-950/50 dark:text-teal-100 dark:hover:bg-teal-900/50"
              >
                Seçilen ay
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
              Son 15 gün: bugünü (İstanbul takvimine göre son iş günü) bitiş alır, geriye 15 takvim gününe uzanır; hafta
              sonu uçları hafta içine çekilir. Seçilen ay: takvim ayının ilk ve son iş günleri arasıdır (ör. Nisan).
            </p>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-left text-xs leading-relaxed text-slate-700 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-500"
              checked={includeSameNameWorkers}
              onChange={(e) => setIncludeSameNameWorkers(e.target.checked)}
            />
            <span>
              <strong className="font-semibold text-slate-800 dark:text-slate-200">Aynı isimli tüm kayıtları birleştir.</strong>{" "}
              Bir kişi farklı bölüm veya proses için ayrı çalışan satırlarına sahipse (aynı ad), tüm bu alanların üretimi
              tek raporda gösterilir; aşağıda bölüm/proses özeti ve günlük satırlar yer alır.
            </span>
          </label>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 dark:border-slate-700/80">
            <button
              type="button"
              disabled={loading || workerId === "" || workersLoading || !!workersError || workers.length === 0}
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
            <span className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-600" aria-hidden />
            <button
              type="button"
              title="Seçili tarih aralığındaki tüm personel özet satırları (genel analiz ile aynı mantık)"
              disabled={bulkExporting}
              onClick={() => void exportAllPersonnelSummaryExcel()}
              className="rounded-xl border border-violet-200/90 bg-violet-50/90 px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800/50 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-900/50"
            >
              {bulkExporting ? "Toplu özet…" : "Toplu kişi özeti (Excel)"}
            </button>
            <button
              type="button"
              title="Tarih aralığında üretim yapan herkes için tek sayfa özet (ekrandaki kişi raporu gibi, günlük saatlik tablo yok)"
              disabled={bulkExporting}
              onClick={() => void exportAllPersonnelSummaryPdf()}
              className="rounded-xl border border-violet-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800/50 dark:bg-slate-800/90 dark:text-violet-100 dark:hover:bg-violet-950/30"
            >
              {bulkExporting ? "Toplu özet…" : "Toplu kişi özeti (PDF)"}
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
            className="person-pdf-capture person-pdf-print-host mb-10 space-y-8 rounded-3xl border border-slate-200/90 bg-white p-6 text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_20px_50px_-20px_rgba(15,23,42,0.15)] [color-scheme:light] dark:border-slate-600 dark:shadow-none dark:ring-1 dark:ring-slate-700/40"
            data-pdf-render-root
          >
            <header className="pdf-avoid-break border-b border-slate-200/90 pb-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-teal-600">
                    <span className="h-px w-8 bg-teal-500/60" aria-hidden />
                    Üretim raporu
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kişi bazlı analiz</p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                    {meta.name}
                  </h2>

                  <div className="mt-3 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Dönemde çalışılan bölümler
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {pdfHeaderDepartmentLabels.length > 0 ? pdfHeaderDepartmentLabels.join(" · ") : "—"}
                    </p>
                  </div>

                  <div className="mt-2 rounded-xl border border-slate-200/90 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Çalıştığı proses ve verim (dönem)
                    </p>
                    {processBreakdown.length === 1 ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {processBreakdown[0].process}
                        </span>
                        {pdfHeaderProcessEffRows[0]?.eff !== null ? (
                          <EfficiencyBadge pct={pdfHeaderProcessEffRows[0].eff!} />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    ) : (
                      <ul className="mt-1 space-y-1 text-sm">
                        {pdfHeaderProcessEffRows.map((row, idx) => (
                          <li
                            key={`${row.process}-${row.bolum}-${idx}`}
                            className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{row.process}</span>
                            <span className="text-slate-500 dark:text-slate-400">({row.bolum})</span>
                            {row.eff !== null ? <EfficiencyBadge pct={row.eff} /> : <span className="text-slate-400">—</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {processBreakdown.length > 1 ? (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {processBreakdown.length} çalışma kaydı birleştirildi; her satır ilgili bölümdeki proses ve verimdir.
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Dönem: {startDate} — {endDate} · Üretim günü: {stats.activeDays}
                    {loadedAt ? ` · Rapor: ${loadedAt}` : null}
                  </p>
                </div>
                <div className="text-left text-sm text-slate-500 sm:text-right dark:text-slate-400">
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Yeşil İmaj Tekstil</p>
                  <p className="mt-0.5 leading-snug">Kişi bazlı üretim takibi</p>
                </div>
              </div>
            </header>

            {insightLines.length > 0 ? (
              <section
                className="omit-from-person-pdf rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/40 px-5 py-4 shadow-sm ring-1 ring-teal-900/[0.06]"
                aria-label="Dönem özeti"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-xs font-black text-white shadow-sm"
                    aria-hidden
                  >
                    i
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900">Bu tablo ne söylüyor?</h3>
                    <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
                      {insightLines.map((line, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-teal-500 bg-gradient-to-br from-white to-teal-50/40 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Toplam üretim</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-teal-700">{stats.grandTotal.toLocaleString("tr-TR")}</p>
                <p className="mt-2 text-[10px] leading-snug text-slate-500">Dönem içindeki tüm günler ve satırların toplam adedi.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-slate-400 bg-gradient-to-br from-white to-slate-50/90 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Üretim günü</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{stats.activeDays}</p>
                <p className="mt-2 text-[10px] leading-snug text-slate-500">En az bir kayıt olan farklı iş günü sayısı.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-blue-500 bg-gradient-to-br from-white to-blue-50/40 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Günlük ortalama</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{stats.avgPerDay.toLocaleString("tr-TR")}</p>
                <p className="mt-2 text-[10px] leading-snug text-slate-500">Toplam üretim ÷ üretim günü (boş günler dahil değil).</p>
              </div>
              <div className="rounded-2xl border border-slate-100 border-l-4 border-l-violet-500 bg-gradient-to-br from-white to-violet-50/40 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Saatlik ortalama</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{stats.avgPerNominalShift.toLocaleString("tr-TR")}</p>
                <p className="mt-2 text-[10px] leading-snug text-slate-500">Günlük ortalamanın nominal tam vardiya süresine bölünmesi.</p>
              </div>
              <div
                className="col-span-2 rounded-2xl border border-slate-100 border-l-4 border-l-amber-500 bg-gradient-to-br from-white to-amber-50/50 p-4 shadow-sm ring-1 ring-slate-900/[0.04] md:col-span-1 xl:col-span-1"
                title="Proses dk hedefine göre; çoklu bölümde üretim ağırlıklı ortalama."
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Dönem verimliliği</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-200">
                  {periodEfficiencyPercent !== null ? `%${Math.round(periodEfficiencyPercent)}` : "—"}
                </p>
                <p className="mt-2 text-[10px] leading-snug text-slate-500">
                  Hedefle karşılaştırmalı yüzde (bugün: vardiya içi hesap mümkün).
                </p>
              </div>
            </section>

            <section className="pdf-avoid-break rounded-2xl border border-slate-200/90 bg-slate-50/50 p-5 ring-1 ring-slate-900/[0.04]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Dilim payı (dönem toplamı)</h3>
                <span className="text-[11px] font-medium text-slate-500">
                  Dört dilimde üretimin dağılımı — hangi dilime ne kadar düşmüş?
                </span>
              </div>
              <div className="flex h-7 w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-inner ring-1 ring-slate-200/90">
                {DISPLAY_SLOT_ORDER.map((key, idx) => {
                  const raw = stats.grandTotal > 0 ? (100 * stats.slotTotals[key]) / stats.grandTotal : 0;
                  const wPct = stats.grandTotal > 0 ? Math.max(raw, stats.slotTotals[key] > 0 ? 1.25 : 0) : 0;
                  const label = `${slotLabelForCapture(key)}: ${stats.slotTotals[key]} (${Math.round(raw)}%)`;
                  if (stats.slotTotals[key] <= 0 || wPct <= 0) return null;
                  return (
                    <div
                      key={key}
                      title={label}
                      className="h-full min-w-[6px] border-r border-white/30 transition-[flex-grow] last:border-r-0"
                      style={{
                        flexGrow: wPct,
                        flexBasis: 0,
                        backgroundColor: SLOT_COLORS[idx],
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-700">
                {DISPLAY_SLOT_ORDER.map((key, idx) => {
                  const v = stats.slotTotals[key];
                  const pct = stats.grandTotal > 0 ? Math.round((100 * v) / stats.grandTotal) : 0;
                  return (
                    <span key={key} className="inline-flex items-center gap-2">
                      <span className="h-2 w-6 rounded-sm shrink-0" style={{ backgroundColor: SLOT_COLORS[idx] }} />
                      <span className="font-medium text-slate-800">{slotLabelForCapture(key)}</span>
                      <span className="tabular-nums text-slate-500">{v.toLocaleString("tr-TR")} (%{pct})</span>
                    </span>
                  );
                })}
              </div>
            </section>

            {processBreakdown.length > 1 ? (
              <section className="pdf-avoid-break overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
                <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50/80 to-slate-50/50 px-5 py-4 dark:from-violet-950/30 dark:to-slate-900/50">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden />
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Bölüm ve proses özeti (dönem)
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Seçilen kişi adına tanımlı her çalışma alanı için üretim günü sayısı ve toplam adet.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-sm text-slate-800 dark:text-slate-100">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        <th className="px-4 py-3">Bölüm</th>
                        <th className="px-4 py-3">Proses</th>
                        <th className="px-3 py-3 text-right">Kayıt no</th>
                        <th className="px-3 py-3 text-right">Üretim günü</th>
                        <th className="px-4 py-3 text-right">Toplam</th>
                        <th className="px-3 py-3 text-right">Verim %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processBreakdown.map((row) => {
                        const eff = efficiencyPercentFromTotals(
                          prosesMap,
                          row.team,
                          row.process,
                          row.total,
                          Math.max(row.dayCount, 1)
                        );
                        return (
                          <tr
                            key={row.workerId}
                            className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70 dark:border-slate-700 dark:odd:bg-slate-900/40 dark:even:bg-slate-800/30"
                          >
                            <td className="px-4 py-2.5 font-medium">{teamLabel(row.team)}</td>
                            <td className="px-4 py-2.5">{row.process}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                              {row.workerId}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.dayCount}</td>
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums text-violet-800 dark:text-violet-200">
                              {row.total.toLocaleString("tr-TR")}
                            </td>
                            <td className="px-3 py-2.5 text-right align-middle">
                              {eff !== null ? (
                                <div className="flex justify-end">
                                  <EfficiencyBadge pct={eff} />
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="pdf-avoid-break rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04]">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden />
                  <h3 className="text-sm font-semibold text-slate-800">Günlük toplam trendi</h3>
                </div>
                <div className="mb-3 space-y-1">
                  <p className="text-xs leading-relaxed text-slate-500">
                    Grafik her iş gününün günlük toplamını birleştirir; tarihler aşağıda hizalıdır (çok güne sığdırmak
                    için ara etiketler atlanabilir).
                  </p>
                </div>
                <svg viewBox="0 0 640 160" className="h-40 w-full rounded-xl bg-gradient-to-b from-slate-50 to-slate-100/80 ring-1 ring-slate-200/80">
                  <defs>
                    <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(13 148 136)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="rgb(13 148 136)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {sortedDates.length > 1 && trendPoints ? (
                    <polygon fill={`url(#${chartGradientId})`} points={`0,160 ${trendPoints} 640,160`} />
                  ) : null}
                  <polyline
                    fill="none"
                    stroke="rgb(13 148 136)"
                    strokeWidth="2.5"
                    points={trendPoints}
                  />
                  {sortedDates.map((d, i) => {
                    const totals = sortedDates.map((x) => dateTotals.get(x) ?? 0);
                    const maxT = Math.max(...totals, 1);
                    const h = 160;
                    const x = sortedDates.length === 1 ? 320 : Math.round((i / (sortedDates.length - 1)) * 640);
                    const y = h - Math.round((totals[i] / maxT) * h);
                    return <circle key={d} cx={x} cy={y} r="4" fill="rgb(15 118 110)" />;
                  })}
                </svg>
                <div className="relative mt-1.5 h-5 w-full text-[10px] text-slate-500">
                  {sortedDates.map((d, i) => {
                    if (!trendAxisLabelIndexes.has(i)) return null;
                    const leftPct = sortedDates.length === 1 ? 50 : (i / (sortedDates.length - 1)) * 100;
                    return (
                      <span
                        key={`trend-axis-${d}`}
                        className="absolute whitespace-nowrap -translate-x-1/2 tabular-nums"
                        style={{ left: `${leftPct}%` }}
                      >
                        {formatDateAxis(d)}
                      </span>
                    );
                  })}
                </div>
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
                  Baskın dilim: <span className="font-semibold text-slate-700">{slotLabelForCapture(stats.dominantSlotKey)}</span>{" "}
                  ({stats.grandTotal > 0 ? Math.round((100 * stats.dominantSlotTotal) / stats.grandTotal) : 0}%)
                </p>
                <ul className="space-y-3">
                  {DISPLAY_SLOT_ORDER.map((key) => {
                    const v = stats.slotTotals[key];
                    const pct = Math.round((v / slotMax) * 100);
                    const share = stats.grandTotal > 0 ? Math.round((100 * v) / stats.grandTotal) : 0;
                    return (
                      <li key={key} className="flex items-center gap-3 text-sm text-slate-800">
                        <span className="w-32 shrink-0 text-[10px] font-semibold leading-tight text-slate-600 sm:w-40 sm:text-xs">
                          {slotLabelForCapture(key)}
                        </span>
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
                  {DISPLAY_SLOT_ORDER.map((key) => (
                    <span key={key} className="mr-2 inline-block">
                      {slotLabelForCapture(key)}: <strong className="text-slate-700">{stats.slotAvgPerDay[key]}</strong>
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
                  {meta.name}
                  {processBreakdown.length <= 1
                    ? ` · ${teamLabel(meta.team)} · ${meta.process}`
                    : " — günlük satırlar bölüm ve proses kırılımıyla listelenir."}
                </p>
              </div>
              <div className="person-daily-wrap overflow-x-auto rounded-b-2xl">
                <table className="person-daily-table w-full min-w-[760px] border-collapse text-sm text-slate-800">
                  <thead className="sticky top-0 z-[1] shadow-sm">
                    <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
                      <th className="px-4 py-3">Tarih</th>
                      {processBreakdown.length > 1 ? (
                        <th className="px-2 py-3 text-right whitespace-nowrap">Kayıt</th>
                      ) : null}
                      <th className="px-3 py-3">Bölüm</th>
                      <th className="px-3 py-3">Proses</th>
                      <th className="max-w-[8rem] px-2 py-3 text-right text-[10px] leading-tight sm:max-w-none sm:px-3 sm:text-xs">
                        {slotColumnLabels[0]}
                      </th>
                      <th className="max-w-[8rem] px-2 py-3 text-right text-[10px] leading-tight sm:max-w-none sm:px-3 sm:text-xs">
                        {slotColumnLabels[1]}
                      </th>
                      <th className="max-w-[8rem] px-2 py-3 text-right text-[10px] leading-tight sm:max-w-none sm:px-3 sm:text-xs">
                        {slotColumnLabels[2]}
                      </th>
                      <th className="max-w-[8rem] px-2 py-3 text-right text-[10px] leading-tight sm:max-w-none sm:px-3 sm:text-xs">
                        {slotColumnLabels[3]}
                      </th>
                      <th className="px-4 py-3 text-right">Gün toplamı</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">Verim %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const t = dayTotal(r);
                      const d = aggregateDisplaySlots(r);
                      const rowKey = `${r.productionDate}-${r.workerId ?? 0}-${r.team}-${r.process}`;
                      const eff = dayRowEfficiencyPercent(r);
                      return (
                        <tr
                          key={rowKey}
                          className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70"
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{r.productionDate}</td>
                          {processBreakdown.length > 1 ? (
                            <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{r.workerId ?? "—"}</td>
                          ) : null}
                          <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-700" title={teamLabel(r.team)}>
                            {teamLabel(r.team)}
                          </td>
                          <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-700" title={r.process}>
                            {r.process}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{d.t1000}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{d.t1300}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{d.t1600}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{d.t1830}</td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-teal-800">{t}</td>
                          <td
                            className="px-3 py-2.5 text-right align-middle"
                            title={
                              r.productionDate === todayWorkdayIsoTurkey()
                                ? "Bugün: vardiya içi (intraday) verimlilik"
                                : "Tam günlük hedefe göre"
                            }
                          >
                            <div className="flex justify-end">
                              {eff !== null ? <EfficiencyBadge pct={eff} /> : <span className="text-slate-400">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-teal-50/90 font-semibold text-slate-800">
                      <td
                        className="px-4 py-3"
                        colSpan={processBreakdown.length > 1 ? 4 : 3}
                      >
                        Dönem toplamı
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1000}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1300}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1600}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{stats.slotTotals.t1830}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-teal-800">{stats.grandTotal}</td>
                      <td className="px-3 py-3 text-right text-slate-400">—</td>
                    </tr>
                    <tr className="bg-slate-100/80 text-xs">
                      <td
                        className="px-4 py-2 text-slate-600"
                        colSpan={processBreakdown.length > 1 ? 4 : 3}
                      >
                        Günlük ortalama
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1000}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1300}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1600}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{stats.slotAvgPerDay.t1830}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">{stats.avgPerDay}</td>
                      <td className="px-3 py-2 text-right text-slate-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {bulkPdfJob && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={bulkPdfHostRef}
              className="bulk-pdf-print-host pointer-events-none box-border w-[794px] max-w-[794px] overflow-visible bg-white"
              aria-hidden
              data-pdf-render-root
              style={{
                position: "fixed",
                left: "-900px",
                top: 0,
                zIndex: 99990,
              }}
            >
              {bulkPdfJob.pages.map((pageRows, i) => (
                <div
                  key={`bulk-pdf-${bulkPdfJob.startDate}-${bulkPdfJob.endDate}-${i}`}
                  data-bulk-pdf-person-page
                  className="box-border w-full bg-white"
                >
                  <PersonOnePageSummaryReport
                    rows={pageRows}
                    teamLabel={teamLabel}
                    chartGradientId={`bulk-grad-${i}-${bulkPdfJob.startDate.replace(/-/g, "")}`}
                    startDate={bulkPdfJob.startDate}
                    endDate={bulkPdfJob.endDate}
                    periodDescription={bulkPdfJob.periodDescription}
                    reportTimeLabel={bulkPdfJob.reportTimeLabel}
                    compact
                    onePdfPage
                  />
                </div>
              ))}
            </div>,
            document.body
          )
        : null}

      {typeof document !== "undefined" && (pdfExporting || bulkPdfJob) ? (
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{
              /* Chrome: backdrop-blure beyaz/glitch ekranına yol açabilir; katmanda düz RGBA kullan */
              backgroundColor: "rgba(15, 23, 42, 0.78)",
              zIndex: 999999,
            }}
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <p className="rounded-2xl border border-white/35 bg-white px-8 py-4 text-base font-semibold text-slate-900 shadow-xl">
              PDF oluşturuluyor…
            </p>
          </div>,
          document.body
        )
      ) : null}
    </main>
  );
}
