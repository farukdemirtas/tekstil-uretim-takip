"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHedefTakipStageTotals, setAuthToken, type HedefStageLineDto } from "@/lib/api";
import { clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";

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

function formatDateTr(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

export default function Ekran1IcerikPage() {
  const [target, setTarget] = useState(5000);
  const [stages, setStages] = useState<HedefStageLineDto[]>([]);
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate] = useState(todayWeekdayIso());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [modelId, setModelId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const genelTamamlanan = useMemo(() => {
    if (!stages.length) return 0;
    return Math.min(...stages.map((s) => (Number.isFinite(s.total) ? s.total : 0)));
  }, [stages]);
  const genelPercent = useMemo(
    () => calcPercent(genelTamamlanan, target),
    [genelTamamlanan, target]
  );

  const fetchData = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const totals = await getHedefTakipStageTotals(startDate, endDate, modelId ?? undefined);
      setStages(totals.stages ?? []);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch {
      setError("Veri alınamadı. Oturum veya bağlantıyı kontrol edin.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [startDate, endDate, modelId]);

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
          modelId?: number | null;
        };
        if (Number.isFinite(Number(saved.target))) setTarget(Number(saved.target));
        if (saved.startDate) setStartDate(clampToWeekdayIso(saved.startDate));
        if (saved.endDate) setEndDate(clampToWeekdayIso(saved.endDate));
        if (saved.modelId != null && Number.isFinite(Number(saved.modelId))) {
          setModelId(Number(saved.modelId));
        }
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

  const BAR_COLORS = ["bg-emerald-400", "bg-sky-400", "bg-violet-400", "bg-amber-400", "bg-rose-400", "bg-cyan-400", "bg-fuchsia-400", "bg-lime-400"] as const;

  const stageRows = useMemo(() => {
    return stages.map((s, i) => {
      const shortP = s.processName.length > 16 ? `${s.processName.slice(0, 14)}…` : s.processName;
      const label = s.processName ? `${s.teamLabel} · ${shortP}` : s.teamLabel;
      const value = Number.isFinite(s.total) ? s.total : 0;
      return {
        label,
        value,
        pct: calcPercent(value, target),
        bar: BAR_COLORS[i % BAR_COLORS.length],
      };
    });
  }, [stages, target]);

  if (!hasToken) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-slate-100 px-8 text-center text-slate-900">
        <p className="text-2xl font-semibold tracking-wide md:text-3xl">EKRAN1</p>
        <p className="max-w-xl text-lg text-slate-600 md:text-xl">
          Bu görünüm için önce ana uygulamada giriş yapın. Tarih aralığı ve hedefi{" "}
          <span className="font-semibold text-slate-900">Hedef Takip</span> ekranından kaydedin.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className="rounded-xl border-2 border-slate-800 px-8 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-800 hover:text-white"
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
      className="fixed inset-0 flex flex-col overflow-auto bg-slate-100 text-slate-900"
      style={{ minHeight: "100dvh" }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1920px] flex-1 flex-col gap-6 px-6 py-6 md:gap-10 md:px-12 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-300 pb-4 md:pb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.35em] text-emerald-700 md:text-base">
              EKRAN1
            </p>
            <p className="mt-1 text-lg text-slate-600 md:text-xl">
              {formatDateTr(startDate)} — {formatDateTr(endDate)}
              {lastUpdated ? (
                <span className="ml-3 text-slate-500">· Son güncelleme {lastUpdated}</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
            <span className="hidden text-slate-500 sm:inline md:text-lg">Yenileme 30 sn</span>
            <button
              type="button"
              onClick={() => void requestFullscreen()}
              className="rounded-xl border-2 border-slate-400 bg-white px-5 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50 md:px-6 md:text-lg"
            >
              Tam ekran
            </button>
          </div>
        </header>

        {error ? (
          <p className="text-center text-2xl font-semibold text-red-600 md:text-3xl">{error}</p>
        ) : null}

        {loading && !lastUpdated ? (
          <p className="text-center text-2xl text-slate-500">Yükleniyor…</p>
        ) : null}

        <section className="flex flex-1 flex-col justify-center gap-6 md:gap-10">
          <h1 className="text-center text-4xl font-black uppercase tracking-tight text-slate-900 md:text-6xl lg:text-7xl xl:text-8xl">
            Genel İlerleme
          </h1>

          <div className="relative mx-auto w-full max-w-6xl">
            <div
              className="relative h-24 overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-200 shadow-[0_4px_40px_rgba(16,185,129,0.12)] md:h-32 lg:h-40"
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
                  className="font-black tabular-nums text-slate-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]"
                  style={{
                    fontSize: "clamp(2.5rem, 8vw, 6rem)",
                    textShadow: "0 0 8px rgba(255,255,255,0.95), 0 2px 4px rgba(0,0,0,0.25)",
                  }}
                >
                  %{genelPercent.toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-center text-xl font-medium text-slate-700 md:text-3xl lg:text-4xl">
            <span className="text-slate-500">Toplam hedef</span>{" "}
            <span className="font-bold text-slate-900">{target.toLocaleString("tr-TR")}</span>
            <span className="mx-3 text-slate-400 md:mx-6">/</span>
            <span className="text-slate-500">Gerçekleşen</span>{" "}
            <span className="font-bold text-emerald-600">{genelTamamlanan.toLocaleString("tr-TR")}</span>
          </p>
        </section>

        <section className="mt-auto grid grid-cols-2 gap-4 border-t border-slate-300 pt-6 sm:grid-cols-3 md:grid-cols-4 md:gap-5 md:pt-8 lg:grid-cols-5">
          {stageRows.map((row, idx) => (
            <div
              key={`${row.label}-${idx}`}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700 md:text-lg">{row.label}</span>
                <span className="tabular-nums text-lg font-bold text-slate-900 md:text-xl">
                  {row.pct.toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200 md:h-4">
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
