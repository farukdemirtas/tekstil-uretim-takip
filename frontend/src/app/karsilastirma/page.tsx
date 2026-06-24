"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getTeams, getWorkersForAnalytics, getWorkerComparison, getTeamComparison, getPeriodComparison, setAuthToken } from "@/lib/api";
import { addDaysToIso, coerceWeekdayPickerValue, todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { hasPermission } from "@/lib/permissions";
import type { WorkerComparisonData, WorkerCompStat, TeamRow, PeriodComparisonData } from "@/lib/api";

type CompareMode = "worker" | "team" | "period";
import { DISPLAY_SLOT_CHART_LABELS } from "@/lib/displaySlotAggregation";
import { downloadKarsilastirmaPdf } from "@/lib/exportKarsilastirmaPdf";
import type { Worker } from "@/lib/types";

const SLOTS = [
  { key: "t1000" as const, label: DISPLAY_SLOT_CHART_LABELS[0] },
  { key: "t1300" as const, label: DISPLAY_SLOT_CHART_LABELS[1] },
  { key: "t1600" as const, label: DISPLAY_SLOT_CHART_LABELS[2] },
  { key: "t1830" as const, label: DISPLAY_SLOT_CHART_LABELS[3] },
];

/* ── SVG Line Chart ── */
function LineChart({
  daily,
  w1Name,
  w2Name,
}: {
  daily: { date: string; w1: number; w2: number }[];
  w1Name: string;
  w2Name: string;
}) {
  if (daily.length < 2)
    return (
      <p className="text-sm text-slate-400">
        Grafik için en az 2 günlük veri gerekli.
      </p>
    );

  const W = 560, H = 180, PX = 44, PY = 20;
  const innerW = W - PX * 2;
  const innerH = H - PY * 2;
  const maxY = Math.max(...daily.map((d) => Math.max(d.w1, d.w2)), 1);

  const toX = (i: number) => PX + (i / (daily.length - 1)) * innerW;
  const toY = (v: number) => PY + (1 - v / maxY) * innerH;

  const pathD = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");

  /* show ~6 x-axis labels */
  const step = Math.max(1, Math.ceil(daily.length / 6));
  const labelIdxs = daily
    .map((_, i) => i)
    .filter((i) => i === 0 || i === daily.length - 1 || i % step === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 160 }}>
      {/* Gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={PX} x2={W - PX}
          y1={toY(maxY * pct)} y2={toY(maxY * pct)}
          stroke="#94a3b8" strokeOpacity={0.2} strokeWidth={1}
        />
      ))}
      {/* Y labels */}
      {[0, 0.5, 1].map((pct) => (
        <text
          key={pct}
          x={PX - 6} y={toY(maxY * pct) + 4}
          textAnchor="end" fontSize={9} fill="#94a3b8"
        >
          {Math.round(maxY * pct)}
        </text>
      ))}
      {/* Lines */}
      <path d={pathD(daily.map((d) => d.w1))} fill="none" stroke="#3b82f6" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathD(daily.map((d) => d.w2))} fill="none" stroke="#f97316" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {daily.map((d, i) => (
        <g key={d.date}>
          <circle cx={toX(i)} cy={toY(d.w1)} r={3} fill="#3b82f6" />
          <circle cx={toX(i)} cy={toY(d.w2)} r={3} fill="#f97316" />
        </g>
      ))}
      {/* X labels */}
      {labelIdxs.map((i) => (
        <text
          key={i}
          x={toX(i)} y={H - 4}
          textAnchor="middle" fontSize={9} fill="#94a3b8"
        >
          {daily[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

/* ── Worker summary card ── */
function WorkerCard({
  stat,
  color,
  label,
  isWinner,
  teamLabels,
}: {
  stat: WorkerCompStat;
  color: "blue" | "orange";
  label: string;
  isWinner: boolean;
  teamLabels: Record<string, string>;
}) {
  const blue = color === "blue";
  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 dark:bg-slate-800 ${
        blue ? "border-blue-400" : "border-orange-400"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`text-xs font-semibold ${
              blue ? "text-blue-500" : "text-orange-500"
            }`}
          >
            {label}
          </span>
          <p className="mt-0.5 truncate text-base font-bold">{stat.name}</p>
          <p className="truncate text-xs text-slate-500">
            {teamLabels[stat.team] ?? stat.team}
            {stat.process ? ` · ${stat.process}` : ""}
          </p>
        </div>
        {isWinner && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            🏆 Önde
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div
          className={`rounded-lg p-2 ${
            blue
              ? "bg-blue-50 dark:bg-blue-900/20"
              : "bg-orange-50 dark:bg-orange-900/20"
          }`}
        >
          <div
            className={`text-xl font-bold ${
              blue
                ? "text-blue-600 dark:text-blue-400"
                : "text-orange-500 dark:text-orange-400"
            }`}
          >
            {stat.total}
          </div>
          <div className="text-xs text-slate-500">Toplam</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700/50">
          <div className="text-xl font-bold">{stat.activeDays}</div>
          <div className="text-xs text-slate-500">Gün</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700/50">
          <div className="text-xl font-bold">
            {stat.activeDays > 0
              ? Math.round(stat.total / stat.activeDays)
              : 0}
          </div>
          <div className="text-xs text-slate-500">Ort/Gün</div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════ */
export default function KarsilastirmaPage() {
  const [isReady, setIsReady]   = useState(false);
  const [workers, setWorkers]   = useState<Worker[]>([]);
  const [w1Id, setW1Id]         = useState<number | null>(null);
  const [w2Id, setW2Id]         = useState<number | null>(null);
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate]     = useState(todayWeekdayIso());
  const [compData, setCompData]   = useState<WorkerComparisonData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [pdfBusy, setPdfBusy]     = useState(false);
  const [teamLabels, setTeamLabels] = useState<Record<string, string>>({});
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [compareMode, setCompareMode] = useState<CompareMode>("worker");
  const [tm1Code, setTm1Code] = useState("");
  const [tm2Code, setTm2Code] = useState("");
  const [periodData, setPeriodData] = useState<PeriodComparisonData | null>(null);
  const [pr1Start, setPr1Start] = useState(() => addDaysToIso(todayWeekdayIso(), -9));
  const [pr1End, setPr1End] = useState(() => addDaysToIso(todayWeekdayIso(), -5));
  const [pr2Start, setPr2Start] = useState(() => addDaysToIso(todayWeekdayIso(), -4));
  const [pr2End, setPr2End] = useState(() => todayWeekdayIso());

  /* Auth guard + load worker list */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("karsilastirma")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    setIsReady(true);
    getWorkersForAnalytics()
      .then((list) =>
        setWorkers([...list].sort((a, b) => a.name.localeCompare(b.name, "tr", { sensitivity: "base" })))
      )
      .catch(() => {});
    getTeams()
      .then((rows) => {
        setTeamRows([...rows].sort((a, b) => a.label.localeCompare(b.label, "tr", { sensitivity: "base" })));
        setTeamLabels(Object.fromEntries(rows.map((t) => [t.code, t.label])));
      })
      .catch(() => {});
  }, []);

  /* Fetch comparison whenever selection/dates change */
  const fetchData = useCallback(async () => {
    setPeriodData(null);
    if (compareMode === "period") {
      if (!pr1Start || !pr1End || !pr2Start || !pr2End) return;
      if (pr1Start > pr1End || pr2Start > pr2End) {
        setError("Başlangıç tarihi bitişten büyük olamaz.");
        return;
      }
      setLoading(true);
      setError(null);
      setCompData(null);
      try {
        const d = await getPeriodComparison({
          range1Start: pr1Start,
          range1End: pr1End,
          range2Start: pr2Start,
          range2End: pr2End,
        });
        setPeriodData(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Veri alınamadı");
        setPeriodData(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (compareMode === "worker") {
        if (!w1Id || !w2Id) {
          setLoading(false);
          setCompData(null);
          return;
        }
        const start = coerceWeekdayPickerValue(startDate);
        const end = coerceWeekdayPickerValue(endDate);
        if (!start || !end || start > end) {
          setError("Geçerli bir tarih aralığı seçin (başlangıç bitişten büyük olamaz).");
          setCompData(null);
          return;
        }
        const data = await getWorkerComparison({
          worker1Id: w1Id,
          worker2Id: w2Id,
          startDate: start,
          endDate: end,
        });
        setCompData(data);
        return;
      }
      /* team */
      if (!tm1Code || !tm2Code || tm1Code === tm2Code) {
        setLoading(false);
        setCompData(null);
        return;
      }
      const start = coerceWeekdayPickerValue(startDate);
      const end = coerceWeekdayPickerValue(endDate);
      if (!start || !end || start > end) {
        setError("Geçerli bir tarih aralığı seçin (başlangıç bitişten büyük olamaz).");
        setCompData(null);
        return;
      }
      const data = await getTeamComparison({
        team1: tm1Code,
        team2: tm2Code,
        startDate: start,
        endDate: end,
      });
      const t1Label = teamLabels[tm1Code] ?? tm1Code;
      const t2Label = teamLabels[tm2Code] ?? tm2Code;
      const w1named = data.worker1
        ? { ...data.worker1, name: data.worker1.name || t1Label }
        : null;
      const w2named = data.worker2
        ? { ...data.worker2, name: data.worker2.name || t2Label }
        : null;
      setCompData({ ...data, worker1: w1named, worker2: w2named });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı");
      setCompData(null);
    } finally {
      setLoading(false);
    }
  }, [
    compareMode,
    w1Id,
    w2Id,
    tm1Code,
    tm2Code,
    startDate,
    endDate,
    pr1Start,
    pr1End,
    pr2Start,
    pr2End,
    teamLabels,
  ]);

  useEffect(() => {
    if (!isReady || teamRows.length < 2) return;
    if (!tm1Code) setTm1Code(teamRows[0].code);
    if (!tm2Code || tm2Code === tm1Code) setTm2Code(teamRows.find((t) => t.code !== tm1Code)?.code ?? "");
  }, [isReady, teamRows, tm1Code, tm2Code]);

  useEffect(() => {
    if (!isReady) return;
    if (compareMode === "worker") {
      if (w1Id && w2Id) void fetchData();
      return;
    }
    if (compareMode === "team") {
      if (tm1Code && tm2Code && tm1Code !== tm2Code) void fetchData();
      return;
    }
    void fetchData();
  }, [
    isReady,
    compareMode,
    fetchData,
    w1Id,
    w2Id,
    tm1Code,
    tm2Code,
    startDate,
    endDate,
    pr1Start,
    pr1End,
    pr2Start,
    pr2End,
  ]);

  /* ── PDF Export (Türkçe UTF-8, html2pdf) ── */
  async function exportToPDF() {
    const ww1 = compData?.worker1;
    const ww2 = compData?.worker2;
    if (!ww1 || !ww2) return;
    setPdfBusy(true);
    try {
      await downloadKarsilastirmaPdf({
        w1: ww1,
        w2: ww2,
        daily: compData.daily ?? [],
        teamLabels,
        startDate,
        endDate,
        leftTitle: compareMode === "team" ? "Bölüm 1" : "Personel 1",
        rightTitle: compareMode === "team" ? "Bölüm 2" : "Personel 2",
        modeLabel: compareMode === "team" ? "Bölüm (takım)" : "Personel",
      });
    } catch (err) {
      console.error(err);
    } finally {
      setPdfBusy(false);
    }
  }

  /* Derived */
  const w1 = compData?.worker1 ?? null;
  const w2 = compData?.worker2 ?? null;
  const daily = compData?.daily ?? [];
  const bothTotal = (w1?.total ?? 0) + (w2?.total ?? 0) || 1;

  const pct1 = Math.round(((w1?.total ?? 0) / bothTotal) * 100);
  const pct2 = 100 - pct1;

  const pd1 = periodData?.period1;
  const pd2 = periodData?.period2;
  const periodBoth = (pd1?.grandTotal ?? 0) + (pd2?.grandTotal ?? 0) || 1;
  const periodPct1 = Math.round(((pd1?.grandTotal ?? 0) / periodBoth) * 100);
  const periodPct2 = 100 - periodPct1;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Üretim Karşılaştırma</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Personel, bölüm veya iki tarih aralığını yan yana görün.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {w1 && w2 && compareMode !== "period" && (
              <button
                onClick={() => void exportToPDF()}
                disabled={pdfBusy || loading}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {pdfBusy ? "PDF hazırlanıyor..." : "⬇ PDF İndir"}
              </button>
            )}
            <Link
              href="/"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              ← Ana Sayfa
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          {(
            [
              ["worker", "Personel"],
              ["team", "Bölüm (takım)"],
              ["period", "Dönem vs dönem"],
            ] as const
          ).map(([id, lbl]) => {
            const on = compareMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setCompareMode(id);
                  setError(null);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  on
                    ? "bg-teal-600 text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {lbl}
              </button>
            );
          })}
        </div>

        {/* ── Filter bar ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          {compareMode !== "period" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {compareMode === "worker" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-blue-600 dark:text-blue-400">
                      Personel 1 — Mavi
                    </label>
                    <select
                      value={w1Id ?? ""}
                      onChange={(e) => {
                        const v = Number(e.target.value) || null;
                        if (v !== null && v === w2Id) return;
                        setW1Id(v);
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    >
                      <option value="">Seçiniz...</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id} disabled={w.id === w2Id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-orange-500 dark:text-orange-400">
                      Personel 2 — Turuncu
                    </label>
                    <select
                      value={w2Id ?? ""}
                      onChange={(e) => {
                        const v = Number(e.target.value) || null;
                        if (v !== null && v === w1Id) return;
                        setW2Id(v);
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    >
                      <option value="">Seçiniz...</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id} disabled={w.id === w1Id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-blue-600 dark:text-blue-400">
                      Bölüm 1 — Mavi
                    </label>
                    <select
                      value={tm1Code}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTm1Code(v);
                        if (v === tm2Code) setTm2Code(teamRows.find((t) => t.code !== v)?.code ?? "");
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    >
                      <option value="">Seçiniz...</option>
                      {teamRows.map((t) => (
                        <option key={t.code} value={t.code} disabled={t.code === tm2Code}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-orange-500 dark:text-orange-400">
                      Bölüm 2 — Turuncu
                    </label>
                    <select
                      value={tm2Code}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTm2Code(v);
                        if (v === tm1Code) setTm1Code(teamRows.find((t) => t.code !== v)?.code ?? "");
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    >
                      <option value="">Seçiniz...</option>
                      {teamRows.map((t) => (
                        <option key={t.code} value={t.code} disabled={t.code === tm1Code}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <WeekdayDatePicker
                label="Başlangıç Tarihi"
                value={startDate}
                onChange={(v) => {
                  const next = coerceWeekdayPickerValue(v);
                  setStartDate(next);
                  if (endDate && next > endDate) setEndDate(next);
                }}
                className="w-full"
              />
              <WeekdayDatePicker
                label="Bitiş Tarihi"
                value={endDate}
                onChange={(v) => {
                  const next = coerceWeekdayPickerValue(v);
                  setEndDate(next);
                  if (startDate && next < startDate) setStartDate(next);
                }}
                className="w-full"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-600">
                <legend className="text-sm font-semibold text-blue-700 dark:text-blue-300">Dönem A — Mavi</legend>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <WeekdayDatePicker label="Başlangıç" value={pr1Start} onChange={setPr1Start} className="flex-1" />
                  <WeekdayDatePicker label="Bitiş" value={pr1End} onChange={setPr1End} className="flex-1" />
                </div>
              </fieldset>
              <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-600">
                <legend className="text-sm font-semibold text-orange-700 dark:text-orange-300">Dönem B — Turuncu</legend>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <WeekdayDatePicker label="Başlangıç" value={pr2Start} onChange={setPr2Start} className="flex-1" />
                  <WeekdayDatePicker label="Bitiş" value={pr2End} onChange={setPr2End} className="flex-1" />
                </div>
              </fieldset>
            </div>
          )}
        </section>

        {/* ── Placeholder when nothing selected ── */}
        {compareMode === "worker" && (!w1Id || !w2Id) && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-600 dark:bg-slate-800">
            <span className="text-5xl">👥</span>
            <p className="mt-3 text-slate-500 dark:text-slate-400">
              Karşılaştırma için iki personel seçin
            </p>
          </div>
        )}
        {compareMode === "team" && (!tm1Code || !tm2Code || tm1Code === tm2Code) && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-600 dark:bg-slate-800">
            <span className="text-5xl">🏭</span>
            <p className="mt-3 text-center text-slate-500 dark:text-slate-400">
              İki farklı bölüm seçin (tüm personel üretimi toplanır).
            </p>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 dark:border-slate-700 dark:bg-slate-800">
            <span className="text-slate-400">Veriler yükleniyor...</span>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {compareMode === "period" && !loading && !error && pd1 && pd2 && (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Tam fabrika üretimi (tüm bölümler)
              </h2>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                Dönem A: {pd1.startDate} — {pd1.endDate} · Dönem B: {pd2.startDate} — {pd2.endDate}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-20 text-right">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{pd1.grandTotal}</span>
                </div>
                <div className="relative flex h-9 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${periodPct1}%` }} />
                  <div className="h-full flex-1 bg-orange-400" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                      vs
                    </span>
                  </div>
                </div>
                <div className="w-20">
                  <span className="text-lg font-bold text-orange-500 dark:text-orange-400">{pd2.grandTotal}</span>
                </div>
              </div>
              <div className="mt-2 flex justify-between px-20 text-xs font-medium text-slate-500">
                <span className="text-blue-500">%{periodPct1}</span>
                <span className="text-orange-400">%{periodPct2}</span>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[pd1, pd2].map((blk, idx) => (
                <div
                  key={blk.key}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                  <h3 className={`text-sm font-bold ${idx === 0 ? "text-blue-600" : "text-orange-500"}`}>
                    {idx === 0 ? "Dönem A" : "Dönem B"} · {blk.grandTotal.toLocaleString("tr-TR")} adet
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {blk.distinctDays} gün üretim kaydı · {blk.startDate} … {blk.endDate}
                  </p>
                  <div className="mt-3 max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-600">
                          <th className="py-1 pr-2">Bölüm</th>
                          <th className="py-1 text-right">Toplam</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(blk.teams ?? []).map((t) => (
                          <tr key={t.teamCode} className="border-b border-slate-100 dark:border-slate-700/80">
                            <td className="py-1.5 pr-2 font-medium">
                              {teamLabels[t.teamCode] ?? t.teamCode}
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{t.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ COMPARISON CONTENT ══════════ */}
        {!loading && !error && compareMode !== "period" && w1 && w2 && (
          <>
            {/* ── Worker cards ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <WorkerCard
                stat={w1}
                color="blue"
                label={compareMode === "team" ? "BÖLÜM 1" : "PERSONEL 1"}
                isWinner={w1.total >= w2.total}
                teamLabels={teamLabels}
              />
              <WorkerCard
                stat={w2}
                color="orange"
                label={compareMode === "team" ? "BÖLÜM 2" : "PERSONEL 2"}
                isWinner={w2.total > w1.total}
                teamLabels={teamLabels}
              />
            </div>

            {/* ── Overall comparison bar ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Genel Üretim Karşılaştırması
              </h2>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                Tarih aralığı: {startDate} — {endDate}
                {w1?.activeDays != null ? ` · ${w1.activeDays} / ${w2?.activeDays ?? 0} aktif gün` : null}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-16 text-right">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {w1.total}
                  </span>
                </div>
                <div className="relative flex h-9 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full bg-blue-500 transition-all duration-700"
                    style={{ width: `${pct1}%` }}
                  />
                  <div className="h-full flex-1 bg-orange-400" />
                  {/* Centre divider */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                      vs
                    </span>
                  </div>
                </div>
                <div className="w-16">
                  <span className="text-lg font-bold text-orange-500 dark:text-orange-400">
                    {w2.total}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 flex justify-between px-[4.5rem] text-xs font-medium text-slate-500">
                <span className="text-blue-500">%{pct1}</span>
                <span className="text-orange-400">%{pct2}</span>
              </div>

              {/* Fark */}
              <div className="mt-3 flex justify-center">
                {w1.total !== w2.total ? (
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      w1.total > w2.total
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                    }`}
                  >
                    {w1.total > w2.total ? w1.name : w2.name} önde —{" "}
                    {Math.abs(w1.total - w2.total)} adet fark
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500 dark:bg-slate-700">
                    Berabere!
                  </span>
                )}
              </div>
            </section>

            {/* ── Hourly slot comparison ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Saat Dilimine Göre Karşılaştırma
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {SLOTS.map(({ key, label }) => {
                  const v1 = w1[key];
                  const v2 = w2[key];
                  const mx = Math.max(v1, v2, 1);
                  const diff = v1 - v2;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-slate-100 p-3 dark:border-slate-700"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="max-w-[min(100%,14rem)] text-xs font-semibold leading-tight text-slate-700 dark:text-slate-200 sm:text-sm">
                          {label}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            diff > 0
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : diff < 0
                              ? "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400"
                              : "text-slate-400"
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff === 0 ? "Eşit" : diff}
                        </span>
                      </div>

                      {/* P1 bar */}
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="w-3 text-[10px] font-bold text-blue-500">1</span>
                        <div
                          className="flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-700"
                          style={{ height: 14 }}
                        >
                          <div
                            className="rounded-sm bg-blue-500 transition-all duration-500"
                            style={{ width: `${(v1 / mx) * 100}%`, height: 14 }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold">{v1}</span>
                      </div>

                      {/* P2 bar */}
                      <div className="flex items-center gap-2">
                        <span className="w-3 text-[10px] font-bold text-orange-500">2</span>
                        <div
                          className="flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-700"
                          style={{ height: 14 }}
                        >
                          <div
                            className="rounded-sm bg-orange-400 transition-all duration-500"
                            style={{ width: `${(v2 / mx) * 100}%`, height: 14 }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold">{v2}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Daily trend chart ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Günlük Üretim Trendi
                </h2>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-5 rounded bg-blue-500" />
                    {w1.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-5 rounded bg-orange-400" />
                    {w2.name}
                  </span>
                </div>
              </div>
              {daily.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Seçilen tarih aralığında üretim verisi bulunamadı.
                </p>
              ) : (
                <LineChart daily={daily} w1Name={w1.name} w2Name={w2.name} />
              )}
            </section>

            {/* ── Detailed diff table ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Detaylı Fark Tablosu
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500 dark:border-slate-700">
                      <th className="pb-2 text-left font-medium">Saat</th>
                      <th className="pb-2 text-right font-medium text-blue-500">{w1.name}</th>
                      <th className="pb-2 text-right font-medium text-orange-500">{w2.name}</th>
                      <th className="pb-2 text-right font-medium">Fark</th>
                      <th className="pb-2 text-right font-medium">Önde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {SLOTS.map(({ key, label }) => {
                      const v1 = w1[key];
                      const v2 = w2[key];
                      const diff = v1 - v2;
                      return (
                        <tr key={key}>
                          <td className="py-2 font-medium">{label}</td>
                          <td className="py-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                            {v1}
                          </td>
                          <td className="py-2 text-right font-semibold text-orange-500 dark:text-orange-400">
                            {v2}
                          </td>
                          <td
                            className={`py-2 text-right font-bold ${
                              diff > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : diff < 0
                                ? "text-red-500 dark:text-red-400"
                                : "text-slate-400"
                            }`}
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                          <td className="py-2 text-right text-xs">
                            {diff > 0 ? (
                              <span className="text-blue-500">● {w1.name}</span>
                            ) : diff < 0 ? (
                              <span className="text-orange-500">● {w2.name}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr className="border-t-2 border-slate-200 dark:border-slate-600">
                      <td className="pt-2 font-bold">Toplam</td>
                      <td className="pt-2 text-right font-bold text-blue-600 dark:text-blue-400">
                        {w1.total}
                      </td>
                      <td className="pt-2 text-right font-bold text-orange-500 dark:text-orange-400">
                        {w2.total}
                      </td>
                      <td
                        className={`pt-2 text-right font-bold ${
                          w1.total - w2.total > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : w1.total - w2.total < 0
                            ? "text-red-500 dark:text-red-400"
                            : "text-slate-400"
                        }`}
                      >
                        {w1.total - w2.total > 0
                          ? `+${w1.total - w2.total}`
                          : w1.total - w2.total}
                      </td>
                      <td className="pt-2 text-right text-xs">
                        {w1.total > w2.total ? (
                          <span className="font-semibold text-blue-500">🏆 {w1.name}</span>
                        ) : w2.total > w1.total ? (
                          <span className="font-semibold text-orange-500">🏆 {w2.name}</span>
                        ) : (
                          <span className="text-slate-400">Berabere</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
