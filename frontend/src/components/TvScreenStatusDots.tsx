"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getScreenPresenceStatus, type ScreenPresenceScreenRow } from "@/lib/api";

const REFRESH_MS = 15_000;

const SHORT_LABELS: Record<string, string> = {
  ekran1: "E1",
  ekran1b: "1B",
  ekran2: "E2",
  ekran3: "E3",
  ekran4: "E4",
  ekran5: "E5",
};

function Dot({ screen }: { screen: ScreenPresenceScreenRow }) {
  const short = SHORT_LABELS[screen.id] ?? screen.id;
  return (
    <span
      title={`${screen.label}: ${screen.online ? "Açık" : "Kapalı"}`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        screen.online
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${screen.online ? "bg-emerald-500" : "bg-slate-400"}`}
        aria-hidden
      />
      {short}
    </span>
  );
}

export default function TvScreenStatusDots() {
  const [screens, setScreens] = useState<ScreenPresenceScreenRow[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getScreenPresenceStatus();
      setScreens(data.screens);
    } catch {
      /* sessiz */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (screens.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {screens.map((s) => (
        <Dot key={s.id} screen={s} />
      ))}
      <Link
        href="/ayarlar?tab=ekranlar"
        className="text-[10px] font-medium text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400"
      >
        Detay
      </Link>
    </div>
  );
}
