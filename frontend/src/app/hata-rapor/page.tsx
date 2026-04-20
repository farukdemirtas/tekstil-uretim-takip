"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getProduction, getDayProductMeta, setAuthToken } from "@/lib/api";
import type { ProductionRow, DayProductMeta } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { todayWeekdayIso } from "@/lib/businessCalendar";

/* ─── Sabitler ───────────────────────────────────────────── */
const SESSIONS  = 8;
const SAMPLES   = 7;
const MAX_TOTAL = SESSIONS * SAMPLES; // 56

/* ─── Tipler ─────────────────────────────────────────────── */
type KontrolRow = {
  workerId: number;
  name: string;
  process: string;
  team: string;
  hata: number[];
  note: string;
  manual?: boolean;
};

type StoredPayload = {
  kontrolData: Record<number, { hata: number[]; note: string }>;
  extraWorkers: { workerId: number; name: string; process: string; team: string }[];
};

/* ─── localStorage ───────────────────────────────────────── */
function storageKey(date: string) { return `proses_kontrol_v2_${date}`; }

function loadPayload(date: string): StoredPayload {
  try {
    const raw = window.localStorage.getItem(storageKey(date));
    if (!raw) return { kontrolData: {}, extraWorkers: [] };
    return JSON.parse(raw) as StoredPayload;
  } catch { return { kontrolData: {}, extraWorkers: [] }; }
}

/* ─── Yardımcılar ────────────────────────────────────────── */
function sumArr(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }
function pct(total: number, max = MAX_TOTAL) {
  return max === 0 ? "0.0" : ((total / max) * 100).toFixed(1);
}
function pctColor(p: number) {
  if (p === 0) return "text-emerald-600";
  if (p < 10)  return "text-amber-600";
  return "text-red-600";
}
function pctBg(p: number) {
  if (p === 0) return "bg-emerald-500";
  if (p < 10)  return "bg-amber-500";
  return "bg-red-500";
}

