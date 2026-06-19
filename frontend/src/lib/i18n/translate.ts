import type { Messages } from "./messages/types";

export type TranslationKey = {
  [K in keyof Messages]: Messages[K] extends string
    ? K
    : Messages[K] extends Record<string, string>
      ? `${K & string}.${keyof Messages[K] & string}`
      : never;
}[keyof Messages];

type Vars = Record<string, string | number>;

function readPath(obj: Messages, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function translate(messages: Messages, key: string, vars?: Vars): string {
  const raw = readPath(messages, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v != null ? String(v) : `{${name}}`;
  });
}

export function formatAppDate(
  iso: string,
  localeTag: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const dt = parseIsoLocal(iso);
  if (!dt) return iso;
  return dt.toLocaleDateString(localeTag, options);
}

function parseIsoLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

export function formatAppTime(date: Date, localeTag: string): string {
  return date.toLocaleTimeString(localeTag);
}
