"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getProduction, getTeams, getProcesses, getWorkersForAnalytics, getDayProductMeta, setAuthToken } from "@/lib/api";
import type { TeamRow, ProcessRow, DayProductMeta } from "@/lib/api";
import type { ProductionRow } from "@/lib/types";
import type { Worker } from "@/lib/types";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { todayWeekdayIso } from "@/lib/businessCalendar";

/* ─── Sabitler ───────────────────────────────────────────── */
const SESSIONS   = 8;
const SAMPLES    = 7;
const MAX_TOTAL  = SESSIONS * SAMPLES; // 56
const SESSION_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8"];

/* ─── Tipler ─────────────────────────────────────────────── */
type KontrolRow = {
  workerId: number;          // üretim tablosundan gelen → pozitif; elle eklenen → negatif
  name: string;
  process: string;
  team: string;
  hata: number[];
  note: string;
  manual?: boolean;          // elle eklendi mi?
};

type StoredPayload = {
  kontrolData: Record<number, { hata: number[]; note: string }>;
  extraWorkers: { workerId: number; name: string; process: string; team: string }[];
};

type Section = { team: string; rows: KontrolRow[]; startNo: number };

/* ─── localStorage ───────────────────────────────────────── */
function storageKey(date: string) { return `proses_kontrol_v2_${date}`; }

function loadPayload(date: string): StoredPayload {
  try {
    const raw = window.localStorage.getItem(storageKey(date));
    if (!raw) return { kontrolData: {}, extraWorkers: [] };
    return JSON.parse(raw) as StoredPayload;
  } catch { return { kontrolData: {}, extraWorkers: [] }; }
}

function persistPayload(date: string, payload: StoredPayload) {
  try {
    window.localStorage.setItem(storageKey(date), JSON.stringify(payload));
  } catch {}
}

/* ─── Yardımcılar ────────────────────────────────────────── */
function sumArr(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }
function pct(total: number, max = MAX_TOTAL) {
  return max === 0 ? "0.0" : ((total / max) * 100).toFixed(1);
}
let manualIdCounter = -1;

