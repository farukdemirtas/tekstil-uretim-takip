"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { getGenelTamamlananTrend, getProcesses, getTeams, type GenelTamamlananTrend } from "@/lib/api";
import {
  addDaysToIso,
  calendarMonthWeekdayBounds,
  clampToWeekdayIso,
  mondayOfWeekFromIso,
  parseIsoLocal,
  previousMondayFridayWeekFromIso,
  todayWorkdayIsoTurkey,
} from "@/lib/businessCalendar";

type Preset = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "this_week", label: "Bu hafta" },
  { id: "last_week", label: "Geçen hafta" },
  { id: "this_month", label: "Bu ay" },
  { id: "last_month", label: "Geçen ay" },
  { id: "custom", label: "Özel aralık" },
];

function previousCalendarMonthFromIso(iso: string): { year: number; month1: number } {
  const dt = parseIsoLocal(iso);
  if (!dt) {
    const t = new Date();
    return { year: t.getFullYear(), month1: t.getMonth() + 1 };
  }
  if (dt.getMonth() === 0) return { year: dt.getFullYear() - 1, month1: 12 };
  return { year: dt.getFullYear(), month1: dt.getMonth() };
}

function rangeForPreset(preset: Preset, customStart: string, customEnd: string, today: string) {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "this_week":
      return { start: mondayOfWeekFromIso(today), end: today };
    case "last_week":
      return previousMondayFridayWeekFromIso(today);
    case "this_month": {
      const bounds = calendarMonthWeekdayBounds(y, m);
      return { start: bounds.start, end: today < bounds.end ? today : bounds.end };
    }
    case "last_month": {
      const prev = previousCalendarMonthFromIso(today);
      return calendarMonthWeekdayBounds(prev.year, prev.month1);
    }
    default:
      return {
        start: customStart <= customEnd ? customStart : customEnd,
        end: customStart <= customEnd ? customEnd : customStart,
      };
  }
}

function formatShortDate(iso: string): string {
  const dt = parseIsoLocal(iso);
  if (!dt) return iso;
  return dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function formatLongDate(iso: string): string {
  const dt = parseIsoLocal(iso);
  if (!dt) return iso;
  return dt.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "long" });
}

