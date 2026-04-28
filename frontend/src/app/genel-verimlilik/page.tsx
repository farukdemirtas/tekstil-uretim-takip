"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getProcesses, getTeams, setAuthToken, getProsesVeriRowsFromServer, saveProsesVeriRowsToServer } from "@/lib/api";
import type { ProcessRow, TeamRow } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import {
  makeProsesKey,
  setGenelVerimlilikMap,
  rowsKeyGenel,
  replaceLocalGenelCacheFromServerRows,
  GENEL_VERIMLILIK_MODEL_CODE,
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

function saveGenelRowsLocal(rows: Row[]) {
  try {
    window.localStorage.setItem(rowsKeyGenel(), JSON.stringify(rows));
  } catch {
    /* quota */
  }
}

function loadGenelRowsLocal(): Row[] {
  try {
    const raw = window.localStorage.getItem(rowsKeyGenel());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Row[];
    if (!Array.isArray(parsed)) return [];
    const maxId = parsed.reduce((m, r) => Math.max(m, r.id ?? 0), 0);
    if (maxId >= nextId) nextId = maxId + 1;
    return parsed;
  } catch {
    return [];
  }
}

/* ════════════════════════════════════════════════════════════
   Sayfa
════════════════════════════════════════════════════════════ */
export default function GenelVerimlilikPage() {
  const router = useRouter();

  /* auth */
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  /* api */
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);

  const [rows, setRows] = useState<Row[]>([]);

  /* veri giriş formu */
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedProcess, setSelectedProcess] = useState("");
  const [dkAdet, setDkAdet] = useState("");

  /* satır düzenleme — tek atomik obje */
  const [edit, setEdit] = useState<EditState>(EDIT_RESET);

  /* ── Sunucudan yükle (API + localStorage fallback) ── */
  async function loadGenelRowsFromServer(): Promise<Row[]> {
    try {
      const serverRows = await getProsesVeriRowsFromServer(GENEL_VERIMLILIK_MODEL_CODE);
      if (serverRows.length > 0) {
        replaceLocalGenelCacheFromServerRows(serverRows);
        return serverRows;
      }
      const localRows = loadGenelRowsLocal();
      if (localRows.length > 0) {
        saveProsesVeriRowsToServer(GENEL_VERIMLILIK_MODEL_CODE, localRows).catch(() => {});
      }
      return localRows;
    } catch {
      return loadGenelRowsLocal();
    }
  }

  /* ── Auth & Init — sadece ilk mount'ta çalışır ────────── */
  const routerRef = useRef(router);
  useEffect(() => {
    const r = routerRef.current;
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      r.replace("/");
      return;
    }
    if (!hasPermission("veriSayfasi") && !isAdminRole()) {
      r.replace("/");
      return;
    }
    setAuthorized(true);
    setAuthToken(token);

    void Promise.all([getProcesses(), getTeams()])
      .then(async ([procs, tms]) => {
        setProcesses(procs);
        setTeams(tms);
        if (tms.length) setSelectedTeam(tms[0].code);
        if (procs.length) setSelectedProcess(procs[0].name);
        const loaded = await loadGenelRowsFromServer();
        setRows(loaded);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Storage sync — localStorage + sunucu (canlı verimlilik haritası) ── */
  function syncToStorage(nextRows: Row[]) {
    saveGenelRowsLocal(nextRows);
    const map: Record<string, string> = {};
    for (const row of nextRows) {
      if (row.dkAdet && Number(row.dkAdet) > 0) {
        map[makeProsesKey(row.teamCode, row.processName)] = row.dkAdet;
      }
    }
    setGenelVerimlilikMap(map);
    saveProsesVeriRowsToServer(GENEL_VERIMLILIK_MODEL_CODE, nextRows).catch(() => {});
  }

  /* ── Satır işlemleri ────────────────────────────────────── */
  const isDuplicate = rows.some(
    (r) => r.teamCode === selectedTeam && r.processName === selectedProcess
  );

  function handleAdd() {
    if (!selectedTeam || !selectedProcess || !dkAdet || isDuplicate) return;
    const team = teams.find((t) => t.code === selectedTeam);
    const next = [
      ...rows,
      { id: nextId++, teamCode: selectedTeam, teamLabel: team?.label ?? selectedTeam, processName: selectedProcess, dkAdet },
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
    setRows(next);
    syncToStorage(next);
    setEdit(EDIT_RESET);
  }

  function handleClear() {
    if (rows.length === 0) return;
    if (!window.confirm("Genel verimlilik tablosundaki tüm satırlar silinsin mi?")) return;
    setRows([]);
    syncToStorage([]);
  }

  /* ── Excel import ───────────────────────────────────────── */
  const importFileRef = useRef<HTMLInputElement>(null);

  function handleImportClick() {
    importFileRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      // input'u sıfırla — onload içinde yapıyoruz ki dosya referansı kaybolmasın
      e.target.value = "";
      try {
        const bstr = ev.target!.result as string;
        const wb   = XLSX.read(bstr, { type: "binary" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const aoa  = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });

        // Satır yapısı: 0=başlık, 1=tarih, 2=boş, 3=sütun adları, 4+=veri
        // Ama satır sayısına göre esnek davranalım: ilk sütunu "Bölüm" olan satırı bul
        let startIdx = 4;
        for (let i = 0; i < Math.min(aoa.length, 10); i++) {
          const cell = String(aoa[i]?.[0] ?? "").trim().toLowerCase();
          if (cell === "bölüm" || cell === "bolum") { startIdx = i + 1; break; }
        }

        const dataRows = aoa.slice(startIdx).filter((r) => r && r.length >= 2 && String(r[0] ?? "").trim());

        if (dataRows.length === 0) {
          alert("Excel'de veri satırı bulunamadı. Dosyanın doğru formatta olduğundan emin olun.");
          return;
        }

        const snapshot = rows;
        const existing = new Set(snapshot.map((r) => makeProsesKey(r.teamCode, r.processName)));
        const toAdd: Row[] = [];

        for (const row of dataRows) {
          const teamLabelRaw = String(row[0] ?? "").trim();
          const processName  = String(row[1] ?? "").trim();
          const dkRaw        = row[2];
          const dkAdet       = String(dkRaw ?? "").replace(",", ".");

          if (!teamLabelRaw || !processName) continue;

          // teamLabel → teamCode eşleştir (bulunamazsa label'ı kod olarak kullan)
          const matched  = teams.find((t) => t.label.trim().toLowerCase() === teamLabelRaw.toLowerCase());
          const teamCode  = matched?.code  ?? teamLabelRaw;
          const teamLabel = matched?.label ?? teamLabelRaw;

          const key = makeProsesKey(teamCode, processName);
          if (existing.has(key)) continue;

          existing.add(key);
          toAdd.push({ id: nextId++, teamCode, teamLabel, processName, dkAdet });
        }

        const skipped = dataRows.filter((r) => r && r.length >= 2 && String(r[0] ?? "").trim()).length - toAdd.length;
        const next = [...snapshot, ...toAdd];
        syncToStorage(next);
        setRows(next);

        if (toAdd.length === 0) {
          alert(`Eklenecek yeni satır yok — ${skipped} satır zaten mevcut.`);
        } else {
          alert(`İçe aktarma tamamlandı: ${toAdd.length} satır eklendi${skipped > 0 ? `, ${skipped} satır zaten mevcuttu` : ""}.`);
        }
      } catch (err) {
        console.error("[Excel Yükle] hata:", err);
        alert("Excel dosyası okunamadı. Geçerli bir Proses Veri Excel dosyası seçin.");
      }
    };
    reader.readAsBinaryString(file);
  }

  /* ── Excel export ───────────────────────────────────────── */
  function handleExport() {
    if (rows.length === 0) return;
    const aoa: (string | number)[][] = [
      ["Genel verimlilik hedefleri"],
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
    XLSX.writeFile(wb, `genel-verimlilik-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const canAdd = Boolean(selectedTeam && selectedProcess && dkAdet && Number(dkAdet) > 0 && !isDuplicate);

  if (!authorized) return null;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-4 pb-12 md:p-8">

      {/* ── Üst bar ──────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Genel verimlilik hedefleri
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Buradaki Dk adetleri ana üretim ekranı, TV verimliliği ve ortalamalar için kullanılır (ürün modelinden bağımsız).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/veri-sayfasi"
            className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Model arşivi
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← Ana Sayfa
          </Link>
        </div>
      </section>

      {/* ── Açıklama ── */}
      <section className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/90 to-white px-5 py-4 shadow-sm dark:border-indigo-800/50 dark:from-indigo-950/40 dark:to-slate-900">
        <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
          Bu ekran ne işe yarar?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Her <strong className="font-medium text-slate-800 dark:text-slate-200">bölüm + proses</strong> için{" "}
          <strong className="font-medium text-amber-700 dark:text-amber-400">Dk Adet</strong> girersiniz;{" "}
          <strong className="font-medium text-sky-700 dark:text-sky-400">Saat Adet</strong> (= Dk×60) ve{" "}
          <strong className="font-medium text-emerald-700 dark:text-emerald-400">Günlük Adet</strong> (= ×9) otomatik hesaplanır.
          Ana sayfadaki personel tablosu bu tek haritadan dk / saat / günlük hedefleri okur; EKRAN1 verimlilik şeritleri de aynı veriyi kullanır.
        </p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
          <strong className="font-medium text-slate-700 dark:text-slate-300">Proses Veri Sayfası</strong>ndaki ürün modelleri yalnızca şablon / yedek saklama içindir; canlı hesap bu sayfadaki girişlere bağlıdır.
        </p>
      </section>

      {/* ── Veri giriş formu ─────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Veri girişi
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

      {/* ── Kayıtlar tablosu ─────────────────────────────── */}
      {rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Kayıtlı hedefler
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {rows.length}
              </span>
            </span>
            <div className="flex items-center gap-2">
              {/* Gizli file input */}
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportFile}
              />
              <button
                type="button"
                onClick={handleImportClick}
                className="flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950/30 dark:text-sky-300"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4 4l4-4m0 0l4 4m-4-4V4" />
                </svg>
                Excel Yükle
              </button>
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

      {/* ── Formül ───────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">Formül: </span>
        Dk Adet × 60 = Saat Adet &nbsp;·&nbsp; Saat Adet × 9 = Günlük Adet
      </div>
    </main>
  );
}
