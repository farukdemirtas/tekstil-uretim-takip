"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getHedefTakipStageTotals,
  getTopWorkersAnalytics,
  listProductModels,
  getDayProductMeta,
  setAuthToken,
  type HedefStageLineDto,
} from "@/lib/api";

import { getProsesMap, makeProsesKey } from "@/lib/prosesVeri";
import { clampToWeekdayIso, todayIsoTurkey } from "@/lib/businessCalendar";

/** EKRAN1 / EKRAN3 ile aynı: TR takvim günü, hafta sonu → son hafta içi (sorgu tarihleri) */
function workdayIsoTurkey(): string {
  return clampToWeekdayIso(todayIsoTurkey());
}
import { hasPermission } from "@/lib/permissions";
import { EfficiencyTicker, type TickerItem } from "@/components/EfficiencyTicker";

const STORAGE_KEY = "hedef_takip_settings_v1";
const AUTO_REFRESH_MS = 30_000;

function nWorkdaysBack(fromIso: string, n: number): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  let dt = new Date(y, m - 1, d);
  let count = 0;
  while (count < n) {
    dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - 1);
    if (dt.getDay() !== 0 && dt.getDay() !== 6) count++;
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** startDate ile endDate arasındaki takvim günü sayısı */
function daysBetween(a: string, b: string): number {
  return Math.max(
    1,
    Math.round(
      (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
    ) + 1
  );
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function calcPercent(count: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return clampPercent((count / target) * 100);
}

function formatDateTr(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

const STAGE_GRADIENTS = [
  "from-emerald-500 to-teal-400",
  "from-sky-500 to-blue-400",
  "from-violet-500 to-purple-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400",
  "from-cyan-500 to-sky-400",
  "from-fuchsia-500 to-pink-400",
  "from-lime-500 to-green-400",
] as const;

const STAGE_GLOWS = [
  "shadow-emerald-500/30",
  "shadow-sky-500/30",
  "shadow-violet-500/30",
  "shadow-amber-500/30",
  "shadow-rose-500/30",
  "shadow-cyan-500/30",
  "shadow-fuchsia-500/30",
  "shadow-lime-500/30",
] as const;

/** TV / uzak mesafe: açık zeminde okunaklı koyu tonlar */
const STAGE_TEXT = [
  "text-emerald-800",
  "text-sky-800",
  "text-violet-800",
  "text-amber-800",
  "text-rose-800",
  "text-cyan-800",
  "text-fuchsia-800",
  "text-lime-800",
] as const;

export default function Ekran1IcerikPage() {
  const [target, setTarget] = useState(5000);
  const [stages, setStages] = useState<HedefStageLineDto[]>([]);
  const [startDate, setStartDate] = useState(() => workdayIsoTurkey());
  const [endDate, setEndDate] = useState(() => workdayIsoTurkey());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [modelId, setModelId] = useState<number | null>(null);
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const genelTamamlanan = useMemo(() => {
    if (!stages.length) return 0;
    return Math.min(...stages.map((s) => (Number.isFinite(s.total) ? s.total : 0)));
  }, [stages]);
  const genelPercent = useMemo(
    () => calcPercent(genelTamamlanan, target),
    [genelTamamlanan, target]
  );

  const fetchData = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const rangeDays = daysBetween(startDate, endDate);
      const prevEndDate  = nWorkdaysBack(startDate, 1);
      const prevStartDate = nWorkdaysBack(startDate, rangeDays);
      const isSingleDay = startDate === endDate;

      // Verimlilik API’si başarısız olsa da (eski: yalnız ekran1 yetkisi → 403) ana özet yüklenir; ticker boş kalır.
      const [totals, rawCurrent, rawPrev, allModels, dayMeta] = await Promise.all([
        getHedefTakipStageTotals(startDate, endDate, modelId ?? undefined),
        getTopWorkersAnalytics({ startDate, endDate, limit: 200 }).catch(() => []),
        getTopWorkersAnalytics({ startDate: prevStartDate, endDate: prevEndDate, limit: 200 }).catch(() => []),
        listProductModels(),
        getDayProductMeta(endDate).catch(() => null),
      ]);
      setStages(totals.stages ?? []);

      // ── Proses Veri Sayfası hedef haritası ─────────────────────────────
      // Öncelik 1: Hedef-takip ayarlarındaki modelId (kullanıcının seçtiği model)
      // Öncelik 2: O tarihe ait üretim meta verisi (model seçili değilse)
      // Son yedek: v1 global veri
      const settingsModelCode =
        modelId != null
          ? (allModels.find((m) => m.id === modelId)?.modelCode ?? null)
          : null;
      const dayMetaModelCode =
        dayMeta?.modelId != null
          ? (allModels.find((m) => m.id === dayMeta.modelId)?.modelCode ?? null)
          : null;
      const resolvedModelCode = settingsModelCode ?? dayMetaModelCode ?? null;

      let prosesMap = getProsesMap(resolvedModelCode);

      // Harita boşsa (seçili modelde veri girilmemiş) tüm modeller denenir
      if (Object.keys(prosesMap).length === 0) {
        for (const m of allModels) {
          const candidate = getProsesMap(m.modelCode);
          if (Object.keys(candidate).length > 0) {
            prosesMap = candidate;
            break;
          }
        }
      }

      // ── Bugün tamamlandı mı? ────────────────────────────────────────────
      const todayActiveCount     = isSingleDay ? rawCurrent.filter((w) => w.totalProduction > 0).length : 0;
      const yesterdayActiveCount = isSingleDay ? rawPrev.filter((w) => w.totalProduction > 0).length : 0;
      // Bugün için hiç üretim kaydı yoksa veya gün henüz "tamamlanmadı" sayılmıyorsa dünün verisini kullan
      // (eski mantık: todayActiveCount===0 → "tamam" deyip bugünkü sıfır veriyi kullanıyordu → ticker boş kalıyordu)
      const isTodayComplete =
        !isSingleDay
          ? true
          : todayActiveCount === 0
            ? false
            : todayActiveCount >= yesterdayActiveCount * 0.75;

      // Verimlilik kaynağı: tamamlanmadıysa dünkü, tamamlandıysa bugünkü veri
      const effSource = isSingleDay && !isTodayComplete ? rawPrev : rawCurrent;

      // Önceki dönem lookup (trend için): workerId → { totalProduction, activeDays }
      const prevMap = new Map<number, { prod: number; days: number }>(
        rawPrev.map((w) => [w.workerId, { prod: w.totalProduction, days: Math.max(w.activeDays, 1) }])
      );

      // ── Verimlilik hesabı ───────────────────────────────────────────────
      // effPct = çalışanın günlük ortalaması / Proses Veri Sayfası günlük hedef × 100
      const items: TickerItem[] = effSource.map((w) => {
        const dk     = Number(prosesMap[makeProsesKey(w.team, w.process)]) || 0;
        const gunluk = dk * 60 * 9;   // Proses Veri Sayfası günlük hedef

        const workerDaily = w.totalProduction / Math.max(w.activeDays, 1);
        const effPct = gunluk > 0
          ? Math.min(Math.round((workerDaily / gunluk) * 100), 100)
          : 0;

        // Önceki dönem verimliliği (delta hesabı için)
        const prev = prevMap.get(w.workerId);
        const prevDaily = prev ? prev.prod / prev.days : 0;
        const prevEffPct = gunluk > 0 && prev
          ? Math.min(Math.round((prevDaily / gunluk) * 100), 100)
          : null;

        const trendDelta = prevEffPct != null ? effPct - prevEffPct : undefined;

        const trend: "up" | "down" | "neutral" =
          trendDelta == null || trendDelta === 0 ? "neutral"
          : trendDelta > 0 ? "up"
          : "down";

        return {
          workerId:      w.workerId,
          name:          w.name,
          process:       w.process || "—",
          team:          w.team,
          efficiencyPct: effPct,
          trend,
          trendDelta,
        };
      });

      items.sort((a, b) => b.efficiencyPct - a.efficiencyPct);
      // %40 altı ve proses hedefi girilmemişler gizlenir
      setTickerItems(items.filter((item) => item.efficiencyPct >= 40));
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch {
      setError("Veri alınamadı. Oturum veya bağlantıyı kontrol edin.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [startDate, endDate, modelId]);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("ekran1")) {
      window.location.href = "/";
      return;
    }
    setHasToken(true);
    setAuthToken(token);
    const today = workdayIsoTurkey();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          target?: number;
          startDate?: string;
          endDate?: string;
          rangeMode?: boolean;
          modelId?: number | null;
        };
        if (Number.isFinite(Number(saved.target))) setTarget(Number(saved.target));
        if (saved.modelId != null && Number.isFinite(Number(saved.modelId))) {
          setModelId(Number(saved.modelId));
        }
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            target: Number.isFinite(Number(saved.target)) ? Number(saved.target) : 5000,
            startDate: today,
            endDate: today,
            rangeMode: Boolean(saved.rangeMode),
            modelId: saved.modelId ?? null,
          })
        );
      }
    } catch { /* ignore */ }
    // Her açılış: tek güne kilit (EKRAN3’teki «bugün» gibi). Gece 00:00 TR reload sonrası yeni gün → API’de veri yoksa 0.
    setStartDate(today);
    setEndDate(today);
  }, []);

  useEffect(() => {
    if (!hasToken) { setLoading(false); return; }
    void fetchData(false);
  }, [hasToken, startDate, endDate, fetchData]);

  useEffect(() => {
    if (!hasToken) return;
    const id = setInterval(() => void fetchData(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, fetchData]);

  /**
   * TR takvim günü değişince tam yenileme: state + localStorage sıfırdan, `fetchData` o güne ait veriyi çeker.
   * Yeni günde üretim yoksa aşamalar/gerçekleşen 0 — ana sayfaya veri girildikçe dolar (EKRAN3’teki günlük mantıkla uyumlu).
   */
  useEffect(() => {
    if (!hasToken) return;
    let lastDay = todayIsoTurkey();
    const id = window.setInterval(() => {
      const d = todayIsoTurkey();
      if (d !== lastDay) {
        lastDay = d;
        window.location.reload();
      }
    }, 8_000);
    return () => clearInterval(id);
  }, [hasToken]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      const el = containerRef.current ?? document.documentElement;
      if (el.requestFullscreen) void el.requestFullscreen();
    }
  }

  const stageRows = useMemo(() => {
    return stages.map((s, i) => {
      const shortP = s.processName.length > 18 ? `${s.processName.slice(0, 16)}…` : s.processName;
      const label = s.processName ? `${s.teamLabel} · ${shortP}` : s.teamLabel;
      const value = Number.isFinite(s.total) ? s.total : 0;
      return {
        label,
        value,
        pct: calcPercent(value, target),
        gradient: STAGE_GRADIENTS[i % STAGE_GRADIENTS.length],
        glow: STAGE_GLOWS[i % STAGE_GLOWS.length],
        textColor: STAGE_TEXT[i % STAGE_TEXT.length],
      };
    });
  }, [stages, target]);

  if (!hasToken) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-slate-100 px-8 text-center text-slate-900">
        <p className="text-2xl font-semibold tracking-wide md:text-3xl">EKRAN1</p>
        <p className="max-w-xl text-lg text-slate-600 md:text-xl">
          Bu görünüm için önce ana uygulamada giriş yapın. Tarih aralığı ve hedefi{" "}
          <span className="font-semibold text-slate-900">Hedef Takip</span> ekranından kaydedin.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/" className="rounded-xl border-2 border-slate-800 px-8 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-800 hover:text-white">
            Giriş
          </Link>
          <Link href="/hedef-takip" className="rounded-xl bg-emerald-600 px-8 py-4 text-lg font-semibold text-white hover:bg-emerald-500">
            Hedef Takip
          </Link>
        </div>
      </div>
    );
  }

  const leftItems = tickerItems.filter((_, i) => i % 2 === 0);
  const rightItems = tickerItems.filter((_, i) => i % 2 === 1);

  const isSingleDay = startDate === endDate;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-row overflow-hidden bg-slate-100 text-neutral-900 [color-scheme:light]"
    >
      {/* Hafif dekor (kontrastı düşürmez) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 to-slate-100" />

      {/* Sol ticker */}
      <div className="relative z-10 hidden w-52 shrink-0 border-r-2 border-slate-200 bg-white py-3 lg:flex lg:flex-col xl:w-60">
        <EfficiencyTicker items={leftItems} />
      </div>

      {/* Ana içerik: üst sabit, alt aşamalar kalan yükseklikte kayar (TV’de kesilme olmasın) */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[min(100%,120rem)] flex-col gap-3 px-3 py-2 sm:gap-4 sm:px-5 sm:py-3 md:gap-5 md:px-8 md:py-4 min-[1920px]:gap-5 min-[1920px]:px-10 min-[1920px]:py-5">

          {/* Header — opak zemin, TV’de saydam/ soluk okuma yok */}
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-300 bg-white px-5 py-3.5 shadow-md">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
                EKRAN1
              </span>
              <div>
                <p className="text-base font-extrabold text-neutral-950 md:text-lg">
                  {isSingleDay ? formatDateTr(startDate) : `${formatDateTr(startDate)} — ${formatDateTr(endDate)}`}
                </p>
                {lastUpdated && (
                  <p className="text-[11px] font-semibold text-slate-700">
                    Son güncelleme {lastUpdated} · 30 sn yenileme
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded-xl border-2 border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-200"
            >
              Tam ekran
            </button>
          </header>

          {error && (
            <p className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-base font-semibold text-red-600">
              {error}
            </p>
          )}
          {loading && !lastUpdated && (
            <div className="flex shrink-0 items-center justify-center gap-2 py-3 text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              Yükleniyor…
            </div>
          )}

          {/* Genel ilerleme — kompakt; TV’de başlık her zaman okunur */}
          <section className="flex shrink-0 flex-col gap-3 md:gap-4">
            <div className="flex justify-center px-2">
              <h1
                className="rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 px-6 py-2.5 text-center font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-slate-900/25 ring-2 ring-slate-700/50 min-[1920px]:px-10 min-[1920px]:py-3"
                style={{ fontSize: "clamp(1rem, 2.8vw, 2.25rem)" }}
              >
                Genel İlerleme
              </h1>
            </div>

            {/* Bar + yüzde yan yana — rakam çizgide boğulmaz */}
            <div className="mx-auto w-full max-w-5xl px-1">
              <div
                className="grid items-center gap-3 sm:grid-cols-[1fr_auto] sm:gap-4 md:gap-6"
                role="group"
                aria-label="Genel ilerleme özeti"
              >
                <div
                  className="relative h-14 overflow-hidden rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200/90 p-[3px] shadow-[inset_0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-300/90 sm:h-16 md:h-[4.25rem] md:rounded-3xl md:p-1"
                  role="progressbar"
                  aria-valuenow={Math.round(genelPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="relative h-full overflow-hidden rounded-[0.75rem] bg-slate-300/50 md:rounded-[1.2rem]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-[0.65rem] bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition-[width] duration-1000 ease-out md:rounded-[1.1rem]"
                      style={{ width: `${genelPercent}%` }}
                    >
                      <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-white/30 to-transparent" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-center sm:justify-end">
                  <div className="flex min-w-[5.5rem] flex-col items-center rounded-2xl border-2 border-slate-800 bg-slate-900 px-4 py-2.5 shadow-lg ring-1 ring-slate-950/20 sm:min-w-[7.5rem] sm:px-6 sm:py-3 md:min-w-[9rem]">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">Oran</span>
                    <span
                      className="font-black tabular-nums leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]"
                      style={{ fontSize: "clamp(2rem, 6vw, 4.25rem)" }}
                    >
                      %{genelPercent.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hedef / gerçekleşen / kalan — biraz daha kompakt */}
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3 md:mt-5 md:gap-4">
                <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 shadow-sm sm:py-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 sm:text-[10px]">Hedef</p>
                  <p
                    className="font-black tabular-nums text-slate-800"
                    style={{ fontSize: "clamp(1.35rem, 4vw, 3.25rem)" }}
                  >
                    {target.toLocaleString("tr-TR")}
                  </p>
                </div>
                <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-2 py-3 shadow-sm sm:py-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 sm:text-[10px]">Gerçekleşen</p>
                  <p
                    className="font-black tabular-nums text-emerald-700"
                    style={{ fontSize: "clamp(1.35rem, 4vw, 3.25rem)" }}
                  >
                    {genelTamamlanan.toLocaleString("tr-TR")}
                  </p>
                </div>
                <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-amber-200 bg-amber-50 px-2 py-3 shadow-sm sm:py-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 sm:text-[10px]">Kalan</p>
                  <p
                    className="font-black tabular-nums text-amber-800"
                    style={{ fontSize: "clamp(1.35rem, 4vw, 3.25rem)" }}
                  >
                    {Math.max(0, target - genelTamamlanan).toLocaleString("tr-TR")}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Aşama kartları — kalan yükseklikte kaydır; kesilmez */}
          {stageRows.length > 0 && (
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden pt-1">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-6 [-webkit-overflow-scrolling:touch]">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-3 lg:grid-cols-5 min-[1920px]:gap-4">
                {stageRows.map((row, idx) => (
                  <div
                    key={`${row.label}-${idx}`}
                    className="relative overflow-hidden rounded-2xl border-2 border-slate-300 bg-white p-3 shadow-md md:p-3.5 dark:border-slate-600 dark:bg-slate-900"
                  >
                    {/* Üst renk şeridi */}
                    <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${row.gradient}`} />

                    <div className="flex items-start justify-between gap-2 pt-1.5">
                      <span className="min-w-0 text-left text-[11px] font-bold leading-snug text-slate-800 sm:text-xs md:text-sm dark:text-slate-100">
                        {row.label}
                      </span>
                      <span className={`shrink-0 text-base font-black tabular-nums sm:text-lg md:text-xl ${row.textColor} dark:opacity-95`}>
                        {row.pct.toFixed(0)}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 md:h-3 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${row.gradient} transition-[width] duration-1000 ease-out`}
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>

                    <p className="mt-2 text-[11px] font-bold tabular-nums text-slate-800 sm:text-xs md:text-sm dark:text-slate-200">
                      {row.value.toLocaleString("tr-TR")} / {target.toLocaleString("tr-TR")}
                    </p>
                  </div>
                ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Sağ ticker */}
      <div className="relative z-10 hidden w-52 shrink-0 border-l-2 border-slate-200 bg-white py-3 lg:flex lg:flex-col xl:w-60">
        <EfficiencyTicker items={rightItems} />
      </div>
    </div>
  );
}
