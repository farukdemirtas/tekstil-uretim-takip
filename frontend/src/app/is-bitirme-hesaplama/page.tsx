"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getJobCalcModelWorkerStats,
  getProcesses,
  getProduction,
  getProsesVeriRowsFromServer,
  getTeams,
  getWorkersForAnalytics,
  listProductModels,
  setAuthToken,
  type JobCalcModelWorkerStatsResponse,
  type ProductModelListItem,
} from "@/lib/api";
import { addDaysToIso, clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import {
  computeJobCompletion,
  formatHoursHuman,
  splitWorkingDays,
  type AssignmentInput,
} from "@/lib/jobCompletionCalc";
import { computeJobCost, formatMoneyTr } from "@/lib/jobCompletionCost";
import { deriveWorkerHourlyRateForJobCalc } from "@/lib/jobCompletionWorkerRate";
import CollapsibleSection from "@/components/CollapsibleSection";
import { hasPermission } from "@/lib/permissions";
import {
  buildProsesMapFromVeriRows,
  getProsesMap,
  makeProsesKey,
  setProsesMap as writeProsesMapToLocal,
  type ProsesMap,
} from "@/lib/prosesVeri";
import { downloadIsBitirmeHesaplamaPdf } from "@/lib/exportIsBitirmePdf";
import type { ProductionRow, Worker } from "@/lib/types";

const STORAGE_KEY = "is_bitirme_hesaplama_v1";

type Row = {
  id: string;
  workerId: number | "";
  processName: string;
  /** Model dk satırlarından otomatik; kullanıcı «Ek personel» ile eklenenler manuel */
  source: "model" | "manual";
  /** Manuel satır: hesapta kullanılacak bölüm kodu; boşsa personel kartındaki bölüm */
  manualTeamCode?: string;
};

function randomRowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newManualRow(): Row {
  return { id: randomRowId("manual"), workerId: "", processName: "", source: "manual", manualTeamCode: "" };
}

/** YYYY-MM-DD → gg.aa.yyyy (tr-TR) */
function formatIsoDateTr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** İşin yapıldığı günlerin listesi; çok fazlaysa kısalt */
function formatWorkDatesListTr(datesIso: string[]): string {
  const sorted = [...datesIso].sort();
  const maxShow = 15;
  const head = sorted.slice(0, maxShow).map(formatIsoDateTr);
  const rest = sorted.length - maxShow;
  if (rest <= 0) return head.join(", ");
  return `${head.join(", ")} ve ${rest} gün daha`;
}

/** Model geçmiş tablosunda aynı bölüm+proses eşleşmesi varsa onu, yoksa personel genel satırını kullan */
function historicalEffPctForRow(
  modelStats: JobCalcModelWorkerStatsResponse | null,
  workerId: number,
  team: string,
  process: string
): number | undefined {
  if (!modelStats?.workers?.length) return undefined;
  const procNorm = process.trim();
  const teamNorm = team.trim();
  const exact = modelStats.workers.find(
    (x) =>
      x.workerId === workerId &&
      x.team === teamNorm &&
      x.process.trim() === procNorm &&
      x.effSampleDays > 0 &&
      x.avgEfficiencyPercent != null
  );
  if (exact?.avgEfficiencyPercent != null) return exact.avgEfficiencyPercent;
  const anyStation = modelStats.workers.find(
    (x) => x.workerId === workerId && x.effSampleDays > 0 && x.avgEfficiencyPercent != null
  );
  return anyStation?.avgEfficiencyPercent ?? undefined;
}

function loadDraft(): {
  qty: string;
  hpd: string;
  modelCode?: string;
  rows: Row[];
  fasonUnitPrice?: string;
  workerCount?: string;
  personnelCostPerWorkerDay?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as {
      qty?: string;
      hpd?: string;
      modelCode?: string;
      rows?: unknown[];
      fasonUnitPrice?: string;
      workerCount?: string;
      personnelCostPerWorkerDay?: string;
    };
    if (!j || typeof j !== "object") return null;
    const rows: Row[] = Array.isArray(j.rows)
      ? j.rows.map((r): Row => {
          const o = r as Record<string, unknown>;
          const widRaw = o.workerId;
          const wid: number | "" =
            widRaw === "" || widRaw === null || widRaw === undefined ? "" : Number(widRaw) || "";
          const srcRaw = o.source;
          const source: Row["source"] =
            srcRaw === "manual"
              ? "manual"
              : srcRaw === "model"
                ? "model"
                : wid !== ""
                  ? "model"
                  : "manual";
          const mtc = o.manualTeamCode;
          return {
            id: typeof o.id === "string" ? o.id : randomRowId("draft"),
            workerId: wid,
            processName: typeof o.processName === "string" ? o.processName : "",
            source,
            manualTeamCode: typeof mtc === "string" ? mtc : source === "manual" ? "" : undefined,
          };
        })
      : [];
    return {
      qty: typeof j.qty === "string" ? j.qty : String(j.qty ?? ""),
      hpd: typeof j.hpd === "string" ? j.hpd : String(j.hpd ?? ""),
      modelCode: typeof j.modelCode === "string" ? j.modelCode : undefined,
      rows,
      fasonUnitPrice: typeof j.fasonUnitPrice === "string" ? j.fasonUnitPrice : undefined,
      workerCount: typeof j.workerCount === "string" ? j.workerCount : undefined,
      personnelCostPerWorkerDay:
        typeof j.personnelCostPerWorkerDay === "string" ? j.personnelCostPerWorkerDay : undefined,
    };
  } catch {
    return null;
  }
}

export default function IsBitirmeHesaplamaPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [teamMeta, setTeamMeta] = useState<Array<{ code: string; label: string }>>([]);
  const [processNames, setProcessNames] = useState<string[]>([]);
  const [productModels, setProductModels] = useState<ProductModelListItem[]>([]);
  const [selectedModelCode, setSelectedModelCode] = useState<string>("");
  const [modelProsesMap, setModelProsesMap] = useState<ProsesMap>({});
  const [modelMapLoading, setModelMapLoading] = useState(false);
  const [modelMapErr, setModelMapErr] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string>("");
  const [quantity, setQuantity] = useState("10000");
  const [hoursPerDay, setHoursPerDay] = useState("9");
  const [fasonUnitPrice, setFasonUnitPrice] = useState("");
  const [workerCount, setWorkerCount] = useState("");
  const [personnelCostPerWorkerDay, setPersonnelCostPerWorkerDay] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [productionRows, setProductionRows] = useState<ProductionRow[]>([]);
  const [productionErr, setProductionErr] = useState<string>("");
  const [productionLoading, setProductionLoading] = useState(false);
  const [modelStats, setModelStats] = useState<JobCalcModelWorkerStatsResponse | null>(null);
  const [modelStatsLoading, setModelStatsLoading] = useState(false);
  const [modelStatsErr, setModelStatsErr] = useState<string>("");
  const [pdfBusy, setPdfBusy] = useState(false);
  /** Model listesinden «Kaldır» ile çıkarılan personel (aynı modelde yeniden eklenmez) */
  const excludedModelWorkerIdsRef = useRef<Set<number>>(new Set());

  /** Üretim + model verim penceresi bitişi: her zaman bugün (iş günü). Ayrı referans tarihi seçimi yok. */
  const efficiencyDateIso = clampToWeekdayIso(todayWeekdayIso());

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("isBitirmeHesaplama")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    const draft = loadDraft();
    if (draft) {
      if (draft.qty) setQuantity(draft.qty);
      if (draft.hpd) setHoursPerDay(draft.hpd);
      if (draft.fasonUnitPrice) setFasonUnitPrice(draft.fasonUnitPrice);
      if (draft.workerCount) setWorkerCount(draft.workerCount);
      if (draft.personnelCostPerWorkerDay) setPersonnelCostPerWorkerDay(draft.personnelCostPerWorkerDay);
      if (draft.rows.length > 0) setRows(draft.rows);
    }
    void Promise.all([getWorkersForAnalytics(), getTeams(), getProcesses(), listProductModels()])
      .then(([w, teams, proc, mds]) => {
        /* Kişi analizi ile aynı kapsam: aktif + üretim geçmişi olan pasif kayıtlar */
        setWorkers(w);
        setTeamMeta(
          teams.map((t) => ({ code: t.code, label: t.label })).sort((a, b) => a.label.localeCompare(b.label, "tr"))
        );
        setProcessNames(proc.map((p) => p.name).filter(Boolean));
        setProductModels(mds);
        const fromDraft =
          draft?.modelCode && mds.some((m) => m.modelCode === draft.modelCode) ? draft.modelCode : "";
        setSelectedModelCode(fromDraft || mds[0]?.modelCode || "");
      })
      .catch(() => setLoadErr("Personel, proses veya ürün modeli listesi yüklenemedi."));
  }, []);

  useEffect(() => {
    if (!selectedModelCode) {
      setModelProsesMap({});
      setModelMapErr("");
      setModelMapLoading(false);
      return;
    }
    let cancelled = false;
    setModelMapLoading(true);
    setModelMapErr("");
    void getProsesVeriRowsFromServer(selectedModelCode)
      .then((serverRows) => {
        if (cancelled) return;
        const map = buildProsesMapFromVeriRows(serverRows);
        setModelProsesMap(map);
        try {
          writeProsesMapToLocal(map, selectedModelCode);
        } catch {
          /* quota */
        }
        if (Object.keys(map).length === 0) {
          setModelMapErr("Bu model için sunucuda dk satırı yok; Model arşivinde tanımlayın.");
        } else {
          setModelMapErr("");
        }
      })
      .catch(() => {
        if (cancelled) return;
        const local = getProsesMap(selectedModelCode);
        setModelProsesMap(local);
        if (Object.keys(local).length === 0) {
          setModelMapErr("Proses verisi alınamadı ve yerel önbellekte bu model yok.");
        } else {
          setModelMapErr("");
        }
      })
      .finally(() => {
        if (!cancelled) setModelMapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModelCode]);

  useEffect(() => {
    setProductionLoading(true);
    setProductionErr("");
    void getProduction(efficiencyDateIso)
      .then((r) => setProductionRows(r))
      .catch(() => {
        setProductionRows([]);
        setProductionErr("Bugünkü üretim verisi alınamadı.");
      })
      .finally(() => setProductionLoading(false));
  }, [efficiencyDateIso]);

  const selectedModelId = useMemo(() => {
    return productModels.find((m) => m.modelCode === selectedModelCode)?.id ?? null;
  }, [productModels, selectedModelCode]);

  useEffect(() => {
    if (!selectedModelCode || selectedModelId == null) {
      setModelStats(null);
      setModelStatsErr("");
      setModelStatsLoading(false);
      return;
    }
    const end = efficiencyDateIso;
    const start = addDaysToIso(end, -180);
    let cancelled = false;
    setModelStatsLoading(true);
    setModelStatsErr("");
    void getJobCalcModelWorkerStats({
      modelId: selectedModelId,
      modelCode: selectedModelCode,
      startDate: start,
      endDate: end,
    })
      .then((data) => {
        if (!cancelled) setModelStats(data);
      })
      .catch(() => {
        if (!cancelled) {
          setModelStats(null);
          setModelStatsErr("Model bazlı verim özeti alınamadı (günlük meta model_id eşleşmesi veya ağ).");
        }
      })
      .finally(() => {
        if (!cancelled) setModelStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModelCode, selectedModelId, efficiencyDateIso]);

  const persist = useCallback(
    (
      q: string,
      hpd: string,
      r: Row[],
      modelCode: string,
      cost?: { fasonUnitPrice: string; workerCount: string; personnelCostPerWorkerDay: string }
    ) => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            qty: q,
            hpd,
            modelCode: modelCode || undefined,
            rows: r,
            fasonUnitPrice: cost?.fasonUnitPrice || undefined,
            workerCount: cost?.workerCount || undefined,
            personnelCostPerWorkerDay: cost?.personnelCostPerWorkerDay || undefined,
          })
        );
      } catch {
        /* ignore */
      }
    },
    []
  );

  const persistAll = useCallback(
    (q: string, hpd: string, r: Row[], modelCode: string) => {
      persist(q, hpd, r, modelCode, {
        fasonUnitPrice,
        workerCount,
        personnelCostPerWorkerDay,
      });
    },
    [persist, fasonUnitPrice, workerCount, personnelCostPerWorkerDay]
  );

  /**
   * Otomatik satırlar: yalnızca bu modelde günlük meta (model_id) + üretim kaydı olan personel
   * (`getJobCalcModelWorkerStats` / «Bu modelde geçmiş verimler» ile aynı küme), dk tablosunda
   * mevcut bölüm+proses ile filtrelenir. Manuel satırlar korunur.
   */
  useEffect(() => {
    if (modelMapLoading || !selectedModelCode || selectedModelId == null) return;

    const statsAligned =
      modelStats != null &&
      !modelStatsLoading &&
      modelStats.modelCode === selectedModelCode &&
      modelStats.modelId === selectedModelId;

    const allowedWorkerIds = new Set(
      statsAligned ? modelStats.workers.map((x) => x.workerId) : [],
    );

    const map = modelProsesMap;
    const keys = Object.keys(map);

    setRows((prev) => {
      const manual = prev.filter((r) => r.source === "manual");
      let modelRows: Row[] = [];
      if (keys.length > 0 && statsAligned) {
        const matching = workers.filter((w) => {
          if (excludedModelWorkerIdsRef.current.has(w.id)) return false;
          if (!allowedWorkerIds.has(w.id)) return false;
          const dk = map[makeProsesKey(w.team, w.process)];
          return dk != null && String(dk).trim() !== "" && Number(String(dk).replace(",", ".")) > 0;
        });
        matching.sort(
          (a, b) =>
            a.team.localeCompare(b.team, "tr") ||
            a.process.localeCompare(b.process, "tr") ||
            a.name.localeCompare(b.name, "tr")
        );
        if (matching.length > 0) {
          modelRows = matching.map((w) => ({
            id: `model-${w.id}-${selectedModelCode}`,
            workerId: w.id,
            processName: w.process,
            source: "model" as const,
          }));
        }
      }
      const next = [...modelRows, ...manual];
      persistAll(quantity, hoursPerDay, next, selectedModelCode);
      return next;
    });
  }, [
    selectedModelCode,
    selectedModelId,
    modelProsesMap,
    modelMapLoading,
    workers,
    persist,
    persistAll,
    modelStats,
    modelStatsLoading,
  ]);

  const productionByWorkerId = useMemo(
    () => new Map(productionRows.map((r) => [r.workerId, r])),
    [productionRows]
  );

  const todayIso = todayWeekdayIso();

  const processesForTeamInModel = useCallback(
    (teamCode: string) => {
      const tc = teamCode.trim();
      if (!tc) return processNames;
      return processNames.filter((name) => {
        const dk = modelProsesMap[makeProsesKey(tc, name)];
        return dk != null && String(dk).trim() !== "" && Number(String(dk).replace(",", ".")) > 0;
      });
    },
    [processNames, modelProsesMap]
  );

  const rowDerived = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof deriveWorkerHourlyRateForJobCalc>
    >();
    for (const row of rows) {
      if (row.workerId === "") continue;
      const w = workers.find((x) => x.id === row.workerId);
      if (!w) continue;
      const teamForCalc =
        row.source === "manual" ? (row.manualTeamCode?.trim() || w.team) : w.team;
      const proc = row.processName.trim() || w.process;
      const prod = productionByWorkerId.get(row.workerId);
      const hist = historicalEffPctForRow(modelStats, row.workerId, teamForCalc, proc);
      map.set(
        row.id,
        deriveWorkerHourlyRateForJobCalc(
          teamForCalc,
          proc,
          modelProsesMap,
          prod,
          efficiencyDateIso,
          todayIso,
          hist !== undefined ? hist : undefined
        )
      );
    }
    return map;
  }, [rows, workers, productionByWorkerId, modelProsesMap, efficiencyDateIso, todayIso, modelStats]);

  const assignments: AssignmentInput[] = useMemo(() => {
    const out: AssignmentInput[] = [];
    for (const row of rows) {
      if (row.workerId === "") continue;
      const w = workers.find((x) => x.id === row.workerId);
      if (!w) continue;
      const derived = rowDerived.get(row.id);
      if (!derived || !derived.ok) continue;
      if (derived.effectivePerHour <= 0) continue;
      const name = w.name?.trim() ?? "";
      const processName = row.processName.trim() || w.process;
      out.push({
        workerId: row.workerId,
        workerName: name,
        processName,
        ratePerHour: derived.effectivePerHour,
      });
    }
    return out;
  }, [rows, workers, rowDerived]);

  const qtyNum = Number(String(quantity).replace(/\s/g, "").replace(",", "."));
  const hpdNum = Number(String(hoursPerDay).replace(",", "."));
  const result = useMemo(
    () =>
      computeJobCompletion(qtyNum, assignments, {
        hoursPerWorkday: hpdNum,
        modelPace:
          modelStats &&
          modelStats.modelMetaDayCount > 0 &&
          modelStats.completedGenelTotal > 0
            ? {
                completedGenelTotal: modelStats.completedGenelTotal,
                modelMetaDayCount: modelStats.modelMetaDayCount,
                overallAvgEfficiencyPercent: modelStats.overallAvgEfficiencyPercent,
              }
            : null,
      }),
    [qtyNum, assignments, hpdNum, modelStats],
  );
  const split = result ? splitWorkingDays(result.totalHoursBottleneck, hpdNum) : splitWorkingDays(0, hpdNum);
  const splitSeq = result ? splitWorkingDays(result.sequentialNoWipHours, hpdNum) : splitWorkingDays(0, hpdNum);

  const jobWorkDays = useMemo(() => {
    if (!result || !Number.isFinite(hpdNum) || hpdNum <= 0) return 0;
    return result.totalHoursBottleneck / hpdNum;
  }, [result, hpdNum]);

  const workerCountNum = Number(String(workerCount).replace(/\s/g, "").replace(",", "."));

  const fasonUnitNum = Number(String(fasonUnitPrice).replace(/\s/g, "").replace(",", "."));
  const personnelDayNum = Number(String(personnelCostPerWorkerDay).replace(/\s/g, "").replace(",", "."));

  const costResult = useMemo(
    () =>
      result
        ? computeJobCost({
            quantity: qtyNum,
            fasonUnitPrice: fasonUnitNum,
            workerCount: workerCountNum,
            personnelCostPerWorkerDay: personnelDayNum,
            jobWorkDays,
          })
        : null,
    [result, qtyNum, fasonUnitNum, workerCountNum, personnelDayNum, jobWorkDays]
  );

  function onFasonUnitPriceChange(v: string) {
    setFasonUnitPrice(v);
    persist(quantity, hoursPerDay, rows, selectedModelCode, {
      fasonUnitPrice: v,
      workerCount,
      personnelCostPerWorkerDay,
    });
  }

  function onWorkerCountChange(v: string) {
    setWorkerCount(v);
    persist(quantity, hoursPerDay, rows, selectedModelCode, {
      fasonUnitPrice,
      workerCount: v,
      personnelCostPerWorkerDay,
    });
  }

  function onPersonnelCostChange(v: string) {
    setPersonnelCostPerWorkerDay(v);
    persist(quantity, hoursPerDay, rows, selectedModelCode, {
      fasonUnitPrice,
      workerCount,
      personnelCostPerWorkerDay: v,
    });
  }

  const duplicateWorkers = useMemo(() => {
    const ids = assignments.map((a) => a.workerId);
    const s = new Set<number>();
    const d = new Set<number>();
    for (const id of ids) {
      if (s.has(id)) d.add(id);
      s.add(id);
    }
    return d;
  }, [assignments]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      persistAll(quantity, hoursPerDay, next, selectedModelCode);
      return next;
    });
  }

  function addRow() {
    setRows((prev) => {
      const next = [...prev, newManualRow()];
      persistAll(quantity, hoursPerDay, next, selectedModelCode);
      return next;
    });
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row?.source === "model" && typeof row.workerId === "number") {
        excludedModelWorkerIdsRef.current.add(row.workerId);
      }
      const next = prev.filter((r) => r.id !== id);
      persistAll(quantity, hoursPerDay, next, selectedModelCode);
      return next;
    });
  }

  function onQuantityChange(v: string) {
    setQuantity(v);
    persistAll(v, hoursPerDay, rows, selectedModelCode);
  }

  function onHpdChange(v: string) {
    setHoursPerDay(v);
    persistAll(quantity, v, rows, selectedModelCode);
  }

  function onModelChange(code: string) {
    excludedModelWorkerIdsRef.current.clear();
    setSelectedModelCode(code);
    persistAll(quantity, hoursPerDay, rows, code);
  }

  async function handleDownloadResultPdf() {
    if (!result) return;
    setPdfBusy(true);
    try {
      await downloadIsBitirmeHesaplamaPdf({
        result,
        split,
        splitSeq,
        modelCode: selectedModelCode,
        productName: selectedModelLabel,
        quantityLabel: quantity,
        referenceDate: efficiencyDateIso,
        hoursPerDayLabel: hoursPerDay,
        costResult,
        fasonUnitPriceLabel: fasonUnitPrice,
        workerCountLabel: workerCount,
        personnelCostLabel: personnelCostPerWorkerDay,
      });
    } catch {
      /* kullanıcı iptal / tarayıcı engeli */
    } finally {
      setPdfBusy(false);
    }
  }

  const selectedModelLabel = useMemo(
    () => productModels.find((m) => m.modelCode === selectedModelCode)?.productName ?? selectedModelCode,
    [productModels, selectedModelCode],
  );

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 text-slate-800 dark:text-slate-100">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">İş Hesaplama</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Hedef adedi girin; <strong className="font-semibold text-slate-800 dark:text-slate-200">ürün modeli</strong> seçin —
            <strong className="font-semibold text-slate-800 dark:text-slate-200"> Bu modelde</strong> günlük kayıtta model seçilmiş günlerde üretim girişi olan
            personel otomatik listelenir (aşağıdaki özet tablo ile aynı küme); başka personel için{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">Ek personel satırı</strong> kullanın. Önce{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">            günlük meta bu modele işaretlenmiş</strong> geçmiş
            günlerdeki ortalama verim kullanılır (özet tablo); yoksa bugünkü üretim satırı veya %100 hedef. Süre, bu modelde
            yapılan iş (günlük ortalama genel tamamlanan) ve ortalama verim verisine göre belirlenir; model geçmişi yoksa
            listelenen personelin saatlik verimleri toplanır.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Üretim ekranı
        </Link>
      </header>

      {loadErr ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {loadErr}
        </p>
      ) : null}
      {productionErr ? (
        <p className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {productionErr}
        </p>
      ) : null}

      <section className="surface-card mb-6 space-y-4 p-5 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Genel</h2>
        {productModels.length === 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Henüz tanımlı ürün modeli yok. Dk tabloları için sistemde model oluşturulmalı (Ayarlar / Model arşivi).
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ürün modeli (dk kaynağı)
            </span>
            <select
              value={selectedModelCode}
              onChange={(e) => onModelChange(e.target.value)}
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
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Hedef adet (Q)</span>
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Gün başına çalışma (saat)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={hoursPerDay}
              onChange={(e) => onHpdChange(e.target.value)}
              className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
        <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/80 via-white to-slate-50/50 p-4 dark:border-violet-900/40 dark:from-violet-950/30 dark:via-slate-900 dark:to-slate-950">
          <h3 className="text-xs font-bold uppercase tracking-wide text-violet-800 dark:text-violet-300">Maliyet / fason fiyat</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Fason birim fiyatı, işçi sayısı ve iş günü başına personel gideri ile tahmini süreye göre gelir, gider ve kar/zarar
            hesaplanır.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Fason birim fiyat (₺/adet)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={fasonUnitPrice}
                onChange={(e) => onFasonUnitPriceChange(e.target.value)}
                placeholder="0"
                className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Çalışan sayısı
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={workerCount}
                onChange={(e) => onWorkerCountChange(e.target.value)}
                placeholder="0"
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Personel gideri (₺/işçi/iş günü)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={personnelCostPerWorkerDay}
                onChange={(e) => onPersonnelCostChange(e.target.value)}
                placeholder="0"
                className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
        </div>
        {modelStats && !modelStatsLoading ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <span className="text-slate-600 dark:text-slate-400">Bu modelde tamamlanan iş (genel):</span>{" "}
            <span className="font-semibold tabular-nums text-teal-700 dark:text-teal-400">
              {(modelStats.completedGenelTotal ?? 0).toLocaleString("tr-TR")} adet
            </span>
            {modelStats.modelMetaDayCount != null && modelStats.modelMetaDayCount > 0 ? (
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {" "}
                ({modelStats.modelMetaDayCount} iş günü
                {modelStats.modelWorkDates && modelStats.modelWorkDates.length > 0
                  ? `: ${formatWorkDatesListTr(modelStats.modelWorkDates)}`
                  : null}
                )
              </span>
            ) : (
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {" "}
                (seçili dönemde bu modele ait günlük kayıt yok)
              </span>
            )}
          </p>
        ) : modelStatsLoading && selectedModelCode ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Tamamlanan iş toplamı hesaplanıyor…</p>
        ) : null}
        {modelMapErr ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {selectedModelLabel}: {modelMapErr}
          </p>
        ) : null}
        {modelMapLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Model dk tablosu yükleniyor… ({selectedModelLabel || selectedModelCode})
          </p>
        ) : null}
        {productionLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Üretim satırları yükleniyor…</p>
        ) : null}
      </section>

      <section className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={!result || pdfBusy}
            onClick={() => void handleDownloadResultPdf()}
            className="rounded-lg border border-teal-700/40 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-900 shadow-sm transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-700/50 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-900/50"
          >
            {pdfBusy ? "PDF hazırlanıyor…" : "Sonucu PDF indir"}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/90 via-white to-fuchsia-50/40 shadow-[0_4px_24px_-4px_rgba(91,33,182,0.12)] dark:border-violet-900/50 dark:from-violet-950/40 dark:via-slate-900 dark:to-fuchsia-950/20">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600" aria-hidden />
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Maliyet özeti</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Gelir − personel gideri (işçi × gün × iş günü süresi)
                </p>
              </div>
              {costResult ? (
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
                    costResult.isProfit === true
                      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200"
                      : costResult.isProfit === false
                        ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300 dark:bg-rose-950/60 dark:text-rose-200"
                        : "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {costResult.isProfit === true ? "Kar" : costResult.isProfit === false ? "Zarar" : "Başabaş"}
                </span>
              ) : null}
            </div>
            {!result || !costResult ? (
              <p className="mt-5 rounded-xl border border-dashed border-violet-200/80 bg-white/60 px-4 py-6 text-center text-sm text-slate-500 dark:border-violet-900/40 dark:bg-slate-900/30 dark:text-slate-400">
                Süre hesabı, fason birim fiyatı, çalışan sayısı ve personel gideri girildiğinde kar/zarar burada görünür.
              </p>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200/90 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tahmini süre</p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {jobWorkDays.toFixed(2)} <span className="text-sm font-semibold text-slate-500">iş günü</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatHoursHuman(result.totalHoursBottleneck)}</p>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gelir (fason)</p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatMoneyTr(costResult.revenue)} ₺
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {qtyNum.toLocaleString("tr-TR")} adet × {formatMoneyTr(fasonUnitNum)} ₺
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Personel gideri</p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatMoneyTr(costResult.personnelCost)} ₺
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">
                    {workerCountNum} işçi × {formatMoneyTr(personnelDayNum)} ₺/gün × {jobWorkDays.toFixed(2)} gün
                  </p>
                </div>
                <div
                  className={`rounded-xl border p-4 ${
                    costResult.isProfit === true
                      ? "border-emerald-300/80 bg-emerald-50/90 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : costResult.isProfit === false
                        ? "border-rose-300/80 bg-rose-50/90 dark:border-rose-900 dark:bg-rose-950/40"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Net sonuç
                  </p>
                  <p
                    className={`mt-2 text-xl font-black tabular-nums ${
                      costResult.isProfit === true
                        ? "text-emerald-800 dark:text-emerald-200"
                        : costResult.isProfit === false
                          ? "text-rose-800 dark:text-rose-200"
                          : "text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {costResult.margin >= 0 ? "+" : ""}
                    {formatMoneyTr(costResult.margin)} ₺
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                    Adet başı: {formatMoneyTr(costResult.marginPerPiece)} ₺
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/40 shadow-[0_4px_24px_-4px_rgba(13,148,136,0.1)] dark:border-teal-900/50 dark:from-teal-950/40 dark:via-slate-900 dark:to-emerald-950/20">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-600 via-emerald-500 to-teal-600"
              aria-hidden
            />
            <div className="p-5 pt-6 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Model özeti</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Seçili model ve geçmiş üretim verisi
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full bg-teal-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-800 ring-1 ring-teal-600/15 dark:bg-teal-950/80 dark:text-teal-200 dark:ring-teal-500/30">
                  Model
                </span>
              </div>
              {!selectedModelCode ? (
                <div className="mt-6 rounded-xl border border-dashed border-teal-200/80 bg-white/60 px-4 py-8 text-center dark:border-teal-900/40 dark:bg-slate-900/30">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Ürün modeli seçildiğinde özet burada görünür.</p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-teal-200/70 bg-white/80 p-4 dark:border-teal-900/40 dark:bg-slate-900/50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">Seçili model</p>
                    <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{selectedModelLabel}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{selectedModelCode}</p>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Hedef adet (Q)</dt>
                        <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                          {qtyNum > 0 ? qtyNum.toLocaleString("tr-TR") : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Verim referans tarihi</dt>
                        <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{efficiencyDateIso}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Gün başına çalışma</dt>
                        <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{hpdNum} saat</dd>
                      </div>
                    </dl>
                  </div>
                  {modelStatsLoading ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Model geçmişi yükleniyor…</p>
                  ) : modelStats ? (
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Geçmiş üretim (180 gün)
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm text-slate-800 dark:text-slate-200">
                        <li className="flex justify-between gap-3">
                          <span className="text-slate-500 dark:text-slate-400">Tamamlanan iş (genel)</span>
                          <span className="font-semibold tabular-nums text-teal-800 dark:text-teal-200">
                            {(modelStats.completedGenelTotal ?? 0).toLocaleString("tr-TR")} adet
                          </span>
                        </li>
                        <li className="flex justify-between gap-3">
                          <span className="text-slate-500 dark:text-slate-400">Kayıtlı iş günü</span>
                          <span className="font-semibold tabular-nums">{modelStats.modelMetaDayCount ?? "—"}</span>
                        </li>
                        {modelStats.overallAvgEfficiencyPercent != null ? (
                          <li className="flex justify-between gap-3">
                            <span className="text-slate-500 dark:text-slate-400">Ort. verimlilik</span>
                            <span className="font-semibold tabular-nums">%{modelStats.overallAvgEfficiencyPercent}</span>
                          </li>
                        ) : null}
                        <li className="text-[11px] text-slate-500 dark:text-slate-400">
                          {modelStats.startDate} → {modelStats.endDate}
                        </li>
                      </ul>
                    </div>
                  ) : null}
                  {result ? (
                    <div className="rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50/80 via-white to-emerald-50/60 p-4 dark:border-teal-800/50 dark:from-teal-950/40 dark:via-slate-900 dark:to-emerald-950/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                        Hesap kaynağı
                      </p>
                      {result.durationMode === "model_genel_pace" ? (
                        <ul className="mt-2 space-y-1 text-sm text-slate-800 dark:text-slate-200">
                          <li>
                            <span className="text-slate-500 dark:text-slate-400">Günlük ort. genel:</span>{" "}
                            <span className="font-semibold tabular-nums text-teal-800 dark:text-teal-200">
                              {result.modelAvgDailyGenel != null
                                ? `${result.modelAvgDailyGenel.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} adet/gün`
                                : "—"}
                            </span>
                          </li>
                          <li>
                            <span className="text-slate-500 dark:text-slate-400">Personel ort. verim:</span>{" "}
                            <span className="font-semibold tabular-nums">
                              {result.modelOverallEfficiencyPercent != null
                                ? `%${result.modelOverallEfficiencyPercent}`
                                : "—"}
                            </span>
                          </li>
                          <li className="pt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                            Süre tahmini, bu modelin geçmişteki günlük genel tamamlanan ortalamasına dayanır.
                          </li>
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          Model geçmişi yetersiz; hız hesabı seçili personelin efektif adet/saat toplamına göre yapılır.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/20 dark:text-slate-400">
                      Personel satırları hazır olunca hesap kaynağı burada görünür.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-50/90 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.1)] dark:border-slate-700/90 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:shadow-black/25">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-600"
              aria-hidden
            />
            <div className="p-5 pt-6 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Sonuç</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Tahmini süre, iş günü ve ortalama tempo
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full bg-teal-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-800 ring-1 ring-teal-600/15 dark:bg-teal-950/80 dark:text-teal-200 dark:ring-teal-500/30">
                  Özet
                </span>
              </div>
              {!result ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-800/20">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Geçerli hedef adet ve personel satırları hazır olduğunda süre ve tempo burada görünür.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="relative overflow-hidden rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50/90 p-4 shadow-sm dark:border-teal-800/50 dark:from-teal-950/50 dark:via-slate-900 dark:to-emerald-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                      Tahmini bitiş süresi
                    </p>
                    <p className="mt-2 text-2xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">
                      {split.fullDays}{" "}
                      <span className="text-lg font-bold text-slate-600 dark:text-slate-300">iş günü</span>
                      {split.remainderHours > 0.01 ? (
                        <>
                          {" "}
                          + {split.remainderHours.toFixed(2)}{" "}
                          <span className="text-lg font-bold text-slate-600 dark:text-slate-300">sa</span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-2 text-sm tabular-nums text-slate-600 dark:text-slate-400">
                      {formatHoursHuman(result.totalHoursBottleneck)} · yaklaşık{" "}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {(result.totalHoursBottleneck / split.hoursPerWorkday).toFixed(2)}
                      </span>{" "}
                      iş günü ({split.hoursPerWorkday} sa/gün)
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Hat hızı
                      </p>
                      <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                        {Math.round(result.lineThroughputPerHour * 100) / 100}
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400"> adet/sa</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Günlük ortalama
                      </p>
                      <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                        {Math.round(result.lineThroughputPerHour * split.hoursPerWorkday * 100) / 100}
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400"> adet/gün</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Toplam süre
                      </p>
                      <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                        {formatHoursHuman(result.totalHoursBottleneck)}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/90 bg-white/80 p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Ortalama çalışma temposu
                    </p>
                    {result.durationMode === "model_genel_pace" ? (
                      <p className="mt-2">
                        Hat, model geçmişindeki günlük ortalama genel tamamlanan hızına göre çalışır. Günde yaklaşık{" "}
                        <strong className="font-semibold tabular-nums text-teal-800 dark:text-teal-200">
                          {Math.round(result.lineThroughputPerHour * split.hoursPerWorkday * 100) / 100} adet
                        </strong>{" "}
                        üretim ve{" "}
                        <strong className="font-semibold tabular-nums">{split.hoursPerWorkday} saat</strong> çalışma temposu
                        varsayılır. {qtyNum.toLocaleString("tr-TR")} adetlik iş{" "}
                        <strong className="font-semibold tabular-nums">{split.fullDays}</strong> tam iş günü
                        {split.remainderHours > 0.01 ? (
                          <> + {split.remainderHours.toFixed(2)} sa</>
                        ) : null}{" "}
                        içinde tamamlanır.
                      </p>
                    ) : (
                      <p className="mt-2">
                        Seçili personelin toplam saatlik verimi ile paralel çalışma varsayımı kullanılır. Hat hızı{" "}
                        <strong className="font-semibold tabular-nums">
                          {Math.round(result.lineThroughputPerHour * 100) / 100} adet/sa
                        </strong>
                        , günde yaklaşık{" "}
                        <strong className="font-semibold tabular-nums">
                          {Math.round(result.lineThroughputPerHour * split.hoursPerWorkday * 100) / 100} adet
                        </strong>{" "}
                        üretim beklenir. İş{" "}
                        <strong className="font-semibold tabular-nums">{split.fullDays}</strong> tam iş günü
                        {split.remainderHours > 0.01 ? (
                          <> + {split.remainderHours.toFixed(2)} sa</>
                        ) : null}{" "}
                        sürer.
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:from-slate-800/50 dark:to-slate-900/50 dark:text-slate-400">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Karşılaştırma
                    </p>
                    <p className="mt-2">
                      {result.durationMode === "model_genel_pace" ? (
                        <>
                          Ana süre model geçmişine göre{" "}
                          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {result.totalHoursBottleneck.toFixed(2)} sa
                          </span>
                          . Ardışık aşama (her proses tüm Q&apos;yu tek başına bitirir):{" "}
                          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {result.sequentialNoWipHours.toFixed(2)} sa
                          </span>{" "}
                          — yaklaşık{" "}
                          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {splitSeq.fullDays} gün + {splitSeq.remainderHours.toFixed(2)} sa
                          </span>
                          .
                        </>
                      ) : (
                        <>
                          Ana süre personel toplamına göre{" "}
                          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {result.totalHoursBottleneck.toFixed(2)} sa
                          </span>
                          . Ardışık aşama:{" "}
                          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {result.sequentialNoWipHours.toFixed(2)} sa
                          </span>{" "}
                          — yaklaşık{" "}
                          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {splitSeq.fullDays} gün + {splitSeq.remainderHours.toFixed(2)} sa
                          </span>
                          .
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/30 to-white shadow-[0_4px_24px_-4px_rgba(15,23,42,0.1)] dark:border-slate-700/90 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:shadow-black/25">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-slate-500 via-slate-400 to-teal-500 opacity-90 dark:from-slate-600 dark:via-slate-500 dark:to-teal-600"
            aria-hidden
          />
          <div className="p-5 pt-6 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Proses detayı</h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Aşama bazında süre ve personel verimleri
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-slate-300/50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/50">
                {result ? `${result.processes.length} aşama` : "—"}
              </span>
            </div>
            {!result ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/20 dark:text-slate-400">
                Hesap sonucu oluşunca proses listesi burada görünür.
              </div>
            ) : (
              <ul className="mt-5 max-h-[min(28rem,55vh)] space-y-2.5 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                {result.processes.map((p) => {
                  const hoursOnly = result.quantity / p.totalRatePerHour;
                  const rate = Math.round(p.totalRatePerHour * 100) / 100;
                  return (
                    <li
                      key={p.processKey}
                      className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 pl-3.5 transition-shadow hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-600"
                    >
                      <div
                        className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-slate-200 dark:bg-slate-600"
                        aria-hidden
                      />
                      <div className="py-3.5 pl-4 pr-3 sm:pl-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.processKey}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                            <span className="rounded-md bg-slate-100 px-2 py-1 tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              Σ {rate} /sa
                            </span>
                            <span className="rounded-md border border-slate-200/90 bg-white px-2 py-1 tabular-nums text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                              {hoursOnly.toFixed(2)} sa
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          {p.lines.map((l, idx) => (
                            <span key={`${p.processKey}-${idx}-${l.workerName}`}>
                              <span className="font-medium text-slate-600 dark:text-slate-300">{l.workerName}</span>
                              <span className="tabular-nums text-slate-400"> ({l.ratePerHour}/sa)</span>
                              {idx < p.lines.length - 1 ? (
                                <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                              ) : null}
                            </span>
                          ))}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <CollapsibleSection
        title="Bu modelde geçmiş verimler"
        description="Model meta günlerinde personel verim geçmişi — hesapta öncelikli kaynak."
        badge={modelStats?.workers.length ? `${modelStats.workers.length} kayıt` : undefined}
        defaultOpen={false}
      >
        <div className="space-y-3">
          {modelStats ? (
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {modelStats.startDate} → {modelStats.endDate} (bugüne kadar 180 gün)
            </span>
          ) : null}
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Günlük ürün kaydında{" "}
            <strong className="font-medium text-slate-600 dark:text-slate-300">bu model_id</strong> ile işaretlenmiş
            tarihlerde, aynı modelin dk tablosundaki bölüm+proses istasyonunda kaydı olan personel için ortalama verim (günlük adet ÷
            dk×60×9) hesaplanır. Bu ortalama aşağıda listelenir;{" "}
            <strong className="font-medium">İş hesabında önce bu değer</strong> kullanılır. Personelde geçmiş örnek yoksa bugünkü
            üretim verimliliği veya hedef hız devreye girer.
          </p>
        {modelStatsErr ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">{modelStatsErr}</p>
        ) : null}
        {modelStatsLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Model verim özeti yükleniyor…</p>
        ) : null}
        {modelStats && modelStats.workers.length === 0 && !modelStatsLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bu dönemde bu modele bağlı günlük meta veya uygun üretim kaydı yok. Hedef oturumu uygulayın veya her iş günü ürün meta
            alanını bu model ile kaydedin.
          </p>
        ) : null}
        {modelStats && modelStats.workers.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Tablodaki personel ortalaması (verisi olanlar):{" "}
              <span className="font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                {modelStats.overallAvgEfficiencyPercent != null
                  ? `%${modelStats.overallAvgEfficiencyPercent}`
                  : "—"}
              </span>
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                    <th className="py-2 px-3 font-medium">Personel</th>
                    <th className="py-2 px-3 font-medium">Bölüm</th>
                    <th className="py-2 px-3 font-medium">Proses</th>
                    <th className="py-2 px-3 text-right font-medium">Model günü</th>
                    <th className="py-2 px-3 text-right font-medium">Örnek gün</th>
                    <th className="py-2 px-3 text-right font-medium">Ort. verim</th>
                    <th className="py-2 px-3 text-right font-medium">Ort. adet/sa</th>
                  </tr>
                </thead>
                <tbody>
                  {modelStats.workers.map((x) => (
                    <tr key={x.workerId} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-3">{x.name}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{x.team}</td>
                      <td className="py-2 px-3">{x.process}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{x.modelRosterDays}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{x.effSampleDays}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">
                        {x.avgEfficiencyPercent != null ? `%${x.avgEfficiencyPercent}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {x.avgEffectivePerHour != null ? x.avgEffectivePerHour : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Personel ve prosesler"
        description="Otomatik satırlar model geçmişinden gelir; ek satırla bölüm ve proses seçebilirsiniz."
        badge={rows.length ? `${rows.length} satır` : undefined}
        defaultOpen={false}
      >
        <p className="mb-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Otomatik satırlar yalnızca bu modelde günlük ürün kaydında model işaretli günlerde üretim kaydı olan personelden gelir
          («Bu modelde geçmiş verimler» özetindeki küme; bugüne kadar 180 gün). «Ek personel satırı» ile listeye başka personel
          ekleyebilir, bu modelde hesaba katılacak{" "}
          <strong className="font-medium text-slate-600 dark:text-slate-300">bölüm ve proses</strong>i seçebilirsiniz; verim
          seçtiğiniz istasyona göre hesaplanır.
        </p>
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-sm font-medium text-teal-800 shadow-sm hover:bg-teal-50 dark:border-teal-500 dark:bg-slate-900 dark:text-teal-200 dark:hover:bg-teal-950/40"
          >
            Ek personel satırı
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
            {modelStatsLoading ? (
              <>
                Bu model için üretim özeti yükleniyor; otomatik personel satırları hazır olunca doldurulur. Biraz bekleyin veya «Ek
                personel satırı» ile hemen ekleyin.
              </>
            ) : (
              <>
                Otomatik liste boş: seçili dönemde bu modelde günlük meta + üretim kaydı olan personel yok veya dk tablosunda
                kartlarındaki bölüm+proses henüz tanımlı değil. «Bu modelde geçmiş verimler» bölümüne bakın; başkalarını «Ek personel
                satırı» ile ekleyin.
              </>
            )}
          </p>
        ) : (
          <>
            <div className="w-full min-w-0">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                    <th className="w-[26%] py-2 pr-2 font-medium">Personel / kaynak</th>
                    <th className="w-[17%] py-2 pr-2 font-medium">Bölüm</th>
                    <th className="w-[17%] py-2 pr-2 font-medium">Proses</th>
                    <th className="min-w-0 w-[31%] py-2 pr-2 font-medium">Efektif adet/saat</th>
                    <th className="w-[9%] min-w-14 py-2 pr-0 font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                const w = row.workerId !== "" ? workerById.get(row.workerId) : undefined;
                const derived = rowDerived.get(row.id);
                const teamForProcOpts =
                  row.source === "manual" ? (row.manualTeamCode ?? "").trim() || w?.team || "" : "";
                const procOptsManual =
                  row.source === "manual" ? processesForTeamInModel(teamForProcOpts) : [];
                return (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="min-w-0 py-2 pr-2 align-top">
                      {row.source === "model" && w ? (
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{w.name}</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {w.team}
                            {w.process ? ` · ${w.process}` : ""}
                          </span>
                          <span className="inline-flex w-fit rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                            Model listesi
                          </span>
                        </div>
                      ) : row.source === "model" ? (
                        <span className="text-sm text-amber-700 dark:text-amber-300">
                          Personel kaydı bulunamadı (no: {row.workerId})
                        </span>
                      ) : (
                        <select
                          value={row.workerId === "" ? "" : String(row.workerId)}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) {
                              updateRow(row.id, {
                                workerId: "",
                                processName: "",
                                manualTeamCode: "",
                              });
                              return;
                            }
                            const widR = Number(v);
                            const ww = workerById.get(widR);
                            updateRow(row.id, {
                              workerId: widR,
                              manualTeamCode: ww?.team ?? "",
                              processName: ww?.process ?? "",
                            });
                          }}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">Personel seçin…</option>
                          {workers.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                              {x.process ? ` · ${x.process}` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="min-w-0 py-2 pr-2 align-top">
                      {row.source === "model" && w ? (
                        <div className="min-w-0 text-sm break-words">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {teamMeta.find((t) => t.code === w.team)?.label ?? w.team}
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{w.team}</p>
                        </div>
                      ) : row.source === "model" ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <select
                          value={row.manualTeamCode ?? ""}
                          onChange={(e) => {
                            const tc = e.target.value;
                            let pn = row.processName;
                            if (tc.trim()) {
                              const opts = processesForTeamInModel(tc);
                              if (!pn.trim() || !opts.includes(pn)) pn = opts[0] ?? "";
                            }
                            updateRow(row.id, { manualTeamCode: tc, processName: pn });
                          }}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">Bölüm seçin…</option>
                          {teamMeta.map((t) => (
                            <option key={t.code} value={t.code}>
                              {t.label} ({t.code})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="min-w-0 py-2 pr-2 align-top">
                      {row.source === "model" ? (
                        <input
                          list={processNames.length > 0 ? "proc-list-is-bitirme" : undefined}
                          value={row.processName}
                          onChange={(e) => updateRow(row.id, { processName: e.target.value })}
                          placeholder={w?.process || "Örn. Dikim"}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                      ) : (
                        <select
                          value={row.processName}
                          onChange={(e) => updateRow(row.id, { processName: e.target.value })}
                          disabled={teamMeta.length === 0}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">
                            {teamForProcOpts.trim()
                              ? "Proses seçin…"
                              : "Önce personel veya bölüm seçin"}
                          </option>
                          {procOptsManual.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="min-w-0 py-2 pr-2 align-top">
                      {row.workerId === "" ? (
                        <span className="text-slate-400">—</span>
                      ) : !derived ? (
                        <span className="text-slate-400">—</span>
                      ) : !derived.ok ? (
                        <span
                          className="block break-words text-[11px] leading-snug text-amber-800 dark:text-amber-300"
                          title={derived.hint}
                        >
                          {derived.hint}
                        </span>
                      ) : (
                        <div className="min-w-0">
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                            {derived.effectivePerHour}
                          </span>
                          <p className="mt-0.5 break-words text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                            {derived.hint}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-0 align-top">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>
            {processNames.length > 0 ? (
              <datalist id="proc-list-is-bitirme">
                {processNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            ) : null}
          </>
        )}
      </CollapsibleSection>

      {duplicateWorkers.size > 0 ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Aynı personel birden fazla satırda. Paralel istasyonlar için toplamları birleştirir; gerçekte tek işçi sırayla proseslerde
          çalışıyorsa süre bu hesaptan uzun olabilir.
        </p>
      ) : null}
    </main>
  );
}
