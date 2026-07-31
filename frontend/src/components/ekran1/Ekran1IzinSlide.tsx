"use client";

import { useEffect, useMemo, useState } from "react";
import type { IzinTvLeaveRow } from "@/lib/api";
import { todayIsoTurkey } from "@/lib/businessCalendar";
import {
  chunkRows,
  filterLeavesCreatedOnDate,
  formatLeaveDateRange,
  normalizeLeaveReason,
  sortTvLeaves,
  TV_LEAVE_ROWS_PER_SLIDE,
  TV_MAX_LEAVE_DISPLAY,
} from "@/lib/izinTvBoard";

const TV_HEADER = "grid shrink-0 grid-cols-4 items-center border-b-2 border-slate-300 bg-indigo-100 py-2 sm:py-2.5";
const TV_DATA_ROW = "grid min-h-0 flex-1 grid-cols-4 items-center border-b border-slate-300";
const TV_BODY = "flex min-h-0 flex-1 flex-col overflow-hidden";
const TV_CELL = "flex min-h-0 items-center justify-center overflow-hidden px-2 text-center sm:px-3";
const TV_HEADER_CELL = "px-2 py-1 text-center font-extrabold uppercase whitespace-nowrap text-indigo-950 sm:px-3";
const TV_COLUMNS = ["Ad soyad", "Tarih", "Gerekçe", "Durum"] as const;
const SLIDE_FADE_MS = 450;
const INNER_SLIDE_MS = 12_000;

function StatusPill({ status }: { status: IzinTvLeaveRow["status"] }) {
  const label = status === "beklemede" ? "Beklemede" : status === "onaylandi" ? "Onaylandı" : "Reddedildi";
  const cls =
    status === "beklemede"
      ? "border-amber-600 bg-amber-400 text-amber-950"
      : status === "onaylandi"
        ? "border-emerald-700 bg-emerald-500 text-white"
        : "border-red-700 bg-red-500 text-white";
  return (
    <span
      className={`inline-flex max-h-full max-w-full items-center overflow-hidden rounded-lg border-2 px-2 py-0.5 font-bold whitespace-nowrap sm:rounded-xl sm:px-2.5 sm:py-1 ${cls}`}
      style={{ fontSize: "clamp(0.75rem, 1.35vw, 1.2rem)" }}
    >
      {label}
    </span>
  );
}

function ReasonPill({ reason }: { reason: string }) {
  const label = reason?.trim() ? normalizeLeaveReason(reason) : "—";
  const base =
    "inline-flex max-h-full max-w-full items-center overflow-hidden rounded-lg border-2 px-2 py-0.5 font-bold truncate sm:rounded-xl sm:px-2.5 sm:py-1";
  const textStyle = { fontSize: "clamp(0.75rem, 1.35vw, 1.2rem)" };
  return (
    <span className={`${base} border-violet-700 bg-violet-500 text-white`} style={textStyle} title={label}>
      {label}
    </span>
  );
}

type Props = {
  leaves: IzinTvLeaveRow[];
  loading: boolean;
  error?: string;
  lastUpdated?: string;
};

