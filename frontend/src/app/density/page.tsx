"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/I18nProvider";
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
  DENSITY_PICTURE_ROWS,
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
  persistDensityForm,
  type DensityForm,
  type DensityPhoto,
  type DensityPhotoKey,
  type DensityPhotos,
  type DensitySizeSlot,
} from "@/lib/densityReport";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-base text-slate-900 shadow-inner outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/60";

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
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span> : null}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  formatOption,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  formatOption?: (v: string) => string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {formatOption ? formatOption(opt) : opt}
        </option>
      ))}
    </select>
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
    <section className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/70 dark:border-slate-700/80 dark:bg-slate-900/85 dark:ring-slate-700/60">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-50/90 via-white to-white px-4 py-3.5 sm:px-5 dark:border-slate-800 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white shadow-sm">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-white">{title}</h2>
          {desc ? <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{desc}</p> : null}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
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
  uploadLabel,
  changeLabel,
  removeLabel,
  exampleLabel,
}: {
  label: string;
  hint: string;
  exampleSrc: string;
  photo: DensityPhoto | null;
  onPick: (file: File) => void;
  onClear: () => void;
  uploadLabel: string;
  changeLabel: string;
  removeLabel: string;
  exampleLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/60 shadow-sm dark:border-slate-700 dark:bg-slate-800/40">
      <div className="relative aspect-[4/3] bg-slate-200/70 dark:bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo ? photo.dataUrl : exampleSrc}
          alt={label}
          className={`h-full w-full ${photo ? "object-cover" : "object-contain p-3 opacity-90"}`}
        />
        {!photo ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm dark:bg-slate-900/80 dark:text-slate-300">
            {exampleLabel}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{label}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className="mt-auto flex gap-2">
          <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700">
            {photo ? changeLabel : uploadLabel}
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
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

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

  function patchSize(index: number, partial: Partial<DensitySizeSlot>) {
    setForm((prev) => {
      const sizes = prev.sizes.map((slot, i) => (i === index ? { ...slot, ...partial } : slot));
      if (partial.size !== undefined && !isFilledSizeSlot({ size: partial.size, ppc: "", gw: "" })) {
        return { ...prev, sizes: compactDensitySizes(sizes) };
      }
      return { ...prev, sizes };
    });
  }

  function removeSize(index: number) {
    setForm((prev) => ({
      ...prev,
      sizes: compactDensitySizes(prev.sizes.filter((_, i) => i !== index)),
    }));
  }

  async function pickPhoto(file: File, key: DensityPhotoKey) {
    try {
      const photo = await fileToDensityPhoto(file);
      setPhotos((prev) => ({ ...prev, [key]: photo }));
    } catch {
      setError(t("density.photoFailed"));
    }
  }

  async function onDownload() {
    setError(null);
    setBusy(true);
    try {
      await downloadDensityExcel(form, photos);
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 2500);
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
  };

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.12),_transparent_55%),linear-gradient(to_bottom,#f8fafc,#eef2f7)] px-3 py-4 sm:px-6 sm:py-6 dark:bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.16),_transparent_50%),linear-gradient(to_bottom,#020617,#0f172a)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="overflow-hidden rounded-3xl border border-teal-700/20 bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-4 text-white shadow-[0_18px_50px_-20px_rgba(13,148,136,0.7)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-100">Density</p>
                <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{t("density.title")}</h1>
                <p className="truncate text-[11px] text-teal-50/85 sm:text-xs">{t("density.subtitle")}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-xl bg-white/15 p-0.5 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setLocale("tr")}
                  aria-pressed={locale === "tr"}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    locale === "tr" ? "bg-white text-teal-800 shadow-sm" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {t("density.langTr")}
                </button>
                <button
                  type="button"
                  onClick={() => setLocale("en")}
                  aria-pressed={locale === "en"}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    locale === "en" ? "bg-white text-teal-800 shadow-sm" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {t("density.langEn")}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm(emptyDensityForm());
                  setPhotos(emptyDensityPhotos());
                }}
                className="rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/25 sm:text-sm"
              >
                {t("density.clear")}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 disabled:opacity-50 sm:px-4 sm:text-sm"
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
            {t("density.downloaded")}
          </p>
        ) : null}

        <Section step="01" title={t("density.orderInfo")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("density.brand")}>
              <SelectField
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
                value={form.poType}
                onChange={(v) => patch({ poType: v })}
                options={DENSITY_PO_TYPES}
                placeholder={t("density.selectPoType")}
              />
            </Field>
            <Field label={t("density.delivery")}>
              <SelectField
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
                value={form.specialL || DENSITY_SPECIAL_VALUE}
                onChange={(v) => patch({ specialL: v || DENSITY_SPECIAL_VALUE })}
                options={DENSITY_SPECIAL_DIMS}
                formatOption={(v) => (v === DENSITY_SPECIAL_VALUE ? t("density.special") : v)}
              />
            </Field>
            <Field label={t("density.specialWidth")}>
              <SelectField
                value={form.specialW || DENSITY_SPECIAL_VALUE}
                onChange={(v) => patch({ specialW: v || DENSITY_SPECIAL_VALUE })}
                options={DENSITY_SPECIAL_DIMS}
                formatOption={(v) => (v === DENSITY_SPECIAL_VALUE ? t("density.special") : v)}
              />
            </Field>
            <Field label={t("density.specialHeight")}>
              <SelectField
                value={form.specialH || DENSITY_SPECIAL_VALUE}
                onChange={(v) => patch({ specialH: v || DENSITY_SPECIAL_VALUE })}
                options={DENSITY_SPECIAL_DIMS}
                formatOption={(v) => (v === DENSITY_SPECIAL_VALUE ? t("density.special") : v)}
              />
            </Field>
            <Field label={t("density.plancha")}>
              <SelectField
                value={form.plancha}
                onChange={(v) => patch({ plancha: v })}
                options={DENSITY_PLANCHA}
                placeholder={t("density.select")}
                formatOption={formatYesNo}
              />
            </Field>
            <Field label={t("density.shipment")}>
              <SelectField
                value={form.shipment}
                onChange={(v) => patch({ shipment: v })}
                options={DENSITY_SHIPMENTS}
                placeholder={t("density.selectShipment")}
                formatOption={formatShip}
              />
            </Field>
            <Field label={t("density.gtop")}>
              <SelectField
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <Field label={t("density.thickness")} hint="0–50">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="cm"
                  value={form.gThickness}
                  onChange={(e) => patch({ gThickness: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="mb-3 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/templates/density-examples/length-guide.jpg"
                  alt=""
                  className="mx-auto h-36 w-full object-contain p-3"
                />
              </div>
              <Field label={t("density.length")} hint="0–200">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="cm"
                  value={form.gLength}
                  onChange={(e) => patch({ gLength: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="mb-3 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/templates/density-examples/width-guide.jpg"
                  alt=""
                  className="mx-auto h-36 w-full object-contain p-3"
                />
              </div>
              <Field label={t("density.width")} hint="0–200">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="cm"
                  value={form.gWidth}
                  onChange={(e) => patch({ gWidth: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section step="04" title={t("density.sizesTitle")} desc={t("density.sizesHint")}>
          <div className="mb-4 max-w-md">
            <Field label={t("density.sizeTypology")}>
              <SelectField
                value={form.sizeTypology}
                onChange={(v) => setForm((prev) => applySizeTypology(prev, v))}
                options={DENSITY_SIZE_TYPOLOGIES.map((row) => row.label)}
                placeholder={t("density.selectTypology")}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {form.sizes.map((slot, i) => (
              <div
                key={`${i}-${slot.size}`}
                className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 p-3.5 dark:border-slate-700 dark:from-slate-800/50 dark:to-slate-900/40"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                    {t("density.sizeN", { n: i + 1 })}
                  </p>
                  {isFilledSizeSlot(slot) ? (
                    <button
                      type="button"
                      onClick={() => removeSize(i)}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      {t("density.removeSize")}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2.5">
                  <Field label={t("density.selectSize")}>
                    <SelectField
                      value={slot.size}
                      onChange={(v) => patchSize(i, { size: v })}
                      options={DENSITY_SIZES}
                      placeholder={t("density.selectSize")}
                    />
                  </Field>
                  <Field label={t("density.ppc")}>
                    <SelectField
                      value={slot.ppc}
                      onChange={(v) => patchSize(i, { ppc: v })}
                      options={DENSITY_PPC}
                      placeholder={t("density.selectPpc")}
                    />
                  </Field>
                  <Field label={t("density.gw")}>
                    <SelectField
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
        </Section>

        <Section step="05" title={t("density.photos")} desc={t("density.photosHint")}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {DENSITY_PICTURE_ROWS.map((rowDef) => (
              <PhotoCard
                key={rowDef.key}
                label={pictureCopy[rowDef.key].label}
                hint={pictureCopy[rowDef.key].hint}
                exampleSrc={rowDef.example}
                photo={photos[rowDef.key]}
                onPick={(file) => pickPhoto(file, rowDef.key)}
                onClear={() => setPhotos((prev) => ({ ...prev, [rowDef.key]: null }))}
                uploadLabel={t("density.upload")}
                changeLabel={t("density.changePhoto")}
                removeLabel={t("density.removePhoto")}
                exampleLabel={t("density.example")}
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
