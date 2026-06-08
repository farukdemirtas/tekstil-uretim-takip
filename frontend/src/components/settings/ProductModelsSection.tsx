"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import {
  applyHedefSession,
  createProductModel,
  deleteProductModel,
  getProcesses,
  getProductModel,
  getTeams,
  getTakipsanConsignmentInfo,
  listProductModels,
  refreshProductModelTarget,
  updateProductModel,
  type ProcessRow,
  type ProductModelListItem,
  type TeamRow,
} from "@/lib/api";
import { clampToWeekdayIso, coerceWeekdayPickerValue, todayWeekdayIso } from "@/lib/businessCalendar";
import { formatModelPickerLabel, formatProductDisplayLine } from "@/lib/takipsanProduct";
import { hasPermission } from "@/lib/permissions";

const MAX_BASELINE_ROWS = 20;
const HEDEF_TAKIP_SETTINGS_KEY = "hedef_takip_settings_v1";

function persistHedefSettingsModelId(modelId: number | null) {
  try {
    const raw = window.localStorage.getItem(HEDEF_TAKIP_SETTINGS_KEY);
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(HEDEF_TAKIP_SETTINGS_KEY, JSON.stringify({ ...prev, modelId }));
  } catch {
    /* ignore */
  }
}

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
  const [sessionStartDate, setSessionStartDate] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [fromTakipsan, setFromTakipsan] = useState(false);
  const [takipsanProductLabel, setTakipsanProductLabel] = useState("");
  const [takipsanOrderCode, setTakipsanOrderCode] = useState("");
  const [targetQuantity, setTargetQuantity] = useState(0);
  const [isTakipsanLinkedEdit, setIsTakipsanLinkedEdit] = useState(false);
  const [takipsanBusy, setTakipsanBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hedefApplyModelId, setHedefApplyModelId] = useState<number | "">("");
  const [hedefApplyStart, setHedefApplyStart] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [hedefApplyEnd, setHedefApplyEnd] = useState(() => clampToWeekdayIso(todayWeekdayIso()));
  const [hedefApplyBusy, setHedefApplyBusy] = useState(false);
  const [hedefApplyMsg, setHedefApplyMsg] = useState<string | null>(null);
  const [hedefApplyErr, setHedefApplyErr] = useState<string | null>(null);

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

  useEffect(() => {
    if (!list.length) return;
    if (!hasPermission("hedefTakip")) return;
    try {
      const raw = window.localStorage.getItem(HEDEF_TAKIP_SETTINGS_KEY);
      const saved = raw ? (JSON.parse(raw) as { modelId?: number | null }) : {};
      if (
        saved.modelId != null &&
        Number.isFinite(Number(saved.modelId)) &&
        list.some((x) => x.id === Number(saved.modelId))
      ) {
        setHedefApplyModelId(Number(saved.modelId));
      } else if (list.length === 1) {
        setHedefApplyModelId(list[0].id);
        persistHedefSettingsModelId(list[0].id);
      }
    } catch {
      /* ignore */
    }
  }, [list]);

  async function startNew() {
    setEditingId("new");
    setModelCode("");
    setProductName("");
    setBaselines([emptyRow()]);
    setFromTakipsan(false);
    setTakipsanProductLabel("");
    setTakipsanOrderCode("");
    setTargetQuantity(0);
    setIsTakipsanLinkedEdit(false);
    setSessionStartDate(clampToWeekdayIso(todayWeekdayIso()));
    setError(null);
    try {
      await loadTeamsAndProcesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bölüm ve proses listesi alınamadı");
    }
  }

  async function startNewFromTakipsan() {
    setTakipsanBusy(true);
    setError(null);
    try {
      await loadTeamsAndProcesses();
      const info = await getTakipsanConsignmentInfo();
      setEditingId("new");
      setFromTakipsan(true);
      setIsTakipsanLinkedEdit(true);
      setModelCode(info.modelCode || info.productRef);
      setProductName(info.productName);
      setTakipsanProductLabel(info.productRef || info.productLabel);
      setTakipsanOrderCode(info.orderCode);
      setTargetQuantity(info.orderQuantity);
      setBaselines([emptyRow()]);
      setSessionStartDate(clampToWeekdayIso(todayWeekdayIso()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Takipsan verisi alınamadı");
    } finally {
      setTakipsanBusy(false);
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
      setFromTakipsan(Boolean(d.isTakipsanLinked));
      setIsTakipsanLinkedEdit(Boolean(d.isTakipsanLinked));
      setTakipsanProductLabel(d.takipsanProductLabel || "");
      setTakipsanOrderCode(d.takipsanOrderCode || "");
      setTargetQuantity(d.targetQuantity ?? 0);
      setSessionStartDate(
        d.sessionStartDate ? clampToWeekdayIso(String(d.sessionStartDate)) : clampToWeekdayIso(todayWeekdayIso())
      );
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
      sessionStartDate: sessionStartDate || null,
      ...(editingId === "new" && fromTakipsan
        ? {
            fromTakipsan: true,
            takipsanProductLabel,
            takipsanOrderCode,
            targetQuantity,
          }
        : {}),
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

  function handleHedefApplyModelPick(value: string) {
    setHedefApplyMsg(null);
    setHedefApplyErr(null);
    if (value === "") {
      setHedefApplyModelId("");
      persistHedefSettingsModelId(null);
      return;
    }
    const num = Number(value);
    setHedefApplyModelId(num);
    persistHedefSettingsModelId(num);
  }

  async function handleHedefApplyToProduction() {
    setHedefApplyMsg(null);
    setHedefApplyErr(null);
    if (hedefApplyModelId === "") {
      setHedefApplyErr("Önce bir ürün modeli seçin.");
      return;
    }
    const start = clampToWeekdayIso(hedefApplyStart);
    const end = clampToWeekdayIso(hedefApplyEnd);
    if (!start || !end || start > end) {
      setHedefApplyErr("Geçerli bir hafta içi tarih aralığı seçin.");
      return;
    }
    setHedefApplyBusy(true);
    try {
      const m = await getProductModel(Number(hedefApplyModelId));
      const { datesUpdated } = await applyHedefSession({
        modelId: Number(hedefApplyModelId),
        startDate: start,
        endDate: end,
        productName: m.productName,
        productModel: m.modelCode,
      });
      setHedefApplyMsg(
        datesUpdated > 0
          ? `${datesUpdated} iş gününe ürün adı ve model kodu yazıldı. Ana üretim ekranında ilgili tarihlerde «Çalışılacak ürün» güncellenir.`
          : "Aralıkta güncellenecek iş günü bulunamadı."
      );
    } catch (e) {
      setHedefApplyErr(e instanceof Error ? e.message : "Uygulanamadı");
    } finally {
      setHedefApplyBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ürün modelleri (hedef bazı)</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Takipsan sevkiyatından ürün adı ve hedef adet otomatik gelir. Siz yalnızca{" "}
            <strong className="font-medium text-slate-700 dark:text-slate-200">baz alınacak proses</strong> ve{" "}
            <strong className="font-medium text-slate-700 dark:text-slate-200">takip başlangıç tarihi</strong>ni
            belirlersiniz. Eski manuel modeller aynen kalır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void startNewFromTakipsan()}
          disabled={takipsanBusy}
          className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {takipsanBusy ? "Takipsan…" : "Takipsan'dan ürün ekle"}
        </button>
        <button
          type="button"
          onClick={() => startNew()}
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Manuel model
        </button>
        </div>
      </div>

      {hasPermission("hedefTakip") ? (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900/40 dark:bg-teal-950/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Hedef Takip: üretim günlerine model uygula
              </h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Seçilen hafta içi günlere ürün adı ve model kodu yazılır; ana üretim ekranında «Çalışılacak ürün» alanı
                bu kaynaktan güncellenir.
              </p>
            </div>
            <Link
              href="/hedef-takip"
              className="shrink-0 text-xs font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
            >
              Hedef Takip
            </Link>
          </div>
          <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">Ürün modeli</label>
          <select
            value={hedefApplyModelId === "" ? "" : String(hedefApplyModelId)}
            onChange={(e) => handleHedefApplyModelPick(e.target.value)}
            className="mt-1 w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Model seçin…</option>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {formatModelPickerLabel(m.productName, m.modelCode, m.targetQuantity)}
              </option>
            ))}
          </select>
          {list.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Önce yukarıdan model ekleyin.</p>
          ) : null}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <WeekdayDatePicker
              label="Başlangıç"
              value={hedefApplyStart}
              onChange={(v) => setHedefApplyStart(coerceWeekdayPickerValue(v))}
              className="min-w-[12rem] flex-1"
            />
            <WeekdayDatePicker
              label="Bitiş"
              value={hedefApplyEnd}
              onChange={(v) => setHedefApplyEnd(coerceWeekdayPickerValue(v))}
              className="min-w-[12rem] flex-1"
            />
            <button
              type="button"
              disabled={hedefApplyBusy || hedefApplyModelId === ""}
              onClick={() => void handleHedefApplyToProduction()}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              {hedefApplyBusy ? "Uygulanıyor…" : "Üretim ekranına uygula"}
            </button>
          </div>
          {hedefApplyMsg ? (
            <p className="mt-3 rounded-md border border-teal-200 bg-teal-50/80 px-3 py-2 text-xs text-teal-900 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-teal-200">
              {hedefApplyMsg}
            </p>
          ) : null}
          {hedefApplyErr ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{hedefApplyErr}</p>
          ) : null}
        </div>
      ) : null}

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
            {editingId === "new" ? (fromTakipsan ? "Takipsan ürünü" : "Yeni model") : "Modeli düzenle"}
          </h3>

          {isTakipsanLinkedEdit ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                Takipsan ürünü
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                {takipsanProductLabel || formatProductDisplayLine(productName, modelCode)}
              </p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Hedef adet (sipariş sayısı):{" "}
                <strong className="text-slate-800 dark:text-slate-100">
                  {targetQuantity > 0 ? targetQuantity.toLocaleString("tr-TR") : "—"}
                </strong>
              </p>
              {typeof editingId === "number" ? (
                <button
                  type="button"
                  disabled={takipsanBusy}
                  onClick={() => {
                    setTakipsanBusy(true);
                    void refreshProductModelTarget(editingId)
                      .then((r) => {
                        setTargetQuantity(r.targetQuantity);
                        if (r.productLabel) setTakipsanProductLabel(r.productLabel);
                      })
                      .catch((e) => setError(e instanceof Error ? e.message : "Güncellenemedi"))
                      .finally(() => setTakipsanBusy(false));
                  }}
                  className="mt-2 rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-200"
                >
                  {takipsanBusy ? "Yenileniyor…" : "Takipsan'dan hedefi yenile"}
                </button>
              ) : null}
            </div>
          ) : (
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
          )}

          <WeekdayDatePicker
            label="Takip başlangıç tarihi"
            value={sessionStartDate}
            onChange={(v) => setSessionStartDate(coerceWeekdayPickerValue(v))}
            className="max-w-xs"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Ekran 1 ve hedef özette «Biten» toplamı bu tarihten itibaren sayılır.
          </p>

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
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {m.isTakipsanLinked
                      ? m.takipsanProductLabel || formatModelPickerLabel(m.productName, m.modelCode)
                      : `${m.modelCode} — ${m.productName || "—"}`}
                  </span>
                  {m.targetQuantity != null && m.targetQuantity > 0 ? (
                    <span className="ml-2 text-xs text-teal-700 dark:text-teal-300">
                      {m.targetQuantity.toLocaleString("tr-TR")} adet
                    </span>
                  ) : null}
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
