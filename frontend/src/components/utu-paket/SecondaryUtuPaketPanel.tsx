"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBedenCekiTargets,
  getUtuPaketSecondary,
  getUtuPaketSecondaryAnalytics,
  getUtuPaketSecondaryDayMeta,
  listProductModels,
  saveUtuPaketSecondary,
  setBedenCekiTargets,
  setUtuPaketEkran5ShowPrimary,
  setUtuPaketSecondaryDayMeta,
  type ProductModelListItem,
  type UtuPaketSecondaryDayMeta,
} from "@/lib/api";
import {
  UTU_PAKET_SIZE_CODES,
  UTU_PAKET_SLOT_DEFS,
  UTU_PAKET_STAGE_META,
  UTU_PAKET_STAGES,
  emptyBedenCekiTargets,
  emptyUtuPaketBeden,
  emptyUtuPaketStages,
  normalizeUtuPaketPayload,
  sumUtuPaketSlots,
  type UtuPaketDayPayload,
  type UtuPaketSizeCode,
  type UtuPaketSlotKey,
  type UtuPaketStage,
} from "@/lib/utuPaket";
import { todayIsoTurkey } from "@/lib/businessCalendar";

const DEBOUNCE_MS = 400;

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

type Props = {
  selectedDate: string;
  primaryModelId: number | null;
  enabled?: boolean;
};

