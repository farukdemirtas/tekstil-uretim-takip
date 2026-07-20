"use client";

import { Fragment, type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getProcesses, getTeams, getProsesVeriRowsFromServer, saveProsesVeriRowsToServer } from "@/lib/api";
import { ProductionRow } from "@/lib/types";
import { todayWorkdayIsoTurkey } from "@/lib/businessCalendar";
import { workerEfficiencyPercent } from "@/lib/workerEfficiency";
import {
  isNewSlotLayout,
  LEGACY_SLOT_DEFS,
  NEW_SLOT_DEFS,
  sumProductionRow,
  type ProductionSlotKey,
} from "@/lib/productionSlots";
import {
  calcFromDk,
  getProsesMapForEfficiency,
  makeProsesKey,
  setProcessDkAndSyncGenelRows,
  dkKeyGenel,
  rowsKeyGenel,
  getStoredGenelRowsForServerSave,
  replaceLocalGenelCacheFromServerRows,
  GENEL_VERIMLILIK_MODEL_CODE,
  GENEL_PROSES_UPDATED_EVENT,
  type ProsesMap,
} from "@/lib/prosesVeri";
import { useI18n } from "@/components/I18nProvider";

type ProductionTableProps = {
  rows: ProductionRow[];
  /** Seçili takvim günü (ipucu / tutarlılık) */
  selectedDate: string;
  /** Geriye dönük uyumluluk; dk hedefleri artık ürün modelinden değil genel verimlilik deposundan okunur */
  modelKey?: string;
  onCellChange: (workerId: number, field: ProductionSlotKey, value: number) => void;
  onDeleteWorker: (workerId: number, workerName: string) => void;
  /** Bu gün sahada yok (satır soluk, hücreler kilitli) */
  onHideWorkerForDay?: (workerId: number, workerName: string) => void;
  /** Sahada yok işaretini kaldır */
  onUnhideWorkerForDay?: (workerId: number, workerName: string) => void;
  onEditWorker: (workerId: number, payload: { process: string; team: string }) => Promise<void>;
  onSaveNote?: (workerId: number, note: string) => Promise<void>;
  canDeleteWorkers?: boolean;
};

const FALLBACK_TEAM_ORDER = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM", "ADET"];

const FALLBACK_LABELS: Record<string, string> = {
  SAG_ON: "SAĞ ÖN",
  SOL_ON: "SOL ÖN",
  YAKA_HAZIRLIK: "YAKA HAZIRLIK",
  ARKA_HAZIRLIK: "ARKA HAZIRLIK",
  BITIM: "BİTİM",
  ADET: "ADET",
};

function cellInputValue(n: number): string {
  return n === 0 ? "" : String(n);
}

