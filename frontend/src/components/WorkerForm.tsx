"use client";

import { FormEvent, useState } from "react";
import { Team } from "@/lib/types";

type WorkerFormProps = {
  onSubmit: (payload: { name: string; team: Team; process: string }) => Promise<void>;
};

const WORKER_OPTIONS_RAW = [
  "SAYNUR ÖZKAN",
  "HÜSEYİN MAKHZOUM",
  "BÜŞRA DERE",
  "NAGİHAN KÜÇÜKDURSU",
  "BEYZANUR KORKMAZ",
  "HÜLYA UÇAR",
  "İSHAK NURİ ÇELİK",
  "ADNAN ŞEREF",
  "MEDİA YEŞİLTAŞ",
  "ALEYNA ŞEKER",
  "BERRİN KOL",
  "OMAR MAKHZOUM",
  "MUHAMMED KILIÇ",
  "NERİMAN AYDINHAN",
  "SEVGİ DEMİR",
  "SEVDA GÜLMEZ",
  "ERCAN KAYA",
  "SALİN BİLEN",
  "KAYMAK SOYLU",
  "NURAY KOLOĞLU",
  "EMİNE BİLEN",
  "MERVE ÖNDER",
  "EMİNE İLHAN",
  "YILDIZ MERT",
  "FATMA BİGEÇ",
  "CEMİLE TULUM",
  "BADEGÜL KARAGÜLMEZ",
  "MEVLÜDE AKÇAY",
  "SİBEL TAŞKIN",
  "KADİR CEYLAN",
  "FAHRİYE YILMAZ",
  "MARYAM HUSSEIN",
  "ESMA ÖZYAVUZ",
  "HÜLYA UÇAR",
  "ZAHİDE GÜLDANE",
  "SEDANUR ÇETİNER",
  "TALİP SAĞLIM",
  "NERİMAN YEŞİM",
  "MUSTAFA KEMAL",
  "CEMİLE SARI",
  "HEDİYE AYIK",
  "RUKİYE JALAL",
  "SEDEF GÜNER BERMER",
  "SEVDA GÖKÇE",
  "HÜLYA ARAZ",
  "EDANUR BOLAT",
  "HÜSEYİN MAKHZOUM",
  "HANİFE YEŞİL",
  "HAVVANUR ÖZTÜRK",
  "ELİF ÖZDEMİR",
  "EMİNE AKIN",
  "TOLGA KAYA",
  "TÜRKAN BAŞ",
  "ARZU KARAGÜDEKOĞLU",
  "SELMA DEMİRBAŞ",
  "SEMANUR TURAN",
  "ERDAL ŞENER",
  "HATİCE YILDIRIM",
  "ELVAN ÖZKAN",
  "KAZIM YEŞİL",
  "MÜNEVVER YEŞİL",
  "HAKAN AYDIN"
];

const PROCESS_OPTIONS = [
  "YAN ÇATMA",
  "YAKA TAKMA",
  "YAKA KAPAMA",
  "ETEK YAPMA",
  "ETEK UCU",
  "KOL GAZİ",
  "YIKAMA TALİMATI",
  "ETİKET TAKMA",
  "TALİMAT HAZIRLIK",
  "İLİK AÇMA",
  "DÜĞME",
  "ÜTÜ ADET",
  "KOLİTE KONTROL AD",
  "KESİM ADET"
].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" }));

const TEAM_OPTIONS: Array<{ value: Team; label: string }> = [
  { value: "SAG_ON", label: "SAĞ ÖN" },
  { value: "SOL_ON", label: "SOL ÖN" },
  { value: "YAKA_HAZIRLIK", label: "YAKA HAZIRLIK" },
  { value: "ARKA_HAZIRLIK", label: "ARKA HAZIRLIK" },
  { value: "BITIM", label: "BİTİM" },
  { value: "ADET", label: "ADET" }
].sort((a, b) => a.label.localeCompare(b.label, "tr", { sensitivity: "base" }));

const WORKER_OPTIONS = Array.from(new Set(WORKER_OPTIONS_RAW)).sort((a, b) =>
  a.localeCompare(b, "tr", { sensitivity: "base" })
);

export default function WorkerForm({ onSubmit }: WorkerFormProps) {
  const [name, setName] = useState(WORKER_OPTIONS[0]);
  const [team, setTeam] = useState<Team>("SAG_ON");
  const [process, setProcess] = useState(PROCESS_OPTIONS[0]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !process.trim()) return;

    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), team, process: process.trim() });
      setName(WORKER_OPTIONS[0]);
      setProcess(PROCESS_OPTIONS[0]);
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
        {WORKER_OPTIONS.map((workerName, index) => (
          <option key={`${workerName}-${index}`} value={workerName}>
            {workerName}
          </option>
        ))}
      </select>
      <select
        value={team}
        onChange={(e) => setTeam(e.target.value as Team)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-300"
      >
        {TEAM_OPTIONS.map((teamOption) => (
          <option key={teamOption.value} value={teamOption.value}>
            {teamOption.label}
          </option>
        ))}
      </select>
      <select
        value={process}
        onChange={(e) => setProcess(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-300"
      >
        {PROCESS_OPTIONS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <button
        disabled={loading}
        className="rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
        type="submit"
      >
        {loading ? "Ekleniyor..." : "Çalışan Ekle"}
      </button>
    </form>
  );
}
