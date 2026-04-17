"use client";

import { useEffect, useState } from "react";

export type TickerItem = {
  workerId: number;
  name: string;
  process: string;
  team: string;
  efficiencyPct: number;
  trend: "up" | "down" | "neutral";
};

const ITEMS_PER_PAGE = 5;
const PAGE_MS = 30_000;

export function EfficiencyTicker({ items }: { items: TickerItem[] }) {
  const [pageIdx, setPageIdx] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setPageIdx(0);
  }, [items.length]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const id = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setPageIdx((p) => (p + 1) % totalPages);
        setFadeIn(true);
      }, 350);
    }, PAGE_MS);
    return () => clearInterval(id);
  }, [totalPages]);

  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center px-2">
        <p className="text-center text-[10px] text-slate-400">Veri bekleniyor…</p>
      </div>
    );
  }

  const pageItems = items.slice(
    pageIdx * ITEMS_PER_PAGE,
    (pageIdx + 1) * ITEMS_PER_PAGE
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Başlık */}
      <div className="shrink-0 px-3 pb-1.5 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Verimlilik
        </p>
      </div>

      {/* Sayfa göstergesi */}
      {totalPages > 1 && (
        <div className="flex shrink-0 justify-center gap-1.5 pb-1.5">
          {Array.from({ length: totalPages }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === pageIdx ? "w-5 bg-emerald-500" : "w-1.5 bg-slate-300"
              }`}
            />
          ))}
        </div>
      )}

      {/* Kartlar */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}
      >
        {pageItems.map((item) => {
          const isUp = item.trend === "up";
          const isDown = item.trend === "down";
          const isGreen = item.efficiencyPct >= 80;

          return (
            <div
              key={item.workerId}
              className={`flex min-h-0 flex-1 items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${
                isGreen
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              {/* Sol: isim + proses */}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-base font-black leading-tight ${
                  isGreen ? "text-emerald-900" : "text-red-900"
                }`}>
                  {item.name}
                </p>
                <p className="truncate text-xs font-semibold leading-tight text-slate-500">
                  {item.process}
                </p>
              </div>

              {/* Sağ: yüzde + trend oku */}
              <div className="flex shrink-0 flex-col items-center gap-0.5 leading-none">
                <span className={`text-xl font-black tabular-nums ${
                  isGreen ? "text-emerald-600" : "text-red-600"
                }`}>
                  %{item.efficiencyPct}
                </span>
                {isUp && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 3l6 9H2z" fill="#16a34a" />
                  </svg>
                )}
                {isDown && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 13L2 4h12z" fill="#dc2626" />
                  </svg>
                )}
                {!isUp && !isDown && (
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
                    <path d="M2 5h12" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
