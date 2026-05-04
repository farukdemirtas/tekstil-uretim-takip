import type { ProductionRow } from "@/lib/types";
import type { ProsesMap } from "@/lib/prosesVeri";
import { makeProsesKey } from "@/lib/prosesVeri";
import { sumProductionRow } from "@/lib/productionSlots";
import { computeShiftHourAverages } from "@/lib/shiftHourAverages";

/**
 * Proses Veri Sayfası dk hedefine göre personel verimliliği (%).
 * - Tam gün: toplam üretim ÷ günlük adet (dk×60×9)
 * - Gün devam ederken: 9 ölçüm dilimine göre saatlik ortalama ÷ saat adet (dk×60)
 */
export function workerEfficiencyPercent(
  row: ProductionRow,
  prosesMap: ProsesMap,
  useIntradayRate: boolean
): number | null {
  if (row.absentForDay) return null;
  const dk = Number(prosesMap[makeProsesKey(row.team, row.process)]) || 0;
  const saatlik = dk * 60;
  const gunluk = dk * 60 * 9;
  if (gunluk <= 0) return null;

  const total = sumProductionRow(row);

  if (useIntradayRate) {
    if (total <= 0) return 0;
    const { perHourInWindow } = computeShiftHourAverages(row, total);
    if (saatlik <= 0) return 0;
    return Math.min(Math.round((perHourInWindow / saatlik) * 100), 100);
  }

  return Math.min(Math.round((total / gunluk) * 100), 100);
}

/**
 * Hedefi tanımlı, sahada ve en az bir adet üretim girmiş personel üzerinden aritmetik ortalama.
 * Toplam adet 0 olanlar (henüz/gün boyu giriş yok) ortalamaya dahil edilmez; satır rozeti yine %0 gösterebilir.
 */
export function averageWorkerEfficiency(
  rows: ProductionRow[],
  prosesMap: ProsesMap,
  useIntradayRate: boolean
): { avg: number; count: number } {
  let sum = 0;
  let n = 0;
  for (const row of rows) {
    if (row.absentForDay) continue;
    if (sumProductionRow(row) <= 0) continue;
    const p = workerEfficiencyPercent(row, prosesMap, useIntradayRate);
    if (p !== null) {
      sum += p;
      n++;
    }
  }
  return { avg: n > 0 ? Math.round(sum / n) : 0, count: n };
}

/** Dönem toplamı ve aktif gün sayısına göre ortalama günlük verimlilik (%). Hedef yoksa null. */
export function efficiencyPercentFromTotals(
  prosesMap: ProsesMap,
  team: string,
  process: string,
  totalProduction: number,
  activeDays: number
): number | null {
  const dk = Number(prosesMap[makeProsesKey(team, process)]) || 0;
  const gunluk = dk * 60 * 9;
  if (gunluk <= 0) return null;
  const denom = Math.max(activeDays, 1);
  const dailyAvg = totalProduction / denom;
  return Math.min(Math.round((dailyAvg / gunluk) * 100), 100);
}

/** Tek gün toplam üretim ÷ günlük hedef (dk×60×9), üst sınır %100. */
export function efficiencyPercentForDayProduction(
  prosesMap: ProsesMap,
  team: string,
  process: string,
  dayProduction: number
): number | null {
  const dk = Number(prosesMap[makeProsesKey(team, process)]) || 0;
  const gunluk = dk * 60 * 9;
  if (gunluk <= 0) return null;
  return Math.min(Math.round((dayProduction / gunluk) * 100), 100);
}
