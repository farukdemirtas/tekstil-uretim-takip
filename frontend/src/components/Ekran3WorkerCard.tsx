import type { WorkerHourlyBreakdown } from "@/lib/api";
import { computeShiftHourAverages, SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import type { TopWorkerAnalytics } from "@/lib/types";

const SLOTS = [
  {
    key: "t1000" as const,
    label: "10:00",
    gradient: "from-violet-500 to-purple-600",
    glow: "shadow-[0_0_12px_2px_rgba(139,92,246,0.35)]",
    dot: "bg-violet-500",
    track: "bg-violet-100/60",
  },
  {
    key: "t1300" as const,
    label: "13:00",
    gradient: "from-sky-400 to-blue-600",
    glow: "shadow-[0_0_12px_2px_rgba(56,189,248,0.35)]",
    dot: "bg-sky-500",
    track: "bg-sky-100/60",
  },
  {
    key: "t1600" as const,
    label: "16:00",
    gradient: "from-emerald-400 to-teal-600",
    glow: "shadow-[0_0_12px_2px_rgba(52,211,153,0.35)]",
    dot: "bg-emerald-500",
    track: "bg-emerald-100/60",
  },
  {
    key: "t1830" as const,
    label: "18:30",
    gradient: "from-amber-400 to-orange-500",
    glow: "shadow-[0_0_12px_2px_rgba(251,191,36,0.35)]",
    dot: "bg-amber-500",
    track: "bg-amber-100/60",
  },
];

function TrendArrow({ dir }: { dir: "up" | "down" | "neutral" }) {
  if (dir === "up")
    return (
      <span className="inline-flex items-center rounded-lg bg-emerald-100 px-1.5 py-0.5 text-emerald-600 shadow-sm">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 2l7 10H1z" />
        </svg>
      </span>
    );
  if (dir === "down")
    return (
      <span className="inline-flex items-center rounded-lg bg-red-100 px-1.5 py-0.5 text-red-600 shadow-sm">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 14L1 4h14z" />
        </svg>
      </span>
    );
  return null;
}

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
  hourly: WorkerHourlyBreakdown | null;
  singleDayMode?: boolean;
  multiDayTotal?: number;
  multiDayActiveDays?: number;
  prevDayTotal?: number;
}) {
  if (!worker || rank == null) {
    return (
      <div className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-8 text-center shadow-inner">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">Personel verisi yok</p>
      </div>
    );
  }

  const h = hourly ?? { t1000: 0, t1300: 0, t1600: 0, t1830: 0 };
  const maxH = Math.max(h.t1000, h.t1300, h.t1600, h.t1830, 1);
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

  function dirFor(today: number, prev: number): "up" | "down" | "neutral" {
    if (prev <= 0 || today === prev) return "neutral";
    return today > prev ? "up" : "down";
  }

  const hourlyArrow = dirFor(todayPerHour, prevPerHour);
  const title = worker.name.toLocaleUpperCase("tr-TR");
  const meta = [teamLabel || worker.team, worker.process].filter(Boolean).join("  ·  ");

  return (
    <article className="group relative flex min-h-0 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_8px_32px_-6px_rgba(15,23,42,0.12),0_2px_8px_-2px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.06] transition-shadow duration-300">


      {/* Header */}
      <header className="relative shrink-0 px-4 pb-2.5 pt-5 sm:px-5 sm:pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[1.25rem] font-black leading-tight tracking-wide text-slate-900 sm:text-[1.5rem]">
              {title}
            </h2>
            <p className="mt-1 truncate text-[12px] font-medium text-slate-400 sm:text-sm">{meta}</p>
          </div>
          {/* Sıralama rozeti */}
          <span className="shrink-0 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-2.5 py-1 text-xs font-black tabular-nums text-white shadow-md sm:px-3 sm:text-sm">
            #{rank}
          </span>
        </div>
      </header>

      {/* Stat kutuları */}
      <div className="shrink-0 grid grid-cols-3 gap-2 px-3 pb-2 sm:gap-3 sm:px-4 sm:pb-3">
        {/* Bugün toplam */}
        <div className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-b from-slate-50 to-white px-2 py-3 text-center ring-1 ring-slate-200/80 sm:min-h-[6rem] sm:rounded-2xl">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">
            {singleDayMode ? "Bugün" : "Toplam"}
          </span>
          <span className="text-[1.6rem] font-black leading-none tabular-nums text-slate-900 sm:text-4xl">
            {worker.totalProduction}
          </span>
          <span className="text-[8px] text-slate-400 sm:text-[9px]">adet</span>
        </div>

        {/* Saatlik ortalama */}
        <div className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-b from-slate-50 to-white px-2 py-3 text-center ring-1 ring-slate-200/80 sm:min-h-[6rem]">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">
            {singleDayMode ? "Saat/ort" : "Çalışılan"}
          </span>
          {singleDayMode ? (
            <>
              <span className="flex items-center gap-1 text-[1.6rem] font-black leading-none tabular-nums text-slate-900 sm:text-4xl">
                {multiDayPerHour}
                <TrendArrow dir={hourlyArrow} />
              </span>
              <span className="text-[8px] text-slate-400 sm:text-[9px]">
                {hasMultiDay ? `${multiDayActiveDays}g ort.` : singleAvgs?.windowHint ?? ""}
              </span>
            </>
          ) : (
            <>
              <span className="text-[1.6rem] font-black leading-none tabular-nums text-slate-900 sm:text-4xl">
                {worker.activeDays}
              </span>
              <span className="text-[8px] text-slate-400 sm:text-[9px]">gün</span>
            </>
          )}
        </div>

        {/* Günlük ortalama */}
        <div className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-b from-slate-50 to-white px-2 py-3 text-center ring-1 ring-slate-200/80 sm:min-h-[6rem]">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">
            Günlük ort.
          </span>
          <span className="text-[1.6rem] font-black leading-none tabular-nums text-slate-900 sm:text-4xl">
            {multiDayDailyAvg}
          </span>
          <span className="text-[8px] text-slate-400 sm:text-[9px]">
            {hasMultiDay ? `${multiDayActiveDays} gün` : "adet"}
          </span>
        </div>
      </div>

      {/* Barlar */}
      <div className="min-h-0 flex-1 px-3 pb-4 sm:px-4 sm:pb-5">
        <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">
          Saatlik üretim
        </p>

        <ul className="space-y-2.5 sm:space-y-3">
          {SLOTS.map(({ key, label, gradient, glow, dot, track }) => {
            const val = h[key];
            const pct = Math.round((val / maxH) * 100);
            const active = val > 0;

            return (
              <li key={key} className="flex items-center gap-2 sm:gap-3">
                {/* Saat etiketi */}
                <div className="flex w-12 shrink-0 items-center gap-1.5 sm:w-14">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${active ? dot : "bg-slate-300"}`} />
                  <span className={`text-[11px] font-bold tabular-nums sm:text-xs ${active ? "text-slate-700" : "text-slate-400"}`}>
                    {label}
                  </span>
                </div>

                {/* Bar track */}
                <div className={`relative min-w-0 flex-1 overflow-hidden rounded-full ${track} h-5 sm:h-6`}>
                  {/* Dolgu */}
                  {active && (
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${gradient} ${glow} transition-all duration-700 ease-out`}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    >
                      {/* İnce parlama çizgisi */}
                      <div className="absolute inset-x-0 top-0 h-[40%] rounded-full bg-white/30" />
                    </div>
                  )}
                  {/* Boş durum */}
                  {!active && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] text-slate-400">—</span>
                    </div>
                  )}
                </div>

                {/* Değer */}
                <span className={`w-9 shrink-0 text-right text-sm font-black tabular-nums sm:w-10 sm:text-base ${active ? "text-slate-800" : "text-slate-300"}`}>
                  {active ? val : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
