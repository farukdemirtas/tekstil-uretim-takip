"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { getActivityLogs, setAuthToken } from "@/lib/api";
import type { ActivityLogQuery, ActivityLogRow } from "@/lib/api";
import { todayWeekdayIso } from "@/lib/businessCalendar";

const ACTION_LABELS: Record<string, string> = {
  giris: "Oturum açma",
  manuel_not: "Manuel not",
  kullanici_olustur: "Kullanıcı oluşturma",
  kullanici_sil: "Kullanıcı silme",
  sifre_sifirla: "Şifre sıfırlama",
  yetki_guncelle: "Yetki güncelleme",
  isim_havuzu_ekle: "İsim havuzuna ekleme",
  isim_havuzu_guncelle: "İsim havuzu güncelleme",
  isim_havuzu_sil: "İsim havuzundan silme",
  bolum_ekle: "Bölüm ekleme",
  bolum_guncelle: "Bölüm güncelleme",
  bolum_sil: "Bölüm silme",
  proses_ekle: "Proses ekleme",
  proses_guncelle: "Proses güncelleme",
  proses_sil: "Proses silme",
  calisan_ekle: "Çalışan ekleme",
  calisan_guncelle: "Çalışan güncelleme",
  calisan_sil: "Çalışan silme",
  calisan_toplu_liste_kaldir: "Tüm personel listeden kaldır (gün)",
  urun_meta_guncelle: "Gün ürün bilgisi",
  uretim_kayit: "Üretim kaydı (tek)",
  uretim_toplu: "Üretim kaydı (toplu)",
};

type FilterForm = {
  action: string;
  actor: string;
  resource: string;
  q: string;
  dateFrom: string;
  dateTo: string;
};

function defaultLogFilterForm(): FilterForm {
  const t = todayWeekdayIso();
  return {
    action: "",
    actor: "",
    resource: "",
    q: "",
    dateFrom: t,
    dateTo: t,
  };
}

function parseDetailsObject(raw: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o)) return o as Record<string, unknown>;
  } catch {
    /* plain text */
  }
  return null;
}

function val(d: Record<string, unknown> | null, key: string): string {
  if (!d) return "";
  const v = d[key];
  if (v == null) return "";
  return String(v);
}

/** Log detayında çalışan adı varsa göster, yoksa #id (eski kayıtlar). */
function calisanEtiketi(d: Record<string, unknown> | null, idKey: "id" | "workerId"): string {
  if (!d) return "";
  const isim = val(d, "name").trim() || val(d, "workerName").trim();
  if (isim) return `“${isim}”`;
  const id = val(d, idKey);
  return id ? `çalışan #${id}` : "çalışan";
}

