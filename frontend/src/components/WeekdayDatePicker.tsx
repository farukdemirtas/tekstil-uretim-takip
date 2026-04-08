"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  coerceWeekdayPickerValue,
  formatIsoLocal,
  parseIsoLocal,
  todayWeekdayIso,
} from "@/lib/businessCalendar";

const weekendMatcher = { dayOfWeek: [0, 6] };

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 2v3M16 2v3M3.5 9h17M21 8.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type WeekdayDatePickerTone = "default" | "dark";

export function WeekdayDatePicker({
  value,
  onChange,
  id,
  label,
  className = "",
  /** EKRAN2 gibi koyu arka planlı sayfalar için */
  tone = "default",
}: {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  label?: string;
  className?: string;
  tone?: WeekdayDatePickerTone;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, minWidth: 280 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = parseIsoLocal(value) ?? undefined;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const margin = 8;
    const panelMinW = 300;
    let left = r.left;
    if (typeof window !== "undefined") {
      const maxLeft = window.innerWidth - panelMinW - margin;
      if (left > maxLeft) left = Math.max(margin, maxLeft);
    }
    setPanelPos({
      top: r.bottom + 6,
      left,
      minWidth: Math.max(r.width, panelMinW),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function reposition() {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const margin = 8;
      const panelMinW = 300;
      let left = r.left;
      if (typeof window !== "undefined") {
        const maxLeft = window.innerWidth - panelMinW - margin;
        if (left > maxLeft) left = Math.max(margin, maxLeft);
      }
      setPanelPos({
        top: r.bottom + 6,
        left,
        minWidth: Math.max(r.width, panelMinW),
      });
    }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  function handleSelect(d: Date | undefined) {
    if (!d) return;
    onChange(coerceWeekdayPickerValue(formatIsoLocal(d)));
    setOpen(false);
  }

  const display =
    selected != null
      ? format(selected, "d MMMM yyyy · EEEE", { locale: tr })
      : "Tarih seçin";

  const monthAnchor = selected ?? parseIsoLocal(todayWeekdayIso()) ?? new Date();

  const buttonClass =
    tone === "dark"
      ? "flex min-h-[42px] w-full min-w-[12rem] max-w-full items-center justify-between gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-left text-sm text-white outline-none transition hover:border-slate-500 hover:bg-slate-700/80 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25"
      : "input-modern flex min-h-[42px] w-full min-w-[12rem] max-w-full items-center justify-between gap-2 py-2 text-left font-normal";

  const panelClass =
    tone === "dark"
      ? "rounded-2xl border border-slate-600/80 bg-slate-900 p-3 shadow-2xl ring-1 ring-white/5"
      : "rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xl ring-1 ring-slate-900/5 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10";

  const rdpTone = tone === "dark" ? "rdp-tone-dark" : "rdp-tone-light";

  const popover =
    mounted && open ? (
      createPortal(
        <div
          ref={popoverRef}
          className={`fixed z-[10000] ${panelClass}`}
          style={{
            top: panelPos.top,
            left: panelPos.left,
            minWidth: panelPos.minWidth,
          }}
          role="dialog"
          aria-label="Tarih seç"
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            locale={tr}
            weekStartsOn={1}
            disabled={weekendMatcher}
            defaultMonth={monthAnchor}
            autoFocus
            className={`${rdpTone} rdp-weekday-picker`}
          />
        </div>,
        document.body
      )
    ) : null;

  return (
    <div className={className.trim()}>
      {label ? (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-inherit">
          {label}
        </label>
      ) : null}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Hafta içi günler seçilebilir; cumartesi ve pazar kapalıdır."
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        <CalendarGlyph
          className={
            tone === "dark" ? "shrink-0 text-slate-400" : "shrink-0 text-teal-600 dark:text-teal-400"
          }
        />
      </button>
      {popover}
    </div>
  );
}
