"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  getEkran1GenelIlerleme,
  getEkran5Target,
  getEkranRefreshSignal,
  getPersonnelBirthdaysToday,
  getProductModel,
  getUtuPaket,
  getUtuPaketAnalytics,
  setAuthToken,
  setEkran5Target,
  syncTakipsan,
  type PersonnelBirthdayRow,
} from "@/lib/api";
import { todayIsoTurkey, todayWeekdayIso } from "@/lib/businessCalendar";
import {
  calcUtuPaketPercent,
  normalizeUtuPaketPayload,
  normalizeTakipsanPackages,
  sumGunPaketlenen,
  resolveUtuPaketLineTarget,
  sumUtuPaketSlots,
} from "@/lib/utuPaket";

const AUTO_REFRESH_MS = 30_000;
const SLIDE_DURATION_MS = 30_000;
const SLIDE_COUNT = 3;
const SLIDES = ["paketleme", "optik", "utu"] as const;
type SlideKey = (typeof SLIDES)[number];

// ─── Renk / stil tanımları ───────────────────────────────────────────────────
type BoxStyle = { box: string; label: string; value: string };
type SlideMeta = {
  label: string;
  badgeCls: string;
  barGradient: string;
  barGlow: string;
  targetStyle: BoxStyle;
  totalStyle: BoxStyle;
  todayStyle: BoxStyle;
  remainStyle: BoxStyle;
};

const SLIDE_META: Record<SlideKey, SlideMeta> = {
  paketleme: {
    label: "Paketleme",
    badgeCls: "from-emerald-600 to-teal-600",
    barGradient: "from-emerald-500 via-teal-500 to-cyan-500",
    barGlow: "shadow-[0_0_24px_rgba(16,185,129,0.35)]",
    targetStyle: { box: "border-slate-300 bg-white ring-1 ring-slate-200/80",          label: "text-slate-500",    value: "text-slate-900"   },
    totalStyle:  { box: "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200/90", label: "text-emerald-700",  value: "text-emerald-800" },
    todayStyle:  { box: "border-teal-400 bg-teal-50 ring-1 ring-teal-200/90",          label: "text-teal-700",     value: "text-teal-800"    },
    remainStyle: { box: "border-amber-400 bg-amber-50 ring-1 ring-amber-200/90",       label: "text-amber-700",    value: "text-amber-900"   },
  },
  optik: {
    label: "Optik Kontrol",
    badgeCls: "from-violet-600 to-purple-600",
    barGradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    barGlow: "shadow-[0_0_24px_rgba(139,92,246,0.35)]",
    targetStyle: { box: "border-slate-300 bg-white ring-1 ring-slate-200/80",          label: "text-slate-500",    value: "text-slate-900"   },
    totalStyle:  { box: "border-violet-400 bg-violet-50 ring-1 ring-violet-200/90",    label: "text-violet-700",   value: "text-violet-800"  },
    todayStyle:  { box: "border-purple-400 bg-purple-50 ring-1 ring-purple-200/90",    label: "text-purple-700",   value: "text-purple-800"  },
    remainStyle: { box: "border-amber-400 bg-amber-50 ring-1 ring-amber-200/90",       label: "text-amber-700",    value: "text-amber-900"   },
  },
  utu: {
    label: "Ütü",
    badgeCls: "from-orange-500 to-amber-500",
    barGradient: "from-orange-500 via-amber-500 to-yellow-400",
    barGlow: "shadow-[0_0_24px_rgba(245,158,11,0.35)]",
    targetStyle: { box: "border-slate-300 bg-white ring-1 ring-slate-200/80",          label: "text-slate-500",    value: "text-slate-900"   },
    totalStyle:  { box: "border-orange-400 bg-orange-50 ring-1 ring-orange-200/90",    label: "text-orange-700",   value: "text-orange-800"  },
    todayStyle:  { box: "border-amber-400 bg-amber-50 ring-1 ring-amber-200/90",       label: "text-amber-700",    value: "text-amber-800"   },
    remainStyle: { box: "border-red-400 bg-red-50 ring-1 ring-red-200/90",             label: "text-red-700",      value: "text-red-900"     },
  },
};

// ─── Doğum günü sabitleri ────────────────────────────────────────────────────
const BDAY_OVERLAY_VISIBLE_MS  = 10_000;
const BDAY_OVERLAY_CYCLE_MS    = 60_000;
const BDAY_FETCH_INTERVAL_MS   = 60_000;
const BDAY_MULTI_SLIDE_MS      = 4_800;
const BDAY_MULTI_CAP_VISIBLE_MS = 48_000;

function birthdayOverlayDurationMs(n: number): number {
  if (n <= 1) return BDAY_OVERLAY_VISIBLE_MS;
  return Math.min(BDAY_MULTI_CAP_VISIBLE_MS, Math.max(BDAY_OVERLAY_VISIBLE_MS, BDAY_MULTI_SLIDE_MS * n));
}

function completedAgeAtReference(birthDateIso: string, referenceIso: string): number {
  const p = birthDateIso.split("-").map(Number);
  const r = referenceIso.split("-").map(Number);
  if (p.length < 3 || r.length < 3) return 0;
  const [by, bm, bd] = p, [ry, rm, rd] = r;
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return Math.max(0, age);
}

