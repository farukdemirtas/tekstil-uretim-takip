"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  getTeams,
  hideWorkerForCalendarDay,
  login,
  removeWorker,
  removeAllWorkersForDay,
  copyRosterToFutureDates,
  saveProduction,
  setAuthToken,
  unhideWorkerForCalendarDay,
  updateWorker,
  type DayProductMeta,
} from "@/lib/api";
import { clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
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
  const [hedefStageTotals, setHedefStageTotals] = useState<HedefStageTotals>({ stages: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productModel, setProductModel] = useState("");
  const [productMetaSource, setProductMetaSource] = useState<"manual" | "hedef">("manual");
  const router = useRouter();
  const activeModelIdRef = useRef<number | null>(null);

  const [, setPermTick] = useState(0);
  const [teamMeta, setTeamMeta] = useState<Array<{ code: string; label: string }>>([]);
  const [clearingAllWorkers, setClearingAllWorkers] = useState(false);
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
  const [copyRosterOpen, setCopyRosterOpen] = useState(false);
  const [copyRosterEndDate, setCopyRosterEndDate] = useState("");
  const [copyRosterBusy, setCopyRosterBusy] = useState(false);
  const [copyRosterSuccess, setCopyRosterSuccess] = useState<string | null>(null);

  const rowsRef = useRef<ProductionRow[]>(rows);
  const selectedDateRef = useRef(selectedDate);
  const productionSaveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    return () => {
      productionSaveTimersRef.current.forEach((t) => clearTimeout(t));
      productionSaveTimersRef.current.clear();
    };
  }, []);

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
    const emptyHedef: HedefStageTotals = { stages: [] };
    try {
      const meta = await getDayProductMeta(date).catch(
        (): DayProductMeta => ({
          productName: "",
          productModel: "",
          modelId: null,
          metaSource: "manual",
        })
      );
      setProductName(meta.productName);
      setProductModel(meta.productModel);
      setProductMetaSource(meta.metaSource);
      const mid = meta.modelId ?? null;
      activeModelIdRef.current = mid;

      const settled = await Promise.allSettled([
        getProduction(date),
        getHedefTakipStageTotals(date, date, mid ?? undefined),
      ]);

      if (settled[0].status === "fulfilled") {
        setRows(settled[0].value);
      } else {
        setRows([]);
        setError(
          settled[0].reason instanceof Error ? settled[0].reason.message : "Üretim verisi alınamadı"
        );
      }

      if (settled[1].status === "fulfilled") {
        setHedefStageTotals(settled[1].value);
      } else {
        setHedefStageTotals(emptyHedef);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setLoading(false);
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
    try {
      const mid = activeModelIdRef.current;
      const t = await getHedefTakipStageTotals(selectedDate, selectedDate, mid ?? undefined);
      window.localStorage.setItem(
        "hedef_takip_stage_totals_v1",
        JSON.stringify({ stages: t.stages, date: selectedDate, modelId: mid ?? null })
      );
    } catch {
      /* cache isteğe bağlı */
    }
    router.push("/hedef-takip");
  }

  async function handleAddWorker(payload: { name: string; team: string; process: string }) {
    await addWorker({ ...payload, addedDate: selectedDate });
    await loadDateData(selectedDate);
  }

  const PRODUCTION_SAVE_DEBOUNCE_MS = 320;

  async function flushProductionSave(workerId: number) {
    const dateStr = selectedDateRef.current;
    const snap = rowsRef.current.find((r) => r.workerId === workerId);
    if (!snap || snap.absentForDay) return;
    await saveProduction({
      workerId,
      date: dateStr,
      t1000: snap.t1000,
      t1300: snap.t1300,
      t1600: snap.t1600,
      t1830: snap.t1830
    });
    try {
      const ht = await getHedefTakipStageTotals(
        dateStr,
        dateStr,
        activeModelIdRef.current ?? undefined
      );
      setHedefStageTotals(ht);
    } catch {
      /* hedef özeti */
    }
  }

  function handleCellChange(workerId: number, field: "t1000" | "t1300" | "t1600" | "t1830", value: number) {
    const target = rows.find((row) => row.workerId === workerId);
    if (!target || target.absentForDay) return;

    const nextRows = rows.map((row) => (row.workerId === workerId ? { ...row, [field]: value } : row));
    setRows(nextRows);

    const timers = productionSaveTimersRef.current;
    const prevTimer = timers.get(workerId);
    if (prevTimer) clearTimeout(prevTimer);
    const scheduledDate = selectedDate;
    const t = setTimeout(() => {
      timers.delete(workerId);
      if (selectedDateRef.current !== scheduledDate) return;
      void flushProductionSave(workerId);
    }, PRODUCTION_SAVE_DEBOUNCE_MS);
    timers.set(workerId, t);
  }

  /** Hedef Takip ile aynı: tanımlı bölüm satırları toplamlarının minimumu */
  const genelTamamlanan = useMemo(() => {
    const v = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
    const stages = hedefStageTotals.stages ?? [];
    if (stages.length === 0) return 0;
    return Math.min(...stages.map((s) => v(s.total)));
  }, [hedefStageTotals]);

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
    const approved = window.confirm(
      `“${workerName}” seçili tarih (${selectedDate}) ve sonrasında silinecek (pasif). ` +
        `Daha önceki günlerde tabloda görünmeye devam eder. Üretim kayıtları silinmez.\n\nDevam edilsin mi?`
    );
    if (!approved) return;
    setError(null);
    try {
      await removeWorker(workerId, selectedDate);
      await loadDateData(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    }
  }

  async function handleHideWorkerForDay(workerId: number, workerName: string) {
    const approved = window.confirm(
      `“${workerName}” bu tarihte (${selectedDate}) sahada yok sayılacak: satır listede kalır, soluk görünür ve üretim hücreleri kilitlenir. ` +
        `Sonraki iş günlerinde normal görünür. Bu güne yazılmış rakamlar silinmez.\n\nDevam edilsin mi?`
    );
    if (!approved) return;
    setError(null);
    try {
      await hideWorkerForCalendarDay(workerId, selectedDate);
      await loadDateData(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşaretlenemedi");
    }
  }

  async function handleUnhideWorkerForDay(workerId: number, _workerName: string) {
    setError(null);
    try {
      await unhideWorkerForCalendarDay(workerId, selectedDate);
      await loadDateData(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görünür yapılamadı");
    }
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
      setError(err instanceof Error ? err.message : "Personel silinemedi");
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
        ? `Emin misiniz?\n\n${tarih} tarihinde ${n} personel için “sahada yok” işareti konacak: satırlar listede soluk kalır, üretim hücreleri kilitlenir. Sonraki iş günlerinde normal görünürler. Kayıtlar silinmez.`
        : `Emin misiniz?\n\n${tarih} tarihi ve sonrasında listedeki ${n} personel pasif sayılacak (o gün ve ileri tarihler listede görünmez). Geçmiş günler ve analizler etkilenmez.`;
    if (!window.confirm(mesaj)) return;
    void runBulkRemoveFromList(scope);
  }

  function openCopyRosterModal() {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + 7);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setCopyRosterEndDate(clampToWeekdayIso(iso));
    setCopyRosterOpen(true);
  }

  async function runCopyRosterToFuture() {
    if (rows.length === 0) return;
    setError(null);
    if (!copyRosterEndDate || copyRosterEndDate <= selectedDate) {
      setError(
        "Bitiş tarihi, seçili günden sonra bir gün olmalıdır (aynı gün seçilirse aktarılacak hafta içi aralığı boş kalır)."
      );
      return;
    }
    const ok = window.confirm(
      `Seçili gün (${selectedDate}) listesindeki ${rows.length} personel, bu tarihten sonraki hafta içi günlerden ` +
        `${copyRosterEndDate} tarihine kadar aktarılacak:\n\n` +
        `• Her hedef gün için kaynak gündeki üretim rakamları (10:00–18:30) kopyalanır; hedefte satır varsa güncellenir.\n` +
        `• Bu günlerdeki “sahada yok” işaretleri kaldırılır.\n\nDevam edilsin mi?`
    );
    if (!ok) return;
    setCopyRosterBusy(true);
    try {
      const r = await copyRosterToFutureDates(selectedDate, copyRosterEndDate);
      setCopyRosterOpen(false);
      setCopyRosterSuccess(
        `Aktarım tamam: ${r.weekdayCount} iş günü, ${r.workers} personel; ${r.entriesTouched} üretim satırı güncellendi; ${r.hidesCleared} sahada yok işareti kaldırıldı.`
      );
      window.setTimeout(() => setCopyRosterSuccess(null), 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktarım başarısız");
    } finally {
      setCopyRosterBusy(false);
    }
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
            title="Hedef Takip: modeldeki bölüm satırları toplamlarının minimumu"
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
          {hasPermission("analysis") || hasPermission("ekran2") ? (
            <Link href="/analysis/person" className="btn-nav">
              Kişi analizi
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
          {productMetaSource === "hedef" ? (
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
              Hedef Takip
            </span>
          ) : (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Excel / manuel</span>
          )}
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Bu bilgiler <strong className="font-medium text-slate-700 dark:text-slate-300">Hedef Takip</strong> ekranından
          tarih aralığı uygulandığında otomatik yazılır; ana sayfada değiştirilemez. Günlük özet ve hedef rakamları,
          Ayarlar’da tanımlı modele göre seçilen bölüm ve proseslerden hesaplanır.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Ürün adı</span>
            <div
              className="input-modern w-full cursor-default bg-slate-50/90 text-slate-800 dark:bg-slate-900/50 dark:text-slate-100"
              title="Hedef Takip üzerinden güncellenir"
            >
              {productName.trim() ? productName : "—"}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Model kodu</span>
            <div
              className="input-modern w-full cursor-default bg-slate-50/90 text-slate-800 dark:bg-slate-900/50 dark:text-slate-100"
              title="Hedef Takip üzerinden güncellenir"
            >
              {productModel.trim() ? productModel : "—"}
            </div>
          </div>
        </div>
      </section>

      <WorkerForm onSubmit={handleAddWorker} />

      {!loading && rows.length > 0 && (hasPermission("topluListeKaldir") || role === "admin") ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasPermission("topluListeKaldir") ? (
            <button
              type="button"
              disabled={clearingAllWorkers}
              onClick={() => setBulkRemoveOpen(true)}
              className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              {clearingAllWorkers
                ? "Siliniyor…"
                : selectedDate === todayWeekdayIso()
                  ? "Tüm personeli sil… (bugün)"
                  : "Tüm personeli sil… (seçili gün)"}
            </button>
          ) : null}
          {role === "admin" ? (
            <button
              type="button"
              disabled={copyRosterBusy}
              onClick={() => openCopyRosterModal()}
              className="rounded-xl border border-teal-200 bg-white px-3.5 py-2 text-sm font-medium text-teal-800 shadow-sm transition hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800/50 dark:bg-slate-900 dark:text-teal-200 dark:hover:bg-teal-950/40"
            >
              {copyRosterBusy ? "Aktarılıyor…" : "Tüm personeli diğer günlere aktar"}
            </button>
          ) : null}
        </div>
      ) : null}

      {copyRosterSuccess ? (
        <div className="rounded-xl border border-teal-200/90 bg-teal-50/90 px-4 py-3 text-sm text-teal-900 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-200">
          {copyRosterSuccess}
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
              Tüm personeli sil
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{selectedDate}</span> için listede{" "}
              <span className="font-semibold tabular-nums">{rows.length}</span> kişi var. Nasıl uygulansın?
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Yalnızca bugün:</strong> Seçili günde sahada yok
                işareti (satırlar soluk, hücreler kilitli); sonraki iş günlerinde normal. Üretim kayıtları silinmez.
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Bugün ve sonrası:</strong> Seçili tarihten
                itibaren silinir (pasif; listede görünmez); geçmiş günler ve analizler etkilenmez.
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

      {copyRosterOpen && role === "admin" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => !copyRosterBusy && setCopyRosterOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-roster-title"
            className="surface-card max-w-md space-y-4 p-5 shadow-xl dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="copy-roster-title" className="text-base font-semibold text-slate-900 dark:text-white">
              Personeli diğer günlere aktar
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">Kaynak tarih (seçili):</span>{" "}
              {selectedDate} — listede {rows.length} kişi.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Bu tarihten <strong className="font-medium text-slate-800 dark:text-slate-200">sonraki</strong> her hafta içi
              gün için (bitiş tarihi dahil) kaynak gündeki üretim rakamları yazılır; satır yoksa oluşturulur, varsa
              güncellenir. O günlerdeki “sahada yok” işaretleri kaldırılır. Bitiş, seçili günden en az bir gün sonra
              olmalıdır.
            </p>
            <WeekdayDatePicker
              label="Bitiş tarihi (hafta içi)"
              value={copyRosterEndDate}
              onChange={setCopyRosterEndDate}
              className="w-full"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={copyRosterBusy}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => !copyRosterBusy && setCopyRosterOpen(false)}
              >
                İptal
              </button>
              <button
                type="button"
                disabled={copyRosterBusy || !copyRosterEndDate || copyRosterEndDate <= selectedDate}
                className="rounded-xl border border-teal-600 bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500"
                onClick={() => void runCopyRosterToFuture()}
              >
                {copyRosterBusy ? "Aktarılıyor…" : "Aktar"}
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
          selectedDate={selectedDate}
          onCellChange={(id, field, value) => void handleCellChange(id, field, value)}
          onDeleteWorker={(id, name) => void handleDeleteWorker(id, name)}
          onHideWorkerForDay={(id, name) => void handleHideWorkerForDay(id, name)}
          onUnhideWorkerForDay={(id, name) => void handleUnhideWorkerForDay(id, name)}
          onEditWorker={handleEditWorker}
          canDeleteWorkers={true}
        />
      )}

      <AdminPanel workerCount={rows.length} stageTotals={hedefStageTotals} />
    </main>
  );
}
