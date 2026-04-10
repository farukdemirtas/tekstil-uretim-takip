"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProductModel,
  deleteProductModel,
  getProcesses,
  getProductModel,
  getTeams,
  listProductModels,
  updateProductModel,
  type ProcessRow,
  type ProductModelListItem,
  type TeamRow,
} from "@/lib/api";

const MAX_BASELINE_ROWS = 20;

type BaselineRow = { teamCode: string; processName: string; arkaHalf: number };

function emptyRow(): BaselineRow {
  return { teamCode: "", processName: "", arkaHalf: 0 };
}

export default function ProductModelsSection() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [list, setList] = useState<ProductModelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [modelCode, setModelCode] = useState("");
  const [productName, setProductName] = useState("");
  const [baselines, setBaselines] = useState<BaselineRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const processNames = useMemo(() => processes.map((p) => p.name).sort((a, b) => a.localeCompare(b, "tr")), [processes]);

  const loadTeamsAndProcesses = useCallback(async () => {
    const [t, p] = await Promise.all([getTeams(), getProcesses()]);
    setTeams(t);
    setProcesses(p);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [t, p, m] = await Promise.all([getTeams(), getProcesses(), listProductModels()]);
      setTeams(t);
      setProcesses(p);
      setList(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function startNew() {
    setEditingId("new");
    setModelCode("");
    setProductName("");
    setBaselines([emptyRow()]);
    setError(null);
    try {
      await loadTeamsAndProcesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bölüm ve proses listesi alınamadı");
    }
  }

  async function startEdit(id: number) {
    setError(null);
    try {
      await loadTeamsAndProcesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bölüm ve proses listesi alınamadı");
      return;
    }
    try {
      const d = await getProductModel(id);
      setEditingId(id);
      setModelCode(d.modelCode);
      setProductName(d.productName);
      const rows = (d.baselines || [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
          teamCode: row.teamCode,
          processName: row.processName,
          arkaHalf: row.arkaHalf ? 1 : 0,
        }));
      setBaselines(rows.length ? rows : [emptyRow()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Model yüklenemedi");
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  function setRow(index: number, field: keyof BaselineRow, value: string | number) {
    setBaselines((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    setBaselines((prev) => (prev.length >= MAX_BASELINE_ROWS ? prev : [...prev, emptyRow()]));
  }

  function removeRow(index: number) {
    setBaselines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSave() {
    if (editingId === null) return;
    setSaving(true);
    setError(null);
    const payload = {
      modelCode,
      productName,
      baselines: baselines.map((b) => ({
        teamCode: b.teamCode,
        processName: b.processName,
        arkaHalf: b.arkaHalf ? 1 : 0,
      })),
    };
    try {
      if (editingId === "new") {
        await createProductModel(payload);
      } else {
        await updateProductModel(editingId, payload);
      }
      await loadAll();
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Bu modeli silmek istediğinize emin misiniz?")) return;
    setError(null);
    try {
      await deleteProductModel(id);
      if (editingId === id) setEditingId(null);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ürün modelleri (hedef bazı)</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Bu üründe kaç bölüm hattı izlenecekse o kadar satır ekleyin (ör. 3 veya 5). Her satırda{" "}
            <strong className="font-medium text-slate-700 dark:text-slate-200">çalışılacak bölüm</strong> ve o bölümde
            üretim toplamına <strong className="font-medium text-slate-700 dark:text-slate-200">baz alınacak proses</strong>{" "}
            seçilir. Genel tamamlanan, bu satırların adetlerinin minimumudur.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startNew()}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Yeni model
        </button>
      </div>

      {loading && list.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Liste yükleniyor…</p>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {editingId !== null ? (
        <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-600">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {editingId === "new" ? "Yeni model" : "Modeli düzenle"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Model kodu</label>
              <input
                value={modelCode}
                onChange={(e) => setModelCode(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Örn. YM-2026-04"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Ürün adı</label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Örn. Polo tişört"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {teams.length === 0 || processes.length === 0 ? (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                {teams.length === 0 && processes.length === 0
                  ? "Henüz bölüm ve proses tanımı yok. Ayarlar’da «Proses ve bölüm» sekmesinden önce liste oluşturun."
                  : teams.length === 0
                    ? "Henüz bölüm yok. Ayarlar’da «Proses ve bölüm» sekmesinden ekleyin."
                    : "Henüz proses yok. Ayarlar’da «Proses ve bölüm» sekmesinden ekleyin."}
              </p>
            ) : null}
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="w-10 py-2 pr-1">#</th>
                  <th className="py-2 pr-2">Çalışılacak bölüm</th>
                  <th className="py-2 pr-2">Baz alınacak proses</th>
                  <th className="py-2">İsteğe bağlı 0.5 çarpan</th>
                  <th className="w-14 py-2" />
                </tr>
              </thead>
              <tbody>
                {baselines.map((row, index) => (
                  <tr key={index} className="border-b border-slate-100 dark:border-slate-700/80">
                    <td className="py-2 pr-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                      {index + 1}
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={row.teamCode}
                        onChange={(e) => setRow(index, "teamCode", e.target.value)}
                        className="w-full min-w-[10rem] rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Bölüm seçin…</option>
                        {teams.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label} ({t.code})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={row.processName}
                        onChange={(e) => setRow(index, "processName", e.target.value)}
                        className="w-full min-w-[10rem] rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Proses seçin…</option>
                        {processNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 text-center">
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={row.arkaHalf === 1}
                          onChange={(e) => setRow(index, "arkaHalf", e.target.checked ? 1 : 0)}
                        />
                        <span className="text-slate-600 dark:text-slate-400">Girilen × ½</span>
                      </label>
                    </td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        disabled={baselines.length <= 1}
                        onClick={() => removeRow(index)}
                        className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                        title="Satırı kaldır"
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addRow}
                disabled={baselines.length >= MAX_BASELINE_ROWS}
                className="rounded-lg border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-200 dark:hover:bg-teal-950/60"
              >
                + Bölüm satırı ekle
              </button>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                En az 1, en çok {MAX_BASELINE_ROWS} satır
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200"
            >
              İptal
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Kayıtlı modeller</h3>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz model yok. Yukarıdan ekleyin.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {list.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{m.modelCode}</span>
                  <span className="text-slate-500 dark:text-slate-400"> — {m.productName || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void startEdit(m.id)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(m.id)}
                    className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
