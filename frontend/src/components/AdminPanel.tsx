"use client";

import { useMemo } from "react";

export type HedefStageLine = {
  sortOrder: number;
  teamCode: string;
  processName: string;
  teamLabel: string;
  total: number;
};

export type HedefStageTotals = {
  stages: HedefStageLine[];
  dailySummaryStages: HedefStageLine[];
};

type AdminPanelProps = {
  workerCount: number;
  stageTotals: HedefStageTotals;
  stageError?: string | null;
  ekran1TotalCompleted?: number | null;
  ekran1TodayProduced?: number | null;
  ekran1Stages?: HedefStageLine[] | null;
  ekran1DailySummaryStages?: HedefStageLine[] | null;
};

function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function genelTamamlananFromStages(stages: HedefStageLine[]): number {
  if (!stages.length) return 0;
  return Math.min(...stages.map((s) => safeNum(s.total)));
}

function stageLabel(s: HedefStageLine): string {
  const p = s.processName.length > 20 ? `${s.processName.slice(0, 18)}…` : s.processName;
  return p ? `${s.teamLabel} · ${p}` : s.teamLabel;
}

export default function AdminPanel({ workerCount, stageTotals, stageError, ekran1TotalCompleted, ekran1TodayProduced, ekran1Stages, ekran1DailySummaryStages }: AdminPanelProps) {
  const stages = stageTotals.stages ?? [];
  const daily = stageTotals.dailySummaryStages ?? [];

  const stageFallback = useMemo(() => genelTamamlananFromStages(stages), [stages]);
  const genelTamamlanan = ekran1TotalCompleted ?? stageFallback;
  const todayProduced = ekran1TodayProduced ?? null;

  const cumByOrder = useMemo(() => {
    const map = new Map<number, number>();
    (ekran1Stages ?? []).forEach((s) => map.set(s.sortOrder, safeNum(s.total)));
    return map;
  }, [ekran1Stages]);

  const cumDailyByOrder = useMemo(() => {
    const map = new Map<number, number>();
    (ekran1DailySummaryStages ?? []).forEach((s) => map.set(s.sortOrder, safeNum(s.total)));
    return map;
  }, [ekran1DailySummaryStages]);


  return (
    <div className="surface-card overflow-hidden">

      {/* Başlık */}
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-sm font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
          Günlük Özet
        </h2>
        {stageError && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            ⚠ Veri hatası
          </span>
        )}
      </div>

      <div className="px-5 pb-5 space-y-4">

        {/* Hero: Çalışan + Genel tamamlanan + Bugün tamamlanan */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Çalışan
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums text-slate-700 dark:text-slate-200">
              {safeNum(workerCount)}
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-800/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">
              Genel tamamlanan
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
              {safeNum(genelTamamlanan).toLocaleString("tr-TR")}
            </p>
          </div>
          <div className="rounded-2xl bg-sky-50 px-4 py-3 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:ring-sky-800/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-500">
              Bugün tamamlanan
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums text-sky-700 dark:text-sky-300">
              {todayProduced != null ? safeNum(todayProduced).toLocaleString("tr-TR") : "—"}
            </p>
          </div>
        </div>

        {/* Bölüm aşamaları */}
        {stages.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stages.map((s, i) => {
              const cumTotal = cumByOrder.get(s.sortOrder);
              return (
                <div
                  key={`stage-${s.sortOrder}-${i}`}
                  className="relative rounded-xl bg-teal-50/60 px-3 py-3 shadow-sm ring-1 ring-teal-200/70 dark:bg-teal-950/20 dark:ring-teal-800/50"
                >
                  <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl bg-teal-400 dark:bg-teal-500" />
                  <p className="line-clamp-2 text-xs font-bold leading-snug text-slate-700 dark:text-slate-200">
                    {stageLabel(s)}
                  </p>
                  <p className="mt-1.5 text-2xl font-black tabular-nums text-teal-600 dark:text-teal-300">
                    {safeNum(s.total).toLocaleString("tr-TR")}
                  </p>
                  {cumTotal != null && (
                    <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-teal-500/80 dark:text-teal-400/70">
                      Toplam {cumTotal.toLocaleString("tr-TR")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Özet prosesler */}
        {daily.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {daily.map((s, i) => {
              const cumTotal = cumDailyByOrder.get(s.sortOrder);
              return (
                <div
                  key={`daily-${s.sortOrder}-${i}`}
                  className="relative rounded-xl bg-violet-50/60 px-3 py-3 shadow-sm ring-1 ring-violet-200/70 dark:bg-violet-950/20 dark:ring-violet-800/50"
                >
                  <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl bg-violet-400 dark:bg-violet-500" />
                  <p className="line-clamp-2 text-xs font-bold leading-snug text-slate-700 dark:text-slate-200">
                    {stageLabel(s)}
                  </p>
                  <p className="mt-1.5 text-2xl font-black tabular-nums text-violet-600 dark:text-violet-300">
                    {safeNum(s.total).toLocaleString("tr-TR")}
                  </p>
                  {cumTotal != null && (
                    <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-violet-500/80 dark:text-violet-400/70">
                      Toplam {cumTotal.toLocaleString("tr-TR")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {stages.length === 0 && daily.length === 0 && (
          <p className="py-2 text-center text-xs text-slate-400 dark:text-slate-500">Veri bekleniyor…</p>
        )}

        {/* Renk açıklaması */}
        {(stages.length > 0 || daily.length > 0) && (
          <div className="flex items-center gap-4 pt-1">
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span className="h-2 w-2 rounded-full bg-teal-400" /> Bölüm aşaması
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span className="h-2 w-2 rounded-full bg-violet-400" /> Özet proses
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
