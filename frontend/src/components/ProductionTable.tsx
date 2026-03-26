"use client";

import { useState } from "react";
import { ProductionRow, Team } from "@/lib/types";

type ProductionTableProps = {
  rows: ProductionRow[];
  onCellChange: (workerId: number, field: "t1000" | "t1300" | "t1600" | "t1830", value: number) => void;
  onDeleteWorker: (workerId: number, workerName: string) => void;
  onEditWorker: (workerId: number, process: string) => Promise<void>;
  canDeleteWorkers?: boolean;
};

const TEAM_ORDER: Team[] = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM", "ADET"];

const PROCESS_OPTIONS = [
  "ARKA KOL ÇIMA",
  "ARKA KOL TAKMA",
  "CEP AĞZI",
  "CEP TAKMA",
  "DÜĞME",
  "ETEK UCU",
  "ETEK YAPMA",
  "ETİKET TAKMA",
  "İLİK AÇMA",
  "KESİM ADET",
  "KOL GAZİ",
  "KOLİTE KONTROL ADET",
  "OMUZ ÇATIM",
  "OMUZ ÇIMA",
  "ÖN PAT",
  "SAĞ KOL ÇIMA",
  "SAĞ KOL TAKMA",
  "SOL KOL ÇIMA",
  "SOL KOL TAKMA",
  "TALİMAT HAZIRLIK",
  "ÜTÜ ADET",
  "YAKA İÇ ÇIMA",
  "YAKA KAPAMA",
  "YAKA REGOLA",
  "YAKA TAKMA",
  "YAKA UCU",
  "YAKA ÜST TULUM",
  "YAKA YAN VURMA",
  "YAN ÇATMA",
  "YIKAMA TALİMATI",
].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" }));

function teamLabel(team: Team) {
  if (team === "SAG_ON") return "SAĞ ÖN";
  if (team === "SOL_ON") return "SOL ÖN";
  if (team === "YAKA_HAZIRLIK") return "YAKA HAZIRLIK";
  if (team === "ARKA_HAZIRLIK") return "ARKA HAZIRLIK";
  if (team === "BITIM") return "BİTİM";
  return "ADET";
}

export default function ProductionTable({
  rows,
  onCellChange,
  onDeleteWorker,
  onEditWorker,
  canDeleteWorkers,
}: ProductionTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingProcess, setEditingProcess] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const canDelete = Boolean(canDeleteWorkers);

  function startEdit(row: ProductionRow) {
    setEditingId(row.workerId);
    setEditingProcess(row.process);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingProcess("");
  }

  async function saveEdit(workerId: number) {
    if (!editingProcess.trim()) return;
    setSaving(true);
    try {
      await onEditWorker(workerId, editingProcess);
      setEditingId(null);
      setEditingProcess("");
    } finally {
      setSaving(false);
    }
  }

  let rowNo = 1;

  return (
    <div className="overflow-auto rounded-lg border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
      <table className="w-full min-w-[960px] border-collapse text-sm">
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
            const teamRows = rows.filter((r) => r.team === team);
            if (teamRows.length === 0) return null;
            const startNo = rowNo;
            rowNo += teamRows.length;

            return (
              <>
                <tr key={`header-${team}`} className="bg-slate-200 dark:bg-slate-700">
                  <td colSpan={9} className="px-3 py-2 text-left text-sm font-semibold">
                    {teamLabel(team)}
                  </td>
                </tr>
                {teamRows.map((row, index) => {
                  const total = row.t1000 + row.t1300 + row.t1600 + row.t1830;
                  const isEditing = editingId === row.workerId;

                  return (
                    <tr
                      key={row.workerId}
                      className="border-b border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-600"
                    >
                      <td className="px-3 py-2 text-center">{startNo + index}</td>
                      <td className="px-3 py-2">{row.name}</td>

                      {/* Proses — düzenleme modunda dropdown, normal modda metin */}
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editingProcess}
                            onChange={(e) => setEditingProcess(e.target.value)}
                            className="rounded border border-blue-400 bg-white px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
                            autoFocus
                          >
                            {PROCESS_OPTIONS.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        ) : (
                          row.process
                        )}
                      </td>

                      {(["t1000", "t1300", "t1600", "t1830"] as const).map((field) => (
                        <td key={field} className="px-2 py-1">
                          <input
                            type="number"
                            min={0}
                            value={row[field]}
                            onChange={(e) => onCellChange(row.workerId, field, Number(e.target.value) || 0)}
                            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-300"
                          />
                        </td>
                      ))}

                      <td className="px-3 py-2 text-right font-semibold">{total}</td>

                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => void saveEdit(row.workerId)}
                                disabled={saving}
                                className="rounded border border-emerald-400 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                              >
                                Kaydet
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={saving}
                                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-600"
                              >
                                İptal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(row)}
                                className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/20"
                              >
                                Düzenle
                              </button>
                              {canDelete ? (
                                <button
                                  onClick={() => onDeleteWorker(row.workerId, row.name)}
                                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700/60 dark:text-red-200 dark:hover:bg-red-900/20"
                                >
                                  Sil
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
