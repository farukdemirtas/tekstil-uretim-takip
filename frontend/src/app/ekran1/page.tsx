"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHedefTakipStageTotals, setAuthToken } from "@/lib/api";

const STORAGE_KEY = "hedef_takip_settings_v1";
const AUTO_REFRESH_MS = 30_000;

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function calcPercent(count: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return clampPercent((count / target) * 100);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTr(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

export default function Ekran1Page() {
  const [target, setTarget] = useState(5000);
  const [sagOn, setSagOn] = useState(0);
  const [solOn, setSolOn] = useState(0);
  const [yaka, setYaka] = useState(0);
  const [arka, setArka] = useState(0);
  const [bitim, setBitim] = useState(0);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const genelTamamlanan = useMemo(
    () => Math.min(sagOn, solOn, yaka, arka, bitim),
    [sagOn, solOn, yaka, arka, bitim]
  );
  const genelPercent = useMemo(
    () => calcPercent(genelTamamlanan, target),
    [genelTamamlanan, target]
  );

  const fetchData = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const totals = await getHedefTakipStageTotals(startDate, endDate);
      setSagOn(totals.SAG_ON);
      setSolOn(totals.SOL_ON);
      setYaka(totals.YAKA_HAZIRLIK);
      setArka(totals.ARKA_HAZIRLIK);
      setBitim(totals.BITIM);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch {
      setError("Veri alınamadı. Oturum veya bağlantıyı kontrol edin.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    setHasToken(!!token);
    if (token) setAuthToken(token);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          target?: number;
          startDate?: string;
          endDate?: string;
        };
        if (Number.isFinite(Number(saved.target))) setTarget(Number(saved.target));
        if (saved.startDate) setStartDate(saved.startDate);
        if (saved.endDate) setEndDate(saved.endDate);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return;
    }
    void fetchData(false);
  }, [hasToken, startDate, endDate, fetchData]);

  useEffect(() => {
    if (!hasToken) return;
    const id = setInterval(() => void fetchData(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, fetchData]);

  function requestFullscreen() {
    const el = containerRef.current ?? document.documentElement;
    if (el.requestFullscreen) void el.requestFullscreen();
  }

  const stageRows = useMemo(
    () =>
      [
        { label: "Sağ Ön", value: sagOn, pct: calcPercent(sagOn, target), bar: "bg-emerald-400" },
        { label: "Sol Ön", value: solOn, pct: calcPercent(solOn, target), bar: "bg-sky-400" },
        { label: "Yaka", value: yaka, pct: calcPercent(yaka, target), bar: "bg-violet-400" },
        { label: "Arka", value: arka, pct: calcPercent(arka, target), bar: "bg-amber-400" },
        { label: "Bitim", value: bitim, pct: calcPercent(bitim, target), bar: "bg-rose-400" }
      ] as const,
    [sagOn, solOn, yaka, arka, bitim, target]
  );

  if (!hasToken) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-[#030712] px-8 text-center text-white">
        <p className="text-2xl font-semibold tracking-wide md:text-3xl">EKRAN1</p>
        <p className="max-w-xl text-lg text-slate-300 md:text-xl">
          Bu görünüm için önce ana uygulamada giriş yapın. Tarih aralığı ve hedefi{" "}
          <span className="text-white">Hedef Takip</span> ekranından kaydedin.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className="rounded-xl border-2 border-white px-8 py-4 text-lg font-semibold hover:bg-white hover:text-[#030712]"
          >
            Giriş
          </Link>
          <Link
            href="/hedef-takip"
            className="rounded-xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-[#030712] hover:bg-emerald-400"
          >
            Hedef Takip
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-col overflow-auto bg-[#030712] text-white"
      style={{ minHeight: "100dvh" }}
    >
      {/* 1920×1080 odaklı padding; TV kenarları için güvenli alan */}
      <div className="mx-auto flex min-h-full w-full max-w-[1920px] flex-1 flex-col gap-6 px-6 py-6 md:gap-10 md:px-12 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4 md:pb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.35em] text-emerald-400/90 md:text-base">
              EKRAN1
            </p>
            <p className="mt-1 text-lg text-slate-400 md:text-xl">
              {formatDateTr(startDate)} — {formatDateTr(endDate)}
              {lastUpdated ? (
                <span className="ml-3 text-slate-500">· Son güncelleme {lastUpdated}</span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-slate-500 sm:inline md:text-lg">Yenileme 30 sn</span>
            <button
              type="button"
              onClick={() => void requestFullscreen()}
              className="rounded-xl border-2 border-white/30 bg-white/5 px-5 py-3 text-base font-semibold hover:bg-white/10 md:px-6 md:text-lg"
            >
              Tam ekran
            </button>
          </div>
        </header>

        {error ? (
          <p className="text-center text-2xl font-semibold text-red-400 md:text-3xl">{error}</p>
        ) : null}

        {loading && !lastUpdated ? (
          <p className="text-center text-2xl text-slate-400">Yükleniyor…</p>
        ) : null}

        <section className="flex flex-1 flex-col justify-center gap-6 md:gap-10">
          <h1 className="text-center text-4xl font-black uppercase tracking-tight text-white md:text-6xl lg:text-7xl xl:text-8xl">
            Genel İlerleme
          </h1>

          <div className="relative mx-auto w-full max-w-6xl">
            <div
              className="relative h-24 overflow-hidden rounded-2xl border-2 border-white/20 bg-slate-900/80 shadow-[0_0_60px_rgba(16,185,129,0.15)] md:h-32 lg:h-40"
              role="progressbar"
              aria-valuenow={Math.round(genelPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-1000 ease-out"
                style={{ width: `${genelPercent}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center px-4">
                <span
                  className="font-black tabular-nums text-white md:drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]"
                  style={{
                    fontSize: "clamp(2.5rem, 8vw, 6rem)",
                    textShadow: "0 0 2px #000, 0 2px 12px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.6)"
                  }}
                >
                  %{genelPercent.toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-center text-xl font-medium text-slate-300 md:text-3xl lg:text-4xl">
            <span className="text-slate-500">Toplam hedef</span>{" "}
            <span className="font-bold text-white">{target.toLocaleString("tr-TR")}</span>
            <span className="mx-3 text-slate-600 md:mx-6">/</span>
            <span className="text-slate-500">Gerçekleşen</span>{" "}
            <span className="font-bold text-emerald-400">{genelTamamlanan.toLocaleString("tr-TR")}</span>
          </p>
          <p className="text-center text-sm text-slate-500 md:text-lg">
            Genel ilerleme = min (Sağ Ön, Sol Ön, Yaka Hazırlık, Arka Hazırlık, Bitim)
          </p>
        </section>

        <section className="mt-auto grid grid-cols-2 gap-4 border-t border-white/10 pt-6 md:grid-cols-5 md:gap-5 md:pt-8">
          {stageRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-white/10 bg-slate-900/50 p-3 md:p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-300 md:text-lg">{row.label}</span>
                <span className="tabular-nums text-lg font-bold text-white md:text-xl">{row.pct.toFixed(0)}%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800 md:h-4">
                <div
                  className={`h-full rounded-full ${row.bar} transition-[width] duration-1000 ease-out`}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 md:text-sm">
                {row.value.toLocaleString("tr-TR")} / {target.toLocaleString("tr-TR")}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
