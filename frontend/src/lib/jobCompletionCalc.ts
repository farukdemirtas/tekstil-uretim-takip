/** Proses adını karşılaştırma için normalize eder */
export function normalizeProcessKey(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export type AssignmentInput = {
  workerId: number;
  workerName: string;
  processName: string;
  ratePerHour: number;
};

export type ProcessAgg = {
  processKey: string;
  totalRatePerHour: number;
  lines: { workerName: string; ratePerHour: number }[];
};

export type JobDurationMode = "model_genel_pace" | "worker_parallel_sum";

export type JobCompletionResult = {
  quantity: number;
  processes: ProcessAgg[];
  /** Tahmini hat çıktısı (adet/saat) — model geçmişi veya personel verimleri toplamı */
  lineThroughputPerHour: number;
  /** Artık kullanılmıyor; her zaman null (darboğaz modeli kaldırıldı) */
  bottleneckProcessKey: string | null;
  /** Ana süre tahmini: Q ÷ lineThroughputPerHour */
  totalHoursBottleneck: number;
  /** Her proses yalnız kendi hızıyla Q adeti bitirse toplam (ardışık, stok transferi yok varsayımı) */
  sequentialNoWipHours: number;
  durationMode: JobDurationMode;
  /** durationMode === model_genel_pace iken: günlük ortalama genel tamamlanan (adet/gün) */
  modelAvgDailyGenel?: number;
  modelMetaDayCount?: number;
  modelOverallEfficiencyPercent?: number | null;
  /** durationMode === model_genel_pace iken: dönemdeki genel tamamlanan toplamı (yapılan iş) */
  modelCompletedGenelTotal?: number;
};

export type ComputeJobCompletionOptions = {
  hoursPerWorkday: number;
  /** Bu modelde günlük meta ile işaretli günlerde toplanan genel tamamlanan ve ortalama verim */
  modelPace: {
    completedGenelTotal: number;
    modelMetaDayCount: number;
    overallAvgEfficiencyPercent: number | null;
  } | null;
};

/**
 * Darboğaz yok.
 * - Model geçmişi varsa: günlük ortalama genel tamamlanan ÷ çalışma saati = hat hızı; süre = Q ÷ hız.
 *   (Yapılan iş toplamı ve iş günü model özetiyle; verim % bilgisi raporda gösterilir, hız gerçekleşmiş ortalamadan türetilir.)
 * - Yoksa: seçili personellerin saatlik efektif verimleri toplanır (paralel kapasite varsayımı).
 */
export function computeJobCompletion(
  quantity: number,
  assignments: AssignmentInput[],
  options?: ComputeJobCompletionOptions
): JobCompletionResult | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const hpdRaw = options?.hoursPerWorkday;
  const hpd =
    hpdRaw != null && Number.isFinite(hpdRaw) && hpdRaw > 0 ? hpdRaw : 9;

  const mp = options?.modelPace ?? null;
  const useModel =
    mp != null &&
    mp.modelMetaDayCount > 0 &&
    Number.isFinite(mp.completedGenelTotal) &&
    mp.completedGenelTotal > 0;

  const valid = assignments.filter(
    (a) =>
      normalizeProcessKey(a.processName) !== "" && Number.isFinite(a.ratePerHour) && (a.ratePerHour as number) > 0
  );

  if (valid.length === 0 && !useModel) return null;

  const map = new Map<string, ProcessAgg>();
  for (const a of valid) {
    const key = normalizeProcessKey(a.processName);
    let g = map.get(key);
    if (!g) {
      g = { processKey: key, totalRatePerHour: 0, lines: [] };
      map.set(key, g);
    }
    g.totalRatePerHour += a.ratePerHour;
    g.lines.push({ workerName: a.workerName.trim() || `Personel #${a.workerId}`, ratePerHour: a.ratePerHour });
  }

  const processes = [...map.values()].sort((x, y) => x.processKey.localeCompare(y.processKey, "tr"));

  let sequentialSum = 0;
  for (const p of processes) {
    if (p.totalRatePerHour > 0) {
      sequentialSum += quantity / p.totalRatePerHour;
    }
  }

  let lineThroughput: number;
  let durationMode: JobDurationMode;
  let modelAvgDailyGenel: number | undefined;
  let modelMetaDayCount: number | undefined;
  let modelOverallEfficiencyPercent: number | null | undefined;
  let modelCompletedGenelTotal: number | undefined;

  if (useModel && mp) {
    modelAvgDailyGenel = mp.completedGenelTotal / mp.modelMetaDayCount;
    modelMetaDayCount = mp.modelMetaDayCount;
    modelOverallEfficiencyPercent = mp.overallAvgEfficiencyPercent;
    modelCompletedGenelTotal = mp.completedGenelTotal;
    lineThroughput = modelAvgDailyGenel / hpd;
    durationMode = "model_genel_pace";
  } else {
    const sumRates = valid.reduce((s, a) => s + a.ratePerHour, 0);
    if (sumRates <= 0) return null;
    lineThroughput = sumRates;
    durationMode = "worker_parallel_sum";
    modelOverallEfficiencyPercent = undefined;
  }

  if (!Number.isFinite(lineThroughput) || lineThroughput <= 0) return null;

  return {
    quantity,
    processes,
    lineThroughputPerHour: lineThroughput,
    bottleneckProcessKey: null,
    totalHoursBottleneck: quantity / lineThroughput,
    sequentialNoWipHours: sequentialSum,
    durationMode,
    modelAvgDailyGenel,
    modelMetaDayCount,
    modelOverallEfficiencyPercent,
    modelCompletedGenelTotal,
  };
}

export function splitWorkingDays(totalHours: number, hoursPerWorkday: number) {
  const hpd = Number.isFinite(hoursPerWorkday) && hoursPerWorkday > 0 ? hoursPerWorkday : 8;
  if (!Number.isFinite(totalHours) || totalHours < 0) return { fullDays: 0, remainderHours: 0, hoursPerWorkday: hpd };
  const fullDays = Math.floor(totalHours / hpd);
  const remainderHours = totalHours - fullDays * hpd;
  return { fullDays, remainderHours, hoursPerWorkday: hpd };
}

export function formatHoursHuman(totalHours: number) {
  if (!Number.isFinite(totalHours)) return "—";
  const h = Math.floor(totalHours);
  const m = Math.round((totalHours - h) * 60);
  if (h <= 0 && m <= 0) return "0 dk";
  if (h <= 0) return `${m} dk`;
  if (m <= 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}
