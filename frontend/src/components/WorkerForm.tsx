"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { getProcesses, getTeams, getWorkerNames } from "@/lib/api";
import { WorkerFormListSelect } from "@/components/WorkerFormListSelect";

type WorkerFormProps = {
  onSubmit: (payload: { name: string; team: string; process: string }) => Promise<void>;
};

function IconPerson({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 11.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 20.25c.85-3.4 3.58-5.5 6.5-5.5s5.65 2.1 6.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLayers({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 3 8.25l9 5.25 9-5.25L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M3 12.75 12 18l9-5.25M3 16.5 12 21.75l9-5.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconProcess({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v3m0 12v3M3 12h3m12 0h3M6.34 6.34l2.12 2.12m7.08 7.08 2.12 2.12M6.34 17.66l2.12-2.12m7.08-7.08 2.12-2.12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Çalışan ekleme — ad / bölüm / proses için kart stili kutu */
function WorkerFieldBox({
  title,
  hint,
  icon,
  iconWrapClass,
  children,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  iconWrapClass: string;
  children: ReactNode;
}) {
  return (
    <div
      className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 p-4 shadow-surface-sm transition-all duration-200
        hover:border-teal-200/70 hover:shadow-md
        focus-within:border-teal-400/60 focus-within:shadow-md focus-within:ring-2 focus-within:ring-teal-500/20
        dark:border-slate-700/85 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-slate-950/80 dark:shadow-none
        dark:hover:border-teal-700/50 dark:focus-within:border-teal-500/40 dark:focus-within:ring-teal-400/15"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/[0.04] dark:ring-white/10 ${iconWrapClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      </div>
      <div className="relative min-w-0">{children}</div>
    </div>
  );
}

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
      .catch(() => {
        /* API hazır değilse sessiz */
      });
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

  return (
    <form onSubmit={handleSubmit} className="surface-card dark:text-slate-100">
      <div className="mb-6 border-b border-slate-200/80 pb-4 dark:border-slate-700/80">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Listeye personel ekle</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Aşağıdaki kutulardan ad, bölüm ve prosesi seçin; kayıtlar seçili güne eklenir. O gün sahada olmayan için{" "}
          <span className="font-medium text-slate-700 dark:text-slate-300">Bugün yok</span> — satır listede kalır, soluk
          görünür; <span className="font-medium text-slate-700 dark:text-slate-300">Bugün var</span> ile normale döner.
          Kalıcı çıkarma: <span className="font-medium text-slate-700 dark:text-slate-300">Sil</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch lg:gap-5">
        <WorkerFieldBox
          title="Ad Soyad"
          hint="Tanımlı çalışan isimlerinden seçin."
          icon={<IconPerson className="text-teal-700 dark:text-teal-300" />}
          iconWrapClass="bg-gradient-to-br from-teal-100 to-emerald-50 text-teal-800 dark:from-teal-950/80 dark:to-emerald-950/40 dark:text-teal-200"
        >
          <WorkerFormListSelect
            id="worker-form-name"
            value={name}
            onChange={setName}
            options={nameOptions}
            emptyLabel="İsim yükleniyor…"
          />
        </WorkerFieldBox>

        <WorkerFieldBox
          title="Bölüm"
          hint="Çalışanın görev aldığı üretim bölümü."
          icon={<IconLayers className="text-emerald-700 dark:text-emerald-300" />}
          iconWrapClass="bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 dark:from-emerald-950/80 dark:to-teal-950/40 dark:text-emerald-200"
        >
          <WorkerFormListSelect
            id="worker-form-team"
            value={team}
            onChange={setTeam}
            options={teamOptions}
            emptyLabel="Bölüm yükleniyor…"
          />
        </WorkerFieldBox>

        <WorkerFieldBox
          title="Proses"
          hint="O gün atanan proses (Ayarlar → Proses / bölüm)."
          icon={<IconProcess className="text-cyan-800 dark:text-cyan-300" />}
          iconWrapClass="bg-gradient-to-br from-cyan-100 to-teal-50 text-cyan-900 dark:from-cyan-950/70 dark:to-teal-950/40 dark:text-cyan-200"
        >
          <WorkerFormListSelect
            id="worker-form-process"
            value={process}
            onChange={setProcess}
            options={processOptions}
            emptyLabel="Proses yükleniyor…"
          />
        </WorkerFieldBox>

        <div className="flex min-h-full min-w-0 flex-col justify-end sm:col-span-2 lg:col-span-1">
          <button
            disabled={loading || names.length === 0 || !team || !process}
            className="h-[52px] w-full rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-surface-sm transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99] dark:shadow-none"
            type="submit"
          >
            {loading ? "Ekleniyor…" : "Çalışan ekle"}
          </button>
        </div>
      </div>
    </form>
  );
}
