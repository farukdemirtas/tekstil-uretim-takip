"use client";

import { FormEvent, useState } from "react";
import { Team } from "@/lib/types";

type WorkerFormProps = {
  onSubmit: (payload: { name: string; team: Team; process: string }) => Promise<void>;
};

const WORKER_OPTIONS_RAW = [
  "ADNAN ŞEREF",
  "AHMET ERİŞMİŞ",
  "ALEYNA TAŞKARA",
  "ARZU KARAGÜDEKOGLU",
  "AYNUR BİNAY",
  "AYŞE BAYRAM",
  "BAĞDAGÜL KARAGÜLMEZ",
  "BERRİN ŞENOL",
  "BETÜL KESKİN",
  "BEYZA KESKİN",
  "BEYZANUR KORKMAZ",
  "BÜŞRA DERE",
  "CANSU DİLER",
  "CEMİLE ŞAHİN",
  "CEMİLE TULUM",
  "CEMİLE SARI",
  "DERYA ERSOY ATABEK",
  "DİLEK ATAKAN",
  "EDANUR BOLAT",
  "ELİF ÖZDEMİR",
  "ELİF PAK",
  "ELVAN ÖZKAN",
  "EMİNE ERATA",
  "EMİNE AKIN",
  "EMİNE ARSLAN",
  "EMİNE HACIHAMZAOĞLU",
  "EMİNE BİLEN",
  "EMİNE İLHAN",
  "ENVER TURAN",
  "ERCAN KAYA",
  "ESMA ÖZYAVUZ",
  "EYÜP AKYÜZ",
  "FADİME DİLER",
  "FAHRİYE YILMAZ",
  "FATMA BİGEÇ",
  "FERHAT ALTUN",
  "FİLİZ BÜTÜN",
  "FURKAN ERTÜRK",
  "GÜLEN ÖKSÜZ",
  "GÜLER AKER",
  "GÜLPERİ DİLER",
  "GÜLSÜM YILDIRIM",
  "GÜRSÜN KALAYCI",
  "HAKAN ÇAKIR",
  "HALİME ŞENER",
  "HAMİT BAYRAM",
  "HANİFE YEŞİL",
  "HATİCE YILDIRIM",
  "HATİCE ŞAHAN",
  "HATUN ZORLU",
  "HAVA ÇAKIR",
  "HAVVANUR ÖZTÜRK",
  "HEDİYE AYIK",
  "HUSSEIN MAKHZOUM",
  "HÜLYA ARAZ",
  "HÜLYA UÇAR",
  "İREM AYIK",
  "İSHAK NURİ ÇELİK",
  "KADİR CEYLAN",
  "KAYMAK SOYLU",
  "LEYLA CERRAH",
  "LEYLA ERTÜRK",
  "MAHMUT ÖZGÜNEŞ",
  "MEDİHA YEŞİLTAŞ",
  "MELAHAT YETKİN",
  "MELİSA YETKİN",
  "MERVE CİNCİL",
  "MERVE ÖNDER",
  "MEVLÜDE AKÇAY",
  "MUHAMMET KILIÇ",
  "MUSTAFA KEMAL ARSLAN",
  "MÜBERRA GÖREN",
  "NAGİHAN KÜÇÜKDURSUN",
  "NERİMAN AYDINHAN",
  "NERİMAN YAVUZ",
  "NEŞE CERRAH",
  "NURAY KALOĞLU",
  "NURGEL UYAR",
  "OMAR MAKHZOUM",
  "ÖZLEM SOYÇİÇEK",
  "PINAR ÖKSÜZ",
  "RABİA ÜSTÜN",
  "RUQIA JALAL",
  "SALİH BİLEN",
  "SAYNUR ÖZKAN",
  "SEDANUR ÇETİNER",
  "SEDEF GÜNER BERBER",
  "SEHER AKGÜL",
  "SELCAN YILDIZ",
  "SELMA DEMİRBAŞ",
  "SEMANUR TURAN",
  "SERKAN BATUM",
  "SEVDA GÜLMEZ",
  "SEVDA KÖKÇE",
  "SEVDA ÇAMURCU",
  "SEVGİ DEMİR",
  "SEVİM BAŞ",
  "SİBEL TAŞKIN",
  "SÜNDÜZ YAVUZ",
  "ŞEREF BAŞBOĞA",
  "ŞEVVAL BAYRİ",
  "TALİP SAGLAM",
  "TOLGA KAYA",
  "TÜLAY ÇİLİNGİR",
  "TÜRKAN BAŞ",
  "YAĞMUR ÇOŞKUN",
  "YILDIZ MERT",
  "YUSUF YAVUZ",
  "ZAHİDE GÜLDANE",
  "ZEYNEP BUZDAN",
];

const PROCESS_OPTIONS = [
  "ARKA KOL ÇIMA",
  "ARKA KOL TAKMA",
  "CEP AĞZI",
  "CEP TAKMA",
  "DÜĞME",
  "ETEK UCU",
  "ETEK YAPMA",
  "ETİKET TAKMA",
  "İLİK AÇMA",
  "KESİM ADET",
  "KOL GAZİ",
  "KOLİTE KONTROL ADET",
  "OMUZ ÇATIM",
  "OMUZ ÇIMA",
  "ÖN PAT",
  "SAĞ KOL ÇIMA",
  "SAĞ KOL TAKMA",
  "SOL KOL ÇIMA",
  "SOL KOL TAKMA",
  "TALİMAT HAZIRLIK",
  "ÜTÜ ADET",
  "YAKA İÇ ÇIMA",
  "YAKA KAPAMA",
  "YAKA REGOLA",
  "YAKA TAKMA",
  "YAKA UCU",
  "YAKA ÜST TULUM",
  "YAKA YAN VURMA",
  "YAN ÇATMA",
  "YIKAMA TALİMATI",
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
