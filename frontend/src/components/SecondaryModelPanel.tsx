"use client";

/**
 * İkinci Model Giriş Paneli
 * Aynı günde birden fazla model üretimi yapıldığında her personelin
 * ikinci model için üretimini girmesini sağlar.
 *
 * - Yalnızca ikinci modele eklenmiş personeli gösterir
 * - "Personel Ekle" butonu birincil modelden kolayca personel aktarımı sağlar
 * - × butonu ile personeli ikinci modelden kaldırabilirsiniz
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSecondaryDayMeta,
  setSecondaryDayMeta,
  getSecondaryProduction,
  saveSecondaryProduction,
  saveSecondaryEkSayim,
  saveSecondaryNote,
  addWorkerToSecondary,
  removeWorkerFromSecondary,
  listProductModels,
  getTeams,
  getProcesses,
  updateWorker,
  type ProductModelListItem,
  type SecondaryDayMeta,
} from "@/lib/api";
import { ProductionRow } from "@/lib/types";
import { NEW_SLOT_DEFS, sumProductionRow } from "@/lib/productionSlots";

const DEBOUNCE_MS = 350;

function cellVal(n: number): string {
  return n === 0 ? "" : String(n);
}

function groupByTeam(rows: ProductionRow[]): { team: string; rows: ProductionRow[] }[] {
  const map = new Map<string, ProductionRow[]>();
  for (const r of rows) {
    const arr = map.get(r.team) ?? [];
    arr.push(r);
    map.set(r.team, arr);
  }
  return Array.from(map.entries()).map(([team, rows]) => ({ team, rows }));
}

// ─── Personel Ekleme Picker ────────────────────────────────────────────────

type WorkerPickerProps = {
  primaryRows: ProductionRow[];
  secondaryWorkerIds: Set<number>;
  onAdd: (worker: ProductionRow) => Promise<void>;
  onClose: () => void;
  busy: Set<number>;
};

function WorkerPicker({ primaryRows, secondaryWorkerIds, onAdd, onClose, busy }: WorkerPickerProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const groups = useMemo(() => {
    const filtered = primaryRows.filter((r) => {
      if (r.absentForDay) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.team.toLowerCase().includes(q) || r.process.toLowerCase().includes(q);
    });
    return groupByTeam(filtered);
  }, [primaryRows, search]);

  const totalFiltered = groups.reduce((s, g) => s + g.rows.length, 0);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <div className="flex h-[min(600px,85vh)] w-full max-w-md flex-col rounded-2xl border-2 border-violet-300 bg-white shadow-2xl dark:border-violet-700 dark:bg-slate-900">
        {/* Başlık */}
        <div className="flex shrink-0 items-center justify-between border-b border-violet-100 px-5 py-3.5 dark:border-violet-800">
          <div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
              Personel Ekle — İkinci Model
            </h3>
            <p className="text-[11px] text-slate-500">
              Birinci modelden personel seçin. Zaten eklenenler yeşil gösterilir.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Arama */}
        <div className="shrink-0 px-5 py-2.5">
          <div className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-300/30 dark:border-slate-700 dark:bg-slate-800">
            <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim, grup veya proses ara…"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Liste */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {totalFiltered === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Eşleşen personel yok</p>
          ) : (
            groups.map(({ team, rows: teamRows }) => (
              <div key={team} className="mb-2">
                <p className="sticky top-0 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-violet-600 dark:bg-slate-900 dark:text-violet-400">
                  {team}
                </p>
                {teamRows.map((w) => {
                  const inSecondary = secondaryWorkerIds.has(w.workerId);
                  const isBusy = busy.has(w.workerId);
                  return (
                    <button
                      key={w.workerId}
                      type="button"
                      disabled={isBusy}
                      onClick={() => !inSecondary && void onAdd(w)}
                      className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                        inSecondary
                          ? "border border-emerald-200 bg-emerald-50 cursor-default dark:border-emerald-800 dark:bg-emerald-950/30"
                          : "border border-slate-200 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:hover:border-violet-600 dark:hover:bg-violet-950/30"
                      } ${isBusy ? "opacity-60" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${inSecondary ? "text-emerald-800 dark:text-emerald-300" : "text-slate-800 dark:text-slate-200"}`}>
                          {w.name}
                        </p>
                        {w.process && (
                          <p className="text-[10px] text-slate-400">{w.process}</p>
                        )}
                      </div>
                      <span className="ml-2 shrink-0">
                        {isBusy ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                        ) : inSecondary ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900 dark:text-violet-300">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border-2 border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ana bileşen ───────────────────────────────────────────────────────────

type Props = {
  selectedDate: string;
  primaryModelId: number | null;
  /** Ana modelin personel listesi — personel picker için kullanılır */
  primaryRows: ProductionRow[];
  /** İkinci model satırları değiştiğinde üst bileşeni bilgilendirir */
  onRowsChange?: (rows: ProductionRow[]) => void;
  /** İkinci model adı değiştiğinde üst bileşeni bilgilendirir */
  onModelLabelChange?: (label: string | null) => void;
  /** İkinci model ID'si değiştiğinde üst bileşeni bilgilendirir */
  onModelIdChange?: (id: number | null) => void;
};

export default function SecondaryModelPanel({ selectedDate, primaryModelId, primaryRows, onRowsChange, onModelLabelChange, onModelIdChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [models, setModels] = useState<ProductModelListItem[]>([]);
  const [dayMeta, setDayMeta] = useState<SecondaryDayMeta>({ secondaryModelId: null, modelInfo: null });
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBusy, setPickerBusy] = useState<Set<number>>(new Set());
  const [noteOpen, setNoteOpen] = useState<number | null>(null);
  const [noteInput, setNoteInput] = useState("");
  // Düzenleme
  const [editOpen, setEditOpen] = useState<number | null>(null);
  const [editTeam, setEditTeam] = useState("");
  const [editProcess, setEditProcess] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [teamOptions, setTeamOptions] = useState<{ code: string; label: string }[]>([]);
  const [processOptions, setProcessOptions] = useState<string[]>([]);

  const rowsRef = useRef<ProductionRow[]>(rows);
  const dateRef = useRef(selectedDate);
  const modelIdRef = useRef<number | null>(dayMeta.secondaryModelId);

  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { dateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { modelIdRef.current = dayMeta.secondaryModelId; }, [dayMeta.secondaryModelId]);
  // Üst bileşeni bilgilendir
  useEffect(() => { onRowsChange?.(rows); }, [rows, onRowsChange]);
  useEffect(() => {
    const label = dayMeta.modelInfo
      ? (dayMeta.modelInfo.productName || dayMeta.modelInfo.modelCode || null)
      : null;
    onModelLabelChange?.(label);
  }, [dayMeta.modelInfo, onModelLabelChange]);
  useEffect(() => {
    onModelIdChange?.(dayMeta.secondaryModelId);
  }, [dayMeta.secondaryModelId, onModelIdChange]);

  // Model listesi + ekip + proses seçenekleri — bir kez yükle
  useEffect(() => {
    listProductModels().then(setModels).catch(() => {});
    getTeams().then((t) => setTeamOptions(t.map((r) => ({ code: r.code, label: r.label })))).catch(() => {});
    getProcesses().then((p) => setProcessOptions(p.map((r) => r.name))).catch(() => {});
  }, []);

  // Gün meta
  const loadMeta = useCallback(async () => {
    const meta = await getSecondaryDayMeta(selectedDate).catch(() => null);
    if (meta) setDayMeta(meta);
    return meta;
  }, [selectedDate]);

  useEffect(() => {
    void loadMeta();
    setRows([]);
    setError(null);
  }, [selectedDate, loadMeta]);

  // Satırları yükle
  const loadRows = useCallback(async (modelId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSecondaryProduction(selectedDate, modelId);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (dayMeta.secondaryModelId != null) {
      void loadRows(dayMeta.secondaryModelId);
    } else {
      setRows([]);
    }
  }, [dayMeta.secondaryModelId, loadRows]);

  // ─── Model seçimi ─────────────────────────────────────────────────────────
  async function handleModelSelect(modelId: number | null) {
    setSaving(true);
    try {
      await setSecondaryDayMeta(selectedDate, modelId);
      const meta = await loadMeta();
      if (meta?.secondaryModelId != null) await loadRows(meta.secondaryModelId);
      else setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Model ayarlanamadı");
    } finally {
      setSaving(false);
    }
  }

  // ─── Personel ekle ────────────────────────────────────────────────────────
  async function handleAddWorker(worker: ProductionRow) {
    const mid = modelIdRef.current;
    if (!mid) return;
    setPickerBusy((prev) => new Set([...prev, worker.workerId]));
    try {
      await addWorkerToSecondary({ workerId: worker.workerId, date: selectedDate, modelId: mid });
      // Listeye ekle (sıfır satır)
      setRows((prev) =>
        prev.some((r) => r.workerId === worker.workerId)
          ? prev
          : [...prev, { ...worker, h0900: 0, h1000: 0, h1115: 0, h1215: 0, h1300: 0, h1445: 0, h1545: 0, h1700: 0, h1830: 0, t1000: 0, t1300: 0, t1600: 0, t1830: 0, ekSayim: 0, note: undefined, absentForDay: undefined }]
          .sort((a, b) => a.team.localeCompare(b.team, "tr") || a.name.localeCompare(b.name, "tr"))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Personel eklenemedi");
    } finally {
      setPickerBusy((prev) => { const s = new Set(prev); s.delete(worker.workerId); return s; });
    }
  }

  // ─── Personel kaldır ──────────────────────────────────────────────────────
  async function handleRemoveWorker(workerId: number) {
    const mid = modelIdRef.current;
    if (!mid) return;
    try {
      await removeWorkerFromSecondary({ workerId, date: selectedDate, modelId: mid });
      setRows((prev) => prev.filter((r) => r.workerId !== workerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Personel kaldırılamadı");
    }
  }

  // ─── Personel düzenleme ───────────────────────────────────────────────────
  function openEdit(row: ProductionRow) {
    setEditTeam(row.team);
    setEditProcess(row.process ?? "");
    setEditOpen(row.workerId);
  }

  async function handleEditSave() {
    if (!editOpen || !editTeam.trim()) return;
    setEditSaving(true);
    try {
      await updateWorker(editOpen, {
        team: editTeam.trim().toUpperCase(),
        process: editProcess.trim().toUpperCase(),
      });
      setRows((prev) =>
        prev.map((r) =>
          r.workerId === editOpen
            ? { ...r, team: editTeam.trim().toUpperCase(), process: editProcess.trim().toUpperCase() }
            : r
        )
      );
      setEditOpen(null);
    } catch {
      setError("Personel güncellenemedi");
    } finally {
      setEditSaving(false);
    }
  }

  // ─── Hücre kayıt ──────────────────────────────────────────────────────────
  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function scheduleSave(workerId: number) {
    const t = saveTimers.current;
    if (t.has(workerId)) clearTimeout(t.get(workerId)!);
    const scheduledDate = dateRef.current;
    const timer = setTimeout(async () => {
      t.delete(workerId);
      if (dateRef.current !== scheduledDate || modelIdRef.current == null) return;
      const snap = rowsRef.current.find((r) => r.workerId === workerId);
      if (!snap) return;
      try {
        await saveSecondaryProduction({
          workerId, date: scheduledDate, modelId: modelIdRef.current,
          h0900: snap.h0900, h1000: snap.h1000, h1115: snap.h1115,
          h1215: snap.h1215, h1300: snap.h1300, h1445: snap.h1445,
          h1545: snap.h1545, h1700: snap.h1700, h1830: snap.h1830,
        });
      } catch {
        setError("Kayıt sırasında hata oluştu");
      }
    }, DEBOUNCE_MS);
    t.set(workerId, timer);
  }

  function handleCellChange(workerId: number, field: keyof ProductionRow, value: number) {
    const row = rowsRef.current.find((r) => r.workerId === workerId);
    if (!row) return;
    const nextVal = Math.max(0, Math.floor(value) || 0);
    setRows((prev) => prev.map((r) => r.workerId === workerId ? { ...r, [field]: nextVal } : r));
    scheduleSave(workerId);
  }

  const ekSayimTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function handleEkSayimChange(workerId: number, value: number) {
    const row = rowsRef.current.find((r) => r.workerId === workerId);
    if (!row) return;
    const nextVal = Math.max(0, Math.floor(value) || 0);
    setRows((prev) => prev.map((r) => r.workerId === workerId ? { ...r, ekSayim: nextVal } : r));
    const t = ekSayimTimers.current;
    if (t.has(workerId)) clearTimeout(t.get(workerId)!);
    const scheduledDate = dateRef.current;
    t.set(workerId, setTimeout(async () => {
      t.delete(workerId);
      if (dateRef.current !== scheduledDate || modelIdRef.current == null) return;
      const snap = rowsRef.current.find((r) => r.workerId === workerId);
      if (!snap) return;
      try {
        await saveSecondaryEkSayim({ workerId, date: scheduledDate, modelId: modelIdRef.current!, ekSayim: snap.ekSayim });
      } catch { setError("Ek sayım kaydedilemedi"); }
    }, DEBOUNCE_MS));
  }

  async function handleNoteSave(workerId: number) {
    if (modelIdRef.current == null) return;
    const note = noteInput.trim();
    setRows((prev) => prev.map((r) => r.workerId === workerId ? { ...r, note } : r));
    setNoteOpen(null);
    try {
      await saveSecondaryNote({ workerId, date: selectedDate, modelId: modelIdRef.current, note });
    } catch { setError("Not kaydedilemedi"); }
  }

  // ─── türetilenler ─────────────────────────────────────────────────────────
  const groups = useMemo(() => groupByTeam(rows), [rows]);
  const grandTotal = useMemo(() => rows.reduce((s, r) => s + sumProductionRow(r) + r.ekSayim, 0), [rows]);
  const secondaryWorkerIds = useMemo(() => new Set(rows.map((r) => r.workerId)), [rows]);
  const availableModels = useMemo(() => models.filter((m) => m.id !== primaryModelId), [models, primaryModelId]);
  const selectedModel = dayMeta.modelInfo;

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className="overflow-hidden rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/60 dark:border-violet-700/50 dark:bg-violet-950/20">
        {/* Başlık + aç/kapat */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-[10px] font-black text-white shadow">
              2
            </span>
            <div>
              <p className="text-sm font-black text-violet-900 dark:text-violet-200">
                Ek Model Girişi
                {selectedModel ? (
                  <span className="ml-2 rounded-md bg-violet-200 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-800/50 dark:text-violet-200">
                    {selectedModel.productName || selectedModel.modelCode}
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-violet-600 dark:text-violet-400">
                {selectedModel
                  ? `${rows.length} personel · ${grandTotal.toLocaleString("tr-TR")} adet`
                  : "Bantda ikinci model çalışıyorsa seçin"}
              </p>
            </div>
          </div>
          <svg
            className={`h-4 w-4 shrink-0 text-violet-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="border-t border-violet-200 px-5 py-4 dark:border-violet-700/40">
            {/* Model seçici */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-violet-800 dark:text-violet-300">
                Günün İkinci Modeli:
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={dayMeta.secondaryModelId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    void handleModelSelect(val === "" ? null : Number(val));
                  }}
                  disabled={saving}
                  className="rounded-xl border-2 border-violet-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-300/40 disabled:opacity-60 dark:border-violet-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">— Seçilmedi (ikinci model yok) —</option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.productName ? `${m.productName} (${m.modelCode})` : m.modelCode}
                    </option>
                  ))}
                </select>
                {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />}
              </div>
            </div>

            {error && (
              <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </p>
            )}

            {/* İçerik — yalnızca model seçilmişse */}
            {dayMeta.secondaryModelId != null && (
              <>
                {/* Personel ekle butonu */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-violet-600 dark:text-violet-400">
                    {rows.length > 0
                      ? `${rows.length} personel eklendi — verileri aşağıya girin`
                      : "Henüz personel eklenmedi. Birinci modelden personel ekleyin."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Personel Ekle
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-violet-600">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                    Yükleniyor…
                  </div>
                ) : rows.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-violet-200 py-8 text-center">
                    <p className="text-sm font-semibold text-violet-400">
                      Henüz personel yok
                    </p>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="mt-2 text-xs font-bold text-violet-600 underline hover:text-violet-800"
                    >
                      Personel eklemek için tıklayın
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-xs">
                      <thead>
                        <tr className="bg-violet-100 dark:bg-violet-900/40">
                          <th className="sticky left-0 whitespace-nowrap rounded-tl-xl bg-violet-100 px-3 py-2 text-left font-bold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                            Personel / Grup
                          </th>
                          {NEW_SLOT_DEFS.map((s) => (
                            <th key={s.key} className="whitespace-nowrap px-2 py-2 text-center font-bold text-violet-700 dark:text-violet-300">
                              {s.label}
                            </th>
                          ))}
                          <th className="whitespace-nowrap px-2 py-2 text-center font-bold text-violet-700 dark:text-violet-300">Ek</th>
                          <th className="whitespace-nowrap px-3 py-2 text-center font-bold text-violet-700 dark:text-violet-300">Toplam</th>
                          <th className="whitespace-nowrap rounded-tr-xl px-2 py-2 text-center font-bold text-slate-400 dark:text-slate-500">×</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map(({ team, rows: teamRows }) => (
                          <>
                            <tr key={`team-${team}`} className="bg-violet-50 dark:bg-violet-900/20">
                              <td
                                colSpan={NEW_SLOT_DEFS.length + 4}
                                className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400"
                              >
                                {team}
                                <span className="ml-2 font-normal text-violet-400">({teamRows.length} kişi)</span>
                              </td>
                            </tr>
                            {teamRows.map((row) => {
                              const rowTotal = sumProductionRow(row) + row.ekSayim;
                              return (
                                <tr
                                  key={row.workerId}
                                  className="border-b border-violet-100 hover:bg-violet-50/50 dark:border-violet-800/40 dark:hover:bg-violet-900/20"
                                >
                                  <td className="sticky left-0 bg-white px-3 py-1.5 dark:bg-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">{row.name}</span>
                                      {row.process && (
                                        <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-600 dark:bg-violet-800/40 dark:text-violet-300">
                                          {row.process}
                                        </span>
                                      )}
                                      {/* Düzenle */}
                                      <button
                                        type="button"
                                        onClick={() => openEdit(row)}
                                        title="Bölüm / proses düzenle"
                                        className="ml-0.5 rounded p-0.5 text-slate-300 transition hover:bg-violet-50 hover:text-violet-600"
                                      >
                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 112.828 2.828L11.828 15H9v-2.828l-.768.768z" />
                                        </svg>
                                      </button>
                                      {/* Not */}
                                      <button
                                        type="button"
                                        onClick={() => { setNoteInput(row.note ?? ""); setNoteOpen(row.workerId); }}
                                        title={row.note || "Not ekle"}
                                        className={`ml-0.5 rounded p-0.5 transition ${row.note ? "text-amber-600 hover:bg-amber-50" : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"}`}
                                      >
                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                      </button>
                                    </div>
                                  </td>
                                  {NEW_SLOT_DEFS.map((s) => (
                                    <td key={s.key} className="px-1 py-1 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={cellVal(row[s.key] as number)}
                                        onChange={(e) => handleCellChange(row.workerId, s.key, parseInt(e.target.value) || 0)}
                                        className="w-12 rounded-lg border border-violet-200 bg-white px-1 py-1 text-center text-xs font-semibold text-slate-800 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300/40 dark:border-violet-700 dark:bg-slate-800 dark:text-slate-200"
                                      />
                                    </td>
                                  ))}
                                  {/* Ek sayım */}
                                  <td className="px-1 py-1 text-center">
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={cellVal(row.ekSayim)}
                                      onChange={(e) => handleEkSayimChange(row.workerId, parseInt(e.target.value) || 0)}
                                      className="w-12 rounded-lg border border-amber-200 bg-amber-50 px-1 py-1 text-center text-xs font-semibold text-amber-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300/40"
                                    />
                                  </td>
                                  <td className="px-3 py-1 text-center font-black text-violet-900 dark:text-violet-200">
                                    {rowTotal > 0 ? rowTotal.toLocaleString("tr-TR") : "—"}
                                  </td>
                                  {/* Kaldır */}
                                  <td className="px-2 py-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveWorker(row.workerId)}
                                      title="Personeli ikinci modelden kaldır"
                                      className="rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Not modalı */}
      {noteOpen != null && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border-2 border-violet-300 bg-white p-5 shadow-2xl dark:border-violet-700 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-black text-slate-800 dark:text-slate-200">Personel Notu (İkinci Model)</h3>
            <textarea
              rows={3}
              autoFocus
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full resize-none rounded-xl border-2 border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-300/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              placeholder="Not girin…"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void handleNoteSave(noteOpen)}
                className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-black text-white hover:bg-violet-700">
                Kaydet
              </button>
              <button type="button" onClick={() => setNoteOpen(null)}
                className="flex-1 rounded-xl border-2 border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personel düzenleme modalı */}
      {editOpen != null && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border-2 border-violet-300 bg-white p-5 shadow-2xl dark:border-violet-700 dark:bg-slate-900">
            <h3 className="mb-4 text-sm font-black text-slate-800 dark:text-slate-200">
              Personel Düzenle — İkinci Model
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Bölüm (Ekip)</label>
                {teamOptions.length > 0 ? (
                  <select
                    value={editTeam}
                    onChange={(e) => setEditTeam(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-300/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">— Seçin —</option>
                    {teamOptions.map((t) => (
                      <option key={t.code} value={t.code}>{t.label} ({t.code})</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editTeam}
                    onChange={(e) => setEditTeam(e.target.value)}
                    placeholder="Örn. BITIM"
                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Proses</label>
                {processOptions.length > 0 ? (
                  <select
                    value={editProcess}
                    onChange={(e) => setEditProcess(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-300/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">— Seçin —</option>
                    {processOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editProcess}
                    onChange={(e) => setEditProcess(e.target.value)}
                    placeholder="Örn. DİKİM"
                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={editSaving || !editTeam.trim()}
                onClick={() => void handleEditSave()}
                className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {editSaving ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(null)}
                className="flex-1 rounded-xl border-2 border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personel Picker modalı */}
      {pickerOpen && (
        <WorkerPicker
          primaryRows={primaryRows}
          secondaryWorkerIds={secondaryWorkerIds}
          onAdd={handleAddWorker}
          onClose={() => setPickerOpen(false)}
          busy={pickerBusy}
        />
      )}
    </>
  );
}
