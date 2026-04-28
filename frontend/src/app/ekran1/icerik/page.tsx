"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  getHedefTakipStageTotals,
  getTopWorkersAnalytics,
  getProduction,
  getProsesVeriRowsFromServer,
  getPersonnelBirthdaysToday,
  setAuthToken,
  type HedefStageLineDto,
  type PersonnelBirthdayRow,
} from "@/lib/api";

import {
  getProsesMapForEfficiency,
  makeProsesKey,
  replaceLocalGenelCacheFromServerRows,
  GENEL_VERIMLILIK_MODEL_CODE,
} from "@/lib/prosesVeri";
import { previousWeekdayIso, todayIsoTurkey, todayWorkdayIsoTurkey } from "@/lib/businessCalendar";
import { sumProductionRow } from "@/lib/productionSlots";
import { averageWorkerEfficiency, workerEfficiencyPercent } from "@/lib/workerEfficiency";
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

const BDAY_CONFETTI_SPECS: {
  left: string;
  drift: string;
  delay: string;
  dur: string;
  w: number;
  h: number;
  bg: string;
}[] = [
  { left: "2%", drift: "-32px", delay: "0s", dur: "2.65s", w: 10, h: 14, bg: "#ec4899" },
  { left: "6%", drift: "22px", delay: "0.35s", dur: "3.1s", w: 11, h: 11, bg: "#fbbf24" },
  { left: "10%", drift: "-18px", delay: "0.1s", dur: "2.85s", w: 9, h: 13, bg: "#a78bfa" },
  { left: "14%", drift: "40px", delay: "0.7s", dur: "3.35s", w: 12, h: 10, bg: "#34d399" },
  { left: "18%", drift: "-25px", delay: "0.2s", dur: "2.95s", w: 10, h: 12, bg: "#f472b6" },
  { left: "22%", drift: "15px", delay: "0.5s", dur: "3.05s", w: 13, h: 9, bg: "#60a5fa" },
  { left: "26%", drift: "-38px", delay: "0.85s", dur: "3.2s", w: 11, h: 13, bg: "#facc15" },
  { left: "30%", drift: "28px", delay: "0.15s", dur: "2.75s", w: 9, h: 11, bg: "#fb7185" },
  { left: "34%", drift: "-42px", delay: "1s", dur: "3.4s", w: 12, h: 12, bg: "#4ade80" },
  { left: "38%", drift: "33px", delay: "0.45s", dur: "2.9s", w: 10, h: 10, bg: "#c084fc" },
  { left: "42%", drift: "-20px", delay: "0.25s", dur: "3.15s", w: 11, h: 14, bg: "#f97316" },
  { left: "46%", drift: "45px", delay: "1.15s", dur: "2.8s", w: 10, h: 11, bg: "#22d3ee" },
  { left: "50%", drift: "-30px", delay: "0.55s", dur: "3.25s", w: 12, h: 10, bg: "#e879f9" },
  { left: "54%", drift: "18px", delay: "0.05s", dur: "2.7s", w: 9, h: 14, bg: "#ef4444" },
  { left: "58%", drift: "-48px", delay: "0.95s", dur: "3.3s", w: 11, h: 11, bg: "#14b8a6" },
  { left: "62%", drift: "36px", delay: "0.3s", dur: "2.88s", w: 10, h: 12, bg: "#eab308" },
  { left: "66%", drift: "-22px", delay: "1.25s", dur: "3.45s", w: 13, h: 9, bg: "#8b5cf6" },
  { left: "70%", drift: "12px", delay: "0.6s", dur: "2.72s", w: 9, h: 13, bg: "#f43f5e" },
  { left: "74%", drift: "-35px", delay: "0.12s", dur: "3.08s", w: 12, h: 11, bg: "#06b6d4" },
  { left: "78%", drift: "41px", delay: "0.8s", dur: "3.18s", w: 10, h: 10, bg: "#84cc16" },
  { left: "82%", drift: "-16px", delay: "0.4s", dur: "2.92s", w: 11, h: 13, bg: "#d946ef" },
  { left: "86%", drift: "26px", delay: "1.05s", dur: "3.38s", w: 10, h: 12, bg: "#fb923c" },
  { left: "90%", drift: "-44px", delay: "0.22s", dur: "2.78s", w: 9, h: 11, bg: "#2dd4bf" },
  { left: "94%", drift: "19px", delay: "0.65s", dur: "3.12s", w: 12, h: 10, bg: "#e11d48" },
  { left: "97%", drift: "-10px", delay: "0.18s", dur: "3.22s", w: 11, h: 14, bg: "#a3e635" },
  { left: "1%", drift: "30px", delay: "1.35s", dur: "2.98s", w: 8, h: 12, bg: "#fde047" },
  { left: "52%", drift: "-50px", delay: "1.5s", dur: "3.5s", w: 11, h: 9, bg: "#38bdf8" },
  { left: "76%", drift: "48px", delay: "0.75s", dur: "2.68s", w: 10, h: 13, bg: "#f472b6" },
  { left: "44%", drift: "-8px", delay: "1.4s", dur: "3.28s", w: 9, h: 10, bg: "#fcd34d" },
  { left: "68%", drift: "8px", delay: "0.28s", dur: "3.02s", w: 12, h: 12, bg: "#c026d3" },
];

