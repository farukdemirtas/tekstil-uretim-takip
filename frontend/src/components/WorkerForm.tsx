"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { getProcesses, getTeams, getWorkerNames } from "@/lib/api";
import { WorkerFormListSelect } from "@/components/WorkerFormListSelect";

type WorkerFormProps = {
  onSubmit: (payload: { name: string; team: string; process: string }) => Promise<void>;
};

export default function WorkerForm({ onSubmit }: WorkerFormProps) {
  const [names, setNames] = useState<string[]>([]);
  const [teams, setTeams] = useState<{ code: string; label: string }[]>([]);
  const [processes, setProcesses] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [process, setProcess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.all([getWorkerNames(), getTeams(), getProcesses()])
      .then(([nameList, teamRows, procRows]) => {
        const sorted = nameList.map((n) => n.name);
        setNames(sorted);
        if (sorted.length > 0) setName(sorted[0]);
        const trows = teamRows
          .slice()
          .sort((a, b) => a.label.localeCompare(b.label, "tr", { sensitivity: "base" }));
        setTeams(trows.map((t) => ({ code: t.code, label: t.label })));
        if (trows.length > 0) setTeam((prev) => prev || trows[0].code);
        const pnames = procRows.map((p) => p.name);
        setProcesses(pnames);
        if (pnames.length > 0) setProcess((prev) => prev || pnames[0]);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !process.trim() || !team) return;
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), team, process: process.trim().toUpperCase() });
    } finally {
      setLoading(false);
    }
  }

  const nameOptions = useMemo(() => names.map((n) => ({ value: n, label: n })), [names]);
  const teamOptions = useMemo(
    () => teams.map((t) => ({ value: t.code, label: t.label })),
    [teams]
  );
  const processOptions = useMemo(() => processes.map((p) => ({ value: p, label: p })), [processes]);

  const ready = names.length > 0 && teams.length > 0 && processes.length > 0;

  return (
    <form onSubmit={handleSubmit} className="surface-card">

      {/* Başlık */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-teal-200/80 dark:bg-teal-950/40 dark:ring-teal-700/50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-teal-600 dark:text-teal-400">
            <path d="M12 11.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 20.25c.85-3.4 3.58-5.5 6.5-5.5s5.65 2.1 6.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17.5 8.5v5M15 11h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Personel ekle</h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Seçili güne çalışan eklenir</p>
        </div>
      </div>

      {/* Alanlar */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">

          {/* Ad Soyad */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-teal-500">
                <path d="M12 11.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 20.25c.85-3.4 3.58-5.5 6.5-5.5s5.65 2.1 6.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ad Soyad
            </label>
            <WorkerFormListSelect
              id="worker-form-name"
              value={name}
              onChange={setName}
              options={nameOptions}
              emptyLabel="Yükleniyor…"
              searchable
              searchPlaceholder="İsim ara…"
            />
          </div>

          {/* Bölüm */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-emerald-500">
                <path d="M12 3 3 8.25l9 5.25 9-5.25L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M3 12.75 12 18l9-5.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Bölüm
            </label>
            <WorkerFormListSelect
              id="worker-form-team"
              value={team}
              onChange={setTeam}
              options={teamOptions}
              emptyLabel="Yükleniyor…"
            />
          </div>

          {/* Proses */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-cyan-500">
                <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="2" />
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Proses
            </label>
            <WorkerFormListSelect
              id="worker-form-process"
              value={process}
              onChange={setProcess}
              options={processOptions}
              emptyLabel="Yükleniyor…"
            />
          </div>

          {/* Ekle butonu */}
          <div className="flex flex-col justify-end sm:min-w-[120px]">
            <button
              type="submit"
              disabled={loading || !ready || !team || !process}
              className="flex h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm transition
                hover:bg-teal-500 active:scale-[0.98]
                disabled:cursor-not-allowed disabled:opacity-50
                dark:bg-teal-700 dark:hover:bg-teal-600"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  Ekleniyor
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                  </svg>
                  Ekle
                </>
              )}
            </button>
          </div>

        </div>
      </div>

    </form>
  );
}
