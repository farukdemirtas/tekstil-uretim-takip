"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  clampToWeekdayIso,
  formatIsoLocal,
  parseIsoLocal,
  todayWeekdayIso,
} from "@/lib/businessCalendar";
import {
  getProduction,
  getDayProductMeta,
  getHedefTakipStageTotals,
  getRepairs,
  getRepairsHistory,
  getProcesses,
  saveRepairs,
  deleteRepairs,
} from "@/lib/api";
import type { RepairEntry, RepairHistoryPoint } from "@/lib/api";
import { isAdminRole, hasPermission } from "@/lib/permissions";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDateLabel(iso: string): string {
  const d = parseIsoLocal(iso);
  if (!d) return iso;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit" });
}

function nDaysBackIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatIsoLocal(d);
}

function TrendArrow({ direction, size = "md" }: { direction: "up" | "down" | "flat"; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  if (direction === "up")
    return (
      <svg className={`${sz} text-red-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>
    );
  if (direction === "down")
    return (
      <svg className={`${sz} text-green-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
      </svg>
    );
  return <span className={`${sz === "h-7 w-7" ? "text-xl" : "text-base"} text-slate-400`}>—</span>;
}

// ─── mini sparkline bar chart ─────────────────────────────────────────────────

function SparkBars({ data }: { data: number[] }) {
  const max = Math.max(...data, 0.01);
  return (
    <div className="flex h-8 items-end gap-px">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-2 rounded-t-sm bg-teal-400/70 dark:bg-teal-500/60"
          style={{ height: `${Math.max(4, (v / max) * 32)}px` }}
        />
      ))}
    </div>
  );
}

