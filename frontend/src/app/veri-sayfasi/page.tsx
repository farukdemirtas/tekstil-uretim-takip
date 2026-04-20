"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getProcesses, getTeams, listProductModels, setAuthToken } from "@/lib/api";
import type { ProcessRow, TeamRow, ProductModelListItem } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import {
  makeProsesKey,
  setProsesMap,
  rowsKeyForModel,
} from "@/lib/prosesVeri";

/* ─── Tipler ─────────────────────────────────────────────── */
type Row = {
  id: number;
  teamCode: string;
  teamLabel: string;
  processName: string;
  dkAdet: string;
};

type EditState = { id: number | null; team: string; process: string; dk: string; dupError: boolean };
const EDIT_RESET: EditState = { id: null, team: "", process: "", dk: "", dupError: false };

/* ─── Yardımcılar ────────────────────────────────────────── */
function calc(dkAdet: string) {
  const dk = Number(dkAdet);
  if (!dkAdet || isNaN(dk) || dk <= 0) return null;
  return { saatlik: Math.round(dk * 60 * 100) / 100, gunluk: Math.round(dk * 60 * 9 * 100) / 100 };
}

let nextId = 1;

function saveModelRows(model: string, rows: Row[]) {
  try { window.localStorage.setItem(rowsKeyForModel(model), JSON.stringify(rows)); } catch { /* quota */ }
}

function loadModelRows(model: string): Row[] {
  try {
    const raw = window.localStorage.getItem(rowsKeyForModel(model));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Row[];
    if (!Array.isArray(parsed)) return [];
    const maxId = parsed.reduce((m, r) => Math.max(m, r.id ?? 0), 0);
    if (maxId >= nextId) nextId = maxId + 1;
    return parsed;
  } catch { return []; }
}

