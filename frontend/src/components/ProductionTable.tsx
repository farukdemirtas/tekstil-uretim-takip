"use client";

import { ProductionRow, Team } from "@/lib/types";

type ProductionTableProps = {
  rows: ProductionRow[];
  onCellChange: (workerId: number, field: "t1000" | "t1300" | "t1600" | "t1830", value: number) => void;
  onDeleteWorker: (workerId: number, workerName: string) => void;
  canDeleteWorkers?: boolean;
};

const TEAM_ORDER: Team[] = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM", "ADET"];

function teamLabel(team: Team) {
  if (team === "SAG_ON") return "SAĞ ÖN";
  if (team === "SOL_ON") return "SOL ÖN";
  if (team === "YAKA_HAZIRLIK") return "YAKA HAZIRLIK";
  if (team === "ARKA_HAZIRLIK") return "ARKA HAZIRLIK";
  if (team === "BITIM") return "BİTİM";
  return "ADET";
}

function renderGroup(
  team: Team,
  rows: ProductionRow[],
  onCellChange: ProductionTableProps["onCellChange"],
  onDeleteWorker: ProductionTableProps["onDeleteWorker"],
  canDeleteWorkers: boolean,
  startNo: number
) {
  const teamRows = rows.filter((row) => row.team === team);
  if (teamRows.length === 0) return null;

  return (
    <>
      <tr className="bg-slate-200 dark:bg-slate-700">
        <td colSpan={9} className="px-3 py-2 text-left text-sm font-semibold">
          {teamLabel(team)}
        </td>
      </tr>
      {teamRows.map((row, index) => {
        const total = row.t1000 + row.t1300 + row.t1600 + row.t1830;
        return (
          <tr
            key={row.workerId}
            className="border-b border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-600"
          >
            <td className="px-3 py-2 text-center">{startNo + index}</td>
            <td className="px-3 py-2">{row.name}</td>
            <td className="px-3 py-2">{row.process}</td>
            {(["t1000", "t1300", "t1600", "t1830"] as const).map((field) => (
              <td key={field} className="px-2 py-1">
                <input
                  type="number"
                  min={0}
                  value={row[field]}
                  onChange={(event) => onCellChange(row.workerId, field, Number(event.target.value) || 0)}
                  className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-300"
                />
              </td>
            ))}
            <td className="px-3 py-2 text-right font-semibold">{total}</td>
            <td className="px-3 py-2 text-center">
              {canDeleteWorkers ? (
                <button
                  onClick={() => onDeleteWorker(row.workerId, row.name)}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700/60 dark:text-red-200 dark:hover:bg-red-900/20"
                >
                  Sil
                </button>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export default function ProductionTable({ rows, onCellChange, onDeleteWorker, canDeleteWorkers }: ProductionTableProps) {
  let rowNo = 1;
  const canDelete = Boolean(canDeleteWorkers);

  return (
    <div className="overflow-auto rounded-lg border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="bg-slate-800 text-white">
          <tr>
            <th className="px-3 py-2">No</th>
            <th className="px-3 py-2">Ad Soyad</th>
            <th className="px-3 py-2">Proses</th>
            <th className="px-3 py-2">10:00</th>
            <th className="px-3 py-2">13:00</th>
            <th className="px-3 py-2">16:00</th>
            <th className="px-3 py-2">18:30</th>
            <th className="px-3 py-2">Toplam</th>
            <th className="px-3 py-2">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {TEAM_ORDER.map((team) => {
            const startNo = rowNo;
            rowNo += rows.filter((r) => r.team === team).length;
            return renderGroup(team, rows, onCellChange, onDeleteWorker, canDelete, startNo);
          })}
        </tbody>
      </table>
    </div>
  );
}
