"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  downloadDatabaseBackup,
  getDatabaseInfo,
  restoreDatabaseBackup,
  type DatabaseInfo,
} from "@/lib/api";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}

export default function DatabaseBackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      setInfo(await getDatabaseInfo());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Veritabanı bilgisi alınamadı" });
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  async function handleBackup() {
    setBackingUp(true);
    setMsg(null);
    try {
      await downloadDatabaseBackup();
      setMsg({ ok: true, text: "SQL yedeği indirildi." });
      await loadInfo();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Yedek alınamadı" });
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestore() {
    if (!selectedFile) {
      setMsg({ ok: false, text: "Önce bir .sql yedek dosyası seçin." });
      return;
    }
    if (confirmText.trim().toUpperCase() !== "GERI YUKLE") {
      setMsg({ ok: false, text: 'Onay için kutuya tam olarak "GERI YUKLE" yazın.' });
      return;
    }
    if (!window.confirm("Tüm mevcut veriler silinip yedek yüklenecek. Emin misiniz?")) return;

    setRestoring(true);
    setMsg(null);
    try {
      const result = await restoreDatabaseBackup(selectedFile);
      setMsg({
        ok: true,
        text: `Yedek yüklendi (${result.tableCount} tablo). Sayfayı yenilemeniz önerilir.`,
      });
      setSelectedFile(null);
      setConfirmText("");
      if (fileRef.current) fileRef.current.value = "";
      await loadInfo();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Yedek yüklenemedi" });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Veritabanı yedekleme</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Tüm üretim, ayar ve kullanıcı verilerini SQL dosyası olarak yedekleyin veya daha önce alınmış yedeği geri
        yükleyin. Yalnızca yönetici kullanabilir.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-900/40">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Dosya</p>
          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {loadingInfo ? "…" : info?.fileName ?? "production.db"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-900/40">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Boyut</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {loadingInfo ? "…" : formatBytes(info?.sizeBytes ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-900/40">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Son değişiklik</p>
          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {loadingInfo ? "…" : formatDateTime(info?.modifiedAt ?? null)}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-slate-200 pt-5 dark:border-slate-600 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Yedek al</h3>
          <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Anlık SQL dump indirilir. Dosyayı güvenli bir yerde saklayın.
          </p>
          <button
            type="button"
            disabled={backingUp}
            onClick={() => void handleBackup()}
            className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {backingUp ? "Hazırlanıyor…" : "SQL yedeği indir"}
          </button>
        </div>

        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Yedekten geri yükle</h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
            Mevcut veritabanı tamamen silinir ve seçtiğiniz SQL yedeği yüklenir. Bu işlem geri alınamaz.
          </p>
          <label className="mt-3 block text-xs font-medium text-amber-900 dark:text-amber-200">
            SQL dosyası
            <input
              ref={fileRef}
              type="file"
              accept=".sql,text/plain,application/sql"
              className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-teal-700 hover:file:bg-slate-50 dark:text-slate-200 dark:file:bg-slate-800 dark:file:text-teal-300"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-amber-900 dark:text-amber-200">
            Onay (GERI YUKLE yazın)
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="GERI YUKLE"
              className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            disabled={restoring || !selectedFile}
            onClick={() => void handleRestore()}
            className="mt-3 rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 dark:border-red-800"
          >
            {restoring ? "Yükleniyor…" : "Yedeği geri yükle"}
          </button>
        </div>
      </div>

      {msg ? (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            msg.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-600">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Son işlemler
        </h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600 dark:bg-slate-900/40">
            <dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">Son yedek indirme</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {loadingInfo ? "…" : formatDateTime(info?.lastBackupDownload?.at ?? null)}
            </dd>
            {!loadingInfo && info?.lastBackupDownload ? (
              <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {info.lastBackupDownload.by}
                {info.lastBackupDownload.bytes
                  ? ` · ${formatBytes(info.lastBackupDownload.bytes)}`
                  : ""}
              </dd>
            ) : !loadingInfo ? (
              <dd className="mt-1 text-xs text-slate-400">Henüz kayıt yok</dd>
            ) : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600 dark:bg-slate-900/40">
            <dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">Son geri yükleme</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {loadingInfo ? "…" : formatDateTime(info?.lastRestore?.at ?? null)}
            </dd>
            {!loadingInfo && info?.lastRestore ? (
              <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {info.lastRestore.by}
                {info.lastRestore.tableCount != null ? ` · ${info.lastRestore.tableCount} tablo` : ""}
              </dd>
            ) : !loadingInfo ? (
              <dd className="mt-1 text-xs text-slate-400">Henüz kayıt yok</dd>
            ) : null}
          </div>
        </dl>
      </div>
    </section>
  );
}
