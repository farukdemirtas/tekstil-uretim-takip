"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { getUtuPaketAnalytics } from "@/lib/api";
import {
  addDaysToIso,
  clampToWeekdayIso,
  mondayOfWeekFromIso,
  previousMondayFridayWeekFromIso,
  todayWeekdayIso,
} from "@/lib/businessCalendar";
import { downloadUtuPaketAnaliziExcel } from "@/lib/exportUtuPaketAnaliziExcel";
import { downloadUtuPaketAnaliziPdf } from "@/lib/exportUtuPaketAnaliziPdf";
import {
  UTU_PAKET_SIZE_CODES,
  UTU_PAKET_SLOT_DEFS,
  UTU_PAKET_STAGE_META,
  UTU_PAKET_STAGES,
  type UtuPaketAnalytics,
  type UtuPaketDailyAnalytics,
  type UtuPaketStage,
} from "@/lib/utuPaket";

type Preset = "this_week" | "last_week" | "last_30" | "this_month" | "custom";

const STAGE_CHART_COLOR: Record<UtuPaketStage, string> = {
  optik: "#8b5cf6",
  utu: "#f59e0b",
  paketleme: "#10b981",
};

const STAGE_KPI_RING: Record<UtuPaketStage, string> = {
  optik: "border-l-violet-500",
  utu: "border-l-amber-500",
  paketleme: "border-l-emerald-500",
};