// ─── rate color ───────────────────────────────────────────────────────────────
// daha düşük oran = daha iyi = yeşil
function rateColor(rate: number, avg: number): string {
  if (avg === 0) return "text-slate-700 dark:text-slate-200";
  if (rate < avg * 0.9) return "text-green-600 dark:text-green-400";
  if (rate > avg * 1.1) return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function TamirOraniPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayWeekdayIso());

  // production total (read-only, from main page data)
  const [production, setProduction] = useState<number | null>(null);
  const [prodLoading, setProdLoading] = useState(false);

  // repair entries for selected date
  const [entries, setEntries] = useState<RepairEntry[]>([{ processName: "", repairCount: 0 }]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // process list for dropdown
  const [processes, setProcesses] = useState<string[]>([]);

  // history
  const [history, setHistory] = useState<RepairHistoryPoint[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const canEdit = isAdminRole() || hasPermission("tamirOrani");

  // Silme onay durumu
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // date bekliyor
  const [deleting, setDeleting] = useState(false);

  // ── load processes once ───────────────────────────────────────────────────
  useEffect(() => {
    getProcesses()
      .then((rows) => setProcesses(rows.map((r) => r.name)))
      .catch(() => {});
  }, []);

  // ── load production total (genel tamamlanan — hedef takip formülü) ─────────
  const loadProduction = useCallback(async (date: string) => {
    setProdLoading(true);
    setProduction(null);
    try {
      // Günün ürün modelini al, sonra hedef aşama toplamlarını çek.
      // Genel tamamlanan = tüm aşamaların minimumu (darboğaz).
      const meta = await getDayProductMeta(date);
      const stageTotals = await getHedefTakipStageTotals(date, date, meta.modelId ?? undefined);
      const stages = stageTotals.stages ?? [];
      if (stages.length > 0) {
        const v = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
        setProduction(Math.min(...stages.map((s) => v(s.total))));
      } else {
        // Hedef takip yapılandırılmamışsa ham üretim toplamına düş.
        const rows = await getProduction(date);
        const raw = rows.reduce((s, r) => s + r.t1000 + r.t1300 + r.t1600 + r.t1830, 0);
        setProduction(raw);
      }
    } catch {
      // Hata durumunda ham üretim toplamını dene.
      try {
        const rows = await getProduction(date);
        const raw = rows.reduce((s, r) => s + r.t1000 + r.t1300 + r.t1600 + r.t1830, 0);
        setProduction(raw);
      } catch {
        setProduction(null);
      }
    } finally {
      setProdLoading(false);
    }
  }, []);

  // ── load repair entries ───────────────────────────────────────────────────
  const loadRepairs = useCallback(async (date: string) => {
    setEntriesLoading(true);
    try {
      const data = await getRepairs(date);
      setEntries(
        data.entries.length > 0
          ? data.entries
          : [{ processName: "", repairCount: 0 }]
      );
    } catch {
      setEntries([{ processName: "", repairCount: 0 }]);
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  // ── load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const end = todayWeekdayIso();
      const start = nDaysBackIso(120);
      const data = await getRepairsHistory({ startDate: start, endDate: end });
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProduction(selectedDate);
    void loadRepairs(selectedDate);
  }, [selectedDate, loadProduction, loadRepairs]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ── stats ─────────────────────────────────────────────────────────────────
  const totalRepairs = useMemo(
    () => entries.reduce((s, e) => s + (Number(e.repairCount) || 0), 0),
    [entries]
  );

  const repairRate = useMemo(() => {
    if (!production || production === 0) return null;
    return (totalRepairs / production) * 100;
  }, [totalRepairs, production]);

  // 30-day average from history (excluding selected date)
  const histAvg = useMemo(() => {
    const pts = history.filter((h) => h.repairDate !== selectedDate);
    if (pts.length === 0) return null;
    const sum = pts.reduce((s, h) => s + h.repairRate, 0);
    return sum / pts.length;
  }, [history, selectedDate]);

  const trendDir: "up" | "down" | "flat" = useMemo(() => {
    if (repairRate == null || histAvg == null) return "flat";
    if (repairRate < histAvg * 0.95) return "down"; // improving
    if (repairRate > histAvg * 1.05) return "up"; // worsening
    return "flat";
  }, [repairRate, histAvg]);

  // spark data (last 20 history points in chronological order)
  const sparkData = useMemo(
    () => [...history].reverse().slice(-20).map((h) => h.repairRate),
    [history]
  );

  // ── entry manipulation ────────────────────────────────────────────────────
  function addRow() {
    setEntries((prev) => [...prev, { processName: "", repairCount: 0 }]);
  }

  function removeRow(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setProcess(i: number, val: string) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, processName: val } : e)));
  }

  function setCount(i: number, val: string) {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, repairCount: n } : e)));
  }

  // ── delete ────────────────────────────────────────────────────────────────
  async function handleDelete(date: string) {
    setDeleting(true);
    try {
      await deleteRepairs(date);
      setDeleteConfirm(null);
      // Seçili tarihse formu temizle
      if (date === selectedDate) {
        setEntries([{ processName: "", repairCount: 0 }]);
      }
      void loadHistory();
    } catch (err) {
      alert(String(err));
    } finally {
      setDeleting(false);
    }
  }

  // ── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const filtered = entries.filter((e) => e.processName.trim() && e.repairCount > 0);
      await saveRepairs({ date: selectedDate, entries: filtered });
      setSaveMsg({ ok: true, text: "Kaydedildi" });
      void loadHistory();
    } catch (err) {
      setSaveMsg({ ok: false, text: String(err) });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-teal-950/30 dark:hover:text-teal-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Ana Sayfa
          </Link>

          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2v-4M11 4l9 9m-9-9v9h9" />
            </svg>
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Tamir Oranı</h1>
          </div>

          <div className="ml-auto">
            <WeekdayDatePicker value={selectedDate} onChange={(d) => setSelectedDate(clampToWeekdayIso(d))} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* ── Left: data entry ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            {/* Production total (read-only) */}
            <div className="surface-card">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                  <svg className="h-4 w-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Günlük Tamamlanan Ürün
                </span>
                <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {formatDateLabel(selectedDate)}
                </span>
              </div>

              {prodLoading ? (
                <div className="flex items-center gap-2 text-slate-400">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span className="text-sm">Yükleniyor…</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                    {production !== null ? production.toLocaleString("tr-TR") : "—"}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">adet</span>
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400 dark:bg-slate-800">
                    Genel tamamlanan
                  </span>
                </div>
              )}
            </div>

            {/* Repair entry form */}
            <div className="surface-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                    <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Tamir Girişi
                  </span>
                </div>
                {!canEdit && (
                  <span className="text-xs text-slate-400">Sadece okuma (yetki yok)</span>
                )}
              </div>

              {entriesLoading ? (
                <div className="flex items-center gap-2 py-4 text-slate-400">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span className="text-sm">Yükleniyor…</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_120px_40px] gap-2 px-1">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Proses / İşlem</span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tamir Adedi</span>
                    <span />
                  </div>

                  {entries.map((entry, i) => (
                    <div key={i} className="grid grid-cols-[1fr_120px_40px] items-center gap-2">
                      {/* process selector */}
                      {canEdit ? (
                        processes.length > 0 ? (
                          <div className="relative">
                            <select
                              className="select-modern"
                              value={entry.processName}
                              onChange={(e) => setProcess(i, e.target.value)}
                            >
                              <option value="">— Proses seç —</option>
                              {processes.map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="Proses adı"
                            className="input-modern"
                            value={entry.processName}
                            onChange={(e) => setProcess(i, e.target.value)}
                          />
                        )
                      ) : (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {entry.processName || "—"}
                        </span>
                      )}

                      {/* count */}
                      {canEdit ? (
                        <input
                          type="number"
                          min={0}
                          className="input-modern text-right tabular-nums"
                          value={entry.repairCount || ""}
                          placeholder="0"
                          onChange={(e) => setCount(i, e.target.value)}
                        />
                      ) : (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {entry.repairCount}
                        </span>
                      )}

                      {/* remove */}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}

                  {/* Add row + totals */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={addRow}
                      className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-teal-600 transition hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/30"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Satır ekle
                    </button>
                  )}

                  {/* Subtotal row */}
                  {entries.some((e) => e.repairCount > 0) && (
                    <div className="mt-2 grid grid-cols-[1fr_120px_40px] gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <span className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Toplam</span>
                      <span className="text-right text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {totalRepairs.toLocaleString("tr-TR")}
                      </span>
                      <span />
                    </div>
                  )}
                </div>
              )}

              {/* Save button */}
              {canEdit && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.98] disabled:opacity-60"
                  >
                    {saving ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                    {saving ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  {saveMsg && (
                    <span className={`text-sm font-medium ${saveMsg.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {saveMsg.text}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: stats ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            {/* Summary card */}
            <div className="surface-card">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
                  <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Özet</span>
              </div>

              {/* Big rate display */}
              <div className="mb-4 flex items-end gap-3">
                <span className={`text-5xl font-extrabold tabular-nums leading-none ${repairRate != null && histAvg != null ? rateColor(repairRate, histAvg) : "text-slate-800 dark:text-slate-100"}`}>
                  {repairRate != null ? `${repairRate.toFixed(1)}%` : "—"}
                </span>
                <div className="mb-1 flex flex-col items-start">
                  <TrendArrow direction={trendDir} size="lg" />
                  <span className="text-xs text-slate-400">tamir oranı</span>
                </div>
              </div>

              {/* Count breakdown */}
              <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                      {production !== null ? production.toLocaleString("tr-TR") : "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tamamlanan</div>
                  </div>
                  <div className="flex items-center justify-center">
                    <svg className="h-5 w-5 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                      {totalRepairs.toLocaleString("tr-TR")}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tamir</div>
                  </div>
                </div>

                {production !== null && production > 0 && totalRepairs > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                      {production.toLocaleString("tr-TR")} üründen {totalRepairs.toLocaleString("tr-TR")} tamir
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${Math.min(100, (totalRepairs / production) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Average comparison */}
              {histAvg !== null && (
                <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700/60">
                  <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Geçmiş Ortalama
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {histAvg.toFixed(1)}%
                    </span>
                    {repairRate !== null && (
                      <span className={`text-xs font-semibold ${trendDir === "down" ? "text-green-600 dark:text-green-400" : trendDir === "up" ? "text-red-600 dark:text-red-400" : "text-slate-500"}`}>
                        {trendDir === "down"
                          ? `↓ ${(histAvg - repairRate).toFixed(1)}pp iyileşme`
                          : trendDir === "up"
                          ? `↑ ${(repairRate - histAvg).toFixed(1)}pp kötüleşme`
                          : "Normal aralıkta"}
                      </span>
                    )}
                  </div>

                  {sparkData.length > 2 && (
                    <div className="mt-2">
                      <SparkBars data={sparkData} />
                      <div className="mt-1 text-right text-xs text-slate-400">Son {sparkData.length} gün</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── History table ─────────────────────────────────────────────────── */}
        <div className="surface-card mt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM12 15h.008v.008H12V15zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM9.75 15h.008v.008H9.75V15zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Geçmiş Tamir Oranları
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Son 120 gün
              </span>
            </div>

            {histLoading && (
              <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {histLoading ? "Yükleniyor…" : "Henüz tamir kaydı yok."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="pb-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Tarih
                    </th>
                    <th className="pb-2.5 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Tamamlanan
                    </th>
                    <th className="pb-2.5 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Tamir
                    </th>
                    <th className="pb-2.5 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Oran
                    </th>
                    <th className="pb-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Durum
                    </th>
                    {canEdit && (
                      <th className="pb-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        İşlem
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => {
                    const isSelected = row.repairDate === selectedDate;
                    // compare to avg of all other rows
                    const others = history.filter((h) => h.repairDate !== row.repairDate);
                    const avg = others.length > 0 ? others.reduce((s, h) => s + h.repairRate, 0) / others.length : 0;
                    const dir: "up" | "down" | "flat" =
                      avg === 0
                        ? "flat"
                        : row.repairRate < avg * 0.95
                        ? "down"
                        : row.repairRate > avg * 1.05
                        ? "up"
                        : "flat";

                    return (
                      <tr
                        key={row.repairDate}
                        className={`border-b border-slate-100 transition dark:border-slate-800 ${isSelected ? "bg-teal-50/60 dark:bg-teal-950/20" : i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-800/20"}`}
                      >
                        <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={() => setSelectedDate(row.repairDate)}
                            className="flex items-center gap-1.5 hover:text-teal-600 dark:hover:text-teal-400"
                          >
                            {isSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                            )}
                            {formatDateLabel(row.repairDate)}
                          </button>
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {row.totalProduction > 0 ? row.totalProduction.toLocaleString("tr-TR") : "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                          {row.totalRepairs.toLocaleString("tr-TR")}
                        </td>
                        <td className={`py-2.5 pr-4 text-right tabular-nums font-bold ${rateColor(row.repairRate, avg)}`}>
                          {row.repairRate.toFixed(1)}%
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="inline-flex items-center justify-center">
                            <TrendArrow direction={dir} size="sm" />
                          </span>
                        </td>
                        {canEdit && (
                          <td className="py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Düzenle */}
                              <button
                                type="button"
                                title="Bu günü düzenle"
                                onClick={() => setSelectedDate(row.repairDate)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/30 dark:hover:text-teal-400"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                </svg>
                              </button>
                              {/* Sil */}
                              <button
                                type="button"
                                title="Bu günün tamir kaydını sil"
                                onClick={() => setDeleteConfirm(row.repairDate)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Silme onay modalı */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tamir kaydını sil</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatDateLabel(deleteConfirm)} tarihli tüm tamir girişleri silinecek.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
