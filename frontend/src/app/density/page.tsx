"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/I18nProvider";
import { getDensityReport, saveDensityReport, setAuthToken, updateDensityReport } from "@/lib/api";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import {
  applySizeTypology,
  boxDimsFor,
  compactDensitySizes,
  isFilledSizeSlot,
  DENSITY_BOXES,
  DENSITY_BRANDS,
  DENSITY_DELIVERIES,
  DENSITY_GTOP,
  DENSITY_GW,
  DENSITY_PLANCHA,
  DENSITY_GARMENT_PICTURES,
  DENSITY_PICTURE_ROWS,
  compactDensitySizePhotos,
  emptyDensitySizePhotos,
  sizePhotoAt,
  DENSITY_PO_TYPES,
  DENSITY_PPC,
  DENSITY_SHIPMENTS,
  DENSITY_SIZE_TYPOLOGIES,
  DENSITY_SIZES,
  DENSITY_SPECIAL_DIMS,
  DENSITY_SPECIAL_VALUE,
  downloadDensityExcel,
  emptyDensityForm,
  emptyDensityPhotos,
  fileToDensityPhoto,
  loadDensityForm,
  mergeDensityForm,
  mergeDensityPhotos,
  persistDensityForm,
  type DensityCartonPhotoKey,
  type DensityForm,
  type DensityPhoto,
  type DensityPhotoKey,
  type DensityPhotos,
  type DensitySizeSlot,
} from "@/lib/densityReport";

