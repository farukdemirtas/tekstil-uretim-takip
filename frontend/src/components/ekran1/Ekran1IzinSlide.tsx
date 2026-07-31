"use client";

import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import type { IzinTvLeaveRow } from "@/lib/api";
import { formatDateDMY, normalizeLeaveReason, sortTvLeaves, TV_MAX_LEAVE_ROWS } from "@/lib/izinTvBoard";

const TV_HEADER = "grid shrink-0 grid-cols-5 items-center border-b-2 border-slate-300 bg-indigo-100 py-2 sm:py-2.5";
const TV_DATA_ROW = "grid min-h-0 flex-1 grid-cols-5 items-center border-b border-slate-300";
const TV_BODY = "flex min-h-0 flex-1 flex-col overflow-hidden";
const TV_CELL = "flex min-h-0 items-center justify-center overflow-hidden px-3 text-center sm:px-4";
const TV_HEADER_CELL = "px-3 py-1 text-center font-extrabold uppercase whitespace-nowrap text-indigo-950 sm:px-4";
const TV_COLUMNS = ["Ad soyad", "Görev", "Tarih aralığı", "Gerekçe", "Durum"] as const;

function TvFitText({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;

    const fit = () => {
      el.style.fontSize = "";
      el.classList.remove("truncate");
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (!base) return;
      const min = base * 0.5;
      let size = base;
      while (size > min && el.scrollWidth > container.clientWidth) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      if (el.scrollWidth > container.clientWidth) el.classList.add("truncate");
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className="min-h-0 w-full min-w-0 overflow-hidden">
      <span ref={textRef} className={`block max-w-full whitespace-nowrap text-center ${className ?? ""}`} style={style} title={text}>
        {text}
      </span>
    </div>
  );
}

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
      className={`inline-flex max-h-full max-w-full items-center overflow-hidden rounded-lg border-2 px-2 py-1 font-bold whitespace-nowrap sm:rounded-xl sm:px-2.5 sm:py-1.5 ${cls}`}
      style={{ fontSize: "clamp(0.75rem, 1.25vw, 1.15rem)" }}
    >
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
  const visible = useMemo(() => sortTvLeaves(leaves).slice(0, TV_MAX_LEAVE_ROWS), [leaves]);
  const now = useMemo(() => new Date(), [lastUpdated, leaves.length]);

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
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="font-medium text-slate-600" style={{ fontSize: "clamp(0.8rem, 1.2vw, 1rem)" }}>
            Saat
          </p>
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
          <p className="mb-2 shrink-0 rounded-xl border-2 border-red-400 bg-red-100 px-4 py-3 font-medium text-red-950">
            {error}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-md">
          <div className={TV_HEADER}>
            {TV_COLUMNS.map((col) => (
              <div
                key={col}
                className={TV_HEADER_CELL}
                style={{ fontSize: "clamp(0.8rem, 1.2vw, 1.1rem)" }}
              >
                {col}
              </div>
            ))}
          </div>

          <div className={TV_BODY}>
            {loading && leaves.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-xl font-medium text-slate-600">Yükleniyor…</div>
            ) : visible.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-xl font-medium text-slate-600">Henüz izin talebi yok.</div>
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
                      <TvFitText
                        text={l.position || "—"}
                        className="font-semibold text-slate-800"
                        style={{ fontSize: "clamp(0.9rem, 1.55vw, 1.4rem)" }}
                      />
                    </div>
                    <div className={`${TV_CELL} whitespace-nowrap tabular-nums font-bold text-slate-800`} style={{ fontSize: "clamp(1rem, 1.9vw, 1.85rem)" }}>
                      {l.startDate === l.endDate ? (
                        formatDateDMY(l.startDate)
                      ) : (
                        <>
                          {formatDateDMY(l.startDate)} <span className="px-1 font-light text-slate-400">→</span> {formatDateDMY(l.endDate)}
                        </>
                      )}
                    </div>
                    <div className={TV_CELL}>
                      <p
                        className="w-full truncate text-center font-semibold text-slate-800"
                        style={{ fontSize: "clamp(0.9rem, 1.55vw, 1.35rem)" }}
                        title={normalizeLeaveReason(l.reason)}
                      >
                        {l.reason?.trim() ? normalizeLeaveReason(l.reason) : "—"}
                      </p>
                    </div>
                    <div className={TV_CELL}>
                      <StatusPill status={l.status} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {leaves.length > TV_MAX_LEAVE_ROWS ? (
            <p className="shrink-0 border-t-2 border-slate-200 px-4 py-2 text-center text-sm text-slate-500">
              Ekranda en yeni {TV_MAX_LEAVE_ROWS} talep · Toplam {leaves.length} kayıt
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
