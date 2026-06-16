"use client";

/**
 * Ekran 1B — İkinci Model TV Görünümü
 * Bantda iki model aynı anda üretildiğinde ikinci modelin günlük ilerlemesini gösterir.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getSecondaryDayMeta,
  getSecondarySimpleTotals,
  getEkran5Target,
  setEkran5Target,
  getEkranRefreshSignal,
  setAuthToken,
  type SecondaryDayMeta,
} from "@/lib/api";
import { todayIsoTurkey, todayWorkdayIsoTurkey } from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";

const AUTO_REFRESH_MS = 30_000;

const STAGE_COLORS = [
  { bar: "from-emerald-500 via-teal-500 to-cyan-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300", pct: "text-emerald-800" },
  { bar: "from-blue-500 via-indigo-500 to-violet-500", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-300", pct: "text-blue-800" },
  { bar: "from-amber-500 via-orange-500 to-red-400", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", pct: "text-amber-800" },
  { bar: "from-violet-500 via-purple-500 to-pink-500", text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-300", pct: "text-violet-800" },
  { bar: "from-teal-500 via-cyan-500 to-sky-500", text: "text-teal-700", bg: "bg-teal-50", border: "border-teal-300", pct: "text-teal-800" },
  { bar: "from-rose-500 via-pink-500 to-fuchsia-500", text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-300", pct: "text-rose-800" },
];

function HedefModal({
  apiTarget,
  manualTarget,
  productLabel,
  onSave,
  onClear,
  onClose,
}: {
  apiTarget: number;
  manualTarget: number | null;
  productLabel: string;
  onSave: (v: number) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [input, setInput] = useState(
    manualTarget != null ? String(manualTarget) : apiTarget > 0 ? String(apiTarget) : ""
  );
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSave() {
    const v = parseInt(input.replace(/\D/g, ""), 10);
    if (!Number.isFinite(v) || v <= 0) return;
    void onSave(v);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">Hedef Ayarla</h3>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {productLabel ? (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            {productLabel}
          </p>
        ) : null}
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${manualTarget != null ? "bg-amber-400" : "bg-emerald-400"}`} />
          <span className="font-semibold text-slate-600">
            {manualTarget != null
              ? `El ile: ${manualTarget.toLocaleString("tr-TR")}`
              : apiTarget > 0
                ? `Modelden: ${apiTarget.toLocaleString("tr-TR")}`
                : "Model: veri yok"}
          </span>
        </div>
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-bold text-slate-700">El ile hedef (adet)</label>
          <input
            ref={inputRef}
            type="number"
            min={1}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-2.5 text-center text-xl font-black tabular-nums text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-400/30"
            placeholder="Örn: 23500"
          />
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={handleSave}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-violet-700">
            Kaydet
          </button>
          <button type="button" onClick={() => void onClear()}
            className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100">
            Modelden al {apiTarget > 0 ? `(${apiTarget.toLocaleString("tr-TR")})` : ""}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border-2 border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDateTr(iso: string) {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function calcPercent(val: number, target: number) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((val / target) * 100)));
}

export default function Ekran1BIcerikPage() {
  const [hasToken, setHasToken] = useState(false);
  const [dayMeta, setDayMeta] = useState<SecondaryDayMeta>({ secondaryModelId: null, modelInfo: null });
  const [stages, setStages] = useState<{ sortOrder: number; teamCode: string; processName: string; teamLabel: string; total: number }[]>([]);
  const [dailySummaryStages, setDailySummaryStages] = useState<{ sortOrder: number; teamCode: string; processName: string; teamLabel: string; total: number }[]>([]);
  const [manualTarget, setManualTarget] = useState<number | null>(null);
  const [apiTarget, setApiTarget] = useState<number>(0);
  const [hedefOpen, setHedefOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const today = todayWorkdayIsoTurkey();

  const target = useMemo(
    () => manualTarget != null && manualTarget > 0 ? manualTarget : apiTarget,
    [manualTarget, apiTarget]
  );
  // Günlük özet prosesleri yapılandırılmışsa TOPLAMLARINI kullan (ekran1 mantığıyla aynı);
  // yoksa tüm aşamaların minimumuna geri dön.
  const bitenTotal = useMemo(() => {
    if (dailySummaryStages.length > 0) {
      return Math.max(0, dailySummaryStages.reduce((s, r) => s + r.total, 0));
    }
    return stages.length > 0 ? Math.min(...stages.map((s) => s.total)) : 0;
  }, [dailySummaryStages, stages]);
  const genelPercent = useMemo(() => calcPercent(bitenTotal, target), [bitenTotal, target]);
  const kalan = useMemo(() => Math.max(0, target - bitenTotal), [target, bitenTotal]);

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const meta = await getSecondaryDayMeta(today).catch(() => null);
      if (meta) setDayMeta(meta);
      const mid = meta?.secondaryModelId;
      if (!mid) {
        if (!silent) setLoading(false);
        return;
      }
      const [totalsRes, targetRes] = await Promise.all([
        getSecondarySimpleTotals(today, mid).catch(() => null),
        getEkran5Target(mid).catch(() => null),
      ]);
      if (totalsRes) {
        setStages(totalsRes.stages);
        setDailySummaryStages(totalsRes.dailySummaryStages);
      }
      // manualTarget = el ile ayarlanan (ekran5Target), apiTarget = modelin base hedefi (targetQuantity)
      setManualTarget(targetRes?.ekran5Target != null && targetRes.ekran5Target > 0 ? targetRes.ekran5Target : null);
      setApiTarget(targetRes?.targetQuantity != null && targetRes.targetQuantity > 0 ? targetRes.targetQuantity : 0);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch {
      setError("Veri alınamadı");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [today]);

  // Auth
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("ekran1")) {
      window.location.href = "/";
      return;
    }
    setHasToken(true);
    setAuthToken(token);
  }, []);

  // Veri yükleme
  useEffect(() => {
    if (!hasToken) return;
    void load(false);
    const id = setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, load]);

  // Uzaktan yenileme sinyali
  useEffect(() => {
    if (!hasToken) return;
    let lastSignal = "";
    const checkSignal = async () => {
      const sig = await getEkranRefreshSignal().catch(() => "");
      if (!sig || sig === "0") return;
      if (lastSignal === "") { lastSignal = sig; return; }
      if (sig !== lastSignal) { lastSignal = sig; void load(true); }
    };
    void checkSignal();
    const id = setInterval(() => void checkSignal(), 6_000);
    return () => clearInterval(id);
  }, [hasToken, load]);

  // Gün değişimi
  useEffect(() => {
    if (!hasToken) return;
    let lastDay = todayIsoTurkey();
    const id = setInterval(() => {
      const d = todayIsoTurkey();
      if (d !== lastDay) { lastDay = d; window.location.reload(); }
    }, 8_000);
    return () => clearInterval(id);
  }, [hasToken]);

  async function handleHedefSave(v: number) {
    const mid = dayMeta.secondaryModelId;
    if (mid) await setEkran5Target(mid, v).catch(() => {});
    setManualTarget(v);
    setHedefOpen(false);
  }

  async function handleHedefClear() {
    const mid = dayMeta.secondaryModelId;
    if (mid) await setEkran5Target(mid, null).catch(() => {});
    setManualTarget(null);
    setHedefOpen(false);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else {
      const el = containerRef.current ?? document.documentElement;
      if (el.requestFullscreen) void el.requestFullscreen();
    }
  }

  if (!hasToken) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-slate-100 px-8 text-center">
        <p className="text-2xl font-semibold text-slate-800">EKRAN 1B</p>
        <Link href="/" className="rounded-xl border-2 border-slate-800 px-8 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-800 hover:text-white">
          Giriş
        </Link>
      </div>
    );
  }

  const productLabel = dayMeta.modelInfo
    ? (dayMeta.modelInfo.productName || dayMeta.modelInfo.modelCode)
    : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-col overflow-hidden bg-slate-100 text-neutral-900 [color-scheme:light]"
    >
      {hedefOpen && (
        <HedefModal
          apiTarget={apiTarget}
          manualTarget={manualTarget}
          productLabel={productLabel ?? ""}
          onSave={handleHedefSave}
          onClear={handleHedefClear}
          onClose={() => setHedefOpen(false)}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 to-slate-100" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 md:gap-5 md:px-8 md:py-5">

        {/* Header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-300 bg-white px-5 py-3.5 shadow-md">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
              EKRAN 1B
            </span>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-base font-extrabold text-neutral-950 md:text-lg">
                  {formatDateTr(today)}
                </p>
                {productLabel && (
                  <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 ring-1 ring-violet-300 md:text-sm">
                    {productLabel}
                  </span>
                )}
              </div>
              {lastUpdated && (
                <p className="text-[11px] font-semibold text-slate-700">
                  Son güncelleme {lastUpdated} · 30 sn yenileme
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-xl border-2 border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-200"
          >
            Tam ekran
          </button>
        </header>

        {error && (
          <p className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
        {loading && !lastUpdated && (
          <div className="flex shrink-0 items-center justify-center gap-2 py-3 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            Yükleniyor…
          </div>
        )}

        {/* İkinci model seçilmemişse bilgi */}
        {!loading && !dayMeta.secondaryModelId && (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 px-10 py-14 text-center">
              <p className="text-xl font-black text-violet-700">İkinci model henüz seçilmedi</p>
              <p className="mt-2 text-sm text-violet-500">
                Ana veri giriş ekranında «Ek Model Girişi» bölümünden günün ikinci modelini belirleyin.
              </p>
            </div>
          </div>
        )}

        {/* Genel ilerleme */}
        {dayMeta.secondaryModelId != null && !loading && (
          <>
            <section className="flex shrink-0 flex-col gap-2">
              <div className="flex justify-center px-2">
                <h1
                  className="rounded-2xl bg-gradient-to-r from-violet-700 via-purple-800 to-violet-700 text-center font-black uppercase tracking-[0.12em] text-white shadow-lg"
                  style={{ fontSize: "clamp(1rem, 2.8vw, 2.25rem)", padding: "clamp(0.4rem, 1vh, 0.75rem) clamp(1rem, 3vw, 2.5rem)" }}
                >
                  {productLabel ? `Genel İlerleme — ${productLabel}` : "Genel İlerleme"}
                </h1>
              </div>

              {/* Ana progress bar */}
              <div className="mx-auto w-full max-w-5xl px-1">
                <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto] sm:gap-4 md:gap-6">
                  <div
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200/90 shadow-[inset_0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-300/90"
                    style={{ height: "clamp(3rem, 7vh, 5.5rem)" }}
                    role="progressbar"
                    aria-valuenow={genelPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="relative h-full overflow-hidden rounded-[0.75rem] bg-slate-300/50">
                      <div
                        className="absolute inset-y-0 left-0 rounded-[0.65rem] bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 shadow-[0_0_24px_rgba(139,92,246,0.35)] transition-[width] duration-1000 ease-out"
                        style={{ width: `${genelPercent}%` }}
                      >
                        <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-white/30 to-transparent" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-center sm:justify-end">
                    <div className="flex min-w-[5.5rem] flex-col items-center rounded-2xl border-2 border-violet-800 bg-violet-900 px-4 py-2.5 shadow-lg sm:min-w-[7.5rem] sm:px-6 sm:py-3 md:min-w-[9rem]">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-300">Oran</span>
                      <span
                        className="font-black tabular-nums leading-none text-white"
                        style={{ fontSize: "clamp(2rem, 6vw, 4.25rem)" }}
                      >
                        %{genelPercent.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stat kutucukları */}
                <div
                  className="mt-2 grid grid-cols-3 gap-2.5 sm:gap-3 md:mt-3 md:gap-4"
                  style={{ height: "clamp(9rem, 22vh, 26rem)", minHeight: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => setHedefOpen(true)}
                    className="flex h-full min-w-0 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-slate-300 bg-white px-1 shadow-md transition hover:border-violet-400 hover:bg-violet-50 active:scale-95"
                    title="Hedefi düzenle"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <p className="font-black uppercase tracking-[0.12em] text-slate-500" style={{ fontSize: "clamp(0.6rem, 1.2vw, 1rem)" }}>Hedef</p>
                      <span className={`h-1.5 w-1.5 rounded-full ${manualTarget != null ? "bg-amber-400" : "bg-emerald-400"}`} />
                    </div>
                    <p className="w-full text-center font-black tabular-nums leading-none text-slate-900" style={{ fontSize: "clamp(1.5rem, 3.2vw, 4.5rem)" }}>
                      {target > 0 ? target.toLocaleString("tr-TR") : "—"}
                    </p>
                    {manualTarget != null && (
                      <p className="shrink-0 text-center font-semibold text-amber-600" style={{ fontSize: "clamp(0.5rem, 0.9vw, 0.75rem)" }}>El ile</p>
                    )}
                  </button>
                  <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-violet-400 bg-violet-50 px-1 shadow-md">
                    <p className="shrink-0 font-black uppercase tracking-[0.12em] text-violet-700" style={{ fontSize: "clamp(0.6rem, 1.2vw, 1rem)" }}>BİTEN</p>
                    <p className="w-full text-center font-black tabular-nums leading-none text-violet-800" style={{ fontSize: "clamp(1.5rem, 3.2vw, 4.5rem)" }}>
                      {bitenTotal.toLocaleString("tr-TR")}
                    </p>
                  </div>
                  <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-amber-400 bg-amber-50 px-1 shadow-md">
                    <p className="shrink-0 font-black uppercase tracking-[0.12em] text-amber-700" style={{ fontSize: "clamp(0.6rem, 1.2vw, 1rem)" }}>Kalan</p>
                    <p className="w-full text-center font-black tabular-nums leading-none text-amber-900" style={{ fontSize: "clamp(1.5rem, 3.2vw, 4.5rem)" }}>
                      {target > 0 ? kalan.toLocaleString("tr-TR") : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Aşama kartları */}
            {stages.length > 0 && (
              <section className="flex min-h-0 flex-1 flex-col gap-2 md:gap-3">
                <div
                  className="grid min-h-0 flex-1 gap-2 sm:gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(stages.length, 3)}, 1fr)`,
                    gridAutoRows: "1fr",
                  }}
                >
                  {stages.map((stage, i) => {
                    const color = STAGE_COLORS[i % STAGE_COLORS.length]!;
                    const pct = calcPercent(stage.total, target);
                    const label = stage.processName
                      ? `${stage.teamLabel} · ${stage.processName.length > 14 ? stage.processName.slice(0, 12) + "…" : stage.processName}`
                      : stage.teamLabel;
                    return (
                      <div
                        key={stage.sortOrder}
                        className={`flex flex-col justify-between overflow-hidden rounded-2xl border-2 ${color.border} ${color.bg} shadow-md`}
                        style={{ padding: "clamp(0.5rem, 1.2vw, 1rem)" }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className={`font-black uppercase tracking-wide ${color.text}`} style={{ fontSize: "clamp(0.65rem, 1.15vw, 0.95rem)" }}>
                            {label}
                          </p>
                          <span className={`font-black tabular-nums ${color.pct}`} style={{ fontSize: "clamp(1rem, 2.2vw, 1.75rem)" }}>
                            %{pct}
                          </span>
                        </div>
                        <div
                          className="relative overflow-hidden rounded-full bg-white/60 shadow-inner"
                          style={{ height: "clamp(0.5rem, 0.9vw, 0.875rem)" }}
                        >
                          <div
                            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${color.bar} transition-[width] duration-700 ease-out`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <div className="min-w-0 text-center">
                            <p className={`font-black uppercase tracking-wide ${color.text}`} style={{ fontSize: "clamp(0.55rem, 0.85vw, 0.75rem)" }}>Toplam</p>
                            <p className={`font-black tabular-nums ${color.pct}`} style={{ fontSize: "clamp(0.8rem, 1.7vw, 1.25rem)" }}>
                              {stage.total.toLocaleString("tr-TR")}
                            </p>
                          </div>
                          {target > 0 && (
                            <div className="min-w-0 text-center">
                              <p className="font-black uppercase tracking-wide text-amber-600" style={{ fontSize: "clamp(0.55rem, 0.85vw, 0.75rem)" }}>Kalan</p>
                              <p className="font-black tabular-nums text-amber-800" style={{ fontSize: "clamp(0.8rem, 1.7vw, 1.25rem)" }}>
                                {Math.max(0, target - stage.total).toLocaleString("tr-TR")}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
