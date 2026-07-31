"use client";

import { useEffect, useMemo, useState } from "react";
import type { IzinTvAttendanceSession } from "@/lib/api";
import {
  attendanceDataFingerprint,
  chunkRows,
  formatDateDMY,
  formatYoklamaBoardTitle,
  isAbsentDescription,
  isAnnualLeaveDescription,
  isLeaveDescription,
  isRaporluDescription,
  mergeAttendanceWithRaporlu,
  sortTvAttendanceEntries,
  TV_ATTENDANCE_ROWS_PER_SLIDE,
} from "@/lib/izinTvBoard";

const TV_HEADER = "grid shrink-0 grid-cols-4 items-center border-b-2 border-slate-300 bg-indigo-100 py-2 sm:py-2.5";
const TV_DATA_ROW = "grid min-h-0 flex-1 grid-cols-4 items-center border-b border-slate-300";
const TV_BODY = "flex min-h-0 flex-1 flex-col overflow-hidden";
const TV_CELL = "flex min-h-0 items-center justify-center overflow-hidden px-3 text-center sm:px-4";
const TV_HEADER_CELL = "px-3 py-1 text-center font-extrabold uppercase whitespace-nowrap text-indigo-950 sm:px-4";
const TV_COLUMNS = ["Ad soyad", "Tarih", "Açıklama", "Görev"] as const;
const SLIDE_FADE_MS = 450;
const INNER_SLIDE_MS = 10_000;

function DescriptionPill({ description }: { description: string }) {
  const absent = isAbsentDescription(description);
  const annual = isAnnualLeaveDescription(description);
  const raporlu = isRaporluDescription(description);
  const leave = !annual && !raporlu && isLeaveDescription(description);
  const base =
    "inline-flex max-h-full max-w-full items-center overflow-hidden rounded-lg border-2 px-2 py-1 font-bold truncate sm:rounded-xl sm:px-2.5 sm:py-1.5";
  const textStyle = { fontSize: "clamp(0.75rem, 1.35vw, 1.2rem)" };

  if (absent) {
    return <span className={`${base} border-red-700 bg-red-500 text-white`} style={textStyle}>{description}</span>;
  }
  if (raporlu) {
    return <span className={`${base} border-sky-700 bg-sky-500 text-white`} style={textStyle}>{description}</span>;
  }
  if (annual) {
    return <span className={`${base} border-amber-600 bg-amber-400 text-amber-950`} style={textStyle}>{description}</span>;
  }
  if (leave) {
    return <span className={`${base} border-violet-700 bg-violet-500 text-white`} style={textStyle}>{description}</span>;
  }
  return <span className={`${base} border-slate-400 bg-slate-200 text-slate-800`} style={textStyle}>{description}</span>;
}