function Ekran1BirthdayCake({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="bday-plate" x1="100" y1="108" x2="100" y2="124" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="bday-tier3" x1="40" y1="72" x2="160" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fda4af" />
          <stop offset="0.5" stopColor="#fb7185" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
        <linearGradient id="bday-tier2" x1="52" y1="48" x2="148" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef9c3" />
          <stop offset="0.5" stopColor="#fde047" />
          <stop offset="1" stopColor="#eab308" />
        </linearGradient>
        <linearGradient id="bday-tier1" x1="68" y1="28" x2="132" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e9d5ff" />
          <stop offset="0.5" stopColor="#c084fc" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="bday-icing" x1="100" y1="18" x2="100" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fffdfb" />
          <stop offset="1" stopColor="#fce7f3" />
        </linearGradient>
        <linearGradient id="bday-flame" x1="100" y1="0" x2="100" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef08a" />
          <stop offset="0.45" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      {/* Tabak */}
      <ellipse cx="100" cy="118" rx="72" ry="10" fill="url(#bday-plate)" opacity="0.92" />
      <ellipse cx="100" cy="116" rx="68" ry="7" fill="#e2e8f0" opacity="0.55" />
      {/* Alt kat */}
      <path
        d="M38 76c0-5 4.5-9 10-9h104c5.5 0 10 4 10 9v28c0 6-5.5 11-12 11H50c-6.5 0-12-5-12-11V76z"
        fill="url(#bday-tier3)"
      />
      <path
        d="M42 76c0-3 3-6 8-6h100c5 0 8 3 8 6"
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Orta kat */}
      <path
        d="M50 52c0-4.5 3.8-8 9-8h82c5.2 0 9 3.5 9 8v26c0 5-4.3 9-9.5 9H59.5c-5.2 0-9.5-4-9.5-9V52z"
        fill="url(#bday-tier2)"
      />
      <path
        d="M54 52c0-2.5 2.2-5 6-5h80c3.8 0 6 2.5 6 5"
        stroke="white"
        strokeOpacity="0.4"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Üst kat */}
      <path
        d="M64 32c0-3.5 2.8-6 7-6h58c4.2 0 7 2.5 7 6v22c0 4-3.5 7-7.5 7h-57c-4 0-7.5-3-7.5-7V32z"
        fill="url(#bday-tier1)"
      />
      {/* Üst krema */}
      <ellipse cx="100" cy="30" rx="34" ry="7" fill="url(#bday-icing)" />
      <path
        d="M74 30c4 5 8 4 12 0s8-5 12-1 8 4 12 0 8-5 12-1"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Konfeti benzeri noktalar */}
      <circle cx="52" cy="88" r="3" fill="#fff" fillOpacity="0.55" />
      <circle cx="148" cy="92" r="2.5" fill="#fff" fillOpacity="0.5" />
      <circle cx="92" cy="62" r="2.5" fill="#fff" fillOpacity="0.45" />
      <circle cx="118" cy="58" r="2" fill="#fff" fillOpacity="0.5" />
      <circle cx="78" cy="42" r="2" fill="#fff" fillOpacity="0.4" />
      {/* Mumlar */}
      <line x1="82" y1="30" x2="82" y2="12" stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" />
      <line x1="100" y1="30" x2="100" y2="10" stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" />
      <line x1="118" y1="30" x2="118" y2="12" stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="82" cy="8" rx="5" ry="7" fill="url(#bday-flame)" opacity="0.95" />
      <ellipse cx="100" cy="6" rx="5.5" ry="8" fill="url(#bday-flame)" />
      <ellipse cx="118" cy="8" rx="5" ry="7" fill="url(#bday-flame)" opacity="0.95" />
      <ellipse cx="82" cy="9" rx="2" ry="3" fill="#fef9c3" opacity="0.9" />
      <ellipse cx="100" cy="7" rx="2.2" ry="3.2" fill="#fef9c3" />
      <ellipse cx="118" cy="9" rx="2" ry="3" fill="#fef9c3" opacity="0.9" />
    </svg>
  );
}

