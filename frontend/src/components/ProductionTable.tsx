"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { getProcesses, getTeams } from "@/lib/api";
import { ProductionRow } from "@/lib/types";

type ProductionTableProps = {
  rows: ProductionRow[];
  /** Seçili takvim günü (ipucu / tutarlılık) */
  selectedDate: string;
  onCellChange: (workerId: number, field: "t1000" | "t1300" | "t1600" | "t1830", value: number) => void;
  onDeleteWorker: (workerId: number, workerName: string) => void;
  /** Bu gün sahada yok (satır soluk, hücreler kilitli) */
  onHideWorkerForDay?: (workerId: number, workerName: string) => void;
  /** Sahada yok işaretini kaldır */
  onUnhideWorkerForDay?: (workerId: number, workerName: string) => void;
  onEditWorker: (workerId: number, payload: { process: string; team: string }) => Promise<void>;
  onSaveNote?: (workerId: number, note: string) => Promise<void>;
  canDeleteWorkers?: boolean;
};

const FALLBACK_TEAM_ORDER = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM", "ADET"];

const FALLBACK_LABELS: Record<string, string> = {
  SAG_ON: "SAĞ ÖN",
  SOL_ON: "SOL ÖN",
  YAKA_HAZIRLIK: "YAKA HAZIRLIK",
  ARKA_HAZIRLIK: "ARKA HAZIRLIK",
  BITIM: "BİTİM",
  ADET: "ADET",
};

const TIME_FIELDS = [
  { key: "t1000" as const, label: "10:00" },
  { key: "t1300" as const, label: "13:00" },
  { key: "t1600" as const, label: "16:00" },
  { key: "t1830" as const, label: "18:30" },
];

function cellInputValue(n: number): string {
  return n === 0 ? "" : String(n);
}

