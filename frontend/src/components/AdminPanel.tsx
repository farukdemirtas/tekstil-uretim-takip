"use client";

import { useMemo } from "react";

export type HedefStageLine = {
  sortOrder: number;
  teamCode: string;
  processName: string;
  teamLabel: string;
  total: number;
};

/** `/api/production/hedef-stage-totals` — çalışılacak bölüm + günlük özet prosesleri */
export type HedefStageTotals = {
  stages: HedefStageLine[];
  dailySummaryStages: HedefStageLine[];
};

type AdminPanelProps = {
  workerCount: number;
  stageTotals: HedefStageTotals;
  stageError?: string | null;
};

function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function genelTamamlananFromStages(stages: HedefStageLine[]): number {
  if (!stages.length) return 0;
  return Math.min(...stages.map((s) => safeNum(s.total)));
}

function stageLabel(s: HedefStageLine): string {
  const shortProcess =
    s.processName.length > 18 ? `${s.processName.slice(0, 16)}…` : s.processName;
  return s.processName ? `${s.teamLabel} · ${shortProcess}` : s.teamLabel;
}

export default function AdminPanel({
  workerCount,
  stageTotals,
  stageError,
}: AdminPanelProps) {
  const stages = stageTotals.stages ?? [];
  const dailySummaryStages = stageTotals.dailySummaryStages ?? [];
  const genelTamamlanan = useMemo(() => genelTamamlananFromStages(stages), [stages]);

  const boxNeutral =
    "border-teal-200 bg-teal-50/50 shadow-sm dark:border-teal-800/50 dark:bg-teal-950/25 dark:shadow-none";
  const boxHighlight =
    "border-emerald-200 bg-emerald-50/90 shadow-md ring-1 ring-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:ring-emerald-900/40";
  const boxWorker =
    "border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800/90 dark:shadow-none";
  const boxDailySummary =
    "border-violet-200 bg-violet-50/70 shadow-sm dark:border-violet-800/50 dark:bg-violet-950/30 dark:shadow-none";

  const numNeutral = "text-teal-800 dark:text-teal-200";
  const numHighlight = "text-emerald-700 dark:text-emerald-300";
  const numWorker = "text-slate-800 dark:text-slate-100";
  const numDailySummary = "text-violet-800 dark:text-violet-200";

  const baselineTiles = stages.map((s, i) => ({
    key: `stage-${s.sortOrder}-${i}`,
    label: stageLabel(s),
    value: safeNum(s.total),
    valueClass: numNeutral,
    boxClass: boxNeutral,
  }));

  const dailyTiles = dailySummaryStages.map((s, i) => ({
    key: `daily-${s.sortOrder}-${i}`,
    label: stageLabel(s),
    value: safeNum(s.total),
    valueClass: numDailySummary,
    boxClass: boxDailySummary,
  }));

  const tiles: Array<{ key: string; label: string; value: number; valueClass: string; boxClass: string }> = [
    { key: "calisan", label: "Çalışan", value: safeNum(workerCount), valueClass: numWorker, boxClass: boxWorker },
    {
      key: "genel",
      label: "Genel tamamlanan",
      value: genelTamamlanan,
      valueClass: numHighlight,
      boxClass: boxHighlight,
    },
    ...baselineTiles,
    ...dailyTiles,
  ];

  return (
    <div className="surface-card">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 md:text-base">Günlük Özet</h2>
        <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          <span className="font-medium text-teal-700 dark:text-teal-300">Teal kutular</span> çalışılacak bölüm
          aşamalarıdır;{" "}
          <span className="font-medium text-violet-700 dark:text-violet-300">mor kutular</span> yalnızca sayı
          toplamı için seçilen günlük özet prosesleridir.
        </p>
      </div>
      {stageError && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          ⚠ {stageError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map(({ key, label, value, valueClass, boxClass }) => (
          <div
            key={key}
            className={`flex min-h-[5.5rem] flex-col items-center justify-center rounded-2xl border-2 px-2 py-3 text-center sm:min-h-[6rem] ${boxClass}`}
          >
            <span className="line-clamp-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400 sm:text-xs">
              {label}
            </span>
            <span className={`mt-1.5 text-xl font-bold tabular-nums sm:text-2xl ${valueClass}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