export default function Ekran1IcerikPage() {
  const [target, setTarget] = useState(5000);
  const [stages, setStages] = useState<HedefStageLineDto[]>([]);
  const [startDate, setStartDate] = useState(() => todayWorkdayIsoTurkey());
  const [endDate, setEndDate] = useState(() => todayWorkdayIsoTurkey());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [modelId, setModelId] = useState<number | null>(null);
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([]);
  const [avgEfficiencyStats, setAvgEfficiencyStats] = useState({ avg: 0, count: 0 });
  const [prevAvgEfficiency, setPrevAvgEfficiency] = useState<number | null>(null);
  const [birthdayToday, setBirthdayToday] = useState<PersonnelBirthdayRow[]>([]);
  const [birthdayOverlayVisible, setBirthdayOverlayVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const birthdayBanner = useMemo(() => {
    if (birthdayToday.length === 0) return { title: "", namesLine: "" };
    const names = birthdayToday.map((p) => `${p.firstName} ${p.lastName}`.trim());
    const title = names.length === 1 ? "Doğum Günün Kutlu Olsun!" : "Doğum Gününüz Kutlu Olsun!";
    const namesLine = names.join("  ·  ");
    return { title, namesLine };
  }, [birthdayToday]);

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
      const [totals, rawCurrent, rawPrev, dayRowsRaw] = await Promise.all([
        getHedefTakipStageTotals(startDate, endDate, modelId ?? undefined),
        getTopWorkersAnalytics({ startDate, endDate, limit: 200 }).catch(() => []),
        getTopWorkersAnalytics({ startDate: prevStartDate, endDate: prevEndDate, limit: 200 }).catch(() => []),
        isSingleDay ? getProduction(endDate).catch(() => []) : Promise.resolve([]),
      ]);
      const dayRows = isSingleDay ? dayRowsRaw : [];
      setStages(totals.stages ?? []);

      const genelRows = await getProsesVeriRowsFromServer(GENEL_VERIMLILIK_MODEL_CODE).catch(() => []);
      if (genelRows.length > 0) {
        replaceLocalGenelCacheFromServerRows(genelRows);
      }
      const prosesMap = getProsesMapForEfficiency();

      const todayTurkey = todayWorkdayIsoTurkey();

      // Önceki dönem lookup (trend için): workerId → { totalProduction, activeDays }
      const prevMap = new Map<number, { prod: number; days: number }>(
        rawPrev.map((w) => [w.workerId, { prod: w.totalProduction, days: Math.max(w.activeDays, 1) }])
      );

      let items: TickerItem[];

      if (isSingleDay && dayRows.length === 0) {
        items = [];
        setAvgEfficiencyStats({ avg: 0, count: 0 });
        setPrevAvgEfficiency(null);
      } else if (isSingleDay && dayRows.length > 0) {
        // TR bugünü: vardiya boyunca hep saatlik pencere (09:00 → son dolu ölçüm) / saat hedefi.
        // Dün aktif sayısı 0 iken eski "gün tamam" mantığı günlük formüle düşürüp sabah verisini gizliyordu.
        const useIntraday = endDate === todayTurkey;

        items = dayRows
          .filter((r) => !r.absentForDay)
          .map((r) => {
            const dk = Number(prosesMap[makeProsesKey(r.team, r.process)]) || 0;
            const gunluk = dk * 60 * 9;
            const effPct = workerEfficiencyPercent(r, prosesMap, useIntraday) ?? 0;

            const prev = prevMap.get(r.workerId);
            const prevDaily = prev ? prev.prod / prev.days : 0;
            const prevEffPct =
              gunluk > 0 && prev
                ? Math.min(Math.round((prevDaily / gunluk) * 100), 100)
                : null;

            const trendDelta = prevEffPct != null ? effPct - prevEffPct : undefined;
            const trend: "up" | "down" | "neutral" =
              trendDelta == null || trendDelta === 0
                ? "neutral"
                : trendDelta > 0
                  ? "up"
                  : "down";

            return {
              workerId: r.workerId,
              name: r.name,
              process: r.process || "—",
              team: r.team,
              efficiencyPct: effPct,
              trend,
              trendDelta,
            };
          });

        const avgStats = averageWorkerEfficiency(dayRows, prosesMap, useIntraday);
        setAvgEfficiencyStats(avgStats);

        const prevIso = previousWeekdayIso(endDate);
        const prevRows = await getProduction(prevIso).catch(() => []);
        const { avg: prevAvg } = averageWorkerEfficiency(prevRows, prosesMap, false);
        setPrevAvgEfficiency(prevRows.length > 0 && avgStats.count > 0 ? prevAvg : null);
      } else {
        const todayActiveCount = isSingleDay ? rawCurrent.filter((w) => w.totalProduction > 0).length : 0;
        const yesterdayActiveCount = isSingleDay ? rawPrev.filter((w) => w.totalProduction > 0).length : 0;
        const isTodayComplete =
          !isSingleDay
            ? true
            : todayActiveCount === 0
              ? false
              : todayActiveCount >= yesterdayActiveCount * 0.75;

        const effSource = isSingleDay && !isTodayComplete ? rawPrev : rawCurrent;

        items = effSource.map((w) => {
          const dk = Number(prosesMap[makeProsesKey(w.team, w.process)]) || 0;
          const gunluk = dk * 60 * 9;

          const workerDaily = w.totalProduction / Math.max(w.activeDays, 1);
          const effPct =
            gunluk > 0 ? Math.min(Math.round((workerDaily / gunluk) * 100), 100) : 0;

          const prev = prevMap.get(w.workerId);
          const prevDaily = prev ? prev.prod / prev.days : 0;
          const prevEffPct =
            gunluk > 0 && prev
              ? Math.min(Math.round((prevDaily / gunluk) * 100), 100)
              : null;

          const trendDelta = prevEffPct != null ? effPct - prevEffPct : undefined;
          const trend: "up" | "down" | "neutral" =
            trendDelta == null || trendDelta === 0 ? "neutral" : trendDelta > 0 ? "up" : "down";

          return {
            workerId: w.workerId,
            name: w.name,
            process: w.process || "—",
            team: w.team,
            efficiencyPct: effPct,
            trend,
            trendDelta,
          };
        });

        const avgAgg =
          items.length > 0
            ? Math.round(items.reduce((s, i) => s + i.efficiencyPct, 0) / items.length)
            : 0;
        setAvgEfficiencyStats({ avg: avgAgg, count: items.length });
        setPrevAvgEfficiency(null);
      }

      items.sort((a, b) => b.efficiencyPct - a.efficiencyPct);
      const prodById =
        isSingleDay && dayRows.length > 0
          ? new Map(dayRows.map((r) => [r.workerId, sumProductionRow(r)]))
          : null;
      setTickerItems(
        items.filter((item) => {
          const dk = Number(prosesMap[makeProsesKey(item.team, item.process)]) || 0;
          if (dk <= 0) return false;
          if (prodById) {
            const tot = prodById.get(item.workerId) ?? 0;
            return tot > 0 || item.efficiencyPct >= 40;
          }
          return item.efficiencyPct >= 40;
        }),
      );
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
      try {
        setBirthdayToday(await getPersonnelBirthdaysToday());
      } catch {
        setBirthdayToday([]);
      }
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
    const today = todayWorkdayIsoTurkey();
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

  /** Bugün doğum günü olanlar: her 1 dakikada bir ~10 sn tam ekran kutlama */
  useEffect(() => {
    if (birthdayToday.length === 0) {
      setBirthdayOverlayVisible(false);
      return;
    }
    let hideId: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setBirthdayOverlayVisible(true);
      if (hideId) clearTimeout(hideId);
      hideId = setTimeout(() => setBirthdayOverlayVisible(false), 10_000);
    };
    show();
    const intervalId = setInterval(show, 60_000);
    return () => {
      clearInterval(intervalId);
      if (hideId) clearTimeout(hideId);
    };
  }, [birthdayToday]);

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

      {birthdayOverlayVisible && birthdayToday.length > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-950/70 via-rose-950/50 to-violet-950/65 px-3 backdrop-blur-md sm:px-8"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {BDAY_CONFETTI_SPECS.map((c, i) => (
              <span
                key={i}
                className={`ekran1-bday-confetti-piece opacity-[0.92] ${i % 3 === 0 ? "rounded-full" : "rounded-sm"}`}
                style={{
                  left: c.left,
                  width: c.w,
                  height: c.h,
                  background: c.bg,
                  animationDuration: c.dur,
                  animationDelay: c.delay,
                  ...( { "--ekran1-drift": c.drift } as CSSProperties ),
                }}
              />
            ))}
          </div>

          <div
            className="relative z-10 w-full max-w-[min(100%,48rem)] overflow-hidden rounded-3xl border border-white/50 bg-white/90 px-6 py-9 text-center shadow-[0_32px_64px_-12px_rgba(15,23,42,0.45),0_0_0_1px_rgba(255,255,255,0.8)_inset] ring-1 ring-slate-900/5 backdrop-blur-xl sm:rounded-[1.75rem] sm:px-12 sm:py-11 md:px-14 md:py-12"
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-fuchsia-500 via-rose-500 to-amber-400"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-gradient-to-br from-pink-300/50 to-violet-400/30 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-gradient-to-tr from-amber-200/45 to-rose-300/35 blur-3xl"
              aria-hidden
            />

            <div className="relative mx-auto mb-4 flex justify-center sm:mb-5">
              <div className="rounded-2xl bg-gradient-to-b from-white to-rose-50/80 px-5 py-3 shadow-[0_8px_30px_rgba(244,63,94,0.15)] ring-1 ring-rose-100/80 sm:px-7 sm:py-4">
                <Ekran1BirthdayCake className="mx-auto h-[4.75rem] w-auto drop-shadow-[0_12px_24px_rgba(15,23,42,0.12)] sm:h-[6rem] md:h-[6.75rem]" />
              </div>
            </div>

            {/* Doğum günü mesajı — pastadan hemen sonra */}
            <p
              className="relative z-20 mx-auto max-w-full font-black leading-tight tracking-tight text-slate-900"
              style={{
                fontSize: "clamp(1.35rem, 4.2vw, 2.75rem)",
                textShadow: "0 1px 0 rgba(255,255,255,1)",
              }}
            >
              {birthdayBanner.title}
            </p>

            {/* İsim(ler) — daha ölçülü */}
            <div className="relative z-20 mx-auto mt-4 max-w-full sm:mt-5">
              <div className="rounded-2xl border-2 border-slate-200/90 bg-slate-50/95 px-4 py-3 shadow-inner sm:px-6 sm:py-4">
                <p
                  className="font-black uppercase leading-snug tracking-[0.05em] text-slate-800"
                  style={{
                    fontSize: "clamp(1.15rem, 3.2vw, 2.1rem)",
                  }}
                >
                  {birthdayBanner.namesLine}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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

              {avgEfficiencyStats.count > 0 && (() => {
                const avgEff = avgEfficiencyStats.avg;
                const over75 = avgEff >= 75;
                const trendUp =
                  prevAvgEfficiency != null && avgEff > prevAvgEfficiency;
                const trendDown =
                  prevAvgEfficiency != null && avgEff < prevAvgEfficiency;
                return (
                  <div
                    className={`mt-3 rounded-2xl border-2 px-4 py-3 shadow-md sm:mt-4 sm:px-5 sm:py-3.5 ${
                      over75
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-rose-400 bg-rose-50"
                    }`}
                    role="status"
                    aria-label="Ortalama personel verimliliği"
                  >
                    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 md:gap-10">
                      <p
                        className={`shrink-0 whitespace-nowrap text-base font-black uppercase tracking-wide sm:text-lg md:text-2xl ${
                          over75 ? "text-emerald-900" : "text-rose-900"
                        }`}
                      >
                        Ortalama verimlilik
                      </p>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <p
                          className={`font-black tabular-nums leading-none ${
                            over75 ? "text-emerald-600" : "text-rose-600"
                          }`}
                          style={{
                            fontSize: "clamp(2rem, 6.5vw, 3.75rem)",
                            textShadow: over75
                              ? "0 1px 0 rgb(255 255 255 / 0.5), 0 2px 8px rgb(5 150 105 / 0.35)"
                              : "0 1px 0 rgb(255 255 255 / 0.5), 0 2px 8px rgb(225 29 72 / 0.35)",
                          }}
                        >
                          %{avgEff}
                        </p>
                        {trendUp && (
                          <span
                            className="flex shrink-0 items-center"
                            title="Önceki iş gününe göre yükseliş"
                            aria-hidden
                          >
                            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" className="sm:h-9 sm:w-9">
                              <path d="M8 3l6 9H2z" fill="#16a34a" />
                            </svg>
                          </span>
                        )}
                        {trendDown && (
                          <span
                            className="flex shrink-0 items-center"
                            title="Önceki iş gününe göre düşüş"
                            aria-hidden
                          >
                            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" className="sm:h-9 sm:w-9">
                              <path d="M8 13L2 4h12z" fill="#dc2626" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>
                    {prevAvgEfficiency != null && (
                      <p
                        className={`mt-2 text-center text-[11px] font-semibold sm:text-xs ${
                          over75 ? "text-emerald-800" : "text-rose-800"
                        }`}
                      >
                        Önceki iş günü: %{prevAvgEfficiency}
                        {trendUp ? " · yükseliş" : trendDown ? " · düşüş" : ""}
                      </p>
                    )}
                  </div>
                );
              })()}
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
