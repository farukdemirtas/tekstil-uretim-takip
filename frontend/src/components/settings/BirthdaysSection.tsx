"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  addPersonnelBirthday,
  bulkInsertPersonnelBirthdays,
  deletePersonnelBirthday,
  getPersonnelBirthdays,
  setAuthToken,
  updatePersonnelBirthday,
  type PersonnelBirthdayRow,
} from "@/lib/api";
import { WeekdayDatePicker } from "@/components/WeekdayDatePicker";
import type * as XLSX from "xlsx";
import { loadXlsx } from "@/lib/xlsxLazy";

function parseCellToIsoDate(v: unknown, xlsxMod?: typeof XLSX): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = xlsxMod?.SSF?.parse_date_code?.(v);
    if (parsed && parsed.y != null && parsed.m != null && parsed.d != null) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, "0");
      const d = String(Math.floor(parsed.d)).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${dd}`;
  }
  return null;
}

/** Geniş personel listesi (Yeşil İmaj): A=sıra, B=ad, C=soyad, L=doğum (index 11) */
const COL_A = 0;
const COL_B = 1;
const COL_C = 2;
const COL_L_TARIH = 11;

function normHdr(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function rowLooksLikeSiraNo(v: unknown): boolean {
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1_000_000) return true;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^\d{1,6}$/.test(t) && Number(t) > 0 && Number(t) < 1_000_000) return true;
  }
  return false;
}

function countParsedDatesInColumn(rows: unknown[][], col: number, maxRows: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const line = rows[i] as unknown[];
    if (parseCellToIsoDate(line?.[col])) n++;
  }
  return n;
}

function inferDataStart(rows: unknown[][], tarihCol: number): number {
  if (rows.length === 0) return 0;
  const d0 = parseCellToIsoDate((rows[0] as unknown[])[tarihCol]);
  const d1 = rows.length > 1 ? parseCellToIsoDate((rows[1] as unknown[])[tarihCol]) : null;
  if (d0) return 0;
  if (d1) return 1;
  return 1;
}

function findDogumColumnIndex(headerRow: unknown[]): number {
  const h = headerRow.map(normHdr);
  const idx = h.findIndex((x) => x.includes("dogum") || x.includes("birth") || x.includes("dtarih"));
  return idx >= 0 ? idx : COL_L_TARIH;
}

/**
 * Yeşil İmaj: başlıkta B=AD, C=SOYAD, doğum sütunu başlıkta (genelde L).
 * Dar tablo: A=ad, B=soyad, doğum C veya L (hangisinde tarih çoğunluktaysa).
 */
function resolveBirthdayExcelColumns(rows: unknown[][]): {
  ad: number;
  soyad: number;
  tarih: number;
  dataStart: number;
} {
  if (rows.length === 0) return { ad: 0, soyad: 1, tarih: COL_L_TARIH, dataStart: 0 };

  const r0 = rows[0] as unknown[];
  const h1 = normHdr(r0[COL_B]);
  const h2 = normHdr(r0[COL_C]);
  const headerAdSoyad =
    (h1 === "ad" || h1 === "adı" || h1 === "isim" || (h1.includes("ad") && !h1.includes("soyad"))) &&
    (h2.includes("soyad") || h2.includes("soyisim") || h2 === "soy ad");

  if (headerAdSoyad) {
    const tarih = findDogumColumnIndex(r0);
    return { ad: COL_B, soyad: COL_C, tarih, dataStart: 1 };
  }

  const sampleN = Math.min(30, rows.length);
  const countL = countParsedDatesInColumn(rows, COL_L_TARIH, sampleN);
  const countC = countParsedDatesInColumn(rows, COL_C, sampleN);
  const tarihCol = countL >= countC ? COL_L_TARIH : COL_C;
  const dataStart = inferDataStart(rows, tarihCol);
  let ad = COL_A;
  let soyad = COL_B;

  let siraLike = 0;
  let n = 0;
  for (let i = dataStart; i < Math.min(dataStart + 20, rows.length); i++) {
    const line = rows[i] as unknown[];
    if (!line?.length) continue;
    if (!String(line[COL_B] ?? "").trim()) continue;
    n++;
    if (rowLooksLikeSiraNo(line[COL_A])) siraLike++;
  }
  if (n >= 3 && siraLike / n >= 0.6) {
    ad = COL_B;
    soyad = COL_C;
  }

  return { ad, soyad, tarih: tarihCol, dataStart };
}

function formatTrDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export default function BirthdaysSection() {
  const [list, setList] = useState<PersonnelBirthdayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editBirth, setEditBirth] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [excelMsg, setExcelMsg] = useState("");
  const [excelBusy, setExcelBusy] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    setAuthToken(token);
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setList(await getPersonnelBirthdays());
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!firstName.trim() || !lastName.trim() || !birthDate) {
      setAddError("Ad, soyad ve doğum tarihi zorunlu.");
      return;
    }
    setAddBusy(true);
    try {
      const row = await addPersonnelBirthday({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate,
      });
      setFirstName("");
      setLastName("");
      setBirthDate("");
      await load();
      if (row.updated) {
        window.alert("Bu ad ve soyad zaten kayıtlıydı; doğum tarihi güncellendi.");
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Eklenemedi.");
    } finally {
      setAddBusy(false);
    }
  }

  function startEdit(r: PersonnelBirthdayRow) {
    setEditId(r.id);
    setEditFirst(r.firstName);
    setEditLast(r.lastName);
    setEditBirth(r.birthDate);
  }

  async function saveEdit() {
    if (!editId || !editFirst.trim() || !editLast.trim() || !editBirth) return;
    setEditBusy(true);
    try {
      await updatePersonnelBirthday(editId, {
        firstName: editFirst.trim(),
        lastName: editLast.trim(),
        birthDate: editBirth,
      });
      setEditId(null);
      await load();
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(r: PersonnelBirthdayRow) {
    if (!window.confirm(`${r.firstName} ${r.lastName} kaydı silinsin mi?`)) return;
    await deletePersonnelBirthday(r.id);
    await load();
  }

  async function onExcelFile(f: File) {
    setExcelMsg("");
    setExcelBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const XLSX = await loadXlsx();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setExcelMsg("Sayfa bulunamadı.");
        return;
      }
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
      if (!rows.length) {
        setExcelMsg("Boş dosya.");
        return;
      }
      const { ad, soyad, tarih, dataStart } = resolveBirthdayExcelColumns(rows);
      const out: { firstName: string; lastName: string; birthDate: string }[] = [];
      for (let r = dataStart; r < rows.length; r++) {
        const line = rows[r] as unknown[];
        if (!line || line.length === 0) continue;
        const fn = String(line[ad] ?? "").trim();
        const ln = String(line[soyad] ?? "").trim();
        const iso = parseCellToIsoDate(line[tarih], XLSX);
        if (!fn && !ln) continue;
        if (!iso) continue;
        out.push({ firstName: fn, lastName: ln, birthDate: iso });
      }
      if (out.length === 0) {
        setExcelMsg(
          "Geçerli satır yok. Yeşil İmaj: B=ad, C=soyad, doğum sütunu (çoğunlukla L). Dar tablo: A–B ad/soyad. Tarih hücresi doğru mu kontrol edin."
        );
        return;
      }
      const res = await bulkInsertPersonnelBirthdays(out);
      const parts: string[] = [];
      parts.push(`Yeni eklenen: ${res.inserted}`);
      if (res.updated > 0) parts.push(`doğum tarihi güncellenen: ${res.updated}`);
      if (res.skippedInvalid > 0) parts.push(`geçersiz satır: ${res.skippedInvalid}`);
      if (res.duplicateSame > 0) {
        parts.push(`aynı isim ve aynı doğum tarihi (zaten kayıtlı, yüklenmedi): ${res.duplicateSame}`);
        window.alert(
          `${res.duplicateSame} satır, sistemde zaten aynı ad, soyad ve doğum tarihiyle kayıtlı olduğu için tekrar eklenmedi. Aynı kişi ve aynı veri tekrar yüklenemez.`
        );
      }
      setExcelMsg(parts.join(" · "));
      await load();
    } catch (e) {
      setExcelMsg(e instanceof Error ? e.message : "Excel okunamadı.");
    } finally {
      setExcelBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Bugün doğum günü olan personel <strong>EKRAN1</strong> üzerinde her dakika yaklaşık 10 saniye kutlama mesajı görür.
        Her <strong>ad + soyad</strong> yalnızca bir kez kayıtlıdır; aynı isim ve tarih tekrar yüklenemez. Farklı kişiler aynı doğum
        gününde olabilir. İsimler büyük harfle saklanır. Toplu Excel: Yeşil İmaj listesinde <strong>A</strong> sıra, <strong>B</strong> ad,{" "}
        <strong>C</strong> soyad, doğum genelde <strong>L</strong>. Dar tabloda doğum <strong>C</strong> veya <strong>L</strong>.
      </p>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Toplu Excel</h2>
        <label className="flex cursor-pointer flex-col gap-2 sm:flex-row sm:items-center">
          <span className="rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100">
            {excelBusy ? "İşleniyor…" : ".xlsx / .xls seç"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            disabled={excelBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onExcelFile(file);
            }}
          />
        </label>
        {excelMsg && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{excelMsg}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Yeni kayıt</h2>
        <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ad"
            className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Soyad"
            className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <WeekdayDatePicker
            id="birthday-new-date"
            label="Doğum tarihi"
            value={birthDate}
            onChange={setBirthDate}
            includeWeekends
            className="min-w-[12rem] flex-1 sm:max-w-[20rem]"
          />
          <button
            type="submit"
            disabled={addBusy}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {addBusy ? "Ekleniyor…" : "Ekle"}
          </button>
        </form>
        {addError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{addError}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Kayıtlı doğum günleri</h2>
          <p className="mt-1 text-xs text-slate-500">{list.length} kişi</p>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">Yükleniyor…</div>
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">Henüz kayıt yok.</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {list.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40"
              >
                {editId === w.id ? (
                  <>
                    <input
                      value={editFirst}
                      onChange={(e) => setEditFirst(e.target.value)}
                      className="min-w-[6rem] rounded border border-blue-400 px-2 py-1 text-sm dark:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
                    />
                    <input
                      value={editLast}
                      onChange={(e) => setEditLast(e.target.value)}
                      className="min-w-[6rem] rounded border border-blue-400 px-2 py-1 text-sm dark:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
                    />
                    <WeekdayDatePicker
                      id={`birthday-edit-${w.id}`}
                      value={editBirth}
                      onChange={setEditBirth}
                      includeWeekends
                      className="min-w-[12rem] max-w-[20rem]"
                    />
                    <button
                      type="button"
                      disabled={editBusy}
                      onClick={() => void saveEdit()}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                    >
                      Kaydet
                    </button>
                    <button type="button" onClick={() => setEditId(null)} className="text-xs text-slate-500">
                      İptal
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {w.firstName} {w.lastName}
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">{formatTrDate(w.birthDate)}</span>
                    <div className="ml-auto flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(w)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600"
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(w)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
                      >
                        Sil
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
