export type JobCostInput = {
  quantity: number;
  /** Fason birim fiyat (₺/adet) */
  fasonUnitPrice: number;
  /** Hesaba dahil işçi sayısı */
  workerCount: number;
  /** Personel gideri (₺/işçi/iş günü) */
  personnelCostPerWorkerDay: number;
  /** Tahmini iş süresi (iş günü, ondalıklı olabilir) */
  jobWorkDays: number;
};

export type JobCostResult = {
  revenue: number;
  personnelCost: number;
  margin: number;
  marginPerPiece: number;
  marginPercent: number | null;
  personnelCostPerPiece: number;
  /** Başabaş için gereken minimum fason birim fiyat (₺/adet) */
  breakEvenFasonUnit: number;
  jobWorkDays: number;
  /** true = kar, false = zarar, null = eşit */
  isProfit: boolean | null;
};

export type JobCostMissingField =
  | "quantity"
  | "duration"
  | "fasonUnitPrice"
  | "workerCount"
  | "personnelCostPerWorkerDay";

/** Maliyet hesabı için eksik veya geçersiz girdiler */
export function getJobCostMissingFields(input: {
  quantity: number;
  jobWorkDays: number;
  fasonUnitPrice: number;
  workerCount: number;
  personnelCostPerWorkerDay: number;
}): JobCostMissingField[] {
  const missing: JobCostMissingField[] = [];
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) missing.push("quantity");
  if (!Number.isFinite(input.jobWorkDays) || input.jobWorkDays <= 0) missing.push("duration");
  if (!Number.isFinite(input.fasonUnitPrice) || input.fasonUnitPrice < 0) missing.push("fasonUnitPrice");
  if (!Number.isFinite(input.workerCount) || input.workerCount <= 0) missing.push("workerCount");
  if (!Number.isFinite(input.personnelCostPerWorkerDay) || input.personnelCostPerWorkerDay < 0) {
    missing.push("personnelCostPerWorkerDay");
  }
  return missing;
}

/**
 * Gelir = Q × fason birim fiyat
 * Personel gideri = işçi sayısı × ₺/işçi/iş günü × tahmini iş günü
 * Net = gelir − personel gideri
 */
export function computeJobCost(input: JobCostInput): JobCostResult | null {
  const qty = Number(input.quantity);
  const unit = Number(input.fasonUnitPrice);
  const workers = Number(input.workerCount);
  const perDay = Number(input.personnelCostPerWorkerDay);
  const days = Number(input.jobWorkDays);

  if (getJobCostMissingFields({ quantity: qty, jobWorkDays: days, fasonUnitPrice: unit, workerCount: workers, personnelCostPerWorkerDay: perDay }).length > 0) {
    return null;
  }

  const revenue = qty * unit;
  const personnelCost = workers * perDay * days;
  const margin = revenue - personnelCost;
  const marginPerPiece = margin / qty;
  const personnelCostPerPiece = personnelCost / qty;
  const breakEvenFasonUnit = personnelCost / qty;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : null;

  return {
    revenue,
    personnelCost,
    margin,
    marginPerPiece,
    marginPercent,
    personnelCostPerPiece,
    breakEvenFasonUnit,
    jobWorkDays: days,
    isProfit: margin > 0 ? true : margin < 0 ? false : null,
  };
}

export function formatMoneyTr(n: number, maxFrac = 2): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

export function formatPercentTr(n: number, maxFrac = 1): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}
