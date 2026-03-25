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

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 text-base font-semibold">Admin Panel (Özet)</h2>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">Çalışan: {stats.workerCount}</div>
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">Günlük Toplam: {stats.total}</div>
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">SAĞ ÖN: {stats.teamTotals.SAG_ON}</div>
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">SOL ÖN: {stats.teamTotals.SOL_ON}</div>
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">YAKA HAZIRLIK: {stats.teamTotals.YAKA_HAZIRLIK}</div>
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">ARKA HAZIRLIK: {stats.teamTotals.ARKA_HAZIRLIK}</div>
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">BİTİM: {stats.teamTotals.BITIM}</div>
        <div className="rounded bg-slate-100 p-3 dark:bg-slate-700 dark:text-slate-100">ADET: {stats.teamTotals.ADET}</div>
      </div>
    </div>
  );
}
