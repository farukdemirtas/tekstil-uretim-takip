"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import LogsSection from "@/components/settings/LogsSection";
import PersonnelNamesSection from "@/components/settings/PersonnelNamesSection";
import TeamsProcessesSection from "@/components/settings/TeamsProcessesSection";
import UsersSettingsSection from "@/components/settings/UsersSettingsSection";
import { setAuthToken } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";

type TabId = "kullanici" | "personel" | "proses" | "loglar";

export default function AyarlarPageClient() {
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [canAyarlar, setCanAyarlar] = useState(false);
  const [canLoglar, setCanLoglar] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    const isAdmin = isAdminRole();
    const aya = isAdmin || hasPermission("ayarlar");
    const log = isAdmin || hasPermission("loglar");
    if (!aya && !log) {
      window.location.href = "/";
      return;
    }
    setAdmin(isAdmin);
    setCanAyarlar(aya);
    setCanLoglar(log);
    setReady(true);
  }, []);

  const activeTab = useMemo((): TabId => {
    const raw = searchParams.get("tab");
    if (raw === "loglar" && canLoglar) return "loglar";
    if (raw === "proses" && canAyarlar) return "proses";
    if (raw === "personel" && canAyarlar) return "personel";
    if (raw === "kullanici" && admin) return "kullanici";
    if (canAyarlar) return "personel";
    if (canLoglar) return "loglar";
    return "personel";
  }, [searchParams, admin, canAyarlar, canLoglar]);

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center p-4">
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      </main>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    ...(admin ? [{ id: "kullanici" as const, label: "Kullanıcı" }] : []),
    ...(canAyarlar
      ? ([
          { id: "personel" as const, label: "Personel" },
          { id: "proses" as const, label: "Proses ve bölüm" },
        ] as const)
      : []),
    ...(canLoglar ? [{ id: "loglar" as const, label: "Loglar" }] : []),
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 p-4 md:p-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Ayarlar</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Kullanıcı hesapları, personel isim havuzu ve bölüm / proses tanımları.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Üretim ekranına dön
          </Link>
        </div>

        <nav className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-600" aria-label="Ayarlar sekmeleri">
          {tabs.map((t) => {
            const on = activeTab === t.id;
            return (
              <Link
                key={t.id}
                href={`/ayarlar?tab=${t.id}`}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  on
                    ? "bg-teal-600 text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </section>

      {activeTab === "kullanici" && admin && <UsersSettingsSection />}
      {activeTab === "personel" && canAyarlar && <PersonnelNamesSection />}
      {activeTab === "proses" && canAyarlar && <TeamsProcessesSection />}
      {activeTab === "loglar" && canLoglar && <LogsSection />}
    </main>
  );
}
