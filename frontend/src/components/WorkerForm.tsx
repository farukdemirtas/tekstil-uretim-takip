"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { getProcesses, getTeams, getWorkerNames } from "@/lib/api";
import { WorkerFormListSelect } from "@/components/WorkerFormListSelect";
import { useI18n } from "@/components/I18nProvider";

type WorkerFormProps = {
  onSubmit: (payload: { name: string; team: string; process: string }) => Promise<void>;
  /** Günün mevcut listesi — hangi personelin hangi bölümde olduğunu kilitlemek için kullanılır */
  existingRows?: { name: string; team: string }[];
};

export default function WorkerForm({ onSubmit, existingRows = [] }: WorkerFormProps) {
  const { t } = useI18n();
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

  /**
   * Bugünün listesindeki personel → bölüm kodu haritası.
   * Yalnızca o günün aktif satırları baz alınır; silinen/arşivdeki kayıtlar devre dışı.
   */
  const nameTeamMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of existingRows) {
      const key = r.name.trim().toUpperCase();
      if (!map[key]) map[key] = r.team;
    }
    return map;
  }, [existingRows]);

  const teamLabelMap = useMemo(
    () => teams.reduce<Record<string, string>>((acc, t) => { acc[t.code] = t.label; return acc; }, {}),
    [teams]
  );

  /** Seçili isim değiştiğinde bölümü kilitli ise güncelle */
  function handleNameChange(newName: string) {
    setName(newName);
    const locked = nameTeamMap[newName.trim().toUpperCase()];
    if (locked) setTeam(locked);
  }

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

  /** Seçili kişi bugünün listesinde zaten bir bölüme kayıtlıysa kilit uygula */
  const lockedTeamCode = nameTeamMap[name.trim().toUpperCase()] ?? null;
  const lockedTeamLabel = lockedTeamCode ? (teamLabelMap[lockedTeamCode] ?? lockedTeamCode) : null;
  const isTeamLocked = lockedTeamCode !== null;

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
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("workerForm.title")}</h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{t("workerForm.subtitle")}</p>
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
              {t("workerForm.name")}
            </label>
            <WorkerFormListSelect
              id="worker-form-name"
              value={name}
              onChange={handleNameChange}
              options={nameOptions}
              emptyLabel={t("workerForm.loading")}
              searchable
              searchPlaceholder={t("workerForm.searchName")}
            />
          </div>

          {/* Bölüm */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-emerald-500">
                <path d="M12 3 3 8.25l9 5.25 9-5.25L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M3 12.75 12 18l9-5.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("workerForm.team")}
              {isTeamLocked && (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Kilitli
                </span>
              )}
            </label>
            <WorkerFormListSelect
              id="worker-form-team"
              value={team}
              onChange={isTeamLocked ? () => {} : setTeam}
              options={teamOptions}
              emptyLabel={t("workerForm.loading")}
              disabled={isTeamLocked}
            />
            {isTeamLocked && lockedTeamLabel && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Bu personel yalnızca <strong>{lockedTeamLabel}</strong> bölümüne eklenebilir.
              </p>
            )}
          </div>

          {/* Proses */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-cyan-500">
                <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="2" />
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {t("workerForm.process")}
            </label>
            <WorkerFormListSelect
              id="worker-form-process"
              value={process}
              onChange={setProcess}
              options={processOptions}
              emptyLabel={t("workerForm.loading")}
              searchable
              searchPlaceholder="Prosese göre ara…"
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
                  {t("workerForm.adding")}
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                  </svg>
                  {t("workerForm.add")}
                </>
              )}
            </button>
          </div>

        </div>
      </div>

    </form>
  );
}
