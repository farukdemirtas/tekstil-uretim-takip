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
  jobWorkDays: number;
  /** true = kar, false = zarar, null = eşit */
  isProfit: boolean | null;
};

export function computeJobCost(input: JobCostInput): JobCostResult | null {
  const qty = Number(input.quantity);
  const unit = Number(input.fasonUnitPrice);
  const workers = Number(input.workerCount);
  const perDay = Number(input.personnelCostPerWorkerDay);
  const days = Number(input.jobWorkDays);

  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!Number.isFinite(days) || days <= 0) return null;
  if (!Number.isFinite(workers) || workers <= 0) return null;
  if (!Number.isFinite(perDay) || perDay < 0) return null;
  if (!Number.isFinite(unit) || unit < 0) return null;

  const revenue = qty * unit;
  const personnelCost = workers * perDay * days;
  const margin = revenue - personnelCost;
  const marginPerPiece = margin / qty;

  return {
    revenue,
    personnelCost,
    margin,
    marginPerPiece,
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
