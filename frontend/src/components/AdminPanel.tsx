"use client";

import { useMemo } from "react";

/** `/api/production/hedef-stage-totals` — hedef takip formülündeki 5 aşama */
export type HedefStageTotals = {
  SAG_ON: number;
  SOL_ON: number;
  YAKA_HAZIRLIK: number;
  ARKA_HAZIRLIK: number;
  BITIM: number;
};

/** Hedef özetinde ayrı gösterilen bölüm kodları; geri kalanlar "grup günlük toplamı" ile eklenir */
const HEDEF_BOLUM_KODLARI = new Set(["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM"]);

type AdminPanelProps = {
  workerCount: number;
  stageTotals: HedefStageTotals;
  /** API sırası (ör. alfabetik); kod + etiket + seçili günün grup toplamı */
  teamMeta: Array<{ code: string; label: string }>;
  /** `getRangeStageTotals(date, date)` sonucu */
  teamGunlukToplamlar: Record<string, number>;
};

export default function AdminPanel({
  workerCount,
  stageTotals,
  teamMeta,
  teamGunlukToplamlar,
}: AdminPanelProps) {
  const genelTamamlanan = useMemo(
    () =>
      Math.min(
        stageTotals.SAG_ON,
        stageTotals.SOL_ON,
        stageTotals.YAKA_HAZIRLIK,
        stageTotals.ARKA_HAZIRLIK,
        stageTotals.BITIM
      ),
    [stageTotals]
  );

  const digerBolumler = useMemo(() => {
    return teamMeta
      .filter((t) => !HEDEF_BOLUM_KODLARI.has(t.code))
      .map((t) => ({
        key: t.code,
        label: t.label,
        value: teamGunlukToplamlar[t.code] ?? 0,
      }));
  }, [teamMeta, teamGunlukToplamlar]);

  const boxNeutral =
    "border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800/90 dark:shadow-none";
  const boxHighlight =
    "border-emerald-200 bg-emerald-50/90 shadow-md ring-1 ring-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:ring-emerald-900/40";
  const numNeutral = "text-slate-800 dark:text-slate-100";
  const numHighlight = "text-emerald-700 dark:text-emerald-300";

  const tiles: Array<{ key: string; label: string; value: number; valueClass: string; boxClass: string }> = [
    { key: "calisan", label: "Çalışan", value: workerCount, valueClass: numNeutral, boxClass: boxNeutral },
    {
      key: "genel",
      label: "Genel tamamlanan",
      value: genelTamamlanan,
      valueClass: numHighlight,
      boxClass: boxHighlight,
    },
    { key: "sag", label: "Sağ Ön", value: stageTotals.SAG_ON, valueClass: numNeutral, boxClass: boxNeutral },
    { key: "sol", label: "Sol Ön", value: stageTotals.SOL_ON, valueClass: numNeutral, boxClass: boxNeutral },
    { key: "yaka", label: "Yaka", value: stageTotals.YAKA_HAZIRLIK, valueClass: numNeutral, boxClass: boxNeutral },
    { key: "arka", label: "Arka", value: stageTotals.ARKA_HAZIRLIK, valueClass: numNeutral, boxClass: boxNeutral },
    { key: "bitim", label: "Bitim", value: stageTotals.BITIM, valueClass: numNeutral, boxClass: boxNeutral },
  ];

  return (
    <div className="surface-card">
      <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 md:text-base">
        Günlük Özet
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map(({ key, label, value, valueClass, boxClass }) => (
          <div
            key={key}
            className={`flex min-h-[5.5rem] flex-col items-center justify-center rounded-2xl border-2 px-2 py-3 text-center sm:min-h-[6rem] ${boxClass}`}
          >
            <span className="line-clamp-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400 sm:text-xs">
              {label}
            </span>
            <span className={`mt-1.5 text-xl font-bold tabular-nums sm:text-2xl ${valueClass}`}>{value}</span>
          </div>
        ))}
        {digerBolumler.map(({ key, label, value }) => (
          <div
            key={`bolum-${key}`}
            className={`flex min-h-[5.5rem] flex-col items-center justify-center rounded-2xl border-2 border-violet-200 bg-violet-50/80 px-2 py-3 text-center shadow-sm dark:border-violet-800/50 dark:bg-violet-950/30 dark:shadow-none sm:min-h-[6rem]`}
            title="Seçili günde bu bölümdeki tüm proseslerin toplam üretimi"
          >
            <span className="line-clamp-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-violet-700 dark:text-violet-300 sm:text-xs">
              {label}
            </span>
            <span className="mt-1.5 text-xl font-bold tabular-nums text-violet-900 dark:text-violet-100 sm:text-2xl">
              {value}
            </span>
          </div>
        ))}
      </div>
      {digerBolumler.length > 0 && (
        <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400 sm:text-xs">
          Mor kutular: o gün için bölümün <strong>tamamı</strong> (tüm prosesler) üretim toplamı. Üstteki Sağ/Sol/Yaka/Arka/Bitim
          hedef takip formülüne göredir.
        </p>
      )}
    </div>
  );
}