const BDAY_CONFETTI_SPECS: { left: string; drift: string; delay: string; dur: string; w: number; h: number; bg: string }[] = [
  { left: "2%",  drift: "-32px", delay: "0s",    dur: "2.65s", w: 10, h: 14, bg: "#ec4899" },
  { left: "6%",  drift: "22px",  delay: "0.35s", dur: "3.1s",  w: 11, h: 11, bg: "#fbbf24" },
  { left: "10%", drift: "-18px", delay: "0.1s",  dur: "2.85s", w: 9,  h: 13, bg: "#a78bfa" },
  { left: "14%", drift: "40px",  delay: "0.7s",  dur: "3.35s", w: 12, h: 10, bg: "#34d399" },
  { left: "18%", drift: "-25px", delay: "0.2s",  dur: "2.95s", w: 10, h: 12, bg: "#f472b6" },
  { left: "22%", drift: "15px",  delay: "0.5s",  dur: "3.05s", w: 13, h: 9,  bg: "#60a5fa" },
  { left: "26%", drift: "-38px", delay: "0.85s", dur: "3.2s",  w: 11, h: 13, bg: "#facc15" },
  { left: "30%", drift: "28px",  delay: "0.15s", dur: "2.75s", w: 9,  h: 11, bg: "#fb7185" },
  { left: "34%", drift: "-42px", delay: "1s",    dur: "3.4s",  w: 12, h: 12, bg: "#4ade80" },
  { left: "38%", drift: "33px",  delay: "0.45s", dur: "2.9s",  w: 10, h: 10, bg: "#c084fc" },
  { left: "42%", drift: "-20px", delay: "0.25s", dur: "3.15s", w: 11, h: 14, bg: "#f97316" },
  { left: "46%", drift: "45px",  delay: "1.15s", dur: "2.8s",  w: 10, h: 11, bg: "#22d3ee" },
  { left: "50%", drift: "-30px", delay: "0.55s", dur: "3.25s", w: 12, h: 10, bg: "#e879f9" },
  { left: "54%", drift: "18px",  delay: "0.05s", dur: "2.7s",  w: 9,  h: 14, bg: "#ef4444" },
  { left: "58%", drift: "-48px", delay: "0.95s", dur: "3.3s",  w: 11, h: 11, bg: "#14b8a6" },
  { left: "62%", drift: "36px",  delay: "0.3s",  dur: "2.88s", w: 10, h: 12, bg: "#eab308" },
  { left: "66%", drift: "-22px", delay: "1.25s", dur: "3.45s", w: 13, h: 9,  bg: "#8b5cf6" },
  { left: "70%", drift: "12px",  delay: "0.6s",  dur: "2.72s", w: 9,  h: 13, bg: "#f43f5e" },
  { left: "74%", drift: "-35px", delay: "0.12s", dur: "3.08s", w: 12, h: 11, bg: "#06b6d4" },
  { left: "78%", drift: "41px",  delay: "0.8s",  dur: "3.18s", w: 10, h: 10, bg: "#84cc16" },
  { left: "82%", drift: "-16px", delay: "0.4s",  dur: "2.92s", w: 11, h: 13, bg: "#d946ef" },
  { left: "86%", drift: "26px",  delay: "1.05s", dur: "3.38s", w: 10, h: 12, bg: "#fb923c" },
  { left: "90%", drift: "-44px", delay: "0.22s", dur: "2.78s", w: 9,  h: 11, bg: "#2dd4bf" },
  { left: "94%", drift: "19px",  delay: "0.65s", dur: "3.12s", w: 12, h: 10, bg: "#e11d48" },
  { left: "97%", drift: "-10px", delay: "0.18s", dur: "3.22s", w: 11, h: 14, bg: "#a3e635" },
  { left: "1%",  drift: "30px",  delay: "1.35s", dur: "2.98s", w: 8,  h: 12, bg: "#fde047" },
  { left: "52%", drift: "-50px", delay: "1.5s",  dur: "3.5s",  w: 11, h: 9,  bg: "#38bdf8" },
  { left: "76%", drift: "48px",  delay: "0.75s", dur: "2.68s", w: 10, h: 13, bg: "#f472b6" },
  { left: "44%", drift: "-8px",  delay: "1.4s",  dur: "3.28s", w: 9,  h: 10, bg: "#fcd34d" },
  { left: "68%", drift: "8px",   delay: "0.28s", dur: "3.02s", w: 12, h: 12, bg: "#c026d3" },
];

