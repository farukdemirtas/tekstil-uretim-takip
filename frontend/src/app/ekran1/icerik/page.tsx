"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHedefTakipStageTotals, setAuthToken } from "@/lib/api";
import { clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";

const STORAGE_KEY = "hedef_takip_settings_v1";
const EKRAN1_MODE_KEY = "ekran1_display_mode";
const AUTO_REFRESH_MS = 30_000;

type Ekran1Mode = "dark" | "light";

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function calcPercent(count: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return clampPercent((count / target) * 100);
}

function formatDateTr(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

export default function Ekran1IcerikPage() {
  const [target, setTarget] = useState(5000);
  const [sagOn, setSagOn] = useState(0);
  const [solOn, setSolOn] = useState(0);
  const [yaka, setYaka] = useState(0);
  const [arka, setArka] = useState(0);
  const [bitim, setBitim] = useState(0);
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate] = useState(todayWeekdayIso());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [displayMode, setDisplayMode] = useState<Ekran1Mode>("light");
  const containerRef = useRef<HTMLDivElement>(null);
  const dark = displayMode === "dark";

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
    if (!token || !hasPermission("ekran1")) {
      window.location.href = "/";
      return;
    }
    setHasToken(true);
    setAuthToken(token);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          target?: number;
          startDate?: string;
          endDate?: string;
        };
        if (Number.isFinite(Number(saved.target))) setTarget(Number(saved.target));
        if (saved.startDate) setStartDate(clampToWeekdayIso(saved.startDate));
        if (saved.endDate) setEndDate(clampToWeekdayIso(saved.endDate));
      }
    } catch {
      /* ignore */
    }

    try {
      const m = window.localStorage.getItem(EKRAN1_MODE_KEY);
      if (m === "light" || m === "dark") setDisplayMode(m);
    } catch {
      /* ignore */
    }
  }, []);

  function setMode(mode: Ekran1Mode) {
    setDisplayMode(mode);
    try {
      window.localStorage.setItem(EKRAN1_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

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
      <div
        className={`fixed inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center ${
          dark ? "bg-[#030712] text-white" : "bg-slate-100 text-slate-900"
        }`}
      >
        <div
          className={`absolute right-4 top-4 flex rounded-xl border p-1 text-sm font-medium shadow-sm md:text-base ${
            dark ? "border-white/20 bg-white/5" : "border-slate-300 bg-white"
          }`}
        >
          <button
            type="button"
            onClick={() => setMode("dark")}
            className={`rounded-lg px-4 py-2 ${
              dark ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            Koyu
          </button>
          <button
            type="button"
            onClick={() => setMode("light")}
            className={`rounded-lg px-4 py-2 ${
              !dark ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:bg-white/10"
            }`}
          >
            Normal
          </button>
        </div>
        <p className="text-2xl font-semibold tracking-wide md:text-3xl">EKRAN1</p>
        <p className={`max-w-xl text-lg md:text-xl ${dark ? "text-slate-300" : "text-slate-600"}`}>
          Bu görünüm için önce ana uygulamada giriş yapın. Tarih aralığı ve hedefi{" "}
          <span className={dark ? "text-white" : "font-semibold text-slate-900"}>Hedef Takip</span> ekranından
          kaydedin.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className={
              dark
                ? "rounded-xl border-2 border-white px-8 py-4 text-lg font-semibold hover:bg-white hover:text-[#030712]"
                : "rounded-xl border-2 border-slate-800 px-8 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-800 hover:text-white"
            }
          >
            Giriş
          </Link>
          <Link
            href="/hedef-takip"
            className="rounded-xl bg-emerald-600 px-8 py-4 text-lg font-semibold text-white hover:bg-emerald-500"
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
      className={`fixed inset-0 flex flex-col overflow-auto ${dark ? "bg-[#030712] text-white" : "bg-slate-100 text-slate-900"}`}
      style={{ minHeight: "100dvh" }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1920px] flex-1 flex-col gap-6 px-6 py-6 md:gap-10 md:px-12 md:py-10">
        <header
          className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 md:pb-6 ${
            dark ? "border-white/10" : "border-slate-300"
          }`}
        >
          <div>
            <p
              className={`text-sm font-medium uppercase tracking-[0.35em] md:text-base ${
                dark ? "text-emerald-400/90" : "text-emerald-700"
              }`}
            >
              EKRAN1
            </p>
            <p className={`mt-1 text-lg md:text-xl ${dark ? "text-slate-400" : "text-slate-600"}`}>
              {formatDateTr(startDate)} — {formatDateTr(endDate)}
              {lastUpdated ? (
                <span className={`ml-3 ${dark ? "text-slate-500" : "text-slate-500"}`}>
                  · Son güncelleme {lastUpdated}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
            <div
              className={`flex rounded-xl border p-1 text-sm font-medium md:text-base ${
                dark ? "border-white/20 bg-white/5" : "border-slate-300 bg-white shadow-sm"
              }`}
            >
              <button
                type="button"
                onClick={() => setMode("dark")}
                className={`rounded-lg px-3 py-2 md:px-4 ${
                  dark ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Koyu
              </button>
              <button
                type="button"
                onClick={() => setMode("light")}
                className={`rounded-lg px-3 py-2 md:px-4 ${
                  !dark ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-white/10"
                }`}
              >
                Normal
              </button>
            </div>
            <span className={`hidden sm:inline md:text-lg ${dark ? "text-slate-500" : "text-slate-500"}`}>
              Yenileme 30 sn
            </span>
            <button
              type="button"
              onClick={() => void requestFullscreen()}
              className={`rounded-xl border-2 px-5 py-3 text-base font-semibold md:px-6 md:text-lg ${
                dark
                  ? "border-white/30 bg-white/5 hover:bg-white/10"
                  : "border-slate-400 bg-white text-slate-900 hover:bg-slate-50"
              }`}
            >
              Tam ekran
            </button>
          </div>
        </header>

        {error ? (
          <p className={`text-center text-2xl font-semibold md:text-3xl ${dark ? "text-red-400" : "text-red-600"}`}>
            {error}
          </p>
        ) : null}

        {loading && !lastUpdated ? (
          <p className={`text-center text-2xl ${dark ? "text-slate-400" : "text-slate-500"}`}>Yükleniyor…</p>
        ) : null}

        <section className="flex flex-1 flex-col justify-center gap-6 md:gap-10">
          <h1
            className={`text-center text-4xl font-black uppercase tracking-tight md:text-6xl lg:text-7xl xl:text-8xl ${
              dark ? "text-white" : "text-slate-900"
            }`}
          >
            Genel İlerleme
          </h1>

          <div className="relative mx-auto w-full max-w-6xl">
            <div
              className={`relative h-24 overflow-hidden rounded-2xl border-2 md:h-32 lg:h-40 ${
                dark
                  ? "border-white/20 bg-slate-900/80 shadow-[0_0_60px_rgba(16,185,129,0.15)]"
                  : "border-slate-300 bg-slate-200 shadow-[0_4px_40px_rgba(16,185,129,0.12)]"
              }`}
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
                  className={`font-black tabular-nums ${
                    dark
                      ? "text-white md:drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]"
                      : "text-slate-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]"
                  }`}
                  style={{
                    fontSize: "clamp(2.5rem, 8vw, 6rem)",
                    textShadow: dark
                      ? "0 0 2px #000, 0 2px 12px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.6)"
                      : "0 0 8px rgba(255,255,255,0.95), 0 2px 4px rgba(0,0,0,0.25)"
                  }}
                >
                  %{genelPercent.toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          <p
            className={`text-center text-xl font-medium md:text-3xl lg:text-4xl ${
              dark ? "text-slate-300" : "text-slate-700"
            }`}
          >
            <span className={dark ? "text-slate-500" : "text-slate-500"}>Toplam hedef</span>{" "}
            <span className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>
              {target.toLocaleString("tr-TR")}
            </span>
            <span className={`mx-3 md:mx-6 ${dark ? "text-slate-600" : "text-slate-400"}`}>/</span>
            <span className={dark ? "text-slate-500" : "text-slate-500"}>Gerçekleşen</span>{" "}
            <span className={`font-bold ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
              {genelTamamlanan.toLocaleString("tr-TR")}
            </span>
          </p>
        </section>

        <section
          className={`mt-auto grid grid-cols-2 gap-4 border-t pt-6 md:grid-cols-5 md:gap-5 md:pt-8 ${
            dark ? "border-white/10" : "border-slate-300"
          }`}
        >
          {stageRows.map((row) => (
            <div
              key={row.label}
              className={`rounded-xl border p-3 md:p-4 ${
                dark ? "border-white/10 bg-slate-900/50" : "border-slate-200 bg-white shadow-sm"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-sm font-semibold md:text-lg ${dark ? "text-slate-300" : "text-slate-700"}`}
                >
                  {row.label}
                </span>
                <span
                  className={`tabular-nums text-lg font-bold md:text-xl ${dark ? "text-white" : "text-slate-900"}`}
                >
                  {row.pct.toFixed(0)}%
                </span>
              </div>
              <div
                className={`mt-3 h-3 overflow-hidden rounded-full md:h-4 ${dark ? "bg-slate-800" : "bg-slate-200"}`}
              >
                <div
                  className={`h-full rounded-full ${row.bar} transition-[width] duration-1000 ease-out`}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
              <p className={`mt-2 text-xs md:text-sm ${dark ? "text-slate-500" : "text-slate-500"}`}>
                {row.value.toLocaleString("tr-TR")} / {target.toLocaleString("tr-TR")}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
