"use client";

import { useEffect, useState } from "react";
import {
  getDecisionSupportSettings,
  listProductModels,
  saveDecisionSupportSettings,
  sendWeeklyDecisionReportNow,
  type DecisionSupportSettings,
  type ProductModelListItem,
} from "@/lib/api";

const WK_DAYS: { v: number; label: string }[] = [
  { v: 1, label: "Pazartesi" },
  { v: 2, label: "Salı" },
  { v: 3, label: "Çarşamba" },
  { v: 4, label: "Perşembe" },
  { v: 5, label: "Cuma" },
  { v: 6, label: "Cumartesi" },
  { v: 0, label: "Pazar" },
];

export default function DecisionSupportSection() {
  const [models, setModels] = useState<ProductModelListItem[]>([]);
  const [s, setS] = useState<DecisionSupportSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    Promise.all([getDecisionSupportSettings(), listProductModels()])
      .then(([ds, ml]) => {
        if (!ok) return;
        setS(ds);
        setModels(ml);
      })
      .catch(() => setErr("Ayarlar veya model listesi yüklenemedi."))
      .finally(() => ok && setLoading(false));
    return () => {
      ok = false;
    };
  }, []);

  async function persist(next: DecisionSupportSettings) {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const out = await saveDecisionSupportSettings(next);
      setS(out);
      setMsg("Kaydedildi.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !s) {
    return <p className="text-sm text-slate-500">Yükleniyor…</p>;
  }

  return (
    <section className="space-y-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Rapor ve hedef uyarıları</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          TV (EKRAN1) ve otomatik rapor için sunucuya kaydedilen ayarlardır. Haftalık e-posta için SMTP ortam değişkenleri
          gerekir: <code className="text-xs">SMTP_HOST</code>, <code className="text-xs">SMTP_PORT</code>,{" "}
          <code className="text-xs">SMTP_USER</code>, <code className="text-xs">SMTP_PASS</code>,{" "}
          <code className="text-xs">MAIL_FROM</code>.
        </p>
      </div>

      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/25 dark:text-red-300">
          {err}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-200">
          {msg}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <fieldset className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <legend className="px-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            Hedef sapma uyarısı (EKRAN1)
          </legend>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.hedefAlert.enabled}
              onChange={(e) =>
                setS({
                  ...s,
                  hedefAlert: { ...s.hedefAlert, enabled: e.target.checked },
                })
              }
            />
            Aktif
          </label>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Günlük yüzde, seçilen günlük hedef adede göre. Haftalık yüzde, Pazartesi–Cuma orantılı ilerlemeye göre (tam haftalık çizgi
            boş ise günlük hedef × 5).
          </p>
          <label className="mt-4 block text-sm font-medium">
            Ürün modeli
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={s.hedefAlert.modelId != null ? String(s.hedefAlert.modelId) : ""}
              onChange={(ev) =>
                setS({
                  ...s,
                  hedefAlert: {
                    ...s.hedefAlert,
                    modelId: ev.target.value ? Number(ev.target.value) : null,
                  },
                })
              }
            >
              <option value="">Seçin…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.modelCode} — {m.productName || "—"}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Günlük hedef (adet)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={s.hedefAlert.targetQty}
                onChange={(e) =>
                  setS({
                    ...s,
                    hedefAlert: { ...s.hedefAlert, targetQty: Number(e.target.value) || 0 },
                  })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Tam haftalık hedef (opsiyonel, boş ise günlük × 5)
              <input
                type="number"
                min={0}
                placeholder="Örn. 24000"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={
                  s.hedefAlert.weeklyTargetAdet != null && Number.isFinite(s.hedefAlert.weeklyTargetAdet)
                    ? String(s.hedefAlert.weeklyTargetAdet)
                    : ""
                }
                onChange={(e) =>
                  setS({
                    ...s,
                    hedefAlert: {
                      ...s.hedefAlert,
                      weeklyTargetAdet: e.target.value === "" ? null : Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Günlük uyarı (% altı)
              <input
                type="number"
                min={0}
                max={100}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={s.hedefAlert.thresholdDailyPct}
                onChange={(e) =>
                  setS({
                    ...s,
                    hedefAlert: {
                      ...s.hedefAlert,
                      thresholdDailyPct: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Haftalık uyarı (beklenen ilerlemenin % altı)
              <input
                type="number"
                min={0}
                max={100}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={s.hedefAlert.thresholdWeeklyPct}
                onChange={(e) =>
                  setS({
                    ...s,
                    hedefAlert: {
                      ...s.hedefAlert,
                      thresholdWeeklyPct: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-sky-200/80 bg-sky-50/40 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
          <legend className="px-2 text-sm font-semibold text-sky-900 dark:text-sky-200">
            Haftalık özet e-postası (PDF ekli)
          </legend>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.weeklyReport.enabled}
              onChange={(e) =>
                setS({
                  ...s,
                  weeklyReport: { ...s.weeklyReport, enabled: e.target.checked },
                })
              }
            />
            Zamanlı gönderim açık
          </label>
          <label className="mt-4 block text-sm font-medium">
            Alıcı e-postalar (virgül veya satır ile)
            <textarea
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={s.weeklyReport.recipientsCsv}
              onChange={(e) =>
                setS({
                  ...s,
                  weeklyReport: { ...s.weeklyReport, recipientsCsv: e.target.value },
                })
              }
              placeholder="mudur@sirket.com, planlama@sirket.com"
            />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Gün (Türkiye)
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={s.weeklyReport.sendWeekday}
                onChange={(e) =>
                  setS({
                    ...s,
                    weeklyReport: { ...s.weeklyReport, sendWeekday: Number(e.target.value) },
                  })
                }
              >
                {WK_DAYS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Saat
              <input
                type="number"
                min={0}
                max={23}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={s.weeklyReport.sendHourTurkey}
                onChange={(e) =>
                  setS({
                    ...s,
                    weeklyReport: { ...s.weeklyReport, sendHourTurkey: Number(e.target.value) || 0 },
                  })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Dakika
              <input
                type="number"
                min={0}
                max={59}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={s.weeklyReport.sendMinuteTurkey ?? 0}
                onChange={(e) =>
                  setS({
                    ...s,
                    weeklyReport: { ...s.weeklyReport, sendMinuteTurkey: Number(e.target.value) || 0 },
                  })
                }
              />
            </label>
          </div>
          {(s.weeklyReport.lastError || s.weeklyReport.lastSentAt) && (
            <div className="mt-4 rounded-md bg-white/70 p-3 text-xs dark:bg-slate-900/60">
              {s.weeklyReport.lastSentAt && (
                <div className="text-slate-600 dark:text-slate-400">Son gönderim: {s.weeklyReport.lastSentAt}</div>
              )}
              {s.weeklyReport.lastError && (
                <div className="mt-1 text-red-600 dark:text-red-400">{s.weeklyReport.lastError}</div>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sendBusy}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              onClick={async () => {
                setSendBusy(true);
                setErr(null);
                setMsg(null);
                try {
                  await persist(s);
                  await sendWeeklyDecisionReportNow();
                  setMsg("Test e-postası gönderildi.");
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Gönderilemedi");
                } finally {
                  setSendBusy(false);
                }
              }}
            >
              {sendBusy ? "Gönderiliyor…" : "Şimdi gönder (bu Pazartesi–Cuma aralığı)"}
            </button>
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          className="rounded-md bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          onClick={() => void persist(s)}
        >
          {saving ? "Kaydediliyor…" : "Ayarlara kaydet"}
        </button>
      </div>
    </section>
  );
}
