"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AdminPanel, { type HedefStageTotals } from "@/components/AdminPanel";
import LoginForm from "@/components/LoginForm";
import ProductionTable from "@/components/ProductionTable";
import WorkerForm from "@/components/WorkerForm";
import {
  addWorker,
  getDayProductMeta,
  getEkran1GenelIlerleme,
  getHedefTakipStageTotals,
  getProsesVeriRowsFromServer,
  getProduction,
  getTeams,
  hideWorkerForCalendarDay,
  login,
  removeWorker,
  removeAllWorkersForDay,
  copyRosterToFutureDates,
  saveProduction,
  saveEkSayim,
  saveProductionBulk,
  setAuthToken,
  unhideWorkerForCalendarDay,
  updateWorker,
  saveWorkerNote,
  type DayProductMeta,
  type HedefStageLineDto,
} from "@/lib/api";
import { clampToWeekdayIso, previousWeekdayIso, todayWeekdayIso, todayWorkdayIsoTurkey } from "@/lib/businessCalendar";
import {
  GENEL_PROSES_UPDATED_EVENT,
  GENEL_VERIMLILIK_MODEL_CODE,
  getProsesMapForEfficiency,
  makeProsesKey,
  replaceLocalGenelCacheFromServerRows,
} from "@/lib/prosesVeri";
import { averageWorkerEfficiency } from "@/lib/workerEfficiency";
import {
  getProductionExcelHeaders,
  getConsolidatedProductionExcelHeaders,
  PRODUCTION_EXCEL_META_MODEL,
  PRODUCTION_EXCEL_META_PRODUCT,
  PRODUCTION_EXCEL_SHEET_NAME,
} from "@/lib/productionExcelFormat";
import {
  LEGACY_SLOT_DEFS,
  NEW_SLOT_DEFS,
  isNewSlotLayout,
  sumProductionRow,
  type ProductionSlotKey,
} from "@/lib/productionSlots";
import { formatProductDisplayLine } from "@/lib/takipsanProduct";
import ExcelImportPanel from "@/components/ExcelImportPanel";
import BulkEntryPanel from "@/components/BulkEntryPanel";
import SecondaryModelPanel from "@/components/SecondaryModelPanel";
import { getSecondarySimpleTotals } from "@/lib/api";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  applyThemeFromPermissions,
  hasPermission,
  isAdminRole,
  persistPermissions,
  clearStoredPermissions,
} from "@/lib/permissions";
import { ProductionRow } from "@/lib/types";
import type * as XLSX from "xlsx";
import { loadXlsx } from "@/lib/xlsxLazy";
import { useI18n } from "@/components/I18nProvider";
import LanguageSelector from "@/components/LanguageSelector";

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

function formatIsoTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Ana tablo ile aynı bölüm sırası (Ayarlardaki takım sırası veya varsayılan). */
function productionRowSlotValues(row: ProductionRow, dateIso: string): number[] {
  if (isNewSlotLayout(dateIso)) {
    return NEW_SLOT_DEFS.map(({ key }) => Number(row[key as keyof ProductionRow]) || 0);
  }
  return LEGACY_SLOT_DEFS.map(({ key }) => Number(row[key as keyof ProductionRow]) || 0);
}

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

/** ProductionTable ile aynı: bölüm sırası + her bölümde o günkü tablodaki satır sırası. */
function rowsByTeamSections(
  rows: ProductionRow[],
  teamMeta: Array<{ code: string }>
): { team: string; teamRows: ProductionRow[] }[] {
  const inData = [...new Set(rows.map((r) => r.team))];
  const order = teamMeta.length ? teamMeta.map((t) => t.code) : [...EXPORT_TEAM_FALLBACK];
  const head = order.filter((t) => inData.includes(t));
  const tail = inData.filter((t) => !order.includes(t));
  const teams = [...head, ...tail];
  return teams
    .map((team) => ({
      team,
      teamRows: rows.filter((r) => r.team === team),
    }))
    .filter((s) => s.teamRows.length > 0);
}

