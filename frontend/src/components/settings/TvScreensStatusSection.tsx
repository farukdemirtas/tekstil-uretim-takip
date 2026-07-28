"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getScreenPresenceStatus, type ScreenPresenceStatusPayload } from "@/lib/api";

const REFRESH_MS = 15_000;

function formatRelative(iso: string | null, nowMs: number): string {
  if (!iso) return "Hiç açılmadı";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diffSec = Math.round((nowMs - ms) / 1000);
  if (diffSec < 10) return "Az önce";
  if (diffSec < 60) return `${diffSec} sn önce`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr} sa önce`;
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}

export default function TvScreensStatusSection() {
  const [data, setData] = useState<ScreenPresenceStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const result = await getScreenPresenceStatus();
      setData(result);
      setNowMs(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ekran durumu alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const onlineCount = data?.screens.filter((s) => s.online).length ?? 0;
  const totalCount = data?.screens.length ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">TV ekran durumu</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Her TV tarayıcısı yaklaşık 20 saniyede bir sinyal gönderir. Son sinyal{" "}
            {data?.offlineAfterSec ?? 60} saniyeden eskiyse ekran kapalı sayılır.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {onlineCount}/{totalCount} açık
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            Yenile
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="mt-6 text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(data?.screens ?? []).map((screen) => (
            <article
              key={screen.id}
              className={`rounded-lg border p-4 transition ${
                screen?.online
                  ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : "border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                        screen.online ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-400"
                      }`}
                      aria-hidden
                    />
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{screen.label}</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {screen.online ? "Açık" : "Kapalı"} · Son sinyal: {formatRelative(screen.lastSeenAt, nowMs)}
                  </p>
                </div>
                <Link
                  href={screen.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                >
                  Aç
                </Link>
              </div>

              {Array.isArray(screen.instances) && screen.instances.length > 0 ? (
                <ul className="mt-3 space-y-1.5 border-t border-slate-200/80 pt-3 text-xs dark:border-slate-600/80">
                  {screen.instances.map((inst) => (
                    <li key={inst.instanceId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-300">
                      <span
                        className={`font-medium ${inst.online ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}`}
                      >
                        {inst.online ? "● Canlı" : "○ Kapalı"}
                      </span>
                      <span>{formatClock(inst.lastSeenAt)}</span>
                      {inst.userAgent ? (
                        <span className="truncate text-slate-400" title={inst.userAgent}>
                          {inst.userAgent.slice(0, 48)}
                          {inst.userAgent.length > 48 ? "…" : ""}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 border-t border-slate-200/80 pt-3 text-xs text-slate-400 dark:border-slate-600/80">
                  Bu ekran henüz hiç açılmadı veya tarayıcı kapatıldı.
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {data?.checkedAt ? (
        <p className="mt-4 text-xs text-slate-400">
          Son kontrol: {formatClock(data.checkedAt)}
        </p>
      ) : null}
    </section>
  );
}
