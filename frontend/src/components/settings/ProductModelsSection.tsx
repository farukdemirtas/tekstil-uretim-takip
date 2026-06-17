"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  applyHedefSession,
  applyUtuPaketSession,
  createProductModel,
  deleteProductModel,
  getProcesses,
  getProductModel,
  getTeams,
  getTakipsanConsignmentInfo,
  listProductModels,
  refreshProductModelTarget,
  updateProductModel,
  type ProcessRow,
  type ProductModelListItem,
  type TeamRow,
} from "@/lib/api";
import { clampToWeekdayIso, coerceWeekdayPickerValue, todayWeekdayIso } from "@/lib/businessCalendar";
import { formatModelPickerLabel, formatProductDisplayLine } from "@/lib/takipsanProduct";
import { hasPermission } from "@/lib/permissions";

const MAX_BASELINE_ROWS = 20;
const MAX_DAILY_SUMMARY_ROWS = 20;
const HEDEF_TAKIP_SETTINGS_KEY = "hedef_takip_settings_v1";

function persistHedefSettingsModelId(modelId: number | null) {
  try {
    const raw = window.localStorage.getItem(HEDEF_TAKIP_SETTINGS_KEY);
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(HEDEF_TAKIP_SETTINGS_KEY, JSON.stringify({ ...prev, modelId }));
  } catch {
    /* ignore */
  }
}

type BaselineRow = { teamCode: string; processName: string; arkaHalf: number };
type DailySummaryRow = { teamCode: string; processName: string; arkaHalf: number };

function emptyRow(): BaselineRow {
  return { teamCode: "", processName: "", arkaHalf: 0 };
}

function emptyDailyRow(): DailySummaryRow {
  return { teamCode: "", processName: "", arkaHalf: 0 };
}