const fieldClass =
  "min-h-11 w-full touch-manipulation rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-base text-slate-900 shadow-inner outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/60";

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span> : null}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  formatOption,
  searchPlaceholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  formatOption?: (v: string) => string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0, maxH: 224, openUp: false });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchable = options.length > 8;
  const shown = value ? (formatOption ? formatOption(value) : value) : placeholder ?? "";
  const filtered = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("tr");
    if (!n) return options;
    return options.filter((opt) => {
      const text = `${opt} ${formatOption ? formatOption(opt) : ""}`.toLocaleLowerCase("tr");
      return text.includes(n);
    });
  }, [options, q, formatOption]);

  function placeMenu() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 12;
    const spaceBelow = window.innerHeight - r.bottom - 10;
    const spaceAbove = r.top - 10;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxH = Math.max(160, Math.min(window.innerWidth < 640 ? 360 : 280, openUp ? spaceAbove : spaceBelow));
    const width = Math.min(Math.max(r.width, Math.min(420, window.innerWidth - pad * 2)), window.innerWidth - pad * 2);
    const left = Math.max(pad, Math.min(r.left, window.innerWidth - width - pad));
    setMenuPos({
      top: openUp ? Math.max(8, r.top - maxH - 6) : r.bottom + 6,
      left,
      width,
      maxH,
      openUp,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onReposition() {
      placeMenu();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const menu = open ? (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 80,
      }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-12px_rgba(15,23,42,0.45)] ring-1 ring-teal-500/15 dark:border-slate-600 dark:bg-slate-800"
    >
      {searchable ? (
        <div className="border-b border-slate-100 p-2 dark:border-slate-700">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder ?? "Ara…"}
            className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
      ) : null}
      <ul className="overflow-auto py-1" style={{ maxHeight: menuPos.maxH }}>
        {placeholder ? (
          <li>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex min-h-11 w-full px-3 py-2.5 text-left text-base text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/60"
            >
              {placeholder}
            </button>
          </li>
        ) : null}
        {filtered.map((opt) => {
          const active = opt === value;
          return (
            <li key={opt}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-base ${
                  active
                    ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
                    : "text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/60"
                }`}
              >
                <span className="min-w-0 truncate">{formatOption ? formatOption(opt) : opt}</span>
                {active ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-slate-400">—</li> : null}
      </ul>
    </div>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setQ("");
        }}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left ${
          value ? "" : "text-slate-400 dark:text-slate-500"
        }`}
      >
        <span className="min-w-0 truncate">{shown}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-teal-600 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

function Section({
  step,
  title,
  desc,
  children,
}: {
  step: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-visible rounded-2xl border border-white/70 bg-white/95 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/70 sm:rounded-3xl dark:border-slate-700/80 dark:bg-slate-900/85 dark:ring-slate-700/60">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-50/90 via-white to-white px-3 py-3 sm:px-5 sm:py-3.5 dark:border-slate-800 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white shadow-sm">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-white">{title}</h2>
          {desc ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{desc}</p> : null}
        </div>
      </div>
      <div className="p-3 sm:p-5">{children}</div>
    </section>
  );
}

function PhotoCard({
  label,
  hint,
  exampleSrc,
  photo,
  onPick,
  onClear,
  takeLabel,
  galleryLabel,
  removeLabel,
  exampleLabel,
}: {
  label: string;
  hint: string;
  exampleSrc: string;
  photo: DensityPhoto | null;
  onPick: (file: File) => void;
  onClear: () => void;
  takeLabel: string;
  galleryLabel: string;
  removeLabel: string;
  exampleLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-row overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/60 shadow-sm sm:flex-col dark:border-slate-700 dark:bg-slate-800/40">
      <div className="relative h-28 w-28 shrink-0 bg-slate-200/70 sm:aspect-[4/3] sm:h-auto sm:w-full dark:bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo ? photo.dataUrl : exampleSrc}
          alt={label}
          className={`h-full w-full ${photo ? "object-cover" : "object-contain p-2 opacity-90 sm:p-3"}`}
        />
        {!photo ? (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm dark:bg-slate-900/80 dark:text-slate-300">
            {exampleLabel}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5 sm:p-3">
        <div>
          <p className="text-sm font-bold leading-tight text-slate-900 dark:text-white">{label}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700">
            {takeLabel}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onPick(file);
              }}
            />
          </label>
          <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 shadow-sm dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            {galleryLabel}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onPick(file);
              }}
            />
          </label>
          {photo ? (
            <button
              type="button"
              onClick={onClear}
              className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
            >
              {removeLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function DensityPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [authorized, setAuthorized] = useState(false);
  const [form, setForm] = useState<DensityForm>(emptyDensityForm);
  const [photos, setPhotos] = useState<DensityPhotos>(emptyDensityPhotos);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/");
      return;
    }
    if (!isAdminRole() && !hasPermission("density")) {
      router.replace("/");
      return;
    }
    setAuthToken(token);
    const idRaw = new URLSearchParams(window.location.search).get("id");
    const id = Number(idRaw);
    if (Number.isInteger(id) && id > 0) {
      void getDensityReport(id)
        .then((row) => {
          setForm(mergeDensityForm(row.payload as Partial<DensityForm>));
          setPhotos(mergeDensityPhotos(row.photos as DensityPhotos));
          setEditingId(row.id);
          setAuthorized(true);
        })
        .catch((e) => {
          setForm(loadDensityForm());
          setError(e instanceof Error ? e.message : "Kayıt alınamadı");
          setAuthorized(true);
        });
      return;
    }
    setForm(loadDensityForm());
    setAuthorized(true);
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    persistDensityForm(form);
  }, [authorized, form]);

  const carton = useMemo(() => boxDimsFor(form.boxType), [form.boxType]);

  function patch(partial: Partial<DensityForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function alignPhotos(nextSizes: DensitySizeSlot[]) {
    setPhotos((prev) => ({
      ...prev,
      sizePhotos: compactDensitySizePhotos(nextSizes, prev.sizePhotos),
    }));
  }

  function patchSize(index: number, partial: Partial<DensitySizeSlot>) {
    setForm((prev) => {
      const sizes = prev.sizes.map((slot, i) => (i === index ? { ...slot, ...partial } : slot));
      if (partial.size !== undefined && !isFilledSizeSlot({ size: partial.size, ppc: "", gw: "" })) {
        const nextSizes = compactDensitySizes(sizes);
        alignPhotos(sizes);
        return { ...prev, sizes: nextSizes };
      }
      return { ...prev, sizes };
    });
  }

  function removeSize(index: number) {
    setForm((prev) => {
      const nextSizes = prev.sizes.filter((_, i) => i !== index);
      alignPhotos(nextSizes);
      return { ...prev, sizes: compactDensitySizes(nextSizes) };
    });
  }

  async function pickPhoto(file: File, key: DensityPhotoKey) {
    try {
      const photo = await fileToDensityPhoto(file);
      setPhotos((prev) => ({ ...prev, [key]: photo }));
    } catch {
      setError(t("density.photoFailed"));
    }
  }

  async function pickSizePhoto(file: File, index: number, key: DensityCartonPhotoKey) {
    try {
      const photo = await fileToDensityPhoto(file, { max: 1000, quality: 0.72 });
      setPhotos((prev) => {
        const sizePhotos = Array.from({ length: 8 }, (_, i) => prev.sizePhotos[i] ?? emptyDensitySizePhotos());
        sizePhotos[index] = { ...sizePhotos[index], [key]: photo };
        return { ...prev, sizePhotos };
      });
    } catch {
      setError(t("density.photoFailed"));
    }
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const body = { payload: form, photos };
      const row = editingId
        ? await updateDensityReport(editingId, body)
        : await saveDensityReport(body);
      setEditingId(row.id);
      router.replace(`/density?id=${row.id}`);
      setSavedHint(t("density.saved"));
      window.setTimeout(() => setSavedHint(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("density.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function onDownload() {
    setError(null);
    setBusy(true);
    try {
      await downloadDensityExcel(form, photos);
      setSavedHint(t("density.downloaded"));
      window.setTimeout(() => setSavedHint(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("density.downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  const formatYesNo = (v: string) => (v === "Yes" ? t("density.yes") : v === "No" ? t("density.no") : v);
  const formatShip = (v: string) =>
    v === "PLANE" ? t("density.plane") : v === "BOAT" ? t("density.boat") : v === "TRUCK" ? t("density.truck") : v;
  const pictureCopy: Record<DensityPhotoKey, { label: string; hint: string }> = {
    cartonTop: { label: t("density.picture1"), hint: t("density.picture1Hint") },
    cartonSide: { label: t("density.picture2"), hint: t("density.picture2Hint") },
    cartonClosed: { label: t("density.picture3"), hint: t("density.picture3Hint") },
    garmentThickness: { label: t("density.thickness"), hint: t("density.garmentPhotoHint") },
    garmentLength: { label: t("density.length"), hint: t("density.garmentPhotoHint") },
    garmentWidth: { label: t("density.width"), hint: t("density.garmentPhotoHint") },
  };

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.12),_transparent_55%),linear-gradient(to_bottom,#f8fafc,#eef2f7)] px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:py-6 md:pb-6 dark:bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.16),_transparent_50%),linear-gradient(to_bottom,#020617,#0f172a)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5">
        <header className="overflow-hidden rounded-2xl border border-teal-700/20 bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-3 text-white shadow-[0_18px_50px_-20px_rgba(13,148,136,0.7)] sm:rounded-3xl sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-100">Density</p>
                <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{t("density.title")}</h1>
                <p className="hidden truncate text-[11px] text-teal-50/85 sm:block sm:text-xs">{t("density.subtitle")}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <div className="col-span-2 flex overflow-hidden rounded-xl bg-white/15 p-0.5 backdrop-blur sm:col-span-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setLocale("tr")}
                  aria-pressed={locale === "tr"}
                  className={`min-h-10 flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold sm:flex-none sm:text-sm ${
                    locale === "tr" ? "bg-white text-teal-800 shadow-sm" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {t("density.langTr")}
                </button>
                <button
                  type="button"
                  onClick={() => setLocale("en")}
                  aria-pressed={locale === "en"}
                  className={`min-h-10 flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold sm:flex-none sm:text-sm ${
                    locale === "en" ? "bg-white text-teal-800 shadow-sm" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {t("density.langEn")}
                </button>
              </div>
              <Link
                href="/density/kayitlarim"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/25 sm:text-sm"
              >
                {t("density.records")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyDensityForm());
                  setPhotos(emptyDensityPhotos());
                  router.replace("/density");
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/25 sm:text-sm"
              >
                {editingId ? t("density.newRecord") : t("density.clear")}
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving}
                className="hidden min-h-11 items-center justify-center rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50 sm:inline-flex sm:text-sm"
              >
                {saving ? t("density.saving") : t("density.save")}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={busy}
                className="hidden min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 disabled:opacity-50 sm:inline-flex sm:px-4 sm:text-sm"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
                </svg>
                {busy ? t("density.preparing") : t("density.download")}
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {savedHint ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            {savedHint}
          </p>
        ) : null}
        {editingId ? (
          <p className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            {t("density.editing")} #{editingId}
          </p>
        ) : null}

        <Section step="00" title={t("density.fileName")} desc={t("density.fileNameHint")}>
          <Field label={t("density.fileName")}>
            <input
              className={fieldClass}
              value={form.fileName}
              placeholder="density_V500 - new version 2025 1235.557 251-WHITE OFF"
              onChange={(e) => patch({ fileName: e.target.value.slice(0, 180) })}
            />
          </Field>
        </Section>

        <Section step="01" title={t("density.orderInfo")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("density.brand")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.brand}
                onChange={(v) => patch({ brand: v })}
                options={DENSITY_BRANDS}
                placeholder={t("density.selectBrand")}
              />
            </Field>
            <Field label={t("density.style")} hint={t("density.styleHint")}>
              <input
                className={fieldClass}
                inputMode="numeric"
                maxLength={4}
                placeholder="4761"
                value={form.style}
                onChange={(e) => patch({ style: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              />
            </Field>
            <Field label={t("density.article")} hint={t("density.articleHint")}>
              <input
                className={fieldClass}
                inputMode="numeric"
                maxLength={3}
                placeholder="557"
                value={form.article}
                onChange={(e) => patch({ article: e.target.value.replace(/\D/g, "").slice(0, 3) })}
              />
            </Field>
            <Field label={t("density.po")} hint={t("density.poHint")}>
              <input
                className={fieldClass}
                inputMode="decimal"
                placeholder="PO"
                value={form.poNumber}
                onChange={(e) => patch({ poNumber: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) })}
              />
            </Field>
            <Field label={t("density.poType")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.poType}
                onChange={(v) => patch({ poType: v })}
                options={DENSITY_PO_TYPES}
                placeholder={t("density.selectPoType")}
              />
            </Field>
            <Field label={t("density.delivery")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.delivery}
                onChange={(v) => patch({ delivery: v })}
                options={DENSITY_DELIVERIES}
                placeholder={t("density.selectDelivery")}
              />
            </Field>
          </div>
        </Section>

        <Section step="02" title={t("density.boxShipment")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("density.boxType")} className="sm:col-span-2 lg:col-span-3">
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.boxType}
                onChange={(v) => patch({ boxType: v })}
                options={DENSITY_BOXES.map((b) => b.label)}
                placeholder={t("density.select")}
              />
            </Field>
            <Field label={t("density.cartonLength")}>
              <input className={fieldClass} disabled value={carton.l} readOnly />
            </Field>
            <Field label={t("density.cartonWidth")}>
              <input className={fieldClass} disabled value={carton.w} readOnly />
            </Field>
            <Field label={t("density.cartonHeight")}>
              <input className={fieldClass} disabled value={carton.h} readOnly />
            </Field>
            <Field label={t("density.specialLength")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.specialL || DENSITY_SPECIAL_VALUE}
                onChange={(v) => patch({ specialL: v || DENSITY_SPECIAL_VALUE })}
                options={DENSITY_SPECIAL_DIMS}
                formatOption={(v) => (v === DENSITY_SPECIAL_VALUE ? t("density.special") : v)}
              />
            </Field>
            <Field label={t("density.specialWidth")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.specialW || DENSITY_SPECIAL_VALUE}
                onChange={(v) => patch({ specialW: v || DENSITY_SPECIAL_VALUE })}
                options={DENSITY_SPECIAL_DIMS}
                formatOption={(v) => (v === DENSITY_SPECIAL_VALUE ? t("density.special") : v)}
              />
            </Field>
            <Field label={t("density.specialHeight")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.specialH || DENSITY_SPECIAL_VALUE}
                onChange={(v) => patch({ specialH: v || DENSITY_SPECIAL_VALUE })}
                options={DENSITY_SPECIAL_DIMS}
                formatOption={(v) => (v === DENSITY_SPECIAL_VALUE ? t("density.special") : v)}
              />
            </Field>
            <Field label={t("density.plancha")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.plancha}
                onChange={(v) => patch({ plancha: v })}
                options={DENSITY_PLANCHA}
                placeholder={t("density.select")}
                formatOption={formatYesNo}
              />
            </Field>
            <Field label={t("density.shipment")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.shipment}
                onChange={(v) => patch({ shipment: v })}
                options={DENSITY_SHIPMENTS}
                placeholder={t("density.selectShipment")}
                formatOption={formatShip}
              />
            </Field>
            <Field label={t("density.gtop")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.gtop}
                onChange={(v) => patch({ gtop: v })}
                options={DENSITY_GTOP}
                placeholder={t("density.selectGtop")}
                formatOption={formatYesNo}
              />
            </Field>
          </div>
        </Section>

        <Section step="03" title={t("density.garmentDims")} desc={t("density.garmentRequired")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DENSITY_GARMENT_PICTURES.map((rowDef) => {
              const cm =
                rowDef.key === "garmentThickness"
                  ? { value: form.gThickness, patch: (v: string) => patch({ gThickness: v }), hint: "0–50" }
                  : rowDef.key === "garmentLength"
                    ? { value: form.gLength, patch: (v: string) => patch({ gLength: v }), hint: "0–200" }
                    : { value: form.gWidth, patch: (v: string) => patch({ gWidth: v }), hint: "0–200" };
              return (
                <div key={rowDef.key} className="flex min-w-0 flex-col gap-3">
                  <PhotoCard
                    label={pictureCopy[rowDef.key].label}
                    hint={pictureCopy[rowDef.key].hint}
                    exampleSrc={rowDef.example}
                    photo={photos[rowDef.key]}
                    onPick={(file) => pickPhoto(file, rowDef.key)}
                    onClear={() => setPhotos((prev) => ({ ...prev, [rowDef.key]: null }))}
                    takeLabel={t("density.takePhoto")}
                    galleryLabel={t("density.fromGallery")}
                    removeLabel={t("density.removePhoto")}
                    exampleLabel={t("density.example")}
                  />
                  <Field label={pictureCopy[rowDef.key].label} hint={cm.hint}>
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      placeholder="cm"
                      value={cm.value}
                      onChange={(e) => cm.patch(e.target.value.replace(/[^\d.]/g, ""))}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{t("density.innerCardboard")}</p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t("density.innerCardboardHint")}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("density.length")} hint="0–200">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="cm"
                  value={form.innerLength}
                  onChange={(e) => patch({ innerLength: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </Field>
              <Field label={t("density.width")} hint="0–200">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="cm"
                  value={form.innerWidth}
                  onChange={(e) => patch({ innerWidth: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section step="04" title={t("density.sizesTitle")} desc={t("density.sizesHint")}>
          <div className="mb-4 max-w-xl">
            <Field label={t("density.sizeTypology")}>
              <SelectField
                searchPlaceholder={t("density.searchOption")}
                value={form.sizeTypology}
                onChange={(v) => {
                  setForm((prev) => {
                    const next = applySizeTypology(prev, v);
                    alignPhotos(next.sizes);
                    return next;
                  });
                }}
                options={DENSITY_SIZE_TYPOLOGIES.map((row) => row.label)}
                placeholder={t("density.selectTypology")}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-3 lg:hidden">
            {form.sizes.map((slot, i) => (
              <div
                key={`${i}-${slot.size}`}
                className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 p-3 dark:border-slate-700 dark:from-slate-800/50 dark:to-slate-900/40"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                    {t("density.sizeN", { n: i + 1 })}
                  </p>
                  {isFilledSizeSlot(slot) ? (
                    <button
                      type="button"
                      onClick={() => removeSize(i)}
                      className="min-h-9 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      {t("density.removeSize")}
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <Field label={t("density.selectSize")}>
                    <SelectField
                      searchPlaceholder={t("density.searchOption")}
                      value={slot.size}
                      onChange={(v) => patchSize(i, { size: v })}
                      options={DENSITY_SIZES}
                      placeholder={t("density.selectSize")}
                    />
                  </Field>
                  <Field label={t("density.ppc")}>
                    <SelectField
                      searchPlaceholder={t("density.searchOption")}
                      value={slot.ppc}
                      onChange={(v) => patchSize(i, { ppc: v })}
                      options={DENSITY_PPC}
                      placeholder={t("density.selectPpc")}
                    />
                  </Field>
                  <Field label={t("density.gw")}>
                    <SelectField
                      searchPlaceholder={t("density.searchOption")}
                      value={slot.gw}
                      onChange={(v) => patchSize(i, { gw: v })}
                      options={DENSITY_GW}
                      placeholder={t("density.selectGw")}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 lg:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-teal-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-teal-950/30 dark:text-slate-400">
                  <th className="px-3 py-3">{t("density.sizeN", { n: "#" })}</th>
                  <th className="px-3 py-3">{t("density.selectSize")}</th>
                  <th className="px-3 py-3">{t("density.ppc")}</th>
                  <th className="px-3 py-3">{t("density.gw")}</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {form.sizes.map((slot, i) => (
                  <tr key={`${i}-${slot.size}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="w-24 px-3 py-2.5 font-semibold text-teal-700 dark:text-teal-300">
                      {t("density.sizeN", { n: i + 1 })}
                    </td>
                    <td className="px-3 py-2.5">
                      <SelectField
                        searchPlaceholder={t("density.searchOption")}
                        value={slot.size}
                        onChange={(v) => patchSize(i, { size: v })}
                        options={DENSITY_SIZES}
                        placeholder={t("density.selectSize")}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <SelectField
                        searchPlaceholder={t("density.searchOption")}
                        value={slot.ppc}
                        onChange={(v) => patchSize(i, { ppc: v })}
                        options={DENSITY_PPC}
                        placeholder={t("density.selectPpc")}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <SelectField
                        searchPlaceholder={t("density.searchOption")}
                        value={slot.gw}
                        onChange={(v) => patchSize(i, { gw: v })}
                        options={DENSITY_GW}
                        placeholder={t("density.selectGw")}
                      />
                    </td>
                    <td className="w-28 px-3 py-2.5 text-right">
                      {isFilledSizeSlot(slot) ? (
                        <button
                          type="button"
                          onClick={() => removeSize(i)}
                          className="min-h-11 rounded-xl px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          {t("density.removeSize")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section step="05" title={t("density.photos")} desc={t("density.photosHint")}>
          {form.sizes.filter(isFilledSizeSlot).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("density.photosEmpty")}</p>
          ) : (
            <div className="flex flex-col gap-5">
              {form.sizes.map((slot, i) =>
                isFilledSizeSlot(slot) ? (
                  <div
                    key={`${i}-${slot.size}`}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30"
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {t("density.photosForSize", { size: slot.size })}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {DENSITY_PICTURE_ROWS.map((rowDef) => (
                        <PhotoCard
                          key={`${i}-${rowDef.key}`}
                          label={pictureCopy[rowDef.key].label}
                          hint={pictureCopy[rowDef.key].hint}
                          exampleSrc={rowDef.example}
                          photo={sizePhotoAt(photos, i, rowDef.key)}
                          onPick={(file) => pickSizePhoto(file, i, rowDef.key)}
                          onClear={() =>
                            setPhotos((prev) => {
                              const sizePhotos = Array.from(
                                { length: 8 },
                                (_, idx) => prev.sizePhotos[idx] ?? emptyDensitySizePhotos(),
                              );
                              sizePhotos[i] = { ...sizePhotos[i], [rowDef.key]: null };
                              return { ...prev, sizePhotos };
                            })
                          }
                          takeLabel={t("density.takePhoto")}
                          galleryLabel={t("density.fromGallery")}
                          removeLabel={t("density.removePhoto")}
                          exampleLabel={t("density.example")}
                        />
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 pr-[4.75rem] shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.35)] backdrop-blur md:hidden dark:border-slate-700 dark:bg-slate-900/95" style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-600 px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? t("density.saving") : t("density.save")}
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-800 disabled:opacity-50 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-200"
          >
            {busy ? t("density.preparing") : t("density.download")}
          </button>
        </div>
      </div>
    </div>
  );
}
