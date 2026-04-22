"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDayProductMeta,
  getHedefTakipStageTotals,
  getTeams,
  getTopWorkersAnalytics,
  getWorkerHourlyBreakdownsForDate,
  listProductModels,
  setAuthToken,
  type HedefStageLineDto,
} from "@/lib/api";
import { clampToWeekdayIso, formatIsoLocal, todayIsoTurkey } from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";
import { getProsesMap, makeProsesKey } from "@/lib/prosesVeri";
import { computeShiftHourAverages, SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import type { TopWorkerAnalytics } from "@/lib/types";

const STORAGE_KEY = "hedef_takip_settings_v1";
const REFRESH_MS = 30_000;
const TOP_N = 5;
const SLIDE_COUNT = 5;
/** Verimlilik / saatlik artan & düşen tablolarında gösterilecek satır (TV okunurluğu) */
const TREND_TABLE_TOP = 5;

const STAGE_GRADIENTS = [
  "from-emerald-500 to-teal-400",
  "from-sky-500 to-blue-400",
  "from-violet-500 to-purple-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400",
] as const;

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
  const [hedefStages, setHedefStages] = useState<HedefStageLineDto[]>([]);
  const [summaryStageCards, setSummaryStageCards] = useState<{ key: string; label: string; total: number }[]>([]);
  const [teamLabelByCode, setTeamLabelByCode] = useState<Record<string, string>>({});
  const [topWorkers, setTopWorkers] = useState<TopWorkerAnalytics[]>([]);
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

    let targetN = 5000;
    let mid: number | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { target?: number; modelId?: number | null };
        if (Number.isFinite(Number(s.target))) targetN = Number(s.target);
        if (s.modelId != null && Number.isFinite(Number(s.modelId))) mid = Number(s.modelId);
      }
    } catch {
      /* ignore */
    }
    setTarget(targetN);
    setModelId(mid);

    try {
      const [metaToday, metaPrev, allModels, bulkHourly] = await Promise.all([
        getDayProductMeta(day).catch(() => null),
        getDayProductMeta(prev).catch(() => null),
        listProductModels(),
        getWorkerHourlyBreakdownsForDate(day).catch(() => []),
      ]);
      const modelIdToday = metaToday?.modelId ?? null;
      const modelIdPrev = metaPrev?.modelId ?? null;

      const w7 = lastNWorkdaysAscending(day, 7);

      const [totalsToday, totalsPrev, tops, rawCurrent, rawPrev, teams] = await Promise.all([
        getHedefTakipStageTotals(day, day, modelIdToday ?? undefined),
        getHedefTakipStageTotals(prev, prev, modelIdPrev ?? undefined),
        getTopWorkersAnalytics({ startDate: day, endDate: day, limit: TOP_N }),
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
      setHedefStages(stToday);
      setTodayGenel(genelTamamlananFromStages(stToday));
      setYesterdayGenel(genelTamamlananFromStages(stPrev));

      const cards: { key: string; label: string; total: number }[] = [];
      for (let i = 0; i < stToday.length; i++) {
        const s = stToday[i];
        const t = Number.isFinite(s.total) ? s.total : 0;
        if (t <= 0) continue;
        const shortP = s.processName.length > 18 ? `${s.processName.slice(0, 16)}…` : s.processName;
        const label = s.processName ? `${s.teamLabel} · ${shortP}` : s.teamLabel;
        cards.push({ key: `st-${s.sortOrder}-${i}`, label, total: t });
      }
      setSummaryStageCards(cards);

      setTopWorkers(tops.slice(0, TOP_N));

      const effectiveModelId = modelIdToday ?? mid;
      const modelCodeForProses =
        effectiveModelId != null
          ? (allModels.find((m) => m.id === effectiveModelId)?.modelCode ?? null)
          : null;
      let prosesMap = getProsesMap(modelCodeForProses);
      if (Object.keys(prosesMap).length === 0) {
        for (const m of allModels) {
          const candidate = getProsesMap(m.modelCode);
          if (Object.keys(candidate).length > 0) {
            prosesMap = candidate;
            break;
          }
        }
      }

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

  /** 30 sn: arka planda veri yenile + sonraki slayta geç (görünen slayttan bağımsız) */
  useEffect(() => {
    if (!hasToken) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % SLIDE_COUNT);
      void fetchData(true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, fetchData]);

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
    if (slide === 0) return "Günlük üretim & personel";
    if (slide === 1) return "Hedef & aşamalar";
    if (slide === 2) return "Verimlilik & saatlik — artanlar";
    if (slide === 3) return "Verimlilik & saatlik — düşenler";
    return "Son 7 iş günü — genel tamamlanan";
  }, [slide]);

  function toggleFullscreen() {
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
      className="min-h-0 w-full flex-1 overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200/80 text-slate-900 [color-scheme:light]"
    >
      <div className="mx-auto flex h-full min-h-0 max-h-full max-w-[1600px] flex-col space-y-3 overflow-y-auto p-3 sm:space-y-4 sm:p-4 md:p-5 min-[1920px]:max-w-[1920px] min-[1920px]:p-6">
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
            <div className="hidden gap-1 sm:flex" aria-hidden>
              {Array.from({ length: SLIDE_COUNT }, (_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full ${slide === i ? "bg-teal-600" : "bg-slate-300"}`}
                />
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

        {error ? (
          <div className="flex-shrink-0 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-center font-semibold text-red-800">{error}</div>
        ) : null}
        {loading && !lastUpdated ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Yükleniyor…
          </div>
        ) : null}

        {!loading || lastUpdated ? (
          <>
            {slide === 0 && (
              <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-emerald-50/20 p-3 shadow-[0_12px_48px_rgba(15,23,42,0.08)] min-[1920px]:gap-5 min-[1920px]:p-5">
                <section className="grid flex-shrink-0 gap-3 sm:grid-cols-2 min-[1920px]:gap-5">
                  <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-emerald-300/70 bg-white shadow-lg ring-2 ring-emerald-100/60">
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
                  <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-slate-200/90 bg-white shadow-lg ring-1 ring-slate-200/60">
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

                <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 lg:grid-cols-2 min-[1920px]:min-h-0 min-[1920px]:gap-4">
                  <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-amber-200/50 bg-white shadow-[0_8px_32px_rgba(245,158,11,0.12)] ring-1 ring-amber-100/40">
                    <div className="shrink-0 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 px-4 py-3.5 min-[1920px]:px-6 min-[1920px]:py-5">
                      <h2 className="text-lg font-black uppercase leading-tight tracking-wide text-white sm:text-xl min-[1920px]:text-2xl min-[1920px]:tracking-[0.1em]">
                        Aşamalar (bugün)
                      </h2>
                    </div>
                    <div className="min-h-0 bg-gradient-to-b from-amber-50/40 to-white p-3.5 min-[1920px]:p-5">
                      {summaryStageCards.length === 0 ? (
                        <p className="py-4 text-center text-base font-medium text-slate-500 min-[1920px]:text-lg">Satır yok veya adet 0.</p>
                      ) : (
                        <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 min-[1920px]:gap-4">
                          {summaryStageCards.map((c, idx) => {
                            const grad = STAGE_GRADIENTS[idx % STAGE_GRADIENTS.length];
                            return (
                              <div
                                key={c.key}
                                className="group relative flex min-h-[6.25rem] items-stretch overflow-hidden rounded-2xl border border-white/90 bg-white/95 shadow-md ring-1 ring-amber-100/30 transition-shadow hover:shadow-lg min-[1920px]:min-h-[8.25rem]"
                              >
                                <div
                                  className={`w-2.5 shrink-0 bg-gradient-to-b ${grad} min-[1920px]:w-3.5`}
                                  aria-hidden
                                />
                                <div className="flex min-w-0 flex-1 flex-col justify-center px-3.5 py-3 min-[1920px]:px-5 min-[1920px]:py-4">
                                  <span className="line-clamp-3 text-xs font-bold uppercase leading-snug tracking-wide text-amber-950/90 sm:text-sm min-[1920px]:text-base min-[1920px]:leading-snug min-[1920px]:tracking-[0.06em]">
                                    {c.label}
                                  </span>
                                  <span className="mt-2 text-3xl font-black tabular-nums tracking-tight text-slate-900 min-[1920px]:mt-2.5 min-[1920px]:text-5xl min-[1920px]:leading-none">
                                    {c.total.toLocaleString("tr-TR")}
                                  </span>
                                  <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800/70 min-[1920px]:text-sm min-[1920px]:tracking-[0.14em]">
                                    adet
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-cyan-200/70 bg-white shadow-md ring-1 ring-cyan-100/50">
                    <div className="shrink-0 bg-gradient-to-r from-cyan-600 via-teal-500 to-cyan-700 px-3 py-2.5 min-[1920px]:px-4 min-[1920px]:py-3">
                      <h2 className="text-sm font-black uppercase leading-tight tracking-wide text-white sm:text-base min-[1920px]:text-lg min-[1920px]:tracking-[0.1em]">
                        En çok üreten 5 personel
                      </h2>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-cyan-50/40 to-white p-2 min-[1920px]:p-3">
                      {topWorkers.length === 0 ? (
                        <p className="text-sm text-slate-500 min-[1920px]:text-base">Bugün kayıt yok.</p>
                      ) : (
                        <ol className="grid min-h-0 flex-1 grid-cols-1 [grid-template-rows:repeat(5,minmax(0,1fr))] gap-1 min-[1920px]:gap-1.5">
                          {topWorkers.map((w, i) => {
                            const tlab = w.team ? teamLabelByCode[w.team] ?? w.team : "—";
                            return (
                              <li
                                key={w.workerId}
                                className="flex min-h-0 items-center gap-2 overflow-hidden rounded-xl border border-cyan-200/50 bg-gradient-to-r from-cyan-50/80 to-white px-2 py-0.5 shadow-sm min-[1920px]:gap-2.5 min-[1920px]:px-2.5 min-[1920px]:py-1"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 text-sm font-black text-white shadow min-[1920px]:h-9 min-[1920px]:w-9 min-[1920px]:text-base">
                                  {i + 1}
                                </span>
                                <div className="min-w-0 flex-1 overflow-hidden">
                                  <p className="truncate text-sm font-bold leading-tight text-slate-900 min-[1920px]:text-base">
                                    {w.name}
                                  </p>
                                  <p className="truncate text-[10px] leading-tight text-slate-600 min-[1920px]:text-xs">
                                    {tlab} <span className="text-slate-300">·</span> {w.process || "—"}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right leading-none">
                                  <p className="text-lg font-black tabular-nums tracking-tight text-cyan-900 min-[1920px]:text-2xl min-[1920px]:leading-none">
                                    {w.totalProduction.toLocaleString("tr-TR")}
                                  </p>
                                  <p className="text-[9px] font-semibold leading-tight text-cyan-800/70 min-[1920px]:text-[10px]">
                                    adet
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {slide === 1 && (
              <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 via-white to-emerald-50/30 p-3 shadow-[0_12px_48px_rgba(15,23,42,0.1)] min-[1920px]:gap-5 min-[1920px]:p-6">
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

                <div className="rounded-2xl border-2 border-slate-200/80 bg-white px-4 py-4 shadow-md min-[1920px]:px-6 min-[1920px]:py-6">
                  <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-end sm:gap-4">
                    <p className="text-left text-base font-black uppercase tracking-wide text-slate-800 min-[1920px]:text-xl min-[1920px]:tracking-[0.08em]">
                      Genel ilerleme (hedefe göre)
                    </p>
                    <p className="text-center text-4xl font-black tabular-nums tracking-tight text-slate-900 min-[1920px]:text-6xl min-[1920px]:leading-none sm:text-right">
                      %{genelPercent}
                    </p>
                  </div>
                  <div className="mt-4 h-5 overflow-hidden rounded-full bg-slate-200/90 shadow-inner min-[1920px]:h-7">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-sm transition-all duration-700"
                      style={{ width: `${genelPercent}%` }}
                    />
                  </div>
                </div>

                <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border-2 border-slate-200/70 bg-white shadow-md min-[1920px]:p-0">
                  {hedefStages.length === 0 ? (
                    <p className="p-4 text-base font-medium text-slate-600 min-[1920px]:p-5 min-[1920px]:text-lg">Aşama verisi yok.</p>
                  ) : (
                    <ul className="max-h-[min(40vh,26rem)] space-y-2 overflow-y-auto p-3 min-[1920px]:max-h-[min(52vh,32rem)] min-[1920px]:space-y-2.5 min-[1920px]:p-4">
                      {hedefStages.map((s, i) => {
                        const v = Number.isFinite(s.total) ? s.total : 0;
                        const shortP = s.processName.length > 20 ? `${s.processName.slice(0, 18)}…` : s.processName;
                        const label = s.processName ? `${s.teamLabel} · ${shortP}` : s.teamLabel;
                        const pct = calcPercent(v, target);
                        const g = STAGE_GRADIENTS[i % STAGE_GRADIENTS.length];
                        return (
                          <li
                            key={`${s.sortOrder}-${s.teamCode}-${s.processName}-${i}`}
                            className="grid grid-cols-1 gap-2 rounded-2xl border-2 border-slate-200/50 bg-slate-50/80 p-3 shadow-sm min-[1920px]:grid-cols-[1fr_auto] min-[1920px]:items-center min-[1920px]:gap-4 min-[1920px]:p-4"
                          >
                            <div className="min-w-0">
                              <p className="text-base font-bold leading-tight text-slate-900 min-[1920px]:text-xl">{label}</p>
                              <p className="mt-1.5 text-xl font-black tabular-nums tracking-tight text-slate-900 min-[1920px]:text-3xl min-[1920px]:leading-none">
                                {v.toLocaleString("tr-TR")}{" "}
                                <span className="text-base font-bold text-slate-400 min-[1920px]:text-2xl">/</span>{" "}
                                <span className="text-lg font-bold text-slate-600 min-[1920px]:text-2xl">
                                  {target.toLocaleString("tr-TR")}
                                </span>
                                <span className="ml-1 text-xs font-bold text-slate-600 min-[1920px]:text-base">(hedef)</span>
                              </p>
                            </div>
                            <div className="flex flex-col items-stretch gap-1.5 min-[1920px]:w-48 min-[1920px]:shrink-0 min-[1920px]:items-end">
                              <span className="text-3xl font-black tabular-nums tracking-tight text-slate-950 min-[1920px]:text-5xl min-[1920px]:leading-none">%{pct}</span>
                              <div className="h-2.5 w-full max-w-full overflow-hidden rounded-full bg-slate-200/90 min-[1920px]:h-4 min-[1920px]:max-w-[14rem]">
                                <div className={`h-full rounded-full bg-gradient-to-r ${g}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {slide === 2 && (
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 rounded-3xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white p-2 shadow-[0_12px_48px_rgba(15,23,42,0.08)] min-[1920px]:grid-cols-2 min-[1920px]:gap-5 min-[1920px]:p-4">
                <section className="flex min-h-[44vh] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_rgba(16,185,129,0.14)] ring-1 ring-emerald-200/30 min-[1920px]:min-h-[52vh]">
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

                <section className="flex min-h-[44vh] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_rgba(14,165,233,0.14)] ring-1 ring-sky-200/30 min-[1920px]:min-h-[52vh]">
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
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 rounded-3xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white p-2 shadow-[0_12px_48px_rgba(15,23,42,0.08)] min-[1920px]:grid-cols-2 min-[1920px]:gap-5 min-[1920px]:p-4">
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
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-100/90 via-white to-emerald-50/30 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.1)] min-[1920px]:p-4">
                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-[0_8px_40px_rgba(16,185,129,0.12)] ring-1 ring-emerald-200/40 backdrop-blur-sm">
                  <div className="shrink-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 px-4 py-3 min-[1920px]:px-6 min-[1920px]:py-4">
                    <h2 className="text-base font-black uppercase leading-tight tracking-wide text-white sm:text-lg min-[1920px]:text-xl min-[1920px]:tracking-[0.12em]">
                      Son 7 iş günü — genel tamamlanan
                    </h2>
                    <p className="mt-1 text-[11px] font-semibold leading-snug text-emerald-50/95 min-[1920px]:text-sm">
                      Günlük özet ile aynı metrik: aşama adetlerinin minimumu (adet)
                    </p>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 min-[1920px]:gap-4 min-[1920px]:p-5">
                    {slide5DailyPoints.length === 0 ? (
                      <p className="text-center text-base font-medium text-slate-500 min-[1920px]:text-lg">Veri yok.</p>
                    ) : (
                      <>
                        <div className="relative shrink-0 overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-500/[0.12] via-white to-cyan-50/90 p-4 shadow-[0_12px_40px_rgba(16,185,129,0.18)] ring-1 ring-emerald-100/80 min-[1920px]:rounded-3xl min-[1920px]:p-6 min-[1920px]:shadow-[0_20px_50px_rgba(16,185,129,0.2)]">
                          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-400/25 to-cyan-400/10 blur-2xl min-[1920px]:h-40 min-[1920px]:w-40" aria-hidden />
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700/90 min-[1920px]:text-xs min-[1920px]:tracking-[0.25em]">
                            Bugün — genel tamamlanan
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500 min-[1920px]:text-sm">
                            {formatTrLongWeekday(todayIso)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-end justify-between gap-3 min-[1920px]:mt-3">
                            <p className="font-black tabular-nums leading-none tracking-tight text-slate-950 text-5xl min-[1920px]:text-7xl min-[1920px]:[text-shadow:0_2px_0_rgba(16,185,129,0.2)]">
                              {slide5Hero.today.toLocaleString("tr-TR")}
                            </p>
                            <div className="min-w-0 text-right">
                              <p className="text-[10px] font-bold uppercase text-slate-400 min-[1920px]:text-xs">adet</p>
                              {slide5Hero.vsPrev != null && slide5Hero.prevDateLabel ? (
                                <p
                                  className={`mt-0.5 text-sm font-bold min-[1920px]:text-base ${
                                    slide5Hero.vsPrev > 0
                                      ? "text-emerald-600"
                                      : slide5Hero.vsPrev < 0
                                        ? "text-rose-600"
                                        : "text-slate-500"
                                  }`}
                                >
                                  {slide5Hero.vsPrev > 0 ? "↑" : slide5Hero.vsPrev < 0 ? "↓" : "→"}{" "}
                                  {slide5Hero.vsPrev > 0 ? "+" : ""}
                                  {slide5Hero.vsPrev}% <span className="font-medium text-slate-400">önceki iş gününe göre</span>
                                </p>
                              ) : (
                                <p className="mt-0.5 text-xs text-slate-400 min-[1920px]:text-sm">Önceki günle kıyas yok</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-[1920px]:mb-2 min-[1920px]:text-xs min-[1920px]:tracking-[0.15em]">
                            Önceki iş günleri
                          </p>
                          <ul className="grid max-h-[min(38vh,18rem)] min-h-0 auto-rows-min grid-cols-1 gap-1.5 overflow-y-auto pr-0.5 min-[1920px]:max-h-none min-[1920px]:gap-2 min-[1920px]:[grid-template-rows:repeat(6,minmax(0,1fr))] min-[1920px]:pr-1">
                            {slide5PastPoints.map((p) => {
                              const pct = Math.round((p.total / slide5BarMax) * 100);
                              return (
                                <li
                                  key={p.iso}
                                  className="flex min-h-0 items-stretch overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/60 shadow-sm"
                                >
                                  <div className="flex w-[6.5rem] shrink-0 items-center border-r border-slate-200/50 bg-white/90 px-2 py-1 min-[1920px]:w-[8.5rem] min-[1920px]:px-2.5 min-[1920px]:py-1.5">
                                    <span className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-600 min-[1920px]:text-sm">
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
                                    <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-slate-800 min-[1920px]:w-16 min-[1920px]:text-base min-[1920px]:leading-none">
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

            <p className="pb-1 text-center text-[11px] font-medium text-slate-500 min-[1920px]:text-sm">
              <span className="rounded-lg bg-slate-200/80 px-2 py-0.5 text-slate-700">
                Slayt {slide + 1} / {SLIDE_COUNT}
              </span>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