function parseTimeCell(raw: string): number {
  if (raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

function ProcessSelectEditor({
  value,
  onChange,
  options,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative w-full max-w-full ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select-modern-compact w-full max-w-[16rem]"
        autoFocus={autoFocus}
      >
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 dark:text-slate-400">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

export default function ProductionTable({
  rows,
  selectedDate,
  onCellChange,
  onDeleteWorker,
  onHideWorkerForDay,
  onUnhideWorkerForDay,
  onEditWorker,
  onSaveNote,
  canDeleteWorkers,
}: ProductionTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingProcess, setEditingProcess] = useState<string>("");
  const [editingTeam, setEditingTeam] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [noteEditingId, setNoteEditingId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState<string>("");
  const [teamOrder, setTeamOrder] = useState<string[]>(FALLBACK_TEAM_ORDER);
  const [teamLabels, setTeamLabels] = useState<Record<string, string>>(FALLBACK_LABELS);
  const [processNames, setProcessNames] = useState<string[]>([]);

  useEffect(() => {
    void Promise.all([getTeams(), getProcesses()])
      .then(([teams, procs]) => {
        setTeamOrder(teams.map((t) => t.code));
        setTeamLabels(Object.fromEntries(teams.map((t) => [t.code, t.label])));
        setProcessNames(procs.map((p) => p.name));
      })
      .catch(() => {
        /* API yoksa varsayılan sıra */
      });
  }, []);

  const teamLabel = (code: string) => teamLabels[code] ?? FALLBACK_LABELS[code] ?? code;

  const canDelete = Boolean(canDeleteWorkers);

  function startEdit(row: ProductionRow) {
    if (row.absentForDay) return;
    setEditingId(row.workerId);
    setEditingProcess(row.process);
    setEditingTeam(row.team);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingProcess("");
    setEditingTeam("");
    setNoteEditingId(null);
    setNoteText("");
  }

  function startNoteEdit(row: ProductionRow) {
    setNoteEditingId(row.workerId);
    setNoteText(row.note ?? "");
  }

  function cancelNoteEdit() {
    setNoteEditingId(null);
    setNoteText("");
  }

  async function saveNote(workerId: number) {
    if (!onSaveNote) return;
    setSaving(true);
    try {
      await onSaveNote(workerId, noteText.trim());
      setNoteEditingId(null);
      setNoteText("");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(workerId: number) {
    if (!editingProcess.trim() || !editingTeam.trim()) return;
    setSaving(true);
    try {
      await onEditWorker(workerId, {
        process: editingProcess.trim().toUpperCase(),
        team: editingTeam.trim().toUpperCase(),
      });
      setEditingId(null);
      setEditingProcess("");
      setEditingTeam("");
    } finally {
      setSaving(false);
    }
  }

  const sortedSectionTeams = useMemo(() => {
    const inData = [...new Set(rows.map((r) => r.team))];
    const order = teamOrder.length ? teamOrder : FALLBACK_TEAM_ORDER;
    const head = order.filter((t) => inData.includes(t));
    const tail = inData.filter((t) => !order.includes(t));
    return [...head, ...tail];
  }, [rows, teamOrder]);

  let rowNo = 1;

  const sections = sortedSectionTeams.map((team) => {
    const teamRows = rows.filter((r) => r.team === team);
    if (teamRows.length === 0) return null;
    const startNo = rowNo;
    rowNo += teamRows.length;
    return { team, teamRows, startNo };
  }).filter(Boolean) as { team: string; teamRows: ProductionRow[]; startNo: number }[];

  const processOptions =
    processNames.length > 0
      ? processNames
      : [...new Set(rows.map((r) => r.process))].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" }));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-surface dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100 dark:shadow-none">

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
                  const absent = Boolean(row.absentForDay);
                  return (
                    <tr
                      key={`${team}-${row.workerId}-${index}`}
                      className={`border-b border-slate-200 dark:border-slate-700 ${
                        absent
                          ? "bg-slate-100/80 text-slate-500 opacity-[0.72] dark:bg-slate-800/50 dark:text-slate-400"
                          : "hover:bg-slate-50 dark:hover:bg-slate-600"
                      }`}
                    >
                      <td className="px-3 py-2 text-center">{startNo + index}</td>
                      <td className="px-3 py-2">
                        <span className={`font-medium ${absent ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"}`}>
                          {row.name}
                        </span>
                        {absent ? (
                          <span className="ml-2 inline-block rounded-md border border-amber-200/90 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                            Sahada yok
                          </span>
                        ) : null}
                        {!isEditing && row.note ? (
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 italic">{row.note}</p>
                        ) : null}
                        {isEditing && noteEditingId === row.workerId ? (
                          <div className="mt-1.5 flex flex-col gap-1">
                            <textarea
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Açıklama yazın…"
                              rows={2}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => void saveNote(row.workerId)}
                                disabled={saving}
                                className="rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                              >Kaydet</button>
                              <button
                                type="button"
                                onClick={cancelNoteEdit}
                                disabled={saving}
                                className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300"
                              >İptal</button>
                            </div>
                          </div>
                        ) : isEditing && noteEditingId !== row.workerId && onSaveNote ? (
                          <button
                            type="button"
                            onClick={() => startNoteEdit(row)}
                            className="mt-1 block text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                          >
                            {row.note ? "Açıklamayı düzenle" : "+ Açıklama ekle"}
                          </button>
                        ) : null}
                      </td>
                      <td className="min-w-[10rem] px-3 py-2">
                        {isEditing ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="relative w-full">
                              <select
                                value={editingTeam}
                                onChange={(e) => setEditingTeam(e.target.value)}
                                className="select-modern-compact w-full max-w-[16rem]"
                                autoFocus
                              >
                                {teamOrder.map((code) => (
                                  <option key={code} value={code}>
                                    {teamLabel(code)}
                                  </option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 dark:text-slate-400">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </span>
                            </div>
                            <ProcessSelectEditor
                              value={editingProcess}
                              onChange={setEditingProcess}
                              options={processOptions}
                            />
                          </div>
                        ) : (
                          <span className="text-slate-800 dark:text-slate-200">{row.process}</span>
                        )}
                      </td>
                      {TIME_FIELDS.map(({ key }) => (
                        <td key={key} className="px-2 py-1">
                          <input
                            type="number"
                            min={0}
                            disabled={absent}
                            aria-disabled={absent}
                            title={absent ? "Sahada yok — önce Bugün var ile açın" : undefined}
                            value={cellInputValue(row[key])}
                            onChange={(e) => onCellChange(row.workerId, key, parseTimeCell(e.target.value))}
                            className={`w-20 rounded border px-2 py-1 text-right outline-none dark:text-slate-100 ${
                              absent
                                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500"
                                : "border-slate-300 bg-white focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:focus:border-blue-300"
                            }`}
                          />
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right font-semibold ${absent ? "text-slate-500 dark:text-slate-400" : ""}`}>{total}</td>
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
                                type="button"
                                disabled={absent}
                                onClick={() => startEdit(row)}
                                className="rounded-lg border border-violet-300 px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-950/35"
                              >
                                Taşı
                              </button>
                              {absent && onUnhideWorkerForDay ? (
                                <button
                                  type="button"
                                  title={`${selectedDate}: sahada yok işaretini kaldır`}
                                  onClick={() => onUnhideWorkerForDay(row.workerId, row.name)}
                                  className="rounded border border-teal-400 px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 dark:border-teal-600 dark:text-teal-200 dark:hover:bg-teal-950/40"
                                >
                                  Bugün var
                                </button>
                              ) : null}
                              {!absent && onHideWorkerForDay ? (
                                <button
                                  type="button"
                                  title={`${selectedDate}: sahada yok (satır soluk kalır, hücreler kilitlenir)`}
                                  onClick={() => onHideWorkerForDay(row.workerId, row.name)}
                                  className="rounded border border-amber-300/90 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 dark:border-amber-700/70 dark:text-amber-200 dark:hover:bg-amber-950/40"
                                >
                                  Bugün yok
                                </button>
                              ) : null}
                              {canDelete ? (
                                <button
                                  type="button"
                                  title="Seçili tarih ve sonrasında sil (pasif)"
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-700 md:hidden">
        {sections.map(({ team, teamRows, startNo }) => (
          <div key={team}>
            <div className="bg-slate-200 px-4 py-2 text-sm font-semibold dark:bg-slate-700">
              {teamLabel(team)}
            </div>

            {teamRows.map((row, index) => {
              const total = row.t1000 + row.t1300 + row.t1600 + row.t1830;
              const isEditing = editingId === row.workerId;
              const absent = Boolean(row.absentForDay);

              return (
                <div
                  key={`${team}-${row.workerId}-${index}`}
                  className={`p-3 odd:bg-white even:bg-slate-50 dark:odd:bg-slate-800 dark:even:bg-slate-800/60 ${
                    absent ? "!bg-slate-100/90 opacity-[0.78] dark:!bg-slate-900/70" : ""
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="mr-1.5 text-xs text-slate-400">{startNo + index}.</span>
                      <span className={`font-medium ${absent ? "text-slate-500 dark:text-slate-400" : ""}`}>{row.name}</span>
                      {absent ? (
                        <span className="ml-2 inline-block rounded-md border border-amber-200/90 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                          Sahada yok
                        </span>
                      ) : null}
                      {!isEditing && row.note ? (
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 italic">{row.note}</p>
                      ) : null}
                      {isEditing && noteEditingId === row.workerId ? (
                        <div className="mt-1.5 flex flex-col gap-1">
                          <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Açıklama yazın…"
                            rows={2}
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => void saveNote(row.workerId)}
                              disabled={saving}
                              className="rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                            >Kaydet</button>
                            <button
                              type="button"
                              onClick={cancelNoteEdit}
                              disabled={saving}
                              className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300"
                            >İptal</button>
                          </div>
                        </div>
                      ) : isEditing && noteEditingId !== row.workerId && onSaveNote ? (
                        <button
                          type="button"
                          onClick={() => startNoteEdit(row)}
                          className="mt-1 block text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                        >
                          {row.note ? "Açıklamayı düzenle" : "+ Açıklama ekle"}
                        </button>
                      ) : null}
                      {isEditing ? (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <div className="relative w-full">
                            <select
                              value={editingTeam}
                              onChange={(e) => setEditingTeam(e.target.value)}
                              className="select-modern-compact w-full max-w-none"
                            >
                              {teamOrder.map((code) => (
                                <option key={code} value={code}>
                                  {teamLabel(code)}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 dark:text-slate-400">
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          </div>
                          <ProcessSelectEditor
                            value={editingProcess}
                            onChange={setEditingProcess}
                            options={processOptions}
                            className="max-w-none"
                          />
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{row.process}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-slate-500">Toplam</span>
                      <p className="text-lg font-bold leading-tight text-slate-800 dark:text-slate-100">{total}</p>
                    </div>
                  </div>

                  <div className="mb-2 grid grid-cols-2 gap-2">
                    {TIME_FIELDS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-600 dark:bg-slate-700">
                        <span className="w-10 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          disabled={absent}
                          value={cellInputValue(row[key])}
                          onChange={(e) => onCellChange(row.workerId, key, parseTimeCell(e.target.value))}
                          className={`min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none ${
                            absent
                              ? "cursor-not-allowed text-slate-400 dark:text-slate-500"
                              : "focus:text-blue-600 dark:focus:text-blue-300"
                          }`}
                        />
                      </div>
                    ))}
                  </div>

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
                          type="button"
                          disabled={absent}
                          onClick={() => startEdit(row)}
                          className="flex-1 rounded-lg border border-violet-300 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-40 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-950/35"
                        >
                          Taşı
                        </button>
                        {absent && onUnhideWorkerForDay && (
                          <button
                            type="button"
                            onClick={() => onUnhideWorkerForDay(row.workerId, row.name)}
                            className="flex-1 rounded-lg border border-teal-400 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 dark:border-teal-600 dark:text-teal-200 dark:hover:bg-teal-950/40"
                          >
                            Bugün var
                          </button>
                        )}
                        {!absent && onHideWorkerForDay && (
                          <button
                            type="button"
                            title={`${selectedDate}: sahada yok (satır soluk)`}
                            onClick={() => onHideWorkerForDay(row.workerId, row.name)}
                            className="flex-1 rounded-lg border border-amber-300 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950/40"
                          >
                            Bugün yok
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeleteWorker(row.workerId, row.name)}
                            className="flex-1 rounded-lg border border-red-300 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700/60 dark:text-red-200 dark:hover:bg-red-900/20"
                          >
                            Sil
                          </button>
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
