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

export type JobCompletionResult = {
  quantity: number;
  processes: ProcessAgg[];
  /** min_p toplam verim_p — hat çıktısı (adet/saat) */
  lineThroughputPerHour: number;
  /** Darboğaz prosesteki anahtar */
  bottleneckProcessKey: string | null;
  /** Süreklı üretim: Q / hat hızı */
  totalHoursBottleneck: number;
  /** Her proses yalnız kendi hızıyla Q adeti bitirse toplam (ardışık, stok transferi yok varsayımı) */
  sequentialNoWipHours: number;
};

/**
 * Ardışık proses hattı — steady state darboğaz:
 * Hat hızı = min_proses(Σ kişi verimi), süre ≈ Q / hat hızı.
 */
export function computeJobCompletion(quantity: number, assignments: AssignmentInput[]): JobCompletionResult | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const valid = assignments.filter(
    (a) =>
      normalizeProcessKey(a.processName) !== "" && Number.isFinite(a.ratePerHour) && (a.ratePerHour as number) > 0
  );
  if (valid.length === 0) return null;

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
  let lineThroughput = Infinity;
  let bottleneckKey: string | null = null;
  for (const p of processes) {
    if (p.totalRatePerHour < lineThroughput) {
      lineThroughput = p.totalRatePerHour;
      bottleneckKey = p.processKey;
    }
  }
  if (!Number.isFinite(lineThroughput) || lineThroughput <= 0) return null;

  let sequentialSum = 0;
  for (const p of processes) {
    sequentialSum += quantity / p.totalRatePerHour;
  }

  return {
    quantity,
    processes,
    lineThroughputPerHour: lineThroughput,
    bottleneckProcessKey: bottleneckKey,
    totalHoursBottleneck: quantity / lineThroughput,
    sequentialNoWipHours: sequentialSum,
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
