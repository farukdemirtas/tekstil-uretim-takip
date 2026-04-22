"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { THEME_CHANGE_EVENT } from "@/lib/permissions";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    const initial: Theme = stored === "dark" || stored === "light" ? (stored as Theme) : prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  useEffect(() => {
    function onThemeFromLogin(e: Event) {
      const d = (e as CustomEvent<Theme>).detail;
      if (d === "dark" || d === "light") setTheme(d);
    }
    window.addEventListener(THEME_CHANGE_EVENT, onThemeFromLogin as EventListener);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeFromLogin as EventListener);
  }, []);

  const label = useMemo(() => (theme === "dark" ? "Açık Mod" : "Koyu Mod"), [theme]);

  if (
    pathname.startsWith("/ekran1") ||
    pathname.startsWith("/ekran2") ||
    pathname.startsWith("/ekran3") ||
    pathname.startsWith("/ekran4") ||
    pathname.startsWith("/proses-kontrol") ||
    pathname.startsWith("/hata-rapor")
  ) return null;

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={label}
      className="fixed right-4 top-4 z-50 rounded-full border border-slate-200/90 bg-white/90 px-4 py-2 text-xs font-medium text-slate-700 shadow-surface-sm backdrop-blur-md transition hover:border-teal-300/60 hover:bg-teal-50/90 hover:text-teal-900 active:scale-95 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/50 dark:hover:text-teal-100"
      type="button"
    >
      {label}
    </button>
  );
}

