"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions";

const LINKS = [
  {
    href: "/analysis",
    label: "Genel analiz",
    description: "Personel sıralaması ve verim",
    show: () => hasPermission("analysis"),
  },
  {
    href: "/analysis/genel-tamamlanan",
    label: "Genel tamamlanan",
    description: "Günlük özet üretim trendi",
    show: () => hasPermission("analysis"),
  },
  {
    href: "/analysis/person",
    label: "Kişi analizi",
    description: "Kişi bazında detay",
    show: () => hasPermission("analysis") || hasPermission("ekran2"),
  },
] as const;

export default function AnalysisSubnav() {
  const pathname = usePathname();
  const visible = LINKS.filter((l) => l.show());
  if (visible.length <= 1) return null;

  return (
    <nav
      className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/70"
      aria-label="Analiz sayfaları"
    >
      {visible.map((link) => {
        const active =
          link.href === "/analysis"
            ? pathname === "/analysis"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`group min-w-[9rem] flex-1 rounded-xl px-4 py-3 transition-all duration-200 ${
              active
                ? "bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-900/20"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/80"
            }`}
          >
            <span className={`block text-sm font-bold ${active ? "text-white" : "text-slate-900 dark:text-white"}`}>
              {link.label}
            </span>
            <span
              className={`mt-0.5 block text-[11px] font-medium ${
                active ? "text-teal-50/90" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {link.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
