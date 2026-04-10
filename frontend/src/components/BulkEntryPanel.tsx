"use client";

import { useState } from "react";
import { ProductionRow } from "@/lib/types";

type BulkEntryPanelProps = {
  rows: ProductionRow[];
  onApply: (entries: Array<{ workerId: number; t1000: number; t1300: number; t1600: number; t1830: number }>) => Promise<void>;
};

export default function BulkEntryPanel({ rows, onApply }: BulkEntryPanelProps) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setMessage(null);
    setError(null);

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      setError("Yapıştırılacak veri bulunamadı.");
      return;
    }

    const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r]));
    const entries: Array<{ workerId: number; t1000: number; t1300: number; t1600: number; t1830: number }> = [];

    for (const line of lines) {
      const cols = line.split("\t");
      if (cols.length < 5) {
        setError("Her satır: Ad Soyad + 4 saat değeri (TAB ayraçlı) olmalı.");
        return;
      }
      const name = cols[0].trim().toLowerCase();
      const worker = byName.get(name);
      if (!worker) {
        setError(`Çalışan bulunamadı: ${cols[0]}`);
        return;
      }

      entries.push({
        workerId: worker.workerId,
        t1000: Number(cols[1]) || 0,
        t1300: Number(cols[2]) || 0,
        t1600: Number(cols[3]) || 0,
        t1830: Number(cols[4]) || 0
      });
    }

    try {
      await onApply(entries);
      setMessage(`${entries.length} satır toplu kaydedildi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız");
    }
  }

  return (
    <section className="surface-card rounded-xl border border-slate-200/90 p-4 shadow-surface-sm dark:border-slate-700 dark:text-slate-100">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">Toplu Veri Girişi</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Excel&apos;den satırları seçip yapıştırın. Format:{" "}
        <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">Ad Soyad[TAB]10:00[TAB]13:00[TAB]16:00[TAB]18:30</code>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"Örnek:\nAyşe Kaya\t12\t10\t8\t6"}
        className="mt-3 w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleApply()}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          Toplu Kaydet
        </button>
        {message && <span className="text-sm text-emerald-700 dark:text-emerald-400">{message}</span>}
        {error && <span className="text-sm text-red-700 dark:text-red-400">{error}</span>}
      </div>
    </section>
  );
}
