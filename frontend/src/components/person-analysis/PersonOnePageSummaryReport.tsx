"use client";

import { useMemo } from "react";
import { aggregateDisplaySlots, DISPLAY_SLOT_CHART_LABELS } from "@/lib/displaySlotAggregation";
import { sumProductionRow } from "@/lib/productionSlots";
import { SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import { getProsesMapForEfficiency } from "@/lib/prosesVeri";
import { efficiencyPercentFromTotals } from "@/lib/workerEfficiency";
import type { ProductionRow, WorkerProductionDayDetail } from "@/lib/types";

const SLOTS = [
  { key: "t1000" as const, label: DISPLAY_SLOT_CHART_LABELS[0] },
  { key: "t1300" as const, label: DISPLAY_SLOT_CHART_LABELS[1] },
  { key: "t1600" as const, label: DISPLAY_SLOT_CHART_LABELS[2] },
  { key: "t1830" as const, label: DISPLAY_SLOT_CHART_LABELS[3] },
];

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

function EfficiencyBadge({ pct }: { pct: number }) {
  const tone =
    pct >= 85
      ? "bg-emerald-100 text-emerald-900 ring-emerald-700/15"
      : pct >= 70
        ? "bg-amber-100 text-amber-950 ring-amber-700/15"
        : "bg-rose-50 text-rose-900 ring-rose-700/15";
  return (
    <span
      className={`inline-flex justify-end rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${tone}`}
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
        dominantSlot: SLOTS[0].label,
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
      activeDays: dayCount,
      avgPerDay,
      avgPerNominalShift,
      maxDay,
      minDay,
      slotTotals,
      slotAvgPerDay,
      dominantSlot,
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

  const sectionGap = compact ? "space-y-4" : "space-y-8";
  const chartH = compact ? "h-32" : "h-40";

  return (
    <div
      className={`person-one-page-summary text-slate-900 ${sectionGap} rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm [color-scheme:light]`}
      data-pdf-render-root
      style={{
        fontFamily: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div className="rounded-xl border-2 border-teal-600/35 bg-gradient-to-r from-teal-50 to-emerald-50/80 px-3 py-2.5 text-center shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-teal-800">Bu raporun veri aralığı</p>
        <p className="mt-1 text-base font-bold leading-snug text-slate-900">{periodDescription}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-600">
          ({startDate} — {endDate})
        </p>
      </div>

      <header className="border-b border-slate-200/90 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-teal-600">
              <span className="h-px w-6 bg-teal-500/60" aria-hidden />
              Üretim raporu
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Kişi bazlı analiz</h2>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{meta.name}</span>
              {processBreakdown.length <= 1 ? (
                <>
                  {" · "}
                  {teamLabel(meta.team)} · {meta.process}
                </>
              ) : (
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Aynı isimle {processBreakdown.length} çalışma alanı (bölüm/proses kaydı) birleştirildi.
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Üretim günü: {stats.activeDays}
              {reportTimeLabel ? ` · Rapor: ${reportTimeLabel}` : null}
            </p>
          </div>
          <div className="text-left text-xs text-slate-500 sm:text-right">
            <p className="font-semibold text-slate-700">Yeşil İmaj Tekstil</p>
            <p>Kişi bazlı üretim takibi</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-100 border-l-4 border-l-teal-500 bg-gradient-to-br from-white to-teal-50/40 p-3 shadow-sm ring-1 ring-slate-900/[0.04]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Toplam üretim</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-teal-700">{stats.grandTotal.toLocaleString("tr-TR")}</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Dönem içindeki tüm günler ve satırların toplam adedi.</p>
        </div>
        <div className="rounded-2xl border border-slate-100 border-l-4 border-l-slate-400 bg-gradient-to-br from-white to-slate-50/90 p-3 shadow-sm ring-1 ring-slate-900/[0.04]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Üretim günü</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{stats.activeDays}</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">En az bir kayıt olan farklı iş günü sayısı.</p>
        </div>
        <div className="rounded-2xl border border-slate-100 border-l-4 border-l-blue-500 bg-gradient-to-br from-white to-blue-50/40 p-3 shadow-sm ring-1 ring-slate-900/[0.04]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Günlük ortalama</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{stats.avgPerDay.toLocaleString("tr-TR")}</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Toplam üretim ÷ üretim günü.</p>
        </div>
        <div className="rounded-2xl border border-slate-100 border-l-4 border-l-violet-500 bg-gradient-to-br from-white to-violet-50/40 p-3 shadow-sm ring-1 ring-slate-900/[0.04]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">~ / {SHIFT_NOMINAL_HOURS} saat (yaklaşık)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{stats.avgPerNominalShift.toLocaleString("tr-TR")}</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Günlük ortalamanın nominal tam vardiya süresine bölünmesi.</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-slate-100 border-l-4 border-l-amber-500 bg-gradient-to-br from-white to-amber-50/50 p-3 shadow-sm ring-1 ring-slate-900/[0.04] md:col-span-1 xl:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Dönem verimliliği</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-800">
            {periodEfficiencyPercent !== null ? `%${Math.round(periodEfficiencyPercent)}` : "—"}
          </p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Hedefle karşılaştırmalı yüzde.</p>
        </div>
      </section>

      <section className="pdf-avoid-break rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 ring-1 ring-slate-900/[0.04]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Dilim payı (dönem toplamı)</h3>
          <span className="text-[11px] font-medium text-slate-500">Dört dilimde üretimin dağılımı</span>
        </div>
        <div className="flex h-6 w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-inner ring-1 ring-slate-200/90">
          {SLOTS.map((slot, idx) => {
            const raw = stats.grandTotal > 0 ? (100 * stats.slotTotals[slot.key]) / stats.grandTotal : 0;
            const wPct = stats.grandTotal > 0 ? Math.max(raw, stats.slotTotals[slot.key] > 0 ? 1.25 : 0) : 0;
            if (stats.slotTotals[slot.key] <= 0 || wPct <= 0) return null;
            return (
              <div
                key={slot.key}
                title={`${slot.label}: ${stats.slotTotals[slot.key]} (${Math.round(raw)}%)`}
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
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
          {SLOTS.map((slot, idx) => {
            const v = stats.slotTotals[slot.key];
            const pct = stats.grandTotal > 0 ? Math.round((100 * v) / stats.grandTotal) : 0;
            return (
              <span key={slot.key} className="inline-flex items-center gap-2">
                <span className="h-2 w-6 shrink-0 rounded-sm" style={{ backgroundColor: SLOT_COLORS[idx] }} />
                <span className="font-medium text-slate-800">{slot.label}</span>
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
          <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50/80 to-slate-50/50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Bölüm ve proses özeti (dönem)</h3>
            <p className="mt-0.5 text-xs text-slate-500">Her çalışma alanı için üretim günü ve toplam adet</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm text-slate-800">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
                  <th className="px-3 py-2">Bölüm</th>
                  <th className="px-3 py-2">Proses</th>
                  <th className="px-2 py-2 text-right">Kayıt no</th>
                  <th className="px-2 py-2 text-right">Üretim günü</th>
                  <th className="px-3 py-2 text-right">Toplam</th>
                  <th className="px-2 py-2 text-right">Verim %</th>
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
                    <tr key={row.workerId} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70">
                      <td className="px-3 py-1.5 font-medium">{teamLabel(row.team)}</td>
                      <td className="px-3 py-1.5">{row.process}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{row.workerId}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.dayCount}</td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums text-violet-800">
                        {row.total.toLocaleString("tr-TR")}
                      </td>
                      <td className="px-2 py-1.5 text-right align-middle">
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

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="pdf-avoid-break rounded-2xl border border-slate-100 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-800">Günlük toplam trendi</h3>
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

        <div className="pdf-avoid-break rounded-2xl border border-slate-100 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-800">Saat dilimi dağılımı (dönem toplamı)</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Baskın dilim: <span className="font-semibold text-slate-700">{stats.dominantSlot}</span>{" "}
            ({stats.grandTotal > 0 ? Math.round((100 * stats.dominantSlotTotal) / stats.grandTotal) : 0}%)
          </p>
          <ul className={compact ? "space-y-1.5" : "space-y-2"}>
            {SLOTS.map((s) => {
              const v = stats.slotTotals[s.key];
              const pct = Math.round((v / slotMax) * 100);
              const share = stats.grandTotal > 0 ? Math.round((100 * v) / stats.grandTotal) : 0;
              return (
                <li key={s.key} className="flex items-center gap-2 text-sm text-slate-800">
                  <span className="w-28 shrink-0 text-[10px] font-semibold leading-tight text-slate-600 sm:w-36 sm:text-xs">
                    {s.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
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
            {SLOTS.map((s) => (
              <span key={s.key} className="mr-1.5 inline-block">
                {s.label}: <strong className="text-slate-700">{stats.slotAvgPerDay[s.key]}</strong>
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
