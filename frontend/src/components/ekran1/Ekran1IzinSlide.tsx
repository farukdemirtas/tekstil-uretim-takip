"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import type { IzinTvLeaveRow } from "@/lib/api";
import { formatDateDMY, normalizeLeaveReason, sortTvLeaves, TV_MAX_LEAVE_ROWS } from "@/lib/izinTvBoard";

const TV_GRID = "grid grid-cols-5 items-center gap-x-2 sm:gap-x-3 xl:gap-x-4";
const TV_CELL = "min-w-0 flex items-center justify-center text-center px-1 sm:px-2";
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
    <div ref={containerRef} className="min-w-0 w-full overflow-hidden">
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
      className={`inline-flex items-center rounded-xl border-2 px-3 py-2 font-bold whitespace-nowrap ${cls}`}
      style={{ fontSize: "clamp(0.9rem, 1.55vw, 1.35rem)" }}
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
  useEffect(() => {
    document.documentElement.classList.add("tv-icerik");
    return () => document.documentElement.classList.remove("tv-icerik");
  }, []);

  const visible = useMemo(() => sortTvLeaves(leaves).slice(0, TV_MAX_LEAVE_ROWS), [leaves]);
  const now = useMemo(() => new Date(), [lastUpdated, leaves.length]);

  return (
    <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white text-slate-950">
      <header className="flex-shrink-0 w-full border-b-2 border-slate-300 bg-slate-50 px-4 sm:px-8 py-4 flex flex-row items-center gap-4 shadow-md">
        <div className="flex-1 min-w-0">
          <span className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
            İZİN PANOSU
          </span>
          <h1
            className="mt-2 font-extrabold tracking-tight uppercase text-slate-950"
            style={{ fontSize: "clamp(1.35rem, 2.8vw, 2.75rem)" }}
          >
            Yeşil İmaj Personel İzin Talepleri
          </h1>
        </div>
        <div className="ml-auto flex-shrink-0 text-right">
          <p className="text-slate-600 font-medium" style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.1rem)" }}>
            Saat
          </p>
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
          <p className="mb-2 flex-shrink-0 rounded-xl border-2 border-red-400 bg-red-100 px-4 py-3 text-red-950 font-medium">
            {error}
          </p>
        ) : null}

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-md">
          <div className={`${TV_GRID} px-4 py-3 flex-shrink-0 border-b-2 border-slate-300 bg-indigo-100`}>
            {TV_COLUMNS.map((col) => (
              <div
                key={col}
                className={`${TV_CELL} font-extrabold uppercase text-indigo-950`}
                style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.25rem)" }}
              >
                {col}
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {loading && leaves.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-xl font-medium">Yükleniyor…</div>
            ) : visible.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-xl font-medium">Henüz izin talebi yok.</div>
            ) : (
              visible.map((l, i) => (
                <div
                  key={l.id}
                  className={`${TV_GRID} px-4 flex-1 min-h-0 border-b-2 border-slate-300 ${i % 2 === 0 ? "bg-slate-100" : "bg-white"}`}
                >
                  <div className={TV_CELL}>
                    <span
                      className="truncate max-w-full font-bold text-slate-950"
                      style={{ fontSize: "clamp(1.15rem, 2.1vw, 2rem)" }}
                      title={l.fullName}
                    >
                      {l.fullName}
                    </span>
                  </div>
                  <div className={`${TV_CELL} overflow-hidden text-slate-800`}>
                    <TvFitText
                      text={l.position || "—"}
                      className="font-semibold"
                      style={{ fontSize: "clamp(1rem, 1.85vw, 1.65rem)" }}
                    />
                  </div>
                  <div className={`${TV_CELL} whitespace-nowrap tabular-nums font-bold text-slate-800`} style={{ fontSize: "clamp(1.25rem, 2.35vw, 2.35rem)" }}>
                    {l.startDate === l.endDate ? (
                      formatDateDMY(l.startDate)
                    ) : (
                      <>
                        {formatDateDMY(l.startDate)} <span className="text-slate-400 font-light px-1">→</span> {formatDateDMY(l.endDate)}
                      </>
                    )}
                  </div>
                  <div className={TV_CELL}>
                    <p
                      className="truncate w-full font-semibold text-slate-800 text-center"
                      style={{ fontSize: "clamp(1.05rem, 1.95vw, 1.75rem)" }}
                      title={normalizeLeaveReason(l.reason)}
                    >
                      {l.reason?.trim() ? normalizeLeaveReason(l.reason) : "—"}
                    </p>
                  </div>
                  <div className={TV_CELL}>
                    <StatusPill status={l.status} />
                  </div>
                </div>
              ))
            )}
          </div>
          {leaves.length > TV_MAX_LEAVE_ROWS ? (
            <p className="flex-shrink-0 px-4 py-2 text-center border-t-2 border-slate-200 text-slate-500 text-sm">
              Ekranda en yeni {TV_MAX_LEAVE_ROWS} talep · Toplam {leaves.length} kayıt
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
