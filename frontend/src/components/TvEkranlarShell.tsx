"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { setAuthToken } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";

type TabId = "1" | "2" | "3" | "4";

const IFRAME_SRC: Record<TabId, string> = {
  "1": "/ekran1/icerik",
  "2": "/ekran2/icerik",
  "3": "/ekran3/icerik",
  "4": "/ekran4/icerik",
};

const ROUTE: Record<TabId, string> = {
  "1": "/ekran1",
  "2": "/ekran2",
  "3": "/ekran3",
  "4": "/ekran4",
};

function firstAllowedRoute(can1: boolean, can2: boolean, can3: boolean, can4: boolean): string | null {
  if (can1) return ROUTE["1"];
  if (can2) return ROUTE["2"];
  if (can3) return ROUTE["3"];
  if (can4) return ROUTE["4"];
  return null;
}

export default function TvEkranlarShell({ active }: { active: TabId }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const can1 = isAdminRole() || hasPermission("ekran1");
  const can2 = isAdminRole() || hasPermission("ekran2");
  const can3 = isAdminRole() || hasPermission("ekran3");
  const can4 = isAdminRole() || hasPermission("ekran4");

  const allowedForActive =
    (active === "1" && can1) ||
    (active === "2" && can2) ||
    (active === "3" && can3) ||
    (active === "4" && can4);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    if (!can1 && !can2 && !can3 && !can4) {
      window.location.href = "/";
      return;
    }
    if (!allowedForActive) {
      const fallback = firstAllowedRoute(can1, can2, can3, can4);
      if (fallback) router.replace(fallback);
      else window.location.href = "/";
      return;
    }
    setReady(true);
  }, [can1, can2, can3, can4, allowedForActive, router]);

  const tabs = useMemo(() => {
    const t: { id: TabId; label: string; href: string }[] = [];
    if (can1) t.push({ id: "1", label: "EKRAN1", href: ROUTE["1"] });
    if (can2) t.push({ id: "2", label: "EKRAN2", href: ROUTE["2"] });
    if (can3) t.push({ id: "3", label: "EKRAN3", href: ROUTE["3"] });
    if (can4) t.push({ id: "4", label: "EKRAN4", href: ROUTE["4"] });
    return t;
  }, [can1, can2, can3, can4]);

  if (!ready || !allowedForActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
        Yükleniyor…
      </div>
    );
  }

  const iframeSrc = IFRAME_SRC[active];

  return (
    <div className="fixed inset-0 z-[100] flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-slate-200 dark:bg-slate-950">
      <header className="z-[101] flex min-h-0 shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-slate-300 bg-white px-2 py-1.5 shadow-sm sm:gap-2 sm:px-3 sm:py-2 dark:border-slate-600 dark:bg-slate-900">
        <nav className="flex flex-wrap gap-1" aria-label="TV ekranları">
          {tabs.map((t) => {
            const on = active === t.id;
            return (
              <Link
                key={t.id}
                href={t.href}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition sm:px-3 sm:py-1.5 sm:text-sm ${
                  on
                    ? "bg-teal-600 text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/"
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:px-3 sm:py-1.5 sm:text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Üretim ekranı
        </Link>
      </header>
      <iframe
        key={iframeSrc}
        title={tabs.find((x) => x.id === active)?.label ?? "TV"}
        src={iframeSrc}
        className="min-h-0 min-w-0 w-full flex-1 border-0 bg-slate-100"
      />
    </div>
  );
}
