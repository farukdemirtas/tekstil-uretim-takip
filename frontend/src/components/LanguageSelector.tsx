"use client";

import { LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n/locales";
import { useI18n } from "./I18nProvider";

type Props = {
  className?: string;
};

export default function LanguageSelector({ className = "" }: Props) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("language.select")}
        className="cursor-pointer rounded-full border border-slate-200/90 bg-white/90 py-2 pl-3 pr-8 text-xs font-medium text-slate-700 shadow-surface-sm backdrop-blur-md transition hover:border-teal-300/60 hover:bg-teal-50/90 hover:text-teal-900 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/50 dark:hover:text-teal-100"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
