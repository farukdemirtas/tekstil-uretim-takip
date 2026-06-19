"use client";

import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export default function CollapsibleSection({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
  className = "",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`surface-card mb-6 overflow-hidden dark:border-slate-700 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
            {badge ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {badge}
              </span>
            ) : null}
          </div>
          {description && !open ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open ? <div className="border-t border-slate-200/90 px-5 pb-5 pt-4 dark:border-slate-700">{children}</div> : null}
    </section>
  );
}
