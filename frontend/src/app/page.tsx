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
  saveDayProductMeta,
  saveProduction,
  setAuthToken,
  updateWorker,
} from "@/lib/api";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { hasPermission, isAdminRole, persistPermissions, clearStoredPermissions } from "@/lib/permissions";
import { ProductionRow } from "@/lib/types";

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
    const data = rows.map((row, index) => ({
      No: index + 1,
      "Ad Soyad": row.name,
      Proses: row.process,
      Grup: resolveTeamLabel(row.team),
      "10:00": row.t1000,
      "13:00": row.t1300,
      "16:00": row.t1600,
      "18:30": row.t1830,
      Toplam: row.t1000 + row.t1300 + row.t1600 + row.t1830
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Üretim");
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
