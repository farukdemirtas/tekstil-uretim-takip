"use client";

import { Fragment, useState } from "react";
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

const TIME_FIELDS = [
  { key: "t1000" as const, label: "10:00" },
  { key: "t1300" as const, label: "13:00" },
  { key: "t1600" as const, label: "16:00" },
  { key: "t1830" as const, label: "18:30" },
];

/** Veri 0 iken kutucukta boş göster; girişi kolaylaştırır (DB/API yine 0). */
function cellInputValue(n: number): string {
  return n === 0 ? "" : String(n);
}

function parseTimeCell(raw: string): number {
  if (raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

function teamLabel(team: Team) {
  if (team === "SAG_ON")        return "SAĞ ÖN";
  if (team === "SOL_ON")        return "SOL ÖN";
  if (team === "YAKA_HAZIRLIK") return "YAKA HAZIRLIK";
  if (team === "ARKA_HAZIRLIK") return "ARKA HAZIRLIK";
  if (team === "BITIM")         return "BİTİM";
  return "ADET";
}

export default function ProductionTable({
  rows,
  onCellChange,
  onDeleteWorker,
  onEditWorker,
  canDeleteWorkers,
}: ProductionTableProps) {
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [editingProcess, setEditingProcess] = useState<string>("");
  const [saving, setSaving]               = useState(false);

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

  const sections = TEAM_ORDER.map((team) => {
    const teamRows = rows.filter((r) => r.team === team);
    if (teamRows.length === 0) return null;
    const startNo = rowNo;
    rowNo += teamRows.length;
    return { team, teamRows, startNo };
  }).filter(Boolean) as { team: Team; teamRows: ProductionRow[]; startNo: number }[];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-surface dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100 dark:shadow-none">

      {/* ══════════ MASAÜSTÜ TABLO (md ve üzeri) ══════════ */}
      <div className="hidden overflow-auto md:block">
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
            {sections.map(({ team, teamRows, startNo }) => (
              <Fragment key={team}>
                <tr className="bg-slate-200 dark:bg-slate-700">
                  <td colSpan={9} className="px-3 py-2 text-left text-sm font-semibold">
                    {teamLabel(team)}
                  </td>
                </tr>
                {teamRows.map((row, index) => {
                  const total = row.t1000 + row.t1300 + row.t1600 + row.t1830;
                  const isEditing = editingId === row.workerId;
                  return (
                    <tr
                      key={`${team}-${row.workerId}-${index}`}
                      className="border-b border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-600"
                    >
                      <td className="px-3 py-2 text-center">{startNo + index}</td>
                      <td className="px-3 py-2">{row.name}</td>
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
                      {TIME_FIELDS.map(({ key }) => (
                        <td key={key} className="px-2 py-1">
                          <input
                            type="number"
                            min={0}
                            value={cellInputValue(row[key])}
                            onChange={(e) => onCellChange(row.workerId, key, parseTimeCell(e.target.value))}
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
                              >Kaydet</button>
                              <button
                                onClick={cancelEdit}
                                disabled={saving}
                                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-600"
                              >İptal</button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(row)}
                                className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/20"
                              >Düzenle</button>
                              {canDelete ? (
                                <button
                                  onClick={() => onDeleteWorker(row.workerId, row.name)}
                                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700/60 dark:text-red-200 dark:hover:bg-red-900/20"
                                >Sil</button>
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ══════════ MOBİL KART GÖRÜNÜMÜ (md altı) ══════════ */}
      <div className="divide-y divide-slate-200 dark:divide-slate-700 md:hidden">
        {sections.map(({ team, teamRows, startNo }) => (
          <div key={team}>
            {/* Takım başlığı */}
            <div className="bg-slate-200 px-4 py-2 text-sm font-semibold dark:bg-slate-700">
              {teamLabel(team)}
            </div>

            {teamRows.map((row, index) => {
              const total = row.t1000 + row.t1300 + row.t1600 + row.t1830;
              const isEditing = editingId === row.workerId;

              return (
                <div
                  key={`${team}-${row.workerId}-${index}`}
                  className="p-3 odd:bg-white even:bg-slate-50 dark:odd:bg-slate-800 dark:even:bg-slate-800/60"
                >
                  {/* İşçi bilgisi satırı */}
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="mr-1.5 text-xs text-slate-400">{startNo + index}.</span>
                      <span className="font-medium">{row.name}</span>
                      {isEditing ? (
                        <select
                          value={editingProcess}
                          onChange={(e) => setEditingProcess(e.target.value)}
                          className="mt-1 block w-full rounded border border-blue-400 bg-white px-2 py-1.5 text-sm dark:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
                        >
                          {PROCESS_OPTIONS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.process}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-slate-500">Toplam</span>
                      <p className="text-lg font-bold leading-tight text-slate-800 dark:text-slate-100">{total}</p>
                    </div>
                  </div>

                  {/* Saat dilimleri 2×2 grid */}
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    {TIME_FIELDS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-600 dark:bg-slate-700">
                        <span className="w-10 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={cellInputValue(row[key])}
                          onChange={(e) => onCellChange(row.workerId, key, parseTimeCell(e.target.value))}
                          className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none focus:text-blue-600 dark:focus:text-blue-300"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Aksiyon butonları */}
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => void saveEdit(row.workerId)}
                          disabled={saving}
                          className="flex-1 rounded-lg border border-emerald-400 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                        >Kaydet</button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-600"
                        >İptal</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(row)}
                          className="flex-1 rounded-lg border border-blue-300 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/20"
                        >Düzenle</button>
                        {canDelete && (
                          <button
                            onClick={() => onDeleteWorker(row.workerId, row.name)}
                            className="flex-1 rounded-lg border border-red-300 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700/60 dark:text-red-200 dark:hover:bg-red-900/20"
                          >Sil</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