/** Sunucuda UTC saklanan YYYY-MM-DD HH:MM:SS → Europe/Istanbul ile listeleme */
function formatActivityLogUtcToIstanbul(raw: string): string {
  const s = raw?.trim();
  if (!s) return "—";
  const normalized = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function logIslemDetayi(row: ActivityLogRow): string {
  const { action, details } = row;
  const raw = (details || "").trim();
  const d = parseDetailsObject(raw);

  switch (action) {
    case "manuel_not":
      return raw || "—";
    case "giris":
      return "Sisteme giriş yaptı.";
    case "kullanici_olustur":
      if (d) return `Yeni kullanıcı oluşturuldu: “${val(d, "username")}” (kayıt #${val(d, "id")}).`;
      break;
    case "kullanici_sil":
      if (d) return `#${val(d, "id")} numaralı kullanıcı silindi.`;
      break;
    case "sifre_sifirla":
      if (d) return `#${val(d, "id")} numaralı kullanıcının şifresi sıfırlandı.`;
      break;
    case "yetki_guncelle":
      if (d) return `#${val(d, "id")} kullanıcısının ekran yetkileri güncellendi.`;
      break;
    case "isim_havuzu_ekle":
      if (d) return `İsim havuzuna “${val(d, "name")}” eklendi (#${val(d, "id")}).`;
      break;
    case "isim_havuzu_guncelle":
      if (d) return `İsim havuzu kaydı #${val(d, "id")} “${val(d, "name")}” olarak güncellendi.`;
      break;
    case "isim_havuzu_sil":
      if (d) return `İsim havuzundan #${val(d, "id")} silindi.`;
      break;
    case "bolum_ekle":
      if (d) return `Yeni bölüm: “${val(d, "label")}” (kod: ${val(d, "code")}, #${val(d, "id")}).`;
      break;
    case "bolum_guncelle":
      if (d) {
        const parts = [`#${val(d, "id")}`];
        if (val(d, "label")) parts.push(`ad: “${val(d, "label")}”`);
        if (val(d, "code")) parts.push(`kod: ${val(d, "code")}`);
        return `Bölüm güncellendi: ${parts.join(", ")}.`;
      }
      break;
    case "bolum_sil":
      if (d) return `Bölüm silindi (kayıt #${val(d, "id")}).`;
      break;
    case "proses_ekle":
      if (d) return `Yeni proses: “${val(d, "name")}” (#${val(d, "id")}).`;
      break;
    case "proses_guncelle":
      if (d) {
        const parts = [`#${val(d, "id")}`];
        if (val(d, "name")) parts.push(`ad: “${val(d, "name")}”`);
        return `Proses güncellendi: ${parts.join(", ")}.`;
      }
      break;
    case "proses_sil":
      if (d) return `Proses silindi (kayıt #${val(d, "id")}).`;
      break;
    case "calisan_ekle":
      if (d)
        return `Çalışan eklendi: “${val(d, "name")}”, bölüm ${val(d, "team")}, proses “${val(d, "process")}”.`;
      break;
    case "calisan_guncelle":
      if (d)
        return `${calisanEtiketi(d, "id")} için proses “${val(d, "process")}” olarak güncellendi.`;
      break;
    case "calisan_sil":
      if (d) {
        const gun = val(d, "date");
        const who = calisanEtiketi(d, "id");
        if (gun && gun !== "tam") return `${who} yalnızca ${gun} gününden kaldırıldı.`;
        return `${who} listeden çıkarıldı / pasifleştirildi.`;
      }
      break;
    case "calisan_toplu_liste_kaldir":
      if (d) {
        const sc = val(d, "scope");
        const c = val(d, "count");
        const dt = val(d, "date");
        if (sc === "only_day")
          return `${dt} tarihinde yalnızca o gün için ${c} personel listeden gizlendi; sonraki günlerde yine görünür.`;
        return `${dt} tarihi ve sonrasında listeden ${c} personel kaldırıldı (pasif).`;
      }
      break;
    case "urun_meta_guncelle":
      if (d) {
        const ad = val(d, "productName") || val(d, "product_name");
        const model = val(d, "productModel") || val(d, "product_model");
        return `${val(d, "date")} günü ürün adı: “${ad}”, model: “${model}”.`;
      }
      break;
    case "uretim_kayit":
      if (d) {
        const who = calisanEtiketi(d, "workerId");
        return `${val(d, "date")} tarihinde ${who} için saatlik üretim rakamları kaydedildi.`;
      }
      break;
    case "uretim_toplu":
      if (d) {
        const wn = val(d, "workerNames").trim();
        const satir = val(d, "satir");
        if (wn)
          return `${val(d, "date")} günü toplu kayıt (${satir} satır): ${wn}.`;
        return `${val(d, "date")} günü toplu kayıt: ${satir} çalışan satırı güncellendi.`;
      }
      break;
    default:
      break;
  }

  const islemAdi = ACTION_LABELS[action] ?? action;
  if (raw) {
    if (d) return `${islemAdi}: ${JSON.stringify(d)}`;
    return `${islemAdi}: ${raw}`;
  }
  return islemAdi;
}

function toQuery(f: FilterForm): ActivityLogQuery {
  const out: ActivityLogQuery = { limit: 500, offset: 0 };
  if (f.action) out.action = f.action;
  if (f.actor.trim()) out.actor = f.actor.trim();
  if (f.resource.trim()) out.resource = f.resource.trim();
  if (f.q.trim()) out.q = f.q.trim();
  if (f.dateFrom) out.dateFrom = f.dateFrom;
  if (f.dateTo) out.dateTo = f.dateTo;
  return out;
}

export default function LogsSection() {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FilterForm>(() => defaultLogFilterForm());

  const actionOptions = useMemo(() => {
    return Object.entries(ACTION_LABELS)
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "tr"));
  }, []);

  const runQuery = useCallback(async (f: FilterForm) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActivityLogs(toQuery(f));
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    setAuthToken(token);
    const initial = defaultLogFilterForm();
    setForm(initial);
    void runQuery(initial);
  }, [runQuery]);

  function applyFilters() {
    void runQuery(form);
  }

  function clearFilters() {
    const cleared = defaultLogFilterForm();
    setForm(cleared);
    void runQuery(cleared);
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Loglar</h2>
          <button
            type="button"
            onClick={() => void runQuery(form)}
            disabled={loading}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Yenile
          </button>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-600">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Filtreler</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Koşulları seçip &quot;Filtrele&quot;ye basın; en fazla 500 satır döner.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="flt-action" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                İşlem türü
              </label>
              <select
                id="flt-action"
                value={form.action}
                onChange={(e) => setForm((p) => ({ ...p, action: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Tümü</option>
                {actionOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="flt-actor" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Kullanıcı (içerir)
              </label>
              <input
                id="flt-actor"
                value={form.actor}
                onChange={(e) => setForm((p) => ({ ...p, actor: e.target.value }))}
                placeholder="örn. admin"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="flt-resource" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Kaynak (içerir)
              </label>
              <input
                id="flt-resource"
                value={form.resource}
                onChange={(e) => setForm((p) => ({ ...p, resource: e.target.value }))}
                placeholder="örn. workers, production_entries"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
              <label htmlFor="flt-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Genel arama (ayrıntı, işlem kodu, kaynak, kullanıcı)
              </label>
              <input
                id="flt-q"
                value={form.q}
                onChange={(e) => setForm((p) => ({ ...p, q: e.target.value }))}
                placeholder="Herhangi bir alanda geçen metin…"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <WeekdayDatePicker
                id="log-date-from"
                label="Başlangıç tarihi"
                value={form.dateFrom}
                onChange={(iso) => setForm((p) => ({ ...p, dateFrom: iso }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <WeekdayDatePicker
                id="log-date-to"
                label="Bitiş tarihi"
                value={form.dateTo}
                onChange={(iso) => setForm((p) => ({ ...p, dateTo: iso }))}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => applyFilters()}
                disabled={loading}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Filtrele
              </button>
              <button
                type="button"
                onClick={() => clearFilters()}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Sıfırla
              </button>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {loading ? "Yükleniyor…" : `${rows.length} kayıt listeleniyor (en fazla 500)`}
        </div>
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">Zaman</th>
                <th className="border-b border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">Kullanıcı</th>
                <th className="border-b border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">İşlem</th>
                <th className="border-b border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">İşlem detayı</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    Yükleniyor…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    Kriterlere uygun kayıt yok.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 odd:bg-white even:bg-slate-50/80 dark:border-slate-700 dark:odd:bg-slate-800 dark:even:bg-slate-800/70"
                  >
                    <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-slate-600 dark:text-slate-400">
                      {formatActivityLogUtcToIstanbul(r.created_at)}
                    </td>
                    <td className="px-3 py-2 align-top font-medium text-slate-800 dark:text-slate-200">{r.actor_username}</td>
                    <td className="px-3 py-2 align-top text-slate-800 dark:text-slate-200">
                      {ACTION_LABELS[r.action] ?? r.action}
                    </td>
                    <td className="max-w-xl px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{logIslemDetayi(r)}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