/* ══════════════════════════════════════════════════════════
   Sayfa
══════════════════════════════════════════════════════════ */
export default function ProsesKontrolPage() {
  const router = useRouter();

  const [authorized,    setAuthorized]   = useState(false);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState<string | null>(null);

  const [selectedDate,  setSelectedDate] = useState(todayWeekdayIso);
  const [dayMeta,       setDayMeta]      = useState<DayProductMeta | null>(null);
  const [rows,          setRows]         = useState<KontrolRow[]>([]);

  /* personel ekleme formu */
  const [showAddForm,   setShowAddForm]  = useState(false);
  const [allWorkers,    setAllWorkers]   = useState<Worker[]>([]);
  const [selectedWId,   setSelectedWId]  = useState<number | "">("");
  const [addProcess,    setAddProcess]   = useState("");
  const [addTeam,       setAddTeam]      = useState("");
  const [teams,         setTeams]        = useState<TeamRow[]>([]);
  const [processes,     setProcesses]    = useState<ProcessRow[]>([]);

  /* ── Auth ──────────────────────────────────────────────── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) { router.replace("/"); return; }
    if (!isAdminRole() && !hasPermission("prosesKontrol")) { router.replace("/"); return; }
    setAuthToken(token);
    setAuthorized(true);
    void Promise.all([getTeams(), getProcesses(), getWorkersForAnalytics()]).then(([tms, prcs, wks]) => {
      setTeams(tms);
      setProcesses(prcs);
      setAllWorkers(wks);
      if (tms.length)  setAddTeam(tms[0].code);
      if (prcs.length) setAddProcess(prcs[0].name);
    });
  }, [router]);

  /* ── Veri yükle ────────────────────────────────────────── */
  useEffect(() => {
    if (!authorized) return;
    void loadData(selectedDate);
  }, [selectedDate, authorized]);

  async function loadData(date: string) {
    setLoading(true);
    setError(null);
    try {
      const [production, meta] = await Promise.allSettled([
        getProduction(date),
        getDayProductMeta(date),
      ]);
      setDayMeta(meta.status === "fulfilled" ? meta.value : null);
      const productionRows: ProductionRow[] = production.status === "fulfilled" ? production.value : [];
      const { kontrolData, extraWorkers } = loadPayload(date);

      const fromProduction: KontrolRow[] = productionRows.map((p) => {
        const saved = kontrolData[p.workerId];
        return {
          workerId: p.workerId,
          name:     p.name,
          process:  p.process,
          team:     p.team,
          hata:     saved?.hata?.length === SESSIONS ? saved.hata : Array<number>(SESSIONS).fill(0),
          note:     saved?.note ?? "",
        };
      });

      const manual: KontrolRow[] = (extraWorkers ?? []).map((w) => {
        const saved = kontrolData[w.workerId];
        return {
          ...w,
          hata:   saved?.hata?.length === SESSIONS ? saved.hata : Array<number>(SESSIONS).fill(0),
          note:   saved?.note ?? "",
          manual: true,
        };
      });

      setRows([...fromProduction, ...manual]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  /* ── Kaydet helper ─────────────────────────────────────── */
  function saveRows(nextRows: KontrolRow[]) {
    const kontrolData: Record<number, { hata: number[]; note: string }> = {};
    for (const r of nextRows) kontrolData[r.workerId] = { hata: r.hata, note: r.note };
    const extraWorkers = nextRows
      .filter((r) => r.manual)
      .map(({ workerId, name, process, team }) => ({ workerId, name, process, team }));
    persistPayload(selectedDate, { kontrolData, extraWorkers });
  }

  /* ── Veri güncelle ─────────────────────────────────────── */
  function updateHata(workerId: number, idx: number, raw: string) {
    const v = Math.max(0, Math.min(SAMPLES, isNaN(parseInt(raw, 10)) ? 0 : parseInt(raw, 10)));
    setRows((prev) => {
      const next = prev.map((r) =>
        r.workerId === workerId ? { ...r, hata: r.hata.map((h, i) => (i === idx ? v : h)) } : r
      );
      saveRows(next);
      return next;
    });
  }

  function updateNote(workerId: number, note: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.workerId === workerId ? { ...r, note } : r));
      saveRows(next);
      return next;
    });
  }

  /* ── Personel ekle ─────────────────────────────────────── */
  function handleWorkerSelect(wid: number | "") {
    setSelectedWId(wid);
    if (wid === "") return;
    const w = allWorkers.find((x) => x.id === wid);
    if (w) {
      setAddTeam(w.team);
      setAddProcess(w.process);
    }
  }

  function handleAddWorker() {
    if (selectedWId === "") return;
    const w = allWorkers.find((x) => x.id === selectedWId);
    if (!w) return;
    // Zaten listede var mı?
    if (rows.some((r) => r.name === w.name && r.team === addTeam)) return;
    const newRow: KontrolRow = {
      workerId: manualIdCounter--,
      name:     w.name,
      process:  addProcess || w.process,
      team:     addTeam || w.team,
      hata:     Array<number>(SESSIONS).fill(0),
      note:     "",
      manual:   true,
    };
    setRows((prev) => {
      const next = [...prev, newRow];
      saveRows(next);
      return next;
    });
    setSelectedWId("");
    setShowAddForm(false);
  }

  function handleRemoveWorker(workerId: number) {
    setRows((prev) => {
      const next = prev.filter((r) => r.workerId !== workerId);
      saveRows(next);
      return next;
    });
  }

  /* ── Grupla ────────────────────────────────────────────── */
  const sections: Section[] = (() => {
    const teamOrder = [...new Set(rows.map((r) => r.team))];
    let no = 1;
    return teamOrder.map((team) => {
      const teamRows = rows.filter((r) => r.team === team);
      const s = { team, rows: teamRows, startNo: no };
      no += teamRows.length;
      return s;
    });
  })();

  /* ── Excel ─────────────────────────────────────────────── */
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const urunStr = [dayMeta?.productModel, dayMeta?.productName].filter(Boolean).join(" — ");
    const infoRows = [
      ["Tarih", selectedDate],
      ["Çalışılan Ürün", urunStr || "—"],
      [],
    ];
    const header = [
      "No", "Ad Soyad", "Proses", "Bölüm",
      ...SESSION_LABELS.flatMap((l) => [`${l} K.A`, `${l} H.A`]),
      "Toplam Hata", "% Hata", "Açıklama",
    ];
    const data = rows.map((r, i) => {
      const total = sumArr(r.hata);
      return [
        i + 1, r.name, r.process, r.team,
        ...r.hata.flatMap((h) => [SAMPLES, h]),
        total, pct(total), r.note,
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([...infoRows, header, ...data]);
    ws["!cols"] = [
      { wch: 4 }, { wch: 22 }, { wch: 18 }, { wch: 16 },
      ...Array(SESSIONS * 2).fill({ wch: 7 }),
      { wch: 10 }, { wch: 8 }, { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Proses Kontrol");
    XLSX.writeFile(wb, `proses-kontrol-${selectedDate}.xlsx`);
  }

  /* ══ Render ════════════════════════════════════════════════ */
  if (!authorized) return null;

  const teamLabel = (code: string) => teams.find((t) => t.code === code)?.name ?? code;

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5">

      {/* ─── Üst Bar ─────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3">
        {/* Birinci satır: başlık + Excel */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Proses Kontrol</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {SESSIONS} tur · {SAMPLES} numune/tur · max {MAX_TOTAL} hata
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/hata-rapor"
              className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              Hata Rapor
            </Link>
            <button
              type="button"
              onClick={exportExcel}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/>
              </svg>
              Excel İndir
            </button>
          </div>
        </div>

        {/* İkinci satır: Tarih · Ürün · Personel Ekle */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
          {/* Tarih */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Tarih
            </label>
            <WeekdayDatePicker value={selectedDate} onChange={setSelectedDate} />
          </div>

          {/* Çalışılan Ürün — API'den otomatik */}
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Çalışılan Ürün
            </label>
            <div className="flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
              {dayMeta?.productModel || dayMeta?.productName ? (
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {[dayMeta.productModel, dayMeta.productName].filter(Boolean).join(" — ")}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">Ana sayfadan ürün seçilmemiş</span>
              )}
            </div>
          </div>

          {/* Personel Ekle butonu */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-transparent dark:text-transparent select-none">
              &nbsp;
            </label>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                showAddForm
                  ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700"
                  : "border-violet-300 bg-white text-violet-700 hover:bg-violet-50 dark:border-violet-700/60 dark:bg-slate-800 dark:text-violet-300 dark:hover:bg-violet-950/30"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14"/>
              </svg>
              Personel Ekle
            </button>
          </div>
        </div>

        {/* Personel Ekle Formu */}
        {showAddForm && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/20">
            {/* Personel Seç */}
            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                Personel
              </label>
              <div className="relative">
                <select
                  value={selectedWId}
                  onChange={(e) => handleWorkerSelect(e.target.value === "" ? "" : Number(e.target.value))}
                  autoFocus
                  className="w-full appearance-none rounded-xl border border-violet-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-violet-500"
                >
                  <option value="">— Personel seçin —</option>
                  {allWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </div>
            </div>

            {/* Bölüm — personel seçilince otomatik dolar, değiştirilebilir */}
            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                Bölüm
              </label>
              <div className="relative">
                <select
                  value={addTeam}
                  onChange={(e) => setAddTeam(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-violet-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-violet-500"
                >
                  {teams.map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </div>
            </div>

            {/* Proses — personel seçilince otomatik dolar, değiştirilebilir */}
            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                Proses
              </label>
              <div className="relative">
                <select
                  value={addProcess}
                  onChange={(e) => setAddProcess(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-violet-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-violet-500"
                >
                  {processes.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </div>
            </div>

            {/* Butonlar */}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleAddWorker}
                disabled={selectedWId === ""}
                className="rounded-xl border border-violet-500 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ekle
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setSelectedWId(""); }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                İptal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Hata / Yükleniyor ───────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500 dark:text-slate-400">
          Yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-slate-500 dark:text-slate-400">
          <p>Bu tarihte üretim kaydı bulunamadı.</p>
          <p className="text-xs">Personel eklemek için yukarıdaki "Personel Ekle" butonunu kullanabilirsiniz.</p>
        </div>
      ) : (
        /* ─── Tablo ──────────────────────────────────────── */
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth: 1400 }}>
              <colgroup>
                <col style={{ width: 36 }} />   {/* No */}
                <col style={{ width: 170 }} />  {/* Ad Soyad */}
                <col style={{ width: 140 }} />  {/* Proses */}
                {Array(SESSIONS).fill(null).flatMap((_, i) => [
                  <col key={`k${i}`} style={{ width: 34 }} />,
                  <col key={`h${i}`} style={{ width: 54 }} />,
                ])}
                <col style={{ width: 58 }} />   {/* Toplam */}
                <col style={{ width: 56 }} />   {/* % */}
                <col style={{ width: 175 }} />  {/* Açıklama */}
                <col style={{ width: 32 }} />   {/* Sil */}
              </colgroup>

              {/* ── Başlık ──────────────────────────────── */}
              <thead>
                {/* Üst satır */}
                <tr className="bg-slate-800 text-white">
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2.5 text-center font-bold">No</th>
                  <th rowSpan={2} className="border-r border-slate-700 px-3 py-2.5 text-left font-bold">Ad Soyad</th>
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2.5 text-left font-bold">Proses</th>
                  {SESSION_LABELS.map((l) => (
                    <th key={l} colSpan={2} className="border-r border-slate-700 px-1 py-1.5 text-center font-bold">{l}</th>
                  ))}
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2.5 text-center font-bold">Toplam</th>
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2.5 text-center font-bold">%</th>
                  <th rowSpan={2} className="border-r border-slate-700 px-2 py-2.5 text-left font-bold">Açıklama</th>
                  <th rowSpan={2} className="px-1 py-2.5" />
                </tr>
                {/* Alt satır: K.A / H.A */}
                <tr className="bg-slate-700 text-slate-200">
                  {Array(SESSIONS).fill(null).map((_, i) => (
                    <>
                      <th key={`ka${i}`} className="border-r border-slate-600 px-1 py-1 text-center text-[10px] font-medium text-slate-400">
                        K.A
                      </th>
                      <th key={`ha${i}`} className="border-r border-slate-600 px-1 py-1 text-center text-[10px] font-bold text-amber-300">
                        H.A
                      </th>
                    </>
                  ))}
                </tr>
              </thead>

              {/* ── Gövde ───────────────────────────────── */}
              <tbody>
                {sections.map(({ team, rows: teamRows, startNo }) => (
                  <>
                    <tr key={`team-${team}`}>
                      <td
                        colSpan={3 + SESSIONS * 2 + 4}
                        className="bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                      >
                        {teamLabel(team)}
                      </td>
                    </tr>

                    {teamRows.map((row, idx) => {
                      const total = sumArr(row.hata);
                      const p     = pct(total);
                      const pNum  = parseFloat(p);
                      const pColor =
                        pNum === 0   ? "text-emerald-600 font-bold" :
                        pNum < 10    ? "text-amber-600 font-bold" :
                                       "text-red-600 font-bold";

                      return (
                        <tr
                          key={row.workerId}
                          className={`border-b border-slate-200 align-middle transition-colors ${
                            row.manual ? "bg-violet-50/50" : "hover:bg-slate-50"
                          }`}
                        >
                          {/* No */}
                          <td className="border-r border-slate-200 px-1 py-2 text-center tabular-nums text-slate-600">
                            {startNo + idx}
                          </td>
                          {/* Ad Soyad */}
                          <td className="border-r border-slate-200 px-2 py-2 font-medium text-slate-900">
                            {row.name}
                            {row.manual && (
                              <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold text-violet-600">EL</span>
                            )}
                          </td>
                          {/* Proses */}
                          <td className="border-r border-slate-200 px-2 py-2 text-slate-600">
                            {row.process}
                          </td>

                          {/* 8 tur: K.A (sabit) + H.A (giriş) */}
                          {row.hata.map((h, i) => (
                            <>
                              {/* K.A — sabit numune sayısı */}
                              <td
                                key={`ka-${row.workerId}-${i}`}
                                className="border-r border-slate-200 bg-slate-50 px-1 py-2 text-center text-slate-400 tabular-nums"
                              >
                                {SAMPLES}
                              </td>
                              {/* H.A — hata girişi */}
                              <td
                                key={`ha-${row.workerId}-${i}`}
                                className="border-r border-slate-200 px-1 py-1"
                              >
                                <input
                                  type="number"
                                  min={0}
                                  max={SAMPLES}
                                  value={h === 0 ? "" : h}
                                  placeholder="0"
                                  onChange={(e) => updateHata(row.workerId, i, e.target.value)}
                                  onBlur={(e) => { if (e.target.value === "") updateHata(row.workerId, i, "0"); }}
                                  className={`w-full rounded border py-1.5 text-center text-sm font-semibold tabular-nums outline-none transition
                                    ${h > 0
                                      ? "border-rose-200 bg-rose-50 text-rose-600 focus:border-rose-400"
                                      : "border-slate-300 bg-white text-slate-400 focus:border-blue-500"
                                    }`}
                                />
                              </td>
                            </>
                          ))}

                          {/* Toplam */}
                          <td className={`border-r border-slate-200 px-2 py-2 text-center text-sm tabular-nums ${pColor}`}>
                            {total}
                          </td>
                          {/* % */}
                          <td className={`border-r border-slate-200 px-2 py-2 text-center text-sm tabular-nums ${pColor}`}>
                            %{p}
                          </td>
                          {/* Açıklama */}
                          <td className="border-r border-slate-200 px-2 py-1">
                            <input
                              type="text"
                              value={row.note}
                              onChange={(e) => updateNote(row.workerId, e.target.value)}
                              placeholder="—"
                              className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-slate-600 outline-none placeholder:text-slate-300 focus:border-slate-300 focus:bg-white"
                            />
                          </td>
                          {/* Sil */}
                          <td className="px-1 py-1 text-center">
                            {row.manual ? (
                              <button
                                type="button"
                                title="Listeden kaldır"
                                onClick={() => handleRemoveWorker(row.workerId)}
                                className="flex h-5 w-5 items-center justify-center rounded text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>

              {/* ── Toplam Satırı ────────────────────────── */}
              {rows.length > 0 && (() => {
                const grandTotal = rows.reduce((acc, r) => acc + sumArr(r.hata), 0);
                const grandMax   = rows.length * MAX_TOTAL;
                const grandPct   = grandMax > 0 ? ((grandTotal / grandMax) * 100).toFixed(1) : "0.0";
                const sessionTotals = Array(SESSIONS).fill(0).map((_, i) =>
                  rows.reduce((acc, r) => acc + r.hata[i], 0)
                );
                return (
                  <tfoot>
                    <tr className="bg-slate-800 text-white">
                      <td colSpan={3} className="px-3 py-2.5 text-sm font-bold">TOPLAM</td>
                      {sessionTotals.map((t, i) => (
                        <>
                          <td key={`tka-${i}`} className="border-r border-slate-700 py-2.5 text-center text-xs text-slate-400">
                            {rows.length * SAMPLES}
                          </td>
                          <td key={`tha-${i}`} className="border-r border-slate-700 py-2.5 text-center text-sm font-bold">
                            {t > 0 ? <span className="text-amber-300">{t}</span> : <span className="text-slate-500">0</span>}
                          </td>
                        </>
                      ))}
                      <td className="border-r border-slate-700 px-2 py-2.5 text-center text-sm font-bold text-amber-300">{grandTotal}</td>
                      <td className="border-r border-slate-700 px-2 py-2.5 text-center text-sm font-bold text-amber-300">%{grandPct}</td>
                      <td className="px-2 py-2.5" />
                      <td className="px-1 py-2.5" />
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