/* ════════════════════════════════════════════════════════════
   Sayfa
════════════════════════════════════════════════════════════ */
export default function VeriSayfasiPage() {
  const router = useRouter();

  /* auth */
  const [authorized, setAuthorized] = useState(false);
  const [loading,    setLoading]    = useState(true);

  /* api */
  const [processes,  setProcesses]  = useState<ProcessRow[]>([]);
  const [teams,      setTeams]      = useState<TeamRow[]>([]);
  const [apiModels,  setApiModels]  = useState<ProductModelListItem[]>([]);

  /* model + satırlar — atomik tek obje (ikisi asla ayrışmaz) */
  const [modelState, setModelState] = useState<{ model: string; rows: Row[] }>({ model: "", rows: [] });
  const activeModel = modelState.model;
  const rows        = modelState.rows;

  /* veri giriş formu */
  const [selectedTeam,    setSelectedTeam]    = useState("");
  const [selectedProcess, setSelectedProcess] = useState("");
  const [dkAdet,          setDkAdet]          = useState("");

  /* satır düzenleme — tek atomik obje */
  const [edit, setEdit] = useState<EditState>(EDIT_RESET);

  /* aktarma modalı */
  const [showTransfer,    setShowTransfer]    = useState(false);
  const [transferSource,  setTransferSource]  = useState<string>("");
  const [transferMode,    setTransferMode]    = useState<"merge" | "replace">("merge");

  /* ── Auth & Init — sadece ilk mount'ta çalışır ────────── */
  const routerRef = useRef(router);
  useEffect(() => {
    const r = routerRef.current;
    const token = window.localStorage.getItem("auth_token");
    if (!token) { r.replace("/"); return; }
    if (!hasPermission("veriSayfasi") && !isAdminRole()) { r.replace("/"); return; }
    setAuthorized(true);
    setAuthToken(token);

    void Promise.all([getProcesses(), getTeams(), listProductModels()])
      .then(([procs, tms, mds]) => {
        setProcesses(procs);
        setTeams(tms);
        setApiModels(mds);
        if (tms.length)  setSelectedTeam(tms[0].code);
        if (procs.length) setSelectedProcess(procs[0].name);
        const first = mds[0]?.modelCode ?? "";
        setModelState({ model: first, rows: first ? loadModelRows(first) : [] });
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Model değişimi — model+rows tek atomik state güncellemesi ── */
  function switchModel(model: string) {
    setEdit(EDIT_RESET);
    setModelState({ model, rows: loadModelRows(model) });
  }

  /* ── Storage sync ─────────────────────────────────────────────────────
     Model her zaman açıkça geçirilmeli; stale closure riskini ortadan kaldırır. */
  function syncToStorage(nextRows: Row[], model: string) {
    if (!model) return;
    saveModelRows(model, nextRows);
    const map: Record<string, string> = {};
    for (const row of nextRows) {
      if (row.dkAdet && Number(row.dkAdet) > 0) {
        map[makeProsesKey(row.teamCode, row.processName)] = row.dkAdet;
      }
    }
    setProsesMap(map, model);
  }

  /* ── Satır işlemleri ────────────────────────────────────── */
  const isDuplicate = rows.some(
    (r) => r.teamCode === selectedTeam && r.processName === selectedProcess
  );

  function handleAdd() {
    if (!selectedTeam || !selectedProcess || !dkAdet || isDuplicate || !activeModel) return;
    const team = teams.find((t) => t.code === selectedTeam);
    const next = [
      ...rows,
      { id: nextId++, teamCode: selectedTeam, teamLabel: team?.label ?? selectedTeam, processName: selectedProcess, dkAdet },
    ];
    const m = activeModel;
    setModelState((s) => ({ ...s, rows: next }));
    syncToStorage(next, m);
    setDkAdet("");
  }

  function handleRemove(id: number) {
    const next = rows.filter((r) => r.id !== id);
    const m = activeModel;
    setModelState((s) => ({ ...s, rows: next }));
    syncToStorage(next, m);
  }

  function handleDkChange(id: number, value: string) {
    const next = rows.map((r) => (r.id === id ? { ...r, dkAdet: value } : r));
    const m = activeModel;
    setModelState((s) => ({ ...s, rows: next }));
    syncToStorage(next, m);
  }

  function startEdit(row: Row) {
    setEdit({ id: row.id, team: row.teamCode, process: row.processName, dk: row.dkAdet, dupError: false });
  }

  function cancelEdit() {
    setEdit(EDIT_RESET);
  }

  function saveEdit(id: number) {
    const dup = rows.some((r) => r.id !== id && r.teamCode === edit.team && r.processName === edit.process);
    if (dup) { setEdit((s) => ({ ...s, dupError: true })); return; }
    const team = teams.find((t) => t.code === edit.team);
    const next = rows.map((r) =>
      r.id === id ? { ...r, teamCode: edit.team, teamLabel: team?.label ?? edit.team, processName: edit.process, dkAdet: edit.dk } : r
    );
    const m = activeModel;
    setModelState((s) => ({ ...s, rows: next }));
    syncToStorage(next, m);
    setEdit(EDIT_RESET);
  }

  function handleClear() {
    if (rows.length === 0) return;
    if (!window.confirm("Bu modelin tüm satırları silinsin mi?")) return;
    const m = activeModel;
    setModelState((s) => ({ ...s, rows: [] }));
    syncToStorage([], m);
  }

  /* ── Aktarma ────────────────────────────────────────────── */
  function handleTransfer() {
    const source = transferSource || otherModels[0] || "";
    if (!source || !activeModel) return;
    const sourceRows = loadModelRows(source);
    let next: Row[];
    if (transferMode === "replace") {
      next = sourceRows.map((r) => ({ ...r, id: nextId++ }));
    } else {
      const existing = new Set(rows.map((r) => makeProsesKey(r.teamCode, r.processName)));
      const toAdd    = sourceRows
        .filter((r) => !existing.has(makeProsesKey(r.teamCode, r.processName)))
        .map((r) => ({ ...r, id: nextId++ }));
      next = [...rows, ...toAdd];
    }
    const m = activeModel;
    setModelState((s) => ({ ...s, rows: next }));
    syncToStorage(next, m);
    setShowTransfer(false);
  }

  /* ── Excel export ───────────────────────────────────────── */
  function handleExport() {
    if (rows.length === 0) return;
    const aoa: (string | number)[][] = [
      [`Proses Veri Sayfası — ${activeModel}`],
      ["Dışa aktarım", new Date().toLocaleString("tr-TR")],
      [],
      ["Bölüm", "Proses", "Dk Adet", "Saat Adet", "Günlük Adet"],
    ];
    for (const row of rows) {
      const r = calc(row.dkAdet);
      aoa.push([row.teamLabel, row.processName, Number(row.dkAdet) || 0, r ? r.saatlik : 0, r ? r.gunluk : 0]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws["!cols"] = [{ wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proses Verileri");
    XLSX.writeFile(wb, `proses-veri-${activeModel}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const canAdd = Boolean(selectedTeam && selectedProcess && dkAdet && Number(dkAdet) > 0 && !isDuplicate && activeModel);

  if (!authorized) return null;

  const otherModels = apiModels.map((m) => m.modelCode).filter((m) => m !== activeModel);

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-4 pb-12 md:p-8">

      {/* ── Üst bar ──────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Proses Veri Sayfası
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Bölüm ve proses seçip dk · saatlik · günlük adet hesapla
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ← Ana Sayfa
        </Link>
      </section>

      {/* ── Model sekmeler ───────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ürün Modelleri</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">(Hedef takip ekranından yönetilir)</span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Yükleniyor…</p>
        ) : apiModels.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Henüz ürün modeli tanımlanmamış. Ayarlar → Ürün Modelleri bölümünden ekleyin.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {apiModels.map((m) => (
              <button
                key={m.modelCode}
                type="button"
                onClick={() => switchModel(m.modelCode)}
                title={m.productName}
                className={`rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition ${
                  m.modelCode === activeModel
                    ? "border-slate-700 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {m.modelCode}
                {m.modelCode === activeModel && rows.length > 0 && (
                  <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                    {rows.length}
                  </span>
                )}
                <span className={`ml-1.5 text-[11px] font-normal ${m.modelCode === activeModel ? "text-slate-300" : "text-slate-400"}`}>
                  {m.productName}
                </span>
              </button>
            ))}

            {/* Aktar butonu — her zaman erişilebilir */}
            {activeModel && otherModels.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const first = otherModels[0] ?? "";
                  setTransferSource(first);
                  setTransferMode("merge");
                  setShowTransfer(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-3.5 py-1.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-700/60 dark:bg-violet-950/20 dark:text-violet-400"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12M8 12h12M8 17h12M3 7h.01M3 12h.01M3 17h.01"/>
                </svg>
                Başka Modelden Aktar
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Veri giriş formu ─────────────────────────────── */}
      {activeModel && (
        <section className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Veri Girişi
            <span className="ml-2 text-xs font-normal text-slate-400">— {activeModel}</span>
          </h2>

          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              {/* Bölüm */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Bölüm</label>
                <div className="relative">
                  <select
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    className="appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {teams.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                </div>
              </div>

              {/* Proses */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Proses</label>
                <div className="relative">
                  <select
                    value={selectedProcess}
                    onChange={(e) => setSelectedProcess(e.target.value)}
                    className="appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {processes.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                </div>
              </div>

              {/* Dk Adet */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-amber-600 dark:text-amber-400">Dk Adet</label>
                <input
                  type="number" min={0} step={0.1}
                  value={dkAdet}
                  onChange={(e) => setDkAdet(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  placeholder="0"
                  className="w-28 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm font-semibold outline-none focus:border-amber-500 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
                />
              </div>

              {/* Önizleme */}
              {dkAdet && Number(dkAdet) > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-center">
                    <p className="text-[10px] font-medium text-sky-600 dark:text-sky-400">Saat Adet</p>
                    <p className="text-sm font-bold text-sky-800 dark:text-sky-300">{Math.round(Number(dkAdet) * 60 * 100) / 100}</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Günlük Adet</p>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{Math.round(Number(dkAdet) * 60 * 9 * 100) / 100}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={handleAdd}
                  className="rounded-xl border border-teal-500 bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Ekle
                </button>
                {isDuplicate && selectedTeam && selectedProcess && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">Bu bölüm + proses zaten ekli</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Kayıtlar tablosu ─────────────────────────────── */}
      {activeModel && rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {activeModel}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {rows.length}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Excel İndir
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
              >
                Tümünü Sil
              </button>
            </div>
          </div>

          {/* Desktop tablo */}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bölüm</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Proses</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Dk Adet</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">Saat Adet</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Günlük Adet</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isEditing = edit.id === row.id;
                  const result = calc(isEditing ? edit.dk : row.dkAdet);
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 dark:border-slate-800 ${
                        isEditing
                          ? "bg-violet-50/60 dark:bg-violet-950/20"
                          : i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/40"
                      }`}
                    >
                      {/* Bölüm */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <div className="relative">
                            <select value={edit.team} onChange={(e) => setEdit((s) => ({ ...s, team: e.target.value, dupError: false }))}
                              className="w-full appearance-none rounded-lg border border-violet-300 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {teams.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-center text-slate-400">
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          </div>
                        ) : (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{row.teamLabel}</span>
                        )}
                      </td>
                      {/* Proses */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <div className="relative">
                            <select value={edit.process} onChange={(e) => setEdit((s) => ({ ...s, process: e.target.value, dupError: false }))}

                              className="w-full appearance-none rounded-lg border border-violet-300 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {processes.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-center text-slate-400">
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          </div>
                        ) : (
                          <span className="font-medium text-slate-800 dark:text-slate-100">{row.processName}</span>
                        )}
                      </td>
                      {/* Dk Adet */}
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number" min={0} step={0.1}
                          value={isEditing ? edit.dk : row.dkAdet}
                          onChange={(e) => isEditing ? setEdit((s) => ({ ...s, dk: e.target.value })) : handleDkChange(row.id, e.target.value)}
                          className={`w-24 rounded-lg border px-2 py-1.5 text-center text-sm font-semibold outline-none ${
                            isEditing
                              ? "border-violet-300 bg-violet-50 focus:border-violet-500 dark:border-violet-700/60 dark:bg-violet-950/30 dark:text-violet-200"
                              : "border-amber-300 bg-amber-50 focus:border-amber-500 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
                          }`}
                        />
                      </td>
                      {/* Saat Adet */}
                      <td className="px-4 py-3 text-center">
                        {result
                          ? <span className="inline-block min-w-[3.5rem] rounded-lg bg-sky-100 px-3 py-1 text-sm font-bold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">{result.saatlik}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      {/* Günlük Adet */}
                      <td className="px-4 py-3 text-center">
                        {result
                          ? <span className="inline-block min-w-[3.5rem] rounded-lg bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">{result.gunluk}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      {/* Aksiyon */}
                      <td className="px-3 py-2 text-center">
                        {isEditing ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex gap-1">
                              <button type="button" onClick={() => saveEdit(row.id)}
                                className="rounded-lg border border-emerald-400 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-300"
                              >Kaydet</button>
                              <button type="button" onClick={cancelEdit}
                                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                              >İptal</button>
                            </div>
                            {edit.dupError && <p className="text-[10px] font-medium text-red-600">Zaten mevcut</p>}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" onClick={() => startEdit(row)}
                              className="rounded-lg border border-violet-200 p-1.5 text-violet-600 hover:bg-violet-50 dark:border-violet-800/50 dark:text-violet-400"
                              title="Düzenle"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button type="button" onClick={() => handleRemove(row.id)}
                              className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400"
                              title="Sil"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobil */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
            {rows.map((row) => {
              const isEditing = edit.id === row.id;
              const result = calc(isEditing ? edit.dk : row.dkAdet);
              return (
                <div key={row.id} className={`p-4 ${isEditing ? "bg-violet-50/50 dark:bg-violet-950/20" : ""}`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <div className="relative">
                            <select value={edit.team} onChange={(e) => setEdit((s) => ({ ...s, team: e.target.value, dupError: false }))}
                              className="w-full appearance-none rounded-lg border border-violet-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 outline-none dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {teams.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400">
                              <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          </div>
                          <div className="relative">
                            <select value={edit.process} onChange={(e) => setEdit((s) => ({ ...s, process: e.target.value, dupError: false }))}

                              className="w-full appearance-none rounded-lg border border-violet-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 outline-none dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {processes.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400">
                              <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="mr-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{row.teamLabel}</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{row.processName}</span>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex gap-1">
                          <button type="button" onClick={() => saveEdit(row.id)}
                            className="rounded-lg border border-emerald-400 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >Kaydet</button>
                          <button type="button" onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                          >İptal</button>
                        </div>
                        {edit.dupError && <p className="text-[10px] font-medium text-red-600">Zaten mevcut</p>}
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => startEdit(row)}
                          className="rounded-lg border border-violet-200 p-1.5 text-violet-600 hover:bg-violet-50"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button type="button" onClick={() => handleRemove(row.id)}
                          className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium text-amber-600">Dk Adet</span>
                      <input type="number" min={0} step={0.1}
                        value={isEditing ? edit.dk : row.dkAdet}
                        onChange={(e) => isEditing ? setEdit((s) => ({ ...s, dk: e.target.value })) : handleDkChange(row.id, e.target.value)}
                        className={`rounded-lg border px-2 py-2 text-center text-sm font-semibold outline-none ${
                          isEditing ? "border-violet-300 bg-violet-50" : "border-amber-300 bg-amber-50"
                        }`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium text-sky-600">Saat Adet</span>
                      <div className="flex items-center justify-center rounded-lg bg-sky-100 px-2 py-2 text-sm font-bold text-sky-800">
                        {result ? result.saatlik : "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium text-emerald-600">Günlük Adet</span>
                      <div className="flex items-center justify-center rounded-lg bg-emerald-100 px-2 py-2 text-sm font-bold text-emerald-800">
                        {result ? result.gunluk : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Aktarma Modalı ───────────────────────────────── */}
      {showTransfer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          onClick={() => setShowTransfer(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Modelden Aktar</h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Seçilen modelin verilerini <strong>{activeModel}</strong> modeline aktarır.
            </p>

            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Kaynak Model</label>
            <div className="relative mb-4">
              <select
                value={transferSource || otherModels[0] || ""}
                onChange={(e) => setTransferSource(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {otherModels.map((m) => (
                  <option key={m} value={m}>
                    {m} {apiModels.find(a => a.modelCode === m)?.productName ? `— ${apiModels.find(a => a.modelCode === m)!.productName}` : ""}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            </div>

            <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-300">Aktarma Modu</label>
            <div className="mb-5 flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <input type="radio" name="tm" value="merge" checked={transferMode === "merge"} onChange={() => setTransferMode("merge")} className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Birleştir</p>
                  <p className="text-xs text-slate-500">Zaten var olan bölüm+proses kombinasyonları atlanır, yeni olanlar eklenir.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <input type="radio" name="tm" value="replace" checked={transferMode === "replace"} onChange={() => setTransferMode("replace")} className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Üstüne Yaz</p>
                  <p className="text-xs text-slate-500">Mevcut {activeModel} verileri silinir, kaynak modelin verileri kopyalanır.</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowTransfer(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
              >İptal</button>
              <button type="button" onClick={handleTransfer}
                className="rounded-xl border border-violet-500 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >Aktar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Formül ───────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">Formül: </span>
        Dk Adet × 60 = Saat Adet &nbsp;·&nbsp; Saat Adet × 9 = Günlük Adet
      </div>
    </main>
  );
}
