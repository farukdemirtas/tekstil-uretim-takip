"use client";

import { FormEvent, useEffect, useState } from "react";
import { getProcesses, getTeams, getWorkerNames } from "@/lib/api";

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
      .catch(() => {/* API hazır değilse sessiz */});
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

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-card grid grid-cols-1 gap-3 md:grid-cols-4"
    >
      <select
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="input-modern"
      >
        {names.length === 0
          ? <option value="">— İsim yükleniyor... —</option>
          : names.map((n) => <option key={n} value={n}>{n}</option>)
        }
      </select>

      <select
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        className="input-modern"
      >
        {teams.length === 0
          ? <option value="">— Bölüm yükleniyor... —</option>
          : teams.map((t) => (
            <option key={t.code} value={t.code}>{t.label}</option>
          ))}
      </select>

      <select
        value={process}
        onChange={(e) => setProcess(e.target.value)}
        className="input-modern"
      >
        {processes.length === 0
          ? <option value="">— Proses yükleniyor... —</option>
          : processes.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
      </select>

      <button
        disabled={loading || names.length === 0 || !team || !process}
        className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-surface-sm transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
        type="submit"
      >
        {loading ? "Ekleniyor..." : "Çalışan Ekle"}
      </button>
    </form>
  );
}
