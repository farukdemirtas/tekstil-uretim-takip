"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  deleteUtuPaket,
  getDayProductMeta,
  getTakipsanStatus,
  getUtuPaket,
  saveUtuPaket,
  setAuthToken,
} from "@/lib/api";
import type { DayProductMeta } from "@/lib/api";
import { clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import UtuPaketAnalysis from "@/components/utu-paket/UtuPaketAnalysis";
import UtuPaketEkran5 from "@/components/utu-paket/UtuPaketEkran5";
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
  type TakipsanStatus,
} from "@/lib/utuPaket";

const TAKIPSAN_REFRESH_MS = 30_000;

const STAGE_TAB_CLASS: Record<string, string> = {
  sky: "from-sky-500/15 to-sky-600/5 border-sky-400/40 text-sky-900 dark:text-sky-100",
  violet: "from-violet-500/15 to-violet-600/5 border-violet-400/40 text-violet-900 dark:text-violet-100",
  amber: "from-amber-500/15 to-amber-600/5 border-amber-400/40 text-amber-900 dark:text-amber-100",
  emerald:
    "from-emerald-500/15 to-emerald-600/5 border-emerald-400/40 text-emerald-900 dark:text-emerald-100",
};

const STAGE_RING: Record<string, string> = {
  sky: "ring-sky-500/50",
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
  const [activeStage, setActiveStage] = useState<UtuPaketStage>("temizleme");
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
  const [mainTab, setMainTab] = useState<"entry" | "analysis" | "ekran5">("entry");
  const [takipsanStatus, setTakipsanStatus] = useState<TakipsanStatus | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const [raw, meta] = await Promise.all([
        getUtuPaket(date),
        getDayProductMeta(date).catch(() => null),
      ]);
      setData(normalizeUtuPaketPayload({ ...raw, date }));
      setDayMeta(meta);
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

  const refreshTakipsan = useCallback(async () => {
    try {
      const status = await getTakipsanStatus();
      setTakipsanStatus(status);
    } catch {
      setTakipsanStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!authorized || mainTab !== "entry" || activeStage !== "paketleme") return;
    void refreshTakipsan();
    const id = window.setInterval(() => {
      void loadDay(selectedDate);
      void refreshTakipsan();
    }, TAKIPSAN_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [authorized, mainTab, activeStage, selectedDate, loadDay, refreshTakipsan]);

  const stageTotals = useMemo(() => {
    const out = {} as Record<UtuPaketStage, number>;
    for (const st of UTU_PAKET_STAGES) {
      out[st] = sumUtuPaketSlots(data.stages[st]);
    }
    return out;
  }, [data.stages]);

  const bedenTotal = useMemo(
    () => UTU_PAKET_SIZE_CODES.reduce((s, c) => s + (data.beden[c] || 0), 0),
    [data.beden]
  );

  const paketPackages =
    takipsanStatus?.lastPackages?.length
      ? takipsanStatus.lastPackages
      : [];
  const paketReadCount = data.takipsan?.readCount ?? stageTotals.paketleme;
  const paketPackageCount =
    data.takipsan?.packageCount ?? takipsanStatus?.lastPackageCount ?? 0;
  const paketOrderQty = data.takipsan?.orderQuantity ?? data.packagingTarget ?? 0;

  const pipelineMin = useMemo(() => {
    const vals = UTU_PAKET_STAGES.map((s) => stageTotals[s]).filter((n) => n > 0);
    return vals.length ? Math.min(...vals) : 0;
  }, [stageTotals]);

  async function persist(next: UtuPaketDayPayload) {
    setSaving(true);
    try {
      const payload = normalizeUtuPaketPayload({ ...next, date: selectedDate });
      // packagingTarget yalnızca Takipsan senkronundan güncellenir — elle gönderilmez
      await saveUtuPaket({
        date: payload.date,
        stages: payload.stages,
        beden: payload.beden,
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
                Temizleme → Optik → Ütü → Paketleme. İlk üç aşama saatlik girilir; paketleme Takipsan&apos;dan
                otomatik çekilir.
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
              { id: "ekran5" as const, label: "Ekran 5" },
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
        </nav>

        {mainTab === "entry" ? (
          <div className="flex flex-col gap-3 border-t border-slate-200/80 px-4 py-4 dark:border-slate-700/80 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
            <WeekdayDatePicker
              label="Tarih"
              className="w-full sm:w-auto sm:min-w-[16rem]"
              value={selectedDate}
              onChange={(d) => void handleDateChange(d)}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:justify-end">
              {(dayMeta?.productName || dayMeta?.productModel) && (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Ürün: </span>
                  {[dayMeta.productName, dayMeta.productModel].filter(Boolean).join(" · ")}
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
      ) : mainTab === "ekran5" ? (
        <UtuPaketEkran5 dateIso={selectedDate} embedded />
      ) : (
        <>
      {/* KPI şeridi */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                  {loading ? "—" : total.toLocaleString("tr-TR")}
                </p>
                <MiniSpark values={UTU_PAKET_SLOT_DEFS.map(({ key }) => slots[key])} />
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
          <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Paketleme — Takipsan</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Veriler TS820 / Takipsan Plus sevkiyatından otomatik çekilir (~30 sn).
                </p>
              </div>
              {data.takipsan?.syncedAt ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Son senkron:{" "}
                  {new Date(data.takipsan.syncedAt).toLocaleString("tr-TR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              ) : null}
            </div>
            {takipsanStatus?.lastError ? (
              <p className="mt-3 rounded-xl border border-red-300/80 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                Takipsan hatası: {takipsanStatus.lastError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Sipariş sayısı",
                sub: "Takipsan — paketlenmesi gereken",
                value: paketOrderQty,
                accent: "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30",
              },
              {
                label: "Okunan sayısı",
                sub: "Paketlenen ürün",
                value: paketReadCount,
                accent: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/30",
              },
              {
                label: "Paket sayısı",
                sub: "Takipsan — oluşturulan paket",
                value: paketPackageCount,
                accent: "border-sky-200 bg-sky-50/80 dark:border-sky-900/40 dark:bg-sky-950/30",
              },
              {
                label: "Beden toplamı",
                sub: "Paket içi adet",
                value: bedenTotal,
                accent: "border-violet-200 bg-violet-50/80 dark:border-violet-900/40 dark:bg-violet-950/30",
              },
            ].map((card) => (
              <div
                key={card.label}
                className={`rounded-2xl border p-4 ${card.accent}`}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="text-[11px] text-slate-500">{card.sub}</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-slate-900 dark:text-white">
                  {card.value.toLocaleString("tr-TR")}
                </p>
              </div>
            ))}
          </div>

          {data.takipsan?.orderCode ? (
            <p className="px-5 pb-2 text-sm text-slate-600 dark:text-slate-400">
              Sipariş kodu: <strong>{data.takipsan.orderCode}</strong>
            </p>
          ) : null}

          <div className="border-t border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Beden dağılımı</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {UTU_PAKET_SIZE_CODES.map((code) => {
                const count = data.beden[code] || 0;
                const pct = bedenTotal > 0 ? Math.round((count / bedenTotal) * 100) : 0;
                return (
                  <div
                    key={code}
                    className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-white p-4 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-slate-900/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-black text-emerald-800 dark:text-emerald-300">{code}</span>
                      {bedenTotal > 0 ? (
                        <span className="text-xs font-semibold text-slate-500">%{pct}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {count.toLocaleString("tr-TR")}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {paketPackages.length > 0 ? (
            <div className="border-t border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Paket listesi</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                      <th className="px-3 py-2">Paket</th>
                      <th className="px-3 py-2">Adet</th>
                      <th className="px-3 py-2">Beden</th>
                      <th className="px-3 py-2">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paketPackages.map((row, i) => (
                      <tr
                        key={`${row.packageNo}-${i}`}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-3 py-2 font-medium">{row.packageNo}</td>
                        <td className="px-3 py-2 tabular-nums">{row.items.toLocaleString("tr-TR")}</td>
                        <td className="px-3 py-2 font-semibold">{row.size}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="surface-card dark:text-slate-100">
          <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{meta.label}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{meta.description}</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-teal-700 dark:text-teal-400">
              Günlük toplam: {stageTotals[activeStage].toLocaleString("tr-TR")} adet
            </p>
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
