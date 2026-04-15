"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ekran3WorkerCard } from "@/components/Ekran3WorkerCard";
import {
  getTeams,
  getTopWorkersAnalytics,
  getWorkerHourlyBreakdown,
  setAuthToken,
  type WorkerHourlyBreakdown,
} from "@/lib/api";
import { formatIsoLocal, todayWeekdayIso } from "@/lib/businessCalendar";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import type { TopWorkerAnalytics } from "@/lib/types";

const REFRESH_MS = 30_000;
const TOP_LIMIT = 200;
/** Geniş aralık: son kaç iş günü baz alınır */
const WIDE_WORKING_DAYS = 30;

type CardData = {
  worker: TopWorkerAnalytics | null;
  rank: number | null;
  teamLabel: string;
  hourly: WorkerHourlyBreakdown | null;
  multiDayTotal: number;
  multiDayActiveDays: number;
  prevDayTotal: number;
};

/** fromIso tarihinden geriye doğru n iş günü öncesini döner */
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

export default function Ekran3Page() {
  const [hasToken, setHasToken] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [rotationTick, setRotationTick] = useState(0);
  const [cards, setCards] = useState<CardData[]>([
    { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
    { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
    { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
    { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const firstFetchRef = useRef(true);

  const displayDate = todayWeekdayIso();
  const wideStartDate = nWorkdaysBack(displayDate, WIDE_WORKING_DAYS);
  const yesterdayDate = nWorkdaysBack(displayDate, 1);

  const fetchAll = useCallback(async () => {
    setError("");
    if (firstFetchRef.current) setLoading(true);
    try {
      const [teams, rawToday, rawWide, rawYesterday] = await Promise.all([
        getTeams(),
        getTopWorkersAnalytics({ startDate: displayDate, endDate: displayDate, limit: TOP_LIMIT }),
        getTopWorkersAnalytics({ startDate: wideStartDate, endDate: displayDate, limit: TOP_LIMIT }),
        getTopWorkersAnalytics({ startDate: yesterdayDate, endDate: yesterdayDate, limit: TOP_LIMIT }),
      ]);

      const labelMap: Record<string, string> = Object.fromEntries(teams.map((t) => [t.code, t.label]));

      // Geniş aralık lookup: workerId → { total, activeDays }
      const wideMap = new Map<number, { total: number; days: number }>();
      for (const w of rawWide) {
        wideMap.set(w.workerId, { total: w.totalProduction, days: w.activeDays });
      }

      // Dün lookup: workerId → total
      const yesterdayMap = new Map<number, number>();
      for (const w of rawYesterday) {
        yesterdayMap.set(w.workerId, w.totalProduction);
      }

      const sorted = [...rawToday].sort((a, b) => b.totalProduction - a.totalProduction);
      const n = sorted.length;
      const start = n ? (rotationTick * 4) % n : 0;

      const empty: CardData = { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 };

      const nextCards: CardData[] = await Promise.all(
        [0, 1, 2, 3].map(async (i) => {
          if (!n) return empty;
          const idx = (start + i) % n;
          const worker = sorted[idx];
          const rank = idx + 1;
          const teamLabel = labelMap[worker.team] ?? worker.team;

          let hourly: WorkerHourlyBreakdown | null = null;
          try {
            hourly = await getWorkerHourlyBreakdown({
              workerId: worker.workerId,
              startDate: displayDate,
              endDate: displayDate,
            });
          } catch {
            hourly = null;
          }

          const wide = wideMap.get(worker.workerId);
          const multiDayTotal = wide?.total ?? 0;
          const multiDayActiveDays = wide?.days ?? 0;
          const prevDayTotal = yesterdayMap.get(worker.workerId) ?? 0;

          return { worker, rank, teamLabel, hourly, multiDayTotal, multiDayActiveDays, prevDayTotal };
        })
      );

      setCards(nextCards);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch {
      setError("Veri alınamadı.");
      setCards([
        { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
        { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
        { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
        { worker: null, rank: null, teamLabel: "", hourly: null, multiDayTotal: 0, multiDayActiveDays: 0, prevDayTotal: 0 },
      ]);
    } finally {
      firstFetchRef.current = false;
      setLoading(false);
    }
  }, [displayDate, wideStartDate, yesterdayDate, rotationTick]);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    setHasToken(!!token);
    setAllowed(isAdminRole() || hasPermission("ekran3") || hasPermission("analysis"));
    if (token) setAuthToken(token);
  }, []);

  useEffect(() => {
    if (!hasToken || !allowed) return;
    void fetchAll();
  }, [hasToken, allowed, fetchAll]);

  useEffect(() => {
    if (!hasToken || !allowed) return;
    const id = window.setInterval(() => {
      setRotationTick((t) => t + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, allowed]);

  if (!hasToken) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-slate-50 via-teal-50/40 to-emerald-100/50 px-6 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(20,184,166,0.15),transparent)]" />
        <div className="relative rounded-3xl border border-white/80 bg-white/60 px-10 py-12 shadow-surface backdrop-blur-md">
          <p className="bg-gradient-to-r from-teal-700 to-emerald-700 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            EKRAN3
          </p>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-slate-600">
            Bu pano için önce ana uygulamada giriş yapın. EKRAN3 veya Analiz yetkisi gerekir.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500 hover:shadow-teal-500/30"
          >
            Giriş yap
          </Link>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100 px-6 text-center">
        <div className="relative rounded-3xl border border-amber-100/80 bg-white/70 px-10 py-12 shadow-surface backdrop-blur-md">
          <p className="text-2xl font-bold text-slate-800">EKRAN3</p>
          <p className="mx-auto mt-4 max-w-sm text-sm text-slate-600">
            Hesabınıza EKRAN3 veya Analiz yetkisi tanımlanmalıdır.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-2xl bg-slate-800 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Ana sayfa
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-gradient-to-br from-slate-100 via-teal-50/35 to-emerald-50/45 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_100%_0%,rgba(45,212,191,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_0%_100%,rgba(16,185,129,0.08),transparent)]" />

      <header className="relative z-10 mx-2 mt-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-surface backdrop-blur-md sm:mx-3 sm:mt-3 sm:rounded-3xl sm:px-5 sm:py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white sm:text-xs">
              EKRAN3
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 sm:text-xs">
              {REFRESH_MS / 1000} sn yenileme
            </span>
            <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 sm:text-xs">
              Tur {rotationTick + 1}
            </span>
          </div>
          <p className="mt-2 truncate text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-800">4 vitrin kartı</span>
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="font-semibold text-teal-800">{displayDate}</span>
            <span className="text-slate-500"> · ort. son {WIDE_WORKING_DAYS} iş günü</span>
            {lastUpdated ? (
              <>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="tabular-nums text-slate-500">{lastUpdated}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/analysis"
            className="rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/80 hover:text-teal-900 sm:text-sm"
          >
            Analiz
          </Link>
          <button
            type="button"
            onClick={() => {
              const el = document.documentElement;
              if (el.requestFullscreen) void el.requestFullscreen();
            }}
            className="rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:from-slate-700 hover:to-slate-800 sm:text-sm"
          >
            Tam ekran
          </button>
        </div>
      </header>

      {error ? (
        <p className="relative z-10 mx-3 mt-2 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}
      {loading && !cards.some((c) => c.worker) ? (
        <div className="relative z-10 flex shrink-0 items-center justify-center gap-2 py-4 text-sm font-medium text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          Yükleniyor…
        </div>
      ) : null}

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 grid-rows-4 gap-3 p-2 sm:grid-cols-2 sm:grid-rows-2 sm:gap-4 sm:p-4">
        {cards.map((c, i) => (
          <Ekran3WorkerCard
            key={
              c.worker
                ? `${c.worker.workerId}-${rotationTick}-${i}`
                : `empty-${rotationTick}-${i}`
            }
            worker={c.worker}
            rank={c.rank}
            teamLabel={c.teamLabel}
            hourly={c.hourly}
            singleDayMode
            multiDayTotal={c.multiDayTotal}
            multiDayActiveDays={c.multiDayActiveDays}
            prevDayTotal={c.prevDayTotal}
          />
        ))}
      </div>
    </div>
  );
}
