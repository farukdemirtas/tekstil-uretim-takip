"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDailyTrendAnalytics,
  getTeams,
  getTopWorkersAnalytics,
  setAuthToken,
} from "@/lib/api";
import { clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import { rankTercileStyles } from "@/lib/rankTercile";
import type { DailyTrendPoint, HourFilter, Team, TopWorkerAnalytics } from "@/lib/types";

const STORAGE_KEY = "ekran2_settings_v1";
const EKRAN2_MODE_KEY = "ekran2_display_mode";
const AUTO_REFRESH_MS = 30_000;
/** Backend LIMIT; analiz sayfasıyla aynı mantık — tüm sıralı personel */
const WORKER_LIST_LIMIT = 9999;
/** Analiz — Günlük Trend Çizgisi stroke */
const ANALYSIS_TREND_STROKE = "#16a34a";

type Ekran2Mode = "dark" | "light";
type Phase = "setup" | "display";

type StoredSettings = {
  startDate: string;
  endDate: string;
  hour: HourFilter;
  applied: boolean;
  /** Tanımlı değil veya kayıtta yok: tüm bölümler */
  teamCodes?: string[];
};

/** Ana TV düzenindeki sabit sıra (ayarlarda eklenen diğer bölümler ayrı şeritte) */
const HEDEF_ORDER = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM"] as const;
const HEDEF_SET = new Set<string>(HEDEF_ORDER);

function formatDateTr(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function hourLabel(hour: HourFilter) {
  if (hour === "t1000") return "10:00";
  if (hour === "t1300") return "13:00";
  if (hour === "t1600") return "16:00";
  if (hour === "t1830") return "18:30";
  return "Tüm saatler";
}

function readStored(): StoredSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredSettings>;
    if (!p.startDate || !p.endDate) return null;
    const hour = p.hour === "t1000" || p.hour === "t1300" || p.hour === "t1600" || p.hour === "t1830" ? p.hour : "";
    const rawCodes = p.teamCodes;
    const teamCodes =
      Array.isArray(rawCodes) && rawCodes.length > 0
        ? rawCodes.filter((c): c is string => typeof c === "string" && c.length > 0)
        : undefined;
    return {
      startDate: clampToWeekdayIso(p.startDate),
      endDate: clampToWeekdayIso(p.endDate),
      hour,
      applied: Boolean(p.applied),
      ...(teamCodes && teamCodes.length > 0 ? { teamCodes } : {}),
    };
  } catch {
    return null;
  }
}

function writeStored(s: StoredSettings) {
  const out: Record<string, unknown> = {
    startDate: s.startDate,
    endDate: s.endDate,
    hour: s.hour,
    applied: s.applied,
  };
  if (s.teamCodes && s.teamCodes.length > 0) out.teamCodes = s.teamCodes;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
}

type TeamBlockData = {
  key: Team;
  top: TopWorkerAnalytics[];
  trend: DailyTrendPoint[];
};

function MiniTrendChart({ points, dark, compact }: { points: DailyTrendPoint[]; dark: boolean; compact?: boolean }) {
  const stroke = ANALYSIS_TREND_STROKE;
  const W = 280;
  const H = compact ? 48 : 80;
  const pad = compact ? 5 : 8;
  const svgH = compact ? "h-10" : "h-16";
  if (points.length === 0) {
    return (
      <div className={`py-1 text-center text-xs sm:text-sm ${dark ? "text-slate-500" : "text-slate-500"}`}>Trend yok</div>
    );
  }
  const max = Math.max(...points.map((p) => p.totalProduction), 1);
  if (points.length === 1) {
    const y = pad + (1 - points[0].totalProduction / max) * (H - 2 * pad);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={`${svgH} w-full`} preserveAspectRatio="xMidYMid meet">
        <circle cx={W / 2} cy={y} r={compact ? 3.5 : 5} fill={stroke} />
      </svg>
    );
  }
  const d = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (W - 2 * pad);
      const y = pad + (1 - p.totalProduction / max) * (H - 2 * pad);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${svgH} w-full`} preserveAspectRatio="none">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={compact ? 2 : 2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={dark ? 0.95 : 1}
      />
    </svg>
  );
}

function PersonnelRows({
  rows,
  sliceStart,
  sliceEnd,
  metaKey,
  maxTop,
  total,
  dark,
  textClass,
  barH,
}: {
  rows: TopWorkerAnalytics[];
  sliceStart: number;
  sliceEnd: number;
  metaKey: Team;
  maxTop: number;
  total: number;
  dark: boolean;
  textClass: string;
  barH: string;
}) {
  const part = rows.slice(sliceStart, sliceEnd);
  return (
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:thin]">
      {part.map((row, j) => {
        const index = sliceStart + j;
        const w = maxTop > 0 ? Math.max(8, Math.round((row.totalProduction / maxTop) * 100)) : 0;
        const { bar: barColor, rank: rankClass } = rankTercileStyles(index, total);
        return (
          <div
            key={`${metaKey}-${row.workerId}-${index}`}
            className={`grid grid-cols-[1.1rem_minmax(0,1fr)_1fr_2rem] items-center gap-1 sm:grid-cols-[1.25rem_minmax(0,1fr)_1fr_2.25rem] ${textClass}`}
          >
            <span className={`tabular-nums ${rankClass}`}>{index + 1}</span>
            <span className="truncate font-medium">{row.name}</span>
            <div className={`${barH} overflow-hidden rounded-full ${dark ? "bg-slate-800" : "bg-slate-200"}`}>
              <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${w}%` }} />
            </div>
            <span className="text-right tabular-nums font-semibold">{row.totalProduction}</span>
          </div>
        );
      })}
    </div>
  );
}