/* ══════════════════════════════════════════════════════════
   Sayfa
══════════════════════════════════════════════════════════ */
export default function HataRaporPage() {
  const router = useRouter();

  const [authorized,   setAuthorized]  = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayWeekdayIso);
  const [rows,         setRows]        = useState<KontrolRow[]>([]);
  const [dayMeta,      setDayMeta]     = useState<DayProductMeta | null>(null);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [savedDates,   setSavedDates]  = useState<string[]>([]);

  /* ── Auth ──────────────────────────────────────────────── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) { router.replace("/"); return; }
    if (!isAdminRole() && !hasPermission("hataRapor") && !hasPermission("prosesKontrol")) {
      router.replace("/");
      return;
    }
    setAuthToken(token);
    setAuthorized(true);

    // localStorage'daki kayıtlı tarihleri bul
    const dates: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("proses_kontrol_v2_")) {
        dates.push(k.replace("proses_kontrol_v2_", ""));
      }
    }
    dates.sort((a, b) => b.localeCompare(a));
    setSavedDates(dates);
  }, [router]);

  /* ── Veri yükle ────────────────────────────────────────── */
  useEffect(() => {
    if (!authorized) return;
    void loadData(selectedDate);
  }, [selectedDate, authorized]);

  async function loadData(date: string) {
    setLoading(true);
    setError(null);
    try {
      const [production, meta] = await Promise.allSettled([
        getProduction(date),
        getDayProductMeta(date),
      ]);
      setDayMeta(meta.status === "fulfilled" ? meta.value : null);
      const productionRows: ProductionRow[] = production.status === "fulfilled" ? production.value : [];
      const { kontrolData, extraWorkers } = loadPayload(date);

      const fromProduction: KontrolRow[] = productionRows.map((p) => {
        const saved = kontrolData[p.workerId];
        return {
          workerId: p.workerId,
          name:     p.name,
          process:  p.process,
          team:     p.team,
          hata:     saved?.hata?.length === SESSIONS ? saved.hata : Array<number>(SESSIONS).fill(0),
          note:     saved?.note ?? "",
        };
      });

      const manual: KontrolRow[] = (extraWorkers ?? []).map((w) => {
        const saved = kontrolData[w.workerId];
        return {
          ...w,
          hata:   saved?.hata?.length === SESSIONS ? saved.hata : Array<number>(SESSIONS).fill(0),
          note:   saved?.note ?? "",
          manual: true,
        };
      });

      setRows([...fromProduction, ...manual]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  /* ── Hesaplamalar ──────────────────────────────────────── */
  const totalErrors    = rows.reduce((acc, r) => acc + sumArr(r.hata), 0);
  const totalMaxErrors = rows.length * MAX_TOTAL;
  const overallPct     = totalMaxErrors > 0 ? (totalErrors / totalMaxErrors) * 100 : 0;
  const hatasizCount   = rows.filter((r) => sumArr(r.hata) === 0).length;
  const hatalıCount    = rows.length - hatasizCount;
  const kontrolEdilen  = rows.filter((r) => sumArr(r.hata) > 0 || rows.length > 0).length;

  const sessionTotals = Array(SESSIONS).fill(0).map((_, i) =>
    rows.reduce((acc, r) => acc + r.hata[i], 0)
  );
  const sessionMaxes = Array(SESSIONS).fill(0).map((_, i) =>
    Math.max(...rows.map((r) => r.hata[i]))
  );

  const sortedByError = [...rows].sort((a, b) => sumArr(b.hata) - sumArr(a.hata));
  const topHatalı     = sortedByError[0];

  /* ── Excel export ──────────────────────────────────────── */
  function exportExcel() {
    const wb    = XLSX.utils.book_new();
    const urunStr = [dayMeta?.productModel, dayMeta?.productName].filter(Boolean).join(" — ");

    /* Sayfa 1 — Personel Detay */
    const header1 = [
      "Sıra", "Ad Soyad", "Bölüm", "Proses",
      ...Array.from({ length: SESSIONS }, (_, i) => `Tur ${i + 1} H.A`),
      "Toplam Hata", "Hata %",
    ];
    const data1 = sortedByError.map((r, i) => {
      const tot = sumArr(r.hata);
      return [i + 1, r.name, r.team, r.process, ...r.hata, tot, `%${pct(tot)}`];
    });
    const ws1 = XLSX.utils.aoa_to_sheet([
      ["Tarih", selectedDate],
      ["Ürün",  urunStr || "—"],
      ["Toplam Personel", rows.length],
      ["Toplam Hata", totalErrors],
      ["Genel Hata Oranı", `%${overallPct.toFixed(1)}`],
      [],
      header1,
      ...data1,
    ]);
    ws1["!cols"] = [{ wch: 5 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, ...Array(SESSIONS).fill({ wch: 8 }), { wch: 12 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Personel Detay");

    /* Sayfa 2 — Tur Özeti */
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Tur", "Toplam Hata", "K.A (Toplam)", "Hata Oranı %"],
      ...sessionTotals.map((t, i) => [
        `${i + 1}. Tur`,
        t,
        rows.length * SAMPLES,
        `%${rows.length > 0 ? ((t / (rows.length * SAMPLES)) * 100).toFixed(1) : "0.0"}`,
      ]),
    ]);
    ws2["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Tur Özeti");

    XLSX.writeFile(wb, `hata_rapor_${selectedDate}.xlsx`);
  }

  /* ── Render ────────────────────────────────────────────── */
  if (!authorized) return null;

  const urunLabel = [dayMeta?.productModel, dayMeta?.productName].filter(Boolean).join(" — ");

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5">

      {/* ─── Üst Bar ─────────────────────────────────────── */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/proses-kontrol"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Hata Rapor Analiz</h1>
              <p className="text-xs text-slate-500">
                Günlük numune kontrol sonuçları · personel &amp; tur bazlı analiz
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={exportExcel}
            disabled={rows.length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/>
            </svg>
            Excel İndir
          </button>
        </div>

        {/* Tarih + Ürün */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tarih</label>
            <WeekdayDatePicker value={selectedDate} onChange={setSelectedDate} />
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Çalışılan Ürün</label>
            <div className="flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {urunLabel
                ? <span className="font-medium text-slate-800">{urunLabel}</span>
                : <span className="text-slate-400">—</span>
              }
            </div>
          </div>

          {/* Kayıtlı tarihler hızlı seçim */}
          {savedDates.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Kayıtlı Günler
              </label>
              <div className="flex flex-wrap gap-1.5">
                {savedDates.slice(0, 10).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      d === selectedDate
                        ? "border-slate-700 bg-slate-800 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Hata / Yükleniyor ───────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">⚠ {error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500">Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="text-slate-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V8l-5-5H5a2 2 0 00-2 2v13a2 2 0 002 2z"/>
          </svg>
          <p>Bu tarihte kontrol kaydı bulunamadı.</p>
          <p className="text-xs">Önce Proses Kontrol sayfasından veri girişi yapın.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">

          {/* ─── Özet Kartları ─────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard
              label="Toplam Personel"
              value={String(rows.length)}
              sub="kontrol edildi"
              color="slate"
            />
            <SummaryCard
              label="Toplam Hata"
              value={String(totalErrors)}
              sub={`/ ${totalMaxErrors} numune`}
              color={totalErrors === 0 ? "emerald" : totalErrors < 10 ? "amber" : "red"}
            />
            <SummaryCard
              label="Genel Hata Oranı"
              value={`%${overallPct.toFixed(1)}`}
              sub={`${rows.length} personel · ${SESSIONS} tur`}
              color={overallPct === 0 ? "emerald" : overallPct < 10 ? "amber" : "red"}
            />
            <SummaryCard
              label="Hatasız Personel"
              value={String(hatasizCount)}
              sub={`${hatalıCount} personelde hata var`}
              color="emerald"
            />
            <SummaryCard
              label="En Çok Hata"
              value={topHatalı && sumArr(topHatalı.hata) > 0 ? String(sumArr(topHatalı.hata)) : "—"}
              sub={topHatalı && sumArr(topHatalı.hata) > 0 ? topHatalı.name : "Hata yok"}
              color={topHatalı && sumArr(topHatalı.hata) > 0 ? "red" : "emerald"}
            />
          </div>

          {/* ─── Tur Bazlı Özet ────────────────────────── */}
          <Section title="Tur Bazlı Hata Özeti" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          }>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-4 py-2.5 text-left font-semibold">Tur</th>
                    <th className="px-4 py-2.5 text-center font-semibold">K.A (Toplam)</th>
                    <th className="px-4 py-2.5 text-center font-semibold">H.A (Toplam)</th>
                    <th className="px-4 py-2.5 text-center font-semibold">En Yüksek</th>
                    <th className="px-4 py-2.5 text-center font-semibold">Hata Oranı</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Görsel</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionTotals.map((t, i) => {
                    const ka   = rows.length * SAMPLES;
                    const p    = ka > 0 ? (t / ka) * 100 : 0;
                    const barW = Math.round(p * 2); // max %50 → 100px wide
                    return (
                      <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{i + 1}. Tur</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{ka}</td>
                        <td className={`px-4 py-2.5 text-center font-bold ${pctColor(p)}`}>{t}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{sessionMaxes[i]}</td>
                        <td className={`px-4 py-2.5 text-center font-bold tabular-nums ${pctColor(p)}`}>
                          %{p.toFixed(1)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex h-5 w-40 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${pctBg(p)}`}
                              style={{ width: `${Math.min(100, barW * 2)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ─── Personel Bazlı Tablo ───────────────────── */}
          <Section title="Personel Bazlı Hata Analizi" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          }>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-2 py-2.5 text-center font-bold">Sıra</th>
                    <th className="px-3 py-2.5 text-left font-bold">Ad Soyad</th>
                    <th className="px-2 py-2.5 text-left font-bold">Bölüm</th>
                    <th className="px-2 py-2.5 text-left font-bold">Proses</th>
                    {Array.from({ length: SESSIONS }, (_, i) => (
                      <th key={i} className="border-l border-slate-700 px-1 py-2.5 text-center font-bold">{i + 1}</th>
                    ))}
                    <th className="border-l border-slate-700 px-2 py-2.5 text-center font-bold">Toplam</th>
                    <th className="px-2 py-2.5 text-center font-bold">%</th>
                    <th className="px-3 py-2.5 text-left font-bold">Görsel</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByError.map((row, idx) => {
                    const total = sumArr(row.hata);
                    const p     = parseFloat(pct(total));
                    return (
                      <tr
                        key={row.workerId}
                        className={`border-b border-slate-200 align-middle transition-colors ${
                          total > 0 ? "hover:bg-red-50/30" : "hover:bg-emerald-50/30"
                        }`}
                      >
                        <td className="px-2 py-2 text-center tabular-nums text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {row.name}
                          {row.manual && (
                            <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold text-violet-600">EL</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-500">{row.team}</td>
                        <td className="px-2 py-2 text-slate-500">{row.process}</td>
                        {row.hata.map((h, i) => (
                          <td
                            key={i}
                            className={`border-l border-slate-100 px-1 py-2 text-center tabular-nums font-semibold ${
                              h > 0 ? "text-rose-600" : "text-slate-300"
                            }`}
                          >
                            {h > 0 ? h : "—"}
                          </td>
                        ))}
                        <td className={`border-l border-slate-200 px-2 py-2 text-center text-sm font-bold tabular-nums ${pctColor(p)}`}>
                          {total}
                        </td>
                        <td className={`px-2 py-2 text-center text-sm font-bold tabular-nums ${pctColor(p)}`}>
                          %{pct(total)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex h-4 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${total > 0 ? pctBg(p) : "bg-emerald-400"}`}
                              style={{ width: total > 0 ? `${Math.min(100, (total / MAX_TOTAL) * 100)}%` : "100%" }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Toplam satırı */}
                <tfoot>
                  <tr className="bg-slate-800 text-white">
                    <td colSpan={4} className="px-3 py-2.5 text-sm font-bold">TOPLAM</td>
                    {sessionTotals.map((t, i) => (
                      <td key={i} className={`border-l border-slate-700 px-1 py-2.5 text-center text-xs font-bold ${
                        t > 0 ? "text-amber-300" : "text-slate-500"
                      }`}>
                        {t > 0 ? t : "—"}
                      </td>
                    ))}
                    <td className="border-l border-slate-700 px-2 py-2.5 text-center text-sm font-bold text-amber-300">{totalErrors}</td>
                    <td className={`px-2 py-2.5 text-center text-sm font-bold ${pctColor(overallPct)}`}>
                      %{overallPct.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          {/* ─── Hatalı Personel Sıralama ───────────────── */}
          {hatalıCount > 0 && (
            <Section title="Hata Sıralaması (Yüksekten Düşüğe)" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/>
              </svg>
            }>
              <div className="flex flex-col gap-2 p-1">
                {sortedByError.filter((r) => sumArr(r.hata) > 0).map((row, idx) => {
                  const total = sumArr(row.hata);
                  const p     = parseFloat(pct(total));
                  const barPct = Math.min(100, (total / MAX_TOTAL) * 100);
                  return (
                    <div key={row.workerId} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                      <span className="w-6 text-center text-sm font-bold text-slate-400">{idx + 1}</span>
                      <div className="w-36 shrink-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                        <p className="truncate text-xs text-slate-400">{row.team} · {row.process}</p>
                      </div>
                      <div className="flex-1">
                        <div className="flex h-5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`flex h-full items-center justify-end overflow-hidden rounded-full pr-1.5 text-[10px] font-bold text-white transition-all ${pctBg(p)}`}
                            style={{ width: `${Math.max(barPct, 8)}%` }}
                          >
                            {barPct > 15 ? total : ""}
                          </div>
                        </div>
                      </div>
                      <span className={`w-14 text-right text-sm font-bold tabular-nums ${pctColor(p)}`}>
                        %{pct(total)}
                      </span>
                      <span className={`w-10 text-right text-sm font-bold tabular-nums ${pctColor(p)}`}>
                        {total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

        </div>
      )}
    </div>
  );
}

/* ─── Alt Bileşenler ─────────────────────────────────────── */

function SummaryCard({
  label, value, sub, color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "slate" | "emerald" | "amber" | "red";
}) {
  const border = {
    slate:   "border-slate-200",
    emerald: "border-emerald-200",
    amber:   "border-amber-200",
    red:     "border-red-200",
  }[color];
  const valueCls = {
    slate:   "text-slate-800",
    emerald: "text-emerald-600",
    amber:   "text-amber-600",
    red:     "text-red-600",
  }[color];
  return (
    <div className={`rounded-2xl border ${border} bg-white px-4 py-3 shadow-sm`}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function Section({
  title, icon, children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-slate-600">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
