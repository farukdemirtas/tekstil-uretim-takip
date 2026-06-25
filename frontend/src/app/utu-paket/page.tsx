"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  deleteUtuPaket,
  getBedenCekiTargets,
  getTakipsanStatus,
  getUtuPaket,
  saveUtuPaket,
  setAuthToken,
  setBedenCekiTargets,
  syncTakipsan,
} from "@/lib/api";
import type { DayProductMeta } from "@/lib/api";
import { clampToWeekdayIso, todayIsoTurkey, todayWeekdayIso } from "@/lib/businessCalendar";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import UtuPaketAnalysis from "@/components/utu-paket/UtuPaketAnalysis";
import {
  UTU_PAKET_SIZE_CODES,
  UTU_PAKET_SLOT_DEFS,
  UTU_PAKET_STAGE_META,
  UTU_PAKET_STAGES,
  emptyUtuPaketBeden,
  emptyUtuPaketStages,
  emptyBedenCekiTargets,
  normalizeTakipsanPackages,
  normalizeUtuPaketPayload,
  resolveUtuPaketLineTarget,
  sumGunPaketlenen,
  sumUtuPaketSlots,
  type UtuPaketDayPayload,
  type UtuPaketSlotKey,
  type UtuPaketSizeCode,
  type UtuPaketStage,
  type TakipsanStatus,
} from "@/lib/utuPaket";

/** Veri girişi: otomatik döngü yok; gizli F5 ile yenileme */

