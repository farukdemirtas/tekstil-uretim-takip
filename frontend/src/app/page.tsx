"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  saveEkSayim,
  saveProductionBulk,
  setAuthToken,
  unhideWorkerForCalendarDay,
  updateWorker,
  saveWorkerNote,
  type DayProductMeta,
} from "@/lib/api";
import { clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
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
import ExcelImportPanel from "@/components/ExcelImportPanel";
import BulkEntryPanel from "@/components/BulkEntryPanel";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  applyThemeFromPermissions,
  hasPermission,
  isAdminRole,
  persistPermissions,
  clearStoredPermissions,
} from "@/lib/permissions";
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");
  const [role, setRole] = useState<string>("data_entry");
  const [selectedDate, setSelectedDate] = useState<string>(todayWeekdayIso());
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [hedefStageTotals, setHedefStageTotals] = useState<HedefStageTotals>({ stages: [] });
  const [hedefStageError, setHedefStageError] = useState<string | null>(null);
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
  const EK_SAYIM_SAVE_DEBOUNCE_MS = 400;

  /** Sunucu `ek_sayim` + saat dilimlerini aynı aşama toplamında birleştirir; bu çağrı Günlük Özet’i bu toplamla doldurur. */
  async function refreshHedefStageTotals() {
    const dateStr = selectedDateRef.current;
    const mid = activeModelIdRef.current;
    try {
      const ht = await getHedefTakipStageTotals(dateStr, dateStr, mid ?? undefined);
      setHedefStageTotals(ht);
      setHedefStageError(null);
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
  function buildWorksheet(dateIso: string, dayRows: ProductionRow[], dayProductName: string, dayProductModel: string): XLSX.WorkSheet {
    const { aoa, headerRowIndex, lastColIdx } = buildSheetAoa(dateIso, dayRows, dayProductName, dayProductModel);
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
  function buildConsolidatedSheet(
    allDays: Array<{ date: string; rows: ProductionRow[]; productName: string; productModel: string }>
  ): XLSX.WorkSheet {
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
      const consolidatedSheet = buildConsolidatedSheet(allDays);
      XLSX.utils.book_append_sheet(workbook, consolidatedSheet, "Toplu");

      // Gün gün sayfalar
      for (const { date, rows: dayRows, productName, productModel } of allDays) {
        const sheetName = date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2");
        const worksheet = buildWorksheet(date, dayRows, productName, productModel);
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

  function handleExportExcel() {
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
          {hasPermission("veriSayfasi") ? (
            <Link href="/veri-sayfasi" className="btn-nav">
              Veri Sayfası
            </Link>
          ) : null}
          {hasPermission("prosesKontrol") ? (
            <Link href="/proses-kontrol" className="btn-nav">
              Proses Kontrol
            </Link>
          ) : null}
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
          {hasPermission("ekran1") ||
          hasPermission("ekran2") ||
          hasPermission("ekran3") ||
          hasPermission("ekran4") ? (
            <Link href="/ekran1" className="btn-nav" target="_blank" rel="noopener noreferrer">
              TV Ekranları
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setExcelPanelOpen((v) => !v);
              if (!bulkExportStart) setBulkExportStart(selectedDate);
              if (!bulkExportEnd) setBulkExportEnd(selectedDate);
            }}
            className="btn-nav"
          >
            Excel
          </button>
          {role === "admin" ? (
            <ExcelImportPanel
              teamMeta={teamMeta}
              open={importOpen}
              onOpenChange={setImportOpen}
              onImported={(targetDate) => {
                setImportOpen(false);
                if (targetDate === selectedDate) {
                  void loadDateData(selectedDate);
                } else {
                  setSelectedDate(targetDate);
                }
              }}
            />
          ) : null}
          {hasPermission("tamirOrani") || isAdminRole() ? (
            <Link href="/tamir-orani" className="btn-nav">
              Tamir Oranı
            </Link>
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

      {!loading && rows.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasPermission("topluListeKaldir") || role === "admin" ? (
              <>
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
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setEkSayimOpen((o) => {
                  const opening = !o;
                  if (opening) void refreshHedefStageTotals();
                  return opening;
                });
              }}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-slate-600 shadow-sm transition dark:text-slate-300 ${
                ekSayimOpen
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
              }`}
              title="Ek giriş (günlük özete yansır; saat toplamına eklenmez)"
              aria-label="Ek giriş: personel ve adet"
              aria-expanded={ekSayimOpen}
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12" />
                <path d="M3.75 6.75h.01v.01H3.75V6.75zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zM3.75 12h.01v.01H3.75V12zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zM3.75 17.25h.01v.01H3.75v-.01zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0z" />
              </svg>
            </button>
          </div>
          {ekSayimOpen ? (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 dark:border-slate-600/50 dark:bg-slate-800/20">
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Aşağıdaki adetler kaydedildiğinde alttaki <strong className="font-medium text-slate-700 dark:text-slate-300">Günlük Özet</strong> kutularındaki
                aşama toplamları ve <strong className="font-medium text-slate-700 dark:text-slate-300">Genel tamamlanan</strong> anında güncellenir (üretim
                saatleri + bu ek adetler). Ana tablodaki saat toplamı ve analizler buna göre değişmez.
              </p>
              <div className="overflow-x-auto overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-surface dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100">
                <table className="w-full min-w-[280px] border-collapse text-sm">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-sm font-bold">Ad Soyad</th>
                      <th className="w-[5.5rem] px-2 py-2.5 text-center text-sm font-bold">Adet</th>
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
                                      Sahada yok
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
                  { key: "export", label: "Dışa aktar" },
                  { key: "bulk", label: "Toplu export" },
                  ...(role === "admin" ? [{ key: "import", label: "İçe aktar" }] : []),
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
                Seçili tarihin ({selectedDate}) üretim verisini Excel dosyası olarak indir.
              </p>
              <button
                type="button"
                onClick={() => { handleExportExcel(); }}
                className="flex items-center gap-2 rounded-xl border border-emerald-500 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                İndir ({selectedDate})
              </button>
            </div>
          )}

          {excelPanelTab === "bulk" && (
            <div>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                Seçilen tarih aralığındaki her iş günü ayrı bir sayfa olarak tek Excel dosyasına aktarılır.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Başlangıç</label>
                  <input
                    type="date"
                    value={bulkExportStart}
                    onChange={(e) => setBulkExportStart(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Bitiş</label>
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
                        ? `${bulkExportProgress.done} / ${bulkExportProgress.total} gün…`
                        : "Hazırlanıyor…"}
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      İndir
                    </>
                  )}
                </button>
              </div>
              {bulkExporting && bulkExportProgress && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>{bulkExportProgress.done} / {bulkExportProgress.total} gün işlendi</span>
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
              <strong className="font-medium text-slate-800 dark:text-slate-200">Kaynak (seçili) gün hariç</strong>, bitiş
              tarihi <strong className="font-medium text-slate-800 dark:text-slate-200">dahil</strong> olacak şekilde
              aralıktaki her hafta içi güne kopyalanır. Örneğin verinin 27 Nisan’da görünmesi için bitiş en az 27 Nisan
              olmalı; tek iş günü mesajı alıyorsanız o gün, aralıktaki yegâne hafta içi gündür (27 dışında bir güne
              yazılmış olabilir). Tamamlandığında hedef günler mesajda listelenir ve ilk hedef gün takvimde açılır.
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

      <AdminPanel workerCount={rows.length} stageTotals={hedefStageTotals} stageError={hedefStageError} />
    </main>
  );
}
