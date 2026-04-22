"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import { getWorkers, saveDayProductMeta, saveProductionBulk } from "@/lib/api";
import { todayWeekdayIso } from "@/lib/businessCalendar";
import { parseProductionExcelBuffer, type ParsedExcelProductionRow } from "@/lib/parseProductionExcel";
import type { ProductionRow, Worker } from "@/lib/types";

/**
 * Excel’den gelen metinlerde I/İ/ı/i ve BITIM↔BİTİM gibi farklarla eşleştirme.
 * (Dışa aktarılmış veya elle düzenlenmiş .xlsx ile veritabanı satırlarını aynı anahtara indirger.)
 */
function foldImportKey(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .replace(/\uFEFF/g, "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c")
    .toUpperCase();
}

function norm(s: string): string {
  return foldImportKey(s);
}

/**
 * İsim / proses: foldImportKey + İngilizce "base" karşılaştırma (Excel’de C/Ç, I/İ farkı kalırsa).
 */
function sameText(a: string, b: string): boolean {
  const ta = String(a ?? "").trim();
  const tb = String(b ?? "").trim();
  if (ta === "" && tb === "") return true;
  if (ta === "" || tb === "") return false;
  if (norm(ta) === norm(tb)) return true;
  return ta.localeCompare(tb, "en", { sensitivity: "base" }) === 0;
}

/**
 * Bölüm: Excel’de boşluklu metin (ARKA HAZIRLIK) ile DB kodu (ARKA_HAZIRLIK) aynı anahtar olmalı.
 */
function normBolumKey(s: string): string {
  return foldImportKey(String(s).replace(/_/g, " "));
}

function resolveTeamCode(
  teamLabel: string,
  teamMeta: Array<{ code: string; label: string }>
): string | null {
  const t = normBolumKey(teamLabel);
  if (!t) return null;
  for (const m of teamMeta) {
    if (normBolumKey(m.label) === t || normBolumKey(m.code) === t) return m.code;
  }
  return null;
}

function matchWorker(
  pr: ParsedExcelProductionRow,
  rows: ProductionRow[],
  teamMeta: Array<{ code: string; label: string }>
): ProductionRow | null {
  const teamCode = resolveTeamCode(pr.teamLabel, teamMeta);
  const byNameProc = rows.filter((w) => sameText(w.name, pr.name) && sameText(w.process, pr.process));
  if (byNameProc.length === 0) return null;

  const tb = normBolumKey(pr.teamLabel);
  const excelBolumYazili = String(pr.teamLabel ?? "").trim().length > 0;

  if (teamCode) {
    const hit = byNameProc.filter((w) => w.team === teamCode);
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) return null;
    if (tb) {
      const hit2 = byNameProc.filter((w) => normBolumKey(w.team) === tb);
      if (hit2.length === 1) return hit2[0];
    }
    if (excelBolumYazili) return null;
  } else {
    if (tb) {
      const hit = byNameProc.filter((w) => normBolumKey(w.team) === tb);
      if (hit.length === 1) return hit[0];
      if (hit.length > 1) return null;
      if (excelBolumYazili) return null;
    }
  }

  if (byNameProc.length === 1) return byNameProc[0];
  return null;
}

/** Eşleştirme: o gün tabloda görünenler değil, sistemdeki tüm aktif çalışan kayıtları (export ile aynı kimlik). */
function workersToMatchRows(workers: Worker[]): ProductionRow[] {
  return workers.map((w) => ({
    workerId: w.id,
    name: w.name,
    team: w.team,
    process: w.process,
    t1000: 0,
    t1300: 0,
    t1600: 0,
    t1830: 0,
    h0900: 0,
    h1000: 0,
    h1115: 0,
    h1215: 0,
    h1300: 0,
    h1445: 0,
    h1545: 0,
    h1700: 0,
    h1830: 0,
    ekSayim: 0,
  }));
}

type Banner = { text: string; tone: "amber" | "red" };

type Props = {
  teamMeta: Array<{ code: string; label: string }>;
  onImported: (targetDate: string) => void;
  /** Controlled mode — when provided, component renders no trigger button */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
};

