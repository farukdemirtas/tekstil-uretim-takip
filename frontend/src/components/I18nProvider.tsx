"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
  localeToBcp47,
  type Locale,
} from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { formatAppDate, formatAppTime, translate } from "@/lib/i18n/translate";

export const LOCALE_CHANGE_EVENT = "app-locale-change";

type I18nContextValue = {
  locale: Locale;
  localeTag: string;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored && isLocale(stored) ? stored : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = readStoredLocale();
    setLocaleState(initial);
    document.documentElement.lang = initial;
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: next }));
  }, []);

  const messages = useMemo(() => getMessages(locale), [locale]);
  const localeTag = localeToBcp47(locale);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localeTag,
      setLocale,
      t: (key, vars) => translate(messages, key, vars),
      formatDate: (iso, options) => formatAppDate(iso, localeTag, options),
      formatTime: (date) => formatAppTime(date, localeTag),
    }),
    [locale, localeTag, messages, setLocale]
  );

  if (!ready) {
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useOptionalI18n(): I18nContextValue | null {
  return useContext(I18nContext);
}
