"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

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

  const label = useMemo(() => (theme === "dark" ? "Açık Mod" : "Koyu Mod"), [theme]);

  if (pathname === "/ekran1") return null;

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
      className="fixed right-4 top-4 z-50 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      type="button"
    >
      {label}
    </button>
  );
}

