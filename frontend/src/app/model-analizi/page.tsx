"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  getModelAnalysisReport,
  getTeams,
  listProductModels,
  setAuthToken,
  type ModelAnalysisResponse,
  type ProductModelListItem,
} from "@/lib/api";
import { addDaysToIso, clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { hasPermission } from "@/lib/permissions";

function formatIsoTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function ModelAnaliziPage() {
  const [productModels, setProductModels] = useState<ProductModelListItem[]>([]);
  const [selectedModelCode, setSelectedModelCode] = useState("");
  const [endDate, setEndDate] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [startDate, setStartDate] = useState(() => clampToWeekdayIso(addDaysToIso(todayWeekdayIso(), -365)));
  const [teamLabels, setTeamLabels] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ModelAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [listErr, setListErr] = useState("");

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("modelAnalizi")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    void Promise.all([listProductModels(), getTeams()])
      .then(([mds, teams]) => {
        setProductModels(mds);
        setTeamLabels(Object.fromEntries(teams.map((t) => [t.code, t.label])));
        setSelectedModelCode(mds[0]?.modelCode ?? "");
      })
      .catch(() => setListErr("Model veya bölüm listesi yüklenemedi."));
  }, []);

  const selectedModelId = useMemo(
    () => productModels.find((m) => m.modelCode === selectedModelCode)?.id ?? null,
    [productModels, selectedModelCode],
  );

  useEffect(() => {
    if (!selectedModelCode || selectedModelId == null) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadErr("");
    void getModelAnalysisReport({
      modelId: selectedModelId,
      modelCode: selectedModelCode,
      startDate,
      endDate,
    })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null);
          setLoadErr("Rapor alınamadı. Tarih aralığı ve modeli kontrol edin.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModelCode, selectedModelId, startDate, endDate]);

  const selectedLabel =
    productModels.find((m) => m.modelCode === selectedModelCode)?.productName?.trim() || selectedModelCode;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 text-slate-800 dark:text-slate-100">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Model Analizi</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Seçilen ürün modeline göre günlük ürün kaydı olan iş günlerinde{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">genel tamamlanan</strong> (hedef takip
            formülü) ve <strong className="font-semibold text-slate-800 dark:text-slate-200">bölüm + proses</strong>{" "}
            bazında üretilen adetleri görüntüleyin.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Üretim ekranı
        </Link>
      </header>

      {listErr ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {listErr}
        </p>
      ) : null}

      <section className="surface-card mb-6 space-y-4 p-5 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Filtreler</h2>
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ürün modeli
            </span>
            <select
              value={selectedModelCode}
              onChange={(e) => setSelectedModelCode(e.target.value)}
              disabled={productModels.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {productModels.map((m) => (
                <option key={m.id} value={m.modelCode}>
                  {m.productName?.trim() ? m.productName : m.modelCode}
                  {m.modelCode && m.productName?.trim() ? ` (${m.modelCode})` : ""}
                </option>
              ))}
            </select>
          </label>
          <WeekdayDatePicker
            label="Başlangıç (iş günü)"
            value={startDate}
            onChange={(v) => setStartDate(clampToWeekdayIso(v))}
            className="min-w-[200px]"
          />
          <WeekdayDatePicker
            label="Bitiş (iş günü)"
            value={endDate}
            onChange={(v) => setEndDate(clampToWeekdayIso(v))}
            className="min-w-[200px]"
          />
        </div>
        {productModels.length === 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">Tanımlı ürün modeli yok.</p>
        ) : null}
      </section>

      {loadErr ? (
        <p className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {loadErr}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Rapor yükleniyor…</p>
      ) : report ? (
        <>
          <section className="surface-card mb-6 p-5 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Özet</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{selectedLabel}</span>
              {report.productName && report.modelCode ? (
                <span className="text-slate-500"> ({report.modelCode})</span>
              ) : null}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/40">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Model kayıtlı iş günü
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {report.workDayCount}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/40">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Genel tamamlanan (toplam)
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
                  {report.completedGenelTotal.toLocaleString("tr-TR")} adet
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/40">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Proses üretim toplamı
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {report.totalProsesAdetAllDays.toLocaleString("tr-TR")} adet
                </dd>
                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  Tüm bölüm+proses satırlarının günlük toplamlarının özeti (genel tamamlanan ile aynı değil).
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/40">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Dönem
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {formatIsoTr(report.startDate)} — {formatIsoTr(report.endDate)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="surface-card mb-6 p-5 dark:border-slate-700">
            <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">Gün bazında</h2>
            {report.days.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Bu dönemde seçilen modele ait günlük ürün kaydı yok.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                      <th className="py-2.5 px-3 font-medium">Tarih</th>
                      <th className="py-2.5 px-3 text-right font-medium">Genel tamamlanan</th>
                      <th className="py-2.5 px-3 text-right font-medium">Proses üretim toplamı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.days.map((day) => (
                      <Fragment key={day.date}>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                            {formatIsoTr(day.date)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-teal-700 dark:text-teal-400">
                            {day.genelTamamlanan.toLocaleString("tr-TR")}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {day.totalProsesAdet.toLocaleString("tr-TR")}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/50">
                          <td colSpan={3} className="px-3 py-2">
                            {day.lines.length === 0 ? (
                              <span className="text-xs text-slate-500">Bu gün için proses satırı yok.</span>
                            ) : (
                              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                {day.lines.map((ln) => (
                                  <li key={`${day.date}-${ln.teamCode}-${ln.processName}`}>
                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                      {teamLabels[ln.teamCode] ?? ln.teamCode}
                                    </span>
                                    {ln.processName ? (
                                      <span className="text-slate-500"> · {ln.processName}</span>
                                    ) : null}
                                    :{" "}
                                    <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                                      {ln.adet.toLocaleString("tr-TR")}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="surface-card mb-6 p-5 dark:border-slate-700">
            <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">Proses özeti (dönem)</h2>
            {report.processTotals.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Veri yok.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                      <th className="py-2.5 px-3 font-medium">Bölüm</th>
                      <th className="py-2.5 px-3 font-medium">Proses</th>
                      <th className="py-2.5 px-3 text-right font-medium">Toplam adet</th>
                      <th className="py-2.5 px-3 text-right font-medium">Üretim olan iş günü</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.processTotals.map((row) => (
                      <tr
                        key={`${row.teamCode}-${row.processName}`}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-2.5 px-3">{teamLabels[row.teamCode] ?? row.teamCode}</td>
                        <td className="py-2.5 px-3">{row.processName || "—"}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                          {row.adet.toLocaleString("tr-TR")}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {row.activeDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