export default function HomePage() {
  const { t } = useI18n();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");
  const [role, setRole] = useState<string>("data_entry");
  const [selectedDate, setSelectedDate] = useState<string>(todayWeekdayIso());
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [hedefStageTotals, setHedefStageTotals] = useState<HedefStageTotals>({
    stages: [],
    dailySummaryStages: [],
  });
  const [hedefStageError, setHedefStageError] = useState<string | null>(null);
  const [ekran1Summary, setEkran1Summary] = useState<{
    totalCompleted: number;
    todayProduced: number;
    stages: import("@/lib/api").HedefStageLineDto[];
    dailySummaryStages: import("@/lib/api").HedefStageLineDto[];
  } | null>(null);
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
  const [excelPanelOpen, setExcelPanelOpen] = useState(false);
  const [excelPanelTab, setExcelPanelTab] = useState<"export" | "bulk" | "import">("export");
  const [importOpen, setImportOpen] = useState(false);
  function setBulkExportOpen(v: boolean) {
    if (v) { setExcelPanelOpen(true); setExcelPanelTab("bulk"); }
    else setExcelPanelOpen(false);
  }
  const [bulkExportStart, setBulkExportStart] = useState("");
  const [bulkExportEnd, setBulkExportEnd] = useState("");
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkExportProgress, setBulkExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [ekSayimOpen, setEkSayimOpen] = useState(false);
  const [prevAvgEfficiency, setPrevAvgEfficiency] = useState<number | null>(null);
  const [secondaryRows, setSecondaryRows] = useState<ProductionRow[]>([]);
  const [secondaryModelLabel, setSecondaryModelLabel] = useState<string | null>(null);
  const [secondaryModelId, setSecondaryModelId] = useState<number | null>(null);
  const [secondaryStages, setSecondaryStages] = useState<HedefStageLineDto[]>([]);
  const [genelProsesTick, setGenelProsesTick] = useState(0);
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState(false);

  const rowsRef = useRef<ProductionRow[]>(rows);
  const selectedDateRef = useRef(selectedDate);
  const productionSaveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const ekSayimSaveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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
      ekSayimSaveTimersRef.current.forEach((t) => clearTimeout(t));
      ekSayimSaveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!analysisMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAnalysisMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [analysisMenuOpen]);

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
    setHedefStageError(null);
    const emptyHedef: HedefStageTotals = { stages: [], dailySummaryStages: [] };
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
        getEkran1GenelIlerleme(date, mid ?? undefined),
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
        console.error(
          "[Günlük Özet] Stage totals alınamadı:",
          settled[1].reason
        );
        setHedefStageTotals(emptyHedef);
        setHedefStageError(
          settled[1].reason instanceof Error
            ? settled[1].reason.message
            : "Günlük Özet verisi alınamadı"
        );
      }

      if (settled[2].status === "fulfilled") {
        const s = settled[2].value;
        setEkran1Summary({ totalCompleted: s.totalCompleted, todayProduced: s.todayProduced, stages: s.stages, dailySummaryStages: s.dailySummaryStages });
      } else {
        setEkran1Summary(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      setSecondaryRows([]);
      setSecondaryModelLabel(null);
      setSecondaryModelId(null);
      setSecondaryStages([]);
      void loadDateData(selectedDate);
    }
  }, [selectedDate, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const prevIso = previousWeekdayIso(selectedDate);
    void (async () => {
      try {
        const prod = await getProduction(prevIso);
        if (cancelled) return;
        const map = getProsesMapForEfficiency();
        const { avg, count } = averageWorkerEfficiency(prod, map, false);
        setPrevAvgEfficiency(count > 0 ? avg : null);
      } catch {
        if (!cancelled) setPrevAvgEfficiency(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, isAuthenticated, genelProsesTick]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onGenel = () => setGenelProsesTick((t) => t + 1);
    window.addEventListener(GENEL_PROSES_UPDATED_EVENT, onGenel);
    return () => window.removeEventListener(GENEL_PROSES_UPDATED_EVENT, onGenel);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void getProsesVeriRowsFromServer(GENEL_VERIMLILIK_MODEL_CODE)
      .then((r) => {
        if (r.length > 0) replaceLocalGenelCacheFromServerRows(r);
        setGenelProsesTick((t) => t + 1);
      })
      .catch(() => {});
  }, [isAuthenticated]);

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
      applyThemeFromPermissions(result.permissions);
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

  async function handleAddWorker(payload: { name: string; team: string; process: string }) {
    await addWorker({ ...payload, addedDate: selectedDate });
    await loadDateData(selectedDate);
  }

  const PRODUCTION_SAVE_DEBOUNCE_MS = 320;
  const EK_SAYIM_SAVE_DEBOUNCE_MS = 400;

  /** Sunucu `ek_sayim` + saat dilimlerini aynı aşama toplamında birleştirir; bu çağrı Günlük Özet’i bu toplamla doldurur. */
  async function refreshHedefStageTotals() {
    const dateStr = selectedDateRef.current;
    const mid = activeModelIdRef.current;
    try {
      const [ht, ekran1] = await Promise.all([
        getHedefTakipStageTotals(dateStr, dateStr, mid ?? undefined),
        getEkran1GenelIlerleme(dateStr, mid ?? undefined).catch(() => null),
      ]);
      setHedefStageTotals(ht);
      setHedefStageError(null);
      if (ekran1) setEkran1Summary({ totalCompleted: ekran1.totalCompleted, todayProduced: ekran1.todayProduced, stages: ekran1.stages, dailySummaryStages: ekran1.dailySummaryStages });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Günlük özet yenilenemedi";
      setHedefStageError(msg);
    }
  }

  function cancelEkSayimDebounce(workerId: number) {
    const timers = ekSayimSaveTimersRef.current;
    const prev = timers.get(workerId);
    if (prev) {
      clearTimeout(prev);
      timers.delete(workerId);
    }
  }

  async function flushEkSayimSave(workerId: number) {
    const dateStr = selectedDateRef.current;
    const snap = rowsRef.current.find((r) => r.workerId === workerId);
    if (!snap || snap.absentForDay) return;
    const v = Math.max(0, Math.floor(Number(snap.ekSayim) || 0));
    try {
      await saveEkSayim({ workerId, date: dateStr, ekSayim: v });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ek adet kaydedilemedi");
      return;
    }
    await refreshHedefStageTotals();
  }

  function handleEkSayimChange(workerId: number, value: number) {
    const target = rowsRef.current.find((row) => row.workerId === workerId);
    if (!target || target.absentForDay) return;
    const nextVal = Math.max(0, Math.floor(value) || 0);
    setRows((prev) =>
      prev.map((row) => (row.workerId === workerId ? { ...row, ekSayim: nextVal } : row))
    );
    const timers = ekSayimSaveTimersRef.current;
    const prevTimer = timers.get(workerId);
    if (prevTimer) clearTimeout(prevTimer);
    const scheduledDate = selectedDate;
    const t = setTimeout(() => {
      timers.delete(workerId);
      if (selectedDateRef.current !== scheduledDate) return;
      void flushEkSayimSave(workerId);
    }, EK_SAYIM_SAVE_DEBOUNCE_MS);
    timers.set(workerId, t);
  }

  async function flushProductionSave(workerId: number) {
    const dateStr = selectedDateRef.current;
    const snap = rowsRef.current.find((r) => r.workerId === workerId);
    if (!snap || snap.absentForDay) return;
    try {
      await saveProduction({
        workerId,
        date: dateStr,
        t1000: snap.t1000,
        t1300: snap.t1300,
        t1600: snap.t1600,
        t1830: snap.t1830,
        h0900: snap.h0900,
        h1000: snap.h1000,
        h1115: snap.h1115,
        h1215: snap.h1215,
        h1300: snap.h1300,
        h1445: snap.h1445,
        h1545: snap.h1545,
        h1700: snap.h1700,
        h1830: snap.h1830,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Üretim kaydedilemedi");
      return;
    }
    await refreshHedefStageTotals();
  }

  function handleCellChange(workerId: number, field: ProductionSlotKey, value: number) {
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

  // Model değişince veya kayıt olunca ürün modelindeki günlük özet proseslerini çek
  useEffect(() => {
    if (!secondaryModelId) { setSecondaryStages([]); return; }
    void getSecondarySimpleTotals(selectedDate, secondaryModelId)
      .then((res) => setSecondaryStages(res.stages as HedefStageLineDto[]))
      .catch(() => setSecondaryStages([]));
  }, [secondaryModelId, selectedDate, secondaryRows]);

  const useIntradayEfficiency = selectedDate === todayWorkdayIsoTurkey();
  const personnelEfficiencyLive = useMemo(() => {
    const map = getProsesMapForEfficiency();
    const agg = averageWorkerEfficiency(rows, map, useIntradayEfficiency);
    const presentCount = rows.filter((r) => !r.absentForDay).length;
    let withTarget = 0;
    for (const row of rows) {
      if (row.absentForDay) continue;
      const dk = Number(map[makeProsesKey(row.team, row.process)]) || 0;
      if (dk > 0) withTarget++;
    }
    return { avg: agg.avg, count: agg.count, presentCount, withTarget };
  }, [rows, useIntradayEfficiency, genelProsesTick]);

  const ekSayimTeamSections = useMemo(
    () => rowsByTeamSections(rows, teamMeta),
    [rows, teamMeta]
  );

  /** Başlangıç ve bitiş (dahil) arasındaki hafta içi günleri döner */
  function weekdaysInRange(startIso: string, endIso: string): string[] {
    const dates: string[] = [];
    const [sy, sm, sd] = startIso.split("-").map(Number);
    const [ey, em, ed] = endIso.split("-").map(Number);
    let d = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    while (d <= end) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        dates.push(`${y}-${mo}-${da}`);
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return dates;
  }

  /** Verilen gün için Excel sayfasının AOA (array-of-arrays) verisini oluşturur */
  function buildSheetAoa(
    dateIso: string,
    dayRows: ProductionRow[],
    dayProductName: string,
    dayProductModel: string
  ): { aoa: (string | number)[][]; headerRowIndex: number; lastColIdx: number } {
    const sorted = orderedExportRows(dayRows, teamMeta);
    const headers = [...getProductionExcelHeaders(dateIso)];
    const lastColIdx = headers.length - 1;
    const aoa: (string | number)[][] = [];

    const dayGenelTamamlanan =
      hedefStageTotals.stages.length > 0
        ? Math.min(...hedefStageTotals.stages.map((s) => (typeof s.total === "number" && Number.isFinite(s.total) ? s.total : 0)))
        : 0;

    aoa.push(["Yeşil İmaj Tekstil — Günlük üretim özeti"]);
    aoa.push(["Tarih", formatExportDateLabel(dateIso)]);
    aoa.push([PRODUCTION_EXCEL_META_PRODUCT, dayProductName.trim() || "—"]);
    aoa.push([PRODUCTION_EXCEL_META_MODEL, dayProductModel.trim() || "—"]);
    aoa.push(["Genel tamamlanan (adet)", dayGenelTamamlanan]);
    aoa.push(["Dışa aktarım", new Date().toLocaleString("tr-TR")]);
    aoa.push([]);
    aoa.push([...headers]);

    const headerRowIndex = aoa.length - 1;
    const slotCount = headers.length - 5;
    const slotSums = new Array(slotCount).fill(0);
    let sumTot = 0;

    sorted.forEach((row, index) => {
      const vals = productionRowSlotValues(row, dateIso);
      const tot = sumProductionRow(row);
      vals.forEach((v, i) => {
        slotSums[i] += v;
      });
      sumTot += tot;
      aoa.push([index + 1, row.name, resolveTeamLabel(row.team), row.process, ...vals, tot]);
    });

    aoa.push([]);
    aoa.push(["TOPLAM", "", "", "", ...slotSums, sumTot]);
    return { aoa, headerRowIndex, lastColIdx };
  }

  /** Tek sayfa için worksheet oluşturur */
  async function buildWorksheet(dateIso: string, dayRows: ProductionRow[], dayProductName: string, dayProductModel: string): Promise<XLSX.WorkSheet> {
    const { aoa, headerRowIndex, lastColIdx } = buildSheetAoa(dateIso, dayRows, dayProductName, dayProductModel);
    const XLSX = await loadXlsx();
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } }];
    const slotCols = lastColIdx - 4;
    worksheet["!cols"] = [
      { wch: 6 },
      { wch: 30 },
      { wch: 22 },
      { wch: 20 },
      ...Array.from({ length: slotCols }, () => ({ wch: 10 })),
      { wch: 12 },
    ];
    const lastTableRowIndex = headerRowIndex + Math.max(dayRows.length, 0);
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRowIndex, c: 0 }, e: { r: lastTableRowIndex, c: lastColIdx } }) };
    const rowHeights: XLSX.RowInfo[] = [];
    rowHeights[0] = { hpt: 24 };
    rowHeights[headerRowIndex] = { hpt: 20 };
    worksheet["!rows"] = rowHeights;
    return worksheet;
  }

  /** İlk sayfa: tüm günlerin tek tabloda, gün gruplarıyla toplu görünümü */
  async function buildConsolidatedSheet(
    allDays: Array<{ date: string; rows: ProductionRow[]; productName: string; productModel: string }>
  ): Promise<XLSX.WorkSheet> {
    const XLSX = await loadXlsx();
    let maxColsAcross = 9;
    for (const { date } of allDays) {
      maxColsAcross = Math.max(maxColsAcross, getConsolidatedProductionExcelHeaders(date).length);
    }

    const aoa: (string | number)[][] = [];
    const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: maxColsAcross - 1 } }];

    aoa.push(["Yeşil İmaj Tekstil — Toplu Üretim Raporu"]);
    aoa.push(["Tarih aralığı", `${formatExportDateLabel(bulkExportStart)} — ${formatExportDateLabel(bulkExportEnd)}`]);
    aoa.push(["Gün sayısı", allDays.length]);
    aoa.push(["Dışa aktarım", new Date().toLocaleString("tr-TR")]);
    aoa.push([]);

    let grandSumTot = 0;

    for (const { date, rows: dayRows, productName: pn } of allDays) {
      const sorted = orderedExportRows(dayRows, teamMeta);
      if (sorted.length === 0) continue;

      const headers = [...getConsolidatedProductionExcelHeaders(date)];
      const lastColIdx = headers.length - 1;

      const dayLabelRow = aoa.length;
      const labelPad = new Array(headers.length).fill("");
      labelPad[0] = formatExportDateLabel(date) + (pn.trim() ? `  —  ${pn.trim()}` : "");
      aoa.push(labelPad);
      merges.push({ s: { r: dayLabelRow, c: 0 }, e: { r: dayLabelRow, c: lastColIdx } });

      aoa.push(headers);

      const slotCount = headers.length - 5;
      const daySums = new Array(slotCount).fill(0);
      let daySumTot = 0;

      sorted.forEach((row) => {
        const vals = productionRowSlotValues(row, date);
        const tot = sumProductionRow(row);
        vals.forEach((v: number, i: number) => {
          daySums[i] += v;
        });
        daySumTot += tot;
        aoa.push([formatExportDateLabel(date), row.name, resolveTeamLabel(row.team), row.process, ...vals, tot]);
      });
      grandSumTot += daySumTot;
      aoa.push(["Gün toplamı", "", "", "", ...daySums, daySumTot]);
      aoa.push([]);
    }

    const grandRow = new Array(maxColsAcross).fill("");
    grandRow[0] = "GENEL TOPLAM";
    grandRow[maxColsAcross - 1] = grandSumTot;
    aoa.push(grandRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"] = Array.from({ length: maxColsAcross }, (_, i) => {
      if (i === 0) return { wch: 24 };
      if (i === 1) return { wch: 30 };
      if (i === 2) return { wch: 22 };
      if (i === 3) return { wch: 20 };
      if (i === maxColsAcross - 1) return { wch: 14 };
      return { wch: 10 };
    });
    const rowHeights: XLSX.RowInfo[] = [];
    rowHeights[0] = { hpt: 26 };
    ws["!rows"] = rowHeights;
    return ws;
  }

  async function handleBulkExportExcel() {
    if (!bulkExportStart || !bulkExportEnd || bulkExportStart > bulkExportEnd) return;
    const dates = weekdaysInRange(bulkExportStart, bulkExportEnd);
    if (dates.length === 0) {
      alert("Seçilen aralıkta hafta içi gün yok.");
      return;
    }
    if (dates.length > 90) {
      alert("En fazla 90 iş günü seçebilirsiniz.");
      return;
    }
    setBulkExporting(true);
    setBulkExportProgress({ done: 0, total: dates.length });
    try {
      const XLSX = await loadXlsx();
      const workbook = XLSX.utils.book_new();
      const allDays: Array<{ date: string; rows: ProductionRow[]; productName: string; productModel: string }> = [];

      // Tüm günlerin verisini çek
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const [dayRows, meta] = await Promise.all([
          getProduction(date),
          getDayProductMeta(date),
        ]);
        allDays.push({ date, rows: dayRows, productName: meta.productName, productModel: meta.productModel });
        setBulkExportProgress({ done: i + 1, total: dates.length });
      }

      // İlk sayfa: toplu özet
      const consolidatedSheet = await buildConsolidatedSheet(allDays);
      XLSX.utils.book_append_sheet(workbook, consolidatedSheet, "Toplu");

      // Gün gün sayfalar
      for (const { date, rows: dayRows, productName, productModel } of allDays) {
        const sheetName = date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2");
        const worksheet = await buildWorksheet(date, dayRows, productName, productModel);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      XLSX.writeFile(workbook, `üretim-${bulkExportStart}-${bulkExportEnd}.xlsx`);
      setBulkExportOpen(false);
    } catch {
      alert("Excel oluşturulurken hata oluştu.");
    } finally {
      setBulkExporting(false);
      setBulkExportProgress(null);
    }
  }

  async function handleExportExcel() {
    const XLSX = await loadXlsx();
    const sorted = orderedExportRows(rows, teamMeta);
    /* Tablo: Sıra → Ad Soyad → Bölüm → Proses → saatler → Toplam */
    const headers = [...getProductionExcelHeaders(selectedDate)];
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

    const slotCount = headers.length - 5;
    const slotSums = new Array(slotCount).fill(0);
    let sumTot = 0;

    sorted.forEach((row, index) => {
      const vals = productionRowSlotValues(row, selectedDate);
      const tot = sumProductionRow(row);
      vals.forEach((v: number, i: number) => {
        slotSums[i] += v;
      });
      sumTot += tot;
      aoa.push([index + 1, row.name, resolveTeamLabel(row.team), row.process, ...vals, tot]);
    });

    aoa.push([]);
    aoa.push(["TOPLAM", "", "", "", ...slotSums, sumTot]);

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } }];

    const slotCols = headers.length - 5;
    worksheet["!cols"] = [
      { wch: 6 },
      { wch: 30 },
      { wch: 22 },
      { wch: 20 },
      ...Array.from({ length: slotCols }, () => ({ wch: 10 })),
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

  async function handleEditWorker(workerId: number, payload: { process: string; team: string }) {
    await updateWorker(workerId, payload);
    await loadDateData(selectedDate);
  }

  async function handleSaveNote(workerId: number, note: string) {
    await saveWorkerNote({ workerId, date: selectedDate, note });
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
      `Seçili gün (${selectedDate}) listesindeki ${rows.length} personel, kaynak gün hariç — ${copyRosterEndDate} (dahil) aralığındaki ` +
        `her hafta içi güne aktarılacak:\n\n` +
        `• Veri, seçili günden sonraki ilk iş gününden itibaren yazılır; belirli bir tarihe (ör. 27 Nisan) aktarım için bitiş o tarihi kapsamalıdır.\n` +
        `• Her hedef gün için kaynak gündeki üretim rakamları kopyalanır; hedefte satır varsa güncellenir.\n` +
        `• Bu günlerdeki “sahada yok” işaretleri kaldırılır.\n\nDevam edilsin mi?`
    );
    if (!ok) return;
    setCopyRosterBusy(true);
    try {
      const r = await copyRosterToFutureDates(selectedDate, copyRosterEndDate);
      setCopyRosterOpen(false);
      const targets = r.targetDates ?? [];
      if (targets.length > 0) {
        setSelectedDate(targets[0]);
      }
      const hedefStr =
        targets.length > 0
          ? ` Hedef günler: ${targets.map(formatIsoTr).join(", ")}. İlk hedef gün takvime seçildi.`
          : "";
      setCopyRosterSuccess(
        `Aktarım tamam: ${r.weekdayCount} iş günü, ${r.workers} personel; ${r.entriesTouched} üretim satırı güncellendi; ${r.hidesCleared} sahada yok işareti kaldırıldı.${hedefStr}`
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
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 pb-10 md:gap-5 md:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-900/85">
        {/* Accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-400" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Yeşil İmaj Tekstil Logo"
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 object-contain"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.dataset.fallback === "1") return;
                el.dataset.fallback = "1";
                el.src = "/logo.svg";
              }}
            />
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 sm:text-lg dark:text-white">
                {t("app.name")}
              </h1>
              <p className="text-[11px] font-medium uppercase tracking-widest text-teal-600 dark:text-teal-400">
                {t("app.tagline")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 sm:flex dark:border-slate-700 dark:bg-slate-800">
              <svg className="h-3.5 w-3.5 text-teal-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{currentUser}</span>
            </div>
            <LanguageSelector className="shrink-0" />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t("common.logout")}
            </button>
          </div>
        </div>
      </header>

      {/* ── Tarih + İstatistikler + Navigasyon ────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-900/85">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 md:px-5">
          {/* Tarih seçici */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-600 dark:bg-slate-800">
            <svg className="h-4 w-4 shrink-0 text-teal-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <label htmlFor="date" className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("common.date")}</label>
            <WeekdayDatePicker id="date" value={selectedDate} onChange={setSelectedDate} />
          </div>

          {/* Genel tamamlanan chip */}
          <div
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 dark:border-emerald-900/40 dark:from-emerald-950/50 dark:to-teal-950/40"
            title={t("nav.completedHint")}
          >
            <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("nav.completed")}</span>
            <span className="text-sm font-black tabular-nums text-emerald-800 dark:text-emerald-200">{genelTamamlanan}</span>
          </div>
          {/* Verimlilik chip */}
          {rows.length > 0 ? (
            <div
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 ${
                personnelEfficiencyLive.count > 0
                  ? prevAvgEfficiency == null || personnelEfficiencyLive.avg === prevAvgEfficiency
                    ? "border-slate-200/80 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80"
                    : personnelEfficiencyLive.avg > prevAvgEfficiency
                      ? "border-emerald-300/90 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : "border-rose-300/90 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/35"
                  : "border-dashed border-slate-300/90 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-900/60"
              }`}
              title={useIntradayEfficiency ? t("nav.intradayEfficiency") : t("nav.dailyEfficiency")}
            >
              <svg className={`h-4 w-4 shrink-0 ${personnelEfficiencyLive.count > 0 && prevAvgEfficiency != null ? personnelEfficiencyLive.avg > prevAvgEfficiency ? "text-emerald-600" : "text-rose-500" : "text-slate-400"}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("nav.efficiency")}</span>
              {personnelEfficiencyLive.count > 0 ? (
                <span className={`text-sm font-black tabular-nums ${prevAvgEfficiency == null || personnelEfficiencyLive.avg === prevAvgEfficiency ? "text-slate-800 dark:text-slate-100" : personnelEfficiencyLive.avg > prevAvgEfficiency ? "text-emerald-800 dark:text-emerald-200" : "text-rose-700 dark:text-rose-300"}`}>
                  %{personnelEfficiencyLive.avg}
                  <span className="ml-1 text-xs font-normal opacity-70">({t("common.peopleCount", { count: personnelEfficiencyLive.count })})</span>
                  {prevAvgEfficiency != null && personnelEfficiencyLive.avg !== prevAvgEfficiency && (
                    <span className="ml-1.5 text-xs font-semibold">
                      {personnelEfficiencyLive.avg > prevAvgEfficiency ? "↑" : "↓"} {t("nav.prevEfficiency", { pct: prevAvgEfficiency })}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-sm text-slate-400 dark:text-slate-500">
                  {personnelEfficiencyLive.presentCount === 0 && personnelEfficiencyLive.withTarget === 0 ? t("nav.absent") : personnelEfficiencyLive.withTarget === 0 ? t("nav.noTarget") : "—"}
                </span>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-700/50 md:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {hasPermission("utuPaket") || isAdminRole() ? (
            <Link href="/utu-paket" className="btn-nav-utu-paket">{t("nav.ironPack")}</Link>
          ) : null}
          {hasPermission("analysis") || hasPermission("ekran2") || hasPermission("karsilastirma") || hasPermission("modelAnalizi") ? (
            <button
              type="button"
              className={`btn-nav shrink-0 border-2 border-transparent font-semibold transition hover:border-teal-400/50 dark:hover:border-teal-500/40 ${analysisMenuOpen ? "border-teal-500 bg-teal-50 text-teal-900 ring-2 ring-teal-500/40 ring-offset-2 ring-offset-white dark:border-teal-600 dark:bg-teal-950/60 dark:text-teal-100 dark:ring-teal-500/35 dark:ring-offset-slate-900" : ""}`}
              aria-expanded={analysisMenuOpen}
              aria-haspopup="dialog"
              onClick={() => setAnalysisMenuOpen(true)}
            >
              {t("nav.analysis")}
            </button>
          ) : null}
          {hasPermission("veriSayfasi") ? (
            <Link href="/genel-verimlilik" className="btn-nav shrink-0">{t("nav.generalEfficiency")}</Link>
          ) : null}
          {hasPermission("prosesKontrol") ? (
            <Link href="/proses-kontrol" className="btn-nav shrink-0">{t("nav.processControl")}</Link>
          ) : null}
          {hasPermission("isBitirmeHesaplama") ? (
            <Link href="/is-bitirme-hesaplama" className="btn-nav shrink-0">{t("nav.jobCalc")}</Link>
          ) : null}
          {hasPermission("ekran1") || hasPermission("ekran2") || hasPermission("ekran3") || hasPermission("ekran4") ? (
            <Link href="/ekran1" className="btn-nav shrink-0">
              {t("nav.tvScreens")}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => { setExcelPanelOpen((v) => !v); if (!bulkExportStart) setBulkExportStart(selectedDate); if (!bulkExportEnd) setBulkExportEnd(selectedDate); }}
            className="btn-nav shrink-0"
          >
            {t("nav.excel")}
          </button>
          {role === "admin" ? (
            <ExcelImportPanel
              teamMeta={teamMeta}
              open={importOpen}
              onOpenChange={setImportOpen}
              onImported={(targetDate) => {
                setImportOpen(false);
                if (targetDate === selectedDate) { void loadDateData(selectedDate); } else { setSelectedDate(targetDate); }
              }}
            />
          ) : null}
          {hasPermission("tamirOrani") || isAdminRole() ? (
            <Link href="/tamir-orani" className="btn-nav shrink-0">{t("nav.repairRate")}</Link>
          ) : null}
          {hasPermission("ayarlar") || isAdminRole() ? (
            <Link href="/ayarlar" className="btn-nav shrink-0">{t("nav.settings")}</Link>
          ) : null}
        </div>
        </div>
      </section>

      {/* ── Ürün bilgisi bandı ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/85 md:px-5">
        <svg className="h-4 w-4 shrink-0 text-teal-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("home.productWorked")}</span>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {formatProductDisplayLine(productName, productModel)}
        </span>
        {productMetaSource === "hedef" ? (
          <span className="ml-auto rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
            {t("home.targetTracking")}
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">{t("home.excelManual")}</span>
        )}
      </div>

      <WorkerForm onSubmit={handleAddWorker} existingRows={rows} />

      {!loading && rows.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Ek sayım toggle */}
            <button
              type="button"
              onClick={() => {
                setEkSayimOpen((o) => {
                  const opening = !o;
                  if (opening) void refreshHedefStageTotals();
                  return opening;
                });
              }}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium shadow-sm transition ${
                ekSayimOpen
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
              title={t("nav.extraEntryHint")}
              aria-label={t("nav.extraEntry")}
              aria-expanded={ekSayimOpen}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12" />
                <path d="M3.75 6.75h.01v.01H3.75V6.75zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zM3.75 12h.01v.01H3.75V12zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zM3.75 17.25h.01v.01H3.75v-.01zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0z" />
              </svg>
              {t("nav.extraEntry")}
            </button>

            {/* Diğer günlere aktar */}
            {role === "admin" ? (
              <button
                type="button"
                disabled={copyRosterBusy}
                onClick={() => openCopyRosterModal()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3" />
                  <path d="M12 3v12m-4-4l4 4 4-4" />
                </svg>
                {copyRosterBusy ? t("nav.copyRosterBusy") : t("nav.copyRoster")}
              </button>
            ) : null}

            {/* Tüm personeli sil */}
            {hasPermission("topluListeKaldir") ? (
              <button
                type="button"
                disabled={clearingAllWorkers}
                onClick={() => setBulkRemoveOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200/80 bg-white px-3 text-xs font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
                {clearingAllWorkers ? t("nav.deleting") : t("nav.deleteAllWorkers")}
              </button>
            ) : null}
          </div>
          {ekSayimOpen ? (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 dark:border-slate-600/50 dark:bg-slate-800/20">
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {t("home.extraEntryDesc")}
              </p>
              <div className="overflow-x-auto overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-surface dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100">
                <table className="w-full min-w-[280px] border-collapse text-sm">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-sm font-bold">{t("workerForm.name")}</th>
                      <th className="w-[5.5rem] px-2 py-2.5 text-center text-sm font-bold">{t("common.quantity")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ekSayimTeamSections.map(({ team, teamRows }) => (
                      <Fragment key={team}>
                        <tr className="bg-slate-200 dark:bg-slate-700">
                          <td colSpan={2} className="px-3 py-2 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {resolveTeamLabel(team)}
                          </td>
                        </tr>
                        {teamRows.map((row) => {
                          const disabled = row.absentForDay === true;
                          return (
                            <tr
                              key={row.workerId}
                              className={
                                disabled
                                  ? "border-b border-slate-200 align-middle bg-slate-100/80 text-slate-500 opacity-80 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
                                  : "border-b border-slate-200 align-middle hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                              }
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-medium ${
                                      disabled ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"
                                    }`}
                                  >
                                    {row.name}
                                  </span>
                                  {disabled ? (
                                    <span className="inline-block rounded-md border border-amber-200/90 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                                      {t("production.absentBadge")}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.process}</p>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  disabled={disabled}
                                  value={row.ekSayim ?? 0}
                                  onChange={(e) => {
                                    const n = e.target.value === "" ? 0 : Number(e.target.value);
                                    handleEkSayimChange(
                                      row.workerId,
                                      Number.isFinite(n) ? n : 0
                                    );
                                  }}
                                  onBlur={() => {
                                    if (disabled) return;
                                    cancelEkSayimDebounce(row.workerId);
                                    void flushEkSayimSave(row.workerId);
                                  }}
                                  className="input-modern w-full max-w-[5.5rem] py-1.5 text-center text-sm tabular-nums disabled:cursor-not-allowed"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {copyRosterSuccess ? (
        <div className="rounded-xl border border-teal-200/90 bg-teal-50/90 px-4 py-3 text-sm text-teal-900 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-200">
          {copyRosterSuccess}
        </div>
      ) : null}

      {/* Excel birleşik panel */}
      {excelPanelOpen ? (
        <div className="surface-card dark:text-slate-100">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  { key: "export" as const, label: t("home.excelExportTab") },
                  { key: "bulk" as const, label: t("home.excelBulkTab") },
                  ...(role === "admin" ? [{ key: "import" as const, label: t("home.excelImportTab") }] : []),
                ] as { key: "export" | "bulk" | "import"; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setExcelPanelTab(tab.key)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    excelPanelTab === tab.key
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setExcelPanelOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {excelPanelTab === "export" && (
            <div>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                {t("home.excelExportDesc", { date: selectedDate })}
              </p>
              <button
                type="button"
                onClick={() => { handleExportExcel(); }}
                className="flex items-center gap-2 rounded-xl border border-emerald-500 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t("home.excelDownloadWithDate", { date: selectedDate })}
              </button>
            </div>
          )}

          {excelPanelTab === "bulk" && (
            <div>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                {t("home.excelBulkDesc")}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("common.startDate")}</label>
                  <input
                    type="date"
                    value={bulkExportStart}
                    onChange={(e) => setBulkExportStart(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("common.endDate")}</label>
                  <input
                    type="date"
                    value={bulkExportEnd}
                    onChange={(e) => setBulkExportEnd(e.target.value)}
                    min={bulkExportStart}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  disabled={bulkExporting || !bulkExportStart || !bulkExportEnd || bulkExportStart > bulkExportEnd}
                  onClick={() => void handleBulkExportExcel()}
                  className="flex items-center gap-2 rounded-xl border border-emerald-500 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkExporting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {bulkExportProgress
                        ? t("home.excelDaysProgress", {
                            done: bulkExportProgress.done,
                            total: bulkExportProgress.total,
                          })
                        : t("home.excelPreparing")}
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {t("home.excelDownload")}
                    </>
                  )}
                </button>
              </div>
              {bulkExporting && bulkExportProgress && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>
                      {t("home.excelDaysProcessed", {
                        done: bulkExportProgress.done,
                        total: bulkExportProgress.total,
                      })}
                    </span>
                    <span>{Math.round((bulkExportProgress.done / bulkExportProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${Math.round((bulkExportProgress.done / bulkExportProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {excelPanelTab === "import" && role === "admin" && (
            <div>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Daha önce dışa aktarılan .xlsx dosyasını seçerek üretim verilerini sisteme aktar.
              </p>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-teal-500 bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Dosya seç ve aktar
              </button>
            </div>
          )}
        </div>
      ) : null}

      {analysisMenuOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setAnalysisMenuOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-hub-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_25px_60px_-15px_rgba(15,23,42,0.35)] dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-4 text-white shadow-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/85">{t("analysisHub.reports")}</p>
                <h2 id="analysis-hub-title" className="text-lg font-bold tracking-tight">
                  {t("analysisHub.title")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAnalysisMenuOpen(false)}
                className="rounded-xl p-2 text-white/90 transition hover:bg-white/15 hover:text-white"
                aria-label={t("common.close")}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col gap-2.5 p-4" aria-label={t("analysisHub.navLabel")}>
              {hasPermission("analysis") ? (
                <Link
                  href="/analysis"
                  onClick={() => setAnalysisMenuOpen(false)}
                  className="group flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50/80 px-4 py-4 text-left shadow-sm transition hover:border-teal-400 hover:bg-teal-50/90 hover:shadow-md dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-teal-500 dark:hover:bg-teal-950/50"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-slate-900 dark:text-white">{t("analysisHub.generalAnalysisTitle")}</span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("analysisHub.generalAnalysisDesc")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-teal-100 p-2 text-teal-700 dark:bg-teal-900/80 dark:text-teal-200">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ) : null}
              {hasPermission("analysis") ? (
                <Link
                  href="/analysis/genel-tamamlanan"
                  onClick={() => setAnalysisMenuOpen(false)}
                  className="group flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50/80 px-4 py-4 text-left shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50/90 hover:shadow-md dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/50"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-slate-900 dark:text-white">{t("analysisHub.generalCompletedTitle")}</span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("analysisHub.generalCompletedDesc")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/80 dark:text-emerald-200">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ) : null}
              {hasPermission("analysis") || hasPermission("ekran2") ? (
                <Link
                  href="/analysis/person"
                  onClick={() => setAnalysisMenuOpen(false)}
                  className="group flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50/80 px-4 py-4 text-left shadow-sm transition hover:border-teal-400 hover:bg-teal-50/90 hover:shadow-md dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-teal-500 dark:hover:bg-teal-950/50"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-slate-900 dark:text-white">{t("analysisHub.personAnalysisTitle")}</span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("analysisHub.personAnalysisDesc")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-teal-100 p-2 text-teal-700 dark:bg-teal-900/80 dark:text-teal-200">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ) : null}
              {hasPermission("modelAnalizi") ? (
                <Link
                  href="/model-analizi"
                  onClick={() => setAnalysisMenuOpen(false)}
                  className="group flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50/80 px-4 py-4 text-left shadow-sm transition hover:border-teal-400 hover:bg-teal-50/90 hover:shadow-md dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-teal-500 dark:hover:bg-teal-950/50"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-slate-900 dark:text-white">{t("analysisHub.modelAnalysisTitle")}</span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("analysisHub.modelAnalysisDesc")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-teal-100 p-2 text-teal-700 dark:bg-teal-900/80 dark:text-teal-200">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ) : null}
              {hasPermission("karsilastirma") ? (
                <Link
                  href="/karsilastirma"
                  onClick={() => setAnalysisMenuOpen(false)}
                  className="group flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50/80 px-4 py-4 text-left shadow-sm transition hover:border-teal-400 hover:bg-teal-50/90 hover:shadow-md dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-teal-500 dark:hover:bg-teal-950/50"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-slate-900 dark:text-white">{t("analysisHub.comparisonTitle")}</span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("analysisHub.comparisonDesc")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-teal-100 p-2 text-teal-700 dark:bg-teal-900/80 dark:text-teal-200">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ) : null}
            </nav>
            <p className="border-t border-slate-200/90 px-5 pb-4 pt-3 text-center text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Seçmek için satıra dokunun veya tıklayın ·{" "}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Esc
              </kbd>{" "}
              ile kapatın
            </p>
          </div>
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
              {t("home.bulkRemoveTitle")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("home.bulkRemoveQuestion", { date: selectedDate, count: rows.length })}
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <strong className="text-slate-800 dark:text-slate-200">{t("home.bulkRemoveOnlyDayTitle")}</strong>{" "}
                {t("home.bulkRemoveOnlyDayDesc")}
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">{t("home.bulkRemoveFromDayTitle")}</strong>{" "}
                {t("home.bulkRemoveFromDayDesc")}
              </li>
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => setBulkRemoveOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={clearingAllWorkers}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
                onClick={() => confirmThenBulkRemove("only_day")}
              >
                {t("home.bulkRemoveOnlyDayBtn")}
              </button>
              <button
                type="button"
                disabled={clearingAllWorkers}
                className="rounded-xl border border-red-300 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50 dark:border-red-800 dark:bg-red-800 dark:hover:bg-red-700"
                onClick={() => confirmThenBulkRemove("from_day")}
              >
                {t("home.bulkRemoveFromDayBtn")}
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
              {t("home.copyRosterTitle")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("home.copyRosterSourceLine", { date: selectedDate, count: rows.length })}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("home.copyRosterDesc")}
            </p>
            <WeekdayDatePicker
              label={t("home.copyRosterEndLabel")}
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
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={copyRosterBusy || !copyRosterEndDate || copyRosterEndDate <= selectedDate}
                className="rounded-xl border border-teal-600 bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500"
                onClick={() => void runCopyRosterToFuture()}
              >
                {copyRosterBusy ? t("home.copyRosterTransferring") : t("home.copyRosterTransfer")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error && (
        <div className="rounded-2xl border border-red-200/90 bg-red-50/90 p-4 text-sm text-red-800 shadow-surface-sm dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {t("common.errorPrefix")} {error}
        </div>
      )}

      {loading ? (
        <div className="surface-card flex flex-col items-center justify-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500 dark:border-slate-700 dark:border-t-teal-400" />
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t("home.loadingData")}</span>
        </div>
      ) : (
        <ProductionTable
          rows={rows}
          selectedDate={selectedDate}
          modelKey={productModel.trim() || undefined}
          onCellChange={(id, field, value) => void handleCellChange(id, field, value)}
          onDeleteWorker={(id, name) => void handleDeleteWorker(id, name)}
          onHideWorkerForDay={(id, name) => void handleHideWorkerForDay(id, name)}
          onUnhideWorkerForDay={(id, name) => void handleUnhideWorkerForDay(id, name)}
          onEditWorker={handleEditWorker}
          onSaveNote={handleSaveNote}
          canDeleteWorkers={true}
        />
      )}

      {/* İkinci model giriş paneli */}
      {!loading && (
        <SecondaryModelPanel
          selectedDate={selectedDate}
          primaryModelId={activeModelIdRef.current}
          primaryRows={rows}
          onRowsChange={setSecondaryRows}
          onModelLabelChange={setSecondaryModelLabel}
          onModelIdChange={setSecondaryModelId}
        />
      )}

      {/* Yönetici: Excel içe aktarma var; yapıştırma paneli yalnızca «veri girişi» + Toplu ekle yetkisi */}
      {!loading && rows.length > 0 && role !== "admin" && hasPermission("topluEkle") ? (
        <BulkEntryPanel
          rows={rows}
          selectedDate={selectedDate}
          onApply={async (entries) => {
            await saveProductionBulk({ date: selectedDate, entries });
            await loadDateData(selectedDate);
          }}
        />
      ) : null}

      <AdminPanel
        workerCount={rows.length}
        stageTotals={hedefStageTotals}
        stageError={hedefStageError}
        ekran1TotalCompleted={ekran1Summary?.totalCompleted ?? null}
        ekran1TodayProduced={ekran1Summary?.todayProduced ?? null}
        ekran1Stages={ekran1Summary?.stages ?? null}
        ekran1DailySummaryStages={ekran1Summary?.dailySummaryStages ?? null}
        secondaryStages={secondaryStages}
        secondaryModelLabel={secondaryModelLabel}
      />
    </main>
  );
}
