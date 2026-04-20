"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getProcesses, getTeams, setAuthToken } from "@/lib/api";
import type { ProcessRow, TeamRow } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import { setProsesMap } from "@/lib/prosesVeri";

const ROWS_STORAGE_KEY = "proses_veri_rows_v1";

type Row = {
  id: number;
  teamCode: string;
  teamLabel: string;
  processName: string;
  dkAdet: string;
};

function calc(dkAdet: string) {
  const dk = Number(dkAdet);
  if (!dkAdet || isNaN(dk) || dk <= 0) return null;
  return { saatlik: Math.round(dk * 60 * 100) / 100, gunluk: Math.round(dk * 60 * 9 * 100) / 100 };
}

let nextId = 1;

function saveRows(rows: Row[]) {
  try {
    window.localStorage.setItem(ROWS_STORAGE_KEY, JSON.stringify(rows));
  } catch { /* quota */ }
}

function loadRows(): Row[] {
  try {
    const raw = window.localStorage.getItem(ROWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Row[];
    if (!Array.isArray(parsed)) return [];
    // nextId'yi yüklenen satırlara göre ayarla
    const maxId = parsed.reduce((m, r) => Math.max(m, r.id ?? 0), 0);
    if (maxId >= nextId) nextId = maxId + 1;
    return parsed;
  } catch {
    return [];
  }
}

export default function VeriSayfasiPage() {
  const router = useRouter();
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedProcess, setSelectedProcess] = useState("");
  const [dkAdet, setDkAdet] = useState("");

  const [rows, setRows] = useState<Row[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTeam, setEditTeam] = useState("");
  const [editProcess, setEditProcess] = useState("");
  const [editDk, setEditDk] = useState("");
  const [editDupError, setEditDupError] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!hasPermission("veriSayfasi") && !isAdminRole()) {
      router.replace("/");
      return;
    }
    setAuthorized(true);
    setAuthToken(token);
    // Kaydedilmiş satırları geri yükle
    const saved = loadRows();
    if (saved.length > 0) setRows(saved);
    void Promise.all([getProcesses(), getTeams()])
      .then(([procs, tms]) => {
        setProcesses(procs);
        setTeams(tms);
        if (tms.length) setSelectedTeam(tms[0].code);
        if (procs.length) setSelectedProcess(procs[0].name);
      })
      .finally(() => setLoading(false));
  }, [router]);

  /** Rows değiştiğinde hem rows'u hem proses dk haritasını localStorage'a yaz */
  function syncToStorage(nextRows: Row[]) {
    saveRows(nextRows);
    const map: Record<string, string> = {};
    for (const row of nextRows) {
      if (row.dkAdet && Number(row.dkAdet) > 0) {
        map[row.processName] = row.dkAdet;
      }
    }
    setProsesMap(map);
  }

  const isDuplicate = rows.some(
    (r) => r.teamCode === selectedTeam && r.processName === selectedProcess
  );

  function handleAdd() {
    if (!selectedTeam || !selectedProcess || !dkAdet || isDuplicate) return;
    const team = teams.find((t) => t.code === selectedTeam);
    const next = [
      ...rows,
      {
        id: nextId++,
        teamCode: selectedTeam,
        teamLabel: team?.label ?? selectedTeam,
        processName: selectedProcess,
        dkAdet,
      },
    ];
    setRows(next);
    syncToStorage(next);
    setDkAdet("");
  }

  function handleRemove(id: number) {
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    syncToStorage(next);
  }

  function handleDkChange(id: number, value: string) {
    const next = rows.map((r) => (r.id === id ? { ...r, dkAdet: value } : r));
    setRows(next);
    syncToStorage(next);
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setEditTeam(row.teamCode);
    setEditProcess(row.processName);
    setEditDk(row.dkAdet);
    setEditDupError(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTeam("");
    setEditProcess("");
    setEditDk("");
    setEditDupError(false);
  }

  function saveEdit(id: number) {
    const dupInOtherRows = rows.some(
      (r) => r.id !== id && r.teamCode === editTeam && r.processName === editProcess
    );
    if (dupInOtherRows) {
      setEditDupError(true);
      return;
    }
    const team = teams.find((t) => t.code === editTeam);
    const next = rows.map((r) =>
      r.id === id
        ? { ...r, teamCode: editTeam, teamLabel: team?.label ?? editTeam, processName: editProcess, dkAdet: editDk }
        : r
    );
    setRows(next);
    syncToStorage(next);
    cancelEdit();
  }

  function handleClear() {
    if (rows.length === 0) return;
    if (!window.confirm("Tüm satırlar silinsin mi?")) return;
    setRows([]);
    saveRows([]);
    setProsesMap({});
  }

  function handleExport() {
    if (rows.length === 0) return;

    const aoa: (string | number)[][] = [];
    aoa.push(["Yeşil İmaj Tekstil — Proses Veri Sayfası"]);
    aoa.push(["Dışa aktarım", new Date().toLocaleString("tr-TR")]);
    aoa.push([]);
    aoa.push(["Bölüm", "Proses", "Dk Adet", "Saat Adet", "Günlük Adet"]);

    for (const row of rows) {
      const result = calc(row.dkAdet);
      aoa.push([
        row.teamLabel,
        row.processName,
        Number(row.dkAdet) || 0,
        result ? result.saatlik : 0,
        result ? result.gunluk : 0,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws["!cols"] = [{ wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    ws["!rows"] = [{ hpt: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proses Verileri");
    XLSX.writeFile(wb, `proses-veri-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const canAdd = Boolean(selectedTeam && selectedProcess && dkAdet && Number(dkAdet) > 0 && !isDuplicate);

  if (!authorized) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 pb-12 md:p-8">

      {/* Üst bar */}
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

      {/* Veri giriş formu */}
      <section className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
          Veri Girişi
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
                  className="rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  {teams.map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
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
                  className="rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  {processes.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
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
                type="number"
                min={0}
                step={0.1}
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

            {/* Ekle butonu */}
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
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  Bu bölüm + proses zaten ekli
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Kayıtlar tablosu */}
      {rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Girilen Veriler
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
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Tümünü sil
              </button>
            </div>
          </div>

          {/* Desktop */}
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
                  const isEditing = editingId === row.id;
                  const result = calc(isEditing ? editDk : row.dkAdet);
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
                            <select
                              value={editTeam}
                              onChange={(e) => { setEditTeam(e.target.value); setEditDupError(false); }}
                              className="w-full rounded-lg border border-violet-300 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {teams.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-center text-slate-400">
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          </div>
                        ) : (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            {row.teamLabel}
                          </span>
                        )}
                      </td>
                      {/* Proses */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <div className="relative">
                            <select
                              value={editProcess}
                              onChange={(e) => { setEditProcess(e.target.value); setEditDupError(false); }}
                              className="w-full rounded-lg border border-violet-300 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
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
                          type="number"
                          min={0}
                          step={0.1}
                          value={isEditing ? editDk : row.dkAdet}
                          onChange={(e) => isEditing ? setEditDk(e.target.value) : handleDkChange(row.id, e.target.value)}
                          className={`w-24 rounded-lg border px-2 py-1.5 text-center text-sm font-semibold outline-none ${
                            isEditing
                              ? "border-violet-300 bg-violet-50 focus:border-violet-500 dark:border-violet-700/60 dark:bg-violet-950/30 dark:text-violet-200"
                              : "border-amber-300 bg-amber-50 focus:border-amber-500 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
                          }`}
                        />
                      </td>
                      {/* Saat Adet */}
                      <td className="px-4 py-3 text-center">
                        {result ? (
                          <span className="inline-block min-w-[3.5rem] rounded-lg bg-sky-100 px-3 py-1 text-sm font-bold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                            {result.saatlik}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      {/* Günlük Adet */}
                      <td className="px-4 py-3 text-center">
                        {result ? (
                          <span className="inline-block min-w-[3.5rem] rounded-lg bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                            {result.gunluk}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      {/* Aksiyon */}
                      <td className="px-3 py-2 text-center">
                        {isEditing ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => saveEdit(row.id)}
                                className="rounded-lg border border-emerald-400 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                              >Kaydet</button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                              >İptal</button>
                            </div>
                            {editDupError && (
                              <p className="text-[10px] font-medium text-red-600 dark:text-red-400">Zaten mevcut</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="rounded-lg border border-violet-200 p-1.5 text-violet-600 transition hover:bg-violet-50 dark:border-violet-800/50 dark:text-violet-400 dark:hover:bg-violet-950/30"
                              title="Düzenle"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(row.id)}
                              className="rounded-lg border border-red-200 p-1.5 text-red-500 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
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
              const isEditing = editingId === row.id;
              const result = calc(isEditing ? editDk : row.dkAdet);
              return (
                <div key={row.id} className={`p-4 ${isEditing ? "bg-violet-50/50 dark:bg-violet-950/20" : ""}`}>
                  {/* Başlık satırı */}
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <div className="relative">
                            <select
                              value={editTeam}
                              onChange={(e) => { setEditTeam(e.target.value); setEditDupError(false); }}
                              className="w-full rounded-lg border border-violet-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {teams.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400">
                              <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          </div>
                          <div className="relative">
                            <select
                              value={editProcess}
                              onChange={(e) => { setEditProcess(e.target.value); setEditDupError(false); }}
                              className="w-full rounded-lg border border-violet-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-violet-700/60 dark:bg-slate-800 dark:text-slate-100"
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
                          <span className="mr-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {row.teamLabel}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{row.processName}</span>
                        </div>
                      )}
                    </div>
                    {/* Aksiyon butonları */}
                    {isEditing ? (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex gap-1">
                          <button type="button" onClick={() => saveEdit(row.id)}
                            className="rounded-lg border border-emerald-400 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-300"
                          >Kaydet</button>
                          <button type="button" onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                          >İptal</button>
                        </div>
                        {editDupError && (
                          <p className="text-[10px] font-medium text-red-600 dark:text-red-400">Zaten mevcut</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-1">
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
                  </div>

                  {/* Adet grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium text-amber-600 dark:text-amber-400">Dk Adet</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={isEditing ? editDk : row.dkAdet}
                        onChange={(e) => isEditing ? setEditDk(e.target.value) : handleDkChange(row.id, e.target.value)}
                        className={`rounded-lg border px-2 py-2 text-center text-sm font-semibold outline-none ${
                          isEditing
                            ? "border-violet-300 bg-violet-50 focus:border-violet-500 dark:border-violet-700/60 dark:bg-violet-950/30 dark:text-violet-200"
                            : "border-amber-300 bg-amber-50 focus:border-amber-500 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
                        }`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium text-sky-600 dark:text-sky-400">Saat Adet</span>
                      <div className="flex items-center justify-center rounded-lg bg-sky-100 px-2 py-2 text-sm font-bold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                        {result ? result.saatlik : "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">Günlük Adet</span>
                      <div className="flex items-center justify-center rounded-lg bg-emerald-100 px-2 py-2 text-sm font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
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

      {/* Formül */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">Formül: </span>
        Dk Adet × 60 = Saat Adet &nbsp;·&nbsp; Saat Adet × 9 = Günlük Adet
      </div>
    </main>
  );
}
