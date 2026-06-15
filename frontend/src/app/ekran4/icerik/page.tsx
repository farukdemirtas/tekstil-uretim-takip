"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  getDayProductMeta,
  getEkran5Target,
  getHedefTakipStageTotals,
  getTeams,
  getTopWorkersAnalytics,
  getWorkerHourlyBreakdownsForDate,
  getProsesVeriRowsFromServer,
  setAuthToken,
  type HedefStageLineDto,
} from "@/lib/api";
import { clampToWeekdayIso, formatIsoLocal, todayIsoTurkey } from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";
import {
  getProsesMapForEfficiency,
  makeProsesKey,
  replaceLocalGenelCacheFromServerRows,
  GENEL_VERIMLILIK_MODEL_CODE,
  type ProsesMap,
} from "@/lib/prosesVeri";
import { computeShiftHourAverages, SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";

/** Arka planda API verisi — slayt hızından bağımsız */
const DATA_REFRESH_MS = 30_000;
/** TV’de slaytların dönüş aralığı */
const SLIDE_ROTATE_MS = 12_000;
const SLIDE_COUNT = 5;
const SLIDE_SHORT_LABELS = ["Özet", "Hedef", "Artan", "Düşen", "7 gün"] as const;
const TREND_TABLE_TOP = 5;

function workdayIsoTurkey(): string {
  return clampToWeekdayIso(todayIsoTurkey());
}

function nWorkdaysBack(fromIso: string, n: number): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  let dt = new Date(y, m - 1, d);
  let count = 0;
  while (count < n) {
    dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - 1);
    const day = dt.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return formatIsoLocal(dt);
}

/** En eski → bugün: son N iş günü (ISO), trend grafik / tablo için */
function lastNWorkdaysAscending(todayWorkdayIso: string, n: number): string[] {
  const desc: string[] = [];
  let cur = todayWorkdayIso;
  for (let i = 0; i < n; i++) {
    desc.push(cur);
    cur = nWorkdaysBack(cur, 1);
  }
  return desc.slice().reverse();
}

function formatTr(iso: string): string {
  if (!iso) return "—";
  const [a, b, c] = iso.split("-");
  return `${c}.${b}.${a}`;
}

/** TV: gün + kısa gün adı + bugün işareti */
function formatWorkdayRowLabel(iso: string, todayIso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return formatTr(iso);
  const wd = dt.toLocaleDateString("tr-TR", { weekday: "short" });
  const shortD = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
  return iso === todayIso ? `${shortD} ${wd} · bugün` : `${shortD} ${wd}`;
}

function formatTrLongWeekday(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return formatTr(iso);
  return `${formatTr(iso)} · ${dt.toLocaleDateString("tr-TR", { weekday: "long" })}`;
}

function genelTamamlananFromStages(stages: HedefStageLineDto[]): number {
  if (!stages.length) return 0;
  return Math.min(...stages.map((s) => (Number.isFinite(s.total) ? s.total : 0)));
}

function calcPercent(value: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

/** Fabrika geneli: Σ ortalama günlük üretim / Σ tanımlı günlük kapasite — kişi sıralaması değildir */
function aggregateGunlukVerimPct(
  rows: { team: string; process: string; totalProduction: number; activeDays: number }[],
  prosesMap: ProsesMap
): number | null {
  let num = 0;
  let den = 0;
  for (const w of rows) {
    const dk = Number(prosesMap[makeProsesKey(w.team, w.process)]) || 0;
    const gunluk = dk * 60 * 9;
    if (gunluk <= 0) continue;
    const workerDaily = w.totalProduction / Math.max(w.activeDays, 1);
    num += workerDaily;
    den += gunluk;
  }
  if (den <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((num / den) * 100)));
}

