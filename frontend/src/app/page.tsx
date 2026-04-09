"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import AdminPanel, { type HedefStageTotals } from "@/components/AdminPanel";
import LoginForm from "@/components/LoginForm";
import ProductionTable from "@/components/ProductionTable";
import WorkerForm from "@/components/WorkerForm";
import {
  addWorker,
  getDayProductMeta,
  getHedefTakipStageTotals,
  getProduction,
  getRangeStageTotals,
  getTeams,
  login,
  removeWorker,
  removeAllWorkersForDay,
  saveDayProductMeta,
  saveProduction,
  setAuthToken,
  updateWorker,
} from "@/lib/api";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import {
  PRODUCTION_EXCEL_HEADERS,
  PRODUCTION_EXCEL_META_MODEL,
  PRODUCTION_EXCEL_META_PRODUCT,
  PRODUCTION_EXCEL_SHEET_NAME,
} from "@/lib/productionExcelFormat";
import ExcelImportPanel from "@/components/ExcelImportPanel";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { hasPermission, isAdminRole, persistPermissions, clearStoredPermissions } from "@/lib/permissions";
import { ProductionRow } from "@/lib/types";

const EXPORT_TEAM_FALLBACK = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM", "ADET"];

function formatExportDateLabel(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("tr-TR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Ana tablo ile aynı bölüm sırası (Ayarlardaki takım sırası veya varsayılan). */
function orderedExportRows(rows: ProductionRow[], teamMeta: Array<{ code: string }>): ProductionRow[] {
  const inData = [...new Set(rows.map((r) => r.team))];
  const order = teamMeta.length ? teamMeta.map((t) => t.code) : [...EXPORT_TEAM_FALLBACK];
  const head = order.filter((t) => inData.includes(t));
  const tail = inData.filter((t) => !order.includes(t));
  const teams = [...head, ...tail];
  const out: ProductionRow[] = [];
  for (const t of teams) {
    out.push(...rows.filter((r) => r.team === t));
  }
  return out;
}

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");
  const [role, setRole] = useState<string>("data_entry");
  const [selectedDate, setSelectedDate] = useState<string>(todayWeekdayIso());
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [hedefStageTotals, setHedefStageTotals] = useState<HedefStageTotals>({
    SAG_ON: 0,
    SOL_ON: 0,
    YAKA_HAZIRLIK: 0,
    ARKA_HAZIRLIK: 0,
    BITIM: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productModel, setProductModel] = useState("");
  const [productMetaSaving, setProductMetaSaving] = useState(false);
  const [productMetaSaved, setProductMetaSaved] = useState(false);
  const router = useRouter();

  const [, setPermTick] = useState(0);
  const [teamMeta, setTeamMeta] = useState<Array<{ code: string; label: string }>>([]);
  const [teamGunlukToplamlar, setTeamGunlukToplamlar] = useState<Record<string, number>>({});
  const [clearingAllWorkers, setClearingAllWorkers] = useState(false);
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    const username = window.localStorage.getItem("auth_user");
    const storedRole = window.localStorage.getItem("auth_role");
    if (token && username) {
      setAuthToken(token);
      setCurrentUser(username);
      if (storedRole) setRole(storedRole);
      setIsAuthenticated(true);
      setPermTick((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void getTeams()
      .then((rows) => setTeamMeta(rows.map((t) => ({ code: t.code, label: t.label }))))
      .catch(() => {});
  }, [isAuthenticated]);

  function resolveTeamLabel(code: string) {
    return teamMeta.find((t) => t.code === code)?.label ?? code;
  }

  async function loadDateData(date: string) {
    setLoading(true);
    setError(null);
    setProductMetaSaved(false);
    try {
      const [data, meta, hedef, gunlukBolum] = await Promise.all([
        getProduction(date),
        getDayProductMeta(date).catch(() => ({ productName: "", productModel: "" })),
        getHedefTakipStageTotals(date, date).catch(() => ({
          SAG_ON: 0,
          SOL_ON: 0,
          YAKA_HAZIRLIK: 0,
          ARKA_HAZIRLIK: 0,
          BITIM: 0,
        })),
        getRangeStageTotals(date, date).catch(() => ({} as Record<string, number>)),
      ]);
      setRows(data);
      setProductName(meta.productName);
      setProductModel(meta.productModel);
      setHedefStageTotals(hedef);
      setTeamGunlukToplamlar(gunlukBolum && typeof gunlukBolum === "object" ? gunlukBolum : {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  async function persistProductMeta() {
    setProductMetaSaving(true);
    try {
      await saveDayProductMeta({
        date: selectedDate,
        productName,
        productModel,
      });
      setProductMetaSaved(true);
      window.setTimeout(() => setProductMetaSaved(false), 2500);
    } catch {
      setError("Ürün adı / model kaydedilemedi.");
    } finally {
      setProductMetaSaving(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      void loadDateData(selectedDate);
    }
  }, [selectedDate, isAuthenticated]);

  async function handleLogin(payload: { username: string; password: string }) {
    const result = await login(payload);
    setAuthToken(result.token);
    window.localStorage.setItem("auth_token", result.token);
    window.localStorage.setItem("auth_user", result.username);
    if ("role" in result && typeof result.role === "string") {
      window.localStorage.setItem("auth_role", result.role);
      setRole(result.role);
    }
    if (result.permissions && typeof result.permissions === "object") {
      persistPermissions(result.permissions);
    } else {
      clearStoredPermissions();
    }
    setPermTick((n) => n + 1);
    setCurrentUser(result.username);
    setIsAuthenticated(true);
    await loadDateData(selectedDate);
  }

  function handleLogout() {
    setAuthToken("");
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("auth_user");
    window.localStorage.removeItem("auth_role");
    clearStoredPermissions();
    setCurrentUser("");
    setRole("data_entry");
    setIsAuthenticated(false);
    setRows([]);
  }

  async function pushToHedefTakip() {
    /* Hedef Takip ile aynı proses kuralları: API'den seçili günün toplamları */
    try {
      const t = await getHedefTakipStageTotals(selectedDate, selectedDate);
      const totals = {
        sagOn: t.SAG_ON,
        solOn: t.SOL_ON,
        yaka: t.YAKA_HAZIRLIK,
        arka: t.ARKA_HAZIRLIK,
        bitim: t.BITIM,
      };
      window.localStorage.setItem("hedef_takip_stage_totals_v1", JSON.stringify({ ...totals, date: selectedDate }));
    } catch {
      /* API başarısızsa eski davranışa düşme — boş veya önceki cache */
    }
    router.push("/hedef-takip");
  }

  async function handleAddWorker(payload: { name: string; team: string; process: string }) {
    await addWorker({ ...payload, addedDate: selectedDate });
    await loadDateData(selectedDate);
  }

  async function handleCellChange(workerId: number, field: "t1000" | "t1300" | "t1600" | "t1830", value: number) {
    const nextRows = rows.map((row) => (row.workerId === workerId ? { ...row, [field]: value } : row));
    setRows(nextRows);

    const target = nextRows.find((row) => row.workerId === workerId);
    if (!target) return;

    await saveProduction({
      workerId,
      date: selectedDate,
      t1000: target.t1000,
      t1300: target.t1300,
      t1600: target.t1600,
      t1830: target.t1830
    });

    try {
      const ht = await getHedefTakipStageTotals(selectedDate, selectedDate);
      setHedefStageTotals(ht);
    } catch {
      /* hedef özeti */
    }
    try {
      const gun = await getRangeStageTotals(selectedDate, selectedDate);
      setTeamGunlukToplamlar(gun);
    } catch {
      /* grup toplamları */
    }
  }

  /** Hedef Takip ile aynı: min(Sağ Ön, Sol Ön, Yaka, Arka, Bitim) */
  const genelTamamlanan = useMemo(
    () =>
      Math.min(
        hedefStageTotals.SAG_ON,
        hedefStageTotals.SOL_ON,
        hedefStageTotals.YAKA_HAZIRLIK,
        hedefStageTotals.ARKA_HAZIRLIK,
        hedefStageTotals.BITIM
      ),
    [hedefStageTotals]
  );

  function handleExportExcel() {
    const sorted = orderedExportRows(rows, teamMeta);
    /* Tablo: Sıra → Ad Soyad → Bölüm → Proses → saatler → Toplam */
    const headers = [...PRODUCTION_EXCEL_HEADERS];
    const lastColIdx = headers.length - 1;
    const aoa: (string | number)[][] = [];

    aoa.push(["Yeşil İmaj Tekstil — Günlük üretim özeti"]);
    aoa.push(["Tarih", formatExportDateLabel(selectedDate)]);
    aoa.push([PRODUCTION_EXCEL_META_PRODUCT, productName.trim() || "—"]);
    aoa.push([PRODUCTION_EXCEL_META_MODEL, productModel.trim() || "—"]);
    aoa.push(["Genel tamamlanan (adet)", genelTamamlanan]);
    aoa.push(["Dışa aktarım", new Date().toLocaleString("tr-TR")]);
    aoa.push([]);
    aoa.push([...headers]);

    const headerRowIndex = aoa.length - 1;

    let sum10 = 0;
    let sum13 = 0;
    let sum16 = 0;
    let sum1830 = 0;
    let sumTot = 0;

    sorted.forEach((row, index) => {
      const t10 = row.t1000;
      const t13 = row.t1300;
      const t16 = row.t1600;
      const t18 = row.t1830;
      const tot = t10 + t13 + t16 + t18;
      sum10 += t10;
      sum13 += t13;
      sum16 += t16;
      sum1830 += t18;
      sumTot += tot;
      aoa.push([
        index + 1,
        row.name,
        resolveTeamLabel(row.team),
        row.process,
        t10,
        t13,
        t16,
        t18,
        tot,
      ]);
    });

    aoa.push([]);
    aoa.push(["TOPLAM", "", "", "", sum10, sum13, sum16, sum1830, sumTot]);

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } }];

    worksheet["!cols"] = [
      { wch: 6 },
      { wch: 30 },
      { wch: 22 },
      { wch: 20 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
    ];

    const lastTableRowIndex = headerRowIndex + Math.max(sorted.length, 0);
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRowIndex, c: 0 },
        e: { r: lastTableRowIndex, c: lastColIdx },
      }),
    };

    /* Başlık ve tablo başlık satırı yüksekliği (okunaklı tablo) */
    const rowHeights: XLSX.RowInfo[] = [];
    rowHeights[0] = { hpt: 24 };
    rowHeights[headerRowIndex] = { hpt: 20 };
    worksheet["!rows"] = rowHeights;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, PRODUCTION_EXCEL_SHEET_NAME);
    XLSX.writeFile(workbook, `üretim-${selectedDate}.xlsx`);
  }

  async function handleEditWorker(workerId: number, process: string) {
    await updateWorker(workerId, { process });
    await loadDateData(selectedDate);
  }

  async function handleDeleteWorker(workerId: number, workerName: string) {
    const approved = window.confirm(`${workerName} kullanicisini silmek istiyor musunuz?`);
    if (!approved) return;
    await removeWorker(workerId, selectedDate);
    await loadDateData(selectedDate);
  }

  async function runBulkRemoveFromList(scope: "only_day" | "from_day") {
    if (rows.length === 0) return;
    setBulkRemoveOpen(false);
    setClearingAllWorkers(true);
    setError(null);
    try {
      await removeAllWorkersForDay(selectedDate, scope);
      await loadDateData(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Personel kaldırılamadı");
    } finally {
      setClearingAllWorkers(false);
    }
  }

  function confirmThenBulkRemove(scope: "only_day" | "from_day") {
    if (rows.length === 0) return;
    const n = rows.length;
    const tarih = selectedDate;
    const mesaj =
      scope === "only_day"
        ? `Emin misiniz?\n\n${tarih} tarihinde listedeki ${n} personel yalnızca o gün için gizlenecek; sonraki iş günlerinde yeniden listelenir. Üretim kayıtları silinmez.`
        : `Emin misiniz?\n\n${tarih} tarihi ve sonrasında listedeki ${n} personel pasif sayılacak (o gün ve ileri tarihler listede görünmez). Geçmiş günler ve analizler etkilenmez.`;
    if (!window.confirm(mesaj)) return;
    void runBulkRemoveFromList(scope);
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 pb-10 md:gap-7 md:p-8">
      <section className="surface-card dark:text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Yeşil İmaj Tekstil Logo"
              width={52}
              height={52}
              className="h-[52px] w-[52px] shrink-0 rounded-lg border border-slate-200 object-contain shadow-sm dark:border-slate-600"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.dataset.fallback === "1") return;
                el.dataset.fallback = "1";
                el.src = "/logo.svg";
              }}
            />
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-xl dark:text-white">
                Yeşil İmaj Tekstil
              </h1>
              <p className="text-xs text-slate-600 sm:text-sm dark:text-slate-400">Üretim takip</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-600 sm:inline">Kullanıcı: {currentUser}</span>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </section>

      <section className="surface-card dark:text-slate-100">
        {/* Tarih + genel tamamlanan (Hedef Takip formülü) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="date" className="text-sm font-medium">
              Tarih
              <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">(hafta içi)</span>
            </label>
            <WeekdayDatePicker id="date" value={selectedDate} onChange={setSelectedDate} />
          </div>
          <div
            className="rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-surface-sm dark:border-emerald-900/40 dark:from-emerald-950/50 dark:to-teal-950/40 dark:text-emerald-200"
            title="Hedef Takip formülü: min(Sağ Ön, Sol Ön, Yaka, Arka, Bitim)"
          >
            Genel tamamlanan: {genelTamamlanan}
          </div>
        </div>

        {/* Aksiyon butonları — sarılabilir satır */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasPermission("analysis") ? (
            <Link href="/analysis" className="btn-nav">
              Analiz
            </Link>
          ) : null}
          {hasPermission("karsilastirma") ? (
            <Link href="/karsilastirma" className="btn-nav">
              Karşılaştırma
            </Link>
          ) : null}
          {hasPermission("hedefTakip") ? (
            <button onClick={() => void pushToHedefTakip()} className="btn-nav" type="button">
              Hedef Takip
            </button>
          ) : null}
          {hasPermission("ekran1") || hasPermission("ekran2") || hasPermission("ekran3") ? (
            <Link href="/ekran1" className="btn-nav" target="_blank" rel="noopener noreferrer">
              TV Ekranları
            </Link>
          ) : null}
          <button
            onClick={handleExportExcel}
            className="btn-nav"
          >
            Excel Export
          </button>
          {role === "admin" ? (
            <ExcelImportPanel
              teamMeta={teamMeta}
              onImported={(targetDate) => {
                if (targetDate === selectedDate) {
                  void loadDateData(selectedDate);
                } else {
                  setSelectedDate(targetDate);
                }
              }}
            />
          ) : null}
          {hasPermission("ayarlar") || isAdminRole() ? (
            <Link href="/ayarlar" className="btn-nav">
              Ayarlar
            </Link>
          ) : null}
        </div>
      </section>

      {/* Ürün adı / model — Çalışan ekleme ve tablonun üstü */}
      <section className="surface-card dark:text-slate-100">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Çalışılacak ürün (seçili tarih)
          </h2>
          <div className="flex items-center gap-2 text-xs">
            {productMetaSaving && (
              <span className="text-slate-500 dark:text-slate-400">Kaydediliyor...</span>
            )}
            {productMetaSaved && !productMetaSaving && (
              <span className="text-emerald-600 dark:text-emerald-400">Kaydedildi</span>
            )}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Seçili tarih için çalışılacak ürünün adı ve modeli. Alanlardan çıkınca otomatik kaydedilir.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="product-name" className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Ürün adı
            </label>
            <input
              id="product-name"
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onBlur={() => void persistProductMeta()}
              placeholder="Örn. Polo tişört"
              className="input-modern w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="product-model" className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Model
            </label>
            <input
              id="product-model"
              type="text"
              value={productModel}
              onChange={(e) => setProductModel(e.target.value)}
              onBlur={() => void persistProductMeta()}
              placeholder="Örn. YM-2026-04"
              className="input-modern w-full"
            />
          </div>
        </div>
      </section>

      <WorkerForm onSubmit={handleAddWorker} />

      {!loading && rows.length > 0 && hasPermission("topluListeKaldir") ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={clearingAllWorkers}
            onClick={() => setBulkRemoveOpen(true)}
            className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {clearingAllWorkers
              ? "Kaldırılıyor…"
              : selectedDate === todayWeekdayIso()
                ? "Tüm personeli listeden kaldır… (bugün)"
                : "Tüm personeli listeden kaldır… (seçili gün)"}
          </button>
        </div>
      ) : null}

      {bulkRemoveOpen && hasPermission("topluListeKaldir") ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setBulkRemoveOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-remove-title"
            className="surface-card max-w-md space-y-4 p-5 shadow-xl dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bulk-remove-title" className="text-base font-semibold text-slate-900 dark:text-white">
              Tüm personeli listeden kaldır
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{selectedDate}</span> için listede{" "}
              <span className="font-semibold tabular-nums">{rows.length}</span> kişi var. Nasıl uygulansın?
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Yalnızca bugün:</strong> Sadece seçili tarihte
                listede görünmezler; sonraki iş günlerinde tekrar listelenir. Üretim kayıtları silinmez.
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Bugün ve sonrası:</strong> Seçili tarihten
                itibaren listeden düşer (pasif); geçmiş günler ve analizler etkilenmez.
              </li>
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => setBulkRemoveOpen(false)}
              >
                İptal
              </button>
              <button
                type="button"
                disabled={clearingAllWorkers}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
                onClick={() => confirmThenBulkRemove("only_day")}
              >
                Yalnızca bugün
              </button>
              <button
                type="button"
                disabled={clearingAllWorkers}
                className="rounded-xl border border-red-300 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50 dark:border-red-800 dark:bg-red-800 dark:hover:bg-red-700"
                onClick={() => confirmThenBulkRemove("from_day")}
              >
                Bugün ve sonrası
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error && (
        <div className="rounded-2xl border border-red-200/90 bg-red-50/90 p-4 text-sm text-red-800 shadow-surface-sm dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          Hata: {error}
        </div>
      )}

      {loading ? (
        <div className="surface-card flex items-center justify-center py-12 text-sm font-medium text-slate-500 dark:text-slate-400">
          Yükleniyor…
        </div>
      ) : (
        <ProductionTable
          rows={rows}
          onCellChange={(id, field, value) => void handleCellChange(id, field, value)}
          onDeleteWorker={(id, name) => void handleDeleteWorker(id, name)}
          onEditWorker={handleEditWorker}
          canDeleteWorkers={true}
        />
      )}

      <AdminPanel
        workerCount={rows.length}
        stageTotals={hedefStageTotals}
        teamMeta={teamMeta}
        teamGunlukToplamlar={teamGunlukToplamlar}
      />
    </main>
  );
}
