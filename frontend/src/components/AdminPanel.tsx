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

  const tiles: Array<{ label: string; value: number; accent: string; title?: string }> = [
    { label: "Çalışan", value: workerCount, accent: "text-slate-700 dark:text-slate-200" },
    {
      label: "Genel tamamlanan",
      value: genelTamamlanan,
      accent: "text-emerald-700 dark:text-emerald-300",
      title: "Hedef Takip ile aynı: min(Sağ Ön, Sol Ön, Yaka, Arka, Bitim)",
    },
    { label: "Sağ Ön (SAĞ KOL ÇIMA)", value: stageTotals.SAG_ON, accent: "text-slate-600 dark:text-slate-300" },
    { label: "Sol Ön (SOL KOL ÇIMA)", value: stageTotals.SOL_ON, accent: "text-slate-600 dark:text-slate-300" },
    { label: "Yaka (YAKA İÇ ÇIMA)", value: stageTotals.YAKA_HAZIRLIK, accent: "text-slate-600 dark:text-slate-300" },
    { label: "Arka (ARKA KOL ÇIMA ÷2)", value: stageTotals.ARKA_HAZIRLIK, accent: "text-slate-600 dark:text-slate-300" },
    { label: "Bitim (DÜĞME)", value: stageTotals.BITIM, accent: "text-slate-600 dark:text-slate-300" },
  ];

  return (
    <div className="surface-card">
      <h2 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100 md:text-base">
        Günlük Özet
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        {tiles.map(({ label, value, accent, title }) => (
          <div
            key={label}
            title={title}
            className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-600/50 dark:bg-slate-800/60 md:p-3"
          >
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
            <span className={`mt-0.5 text-lg font-bold leading-tight ${accent}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
