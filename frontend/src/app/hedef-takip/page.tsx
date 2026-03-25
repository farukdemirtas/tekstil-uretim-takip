"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function calcPercent(count: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return clampPercent((count / target) * 100);
}

export default function HedefTakip() {
  const [target, setTarget] = useState<number>(5000);
  const [sagOn, setSagOn] = useState<number>(0);
  const [solOn, setSolOn] = useState<number>(0);
  const [yaka, setYaka] = useState<number>(0);
  const [arka, setArka] = useState<number>(0);
  const [bitim, setBitim] = useState<number>(0);
  const [prefilled, setPrefilled] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("hedef_takip_stage_totals_v1");
      if (!raw) return;
      setPrefilled(true);
      const parsed = JSON.parse(raw) as {
        sagOn?: number;
        solOn?: number;
        yaka?: number;
        arka?: number;
        bitim?: number;
      };

      setSagOn(Number(parsed.sagOn) || 0);
      setSolOn(Number(parsed.solOn) || 0);
      setYaka(Number(parsed.yaka) || 0);
      setArka(Number(parsed.arka) || 0);
      setBitim(Number(parsed.bitim) || 0);
    } catch {
      // ignore
    }
  }, []);

  const genelTamamlanan = useMemo(() => Math.min(sagOn, solOn, yaka, arka, bitim), [sagOn, solOn, yaka, arka, bitim]);
  const sagOnKalan = useMemo(() => Math.max(0, target - sagOn), [target, sagOn]);
  const solOnKalan = useMemo(() => Math.max(0, target - solOn), [target, solOn]);
  const yakaKalan = useMemo(() => Math.max(0, target - yaka), [target, yaka]);
  const arkaKalan = useMemo(() => Math.max(0, target - arka), [target, arka]);
  const bitimKalan = useMemo(() => Math.max(0, target - bitim), [target, bitim]);
  const genelKalan = useMemo(() => Math.max(0, target - genelTamamlanan), [target, genelTamamlanan]);

  const sagOnPercent = useMemo(() => calcPercent(sagOn, target), [sagOn, target]);
  const solOnPercent = useMemo(() => calcPercent(solOn, target), [solOn, target]);
  const yakaPercent = useMemo(() => calcPercent(yaka, target), [yaka, target]);
  const arkaPercent = useMemo(() => calcPercent(arka, target), [arka, target]);
  const bitimPercent = useMemo(() => calcPercent(bitim, target), [bitim, target]);
  const genelPercent = useMemo(() => calcPercent(genelTamamlanan, target), [genelTamamlanan, target]);

  function numberFromInput(value: string) {
    if (!value) return 0;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-4 md:p-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Hedef Takip</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Hedefe göre her aşamanın ilerlemesini ve genel ilerlemeyi anlık olarak takip edin.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Üretim Ekranına Dön
          </Link>
        </div>
        {!prefilled && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Aşamalar otomatik doldurulması için önce ana sayfadan <b>Hedef Takip</b> sekmesiyle giriş yapın.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
            <label className="text-sm font-medium">Toplam Hedef Adet</label>
            <input
              type="number"
              min={0}
              step={1}
              value={target}
              onChange={(e) => setTarget(numberFromInput(e.target.value))}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-400"
            />
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Örnek: 5000
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Genel Tamamlanan</span>
              <span className="text-sm font-semibold">{genelTamamlanan}</span>
            </div>
            <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">Genel ilerleme</div>
            <div className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{genelPercent.toFixed(1)}%</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProgressInput
          label="Sağ Ön"
          value={sagOn}
          percent={sagOnPercent}
          color="from-emerald-500 to-emerald-600"
          target={target}
          remaining={sagOnKalan}
        />
        <ProgressInput
          label="Sol Ön"
          value={solOn}
          percent={solOnPercent}
          color="from-sky-500 to-sky-600"
          target={target}
          remaining={solOnKalan}
        />
        <ProgressInput
          label="Yaka Hazırlık"
          value={yaka}
          percent={yakaPercent}
          color="from-violet-500 to-violet-600"
          target={target}
          remaining={yakaKalan}
        />
        <ProgressInput
          label="Arka Hazırlık"
          value={arka}
          percent={arkaPercent}
          color="from-amber-500 to-amber-600"
          target={target}
          remaining={arkaKalan}
        />
        <ProgressInput
          label="Bitim"
          value={bitim}
          percent={bitimPercent}
          color="from-rose-500 to-rose-600"
          target={target}
          remaining={bitimKalan}
        />

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Genel İlerleme</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Genel ilerleme = min(Sağ Ön, Sol Ön, Yaka, Arka, Bitim)</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 dark:text-slate-400">Yüzde</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">{genelPercent.toFixed(1)}%</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
                style={{ width: `${genelPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
            <span>
              Hedef: <span className="font-semibold text-slate-900 dark:text-slate-100">{target}</span>
            </span>
            <span>
              Tamamlanan: <span className="font-semibold text-slate-900 dark:text-slate-100">{genelTamamlanan}</span>
            </span>
            <span>
              Kalan: <span className="font-semibold text-slate-900 dark:text-slate-100">{genelKalan}</span>
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProgressInput({
  label,
  value,
  percent,
  color,
  target,
  remaining
}: {
  label: string;
  value: number;
  percent: number;
  color: string;
  target: number;
  remaining: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Yüzde: <span className="font-bold text-emerald-700 dark:text-emerald-300">{percent.toFixed(1)}%</span></div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400">Adet</div>
          <div className="mt-1">
            <input
              type="number"
              min={0}
              step={1}
              value={value}
              readOnly
              className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full ${color} bg-gradient-to-r`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
        Hedef: <span className="font-semibold text-slate-900 dark:text-slate-100">{target}</span>, Tamamlanan:{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>, Kalan:{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{remaining}</span>
      </div>
    </div>
  );
}

