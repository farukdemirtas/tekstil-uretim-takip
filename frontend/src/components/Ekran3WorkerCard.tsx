import type { WorkerHourlyBreakdown } from "@/lib/api";
import { computeShiftHourAverages, SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
import type { TopWorkerAnalytics } from "@/lib/types";

const SLOTS = [
  { key: "t1000" as const, label: "10:00", fill: "from-violet-400 to-violet-600", track: "bg-violet-100" },
  { key: "t1300" as const, label: "13:00", fill: "from-sky-400 to-blue-600", track: "bg-sky-100" },
  { key: "t1600" as const, label: "16:00", fill: "from-emerald-400 to-teal-600", track: "bg-emerald-100" },
  { key: "t1830" as const, label: "18:30", fill: "from-amber-400 to-orange-600", track: "bg-amber-100" },
];

function TrendArrow({ dir }: { dir: "up" | "down" | "neutral" }) {
  if (dir === "up")
    return (
      <span
        className="inline-flex items-center rounded-md bg-emerald-100 px-1 py-0.5 text-emerald-600 shadow-sm sm:px-1.5"
        aria-label="yükseldi"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 2l7 10H1z" />
        </svg>
      </span>
    );
  if (dir === "down")
    return (
      <span
        className="inline-flex items-center rounded-md bg-red-100 px-1 py-0.5 text-red-600 shadow-sm sm:px-1.5"
        aria-label="düştü"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
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
  /** true: tek günlük vitrin — toplam = o günün üretimi; yan kutular saatlik özet. */
  singleDayMode?: boolean;
  /** Geniş tarih aralığındaki toplam üretim (günlük ortalama hesabı için) */
  multiDayTotal?: number;
  /** Geniş tarih aralığındaki aktif gün sayısı */
  multiDayActiveDays?: number;
  /** Dünkü toplam üretim (ok yönü için) */
  prevDayTotal?: number;
}) {
  if (!worker || rank == null) {
    return (
      <div className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-8 text-center shadow-inner">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">Personel verisi yok</p>
      </div>
    );
  }

  const h = hourly ?? { t1000: 0, t1300: 0, t1600: 0, t1830: 0 };
  const maxH = Math.max(h.t1000, h.t1300, h.t1600, h.t1830, 1);
  const singleAvgs = singleDayMode ? computeShiftHourAverages(h, worker.totalProduction) : null;

  // Çok günlük ortalama değerleri
  const hasMultiDay = multiDayActiveDays > 0;
  const multiDayDailyAvg = hasMultiDay
    ? Math.round(multiDayTotal / multiDayActiveDays)
    : (singleDayMode ? worker.totalProduction : Math.round(worker.totalProduction / Math.max(worker.activeDays, 1)));

  const multiDayPerHour = hasMultiDay
    ? Math.round(multiDayTotal / (multiDayActiveDays * SHIFT_NOMINAL_HOURS))
    : (singleAvgs?.perHourInWindow ?? 0);

  // Ok yönleri: bugünkü değer vs dünkü değer
  const todayTotal = worker.totalProduction;
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
    <article className="group relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08),0_12px_32px_-8px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04] transition-shadow duration-300 hover:shadow-[0_8px_32px_-6px_rgba(15,23,42,0.12)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-400 via-slate-500 to-slate-400" />

      <header className="relative shrink-0 px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.95rem] font-bold leading-snug tracking-wide text-slate-900 sm:text-lg">
              {title}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 sm:text-xs">{meta}</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-[10px] font-bold tabular-nums text-white shadow-sm sm:px-3 sm:text-xs">
            #{rank}
          </span>
        </div>
        <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </header>

      <div className="shrink-0 grid grid-cols-3 gap-2.5 px-3 pb-3 sm:gap-4 sm:px-4 sm:pb-5">
        {/* Bugün toplam */}
        <div className="flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-100/70 to-white px-2 py-3 text-center shadow-sm sm:min-h-[5.75rem] sm:gap-2 sm:rounded-3xl sm:px-3 sm:py-4">
          <div className="w-full text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600 sm:text-xs">
            {singleDayMode ? "Bugün toplam" : "Toplam"}
          </div>
          <div className="text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">{worker.totalProduction}</div>
        </div>

        {/* Ortalama / saat — çok günlük baz + ok */}
        <div
          className="flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-sky-50/80 to-white px-2 py-3 text-center shadow-sm sm:min-h-[5.75rem] sm:gap-2 sm:rounded-3xl sm:px-3 sm:py-4"
          title={
            hasMultiDay
              ? `Son ${multiDayActiveDays} günün toplam üretimi ÷ (gün × ${SHIFT_NOMINAL_HOURS} saat)`
              : "08:00 ile son üretim girilen saat dilimi başlangıcı arasındaki süre"
          }
        >
          <div className="w-full text-[8px] font-bold uppercase leading-snug tracking-wide text-slate-600 sm:text-[10px]">
            {singleDayMode ? "Saatlik ortalama" : "Çalışılan gün"}
          </div>
          {singleDayMode ? (
            <div className="flex w-full min-w-0 flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">
                {multiDayPerHour}
                <TrendArrow dir={hourlyArrow} />
              </div>
              {hasMultiDay ? (
                <div className="line-clamp-2 px-0.5 text-[9px] font-medium leading-tight text-slate-500 sm:text-[10px]">
                  {multiDayActiveDays} gün ort.
                </div>
              ) : singleAvgs ? (
                <div className="line-clamp-2 px-0.5 text-[9px] font-medium leading-tight text-slate-500 sm:text-[10px]">
                  {singleAvgs.windowHint}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">{worker.activeDays}</div>
          )}
        </div>

        {/* Günlük ortalama — çok günlük baz + ok */}
        <div
          className="flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-violet-50/70 to-white px-1.5 py-3 text-center shadow-sm sm:min-h-[5.75rem] sm:gap-2 sm:rounded-3xl sm:px-2.5 sm:py-4"
          title={
            hasMultiDay
              ? `Son ${multiDayActiveDays} günün toplam üretimi ÷ aktif gün sayısı`
              : `Gün toplamı ÷ ${SHIFT_NOMINAL_HOURS} saat`
          }
        >
          <div className="w-full text-[8px] font-bold uppercase leading-snug tracking-[0.05em] text-slate-600 sm:text-[10px] sm:leading-tight">
            {singleDayMode ? "Günlük ortalama" : "GÜNLÜK ORTALAMA"}
          </div>
          {singleDayMode ? (
            <div className="flex w-full min-w-0 flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">
                {multiDayDailyAvg}
              </div>
              <div className="text-[9px] font-semibold tabular-nums text-slate-500 sm:text-[10px]">
                {hasMultiDay ? `${multiDayActiveDays} gün` : `${SHIFT_NOMINAL_HOURS} saat üzerinden`}
              </div>
            </div>
          ) : (
            <div className="text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">
              {multiDayDailyAvg}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4 sm:pb-5 [scrollbar-width:thin]">
        <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px]">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200" />
          Saatlik üretim
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200" />
        </p>
        <ul className="space-y-3.5 sm:space-y-4">
          {SLOTS.map(({ key, label, fill, track }) => {
            const val = h[key];
            const pct = Math.round((val / maxH) * 100);
            const active = val > 0;
            return (
              <li key={key} className="flex items-center gap-2.5 sm:gap-3">
                <span className="w-11 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-600 sm:w-12 sm:text-sm">
                  {label}
                </span>
                <div className={`min-w-0 flex-1 overflow-hidden rounded-full p-0.5 ${track}`}>
                  <div className="h-3 overflow-hidden rounded-full bg-white/60 shadow-inner sm:h-3.5">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${active ? fill : "from-indigo-100 to-violet-100"} transition-all duration-700 ease-out`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-slate-800 sm:w-10 sm:text-sm">
                  {val}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
