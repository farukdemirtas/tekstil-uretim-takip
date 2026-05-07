import { sumProductionRow } from "@/lib/productionSlots";
import type { ProductionRow } from "@/lib/types";
import type { ProsesMap } from "@/lib/prosesVeri";
import { makeProsesKey } from "@/lib/prosesVeri";
import { workerEfficiencyPercent } from "@/lib/workerEfficiency";

export type DerivedWorkerHourlyRate =
  | {
      ok: true;
      effectivePerHour: number;
      nominalPerHour: number;
      effPct: number | null;
      hint: string;
    }
  | { ok: false; hint: string };

/**
 * Genel verimlilik (bölüm+proses dk) → nominal saatlik adet = dk×60.
 * Aynı gün üretim satırı aynı bölüm+proses ise verimlilik % ile çarpılır; aksi halde hedef hız (%100) kullanılır.
 */
export function deriveWorkerHourlyRateForJobCalc(
  workerTeam: string,
  processNameResolved: string,
  prosesMap: ProsesMap,
  productionRow: ProductionRow | undefined,
  referenceDateIso: string,
  todayIso: string,
  /** Günlük meta bu modele işaretli günlerde hesaplanan ortalama verim % (varsa öncelikli) */
  modelHistoricalAvgEffPct?: number | null
): DerivedWorkerHourlyRate {
  const proc = processNameResolved.trim();
  if (!proc) {
    return { ok: false, hint: "Proses adı gerekli." };
  }
  const dk = Number(prosesMap[makeProsesKey(workerTeam, proc)]) || 0;
  const nominal = dk * 60;
  if (nominal <= 0) {
    return {
      ok: false,
      hint: "Seçilen ürün modelinde bu bölüm + proses için dk hedefi yok.",
    };
  }
  const nominalR = Math.round(nominal * 100) / 100;

  if (modelHistoricalAvgEffPct != null && Number.isFinite(modelHistoricalAvgEffPct)) {
    const eff = Math.min(100, Math.max(0, Math.round(modelHistoricalAvgEffPct)));
    let effective = Math.round(((nominal * eff) / 100) * 100) / 100;
    let hint = `Model geçmişi ort. %${eff} · hedef ${nominalR}/sa`;
    if (effective <= 0 && nominal > 0) {
      effective = nominalR;
      hint = "Ort. verim %0; hesap için hedef hız kullanıldı.";
    }
    return {
      ok: true,
      effectivePerHour: effective,
      nominalPerHour: nominalR,
      effPct: eff,
      hint,
    };
  }

  const sameStation =
    productionRow &&
    !productionRow.absentForDay &&
    productionRow.team === workerTeam &&
    productionRow.process.trim() === proc;

  const useIntraday = referenceDateIso === todayIso;

  if (sameStation && productionRow) {
    const total = sumProductionRow(productionRow);
    if (useIntraday && total <= 0) {
      return {
        ok: true,
        effectivePerHour: nominalR,
        nominalPerHour: nominalR,
        effPct: null,
        hint: "Bugün henüz adet yok; hedef hız kullanıldı.",
      };
    }
    const eff = workerEfficiencyPercent(productionRow, prosesMap, useIntraday);
    if (eff !== null) {
      let effective = Math.round(((nominal * eff) / 100) * 100) / 100;
      let hint = `%${eff} verim · hedef ${nominalR}/sa`;
      if (effective <= 0 && nominal > 0) {
        effective = nominalR;
        hint = "Verim %0; hesap için hedef hız kullanıldı.";
      }
      return {
        ok: true,
        effectivePerHour: effective,
        nominalPerHour: nominalR,
        effPct: eff,
        hint,
      };
    }
  }

  return {
    ok: true,
    effectivePerHour: nominalR,
    nominalPerHour: nominalR,
    effPct: null,
    hint: sameStation
      ? "Verim hesaplanamadı; hedef hız kullanıldı."
      : "Üretim satırı yok veya farklı proses; hedef hız (%100) kullanıldı.",
  };
}
