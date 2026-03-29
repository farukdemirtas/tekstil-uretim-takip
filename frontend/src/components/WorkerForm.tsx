"use client";

import { FormEvent, useEffect, useState } from "react";
import { getWorkerNames } from "@/lib/api";
import { Team } from "@/lib/types";

type WorkerFormProps = {
  onSubmit: (payload: { name: string; team: Team; process: string }) => Promise<void>;
};

const PROCESS_OPTIONS = [
  "ARKA KOL ÇIMA","ARKA KOL TAKMA","CEP AĞZI","CEP TAKMA","DÜĞME","ETEK UCU",
  "ETEK YAPMA","ETİKET TAKMA","İLİK AÇMA","KESİM ADET","KOL GAZİ","KOLİTE KONTROL ADET",
  "OMUZ ÇATIM","OMUZ ÇIMA","ÖN PAT","SAĞ KOL ÇIMA","SAĞ KOL TAKMA","SOL KOL ÇIMA",
  "SOL KOL TAKMA","TALİMAT HAZIRLIK","ÜTÜ ADET","YAKA İÇ ÇIMA","YAKA KAPAMA",
  "YAKA REGOLA","YAKA TAKMA","YAKA UCU","YAKA ÜST TULUM","YAKA YAN VURMA","YAN ÇATMA","YIKAMA TALİMATI",
].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" }));

const TEAM_CHOICES: Array<{ value: Team; label: string }> = [
  { value: "ADET", label: "ADET" },
  { value: "ARKA_HAZIRLIK", label: "ARKA HAZIRLIK" },
  { value: "BITIM", label: "BİTİM" },
  { value: "SAG_ON", label: "SAĞ ÖN" },
  { value: "SOL_ON", label: "SOL ÖN" },
  { value: "YAKA_HAZIRLIK", label: "YAKA HAZIRLIK" }
];

const TEAM_OPTIONS = TEAM_CHOICES.slice().sort((a, b) => a.label.localeCompare(b.label, "tr", { sensitivity: "base" }));

export default function WorkerForm({ onSubmit }: WorkerFormProps) {
  const [names, setNames]     = useState<string[]>([]);
  const [name, setName]       = useState("");
  const [team, setTeam]       = useState<Team>("SAG_ON");
  const [process, setProcess] = useState(PROCESS_OPTIONS[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getWorkerNames()
      .then((list) => {
        const sorted = list.map((n) => n.name);
        setNames(sorted);
        if (sorted.length > 0) setName(sorted[0]);
      })
      .catch(() => {/* API henüz hazır değilse sessiz geç */});
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !process.trim()) return;
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), team, process: process.trim() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <select
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-300"
      >
        {names.length === 0
          ? <option value="">— İsim yükleniyor... —</option>
          : names.map((n) => <option key={n} value={n}>{n}</option>)
        }
      </select>

      <select
        value={team}
        onChange={(e) => setTeam(e.target.value as Team)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-300"
      >
        {TEAM_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <select
        value={process}
        onChange={(e) => setProcess(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-300"
      >
        {PROCESS_OPTIONS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <button
        disabled={loading || names.length === 0}
        className="rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
        type="submit"
      >
        {loading ? "Ekleniyor..." : "Çalışan Ekle"}
      </button>
    </form>
  );
}
