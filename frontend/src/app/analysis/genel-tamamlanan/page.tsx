"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { setAuthToken } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import AnalysisSubnav from "@/components/analysis/AnalysisSubnav";
import GenelTamamlananChart from "@/components/analysis/GenelTamamlananChart";

export default function GenelTamamlananAnalysisPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("analysis")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-100/90 via-white to-slate-50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-24 -top-32 h-[24rem] w-[24rem] rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-600/15" />
        <div className="absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-600/10" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <header className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/85 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/75">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-teal-500 via-emerald-500 to-cyan-500" aria-hidden />
          <div className="relative flex flex-col gap-5 p-6 pl-7 md:flex-row md:items-start md:justify-between md:p-8 md:pl-10">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-700 ring-1 ring-teal-600/15 dark:bg-teal-950/50 dark:text-teal-300">
                  Analiz
                </span>
                <span className="text-[11px] font-medium text-slate-400">Üretim özeti</span>
              </div>
              <h1 className="mt-3 text-balance text-2xl font-bold tracking-tight md:text-3xl">
                Genel tamamlanan trendi
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Veri girişi günlük özetindeki <strong className="font-semibold text-slate-800 dark:text-slate-200">Genel tamamlanan</strong>{" "}
                değerinin günlük, haftalık ve aylık görünümü. Bölüm ve proses listesinden istediğiniz satırı seçebilirsiniz.
                Ek giriş adetleri dahildir.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/analysis"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Genel analiz
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-lg dark:from-teal-600 dark:to-emerald-600"
              >
                Üretim ekranı
              </Link>
            </div>
          </div>
        </header>

        <AnalysisSubnav />

        <GenelTamamlananChart pageMode />
      </div>
    </main>
  );
}
