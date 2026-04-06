"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  addProcessApi,
  addTeamApi,
  deleteProcessApi,
  deleteTeamApi,
  getProcesses,
  getTeams,
  setAuthToken,
  updateProcessApi,
  updateTeamApi,
  type ProcessRow,
  type TeamRow,
} from "@/lib/api";

function teamLabelUpper(raw: string) {
  return raw.toLocaleUpperCase("tr-TR");
}

export default function TeamsProcessesSection() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newTeamLabel, setNewTeamLabel] = useState("");
  const [newProcName, setNewProcName] = useState("");

  const [editTeamId, setEditTeamId] = useState<number | null>(null);
  const [editTeamLabel, setEditTeamLabel] = useState("");

  const [editProcId, setEditProcId] = useState<number | null>(null);
  const [editProcName, setEditProcName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [t, p] = await Promise.all([getTeams(), getProcesses()]);
      setTeams(t);
      setProcesses(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    setAuthToken(token);
    void load();
  }, [load]);

  async function submitTeam(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await addTeamApi({ label: teamLabelUpper(newTeamLabel.trim()) });
      setNewTeamLabel("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bölüm eklenemedi");
    }
  }

  async function submitProcess(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await addProcessApi({ name: newProcName.trim() });
      setNewProcName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Proses eklenemedi");
    }
  }

  function startEditTeam(t: TeamRow) {
    setEditTeamId(t.id);
    setEditTeamLabel(t.label);
  }

  async function saveTeam(tid: number) {
    setErr(null);
    try {
      await updateTeamApi(tid, { label: teamLabelUpper(editTeamLabel.trim()) });
      setEditTeamId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }

  function startEditProc(p: ProcessRow) {
    setEditProcId(p.id);
    setEditProcName(p.name);
  }

  async function saveProc(pid: number) {
    setErr(null);
    try {
      await updateProcessApi(pid, {
        name: editProcName.trim().toUpperCase(),
      });
      setEditProcId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        <strong>Bölümler</strong> üretim tablosundaki grupları belirler; teknik kod sistem tarafından otomatik üretilir.{" "}
        <strong>Prosesler</strong> çalışan satırındaki iş koludur. Kayıtlı çalışan varken ilgili bölüm veya proses silinemez.
        Listeler <strong>alfabetik</strong> (Türkçe) sıradadır.
      </p>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-3 text-base font-semibold">Bölümler</h2>
            <form onSubmit={(e) => void submitTeam(e)} className="mb-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-900/40">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Yeni bölüm</p>
              <input
                value={newTeamLabel}
                onChange={(e) => setNewTeamLabel(teamLabelUpper(e.target.value))}
                placeholder="Bölüm adı (örn. yeni hat — otomatik büyük harf)"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <button type="submit" className="rounded-md bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-500">
                Bölüm ekle
              </button>
            </form>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {teams.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 py-3 first:pt-0">
                  {editTeamId === t.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="shrink-0 font-mono text-xs text-slate-500" title="Otomatik kod">
                        {t.code}
                      </span>
                      <input
                        value={editTeamLabel}
                        onChange={(e) => setEditTeamLabel(teamLabelUpper(e.target.value))}
                        className="min-w-0 flex-1 rounded border border-blue-400 px-2 py-1 text-sm dark:border-blue-500 dark:bg-slate-700"
                      />
                      <div className="flex gap-1">
                        <button type="button" onClick={() => void saveTeam(t.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">
                          Kaydet
                        </button>
                        <button type="button" onClick={() => setEditTeamId(null)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{t.label}</p>
                        <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{t.code}</p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => startEditTeam(t)} className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 dark:border-blue-600 dark:text-blue-300">
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`"${t.label}" bölümü silinsin mi?`)) return;
                            void deleteTeamApi(t.id)
                              .then(() => load())
                              .catch((e) => setErr(e instanceof Error ? e.message : "Silinemedi"));
                          }}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-600 dark:text-red-300"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-3 text-base font-semibold">Prosesler</h2>
            <form onSubmit={(e) => void submitProcess(e)} className="mb-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-900/40">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Yeni proses</p>
              <input
                value={newProcName}
                onChange={(e) => setNewProcName(e.target.value)}
                placeholder="Proses adı"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm uppercase dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <button type="submit" className="rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Proses ekle
              </button>
            </form>
            <ul className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
              {processes.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0">
                  {editProcId === p.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={editProcName}
                        onChange={(e) => setEditProcName(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-blue-400 px-2 py-1 text-sm uppercase dark:border-blue-500 dark:bg-slate-700"
                      />
                      <div className="flex gap-1">
                        <button type="button" onClick={() => void saveProc(p.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">
                          Kaydet
                        </button>
                        <button type="button" onClick={() => setEditProcId(null)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{p.name}</p>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => startEditProc(p)} className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 dark:border-blue-600 dark:text-blue-300">
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`"${p.name}" prosesi silinsin mi?`)) return;
                            void deleteProcessApi(p.id)
                              .then(() => load())
                              .catch((e) => setErr(e instanceof Error ? e.message : "Silinemedi"));
                          }}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-600 dark:text-red-300"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
