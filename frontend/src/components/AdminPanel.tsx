"use client";

import { useMemo } from "react";

/** `/api/production/hedef-stage-totals` ile Hedef Takip ekranında kullanılan aynı aşama toplamları */
export type HedefStageTotals = {
  SAG_ON: number;
  SOL_ON: number;
  YAKA_HAZIRLIK: number;
  ARKA_HAZIRLIK: number;
  BITIM: number;
};

type AdminPanelProps = {
  workerCount: number;
  stageTotals: HedefStageTotals;
};

export default function AdminPanel({ workerCount, stageTotals }: AdminPanelProps) {
  const genelTamamlanan = useMemo(
    () =>
      Math.min(
        stageTotals.SAG_ON,
        stageTotals.SOL_ON,
        stageTotals.YAKA_HAZIRLIK,
        stageTotals.ARKA_HAZIRLIK,
        stageTotals.BITIM
      ),
    [stageTotals]
  );

  const boxNeutral =
    "border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800/90 dark:shadow-none";
  const boxHighlight =
    "border-emerald-200 bg-emerald-50/90 shadow-md ring-1 ring-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:ring-emerald-900/40";
  const numNeutral = "text-slate-800 dark:text-slate-100";
  const numHighlight = "text-emerald-700 dark:text-emerald-300";

  const tiles: Array<{ label: string; value: number; valueClass: string; boxClass: string }> = [
    { label: "Çalışan", value: workerCount, valueClass: numNeutral, boxClass: boxNeutral },
    { label: "Genel tamamlanan", value: genelTamamlanan, valueClass: numHighlight, boxClass: boxHighlight },
    { label: "Sağ Ön", value: stageTotals.SAG_ON, valueClass: numNeutral, boxClass: boxNeutral },
    { label: "Sol Ön", value: stageTotals.SOL_ON, valueClass: numNeutral, boxClass: boxNeutral },
    { label: "Yaka", value: stageTotals.YAKA_HAZIRLIK, valueClass: numNeutral, boxClass: boxNeutral },
    { label: "Arka", value: stageTotals.ARKA_HAZIRLIK, valueClass: numNeutral, boxClass: boxNeutral },
    { label: "Bitim", value: stageTotals.BITIM, valueClass: numNeutral, boxClass: boxNeutral },
  ];

  return (
    <div className="surface-card">
      <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 md:text-base">
        Günlük Özet
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map(({ label, value, valueClass, boxClass }) => (
          <div
            key={label}
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
