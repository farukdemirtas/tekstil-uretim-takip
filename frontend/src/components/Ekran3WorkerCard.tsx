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
    textColor: "text-violet-700",
    dot: "bg-violet-500",
  },
  {
    key: "t1300" as const,
    label: DISPLAY_SLOT_SHORT_LABELS[1],
    title: "Toplam: 11:15 + 12:15 + 13:00",
    gradient: "from-sky-500 to-blue-400",
    textColor: "text-sky-700",
    dot: "bg-sky-500",
  },
  {
    key: "t1600" as const,
    label: DISPLAY_SLOT_SHORT_LABELS[2],
    title: "Toplam: 14:45 + 15:45",
    gradient: "from-emerald-500 to-teal-400",
    textColor: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  {
    key: "t1830" as const,
    label: DISPLAY_SLOT_SHORT_LABELS[3],
    title: "Toplam: 17:00 + 18:30",
    gradient: "from-amber-500 to-orange-400",
    textColor: "text-amber-700",
    dot: "bg-amber-500",
  },
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
}) {
  if (!worker || rank == null) {
    return (
      <div className="flex min-h-0 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
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
  const singleAvgs = singleDayMode ? computeShiftHourAverages(h, worker.totalProduction) : null;

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
    <article className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md">

      {/* ── HEADER ── gradient arka plan */}
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4">
        {/* Dekoratif halka */}
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-4 -right-2 h-16 w-16 rounded-full bg-white/5" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {team}{team && process !== "—" ? "  ·  " : ""}{process}
            </p>
            <h2 className="mt-0.5 truncate text-xl font-black leading-tight tracking-wide text-white sm:text-2xl">
              {name}
            </h2>
          </div>
          {/* Sıralama rozeti */}
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm sm:h-12 sm:w-12">
            <span className="text-base font-black text-white sm:text-lg">#{rank}</span>
          </div>
        </div>
      </header>

      {/* ── STATS BAR ── bugün / saat ort / günlük ort */}
      <div className="shrink-0 grid grid-cols-3 gap-2.5 border-b border-slate-100 bg-slate-50 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
        {/* Bugün toplam */}
        <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-slate-200 bg-white py-3 text-center shadow-sm sm:py-4">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 sm:text-[10px]">
            {singleDayMode ? "Bugün" : "Toplam"}
          </span>
          <span className="text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
            {worker.totalProduction.toLocaleString("tr-TR")}
          </span>
          <span className="text-[9px] font-semibold text-slate-400 sm:text-[10px]">adet</span>
        </div>

        {/* Saat/ort */}
        <div className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border py-3 text-center shadow-sm sm:py-4 ${
          hourlyArrow === "up"
            ? "border-emerald-200 bg-emerald-50"
            : hourlyArrow === "down"
            ? "border-red-200 bg-red-50"
            : "border-slate-200 bg-white"
        }`}>
          <span className={`text-[9px] font-black uppercase tracking-widest sm:text-[10px] ${
            hourlyArrow === "up" ? "text-emerald-500" :
            hourlyArrow === "down" ? "text-red-500" :
            "text-slate-400"
          }`}>
            Saat/ort
          </span>
          <div className="flex items-center gap-1">
            <span className={`text-2xl font-black tabular-nums sm:text-3xl ${
              hourlyArrow === "up" ? "text-emerald-700" :
              hourlyArrow === "down" ? "text-red-700" :
              "text-slate-900"
            }`}>
              {multiDayPerHour}
            </span>
            {hourlyArrow === "up" && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="#15803d" aria-hidden><path d="M8 3l6 9H2z" /></svg>
            )}
            {hourlyArrow === "down" && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="#b91c1c" aria-hidden><path d="M8 13L2 4h12z" /></svg>
            )}
          </div>
          <span className={`text-[9px] font-semibold sm:text-[10px] ${
            hourlyArrow === "up" ? "text-emerald-500" :
            hourlyArrow === "down" ? "text-red-500" :
            "text-slate-400"
          }`}>
            {hasMultiDay ? `${multiDayActiveDays}g ort.` : (singleAvgs?.windowHint ?? "ort.")}
          </span>
        </div>

        {/* Günlük ort */}
        <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-slate-200 bg-white py-3 text-center shadow-sm sm:py-4">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 sm:text-[10px]">
            Günlük ort.
          </span>
          <span className="text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
            {multiDayDailyAvg.toLocaleString("tr-TR")}
          </span>
          <span className="text-[9px] font-semibold text-slate-400 sm:text-[10px]">
            {hasMultiDay ? `${multiDayActiveDays} gün` : "adet"}
          </span>
        </div>
      </div>

      {/* ── SAATLİK ÜRETİM 2×2 ── */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-0 divide-x divide-y divide-slate-100">
        {SLOTS.map(({ key, label, title: slotTitle, textColor, dot, gradient }) => {
          const val = noTodayData ? 0 : h[key];
          const active = val > 0;

          return (
            <div
              key={key}
              title={slotTitle}
              className="relative flex min-h-0 flex-col justify-between bg-white p-3 sm:p-4"
            >
              {/* Sol-üst renk noktası + saat */}
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? dot : "bg-slate-200"}`} />
                <span className={`text-xs font-black tabular-nums sm:text-sm ${
                  active ? "text-slate-600" : "text-slate-300"
                }`}>
                  {label}
                </span>
              </div>

              {/* Adet — büyük */}
              <div className="mt-1">
                <span className={`block text-[2rem] font-black tabular-nums leading-none sm:text-[2.5rem] ${
                  active ? textColor : "text-slate-200"
                }`}>
                  {active ? val.toLocaleString("tr-TR") : "—"}
                </span>
                {active && (
                  <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-widest text-slate-400 sm:text-[10px]">
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
    </article>
  );
}
