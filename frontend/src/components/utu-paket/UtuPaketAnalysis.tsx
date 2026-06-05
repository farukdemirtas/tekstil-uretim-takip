"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { getUtuPaketAnalytics } from "@/lib/api";
import { addDaysToIso, clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import {
  UTU_PAKET_SIZE_CODES,
  UTU_PAKET_SLOT_DEFS,
  UTU_PAKET_STAGE_META,
  UTU_PAKET_STAGES,
  type UtuPaketAnalytics,
  type UtuPaketStage,
} from "@/lib/utuPaket";

const HOURLY_SLOT_STAGES = ["optik", "utu"] as const satisfies readonly UtuPaketStage[];

const STAGE_CHART_COLOR: Record<UtuPaketStage, string> = {
  optik: "#8b5cf6",
  utu: "#f59e0b",
  paketleme: "#10b981",
};

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function StageTrendChart({ daily }: { daily: UtuPaketAnalytics["daily"] }) {
  if (daily.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
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
  const maxY = Math.max(
    ...daily.flatMap((d) => UTU_PAKET_STAGES.map((st) => d.stages[st] || 0)),
    1
  );
  const toX = (i: number) => PX + (i / (daily.length - 1)) * innerW;
  const toY = (v: number) => PY + (1 - v / maxY) * innerH;
  const step = Math.max(1, Math.ceil(daily.length / 8));
  const labelIdxs = daily.map((_, i) => i).filter((i) => i % step === 0 || i === daily.length - 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[320px]" role="img" aria-label="Günlük aşama trendi">
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
          const d = vals
            .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
            .join(" ");
          return (
            <path
              key={st}
              d={d}
              fill="none"
              stroke={STAGE_CHART_COLOR[st]}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {labelIdxs.map((i) => (
          <text
            key={i}
            x={toX(i)}
            y={H - 4}
            textAnchor="middle"
            className="fill-slate-500 text-[10px]"
          >
            {formatShortDate(daily[i].date)}
          </text>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4">
        {UTU_PAKET_STAGES.map((st) => (
          <span key={st} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STAGE_CHART_COLOR[st] }}
            />
            {UTU_PAKET_STAGE_META[st].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function HourlySlotChart({ stage, slots }: { stage: UtuPaketStage; slots: Record<string, number> }) {
  const data = UTU_PAKET_SLOT_DEFS.map(({ key, label }) => ({
    label,
    value: Number(slots[key]) || 0,
  }));
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
};

export default function UtuPaketAnalysis({ onOpenDay }: Props) {
  const endDefault = todayWeekdayIso();
  const [endDate, setEndDate] = useState(endDefault);
  const [startDate, setStartDate] = useState(addDaysToIso(endDefault, -29));
  const [data, setData] = useState<UtuPaketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slotStage, setSlotStage] = useState<UtuPaketStage>("optik");

  const load = useCallback(async () => {
    let start = startDate;
    let end = endDate;
    if (start > end) {
      const t = start;
      start = end;
      end = t;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getUtuPaketAnalytics({ startDate: start, endDate: end });
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Analiz yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const bedenMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(...UTU_PAKET_SIZE_CODES.map((c) => data.bedenTotals[c] || 0), 1);
  }, [data]);

  const pipelineAvg = useMemo(() => {
    if (!data?.daily.length) return 0;
    const vals = data.daily.map((d) => d.pipelineMin).filter((n) => n > 0);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [data]);

  return (
    <div className="space-y-6">
      <section className="surface-card p-4 dark:text-slate-100 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dönem analizi</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Seçilen aralıkta aşama toplamları, günlük trend, saat dilimi ve beden kırılımı.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <WeekdayDatePicker
              label="Başlangıç"
              className="min-w-[14rem]"
              value={startDate}
              onChange={(d) => setStartDate(clampToWeekdayIso(d))}
            />
            <WeekdayDatePicker
              label="Bitiş"
              className="min-w-[14rem]"
              value={endDate}
              onChange={(d) => setEndDate(clampToWeekdayIso(d))}
            />
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Yenile
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="surface-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="surface-card flex justify-center py-16 text-sm text-slate-500">Analiz yükleniyor…</div>
      ) : !data ? null : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {UTU_PAKET_STAGES.map((st) => (
              <div key={st} className="surface-card px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {UTU_PAKET_STAGE_META[st].label}
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                  {(data.periodTotals[st] || 0).toLocaleString("tr-TR")}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ort. gün: {(data.avgDailyByStage[st] || 0).toLocaleString("tr-TR")}
                </p>
              </div>
            ))}
            <div className="surface-card px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ort. darboğaz</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-teal-700 dark:text-teal-400">
                {pipelineAvg.toLocaleString("tr-TR")}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{data.daysWithData} iş günü veri</p>
            </div>
          </section>

          <section className="surface-card p-5 dark:text-slate-100">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Günlük aşama trendi</h3>
            <StageTrendChart daily={data.daily} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="surface-card p-5 dark:text-slate-100">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Dönem beden dağılımı</h3>
              <div className="mt-4 space-y-3">
                {UTU_PAKET_SIZE_CODES.map((code) => {
                  const v = data.bedenTotals[code] || 0;
                  const pct = bedenMax > 0 ? Math.round((v / bedenMax) * 100) : 0;
                  return (
                    <div key={code}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300">{code}</span>
                        <span className="tabular-nums text-slate-600 dark:text-slate-400">
                          {v.toLocaleString("tr-TR")}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="surface-card p-5 dark:text-slate-100">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Saat dilimi toplamları</h3>
                <select
                  value={slotStage}
                  onChange={(e) => setSlotStage(e.target.value as UtuPaketStage)}
                  className="input-modern rounded-lg py-1.5 text-sm"
                >
                  {HOURLY_SLOT_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {UTU_PAKET_STAGE_META[st].label}
                    </option>
                  ))}
                </select>
              </div>
              <HourlySlotChart stage={slotStage} slots={data.slotTotalsByStage[slotStage] || {}} />
            </section>
          </div>

          <section className="surface-card overflow-hidden dark:text-slate-100">
            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
              <h3 className="text-sm font-bold">Günlük özet tablosu</h3>
            </div>
            {data.daily.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">Bu aralıkta kayıt yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                        Tarih
                      </th>
                      {UTU_PAKET_STAGES.map((st) => (
                        <th
                          key={st}
                          className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500"
                        >
                          {UTU_PAKET_STAGE_META[st].label}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                        Darboğaz
                      </th>
                      {onOpenDay ? (
                        <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-slate-500">
                          İşlem
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.daily].reverse().map((row) => (
                      <tr
                        key={row.date}
                        className="border-b border-slate-100 dark:border-slate-800/80"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {formatShortDate(row.date)}
                        </td>
                        {UTU_PAKET_STAGES.map((st) => (
                          <td
                            key={st}
                            className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300"
                          >
                            {(row.stages[st] || 0).toLocaleString("tr-TR")}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                          {row.pipelineMin > 0 ? row.pipelineMin.toLocaleString("tr-TR") : "—"}
                        </td>
                        {onOpenDay ? (
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => onOpenDay(row.date)}
                              className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                            >
                              Aç
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
