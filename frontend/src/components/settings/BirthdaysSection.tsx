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
import { loadXlsx } from "@/lib/xlsxLazy";
import { parseBirthdaysFromRows } from "@/lib/personnelListExcel";

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
      const out = parseBirthdaysFromRows(rows, XLSX);
      if (out.length === 0) {
        setExcelMsg(
          "Geçerli satır yok. Yeşil İmaj listesinde başlık satırında AD, SOYAD ve DOGUMTARIHI sütunları olmalı. Tarih hücresini kontrol edin."
        );
        return;
      }
      if (
        !window.confirm(
          `Mevcut ${list.length} doğum günü kaydı silinip Excel'deki ${out.length} kişi yüklenecek. Devam edilsin mi?`
        )
      ) {
        return;
      }
      const res = await bulkInsertPersonnelBirthdays(out, { replaceAll: true });
      const parts: string[] = [];
      if ((res.deleted ?? 0) > 0) parts.push(`silinen eski kayıt: ${res.deleted}`);
      parts.push(`yüklenen: ${res.inserted}`);
      if (res.skippedInvalid > 0) parts.push(`geçersiz satır: ${res.skippedInvalid}`);
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
        Her <strong>ad + soyad</strong> yalnızca bir kez kayıtlıdır. İsimler büyük harfle saklanır. Toplu Excel yüklemede
        mevcut kayıtlar silinir ve dosyadaki liste yüklenir. Yeşil İmaj personel listesinde <strong>AD</strong>,{" "}
        <strong>SOYAD</strong> ve <strong>DOGUMTARIHI</strong> sütunları kullanılır.
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
