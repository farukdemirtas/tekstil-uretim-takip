"use client";

import { useEffect, useMemo, useState } from "react";
import type { IzinTvAttendanceSession } from "@/lib/api";
import {
  chunkRows,
  formatDateDMY,
  formatYoklamaBoardTitle,
  isAbsentDescription,
  isAnnualLeaveDescription,
  isLeaveDescription,
  sortTvAttendanceEntries,
  TV_ATTENDANCE_ROWS_PER_SLIDE,
} from "@/lib/izinTvBoard";

const TV_GRID = "grid grid-cols-4 items-center gap-x-2 sm:gap-x-3 xl:gap-x-4";
const TV_CELL = "min-w-0 flex items-center justify-center text-center px-1 sm:px-2";
const TV_COLUMNS = ["Ad soyad", "Tarih", "Açıklama", "Görev"] as const;
const SLIDE_FADE_MS = 450;
const INNER_SLIDE_MS = 10_000;

function DescriptionPill({ description }: { description: string }) {
  const absent = isAbsentDescription(description);
  const annual = isAnnualLeaveDescription(description);
  const leave = !annual && isLeaveDescription(description);
  const base = "inline-flex items-center rounded-xl border-2 px-3 py-2 font-bold max-w-full truncate";
  const textStyle = { fontSize: "clamp(0.95rem, 1.7vw, 1.45rem)" };

  if (absent) {
    return <span className={`${base} border-red-700 bg-red-500 text-white`} style={textStyle}>{description}</span>;
  }
  if (annual) {
    return <span className={`${base} border-amber-600 bg-amber-400 text-amber-950`} style={textStyle}>{description}</span>;
  }
  if (leave) {
    return <span className={`${base} border-violet-700 bg-violet-500 text-white`} style={textStyle}>{description}</span>;
  }
  return <span className={`${base} border-slate-400 bg-slate-200 text-slate-800`} style={textStyle}>{description}</span>;
}

type Props = {
  session: IzinTvAttendanceSession | null;
  loading: boolean;
  error?: string;
  lastUpdated?: string;
};