function formatPackageCreatedAt(raw: string): string {
  if (!raw) return "—";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return raw;
  const [, y, mo, d, h, mi] = m;
  const date = `${d}.${mo}.${y}`;
  return h && mi ? `${date} ${h}:${mi}` : date;
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

const STAGE_TAB_CLASS: Record<string, string> = {
  violet: "from-violet-500/15 to-violet-600/5 border-violet-400/40 text-violet-900 dark:text-violet-100",
  amber: "from-amber-500/15 to-amber-600/5 border-amber-400/40 text-amber-900 dark:text-amber-100",
  emerald:
    "from-emerald-500/15 to-emerald-600/5 border-emerald-400/40 text-emerald-900 dark:text-emerald-100",
};

const STAGE_RING: Record<string, string> = {
  violet: "ring-violet-500/50",
  amber: "ring-amber-500/50",
  emerald: "ring-emerald-500/50",
};

function MiniSpark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-10 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className="min-w-[3px] flex-1 rounded-t bg-teal-500/70 dark:bg-teal-400/60"
          style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default function UtuPaketPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayWeekdayIso);
  const [activeStage, setActiveStage] = useState<UtuPaketStage>("optik");
  const [paketPageSize, setPaketPageSize] = useState<number>(10);
  const [paketPage, setPaketPage] = useState<number>(1);
  const [data, setData] = useState<UtuPaketDayPayload>(() => ({
    date: todayWeekdayIso(),
    stages: emptyUtuPaketStages(),
    beden: emptyUtuPaketBeden(),
    packagingTarget: 0,
  }));
  const [dayMeta, setDayMeta] = useState<DayProductMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ekSayimOpen, setEkSayimOpen] = useState(false);
  const [mainTab, setMainTab] = useState<"entry" | "analysis">("entry");
  const [takipsanStatus, setTakipsanStatus] = useState<TakipsanStatus | null>(null);
  const [takipsanSyncing, setTakipsanSyncing] = useState(false);
  const [bedenCekiTargets, setBedenCekiTargetsState] = useState<Record<UtuPaketSizeCode, number>>(() => emptyBedenCekiTargets());
  const [bedenCekiDirty, setBedenCekiDirty] = useState(false);
  const [bedenCekiSaving, setBedenCekiSaving] = useState(false);
  const [bedenCekiMsg, setBedenCekiMsg] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const f5RefreshBusy = useRef(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!isAdminRole() && !hasPermission("utuPaket")) {
      router.replace("/");
      return;
    }
    setAuthToken(token);
    setAuthorized(true);
  }, [router]);

  const loadDay = useCallback(async (date: string) => {
    setLoading(true);
    setSaveMsg(null);
    try {
      const raw = await getUtuPaket(date);
      setData(normalizeUtuPaketPayload({ ...raw, date }));
      setDayMeta(
        raw.utuPaketModel
          ? {
              productName: raw.utuPaketModel.productName,
              productModel: raw.utuPaketModel.productModel,
              modelId: raw.utuPaketModel.modelId,
              metaSource: "hedef" as const,
            }
          : null
      );
      setDirty(false);
    } catch (e) {
      setData(
        normalizeUtuPaketPayload({
          date,
          stages: emptyUtuPaketStages(),
          beden: emptyUtuPaketBeden(),
          packagingTarget: 0,
        })
      );
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Veri yüklenemedi",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadDay(selectedDate);
  }, [authorized, selectedDate, loadDay]);

  const modelIdForBeden = data.utuPaketModel?.modelId ?? null;

  useEffect(() => {
    if (!authorized || !modelIdForBeden) {
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
    return () => { cancelled = true; };
  }, [authorized, modelIdForBeden]);

  async function saveBedenCekiTargets() {
    const mid = data.utuPaketModel?.modelId;
    if (!mid) {
      setBedenCekiMsg("Önce bu güne bir ürün modeli atanmalı (Ayarlar → Ütü–pakete uygula).");
      return;
    }
    setBedenCekiSaving(true);
    setBedenCekiMsg(null);
    try {
      await setBedenCekiTargets(mid, bedenCekiTargets);
      setBedenCekiDirty(false);
      setBedenCekiMsg("Beden çeki hedefleri kaydedildi — Ekran5 güncellenecek.");
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

  const refreshTakipsan = useCallback(async () => {
    try {
      const status = await getTakipsanStatus();
      setTakipsanStatus({
        ...status,
        lastPackages: normalizeTakipsanPackages(status.lastPackages),
      });
      return status;
    } catch {
      setTakipsanStatus(null);
      return null;
    }
  }, []);

  const runTakipsanSync = useCallback(async () => {
    const syncDate = selectedDate || todayIsoTurkey();
    setTakipsanSyncing(true);
    try {
      await syncTakipsan(syncDate);
      await loadDay(syncDate);
      await refreshTakipsan();
    } catch (e) {
      await refreshTakipsan();
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Paketleme verisi güncellenemedi",
      });
    } finally {
      setTakipsanSyncing(false);
    }
  }, [selectedDate, loadDay, refreshTakipsan]);

  /** Paketleme sekmesine geçince tek seferlik senkron; sürekli döngü yok (F5 ile yenilenir) */
  useEffect(() => {
    if (!authorized || mainTab !== "entry" || activeStage !== "paketleme") return;
    void runTakipsanSync();
  }, [authorized, mainTab, activeStage, runTakipsanSync]);

  /** Gizli F5: tarayıcı yenilemesini engelle, veriyi arka planda güncelle */
  useEffect(() => {
    if (!authorized || mainTab !== "entry") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "F5") return;
      e.preventDefault();
      if (f5RefreshBusy.current) return;
      f5RefreshBusy.current = true;

      void (async () => {
        try {
          if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
          }
          if (dirty) await persist(data);
          if (activeStage === "paketleme") {
            await runTakipsanSync();
          } else {
            await loadDay(selectedDate);
            await refreshTakipsan();
          }
          setSaveMsg({ ok: true, text: "Veriler yenilendi" });
          window.setTimeout(() => setSaveMsg(null), 2000);
        } catch (err) {
          setSaveMsg({
            ok: false,
            text: err instanceof Error ? err.message : "Yenileme başarısız",
          });
        } finally {
          f5RefreshBusy.current = false;
        }
      })();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    authorized,
    mainTab,
    activeStage,
    dirty,
    data,
    selectedDate,
    loadDay,
    runTakipsanSync,
    refreshTakipsan,
  ]);

  const stageTotals = useMemo(() => {
    const out = {} as Record<UtuPaketStage, number>;
    for (const st of UTU_PAKET_STAGES) {
      const slotSum = sumUtuPaketSlots(data.stages[st]);
      const ekSayim =
        st !== "paketleme" ? (data.stageEkSayim?.[st as "optik" | "utu"] ?? 0) : 0;
      out[st] = slotSum + ekSayim;
    }
    return out;
  }, [data.stages, data.stageEkSayim]);

  const bedenTotal = useMemo(
    () => UTU_PAKET_SIZE_CODES.reduce((s, c) => s + (data.beden[c] || 0), 0),
    [data.beden]
  );

  const paketPackages = useMemo(() => {
    const fromDay = normalizeTakipsanPackages(data.takipsan?.packages);
    const fromStatus = normalizeTakipsanPackages(takipsanStatus?.lastPackages);
    const dayHasDates = fromDay.some((row) => row.createdAt);
    const statusHasDates = fromStatus.some((row) => row.createdAt);
    let rows: typeof fromDay;
    if (dayHasDates) rows = fromDay;
    else if (statusHasDates) rows = fromStatus;
    else if (fromDay.length > 0) rows = fromDay;
    else rows = fromStatus;
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.takipsan?.packages, takipsanStatus?.lastPackages]);
  const paketReadCount = data.takipsan?.readCount ?? stageTotals.paketleme;
  const paketPackageCount = Math.max(
    data.takipsan?.packageCount ?? 0,
    takipsanStatus?.lastPackageCount ?? 0
  );
  const paketOrderQty = resolveUtuPaketLineTarget(data, 0);
  const paketRemaining = Math.max(0, paketOrderQty - paketReadCount);

  const gunPaketOzeti = useMemo(
    () => sumGunPaketlenen(paketPackages, selectedDate),
    [paketPackages, selectedDate]
  );

  const gunPaketLabel =
    selectedDate === todayIsoTurkey()
      ? "Bugün paketlenen"
      : `${formatDayLabel(selectedDate)} paketlenen`;

  const pipelineMin = useMemo(() => {
    const vals = UTU_PAKET_STAGES.map((s) => stageTotals[s]).filter((n) => n > 0);
    return vals.length ? Math.min(...vals) : 0;
  }, [stageTotals]);

  async function persist(next: UtuPaketDayPayload) {
    setSaving(true);
    try {
      const payload = normalizeUtuPaketPayload({ ...next, date: selectedDate });
      // packagingTarget yalnızca otomatik senkronla güncellenir — elle gönderilmez
      await saveUtuPaket({
        date: payload.date,
        stages: payload.stages,
        beden: payload.beden,
        stageEkSayim: payload.stageEkSayim,
      });
      setData(payload);
      setDirty(false);
      setSaveMsg({ ok: true, text: "Kaydedildi" });
      window.setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Kayıt başarısız",
      });
    } finally {
      setSaving(false);
    }
  }

  function scheduleSave(next: UtuPaketDayPayload) {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(next);
    }, 900);
  }

  function setSlot(stage: UtuPaketStage, key: UtuPaketSlotKey, raw: string) {
    const v = Math.max(0, parseInt(raw, 10) || 0);
    setData((prev) => {
      const next = {
        ...prev,
        stages: {
          ...prev.stages,
          [stage]: { ...prev.stages[stage], [key]: v },
        },
      };
      scheduleSave(next);
      return next;
    });
  }

  function setEkSayim(stage: "optik" | "utu", raw: string) {
    const v = Math.max(0, parseInt(raw, 10) || 0);
    setData((prev) => {
      const next = {
        ...prev,
        stageEkSayim: { ...prev.stageEkSayim, [stage]: v },
      };
      scheduleSave(next);
      return next;
    });
  }

  async function handleDateChange(iso: string) {
    const next = clampToWeekdayIso(iso);
    if (next === selectedDate) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirty) {
      await persist(data);
    }
    setSelectedDate(next);
  }

  async function handleDeleteDay() {
    setDeleting(true);
    try {
      await deleteUtuPaket(selectedDate);
      setDeleteOpen(false);
      await loadDay(selectedDate);
      setSaveMsg({ ok: true, text: "Günün ütü–paket verisi silindi" });
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Silinemedi",
      });
    } finally {
      setDeleting(false);
    }
  }

  const meta = UTU_PAKET_STAGE_META[activeStage];
  const slotValues = UTU_PAKET_SLOT_DEFS.map(({ key }) => data.stages[activeStage][key]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 pb-16 sm:px-6">
      <header className="surface-card mb-6 overflow-hidden p-0 dark:text-slate-100">
        <div className="bg-gradient-to-br from-teal-600/90 via-teal-700/85 to-slate-900 px-5 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-100/90">
                Bitim hattı · bağımsız kayıt
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Ütü–Paket Takip</h1>
              <p className="mt-2 max-w-xl text-sm text-teal-50/90">
                Optik → Ütü → Paketleme. Optik ve ütü saatlik girilir; paketleme otomatik güncellenir.
              </p>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20"
            >
              ← Ana sayfa
            </Link>
          </div>
        </div>

        <nav
          className="flex gap-1 border-t border-slate-200/80 px-4 pt-3 dark:border-slate-700/80 sm:px-5"
          aria-label="Sayfa sekmeleri"
        >
          {(
            [
              { id: "entry" as const, label: "Veri girişi" },
              { id: "analysis" as const, label: "Analiz" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (mainTab === "entry" && tab.id !== "entry" && dirty) {
                  if (saveTimer.current) clearTimeout(saveTimer.current);
                  void persist(data);
                }
                setMainTab(tab.id);
              }}
              className={`rounded-t-xl px-5 py-2.5 text-sm font-semibold transition ${
                mainTab === tab.id
                  ? "bg-white text-teal-800 shadow-sm ring-1 ring-slate-200/90 dark:bg-slate-800 dark:text-teal-200 dark:ring-slate-600"
                  : "text-slate-600 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:bg-slate-800/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <Link
            href="/ekran5"
            className="rounded-t-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-400 dark:hover:bg-slate-800/50"
          >
            Ekran 5 ↗
          </Link>
        </nav>

        {mainTab === "entry" ? (
          <div className="flex flex-col gap-3 border-t border-slate-200/80 px-4 py-4 dark:border-slate-700/80 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
            <WeekdayDatePicker
              label="Veri tarihi"
              className="w-full sm:w-auto sm:min-w-[16rem]"
              value={selectedDate}
              onChange={(d) => void handleDateChange(d)}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:justify-end">
              {(dayMeta?.productName || dayMeta?.productModel) ? (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Ütü–paket modeli: </span>
                  {[dayMeta.productName, dayMeta.productModel].filter(Boolean).join(" · ")}
                </p>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Bu gün için model atanmamış — Ayarlar → Ürün modelleri → «Ütü–pakete uygula»
                </p>
              )}
              {saving || dirty ? (
                <span className="text-xs font-medium text-teal-700 dark:text-teal-400">Kaydediliyor…</span>
              ) : saveMsg ? (
                <span
                  className={`text-xs font-medium ${saveMsg.ok ? "text-teal-700 dark:text-teal-400" : "text-red-600 dark:text-red-400"}`}
                >
                  {saveMsg.text}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {mainTab === "analysis" ? (
        <UtuPaketAnalysis
          onOpenDay={(iso) => {
            setMainTab("entry");
            void handleDateChange(iso);
          }}
        />
      ) : (
        <>
      {/* KPI şeridi */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {UTU_PAKET_STAGES.map((st) => {
          const m = UTU_PAKET_STAGE_META[st];
          const total = stageTotals[st];
          const slots = data.stages[st];
          return (
            <button
              key={st}
              type="button"
              onClick={() => setActiveStage(st)}
              className={`surface-card group text-left transition hover:shadow-md ${
                activeStage === st ? `ring-2 ${STAGE_RING[m.accent]}` : ""
              }`}
            >
              <div
                className={`rounded-t-2xl border-b bg-gradient-to-br px-4 py-3 ${STAGE_TAB_CLASS[m.accent]}`}
              >
                <p className="text-lg font-bold">{m.label}</p>
              </div>
              <div className="px-4 py-3">
                {st === "paketleme" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Hedef</p>
                        <p className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">
                          {loading || paketOrderQty <= 0 ? "—" : paketOrderQty.toLocaleString("tr-TR")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Kalan</p>
                        <p className="text-lg font-black tabular-nums text-amber-800 dark:text-amber-300">
                          {loading || paketOrderQty <= 0 ? "—" : paketRemaining.toLocaleString("tr-TR")}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Toplam</p>
                      <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                        {loading ? "—" : paketReadCount.toLocaleString("tr-TR")}
                      </p>
                    </div>
                    <div className="border-t border-emerald-200/80 pt-2 dark:border-emerald-900/40">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        {selectedDate === todayIsoTurkey() ? "Bugün" : formatDayLabel(selectedDate)}
                      </p>
                      <p className="text-xl font-black tabular-nums text-emerald-800 dark:text-emerald-300">
                        {loading ? "—" : gunPaketOzeti.adet.toLocaleString("tr-TR")}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                      {loading ? "—" : total.toLocaleString("tr-TR")}
                    </p>
                    <MiniSpark values={UTU_PAKET_SLOT_DEFS.map(({ key }) => slots[key])} />
                  </>
                )}
              </div>
            </button>
          );
        })}
        <div className="surface-card flex flex-col justify-center px-4 py-4 lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hat dengesi</p>
          <p className="mt-1 text-xl font-bold text-teal-700 dark:text-teal-400">
            {loading ? "—" : pipelineMin > 0 ? pipelineMin.toLocaleString("tr-TR") : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">Dolu aşamaların minimumu (darboğaz)</p>
        </div>
      </section>

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Günü temizle
        </button>
      </div>

      {/* Sekmeler */}
      <nav
        className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white/60 p-1.5 dark:border-slate-700/80 dark:bg-slate-900/40"
        aria-label="Aşamalar"
      >
        {UTU_PAKET_STAGES.map((st) => {
          const m = UTU_PAKET_STAGE_META[st];
          const on = activeStage === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setActiveStage(st)}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                on
                  ? `bg-gradient-to-br shadow-sm ${STAGE_TAB_CLASS[m.accent]}`
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {m.label}
              <span className="ml-2 tabular-nums opacity-80">
                ({loading ? "…" : stageTotals[st]})
              </span>
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="surface-card flex justify-center py-16 text-sm text-slate-500">Yükleniyor…</div>
      ) : activeStage === "paketleme" ? (
        <section className="surface-card dark:text-slate-100">
          {/* ── Başlık ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15">
                <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Paketleme</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Takipsan · otomatik (~1 dk)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.takipsan?.orderCode && (
                <span className="rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {data.takipsan.orderCode}
                </span>
              )}
              {takipsanSyncing ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-800">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" />
                  Güncelleniyor
                </span>
              ) : data.takipsan?.syncedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {new Date(data.takipsan.syncedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Bekleniyor
                </span>
              )}
            </div>
          </div>

          {takipsanStatus?.lastError && (
            <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{takipsanStatus.lastError}</span>
            </div>
          )}

          {/* ── Hero: bugün paketlenen + ilerleme ── */}
          {(() => {
            const pct = paketOrderQty > 0 ? Math.min(100, Math.round((paketReadCount / paketOrderQty) * 100)) : 0;
            const remaining = Math.max(0, paketOrderQty - paketReadCount);
            return (
              <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Sol: bugün paketlenen — ön planda */}
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-5 ring-1 ring-emerald-200/60 dark:from-emerald-500/10 dark:to-teal-500/5 dark:ring-emerald-800/40">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                      {gunPaketLabel}
                    </p>
                    <div className="mt-1 flex items-end gap-3">
                      <p className="text-5xl font-black tabular-nums leading-none text-emerald-900 dark:text-emerald-100">
                        {gunPaketOzeti.adet.toLocaleString("tr-TR")}
                      </p>
                      <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">adet</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3 border-t border-emerald-200/50 pt-3 dark:border-emerald-800/30">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-500">Paket</p>
                        <p className="text-lg font-black tabular-nums text-emerald-800 dark:text-emerald-200">
                          {gunPaketOzeti.paket.toLocaleString("tr-TR")}
                        </p>
                      </div>
                      <div className="h-8 w-px bg-emerald-200/60 dark:bg-emerald-800/40" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Toplam okunan</p>
                        <p className="text-lg font-black tabular-nums text-slate-700 dark:text-slate-200">
                          {paketReadCount.toLocaleString("tr-TR")}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Sağ: sipariş ilerleme */}
                  <div className="rounded-2xl bg-slate-50/80 p-5 ring-1 ring-slate-200/60 dark:bg-slate-800/40 dark:ring-slate-700/50">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Sipariş ilerlemesi
                      </p>
                      <span className={`text-sm font-black tabular-nums ${pct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-200"}`}>
                        %{pct}
                      </span>
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <p className="text-3xl font-black tabular-nums leading-none text-slate-800 dark:text-slate-100">
                        {paketReadCount.toLocaleString("tr-TR")}
                      </p>
                      <p className="mb-0.5 text-sm text-slate-400">/ {paketOrderQty.toLocaleString("tr-TR")}</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-emerald-500" : "bg-teal-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {remaining > 0 ? `${remaining.toLocaleString("tr-TR")} adet kaldı` : "Sipariş tamamlandı ✓"}
                      </p>
                      <p className="text-xs text-slate-400">{paketPackageCount.toLocaleString("tr-TR")} paket</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Beden dağılımı ── */}
          <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">Beden dağılımı</h3>
            <div className="grid gap-2 sm:grid-cols-5">
              {UTU_PAKET_SIZE_CODES.map((code) => {
                const count = data.beden[code] || 0;
                const pct = bedenTotal > 0 ? Math.round((count / bedenTotal) * 100) : 0;
                return (
                  <div
                    key={code}
                    className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black text-slate-700 dark:text-slate-200">{code}</span>
                      {pct > 0 && (
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">%{pct}</span>
                      )}
                    </div>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                      {count.toLocaleString("tr-TR")}
                    </p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Beden çeki hedefleri (Ekran5) ── */}
          <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Beden çeki hedefleri</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  XS–XL için hedef adet; Ekran5 «Beden Tablosu» slaytında gösterilir.
                </p>
              </div>
              <button
                type="button"
                disabled={!modelIdForBeden || bedenCekiSaving || !bedenCekiDirty}
                onClick={() => void saveBedenCekiTargets()}
                className="rounded-lg border border-sky-400 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-40 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200"
              >
                {bedenCekiSaving ? "Kaydediliyor…" : "Hedefleri kaydet"}
              </button>
            </div>
            {!modelIdForBeden ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                Bu güne atanmış ürün modeli yok. Ayarlar → Ürün modelleri → «Ütü–Paket İçin Uygula» ile model atayın.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-5">
                {UTU_PAKET_SIZE_CODES.map((code) => (
                  <div
                    key={code}
                    className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3 ring-1 ring-sky-100 dark:border-sky-900/50 dark:bg-sky-950/20 dark:ring-sky-900/30"
                  >
                    <label className="mb-1.5 block text-center text-sm font-black text-sky-800 dark:text-sky-200">{code}</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={bedenCekiTargets[code] || ""}
                      onChange={(e) => setBedenCekiTarget(code, e.target.value)}
                      className="w-full rounded-lg border border-sky-200 bg-white px-2 py-2 text-center text-lg font-black tabular-nums text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 dark:border-sky-800 dark:bg-slate-900 dark:text-white"
                      placeholder="0"
                    />
                    <p className="mt-1 text-center text-[10px] text-slate-500 dark:text-slate-400">
                      Bugün: {(data.beden[code] || 0).toLocaleString("tr-TR")}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {bedenCekiMsg ? (
              <p className={`mt-2 text-xs ${bedenCekiMsg.includes("kaydedildi") ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {bedenCekiMsg}
              </p>
            ) : null}
          </div>

          {paketPackages.length > 0 ? (() => {
            const totalPages = Math.max(1, Math.ceil(paketPackages.length / paketPageSize));
            const safePage = Math.min(paketPage, totalPages);
            const pageStart = (safePage - 1) * paketPageSize;
            const pageRows = paketPackages.slice(pageStart, pageStart + paketPageSize);

            // Sayfa numaraları: daima 1 ve son, ortada mevcut etrafında en fazla 5
            const makePageNums = () => {
              const nums: (number | "…")[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) nums.push(i);
              } else {
                nums.push(1);
                if (safePage > 3) nums.push("…");
                for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) nums.push(i);
                if (safePage < totalPages - 2) nums.push("…");
                nums.push(totalPages);
              }
              return nums;
            };

            return (
              <div className="border-t border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
                {/* Başlık + sayfa boyutu seçici */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Paket listesi</h3>
                  <div className="flex items-center gap-2">
                    <label htmlFor="paket-page-size" className="text-xs text-slate-500 dark:text-slate-400">Sayfa başına</label>
                    <select
                      id="paket-page-size"
                      value={paketPageSize}
                      onChange={(e) => { setPaketPageSize(Number(e.target.value)); setPaketPage(1); }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {[10, 25, 50, 100].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Tablo */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                        <th className="px-3 py-2">Paket</th>
                        <th className="px-3 py-2">Adet</th>
                        <th className="px-3 py-2">Beden</th>
                        <th className="px-3 py-2">Durum</th>
                        <th className="px-3 py-2">Oluşturma tarihi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, i) => (
                        <tr
                          key={`${row.packageNo}-${i}`}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        >
                          <td className="px-3 py-2 font-medium">{row.packageNo}</td>
                          <td className="px-3 py-2 tabular-nums">{row.items.toLocaleString("tr-TR")}</td>
                          <td className="px-3 py-2 font-semibold">{row.size}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.status}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                            {formatPackageCreatedAt(row.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Alt: kayıt özeti + sayfalama */}
                {totalPages > 1 && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {paketPackages.length} kayıttan {pageStart + 1}–{Math.min(pageStart + paketPageSize, paketPackages.length)} arası
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPaketPage((p) => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Önceki
                      </button>
                      {makePageNums().map((n, idx) =>
                        n === "…" ? (
                          <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-slate-400">…</span>
                        ) : (
                          <button
                            key={n}
                            onClick={() => setPaketPage(n)}
                            className={`min-w-[28px] rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                              n === safePage
                                ? "border-teal-500 bg-teal-500 text-white dark:border-teal-500 dark:bg-teal-600"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            }`}
                          >
                            {n}
                          </button>
                        )
                      )}
                      <button
                        onClick={() => setPaketPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Sonraki
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })() : null}
        </section>
      ) : (
        <section className="surface-card dark:text-slate-100">
          <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{meta.label}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">{meta.description}</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-teal-700 dark:text-teal-400">
                  Günlük toplam: {stageTotals[activeStage].toLocaleString("tr-TR")} adet
                </p>
              </div>
              {(activeStage === "optik" || activeStage === "utu") && (
                <button
                  type="button"
                  onClick={() => setEkSayimOpen((o) => !o)}
                  className={`mt-0.5 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                    ekSayimOpen
                      ? "border-teal-400 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-200"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                  aria-expanded={ekSayimOpen}
                  title="Ek adet girişi"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Ek adet
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {UTU_PAKET_SLOT_DEFS.map(({ key, label }) => (
              <label
                key={key}
                className="group flex flex-col rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3 transition focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/30 dark:border-slate-600/80 dark:bg-slate-800/50"
              >
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {label}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="mt-2 w-full rounded-xl border-0 bg-white px-3 py-3 text-center text-2xl font-bold tabular-nums text-slate-900 shadow-inner ring-1 ring-slate-200/80 focus:ring-2 focus:ring-teal-500 dark:bg-slate-900 dark:text-white dark:ring-slate-600"
                  value={data.stages[activeStage][key] || ""}
                  onChange={(e) => setSlot(activeStage, key, e.target.value)}
                  aria-label={`${meta.label} ${label}`}
                />
              </label>
            ))}
          </div>

          {(activeStage === "optik" || activeStage === "utu") && ekSayimOpen && (() => {
            const ekStage = activeStage;
            const ekVal = data.stageEkSayim?.[ekStage] ?? 0;
            return (
              <div className="border-t border-slate-200/80 bg-slate-50/40 px-5 py-4 dark:border-slate-700/80 dark:bg-slate-800/20">
                <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Aşağıdaki ek adet saatlik tabloya eklenerek günlük toplamı günceller.
                  Ana tablodaki saat dilimleri değişmez.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="w-28 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-center text-xl font-bold tabular-nums text-slate-900 shadow-inner ring-1 ring-slate-200/80 focus:ring-2 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:ring-slate-600"
                      value={ekVal || ""}
                      onChange={(e) => setEkSayim(ekStage, e.target.value)}
                      aria-label={`${meta.label} ek adet`}
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">adet</span>
                  </label>
                  {ekVal > 0 && (
                    <p className="text-xs text-teal-600 dark:text-teal-400">
                      Saatlik: {sumUtuPaketSlots(data.stages[activeStage]).toLocaleString("tr-TR")} + ek: {ekVal.toLocaleString("tr-TR")} ={" "}
                      <strong>{stageTotals[activeStage].toLocaleString("tr-TR")}</strong>
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="border-t border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <p className="mb-2 text-xs font-semibold text-slate-500">Gün içi dağılım</p>
            <MiniSpark values={slotValues} />
          </div>
        </section>
      )}

        </>
      )}

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-utu-paket-title"
        >
          <div className="surface-card max-w-md p-6 dark:text-slate-100">
            <h2 id="delete-utu-paket-title" className="text-lg font-bold">
              Günü temizle?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              <strong>
                {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("tr-TR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>{" "}
              için tüm ütü–paket saatlik ve beden kayıtları silinir. Ana üretim verisi etkilenmez.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteDay()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? "Siliniyor…" : "Sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
