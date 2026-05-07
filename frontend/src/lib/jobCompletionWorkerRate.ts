import { sumProductionRow } from "@/lib/productionSlots";
import type { ProductionRow } from "@/lib/types";
import type { ProsesMap } from "@/lib/prosesVeri";
import { calcFromDk, makeProsesKey } from "@/lib/prosesVeri";
import { computeShiftHourAverages, SHIFT_NOMINAL_HOURS } from "@/lib/shiftHourAverages";
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
 * Proses veri / üretim tablosu ile aynı dk → saatlik & günlük (calcFromDk).
 * Aynı gün aynı istasyonda üretim varsa efektif adet/saat, vardiya dilimlerine göre ölçülen saatlik (bugün)
 * veya tam gün toplamı ÷ 9 (geçmiş gün) — yüzdeyi tersine çevirmek yerine tablodaki mantıkla doğrudan.
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
  const dkKey = makeProsesKey(workerTeam, proc);
  const tablo = calcFromDk(String(prosesMap[dkKey] ?? ""));
  if (!tablo) {
    return {
      ok: false,
      hint: "Seçilen ürün modelinde bu bölüm + proses için dk hedefi yok.",
    };
  }
  const nominalR = tablo.saatlik;

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
        hint: `Bugün henüz adet yok; dk tablosu hedef saatlik ${nominalR}/sa kullanıldı.`,
      };
    }
    if (total > 0) {
      const measured = useIntraday
        ? computeShiftHourAverages(productionRow, total).perHourInWindow
        : Math.round((total / SHIFT_NOMINAL_HOURS) * 100) / 100;
      const eff = workerEfficiencyPercent(productionRow, prosesMap, useIntraday);
      let effective = measured;
      let hint =
        eff !== null
          ? `Dk/saat tablosu: hedef ${nominalR}/sa · verim %${eff} · ölçülen ${measured}/sa (üretim ekranı ile aynı mantık)`
          : `Ölçülen ${measured}/sa · tablo hedef ${nominalR}/sa`;
      if (effective <= 0 && nominalR > 0) {
        effective = nominalR;
        hint = "Verim/ölçüm 0; hesap için tablo hedef saatlik kullanıldı.";
      }
      return {
        ok: true,
        effectivePerHour: effective,
        nominalPerHour: nominalR,
        effPct: eff,
        hint,
      };
    }
    if (!useIntraday) {
      const eff = workerEfficiencyPercent(productionRow, prosesMap, false);
      if (eff !== null) {
        let effective = Math.round(((nominalR * eff) / 100) * 100) / 100;
        let hint = `Dk tablosu: hedef ${nominalR}/sa · verim %${eff} (günlük ÷ ${SHIFT_NOMINAL_HOURS} sa)`;
        if (effective <= 0 && nominalR > 0) {
          effective = nominalR;
          hint = "Verim %0; hesap için tablo hedef saatlik kullanıldı.";
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
  }

  if (modelHistoricalAvgEffPct != null && Number.isFinite(modelHistoricalAvgEffPct)) {
    const eff = Math.min(100, Math.max(0, Math.round(modelHistoricalAvgEffPct)));
    let effective = Math.round(((nominalR * eff) / 100) * 100) / 100;
    let hint = `Model geçmişi ort. %${eff} · dk tablosu saatlik ${nominalR}/sa`;
    if (effective <= 0 && nominalR > 0) {
      effective = nominalR;
      hint = "Ort. verim %0; hesap için tablo hedef saatlik kullanıldı.";
    }
    return {
      ok: true,
      effectivePerHour: effective,
      nominalPerHour: nominalR,
      effPct: eff,
      hint,
    };
  }

  return {
    ok: true,
    effectivePerHour: nominalR,
    nominalPerHour: nominalR,
    effPct: null,
    hint: sameStation
      ? "Verim hesaplanamadı; dk tablosu hedef saatlik kullanıldı."
      : "Seçilen günde bu bölüm + proses için üretim satırı yok (veya farklı istasyonda); tablo hedef saatlik (%100).",
  };
}