export function Ekran1YoklamaSlide({ session, loading, error, lastUpdated }: Props) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideVisible, setSlideVisible] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add("tv-icerik");
    return () => document.documentElement.classList.remove("tv-icerik");
  }, []);

  const entries = session?.entries ?? [];
  const sorted = useMemo(() => sortTvAttendanceEntries(entries), [entries]);
  const slideMode = sorted.length > TV_ATTENDANCE_ROWS_PER_SLIDE;
  const slides = useMemo(() => chunkRows(sorted, TV_ATTENDANCE_ROWS_PER_SLIDE), [sorted]);
  const visible = slides[slideIndex] ?? [];

  const stats = useMemo(() => {
    const listed = entries.length;
    const absent = entries.filter((e) => isAbsentDescription(e.description)).length;
    const leave = entries.filter(
      (e) => isAnnualLeaveDescription(e.description) || isLeaveDescription(e.description),
    ).length;
    const total = session?.totalPersonnel ?? listed;
    return { total, listed, absent, leave, working: Math.max(0, total - listed) };
  }, [session, entries]);

  useEffect(() => {
    setSlideIndex(0);
    setSlideVisible(true);
  }, [session?.id, session?.attendanceDate, sorted.length]);

  useEffect(() => {
    if (!slideMode || slides.length <= 1) return;
    const id = window.setInterval(() => {
      setSlideVisible(false);
      window.setTimeout(() => {
        setSlideIndex((prev) => (prev + 1) % slides.length);
        setSlideVisible(true);
      }, SLIDE_FADE_MS);
    }, INNER_SLIDE_MS);
    return () => window.clearInterval(id);
  }, [slideMode, slides.length]);

  const sessionDateLabel = session?.attendanceDate ? formatDateDMY(session.attendanceDate) : "—";
  const now = useMemo(() => new Date(), [lastUpdated, session?.id]);

  return (
    <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white text-slate-950">
      <header className="flex-shrink-0 w-full border-b-2 border-slate-300 bg-slate-50 px-4 sm:px-8 py-4 flex flex-row items-center gap-4 shadow-md">
        <div className="flex-1 min-w-0">
          <span className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
            YOKLAMA PANOSU
          </span>
          <h1
            className="mt-2 font-extrabold tracking-tight text-slate-950 line-clamp-2"
            style={{ fontSize: "clamp(1.35rem, 2.8vw, 2.75rem)" }}
          >
            {formatYoklamaBoardTitle(session?.attendanceDate)}
          </h1>
          <div className="mt-3 flex flex-wrap items-end gap-4 sm:gap-5">
            {stats.total > 0 ? (
              <>
                <div>
                  <p className="text-slate-600 font-medium" style={{ fontSize: "clamp(0.8rem, 1.3vw, 1rem)" }}>Mevcut</p>
                  <p className="font-extrabold tabular-nums text-indigo-950" style={{ fontSize: "clamp(1.35rem, 2.5vw, 2rem)" }}>{stats.total}</p>
                </div>
                <div>
                  <p className="text-emerald-700 font-medium" style={{ fontSize: "clamp(0.8rem, 1.3vw, 1rem)" }}>Çalışan</p>
                  <p className="font-extrabold tabular-nums text-emerald-800" style={{ fontSize: "clamp(1.35rem, 2.5vw, 2rem)" }}>{stats.working}</p>
                </div>
              </>
            ) : null}
            <div>
              <p className="text-red-600 font-medium" style={{ fontSize: "clamp(0.8rem, 1.3vw, 1rem)" }}>Listede</p>
              <p className="font-extrabold tabular-nums text-red-700" style={{ fontSize: "clamp(1.35rem, 2.5vw, 2rem)" }}>{stats.listed}</p>
            </div>
            <div>
              <p className="text-amber-700 font-medium" style={{ fontSize: "clamp(0.8rem, 1.3vw, 1rem)" }}>İzinli</p>
              <p className="font-extrabold tabular-nums text-amber-800" style={{ fontSize: "clamp(1.35rem, 2.5vw, 2rem)" }}>{stats.leave}</p>
            </div>
            <div>
              <p className="text-red-600 font-medium" style={{ fontSize: "clamp(0.8rem, 1.3vw, 1rem)" }}>Devamsız</p>
              <p className="font-extrabold tabular-nums text-red-700" style={{ fontSize: "clamp(1.35rem, 2.5vw, 2rem)" }}>{stats.absent}</p>
            </div>
          </div>
        </div>
        <div className="ml-auto flex-shrink-0 text-right">
          <p className="text-slate-600 font-medium" style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.1rem)" }}>Saat</p>
          <p className="font-extrabold tabular-nums" style={{ fontSize: "clamp(1.75rem, 3.5vw, 3rem)" }}>
            {now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          {lastUpdated ? (
            <p className="mt-1 text-indigo-700 font-bold tabular-nums" style={{ fontSize: "clamp(0.85rem, 1.4vw, 1rem)" }}>
              Güncelleme {lastUpdated}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[min(100%,120rem)] flex-1 flex-col overflow-hidden px-3 py-2 sm:px-5 sm:py-3 md:px-8 md:py-4">
        {error ? (
          <p className="mb-2 flex-shrink-0 rounded-xl border-2 border-red-400 bg-red-100 px-4 py-3 text-red-950 font-medium">{error}</p>
        ) : null}

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-md">
          {slideMode ? (
            <div className="flex-shrink-0 px-3 py-1 border-b border-indigo-100 bg-indigo-50">
              <div className="flex gap-1.5">
                {slides.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i === slideIndex ? "bg-indigo-600" : i < slideIndex ? "bg-indigo-300" : "bg-slate-200"}`}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className={`${TV_GRID} px-4 py-3 flex-shrink-0 border-b-2 border-slate-300 bg-indigo-100`}>
            {TV_COLUMNS.map((col) => (
              <div key={col} className={`${TV_CELL} font-extrabold uppercase text-indigo-950`} style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.25rem)" }}>
                {col}
              </div>
            ))}
          </div>

          <div
            className="flex-1 min-h-0 grid overflow-hidden transition-opacity ease-in-out"
            style={{
              opacity: slideVisible ? 1 : 0,
              transitionDuration: `${SLIDE_FADE_MS}ms`,
              gridTemplateRows:
                !loading && sorted.length > 0
                  ? `repeat(${visible.length}, minmax(0, 1fr))`
                  : "1fr",
            }}
          >
            {loading && !session ? (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-xl font-medium">Yükleniyor…</div>
            ) : sorted.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-xl font-medium">Henüz yoklama kaydı yok.</div>
            ) : (
              visible.map((e, i) => {
                const rowBg = isAbsentDescription(e.description)
                  ? "bg-red-50"
                  : isAnnualLeaveDescription(e.description)
                    ? "bg-amber-50"
                    : isLeaveDescription(e.description)
                      ? "bg-violet-50"
                      : "bg-white";
                return (
                  <div key={e.id ?? `${slideIndex}-${i}`} className={`${TV_GRID} min-h-0 h-full px-4 border-b-2 border-slate-300 ${rowBg}`}>
                    <div className={TV_CELL}>
                      <span className="truncate max-w-full font-bold text-slate-950" style={{ fontSize: "clamp(1.15rem, 2.1vw, 2rem)" }} title={e.fullName}>
                        {e.fullName}
                      </span>
                    </div>
                    <div className={TV_CELL}>
                      <span className="font-bold tabular-nums text-slate-800" style={{ fontSize: "clamp(1.25rem, 2.35vw, 2.35rem)" }}>
                        {e.entryDate || sessionDateLabel}
                      </span>
                    </div>
                    <div className={TV_CELL}>
                      <DescriptionPill description={e.description} />
                    </div>
                    <div className={TV_CELL}>
                      <span className="truncate max-w-full font-semibold text-slate-800" style={{ fontSize: "clamp(1rem, 1.85vw, 1.65rem)" }} title={e.position || undefined}>
                        {e.position || "—"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