export default function Ekran4IcerikPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [todayIso, setTodayIso] = useState("");
  const [target, setTarget] = useState(5000);
  const [modelId, setModelId] = useState<number | null>(null);
  const [todayGenel, setTodayGenel] = useState(0);
  const [yesterdayGenel, setYesterdayGenel] = useState(0);
  const [teamLabelByCode, setTeamLabelByCode] = useState<Record<string, string>>({});
  /** Slayt 1: fabrika geneli günlük verim — kişisel değil */
  const [slide0GunlukVerimPct, setSlide0GunlukVerimPct] = useState<{
    bugun: number | null;
    dun: number | null;
  }>({ bugun: null, dun: null });
  const [dailyRisers, setDailyRisers] = useState<
    { workerId: number; name: string; process: string; team: string; delta: number; effPct: number; prevEffPct: number }[]
  >([]);
  const [hourlyRisers, setHourlyRisers] = useState<
    { workerId: number; name: string; process: string; team: string; delta: number; todayH: number; prevH: number }[]
  >([]);
  const [dailyDecliners, setDailyDecliners] = useState<
    { workerId: number; name: string; process: string; team: string; delta: number; effPct: number; prevEffPct: number }[]
  >([]);
  const [hourlyDecliners, setHourlyDecliners] = useState<
    { workerId: number; name: string; process: string; team: string; delta: number; todayH: number; prevH: number }[]
  >([]);
  /** Slayt 5: son 7 iş günü — günlük özet genel tamamlanan (min. aşama adedi) */
  const [slide5DailyPoints, setSlide5DailyPoints] = useState<{ iso: string; total: number }[]>([]);
  const [slide, setSlide] = useState(0);

  const fetchData = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError("");
    const day = workdayIsoTurkey();
    const prev = nWorkdaysBack(day, 1);
    setTodayIso(day);

    let mid: number | null = null;

    try {
      const [metaToday, metaPrev, bulkHourly] = await Promise.all([
        getDayProductMeta(day).catch(() => null),
        getDayProductMeta(prev).catch(() => null),
        getWorkerHourlyBreakdownsForDate(day).catch(() => []),
      ]);
      const modelIdToday = metaToday?.modelId ?? null;
      const modelIdPrev  = metaPrev?.modelId  ?? null;
      mid = modelIdToday;
      setModelId(mid);

      // Modeldeki hedef miktarını çek
      if (modelIdToday != null) {
        const ekranTarget = await getEkran5Target(modelIdToday).catch(() => null);
        if (ekranTarget?.ekran5Target != null && ekranTarget.ekran5Target > 0) {
          setTarget(ekranTarget.ekran5Target);
        }
      }

      const w7 = lastNWorkdaysAscending(day, 7);

      const [totalsToday, totalsPrev, rawCurrent, rawPrev, teams] = await Promise.all([
        getHedefTakipStageTotals(day, day, modelIdToday ?? undefined),
        getHedefTakipStageTotals(prev, prev, modelIdPrev ?? undefined),
        getTopWorkersAnalytics({ startDate: day, endDate: day, limit: 400 }),
        getTopWorkersAnalytics({ startDate: prev, endDate: prev, limit: 400 }),
        getTeams(),
      ]);
      setTeamLabelByCode(Object.fromEntries(teams.map((t) => [t.code, t.label])));

      const metasW7 = await Promise.all(w7.map((iso) => getDayProductMeta(iso).catch(() => null)));
      const totalsW7 = await Promise.all(
        w7.map((iso, i) => {
          if (iso === day) return Promise.resolve(totalsToday);
          if (iso === prev) return Promise.resolve(totalsPrev);
          const modelForDay = metasW7[i]?.modelId ?? mid ?? undefined;
          return getHedefTakipStageTotals(
            iso,
            iso,
            modelForDay != null ? modelForDay : undefined
          ).catch(() => ({ stages: [] as HedefStageLineDto[] }));
        })
      );
      setSlide5DailyPoints(
        w7.map((iso, i) => ({
          iso,
          total: genelTamamlananFromStages(totalsW7[i].stages ?? []),
        }))
      );

      const stToday = totalsToday.stages ?? [];
      const stPrev = totalsPrev.stages ?? [];
      setTodayGenel(genelTamamlananFromStages(stToday));
      setYesterdayGenel(genelTamamlananFromStages(stPrev));

      const genelRows = await getProsesVeriRowsFromServer(GENEL_VERIMLILIK_MODEL_CODE).catch(() => []);
      if (genelRows.length > 0) {
        replaceLocalGenelCacheFromServerRows(genelRows);
      }
      const prosesMap = getProsesMapForEfficiency();

      setSlide0GunlukVerimPct({
        bugun: aggregateGunlukVerimPct(rawCurrent, prosesMap),
        dun: aggregateGunlukVerimPct(rawPrev, prosesMap),
      });

      const prevMap = new Map(
        rawPrev.map((w) => [w.workerId, { prod: w.totalProduction, days: Math.max(w.activeDays, 1) }])
      );
      const hourlyById = new Map<number, (typeof bulkHourly)[0]>(bulkHourly.map((r) => [r.workerId, r]));

      const dayList: {
        workerId: number;
        name: string;
        process: string;
        team: string;
        delta: number;
        effPct: number;
        prevEffPct: number;
      }[] = [];
      for (const w of rawCurrent) {
        const dk = Number(prosesMap[makeProsesKey(w.team, w.process)]) || 0;
        const gunluk = dk * 60 * 9;
        const workerDaily = w.totalProduction / Math.max(w.activeDays, 1);
        const effPct = gunluk > 0 ? Math.min(Math.round((workerDaily / gunluk) * 100), 100) : 0;
        const p = prevMap.get(w.workerId);
        const prevDaily = p ? p.prod / p.days : 0;
        const prevEffPct = gunluk > 0 && p ? Math.min(Math.round((prevDaily / gunluk) * 100), 100) : null;
        if (prevEffPct == null) continue;
        const delta = effPct - prevEffPct;
        if (delta > 0) {
          dayList.push({
            workerId: w.workerId,
            name: w.name,
            process: w.process || "—",
            team: w.team || "",
            delta,
            effPct,
            prevEffPct,
          });
        }
      }
      dayList.sort((a, b) => b.delta - a.delta);
      setDailyRisers(dayList.slice(0, TREND_TABLE_TOP));

      const dayDecl: {
        workerId: number;
        name: string;
        process: string;
        team: string;
        delta: number;
        effPct: number;
        prevEffPct: number;
      }[] = [];
      for (const w of rawCurrent) {
        const dk = Number(prosesMap[makeProsesKey(w.team, w.process)]) || 0;
        const gunluk = dk * 60 * 9;
        const workerDaily = w.totalProduction / Math.max(w.activeDays, 1);
        const effPct = gunluk > 0 ? Math.min(Math.round((workerDaily / gunluk) * 100), 100) : 0;
        const p = prevMap.get(w.workerId);
        const prevDaily = p ? p.prod / p.days : 0;
        const prevEffPct = gunluk > 0 && p ? Math.min(Math.round((prevDaily / gunluk) * 100), 100) : null;
        if (prevEffPct == null) continue;
        const delta = effPct - prevEffPct;
        if (delta < 0) {
          dayDecl.push({
            workerId: w.workerId,
            name: w.name,
            process: w.process || "—",
            team: w.team || "",
            delta,
            effPct,
            prevEffPct,
          });
        }
      }
      dayDecl.sort((a, b) => a.delta - b.delta);
      setDailyDecliners(dayDecl.slice(0, TREND_TABLE_TOP));

      const hourList: {
        workerId: number;
        name: string;
        process: string;
        team: string;
        delta: number;
        todayH: number;
        prevH: number;
      }[] = [];
      for (const w of rawCurrent) {
        const p = prevMap.get(w.workerId);
        const prevTotal = p?.prod ?? 0;
        const prevH = Math.round(prevTotal / SHIFT_NOMINAL_HOURS);
        if (prevH <= 0) continue;
        const row = hourlyById.get(w.workerId);
        if (!row || w.totalProduction <= 0) continue;
        const { perHourInWindow } = computeShiftHourAverages(row, w.totalProduction);
        const delta = perHourInWindow - prevH;
        if (delta > 0) {
          hourList.push({
            workerId: w.workerId,
            name: w.name,
            process: w.process || "—",
            team: w.team || "",
            delta,
            todayH: perHourInWindow,
            prevH,
          });
        }
      }
      hourList.sort((a, b) => b.delta - a.delta);
      setHourlyRisers(hourList.slice(0, TREND_TABLE_TOP));

      const hourDecl: {
        workerId: number;
        name: string;
        process: string;
        team: string;
        delta: number;
        todayH: number;
        prevH: number;
      }[] = [];
      for (const w of rawCurrent) {
        const p = prevMap.get(w.workerId);
        const prevTotal = p?.prod ?? 0;
        const prevH = Math.round(prevTotal / SHIFT_NOMINAL_HOURS);
        if (prevH <= 0) continue;
        const row = hourlyById.get(w.workerId);
        if (!row || w.totalProduction <= 0) continue;
        const { perHourInWindow } = computeShiftHourAverages(row, w.totalProduction);
        const delta = perHourInWindow - prevH;
        if (delta < 0) {
          hourDecl.push({
            workerId: w.workerId,
            name: w.name,
            process: w.process || "—",
            team: w.team || "",
            delta,
            todayH: perHourInWindow,
            prevH,
          });
        }
      }
      hourDecl.sort((a, b) => a.delta - b.delta);
      setHourlyDecliners(hourDecl.slice(0, TREND_TABLE_TOP));

      setLastUpdated(
        new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    } catch {
      setError("Veri alınamadı. Bağlantıyı kontrol edin.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("ekran4")) {
      window.location.href = "/";
      return;
    }
    setHasToken(true);
    setAuthToken(token);
  }, []);

  useEffect(() => {
    if (!hasToken) return;
    void fetchData(false);
  }, [hasToken, fetchData]);

  useEffect(() => {
    if (!hasToken) return;
    document.documentElement.classList.add("ekran4-icerik");
    return () => document.documentElement.classList.remove("ekran4-icerik");
  }, [hasToken]);

  useEffect(() => {
    if (!hasToken) return;
    const id = window.setInterval(() => void fetchData(true), DATA_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, fetchData]);

  useEffect(() => {
    if (!hasToken) return;
    const id = window.setInterval(() => setSlide((s) => (s + 1) % SLIDE_COUNT), SLIDE_ROTATE_MS);
    return () => clearInterval(id);
  }, [hasToken]);

  const vsYesterday = useMemo(() => {
    if (yesterdayGenel <= 0) return null;
    return Math.round(((todayGenel - yesterdayGenel) / yesterdayGenel) * 100);
  }, [todayGenel, yesterdayGenel]);

  const genelPercent = useMemo(() => calcPercent(todayGenel, target), [todayGenel, target]);
  const kalan = Math.max(0, target - todayGenel);
  const slide5PastPoints = useMemo(
    () => slide5DailyPoints.filter((p) => p.iso !== todayIso),
    [slide5DailyPoints, todayIso]
  );
  const slide5BarMax = useMemo(
    () => Math.max(1, ...slide5PastPoints.map((p) => p.total)),
    [slide5PastPoints]
  );
  const slide0VerimVsPrevGun = useMemo(() => {
    const { bugun, dun } = slide0GunlukVerimPct;
    if (bugun == null || dun == null) return null;
    return bugun - dun;
  }, [slide0GunlukVerimPct]);

  const slide5Hero = useMemo(() => {
    if (!todayIso) return { today: 0, vsPrev: null as number | null, prevDateLabel: null as string | null };
    const idx = slide5DailyPoints.findIndex((p) => p.iso === todayIso);
    const todayP = idx >= 0 ? slide5DailyPoints[idx] : null;
    const prevP = idx > 0 ? slide5DailyPoints[idx - 1] : null;
    const t = todayP?.total ?? 0;
    const prevV = prevP?.total ?? 0;
    const vs = prevP && prevV > 0 ? Math.round(((t - prevV) / prevV) * 100) : null;
    return {
      today: t,
      vsPrev: vs,
      prevDateLabel: prevP ? formatTr(prevP.iso) : null,
    };
  }, [slide5DailyPoints, todayIso]);

  const slideLabel = useMemo(() => {
    if (slide === 0) return "Genel günlük verimlilik & üretim özeti";
    if (slide === 1) return "Hedef & genel ilerleme";
    if (slide === 2) return "Verimlilik & saatlik — artanlar";
    if (slide === 3) return "Verimlilik & saatlik — düşenler";
    return "Son 7 iş günü — genel tamamlanan";
  }, [slide]);

  function toggleFullscreen() {
    /** TV kabuğunda iframe içindeyken tüm tarayıcı penceresini doldurur; 4K’da içerik tam genişlik alır */
    if (window.parent !== window) {
      window.parent.postMessage({ type: "ekran-tv-toggle-fullscreen" }, "*");
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      const el = containerRef.current ?? document.documentElement;
      if (el.requestFullscreen) void el.requestFullscreen();
    }
  }

  if (!hasToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-8 text-center text-slate-800">
        <p className="text-xl font-bold">EKRAN4</p>
        <p className="text-slate-600">Bu ekran için giriş ve EKRAN4 yetkisi gerekir.</p>
        <Link href="/" className="rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white">
          Ana sayfa
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200/80 text-slate-900 [color-scheme:light]"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2 overflow-hidden p-2 min-[2560px]:max-w-7xl min-[2560px]:gap-2.5 min-[2560px]:p-4 min-[3840px]:gap-3 min-[3840px]:p-5 sm:gap-3 sm:p-3 md:gap-3 md:p-4">
        <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:px-5 min-[1920px]:px-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-white shadow-md">
              EKRAN4
            </div>
            <h1 className="mt-2 max-w-[min(100%,52rem)] text-balance text-lg font-black leading-tight tracking-tight text-slate-900 sm:text-xl min-[1920px]:text-2xl min-[1920px]:leading-snug">
              YEŞİL İMAJ TEKSTİL FABRİKA ÜRETİM VERİLERİ
            </h1>
            <p className="mt-0.5 text-sm font-semibold text-slate-600 min-[1920px]:text-base">
              {slideLabel} · {formatTr(todayIso)}
              {lastUpdated ? <span className="ml-2 text-slate-500">· {lastUpdated}</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="hidden max-w-[min(100vw-9rem,32rem)] flex-wrap items-center justify-end gap-1 sm:flex min-[1920px]:gap-1.5"
              aria-label="Slayt göstergesi"
            >
              {SLIDE_SHORT_LABELS.map((label, i) => (
                <span
                  key={label}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide shadow-sm ring-1 min-[1920px]:px-2.5 min-[1920px]:py-1 min-[1920px]:text-xs ${
                    slide === i
                      ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white ring-teal-400/40"
                      : "bg-slate-200/90 text-slate-500 ring-slate-300/60"
                  }`}
                >
                  {i + 1}. {label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded-xl border-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-100"
            >
              Tam ekran
            </button>
          </div>
        </header>

        {lastUpdated ? (
          <div className="flex-shrink-0 px-0.5" role="presentation">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-200/90 shadow-inner ring-1 ring-slate-200/50 min-[1920px]:h-2">
              <div
                key={slide}
                className="ekran4-slide-progress-bar h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
                style={
                  {
                    "--ekran4-slide-duration": `${SLIDE_ROTATE_MS}ms`,
                  } as CSSProperties
                }
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex-shrink-0 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-center font-semibold text-red-800">{error}</div>
        ) : null}
        {loading && !lastUpdated ? (
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Yükleniyor…
          </div>
        ) : null}

        {!loading || lastUpdated ? (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              key={slide}
              className="ekran4-slide-panel-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
            {slide === 0 && (
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-emerald-50/20 p-2 shadow-[0_12px_48px_rgba(15,23,42,0.08)] min-[1920px]:gap-4 min-[1920px]:p-4 min-[2560px]:gap-5 min-[2560px]:p-5 sm:gap-4 sm:p-3">
                <section className="grid flex-shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch min-[1920px]:gap-5">
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-emerald-300/70 bg-white shadow-lg ring-2 ring-emerald-100/60">
                    <div className="shrink-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 px-4 py-3.5 min-[1920px]:px-6 min-[1920px]:py-5">
                      <h2 className="text-lg font-black uppercase leading-tight tracking-wide text-white sm:text-xl min-[1920px]:text-2xl min-[1920px]:tracking-[0.1em]">
                        Bugün — genel tamamlanan
                      </h2>
                    </div>
                    <div className="flex flex-col justify-center bg-gradient-to-b from-emerald-50/50 to-white px-4 py-4 min-[1920px]:px-8 min-[1920px]:py-7">
                      <p className="text-sm font-bold text-emerald-800/90 min-[1920px]:text-base">adet</p>
                      <p className="mt-1 font-black tabular-nums tracking-tight text-slate-950 text-5xl sm:text-6xl min-[1920px]:mt-2 min-[1920px]:text-[5.75rem] min-[1920px]:leading-none">
                        {todayGenel.toLocaleString("tr-TR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-slate-200/90 bg-white shadow-lg ring-1 ring-slate-200/60">
                    <div className="shrink-0 bg-gradient-to-r from-slate-600 via-slate-500 to-slate-700 px-4 py-3.5 min-[1920px]:px-6 min-[1920px]:py-5">
                      <h2 className="text-lg font-black uppercase leading-tight tracking-wide text-white sm:text-xl min-[1920px]:text-2xl min-[1920px]:tracking-[0.1em]">
                        Dün (iş günü) — genel tamamlanan
                      </h2>
                    </div>
                    <div className="flex flex-col justify-center bg-gradient-to-b from-slate-50/80 to-white px-4 py-4 min-[1920px]:px-8 min-[1920px]:py-7">
                      <p className="text-sm font-bold text-slate-600 min-[1920px]:text-base">adet</p>
                      <p className="mt-1 font-black tabular-nums tracking-tight text-slate-900 text-5xl sm:text-6xl min-[1920px]:mt-2 min-[1920px]:text-[5.75rem] min-[1920px]:leading-none">
                        {yesterdayGenel.toLocaleString("tr-TR")}
                      </p>
                      {vsYesterday != null && (
                        <p
                          className={`mt-4 text-lg font-bold min-[1920px]:mt-5 min-[1920px]:text-xl ${
                            vsYesterday > 0 ? "text-emerald-700" : vsYesterday < 0 ? "text-red-600" : "text-slate-500"
                          }`}
                        >
                          {vsYesterday > 0 ? "↑" : vsYesterday < 0 ? "↓" : "→"} {vsYesterday > 0 ? "+" : ""}
                          {vsYesterday}% düne göre
                        </p>
                      )}
                      {yesterdayGenel <= 0 && vsYesterday == null && (
                        <p className="mt-3 text-base text-slate-500 min-[1920px]:text-lg">Dün için karşılaştırma yok</p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-200/50 bg-white shadow-[0_8px_32px_rgba(139,92,246,0.14)] ring-1 ring-violet-100/40">
                  <div className="shrink-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-600 px-4 py-3.5 min-[1920px]:px-6 min-[1920px]:py-5">
                    <h2 className="text-lg font-black uppercase leading-tight tracking-wide text-white sm:text-xl min-[1920px]:text-2xl min-[1920px]:tracking-[0.1em]">
                      Genel günlük verimlilik
                    </h2>
                    <p className="mt-1 max-w-[60rem] text-[11px] font-semibold leading-snug text-white/90 min-[1920px]:text-sm">
                      Tanımlı süreç kapasitelerinin toplamına göre (ortalama günlük üretim). Kişisel sıralama değildir; fabrika ortalamasıdır.
                    </p>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-1 content-stretch gap-6 bg-gradient-to-b from-violet-50/50 to-white px-4 py-5 min-[1920px]:grid-cols-2 min-[1920px]:gap-10 min-[1920px]:px-8 min-[1920px]:py-7">
                    <div className="flex min-h-0 min-w-0 flex-col items-center justify-center rounded-2xl border border-violet-200/70 bg-white/95 px-4 py-5 text-center shadow-inner sm:py-6 min-[1920px]:py-8">
                      <p className="text-xs font-black uppercase tracking-[0.15em] text-violet-800 min-[1920px]:text-sm">
                        Bugün
                      </p>
                      <p
                        className="mt-2 max-w-full font-black tabular-nums tracking-tight text-violet-950 leading-none min-[1920px]:mt-3"
                        style={{
                          fontSize:
                            "clamp(2.75rem, min(13vw, 18vh), 7.5rem)",
                        }}
                      >
                        {slide0GunlukVerimPct.bugun != null ? `%${slide0GunlukVerimPct.bugun}` : "—"}
                      </p>
                      <div className="mx-auto mt-4 h-2.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-violet-200/70 min-[1920px]:mt-5 min-[1920px]:h-3 min-[1920px]:max-w-[14rem]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 transition-all duration-700"
                          style={{
                            width: `${slide0GunlukVerimPct.bugun != null ? slide0GunlukVerimPct.bugun : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-col justify-center rounded-2xl border border-violet-200/50 bg-white/90 px-4 py-5 min-[1920px]:px-6 min-[1920px]:py-8">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1920px]:gap-6">
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 text-center shadow-sm min-[1920px]:px-4 min-[1920px]:py-5">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 min-[1920px]:text-xs">
                            Önceki iş günü
                          </p>
                          <p className="mt-2 text-4xl font-black tabular-nums text-slate-900 min-[1920px]:text-6xl">
                            {slide0GunlukVerimPct.dun != null ? `%${slide0GunlukVerimPct.dun}` : "—"}
                          </p>
                        </div>
                        <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-3 text-center shadow-sm min-[1920px]:px-4 min-[1920px]:py-5">
                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-900 min-[1920px]:text-xs">
                            Önceki güne göre
                          </p>
                          {slide0VerimVsPrevGun != null ? (
                            <p
                              className={`mt-2 text-3xl font-black tabular-nums min-[1920px]:text-5xl ${
                                slide0VerimVsPrevGun > 0 ? "text-emerald-700" : slide0VerimVsPrevGun < 0 ? "text-rose-600" : "text-slate-500"
                              }`}
                            >
                              {slide0VerimVsPrevGun > 0 ? "↑" : slide0VerimVsPrevGun < 0 ? "↓" : "→"}{" "}
                              {slide0VerimVsPrevGun > 0 ? "+" : ""}
                              {slide0VerimVsPrevGun} puan
                            </p>
                          ) : (
                            <p className="mt-2 text-xl font-semibold text-slate-500 min-[1920px]:text-2xl">—</p>
                          )}
                        </div>
                      </div>
                      <p className="mx-auto mt-4 max-w-lg text-center text-[11px] font-medium leading-relaxed text-slate-600 min-[1920px]:mt-5 min-[1920px]:text-sm">
                        Veri yoksa süreç hedef dk&apos;ları tanımlı olmayabilir veya bugün / dün kayıt eksik olabilir.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {slide === 1 && (
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 via-white to-emerald-50/30 p-2 shadow-[0_12px_48px_rgba(15,23,42,0.1)] min-[1920px]:gap-4 min-[1920px]:p-5 min-[2560px]:gap-5 min-[2560px]:p-6 sm:p-3">
                <section className="grid flex-shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 min-[1920px]:gap-4">
                  <div className="flex flex-col justify-center rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-5 text-center shadow-lg ring-1 ring-slate-200/50 min-[1920px]:px-6 min-[1920px]:py-6">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-800 min-[1920px]:text-sm min-[1920px]:tracking-[0.15em]">
                      Hedef
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-slate-600 min-[1920px]:text-sm">adet</p>
                    <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-slate-900 min-[1920px]:text-6xl min-[1920px]:leading-none">
                      {target.toLocaleString("tr-TR")}
                    </p>
                  </div>
                  <div className="flex flex-col justify-center rounded-2xl border-2 border-emerald-400/50 bg-gradient-to-b from-emerald-50 to-white px-4 py-5 text-center shadow-xl ring-2 ring-emerald-200/50 min-[1920px]:px-6 min-[1920px]:py-6">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-900 min-[1920px]:text-sm min-[1920px]:tracking-[0.15em]">
                      Tamamlanan
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-emerald-800/90 min-[1920px]:text-sm">adet</p>
                    <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-emerald-900 min-[1920px]:text-6xl min-[1920px]:leading-none">
                      {todayGenel.toLocaleString("tr-TR")}
                    </p>
                  </div>
                  <div className="flex flex-col justify-center rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white px-4 py-5 text-center shadow-lg ring-1 ring-amber-200/50 min-[1920px]:px-6 min-[1920px]:py-6">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-950 min-[1920px]:text-sm min-[1920px]:tracking-[0.15em]">
                      Kalan
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-amber-900/90 min-[1920px]:text-sm">adet</p>
                    <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-amber-950 min-[1920px]:text-6xl min-[1920px]:leading-none">
                      {kalan.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </section>

                <div className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border-2 border-slate-200/80 bg-white px-4 py-6 shadow-md min-[1920px]:px-10 min-[1920px]:py-12">
                  <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-end sm:gap-6">
                    <p className="text-left text-lg font-black uppercase tracking-wide text-slate-800 min-[1920px]:text-2xl min-[1920px]:tracking-[0.08em]">
                      Genel ilerleme (hedefe göre)
                    </p>
                    <p className="text-center text-5xl font-black tabular-nums tracking-tight text-slate-900 min-[1920px]:text-[4.25rem] min-[1920px]:leading-none sm:text-right">
                      %{genelPercent}
                    </p>
                  </div>
                  <div className="mt-6 h-7 overflow-hidden rounded-full bg-slate-200/90 shadow-inner min-[1920px]:mt-10 min-[1920px]:h-10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-sm transition-all duration-700"
                      style={{ width: `${genelPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {slide === 2 && (
              <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 gap-2 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white p-2 shadow-[0_12px_48px_rgba(15,23,42,0.08)] min-[1920px]:grid-cols-2 min-[1920px]:gap-4 min-[2560px]:gap-5 min-[2560px]:p-3">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_rgba(16,185,129,0.14)] ring-1 ring-emerald-200/30 min-[1920px]:min-h-0">
                  <div className="shrink-0 bg-gradient-to-r from-emerald-800 via-teal-600 to-cyan-700 px-3 py-4 min-[1920px]:px-6 min-[1920px]:py-5">
                    <h2 className="flex items-center gap-2 text-base font-black uppercase leading-tight tracking-wide text-white min-[1920px]:gap-3 min-[1920px]:text-2xl min-[1920px]:tracking-[0.12em]">
                      <span className="select-none text-2xl leading-none text-emerald-300 drop-shadow-sm min-[1920px]:text-4xl" aria-hidden>
                        ↑
                      </span>
                      Günlük verimlilik artanlar
                    </h2>
                  </div>
                  <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-2 min-[1920px]:flex min-[1920px]:items-stretch min-[1920px]:p-3">
                    {dailyRisers.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500 min-[1920px]:p-4">Veri yok veya hedef girilmemiş.</p>
                    ) : (
                      <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-left min-[1920px]:h-full min-[1920px]:self-stretch">
                        <thead>
                          <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-600 min-[1920px]:text-sm">
                            <th className="border-b-2 border-slate-200 bg-slate-100 py-3 pl-2 pr-2 min-[1920px]:pl-3 min-[1920px]:py-3.5">Personel</th>
                            <th className="w-[5.5rem] border-b-2 border-slate-200 bg-slate-100 py-3 pr-2 text-right tabular-nums min-[1920px]:w-[6.5rem] min-[1920px]:py-3.5 min-[1920px]:pr-3">
                              Dün %
                            </th>
                            <th className="w-[5.5rem] border-b-2 border-emerald-300/80 bg-emerald-50/90 py-3 pr-2 text-right font-black text-emerald-800 min-[1920px]:w-[6.5rem] min-[1920px]:py-3.5 min-[1920px]:pr-3">
                              Bugün %
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyRisers.map((r, i) => {
                            const tlab = r.team ? teamLabelByCode[r.team] ?? r.team : "—";
                            return (
                              <tr
                                key={r.workerId}
                                className="even:bg-slate-50/70 hover:bg-emerald-50/35 min-h-[3.4rem] min-[1920px]:min-h-[5.5rem]"
                              >
                                <td className="max-w-0 border-b border-slate-100 py-3 pl-2 pr-2 align-middle min-[1920px]:pl-3 min-[1920px]:py-4">
                                  <span className="text-sm font-bold text-slate-500 min-[1920px]:text-base">{i + 1}.</span>{" "}
                                  <span className="text-base font-bold text-slate-900 min-[1920px]:text-lg">{r.name}</span>
                                  <span className="mt-0.5 block truncate text-xs text-slate-500 min-[1920px]:text-sm">
                                    {tlab} · {r.process}
                                  </span>
                                </td>
                                <td className="border-b border-slate-100 py-3 pr-2 text-right text-lg font-bold tabular-nums text-slate-600 min-[1920px]:py-4 min-[1920px]:pr-3 min-[1920px]:text-2xl">
                                  %{r.prevEffPct}
                                </td>
                                <td className="border-b border-slate-100 bg-emerald-50/20 py-3 pr-2 text-right text-xl font-black tabular-nums text-emerald-500 min-[1920px]:py-4 min-[1920px]:pr-3 min-[1920px]:text-3xl min-[1920px]:leading-none min-[1920px]:text-emerald-400">
                                  %{r.effPct}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_rgba(14,165,233,0.14)] ring-1 ring-sky-200/30 min-[1920px]:min-h-0">
                  <div className="shrink-0 bg-gradient-to-r from-sky-800 via-cyan-600 to-blue-700 px-3 py-4 min-[1920px]:px-6 min-[1920px]:py-5">
                    <h2 className="flex items-center gap-2 text-base font-black uppercase leading-tight tracking-wide text-white min-[1920px]:gap-3 min-[1920px]:text-2xl min-[1920px]:tracking-[0.12em]">
                      <span className="select-none text-2xl leading-none text-emerald-300 drop-shadow-sm min-[1920px]:text-4xl" aria-hidden>
                        ↑
                      </span>
                      Saatlik ortalama artanlar
                    </h2>
                  </div>
                  <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-2 min-[1920px]:flex min-[1920px]:items-stretch min-[1920px]:p-3">
                    {hourlyRisers.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500 min-[1920px]:p-4">Artış kaydı yok.</p>
                    ) : (
                      <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-left min-[1920px]:h-full min-[1920px]:self-stretch">
                        <thead>
                          <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-600 min-[1920px]:text-sm">
                            <th className="border-b-2 border-slate-200 bg-slate-100 py-3 pl-2 pr-2 min-[1920px]:pl-3 min-[1920px]:py-3.5">Personel</th>
                            <th className="w-[5.5rem] border-b-2 border-slate-200 bg-slate-100 py-3 pr-2 text-right min-[1920px]:w-[6.5rem] min-[1920px]:py-3.5 min-[1920px]:pr-3">Dün</th>
                            <th className="w-[5.5rem] border-b-2 border-emerald-300/80 bg-emerald-50/90 py-3 pr-2 text-right font-black text-emerald-800 min-[1920px]:w-[6.5rem] min-[1920px]:py-3.5 min-[1920px]:pr-3">
                              Bugün
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {hourlyRisers.map((r, i) => {
                            const tlab = r.team ? teamLabelByCode[r.team] ?? r.team : "—";
                            return (
                              <tr key={r.workerId} className="even:bg-slate-50/70 hover:bg-sky-50/40 min-h-[3.4rem] min-[1920px]:min-h-[5.5rem]">
                                <td className="max-w-0 border-b border-slate-100 py-3 pl-2 pr-2 align-middle min-[1920px]:pl-3 min-[1920px]:py-4">
                                  <span className="text-sm font-bold text-slate-500 min-[1920px]:text-base">{i + 1}.</span>{" "}
                                  <span className="text-base font-bold text-slate-900 min-[1920px]:text-lg">{r.name}</span>
                                  <span className="mt-0.5 block truncate text-xs text-slate-500 min-[1920px]:text-sm">
                                    {tlab} · {r.process}
                                  </span>
                                </td>
                                <td className="border-b border-slate-100 py-3 pr-2 text-right text-lg font-bold tabular-nums text-slate-600 min-[1920px]:py-4 min-[1920px]:pr-3 min-[1920px]:text-2xl">
                                  {r.prevH}
                                </td>
                                <td className="border-b border-slate-100 bg-emerald-50/25 py-3 pr-2 text-right text-xl font-black tabular-nums text-emerald-500 min-[1920px]:py-4 min-[1920px]:pr-3 min-[1920px]:text-3xl min-[1920px]:leading-none min-[1920px]:text-emerald-400">
                                  {r.todayH}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              </div>
            )}

            {slide === 3 && (
              <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 gap-2 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white p-2 shadow-[0_12px_48px_rgba(15,23,42,0.08)] min-[1920px]:grid-cols-2 min-[1920px]:gap-4 min-[2560px]:gap-5 min-[2560px]:p-3">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_rgba(225,29,72,0.12)] ring-1 ring-rose-200/30">
                  <div className="shrink-0 bg-gradient-to-r from-rose-800 via-red-600 to-orange-600 px-3 py-4 min-[1920px]:px-6 min-[1920px]:py-5">
                    <h2 className="flex items-center gap-2 text-base font-black uppercase leading-tight tracking-wide text-white min-[1920px]:gap-3 min-[1920px]:text-2xl min-[1920px]:tracking-[0.12em]">
                      <span className="select-none text-2xl leading-none text-red-300 drop-shadow-sm min-[1920px]:text-4xl" aria-hidden>
                        ↓
                      </span>
                      Günlük verimlilik düşenler
                    </h2>
                  </div>
                  <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-2 min-[1920px]:p-3">
                    {dailyDecliners.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500 min-[1920px]:p-4">Kayıt yok.</p>
                    ) : (
                      <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-left">
                        <thead>
                          <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-600 min-[1920px]:text-sm">
                            <th className="border-b-2 border-slate-200 bg-slate-100 py-3 pl-2 pr-2 min-[1920px]:pl-3">Personel</th>
                            <th className="w-[5.5rem] border-b-2 border-slate-200 bg-slate-100 py-3 pr-2 text-right tabular-nums min-[1920px]:w-[6.5rem] min-[1920px]:pr-3">
                              Dün %
                            </th>
                            <th className="w-[5.5rem] border-b-2 border-rose-300/80 bg-rose-50/90 py-3 pr-2 text-right font-black text-red-800 min-[1920px]:w-[6.5rem] min-[1920px]:pr-3">
                              Bugün %
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyDecliners.map((r, i) => {
                            const tlab = r.team ? teamLabelByCode[r.team] ?? r.team : "—";
                            return (
                              <tr key={r.workerId} className="even:bg-slate-50/70 hover:bg-rose-50/30">
                                <td className="max-w-0 border-b border-slate-100 py-3 pl-2 pr-2 align-middle min-[1920px]:pl-3">
                                  <span className="text-sm font-bold text-slate-500 min-[1920px]:text-base">{i + 1}.</span>{" "}
                                  <span className="text-base font-bold text-slate-900 min-[1920px]:text-lg">{r.name}</span>
                                  <span className="mt-0.5 block truncate text-xs text-slate-500 min-[1920px]:text-sm">
                                    {tlab} · {r.process}
                                  </span>
                                </td>
                                <td className="border-b border-slate-100 py-3 pr-2 text-right text-lg font-bold tabular-nums text-slate-600 min-[1920px]:pr-3 min-[1920px]:text-2xl">
                                  %{r.prevEffPct}
                                </td>
                                <td className="border-b border-slate-100 bg-rose-50/25 py-3 pr-2 text-right text-xl font-black tabular-nums text-red-500 min-[1920px]:pr-3 min-[1920px]:text-3xl min-[1920px]:leading-none min-[1920px]:text-red-400">
                                  %{r.effPct}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_rgba(234,88,12,0.12)] ring-1 ring-orange-200/30">
                  <div className="shrink-0 bg-gradient-to-r from-orange-800 via-amber-600 to-rose-700 px-3 py-4 min-[1920px]:px-6 min-[1920px]:py-5">
                    <h2 className="flex items-center gap-2 text-base font-black uppercase leading-tight tracking-wide text-white min-[1920px]:gap-3 min-[1920px]:text-2xl min-[1920px]:tracking-[0.12em]">
                      <span className="select-none text-2xl leading-none text-red-300 drop-shadow-sm min-[1920px]:text-4xl" aria-hidden>
                        ↓
                      </span>
                      Saatlik ortalama düşenler
                    </h2>
                  </div>
                  <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-2 min-[1920px]:p-3">
                    {hourlyDecliners.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500 min-[1920px]:p-4">Kayıt yok.</p>
                    ) : (
                      <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-left">
                        <thead>
                          <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-600 min-[1920px]:text-sm">
                            <th className="border-b-2 border-slate-200 bg-slate-100 py-3 pl-2 pr-2 min-[1920px]:pl-3">Personel</th>
                            <th className="w-[5.5rem] border-b-2 border-slate-200 bg-slate-100 py-3 pr-2 text-right min-[1920px]:w-[6.5rem] min-[1920px]:pr-3">Dün</th>
                            <th className="w-[5.5rem] border-b-2 border-red-300/80 bg-rose-50/90 py-3 pr-2 text-right font-black text-red-800 min-[1920px]:w-[6.5rem] min-[1920px]:pr-3">
                              Bugün
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {hourlyDecliners.map((r, i) => {
                            const tlab = r.team ? teamLabelByCode[r.team] ?? r.team : "—";
                            return (
                              <tr key={r.workerId} className="even:bg-slate-50/70 hover:bg-orange-50/35">
                                <td className="max-w-0 border-b border-slate-100 py-3 pl-2 pr-2 align-middle min-[1920px]:pl-3">
                                  <span className="text-sm font-bold text-slate-500 min-[1920px]:text-base">{i + 1}.</span>{" "}
                                  <span className="text-base font-bold text-slate-900 min-[1920px]:text-lg">{r.name}</span>
                                  <span className="mt-0.5 block truncate text-xs text-slate-500 min-[1920px]:text-sm">
                                    {tlab} · {r.process}
                                  </span>
                                </td>
                                <td className="border-b border-slate-100 py-3 pr-2 text-right text-lg font-bold tabular-nums text-slate-600 min-[1920px]:pr-3 min-[1920px]:text-2xl">
                                  {r.prevH}
                                </td>
                                <td className="border-b border-slate-100 bg-rose-50/30 py-3 pr-2 text-right text-xl font-black tabular-nums text-red-500 min-[1920px]:pr-3 min-[1920px]:text-3xl min-[1920px]:leading-none min-[1920px]:text-red-400">
                                  {r.todayH}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              </div>
            )}

            {slide === 4 && (
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-100/90 via-white to-emerald-50/30 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.1)] min-[1920px]:p-3 min-[2560px]:p-4">
                <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-[0_8px_40px_rgba(16,185,129,0.12)] ring-1 ring-emerald-200/40 backdrop-blur-sm">
                  <div className="shrink-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 px-4 py-3.5 min-[1920px]:px-6 min-[1920px]:py-4">
                    <h2 className="text-lg font-black uppercase leading-tight tracking-wide text-white sm:text-xl min-[1920px]:text-2xl min-[1920px]:tracking-[0.12em]">
                      Son 7 iş günü — genel tamamlanan
                    </h2>
                    <p className="mt-1.5 text-xs font-semibold leading-snug text-emerald-50/95 min-[1920px]:text-base min-[1920px]:leading-snug">
                      Günlük özet ile aynı metrik: aşama adetlerinin minimumu (adet)
                    </p>
                  </div>

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 min-[1920px]:gap-3 min-[1920px]:p-4 min-[2560px]:gap-4 min-[2560px]:p-5 sm:gap-3 sm:p-3">
                    {slide5DailyPoints.length === 0 ? (
                      <p className="text-center text-base font-medium text-slate-500 min-[1920px]:text-lg">Veri yok.</p>
                    ) : (
                      <>
                        <div className="relative shrink-0 overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-500/[0.12] via-white to-cyan-50/90 p-4 shadow-[0_12px_40px_rgba(16,185,129,0.18)] ring-1 ring-emerald-100/80 min-[1920px]:rounded-3xl min-[1920px]:p-7 min-[1920px]:shadow-[0_20px_50px_rgba(16,185,129,0.2)]">
                          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-400/25 to-cyan-400/10 blur-2xl min-[1920px]:h-40 min-[1920px]:w-40" aria-hidden />
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800 min-[1920px]:text-base min-[1920px]:tracking-[0.2em]">
                            Bugün — genel tamamlanan
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-600 min-[1920px]:mt-1.5 min-[1920px]:text-lg">
                            {formatTrLongWeekday(todayIso)}
                          </p>
                          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 min-[1920px]:mt-4 min-[1920px]:gap-4">
                            <p className="font-black tabular-nums leading-none tracking-tight text-slate-950 text-6xl min-[1920px]:text-8xl min-[1920px]:[text-shadow:0_3px_0_rgba(16,185,129,0.15)]">
                              {slide5Hero.today.toLocaleString("tr-TR")}
                            </p>
                            <div className="min-w-0 text-right">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 min-[1920px]:text-sm">adet</p>
                              {slide5Hero.vsPrev != null && slide5Hero.prevDateLabel ? (
                                <p
                                  className={`mt-1 text-base font-bold min-[1920px]:text-xl ${
                                    slide5Hero.vsPrev > 0
                                      ? "text-emerald-600"
                                      : slide5Hero.vsPrev < 0
                                        ? "text-rose-600"
                                        : "text-slate-500"
                                  }`}
                                >
                                  {slide5Hero.vsPrev > 0 ? "↑" : slide5Hero.vsPrev < 0 ? "↓" : "→"}{" "}
                                  {slide5Hero.vsPrev > 0 ? "+" : ""}
                                  {slide5Hero.vsPrev}%{" "}
                                  <span className="font-semibold text-slate-500 min-[1920px]:text-lg min-[1920px]:text-slate-500">
                                    önceki iş gününe göre
                                  </span>
                                </p>
                              ) : (
                                <p className="mt-1 text-sm text-slate-400 min-[1920px]:text-base">Önceki günle kıyas yok</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                          <p className="mb-1.5 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500 min-[1920px]:mb-2 min-[1920px]:text-sm min-[1920px]:tracking-[0.15em]">
                            Önceki iş günleri
                          </p>
                          <ul className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-1.5 overflow-y-auto overscroll-contain pr-0.5 [grid-auto-rows:minmax(0,1fr)] min-[1920px]:gap-2 min-[1920px]:[grid-template-rows:repeat(6,minmax(0,1fr))] min-[1920px]:pr-1">
                            {slide5PastPoints.map((p) => {
                              const pct = Math.round((p.total / slide5BarMax) * 100);
                              return (
                                <li
                                  key={p.iso}
                                  className="flex min-h-0 items-stretch overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/60 shadow-sm"
                                >
                                  <div className="flex w-[6.5rem] shrink-0 items-center border-r border-slate-200/50 bg-white/90 px-2 py-1 min-[1920px]:w-[8.5rem] min-[1920px]:px-2.5 min-[1920px]:py-1.5">
                                    <span className="line-clamp-2 text-xs font-bold leading-tight text-slate-600 min-[1920px]:text-base">
                                      {formatWorkdayRowLabel(p.iso, todayIso)}
                                    </span>
                                  </div>
                                  <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 min-[1920px]:gap-2 min-[1920px]:px-2.5">
                                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/80 min-[1920px]:h-2.5">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-slate-400 to-slate-500"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-slate-800 min-[1920px]:w-[4.5rem] min-[1920px]:text-lg min-[1920px]:leading-none">
                                      {p.total.toLocaleString("tr-TR")}
                                    </span>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                </section>
              </div>
            )}
            </div>

            <p className="shrink-0 pb-1 pt-0.5 text-center text-[11px] font-medium text-slate-500 min-[1920px]:text-sm">
              <span className="rounded-lg bg-slate-200/80 px-2 py-0.5 text-slate-700">
                Slayt {slide + 1} / {SLIDE_COUNT}
              </span>
              <span className="ml-2 text-slate-500">
                · döngü {Math.round(SLIDE_ROTATE_MS / 1000)} sn · veri {Math.round(DATA_REFRESH_MS / 1000)} sn
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
