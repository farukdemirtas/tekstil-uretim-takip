"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  applyHedefSession,
  getHedefTakipStageTotals,
  getProductModel,
  listProductModels,
  setAuthToken,
  type HedefStageLineDto,
  type ProductModelListItem,
} from "@/lib/api";
import { clampToWeekdayIso, coerceWeekdayPickerValue, todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
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
function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/* localStorage'a yaz — effect dışında, kullanıcı aksiyonlarında çağrılır */
function persistSettings(
  target: number,
  startDate: string,
  endDate: string,
  rangeMode: boolean,
  modelId: number | null
) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ target, startDate, endDate, rangeMode, modelId: modelId ?? null })
    );
  } catch { /* ignore */ }
}

export default function HedefTakip() {
  const [target, setTarget] = useState<number>(5000);
  const [stages, setStages] = useState<HedefStageLineDto[]>([]);
  const [startDate, setStartDate] = useState<string>(todayWeekdayIso());
  const [endDate, setEndDate]     = useState<string>(todayWeekdayIso());
  const [rangeLoading, setRangeLoading] = useState<boolean>(false);
  const [rangeError, setRangeError]     = useState<string>("");
  const [rangeMode, setRangeMode]       = useState<boolean>(false);
  const [lastUpdated, setLastUpdated]   = useState<string>("");
  const [models, setModels]             = useState<ProductModelListItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | "">("");
  const [applyMsg, setApplyMsg]         = useState<string>("");
  const [applyLoading, setApplyLoading] = useState(false);

  /* Otomatik yenileme zamanlayıcısı */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Sayfa yüklenince: hedef/model korunur; tarihler her zaman bugün (isterseniz siz değiştirirsiniz) ─── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("hedefTakip")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);

    void listProductModels()
      .then((list) => {
        setModels(list);
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          const saved = raw
            ? (JSON.parse(raw) as {
                target?: number;
                rangeMode?: boolean;
                modelId?: number | null;
              })
            : {};
          const today = clampToWeekdayIso(todayWeekdayIso());
          const t = Number(saved.target) || 5000;
          const rm = Boolean(saved.rangeMode);

          let mid: number | null = null;
          if (
            saved.modelId != null &&
            Number.isFinite(Number(saved.modelId)) &&
            list.some((x) => x.id === Number(saved.modelId))
          ) {
            mid = Number(saved.modelId);
            setSelectedModelId(mid);
          } else if (list.length === 1) {
            mid = list[0].id;
            setSelectedModelId(mid);
          }

          setTarget(t);
          setStartDate(today);
          setEndDate(today);
          persistSettings(t, today, today, rm, mid);

          if (rm && mid != null) {
            setRangeMode(true);
            void fetchRangeData(today, today, false, mid);
          }
        } catch { /* ignore */ }
      })
      .catch(() => {});

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Otomatik yenileme: rangeMode aktifken 30 sn'de bir veri çek ─── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!rangeMode) return;

    timerRef.current = setInterval(() => {
      void fetchRangeData(
        startDate,
        endDate,
        true,
        selectedModelId === "" ? undefined : Number(selectedModelId)
      );
    }, AUTO_REFRESH_MS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMode, startDate, endDate, selectedModelId]);

  /* ─── API'den tarih aralığı verilerini çek ─── */
  async function fetchRangeData(start: string, end: string, silent: boolean, modelId?: number) {
    if (!silent) setRangeLoading(true);
    setRangeError("");
    try {
      const mid =
        modelId !== undefined
          ? modelId
          : selectedModelId === ""
            ? undefined
            : Number(selectedModelId);
      const totals = await getHedefTakipStageTotals(start, end, mid);
      setStages(totals.stages ?? []);
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch (e) {
      if (!silent)
        setRangeError(
          e instanceof Error ? e.message : "Veriler alınamadı. Model tanımını veya bağlantıyı kontrol edin."
        );
    } finally {
      if (!silent) setRangeLoading(false);
    }
  }

  /* ─── "Verileri Getir" butonuna basıldığında ─── */
  async function handleFetchRange() {
    if (!startDate || !endDate) { setRangeError("Lütfen başlangıç ve bitiş tarihi seçin."); return; }
    if (startDate > endDate)    { setRangeError("Başlangıç tarihi bitiş tarihinden büyük olamaz."); return; }

    if (selectedModelId === "") {
      setRangeError("Önce bir ürün modeli seçin (Ayarlar’da tanımlı olmalı).");
      return;
    }
    await fetchRangeData(startDate, endDate, false, Number(selectedModelId));
    setRangeMode(true);
    persistSettings(target, startDate, endDate, true, Number(selectedModelId));
  }

  async function handleApplyToMainScreen() {
    setApplyMsg("");
    if (selectedModelId === "") {
      setRangeError("Ürün modeli seçin.");
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setRangeError("Geçerli bir tarih aralığı seçin.");
      return;
    }
    setApplyLoading(true);
    try {
      const m = await getProductModel(Number(selectedModelId));
      await applyHedefSession({
        modelId: Number(selectedModelId),
        startDate,
        endDate,
        productName: m.productName,
        productModel: m.modelCode,
      });
      setApplyMsg(
        `Seçilen hafta içi günlere ürün bilgisi yazıldı. Ana ekranda ilgili tarihlerde “Çalışılacak ürün” otomatik görünür.`
      );
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : "Uygulanamadı");
    } finally {
      setApplyLoading(false);
    }
  }

  /* ─── Input onChange yardımcıları — değişikliği anında localStorage'a yaz ─── */
  function handleTargetChange(value: string) {
    const n = Number(value);
    const t = Number.isFinite(n) && n >= 0 ? n : 0;
    setTarget(t);
    persistSettings(t, startDate, endDate, rangeMode, selectedModelId === "" ? null : Number(selectedModelId));
  }

  function handleStartDateChange(value: string) {
    const v = coerceWeekdayPickerValue(value);
    setStartDate(v);
    persistSettings(target, v, endDate, rangeMode, selectedModelId === "" ? null : Number(selectedModelId));
  }

  function handleEndDateChange(value: string) {
    const v = coerceWeekdayPickerValue(value);
    setEndDate(v);
    persistSettings(target, startDate, v, rangeMode, selectedModelId === "" ? null : Number(selectedModelId));
  }

  function handleModelChange(id: string) {
    if (id === "") {
      setSelectedModelId("");
      persistSettings(target, startDate, endDate, rangeMode, null);
      return;
    }
    const num = Number(id);
    setSelectedModelId(num);
    persistSettings(target, startDate, endDate, rangeMode, num);
  }

  /* ─── Hesaplamalar ─── */
  const genelTamamlanan = useMemo(() => {
    if (!stages.length) return 0;
    return Math.min(...stages.map((s) => (Number.isFinite(s.total) ? s.total : 0)));
  }, [stages]);
  const genelKalan = useMemo(() => Math.max(0, target - genelTamamlanan), [target, genelTamamlanan]);
  const genelPercent = useMemo(() => calcPercent(genelTamamlanan, target), [genelTamamlanan, target]);

  const STAGE_CARD_COLORS = [
    "from-emerald-500 to-emerald-600",
    "from-sky-500 to-sky-600",
    "from-violet-500 to-violet-600",
    "from-amber-500 to-amber-600",
    "from-rose-500 to-rose-600",
    "from-cyan-500 to-cyan-600",
    "from-fuchsia-500 to-fuchsia-600",
    "from-lime-500 to-lime-600",
  ] as const;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-4 md:p-8">

      {/* ── Başlık ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Hedef Takip</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Ürün modeli, tarih aralığı ve hedef adet seçilir; toplamlar modelde tanımlı bölüm/proses satırlarına göre
              hesaplanır (satır sayısı ürüne göre değişir). Ana üretim ekranındaki “çalışılacak ürün” bilgisi buradan
              uygulanır.
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

        <div className="mt-6 rounded-lg border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-900/40 dark:bg-teal-950/25">
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Çalışılacak ürün modeli</label>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Ayarlar → <strong className="font-medium text-slate-700 dark:text-slate-300">Ürün modelleri</strong> bölümünde
            her satırda çalışılacak bölüm ve baz alınacak proses seçilir. Seçilen modele göre hedef rakamları üretim
            tablosundan hesaplanır.
          </p>
          <select
            value={selectedModelId === "" ? "" : String(selectedModelId)}
            onChange={(e) => handleModelChange(e.target.value)}
            className="mt-2 w-full max-w-lg rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Model seçin…</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.modelCode} — {m.productName || "—"}
              </option>
            ))}
          </select>
          {models.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Henüz model yok. Ayarlar → Ürün modelleri üzerinden ekleyin.
            </p>
          ) : selectedModelId !== "" ? (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Ürün: <strong>{models.find((x) => x.id === selectedModelId)?.productName || "—"}</strong> · Kod:{" "}
              <strong>{models.find((x) => x.id === selectedModelId)?.modelCode}</strong>
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Tarih Aralığı Filtresi ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-base font-semibold">Tarih aralığı ve ana ekrana aktarım</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Hafta içi günler için toplam üretimi çekin. «Üretim ekranına uygula» ile seçilen aralıktaki her iş gününe ürün
          adı ve model kodu yazılır; ana sayfada düzenlenemez.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <WeekdayDatePicker
            label="Başlangıç Tarihi"
            value={startDate}
            onChange={handleStartDateChange}
            className="min-w-[13rem] flex-1"
          />
          <WeekdayDatePicker
            label="Bitiş Tarihi"
            value={endDate}
            onChange={handleEndDateChange}
            className="min-w-[13rem] flex-1"
          />
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
              onClick={() =>
                void fetchRangeData(
                  startDate,
                  endDate,
                  false,
                  selectedModelId === "" ? undefined : Number(selectedModelId)
                )
              }
              disabled={rangeLoading}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              Yenile
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleApplyToMainScreen()}
            disabled={applyLoading || selectedModelId === ""}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {applyLoading ? "Uygulanıyor…" : "Üretim ekranına uygula"}
          </button>
        </div>
        {applyMsg ? (
          <p className="mt-3 rounded-md border border-teal-200 bg-teal-50/80 px-3 py-2 text-xs text-teal-900 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-teal-200">
            {applyMsg}
          </p>
        ) : null}
        {rangeError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{rangeError}</p>}
      </section>

      {/* ── Bölüm satırı kartları (modelde tanımlı N adet) ── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stages.map((s, i) => {
          const shortP = s.processName.length > 22 ? `${s.processName.slice(0, 20)}…` : s.processName;
          const label = s.processName ? `${s.teamLabel} · ${shortP}` : s.teamLabel;
          const val = Number.isFinite(s.total) ? s.total : 0;
          const pct = calcPercent(val, target);
          const rem = Math.max(0, target - val);
          return (
            <ProgressCard
              key={`${s.sortOrder}-${i}`}
              label={label}
              value={val}
              percent={pct}
              color={STAGE_CARD_COLORS[i % STAGE_CARD_COLORS.length]}
              target={target}
              remaining={rem}
            />
          );
        })}

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