export default function ProductModelsSection() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [list, setList] = useState<ProductModelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [modelCode, setModelCode] = useState("");
  const [productName, setProductName] = useState("");
  const [baselines, setBaselines] = useState<BaselineRow[]>([emptyRow()]);
  const [dailySummaryRows, setDailySummaryRows] = useState<DailySummaryRow[]>([]);
  const [sessionStartDate, setSessionStartDate] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [fromTakipsan, setFromTakipsan] = useState(false);
  const [takipsanProductLabel, setTakipsanProductLabel] = useState("");
  const [takipsanOrderCode, setTakipsanOrderCode] = useState("");
  const [targetQuantity, setTargetQuantity] = useState(0);
  const [secondaryConsignmentId, setSecondaryConsignmentId] = useState("");
  const [primaryConsignmentId, setPrimaryConsignmentId] = useState("");
  const [isTakipsanLinkedEdit, setIsTakipsanLinkedEdit] = useState(false);
  const [takipsanBusy, setTakipsanBusy] = useState(false);
  const [takipsanInputId, setTakipsanInputId] = useState("");
  const [saving, setSaving] = useState(false);
  const [hedefApplyModelId, setHedefApplyModelId] = useState<number | "">("");
  const [hedefApplyStart, setHedefApplyStart] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [hedefApplyEnd, setHedefApplyEnd] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [hedefApplyBusy, setHedefApplyBusy] = useState(false);
  const [hedefApplyMsg, setHedefApplyMsg] = useState<string | null>(null);
  const [hedefApplyErr, setHedefApplyErr] = useState<string | null>(null);
  const [utuPaketApplyStart, setUtuPaketApplyStart] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [utuPaketApplyEnd, setUtuPaketApplyEnd] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [utuPaketApplyBusy, setUtuPaketApplyBusy] = useState(false);
  const [utuPaketApplyMsg, setUtuPaketApplyMsg] = useState<string | null>(null);
  const [utuPaketApplyErr, setUtuPaketApplyErr] = useState<string | null>(null);

  const processNames = useMemo(() => processes.map((p) => p.name).sort((a, b) => a.localeCompare(b, "tr")), [processes]);

  const loadTeamsAndProcesses = useCallback(async () => {
    const [t, p] = await Promise.all([getTeams(), getProcesses()]);
    setTeams(t);
    setProcesses(p);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [t, p, m] = await Promise.all([getTeams(), getProcesses(), listProductModels()]);
      setTeams(t);
      setProcesses(p);
      setList(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!list.length) return;
    if (!hasPermission("hedefTakip")) return;
    try {
      const raw = window.localStorage.getItem(HEDEF_TAKIP_SETTINGS_KEY);
      const saved = raw ? (JSON.parse(raw) as { modelId?: number | null }) : {};
      if (saved.modelId != null && Number.isFinite(Number(saved.modelId)) && list.some((x) => x.id === Number(saved.modelId))) {
        setHedefApplyModelId(Number(saved.modelId));
      } else if (list.length === 1) {
        setHedefApplyModelId(list[0].id);
        persistHedefSettingsModelId(list[0].id);
      }
    } catch { /* ignore */ }
  }, [list]);

  async function startNew() {
    setEditingId("new");
    setModelCode("");
    setProductName("");
    setBaselines([emptyRow()]);
    setDailySummaryRows([]);
    setFromTakipsan(false);
    setTakipsanProductLabel("");
    setTakipsanOrderCode("");
    setTargetQuantity(0);
    setSecondaryConsignmentId("");
    setPrimaryConsignmentId("");
    setIsTakipsanLinkedEdit(false);
    setSessionStartDate(clampToWeekdayIso(todayWeekdayIso()));
    setError(null);
    try { await loadTeamsAndProcesses(); } catch (e) {
      setError(e instanceof Error ? e.message : "Bölüm ve proses listesi alınamadı");
    }
  }

  async function startNewFromTakipsan(overrideId?: string) {
    setTakipsanBusy(true);
    setError(null);
    try {
      await loadTeamsAndProcesses();
      const id = overrideId?.trim() || takipsanInputId.trim() || undefined;
      const info = await getTakipsanConsignmentInfo(id);
      setEditingId("new");
      setFromTakipsan(true);
      setIsTakipsanLinkedEdit(true);
      setModelCode(info.modelCode || info.productRef);
      setProductName(info.productName);
      setTakipsanProductLabel(info.productRef || info.productLabel);
      setTakipsanOrderCode(info.orderCode);
      setTargetQuantity(info.orderQuantity);
      setSecondaryConsignmentId("");
      setPrimaryConsignmentId("");
      setBaselines([emptyRow()]);
      setDailySummaryRows([]);
      setSessionStartDate(clampToWeekdayIso(todayWeekdayIso()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Takipsan verisi alınamadı");
    } finally {
      setTakipsanBusy(false);
    }
  }

  async function startEdit(id: number) {
    setError(null);
    try { await loadTeamsAndProcesses(); } catch (e) {
      setError(e instanceof Error ? e.message : "Bölüm ve proses listesi alınamadı");
      return;
    }
    try {
      const d = await getProductModel(id);
      setEditingId(id);
      setModelCode(d.modelCode);
      setProductName(d.productName);
      setFromTakipsan(Boolean(d.isTakipsanLinked));
      setIsTakipsanLinkedEdit(Boolean(d.isTakipsanLinked));
      setTakipsanProductLabel(d.takipsanProductLabel || "");
      setTakipsanOrderCode(d.takipsanOrderCode || "");
      setTargetQuantity(d.targetQuantity ?? 0);
      setSecondaryConsignmentId(d.secondaryConsignmentId ?? "");
      setPrimaryConsignmentId(d.primaryConsignmentId ?? "");
      const ssd = d.sessionStartDate ? clampToWeekdayIso(String(d.sessionStartDate)) : clampToWeekdayIso(todayWeekdayIso());
      setSessionStartDate(ssd);
      setUtuPaketApplyStart(
        d.utuPaketSessionStartDate ? clampToWeekdayIso(String(d.utuPaketSessionStartDate)) : ssd
      );
      setUtuPaketApplyEnd(clampToWeekdayIso(todayWeekdayIso()));
      // Formun içindeki "Günlere uygula" alanını mevcut model ve tarihle hazırla
      setHedefApplyModelId(id);
      setHedefApplyStart(ssd);
      setHedefApplyEnd(clampToWeekdayIso(todayWeekdayIso()));
      setHedefApplyMsg(null);
      setHedefApplyErr(null);
      const rows = (d.baselines || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((row) => ({ teamCode: row.teamCode, processName: row.processName, arkaHalf: row.arkaHalf ? 1 : 0 }));
      setBaselines(rows.length ? rows : [emptyRow()]);
      const dailyRows = (d.dailySummaryProcesses || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((row) => ({ teamCode: row.teamCode, processName: row.processName, arkaHalf: row.arkaHalf ? 1 : 0 }));
      setDailySummaryRows(dailyRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Model yüklenemedi");
    }
  }

  function cancelEdit() { setEditingId(null); setError(null); }

  function setRow(index: number, field: keyof BaselineRow, value: string | number) {
    setBaselines((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function setDailyRow(index: number, field: keyof DailySummaryRow, value: string | number) {
    setDailySummaryRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function addRow() { setBaselines((prev) => (prev.length >= MAX_BASELINE_ROWS ? prev : [...prev, emptyRow()])); }
  function removeRow(index: number) { setBaselines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index))); }
  function addDailyRow() { setDailySummaryRows((prev) => prev.length >= MAX_DAILY_SUMMARY_ROWS ? prev : [...prev, emptyDailyRow()]); }
  function removeDailyRow(index: number) { setDailySummaryRows((prev) => prev.filter((_, i) => i !== index)); }

  async function handleSave() {
    if (editingId === null) return;
    setSaving(true);
    setError(null);
    const payload = {
      modelCode,
      productName,
      baselines: baselines.map((b) => ({ teamCode: b.teamCode, processName: b.processName, arkaHalf: b.arkaHalf ? 1 : 0 })),
      dailySummaryProcesses: dailySummaryRows.filter((b) => b.teamCode.trim() && b.processName.trim()).map((b) => ({ teamCode: b.teamCode, processName: b.processName, arkaHalf: b.arkaHalf ? 1 : 0 })),
      sessionStartDate: sessionStartDate || null,
      primaryConsignmentId: primaryConsignmentId.trim() || null,
      secondaryConsignmentId: secondaryConsignmentId.trim() || null,
      ...(editingId === "new" && fromTakipsan ? { fromTakipsan: true, takipsanProductLabel, takipsanOrderCode, targetQuantity } : {}),
    };
    try {
      if (editingId === "new") { await createProductModel(payload); } else { await updateProductModel(editingId, payload); }
      await loadAll();
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Bu modeli silmek istediğinize emin misiniz?")) return;
    setError(null);
    try {
      await deleteProductModel(id);
      if (editingId === id) setEditingId(null);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi");
    }
  }

  function handleHedefApplyModelPick(value: string) {
    setHedefApplyMsg(null);
    setHedefApplyErr(null);
    if (value === "") { setHedefApplyModelId(""); persistHedefSettingsModelId(null); return; }
    const num = Number(value);
    setHedefApplyModelId(num);
    persistHedefSettingsModelId(num);
  }

  async function handleHedefApplyToProduction() {
    setHedefApplyMsg(null);
    setHedefApplyErr(null);
    if (hedefApplyModelId === "") { setHedefApplyErr("Önce bir ürün modeli seçin."); return; }
    const start = clampToWeekdayIso(hedefApplyStart);
    const end = clampToWeekdayIso(hedefApplyEnd);
    if (!start || !end || start > end) { setHedefApplyErr("Geçerli bir hafta içi tarih aralığı seçin."); return; }
    setHedefApplyBusy(true);
    try {
      const m = await getProductModel(Number(hedefApplyModelId));
      const { datesUpdated } = await applyHedefSession({ modelId: Number(hedefApplyModelId), startDate: start, endDate: end, productName: m.productName, productModel: m.modelCode });
      setHedefApplyMsg(datesUpdated > 0 ? `${datesUpdated} iş gününe ürün adı ve model kodu yazıldı.` : "Aralıkta güncellenecek iş günü bulunamadı.");
    } catch (e) {
      setHedefApplyErr(e instanceof Error ? e.message : "Uygulanamadı");
    } finally {
      setHedefApplyBusy(false);
    }
  }

  async function handleUtuPaketApplyToDays() {
    setUtuPaketApplyMsg(null);
    setUtuPaketApplyErr(null);
    if (typeof editingId !== "number") {
      setUtuPaketApplyErr("Önce modeli kaydedin, sonra uygulayın.");
      return;
    }
    const start = clampToWeekdayIso(utuPaketApplyStart);
    const end = clampToWeekdayIso(utuPaketApplyEnd);
    if (!start || !end || start > end) {
      setUtuPaketApplyErr("Geçerli bir hafta içi tarih aralığı seçin.");
      return;
    }
    setUtuPaketApplyBusy(true);
    try {
      const m = await getProductModel(editingId);
      const { datesUpdated } = await applyUtuPaketSession({
        modelId: editingId,
        startDate: start,
        endDate: end,
        productName: m.productName,
        productModel: m.modelCode,
      });
      setUtuPaketApplyMsg(
        datesUpdated > 0
          ? `${datesUpdated} iş günü ütü–paket ve Ekran5 için bu modele bağlandı.`
          : "Aralıkta güncellenecek iş günü bulunamadı."
      );
    } catch (e) {
      setUtuPaketApplyErr(e instanceof Error ? e.message : "Uygulanamadı");
    } finally {
      setUtuPaketApplyBusy(false);
    }
  }

  // ── Ortak satır editörü bileşeni ─────────────────────────────────────────
  function RowEditor({ rows, color, onTeam, onProcess, onHalf, onRemove, onAdd, max, addLabel, canRemove = true }: {
    rows: BaselineRow[];
    color: "teal" | "violet";
    onTeam: (i: number, v: string) => void;
    onProcess: (i: number, v: string) => void;
    onHalf: (i: number, v: number) => void;
    onRemove: (i: number) => void;
    onAdd: () => void;
    max: number;
    addLabel: string;
    canRemove?: boolean;
  }) {
    const borderCls = color === "teal" ? "border-teal-200/70 dark:border-teal-800/50" : "border-violet-200/70 dark:border-violet-800/50";
    const selCls   = color === "teal" ? "border-teal-200 focus:border-teal-500 dark:border-teal-700" : "border-violet-200 focus:border-violet-500 dark:border-violet-700";
    const addCls   = color === "teal"
      ? "border-teal-400 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300"
      : "border-violet-400 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300";

    if (rows.length === 0 && color === "violet") {
      return (
        <button type="button" onClick={onAdd} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${addCls}`}>
          <span className="text-base leading-none">+</span> {addLabel}
        </button>
      );
    }

    return (
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className={`flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:bg-slate-900 ${borderCls}`}>
            <span className="w-5 shrink-0 text-center text-[10px] font-bold text-slate-400">{i + 1}</span>
            <select
              value={row.teamCode}
              onChange={(e) => onTeam(i, e.target.value)}
              className={`min-w-0 flex-1 rounded-lg border bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 dark:bg-slate-800 dark:text-slate-100 ${selCls}`}
            >
              <option value="">Bölüm seçin…</option>
              {teams.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <select
              value={row.processName}
              onChange={(e) => onProcess(i, e.target.value)}
              className={`min-w-0 flex-1 rounded-lg border bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 dark:bg-slate-800 dark:text-slate-100 ${selCls}`}
            >
              <option value="">Proses seçin…</option>
              {processNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={row.arkaHalf === 1} onChange={(e) => onHalf(i, e.target.checked ? 1 : 0)} className="rounded" />
              <span>× ½</span>
            </label>
            <button
              type="button"
              disabled={!canRemove && rows.length <= 1}
              onClick={() => onRemove(i)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          disabled={rows.length >= max}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${addCls}`}
        >
          <span className="text-base leading-none">+</span> {addLabel}
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-4">

      {/* Hata */}
      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <span className="shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      ) : null}

      {/* ══ MODEL LİSTESİ ═════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">

        {/* Başlık + Ekle butonları */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Ürün Modelleri</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Hedef, bölüm ve proses tanımları</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Takipsan'dan ekle — isteğe bağlı sevkiyat ID */}
            <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 dark:border-sky-800/50 dark:bg-sky-950/30">
              <svg className="h-3.5 w-3.5 shrink-0 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.36" /></svg>
              <input
                type="text"
                value={takipsanInputId}
                onChange={(e) => setTakipsanInputId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !takipsanBusy) void startNewFromTakipsan(); }}
                placeholder="Sevkiyat ID (opsiyonel)"
                className="w-36 bg-transparent text-xs font-medium text-slate-700 placeholder-slate-400 outline-none dark:text-slate-200 sm:w-44"
              />
              <button
                type="button"
                onClick={() => void startNewFromTakipsan()}
                disabled={takipsanBusy}
                className="flex shrink-0 items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {takipsanBusy
                  ? <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  : null}
                {takipsanBusy ? "Yükleniyor…" : "Çek"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void startNew()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Manuel ekle
            </button>
          </div>
        </div>

        {/* Model listesi */}
        {loading && list.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            Yükleniyor…
          </div>
        ) : list.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400">Henüz model yok.</p>
            <p className="mt-1 text-xs text-slate-400">Takipsan&apos;dan veya manuel olarak ekleyin.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {list.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  {/* İkon */}
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${m.isTakipsanLinked ? "bg-sky-500" : "bg-slate-400"} text-white`}>
                    {m.isTakipsanLinked
                      ? <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.36" /></svg>
                      : <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {m.isTakipsanLinked
                        ? m.takipsanProductLabel || formatModelPickerLabel(m.productName, m.modelCode)
                        : `${m.modelCode}${m.productName ? ` — ${m.productName}` : ""}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {m.targetQuantity != null && m.targetQuantity > 0 ? (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-800/50">
                          Hedef {m.targetQuantity.toLocaleString("tr-TR")} adet
                        </span>
                      ) : null}
                      {(m.primaryConsignmentId || m.secondaryConsignmentId) ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200/80 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-800/50">
                          2 PO birleşik
                        </span>
                      ) : null}
                      {m.isTakipsanLinked ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:bg-sky-950/30 dark:text-sky-400">Takipsan</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void startEdit(m.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                  >Düzenle</button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(m.id)}
                    className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                  >Sil</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ══ DÜZENLEME FORMU ══════════════════════════════════════════════════ */}
      {editingId !== null ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">

          {/* Form başlığı */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 dark:bg-teal-500/20">
                <svg className="h-4 w-4 text-teal-600 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingId === "new" ? (fromTakipsan ? "Takipsan'dan Yeni Model" : "Manuel Yeni Model") : "Modeli Düzenle"}
              </h3>
            </div>
            <button type="button" onClick={cancelEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700">

            {/* ── Ürün Bilgileri ── */}
            <div className="px-5 py-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ürün Bilgileri</p>
              {isTakipsanLinkedEdit ? (
                <div className="flex items-center gap-3 rounded-xl bg-sky-50/70 px-4 py-3 ring-1 ring-sky-200/80 dark:bg-sky-950/20 dark:ring-sky-800/50">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500 text-white">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.36" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Takipsan ürünü</p>
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {takipsanProductLabel || formatProductDisplayLine(productName, modelCode)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Model kodu</label>
                    <input value={modelCode} onChange={(e) => setModelCode(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Örn. YM-2026-04" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Ürün adı</label>
                    <input value={productName} onChange={(e) => setProductName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Örn. Polo tişört" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Hedef & Sipariş (sadece Takipsan) ── */}
            {isTakipsanLinkedEdit ? (
              <div className="px-5 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Hedef & Sipariş</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Hedef adet</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} step={1}
                        value={targetQuantity || ""}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); setTargetQuantity(Number.isFinite(v) && v >= 0 ? v : 0); }}
                        className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tabular-nums outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        placeholder="23500"
                      />
                      {typeof editingId === "number" ? (
                        <button type="button" disabled={takipsanBusy}
                          onClick={() => {
                            setTakipsanBusy(true);
                            void refreshProductModelTarget(editingId)
                              .then((r) => { setTargetQuantity(r.targetQuantity); if (r.productLabel) setTakipsanProductLabel(r.productLabel); })
                              .catch((e) => setError(e instanceof Error ? e.message : "Güncellenemedi"))
                              .finally(() => setTakipsanBusy(false));
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-300"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.36" /></svg>
                          {takipsanBusy ? "…" : "Takipsan'dan al"}
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">El ile girin ya da Takipsan&apos;dan güncel değeri çekin.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Ana sevkiyat ID
                      <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">opsiyonel</span>
                    </label>
                    <input
                      type="text" value={primaryConsignmentId}
                      onChange={(e) => setPrimaryConsignmentId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Örn. 258152"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">8000+4000 gibi bölünmüş siparişte birinci PO. Boş bırakılırsa .env birincili kullanılır.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      İkincil sevkiyat ID
                      <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">opsiyonel</span>
                    </label>
                    <input
                      type="text" value={secondaryConsignmentId}
                      onChange={(e) => setSecondaryConsignmentId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Örn. 258154"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">İkinci PO (örn. 258154). Birden fazla: virgülle ayırın. Ana + ikincil birlikte toplanır.</p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── Üretim günlerine uygula (takip başlangıcı + model ata) ── */}
            {hasPermission("hedefTakip") ? (
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700 dark:text-teal-400">Üretim Günlerine Uygula</p>
                    <p className="text-[11px] text-slate-400">Seçili hafta içi günlere bu modeli ata; Ekran 1 «Biten» de bu tarihten sayılır.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <WeekdayDatePicker label="Başlangıç" value={hedefApplyStart} onChange={(v) => { setHedefApplyStart(coerceWeekdayPickerValue(v)); setSessionStartDate(coerceWeekdayPickerValue(v)); }} className="min-w-[10rem] flex-1" />
                  <WeekdayDatePicker label="Bitiş" value={hedefApplyEnd} onChange={(v) => setHedefApplyEnd(coerceWeekdayPickerValue(v))} className="min-w-[10rem] flex-1" />
                  {typeof editingId === "number" ? (
                    <button
                      type="button"
                      disabled={hedefApplyBusy}
                      onClick={() => {
                        void handleHedefApplyToProduction();
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-teal-400 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/30"
                    >
                      {hedefApplyBusy
                        ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                        : null}
                      {hedefApplyBusy ? "Uygulanıyor…" : "Günlere uygula"}
                    </button>
                  ) : null}
                </div>
                {hedefApplyMsg ? (
                  <p className="mt-2.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-teal-200">✓ {hedefApplyMsg}</p>
                ) : null}
                {hedefApplyErr ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">⚠ {hedefApplyErr}</p> : null}
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Takip Başlangıcı</p>
                <WeekdayDatePicker label="Başlangıç tarihi" value={sessionStartDate} onChange={(v) => setSessionStartDate(coerceWeekdayPickerValue(v))} className="max-w-xs" />
                <p className="mt-1.5 text-[11px] text-slate-400">Ekran 1 ve hedef özette «Biten» bu tarihten itibaren sayılır.</p>
              </div>
            )}

            {/* ── Ütü–paket günlerine uygula (veri girişinden bağımsız) ── */}
            {hasPermission("utuPaket") && typeof editingId === "number" ? (
              <div className="border-t border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-400">
                    Ütü–Paket İçin Uygula
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Seçili günlere bu modeli ata; ütü–paket veri girişi, Takipsan paketleme ve Ekran5 bu modele göre çalışır (veri girişi modelinden bağımsız).
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <WeekdayDatePicker
                    label="Başlangıç"
                    value={utuPaketApplyStart}
                    onChange={(v) => setUtuPaketApplyStart(coerceWeekdayPickerValue(v))}
                    className="min-w-[10rem] flex-1"
                  />
                  <WeekdayDatePicker
                    label="Bitiş"
                    value={utuPaketApplyEnd}
                    onChange={(v) => setUtuPaketApplyEnd(coerceWeekdayPickerValue(v))}
                    className="min-w-[10rem] flex-1"
                  />
                  <button
                    type="button"
                    disabled={utuPaketApplyBusy}
                    onClick={() => void handleUtuPaketApplyToDays()}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-400 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                  >
                    {utuPaketApplyBusy ? "Uygulanıyor…" : "Ütü–pakete uygula"}
                  </button>
                </div>
                {utuPaketApplyMsg ? (
                  <p className="mt-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-200">
                    ✓ {utuPaketApplyMsg}
                  </p>
                ) : null}
                {utuPaketApplyErr ? (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">⚠ {utuPaketApplyErr}</p>
                ) : null}
              </div>
            ) : null}

            {/* ── Çalışılacak bölümler ── */}
            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700 dark:text-teal-400">Çalışılacak Bölümler</p>
                  <p className="text-[11px] text-slate-400">Hedef Takip ve Ekran 1 «Biten» bu satırlardan hesaplanır.</p>
                </div>
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-800">
                  {baselines.length}
                </span>
              </div>
              {teams.length === 0 || processes.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  {teams.length === 0 ? "Önce Ayarlar'da bölüm tanımlayın." : "Önce Ayarlar'da proses tanımlayın."}
                </p>
              ) : (
                <RowEditor rows={baselines} color="teal"
                  onTeam={(i, v) => setRow(i, "teamCode", v)}
                  onProcess={(i, v) => setRow(i, "processName", v)}
                  onHalf={(i, v) => setRow(i, "arkaHalf", v)}
                  onRemove={removeRow} onAdd={addRow}
                  max={MAX_BASELINE_ROWS} addLabel="Bölüm satırı ekle" canRemove />
              )}
            </div>

            {/* ── Günlük özet prosesleri ── */}
            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400">Günlük Özet Prosesleri</p>
                  <p className="text-[11px] text-slate-400">Ana ekrandaki mor kutularda gösterilir. İsteğe bağlı.</p>
                </div>
                {dailySummaryRows.length > 0 && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-800">
                    {dailySummaryRows.length}
                  </span>
                )}
              </div>
              <RowEditor rows={dailySummaryRows} color="violet"
                onTeam={(i, v) => setDailyRow(i, "teamCode", v)}
                onProcess={(i, v) => setDailyRow(i, "processName", v)}
                onHalf={(i, v) => setDailyRow(i, "arkaHalf", v)}
                onRemove={removeDailyRow} onAdd={addDailyRow}
                max={MAX_DAILY_SUMMARY_ROWS} addLabel="Özet prosesi ekle" canRemove={false} />
            </div>
          </div>

          {/* Form footer */}
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 dark:border-slate-700">
            <button type="button" onClick={cancelEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
              İptal
            </button>
            <button type="button" disabled={saving} onClick={() => void handleSave()}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50">
              {saving
                ? <><svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Kaydediliyor…</>
                : "Kaydet"}
            </button>
          </div>
        </div>
      ) : null}


    </section>
  );
}
