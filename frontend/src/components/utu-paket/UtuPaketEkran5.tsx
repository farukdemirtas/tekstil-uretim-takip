"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDayProductMeta, getEkran1GenelIlerleme, getUtuPaket, getUtuPaketAnalytics, setAuthToken } from "@/lib/api";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import {
  calcUtuPaketPercent,
  normalizeUtuPaketPayload,
  sumGunPaketlenen,
  sumUtuPaketSlots,
} from "@/lib/utuPaket";

const AUTO_REFRESH_MS = 30_000;
const SLIDE_DURATION_MS = 30_000;
const SLIDE_COUNT = 2;

function formatDateTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function formatClock() {
  return new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

type StageCardProps = {
  title: string;
  total: number;
  todayCount: number;
  target: number;
  gradient: string;
  glow: string;
  doneBox: string;
  doneLabel: string;
  doneValue: string;
  todayBox: string;
  todayLabel: string;
  todayValue: string;
};

function StageTvCard({ title, total, todayCount, target, gradient, glow, doneBox, doneLabel, doneValue, todayBox, todayLabel, todayValue }: StageCardProps) {
  const pct = calcUtuPaketPercent(total, target);
  const remaining = Math.max(0, target - total);

  return (
    <div
      className={`flex min-h-0 flex-col rounded-2xl border-2 border-slate-300 bg-white px-4 py-3.5 shadow-lg sm:px-5 sm:py-4 ${glow}`}
    >
      <h2
        className="text-center font-black uppercase tracking-[0.12em] text-slate-800"
        style={{ fontSize: "clamp(0.95rem, 2vw, 1.45rem)" }}
      >
        {title}
      </h2>
      <p className="mt-1 text-center text-xs font-extrabold text-slate-500 sm:text-sm">
        Yapılan iş
      </p>
      <p
        className={`mt-1 bg-gradient-to-r ${gradient} bg-clip-text text-center font-black tabular-nums text-transparent`}
        style={{ fontSize: "clamp(2.25rem, 5.5vw, 4rem)" }}
      >
        %{pct.toFixed(0)}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
        <div className={`rounded-xl border-2 px-2 py-2.5 text-center shadow-sm sm:py-3 ${doneBox}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest sm:text-[10px] ${doneLabel}`}>
            Gerçekleşen
          </p>
          <p
            className={`mt-0.5 font-black tabular-nums ${doneValue}`}
            style={{ fontSize: "clamp(1.1rem, 2.6vw, 2rem)" }}
          >
            {total.toLocaleString("tr-TR")}
          </p>
        </div>
        <div className={`rounded-xl border-2 px-2 py-2.5 text-center shadow-sm sm:py-3 ${todayBox}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest sm:text-[10px] ${todayLabel}`}>
            Bugün
          </p>
          <p
            className={`mt-0.5 font-black tabular-nums ${todayValue}`}
            style={{ fontSize: "clamp(1.1rem, 2.6vw, 2rem)" }}
          >
            {todayCount.toLocaleString("tr-TR")}
          </p>
        </div>
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-2 py-2.5 text-center shadow-sm sm:py-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-800 sm:text-[10px]">
            Kalan
          </p>
          <p
            className="mt-0.5 font-black tabular-nums text-amber-900"
            style={{ fontSize: "clamp(1.1rem, 2.6vw, 2rem)" }}
          >
            {target > 0 ? remaining.toLocaleString("tr-TR") : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

type Props = {
  /** Veri girişinde seçili gün; boşsa bugün */
  dateIso?: string;
  /** Ütü–Paket sekmesinde gömülü mod */
  embedded?: boolean;
};

export default function UtuPaketEkran5({ dateIso, embedded = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasToken, setHasToken] = useState(false);
  const [displayDate, setDisplayDate] = useState(dateIso || todayWeekdayIso());
  const [optikCount, setOptikCount] = useState(0);
  const [optikTotal, setOptikTotal] = useState(0);
  const [utuCount, setUtuCount] = useState(0);
  const [utuTotal, setUtuTotal] = useState(0);
  const [paketCount, setPaketCount] = useState(0);
  const [gunPaketlenen, setGunPaketlenen] = useState(0);
  const [target, setTarget] = useState(0);
  const [productLabel, setProductLabel] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Slayt döngüsü: 0 = Paketleme, 1 = Optik & Ütü
  const [slide, setSlide] = useState(0);
  const [slideProgress, setSlideProgress] = useState(0); // 0–100
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      setHasToken(false);
      return;
    }
    setAuthToken(token);
    setHasToken(true);
  }, []);

  useEffect(() => {
    if (dateIso) setDisplayDate(dateIso);
  }, [dateIso]);

  const load = useCallback(async (silent = false) => {
    if (!hasToken) return;
    const date = dateIso || todayWeekdayIso();
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [raw, meta, genelOzet] = await Promise.all([
        getUtuPaket(date),
        getDayProductMeta(date).catch(() => null),
        getEkran1GenelIlerleme(date, undefined).catch(() => null),
      ]);
      const data = normalizeUtuPaketPayload({ ...raw, date });
      const todayOptik = sumUtuPaketSlots(data.stages.optik);
      const todayUtu = sumUtuPaketSlots(data.stages.utu);
      setDisplayDate(date);
      setOptikCount(todayOptik);
      setUtuCount(todayUtu);
      setPaketCount(data.takipsan?.readCount ?? sumUtuPaketSlots(data.stages.paketleme));
      setGunPaketlenen(sumGunPaketlenen(data.takipsan?.packages, date).adet);
      setTarget(data.takipsan?.orderQuantity ?? data.packagingTarget);
      const label = [meta?.productName, meta?.productModel].filter(Boolean).join(" · ");
      setProductLabel(label);

      // Dönem başından bugüne kümülatif optik/ütü toplamı
      const startDate = genelOzet?.dataStartDate ?? date;
      if (startDate && startDate <= date) {
        const analytics = await getUtuPaketAnalytics({ startDate, endDate: date }).catch(() => null);
        setOptikTotal(analytics?.periodTotals?.optik ?? todayOptik);
        setUtuTotal(analytics?.periodTotals?.utu ?? todayUtu);
      } else {
        setOptikTotal(todayOptik);
        setUtuTotal(todayUtu);
      }

      setLastUpdated(formatClock());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [hasToken, dateIso]);

  useEffect(() => {
    if (!hasToken) return;
    void load(false);
    const id = setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, load]);

  // Slayt döngüsü: 30 saniyede bir geçiş + progress bar
  useEffect(() => {
    setSlideProgress(0);
    const TICK_MS = 100;
    const steps = SLIDE_DURATION_MS / TICK_MS;
    let elapsed = 0;
    const ticker = setInterval(() => {
      elapsed += TICK_MS;
      setSlideProgress(Math.min(100, (elapsed / SLIDE_DURATION_MS) * 100));
      if (elapsed >= SLIDE_DURATION_MS) {
        elapsed = 0;
        setTransitioning(true);
        setTimeout(() => {
          setSlide((s) => (s + 1) % SLIDE_COUNT);
          setSlideProgress(0);
          setTransitioning(false);
        }, 350);
      }
    }, TICK_MS);
    return () => clearInterval(ticker);
  }, [slide]);

  const paketPercent = useMemo(() => calcUtuPaketPercent(paketCount, target), [paketCount, target]);
  const remaining = Math.max(0, target - paketCount);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      const el = containerRef.current ?? document.documentElement;
      if (el.requestFullscreen) void el.requestFullscreen();
    }
  }

  function openTvWindow() {
    window.open(`${window.location.origin}/ekran5/icerik`, "ye tekstil utu paket", "popup=yes,width=1280,height=800");
  }

  if (!hasToken) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">EKRAN 5</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Giriş yapın ve Ütü–Paket yetkisini açın.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden text-neutral-900 [color-scheme:light] ${
        embedded
          ? "relative min-h-[min(80vh,52rem)] rounded-2xl border-2 border-slate-300 bg-slate-100 shadow-inner"
          : "fixed inset-0 flex flex-col bg-slate-100"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 to-slate-100" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[min(100%,120rem)] flex-col gap-2 px-3 py-2 sm:px-5 sm:py-3 md:px-8">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm sm:px-4 sm:py-2.5">
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-lg bg-gradient-to-r from-teal-600 to-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow">
              EKRAN 5
            </span>
            <p className="mt-1.5 truncate text-sm font-extrabold leading-snug text-neutral-950 sm:text-base md:text-lg">
              {formatDateTr(displayDate)}
              {productLabel ? (
                <span className="font-bold text-neutral-700"> · {productLabel}</span>
              ) : null}
            </p>
            {lastUpdated ? (
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500 sm:text-xs">
                Son güncelleme {lastUpdated} · sayfa {slide + 1}/{SLIDE_COUNT} · 30 sn döngü
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {embedded ? (
              <button
                type="button"
                onClick={openTvWindow}
                className="rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-900 hover:bg-slate-200 sm:text-sm"
              >
                TV penceresi
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded-xl border-2 border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-200"
            >
              Tam ekran
            </button>
          </div>
        </header>

        {error ? (
          <p className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-600">
            {error}
          </p>
        ) : null}

        {loading && !lastUpdated ? (
          <div className="flex shrink-0 items-center justify-center gap-2 py-6 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Yükleniyor…
          </div>
        ) : null}

        {/* Slayt içerik alanı */}
        <div
          className={`relative flex min-h-0 flex-1 flex-col gap-3 pb-2 transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}
        >
          {/* SLAYT 0: Paketleme ilerlemesi */}
          {slide === 0 && (
            <section className="flex min-h-0 flex-1 flex-col justify-center">
              <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center rounded-2xl border-2 border-slate-300 bg-white px-4 py-5 shadow-xl ring-1 ring-slate-200/80 sm:px-8 sm:py-8 md:rounded-3xl md:px-10 md:py-10">
                <div className="mb-4 flex justify-center sm:mb-6">
                  <h2
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2 font-black uppercase tracking-[0.14em] text-white shadow-md sm:px-10"
                    style={{ fontSize: "clamp(1.1rem, 2.8vw, 2rem)" }}
                  >
                    Paketleme ilerlemesi
                  </h2>
                </div>
                <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto] sm:gap-6 md:gap-8">
                  <div
                    className="relative h-16 overflow-hidden rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200/90 p-1 shadow-[inset_0_2px_10px_rgba(15,23,42,0.1)] ring-2 ring-slate-300/90 sm:h-20 md:h-28 md:rounded-3xl md:p-1.5"
                    role="progressbar"
                    aria-valuenow={Math.round(paketPercent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="relative h-full overflow-hidden rounded-[0.85rem] bg-slate-300/50 md:rounded-[1.35rem]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-[0.75rem] bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-[0_0_32px_rgba(16,185,129,0.45)] transition-[width] duration-1000 ease-out md:rounded-[1.25rem]"
                        style={{ width: `${paketPercent}%` }}
                      >
                        <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-white/35 to-transparent" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-center sm:justify-end">
                    <div className="flex min-w-[6rem] flex-col items-center rounded-2xl border-[3px] border-slate-800 bg-slate-900 px-5 py-3 shadow-xl sm:min-w-[8.5rem] sm:px-8 sm:py-4">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-300">Oran</span>
                      <span className="font-black tabular-nums leading-none text-white" style={{ fontSize: "clamp(2.5rem, 8vw, 5.5rem)" }}>
                        %{paketPercent.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-4 sm:gap-5">
                  <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-slate-200 bg-slate-50 px-2 py-4 shadow-sm sm:py-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 sm:text-xs">Hedef</p>
                    <p className="font-black tabular-nums text-slate-800" style={{ fontSize: "clamp(1.5rem, 5vw, 4rem)" }}>
                      {target > 0 ? target.toLocaleString("tr-TR") : "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-2 py-4 shadow-sm sm:py-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 sm:text-xs">Paketlenen</p>
                    <p className="font-black tabular-nums text-emerald-700" style={{ fontSize: "clamp(1.5rem, 5vw, 4rem)" }}>
                      {paketCount.toLocaleString("tr-TR")}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-teal-400 bg-teal-50 px-2 py-4 shadow-sm sm:py-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-teal-800 sm:text-xs">Bugün paketlenen</p>
                    <p className="font-black tabular-nums text-teal-800" style={{ fontSize: "clamp(1.5rem, 5vw, 4rem)" }}>
                      {gunPaketlenen.toLocaleString("tr-TR")}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-amber-300 bg-amber-50 px-2 py-4 shadow-sm sm:py-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 sm:text-xs">Kalan</p>
                    <p className="font-black tabular-nums text-amber-900" style={{ fontSize: "clamp(1.5rem, 5vw, 4rem)" }}>
                      {target > 0 ? remaining.toLocaleString("tr-TR") : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* SLAYT 1: Optik + Ütü */}
          {slide === 1 && (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <StageTvCard
                title="Optik"
                total={optikTotal}
                todayCount={optikCount}
                target={target}
                gradient="from-violet-600 to-purple-500"
                glow="shadow-violet-500/20"
                doneBox="border-violet-300 bg-violet-50"
                doneLabel="text-violet-800"
                doneValue="text-violet-900"
                todayBox="border-violet-400 bg-violet-100"
                todayLabel="text-violet-700"
                todayValue="text-violet-900"
              />
              <StageTvCard
                title="Ütü"
                total={utuTotal}
                todayCount={utuCount}
                target={target}
                gradient="from-amber-600 to-orange-500"
                glow="shadow-amber-500/20"
                doneBox="border-orange-400 bg-orange-50"
                doneLabel="text-orange-800"
                doneValue="text-orange-900"
                todayBox="border-amber-400 bg-amber-100"
                todayLabel="text-amber-700"
                todayValue="text-amber-900"
              />
            </div>
          )}
        </div>

        {/* Alt: slayt göstergesi + progress */}
        <div className="shrink-0 pb-2">
          {/* İlerleme çubuğu */}
          <div className="mx-auto mb-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-200/60">
            <div
              className="h-full rounded-full bg-teal-500 transition-none"
              style={{ width: `${slideProgress}%` }}
            />
          </div>
          {/* Nokta göstergesi */}
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setSlide(i); setSlideProgress(0); }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === slide ? "w-6 bg-teal-600" : "w-2 bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label={i === 0 ? "Paketleme" : "Optik & Ütü"}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