function MiniSpark({ values, className = "bg-violet-500/70 dark:bg-violet-400/60" }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-10 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className={`min-w-[3px] flex-1 rounded-t ${className}`}
          style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function payloadHasSecondaryData(payload: UtuPaketDayPayload): boolean {
  for (const st of UTU_PAKET_STAGES) {
    if (sumUtuPaketSlots(payload.stages[st]) > 0) return true;
    if (Math.max(0, Math.floor(Number(payload.stageEkSayim?.[st]) || 0)) > 0) return true;
  }
  for (const code of UTU_PAKET_SIZE_CODES) {
    if (Math.max(0, Math.floor(Number(payload.beden[code]) || 0)) > 0) return true;
  }
  return false;
}

export default function SecondaryUtuPaketPanel({ selectedDate, primaryModelId, enabled = true }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dayMeta, setDayMeta] = useState<UtuPaketSecondaryDayMeta>({
    secondaryModelId: null,
    modelInfo: null,
    secondaryHasData: false,
    ekran5ShowPrimary: true,
  });
  const [models, setModels] = useState<ProductModelListItem[]>([]);
  const [data, setData] = useState<UtuPaketDayPayload>(() => ({
    date: selectedDate,
    stages: emptyUtuPaketStages(),
    beden: emptyUtuPaketBeden(),
    packagingTarget: 0,
  }));
  const [activeStage, setActiveStage] = useState<UtuPaketStage>("optik");
  const [loading, setLoading] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ekSayimOpen, setEkSayimOpen] = useState(false);
  const [periodPaketBeforeToday, setPeriodPaketBeforeToday] = useState(0);
  const [periodBedenBeforeToday, setPeriodBedenBeforeToday] = useState<Record<UtuPaketSizeCode, number>>(
    () => emptyUtuPaketBeden()
  );
  const [bedenCekiTargets, setBedenCekiTargetsState] = useState<Record<UtuPaketSizeCode, number>>(() =>
    emptyBedenCekiTargets()
  );
  const [bedenCekiDirty, setBedenCekiDirty] = useState(false);
  const [bedenCekiSaving, setBedenCekiSaving] = useState(false);
  const [bedenCekiMsg, setBedenCekiMsg] = useState<string | null>(null);
  const [ekran5PrefSaving, setEkran5PrefSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelIdRef = useRef<number | null>(null);
  const dataRef = useRef(data);
  const dirtyRef = useRef(false);

  useEffect(() => {
    modelIdRef.current = dayMeta.secondaryModelId;
  }, [dayMeta.secondaryModelId]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const loadPeriodTotals = useCallback(
    async (
      date: string,
      modelId: number,
      todayTotal: number,
      todayBeden: Record<string, number>,
      sessionStartDate?: string
    ) => {
      try {
        const rangeStart =
          sessionStartDate?.trim() && sessionStartDate.trim() <= date
            ? sessionStartDate.trim()
            : date;
        const analytics = await getUtuPaketSecondaryAnalytics({
          startDate: rangeStart,
          endDate: date,
          modelId,
        });
        const period = Math.max(0, Math.floor(Number(analytics.periodTotals?.paketleme) || 0));
        setPeriodPaketBeforeToday(Math.max(0, period - todayTotal));

        const beforeTodayBeden = emptyUtuPaketBeden();
        for (const code of UTU_PAKET_SIZE_CODES) {
          const periodBeden = Math.max(0, Math.floor(Number(analytics.bedenTotals?.[code]) || 0));
          const today = Math.max(0, Math.floor(Number(todayBeden[code]) || 0));
          beforeTodayBeden[code] = Math.max(0, periodBeden - today);
        }
        setPeriodBedenBeforeToday(beforeTodayBeden);
      } catch {
        setPeriodPaketBeforeToday(0);
        setPeriodBedenBeforeToday(emptyUtuPaketBeden());
      }
    },
    []
  );

  const loadMeta = useCallback(async () => {
    try {
      const meta = await getUtuPaketSecondaryDayMeta(selectedDate);
      setDayMeta(meta);
      return meta;
    } catch {
      setDayMeta({ secondaryModelId: null, modelInfo: null, secondaryHasData: false, ekran5ShowPrimary: true });
      return { secondaryModelId: null, modelInfo: null, secondaryHasData: false, ekran5ShowPrimary: true };
    }
  }, [selectedDate]);

  const loadData = useCallback(
    async (modelId: number) => {
      setLoading(true);
      setError("");
      try {
        const raw = await getUtuPaketSecondary(selectedDate, modelId);
        const normalized = normalizeUtuPaketPayload({ ...raw, date: selectedDate });
        setData(normalized);
        setDirty(false);
        const todayPaket =
          sumUtuPaketSlots(normalized.stages.paketleme) +
          Math.max(0, Math.floor(Number(normalized.stageEkSayim?.paketleme) || 0));
        await loadPeriodTotals(
          selectedDate,
          modelId,
          todayPaket,
          normalized.beden,
          normalized.sessionStartDate
        );
      } catch {
        setError("İkinci model verisi yüklenemedi");
      } finally {
        setLoading(false);
      }
    },
    [selectedDate, loadPeriodTotals]
  );

  useEffect(() => {
    if (!enabled) return;
    void listProductModels().then(setModels).catch(() => setModels([]));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const meta = await loadMeta();
      if (meta.secondaryModelId) {
        await loadData(meta.secondaryModelId);
      } else {
        setData({
          date: selectedDate,
          stages: emptyUtuPaketStages(),
          beden: emptyUtuPaketBeden(),
          packagingTarget: 0,
        });
        setPeriodPaketBeforeToday(0);
        setPeriodBedenBeforeToday(emptyUtuPaketBeden());
        setDirty(false);
      }
    })();
  }, [enabled, selectedDate, loadMeta, loadData]);

  useEffect(() => {
    setEkSayimOpen(false);
  }, [activeStage]);

  const modelIdForBeden = dayMeta.secondaryModelId;

  useEffect(() => {
    if (!modelIdForBeden) {
      setBedenCekiTargetsState(emptyBedenCekiTargets());
      setBedenCekiDirty(false);
      return;
    }
    let cancelled = false;
    void getBedenCekiTargets(modelIdForBeden)
      .then((res) => {
        if (cancelled) return;
        const next = emptyBedenCekiTargets();
        for (const code of UTU_PAKET_SIZE_CODES) {
          next[code] = Math.max(0, Math.floor(Number(res.targets?.[code]) || 0));
        }
        setBedenCekiTargetsState(next);
        setBedenCekiDirty(false);
      })
      .catch(() => {
        if (!cancelled) setBedenCekiTargetsState(emptyBedenCekiTargets());
      });
    return () => {
      cancelled = true;
    };
  }, [modelIdForBeden]);

  const persist = useCallback(
    async (payload: UtuPaketDayPayload, modelId: number) => {
      setSaving(true);
      try {
        await saveUtuPaketSecondary({
          date: selectedDate,
          modelId,
          stages: payload.stages,
          beden: payload.beden,
          stageEkSayim: payload.stageEkSayim,
          packagingTarget: payload.packagingTarget,
        });
        setDirty(false);
        setError("");
        const todayPaket =
          sumUtuPaketSlots(payload.stages.paketleme) +
          Math.max(0, Math.floor(Number(payload.stageEkSayim?.paketleme) || 0));
        const refreshed = await getUtuPaketSecondary(selectedDate, modelId);
        const refreshedNorm = normalizeUtuPaketPayload({ ...refreshed, date: selectedDate });
        setData((prev) => ({
          ...prev,
          sessionStartDate: refreshedNorm.sessionStartDate,
          packagingTarget: refreshedNorm.packagingTarget,
        }));
        await loadPeriodTotals(
          selectedDate,
          modelId,
          todayPaket,
          payload.beden,
          refreshedNorm.sessionStartDate
        );
        await loadMeta();
      } catch {
        setError("Kaydedilemedi");
      } finally {
        setSaving(false);
      }
    },
    [selectedDate, loadPeriodTotals, loadMeta]
  );

  const scheduleSave = useCallback(
    (next: UtuPaketDayPayload) => {
      const mid = modelIdRef.current;
      if (!mid) return;
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(next, mid), DEBOUNCE_MS);
    },
    [persist]
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  async function handleModelSelect(modelId: number | null) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const prevModelId = modelIdRef.current;
    if (prevModelId && dirtyRef.current) {
      try {
        await persist(dataRef.current, prevModelId);
      } catch {
        // persist zaten hata mesajını ayarlar
      }
    }

    setMetaSaving(true);
    setError("");
    try {
      await setUtuPaketSecondaryDayMeta(selectedDate, modelId);
      const meta = await loadMeta();
      if (meta.secondaryModelId) {
        await loadData(meta.secondaryModelId);
      } else {
        setData({
          date: selectedDate,
          stages: emptyUtuPaketStages(),
          beden: emptyUtuPaketBeden(),
          packagingTarget: 0,
        });
        setPeriodPaketBeforeToday(0);
        setPeriodBedenBeforeToday(emptyUtuPaketBeden());
      }
    } catch {
      setError("Model ayarlanamadı");
    } finally {
      setMetaSaving(false);
    }
  }

  async function saveBedenCekiTargets() {
    const mid = dayMeta.secondaryModelId;
    if (!mid) return;
    setBedenCekiSaving(true);
    setBedenCekiMsg(null);
    try {
      await setBedenCekiTargets(mid, bedenCekiTargets);
      setBedenCekiDirty(false);
      setBedenCekiMsg("Beden çeki hedefleri kaydedildi.");
    } catch (e) {
      setBedenCekiMsg(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBedenCekiSaving(false);
    }
  }

  function setBedenCekiTarget(code: UtuPaketSizeCode, raw: string) {
    const v = parseInt(raw.replace(/\D/g, ""), 10);
    setBedenCekiTargetsState((prev) => ({
      ...prev,
      [code]: Number.isFinite(v) && v >= 0 ? v : 0,
    }));
    setBedenCekiDirty(true);
    setBedenCekiMsg(null);
  }

  async function handleEkran5ShowPrimaryToggle(checked: boolean) {
    setEkran5PrefSaving(true);
    setError("");
    try {
      await setUtuPaketEkran5ShowPrimary(selectedDate, checked);
      setDayMeta((prev) => ({ ...prev, ekran5ShowPrimary: checked }));
    } catch {
      setError("Ekran 5 görünüm ayarı kaydedilemedi");
    } finally {
      setEkran5PrefSaving(false);
    }
  }

  function setPackagingTarget(raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setData((prev) => {
      const next = { ...prev, packagingTarget: n };
      scheduleSave(next);
      return next;
    });
  }

  function setSlot(stage: UtuPaketStage, key: UtuPaketSlotKey, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setData((prev) => {
      const next = {
        ...prev,
        stages: {
          ...prev.stages,
          [stage]: { ...prev.stages[stage], [key]: n },
        },
      };
      scheduleSave(next);
      return next;
    });
  }

  function setEkSayim(stage: UtuPaketStage, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setData((prev) => {
      const next = {
        ...prev,
        stageEkSayim: { ...(prev.stageEkSayim || {}), [stage]: n },
      };
      scheduleSave(next);
      return next;
    });
  }

  function setBeden(code: UtuPaketSizeCode, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setData((prev) => {
      const next = { ...prev, beden: { ...prev.beden, [code]: n } };
      scheduleSave(next);
      return next;
    });
  }

  const availableModels = useMemo(
    () => models.filter((m) => m.id !== primaryModelId),
    [models, primaryModelId]
  );

  const stageTotals = useMemo(() => {
    const out = {} as Record<UtuPaketStage, number>;
    for (const st of UTU_PAKET_STAGES) {
      const slots = sumUtuPaketSlots(data.stages[st]);
      const ek = Math.max(0, Math.floor(Number(data.stageEkSayim?.[st]) || 0));
      out[st] = slots + ek;
    }
    return out;
  }, [data]);

  const bedenSessionTotals = useMemo(() => {
    const out = emptyUtuPaketBeden();
    for (const code of UTU_PAKET_SIZE_CODES) {
      const today = Math.max(0, Math.floor(Number(data.beden[code]) || 0));
      out[code] = periodBedenBeforeToday[code] + today;
    }
    return out;
  }, [periodBedenBeforeToday, data.beden]);

  const bedenTotal = useMemo(
    () => UTU_PAKET_SIZE_CODES.reduce((s, c) => s + (bedenSessionTotals[c] || 0), 0),
    [bedenSessionTotals]
  );

  const paketReadCount = periodPaketBeforeToday + stageTotals.paketleme;
  const target = Math.max(0, Math.floor(Number(data.packagingTarget) || 0));
  const paketRemaining = Math.max(0, target - paketReadCount);
  const gunPaketAdet = stageTotals.paketleme;
  const paketPct = target > 0 ? Math.min(100, Math.round((paketReadCount / target) * 100)) : 0;
  const gunPaketLabel =
    selectedDate === todayIsoTurkey()
      ? "Bugün paketlenen"
      : `${formatDayLabel(selectedDate)} paketlenen`;

  const secondaryHasData = useMemo(() => {
    if (!dayMeta.secondaryModelId) return false;
    return dayMeta.secondaryHasData === true || payloadHasSecondaryData(data);
  }, [dayMeta.secondaryModelId, dayMeta.secondaryHasData, data]);

  const ekran5SlideCount = dayMeta.ekran5ShowPrimary !== false ? 8 : 4;

  const selectedModel = dayMeta.modelInfo;

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-dashed border-violet-300 bg-violet-50/60 sm:mt-8 sm:rounded-2xl sm:border-2 dark:border-violet-700/50 dark:bg-violet-950/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left sm:gap-3 sm:px-5 sm:py-3.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[10px] font-black text-white shadow">
            2
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-violet-900 dark:text-violet-200">
              Ek Model Paketleme
              {selectedModel ? (
                <span className="ml-2 inline-block max-w-[12rem] truncate align-bottom rounded-md bg-violet-200 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-800/50 dark:text-violet-200">
                  {selectedModel.productName || selectedModel.modelCode}
                </span>
              ) : null}
            </p>
            <p className="text-[11px] text-violet-600 dark:text-violet-400">
              {selectedModel
                ? `Paket: ${paketReadCount.toLocaleString("tr-TR")}${target > 0 ? ` / ${target.toLocaleString("tr-TR")}` : ""}`
                : "Aynı günde ikinci model paketleniyorsa seçin"}
            </p>
          </div>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-violet-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-violet-200 px-3 py-3 sm:px-5 sm:py-4 dark:border-violet-700/40">
          {error ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mb-3 flex flex-col gap-2 xl:mb-4 xl:flex-row xl:flex-wrap xl:items-center xl:gap-x-3 xl:gap-y-2">
            <div className="flex min-w-0 items-center gap-2 xl:min-w-[15rem] xl:flex-none">
              <label className="shrink-0 text-xs font-bold text-violet-800 dark:text-violet-300">Günün 2. modeli</label>
              <select
                value={dayMeta.secondaryModelId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  void handleModelSelect(val === "" ? null : Number(val));
                }}
                disabled={metaSaving || saving}
                className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-violet-500 dark:border-violet-600 dark:bg-slate-800 dark:text-slate-200 xl:min-w-[11rem] xl:rounded-xl xl:border-2 xl:py-1.5"
              >
                <option value="">— Seçilmedi —</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.productName ? `${m.productName} (${m.modelCode})` : m.modelCode}
                  </option>
                ))}
              </select>
            </div>

            {dayMeta.secondaryModelId != null ? (
              <>
                <label className="flex min-w-0 items-center gap-2 xl:flex-none">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hedef</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="w-24 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-sm font-bold tabular-nums text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 dark:border-violet-700 dark:bg-slate-800 dark:text-white sm:w-28"
                    value={data.packagingTarget || ""}
                    onChange={(e) => setPackagingTarget(e.target.value)}
                    placeholder="Adet"
                    aria-label="Ek model paketleme hedefi"
                  />
                  {target <= 0 ? (
                    <span className="hidden text-[11px] text-slate-400 sm:inline">Ekran 5</span>
                  ) : null}
                </label>

                <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-violet-100 bg-white/70 px-2.5 py-1.5 dark:border-violet-800/60 dark:bg-slate-900/40 xl:flex-none xl:border-0 xl:bg-transparent xl:px-0 xl:py-0">
                  <input
                    type="checkbox"
                    checked={dayMeta.ekran5ShowPrimary !== false}
                    onChange={(e) => void handleEkran5ShowPrimaryToggle(e.target.checked)}
                    disabled={ekran5PrefSaving}
                    className="h-4 w-4 shrink-0 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="min-w-0 text-xs leading-snug text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">1. model TV&apos;de gözüksün</span>
                    <span className="text-slate-400"> · {ekran5SlideCount} slayt</span>
                    {ekran5PrefSaving ? <span className="text-violet-500"> · …</span> : null}
                  </span>
                </label>
              </>
            ) : null}

            {(metaSaving || saving || dirty) && (
              <span className="text-xs text-violet-600 dark:text-violet-400 xl:ml-auto">
                {metaSaving || saving ? "Kaydediliyor…" : "Kaydedilecek…"}
              </span>
            )}
          </div>

          {dayMeta.secondaryModelId != null && (
            <>
              <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto pb-1 sm:mx-0 sm:mb-4 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {UTU_PAKET_STAGES.map((st) => {
                  const m = UTU_PAKET_STAGE_META[st];
                  const on = activeStage === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setActiveStage(st)}
                      className={`shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-bold transition sm:px-3 sm:py-1.5 sm:text-xs ${
                        on
                          ? "bg-violet-600 text-white shadow"
                          : "border border-violet-200 bg-white text-violet-800 dark:border-violet-700 dark:bg-slate-800 dark:text-violet-200"
                      }`}
                    >
                      {m.label}: {stageTotals[st].toLocaleString("tr-TR")}
                    </button>
                  );
                })}
              </div>

              {loading ? (
                <p className="text-sm text-slate-500">Yükleniyor…</p>
              ) : activeStage === "paketleme" ? (
                <div className="space-y-0 overflow-hidden rounded-2xl border border-violet-200/80 bg-white/60 dark:border-violet-700/50 dark:bg-slate-900/30">
                  {/* Paketleme ilerlemesi — ana giriş ile aynı düzen */}
                  <div className="border-b border-violet-200/80 px-3 py-4 dark:border-violet-700/50 sm:px-5 sm:py-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4 ring-1 ring-emerald-200/60 dark:from-emerald-500/10 dark:to-teal-500/5 dark:ring-emerald-800/40 sm:p-5">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                          {gunPaketLabel}
                        </p>
                        <div className="mt-1 flex items-end gap-3">
                          <p className="text-3xl font-black tabular-nums leading-none text-emerald-900 dark:text-emerald-100 sm:text-4xl">
                            {gunPaketAdet.toLocaleString("tr-TR")}
                          </p>
                          <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">adet</p>
                        </div>
                        <div className="mt-3 border-t border-emerald-200/50 pt-3 dark:border-emerald-800/30">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Toplam okunan</p>
                          <p className="text-lg font-black tabular-nums text-slate-700 dark:text-slate-200">
                            {paketReadCount.toLocaleString("tr-TR")}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/60 dark:bg-slate-800/40 dark:ring-slate-700/50 sm:p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            Paketleme ilerlemesi
                          </p>
                          {target > 0 ? (
                            <span
                              className={`text-sm font-black tabular-nums ${paketPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-200"}`}
                            >
                              %{paketPct}
                            </span>
                          ) : null}
                        </div>
                        {target > 0 ? (
                          <>
                            <div className="mt-3 flex items-end gap-2">
                              <p className="text-2xl font-black tabular-nums leading-none text-slate-800 dark:text-slate-100 sm:text-3xl">
                                {paketReadCount.toLocaleString("tr-TR")}
                              </p>
                              <p className="mb-0.5 text-sm text-slate-400">/ {target.toLocaleString("tr-TR")}</p>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${paketPct >= 100 ? "bg-emerald-500" : "bg-teal-500"}`}
                                style={{ width: `${paketPct}%` }}
                              />
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {paketRemaining > 0
                                  ? `${paketRemaining.toLocaleString("tr-TR")} adet kaldı`
                                  : "Hedef tamamlandı ✓"}
                              </p>
                              <p className="text-xs text-slate-400">Manuel takip</p>
                            </div>
                          </>
                        ) : (
                          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                            İlerleme çubuğu için yukarıdan hedef girin.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Manuel saatlik giriş */}
                  <div className="border-b border-violet-200/80 px-3 py-3 dark:border-violet-700/50 sm:px-5 sm:py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Saatlik giriş</h3>
                        <p className="mt-2 text-lg font-black tabular-nums text-violet-700 dark:text-violet-400 sm:text-xl">
                          Günlük toplam: {stageTotals.paketleme.toLocaleString("tr-TR")} adet
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEkSayimOpen((o) => !o)}
                        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold sm:w-auto ${
                          ekSayimOpen
                            ? "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200"
                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                        aria-expanded={ekSayimOpen}
                      >
                        + Ek adet
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
                      {UTU_PAKET_SLOT_DEFS.map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex flex-col rounded-xl border border-violet-200/90 bg-violet-50/50 p-2.5 sm:rounded-2xl sm:p-3 dark:border-violet-700/50 dark:bg-slate-800/50"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</span>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            className="mt-1.5 w-full rounded-lg border-0 bg-white px-2 py-2 text-center text-lg font-bold tabular-nums text-slate-900 shadow-inner ring-1 ring-violet-200/80 focus:ring-2 focus:ring-violet-500 sm:mt-2 sm:rounded-xl sm:py-3 sm:text-2xl dark:bg-slate-900 dark:text-white dark:ring-violet-700/50"
                            value={data.stages.paketleme[key] || ""}
                            onChange={(e) => setSlot("paketleme", key, e.target.value)}
                            aria-label={`Paketleme ${label}`}
                          />
                        </label>
                      ))}
                    </div>

                    {ekSayimOpen && (() => {
                      const ekVal = data.stageEkSayim?.paketleme ?? 0;
                      return (
                        <div className="mt-4 border-t border-violet-200/80 pt-4 dark:border-violet-700/50">
                          <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            Ek adet saatlik tabloya eklenerek paketleme günlük toplamını günceller.
                          </p>
                          <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                className="w-28 rounded-xl border border-violet-200/90 bg-white px-3 py-2 text-center text-xl font-bold tabular-nums text-slate-900 shadow-inner ring-1 ring-violet-200/80 focus:ring-2 focus:ring-violet-500 dark:border-violet-600 dark:bg-slate-900 dark:text-white dark:ring-violet-700/50"
                                value={ekVal || ""}
                                onChange={(e) => setEkSayim("paketleme", e.target.value)}
                                aria-label="Paketleme ek adet"
                              />
                              <span className="text-sm text-slate-500 dark:text-slate-400">adet</span>
                            </label>
                            <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                              Saatlik: {sumUtuPaketSlots(data.stages.paketleme).toLocaleString("tr-TR")} + ek:{" "}
                              {ekVal.toLocaleString("tr-TR")} ={" "}
                              <strong>{stageTotals.paketleme.toLocaleString("tr-TR")}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mt-4 border-t border-violet-200/80 pt-4 dark:border-violet-700/50">
                      <p className="mb-2 text-xs font-semibold text-slate-500">Gün içi dağılım</p>
                      <MiniSpark values={UTU_PAKET_SLOT_DEFS.map(({ key }) => data.stages.paketleme[key])} />
                    </div>
                  </div>

                  {/* Beden dağılımı */}
                  <div className="border-b border-violet-200/80 px-3 py-3 dark:border-violet-700/50 sm:px-5 sm:py-4">
                    <div className="mb-2 flex items-center justify-between sm:mb-3">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Beden dağılımı</h3>
                      {bedenTotal > 0 && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-600 dark:bg-violet-900/40 dark:text-violet-300 sm:text-xs">
                          {bedenTotal.toLocaleString("tr-TR")}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-5">
                      {UTU_PAKET_SIZE_CODES.map((code) => {
                        const sessionTotal = bedenSessionTotals[code] || 0;
                        return (
                          <label
                            key={code}
                            className="flex flex-col rounded-xl border border-violet-200/90 bg-violet-50/50 p-2 sm:rounded-2xl sm:p-3 dark:border-violet-700/50 dark:bg-slate-800/50"
                          >
                            <span className="text-center text-[10px] font-black uppercase text-slate-500 sm:text-[11px]">{code}</span>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              className="mt-1 w-full rounded-lg border-0 bg-white px-1 py-2 text-center text-base font-bold tabular-nums text-slate-900 shadow-inner ring-1 ring-violet-200/80 focus:ring-2 focus:ring-teal-500 sm:mt-2 sm:py-2.5 sm:text-xl dark:bg-slate-900 dark:text-white dark:ring-violet-700/50"
                              value={data.beden[code] || ""}
                              onChange={(e) => setBeden(code, e.target.value)}
                              aria-label={`Beden ${code} bugün`}
                            />
                            <span className="mt-1 text-center text-[9px] font-semibold tabular-nums text-sky-700 sm:mt-1.5 sm:text-[10px] dark:text-sky-400">
                              {sessionTotal > 0 ? sessionTotal.toLocaleString("tr-TR") : "—"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Beden çeki hedefleri */}
                  {(() => {
                    const bedenToplam = bedenSessionTotals;
                    const hedefToplam = UTU_PAKET_SIZE_CODES.reduce((s, c) => s + (bedenCekiTargets[c] || 0), 0);
                    const bedenCekiToplamAdet = UTU_PAKET_SIZE_CODES.reduce((s, c) => s + (bedenToplam[c] || 0), 0);
                    return (
                      <div className="px-3 py-3 sm:px-5 sm:py-4">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Beden çeki hedefleri</h3>
                          <button
                            type="button"
                            disabled={!modelIdForBeden || bedenCekiSaving || !bedenCekiDirty}
                            onClick={() => void saveBedenCekiTargets()}
                            className="rounded-lg border border-sky-400 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 disabled:opacity-40 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 sm:px-3 sm:py-1.5 sm:text-xs"
                          >
                            {bedenCekiSaving ? "…" : "Kaydet"}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2 md:grid-cols-5">
                          {UTU_PAKET_SIZE_CODES.map((code) => {
                            const toplam = bedenToplam[code] || 0;
                            const hedef = bedenCekiTargets[code] || 0;
                            const pct = hedef > 0 ? Math.min(100, Math.round((toplam / hedef) * 100)) : 0;
                            return (
                              <div
                                key={code}
                                className="flex flex-col gap-1.5 rounded-2xl border border-sky-200/70 bg-white px-3 py-2.5 ring-1 ring-sky-100/80 dark:border-sky-900/50 dark:bg-slate-900/60 dark:ring-sky-900/30"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-black text-sky-700 dark:text-sky-300">{code}</span>
                                  {hedef > 0 && (
                                    <span className="rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-bold tabular-nums text-sky-500 dark:bg-sky-950/40">
                                      {pct}%
                                    </span>
                                  )}
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={bedenCekiTargets[code] || ""}
                                  onChange={(e) => setBedenCekiTarget(code, e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-base font-black tabular-nums text-slate-900 outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-400/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                  placeholder="—"
                                />
                                <p className="text-center text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                                  {toplam > 0 ? toplam.toLocaleString("tr-TR") : "—"}
                                </p>
                                {hedef > 0 && (
                                  <div className="overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/50" style={{ height: "3px" }}>
                                    <div
                                      className="h-full rounded-full bg-sky-400 transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/80 dark:bg-slate-800/50 dark:ring-slate-700/50">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Toplam hedef</span>
                          <span className="text-sm font-black tabular-nums text-slate-800 dark:text-slate-100">
                            {hedefToplam > 0 ? hedefToplam.toLocaleString("tr-TR") : "—"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between rounded-xl bg-sky-50/80 px-3 py-2 ring-1 ring-sky-100/80 dark:bg-sky-950/20 dark:ring-sky-900/30">
                          <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">Toplam paketlenen</span>
                          <span className="text-sm font-black tabular-nums text-sky-800 dark:text-sky-200">
                            {bedenCekiToplamAdet > 0 ? bedenCekiToplamAdet.toLocaleString("tr-TR") : "—"}
                          </span>
                        </div>
                        {bedenCekiMsg ? (
                          <p
                            className={`mt-2 text-xs ${bedenCekiMsg.includes("kaydedildi") ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {bedenCekiMsg}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-white/60 dark:border-violet-700/50 dark:bg-slate-900/30">
                  <div className="px-3 py-3 sm:px-5 sm:py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {UTU_PAKET_STAGE_META[activeStage].label} — saatlik giriş
                        </h3>
                        <p className="mt-2 text-lg font-black tabular-nums text-violet-700 dark:text-violet-400 sm:text-xl">
                          Günlük toplam: {stageTotals[activeStage].toLocaleString("tr-TR")} adet
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEkSayimOpen((o) => !o)}
                        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold sm:w-auto ${
                          ekSayimOpen
                            ? "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200"
                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                        aria-expanded={ekSayimOpen}
                      >
                        + Ek adet
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
                      {UTU_PAKET_SLOT_DEFS.map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex flex-col rounded-xl border border-violet-200/90 bg-violet-50/50 p-2.5 sm:rounded-2xl sm:p-3 dark:border-violet-700/50 dark:bg-slate-800/50"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</span>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            className="mt-1.5 w-full rounded-lg border-0 bg-white px-2 py-2 text-center text-lg font-bold tabular-nums text-slate-900 shadow-inner ring-1 ring-violet-200/80 focus:ring-2 focus:ring-violet-500 sm:mt-2 sm:rounded-xl sm:py-3 sm:text-2xl dark:bg-slate-900 dark:text-white dark:ring-violet-700/50"
                            value={data.stages[activeStage][key] || ""}
                            onChange={(e) => setSlot(activeStage, key, e.target.value)}
                            aria-label={`${UTU_PAKET_STAGE_META[activeStage].label} ${label}`}
                          />
                        </label>
                      ))}
                    </div>

                    {ekSayimOpen && (() => {
                      const ekVal = data.stageEkSayim?.[activeStage] ?? 0;
                      const stageLabel = UTU_PAKET_STAGE_META[activeStage].label;
                      return (
                        <div className="mt-4 border-t border-violet-200/80 pt-4 dark:border-violet-700/50">
                          <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            Ek adet saatlik tabloya eklenerek {stageLabel.toLowerCase()} günlük toplamını günceller. Ana
                            tablodaki saat dilimleri değişmez.
                          </p>
                          <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                className="w-28 rounded-xl border border-violet-200/90 bg-white px-3 py-2 text-center text-xl font-bold tabular-nums text-slate-900 shadow-inner ring-1 ring-violet-200/80 focus:ring-2 focus:ring-violet-500 dark:border-violet-600 dark:bg-slate-900 dark:text-white dark:ring-violet-700/50"
                                value={ekVal || ""}
                                onChange={(e) => setEkSayim(activeStage, e.target.value)}
                                aria-label={`${stageLabel} ek adet`}
                              />
                              <span className="text-sm text-slate-500 dark:text-slate-400">adet</span>
                            </label>
                            <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                              Saatlik: {sumUtuPaketSlots(data.stages[activeStage]).toLocaleString("tr-TR")} + ek:{" "}
                              {ekVal.toLocaleString("tr-TR")} ={" "}
                              <strong>{stageTotals[activeStage].toLocaleString("tr-TR")}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mt-4 border-t border-violet-200/80 pt-4 dark:border-violet-700/50">
                      <p className="mb-2 text-xs font-semibold text-slate-500">Gün içi dağılım</p>
                      <MiniSpark values={UTU_PAKET_SLOT_DEFS.map(({ key }) => data.stages[activeStage][key])} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
