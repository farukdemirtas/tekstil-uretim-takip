"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getHedefTakipStageTotals,
  getTopWorkersAnalytics,
  getWorkerDailyAnalytics,
  setAuthToken,
  type HedefStageLineDto,
} from "@/lib/api";
import { clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
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

const STAGE_TEXT = [
  "text-emerald-400",
  "text-sky-400",
  "text-violet-400",
  "text-amber-400",
  "text-rose-400",
  "text-cyan-400",
  "text-fuchsia-400",
  "text-lime-400",
] as const;

export default function Ekran1IcerikPage() {
  const [target, setTarget] = useState(5000);
  const [stages, setStages] = useState<HedefStageLineDto[]>([]);
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate] = useState(todayWeekdayIso());
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
      // Filtreli dönemden geriye doğru geniş referans ve önceki dönem
      const rangeDays = daysBetween(startDate, endDate);
      const prevEndDate = nWorkdaysBack(startDate, 1);
      const prevStartDate = nWorkdaysBack(startDate, rangeDays);

      const isSingleDay = startDate === endDate;

      // Tek gün: son 5 iş günü referans penceresi (seçili günü kapsamaz)
      const ref5End = nWorkdaysBack(startDate, 1);
      const ref5Start = nWorkdaysBack(startDate, 5);

      const requests: [
        ReturnType<typeof getHedefTakipStageTotals>,
        ReturnType<typeof getTopWorkersAnalytics>,
        ReturnType<typeof getTopWorkersAnalytics>,
        Promise<Awaited<ReturnType<typeof getWorkerDailyAnalytics>> | null>,
        Promise<Awaited<ReturnType<typeof getTopWorkersAnalytics>> | null>,
      ] = [
        getHedefTakipStageTotals(startDate, endDate, modelId ?? undefined),
        getTopWorkersAnalytics({ startDate, endDate, limit: 200 }),
        getTopWorkersAnalytics({ startDate: prevStartDate, endDate: prevEndDate, limit: 200 }),
        // Çok gün: en iyi gün için detay
        isSingleDay ? Promise.resolve(null) : getWorkerDailyAnalytics({ startDate, endDate }),
        // Tek gün: son 5 gün referansı
        isSingleDay
          ? getTopWorkersAnalytics({ startDate: ref5Start, endDate: ref5End, limit: 200 })
          : Promise.resolve(null),
      ];

      const [totals, rawCurrent, rawPrev, rawDailyOrNull, rawRef5OrNull] = await Promise.all(requests);
      setStages(totals.stages ?? []);

      // ── Tek gün: bugün tam mı girildi? ──────────────────────────────────
      // Bugünkü aktif personel sayısı dünkünün %75'ine ulaşmadıysa
      // gün henüz tam girilmemiş sayılır → verimlilik dünün verisinden gösterilir.
      const todayActiveCount = isSingleDay
        ? rawCurrent.filter((w) => w.totalProduction > 0).length
        : 0;
      const yesterdayActiveCount = isSingleDay
        ? rawPrev.filter((w) => w.totalProduction > 0).length
        : 0;
      const isTodayComplete =
        !isSingleDay ||
        todayActiveCount === 0
          ? true  // single-day değilse veya bugün hiç veri yoksa rawCurrent'ı aynen kullan
          : todayActiveCount >= yesterdayActiveCount * 0.75;

      // Verimlilik kaynağı: tamamlanmadıysa dün, tamamlandıysa bugün
      const effSource = isSingleDay && !isTodayComplete ? rawPrev : rawCurrent;

      // Kaynak verinin günlük ortalaması
      const effAvgMap = new Map<number, number>();
      for (const w of effSource) {
        effAvgMap.set(w.workerId, w.totalProduction / Math.max(w.activeDays, 1));
      }

      // Proses referansı: %100 tavanı
      const processRefMap = new Map<string, number>();

      if (isSingleDay) {
        // Son 5 gün referansı (seçili günü kapsamaz)
        const ref5AvgMap = new Map<number, number>();
        for (const w of rawRef5OrNull ?? []) {
          ref5AvgMap.set(w.workerId, w.totalProduction / Math.max(w.activeDays, 1));
        }
        // Proses tavanı: o prosesteki kişilerin 5 günlük ortalamalarının maksimumu
        for (const w of effSource) {
          const key = w.process || "—";
          const ref = ref5AvgMap.get(w.workerId) ?? 0;
          const cur = processRefMap.get(key) ?? 0;
          if (ref > cur) processRefMap.set(key, ref);
        }
        // Referans verisi yoksa effSource'un max üretimi (fallback)
        for (const w of effSource) {
          const key = w.process || "—";
          if (!processRefMap.get(key)) {
            const cur = processRefMap.get(key) ?? 0;
            if (w.totalProduction > cur) processRefMap.set(key, w.totalProduction);
          }
        }
      } else {
        // Çok gün: her kişinin en iyi günü → proses içi max = tavan
        const bestDayMap = new Map<number, number>();
        for (const row of rawDailyOrNull ?? []) {
          const cur = bestDayMap.get(row.workerId) ?? 0;
          if (row.production > cur) bestDayMap.set(row.workerId, row.production);
        }
        for (const w of rawCurrent) {
          const key = w.process || "—";
          const wBest = bestDayMap.get(w.workerId) ?? 0;
          const cur = processRefMap.get(key) ?? 0;
          if (wBest > cur) processRefMap.set(key, wBest);
        }
      }

      // Önceki dönem lookup: workerId → toplam üretim (trend için)
      const prevMap = new Map<number, number>(
        rawPrev.map((w) => [w.workerId, w.totalProduction])
      );

      const items: TickerItem[] = effSource.map((w) => {
        const processKey = w.process || "—";
        const workerDaily = effAvgMap.get(w.workerId) ?? 0;
        const refVal = processRefMap.get(processKey) ?? 0;

        const effPct =
          refVal > 0 ? Math.min(Math.round((workerDaily / refVal) * 100), 100) : 0;

        // Trend: bugün girilmişse bugün vs dün, dünden gösteriliyorsa dün vs önceki gün
        const prevProd = prevMap.get(w.workerId) ?? 0;
        const curProd = w.totalProduction;
        const trend: "up" | "down" | "neutral" =
          prevProd <= 0 || curProd === prevProd
            ? "neutral"
            : curProd > prevProd
            ? "up"
            : "down";

        return {
          workerId: w.workerId,
          name: w.name,
          process: processKey,
          team: w.team,
          efficiencyPct: effPct,
          trend,
        };
      });

      items.sort((a, b) => b.efficiencyPct - a.efficiencyPct);
      setTickerItems(items.filter((item) => item.efficiencyPct >= 50));
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
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          target?: number;
          startDate?: string;
          endDate?: string;
          modelId?: number | null;
        };
        if (Number.isFinite(Number(saved.target))) setTarget(Number(saved.target));
        if (saved.startDate) setStartDate(clampToWeekdayIso(saved.startDate));
        if (saved.endDate) setEndDate(clampToWeekdayIso(saved.endDate));
        if (saved.modelId != null && Number.isFinite(Number(saved.modelId))) {
          setModelId(Number(saved.modelId));
        }
      }
    } catch { /* ignore */ }
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
      className="fixed inset-0 flex flex-row overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
    >
      {/* Arka plan efekti */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(16,185,129,0.08),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(56,189,248,0.05),transparent)]" />

      {/* Sol ticker */}
      <div className="hidden w-52 shrink-0 border-r border-slate-200 bg-white/90 py-3 lg:flex lg:flex-col xl:w-60">
        <EfficiencyTicker items={leftItems} />
      </div>

      {/* Ana içerik */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[1920px] flex-1 flex-col gap-5 px-6 py-5 md:gap-8 md:px-10 md:py-8">

          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow-md shadow-emerald-500/20">
                EKRAN1
              </span>
              <div>
                <p className="text-base font-bold text-slate-900 md:text-lg">
                  {isSingleDay ? formatDateTr(startDate) : `${formatDateTr(startDate)} — ${formatDateTr(endDate)}`}
                </p>
                {lastUpdated && (
                  <p className="text-[11px] text-slate-400">Son güncelleme {lastUpdated} · 30 sn yenileme</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Tam ekran
            </button>
          </header>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-base font-semibold text-red-600">
              {error}
            </p>
          )}
          {loading && !lastUpdated && (
            <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              Yükleniyor…
            </div>
          )}

          {/* Genel ilerleme */}
          <section className="flex flex-1 flex-col justify-center gap-5 md:gap-8">
            <h1
              className="text-center font-black uppercase tracking-tight text-slate-900"
              style={{ fontSize: "clamp(2rem, 6vw, 5.5rem)" }}
            >
              Genel İlerleme
            </h1>

            {/* Ana progress bar */}
            <div className="relative mx-auto w-full max-w-5xl">
              <div
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner"
                style={{ height: "clamp(5rem, 12vh, 9rem)" }}
                role="progressbar"
                aria-valuenow={Math.round(genelPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                {/* Dolgu */}
                <div
                  className="absolute inset-y-0 left-0 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 transition-[width] duration-1000 ease-out"
                  style={{ width: `${genelPercent}%` }}
                >
                  <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-2xl bg-white/25" />
                </div>
                {/* Yüzde */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="font-black tabular-nums text-slate-900 drop-shadow"
                    style={{
                      fontSize: "clamp(2.2rem, 7vw, 5.5rem)",
                      textShadow: "0 1px 0 rgba(255,255,255,0.9), 0 2px 6px rgba(0,0,0,0.15)",
                    }}
                  >
                    %{genelPercent.toFixed(0)}
                  </span>
                </div>
              </div>

              {/* Hedef / gerçekleşen / kalan */}
              <div className="mt-5 grid grid-cols-3 gap-3 md:gap-5">
                {/* Hedef */}
                <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 md:text-xs">
                    Hedef
                  </p>
                  <p
                    className="font-black tabular-nums text-slate-800"
                    style={{ fontSize: "clamp(2.2rem, 5.5vw, 5rem)" }}
                  >
                    {target.toLocaleString("tr-TR")}
                  </p>
                </div>
                {/* Gerçekleşen */}
                <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 md:text-xs">
                    Gerçekleşen
                  </p>
                  <p
                    className="font-black tabular-nums text-emerald-700"
                    style={{ fontSize: "clamp(2.2rem, 5.5vw, 5rem)" }}
                  >
                    {genelTamamlanan.toLocaleString("tr-TR")}
                  </p>
                </div>
                {/* Kalan */}
                <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 md:text-xs">
                    Kalan
                  </p>
                  <p
                    className="font-black tabular-nums text-amber-700"
                    style={{ fontSize: "clamp(2.2rem, 5.5vw, 5rem)" }}
                  >
                    {Math.max(0, target - genelTamamlanan).toLocaleString("tr-TR")}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Aşama kartları */}
          {stageRows.length > 0 && (
            <section className="mt-auto grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
              {stageRows.map((row, idx) => (
                <div
                  key={`${row.label}-${idx}`}
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4"
                >
                  {/* Üst renk şeridi */}
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${row.gradient}`} />

                  <div className="flex items-start justify-between gap-1 pt-1">
                    <span className="text-xs font-semibold leading-tight text-slate-600 md:text-sm">
                      {row.label}
                    </span>
                    <span className={`shrink-0 text-lg font-black tabular-nums md:text-2xl ${row.textColor}`}>
                      {row.pct.toFixed(0)}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100 md:h-2.5">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${row.gradient} transition-[width] duration-1000 ease-out`}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>

                  <p className="mt-1.5 text-xs font-semibold tabular-nums text-slate-500 md:text-sm">
                    {row.value.toLocaleString("tr-TR")} / {target.toLocaleString("tr-TR")}
                  </p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      {/* Sağ ticker */}
      <div className="hidden w-52 shrink-0 border-l border-slate-200 bg-white/90 py-3 lg:flex lg:flex-col xl:w-60">
        <EfficiencyTicker items={rightItems} />
      </div>
    </div>
  );
}
