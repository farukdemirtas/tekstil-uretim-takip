"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ListSelectOption = { value: string; label: string };

const TR = "tr-TR";
const TYPE_AHEAD_IDLE_MS = 550;
const LIST_MAX_HEIGHT_PX = 420;

function normTr(s: string): string {
  return s.toLocaleLowerCase(TR);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Listeye personel ekle — native select yerine kaydırılabilir, stilli liste.
 */
export function WorkerFormListSelect({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: ListSelectOption[];
  emptyLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [panel, setPanel] = useState({ top: 0, left: 0, width: 0, maxH: LIST_MAX_HEIGHT_PX });

  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const highlightRef = useRef(0);
  const typeBufferRef = useRef("");
  const typeAheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypeAtRef = useRef(0);
  const lastTypeKeyRef = useRef("");

  useEffect(() => {
    highlightRef.current = highlight;
  }, [highlight]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) return;
    typeBufferRef.current = "";
    lastTypeKeyRef.current = "";
    if (typeAheadTimerRef.current) {
      clearTimeout(typeAheadTimerRef.current);
      typeAheadTimerRef.current = null;
    }
  }, [open]);

  const reposition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 12;
    const maxH = Math.max(160, Math.min(LIST_MAX_HEIGHT_PX, window.innerHeight - r.bottom - margin));
    setPanel({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 200),
      maxH,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[highlight];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlight, open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    function findPrefixIndex(prefix: string, startFrom: number): number {
      const p = normTr(prefix);
      if (!p) return -1;
      for (let step = 0; step < options.length; step++) {
        const i = (startFrom + step) % options.length;
        if (normTr(options[i].label).startsWith(p)) return i;
      }
      return -1;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        typeBufferRef.current = "";
        lastTypeKeyRef.current = "";
        if (typeAheadTimerRef.current) {
          clearTimeout(typeAheadTimerRef.current);
          typeAheadTimerRef.current = null;
        }
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (!open || options.length === 0) return;
      const ae = document.activeElement;
      const inCombo = ae === btnRef.current || listRef.current?.contains(ae ?? null);
      if (!inCombo) return;

      const isPrintableTypeAhead =
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key !== " " &&
        !/[\u0000-\u001f]/.test(e.key);

      if (isPrintableTypeAhead) {
        const ch = e.key;
        const now = Date.now();
        const gap = now - lastTypeAtRef.current;

        if (typeAheadTimerRef.current) {
          clearTimeout(typeAheadTimerRef.current);
          typeAheadTimerRef.current = null;
        }
        typeAheadTimerRef.current = setTimeout(() => {
          typeBufferRef.current = "";
          lastTypeKeyRef.current = "";
          typeAheadTimerRef.current = null;
        }, TYPE_AHEAD_IDLE_MS);

        const sameLetterQuickRepeat =
          gap < TYPE_AHEAD_IDLE_MS &&
          ch === lastTypeKeyRef.current &&
          typeBufferRef.current.length === 1 &&
          typeBufferRef.current === ch;

        let idx: number;
        if (sameLetterQuickRepeat) {
          idx = findPrefixIndex(ch, highlightRef.current + 1);
          if (idx === highlightRef.current) idx = findPrefixIndex(ch, 0);
        } else {
          if (gap > TYPE_AHEAD_IDLE_MS) {
            typeBufferRef.current = ch;
          } else {
            typeBufferRef.current += ch;
          }
          idx = findPrefixIndex(typeBufferRef.current, 0);
          if (idx < 0 && typeBufferRef.current.length > 1) {
            typeBufferRef.current = ch;
            idx = findPrefixIndex(ch, 0);
          }
        }

        lastTypeAtRef.current = now;
        lastTypeKeyRef.current = ch;

        if (idx >= 0) {
          e.preventDefault();
          setHighlight(idx);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        typeBufferRef.current = "";
        lastTypeKeyRef.current = "";
        setHighlight((h) => Math.min(options.length - 1, h + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        typeBufferRef.current = "";
        lastTypeKeyRef.current = "";
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        typeBufferRef.current = "";
        lastTypeKeyRef.current = "";
        const opt = options[highlightRef.current];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
          btnRef.current?.focus();
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        typeBufferRef.current = "";
        lastTypeKeyRef.current = "";
        setHighlight(0);
      } else if (e.key === "End") {
        e.preventDefault();
        typeBufferRef.current = "";
        lastTypeKeyRef.current = "";
        setHighlight(options.length - 1);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      if (typeAheadTimerRef.current) {
        clearTimeout(typeAheadTimerRef.current);
        typeAheadTimerRef.current = null;
      }
    };
  }, [open, options, onChange]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const showPlaceholder = options.length === 0 || !selectedLabel;

  const triggerClass =
    "flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2.5 text-left text-sm font-medium outline-none transition " +
    "hover:border-slate-300 hover:bg-white " +
    "focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 " +
    "disabled:cursor-not-allowed disabled:opacity-60 " +
    "dark:border-slate-600/90 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800 " +
    "dark:focus:border-teal-400 dark:focus:ring-teal-400/20";

  const listbox = open && mounted && options.length > 0 && (
    <div
      ref={listRef}
      role="listbox"
      id={`${id}-listbox`}
      aria-labelledby={id}
      className="fixed z-[300] overflow-y-auto overscroll-contain rounded-xl border border-slate-200/95 bg-white py-1 shadow-2xl ring-1 ring-slate-900/5 scroll-smooth
        [scrollbar-width:thin]
        [scrollbar-color:rgb(148_163_184)_rgb(248_250_252)]
        dark:[scrollbar-color:rgb(71_85_105)_rgb(30_41_55)]
        [&::-webkit-scrollbar]:w-2
        [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100
        dark:[&::-webkit-scrollbar-track]:bg-slate-800
        [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300
        dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:hover:bg-slate-400
        dark:[&::-webkit-scrollbar-thumb]:hover:bg-slate-500
        dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10"
      style={{
        top: panel.top,
        left: panel.left,
        width: panel.width,
        maxHeight: panel.maxH,
      }}
    >
        {options.map((opt, i) => {
          const selected = opt.value === value;
          const active = i === highlight;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={selected}
              className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors duration-150
                ${
                  active
                    ? "bg-teal-200/90 font-semibold text-teal-950 ring-1 ring-inset ring-teal-400/80 dark:bg-teal-800/85 dark:text-teal-50 dark:ring-teal-500/60"
                    : selected
                      ? "font-semibold text-slate-900 hover:bg-teal-100/90 hover:text-teal-950 dark:text-white dark:hover:bg-teal-950/55 dark:hover:text-teal-50"
                      : "text-slate-800 hover:bg-slate-200/95 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-600 dark:hover:text-white"
                }
                ${selected ? "border-l-[3px] border-l-teal-600 pl-[calc(0.75rem-3px)] dark:border-l-teal-400" : "border-l-[3px] border-l-transparent"}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
                btnRef.current?.focus();
              }}
            >
              <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              {selected ? (
                <svg className="ml-2 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-7.5 10.5a.75.75 0 01-1.127.077l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 6.848-9.588a.75.75 0 011.052-.143z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : null}
            </button>
          );
        })}
    </div>
  );

  return (
    <div className="relative w-full min-w-0">
      <button
        ref={btnRef}
        type="button"
        id={id}
        disabled={disabled || options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        className={triggerClass}
        onKeyDown={(e) => {
          if (options.length === 0) return;
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        onClick={() => {
          if (options.length === 0) return;
          setOpen((o) => !o);
        }}
      >
        <span className={`min-w-0 flex-1 truncate ${showPlaceholder ? "font-normal text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
          {options.length === 0 ? emptyLabel : selectedLabel || emptyLabel}
        </span>
        <Chevron open={open} />
      </button>
      {mounted && listbox ? createPortal(listbox, document.body) : null}
    </div>
  );
}
