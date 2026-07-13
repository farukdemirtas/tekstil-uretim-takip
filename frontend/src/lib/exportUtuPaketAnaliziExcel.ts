import { loadXlsx } from "@/lib/xlsxLazy";
import {
  UTU_PAKET_SIZE_CODES,
  UTU_PAKET_SLOT_DEFS,
  UTU_PAKET_STAGE_META,
  UTU_PAKET_STAGES,
  type UtuPaketAnalytics,
  type UtuPaketDailyAnalytics,
} from "@/lib/utuPaket";

function formatIsoTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export async function downloadUtuPaketAnaliziExcel(params: {
  data: UtuPaketAnalytics;
  dailyRows: UtuPaketDailyAnalytics[];
  rangeLabel: string;
}): Promise<void> {
  const { data, dailyRows, rangeLabel } = params;
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();

  const ozetRows = [
    { Alan: "Dönem", Değer: rangeLabel },
    { Alan: "Başlangıç", Değer: data.startDate },
    { Alan: "Bitiş", Değer: data.endDate },
    { Alan: "Veri olan iş günü", Değer: data.daysWithData },
    ...UTU_PAKET_STAGES.map((st) => ({
      Alan: `${UTU_PAKET_STAGE_META[st].label} toplam`,
      Değer: data.periodTotals[st] || 0,
    })),
    ...UTU_PAKET_STAGES.map((st) => ({
      Alan: `${UTU_PAKET_STAGE_META[st].label} günlük ort.`,
      Değer: data.avgDailyByStage[st] || 0,
    })),
    ...UTU_PAKET_SIZE_CODES.map((code) => ({
      Alan: `Beden ${code} toplam`,
      Değer: data.bedenTotals[code] || 0,
    })),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ozetRows), "Özet");

  const gunlukRows = dailyRows.map((row) => {
    const out: Record<string, string | number> = {
      Tarih: formatIsoTr(row.date),
      "ISO Tarih": row.date,
    };
    for (const st of UTU_PAKET_STAGES) {
      out[UTU_PAKET_STAGE_META[st].label] = row.stages[st] || 0;
    }
    out.Darboğaz = row.pipelineMin || 0;
    for (const code of UTU_PAKET_SIZE_CODES) {
      out[`Beden ${code}`] = row.beden[code] || 0;
    }
    return out;
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(gunlukRows.length ? gunlukRows : [{ Bilgi: "Kayıt yok" }]),
    "Günlük"
  );

  const bedenRows = UTU_PAKET_SIZE_CODES.map((code) => ({
    Beden: code,
    Toplam: data.bedenTotals[code] || 0,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bedenRows), "Beden");

  const slotRows: Record<string, string | number>[] = [];
  for (const st of UTU_PAKET_STAGES) {
    const slots = data.slotTotalsByStage[st] || {};
    for (const { key, label } of UTU_PAKET_SLOT_DEFS) {
      slotRows.push({
        Aşama: UTU_PAKET_STAGE_META[st].label,
        Saat: label,
        Toplam: Number(slots[key]) || 0,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slotRows), "Saat dilimi");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `utu-paket-analizi-${data.startDate}-${data.endDate}-${stamp}.xlsx`);
}