function Ekran2TeamPanel({
  meta,
  dataMap,
  dark,
  className = "",
  compactChart = false,
  personnelTwoCols = false,
  variant = "default",
}: {
  meta: { key: Team; label: string };
  dataMap: Map<Team, TeamBlockData>;
  dark: boolean;
  className?: string;
  /** Dar (Yaka/Arka) bloklar için daha kısa trend grafiği */
  compactChart?: boolean;
  /** Bitim: personel listesi iki sütunda */
  personnelTwoCols?: boolean;
  /** Ayarlardan eklenen bölümler — günlük özet / analiz ile aynı vurgu */
  variant?: "default" | "extra";
}) {
  const data = dataMap.get(meta.key);
  const top = data?.top ?? [];
  const trend = data?.trend ?? [];
  const maxTop = top.reduce((m, r) => Math.max(m, r.totalProduction), 0);
  const totalTrend = trend.reduce((s, p) => s + p.totalProduction, 0);
  const daysWith = trend.filter((p) => p.totalProduction > 0).length;
  const avgDay = daysWith > 0 ? Math.round(totalTrend / daysWith) : 0;

  const rowText = "text-xs leading-snug sm:text-sm lg:text-[0.95rem]";
  const barH = "h-2 sm:h-2.5 lg:h-3";
  const mid = Math.ceil(top.length / 2);

  const extraRing =
    variant === "extra"
      ? dark
        ? "ring-1 ring-violet-400/35 border-violet-500/25"
        : "ring-1 ring-violet-400/50 border-violet-200"
      : "";

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border p-2 sm:p-2.5 lg:p-3 ${
        dark ? "border-white/10 bg-slate-900/55" : "border-slate-200 bg-white shadow-sm"
      } ${extraRing} ${className}`.trim()}
    >
      <h2
        className={`text-center text-sm font-bold leading-tight sm:text-base lg:text-lg xl:text-xl ${dark ? "text-white" : "text-slate-900"}`}
      >
        {meta.label}
      </h2>

      <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-xs sm:text-sm lg:text-base">
        <div className={`rounded-lg py-1 sm:py-1.5 ${dark ? "bg-slate-800/80" : "bg-slate-50"}`}>
          <div className={`font-bold tabular-nums ${dark ? "text-teal-300" : "text-teal-700"}`}>{totalTrend}</div>
          <div className={`text-[10px] sm:text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>Toplam</div>
        </div>
        <div className={`rounded-lg py-1 sm:py-1.5 ${dark ? "bg-slate-800/80" : "bg-slate-50"}`}>
          <div className="font-bold tabular-nums">{daysWith}</div>
          <div className={`text-[10px] sm:text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>Aktif gün</div>
        </div>
        <div className={`rounded-lg py-1 sm:py-1.5 ${dark ? "bg-slate-800/80" : "bg-slate-50"}`}>
          <div className="font-bold tabular-nums">{avgDay}</div>
          <div className={`text-[10px] sm:text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>Ort./gün</div>
        </div>
      </div>

      <div className="mt-1.5 shrink-0" title="Günlük trend">
        <MiniTrendChart points={trend} dark={dark} compact={compactChart} />
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-transparent pt-1.5 dark:border-white/5">
        <p className={`mb-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide sm:text-xs lg:text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
          Personel ({top.length})
        </p>
        {top.length === 0 ? (
          <p className={`text-sm sm:text-base ${dark ? "text-slate-500" : "text-slate-500"}`}>Kayıt yok</p>
        ) : personnelTwoCols ? (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 lg:gap-3">
            <PersonnelRows
              rows={top}
              sliceStart={0}
              sliceEnd={mid}
              metaKey={meta.key}
              maxTop={maxTop}
              total={top.length}
              dark={dark}
              textClass={rowText}
              barH={barH}
            />
            <PersonnelRows
              rows={top}
              sliceStart={mid}
              sliceEnd={top.length}
              metaKey={meta.key}
              maxTop={maxTop}
              total={top.length}
              dark={dark}
              textClass={rowText}
              barH={barH}
            />
          </div>
        ) : (
          <PersonnelRows
            rows={top}
            sliceStart={0}
            sliceEnd={top.length}
            metaKey={meta.key}
            maxTop={maxTop}
            total={top.length}
            dark={dark}
            textClass={rowText}
            barH={barH}
          />
        )}
      </div>
    </div>
  );
}

export default function Ekran2Page() {
  const [hasToken, setHasToken] = useState(false);
  const [canUseEkran2, setCanUseEkran2] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate] = useState(todayWeekdayIso());
  const [hourFilter, setHourFilter] = useState<HourFilter>("");
  const [displayMode, setDisplayMode] = useState<Ekran2Mode>("light");
  const [blocks, setBlocks] = useState<TeamBlockData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [teamMetas, setTeamMetas] = useState<Array<{ code: string; label: string }>>([]);
  /** null = tüm bölümler; dizi = yalnızca bu kodlar */
  const [selectedTeamCodes, setSelectedTeamCodes] = useState<string[] | null>(null);
  const [setupError, setSetupError] = useState("");

  const dark = displayMode === "dark";

  const fullTeamOrder = useMemo(() => {
    const codes = new Set(teamMetas.map((t) => t.code));
    const primary = HEDEF_ORDER.filter((k) => codes.has(k));
    const extra = teamMetas.filter((t) => !HEDEF_SET.has(t.code)).map((t) => t.code);
    return [...primary, ...extra] as Team[];
  }, [teamMetas]);

  const orderedKeys = useMemo(() => {
    if (teamMetas.length === 0) return [] as Team[];
    if (selectedTeamCodes === null) return fullTeamOrder;
    const sel = new Set(selectedTeamCodes);
    return fullTeamOrder.filter((k) => sel.has(k));
  }, [teamMetas, fullTeamOrder, selectedTeamCodes]);

  const orderedKeySet = useMemo(() => new Set(orderedKeys), [orderedKeys]);

  const extraMetas = useMemo(
    () => teamMetas.filter((t) => !HEDEF_SET.has(t.code) && orderedKeySet.has(t.code)),
    [teamMetas, orderedKeySet]
  );

  const metaFor = useCallback(
    (code: string) => {
      const t = teamMetas.find((x) => x.code === code);
      return t ? { key: t.code as Team, label: t.label } : null;
    },
    [teamMetas]
  );

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    setHasToken(!!token);
    setCanUseEkran2(isAdminRole() || hasPermission("ekran2") || hasPermission("analysis"));
    if (token) {
      setAuthToken(token);
      void getTeams()
        .then((rows) => setTeamMetas(rows.map((r) => ({ code: r.code, label: r.label }))))
        .catch(() => {});
    }

    try {
      const m = window.localStorage.getItem(EKRAN2_MODE_KEY);
      if (m === "light" || m === "dark") setDisplayMode(m);
    } catch {
      /* ignore */
    }

    const stored = readStored();
    if (stored && token && (isAdminRole() || hasPermission("ekran2") || hasPermission("analysis"))) {
      setStartDate(stored.startDate);
      setEndDate(stored.endDate);
      setHourFilter(stored.hour);
      setSelectedTeamCodes(stored.teamCodes && stored.teamCodes.length > 0 ? stored.teamCodes : null);
      if (stored.applied) setPhase("display");
    }
  }, []);

  useEffect(() => {
    if (teamMetas.length === 0 || selectedTeamCodes === null) return;
    const valid = new Set(teamMetas.map((t) => t.code));
    const next = selectedTeamCodes.filter((c) => valid.has(c));
    if (next.length !== selectedTeamCodes.length) {
      setSelectedTeamCodes(next.length > 0 ? next : null);
    }
  }, [teamMetas, selectedTeamCodes]);

  const fetchAll = useCallback(
    async (silent: boolean) => {
      if (orderedKeys.length === 0) {
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError("");
      try {
        const results = await Promise.all(
          orderedKeys.map(async (key) => {
            const [top, trend] = await Promise.all([
              getTopWorkersAnalytics({
                startDate,
                endDate,
                team: key,
                hour: hourFilter,
                limit: WORKER_LIST_LIMIT,
              }),
              getDailyTrendAnalytics({ startDate, endDate, team: key, hour: hourFilter }),
            ]);
            return { key, top, trend };
          })
        );
        setBlocks(results);
        setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
      } catch {
        setError("Veri alınamadı. Oturum veya bağlantıyı kontrol edin.");
        setBlocks(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [startDate, endDate, hourFilter, orderedKeys]
  );

  useEffect(() => {
    if (phase !== "display" || !hasToken || !canUseEkran2) return;
    void fetchAll(false);
  }, [phase, hasToken, canUseEkran2, fetchAll]);

  useEffect(() => {
    if (phase !== "display" || !hasToken || !canUseEkran2) return;
    const id = setInterval(() => void fetchAll(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [phase, hasToken, canUseEkran2, fetchAll]);

  const blockByKey = useMemo(() => {
    const m = new Map<Team, TeamBlockData>();
    if (blocks) for (const b of blocks) m.set(b.key, b);
    return m;
  }, [blocks]);

  function setMode(mode: Ekran2Mode) {
    setDisplayMode(mode);
    try {
      window.localStorage.setItem(EKRAN2_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  function persistSettings(applied: boolean) {
    writeStored({
      startDate,
      endDate,
      hour: hourFilter,
      applied,
      ...(selectedTeamCodes !== null && selectedTeamCodes.length > 0 ? { teamCodes: selectedTeamCodes } : {}),
    });
  }

  function handleOpenDisplay() {
    if (selectedTeamCodes !== null && selectedTeamCodes.length === 0) {
      setSetupError("En az bir bölüm seçin.");
      return;
    }
    setSetupError("");
    persistSettings(true);
    setPhase("display");
  }

  function handleEditFilters() {
    persistSettings(false);
    setPhase("setup");
  }

  function toggleTeamSelection(code: string) {
    setSetupError("");
    if (teamMetas.length === 0) return;
    if (selectedTeamCodes === null) {
      const all = teamMetas.map((t) => t.code);
      setSelectedTeamCodes(all.filter((c) => c !== code));
      return;
    }
    if (selectedTeamCodes.includes(code)) {
      setSelectedTeamCodes(selectedTeamCodes.filter((c) => c !== code));
    } else {
      setSelectedTeamCodes([...selectedTeamCodes, code]);
    }
  }

  function selectAllTeams() {
    setSetupError("");
    setSelectedTeamCodes(null);
  }

  function selectPrimaryFiveOnly() {
    setSetupError("");
    const codes = HEDEF_ORDER.filter((k) => teamMetas.some((t) => t.code === k));
    setSelectedTeamCodes(codes.length > 0 ? [...codes] : []);
  }

  const modeToggle = (
    <div
      className={`flex rounded-xl border p-1 text-sm font-medium md:text-base ${
        dark ? "border-white/20 bg-white/5" : "border-slate-300 bg-white shadow-sm"
      }`}
    >
      <button
        type="button"
        onClick={() => setMode("dark")}
        className={`rounded-lg px-3 py-2 md:px-4 ${dark ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
      >
        Koyu
      </button>
      <button
        type="button"
        onClick={() => setMode("light")}
        className={`rounded-lg px-3 py-2 md:px-4 ${!dark ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-white/10"}`}
      >
        Normal
      </button>
    </div>
  );

  if (!hasToken) {
    return (
      <div
        className={`fixed inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center ${
          dark ? "bg-[#030712] text-white" : "bg-slate-100 text-slate-900"
        }`}
      >
        <div className="absolute right-4 top-4">{modeToggle}</div>
        <p className="text-2xl font-semibold tracking-wide md:text-3xl">EKRAN2</p>
        <p className={`max-w-xl text-lg md:text-xl ${dark ? "text-slate-300" : "text-slate-600"}`}>
          Aşama bazlı analiz panosu için önce ana uygulamada giriş yapın. Veriler, Analiz ekranı ile aynı kaynaktan gelir
          (EKRAN2 veya analiz yetkisi gerekir).
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className={
              dark
                ? "rounded-xl border-2 border-white px-8 py-4 text-lg font-semibold hover:bg-white hover:text-[#030712]"
                : "rounded-xl border-2 border-slate-800 px-8 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-800 hover:text-white"
            }
          >
            Giriş
          </Link>
          <Link
            href="/analysis"
            className="rounded-xl bg-teal-600 px-8 py-4 text-lg font-semibold text-white hover:bg-teal-500"
          >
            Analiz
          </Link>
        </div>
      </div>
    );
  }

  if (!canUseEkran2) {
    return (
      <div
        className={`fixed inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center ${
          dark ? "bg-[#030712] text-white" : "bg-slate-100 text-slate-900"
        }`}
      >
        <div className="absolute right-4 top-4">{modeToggle}</div>
        <p className="text-2xl font-semibold md:text-3xl">EKRAN2</p>
        <p className={`max-w-xl text-lg md:text-xl ${dark ? "text-slate-300" : "text-slate-600"}`}>
          Bu ekran için hesabınıza Analiz veya EKRAN2 yetkisi (veya yönetici) tanımlanmalıdır.
        </p>
        <Link
          href="/"
          className="rounded-xl bg-slate-800 px-8 py-4 text-lg font-semibold text-white hover:bg-slate-700"
        >
          Ana sayfa
        </Link>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div
        className={`fixed inset-0 overflow-auto ${dark ? "bg-[#030712] text-white" : "bg-slate-100 text-slate-900"}`}
        style={{ minHeight: "100dvh" }}
      >
        <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 py-10 md:py-16">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={`text-sm font-medium uppercase tracking-[0.35em] ${dark ? "text-teal-400/90" : "text-teal-700"}`}>
                EKRAN2
              </p>
              <h1 className="mt-2 text-2xl font-bold md:text-3xl">Filtreleri seçin</h1>
              <p className={`mt-2 text-sm md:text-base ${dark ? "text-slate-400" : "text-slate-600"}`}>
                Tarih, saat ve gösterilecek bölümler panoya uygulanır. İstatistik
                yalnızca işaretlediğiniz bölümler için yüklenir; veriler her 30 saniyede yenilenir.
              </p>
            </div>
            {modeToggle}
          </div>

          <div
            className={`rounded-2xl border p-6 md:p-8 ${
              dark ? "border-white/10 bg-slate-900/60" : "border-slate-200 bg-white shadow-sm"
            }`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <WeekdayDatePicker
                label="Başlangıç"
                value={startDate}
                onChange={setStartDate}
                tone={dark ? "dark" : "default"}
              />
              <WeekdayDatePicker
                label="Bitiş"
                value={endDate}
                onChange={setEndDate}
                tone={dark ? "dark" : "default"}
              />
            </div>

            <div className="mt-6">
              <label className="text-sm font-medium">Saat filtresi</label>
              <p className={`mb-3 mt-1 text-xs ${dark ? "text-slate-500" : "text-slate-500"}`}>
                Analiz ekranındaki ile aynı: tek dilim veya tümü.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { h: "" as HourFilter, l: "Tümü" },
                    { h: "t1000" as HourFilter, l: "10:00" },
                    { h: "t1300" as HourFilter, l: "13:00" },
                    { h: "t1600" as HourFilter, l: "16:00" },
                    { h: "t1830" as HourFilter, l: "18:30" },
                  ] as const
                ).map(({ h, l }) => (
                  <button
                    key={h || "all"}
                    type="button"
                    onClick={() => setHourFilter(h)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                      hourFilter === h
                        ? dark
                          ? "border-teal-500 bg-teal-950/50 text-teal-200"
                          : "border-teal-600 bg-teal-50 text-teal-800"
                        : dark
                          ? "border-slate-600 hover:bg-white/5"
                          : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <label className="text-sm font-medium">Gösterilecek bölümler</label>
              <p className={`mb-3 mt-1 text-xs ${dark ? "text-slate-500" : "text-slate-500"}`}>
                TV panosunda hangi bölümlerin özeti ve personel sıralaması yer alacağını seçin. “Tümü” tüm tanımlı bölümleri
                açar; daraltmak için tek tek kapatın veya yalnızca ana beşliyi kullanın.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllTeams}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    dark ? "border-slate-600 hover:bg-white/5" : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Tümünü seç
                </button>
                <button
                  type="button"
                  onClick={selectPrimaryFiveOnly}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    dark ? "border-slate-600 hover:bg-white/5" : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Yalnızca ana bölümler (Sağ/Sol ön, Yaka, Arka, Bitim)
                </button>
              </div>
              {teamMetas.length === 0 ? (
                <p className={`text-sm ${dark ? "text-slate-500" : "text-slate-500"}`}>Bölüm listesi yükleniyor…</p>
              ) : (
                <ul
                  className={`grid max-h-[min(40vh,22rem)] grid-cols-1 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2 [scrollbar-width:thin] ${
                    dark ? "border-slate-600 bg-slate-800/40" : "border-slate-200 bg-slate-50/80"
                  }`}
                >
                  {teamMetas.map((t) => {
                    const checked = selectedTeamCodes === null || selectedTeamCodes.includes(t.code);
                    return (
                      <li key={t.code}>
                        <label
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                            dark ? "hover:bg-white/5" : "hover:bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTeamSelection(t.code)}
                            className="h-4 w-4 shrink-0 rounded border-slate-400 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="min-w-0 font-medium leading-snug">{t.label}</span>
                          <span className={`shrink-0 font-mono text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
                            {t.code}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selectedTeamCodes !== null ? (
                <p className={`mt-2 text-xs ${dark ? "text-slate-500" : "text-slate-600"}`}>
                  Seçili: {selectedTeamCodes.length} bölüm
                  {selectedTeamCodes.length === 0 ? " — ekranı açmak için en az birini işaretleyin." : ""}
                </p>
              ) : (
                <p className={`mt-2 text-xs ${dark ? "text-slate-500" : "text-slate-600"}`}>Tüm tanımlı bölümler açık.</p>
              )}
            </div>

            {setupError ? (
              <p className="mt-4 text-sm font-medium text-red-500 dark:text-red-400">{setupError}</p>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleOpenDisplay}
                className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg transition hover:from-teal-500 hover:to-emerald-500"
              >
                Ekranı aç
              </button>
              <Link
                href="/analysis"
                className={`rounded-xl border-2 px-6 py-3.5 text-base font-semibold ${
                  dark ? "border-white/30 hover:bg-white/10" : "border-slate-400 hover:bg-slate-50"
                }`}
              >
                Analiz sayfası
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const mSag = metaFor("SAG_ON");
  const mSol = metaFor("SOL_ON");
  const mYaka = metaFor("YAKA_HAZIRLIK");
  const mArka = metaFor("ARKA_HAZIRLIK");
  const mBitim = metaFor("BITIM");

  return (
    <div
      className={`fixed inset-0 flex h-dvh max-h-dvh flex-col overflow-hidden ${dark ? "bg-[#030712] text-white" : "bg-slate-100 text-slate-900"}`}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col gap-1.5 px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5 lg:px-4 lg:py-3">
        <header
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-2 sm:gap-3 sm:pb-2.5 ${
            dark ? "border-white/10" : "border-slate-300"
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
              <p className={`text-xs font-medium uppercase tracking-[0.2em] sm:text-sm ${dark ? "text-teal-400/90" : "text-teal-700"}`}>
                EKRAN2
              </p>
              <p className={`text-sm sm:text-base lg:text-lg ${dark ? "text-slate-300" : "text-slate-700"}`}>
                {formatDateTr(startDate)} — {formatDateTr(endDate)} · {hourLabel(hourFilter)}
                {orderedKeys.length > 0 ? (
                  <span className={`ml-1.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>· {orderedKeys.length} bölüm</span>
                ) : null}
                {lastUpdated ? (
                  <span className={`ml-2 ${dark ? "text-slate-400" : "text-slate-500"}`}>· Güncelleme {lastUpdated}</span>
                ) : null}
              </p>
            </div>
            <div className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}>
              <span>Yenileme 30 sn</span>
              <span className="opacity-50">|</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded bg-emerald-500" /> Üst ⅓
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded bg-blue-500" /> Orta ⅓
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded bg-red-500" /> Alt ⅓
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <div className="scale-95 origin-right sm:scale-100">{modeToggle}</div>
            <button
              type="button"
              onClick={handleEditFilters}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold sm:rounded-xl sm:px-4 sm:text-base ${
                dark ? "border-white/30 bg-white/5 hover:bg-white/10" : "border-slate-400 bg-white hover:bg-slate-50"
              }`}
            >
              Filtre
            </button>
            <button
              type="button"
              onClick={() => {
                const el = document.documentElement;
                if (el.requestFullscreen) void el.requestFullscreen();
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold sm:rounded-xl sm:px-4 sm:text-base ${
                dark ? "border-white/30 bg-white/5 hover:bg-white/10" : "border-slate-400 bg-white text-slate-900 hover:bg-slate-50"
              }`}
            >
              Tam ekran
            </button>
          </div>
        </header>

        {error ? (
          <p className={`shrink-0 text-center text-sm font-semibold sm:text-base ${dark ? "text-red-400" : "text-red-600"}`}>{error}</p>
        ) : null}

        {loading && !blocks && orderedKeys.length > 0 ? (
          <p className={`shrink-0 text-center text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Yükleniyor…</p>
        ) : null}
        {orderedKeys.length === 0 && !error && teamMetas.length === 0 ? (
          <p className={`shrink-0 text-center text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
            Bölüm listesi yükleniyor…
          </p>
        ) : null}
        {orderedKeys.length === 0 && !error && teamMetas.length > 0 ? (
          <p className={`shrink-0 text-center text-sm font-medium ${dark ? "text-amber-400" : "text-amber-700"}`}>
            Gösterilecek bölüm yok. Filtre ile bölüm seçin.
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
          <section className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden sm:grid-cols-2 sm:gap-3 lg:grid-cols-5 lg:gap-3">
            {mSag && orderedKeySet.has("SAG_ON") ? (
              <Ekran2TeamPanel meta={mSag} dataMap={blockByKey} dark={dark} className="min-h-0 h-full max-h-full sm:min-h-[32vh] lg:min-h-0" />
            ) : null}
            {mSol && orderedKeySet.has("SOL_ON") ? (
              <Ekran2TeamPanel meta={mSol} dataMap={blockByKey} dark={dark} className="min-h-0 h-full max-h-full sm:min-h-[32vh] lg:min-h-0" />
            ) : null}
            {(mYaka && orderedKeySet.has("YAKA_HAZIRLIK")) || (mArka && orderedKeySet.has("ARKA_HAZIRLIK")) ? (
              <div className="flex min-h-0 flex-col gap-2 sm:col-span-2 sm:min-h-[40vh] lg:col-span-1 lg:h-full lg:min-h-0">
                {mYaka && orderedKeySet.has("YAKA_HAZIRLIK") ? (
                  <Ekran2TeamPanel meta={mYaka} dataMap={blockByKey} dark={dark} compactChart className="min-h-0 flex-1 basis-0" />
                ) : null}
                {mArka && orderedKeySet.has("ARKA_HAZIRLIK") ? (
                  <Ekran2TeamPanel meta={mArka} dataMap={blockByKey} dark={dark} compactChart className="min-h-0 flex-1 basis-0" />
                ) : null}
              </div>
            ) : null}
            {mBitim && orderedKeySet.has("BITIM") ? (
              <Ekran2TeamPanel
                meta={mBitim}
                dataMap={blockByKey}
                dark={dark}
                personnelTwoCols
                className="min-h-0 h-full max-h-full sm:col-span-2 lg:col-span-2"
              />
            ) : null}
          </section>

          {extraMetas.length > 0 ? (
            <div className="mt-2 sm:mt-3">
              <p
                className={`mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide sm:text-xs ${
                  dark ? "text-violet-300/90" : "text-violet-700"
                }`}
              >
                Diğer bölümler
              </p>
              <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {extraMetas.map((m) => (
                  <Ekran2TeamPanel
                    key={m.code}
                    meta={{ key: m.code as Team, label: m.label }}
                    dataMap={blockByKey}
                    dark={dark}
                    variant="extra"
                    className="min-h-[28vh] sm:min-h-[32vh]"
                  />
                ))}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