function formatRangeLabel(start: string, end: string): string {
  if (start === end) return formatShortDate(start);
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

type CompareCard = {
  current: number;
  previous: number;
  currentLabel: string;
  previousLabel: string;
};

function CompareBadge({ delta, deltaPct }: { delta: number; deltaPct: number | null }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        → Değişmedi
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
        up
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300"
      }`}
    >
      {up ? "↑" : "↓"} {Math.abs(delta).toLocaleString("tr-TR")} adet
      {deltaPct != null ? ` (${up ? "+" : ""}${deltaPct}%)` : ""}
    </span>
  );
}

function StatSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-8 w-32 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

type Props = {
  pageMode?: boolean;
};

export default function GenelTamamlananChart({ pageMode = false }: Props) {
  const today = todayWorkdayIsoTurkey();
  const [preset, setPreset] = useState<Preset>("this_week");
  const [customStart, setCustomStart] = useState(addDaysToIso(today, -14));
  const [customEnd, setCustomEnd] = useState(today);
  const [teamFilter, setTeamFilter] = useState("");
  const [processFilter, setProcessFilter] = useState("");
  const [teamRows, setTeamRows] = useState<{ code: string; label: string }[]>([]);
  const [processRows, setProcessRows] = useState<{ name: string }[]>([]);
  const [data, setData] = useState<GenelTamamlananTrend | null>(null);
  const [weekCompare, setWeekCompare] = useState<CompareCard | null>(null);
  const [monthCompare, setMonthCompare] = useState<CompareCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState("");

  const chartRange = useMemo(
    () => rangeForPreset(preset, customStart, customEnd, today),
    [preset, customStart, customEnd, today]
  );

  const processFilterActive = Boolean(teamFilter && processFilter);

  useEffect(() => {
    void getTeams()
      .then((rows) => setTeamRows(rows.map((t) => ({ code: t.code, label: t.label }))))
      .catch(() => {});
    void getProcesses()
      .then((rows) =>
        setProcessRows(
          [...rows]
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr"))
            .map((p) => ({ name: p.name }))
        )
      )
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = chartRange;
      const thisWeekMon = mondayOfWeekFromIso(today);
      const prevWeek = previousMondayFridayWeekFromIso(today);
      const [y, m] = today.split("-").map(Number);
      const thisMonthBounds = calendarMonthWeekdayBounds(y, m);
      const thisMonthEnd = today < thisMonthBounds.end ? today : thisMonthBounds.end;
      const prevMonth = previousCalendarMonthFromIso(today);
      const prevMonthBounds = calendarMonthWeekdayBounds(prevMonth.year, prevMonth.month1);

      const trendParams =
        teamFilter && processFilter
          ? { teamCode: teamFilter, processName: processFilter }
          : {};
      const [main, curWeek, prevWeekData, curMonth, prevMonthData] = await Promise.all([
        getGenelTamamlananTrend({ startDate: start, endDate: end, ...trendParams }),
        getGenelTamamlananTrend({ startDate: thisWeekMon, endDate: today, ...trendParams }),
        getGenelTamamlananTrend({ startDate: prevWeek.start, endDate: prevWeek.end, ...trendParams }),
        getGenelTamamlananTrend({ startDate: thisMonthBounds.start, endDate: thisMonthEnd, ...trendParams }),
        getGenelTamamlananTrend({ startDate: prevMonthBounds.start, endDate: prevMonthBounds.end, ...trendParams }),
      ]);

      setData(main);
      setWeekCompare({
        current: curWeek.summary.total,
        previous: prevWeekData.summary.total,
        currentLabel: formatRangeLabel(thisWeekMon, today),
        previousLabel: formatRangeLabel(prevWeek.start, prevWeek.end),
      });
      setMonthCompare({
        current: curMonth.summary.total,
        previous: prevMonthData.summary.total,
        currentLabel: formatRangeLabel(thisMonthBounds.start, thisMonthEnd),
        previousLabel: formatRangeLabel(prevMonthBounds.start, prevMonthBounds.end),
      });
      setLoadedAt(new Date().toLocaleTimeString("tr-TR"));
    } catch (e) {
      setData(null);
      setWeekCompare(null);
      setMonthCompare(null);
      setError(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }, [chartRange, today, teamFilter, processFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamLabel = teamRows.find((t) => t.code === teamFilter)?.label ?? teamFilter;
  const metricLabel = processFilterActive ? `${teamLabel} · ${processFilter}` : "Genel tamamlanan";
  const metricHint = processFilterActive
    ? "Seçtiğiniz bölüm ve proses satırının günlük toplamı (saat + ek giriş)."
    : "Bölüm ve proses seçilmediğinde tüm satırların minimumu — veri girişi günlük özeti ile aynı (saat + ek giriş).";

  const maxVal = useMemo(
    () => Math.max(1, ...(data?.daily.map((d) => d.genelTamamlanan) ?? [0])),
    [data]
  );

  const chartMetrics = useMemo(() => {
    if (!data?.daily.length) return null;
    const barW = 40;
    const gap = 16;
    const chartH = pageMode ? 260 : 220;
    const padX = 24;
    const width = Math.max(360, padX * 2 + data.daily.length * (barW + gap));
    const points = data.daily.map((point, i) => {
      const x = padX + i * (barW + gap) + barW / 2;
      const h = Math.max(point.genelTamamlanan > 0 ? 8 : 0, (point.genelTamamlanan / maxVal) * (chartH - 32));
      const y = chartH - h;
      return { ...point, x, y, h, barW };
    });
    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${(p.y - 4).toFixed(1)}`)
      .join(" ");
    const areaPath =
      points.length > 0
        ? `${linePath} L ${points[points.length - 1]!.x.toFixed(1)} ${chartH} L ${points[0]!.x.toFixed(1)} ${chartH} Z`
        : "";
    return { width, chartH, points, linePath, areaPath, padX, barW, gap };
  }, [data, maxVal, pageMode]);

  const shellCls = pageMode
    ? "overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_4px_24px_rgb(0,0,0,0.04)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80"
    : "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className={shellCls}>
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-5 py-5 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-teal-950/20 md:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {!pageMode ? (
              <>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{metricLabel}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{metricHint}</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dönem ve karşılaştırma</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {metricLabel} · {formatRangeLabel(chartRange.start, chartRange.end)}
                  {loadedAt ? ` · Son güncelleme ${loadedAt}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{metricHint}</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
                  preset === p.id
                    ? "scale-[1.02] bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-teal-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 transition hover:bg-teal-100 disabled:opacity-50 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
            >
              Yenile
            </button>
          </div>
        </div>

        {preset === "custom" ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <WeekdayDatePicker
              label="Başlangıç"
              className="min-w-[12rem]"
              value={customStart}
              onChange={(v) => setCustomStart(clampToWeekdayIso(v))}
            />
            <WeekdayDatePicker
              label="Bitiş"
              className="min-w-[12rem]"
              value={customEnd}
              onChange={(v) => setCustomEnd(clampToWeekdayIso(v))}
            />
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="genel-tamamlanan-team" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Bölüm
            </label>
            <select
              id="genel-tamamlanan-team"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Seçin…</option>
              {teamRows.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="genel-tamamlanan-process" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Proses
            </label>
            <select
              id="genel-tamamlanan-process"
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Seçin…</option>
              {processRows.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(teamFilter && !processFilter) || (!teamFilter && processFilter) ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Tek satır görmek için hem bölüm hem proses seçin. Aksi halde genel tamamlanan (minimum) gösterilir.
          </p>
        ) : null}
      </div>

      <div className="p-5 md:p-7">
        {error ? (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {loading && !data ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatSkeleton key={i} />
            ))}
          </div>
        ) : data ? (
          <div className="space-y-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-5 dark:border-slate-700 dark:from-slate-800/80 dark:to-slate-900/80">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Dönem toplamı</p>
                <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">
                  {data.summary.total.toLocaleString("tr-TR")}
                </p>
                <p className="mt-1 text-xs text-slate-500">adet</p>
              </div>
              <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50 to-emerald-50/50 p-5 dark:border-teal-900/50 dark:from-teal-950/30 dark:to-emerald-950/20">
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                  Günlük ortalama
                </p>
                <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-teal-800 dark:text-teal-100">
                  {data.summary.avgPerDay.toLocaleString("tr-TR")}
                </p>
                <p className="mt-1 text-xs text-teal-700/80 dark:text-teal-400/80">
                  {data.summary.workdayCount} iş günü
                </p>
              </div>
              {weekCompare ? (
                <div className="rounded-2xl border border-slate-200/90 p-5 dark:border-slate-700">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Geçen haftaya göre</p>
                  <p className="mt-2 text-xl font-black tabular-nums">
                    {weekCompare.current.toLocaleString("tr-TR")}
                    <span className="mx-1 text-sm font-normal text-slate-400">vs</span>
                    {weekCompare.previous.toLocaleString("tr-TR")}
                  </p>
                  <div className="mt-3">
                    <CompareBadge
                      delta={weekCompare.current - weekCompare.previous}
                      deltaPct={
                        weekCompare.previous > 0
                          ? Math.round(((weekCompare.current - weekCompare.previous) / weekCompare.previous) * 100)
                          : null
                      }
                    />
                  </div>
                </div>
              ) : null}
              {monthCompare ? (
                <div className="rounded-2xl border border-slate-200/90 p-5 dark:border-slate-700">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Geçen aya göre</p>
                  <p className="mt-2 text-xl font-black tabular-nums">
                    {monthCompare.current.toLocaleString("tr-TR")}
                    <span className="mx-1 text-sm font-normal text-slate-400">vs</span>
                    {monthCompare.previous.toLocaleString("tr-TR")}
                  </p>
                  <div className="mt-3">
                    <CompareBadge
                      delta={monthCompare.current - monthCompare.previous}
                      deltaPct={
                        monthCompare.previous > 0
                          ? Math.round(((monthCompare.current - monthCompare.previous) / monthCompare.previous) * 100)
                          : null
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {data.daily.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">Seçilen aralıkta iş günü yok.</p>
            ) : chartMetrics ? (
              <>
                <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  <svg
                    viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.chartH + 40}`}
                    className="h-auto w-full min-w-[20rem]"
                    role="img"
                    aria-label={`Günlük ${metricLabel} grafiği`}
                  >
                    <defs>
                      <linearGradient id="genel-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {[0.25, 0.5, 0.75, 1].map((t) => (
                      <line
                        key={t}
                        x1={0}
                        x2={chartMetrics.width}
                        y1={chartMetrics.chartH - chartMetrics.chartH * t}
                        y2={chartMetrics.chartH - chartMetrics.chartH * t}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-700"
                        strokeDasharray="4 4"
                      />
                    ))}
                    {chartMetrics.areaPath ? (
                      <path d={chartMetrics.areaPath} fill="url(#genel-area)" className="transition-all duration-500" />
                    ) : null}
                    {chartMetrics.linePath ? (
                      <path
                        d={chartMetrics.linePath}
                        fill="none"
                        stroke="#0d9488"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-all duration-500"
                      />
                    ) : null}
                    {chartMetrics.points.map((point) => (
                      <g key={point.date}>
                        <rect
                          x={point.x - point.barW / 2}
                          y={point.y}
                          width={point.barW}
                          height={point.h}
                          rx={8}
                          className="fill-teal-500/85 transition-all duration-500 dark:fill-teal-400/85"
                        />
                        {point.genelTamamlanan > 0 ? (
                          <text
                            x={point.x}
                            y={point.y - 8}
                            textAnchor="middle"
                            className="fill-slate-700 text-[10px] font-bold dark:fill-slate-200"
                          >
                            {point.genelTamamlanan.toLocaleString("tr-TR")}
                          </text>
                        ) : null}
                        <text
                          x={point.x}
                          y={chartMetrics.chartH + 18}
                          textAnchor="middle"
                          className="fill-slate-500 text-[9px] font-medium"
                        >
                          {formatShortDate(point.date)}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>

                {pageMode ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700">
                    <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Günlük detay</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[20rem] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800">
                            <th className="px-4 py-3">Tarih</th>
                            <th className="px-4 py-3 text-right">{metricLabel}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...data.daily].reverse().map((row) => (
                            <tr
                              key={row.date}
                              className="border-b border-slate-50 transition-colors hover:bg-teal-50/50 dark:border-slate-800/80 dark:hover:bg-teal-950/20"
                            >
                              <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                                {formatLongDate(row.date)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-black tabular-nums text-teal-700 dark:text-teal-300">
                                {row.genelTamamlanan.toLocaleString("tr-TR")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
