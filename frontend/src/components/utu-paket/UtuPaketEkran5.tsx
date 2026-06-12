"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDayProductMeta,
  getEkran1GenelIlerleme,
  getUtuPaket,
  getUtuPaketAnalytics,
  setAuthToken,
} from "@/lib/api";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import {
  calcUtuPaketPercent,
  normalizeUtuPaketPayload,
  sumGunPaketlenen,
  sumUtuPaketSlots,
} from "@/lib/utuPaket";

const AUTO_REFRESH_MS = 30_000;
const SLIDE_DURATION_MS = 30_000;
const SLIDE_COUNT = 3;

const SLIDES = ["paketleme", "optik", "utu"] as const;
type SlideKey = (typeof SLIDES)[number];

type SlideMeta = {
  label: string;
  badgeCls: string;
  barGradient: string;
  barGlow: string;
  totalBox: string; totalLabel: string; totalValue: string;
  todayBox: string; todayLabel: string; todayValue: string;
  remainBox: string; remainLabel: string; remainValue: string;
  targetBox: string; targetLabel: string; targetValue: string;
  ringCls: string;
};

const SLIDE_META: Record<SlideKey, SlideMeta> = {
  paketleme: {
    label: "Paketleme",
    badgeCls: "from-emerald-600 to-teal-600",
    barGradient: "from-emerald-500 via-teal-500 to-cyan-400",
    barGlow: "shadow-[0_0_48px_rgba(16,185,129,0.55)]",
    totalBox: "border-emerald-300 bg-emerald-50",   totalLabel: "text-emerald-700",  totalValue: "text-emerald-900",
    todayBox:  "border-teal-400 bg-teal-50",        todayLabel: "text-teal-700",     todayValue: "text-teal-900",
    remainBox: "border-amber-300 bg-amber-50",       remainLabel: "text-amber-700",   remainValue: "text-amber-900",
    targetBox: "border-slate-300 bg-slate-50",       targetLabel: "text-slate-500",   targetValue: "text-slate-800",
    ringCls: "ring-emerald-400/40",
  },
  optik: {
    label: "Optik Kontrol",
    badgeCls: "from-violet-600 to-purple-600",
    barGradient: "from-violet-500 via-purple-500 to-fuchsia-400",
    barGlow: "shadow-[0_0_48px_rgba(139,92,246,0.55)]",
    totalBox: "border-violet-300 bg-violet-50",     totalLabel: "text-violet-700",   totalValue: "text-violet-900",
    todayBox:  "border-purple-400 bg-purple-50",    todayLabel: "text-purple-700",   todayValue: "text-purple-900",
    remainBox: "border-amber-300 bg-amber-50",       remainLabel: "text-amber-700",   remainValue: "text-amber-900",
    targetBox: "border-slate-300 bg-slate-50",       targetLabel: "text-slate-500",   targetValue: "text-slate-800",
    ringCls: "ring-violet-400/40",
  },
  utu: {
    label: "Ütü",
    badgeCls: "from-orange-500 to-amber-500",
    barGradient: "from-orange-500 via-amber-500 to-yellow-400",
    barGlow: "shadow-[0_0_48px_rgba(245,158,11,0.55)]",
    totalBox: "border-orange-300 bg-orange-50",     totalLabel: "text-orange-700",   totalValue: "text-orange-900",
    todayBox:  "border-amber-400 bg-amber-50",      todayLabel: "text-amber-700",    todayValue: "text-amber-900",
    remainBox: "border-red-300 bg-red-50",           remainLabel: "text-red-700",     remainValue: "text-red-900",
    targetBox: "border-slate-300 bg-slate-50",       targetLabel: "text-slate-500",   targetValue: "text-slate-800",
    ringCls: "ring-amber-400/40",
  },
};

function formatDateTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
function formatClock() {
  return new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Tek metrik kutu ───────────────────────────────────────────────────────
function StatBox({
  label, value, boxCls, labelCls, valueCls,
}: { label: string; value: string; boxCls: string; labelCls: string; valueCls: string }) {
  return (
    <div className={`flex min-h-[8rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 px-2 shadow-sm sm:min-h-[10rem] md:min-h-[12rem] ${boxCls}`}>
      <p className={`shrink-0 text-[9px] font-black uppercase tracking-widest sm:text-[11px] md:text-xs ${labelCls}`}>
        {label}
      </p>
      <p
        className={`w-full min-w-0 text-center font-black tabular-nums leading-none ${valueCls}`}
        style={{ fontSize: "clamp(1.5rem, 3.8vw, 3.8rem)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Slayt içerik paneli ───────────────────────────────────────────────────
function SlidePanel({
  slideKey, total, todayCount, target,
}: { slideKey: SlideKey; total: number; todayCount: number; target: number }) {
  const m = SLIDE_META[slideKey];
  const pct = calcUtuPaketPercent(total, target);
  const remaining = Math.max(0, target - total);

  return (
    <div className={`w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-6 shadow-2xl ring-2 ${m.ringCls} sm:px-8 sm:py-8 md:rounded-3xl md:px-12 md:py-10`}>

      {/* Başlık */}
      <div className="mb-6 flex justify-center md:mb-8">
        <h2
          className={`rounded-xl bg-gradient-to-r ${m.badgeCls} px-8 py-2.5 font-black uppercase tracking-[0.16em] text-white shadow-lg sm:px-14`}
          style={{ fontSize: "clamp(1.2rem, 3vw, 2.2rem)" }}
        >
          {m.label}
        </h2>
      </div>

      {/* Progress bar + Oran kutusu */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-center md:gap-6">
        {/* Bar */}
        <div
          className="relative h-16 flex-1 overflow-hidden rounded-2xl bg-slate-100 p-1 shadow-inner ring-2 ring-slate-200 sm:h-20 md:h-28 md:rounded-3xl"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="relative h-full overflow-hidden rounded-xl md:rounded-2xl">
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r ${m.barGradient} ${m.barGlow} rounded-xl transition-[width] duration-1000 ease-out md:rounded-2xl`}
              style={{ width: `${pct}%` }}
            >
              <div className="absolute inset-x-0 top-0 h-2/5 rounded-xl bg-gradient-to-b from-white/30 to-transparent md:rounded-2xl" />
            </div>
            {pct > 6 && (
              <span
                className="absolute inset-y-0 left-4 flex items-center font-black tabular-nums text-white drop-shadow-md"
                style={{ fontSize: "clamp(1rem, 2.5vw, 1.75rem)" }}
              >
                %{pct.toFixed(0)}
              </span>
            )}
          </div>
        </div>

        {/* Oran kutusu */}
        <div className="flex shrink-0 justify-center md:justify-end">
          <div className="flex flex-col items-center justify-center rounded-2xl border-[3px] border-slate-800 bg-slate-900 px-6 py-4 shadow-2xl sm:px-10 sm:py-5 md:min-w-[11rem] md:px-8 md:py-6">
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400 md:text-sm">
              Oran
            </span>
            <span
              className="font-black tabular-nums leading-none text-white"
              style={{ fontSize: "clamp(2.8rem, 9vw, 6.5rem)" }}
            >
              %{pct.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* 4 metrik kutu */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5 md:gap-6">
        <StatBox label="Hedef"  value={target > 0 ? target.toLocaleString("tr-TR") : "—"} boxCls={m.targetBox} labelCls={m.targetLabel} valueCls={m.targetValue} />
        <StatBox label="Toplam" value={total.toLocaleString("tr-TR")}                      boxCls={m.totalBox}  labelCls={m.totalLabel}  valueCls={m.totalValue}  />
        <StatBox label="Bugün"  value={todayCount.toLocaleString("tr-TR")}                 boxCls={m.todayBox}  labelCls={m.todayLabel}  valueCls={m.todayValue}  />
        <StatBox label="Kalan"  value={target > 0 ? remaining.toLocaleString("tr-TR") : "—"} boxCls={m.remainBox} labelCls={m.remainLabel} valueCls={m.remainValue} />
      </div>
    </div>
  );
}

// ─── Ana bileşen ───────────────────────────────────────────────────────────
type Props = { dateIso?: string; embedded?: boolean };

export default function UtuPaketEkran5({ dateIso, embedded = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasToken, setHasToken]     = useState(false);
  const [displayDate, setDisplayDate] = useState(dateIso || todayWeekdayIso());
  const [optikCount, setOptikCount]   = useState(0);
  const [optikTotal, setOptikTotal]   = useState(0);
  const [utuCount, setUtuCount]       = useState(0);
  const [utuTotal, setUtuTotal]       = useState(0);
  const [paketCount, setPaketCount]   = useState(0);
  const [gunPaketlenen, setGunPaketlenen] = useState(0);
  const [target, setTarget]           = useState(0);
  const [productLabel, setProductLabel] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Slayt: 0=Paketleme, 1=Optik, 2=Ütü
  const [slide, setSlide]               = useState(0);
  const [slideProgress, setSlideProgress] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) { setHasToken(false); return; }
    setAuthToken(token);
    setHasToken(true);
  }, []);

  useEffect(() => { if (dateIso) setDisplayDate(dateIso); }, [dateIso]);

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
      const todayUtu   = sumUtuPaketSlots(data.stages.utu);
      setDisplayDate(date);
      setOptikCount(todayOptik);
      setUtuCount(todayUtu);
      setPaketCount(data.takipsan?.readCount ?? sumUtuPaketSlots(data.stages.paketleme));
      setGunPaketlenen(sumGunPaketlenen(data.takipsan?.packages, date).adet);
      setTarget(data.takipsan?.orderQuantity ?? data.packagingTarget);
      setProductLabel([meta?.productName, meta?.productModel].filter(Boolean).join(" · "));

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

  // Veri yenileme — 30 sn
  useEffect(() => {
    if (!hasToken) return;
    void load(false);
    const id = setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, load]);

  // Slayt döngüsü — 30 sn
  useEffect(() => {
    setSlideProgress(0);
    let elapsed = 0;
    const TICK = 100;
    const ticker = setInterval(() => {
      elapsed += TICK;
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
    }, TICK);
    return () => clearInterval(ticker);
  }, [slide]);

  const paketPercent = useMemo(() => calcUtuPaketPercent(paketCount, target), [paketCount, target]);
  void paketPercent;

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else { const el = containerRef.current ?? document.documentElement; if (el.requestFullscreen) void el.requestFullscreen(); }
  }
  function openTvWindow() {
    window.open(`${window.location.origin}/ekran5/icerik`, "ye tekstil utu paket", "popup=yes,width=1280,height=800");
  }

  const slideKey = SLIDES[slide];

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
          : "fixed inset-0 flex flex-col overflow-y-auto bg-slate-100"
      }`}
    >
      {/* Arka plan dekor */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 to-slate-100" />

      {/* İçerik — ortada, doğal genişlik, geniş ekranda sınırlı */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5 md:px-10 md:py-6 min-[1920px]:max-w-7xl min-[1920px]:py-8">

        {/* ── HEADER ── */}
        <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 shadow-sm sm:px-5 sm:py-3">
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-lg bg-gradient-to-r from-teal-600 to-emerald-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow">
              EKRAN 5
            </span>
            <p className="mt-1.5 truncate font-extrabold leading-snug text-neutral-950" style={{ fontSize: "clamp(0.9rem, 2vw, 1.3rem)" }}>
              {formatDateTr(displayDate)}
              {productLabel ? <span className="font-bold text-neutral-600"> · {productLabel}</span> : null}
            </p>
            {lastUpdated ? (
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500 sm:text-xs">
                Son güncelleme {lastUpdated} · sayfa {slide + 1}/{SLIDE_COUNT} · 30 sn döngü
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {embedded ? (
              <button type="button" onClick={openTvWindow}
                className="rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-900 hover:bg-slate-200 sm:text-sm">
                TV penceresi
              </button>
            ) : null}
            <button type="button" onClick={() => void toggleFullscreen()}
              className="rounded-xl border-2 border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-200">
              Tam ekran
            </button>
          </div>
        </header>

        {/* Hata */}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-600">{error}</p>
        ) : null}

        {/* Yükleniyor */}
        {loading && !lastUpdated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Yükleniyor…
          </div>
        ) : null}

        {/* ── SLAYT ── */}
        <div className={`transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}>
          {slideKey === "paketleme" && (
            <SlidePanel slideKey="paketleme" total={paketCount} todayCount={gunPaketlenen} target={target} />
          )}
          {slideKey === "optik" && (
            <SlidePanel slideKey="optik" total={optikTotal} todayCount={optikCount} target={target} />
          )}
          {slideKey === "utu" && (
            <SlidePanel slideKey="utu" total={utuTotal} todayCount={utuCount} target={target} />
          )}
        </div>

        {/* ── SLAYT GÖSTERGESİ ── */}
        <div className="flex flex-col items-center gap-2.5 py-1">
          {/* Zamanlama çubuğu */}
          <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-500"
              style={{ width: `${slideProgress}%`, transition: "width 100ms linear" }}
            />
          </div>
          {/* Etiketli slayt butonları */}
          <div className="flex items-center gap-3">
            {SLIDES.map((key, i) => (
              <button
                key={key}
                type="button"
                onClick={() => { setSlide(i); setSlideProgress(0); }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-300 sm:text-xs ${
                  i === slide
                    ? "bg-slate-900 text-white shadow-md"
                    : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${i === slide ? "bg-teal-400" : "bg-slate-400"}`} />
                {SLIDE_META[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
