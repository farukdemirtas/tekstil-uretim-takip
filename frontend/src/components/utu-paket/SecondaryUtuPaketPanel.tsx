"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSecondaryDayMeta,
  getUtuPaketSecondary,
  getUtuPaketSecondaryDayMeta,
  listProductModels,
  saveUtuPaketSecondary,
  setUtuPaketSecondaryDayMeta,
  type ProductModelListItem,
  type UtuPaketSecondaryDayMeta,
} from "@/lib/api";
import {
  UTU_PAKET_SIZE_CODES,
  UTU_PAKET_SLOT_DEFS,
  UTU_PAKET_STAGE_META,
  UTU_PAKET_STAGES,
  emptyUtuPaketBeden,
  emptyUtuPaketStages,
  normalizeUtuPaketPayload,
  sumUtuPaketSlots,
  type UtuPaketDayPayload,
  type UtuPaketSlotKey,
  type UtuPaketStage,
} from "@/lib/utuPaket";

const DEBOUNCE_MS = 400;

type Props = {
  selectedDate: string;
  primaryModelId: number | null;
};

export default function SecondaryUtuPaketPanel({ selectedDate, primaryModelId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dayMeta, setDayMeta] = useState<UtuPaketSecondaryDayMeta>({ secondaryModelId: null, modelInfo: null });
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelIdRef = useRef<number | null>(null);

  useEffect(() => {
    modelIdRef.current = dayMeta.secondaryModelId;
  }, [dayMeta.secondaryModelId]);

  const loadMeta = useCallback(async () => {
    try {
      const meta = await getUtuPaketSecondaryDayMeta(selectedDate);
      setDayMeta(meta);
      return meta;
    } catch {
      setDayMeta({ secondaryModelId: null, modelInfo: null });
      return { secondaryModelId: null, modelInfo: null };
    }
  }, [selectedDate]);

  const loadData = useCallback(async (modelId: number) => {
    setLoading(true);
    setError("");
    try {
      const raw = await getUtuPaketSecondary(selectedDate, modelId);
      setData(normalizeUtuPaketPayload({ ...raw, date: selectedDate }));
      setDirty(false);
    } catch {
      setError("İkinci model verisi yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void listProductModels().then(setModels).catch(() => setModels([]));
  }, []);

  useEffect(() => {
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
        setDirty(false);
      }
    })();
  }, [selectedDate, loadMeta, loadData]);

  const persist = useCallback(async (payload: UtuPaketDayPayload, modelId: number) => {
    setSaving(true);
    try {
      await saveUtuPaketSecondary({
        date: selectedDate,
        modelId,
        stages: payload.stages,
        beden: payload.beden,
        stageEkSayim: payload.stageEkSayim,
      });
      setDirty(false);
      setError("");
    } catch {
      setError("Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }, [selectedDate]);

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

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  async function handleModelSelect(modelId: number | null) {
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
      }
    } catch {
      setError("Model ayarlanamadı");
    } finally {
      setMetaSaving(false);
    }
  }

  async function useProductionSecondaryModel() {
    try {
      const prod = await getSecondaryDayMeta(selectedDate);
      if (!prod.secondaryModelId) {
        setError("Üretim ekranında bu gün için ikinci model seçilmemiş");
        return;
      }
      if (prod.secondaryModelId === primaryModelId) {
        setError("İkinci model birincil ütü–paket modeli ile aynı olamaz");
        return;
      }
      await handleModelSelect(prod.secondaryModelId);
    } catch {
      setError("Üretim ikinci modeli alınamadı");
    }
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

  function setBeden(code: string, raw: string) {
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

  const paketTotal = stageTotals.paketleme;
  const bedenTotal = useMemo(
    () => Object.values(data.beden).reduce((s, v) => s + Math.max(0, Math.floor(Number(v) || 0)), 0),
    [data.beden]
  );
  const target = Math.max(0, Math.floor(Number(data.packagingTarget) || 0));

  const selectedModel = dayMeta.modelInfo;

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/60 dark:border-violet-700/50 dark:bg-violet-950/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
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
                ? `Paket: ${paketTotal.toLocaleString("tr-TR")}${target > 0 ? ` / ${target.toLocaleString("tr-TR")}` : ""}`
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
        <div className="border-t border-violet-200 px-5 py-4 dark:border-violet-700/40">
          {error ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold text-violet-800 dark:text-violet-300">Günün 2. modeli:</label>
            <select
              value={dayMeta.secondaryModelId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                void handleModelSelect(val === "" ? null : Number(val));
              }}
              disabled={metaSaving || saving}
              className="rounded-xl border-2 border-violet-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-violet-500 dark:border-violet-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">— Seçilmedi —</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.productName ? `${m.productName} (${m.modelCode})` : m.modelCode}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void useProductionSecondaryModel()}
              className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 dark:border-violet-600 dark:bg-slate-800 dark:text-violet-200 dark:hover:bg-violet-900/40"
            >
              Üretim 2. modelini al
            </button>
            {(metaSaving || saving || dirty) && (
              <span className="text-xs text-violet-600 dark:text-violet-400">
                {metaSaving || saving ? "Kaydediliyor…" : "Kaydedilecek…"}
              </span>
            )}
          </div>

          {dayMeta.secondaryModelId != null && (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {UTU_PAKET_STAGES.map((st) => {
                  const m = UTU_PAKET_STAGE_META[st];
                  const on = activeStage === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setActiveStage(st)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
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
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {UTU_PAKET_SLOT_DEFS.map(({ key, label }) => (
                      <label key={key} className="flex flex-col rounded-xl border border-violet-200 bg-white/80 p-3 dark:border-violet-700 dark:bg-slate-900/50">
                        <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-lg border-0 bg-slate-50 px-2 py-2 text-center text-xl font-bold tabular-nums dark:bg-slate-800"
                          value={data.stages.paketleme[key] || ""}
                          onChange={(e) => setSlot("paketleme", key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-400">Beden dağılımı (günlük)</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {UTU_PAKET_SIZE_CODES.map((code) => (
                        <label key={code} className="flex flex-col rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
                          <span className="text-[10px] font-bold text-slate-500">{code}</span>
                          <input
                            type="number"
                            min={0}
                            className="mt-1 rounded border-0 bg-slate-50 px-1 py-1 text-center font-bold tabular-nums dark:bg-slate-900"
                            value={data.beden[code] || ""}
                            onChange={(e) => setBeden(code, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Beden toplamı: {bedenTotal.toLocaleString("tr-TR")}
                      {target > 0 ? ` · Kalan: ${Math.max(0, target - paketTotal).toLocaleString("tr-TR")}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {UTU_PAKET_SLOT_DEFS.map(({ key, label }) => (
                      <label key={key} className="flex flex-col rounded-xl border border-violet-200 bg-white/80 p-3 dark:border-violet-700 dark:bg-slate-900/50">
                        <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-lg border-0 bg-slate-50 px-2 py-2 text-center text-xl font-bold tabular-nums dark:bg-slate-800"
                          value={data.stages[activeStage][key] || ""}
                          onChange={(e) => setSlot(activeStage, key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Ek adet:</span>
                    <input
                      type="number"
                      min={0}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold dark:border-slate-600 dark:bg-slate-800"
                      value={data.stageEkSayim?.[activeStage] || ""}
                      onChange={(e) => setEkSayim(activeStage, e.target.value)}
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
