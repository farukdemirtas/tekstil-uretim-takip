"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  getProduction,
  getTeams,
  getProcesses,
  getWorkersForAnalytics,
  getDayProductMeta,
  setAuthToken,
} from "@/lib/api";
import type { TeamRow, ProcessRow, DayProductMeta } from "@/lib/api";
import type { ProductionRow } from "@/lib/types";
import type { Worker } from "@/lib/types";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import { dedupeWorkersByName } from "@/lib/workers";
import { loadExcelJS, downloadWorkbook } from "@/lib/exceljsLazy";
import type { Border, Alignment } from "exceljs";
import {
  DEFECT_TYPES,
  type KontrolData,
  type AraKontrolRow,
  type AraKontrolMode,
  loadAraKontrolPayload as loadPayload,
  persistAraKontrolPayload as persistPayload,
  emptyDefects,
  sumDefects,
  hataOrani,
} from "@/lib/araKontrol";

type Section = { team: string; rows: AraKontrolRow[]; startNo: number };

let manualIdCounter = -1;

/** Depodan yüklenen satırlar negatif id taşıyabilir (önceki oturumdan kalma);
 *  sayaç bunların altına çekilmezse yeni eklenen satır eski biriyle aynı id'yi
 *  alır ve ikisi de aynı satır gibi güncellenir. Yüklemeden sonra çağrılmalı. */
function ensureManualIdCounterBelow(rows: { workerId: number }[]) {
  for (const r of rows) {
    if (r.workerId < 0 && r.workerId <= manualIdCounter) {
      manualIdCounter = r.workerId - 1;
    }
  }
}

