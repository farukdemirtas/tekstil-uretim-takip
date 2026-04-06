"use client";

import { FormEvent, useEffect, useState } from "react";
import { addWorkerName, deleteWorkerName, getWorkerNames, setAuthToken, updateWorkerName } from "@/lib/api";

type WorkerName = { id: number; name: string };

export default function PersonnelNamesSection() {
  const [list, setList] = useState<WorkerName[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    setAuthToken(token);
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setList(await getWorkerNames());
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed) {
      setAddError("İsim boş olamaz.");
      return;
    }
    setAddError("");
    setAddBusy(true);
    try {
      await addWorkerName(trimmed);
      setNewName("");
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Eklenemedi.");
    } finally {
      setAddBusy(false);
    }
  }

  function startEdit(w: WorkerName) {
    setEditId(w.id);
    setEditVal(w.name);
  }

  async function saveEdit() {
    if (!editId || !editVal.trim()) return;
    setEditBusy(true);
    try {
      await updateWorkerName(editId, editVal.trim().toUpperCase());
      setEditId(null);
      await load();
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(w: WorkerName) {
    if (!window.confirm(`"${w.name}" ismi silinsin mi?`)) return;
    await deleteWorkerName(w.id);
    await load();
  }

  const filtered = list.filter((w) =>
    !search || w.name.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Ana ekrandaki <strong>Çalışan Ekle</strong> formu bu listeden beslenir. İsimleri büyük harfle saklarız.
      </p>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Yeni isim ekle</h2>
        <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ad Soyad..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={addBusy}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {addBusy ? "Ekleniyor..." : "Ekle"}
          </button>
        </form>
        {addError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{addError}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-700">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="İsme göre ara..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
            {filtered.length} / {list.length} isim
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            {list.length === 0 ? "Henüz isim eklenmemiş." : "Arama sonucu bulunamadı."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map((w, idx) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <span className="w-7 shrink-0 text-right text-xs text-slate-400">{idx + 1}</span>
                {editId === w.id ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveEdit();
                      if (e.key === "Escape") setEditId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-blue-400 px-2 py-1 text-sm uppercase outline-none dark:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
                  />
                ) : (
                  <span className="min-w-0 flex-1 text-sm font-medium">{w.name}</span>
                )}
                <div className="ml-auto flex shrink-0 gap-1">
                  {editId === w.id ? (
                    <>
                      <button
                        onClick={() => void saveEdit()}
                        disabled={editBusy}
                        className="rounded border border-emerald-400 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300"
                      >
                        Kaydet
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        disabled={editBusy}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400"
                      >
                        İptal
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(w)}
                        className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/20"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => void handleDelete(w)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700/60 dark:text-red-300 dark:hover:bg-red-900/20"
                      >
                        Sil
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
