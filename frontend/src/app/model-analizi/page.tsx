"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getJobCalcModelWorkerStats,
  getModelAnalysisReport,
  getTeams,
  listProductModels,
  setAuthToken,
  type JobCalcModelWorkerStatsResponse,
  type ModelAnalysisResponse,
  type ModelAnalysisProcessTotal,
  type ProductModelListItem,
} from "@/lib/api";
import { addDaysToIso, clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { downloadModelAnaliziPdf } from "@/lib/exportModelAnaliziPdf";
import { hasPermission } from "@/lib/permissions";

function formatIsoTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function formatPctOneDecimal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `%${(Math.round(n * 10) / 10).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
}

/** Genel tamamlanan ÷ proses satır toplamı (hat dengesi / hizalama). */
function alignmentPct(genel: number, prosesSum: number): number | null {
  if (prosesSum <= 0) return null;
  return Math.min(999.9, (100 * genel) / prosesSum);
}

function processRowEfficiency(
  row: ModelAnalysisProcessTotal,
  report: ModelAnalysisResponse
): number | null {
  const { completedGenelTotal, workDayCount } = report;
  if (workDayCount <= 0 || row.activeDays <= 0) return null;
  const lineAvg = completedGenelTotal / workDayCount;
  const stationAvg = row.adet / row.activeDays;
  if (lineAvg <= 0) return null;
  return (100 * stationAvg) / lineAvg;
}

export default function ModelAnaliziPage() {
  const [productModels, setProductModels] = useState<ProductModelListItem[]>([]);
  const [selectedModelCode, setSelectedModelCode] = useState("");
  const [endDate, setEndDate] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [startDate, setStartDate] = useState(() => clampToWeekdayIso(addDaysToIso(todayWeekdayIso(), -365)));
  const [teamLabels, setTeamLabels] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ModelAnalysisResponse | null>(null);
  const [effStats, setEffStats] = useState<JobCalcModelWorkerStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [listErr, setListErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

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
      setEffStats(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadErr("");
    void Promise.all([
      getModelAnalysisReport({
        modelId: selectedModelId,
        modelCode: selectedModelCode,
        startDate,
        endDate,
      }),
      getJobCalcModelWorkerStats({
        modelId: selectedModelId,
        modelCode: selectedModelCode,
        startDate,
        endDate,
      }).catch(() => null),
    ])
      .then(([data, eff]) => {
        if (!cancelled) {
          setReport(data);
          setEffStats(eff);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null);
          setEffStats(null);
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

  const periodAlignment = report
    ? alignmentPct(report.completedGenelTotal, report.totalProsesAdetAllDays)
    : null;

  const dailyAlignmentAvg = useMemo(() => {
    if (!report?.days.length) return null;
    const pcts = report.days
      .map((d) => alignmentPct(d.genelTamamlanan, d.totalProsesAdet))
      .filter((x): x is number => x != null);
    if (!pcts.length) return null;
    return pcts.reduce((a, b) => a + b, 0) / pcts.length;
  }, [report]);

  const avgDailyGenel =
    report && report.workDayCount > 0 ? report.completedGenelTotal / report.workDayCount : null;

  async function handleDownloadPdf() {
    if (!report) return;
    setPdfBusy(true);
    try {
      await downloadModelAnaliziPdf({
        report,
        teamLabels,
        modelTitle: selectedLabel,
        effStats,
      });
    } catch {
      /* iptal / tarayıcı */
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 text-slate-800 dark:text-slate-100">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Model Analizi</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Seçilen ürün modeline göre günlük ürün kaydı olan iş günlerinde{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">genel tamamlanan</strong> (hedef takip
            formülü), <strong className="font-semibold text-slate-800 dark:text-slate-200">personel verimliliği</strong> ve{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">bölüm + proses</strong> bazında üretimi
            görüntüleyin.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={!report || loading || pdfBusy}
            onClick={() => void handleDownloadPdf()}
            className="rounded-lg border border-teal-600/80 bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {pdfBusy ? "PDF hazırlanıyor…" : "PDF indir"}
          </button>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Üretim ekranı
          </Link>
        </div>
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
          <section className="surface-card relative mb-6 overflow-hidden p-5 dark:border-slate-700">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-600"
              aria-hidden
            />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Özet</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{selectedLabel}</span>
              {report.productName && report.modelCode ? (
                <span className="text-slate-500"> ({report.modelCode})</span>
              ) : null}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 shadow-sm dark:border-slate-600 dark:bg-slate-800/40">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Model kayıtlı iş günü
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {report.workDayCount}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 shadow-sm dark:border-slate-600 dark:bg-slate-800/40">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Genel tamamlanan (toplam)
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
                  {report.completedGenelTotal.toLocaleString("tr-TR")} adet
                </dd>
              </div>
              <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-3 shadow-sm dark:border-emerald-800/50 dark:from-emerald-950/35 dark:to-slate-900/80">
                <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  Ortalama günlük üretim
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                  {avgDailyGenel != null
                    ? `${avgDailyGenel.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 0 })} adet/gün`
                    : "—"}
                </dd>
                <p className="mt-1 text-[11px] leading-snug text-emerald-900/75 dark:text-emerald-200/80">
                  Genel tamamlanan toplamının iş gününe bölümü.
                </p>
              </div>
            </dl>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white px-4 py-3 shadow-sm dark:border-teal-800/50 dark:from-teal-950/35 dark:to-slate-900/80">
                <dt className="text-xs font-medium uppercase tracking-wide text-teal-800 dark:text-teal-300">
                  Ortalama personel verimliliği
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-teal-800 dark:text-teal-200">
                  {effStats?.overallAvgEfficiencyPercent != null
                    ? formatPctOneDecimal(effStats.overallAvgEfficiencyPercent)
                    : "—"}
                </dd>
                <p className="mt-1 text-[11px] leading-snug text-teal-900/80 dark:text-teal-200/80">
                  Bu dönem ve modelde, dk hedefine göre hesaplanan personel ortalaması (İş Hesaplama ile aynı kaynak).
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 shadow-sm dark:border-slate-600 dark:bg-slate-800/40">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Hat hizalaması (dönem)
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatPctOneDecimal(periodAlignment)}
                </dd>
                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  Genel tamamlanan ÷ proses satır toplamı. Günlük ort.: {formatPctOneDecimal(dailyAlignmentAvg)}.
                </p>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Dönem:{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {formatIsoTr(report.startDate)} — {formatIsoTr(report.endDate)}
              </span>
            </p>
          </section>

          <div className="mb-6 grid gap-5 lg:grid-cols-2">
            <section className="surface-card flex h-full flex-col p-5 dark:border-slate-700">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Gün bazında</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Genel tamamlanan, hizalama ve proses kırılımı
                  </p>
                </div>
              </div>
              {report.days.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Bu dönemde seçilen modele ait günlük ürün kaydı yok.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {report.days.map((day) => {
                    const ap = alignmentPct(day.genelTamamlanan, day.totalProsesAdet);
                    const barW = ap == null ? 0 : Math.min(100, ap);
                    return (
                      <li
                        key={day.date}
                        className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-950/80"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {formatIsoTr(day.date)}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Hizalama{" "}
                            <span className="tabular-nums text-slate-800 dark:text-slate-200">
                              {formatPctOneDecimal(ap)}
                            </span>
                          </span>
                        </div>
                        <div className="mt-3">
                          <div className="rounded-xl bg-teal-500/10 px-3 py-2 dark:bg-teal-500/15">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                              Genel tamamlanan
                            </p>
                            <p className="mt-0.5 text-base font-bold tabular-nums text-teal-900 dark:text-teal-100">
                              {day.genelTamamlanan.toLocaleString("tr-TR")} adet
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] dark:from-teal-400 dark:to-emerald-400"
                            style={{ width: `${barW}%` }}
                            title={ap != null ? `${ap.toFixed(1)}%` : undefined}
                          />
                        </div>
                        <details className="mt-3 group">
                          <summary className="cursor-pointer list-none text-xs font-medium text-teal-700 hover:underline dark:text-teal-400 [&::-webkit-details-marker]:hidden">
                            <span className="underline-offset-2 group-open:font-semibold">Proses satırları</span>
                          </summary>
                          <div className="mt-2 border-t border-slate-200/80 pt-2 dark:border-slate-700">
                            {day.lines.length === 0 ? (
                              <span className="text-xs text-slate-500">Bu gün için proses satırı yok.</span>
                            ) : (
                              <ul className="space-y-1.5 text-xs">
                                {day.lines.map((ln) => (
                                  <li
                                    key={`${day.date}-${ln.teamCode}-${ln.processName}`}
                                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white/60 px-2 py-1.5 dark:bg-slate-900/40"
                                  >
                                    <span className="text-slate-700 dark:text-slate-200">
                                      <span className="font-medium">{teamLabels[ln.teamCode] ?? ln.teamCode}</span>
                                      {ln.processName ? (
                                        <span className="text-slate-500"> · {ln.processName}</span>
                                      ) : null}
                                    </span>
                                    <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                                      {ln.adet.toLocaleString("tr-TR")}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="surface-card flex h-full flex-col p-5 dark:border-slate-700">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Proses özeti (dönem)</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Aktif günlük ortalama, hattın günlük genel ortalamasına göre yaklaşık verimlilik; toplam adet alt satırda.
                </p>
              </div>
              {report.processTotals.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Veri yok.</p>
              ) : (
                <div className="rounded-xl border border-slate-200/90 dark:border-slate-700">
                  <table className="w-full min-w-[360px] border-collapse text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-400">
                      <tr>
                        <th className="py-3 pl-3 pr-2 font-medium">Bölüm</th>
                        <th className="py-3 pr-2 font-medium">Proses</th>
                        <th className="py-3 pr-3 text-right font-medium">Verimlilik</th>
                        <th className="py-3 pr-3 text-right font-medium">İş günü</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.processTotals.map((row, idx) => {
                        const eff = processRowEfficiency(row, report);
                        return (
                          <tr
                            key={`${row.teamCode}-${row.processName}`}
                            className={
                              idx % 2 === 0
                                ? "border-b border-slate-100 bg-white/80 dark:border-slate-800 dark:bg-slate-900/30"
                                : "border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/20"
                            }
                          >
                            <td className="py-3 pl-3 pr-2 align-top">
                              {teamLabels[row.teamCode] ?? row.teamCode}
                            </td>
                            <td className="py-3 pr-2 align-top">{row.processName || "—"}</td>
                            <td className="py-3 pr-3 text-right align-top">
                              <span className="font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                                {formatPctOneDecimal(eff)}
                              </span>
                              <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                                Σ {row.adet.toLocaleString("tr-TR")} adet
                              </p>
                            </td>
                            <td className="py-3 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                              {row.activeDays}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