function parseTimeCell(raw: string): number {
  if (raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

/** Sahada yok satırları — kırmızı vurgu (tüm satır) */
function absentRowSurface(absent: boolean, isMulti = false) {
  if (!absent) {
    return isMulti
      ? "bg-indigo-50/20 hover:bg-indigo-50/50 dark:bg-indigo-950/10 dark:hover:bg-indigo-950/25"
      : "bg-white hover:bg-slate-50/80 dark:bg-transparent dark:hover:bg-slate-800/40";
  }
  return "border-l-4 border-l-red-500 bg-red-50/95 text-red-950/85 dark:border-l-red-400 dark:bg-red-950/40 dark:text-red-100/90";
}

function absentNameText(absent: boolean) {
  return absent
    ? "font-medium text-red-900 dark:text-red-50"
    : "font-medium text-slate-900 dark:text-slate-100";
}

function absentProcessText(absent: boolean) {
  return absent
    ? "text-sm font-medium text-red-800 dark:text-red-200"
    : "text-sm font-medium text-slate-700 dark:text-slate-300";
}

function absentNoteText(absent: boolean) {
  return absent
    ? "mt-0.5 text-xs font-semibold text-red-700 dark:text-red-300"
    : "mt-0.5 text-xs italic text-slate-400 dark:text-slate-500";
}

function absentTimeInput(absent: boolean) {
  return absent
    ? "cursor-not-allowed border border-red-300/80 bg-red-100/70 text-red-900/45 dark:border-red-700/60 dark:bg-red-950/55 dark:text-red-200/45"
    : "border border-slate-200 bg-white focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-teal-500";
}

function absentMobileShell(absent: boolean) {
  return absent
    ? "!bg-red-50/95 !ring-1 !ring-inset !ring-red-300/90 dark:!bg-red-950/45 dark:!ring-red-600/55"
    : "";
}

function absentMobileTimeShell(absent: boolean) {
  return absent
    ? "border-red-300/80 bg-red-100/60 dark:border-red-700/55 dark:bg-red-950/40"
    : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-700";
}

function ProcessSelectEditor({
  value,
  onChange,
  options,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative w-full max-w-full ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select-modern-compact w-full max-w-[16rem]"
        autoFocus={autoFocus}
      >
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 dark:text-slate-400">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

export default function ProductionTable({
  rows,
  selectedDate,
  modelKey,
  onCellChange,
  onDeleteWorker,
  onHideWorkerForDay,
  onUnhideWorkerForDay,
  onEditWorker,
  onSaveNote,
  canDeleteWorkers,
}: ProductionTableProps) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingProcess, setEditingProcess] = useState<string>("");
  const [editingTeam, setEditingTeam] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [noteEditingId, setNoteEditingId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState<string>("");
  const [teamOrder, setTeamOrder] = useState<string[]>(FALLBACK_TEAM_ORDER);
  const [teamLabels, setTeamLabels] = useState<Record<string, string>>(FALLBACK_LABELS);
  const [processNames, setProcessNames] = useState<string[]>([]);
  const [prosesMap, setProsesMapState] = useState<ProsesMap>({});
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    placement: "above" | "below";
  } | null>(null);
  const [dkEditTeam, setDkEditTeam] = useState<string>("");
  const [dkEditProcess, setDkEditProcess] = useState<string | null>(null);
  const [dkEditValue, setDkEditValue] = useState("");
  const [nameSearch, setNameSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadFromServer() {
      try {
        const serverRows = await getProsesVeriRowsFromServer(GENEL_VERIMLILIK_MODEL_CODE);
        if (cancelled) return;
        if (serverRows.length > 0) {
          replaceLocalGenelCacheFromServerRows(serverRows);
        }
        setProsesMapState(getProsesMapForEfficiency());
      } catch {
        if (!cancelled) setProsesMapState(getProsesMapForEfficiency());
      }
    }
    void loadFromServer();

    function onStorage(e: StorageEvent) {
      if (
        e.key === dkKeyGenel() ||
        e.key === rowsKeyGenel() ||
        e.key === "proses_dk_adet_v1"
      ) {
        setProsesMapState(getProsesMapForEfficiency());
      }
    }
    function onGenelUpdated() {
      setProsesMapState(getProsesMapForEfficiency());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(GENEL_PROSES_UPDATED_EVENT, onGenelUpdated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(GENEL_PROSES_UPDATED_EVENT, onGenelUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    void Promise.all([getTeams(), getProcesses()])
      .then(([teams, procs]) => {
        setTeamOrder(teams.map((t) => t.code));
        setTeamLabels(Object.fromEntries(teams.map((t) => [t.code, t.label])));
        setProcessNames(procs.map((p) => p.name));
      })
      .catch(() => {
        /* API yoksa varsayılan sıra */
      });
  }, []);

  const teamLabel = (code: string) => teamLabels[code] ?? FALLBACK_LABELS[code] ?? code;

  const useIntradayEfficiency = selectedDate === todayWorkdayIsoTurkey();

  function rowEffectiveForEfficiency(row: ProductionRow, editing: boolean): ProductionRow {
    if (!editing || editingId !== row.workerId) return row;
    return { ...row, team: editingTeam, process: editingProcess };
  }

  function efficiencyBadge(absent: boolean, pct: number | null): ReactNode {
    if (absent) return null;
    if (pct === null) {
      return (
        <span
          className="inline-flex min-w-[3rem] justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-400 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-500"
          title={t("production.noDkTarget")}
        >
          —
        </span>
      );
    }
    const tone =
      pct >= 75
        ? "border-emerald-200/90 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-50"
        : "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-900/55 dark:bg-amber-950/45 dark:text-amber-50";
    return (
      <span
        className={`inline-flex min-w-[3rem] justify-center rounded-md border px-2 py-0.5 text-xs font-black tabular-nums shadow-sm ${tone}`}
        title={
          useIntradayEfficiency
            ? `${t("nav.intradayEfficiency")}: %${pct}`
            : `${t("nav.dailyEfficiency")}: %${pct}`
        }
      >
        %{pct}
      </span>
    );
  }

  const timeFields = useMemo(
    () => (isNewSlotLayout(selectedDate) ? NEW_SLOT_DEFS : LEGACY_SLOT_DEFS),
    [selectedDate]
  );
  const timeColCount = timeFields.length;
  const tableColSpan = 2 + timeColCount + 1 + 3 + 1;

  function persistProsesServerSnapshot() {
    void saveProsesVeriRowsToServer(
      GENEL_VERIMLILIK_MODEL_CODE,
      getStoredGenelRowsForServerSave(),
    ).catch(() => {});
  }

  function closeRowMenu() {
    setOpenMenuId(null);
    setMenuPosition(null);
  }

  function openRowMenu(row: ProductionRow, button: HTMLButtonElement) {
    if (openMenuId === row.workerId) {
      closeRowMenu();
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuHeight = 320;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement = spaceBelow >= menuHeight || spaceBelow >= spaceAbove ? "below" : "above";
    setMenuPosition({
      top: placement === "below" ? rect.bottom + gap : rect.top - gap,
      left: rect.right,
      placement,
    });
    setOpenMenuId(row.workerId);
  }

  function scrollRowIntoView(workerId: number) {
    requestAnimationFrame(() => {
      document.getElementById(`production-row-${workerId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  const openMenuRow = useMemo(
    () => (openMenuId !== null ? rows.find((r) => r.workerId === openMenuId) ?? null : null),
    [openMenuId, rows],
  );

  useLayoutEffect(() => {
    if (openMenuId === null) return;
    function reposition() {
      const rowEl = document.getElementById(`production-row-${openMenuId}`);
      const btn = rowEl?.querySelector<HTMLButtonElement>("[data-row-action-trigger]");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuHeight = 320;
      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placement = spaceBelow >= menuHeight || spaceBelow >= spaceAbove ? "below" : "above";
      setMenuPosition({
        top: placement === "below" ? rect.bottom + gap : rect.top - gap,
        left: rect.right,
        placement,
      });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [openMenuId]);

  function renderRowActionMenu(row: ProductionRow, compact = false) {
    const absent = Boolean(row.absentForDay);
    const btnClass = compact
      ? "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
      : "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
    const iconSize = compact ? 15 : 13;

    return (
      <>
        <button
          type="button"
          disabled={absent}
          onClick={() => {
            closeRowMenu();
            startEdit(row);
            scrollRowIntoView(row.workerId);
          }}
          className={`${btnClass} text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40`}
        >
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12M8 12h12M8 17h12M3 7h.01M3 12h.01M3 17h.01"/></svg>
          {t("production.move")}
        </button>
        <button
          type="button"
          onClick={() => {
            closeRowMenu();
            setDkEditTeam(row.team);
            setDkEditProcess(row.process);
            setDkEditValue(prosesMap[makeProsesKey(row.team, row.process)] ?? "");
          }}
          className={`${btnClass} text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40`}
        >
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          {t("production.editDk")}
        </button>
        {onSaveNote ? (
          <button
            type="button"
            onClick={() => {
              closeRowMenu();
              startNoteEdit(row);
              scrollRowIntoView(row.workerId);
            }}
            className={`${btnClass} text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40`}
          >
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-6 4h4M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>
            {row.note ? t("production.editNote") : t("production.addNote")}
          </button>
        ) : null}
        {absent && onUnhideWorkerForDay ? (
          <button
            type="button"
            onClick={() => {
              closeRowMenu();
              onUnhideWorkerForDay(row.workerId, row.name);
            }}
            className={`${btnClass} text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40`}
          >
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            {t("production.presentToday")}
          </button>
        ) : null}
        {!absent && onHideWorkerForDay ? (
          <button
            type="button"
            onClick={() => {
              closeRowMenu();
              onHideWorkerForDay(row.workerId, row.name);
            }}
            className={`${btnClass} text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40`}
          >
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
            {t("production.absentToday")}
          </button>
        ) : null}
        {canDelete ? (
          <>
            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
            <button
              type="button"
              onClick={() => {
                closeRowMenu();
                onDeleteWorker(row.workerId, row.name);
              }}
              className={`${btnClass} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`}
            >
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              {t("common.delete")}
            </button>
          </>
        ) : null}
      </>
    );
  }

  const canDelete = Boolean(canDeleteWorkers);

  function startEdit(row: ProductionRow) {
    if (row.absentForDay) return;
    setEditingId(row.workerId);
    setEditingProcess(row.process);
    setEditingTeam(row.team);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingProcess("");
    setEditingTeam("");
    setNoteEditingId(null);
    setNoteText("");
  }

  function startNoteEdit(row: ProductionRow) {
    setNoteEditingId(row.workerId);
    setNoteText(row.note ?? "");
  }

  function cancelNoteEdit() {
    setNoteEditingId(null);
    setNoteText("");
  }

  async function saveNote(workerId: number) {
    if (!onSaveNote) return;
    setSaving(true);
    try {
      await onSaveNote(workerId, noteText.trim());
      setNoteEditingId(null);
      setNoteText("");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(workerId: number) {
    if (!editingProcess.trim() || !editingTeam.trim()) return;
    setSaving(true);
    try {
      await onEditWorker(workerId, {
        process: editingProcess.trim().toUpperCase(),
        team: editingTeam.trim().toUpperCase(),
      });
      setEditingId(null);
      setEditingProcess("");
      setEditingTeam("");
    } finally {
      setSaving(false);
    }
  }

  const displayRows = useMemo(() => {
    const q = nameSearch.trim().toLocaleLowerCase("tr");
    if (!q) return rows;
    return rows.filter((r) => r.name.toLocaleLowerCase("tr").includes(q));
  }, [rows, nameSearch]);

  const sortedSectionTeams = useMemo(() => {
    const inData = [...new Set(displayRows.map((r) => r.team))];
    const order = teamOrder.length ? teamOrder : FALLBACK_TEAM_ORDER;
    const head = order.filter((t) => inData.includes(t));
    const tail = inData.filter((t) => !order.includes(t));
    return [...head, ...tail];
  }, [displayRows, teamOrder]);

  type WorkerGroup = {
    name: string;
    rows: ProductionRow[];
    rowNos: number[];
  };

  let rowNo = 1;

  const sections = sortedSectionTeams.map((team) => {
    const teamRows = displayRows.filter((r) => r.team === team);
    if (teamRows.length === 0) return null;

    const groups: WorkerGroup[] = [];
    const nameToIdx = new Map<string, number>();
    for (const row of teamRows) {
      const key = row.name.trim().toLocaleLowerCase("tr");
      if (!nameToIdx.has(key)) {
        nameToIdx.set(key, groups.length);
        groups.push({ name: row.name, rows: [row], rowNos: [rowNo++] });
      } else {
        const g = groups[nameToIdx.get(key)!];
        g.rows.push(row);
        g.rowNos.push(rowNo++);
      }
    }

    return { team, groups };
  }).filter(Boolean) as { team: string; groups: WorkerGroup[] }[];

  const processOptions =
    processNames.length > 0
      ? processNames
      : [...new Set(rows.map((r) => r.process))].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" }));

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <div className="flex items-center gap-2">
          {/* Arama kutusu */}
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" stroke="currentColor" strokeWidth="1.75" />
                <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="production-name-search"
              type="search"
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              placeholder={t("production.searchPlaceholder")}
              autoComplete="off"
              className="w-full rounded-xl border border-slate-200/90 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600/90 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500 dark:focus:ring-teal-400/25"
            />
            {nameSearch.trim() ? (
              <button
                type="button"
                onClick={() => setNameSearch("")}
                className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label={t("production.clearSearch")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
          {/* Personel sayısı rozeti */}
          <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums ${
            nameSearch.trim()
              ? "bg-teal-50 text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/50"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}>
            {nameSearch.trim() ? t("production.peopleFiltered", { filtered: displayRows.length, total: rows.length }) : t("production.peopleBadge", { count: rows.length })}
          </span>
        </div>
      ) : null}

      <div className="text-slate-900 dark:text-slate-100">
      {openMenuId !== null && openMenuRow && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[80]" onClick={closeRowMenu} aria-hidden />
              <div
                role="menu"
                className="fixed z-[90] min-w-[148px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                style={{
                  left: menuPosition.left,
                  top: menuPosition.top,
                  transform:
                    menuPosition.placement === "below" ? "translateX(-100%)" : "translate(-100%, -100%)",
                }}
              >
                {renderRowActionMenu(openMenuRow)}
              </div>
            </>,
            document.body,
          )
        : null}

      {/* Dk Adet düzenleme modalı */}
      {dkEditProcess !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          onClick={() => setDkEditProcess(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">
              {t("production.editDkTitle")}
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              {t("production.editDkDesc", { process: dkEditProcess ?? "" })}
            </p>
            <div className="mb-4 flex flex-col gap-1">
              <label className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("production.editDkLabel")}</label>
              <input
                type="number"
                min={0}
                step={0.1}
                autoFocus
                value={dkEditValue}
                onChange={(e) => setDkEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setProcessDkAndSyncGenelRows(dkEditTeam, dkEditProcess!, dkEditValue, teamLabel(dkEditTeam));
                    setProsesMapState(getProsesMapForEfficiency());
                    persistProsesServerSnapshot();
                    setDkEditProcess(null);
                  }
                  if (e.key === "Escape") setDkEditProcess(null);
                }}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm font-semibold outline-none focus:border-amber-500 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
              />
            </div>
            {dkEditValue && Number(dkEditValue) > 0 && (
              <div className="mb-4 flex gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex-1 text-center">
                  <p className="text-[10px] font-medium text-sky-600 dark:text-sky-400">{t("production.hourlyPreview")}</p>
                  <p className="text-base font-bold text-sky-800 dark:text-sky-300">
                    {Math.round(Number(dkEditValue) * 60 * 100) / 100}
                  </p>
                </div>
                <div className="w-px bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{t("production.dailyPreview")}</p>
                  <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                    {Math.round(Number(dkEditValue) * 60 * 9 * 100) / 100}
                  </p>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDkEditProcess(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >{t("common.cancel")}</button>
              <button
                type="button"
                onClick={() => {
                  setProcessDkAndSyncGenelRows(dkEditTeam, dkEditProcess!, dkEditValue, teamLabel(dkEditTeam));
                  setProsesMapState(getProsesMapForEfficiency());
                  persistProsesServerSnapshot();
                  setDkEditProcess(null);
                }}
                className="rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden overflow-auto rounded-2xl border border-slate-200/90 shadow-sm dark:border-slate-700/80 md:block">
        <table className={`w-full border-collapse text-sm ${timeColCount > 4 ? "min-w-[1280px]" : "min-w-[960px]"}`}>
          <colgroup>
            <col className="w-8" />
            <col className="min-w-[12rem] w-[16.5rem]" />
            {timeFields.map((f) => (
              <col key={f.key} className={timeColCount > 4 ? "w-[4.5rem]" : "w-[6.5rem]"} />
            ))}
            <col className="w-[5.5rem]" />
            <col className="w-14" />
            <col className="w-16" />
            <col className="w-[4.5rem]" />
            <col className="w-12" />
          </colgroup>
          <thead>
            <tr className="bg-slate-900 text-white dark:bg-slate-950">
              <th className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">No</th>
              <th className="px-3 py-3 text-left text-xs font-bold">{t("production.nameAndEfficiency")}</th>
              {timeFields.map((f) => (
                <th
                  key={f.key}
                  className={`px-1 py-3 text-center font-bold ${timeColCount > 4 ? "text-[11px] leading-tight" : "text-xs"}`}
                >
                  {f.label}
                </th>
              ))}
              <th className="px-1 py-3 text-center text-xs font-bold">{t("common.total")}</th>
              <th className="px-1 py-3 text-center text-[11px] font-semibold text-amber-400" title={t("production.editDkLabel")}>{t("production.dkShort")}</th>
              <th className="px-1 py-3 text-center text-[11px] font-semibold text-sky-400" title={t("production.hourlyPreview")}>{t("production.hourlyShort")}</th>
              <th className="px-1 py-3 text-center text-[11px] font-semibold text-emerald-400" title={t("production.dailyPreview")}>{t("production.dailyShort")}</th>
              <th className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("production.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(({ team, groups }) => (
              <Fragment key={team}>
                <tr className="bg-slate-200 dark:bg-slate-700/60">
                  <td colSpan={tableColSpan} className="px-3 py-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {teamLabel(team)}
                    </span>
                  </td>
                </tr>
                {groups.map((group) => {
                  const isMulti = group.rows.length > 1;
                  return (
                    <Fragment key={group.rows.map((r) => r.workerId).join("-")}>
                      {/* Çok prosesli personel — isim başlık satırı */}
                      {isMulti && (
                        <tr className="border-b border-indigo-100/80 bg-indigo-50/60 dark:border-indigo-900/30 dark:bg-indigo-950/20">
                          <td className="px-2 py-1.5" />
                          <td colSpan={tableColSpan - 1} className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <svg className="shrink-0 text-indigo-400 dark:text-indigo-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                              </svg>
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{group.name}</span>
                              <span className="rounded-full bg-indigo-200/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                                {t("production.processCount", { count: group.rows.length })}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {group.rows.map((row, rowIdx) => {
                        const no = group.rowNos[rowIdx];
                        const total = sumProductionRow(row);
                        const isEditing = editingId === row.workerId;
                        const absent = Boolean(row.absentForDay);
                        const effectiveRow = rowEffectiveForEfficiency(row, isEditing);
                        const rowEffPct = workerEfficiencyPercent(effectiveRow, prosesMap, useIntradayEfficiency);
                        return (
                          <tr
                            key={`${team}-${row.workerId}-${rowIdx}`}
                            id={`production-row-${row.workerId}`}
                            className={`border-b border-slate-100 align-middle transition-colors dark:border-slate-700/60 ${absentRowSurface(absent, isMulti)}`}
                          >
                            <td className={`px-2 py-2 text-center tabular-nums ${absent ? "text-red-800/70 dark:text-red-300/70" : "text-slate-600 dark:text-slate-400"}`}>{no}</td>
                            {/* Ad Soyad + Proses — birleşik hücre */}
                            <td className={`py-2 ${isMulti ? "pl-7 pr-3" : "px-3"}`}>
                              {isEditing ? (
                                <div className="flex items-start gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={absentNameText(absent)}>
                                        {row.name}
                                      </span>
                                      {efficiencyBadge(absent, rowEffPct)}
                                    </div>
                                  </div>
                                  <div className="flex w-44 shrink-0 flex-col gap-1.5">
                                    <div className="relative">
                                      <select
                                        value={editingTeam}
                                        onChange={(e) => setEditingTeam(e.target.value)}
                                        className="select-modern-compact w-full"
                                        autoFocus
                                      >
                                        {teamOrder.map((code) => (
                                          <option key={code} value={code}>{teamLabel(code)}</option>
                                        ))}
                                      </select>
                                      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 dark:text-slate-400">
                                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      </span>
                                    </div>
                                    <ProcessSelectEditor
                                      value={editingProcess}
                                      onChange={setEditingProcess}
                                      options={processOptions}
                                    />
                                  </div>
                                </div>
                              ) : isMulti ? (
                                /* Çok prosesli: sadece proses adı (isim üstteki başlıkta) */
                                <div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="mr-0.5 text-[11px] text-slate-400 dark:text-slate-500">↳</span>
                                    <span className={absentProcessText(absent)}>
                                      {row.process}
                                    </span>
                                    {efficiencyBadge(absent, rowEffPct)}
                                  </div>
                                  {noteEditingId === row.workerId ? (
                                    <div className="mt-1.5 flex flex-col gap-1">
                                      <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t("production.notePlaceholder")} rows={2}
                                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                      />
                                      <div className="flex gap-1">
                                        <button type="button" onClick={() => void saveNote(row.workerId)} disabled={saving}
                                          className="rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                        >{t("common.save")}</button>
                                        <button type="button" onClick={cancelNoteEdit} disabled={saving}
                                          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300"
                                        >{t("common.cancel")}</button>
                                      </div>
                                    </div>
                                  ) : row.note ? (
                                    <p className={absentNoteText(absent)}>{row.note}</p>
                                  ) : null}
                                </div>
                              ) : (
                                /* Tek prosesli: normal görünüm */
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={absentNameText(absent)}>
                                      {row.name}
                                    </span>
                                    {efficiencyBadge(absent, rowEffPct)}
                                  </div>
                                  <p className={`mt-0.5 text-xs ${absent ? "text-red-700/80 dark:text-red-300/80" : "text-slate-500 dark:text-slate-400"}`}>{row.process}</p>
                                  {noteEditingId === row.workerId ? (
                                    <div className="mt-1.5 flex flex-col gap-1">
                                      <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t("production.notePlaceholder")} rows={2}
                                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                      />
                                      <div className="flex gap-1">
                                        <button type="button" onClick={() => void saveNote(row.workerId)} disabled={saving}
                                          className="rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                        >{t("common.save")}</button>
                                        <button type="button" onClick={cancelNoteEdit} disabled={saving}
                                          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300"
                                        >{t("common.cancel")}</button>
                                      </div>
                                    </div>
                                  ) : row.note ? (
                                    <p className={absentNoteText(absent)}>{row.note}</p>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            {timeFields.map(({ key }) => (
                              <td key={key} className="px-1.5 py-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  disabled={absent}
                                  aria-disabled={absent}
                                  title={absent ? t("production.absentCellHint") : undefined}
                                  value={cellInputValue(row[key as keyof ProductionRow] as number)}
                                  onChange={(e) => onCellChange(row.workerId, key, parseTimeCell(e.target.value))}
                                  className={`w-full rounded px-1 py-1.5 text-center text-[14px] font-semibold tabular-nums outline-none transition ${absentTimeInput(absent)}`}
                                />
                              </td>
                            ))}
                            <td className={`px-1.5 py-2 text-center text-[15px] tabular-nums font-bold ${absent ? "text-red-800/70 dark:text-red-200/80" : "text-slate-800 dark:text-slate-100"}`}>{total}</td>
                            {(() => {
                              const prosesKey = makeProsesKey(row.team, row.process);
                              const result = calcFromDk(prosesMap[prosesKey] ?? "");
                              return (
                                <>
                                  <td className="px-2 py-2 text-center tabular-nums">
                                    {result ? <span className="font-semibold text-amber-700 dark:text-amber-400">{prosesMap[prosesKey]}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                  </td>
                                  <td className="px-2 py-2 text-center tabular-nums">
                                    {result ? <span className="font-semibold text-sky-700 dark:text-sky-400">{result.saatlik}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                  </td>
                                  <td className="px-2 py-2 text-center tabular-nums">
                                    {result ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">{result.gunluk}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                  </td>
                                </>
                              );
                            })()}
                            <td className="px-2 py-2 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => void saveEdit(row.workerId)} disabled={saving}
                                    className="rounded border border-emerald-400 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                  >{t("common.save")}</button>
                                  <button onClick={cancelEdit} disabled={saving}
                                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-600"
                                  >{t("common.cancel")}</button>
                                </div>
                              ) : (
                                <div className="relative flex justify-center">
                                  <button
                                    type="button"
                                    data-row-action-trigger
                                    title={t("production.actions")}
                                    onClick={(e) => openRowMenu(row, e.currentTarget)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                      <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-700 md:hidden">
        {sections.map(({ team, groups }) => (
          <div key={team}>
            <div className="bg-slate-200 px-4 py-1.5 dark:bg-slate-700/60">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {teamLabel(team)}
              </span>
            </div>

            {groups.map((group) => {
              const isMulti = group.rows.length > 1;
              return (
                <div key={group.rows.map((r) => r.workerId).join("-")}>
                  {/* Çok prosesli — mobil isim başlık kartı */}
                  {isMulti && (
                    <div className="flex items-center gap-2 border-b border-indigo-100/80 bg-indigo-50/70 px-4 py-2 dark:border-indigo-900/30 dark:bg-indigo-950/25">
                      <svg className="shrink-0 text-indigo-400 dark:text-indigo-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{group.name}</span>
                      <span className="rounded-full bg-indigo-200/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                        {t("production.processCount", { count: group.rows.length })}
                      </span>
                    </div>
                  )}

                  {group.rows.map((row, rowIdx) => {
                    const no = group.rowNos[rowIdx];
                    const total = sumProductionRow(row);
                    const isEditing = editingId === row.workerId;
                    const absent = Boolean(row.absentForDay);
                    const effectiveMob = rowEffectiveForEfficiency(row, isEditing);
                    const rowEffPctMob = workerEfficiencyPercent(effectiveMob, prosesMap, useIntradayEfficiency);

                    return (
                      <div
                        key={`${team}-${row.workerId}-${rowIdx}`}
                        id={`production-row-${row.workerId}`}
                        className={`p-3 odd:bg-white even:bg-slate-50 dark:odd:bg-slate-800 dark:even:bg-slate-800/60 ${absentMobileShell(absent)} ${isMulti ? "pl-5" : ""}`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                              <span className="text-xs text-slate-400">{no}.</span>
                              {isMulti ? (
                                /* Çok prosesli: sadece proses adını göster */
                                <>
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500">↳</span>
                                  <span className={absentProcessText(absent)}>{row.process}</span>
                                </>
                              ) : (
                                <span className={absentNameText(absent)}>{row.name}</span>
                              )}
                              {efficiencyBadge(absent, rowEffPctMob)}
                            </div>
                            {!isMulti && !isEditing && (
                              <p className={`mt-0.5 text-xs ${absent ? "text-red-700/80 dark:text-red-300/80" : "text-slate-500 dark:text-slate-400"}`}>{row.process}</p>
                            )}
                            {noteEditingId === row.workerId ? (
                              <div className="mt-1.5 flex flex-col gap-1">
                                <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t("production.notePlaceholder")} rows={2}
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                />
                                <div className="flex gap-1">
                                  <button type="button" onClick={() => void saveNote(row.workerId)} disabled={saving}
                                    className="rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                  >{t("common.save")}</button>
                                  <button type="button" onClick={cancelNoteEdit} disabled={saving}
                                    className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300"
                                  >{t("common.cancel")}</button>
                                </div>
                              </div>
                            ) : row.note && !isEditing ? (
                              <p className={absentNoteText(absent)}>{row.note}</p>
                            ) : null}
                            {isEditing ? (
                              <div className="mt-2 flex flex-col gap-1.5">
                                <div className="relative w-full">
                                  <select value={editingTeam} onChange={(e) => setEditingTeam(e.target.value)} className="select-modern-compact w-full max-w-none">
                                    {teamOrder.map((code) => (
                                      <option key={code} value={code}>{teamLabel(code)}</option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 dark:text-slate-400">
                                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  </span>
                                </div>
                                <ProcessSelectEditor value={editingProcess} onChange={setEditingProcess} options={processOptions} className="max-w-none" />
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-xs text-slate-500">{t("common.total")}</span>
                            <p className="text-lg font-bold leading-tight text-slate-800 dark:text-slate-100">{total}</p>
                          </div>
                        </div>

                        <div className={`mb-2 grid gap-2 ${timeColCount > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
                          {timeFields.map(({ key, label }) => (
                            <div key={key} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${absentMobileTimeShell(absent)}`}>
                              <span className={`shrink-0 font-medium text-slate-500 dark:text-slate-400 ${timeColCount > 4 ? "w-[2.75rem] text-[10px]" : "w-10 text-xs"}`}>{label}</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                disabled={absent}
                                value={cellInputValue(row[key as keyof ProductionRow] as number)}
                                onChange={(e) => onCellChange(row.workerId, key, parseTimeCell(e.target.value))}
                                className={`min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none ${
                                  absent ? "cursor-not-allowed text-red-900/45 dark:text-red-200/45" : "focus:text-blue-600 dark:focus:text-blue-300"
                                }`}
                              />
                            </div>
                          ))}
                        </div>

                        {(() => {
                          const mobileProsesKey = makeProsesKey(row.team, row.process);
                          const result = calcFromDk(prosesMap[mobileProsesKey] ?? "");
                          return (
                            <div className="mb-2 flex items-center gap-2">
                              <div className="flex flex-1 items-center justify-between gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-700/60 dark:bg-amber-950/30">
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{t("production.dkShort")}</span>
                                <span className="text-sm font-bold text-amber-800 dark:text-amber-200">{result ? prosesMap[mobileProsesKey] : "—"}</span>
                              </div>
                              <div className="flex flex-1 items-center justify-between gap-1 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 dark:border-sky-800/50 dark:bg-sky-950/30">
                                <span className="text-xs font-medium text-sky-700 dark:text-sky-300">{t("production.hourlyShort")}</span>
                                <span className="text-sm font-bold text-sky-800 dark:text-sky-300">{result ? result.saatlik : "—"}</span>
                              </div>
                              <div className="flex flex-1 items-center justify-between gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{t("production.dailyShort")}</span>
                                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{result ? result.gunluk : "—"}</span>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={() => void saveEdit(row.workerId)} disabled={saving}
                                className="flex-1 rounded-lg border border-emerald-400 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                              >{t("common.save")}</button>
                              <button onClick={cancelEdit} disabled={saving}
                                className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-600"
                              >{t("common.cancel")}</button>
                            </>
                          ) : (
                            <div className="relative w-full">
                              <button
                                type="button"
                                data-row-action-trigger
                                onClick={(e) => openRowMenu(row, e.currentTarget)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                  <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                                </svg>
                                {t("production.actions")}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {nameSearch.trim() && displayRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t border-slate-200/90 px-4 py-10 dark:border-slate-700">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path d="M16 16l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-center text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("production.noSearchResults")}
          </p>
          <p className="max-w-sm text-center text-xs text-slate-500 dark:text-slate-400">
            {t("production.noSearchHint", { query: nameSearch.trim() })}
          </p>
        </div>
      ) : null}
    </div>
    </div>
  );
}
