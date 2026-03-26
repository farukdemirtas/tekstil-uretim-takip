"use client";

import { useMemo } from "react";
import { ProductionRow, Team } from "@/lib/types";

type AdminPanelProps = {
  rows: ProductionRow[];
};

export default function AdminPanel({ rows }: AdminPanelProps) {
  const stats = useMemo(() => {
    const workerCount = rows.length;
    const total = rows.reduce((acc, row) => acc + row.t1000 + row.t1300 + row.t1600 + row.t1830, 0);
    const teamTotals = rows.reduce<Record<Team, number>>(
      (acc, row) => {
        const rowTotal = row.t1000 + row.t1300 + row.t1600 + row.t1830;
        acc[row.team] += rowTotal;
        return acc;
      },
      { SAG_ON: 0, SOL_ON: 0, YAKA_HAZIRLIK: 0, ARKA_HAZIRLIK: 0, BITIM: 0, ADET: 0 }
    );
    return { workerCount, total, teamTotals };
  }, [rows]);

  const tiles = [
    { label: "Çalışan",        value: stats.workerCount,              accent: "text-slate-700 dark:text-slate-200" },
    { label: "Günlük Toplam",  value: stats.total,                    accent: "text-emerald-700 dark:text-emerald-300" },
    { label: "Sağ Ön",         value: stats.teamTotals.SAG_ON,        accent: "text-slate-600 dark:text-slate-300" },
    { label: "Sol Ön",         value: stats.teamTotals.SOL_ON,        accent: "text-slate-600 dark:text-slate-300" },
    { label: "Yaka Hazırlık",  value: stats.teamTotals.YAKA_HAZIRLIK, accent: "text-slate-600 dark:text-slate-300" },
    { label: "Arka Hazırlık",  value: stats.teamTotals.ARKA_HAZIRLIK, accent: "text-slate-600 dark:text-slate-300" },
    { label: "Bitim",          value: stats.teamTotals.BITIM,         accent: "text-slate-600 dark:text-slate-300" },
    { label: "Adet",           value: stats.teamTotals.ADET,          accent: "text-slate-600 dark:text-slate-300" },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 md:p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200 md:text-base">
        Günlük Özet
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        {tiles.map(({ label, value, accent }) => (
          <div
            key={label}
            className="flex flex-col rounded-lg bg-slate-50 p-2.5 dark:bg-slate-700/60 md:p-3"
          >
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
            <span className={`mt-0.5 text-lg font-bold leading-tight ${accent}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
