import type { CSSProperties } from "react";
import type { WorkerHourlyBreakdown } from "@/lib/api";
import { aggregateDisplaySlots, DISPLAY_SLOT_SHORT_LABELS } from "@/lib/displaySlotAggregation";
import { computeShiftHourAverages, SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import type { TopWorkerAnalytics } from "@/lib/types";

/** Ekranda tek saat (eski düzen); değerler aggregateDisplaySlots ile gruplanır. */
const SLOTS = [
  {
    key: "t1000" as const,
    label: DISPLAY_SLOT_SHORT_LABELS[0],
    title: "Toplam: 09:00 + 10:00",
    gradient: "from-violet-500 to-purple-400",
    textColor: "text-violet-900 dark:text-violet-200",
    dot: "bg-violet-500",
  },
  {
    key: "t1300" as const,
    label: DISPLAY_SLOT_SHORT_LABELS[1],
    title: "Toplam: 11:15 + 12:15 + 13:00",
    gradient: "from-sky-500 to-blue-400",
    textColor: "text-sky-900 dark:text-sky-200",
    dot: "bg-sky-500",
  },
  {
    key: "t1600" as const,
    label: DISPLAY_SLOT_SHORT_LABELS[2],
    title: "Toplam: 14:45 + 15:45",
    gradient: "from-emerald-500 to-teal-400",
    textColor: "text-emerald-900 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    key: "t1830" as const,
    label: DISPLAY_SLOT_SHORT_LABELS[3],
    title: "Toplam: 17:00 + 18:30",
    gradient: "from-amber-500 to-orange-400",
    textColor: "text-amber-900 dark:text-amber-200",
    dot: "bg-amber-500",
  },
];

/** Kart içi düşen konfeti (globals.css `ekran1-bday-confetti-piece`) */
const EKRAN3_FALL_CONFETTI: {
  left: string;
  drift: string;
  delay: string;
  dur: string;
  w: number;
  h: number;
  bg: string;
}[] = [
  { left: "5%", drift: "-12px", delay: "0s", dur: "2.4s", w: 8, h: 10, bg: "#ec4899" },
  { left: "12%", drift: "18px", delay: "0.2s", dur: "2.75s", w: 9, h: 8, bg: "#fbbf24" },
  { left: "21%", drift: "-20px", delay: "0.45s", dur: "2.55s", w: 7, h: 11, bg: "#34d399" },
  { left: "30%", drift: "14px", delay: "0.1s", dur: "2.9s", w: 10, h: 9, bg: "#a78bfa" },
  { left: "38%", drift: "-25px", delay: "0.65s", dur: "2.65s", w: 8, h: 8, bg: "#f472b6" },
  { left: "46%", drift: "22px", delay: "0.3s", dur: "2.8s", w: 9, h: 10, bg: "#60a5fa" },
  { left: "54%", drift: "-18px", delay: "0.55s", dur: "2.5s", w: 8, h: 9, bg: "#fde047" },
  { left: "62%", drift: "28px", delay: "0.05s", dur: "2.95s", w: 9, h: 8, bg: "#fb7185" },
  { left: "70%", drift: "-30px", delay: "0.75s", dur: "2.6s", w: 7, h: 10, bg: "#4ade80" },
  { left: "78%", drift: "16px", delay: "0.35s", dur: "2.7s", w: 10, h: 9, bg: "#c084fc" },
  { left: "88%", drift: "-14px", delay: "0.5s", dur: "2.85s", w: 8, h: 10, bg: "#22d3ee" },
  { left: "15%", drift: "32px", delay: "0.85s", dur: "2.45s", w: 9, h: 9, bg: "#f97316" },
  { left: "95%", drift: "-22px", delay: "0.25s", dur: "2.78s", w: 7, h: 8, bg: "#e879f9" },
  { left: "42%", drift: "-35px", delay: "0.95s", dur: "2.52s", w: 10, h: 11, bg: "#14b8a6" },
  { left: "58%", drift: "40px", delay: "1.1s", dur: "2.88s", w: 8, h: 8, bg: "#eab308" },
  { left: "8%", drift: "8px", delay: "1.2s", dur: "2.62s", w: 9, h: 10, bg: "#ef4444" },
  { left: "92%", drift: "-8px", delay: "0.15s", dur: "2.72s", w: 8, h: 9, bg: "#a855f7" },
  { left: "26%", drift: "-40px", delay: "1.35s", dur: "2.58s", w: 7, h: 9, bg: "#06b6d4" },
  { left: "67%", drift: "36px", delay: "1.05s", dur: "2.92s", w: 10, h: 8, bg: "#f43f5e" },
  { left: "3%", drift: "24px", delay: "0.4s", dur: "2.68s", w: 8, h: 10, bg: "#84cc16" },
  { left: "51%", drift: "-28px", delay: "1.5s", dur: "2.5s", w: 9, h: 9, bg: "#d946ef" },
  { left: "74%", drift: "12px", delay: "0.6s", dur: "2.76s", w: 8, h: 8, bg: "#38bdf8" },
  { left: "33%", drift: "42px", delay: "1.25s", dur: "2.64s", w: 9, h: 11, bg: "#facc15" },
  { left: "18%", drift: "-16px", delay: "0.9s", dur: "2.82s", w: 7, h: 9, bg: "#10b981" },
];

/** İsim hizasından patlayan parçalar (`ekran1-bday-edge-burst-inner`) */
const EKRAN3_BURST: {
  tx: string;
  ty: string;
  rot: string;
  delay: string;
  dur: number;
  w: number;
  h: number;
  bg: string;
}[] = [
  { tx: "-72px", ty: "-52px", rot: "220deg", delay: "0s", dur: 1.35, w: 9, h: 12, bg: "#f472b6" },
  { tx: "68px", ty: "-48px", rot: "-200deg", delay: "0.05s", dur: 1.42, w: 10, h: 10, bg: "#fbbf24" },
  { tx: "-54px", ty: "58px", rot: "380deg", delay: "0.02s", dur: 1.38, w: 8, h: 11, bg: "#34d399" },
  { tx: "76px", ty: "50px", rot: "-360deg", delay: "0.08s", dur: 1.4, w: 9, h: 9, bg: "#60a5fa" },
  { tx: "-40px", ty: "-68px", rot: "300deg", delay: "0.1s", dur: 1.45, w: 11, h: 8, bg: "#c084fc" },
  { tx: "44px", ty: "-62px", rot: "-280deg", delay: "0.03s", dur: 1.36, w: 8, h: 10, bg: "#fb923c" },
  { tx: "-82px", ty: "12px", rot: "440deg", delay: "0.12s", dur: 1.5, w: 10, h: 9, bg: "#22d3ee" },
  { tx: "84px", ty: "8px", rot: "-420deg", delay: "0.06s", dur: 1.33, w: 9, h: 12, bg: "#f87171" },
  { tx: "-20px", ty: "-78px", rot: "180deg", delay: "0.15s", dur: 1.28, w: 7, h: 9, bg: "#fde047" },
  { tx: "24px", ty: "72px", rot: "-190deg", delay: "0.18s", dur: 1.4, w: 10, h: 8, bg: "#a78bfa" },
  { tx: "-64px", ty: "-28px", rot: "260deg", delay: "0.2s", dur: 1.46, w: 8, h: 10, bg: "#2dd4bf" },
  { tx: "58px", ty: "-32px", rot: "-300deg", delay: "0.14s", dur: 1.37, w: 9, h: 9, bg: "#f472b6" },
  { tx: "0px", ty: "-88px", rot: "90deg", delay: "0.22s", dur: 1.3, w: 8, h: 14, bg: "#eab308" },
  { tx: "-94px", ty: "-20px", rot: "400deg", delay: "0.09s", dur: 1.48, w: 10, h: 10, bg: "#4ade80" },
];

export function Ekran3WorkerCard({
  worker,
  rank,
  teamLabel,
  hourly,
  singleDayMode = false,
  multiDayTotal = 0,
  multiDayActiveDays = 0,
  prevDayTotal = 0,
  birthdayBurst = false,
}: {
  worker: TopWorkerAnalytics | null;
  rank: number | null;
  teamLabel: string;
  /** API ham veya dört dilim; içeride gruplanır */
  hourly: WorkerHourlyBreakdown | null;
  singleDayMode?: boolean;
  multiDayTotal?: number;
  multiDayActiveDays?: number;
  prevDayTotal?: number;
  birthdayBurst?: boolean;
}) {
  if (!worker || rank == null) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm sm:rounded-3xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-400">Personel bekleniyor…</p>
      </div>
    );
  }

  const noTodayData = singleDayMode && worker.totalProduction === 0;
  const raw = hourly ?? { t1000: 0, t1300: 0, t1600: 0, t1830: 0 };
  const h = aggregateDisplaySlots(raw);
  const singleAvgs = singleDayMode ? computeShiftHourAverages(raw, worker.totalProduction) : null;

  const hasMultiDay = multiDayActiveDays > 0;
  const multiDayDailyAvg = hasMultiDay
    ? Math.round(multiDayTotal / multiDayActiveDays)
    : singleDayMode
    ? worker.totalProduction
    : Math.round(worker.totalProduction / Math.max(worker.activeDays, 1));

  const multiDayPerHour = hasMultiDay
    ? Math.round(multiDayTotal / (multiDayActiveDays * SHIFT_NOMINAL_HOURS))
    : (singleAvgs?.perHourInWindow ?? 0);

  const todayPerHour = singleAvgs?.perHourInWindow ?? 0;
  const prevPerHour = prevDayTotal > 0 ? Math.round(prevDayTotal / SHIFT_NOMINAL_HOURS) : 0;

  const hourlyArrow =
    noTodayData || prevPerHour <= 0 || todayPerHour === prevPerHour
      ? "neutral"
      : todayPerHour > prevPerHour
      ? "up"
      : "down";

  const name = worker.name.toLocaleUpperCase("tr-TR");
  const process = worker.process || "—";
  const team = teamLabel || worker.team || "";

  return (
    <article className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-md sm:rounded-3xl dark:border-slate-600 dark:bg-slate-900">
      {birthdayBurst && (
        <div
          className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-2xl sm:rounded-3xl"
          aria-hidden
        >
          {EKRAN3_FALL_CONFETTI.map((c, i) => (
            <span
              key={`ek3-fall-${i}`}
              className={`ekran1-bday-confetti-piece opacity-80 ${i % 3 === 0 ? "rounded-full" : "rounded-sm"}`}
              style={
                {
                  left: c.left,
                  width: c.w,
                  height: c.h,
                  background: c.bg,
                  animationDuration: c.dur,
                  animationDelay: c.delay,
                  "--ekran1-drift": c.drift,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className="relative z-[2] flex min-h-0 flex-1 flex-col">
      {/* ── HEADER ── gradient arka plan */}
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 sm:px-5 sm:py-4 min-[1920px]:px-6 min-[1920px]:py-5">
        {birthdayBurst && (
          <div className="pointer-events-none absolute left-1/2 top-[45%] z-0 h-0 w-0 -translate-x-1/2 -translate-y-1/2" aria-hidden>
            {EKRAN3_BURST.map((p, i) => (
              <span
                key={`ek3-burst-${i}`}
                className={`ekran1-bday-edge-burst-inner absolute left-0 top-0 opacity-95 ${i % 4 === 0 ? "rounded-full" : "rounded-sm"}`}
                style={
                  {
                    width: p.w,
                    height: p.h,
                    background: p.bg,
                    animationDuration: `${p.dur}s`,
                    animationDelay: p.delay,
                    "--ebb-tx": p.tx,
                    "--ebb-ty": p.ty,
                    "--ebb-rot": p.rot,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        {/* Dekoratif halka */}
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-4 -right-2 h-16 w-16 rounded-full bg-white/5" />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {team}{team && process !== "—" ? "  ·  " : ""}{process}
            </p>
            <h2 className="mt-0.5 truncate text-xl font-black leading-tight tracking-wide text-white sm:text-2xl min-[1920px]:text-3xl min-[2560px]:text-4xl">
              {name}
            </h2>
          </div>
          {/* Sıralama rozeti */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm sm:h-12 sm:w-12 min-[1920px]:h-14 min-[1920px]:w-14">
            <span className="text-base font-black text-white sm:text-lg min-[1920px]:text-xl">#{rank}</span>
          </div>
        </div>
      </header>

      {/* ── STATS BAR ── bugün / saat ort / günlük ort (TV: yüksek kontrast, büyük punto) */}
      <div className="shrink-0 grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-100/90 px-2 py-2.5 sm:gap-2.5 sm:px-3 sm:py-3 min-[1920px]:gap-3 min-[1920px]:px-4 min-[1920px]:py-4 dark:border-slate-600 dark:bg-slate-800/80">
        {/* Bugün toplam */}
        <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-300 bg-white py-2.5 text-center shadow-sm sm:rounded-2xl sm:py-3 min-[1920px]:py-4 dark:border-slate-600 dark:bg-slate-950">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 sm:text-[10px] min-[1920px]:text-xs dark:text-slate-400">
            {singleDayMode ? "Bugün" : "Toplam"}
          </span>
          <span className="text-2xl font-black tabular-nums text-slate-950 sm:text-3xl min-[1400px]:text-4xl min-[1920px]:text-5xl min-[2560px]:text-6xl dark:text-white">
            {worker.totalProduction.toLocaleString("tr-TR")}
          </span>
          <span className="text-[9px] font-semibold text-slate-600 sm:text-[10px] dark:text-slate-400">adet</span>
        </div>

        {/* Saat/ort */}
        <div className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2.5 text-center shadow-sm sm:rounded-2xl sm:py-3 min-[1920px]:py-4 ${
          hourlyArrow === "up"
            ? "border-emerald-300 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/50"
            : hourlyArrow === "down"
            ? "border-red-300 bg-red-100 dark:border-red-800 dark:bg-red-950/40"
            : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950"
        }`}>
          <span className={`text-[9px] font-black uppercase tracking-widest sm:text-[10px] min-[1920px]:text-xs ${
            hourlyArrow === "up" ? "text-emerald-800 dark:text-emerald-300" :
            hourlyArrow === "down" ? "text-red-800 dark:text-red-300" :
            "text-slate-600 dark:text-slate-400"
          }`}>
            Saat/ort
          </span>
          <div className="flex items-center gap-1">
            <span className={`text-2xl font-black tabular-nums sm:text-3xl min-[1400px]:text-4xl min-[1920px]:text-5xl min-[2560px]:text-6xl ${
              hourlyArrow === "up" ? "text-emerald-900 dark:text-emerald-100" :
              hourlyArrow === "down" ? "text-red-900 dark:text-red-100" :
              "text-slate-950 dark:text-white"
            }`}>
              {multiDayPerHour}
            </span>
            {hourlyArrow === "up" && (
              <svg className="h-4 w-4 min-[1920px]:h-5 min-[1920px]:w-5" viewBox="0 0 16 16" fill="#15803d" aria-hidden><path d="M8 3l6 9H2z" /></svg>
            )}
            {hourlyArrow === "down" && (
              <svg className="h-4 w-4 min-[1920px]:h-5 min-[1920px]:w-5" viewBox="0 0 16 16" fill="#b91c1c" aria-hidden><path d="M8 13L2 4h12z" /></svg>
            )}
          </div>
          <span className={`max-w-[95%] truncate text-[9px] font-semibold sm:text-[10px] min-[1920px]:text-xs ${
            hourlyArrow === "up" ? "text-emerald-800 dark:text-emerald-400" :
            hourlyArrow === "down" ? "text-red-800 dark:text-red-400" :
            "text-slate-600 dark:text-slate-400"
          }`}>
            {hasMultiDay ? `${multiDayActiveDays}g ort.` : (singleAvgs?.windowHint ?? "ort.")}
          </span>
        </div>

        {/* Günlük ort */}
        <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-300 bg-white py-2.5 text-center shadow-sm sm:rounded-2xl sm:py-3 min-[1920px]:py-4 dark:border-slate-600 dark:bg-slate-950">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 sm:text-[10px] min-[1920px]:text-xs dark:text-slate-400">
            Günlük ort.
          </span>
          <span className="text-2xl font-black tabular-nums text-slate-950 sm:text-3xl min-[1400px]:text-4xl min-[1920px]:text-5xl min-[2560px]:text-6xl dark:text-white">
            {multiDayDailyAvg.toLocaleString("tr-TR")}
          </span>
          <span className="text-[9px] font-semibold text-slate-600 sm:text-[10px] dark:text-slate-400">
            {hasMultiDay ? `${multiDayActiveDays} gün` : "adet"}
          </span>
        </div>
      </div>

      {/* ── SAATLİK ÜRETİM 2×2 ── */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-0 divide-x divide-y divide-slate-200 dark:divide-slate-600">
        {SLOTS.map(({ key, label, title: slotTitle, textColor, dot, gradient }) => {
          const val = noTodayData ? 0 : h[key];
          const active = val > 0;

          return (
            <div
              key={key}
              title={slotTitle}
              className="relative flex min-h-0 flex-col justify-between bg-white p-2.5 sm:p-3 min-[1920px]:p-4 dark:bg-slate-900"
            >
              {/* Sol-üst renk noktası + saat */}
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full sm:h-3 sm:w-3 min-[1920px]:h-3.5 min-[1920px]:w-3.5 ${active ? dot : "bg-slate-300 dark:bg-slate-600"}`} />
                <span className={`text-xs font-black tabular-nums sm:text-sm min-[1920px]:text-base ${
                  active ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-500"
                }`}>
                  {label}
                </span>
              </div>

              {/* Adet — büyük */}
              <div className="mt-1 min-h-0">
                <span className={`block text-[1.75rem] font-black tabular-nums leading-none tracking-tight sm:text-[2.25rem] min-[1400px]:text-[2.75rem] min-[1920px]:text-5xl min-[2560px]:text-6xl ${
                  active ? textColor : "text-slate-400 dark:text-slate-600"
                }`}>
                  {active ? val.toLocaleString("tr-TR") : "—"}
                </span>
                {active && (
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-widest text-slate-600 sm:text-[10px] dark:text-slate-400">
                    adet
                  </span>
                )}
              </div>

              {/* Alt renkli şerit */}
              {active && (
                <div className={`absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r ${gradient}`} />
              )}
            </div>
          );
        })}
      </div>
      </div>
    </article>
  );
}
