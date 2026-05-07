"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getJobCalcModelWorkerStats,
  getProcesses,
  getProduction,
  getProsesVeriRowsFromServer,
  getWorkers,
  listProductModels,
  setAuthToken,
  type JobCalcModelWorkerStatsResponse,
  type ProductModelListItem,
} from "@/lib/api";
import { addDaysToIso, clampToWeekdayIso, todayWeekdayIso } from "@/lib/businessCalendar";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  computeJobCompletion,
  formatHoursHuman,
  splitWorkingDays,
  type AssignmentInput,
} from "@/lib/jobCompletionCalc";
import { deriveWorkerHourlyRateForJobCalc } from "@/lib/jobCompletionWorkerRate";
import { hasPermission } from "@/lib/permissions";
import {
  buildProsesMapFromVeriRows,
  getProsesMap,
  makeProsesKey,
  setProsesMap as writeProsesMapToLocal,
  type ProsesMap,
} from "@/lib/prosesVeri";
import type { ProductionRow, Worker } from "@/lib/types";

const STORAGE_KEY = "is_bitirme_hesaplama_v1";

type Row = {
  id: string;
  workerId: number | "";
  processName: string;
};

function newRow(): Row {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, workerId: "", processName: "" };
}

function loadDraft(): { qty: string; hpd: string; refDate?: string; modelCode?: string; rows: Row[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as {
      qty?: string;
      hpd?: string;
      refDate?: string;
      modelCode?: string;
      rows?: unknown[];
    };
    if (!j || typeof j !== "object") return null;
    const rows: Row[] = Array.isArray(j.rows)
      ? j.rows.map((r): Row => {
          const o = r as Record<string, unknown>;
          const widRaw = o.workerId;
          const wid: number | "" =
            widRaw === "" || widRaw === null || widRaw === undefined ? "" : Number(widRaw) || "";
          return {
            id: typeof o.id === "string" ? o.id : newRow().id,
            workerId: wid,
            processName: typeof o.processName === "string" ? o.processName : "",
          };
        })
      : [];
    return {
      qty: typeof j.qty === "string" ? j.qty : String(j.qty ?? ""),
      hpd: typeof j.hpd === "string" ? j.hpd : String(j.hpd ?? ""),
      refDate: typeof j.refDate === "string" ? j.refDate : undefined,
      modelCode: typeof j.modelCode === "string" ? j.modelCode : undefined,
      rows,
    };
  } catch {
    return null;
  }
}

export default function IsBitirmeHesaplamaPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [processNames, setProcessNames] = useState<string[]>([]);
  const [productModels, setProductModels] = useState<ProductModelListItem[]>([]);
  const [selectedModelCode, setSelectedModelCode] = useState<string>("");
  const [modelProsesMap, setModelProsesMap] = useState<ProsesMap>({});
  const [modelMapLoading, setModelMapLoading] = useState(false);
  const [modelMapErr, setModelMapErr] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string>("");
  const [quantity, setQuantity] = useState("10000");
  const [hoursPerDay, setHoursPerDay] = useState("9");
  const [referenceDate, setReferenceDate] = useState<string>(() => clampToWeekdayIso(todayWeekdayIso()));
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [productionRows, setProductionRows] = useState<ProductionRow[]>([]);
  const [productionErr, setProductionErr] = useState<string>("");
  const [productionLoading, setProductionLoading] = useState(false);
  const [modelStats, setModelStats] = useState<JobCalcModelWorkerStatsResponse | null>(null);
  const [modelStatsLoading, setModelStatsLoading] = useState(false);
  const [modelStatsErr, setModelStatsErr] = useState<string>("");

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
      if (draft.refDate) setReferenceDate(clampToWeekdayIso(draft.refDate));
      if (draft.rows.length > 0) setRows(draft.rows);
    }
    void Promise.all([getWorkers(), getProcesses(), listProductModels()])
      .then(([w, proc, mds]) => {
        setWorkers(w.filter((x) => !x.deleted_at));
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
    void getProduction(referenceDate)
      .then((r) => setProductionRows(r))
      .catch(() => {
        setProductionRows([]);
        setProductionErr("Bu tarih için üretim verisi alınamadı.");
      })
      .finally(() => setProductionLoading(false));
  }, [referenceDate]);

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
    const end = referenceDate;
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
  }, [selectedModelCode, selectedModelId, referenceDate]);

  const persist = useCallback((q: string, hpd: string, r: Row[], ref: string, modelCode: string) => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ qty: q, hpd, refDate: ref, modelCode: modelCode || undefined, rows: r }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  /** Model dk tablosundaki istasyonlarda çalışan personeli satırlara dök */
  useEffect(() => {
    if (modelMapLoading || !selectedModelCode) return;
    const map = modelProsesMap;
    const keys = Object.keys(map);
    let next: Row[];
    if (keys.length === 0) {
      next = [newRow()];
    } else {
      const matching = workers.filter((w) => {
        const dk = map[makeProsesKey(w.team, w.process)];
        return dk != null && String(dk).trim() !== "" && Number(String(dk).replace(",", ".")) > 0;
      });
      matching.sort(
        (a, b) =>
          a.team.localeCompare(b.team, "tr") ||
          a.process.localeCompare(b.process, "tr") ||
          a.name.localeCompare(b.name, "tr")
      );
      next =
        matching.length > 0
          ? matching.map((w) => ({
              id: `row-${w.id}-${selectedModelCode}-${Math.random().toString(36).slice(2, 9)}`,
              workerId: w.id,
              processName: w.process,
            }))
          : [newRow()];
    }
    setRows(next);
    persist(quantity, hoursPerDay, next, referenceDate, selectedModelCode);
  }, [selectedModelCode, modelProsesMap, modelMapLoading, workers, persist]);

  const productionByWorkerId = useMemo(
    () => new Map(productionRows.map((r) => [r.workerId, r])),
    [productionRows]
  );

  const historicalEffByWorkerId = useMemo(() => {
    const m = new Map<number, number>();
    if (!modelStats?.workers) return m;
    for (const w of modelStats.workers) {
      if (w.effSampleDays > 0 && w.avgEfficiencyPercent != null) {
        m.set(w.workerId, w.avgEfficiencyPercent);
      }
    }
    return m;
  }, [modelStats]);

  const todayIso = todayWeekdayIso();

  const rowDerived = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof deriveWorkerHourlyRateForJobCalc>
    >();
    for (const row of rows) {
      if (row.workerId === "") continue;
      const w = workers.find((x) => x.id === row.workerId);
      if (!w) continue;
      const proc = row.processName.trim() || w.process;
      const prod = productionByWorkerId.get(row.workerId);
      const hist = historicalEffByWorkerId.get(row.workerId);
      map.set(
        row.id,
        deriveWorkerHourlyRateForJobCalc(
          w.team,
          proc,
          modelProsesMap,
          prod,
          referenceDate,
          todayIso,
          hist !== undefined ? hist : undefined
        )
      );
    }
    return map;
  }, [rows, workers, productionByWorkerId, modelProsesMap, referenceDate, todayIso, historicalEffByWorkerId]);

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
  const result = useMemo(() => computeJobCompletion(qtyNum, assignments), [qtyNum, assignments]);
  const split = result ? splitWorkingDays(result.totalHoursBottleneck, hpdNum) : splitWorkingDays(0, hpdNum);
  const splitSeq = result ? splitWorkingDays(result.sequentialNoWipHours, hpdNum) : splitWorkingDays(0, hpdNum);

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
      persist(quantity, hoursPerDay, next, referenceDate, selectedModelCode);
      return next;
    });
  }

  function addRow() {
    setRows((prev) => {
      const next = [...prev, newRow()];
      persist(quantity, hoursPerDay, next, referenceDate, selectedModelCode);
      return next;
    });
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      const fixed = next.length > 0 ? next : [newRow()];
      persist(quantity, hoursPerDay, fixed, referenceDate, selectedModelCode);
      return fixed;
    });
  }

  function onQuantityChange(v: string) {
    setQuantity(v);
    persist(v, hoursPerDay, rows, referenceDate, selectedModelCode);
  }

  function onHpdChange(v: string) {
    setHoursPerDay(v);
    persist(quantity, v, rows, referenceDate, selectedModelCode);
  }

  function onReferenceDateChange(v: string) {
    const d = clampToWeekdayIso(v);
    setReferenceDate(d);
    persist(quantity, hoursPerDay, rows, d, selectedModelCode);
  }

  function onModelChange(code: string) {
    setSelectedModelCode(code);
    persist(quantity, hoursPerDay, rows, referenceDate, code);
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
            dk tablosundaki istasyonlara uyan personel otomatik listelenir. Önce{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">günlük meta bu modele işaretlenmiş</strong> geçmiş
            günlerdeki ortalama verim kullanılır (özet tablo); yoksa referans günü satırı veya %100 hedef. Süre ≈ adet ÷ hat hızı (darboğaz).
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
          <WeekdayDatePicker
            label="Verim için referans günü"
            value={referenceDate}
            onChange={onReferenceDateChange}
            className="min-w-[200px]"
          />
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

      <section className="surface-card mb-6 space-y-3 p-5 dark:border-slate-700">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Bu modelde geçmiş verimler</h2>
          {modelStats ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {modelStats.startDate} → {modelStats.endDate} (referans gününe kadar 180 gün)
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Günlük ürün kaydında <strong className="font-medium text-slate-600 dark:text-slate-300">bu model_id</strong> ile işaretlenmiş
          tarihlerde, aynı modelin dk tablosundaki bölüm+proses istasyonunda kaydı olan personel için ortalama verim (günlük adet ÷
          dk×60×9) hesaplanır. Bu ortalama aşağıda listelenir; <strong className="font-medium">İş hesabında önce bu değer</strong>{" "}
          kullanılır. Personelde geçmiş örnek yoksa referans günü verimliliği veya hedef hız devreye girer.
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
      </section>

      <section className="surface-card mb-6 p-5 dark:border-slate-700">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Personel ve prosesler</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Model veya dk tablosu yüklendiğinde, bu modelde tanımlı istasyonlardaki personel otomatik doldurulur; yeni personel
              eklemek için satır ekleyebilirsiniz.
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            Satır ekle
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">Personel</th>
                <th className="py-2 pr-3 font-medium">Proses</th>
                <th className="py-2 pr-3 font-medium">Efektif adet/saat</th>
                <th className="py-2 font-medium w-24"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const w = row.workerId !== "" ? workerById.get(row.workerId) : undefined;
                const derived = rowDerived.get(row.id);
                return (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 align-top">
                      <select
                        value={row.workerId === "" ? "" : String(row.workerId)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) {
                            updateRow(row.id, { workerId: "", processName: row.processName });
                            return;
                          }
                          const wid = Number(v);
                          const ww = workerById.get(wid);
                          updateRow(row.id, {
                            workerId: wid,
                            processName: ww?.process && !row.processName.trim() ? ww.process : row.processName,
                          });
                        }}
                        className="w-full max-w-[220px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Seçin…</option>
                        {workers.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                            {x.process ? ` · ${x.process}` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <input
                        list={processNames.length > 0 ? "proc-list-is-bitirme" : undefined}
                        value={row.processName}
                        onChange={(e) => updateRow(row.id, { processName: e.target.value })}
                        placeholder={w?.process || "Örn. Dikim"}
                        className="w-full max-w-[200px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-2 pr-3 align-top">
                      {row.workerId === "" ? (
                        <span className="text-slate-400">—</span>
                      ) : !derived ? (
                        <span className="text-slate-400">—</span>
                      ) : !derived.ok ? (
                        <span className="text-amber-800 dark:text-amber-300" title={derived.hint}>
                          {derived.hint}
                        </span>
                      ) : (
                        <div>
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                            {derived.effectivePerHour}
                          </span>
                          <p className="mt-0.5 max-w-[280px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                            {derived.hint}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="py-2 align-top">
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
      </section>

      {duplicateWorkers.size > 0 ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Aynı personel birden fazla satırda. Paralel istasyonlar için toplamları birleştirir; gerçekte tek işçi sırayla proseslerde
          çalışıyorsa süre bu hesaptan uzun olabilir.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="surface-card p-5 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sonuç (darboğaz modeli)</h2>
          {!result ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Geçerli bir hedef adet girin; seçilen ürün modelinde bölüm+proses dk&apos;ları tanımlı olsun ve personel satırlarında
              efektif hız çıkabilsin.
            </p>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Hat hızı (tahmini)</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-white">
                  {Math.round(result.lineThroughputPerHour * 100) / 100} adet/saat
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Darboğaz proses</dt>
                <dd className="font-semibold text-teal-700 dark:text-teal-400">{result.bottleneckProcessKey}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Toplam süre</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-white">
                  {formatHoursHuman(result.totalHoursBottleneck)}{" "}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    ({result.totalHoursBottleneck.toFixed(2)} sa)
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">İş günü karşılığı</dt>
                <dd className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                  {split.fullDays} gün + {split.remainderHours.toFixed(2)} sa
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    ({split.hoursPerWorkday} sa/gün bazında; ≈ {(result.totalHoursBottleneck / split.hoursPerWorkday).toFixed(2)}{" "}
                    iş günü)
                  </span>
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="surface-card p-5 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Proses detayı</h2>
          {!result ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">—</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {result.processes.map((p) => {
                const isBn = p.processKey === result.bottleneckProcessKey;
                const hoursOnly = result.quantity / p.totalRatePerHour;
                return (
                  <li
                    key={p.processKey}
                    className={`rounded-lg border px-3 py-2 ${
                      isBn
                        ? "border-teal-300 bg-teal-50/80 dark:border-teal-800 dark:bg-teal-950/40"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {p.processKey}
                        {isBn ? (
                          <span className="ml-2 text-xs font-semibold text-teal-700 dark:text-teal-400">darboğaz</span>
                        ) : null}
                      </span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-300">
                        Σ verim: {Math.round(p.totalRatePerHour * 100) / 100} /sa · bu aşama tek başına:{" "}
                        {hoursOnly.toFixed(2)} sa
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {p.lines.map((l) => `${l.workerName} (${l.ratePerHour}/sa)`).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          {result ? (
            <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <strong className="font-medium text-slate-600 dark:text-slate-300">Karşılaştırma:</strong> Ardışık çalışıp
              ara stok beklemeden her aşama kendi hızıyla tüm Q&apos;yu bitirse toplam{" "}
              <span className="tabular-nums">{result.sequentialNoWipHours.toFixed(2)} sa</span> (
              {formatHoursHuman(result.sequentialNoWipHours)}) — yaklaşık{" "}
              <span className="tabular-nums">
                {splitSeq.fullDays} gün + {splitSeq.remainderHours.toFixed(2)} sa
              </span>{" "}
              ({split.hoursPerWorkday} sa/gün). Sürekli hat akışında genellikle darboğaz süresi ({result.totalHoursBottleneck.toFixed(2)}{" "}
              sa) daha gerçekçidir.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
