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

type BoxStyle = { box: string; label: string; value: string };

type SlideMeta = {
  label: string;
  badgeCls: string;
  barGradient: string;
  barGlow: string;
  targetStyle: BoxStyle;
  totalStyle: BoxStyle;
  todayStyle: BoxStyle;
  remainStyle: BoxStyle;
};

const SLIDE_META: Record<SlideKey, SlideMeta> = {
  paketleme: {
    label: "Paketleme",
    badgeCls: "from-emerald-600 to-teal-600",
    barGradient: "from-emerald-500 via-teal-500 to-cyan-500",
    barGlow: "shadow-[0_0_24px_rgba(16,185,129,0.35)]",
    targetStyle: { box: "border-slate-300 bg-white ring-1 ring-slate-200/80",          label: "text-slate-500",    value: "text-slate-900"   },
    totalStyle:  { box: "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200/90", label: "text-emerald-700",  value: "text-emerald-800" },
    todayStyle:  { box: "border-teal-400 bg-teal-50 ring-1 ring-teal-200/90",          label: "text-teal-700",     value: "text-teal-800"    },
    remainStyle: { box: "border-amber-400 bg-amber-50 ring-1 ring-amber-200/90",       label: "text-amber-700",    value: "text-amber-900"   },
  },
  optik: {
    label: "Optik Kontrol",
    badgeCls: "from-violet-600 to-purple-600",
    barGradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    barGlow: "shadow-[0_0_24px_rgba(139,92,246,0.35)]",
    targetStyle: { box: "border-slate-300 bg-white ring-1 ring-slate-200/80",          label: "text-slate-500",    value: "text-slate-900"   },
    totalStyle:  { box: "border-violet-400 bg-violet-50 ring-1 ring-violet-200/90",    label: "text-violet-700",   value: "text-violet-800"  },
    todayStyle:  { box: "border-purple-400 bg-purple-50 ring-1 ring-purple-200/90",    label: "text-purple-700",   value: "text-purple-800"  },
    remainStyle: { box: "border-amber-400 bg-amber-50 ring-1 ring-amber-200/90",       label: "text-amber-700",    value: "text-amber-900"   },
  },
  utu: {
    label: "Ütü",
    badgeCls: "from-orange-500 to-amber-500",
    barGradient: "from-orange-500 via-amber-500 to-yellow-400",
    barGlow: "shadow-[0_0_24px_rgba(245,158,11,0.35)]",
    targetStyle: { box: "border-slate-300 bg-white ring-1 ring-slate-200/80",          label: "text-slate-500",    value: "text-slate-900"   },
    totalStyle:  { box: "border-orange-400 bg-orange-50 ring-1 ring-orange-200/90",    label: "text-orange-700",   value: "text-orange-800"  },
    todayStyle:  { box: "border-amber-400 bg-amber-50 ring-1 ring-amber-200/90",       label: "text-amber-700",    value: "text-amber-800"   },
    remainStyle: { box: "border-red-400 bg-red-50 ring-1 ring-red-200/90",             label: "text-red-700",      value: "text-red-900"     },
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

// ─── Stat kutu — büyük, belirgin rakam ──────────────────────────────────────
function StatBox({ label, value, style }: { label: string; value: string; style: BoxStyle }) {
  return (
    <div className={`flex h-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 px-2 shadow-md ${style.box}`}>
      <p
        className={`shrink-0 font-black uppercase tracking-[0.12em] ${style.label}`}
        style={{ fontSize: "clamp(0.7rem, 1.4vw, 1.1rem)" }}
      >
        {label}
      </p>
      <p
        className={`w-full text-center font-black tabular-nums leading-none [text-shadow:0_1px_3px_rgba(0,0,0,0.15)] ${style.value}`}
        style={{ fontSize: "clamp(2rem, 5vw, 5rem)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Slayt paneli — flex-1 ile ekranı doldurur ───────────────────────────────
function SlidePanel({
  slideKey, total, todayCount, target,
}: { slideKey: SlideKey; total: number; todayCount: number; target: number }) {
  const m = SLIDE_META[slideKey];
  const pct = calcUtuPaketPercent(total, target);
  const remaining = Math.max(0, target - total);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      {/* Başlık badge */}
      <div className="flex shrink-0 justify-center">
        <h2
          className={`rounded-2xl bg-gradient-to-r ${m.badgeCls} px-6 py-2.5 text-center font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-slate-900/20 ring-2 ring-white/20 min-[1920px]:px-10 min-[1920px]:py-3`}
          style={{ fontSize: "clamp(1rem, 2.8vw, 2.25rem)" }}
        >
          {m.label}
        </h2>
      </div>

      {/* Progress bar + Oran kutusu */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 md:gap-6">
        <div
          className="relative h-14 flex-1 overflow-hidden rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200/90 p-[3px] shadow-[inset_0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-300/90 sm:h-16 md:h-[4.25rem] md:rounded-3xl md:p-1"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="relative h-full overflow-hidden rounded-[0.75rem] bg-slate-300/50 md:rounded-[1.2rem]">
            <div
              className={`absolute inset-y-0 left-0 rounded-[0.65rem] bg-gradient-to-r ${m.barGradient} ${m.barGlow} transition-[width] duration-1000 ease-out md:rounded-[1.1rem]`}
              style={{ width: `${pct}%` }}
            >
              <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>
        </div>

        {/* Oran kutusu */}
        <div className="flex shrink-0 justify-center sm:justify-end">
          <div className="flex min-w-[5.5rem] flex-col items-center rounded-2xl border-2 border-slate-800 bg-slate-900 px-4 py-2.5 shadow-lg ring-1 ring-slate-950/20 sm:min-w-[7.5rem] sm:px-6 sm:py-3 md:min-w-[9rem]">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">Oran</span>
            <span
              className="font-black tabular-nums leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]"
              style={{ fontSize: "clamp(2rem, 6vw, 4.25rem)" }}
            >
              %{pct.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* 4 metrik kutu — kalan alanın tamamını doldurur */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5 [grid-auto-rows:minmax(0,1fr)] sm:grid-cols-4 sm:gap-3 md:gap-4">
        <StatBox label="Hedef"  value={target > 0 ? target.toLocaleString("tr-TR") : "—"}            style={m.targetStyle} />
        <StatBox label="Toplam" value={total.toLocaleString("tr-TR")}                                 style={m.totalStyle}  />
        <StatBox label="Bugün"  value={todayCount.toLocaleString("tr-TR")}                            style={m.todayStyle}  />
        <StatBox label="Kalan"  value={target > 0 ? remaining.toLocaleString("tr-TR") : "—"}          style={m.remainStyle} />
      </div>
    </div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
type Props = { dateIso?: string; embedded?: boolean };

export default function UtuPaketEkran5({ dateIso, embedded = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasToken, setHasToken]           = useState(false);
  const [displayDate, setDisplayDate]     = useState(dateIso || todayWeekdayIso());
  const [optikCount, setOptikCount]       = useState(0);
  const [optikTotal, setOptikTotal]       = useState(0);
  const [utuCount, setUtuCount]           = useState(0);
  const [utuTotal, setUtuTotal]           = useState(0);
  const [paketCount, setPaketCount]       = useState(0);
  const [gunPaketlenen, setGunPaketlenen] = useState(0);
  const [target, setTarget]               = useState(0);
  const [productLabel, setProductLabel]   = useState("");
  const [lastUpdated, setLastUpdated]     = useState("");
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  const [slide, setSlide]                 = useState(0);
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

  // unused suppressor
  const _pct = useMemo(() => calcUtuPaketPercent(paketCount, target), [paketCount, target]);
  void _pct;

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
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-lg font-semibold text-slate-800">EKRAN 5</p>
        <p className="text-sm text-slate-600">Giriş yapın ve Ütü–Paket yetkisini açın.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`text-neutral-900 [color-scheme:light] ${
        embedded
          ? "relative flex min-h-[min(80vh,52rem)] flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-100 shadow-inner"
          : "fixed inset-0 flex flex-col overflow-hidden bg-slate-100"
      }`}
    >
      {/* Arka plan */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 to-slate-100" />

      {/* Tüm içerik — flex sütun, ekranı tam doldurur, scroll yok */}
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[min(100%,120rem)] flex-1 flex-col gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 md:gap-4 md:px-8 md:py-4 min-[1920px]:gap-4 min-[1920px]:px-10 min-[1920px]:py-5">

        {/* ── HEADER ── */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-300 bg-white px-5 py-3 shadow-md">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
              EKRAN 5
            </span>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-base font-extrabold text-neutral-950 md:text-lg">
                  {formatDateTr(displayDate)}
                </p>
                {productLabel ? (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-300 md:text-sm">
                    {productLabel}
                  </span>
                ) : null}
              </div>
              {lastUpdated ? (
                <p className="text-[11px] font-semibold text-slate-700">
                  Son güncelleme {lastUpdated} · sayfa {slide + 1}/{SLIDE_COUNT} · 30 sn döngü
                </p>
              ) : null}
            </div>
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

        {/* Hata / yükleniyor */}
        {error ? (
          <p className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-600">{error}</p>
        ) : null}
        {loading && !lastUpdated ? (
          <div className="flex shrink-0 items-center justify-center gap-2 py-3 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            Yükleniyor…
          </div>
        ) : null}

        {/* ── SLAYT — flex-1 ile kalan yüksekliği doldurur ── */}
        <div className={`flex min-h-0 flex-1 transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}>
          {slideKey === "paketleme" && (
            <SlidePanel slideKey="paketleme" total={paketCount}  todayCount={gunPaketlenen} target={target} />
          )}
          {slideKey === "optik" && (
            <SlidePanel slideKey="optik"     total={optikTotal}  todayCount={optikCount}    target={target} />
          )}
          {slideKey === "utu" && (
            <SlidePanel slideKey="utu"       total={utuTotal}    todayCount={utuCount}      target={target} />
          )}
        </div>

        {/* ── SLAYT GÖSTERGESİ ── */}
        <div className="shrink-0 pb-1">
          <div className="mx-auto mb-2 h-1 w-full max-w-sm overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-500"
              style={{ width: `${slideProgress}%`, transition: "width 100ms linear" }}
            />
          </div>
          <div className="flex items-center justify-center gap-3">
            {SLIDES.map((key, i) => (
              <button
                key={key}
                type="button"
                onClick={() => { setSlide(i); setSlideProgress(0); }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-300 sm:text-xs ${
                  i === slide ? "bg-slate-900 text-white shadow-md" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
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