/* ══════════════════════════════════════════════════════════
   Sayfa
══════════════════════════════════════════════════════════ */
export default function AraKontrolPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(todayWeekdayIso);
  const [dayMeta, setDayMeta] = useState<DayProductMeta | null>(null);
  const [rows, setRows] = useState<AraKontrolRow[]>([]);
  const [mode, setMode] = useState<AraKontrolMode>("auto");

  const [bantNo, setBantNo] = useState("");
  const [articleNo, setArticleNo] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [kaliteKontrolMuduru, setKaliteKontrolMuduru] = useState("");
  const [araKontrolcu, setAraKontrolcu] = useState("");

  /* personel ekleme formu */
  const [showAddForm, setShowAddForm] = useState(false);
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [selectedWId, setSelectedWId] = useState<number | "">("");
  const [addProcess, setAddProcess] = useState("");
  const [addTeam, setAddTeam] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);

  /* ── Auth ──────────────────────────────────────────────── */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!isAdminRole() && !hasPermission("araKontrol")) {
      router.replace("/");
      return;
    }
    setAuthToken(token);
    setAuthorized(true);
    void Promise.all([getTeams(), getProcesses(), getWorkersForAnalytics()]).then(([tms, prcs, wks]) => {
      setTeams(tms);
      setProcesses(prcs);
      setAllWorkers(dedupeWorkersByName(wks));
      if (tms.length) setAddTeam(tms[0].code);
      if (prcs.length) setAddProcess(prcs[0].name);
    });
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
      const [production, meta] = await Promise.allSettled([getProduction(date), getDayProductMeta(date)]);
      setDayMeta(meta.status === "fulfilled" ? meta.value : null);
      const productionRows: ProductionRow[] = production.status === "fulfilled" ? production.value : [];
      const payload = loadPayload(date);
      setBantNo(payload.bantNo);
      setArticleNo(payload.articleNo);
      setOrderNo(payload.orderNo);
      setKaliteKontrolMuduru(payload.kaliteKontrolMuduru);
      setAraKontrolcu(payload.araKontrolcu);
      const currentMode: AraKontrolMode = payload.mode ?? "auto";
      setMode(currentMode);

      if (currentMode === "manual") {
        const freeRows: AraKontrolRow[] = (payload.freeRows ?? []).map((w) => {
          const saved = payload.kontrolData[w.workerId];
          return {
            workerId: w.workerId,
            name: w.name,
            process: w.process,
            team: "",
            kontrolEdilenAdet: saved?.kontrolEdilenAdet ?? 0,
            kontrolTekrarSayisi: saved?.kontrolTekrarSayisi ?? 0,
            defects: { ...emptyDefects(), ...saved?.defects },
            note: saved?.note ?? "",
            manual: true,
            kritikOperasyon: saved?.kritikOperasyon ?? false,
          };
        });
        ensureManualIdCounterBelow(freeRows);
        setRows(freeRows);
        return;
      }

      const excludedSet = new Set(payload.excludedIds ?? []);

      const fromProduction: AraKontrolRow[] = productionRows
        .filter((p) => !excludedSet.has(p.workerId))
        .map((p) => {
          const saved = payload.kontrolData[p.workerId];
          return {
            workerId: p.workerId,
            name: p.name,
            process: p.process,
            team: p.team,
            kontrolEdilenAdet: saved?.kontrolEdilenAdet ?? 0,
            kontrolTekrarSayisi: saved?.kontrolTekrarSayisi ?? 0,
            defects: { ...emptyDefects(), ...saved?.defects },
            note: saved?.note ?? "",
            kritikOperasyon: saved?.kritikOperasyon ?? false,
          };
        });

      const manual: AraKontrolRow[] = (payload.extraWorkers ?? []).map((w) => {
        const saved = payload.kontrolData[w.workerId];
        return {
          ...w,
          kontrolEdilenAdet: saved?.kontrolEdilenAdet ?? 0,
          kontrolTekrarSayisi: saved?.kontrolTekrarSayisi ?? 0,
          defects: { ...emptyDefects(), ...saved?.defects },
          note: saved?.note ?? "",
          manual: true,
          kritikOperasyon: saved?.kritikOperasyon ?? false,
        };
      });

      ensureManualIdCounterBelow(manual);
      setRows([...fromProduction, ...manual]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  function handleModeChange(next: AraKontrolMode) {
    if (next === mode) return;
    const current = loadPayload(selectedDate);
    persistPayload(selectedDate, { ...current, mode: next });
    setMode(next);
    void loadData(selectedDate);
  }

  /* ── Kaydet helper ─────────────────────────────────────── */
  function saveRows(nextRows: AraKontrolRow[], excluded?: number[]) {
    const current = loadPayload(selectedDate);
    // Mevcut kontrolData üzerine yaz — diğer moddaki (auto/manual) kayıtlar silinmesin
    const kontrolData: Record<number, KontrolData> = { ...current.kontrolData };
    for (const r of nextRows) {
      kontrolData[r.workerId] = {
        kontrolEdilenAdet: r.kontrolEdilenAdet,
        kontrolTekrarSayisi: r.kontrolTekrarSayisi,
        defects: r.defects,
        note: r.note,
        kritikOperasyon: r.kritikOperasyon,
      };
    }

    if (mode === "manual") {
      const freeRows = nextRows.map(({ workerId, name, process }) => ({ workerId, name, process }));
      persistPayload(selectedDate, { ...current, mode, kontrolData, freeRows });
      return;
    }

    const extraWorkers = nextRows
      .filter((r) => r.manual)
      .map(({ workerId, name, process, team }) => ({ workerId, name, process, team }));
    const merged = Array.from(new Set([...(current.excludedIds ?? []), ...(excluded ?? [])]));
    persistPayload(selectedDate, { ...current, mode, kontrolData, extraWorkers, excludedIds: merged });
  }

  /* ── Manuel mod: serbest satır ekle/sil/düzenle ──────────── */
  function addFreeRow() {
    const newRow: AraKontrolRow = {
      workerId: manualIdCounter--,
      name: "",
      process: "",
      team: "",
      kontrolEdilenAdet: 0,
      kontrolTekrarSayisi: 0,
      defects: emptyDefects(),
      note: "",
      manual: true,
      kritikOperasyon: false,
    };
    setRows((prev) => {
      const next = [...prev, newRow];
      saveRows(next);
      return next;
    });
  }

  function removeFreeRow(workerId: number) {
    if (!window.confirm("Bu satır silinsin mi?")) return;
    setRows((prev) => {
      const next = prev.filter((r) => r.workerId !== workerId);
      saveRows(next);
      return next;
    });
  }

  function updateFreeRowText(workerId: number, field: "name" | "process", value: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.workerId === workerId ? { ...r, [field]: value } : r));
      saveRows(next);
      return next;
    });
  }

  /** Manuel modda personel seçilince proses boşsa personelin varsayılan prosesini de doldurur */
  function updateFreeRowWorker(workerId: number, name: string) {
    setRows((prev) => {
      const next = prev.map((r) => {
        if (r.workerId !== workerId) return r;
        if (!name) return { ...r, name: "" };
        const w = allWorkers.find((x) => x.name === name);
        return { ...r, name, process: r.process || w?.process || r.process };
      });
      saveRows(next);
      return next;
    });
  }

  function updateHeaderField(
    field: "bantNo" | "articleNo" | "orderNo" | "kaliteKontrolMuduru" | "araKontrolcu",
    value: string
  ) {
    const next = { bantNo, articleNo, orderNo, kaliteKontrolMuduru, araKontrolcu, [field]: value };
    if (field === "bantNo") setBantNo(value);
    if (field === "articleNo") setArticleNo(value);
    if (field === "orderNo") setOrderNo(value);
    if (field === "kaliteKontrolMuduru") setKaliteKontrolMuduru(value);
    if (field === "araKontrolcu") setAraKontrolcu(value);
    const current = loadPayload(selectedDate);
    persistPayload(selectedDate, { ...current, ...next });
  }

  /* ── Veri güncelle ─────────────────────────────────────── */
  function updateRowNumber(workerId: number, field: "kontrolEdilenAdet" | "kontrolTekrarSayisi", raw: string) {
    const v = Math.max(0, Number.isFinite(parseInt(raw, 10)) ? parseInt(raw, 10) : 0);
    setRows((prev) => {
      const next = prev.map((r) => (r.workerId === workerId ? { ...r, [field]: v } : r));
      saveRows(next);
      return next;
    });
  }

  function updateDefect(workerId: number, key: string, raw: string) {
    const v = Math.max(0, Number.isFinite(parseInt(raw, 10)) ? parseInt(raw, 10) : 0);
    setRows((prev) => {
      const next = prev.map((r) =>
        r.workerId === workerId ? { ...r, defects: { ...r.defects, [key]: v } } : r
      );
      saveRows(next);
      return next;
    });
  }

  function updateNote(workerId: number, note: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.workerId === workerId ? { ...r, note } : r));
      saveRows(next);
      return next;
    });
  }

  function updateKritikOperasyon(workerId: number, checked: boolean) {
    setRows((prev) => {
      const next = prev.map((r) => (r.workerId === workerId ? { ...r, kritikOperasyon: checked } : r));
      saveRows(next);
      return next;
    });
  }

  /* ── Personel ekle ─────────────────────────────────────── */
  function handleWorkerSelect(wid: number | "") {
    setSelectedWId(wid);
    if (wid === "") return;
    const w = allWorkers.find((x) => x.id === wid);
    if (w) {
      setAddTeam(w.team);
      setAddProcess(w.process);
    }
  }

  function handleAddWorker() {
    if (selectedWId === "") return;
    const w = allWorkers.find((x) => x.id === selectedWId);
    if (!w) return;
    if (rows.some((r) => r.name === w.name && r.team === addTeam)) return;
    const newRow: AraKontrolRow = {
      workerId: manualIdCounter--,
      name: w.name,
      process: addProcess || w.process,
      team: addTeam || w.team,
      kontrolEdilenAdet: 0,
      kontrolTekrarSayisi: 0,
      defects: emptyDefects(),
      note: "",
      manual: true,
      kritikOperasyon: false,
    };
    setRows((prev) => {
      const next = [...prev, newRow];
      saveRows(next);
      return next;
    });
    setSelectedWId("");
    setShowAddForm(false);
  }

  function handleRemoveWorker(workerId: number, isManual: boolean) {
    const name = rows.find((r) => r.workerId === workerId)?.name ?? "bu personel";
    if (!window.confirm(`"${name}" listeden çıkarılsın mı?`)) return;
    setRows((prev) => {
      const next = prev.filter((r) => r.workerId !== workerId);
      saveRows(next, isManual ? [] : [workerId]);
      return next;
    });
  }

  /* ── Grupla ────────────────────────────────────────────── */
  const sections: Section[] = (() => {
    const teamOrder = [...new Set(rows.map((r) => r.team))];
    let no = 1;
    return teamOrder.map((team) => {
      const teamRows = rows.filter((r) => r.team === team);
      const s = { team, rows: teamRows, startNo: no };
      no += teamRows.length;
      return s;
    });
  })();

  /* ── Excel — ekrandaki tabloyla aynı görünüm (kenarlık, renk, dikey/yatay başlık) ── */
  async function exportExcel() {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ara Kontrol");

    const thin: Partial<Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
    const DEFECT_COUNT = DEFECT_TYPES.length;
    const colKritik = 4;
    const totalCols = 6 + DEFECT_COUNT + 3; // No,AdSoyad,Proses,KritikOperasyon,KontrolAdedi,Tekrar + hata tipleri + Toplam,Hata%,Açıklama
    const defectStart = 7; // 1-indexli sütun
    const defectEnd = defectStart + DEFECT_COUNT - 1;
    const colToplam = defectEnd + 1;
    const colHataPct = colToplam + 1;
    const colAciklama = colHataPct + 1;

    const urunStr = [dayMeta?.productModel, dayMeta?.productName].filter(Boolean).join(" — ");

    /* Başlık */
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = "ARA KONTROL UYGUNSUZLUK RAPORU";
    titleCell.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(1).height = 26;

    /* Bant No · Article No · Order No · Tarih */
    const infoRow = ws.getRow(2);
    const infoPairs: [string, string][] = [
      ["Bant No", bantNo],
      ["Article No", articleNo],
      ["Order No", orderNo],
      ["Tarih", selectedDate],
    ];
    infoPairs.forEach(([label, value], i) => {
      infoRow.getCell(i * 2 + 1).value = label;
      infoRow.getCell(i * 2 + 1).font = { bold: true, color: { argb: "FF475569" } };
      infoRow.getCell(i * 2 + 2).value = value || "—";
    });

    /* Çalışılan Ürün */
    const urunRow = ws.getRow(3);
    urunRow.getCell(1).value = "Çalışılan Ürün";
    urunRow.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
    ws.mergeCells(3, 2, 3, totalCols);
    urunRow.getCell(2).value = urunStr || "—";
    urunRow.getCell(2).font = { bold: true };

    /* Tablo başlığı (satır 5) */
    const headerRowIdx = 5;
    const headerRow = ws.getRow(headerRowIdx);
    const headers = [
      "No",
      "Ad Soyad",
      "Proses",
      "Kritik Operasyon",
      "Kontrol Adedi",
      "Tekrar",
      ...DEFECT_TYPES.map((d) => d.short),
      "Toplam",
      "Hata %",
      "Açıklama",
    ];
    const leftAlignCols = new Set([2, 3, colAciklama]);
    headers.forEach((h, i) => {
      const col = i + 1;
      const cell = headerRow.getCell(col);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.border = allBorders;
      const isDefectCol = col >= defectStart && col <= defectEnd;
      cell.alignment = isDefectCol
        ? ({ vertical: "middle", horizontal: "center", textRotation: 90 } as Partial<Alignment>)
        : { vertical: "middle", horizontal: leftAlignCols.has(col) ? "left" : "center", wrapText: true };
    });
    headerRow.height = 78;

    /* Kolon genişlikleri — ekrandaki kolon oranlarıyla aynı */
    const widths = [5, 22, 20, 14, 11, 9, ...DEFECT_TYPES.map(() => 5), 9, 9, 24];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    let rIdx = headerRowIdx + 1;
    const writeDataRow = (row: AraKontrolRow, no: number) => {
      const total = sumDefects(row.defects);
      const pct = parseFloat(hataOrani(total, row.kontrolEdilenAdet));
      const pctArgb = pct === 0 ? "FF059669" : pct < 10 ? "FFD97706" : "FFDC2626";
      const excelRow = ws.getRow(rIdx);
      const values: (string | number)[] = [
        no,
        row.name,
        row.process,
        row.kritikOperasyon ? "✓" : "",
        row.kontrolEdilenAdet,
        row.kontrolTekrarSayisi,
        ...DEFECT_TYPES.map((d) => row.defects[d.key] || 0),
        total,
        pct,
        row.note,
      ];
      values.forEach((v, i) => {
        const col = i + 1;
        const cell = excelRow.getCell(col);
        cell.value = v;
        cell.border = allBorders;
        cell.alignment = { vertical: "middle", horizontal: leftAlignCols.has(col) ? "left" : "center" };
        if (row.manual) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF5FF" } };
        }
        const isDefectCol = col >= defectStart && col <= defectEnd;
        if (isDefectCol && (Number(v) || 0) > 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1F2" } };
          cell.font = { color: { argb: "FFE11D48" }, bold: true };
        }
        if (col === colKritik && v) {
          cell.font = { bold: true, size: 12, color: { argb: "FFE11D48" } };
        }
        if (col === colToplam) {
          cell.font = { bold: true, color: { argb: pctArgb } };
        }
        if (col === colHataPct) {
          cell.font = { bold: true, color: { argb: pctArgb } };
          cell.numFmt = '"%"0.0';
        }
      });
      rIdx += 1;
    };

    if (mode === "auto") {
      for (const section of sections) {
        ws.mergeCells(rIdx, 1, rIdx, totalCols);
        const teamCell = ws.getCell(rIdx, 1);
        teamCell.value = teamLabel(section.team);
        teamCell.font = { bold: true, color: { argb: "FF1E293B" } };
        teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        teamCell.alignment = { vertical: "middle" };
        ws.getRow(rIdx).height = 20;
        rIdx += 1;
        section.rows.forEach((row, idx) => writeDataRow(row, section.startNo + idx));
      }
    } else {
      rows.forEach((row, idx) => writeDataRow(row, idx + 1));
    }

    /* TOPLAM satırı */
    const footerRowIdx = rIdx;
    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(footerRowIdx, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.border = allBorders;
    }
    ws.getCell(footerRowIdx, 1).value = "TOPLAM";
    ws.mergeCells(footerRowIdx, 1, footerRowIdx, 6);
    perDefectTotals.forEach((t, i) => {
      const cell = ws.getCell(footerRowIdx, defectStart + i);
      cell.value = t;
      if (t > 0) cell.font = { bold: true, color: { argb: "FFFCD34D" } };
    });
    const grandCell = ws.getCell(footerRowIdx, colToplam);
    grandCell.value = grandTotal;
    grandCell.font = { bold: true, color: { argb: "FFFCD34D" } };
    const grandPctCell = ws.getCell(footerRowIdx, colHataPct);
    grandPctCell.value = parseFloat(hataOrani(grandTotal, grandAdet));
    grandPctCell.numFmt = '"%"0.0';
    grandPctCell.font = { bold: true, color: { argb: "FFFCD34D" } };
    rIdx += 2;

    /* İmza alanı */
    const sigRow = ws.getRow(rIdx);
    sigRow.getCell(1).value = "Kalite Kontrol Müdürü Ad Soyad";
    sigRow.getCell(1).font = { bold: true };
    sigRow.getCell(2).value = kaliteKontrolMuduru || "—";
    sigRow.getCell(4).value = "Ara Kontrolcü Ad Soyad";
    sigRow.getCell(4).font = { bold: true };
    sigRow.getCell(5).value = araKontrolcu || "—";

    ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

    await downloadWorkbook(wb, `ara-kontrol-${selectedDate}.xlsx`);
  }

  /* ══ Render ════════════════════════════════════════════════ */
  if (!authorized) return null;

  const teamLabel = (code: string) => teams.find((t) => t.code === code)?.label ?? code;
  const grandTotal = rows.reduce((acc, r) => acc + sumDefects(r.defects), 0);
  const grandAdet = rows.reduce((acc, r) => acc + r.kontrolEdilenAdet, 0);
  const perDefectTotals = DEFECT_TYPES.map((d) => rows.reduce((acc, r) => acc + (r.defects[d.key] || 0), 0));

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5">
      {/* ─── Üst Bar ─────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ara Kontrol Uygunsuzluk Raporu</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasPermission("prosesKontrol") ? (
              <Link
                href="/proses-kontrol"
                className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50"
              >
                Proses Kontrol
              </Link>
            ) : null}
            <Link
              href="/ara-kontrol/hata-rapor"
              className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Hata Rapor
            </Link>
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              Excel İndir
            </button>
          </div>
        </div>

        {/* Veri girişi yöntemi: otomatik (üretimden çek) / manuel (tek tek ekle) */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Veri Girişi</span>
          <div className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-1 dark:border-slate-600 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => handleModeChange("auto")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === "auto"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Otomatik — Üretimden Çek
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("manual")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === "manual"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Manuel — Tek Tek Ekle
            </button>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {mode === "auto"
              ? "Personel listesi ana ekrandaki üretim kaydından otomatik gelir."
              : "Personel adı ve proses tek tek elle girilir, üretim kaydına bağlı değildir."}
          </span>
        </div>

        {/* İkinci satır: Tarih · Bant/Article/Order · Çalışılan Ürün */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tarih</label>
            <WeekdayDatePicker value={selectedDate} onChange={setSelectedDate} />
          </div>
          <div className="flex min-w-[110px] flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bant No</label>
            <input
              type="text"
              value={bantNo}
              onChange={(e) => updateHeaderField("bantNo", e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex min-w-[130px] flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Article No</label>
            <input
              type="text"
              value={articleNo}
              onChange={(e) => updateHeaderField("articleNo", e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex min-w-[130px] flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Order No</label>
            <input
              type="text"
              value={orderNo}
              onChange={(e) => updateHeaderField("orderNo", e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Çalışılan Ürün — API'den otomatik, bantta dönen model */}
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Çalışılan Ürün
            </label>
            <div className="flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
              {dayMeta?.productModel || dayMeta?.productName ? (
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {[dayMeta.productModel, dayMeta.productName].filter(Boolean).join(" — ")}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">Ana sayfadan ürün seçilmemiş</span>
              )}
            </div>
          </div>

          {/* Personel Ekle / Satır Ekle butonu */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-transparent dark:text-transparent select-none">
              &nbsp;
            </label>
            {mode === "manual" ? (
              <button
                type="button"
                onClick={addFreeRow}
                className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 dark:border-violet-700/60 dark:bg-slate-800 dark:text-violet-300 dark:hover:bg-violet-950/30"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                </svg>
                Satır Ekle
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  showAddForm
                    ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700"
                    : "border-violet-300 bg-white text-violet-700 hover:bg-violet-50 dark:border-violet-700/60 dark:bg-slate-800 dark:text-violet-300 dark:hover:bg-violet-950/30"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                </svg>
                Personel Ekle
              </button>
            )}
          </div>
        </div>

        {/* Personel Ekle Formu */}
        {mode === "auto" && showAddForm && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/20">
            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                Personel
              </label>
              <div className="relative">
                <select
                  value={selectedWId}
                  onChange={(e) => handleWorkerSelect(e.target.value === "" ? "" : Number(e.target.value))}
                  autoFocus
                  className="w-full appearance-none rounded-xl border border-violet-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-violet-500"
                >
                  <option value="">— Personel seçin —</option>
                  {allWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">Bölüm</label>
              <div className="relative">
                <select
                  value={addTeam}
                  onChange={(e) => setAddTeam(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-violet-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-violet-500"
                >
                  {teams.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">Proses (Kritik Operasyon)</label>
              <div className="relative">
                <select
                  value={addProcess}
                  onChange={(e) => setAddProcess(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-violet-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-violet-500"
                >
                  {processes.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleAddWorker}
                disabled={selectedWId === ""}
                className="rounded-xl border border-violet-500 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ekle
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setSelectedWId("");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                İptal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Hata / Yükleniyor ───────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-slate-500 dark:text-slate-400">
          {mode === "manual" ? (
            <>
              <p>Henüz satır eklenmedi.</p>
              <p className="text-xs">Başlamak için yukarıdaki &quot;Satır Ekle&quot; butonunu kullanabilirsiniz.</p>
            </>
          ) : (
            <>
              <p>Bu tarihte üretim kaydı bulunamadı.</p>
              <p className="text-xs">Personel eklemek için yukarıdaki &quot;Personel Ekle&quot; butonunu kullanabilirsiniz.</p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth: 1900 }}>
              <colgroup>
                <col style={{ width: 32 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 55 }} />
                <col style={{ width: 55 }} />
                {DEFECT_TYPES.map((d) => (
                  <col key={d.key} style={{ width: 40 }} />
                ))}
                <col style={{ width: 55 }} />
                <col style={{ width: 55 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 32 }} />
              </colgroup>

              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="border-r border-slate-700 px-1 py-2 text-center font-bold">No</th>
                  <th className="border-r border-slate-700 px-2 py-2 text-left font-bold">Ad Soyad</th>
                  <th className="border-r border-slate-700 px-2 py-2 text-left font-bold" title="Kritik Operasyon (Proses)">
                    Proses
                  </th>
                  <th className="border-r border-slate-700 px-1 py-2 text-center font-bold" title="Bu proses kritik operasyon mu?">
                    Kritik Operasyon
                  </th>
                  <th className="border-r border-slate-700 px-1 py-2 text-center font-bold" title="Operasyon Kontrol Edilen İş Adedi">
                    Kontrol Adedi
                  </th>
                  <th className="border-r border-slate-700 px-1 py-2 text-center font-bold" title="Kontrol Tekrar Sayısı">
                    Tekrar
                  </th>
                  {DEFECT_TYPES.map((d) => (
                    <th
                      key={d.key}
                      className="border-r border-slate-700 px-0.5 py-1.5 text-center align-bottom font-semibold"
                      title={d.label}
                    >
                      <span
                        className="inline-block whitespace-nowrap text-[10px]"
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                      >
                        {d.short}
                      </span>
                    </th>
                  ))}
                  <th className="border-r border-slate-700 px-1 py-2 text-center font-bold">Toplam</th>
                  <th className="border-r border-slate-700 px-1 py-2 text-center font-bold">Hata %</th>
                  <th className="border-r border-slate-700 px-2 py-2 text-left font-bold">Açıklama</th>
                  <th className="px-1 py-2" />
                </tr>
              </thead>

              <tbody>
                {sections.map(({ team, rows: teamRows, startNo }) => (
                  <>
                    {mode === "auto" && (
                      <tr key={`team-${team}`}>
                        <td
                          colSpan={6 + DEFECT_TYPES.length + 4}
                          className="bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                        >
                          {teamLabel(team)}
                        </td>
                      </tr>
                    )}

                    {teamRows.map((row, idx) => {
                      const total = sumDefects(row.defects);
                      const oran = parseFloat(hataOrani(total, row.kontrolEdilenAdet));
                      const oranColor =
                        oran === 0
                          ? "text-emerald-600 font-bold"
                          : oran < 10
                            ? "text-amber-600 font-bold"
                            : "text-red-600 font-bold";

                      return (
                        <tr
                          key={row.workerId}
                          className={`border-b border-slate-200 align-middle transition-colors ${
                            row.manual ? "bg-violet-50/50" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="border-r border-slate-200 px-1 py-2 text-center tabular-nums text-slate-600">
                            {startNo + idx}
                          </td>
                          <td className="border-r border-slate-200 px-2 py-2 font-medium text-slate-900">
                            {mode === "manual" ? (
                              <select
                                value={row.name}
                                onChange={(e) => updateFreeRowWorker(row.workerId, e.target.value)}
                                className="w-full cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium outline-none focus:border-teal-500"
                              >
                                <option value="">— Personel seçin —</option>
                                {row.name && !allWorkers.some((w) => w.name === row.name) && (
                                  <option value={row.name}>{row.name}</option>
                                )}
                                {allWorkers.map((w) => (
                                  <option key={w.id} value={w.name}>
                                    {w.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <>
                                {row.name}
                                {row.manual && (
                                  <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold text-violet-600">
                                    EL
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="border-r border-slate-200 px-2 py-2 text-slate-600">
                            {mode === "manual" ? (
                              <select
                                value={row.process}
                                onChange={(e) => updateFreeRowText(row.workerId, "process", e.target.value)}
                                className="w-full cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-teal-500"
                              >
                                <option value="">— Proses seçin —</option>
                                {row.process && !processes.some((p) => p.name === row.process) && (
                                  <option value={row.process}>{row.process}</option>
                                )}
                                {processes.map((p) => (
                                  <option key={p.name} value={p.name}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              row.process
                            )}
                          </td>
                          <td className="border-r border-slate-200 px-1 py-2 text-center">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={row.kritikOperasyon}
                              title={row.kritikOperasyon ? "Kritik operasyon işaretini kaldır" : "Kritik operasyon olarak işaretle"}
                              onClick={() => updateKritikOperasyon(row.workerId, !row.kritikOperasyon)}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded border transition ${
                                row.kritikOperasyon
                                  ? "border-rose-500 bg-rose-500 text-white"
                                  : "border-slate-300 bg-white text-transparent hover:border-rose-300"
                              }`}
                            >
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
                                <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </td>
                          <td className="border-r border-slate-200 px-1 py-1">
                            <input
                              type="number"
                              min={0}
                              value={row.kontrolEdilenAdet === 0 ? "" : row.kontrolEdilenAdet}
                              placeholder="0"
                              onChange={(e) => updateRowNumber(row.workerId, "kontrolEdilenAdet", e.target.value)}
                              className="w-full rounded border border-slate-300 bg-white py-1 text-center text-xs font-semibold tabular-nums outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="border-r border-slate-200 px-1 py-1">
                            <input
                              type="number"
                              min={0}
                              value={row.kontrolTekrarSayisi === 0 ? "" : row.kontrolTekrarSayisi}
                              placeholder="0"
                              onChange={(e) => updateRowNumber(row.workerId, "kontrolTekrarSayisi", e.target.value)}
                              className="w-full rounded border border-slate-300 bg-white py-1 text-center text-xs font-semibold tabular-nums outline-none focus:border-blue-500"
                            />
                          </td>
                          {DEFECT_TYPES.map((d) => {
                            const v = row.defects[d.key] || 0;
                            return (
                              <td key={d.key} className="border-r border-slate-200 px-0.5 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={v === 0 ? "" : v}
                                  placeholder="0"
                                  onChange={(e) => updateDefect(row.workerId, d.key, e.target.value)}
                                  className={`w-full rounded border py-1 text-center text-xs font-semibold tabular-nums outline-none transition ${
                                    v > 0
                                      ? "border-rose-200 bg-rose-50 text-rose-600 focus:border-rose-400"
                                      : "border-slate-300 bg-white text-slate-400 focus:border-blue-500"
                                  }`}
                                />
                              </td>
                            );
                          })}
                          <td className={`border-r border-slate-200 px-1 py-2 text-center text-sm tabular-nums ${oranColor}`}>
                            {total}
                          </td>
                          <td className={`border-r border-slate-200 px-1 py-2 text-center text-sm tabular-nums ${oranColor}`}>
                            %{hataOrani(total, row.kontrolEdilenAdet)}
                          </td>
                          <td className="border-r border-slate-200 px-2 py-1">
                            <input
                              type="text"
                              value={row.note}
                              onChange={(e) => updateNote(row.workerId, e.target.value)}
                              placeholder="—"
                              className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-slate-600 outline-none placeholder:text-slate-300 focus:border-slate-300 focus:bg-white"
                            />
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button
                              type="button"
                              title={mode === "manual" ? "Satırı sil" : row.manual ? "Listeden kaldır" : "Bu personeli bugünkü listeden çıkar"}
                              onClick={() =>
                                mode === "manual"
                                  ? removeFreeRow(row.workerId)
                                  : handleRemoveWorker(row.workerId, row.manual ?? false)
                              }
                              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                            >
                              Sil
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-slate-800 text-white">
                  <td colSpan={6} className="px-3 py-2.5 text-sm font-bold">
                    TOPLAM
                  </td>
                  {perDefectTotals.map((t, i) => (
                    <td key={DEFECT_TYPES[i].key} className="border-r border-slate-700 py-2.5 text-center text-xs font-bold">
                      {t > 0 ? <span className="text-amber-300">{t}</span> : <span className="text-slate-500">0</span>}
                    </td>
                  ))}
                  <td className="border-r border-slate-700 px-1 py-2.5 text-center text-sm font-bold text-amber-300">{grandTotal}</td>
                  <td className="border-r border-slate-700 px-1 py-2.5 text-center text-sm font-bold text-amber-300">
                    %{hataOrani(grandTotal, grandAdet)}
                  </td>
                  <td colSpan={2} className="px-2 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ─── İmza Alanı ─────────────────────────────────── */}
      <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Kalite Kontrol Müdürü — Ad Soyad
          </label>
          <input
            type="text"
            value={kaliteKontrolMuduru}
            onChange={(e) => updateHeaderField("kaliteKontrolMuduru", e.target.value.toLocaleUpperCase("tr"))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Ara Kontrolcü — Ad Soyad
          </label>
          <input
            type="text"
            value={araKontrolcu}
            onChange={(e) => updateHeaderField("araKontrolcu", e.target.value.toLocaleUpperCase("tr"))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}