function rowBgClass(description: string): string {
  if (isAbsentDescription(description)) return "bg-red-50";
  if (isRaporluDescription(description)) return "bg-sky-50";
  if (isAnnualLeaveDescription(description)) return "bg-amber-50";
  if (isLeaveDescription(description)) return "bg-violet-50";
  return "bg-white";
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

  const entries = useMemo(() => mergeAttendanceWithRaporlu(session), [session]);
  const sorted = useMemo(() => sortTvAttendanceEntries(entries), [entries]);
  const slideMode = sorted.length > TV_ATTENDANCE_ROWS_PER_SLIDE;
  const slides = useMemo(() => chunkRows(sorted, TV_ATTENDANCE_ROWS_PER_SLIDE), [sorted]);
  const visible = slides[slideIndex] ?? [];
  const dataFingerprint = useMemo(() => attendanceDataFingerprint(session), [session]);

  const stats = useMemo(() => {
    const listed = entries.length;
    const absent = entries.filter((e) => isAbsentDescription(e.description)).length;
    const raporlu = entries.filter((e) => isRaporluDescription(e.description)).length;
    const leave = entries.filter(
      (e) =>
        (isAnnualLeaveDescription(e.description) || isLeaveDescription(e.description)) &&
        !isRaporluDescription(e.description),
    ).length;
    const total = session?.totalPersonnel ?? listed;
    return { total, listed, absent, leave, raporlu, working: Math.max(0, total - listed) };
  }, [session, entries]);

  useEffect(() => {
    setSlideIndex(0);
    setSlideVisible(true);
  }, [dataFingerprint]);

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
  const now = useMemo(() => new Date(), [lastUpdated, dataFingerprint]);

  return (
    <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white text-slate-950">
      <header className="flex shrink-0 w-full flex-row items-center gap-4 border-b-2 border-slate-300 bg-slate-50 px-4 py-3 shadow-md sm:px-8 sm:py-4">
        <div className="min-w-0 flex-1">
          <span className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
            YOKLAMA PANOSU
          </span>
          <h1
            className="mt-2 line-clamp-2 font-extrabold tracking-tight text-slate-950"
            style={{ fontSize: "clamp(1.2rem, 2.4vw, 2.25rem)" }}
          >
            {formatYoklamaBoardTitle(session?.attendanceDate)}
          </h1>
          <div className="mt-2 flex flex-wrap items-end gap-3 sm:mt-3 sm:gap-4">
            {stats.total > 0 ? (
              <>
                <div>
                  <p className="font-medium text-slate-600" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Mevcut</p>
                  <p className="font-extrabold tabular-nums text-indigo-950" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.total}</p>
                </div>
                <div>
                  <p className="font-medium text-emerald-700" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Çalışan</p>
                  <p className="font-extrabold tabular-nums text-emerald-800" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.working}</p>
                </div>
              </>
            ) : null}
            <div>
              <p className="font-medium text-red-600" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Listede</p>
              <p className="font-extrabold tabular-nums text-red-700" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.listed}</p>
            </div>
            <div>
              <p className="font-medium text-amber-700" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>İzinli</p>
              <p className="font-extrabold tabular-nums text-amber-800" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.leave}</p>
            </div>
            <div>
              <p className="font-medium text-sky-700" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Raporlu</p>
              <p className="font-extrabold tabular-nums text-sky-800" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.raporlu}</p>
            </div>
            <div>
              <p className="font-medium text-red-600" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Devamsız</p>
              <p className="font-extrabold tabular-nums text-red-700" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.absent}</p>
            </div>
          </div>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="font-medium text-slate-600" style={{ fontSize: "clamp(0.8rem, 1.2vw, 1rem)" }}>Saat</p>
          <p className="font-extrabold tabular-nums" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}>
            {now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          {lastUpdated ? (
            <p className="mt-1 font-bold tabular-nums text-indigo-700" style={{ fontSize: "clamp(0.8rem, 1.2vw, 0.95rem)" }}>
              Son güncelleme {lastUpdated}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[min(100%,120rem)] flex-1 flex-col overflow-hidden px-3 py-2 sm:px-5 sm:py-3 md:px-8 md:py-3">
        {error ? (
          <p className="mb-2 shrink-0 rounded-xl border-2 border-red-400 bg-red-100 px-4 py-3 font-medium text-red-950">{error}</p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-md">
          {slideMode ? (
            <div className="shrink-0 border-b border-indigo-100 bg-indigo-50 px-3 py-1">
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

          <div className={TV_HEADER}>
            {TV_COLUMNS.map((col) => (
              <div key={col} className={TV_HEADER_CELL} style={{ fontSize: "clamp(0.8rem, 1.2vw, 1.1rem)" }}>
                {col}
              </div>
            ))}
          </div>

          <div
            className={`${TV_BODY} transition-opacity ease-in-out`}
            style={{ opacity: slideVisible ? 1 : 0, transitionDuration: `${SLIDE_FADE_MS}ms` }}
          >
            {loading && !session && sorted.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-xl font-medium text-slate-600">Yükleniyor…</div>
            ) : sorted.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-xl font-medium text-slate-600">Henüz yoklama kaydı yok.</div>
            ) : (
              visible.map((e, i) => {
                const bg = rowBgClass(e.description);
                const rowKey = e.id != null ? `entry-${e.id}` : `raporlu-${e.fullName}-${slideIndex}-${i}`;
                return (
                  <div key={rowKey} className={`${TV_DATA_ROW} ${bg}`}>
                    <div className={TV_CELL}>
                      <span className="max-w-full truncate font-bold text-slate-950" style={{ fontSize: "clamp(0.95rem, 1.75vw, 1.65rem)" }} title={e.fullName}>
                        {e.fullName}
                      </span>
                    </div>
                    <div className={TV_CELL}>
                      <span className="font-bold tabular-nums text-slate-800" style={{ fontSize: "clamp(1rem, 1.9vw, 1.85rem)" }}>
                        {e.entryDate || sessionDateLabel}
                      </span>
                    </div>
                    <div className={TV_CELL}>
                      <DescriptionPill description={e.description} />
                    </div>
                    <div className={TV_CELL}>
                      <span className="max-w-full truncate font-semibold text-slate-800" style={{ fontSize: "clamp(0.9rem, 1.55vw, 1.4rem)" }} title={e.position || undefined}>
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
