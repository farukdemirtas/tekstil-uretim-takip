import { sumProductionRow } from "@/lib/productionSlots";
import type { ProductionRow, WorkerProductionDayDetail } from "@/lib/types";

export function formatModelDisplayLabel(productName?: string, productModel?: string): string {
  const name = String(productName ?? "").trim();
  const model = String(productModel ?? "").trim();
  if (name && model) return `${name} · ${model}`;
  return model || name || "";
}

function dayTotal(r: WorkerProductionDayDetail): number {
  return sumProductionRow(r as unknown as ProductionRow);
}

export type PersonDayNote = {
  date: string;
  note: string;
};

export type PersonProcessBreakdownRow = {
  workerId: number;
  team: string;
  process: string;
  dayCount: number;
  total: number;
  /** Dönemde bu proses satırında çalışılan benzersiz model etiketleri */
  modelLabels: string[];
  modelLabel: string;
  /** Dönemde bu kayıt için girilmiş personel açıklamaları (tarih + metin) */
  dayNotes: PersonDayNote[];
};

export function buildPersonProcessBreakdown(rows: WorkerProductionDayDetail[]): PersonProcessBreakdownRow[] {
  const byWorker = new Map<
    number,
    {
      team: string;
      process: string;
      days: Set<string>;
      total: number;
      models: Set<string>;
      notesByDate: Map<string, string>;
    }
  >();
  for (const r of rows) {
    const id = r.workerId ?? 0;
    if (!byWorker.has(id)) {
      byWorker.set(id, {
        team: r.team,
        process: r.process,
        days: new Set(),
        total: 0,
        models: new Set(),
        notesByDate: new Map(),
      });
    }
    const e = byWorker.get(id)!;
    e.days.add(r.productionDate);
    e.total += dayTotal(r);
    const model = formatModelDisplayLabel(r.productName, r.productModel);
    if (model) e.models.add(model);
    const note = String(r.note ?? "").trim();
    if (note) e.notesByDate.set(r.productionDate, note);
  }
  return [...byWorker.entries()]
    .map(([workerId, v]) => {
      const modelLabels = [...v.models].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" }));
      const dayNotes = [...v.notesByDate.entries()]
        .map(([date, note]) => ({ date, note }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        workerId,
        team: v.team,
        process: v.process,
        dayCount: v.days.size,
        total: v.total,
        modelLabels,
        modelLabel: modelLabels.join(" · "),
        dayNotes,
      };
    })
    .sort(
      (a, b) =>
        a.team.localeCompare(b.team, "tr", { sensitivity: "base" }) ||
        a.process.localeCompare(b.process, "tr", { sensitivity: "base" }) ||
        a.workerId - b.workerId
    );
}
