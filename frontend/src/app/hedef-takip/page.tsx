"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHedefTakipStageTotals, setAuthToken } from "@/lib/api";
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
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/* localStorage'a yaz — effect dışında, kullanıcı aksiyonlarında çağrılır */
function persistSettings(target: number, startDate: string, endDate: string, rangeMode: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ target, startDate, endDate, rangeMode }));
  } catch { /* ignore */ }
}

export default function HedefTakip() {
  const [target, setTarget]       = useState<number>(5000);
  const [sagOn, setSagOn]         = useState<number>(0);
  const [solOn, setSolOn]         = useState<number>(0);
  const [yaka, setYaka]           = useState<number>(0);
  const [arka, setArka]           = useState<number>(0);
  const [bitim, setBitim]         = useState<number>(0);
  const [startDate, setStartDate] = useState<string>(todayStr());
  const [endDate, setEndDate]     = useState<string>(todayStr());
  const [rangeLoading, setRangeLoading] = useState<boolean>(false);
  const [rangeError, setRangeError]     = useState<string>("");
  const [rangeMode, setRangeMode]       = useState<boolean>(false);
  const [lastUpdated, setLastUpdated]   = useState<string>("");

  /* Otomatik yenileme zamanlayıcısı */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Sayfa yüklenince localStorage'dan ayarları geri yükle ─── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("hedefTakip")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw) as {
        target?: number;
        startDate?: string;
        endDate?: string;
        rangeMode?: boolean;
      };

      const t  = Number(saved.target) || 5000;
      const sd = saved.startDate || todayStr();
      const ed = saved.endDate   || todayStr();
      const rm = Boolean(saved.rangeMode);

      setTarget(t);
      setStartDate(sd);
      setEndDate(ed);

      /* Tarih aralığı modu kayıtlıysa hemen veri çek */
      if (rm) {
        setRangeMode(true);
        void fetchRangeData(sd, ed, false);
      }
    } catch { /* ignore */ }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Otomatik yenileme: rangeMode aktifken 30 sn'de bir veri çek ─── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!rangeMode) return;

    timerRef.current = setInterval(() => {
      void fetchRangeData(startDate, endDate, true);
    }, AUTO_REFRESH_MS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMode, startDate, endDate]);

  /* ─── API'den tarih aralığı verilerini çek ─── */
  async function fetchRangeData(start: string, end: string, silent: boolean) {
    if (!silent) setRangeLoading(true);
    setRangeError("");
    try {
      const totals = await getHedefTakipStageTotals(start, end);
      setSagOn(totals.SAG_ON);
      setSolOn(totals.SOL_ON);
      setYaka(totals.YAKA_HAZIRLIK);
      setArka(totals.ARKA_HAZIRLIK);
      setBitim(totals.BITIM);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch {
      if (!silent) setRangeError("Veriler alınamadı. Lütfen bağlantıyı kontrol edin.");
    } finally {
      if (!silent) setRangeLoading(false);
    }
  }

  /* ─── "Verileri Getir" butonuna basıldığında ─── */
  async function handleFetchRange() {
    if (!startDate || !endDate) { setRangeError("Lütfen başlangıç ve bitiş tarihi seçin."); return; }
    if (startDate > endDate)    { setRangeError("Başlangıç tarihi bitiş tarihinden büyük olamaz."); return; }

    await fetchRangeData(startDate, endDate, false);
    setRangeMode(true);
    /* Tarih ve mod başarıyla uygulandıktan sonra kaydet */
    persistSettings(target, startDate, endDate, true);
  }

  /* ─── Input onChange yardımcıları — değişikliği anında localStorage'a yaz ─── */
  function handleTargetChange(value: string) {
    const n = Number(value);
    const t = Number.isFinite(n) && n >= 0 ? n : 0;
    setTarget(t);
    persistSettings(t, startDate, endDate, rangeMode);
  }

  function handleStartDateChange(value: string) {
    setStartDate(value);
    persistSettings(target, value, endDate, rangeMode);
  }

  function handleEndDateChange(value: string) {
    setEndDate(value);
    persistSettings(target, startDate, value, rangeMode);
  }

  /* ─── Hesaplamalar ─── */
  const genelTamamlanan = useMemo(() => Math.min(sagOn, solOn, yaka, arka, bitim), [sagOn, solOn, yaka, arka, bitim]);
  const sagOnKalan  = useMemo(() => Math.max(0, target - sagOn),           [target, sagOn]);
  const solOnKalan  = useMemo(() => Math.max(0, target - solOn),           [target, solOn]);
  const yakaKalan   = useMemo(() => Math.max(0, target - yaka),            [target, yaka]);
  const arkaKalan   = useMemo(() => Math.max(0, target - arka),            [target, arka]);
  const bitimKalan  = useMemo(() => Math.max(0, target - bitim),           [target, bitim]);
  const genelKalan  = useMemo(() => Math.max(0, target - genelTamamlanan), [target, genelTamamlanan]);
  const sagOnPercent  = useMemo(() => calcPercent(sagOn,           target), [sagOn,           target]);
  const solOnPercent  = useMemo(() => calcPercent(solOn,           target), [solOn,           target]);
  const yakaPercent   = useMemo(() => calcPercent(yaka,            target), [yaka,            target]);
  const arkaPercent   = useMemo(() => calcPercent(arka,            target), [arka,            target]);
  const bitimPercent  = useMemo(() => calcPercent(bitim,           target), [bitim,           target]);
  const genelPercent  = useMemo(() => calcPercent(genelTamamlanan, target), [genelTamamlanan, target]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-4 md:p-8">

      {/* ── Başlık ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Hedef Takip</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Hedefe göre her aşamanın ilerlemesini ve genel ilerlemeyi takip edin.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link
              href="/ekran1"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-emerald-600/50 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              EKRAN1
            </Link>
            <Link
              href="/ekran2"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-teal-600/50 bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              EKRAN2
            </Link>
            <Link
              href="/"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Üretim Ekranına Dön
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Hedef adet */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
            <label className="text-sm font-medium">Toplam Hedef Adet</label>
            <input
              type="number"
              min={0}
              step={1}
              value={target}
              onChange={(e) => handleTargetChange(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-400"
            />
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Sayfa yenilenince korunur</div>
          </div>

          {/* Genel özet */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Genel Tamamlanan</span>
              <span className="text-sm font-semibold">{genelTamamlanan}</span>
            </div>
            <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">Genel ilerleme</div>
            <div className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{genelPercent.toFixed(1)}%</div>
          </div>

          {/* Aktif filtre göstergesi */}
          {rangeMode && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/20">
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Aktif Filtre</div>
              <div className="mt-1 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                {formatDate(startDate)} – {formatDate(endDate)}
              </div>
              {lastUpdated && (
                <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Son güncelleme: {lastUpdated}</div>
              )}
              <div className="mt-1 text-xs text-emerald-500 dark:text-emerald-500">Her 30 sn otomatik yenilenir</div>
            </div>
          )}
        </div>
      </section>

      {/* ── Tarih Aralığı Filtresi ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-base font-semibold">Tarih Aralığı Filtresi</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Belirli tarihler arasındaki toplam üretim verisini çekin. Tarihler ve hedef sayfa yenilenince korunur.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Başlangıç Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Bitiş Tarihi</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-400"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleFetchRange()}
            disabled={rangeLoading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {rangeLoading ? "Yükleniyor..." : "Verileri Getir"}
          </button>
          {rangeMode && (
            <button
              type="button"
              onClick={() => void fetchRangeData(startDate, endDate, false)}
              disabled={rangeLoading}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              Yenile
            </button>
          )}
        </div>
        {rangeError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{rangeError}</p>}
      </section>

      {/* ── Aşama Kartları ── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProgressCard label="Sağ Ön"        value={sagOn} percent={sagOnPercent} color="from-emerald-500 to-emerald-600" target={target} remaining={sagOnKalan} />
        <ProgressCard label="Sol Ön"        value={solOn} percent={solOnPercent} color="from-sky-500 to-sky-600"         target={target} remaining={solOnKalan} />
        <ProgressCard label="Yaka Hazırlık" value={yaka}  percent={yakaPercent}  color="from-violet-500 to-violet-600"  target={target} remaining={yakaKalan}  />
        <ProgressCard label="Arka Hazırlık" value={arka}  percent={arkaPercent}  color="from-amber-500 to-amber-600"    target={target} remaining={arkaKalan}  />
        <ProgressCard label="Bitim" value={bitim} percent={bitimPercent} color="from-rose-500 to-rose-600"      target={target} remaining={bitimKalan} />

        {/* Genel İlerleme */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Genel İlerleme</h2>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 dark:text-slate-400">Yüzde</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">{genelPercent.toFixed(1)}%</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700"
                style={{ width: `${genelPercent}%` }}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
            <span>Hedef: <span className="font-semibold text-slate-900 dark:text-slate-100">{target}</span></span>
            <span>Tamamlanan: <span className="font-semibold text-slate-900 dark:text-slate-100">{genelTamamlanan}</span></span>
            <span>Kalan: <span className="font-semibold text-slate-900 dark:text-slate-100">{genelKalan}</span></span>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProgressCard({
  label, value, percent, color, target, remaining
}: {
  label: string; value: number; percent: number;
  color: string; target: number; remaining: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Yüzde: <span className="font-bold text-emerald-700 dark:text-emerald-300">{percent.toFixed(1)}%</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400">Adet</div>
          <div className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{value}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full ${color} bg-gradient-to-r transition-all duration-700`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
        Hedef: <span className="font-semibold text-slate-900 dark:text-slate-100">{target}</span>, Tamamlanan:{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>, Kalan:{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{remaining}</span>
      </div>
    </div>
  );
}