function BirthdayCake({ className, age }: { className?: string; age?: number | null }) {
  const showAge = age != null && age >= 0 && age < 130;
  const ageFont = showAge && age! > 99 ? 15 : showAge && age! > 9 ? 21 : 27;
  return (
    <svg className={className} viewBox="0 0 200 128" width={200} height={128} preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="e5-bday-plate"  x1="100" y1="108" x2="100" y2="124" gradientUnits="userSpaceOnUse"><stop stopColor="#f1f5f9" /><stop offset="1" stopColor="#cbd5e1" /></linearGradient>
        <linearGradient id="e5-bday-tier3"  x1="40"  y1="72"  x2="160" y2="72"  gradientUnits="userSpaceOnUse"><stop stopColor="#fda4af" /><stop offset="0.5" stopColor="#fb7185" /><stop offset="1" stopColor="#f43f5e" /></linearGradient>
        <linearGradient id="e5-bday-tier2"  x1="52"  y1="48"  x2="148" y2="48"  gradientUnits="userSpaceOnUse"><stop stopColor="#fef9c3" /><stop offset="0.5" stopColor="#fde047" /><stop offset="1" stopColor="#eab308" /></linearGradient>
        <linearGradient id="e5-bday-tier1"  x1="68"  y1="28"  x2="132" y2="28"  gradientUnits="userSpaceOnUse"><stop stopColor="#e9d5ff" /><stop offset="0.5" stopColor="#c084fc" /><stop offset="1" stopColor="#a855f7" /></linearGradient>
        <linearGradient id="e5-bday-icing"  x1="100" y1="18"  x2="100" y2="32"  gradientUnits="userSpaceOnUse"><stop stopColor="#fffdfb" /><stop offset="1" stopColor="#fce7f3" /></linearGradient>
        <linearGradient id="e5-bday-flame"  x1="100" y1="0"   x2="100" y2="14"  gradientUnits="userSpaceOnUse"><stop stopColor="#fef08a" /><stop offset="0.45" stopColor="#fb923c" /><stop offset="1" stopColor="#ea580c" /></linearGradient>
      </defs>
      <ellipse cx="100" cy="118" rx="72" ry="10" fill="url(#e5-bday-plate)" opacity="0.92" />
      <ellipse cx="100" cy="116" rx="68" ry="7"  fill="#e2e8f0" opacity="0.55" />
      <path d="M38 76c0-5 4.5-9 10-9h104c5.5 0 10 4 10 9v28c0 6-5.5 11-12 11H50c-6.5 0-12-5-12-11V76z" fill="url(#e5-bday-tier3)" />
      <path d="M42 76c0-3 3-6 8-6h100c5 0 8 3 8 6" stroke="white" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      <path d="M50 52c0-4.5 3.8-8 9-8h82c5.2 0 9 3.5 9 8v26c0 5-4.3 9-9.5 9H59.5c-5.2 0-9.5-4-9.5-9V52z" fill="url(#e5-bday-tier2)" />
      <path d="M54 52c0-2.5 2.2-5 6-5h80c3.8 0 6 2.5 6 5" stroke="white" strokeOpacity="0.4" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M64 32c0-3.5 2.8-6 7-6h58c4.2 0 7 2.5 7 6v22c0 4-3.5 7-7.5 7h-57c-4 0-7.5-3-7.5-7V32z" fill="url(#e5-bday-tier1)" />
      <ellipse cx="100" cy="30" rx="34" ry="7" fill="url(#e5-bday-icing)" />
      <path d="M74 30c4 5 8 4 12 0s8-5 12-1 8 4 12 0 8-5 12-1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx="52" cy="88" r="3" fill="#fff" fillOpacity="0.55" />
      <circle cx="148" cy="92" r="2.5" fill="#fff" fillOpacity="0.5" />
      <circle cx="92" cy="62" r="2.5" fill="#fff" fillOpacity="0.45" />
      <circle cx="118" cy="58" r="2" fill="#fff" fillOpacity="0.5" />
      <circle cx="78" cy="42" r="2" fill="#fff" fillOpacity="0.4" />
      <line x1="82" y1="30" x2="82" y2="12" stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" />
      <line x1="100" y1="30" x2="100" y2="10" stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" />
      <line x1="118" y1="30" x2="118" y2="12" stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="82"  cy="8" rx="5"   ry="7"   fill="url(#e5-bday-flame)" opacity="0.95" />
      <ellipse cx="100" cy="6" rx="5.5" ry="8"   fill="url(#e5-bday-flame)" />
      <ellipse cx="118" cy="8" rx="5"   ry="7"   fill="url(#e5-bday-flame)" opacity="0.95" />
      <ellipse cx="82"  cy="9" rx="2"   ry="3"   fill="#fef9c3" opacity="0.9" />
      <ellipse cx="100" cy="7" rx="2.2" ry="3.2" fill="#fef9c3" />
      <ellipse cx="118" cy="9" rx="2"   ry="3"   fill="#fef9c3" opacity="0.9" />
      {showAge && (
        <text x="100" y="58" textAnchor="middle" dominantBaseline="middle" fill="#5b21b6" fontSize={ageFont} fontWeight="800" stroke="#fff" strokeWidth="1.4" paintOrder="stroke fill" style={{ fontFamily: "system-ui, Segoe UI, sans-serif" }}>
          {age}
        </text>
      )}
    </svg>
  );
}

function formatDateTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
function formatClock() {
  return new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/** Günün ürünü / modeli ile Takipsan sipariş kodu uyuşmuyorsa eski modelin paket verisini gösterme */
function currentProductMatchesTakipsan(
  meta: { productModel?: string; productName?: string } | null,
  orderCode: string,
  modelCodes: string[] = []
): boolean {
  const rawOc = orderCode.trim();
  if (!rawOc) return false;
  const orderParts = rawOc.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const norm = (s: string) => s.replace(/[^a-z0-9]/g, "");

  const matchesPart = (oc: string) => {
    const ocNorm = norm(oc);
    for (const raw of modelCodes) {
      const code = raw.trim().toLowerCase();
      if (!code) continue;
      const codeNorm = norm(code);
      if (oc.includes(code) || code.includes(oc) || (codeNorm && ocNorm.includes(codeNorm))) return true;
    }
    const pm = (meta?.productModel ?? "").trim().toLowerCase();
    const pn = (meta?.productName ?? "").trim().toLowerCase();
    if (pm && (oc.includes(pm) || pm.includes(oc) || ocNorm.includes(norm(pm)))) return true;
    if (pn) {
      const first = pn.split(/\s+/)[0] ?? "";
      if (first.length >= 3 && oc.includes(first)) return true;
    }
    return false;
  };

  if (orderParts.length === 0) return false;
  return orderParts.some((part) => matchesPart(part));
}

// ─── Stat kutu ───────────────────────────────────────────────────────────────
function StatBox({ label, value, style, subLabel }: { label: string; value: string; style: BoxStyle; subLabel?: string }) {
  return (
    <div className={`relative flex h-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 px-2 shadow-md ${style.box}`}>
      <p className={`shrink-0 font-black uppercase tracking-[0.12em] ${style.label}`}
        style={{ fontSize: "clamp(0.7rem, 1.4vw, 1.1rem)" }}>
        {label}
      </p>
      <p className={`w-full text-center font-black tabular-nums leading-none [text-shadow:0_1px_3px_rgba(0,0,0,0.15)] ${style.value}`}
        style={{ fontSize: "clamp(2rem, 5vw, 5rem)" }}>
        {value}
      </p>
      {subLabel && (
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-indigo-600 px-2 py-0.5 font-black tabular-nums uppercase tracking-wide text-white shadow-sm"
          style={{ fontSize: "clamp(0.8rem, 1.6vw, 1.25rem)" }}>
          {subLabel}
        </p>
      )}
    </div>
  );
}

// ─── Slayt paneli ────────────────────────────────────────────────────────────
function SlidePanel({
  slideKey, total, todayCount, target, koliCount, totalKoliCount,
}: { slideKey: SlideKey; total: number; todayCount: number; target: number; koliCount?: number; totalKoliCount?: number }) {
  const m = SLIDE_META[slideKey];
  const pct = calcUtuPaketPercent(total, target);
  const remaining = Math.max(0, target - total);
  const showKoli = slideKey === "paketleme" && koliCount != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      <div className="flex shrink-0 justify-center">
        <h2
          className={`rounded-2xl bg-gradient-to-r ${m.badgeCls} px-6 py-2.5 text-center font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-slate-900/20 ring-2 ring-white/20 min-[1920px]:px-10 min-[1920px]:py-3`}
          style={{ fontSize: "clamp(1rem, 2.8vw, 2.25rem)" }}>
          {m.label}
        </h2>
      </div>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 md:gap-6">
        <div
          className="relative h-14 flex-1 overflow-hidden rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200/90 p-[3px] shadow-[inset_0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-300/90 sm:h-16 md:h-[4.25rem] md:rounded-3xl md:p-1"
          role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="relative h-full overflow-hidden rounded-[0.75rem] bg-slate-300/50 md:rounded-[1.2rem]">
            <div
              className={`absolute inset-y-0 left-0 rounded-[0.65rem] bg-gradient-to-r ${m.barGradient} ${m.barGlow} transition-[width] duration-1000 ease-out md:rounded-[1.1rem]`}
              style={{ width: `${pct}%` }}>
              <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 justify-center sm:justify-end">
          <div className="flex min-w-[5.5rem] flex-col items-center rounded-2xl border-2 border-slate-800 bg-slate-900 px-4 py-2.5 shadow-lg ring-1 ring-slate-950/20 sm:min-w-[7.5rem] sm:px-6 sm:py-3 md:min-w-[9rem]">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">Oran</span>
            <span className="font-black tabular-nums leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]"
              style={{ fontSize: "clamp(2rem, 6vw, 4.25rem)" }}>
              %{pct.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5 [grid-auto-rows:minmax(0,1fr)] sm:grid-cols-4 sm:gap-3 md:gap-4">
        <StatBox label="Hedef"  value={target > 0 ? target.toLocaleString("tr-TR") : "—"}   style={m.targetStyle} />
        <StatBox
          label="Toplam"
          value={total.toLocaleString("tr-TR")}
          style={m.totalStyle}
          subLabel={showKoli && totalKoliCount != null && totalKoliCount > 0 ? `${totalKoliCount.toLocaleString("tr-TR")} koli` : undefined}
        />
        <StatBox
          label="Bugün"
          value={todayCount.toLocaleString("tr-TR")}
          style={m.todayStyle}
          subLabel={showKoli && koliCount! > 0 ? `${koliCount!.toLocaleString("tr-TR")} koli` : undefined}
        />
        <StatBox label="Kalan"  value={target > 0 ? remaining.toLocaleString("tr-TR") : "—"} style={m.remainStyle} />
      </div>
    </div>
  );
}

// ─── Hedef düzenleme modalı ──────────────────────────────────────────────────
function HedefModal({
  apiTarget,
  manualTarget,
  productLabel,
  onSave,
  onClear,
  onClose,
}: {
  apiTarget: number;
  manualTarget: number | null;
  productLabel: string;
  onSave: (v: number) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [input, setInput] = useState(
    manualTarget != null ? String(manualTarget) : apiTarget > 0 ? String(apiTarget) : ""
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSave() {
    const v = parseInt(input.replace(/\D/g, ""), 10);
    if (!Number.isFinite(v) || v <= 0) return;
    onSave(v);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-2xl">
        {/* Başlık */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">Hedef Ayarla</h3>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Model bilgisi */}
        {productLabel ? (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            {productLabel}
          </p>
        ) : null}

        {/* Kaynak göstergesi */}
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${manualTarget != null ? "bg-amber-400" : "bg-emerald-400"}`} />
          <span className="font-semibold text-slate-600">
            {manualTarget != null
              ? `El ile: ${manualTarget.toLocaleString("tr-TR")}`
              : apiTarget > 0
                ? `Modelden: ${apiTarget.toLocaleString("tr-TR")}`
                : "Model: veri yok"}
          </span>
        </div>

        {/* Input */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-bold text-slate-700">El ile hedef (adet)</label>
          <input
            ref={inputRef}
            type="number"
            min={1}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-2.5 text-center text-xl font-black tabular-nums text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30"
            placeholder="Örn: 23500"
          />
        </div>

        {/* Butonlar */}
        <div className="flex flex-col gap-2">
          <button type="button" onClick={handleSave}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-teal-700">
            Kaydet
          </button>
          <button type="button" onClick={onClear}
            className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100">
            Modelden al {apiTarget > 0 ? `(${apiTarget.toLocaleString("tr-TR")})` : ""}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border-2 border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
type Props = { dateIso?: string; embedded?: boolean };

export default function UtuPaketEkran5({ dateIso, embedded = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasToken, setHasToken]           = useState(false);
  const [displayDate, setDisplayDate]     = useState(dateIso || todayWeekdayIso());

  const [optikCount, setOptikCount]       = useState(0);
  const [optikTotal, setOptikTotal]       = useState(0);
  const [utuCount, setUtuCount]           = useState(0);
  const [utuTotal, setUtuTotal]           = useState(0);
  const [paketCount, setPaketCount]       = useState(0);
  const [gunPaketlenen, setGunPaketlenen] = useState(0);
  const [gunKoli, setGunKoli]             = useState(0);
  const [toplamKoli, setToplamKoli]       = useState(0);

  /** Model hedefi (target_quantity) — el ile hedef yoksa kullanılır */
  const [apiTarget, setApiTarget] = useState(0);
  /** Aktif model ID */
  const [modelId, setModelId]             = useState<number | null>(null);
  /** El ile set edilen hedef (null = model hedefi) */
  const [manualTarget, setManualTarget]   = useState<number | null>(null);
  /** Etkin hedef = el ile ?? model */
  const target = manualTarget != null && manualTarget > 0 ? manualTarget : apiTarget;

  const [productLabel, setProductLabel]   = useState("");
  const [lastUpdated, setLastUpdated]     = useState("");
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  const [slide, setSlide]                 = useState(0);
  const [slideProgress, setSlideProgress] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [hedefOpen, setHedefOpen]         = useState(false);

  // ── Doğum günü ──────────────────────────────────────────────────────────────
  const [birthdayToday, setBirthdayToday]               = useState<PersonnelBirthdayRow[]>([]);
  const [birthdayOverlayVisible, setBirthdayOverlayVisible] = useState(false);
  const [birthdaySlideIndex, setBirthdaySlideIndex]     = useState(0);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) { setHasToken(false); return; }
    setAuthToken(token);
    setHasToken(true);
  }, []);

  useEffect(() => { if (dateIso) setDisplayDate(dateIso); }, [dateIso]);

  const load = useCallback(async (silent = false) => {
    if (!hasToken) return;
    const date = dateIso || todayWeekdayIso();
    if (!silent) setLoading(true);
    setError(null);
    try {
      const date = dateIso || todayWeekdayIso();
      const rawInitial = await getUtuPaket(date).catch(() => null);
      const upm = rawInitial?.utuPaketModel ?? null;
      const mid = upm?.modelId ?? null;
      if (mid !== modelId) setModelId(mid);

      const modelDetail = mid ? await getProductModel(mid).catch(() => null) : null;

      if ((modelDetail?.primaryConsignmentId || modelDetail?.secondaryConsignmentId) && mid) {
        await syncTakipsan(date).catch(() => {});
      }

      const [raw, genelOzet, ekran5Res] = await Promise.all([
        getUtuPaket(date),
        getEkran1GenelIlerleme(date, mid ?? undefined).catch(() => null),
        mid ? getEkran5Target(mid).catch(() => ({ ekran5Target: null, targetQuantity: null })) : Promise.resolve({ ekran5Target: null, targetQuantity: null }),
      ]);

      const data = normalizeUtuPaketPayload({ ...raw, date });
      const meta = upm
        ? { productName: upm.productName, productModel: upm.productModel, modelId: upm.modelId }
        : null;
      const todayOptik = sumUtuPaketSlots(data.stages.optik);
      const todayUtu   = sumUtuPaketSlots(data.stages.utu);
      setDisplayDate(date);
      setOptikCount(todayOptik);
      setUtuCount(todayUtu);

      const modelCodes = [
        meta?.productModel ?? "",
        modelDetail?.modelCode ?? "",
        modelDetail?.takipsanOrderCode ?? "",
      ];
      const usesModelConsignment = Boolean(
        modelDetail?.primaryConsignmentId || modelDetail?.secondaryConsignmentId
      );
      const takipsanOk =
        (usesModelConsignment && Boolean(data.takipsan?.syncedAt)) ||
        currentProductMatchesTakipsan(meta, data.takipsan?.orderCode ?? "", modelCodes);
      if (takipsanOk) {
        setPaketCount(data.takipsan?.readCount ?? sumUtuPaketSlots(data.stages.paketleme));
        const gunPkt = sumGunPaketlenen(data.takipsan?.packages, date);
        setGunPaketlenen(gunPkt.adet);
        setGunKoli(gunPkt.paket);
        setToplamKoli(normalizeTakipsanPackages(data.takipsan?.packages).length);
      } else {
        setPaketCount(0);
        setGunPaketlenen(0);
        setGunKoli(0);
        setToplamKoli(0);
      }

      const modelHedef = ekran5Res.targetQuantity ?? 0;
      const genelHedef = genelOzet?.target ?? 0;
      const productionTarget = genelHedef > 0 ? genelHedef : modelHedef > 0 ? modelHedef : 0;
      setApiTarget(resolveUtuPaketLineTarget(data, productionTarget));
      setManualTarget(
        ekran5Res.ekran5Target != null && ekran5Res.ekran5Target > 0 ? ekran5Res.ekran5Target : null
      );
      setProductLabel([meta?.productName, meta?.productModel].filter(Boolean).join(" · "));

      // Modele özgü session başlangıcından bugüne analitik
      const startDate =
        modelDetail?.utuPaketSessionStartDate?.trim() ||
        genelOzet?.dataStartDate ||
        date;
      if (startDate && startDate <= date) {
        const analytics = await getUtuPaketAnalytics({ startDate, endDate: date }).catch(() => null);
        setOptikTotal(analytics?.periodTotals?.optik ?? todayOptik);
        setUtuTotal(analytics?.periodTotals?.utu ?? todayUtu);
      } else {
        setOptikTotal(todayOptik);
        setUtuTotal(todayUtu);
      }
      setLastUpdated(formatClock());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [hasToken, dateIso, modelId]);

  useEffect(() => {
    if (!hasToken) return;
    void load(false);
    const id = setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasToken, load]);

  /** Veri girişinde model/hedef değişince uzaktan yenile */
  useEffect(() => {
    if (!hasToken) return;
    let lastSignal = "";
    const checkSignal = async () => {
      const sig = await getEkranRefreshSignal().catch(() => "");
      if (!sig || sig === "0") return;
      if (lastSignal === "") { lastSignal = sig; return; }
      if (sig !== lastSignal) { lastSignal = sig; void load(true); }
    };
    void checkSignal();
    const id = setInterval(() => void checkSignal(), 6_000);
    return () => clearInterval(id);
  }, [hasToken, load]);

  // Slayt döngüsü
  useEffect(() => {
    setSlideProgress(0);
    let elapsed = 0;
    const TICK = 100;
    const ticker = setInterval(() => {
      elapsed += TICK;
      setSlideProgress(Math.min(100, (elapsed / SLIDE_DURATION_MS) * 100));
      if (elapsed >= SLIDE_DURATION_MS) {
        elapsed = 0;
        setTransitioning(true);
        setTimeout(() => {
          setSlide((s) => (s + 1) % SLIDE_COUNT);
          setSlideProgress(0);
          setTransitioning(false);
        }, 350);
      }
    }, TICK);
    return () => clearInterval(ticker);
  }, [slide]);

  // ── Doğum günü memos ────────────────────────────────────────────────────────
  const birthdayCelebration = useMemo(() => {
    if (birthdayToday.length === 0) return { title: "", people: [] as { id: number; fullName: string; age: number }[], dateLine: "" };
    const refIso = todayIsoTurkey();
    const people = birthdayToday
      .map((p) => ({ id: p.id, fullName: `${p.firstName} ${p.lastName}`.trim(), age: completedAgeAtReference(p.birthDate, refIso) }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "tr", { sensitivity: "base" }));
    const title = birthdayToday.length === 1 ? "DOĞUM GÜNÜN KUTLU OLSUN!" : "DOĞUM GÜNÜNÜZ KUTLU OLSUN!";
    const dateLine = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    return { title, people, dateLine };
  }, [birthdayToday]);

  const birthdayPeopleKey = useMemo(
    () => birthdayToday.length === 0 ? "" : birthdayToday.map((p) => p.id).sort((a, b) => a - b).join(","),
    [birthdayToday],
  );

  const birthdayFocusPerson = useMemo(() => {
    const list = birthdayCelebration.people;
    if (list.length === 0) return null;
    if (list.length === 1) return list[0]!;
    return list[birthdaySlideIndex % list.length]!;
  }, [birthdayCelebration.people, birthdaySlideIndex]);

  // ── Doğum günü effects ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasToken) return;
    const load = async () => { try { setBirthdayToday(await getPersonnelBirthdaysToday()); } catch { setBirthdayToday([]); } };
    void load();
    const id = setInterval(() => void load(), BDAY_FETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasToken]);

  useEffect(() => {
    if (!birthdayPeopleKey) { setBirthdayOverlayVisible(false); return; }
    const n = birthdayToday.length;
    const visibleMs = birthdayOverlayDurationMs(n);
    let hideId: ReturnType<typeof setTimeout> | undefined;
    const flash = () => {
      setBirthdayOverlayVisible(true);
      if (hideId) clearTimeout(hideId);
      hideId = setTimeout(() => setBirthdayOverlayVisible(false), visibleMs);
    };
    flash();
    const id = setInterval(flash, BDAY_OVERLAY_CYCLE_MS);
    return () => { clearInterval(id); if (hideId) clearTimeout(hideId); setBirthdayOverlayVisible(false); };
  }, [birthdayPeopleKey, birthdayToday.length]);

  useEffect(() => {
    if (!birthdayOverlayVisible || birthdayToday.length <= 1) return;
    const n = birthdayToday.length;
    setBirthdaySlideIndex(0);
    const totalMs = birthdayOverlayDurationMs(n);
    const stepMs = Math.max(1_200, Math.floor(totalMs / n));
    const id = setInterval(() => setBirthdaySlideIndex((i) => (i + 1) % n), stepMs);
    return () => clearInterval(id);
  }, [birthdayOverlayVisible, birthdayPeopleKey, birthdayToday.length]);

  // unused suppressor
  const _pct = useMemo(() => calcUtuPaketPercent(paketCount, target), [paketCount, target]);
  void _pct;

  async function handleHedefSave(v: number) {
    if (modelId) {
      await setEkran5Target(modelId, v).catch(() => {});
    }
    setManualTarget(v);
    setHedefOpen(false);
  }
  async function handleHedefClear() {
    if (modelId) {
      await setEkran5Target(modelId, null).catch(() => {});
    }
    setManualTarget(null);
    setHedefOpen(false);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else {
      const el = containerRef.current ?? document.documentElement;
      if (el.requestFullscreen) void el.requestFullscreen();
    }
  }
  function openTvWindow() {
    window.open(`${window.location.origin}/ekran5/icerik`, "ye tekstil utu paket", "popup=yes,width=1280,height=800");
  }

  const slideKey = SLIDES[slide];

  if (!hasToken) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-lg font-semibold text-slate-800">EKRAN 5</p>
        <p className="text-sm text-slate-600">Giriş yapın ve Ütü–Paket yetkisini açın.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`text-neutral-900 [color-scheme:light] ${
        embedded
          ? "relative flex min-h-[min(80vh,52rem)] flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-100 shadow-inner"
          : "fixed inset-0 flex flex-col overflow-hidden bg-slate-100"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 to-slate-100" />

      {/* ── DOĞUM GÜNÜ OVERLAY ── */}
      {birthdayOverlayVisible && birthdayToday.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/40 px-3 py-3 backdrop-blur-[3px] sm:px-5 sm:py-4">
          <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-br from-rose-900/25 via-slate-900/20 to-violet-900/20" />
            <div className="absolute inset-0 overflow-hidden">
              {BDAY_CONFETTI_SPECS.map((c, i) => (
                <span key={`e5-bday-confetti-${i}`}
                  className={`ekran1-bday-confetti-piece opacity-[0.92] ${i % 3 === 0 ? "rounded-full" : "rounded-sm"}`}
                  style={{ left: c.left, width: c.w, height: c.h, background: c.bg, animationDuration: c.dur, animationDelay: c.delay, ...({ "--ekran1-drift": c.drift } as CSSProperties) }}
                />
              ))}
            </div>
          </div>

          <div className="ekran1-bday-overlay-card relative z-10 flex h-[min(780px,calc(100dvh-1.25rem))] w-full max-w-[min(96vw,52rem)] flex-col overflow-hidden rounded-xl border-[3px] border-slate-600 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.14)_inset] sm:max-w-[58rem] md:max-w-[min(94vw,64rem)]"
            role="dialog" aria-modal="true" aria-live="polite" aria-label={`Doğum günü kutlaması — ${birthdayFocusPerson?.fullName ?? ""}`}>
            <div className="flex shrink-0 items-center gap-2 border-b-2 border-slate-500/90 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
              <span className="flex shrink-0 gap-1.5 sm:gap-2" aria-hidden>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm ring-1 ring-red-700/30 sm:h-3 sm:w-3" />
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 shadow-sm ring-1 ring-amber-700/30 sm:h-3 sm:w-3" />
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm ring-1 ring-emerald-800/25 sm:h-3 sm:w-3" />
              </span>
              <span className="min-w-0 flex-1 truncate text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 sm:text-[11px] sm:tracking-[0.18em]">
                Doğum Günü Kutlaması
              </span>
              <span className="inline-block w-12 shrink-0 sm:w-14" aria-hidden />
            </div>

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-b-[10px] bg-white text-center">
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-b-[10px]" aria-hidden>
                {BDAY_CONFETTI_SPECS.slice(0, 40).map((c, i) => (
                  <span key={`e5-bday-confetti-in-${i}`}
                    className={`ekran1-bday-confetti-piece opacity-[0.62] ${i % 3 === 0 ? "rounded-full" : "rounded-sm"}`}
                    style={{ left: c.left, width: Math.round(c.w * 0.72), height: Math.round(c.h * 0.72), background: c.bg, animationDuration: c.dur, animationDelay: c.delay, ...({ "--ekran1-drift": c.drift } as CSSProperties) }}
                  />
                ))}
              </div>

              <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="pointer-events-none shrink-0 h-1 bg-gradient-to-r from-violet-500 via-rose-500 to-amber-400" aria-hidden />
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 md:flex-row md:items-stretch md:gap-0 md:px-0 md:py-0">
                  <div className="-translate-y-[10px] flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 overflow-hidden py-2 text-center sm:gap-3.5 md:flex-[7] md:basis-0 md:border-r-2 md:border-slate-300 md:px-5 md:py-4">
                    <span className="mx-auto inline-flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-white shadow">
                      <svg className="h-4 w-4 shrink-0 text-white/95" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path d="m12 2 1.74 5.57h5.8l-4.7 3.61 1.82 5.62L12 15.73 7.34 17.8l1.82-5.62-4.7-3.61h5.8L12 2z" />
                      </svg>
                      Bugün
                    </span>
                    <div className="relative z-[3] mx-auto flex w-full max-w-md min-h-[8rem] shrink-0 items-center justify-center rounded-2xl bg-slate-100 px-2 py-2 sm:min-h-[9rem]">
                      <BirthdayCake age={birthdayFocusPerson?.age ?? null}
                        className="block aspect-[200/128] h-auto w-[min(240px,78vw)] min-h-[120px] min-w-[200px] max-h-[min(22vh,12rem)] max-w-full shrink-0 [overflow:visible]" />
                    </div>
                    <p className="shrink-0 text-center font-black uppercase leading-tight tracking-tight text-slate-900"
                      style={{ fontSize: "clamp(1.05rem, 4.2vmin, 2rem)" }}>
                      {birthdayCelebration.people.length === 1 ? birthdayCelebration.title : "DOĞUM GÜNÜN KUTLU OLSUN!"}
                    </p>
                    <p className="shrink-0 text-center font-bold capitalize leading-tight text-slate-600"
                      style={{ fontSize: "clamp(0.8rem, 2vmin, 1.1rem)" }}>
                      {birthdayCelebration.dateLine}
                    </p>
                    {birthdayFocusPerson ? (
                      <>
                        <p className="min-h-0 shrink text-center font-black leading-[1.06] text-slate-950 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]"
                          style={{ fontSize: "clamp(1.5rem, 6vmin, 3.25rem)" }}>
                          {birthdayFocusPerson.fullName}
                        </p>
                        {birthdayCelebration.people.length > 1 ? (
                          <div className="flex shrink-0 flex-col items-center gap-2" aria-hidden>
                            <div className="flex items-center gap-2.5">
                              {birthdayCelebration.people.map((p, i) => (
                                <span key={p.id} className={`rounded-full shadow-sm transition-all duration-300 ${i === birthdaySlideIndex % birthdayCelebration.people.length ? "h-3 w-3 scale-110 bg-teal-500 ring-2 ring-teal-700/35" : "h-2 w-2 bg-slate-300"}`} />
                              ))}
                            </div>
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                              {(birthdaySlideIndex % birthdayCelebration.people.length) + 1} / {birthdayCelebration.people.length}
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <footer className="flex w-full min-h-0 min-w-0 shrink-0 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-slate-300 bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 px-4 py-6 text-white shadow-lg sm:gap-3.5 sm:px-5 sm:py-7 md:flex-[3] md:basis-0 md:rounded-none md:border-0 md:shadow-none">
                    <h2 className="w-full text-balance text-center font-black uppercase leading-tight tracking-[0.14em] text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.25)]"
                      style={{ fontSize: "clamp(1rem, 2.8vmin, 1.85rem)" }}>
                      YEŞİL İMAJ TEKSTİL
                    </h2>
                    <p className="w-full text-balance text-center font-semibold leading-snug text-white/95"
                      style={{ fontSize: "clamp(0.95rem, 2.4vmin, 1.55rem)" }}>
                      Mutluluk, sağlık ve güzel yarınlar dileriz.
                    </p>
                  </footer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[min(100%,120rem)] flex-1 flex-col gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 md:gap-4 md:px-8 md:py-4 min-[1920px]:gap-4 min-[1920px]:px-10 min-[1920px]:py-5">

        {/* ── HEADER ── */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-300 bg-white px-5 py-3 shadow-md">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow">
              EKRAN 5
            </span>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-base font-extrabold text-neutral-950 md:text-lg">{formatDateTr(displayDate)}</p>
                {productLabel ? (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-300 md:text-sm">
                    {productLabel}
                  </span>
                ) : null}
                {/* Hedef kaynağı göstergesi */}
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${
                  manualTarget != null
                    ? "bg-amber-50 text-amber-700 ring-amber-300"
                    : apiTarget > 0
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-300"
                      : "bg-slate-100 text-slate-500 ring-slate-300"
                }`}>
                  {manualTarget != null ? "El ile hedef" : apiTarget > 0 ? "Model hedefi" : "Hedef yok"}
                </span>
              </div>
              {lastUpdated ? (
                <p className="text-[11px] font-semibold text-slate-700">
                  Son güncelleme {lastUpdated} · sayfa {slide + 1}/{SLIDE_COUNT} · 30 sn döngü
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {/* Hedef düzenle butonu */}
            <button type="button" onClick={() => setHedefOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              Hedef
            </button>
            {embedded ? (
              <button type="button" onClick={openTvWindow}
                className="rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-900 hover:bg-slate-200 sm:text-sm">
                TV penceresi
              </button>
            ) : null}
            <button type="button" onClick={() => void toggleFullscreen()}
              className="rounded-xl border-2 border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-200">
              Tam ekran
            </button>
          </div>
        </header>

        {/* Hata / yükleniyor */}
        {error ? (
          <p className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-600">{error}</p>
        ) : null}
        {loading && !lastUpdated ? (
          <div className="flex shrink-0 items-center justify-center gap-2 py-3 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            Yükleniyor…
          </div>
        ) : null}

        {/* ── SLAYT ── */}
        <div className={`flex min-h-0 flex-1 transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}>
          {slideKey === "paketleme" && (
            <SlidePanel slideKey="paketleme" total={paketCount}  todayCount={gunPaketlenen} target={target} koliCount={gunKoli} totalKoliCount={toplamKoli} />
          )}
          {slideKey === "optik" && (
            <SlidePanel slideKey="optik"     total={optikTotal}  todayCount={optikCount}    target={target} />
          )}
          {slideKey === "utu" && (
            <SlidePanel slideKey="utu"       total={utuTotal}    todayCount={utuCount}      target={target} />
          )}
        </div>

        {/* ── SLAYT GÖSTERGESİ ── */}
        <div className="shrink-0 pb-1">
          <div className="mx-auto mb-2 h-1 w-full max-w-sm overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-teal-500"
              style={{ width: `${slideProgress}%`, transition: "width 100ms linear" }} />
          </div>
          <div className="flex items-center justify-center gap-3">
            {SLIDES.map((key, i) => (
              <button key={key} type="button"
                onClick={() => { setSlide(i); setSlideProgress(0); }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-300 sm:text-xs ${
                  i === slide ? "bg-slate-900 text-white shadow-md" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${i === slide ? "bg-teal-400" : "bg-slate-400"}`} />
                {SLIDE_META[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── HEDEF MODALIN ── */}
      {hedefOpen && (
        <HedefModal
          apiTarget={apiTarget}
          manualTarget={manualTarget}
          productLabel={productLabel}
          onSave={handleHedefSave}
          onClear={handleHedefClear}
          onClose={() => setHedefOpen(false)}
        />
      )}
    </div>
  );
}
