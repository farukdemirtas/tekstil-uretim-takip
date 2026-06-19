import type { Locale } from "../locales";
import { messages as de } from "./de";
import { messages as en } from "./en";
import { messages as es } from "./es";
import { messages as tr } from "./tr";
import type { Messages } from "./types";

const BY_LOCALE: Record<Locale, Messages> = {
  tr,
  en,
  de,
  es,
};

export function getMessages(locale: Locale): Messages {
  return BY_LOCALE[locale] ?? tr;
}

export type { Messages };