const PRESETS: { id: Preset; label: string }[] = [
  { id: "this_week", label: "Bu hafta" },
  { id: "last_week", label: "Geçen hafta" },
  { id: "last_30", label: "Son 30 gün" },
  { id: "this_month", label: "Bu ay" },
  { id: "custom", label: "Özel" },
];

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function formatRangeLabel(start: string, end: string): string {
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function rangeForPreset(preset: Preset, customStart: string, customEnd: string, today: string) {
  const mon = mondayOfWeekFromIso(today);
  switch (preset) {
    case "this_week":
      return { start: mon, end: today };
    case "last_week": {
      const prev = previousMondayFridayWeekFromIso(today);
      return { start: prev.start, end: prev.end };
    }
    case "last_30":
      return { start: addDaysToIso(today, -29), end: today };
    case "this_month": {
      const [y, m] = today.split("-").map(Number);
      const first = `${y}-${String(m).padStart(2, "0")}-01`;
      return { start: clampToWeekdayIso(first), end: today };
    }
    default:
      return {
        start: customStart <= customEnd ? customStart : customEnd,
        end: customStart <= customEnd ? customEnd : customStart,
      };
  }
}

function StageTrendChart({ daily }: { daily: UtuPaketDailyAnalytics[] }) {
  if (daily.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Trend için en az 2 günlük kayıt gerekir.
      </p>
    );
  }

  const W = 720;
  const H = 200;
  const PX = 48;
  const PY = 24;
  const innerW = W - PX * 2;
  const innerH = H - PY * 2;
  const maxY = Math.max(...daily.flatMap((d) => UTU_PAKET_STAGES.map((st) => d.stages[st] || 0)), 1);
  const toX = (i: number) => PX + (i / (daily.length - 1)) * innerW;
  const toY = (v: number) => PY + (1 - v / maxY) * innerH;
  const step = Math.max(1, Math.ceil(daily.length / 8));
  const labelIdxs = daily.map((_, i) => i).filter((i) => i % step === 0 || i === daily.length - 1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Günlük aşama trendi">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={PX}
            x2={W - PX}
            y1={toY(maxY * t)}
            y2={toY(maxY * t)}
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-700"
            strokeDasharray="4 4"
          />
        ))}
        {UTU_PAKET_STAGES.map((st) => {
          const vals = daily.map((d) => d.stages[st] || 0);
          const d = vals.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");
          return (
            <path key={st} d={d} fill="none" stroke={STAGE_CHART_COLOR[st]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          );
        })}
        {labelIdxs.map((i) => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" className="fill-slate-500 text-[10px]">
            {formatShortDate(daily[i].date)}
          </text>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4">
        {UTU_PAKET_STAGES.map((st) => (
          <span key={st} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_CHART_COLOR[st] }} />
            {UTU_PAKET_STAGE_META[st].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function HourlySlotChart({ stage, slots }: { stage: UtuPaketStage; slots: Record<string, number> }) {
  const data = UTU_PAKET_SLOT_DEFS.map(({ key, label }) => ({ label, value: Number(slots[key]) || 0 }));
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">{label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            <div
              className="flex h-full items-center rounded-lg px-2 text-[10px] font-bold text-white transition-all"
              style={{
                width: `${Math.max(value > 0 ? 8 : 0, (value / max) * 100)}%`,
                backgroundColor: STAGE_CHART_COLOR[stage],
              }}
            >
              {value > 0 ? value.toLocaleString("tr-TR") : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  onOpenDay?: (iso: string) => void;
  showExports?: boolean;
};

export default function UtuPaketAnalysis({ onOpenDay, showExports = true }: Props) {
  const today = todayWeekdayIso();
  const [preset, setPreset] = useState<Preset>("last_30");
  const [customStart, setCustomStart] = useState(addDaysToIso(today, -29));
  const [customEnd, setCustomEnd] = useState(today);
  const [data, setData] = useState<UtuPaketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"pdf" | "excel" | null>(null);
  const [slotStage, setSlotStage] = useState<UtuPaketStage>("paketleme");
  const [hideEmptyDays, setHideEmptyDays] = useState(true);
  const [stageFilter, setStageFilter] = useState<"all" | UtuPaketStage>("all");

  const range = useMemo(
    () => rangeForPreset(preset, customStart, customEnd, today),
    [preset, customStart, customEnd, today]
  );

  const rangeLabel = formatRangeLabel(range.start, range.end);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUtuPaketAnalytics({ startDate: range.start, endDate: range.end });
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Analiz yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDaily = useMemo(() => {
    if (!data) return [];
    return data.daily.filter((row) => {
      const hasAny = UTU_PAKET_STAGES.some((st) => (row.stages[st] || 0) > 0);
      if (hideEmptyDays && !hasAny) return false;
      if (stageFilter === "all") return true;
      return (row.stages[stageFilter] || 0) > 0;
    });
  }, [data, hideEmptyDays, stageFilter]);

  const bedenMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(...UTU_PAKET_SIZE_CODES.map((c) => data.bedenTotals[c] || 0), 1);
  }, [data]);

  const pipelineAvg = useMemo(() => {
    if (!filteredDaily.length) return 0;
    const vals = filteredDaily.map((d) => d.pipelineMin).filter((n) => n > 0);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [filteredDaily]);

  async function handlePdfExport() {
    if (!data || exportBusy) return;
    setExportBusy("pdf");
    try {
      await downloadUtuPaketAnaliziPdf({ data, dailyRows: filteredDaily, rangeLabel, pipelineAvg });
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF oluşturulamadı");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleExcelExport() {
    if (!data || exportBusy) return;
    setExportBusy("excel");
    try {
      await downloadUtuPaketAnaliziExcel({ data, dailyRows: filteredDaily, rangeLabel });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Excel oluşturulamadı");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtreler */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        <div className="bg-gradient-to-r from-teal-600/10 via-emerald-500/5 to-transparent px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dönem analizi</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Optik, ütü ve paketleme — aşama toplamları, trend, beden ve saat dilimi kırılımı.
              </p>
            </div>
            {showExports && data ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handlePdfExport()}
                  disabled={!!exportBusy || loading}
                  className="rounded-xl border border-teal-600 bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
                >
                  {exportBusy === "pdf" ? "PDF…" : "PDF indir"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExcelExport()}
                  disabled={!!exportBusy || loading}
                  className="rounded-xl border border-emerald-600/80 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                >
                  {exportBusy === "excel" ? "Excel…" : "Excel indir"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  preset === p.id
                    ? "bg-teal-600 text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <WeekdayDatePicker label="Başlangıç" className="min-w-[12rem]" value={customStart} onChange={(d) => setCustomStart(clampToWeekdayIso(d))} />
              <WeekdayDatePicker label="Bitiş" className="min-w-[12rem]" value={customEnd} onChange={(d) => setCustomEnd(clampToWeekdayIso(d))} />
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium text-teal-700 dark:text-teal-400">{rangeLabel}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200/60 pt-4 dark:border-slate-700/60">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as "all" | UtuPaketStage)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="all">Tüm aşamalar</option>
                {UTU_PAKET_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {UTU_PAKET_STAGE_META[st].label} olan günler
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={hideEmptyDays}
                onChange={(e) => setHideEmptyDays(e.target.checked)}
                className="rounded border-slate-300 text-teal-600"
              />
              Boş günleri gizle
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
            >
              Yenile
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200/80 bg-white py-16 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          Analiz yükleniyor…
        </div>
      ) : !data ? null : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {UTU_PAKET_STAGES.map((st) => (
              <div
                key={st}
                className={`rounded-2xl border border-slate-200/80 border-l-4 bg-white px-4 py-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80 ${STAGE_KPI_RING[st]}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{UTU_PAKET_STAGE_META[st].label}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                  {(data.periodTotals[st] || 0).toLocaleString("tr-TR")}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">Ort. gün: {(data.avgDailyByStage[st] || 0).toLocaleString("tr-TR")}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-teal-500 bg-white px-4 py-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ort. darboğaz</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-teal-700 dark:text-teal-400">{pipelineAvg.toLocaleString("tr-TR")}</p>
              <p className="mt-0.5 text-xs text-slate-500">{filteredDaily.length} gün · {data.daysWithData} veri</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Günlük aşama trendi</h3>
            <StageTrendChart daily={filteredDaily} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Dönem beden dağılımı</h3>
              <div className="mt-4 space-y-3">
                {UTU_PAKET_SIZE_CODES.map((code) => {
                  const v = data.bedenTotals[code] || 0;
                  const pct = bedenMax > 0 ? Math.round((v / bedenMax) * 100) : 0;
                  return (
                    <div key={code}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300">{code}</span>
                        <span className="tabular-nums text-slate-600 dark:text-slate-400">{v.toLocaleString("tr-TR")}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Saat dilimi toplamları</h3>
                <select
                  value={slotStage}
                  onChange={(e) => setSlotStage(e.target.value as UtuPaketStage)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  {UTU_PAKET_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {UTU_PAKET_STAGE_META[st].label}
                    </option>
                  ))}
                </select>
              </div>
              <HourlySlotChart stage={slotStage} slots={data.slotTotalsByStage[slotStage] || {}} />
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-4 dark:border-slate-700/80 sm:px-5">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Günlük özet tablosu</h3>
              <span className="text-xs text-slate-500">{filteredDaily.length} kayıt</span>
            </div>

            {filteredDaily.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">Filtrelere uygun kayıt yok.</p>
            ) : (
              <>
                {/* Mobil kartlar */}
                <div className="space-y-2 p-3 sm:hidden">
                  {[...filteredDaily].reverse().map((row) => (
                    <div key={row.date} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatShortDate(row.date)}</span>
                        {onOpenDay ? (
                          <button type="button" onClick={() => onOpenDay(row.date)} className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                            Aç
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                        {UTU_PAKET_STAGES.map((st) => (
                          <div key={st}>
                            <p className="text-[10px] uppercase text-slate-500">{UTU_PAKET_STAGE_META[st].label}</p>
                            <p className="font-bold tabular-nums">{(row.stages[st] || 0).toLocaleString("tr-TR")}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-200/60 pt-2 dark:border-slate-700/60">
                        {UTU_PAKET_SIZE_CODES.map((code) => (
                          <span key={code} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-slate-900">
                            {code}: {row.beden[code] || 0}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Masaüstü tablo */}
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Tarih</th>
                        {UTU_PAKET_STAGES.map((st) => (
                          <th key={st} className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                            {UTU_PAKET_STAGE_META[st].label}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">Darboğaz</th>
                        {UTU_PAKET_SIZE_CODES.map((code) => (
                          <th key={code} className="px-2 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                            {code}
                          </th>
                        ))}
                        {onOpenDay ? (
                          <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-slate-500">İşlem</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredDaily].reverse().map((row) => (
                        <tr key={row.date} className="border-b border-slate-100 dark:border-slate-800/80">
                          <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{formatShortDate(row.date)}</td>
                          {UTU_PAKET_STAGES.map((st) => (
                            <td key={st} className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                              {(row.stages[st] || 0).toLocaleString("tr-TR")}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                            {row.pipelineMin > 0 ? row.pipelineMin.toLocaleString("tr-TR") : "—"}
                          </td>
                          {UTU_PAKET_SIZE_CODES.map((code) => (
                            <td key={code} className="px-2 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                              {(row.beden[code] || 0).toLocaleString("tr-TR")}
                            </td>
                          ))}
                          {onOpenDay ? (
                            <td className="px-3 py-2.5 text-center">
                              <button type="button" onClick={() => onOpenDay(row.date)} className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400">
                                Aç
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
