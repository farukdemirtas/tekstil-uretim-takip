"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/I18nProvider";
import { deleteDensityReport, listDensityReports, setAuthToken, type DensityReportSummary } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";

export default function DensityRecordsPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [authorized, setAuthorized] = useState(false);
  const [records, setRecords] = useState<DensityReportSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshRecords() {
    setLoading(true);
    try {
      setRecords(await listDensityReports());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("density.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!isAdminRole() && !hasPermission("density")) {
      router.replace("/");
      return;
    }
    setAuthToken(token);
    setAuthorized(true);
    void refreshRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function onDeleteRecord(id: number) {
    if (!window.confirm(t("density.confirmDelete"))) return;
    setError(null);
    try {
      await deleteDensityReport(id);
      await refreshRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("density.saveFailed"));
    }
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.12),_transparent_55%),linear-gradient(to_bottom,#f8fafc,#eef2f7)] px-3 py-4 sm:px-6 sm:py-6 dark:bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.16),_transparent_50%),linear-gradient(to_bottom,#020617,#0f172a)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="overflow-hidden rounded-3xl border border-teal-700/20 bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-4 text-white shadow-[0_18px_50px_-20px_rgba(13,148,136,0.7)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-100">Density</p>
                <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{t("density.records")}</h1>
                <p className="truncate text-[11px] text-teal-50/85 sm:text-xs">{t("density.recordsSubtitle")}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-xl bg-white/15 p-0.5 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setLocale("tr")}
                  aria-pressed={locale === "tr"}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    locale === "tr" ? "bg-white text-teal-800 shadow-sm" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {t("density.langTr")}
                </button>
                <button
                  type="button"
                  onClick={() => setLocale("en")}
                  aria-pressed={locale === "en"}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    locale === "en" ? "bg-white text-teal-800 shadow-sm" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {t("density.langEn")}
                </button>
              </div>
              <Link
                href="/density"
                className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-teal-800 shadow-sm hover:bg-teal-50 sm:text-sm"
              >
                {t("density.openForm")}
              </Link>
            </div>
          </div>
        </header>

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/70 dark:border-slate-700/80 dark:bg-slate-900/85 dark:ring-slate-700/60">
          <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50/90 via-white to-white px-4 py-3.5 sm:px-5 dark:border-slate-800 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900">
            <h2 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-white">
              {t("density.records")}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t("density.recordsHint")}</p>
          </div>
          <div className="p-4 sm:p-5">
            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">…</p>
            ) : records.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("density.emptyRecords")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {records.map((row) => {
                  const title =
                    String(row.fileName || "").trim() ||
                    [row.brand, row.style, row.article, row.poNumber].filter(Boolean).join(" · ") ||
                    `#${row.id}`;
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {row.updatedAt}
                          {row.createdBy ? ` · ${t("density.createdBy")} ${row.createdBy}` : ""}
                          {row.boxType ? ` · ${row.boxType}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Link
                          href={`/density?id=${row.id}`}
                          className="rounded-xl bg-teal-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                        >
                          {t("density.loadRecord")}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void onDeleteRecord(row.id)}
                          className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 dark:border-rose-900 dark:text-rose-400"
                        >
                          {t("density.deleteRecord")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