export function Ekran1IzinSlide({ leaves, loading, error, lastUpdated }: Props) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideVisible, setSlideVisible] = useState(true);

  const todayIso = useMemo(() => todayIsoTurkey(), [lastUpdated, leaves.length]);
  const todayLeaves = useMemo(
    () => sortTvLeaves(filterLeavesCreatedOnDate(leaves, todayIso)),
    [leaves, todayIso],
  );
  const slideMode = todayLeaves.length > TV_LEAVE_ROWS_PER_SLIDE;
  const slides = useMemo(() => chunkRows(todayLeaves, TV_LEAVE_ROWS_PER_SLIDE), [todayLeaves]);
  const visible = slides[slideIndex] ?? [];
  const overflowCount = Math.max(0, todayLeaves.length - TV_MAX_LEAVE_DISPLAY);
  const now = useMemo(() => new Date(), [lastUpdated, leaves.length]);

  const stats = useMemo(() => {
    const pending = todayLeaves.filter((l) => l.status === "beklemede").length;
    const approved = todayLeaves.filter((l) => l.status === "onaylandi").length;
    const rejected = todayLeaves.filter((l) => l.status === "reddedildi").length;
    return { total: todayLeaves.length, pending, approved, rejected };
  }, [todayLeaves]);

  useEffect(() => {
    setSlideIndex(0);
    setSlideVisible(true);
  }, [todayIso, todayLeaves.length]);

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

  return (
    <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white text-slate-950">
      <header className="flex shrink-0 w-full flex-row items-center gap-4 border-b-2 border-slate-300 bg-slate-50 px-4 py-3 shadow-md sm:px-8 sm:py-4">
        <div className="min-w-0 flex-1">
          <span className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
            İZİN PANOSU
          </span>
          <h1
            className="mt-2 font-extrabold uppercase tracking-tight text-slate-950"
            style={{ fontSize: "clamp(1.2rem, 2.4vw, 2.25rem)" }}
          >
            Yeşil İmaj Personel İzin Talepleri
          </h1>
          <div className="mt-2 flex flex-wrap items-end gap-3 sm:mt-3 sm:gap-4">
            <div>
              <p className="font-medium text-slate-600" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Bugün</p>
              <p className="font-extrabold tabular-nums text-indigo-950" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.total}</p>
            </div>
            <div>
              <p className="font-medium text-amber-700" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Beklemede</p>
              <p className="font-extrabold tabular-nums text-amber-800" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.pending}</p>
            </div>
            <div>
              <p className="font-medium text-emerald-700" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Onaylı</p>
              <p className="font-extrabold tabular-nums text-emerald-800" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.approved}</p>
            </div>
            <div>
              <p className="font-medium text-red-600" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Red</p>
              <p className="font-extrabold tabular-nums text-red-700" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>{stats.rejected}</p>
            </div>
            {overflowCount > 0 ? (
              <div>
                <p className="font-medium text-violet-700" style={{ fontSize: "clamp(0.75rem, 1.1vw, 0.95rem)" }}>Ek talep</p>
                <p className="font-extrabold tabular-nums text-violet-800" style={{ fontSize: "clamp(1.15rem, 2vw, 1.75rem)" }}>+{overflowCount}</p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="font-medium text-slate-600" style={{ fontSize: "clamp(0.8rem, 1.2vw, 1rem)" }}>Saat</p>
          <p className="font-extrabold tabular-nums" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}>
            {now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          {lastUpdated ? (
            <p className="mt-1 font-bold tabular-nums text-indigo-700" style={{ fontSize: "clamp(0.8rem, 1.2vw, 0.95rem)" }}>
              Güncelleme {lastUpdated}
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
            {loading && leaves.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-xl font-medium text-slate-600">Yükleniyor…</div>
            ) : todayLeaves.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-xl font-medium text-slate-600">Bugün izin talebi yok.</div>
            ) : (
              visible.map((l, i) => {
                const bg = i % 2 === 0 ? "bg-slate-100" : "bg-white";
                return (
                  <div key={l.id} className={`${TV_DATA_ROW} ${bg}`}>
                    <div className={TV_CELL}>
                      <span
                        className="max-w-full truncate font-bold text-slate-950"
                        style={{ fontSize: "clamp(0.95rem, 1.75vw, 1.65rem)" }}
                        title={l.fullName}
                      >
                        {l.fullName}
                      </span>
                    </div>
                    <div className={TV_CELL}>
                      <span
                        className="max-w-full truncate font-bold tabular-nums text-slate-800"
                        style={{ fontSize: "clamp(1rem, 1.9vw, 1.85rem)" }}
                        title={formatLeaveDateRange(l.startDate, l.endDate)}
                      >
                        {formatLeaveDateRange(l.startDate, l.endDate)}
                      </span>
                    </div>
                    <div className={TV_CELL}>
                      <ReasonPill reason={l.reason} />
                    </div>
                    <div className={TV_CELL}>
                      <StatusPill status={l.status} />
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
