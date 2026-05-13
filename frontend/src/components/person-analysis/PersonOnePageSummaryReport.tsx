"use client";

import { useMemo } from "react";
import {
  aggregateDisplaySlots,
  DISPLAY_SLOT_ORDER,
  displaySlotChartLabel,
  displaySlotPdfLabel,
  type DisplaySlotKey,
} from "@/lib/displaySlotAggregation";
import { sumProductionRow } from "@/lib/productionSlots";
import { SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import { getProsesMapForEfficiency } from "@/lib/prosesVeri";
import { efficiencyPercentFromTotals } from "@/lib/workerEfficiency";
import type { ProductionRow, WorkerProductionDayDetail } from "@/lib/types";

const SLOT_COLORS = ["#0d9488", "#0891b2", "#7c3aed", "#ea580c"] as const;

function dayTotal(r: WorkerProductionDayDetail): number {
  return sumProductionRow(r as unknown as ProductionRow);
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

function formatDateAxis(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return iso.slice(5);
  }
}

function EfficiencyBadge({ pct, tight }: { pct: number; tight?: boolean }) {
  const tone =
    pct >= 85
      ? "bg-emerald-100 text-emerald-900 ring-emerald-700/15"
      : pct >= 70
        ? "bg-amber-100 text-amber-950 ring-amber-700/15"
        : "bg-rose-50 text-rose-900 ring-rose-700/15";
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

export type PersonOnePageSummaryReportProps = {
  rows: WorkerProductionDayDetail[];
  teamLabel: (code: string) => string;
  chartGradientId: string;
  startDate: string;
  endDate: string;
  /** Üst bantta gösterilecek Türkçe tarih ifadesi */
  periodDescription: string;
  reportTimeLabel?: string;
  /** Toplu PDF: tek sayfaya sığdırmak için daha sıkı boşluk */
  compact?: boolean;
  /** Toplu PDF: her personel ayrı A4 sayfası — tablo ve bloklar daha kompakt */
  onePdfPage?: boolean;
};

/**
 * Kişi analizi özet görünümü: KPI, dilim payı, (çoğul kayıtta) bölüm/proses özeti, trend + saat dilimi.
 * Günlük saatlik detay tablosu yok.
 */
export function PersonOnePageSummaryReport({
  rows,
  teamLabel,
  chartGradientId,
  startDate,
  endDate,
  periodDescription,
  reportTimeLabel,
  compact,
  onePdfPage,
}: PersonOnePageSummaryReportProps) {
  const meta = rows[0];

  const dateTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const t = dayTotal(r);
      m.set(r.productionDate, (m.get(r.productionDate) ?? 0) + t);
    }
    return m;
  }, [rows]);

  const sortedDates = useMemo(() => [...dateTotals.keys()].sort(), [dateTotals]);

  const processBreakdown = useMemo(() => {
    const byWorker = new Map<number, { team: string; process: string; days: Set<string>; total: number }>();
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

  const prosesMap = useMemo(() => getProsesMapForEfficiency(), []);

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

  const uniqueDepartmentLabels = useMemo(() => {
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

  const processEffRows = useMemo(
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

  const slotMax = Math.max(
    stats.slotTotals.t1000,
    stats.slotTotals.t1300,
    stats.slotTotals.t1600,
    stats.slotTotals.t1830,
    1
  );

  if (!meta || rows.length === 0) return null;

  const sectionGap = onePdfPage ? "space-y-2" : compact ? "space-y-4" : "space-y-8";
  const chartH = onePdfPage ? "h-24" : compact ? "h-32" : "h-40";
  const rootPad = onePdfPage ? "p-2.5" : "p-4";
  const kpiNumCls = onePdfPage ? "text-lg" : "text-2xl";
  const kpiCardPad = onePdfPage ? "p-2" : "p-3";
  const kpiDescCls = onePdfPage ? "mt-0.5 text-[9px] leading-tight text-slate-500" : "mt-1 text-[10px] leading-snug text-slate-500";
  const slotLabel = onePdfPage ? displaySlotPdfLabel : displaySlotChartLabel;

  return (
    <div
      className={`person-one-page-summary text-slate-900 ${sectionGap} rounded-2xl border border-slate-200/90 bg-white ${rootPad} shadow-sm [color-scheme:light]`}
      data-pdf-render-root
      style={{
        fontFamily: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        className={
          onePdfPage
            ? "rounded-lg border-2 border-teal-600/35 bg-gradient-to-r from-teal-50 to-emerald-50/80 px-2 py-1.5 text-center shadow-sm"
            : "rounded-xl border-2 border-teal-600/35 bg-gradient-to-r from-teal-50 to-emerald-50/80 px-3 py-2.5 text-center shadow-sm"
        }
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-teal-800">Bu raporun veri aralığı</p>
        <p className={`font-bold leading-snug text-slate-900 ${onePdfPage ? "mt-0.5 text-sm" : "mt-1 text-base"}`}>
          {periodDescription}
        </p>
        <p className={`font-medium text-slate-600 ${onePdfPage ? "mt-0.5 text-[10px]" : "mt-1 text-[11px]"}`}>
          ({startDate} — {endDate})
        </p>
      </div>

      <header className={`border-b border-slate-200/90 ${onePdfPage ? "pb-2" : "pb-4"}`}>
        <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between ${onePdfPage ? "gap-2" : "gap-3"}`}>
          <div className="min-w-0 flex-1">
            <p
              className={`inline-flex items-center gap-2 font-bold uppercase tracking-[0.2em] text-teal-600 ${
                onePdfPage ? "text-xs" : "text-sm"
              }`}
            >
              <span className={`bg-teal-500/60 ${onePdfPage ? "h-px w-7" : "h-px w-8"}`} aria-hidden />
              Üretim raporu
            </p>
            <p
              className={`text-slate-500 dark:text-slate-400 ${
                onePdfPage ? "mt-0.5 text-xs" : "mt-1 text-sm"
              }`}
            >
              Kişi bazlı analiz
            </p>
            <h2
              className={`font-extrabold tracking-tight text-slate-900 dark:text-slate-100 ${
                onePdfPage ? "mt-1 text-xl leading-tight sm:text-2xl" : "mt-2 text-2xl sm:text-3xl"
              }`}
            >
              {meta.name}
            </h2>

            <div
              className={`mt-2 rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-slate-600 dark:bg-slate-800/50 ${
                onePdfPage ? "px-2 py-1.5" : "px-3 py-2"
              }`}
            >
              <p
                className={`font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
                  onePdfPage ? "text-[9px]" : "text-[10px]"
                }`}
              >
                Dönemde çalışılan bölümler
              </p>
              <p
                className={`font-semibold text-slate-800 dark:text-slate-100 ${
                  onePdfPage ? "mt-0.5 text-xs leading-snug" : "mt-1 text-sm"
                }`}
              >
                {uniqueDepartmentLabels.length > 0 ? uniqueDepartmentLabels.join(" · ") : "—"}
              </p>
            </div>

            <div
              className={`rounded-xl border border-slate-200/90 bg-white dark:border-slate-600 dark:bg-slate-900/40 ${
                onePdfPage ? "mt-1.5 px-2 py-1.5" : "mt-2 px-3 py-2"
              }`}
            >
              <p
                className={`font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
                  onePdfPage ? "text-[9px]" : "text-[10px]"
                }`}
              >
                Çalıştığı proses ve verim (dönem)
              </p>
              {processBreakdown.length === 1 ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`font-semibold text-slate-900 dark:text-slate-100 ${
                      onePdfPage ? "text-sm" : "text-base"
                    }`}
                  >
                    {processBreakdown[0].process}
                  </span>
                  {processEffRows[0]?.eff !== null ? (
                    <EfficiencyBadge pct={processEffRows[0].eff!} tight={!!onePdfPage} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              ) : (
                <ul className={`mt-1 space-y-1 ${onePdfPage ? "text-[11px]" : "text-sm"}`}>
                  {processEffRows.map((row, idx) => (
                    <li
                      key={`${row.process}-${row.bolum}-${idx}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{row.process}</span>
                      <span className="text-slate-500 dark:text-slate-400">({row.bolum})</span>
                      {row.eff !== null ? (
                        <EfficiencyBadge pct={row.eff} tight={!!onePdfPage} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {processBreakdown.length > 1 ? (
              <p className={`text-slate-500 dark:text-slate-400 ${onePdfPage ? "mt-1 text-[10px]" : "mt-2 text-xs"}`}>
                {processBreakdown.length} çalışma kaydı birleştirildi; her satır ilgili bölümdeki proses ve verimdir.
              </p>
            ) : null}

            <p className={`text-slate-500 dark:text-slate-400 ${onePdfPage ? "mt-1 text-[10px]" : "mt-2 text-xs"}`}>
              Üretim günü: {stats.activeDays}
              {reportTimeLabel ? ` · Rapor: ${reportTimeLabel}` : null}
            </p>
          </div>
          <div
            className={`text-left text-slate-500 sm:text-right dark:text-slate-400 ${
              onePdfPage ? "text-xs" : "text-sm"
            }`}
          >
            <p className={`font-semibold text-slate-700 dark:text-slate-200 ${onePdfPage ? "text-sm" : "text-base"}`}>
              Yeşil İmaj Tekstil
            </p>
            <p className={onePdfPage ? "mt-0.5 text-[11px] leading-snug" : "text-sm leading-snug"}>
              Kişi bazlı üretim takibi
            </p>
          </div>
        </div>
      </header>

      <section className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 ${onePdfPage ? "gap-1.5" : "gap-2"}`}>
        <div
          className={`rounded-2xl border border-slate-100 border-l-4 border-l-teal-500 bg-gradient-to-br from-white to-teal-50/40 shadow-sm ring-1 ring-slate-900/[0.04] ${kpiCardPad}`}
        >
          <p className={`font-bold uppercase tracking-wide text-slate-500 ${onePdfPage ? "text-[9px]" : "text-[11px]"}`}>
            Toplam üretim
          </p>
          <p className={`mt-0.5 font-bold tabular-nums text-teal-700 ${kpiNumCls}`}>
            {stats.grandTotal.toLocaleString("tr-TR")}
          </p>
          <p className={kpiDescCls}>Dönem içindeki tüm günler ve satırların toplam adedi.</p>
        </div>
        <div
          className={`rounded-2xl border border-slate-100 border-l-4 border-l-slate-400 bg-gradient-to-br from-white to-slate-50/90 shadow-sm ring-1 ring-slate-900/[0.04] ${kpiCardPad}`}
        >
          <p className={`font-bold uppercase tracking-wide text-slate-500 ${onePdfPage ? "text-[9px]" : "text-[11px]"}`}>
            Üretim günü
          </p>
          <p className={`mt-0.5 font-bold tabular-nums text-slate-900 ${kpiNumCls}`}>{stats.activeDays}</p>
          <p className={kpiDescCls}>En az bir kayıt olan farklı iş günü sayısı.</p>
        </div>
        <div
          className={`rounded-2xl border border-slate-100 border-l-4 border-l-blue-500 bg-gradient-to-br from-white to-blue-50/40 shadow-sm ring-1 ring-slate-900/[0.04] ${kpiCardPad}`}
        >
          <p className={`font-bold uppercase tracking-wide text-slate-500 ${onePdfPage ? "text-[9px]" : "text-[11px]"}`}>
            Günlük ortalama
          </p>
          <p className={`mt-0.5 font-bold tabular-nums text-blue-700 ${kpiNumCls}`}>
            {stats.avgPerDay.toLocaleString("tr-TR")}
          </p>
          <p className={kpiDescCls}>Toplam üretim ÷ üretim günü.</p>
        </div>
        <div
          className={`rounded-2xl border border-slate-100 border-l-4 border-l-violet-500 bg-gradient-to-br from-white to-violet-50/40 shadow-sm ring-1 ring-slate-900/[0.04] ${kpiCardPad}`}
        >
          <p className={`font-bold uppercase tracking-wide text-slate-500 ${onePdfPage ? "text-[9px]" : "text-[11px]"}`}>
            Saatlik ortalama
          </p>
          <p className={`mt-0.5 font-bold tabular-nums text-violet-700 ${kpiNumCls}`}>
            {stats.avgPerNominalShift.toLocaleString("tr-TR")}
          </p>
          <p className={kpiDescCls}>Günlük ortalamanın nominal tam vardiya süresine bölünmesi.</p>
        </div>
        <div
          className={`col-span-2 rounded-2xl border border-slate-100 border-l-4 border-l-amber-500 bg-gradient-to-br from-white to-amber-50/50 shadow-sm ring-1 ring-slate-900/[0.04] md:col-span-1 xl:col-span-1 ${kpiCardPad}`}
        >
          <p className={`font-bold uppercase tracking-wide text-slate-500 ${onePdfPage ? "text-[9px]" : "text-[11px]"}`}>
            Dönem verimliliği
          </p>
          <p className={`mt-0.5 font-bold tabular-nums text-amber-800 ${kpiNumCls}`}>
            {periodEfficiencyPercent !== null ? `%${Math.round(periodEfficiencyPercent)}` : "—"}
          </p>
          <p className={kpiDescCls}>Hedefle karşılaştırmalı yüzde.</p>
        </div>
      </section>

      <section
        className={`pdf-avoid-break rounded-2xl border border-slate-200/90 bg-slate-50/50 ring-1 ring-slate-900/[0.04] ${onePdfPage ? "p-2" : "p-4"}`}
      >
        <div className={`flex flex-wrap items-center justify-between gap-2 ${onePdfPage ? "mb-1" : "mb-2"}`}>
          <h3 className={`font-semibold text-slate-800 ${onePdfPage ? "text-xs" : "text-sm"}`}>
            Dilim payı (dönem toplamı)
          </h3>
          <span className={`font-medium text-slate-500 ${onePdfPage ? "text-[10px]" : "text-[11px]"}`}>
            Dört dilimde üretimin dağılımı
          </span>
        </div>
        <div
          className={`flex w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-inner ring-1 ring-slate-200/90 ${
            onePdfPage ? "h-4" : "h-6"
          }`}
        >
          {DISPLAY_SLOT_ORDER.map((key, idx) => {
            const raw = stats.grandTotal > 0 ? (100 * stats.slotTotals[key]) / stats.grandTotal : 0;
            const wPct = stats.grandTotal > 0 ? Math.max(raw, stats.slotTotals[key] > 0 ? 1.25 : 0) : 0;
            if (stats.slotTotals[key] <= 0 || wPct <= 0) return null;
            return (
              <div
                key={key}
                title={`${slotLabel(key)}: ${stats.slotTotals[key]} (${Math.round(raw)}%)`}
                className="h-full min-w-[6px] border-r border-white/30 last:border-r-0"
                style={{
                  flexGrow: wPct,
                  flexBasis: 0,
                  backgroundColor: SLOT_COLORS[idx],
                }}
              />
            );
          })}
        </div>
        <div
          className={`mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-slate-700 ${onePdfPage ? "text-[10px]" : "mt-3 gap-x-3 gap-y-1 text-xs"}`}
        >
          {DISPLAY_SLOT_ORDER.map((key, idx) => {
            const v = stats.slotTotals[key];
            const pct = stats.grandTotal > 0 ? Math.round((100 * v) / stats.grandTotal) : 0;
            return (
              <span key={key} className="inline-flex items-center gap-2">
                <span className="h-2 w-6 shrink-0 rounded-sm" style={{ backgroundColor: SLOT_COLORS[idx] }} />
                <span className="font-medium text-slate-800">{slotLabel(key)}</span>
                <span className="tabular-nums text-slate-500">
                  {v.toLocaleString("tr-TR")} (%{pct})
                </span>
              </span>
            );
          })}
        </div>
      </section>

      {processBreakdown.length > 1 ? (
        <section className="pdf-avoid-break overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
          <div
            className={`border-b border-slate-100 bg-gradient-to-r from-violet-50/80 to-slate-50/50 ${onePdfPage ? "px-2 py-1.5" : "px-4 py-3"}`}
          >
            <h3 className={`font-semibold text-slate-800 ${onePdfPage ? "text-xs" : "text-sm"}`}>
              Bölüm ve proses özeti (dönem)
            </h3>
            <p className={`text-slate-500 ${onePdfPage ? "mt-0 text-[10px]" : "mt-0.5 text-xs"}`}>
              Her çalışma alanı için üretim günü ve toplam adet
            </p>
          </div>
          <div className="overflow-x-auto">
            <table
              className={`w-full border-collapse text-slate-800 ${
                onePdfPage ? "table-fixed text-[10px]" : "min-w-[480px] text-sm"
              }`}
            >
              {onePdfPage ? (
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
              ) : null}
              <thead>
                <tr
                  className={`border-b border-slate-200 bg-slate-100 text-left font-bold uppercase tracking-wide text-slate-600 ${
                    onePdfPage ? "text-[9px]" : "text-xs"
                  }`}
                >
                  <th className={onePdfPage ? "px-1.5 py-1" : "px-3 py-2"}>Bölüm</th>
                  <th className={onePdfPage ? "px-1.5 py-1" : "px-3 py-2"}>Proses</th>
                  <th className={`text-right ${onePdfPage ? "px-1 py-1" : "px-2 py-2"}`}>Kayıt no</th>
                  <th className={`text-right ${onePdfPage ? "px-1 py-1" : "px-2 py-2"}`}>Üretim günü</th>
                  <th className={`text-right ${onePdfPage ? "px-1.5 py-1" : "px-3 py-2"}`}>Toplam</th>
                  <th className={`text-right ${onePdfPage ? "px-1 py-1" : "px-2 py-2"}`}>Verim %</th>
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
                  const cellY = onePdfPage ? "px-1.5 py-0.5" : "px-3 py-1.5";
                  const cellNum = onePdfPage ? "px-1 py-0.5" : "px-2 py-1.5";
                  return (
                    <tr key={row.workerId} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70">
                      <td
                        className={`${cellY} align-top font-medium ${onePdfPage ? "break-words [overflow-wrap:anywhere] leading-tight" : ""}`}
                      >
                        {teamLabel(row.team)}
                      </td>
                      <td className={`${cellY} align-top ${onePdfPage ? "break-words [overflow-wrap:anywhere] leading-tight" : ""}`}>
                        {row.process}
                      </td>
                      <td className={`${cellNum} text-right tabular-nums text-slate-600`}>{row.workerId}</td>
                      <td className={`${cellNum} text-right tabular-nums`}>{row.dayCount}</td>
                      <td className={`${cellY} text-right font-bold tabular-nums text-violet-800`}>
                        {row.total.toLocaleString("tr-TR")}
                      </td>
                      <td className={`${cellNum} text-right align-middle`}>
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

      <section className={`grid grid-cols-1 lg:grid-cols-2 ${onePdfPage ? "gap-2" : "gap-3"}`}>
        <div
          className={`pdf-avoid-break rounded-2xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-900/[0.04] ${onePdfPage ? "p-2" : "p-4"}`}
        >
          <div className={`flex items-center gap-2 ${onePdfPage ? "mb-1" : "mb-2"}`}>
            <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden />
            <h3 className={`font-semibold text-slate-800 ${onePdfPage ? "text-xs" : "text-sm"}`}>Günlük toplam trendi</h3>
          </div>
          <svg
            viewBox="0 0 640 160"
            className={`w-full rounded-xl bg-gradient-to-b from-slate-50 to-slate-100/80 ring-1 ring-slate-200/80 ${chartH}`}
          >
            <defs>
              <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(13 148 136)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="rgb(13 148 136)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {sortedDates.length > 1 && trendPoints ? (
              <polygon fill={`url(#${chartGradientId})`} points={`0,160 ${trendPoints} 640,160`} />
            ) : null}
            <polyline fill="none" stroke="rgb(13 148 136)" strokeWidth="2.5" points={trendPoints} />
            {sortedDates.map((d, i) => {
              const totals = sortedDates.map((x) => dateTotals.get(x) ?? 0);
              const maxT = Math.max(...totals, 1);
              const h = 160;
              const x = sortedDates.length === 1 ? 320 : Math.round((i / (sortedDates.length - 1)) * 640);
              const y = h - Math.round((totals[i] / maxT) * h);
              return <circle key={d} cx={x} cy={y} r="4" fill="rgb(15 118 110)" />;
            })}
          </svg>
          <div className="relative mt-1 h-5 w-full text-[10px] text-slate-500">
            {sortedDates.map((d, i) => {
              if (!trendAxisLabelIndexes.has(i)) return null;
              const leftPct = sortedDates.length === 1 ? 50 : (i / (sortedDates.length - 1)) * 100;
              return (
                <span
                  key={`trend-axis-${d}`}
                  className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums"
                  style={{ left: `${leftPct}%` }}
                >
                  {formatDateAxis(d)}
                </span>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {stats.maxDay ? (
              <span>
                <span className="font-semibold text-emerald-700">En yüksek:</span> {formatDateLong(stats.maxDay.date)} —{" "}
                {stats.maxDay.total}
              </span>
            ) : null}
            {stats.minDay && stats.activeDays > 1 ? (
              <span>
                <span className="font-semibold text-amber-700">En düşük:</span> {formatDateLong(stats.minDay.date)} —{" "}
                {stats.minDay.total}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={`pdf-avoid-break rounded-2xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-900/[0.04] ${onePdfPage ? "p-2" : "p-4"}`}
        >
          <div className={`flex items-center gap-2 ${onePdfPage ? "mb-1" : "mb-2"}`}>
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <h3 className={`font-semibold text-slate-800 ${onePdfPage ? "text-xs" : "text-sm"}`}>
              Saat dilimi dağılımı (dönem toplamı)
            </h3>
          </div>
          <p className={`text-slate-500 ${onePdfPage ? "mb-1.5 text-[10px]" : "mb-3 text-xs"}`}>
            Baskın dilim: <span className="font-semibold text-slate-700">{slotLabel(stats.dominantSlotKey)}</span>{" "}
            ({stats.grandTotal > 0 ? Math.round((100 * stats.dominantSlotTotal) / stats.grandTotal) : 0}%)
          </p>
          <ul className={onePdfPage ? "space-y-1" : compact ? "space-y-1.5" : "space-y-2"}>
            {DISPLAY_SLOT_ORDER.map((key) => {
              const v = stats.slotTotals[key];
              const pct = Math.round((v / slotMax) * 100);
              const share = stats.grandTotal > 0 ? Math.round((100 * v) / stats.grandTotal) : 0;
              return (
                <li
                  key={key}
                  className={`flex items-center gap-2 text-slate-800 ${onePdfPage ? "gap-1.5 text-[11px]" : "text-sm"}`}
                >
                  <span
                    className={`shrink-0 font-semibold leading-tight text-slate-600 ${
                      onePdfPage ? "w-24 text-[9px]" : "w-28 text-[10px] sm:w-36 sm:text-xs"
                    }`}
                  >
                    {slotLabel(key)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60 ${
                        onePdfPage ? "h-1.5" : "h-2"
                      }`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-[4.5rem] shrink-0 text-right tabular-nums">
                    <span className="font-bold">{v}</span>
                    <span className="ml-1 text-[10px] text-slate-500">({share}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
            Günlük ortalama / dilim:{" "}
            {DISPLAY_SLOT_ORDER.map((key) => (
              <span key={key} className="mr-1.5 inline-block">
                {slotLabel(key)}: <strong className="text-slate-700">{stats.slotAvgPerDay[key]}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Türkçe ay adlarıyla açık tarih aralığı metni */
export function formatTurkishPeriodDescription(startIso: string, endIso: string): string {
  try {
    const s = new Date(`${startIso}T12:00:00`);
    const e = new Date(`${endIso}T12:00:00`);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
    const a = s.toLocaleDateString("tr-TR", opts);
    const b = e.toLocaleDateString("tr-TR", opts);
    if (startIso === endIso) return a;
    return `${a} – ${b}`;
  } catch {
    return `${startIso} — ${endIso}`;
  }
}