export default function ExcelImportPanel({ teamMeta, onImported, open: openProp, onOpenChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [openInternal, setOpenInternal] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openInternal;
  function setOpen(v: boolean) {
    if (controlled) {
      onOpenChange?.(v);
    } else {
      setOpenInternal(v);
    }
  }
  const [targetDate, setTargetDate] = useState(todayWeekdayIso());
  const [applyMeta, setApplyMeta] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseProductionExcelBuffer> | null>(null);
  const [matched, setMatched] = useState<Array<{ row: ParsedExcelProductionRow; workerId: number }>>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const resetPreview = useCallback(() => {
    setParsed(null);
    setMatched([]);
    setUnmatched([]);
    setBanner(null);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (controlled && open) {
      resetPreview();
      setTargetDate(todayWeekdayIso());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setOpen(false);
        resetPreview();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, resetPreview]);

  useEffect(() => {
    if (!parsed || parsed.rows.length === 0) {
      setMatched([]);
      setUnmatched([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const workers = await getWorkers();
        if (cancelled) return;
        const pool = workersToMatchRows(workers);
        const ok: Array<{ row: ParsedExcelProductionRow; workerId: number }> = [];
        const bad: string[] = [];
        for (const row of parsed.rows) {
          const w = matchWorker(row, pool, teamMeta);
          if (w) ok.push({ row, workerId: w.workerId });
          else
            bad.push(
              `${row.name} / ${row.teamLabel || "?"} / ${row.process || "?"}` +
                " — aktif çalışan kayıtlarında aynı ad + bölüm + proses bulunamadı (Ayarlar’daki bölüm/proses adları ve personel kaydı kontrol edin)."
            );
        }
        setMatched(ok);
        setUnmatched(bad);
        const warn = parsed.parseWarnings.length ? parsed.parseWarnings.join(" ") : null;
        if (ok.length === 0) {
          setBanner({
            text: warn ?? "Hiçbir satır eşleşmedi; içe aktarma yapılamaz.",
            tone: "red",
          });
        } else {
          setBanner(warn ? { text: warn, tone: "amber" } : null);
        }
      } catch {
        if (!cancelled) setBanner({ text: "Çalışan listesi alınamadı; oturum veya ağ kontrol edin.", tone: "red" });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, teamMeta]);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      resetPreview();
      try {
        const buf = await f.arrayBuffer();
        const data = parseProductionExcelBuffer(buf);
        setParsed(data);
        if (data.rows.length === 0) {
          setBanner({
            text: data.parseWarnings.length
              ? data.parseWarnings.join(" ")
              : "Tabloda veri satırı bulunamadı.",
            tone: data.parseWarnings.length ? "amber" : "red",
          });
        }
      } catch {
        setBanner({ text: "Dosya okunamadı.", tone: "red" });
      }
    },
    [resetPreview]
  );

  async function doImport() {
    if (matched.length === 0 || !parsed) return;
    const ok = window.confirm(
      `${targetDate} tarihine ${matched.length} çalışanın üretim rakamları yazılacak.${
        unmatched.length ? ` ${unmatched.length} satır atlanacak.` : ""
      } Devam edilsin mi?`
    );
    if (!ok) return;
    setBusy(true);
    setBanner(null);
    try {
      if (applyMeta && (parsed.meta.productName || parsed.meta.productModel)) {
        await saveDayProductMeta({
          date: targetDate,
          productName: parsed.meta.productName,
          productModel: parsed.meta.productModel,
          metaSource: "manual",
        });
      }
      await saveProductionBulk({
        date: targetDate,
        entries: matched.map((m) => ({
          workerId: m.workerId,
          t1000: m.row.t1000,
          t1300: m.row.t1300,
          t1600: m.row.t1600,
          t1830: m.row.t1830,
          h0900: m.row.h0900,
          h1000: m.row.h1000,
          h1115: m.row.h1115,
          h1215: m.row.h1215,
          h1300: m.row.h1300,
          h1445: m.row.h1445,
          h1545: m.row.h1545,
          h1700: m.row.h1700,
          h1830: m.row.h1830,
        })),
      });
      setOpen(false);
      resetPreview();
      onImported(targetDate);
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Kayıt başarısız.",
        tone: "red",
      });
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    resetPreview();
  }

  function bannerClasses(tone: Banner["tone"]) {
    return tone === "red"
      ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/45 dark:bg-red-950/35 dark:text-red-100"
      : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/40 dark:text-amber-100";
  }

  const hasStats = parsed && parsed.rows.length > 0;

  const overlay =
    open && mounted ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-[3px] sm:p-6"
        role="presentation"
        onClick={() => closeModal()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="excel-import-title"
          className="flex max-h-[min(88vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
            <header className="relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/90 bg-white px-4 py-3.5 sm:px-5 sm:py-4 dark:border-slate-700/80 dark:bg-slate-900">
              <div className="min-w-0">
                <h2
                  id="excel-import-title"
                  className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
                >
                  Excel’den üretim aktar
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Ana sayfadaki <span className="font-medium text-slate-600 dark:text-slate-300">Excel Export</span> ile
                  indirdiğiniz <strong className="font-medium text-slate-700 dark:text-slate-300">.xlsx</strong> dosyasını
                  aynen kullanabilirsiniz: <strong className="font-medium text-slate-700 dark:text-slate-300">Üretim</strong>{" "}
                  sayfası ve tablo başlık satırını (Ad Soyad, Bölüm, Proses, saatler) silmeyin veya yeniden adlandırmayın.
                  Satırlar, sistemdeki <strong className="font-medium text-slate-700 dark:text-slate-300">aktif çalışan</strong>{" "}
                  kayıtlarıyla (ad + bölüm + proses) eşleştirilir; rakamlar aşağıda seçtiğiniz tarihe yazılır.
                </p>
              </div>
              <button
                type="button"
                aria-label="Pencereyi kapat"
                disabled={busy}
                className="shrink-0 rounded-lg border border-transparent p-1.5 text-slate-500 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                onClick={() => closeModal()}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              <div className="space-y-4">
                <section className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-700/60 dark:bg-slate-800/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400/90">
                    1 · Tarih
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Rakamların yazılacağı <strong className="font-medium text-slate-800 dark:text-slate-200">hafta içi</strong>{" "}
                    günü seçin.
                  </p>
                  <div className="mt-3">
                    <WeekdayDatePicker id="excel-import-date" value={targetDate} onChange={setTargetDate} />
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-700/60 dark:bg-slate-800/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400/90">
                    2 · Dosya
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                      .xlsx
                    </code>{" "}
                    — Ad Soyad, Bölüm, Proses ve saat sütunları export ile aynı olmalı.
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-medium text-teal-900 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800/60 dark:bg-slate-800 dark:text-teal-100 dark:hover:bg-teal-950/50"
                      onClick={() => fileRef.current?.click()}
                    >
                      <svg className="h-4 w-4 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                      {busy ? "İşleniyor…" : "Dosya seç"}
                    </button>
                    {hasStats ? (
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <span className="inline-flex items-center rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                          {parsed!.rows.length} okundu
                        </span>
                        <span className="inline-flex items-center rounded-lg border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                          {matched.length} eşleşti
                        </span>
                        {unmatched.length > 0 ? (
                          <span className="inline-flex items-center rounded-lg border border-amber-200/90 bg-amber-50/90 px-2.5 py-1 text-xs font-medium text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-100">
                            {unmatched.length} atlanacak
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 transition hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-900/30 dark:hover:border-slate-600">
                  <input
                    type="checkbox"
                    checked={applyMeta}
                    onChange={(e) => setApplyMeta(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span className="text-sm leading-snug text-slate-700 dark:text-slate-300">
                    <span className="font-medium text-slate-900 dark:text-white">Ürün bilgisi</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Dosyadaki ürün adı ve modeli bu tarihe de yazılsın.
                    </span>
                  </span>
                </label>

                {banner ? (
                  <p
                    role="status"
                    className={`rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${bannerClasses(banner.tone)}`}
                  >
                    {banner.text}
                  </p>
                ) : null}

                {unmatched.length > 0 ? (
                  <div className="rounded-xl border border-red-200/90 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/25">
                    <p className="border-b border-red-200/80 px-3 py-2 text-xs font-semibold text-red-900 dark:border-red-900/30 dark:text-red-100">
                      Eşleşmeyen satırlar ({unmatched.length})
                    </p>
                    <ul className="max-h-36 space-y-1 overflow-y-auto px-3 py-2 text-xs leading-relaxed text-red-950 dark:text-red-100/95">
                      {unmatched.slice(0, 25).map((u, i) => (
                        <li key={i} className="border-l-2 border-red-300/80 pl-2 dark:border-red-700">
                          {u}
                        </li>
                      ))}
                    </ul>
                    {unmatched.length > 25 ? (
                      <p className="border-t border-red-200/80 px-3 py-1.5 text-[11px] text-red-800 dark:border-red-900/30 dark:text-red-200/90">
                        … ve {unmatched.length - 25} satır daha
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200/90 bg-slate-50/90 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-900/50 sm:px-5">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={() => closeModal()}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={busy || matched.length === 0}
                  className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
                  onClick={() => void doImport()}
                >
                  {targetDate} tarihine kaydet
                </button>
              </div>
            </footer>
        </div>
      </div>
    ) : null;

  return (
    <>
      {!controlled && (
        <button
          type="button"
          onClick={() => {
            resetPreview();
            setTargetDate(todayWeekdayIso());
            setOpen(true);
          }}
          className="btn-nav"
        >
          Excel içe aktar
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={(e) => void onFile(e)}
        tabIndex={-1}
      />
      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
