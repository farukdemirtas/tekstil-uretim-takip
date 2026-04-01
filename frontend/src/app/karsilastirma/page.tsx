"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getWorkers, getWorkerComparison, setAuthToken } from "@/lib/api";
import { coerceWeekdayPickerValue, todayWeekdayIso } from "@/lib/businessCalendar";
import { hasPermission } from "@/lib/permissions";
import type { WorkerComparisonData, WorkerCompStat } from "@/lib/api";
import type { Worker } from "@/lib/types";

const TEAM_LABELS: Record<string, string> = {
  SAG_ON:        "Sağ Ön",
  SOL_ON:        "Sol Ön",
  YAKA_HAZIRLIK: "Yaka Hazırlık",
  ARKA_HAZIRLIK: "Arka Hazırlık",
  BITIM:         "Bitim",
  ADET:          "Adet",
};

const SLOTS = [
  { key: "t1000" as const, label: "10:00" },
  { key: "t1300" as const, label: "13:00" },
  { key: "t1600" as const, label: "16:00" },
  { key: "t1830" as const, label: "18:30" },
];

/* ── SVG Line Chart ── */
function LineChart({
  daily,
  w1Name,
  w2Name,
}: {
  daily: { date: string; w1: number; w2: number }[];
  w1Name: string;
  w2Name: string;
}) {
  if (daily.length < 2)
    return (
      <p className="text-sm text-slate-400">
        Grafik için en az 2 günlük veri gerekli.
      </p>
    );

  const W = 560, H = 180, PX = 44, PY = 20;
  const innerW = W - PX * 2;
  const innerH = H - PY * 2;
  const maxY = Math.max(...daily.map((d) => Math.max(d.w1, d.w2)), 1);

  const toX = (i: number) => PX + (i / (daily.length - 1)) * innerW;
  const toY = (v: number) => PY + (1 - v / maxY) * innerH;

  const pathD = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");

  /* show ~6 x-axis labels */
  const step = Math.max(1, Math.ceil(daily.length / 6));
  const labelIdxs = daily
    .map((_, i) => i)
    .filter((i) => i === 0 || i === daily.length - 1 || i % step === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 160 }}>
      {/* Gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={PX} x2={W - PX}
          y1={toY(maxY * pct)} y2={toY(maxY * pct)}
          stroke="#94a3b8" strokeOpacity={0.2} strokeWidth={1}
        />
      ))}
      {/* Y labels */}
      {[0, 0.5, 1].map((pct) => (
        <text
          key={pct}
          x={PX - 6} y={toY(maxY * pct) + 4}
          textAnchor="end" fontSize={9} fill="#94a3b8"
        >
          {Math.round(maxY * pct)}
        </text>
      ))}
      {/* Lines */}
      <path d={pathD(daily.map((d) => d.w1))} fill="none" stroke="#3b82f6" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathD(daily.map((d) => d.w2))} fill="none" stroke="#f97316" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {daily.map((d, i) => (
        <g key={d.date}>
          <circle cx={toX(i)} cy={toY(d.w1)} r={3} fill="#3b82f6" />
          <circle cx={toX(i)} cy={toY(d.w2)} r={3} fill="#f97316" />
        </g>
      ))}
      {/* X labels */}
      {labelIdxs.map((i) => (
        <text
          key={i}
          x={toX(i)} y={H - 4}
          textAnchor="middle" fontSize={9} fill="#94a3b8"
        >
          {daily[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

/* ── Worker summary card ── */
function WorkerCard({
  stat,
  color,
  label,
  isWinner,
}: {
  stat: WorkerCompStat;
  color: "blue" | "orange";
  label: string;
  isWinner: boolean;
}) {
  const blue = color === "blue";
  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 dark:bg-slate-800 ${
        blue ? "border-blue-400" : "border-orange-400"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`text-xs font-semibold ${
              blue ? "text-blue-500" : "text-orange-500"
            }`}
          >
            {label}
          </span>
          <p className="mt-0.5 truncate text-base font-bold">{stat.name}</p>
          <p className="truncate text-xs text-slate-500">
            {TEAM_LABELS[stat.team] ?? stat.team}
            {stat.process ? ` · ${stat.process}` : ""}
          </p>
        </div>
        {isWinner && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            🏆 Önde
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div
          className={`rounded-lg p-2 ${
            blue
              ? "bg-blue-50 dark:bg-blue-900/20"
              : "bg-orange-50 dark:bg-orange-900/20"
          }`}
        >
          <div
            className={`text-xl font-bold ${
              blue
                ? "text-blue-600 dark:text-blue-400"
                : "text-orange-500 dark:text-orange-400"
            }`}
          >
            {stat.total}
          </div>
          <div className="text-xs text-slate-500">Toplam</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700/50">
          <div className="text-xl font-bold">{stat.activeDays}</div>
          <div className="text-xs text-slate-500">Gün</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700/50">
          <div className="text-xl font-bold">
            {stat.activeDays > 0
              ? Math.round(stat.total / stat.activeDays)
              : 0}
          </div>
          <div className="text-xs text-slate-500">Ort/Gün</div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════ */
export default function KarsilastirmaPage() {
  const [isReady, setIsReady]   = useState(false);
  const [workers, setWorkers]   = useState<Worker[]>([]);
  const [w1Id, setW1Id]         = useState<number | null>(null);
  const [w2Id, setW2Id]         = useState<number | null>(null);
  const [startDate, setStartDate] = useState(todayWeekdayIso());
  const [endDate, setEndDate]     = useState(todayWeekdayIso());
  const [compData, setCompData]   = useState<WorkerComparisonData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [pdfBusy, setPdfBusy]     = useState(false);

  /* Auth guard + load worker list */
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token || !hasPermission("karsilastirma")) {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    setIsReady(true);
    getWorkers()
      .then((list) =>
        setWorkers([...list].sort((a, b) => a.name.localeCompare(b.name, "tr", { sensitivity: "base" })))
      )
      .catch(() => {});
  }, []);

  /* Fetch comparison whenever selection/dates change */
  const fetchData = useCallback(async () => {
    if (!w1Id || !w2Id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getWorkerComparison({
        worker1Id: w1Id,
        worker2Id: w2Id,
        startDate,
        endDate,
      });
      setCompData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı");
      setCompData(null);
    } finally {
      setLoading(false);
    }
  }, [w1Id, w2Id, startDate, endDate]);

  useEffect(() => {
    if (isReady && w1Id && w2Id) void fetchData();
  }, [isReady, fetchData]);

  /* ── PDF Export ── */
  async function exportToPDF() {
    if (!w1 || !w2) return;
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable  = (await import("jspdf-autotable")).default;

      /* Turkish character normalizer (helvetica font, latin-1 safe) */
      const p = (s: string) =>
        s.replace(/ğ/g,"g").replace(/Ğ/g,"G")
         .replace(/ş/g,"s").replace(/Ş/g,"S")
         .replace(/ç/g,"c").replace(/Ç/g,"C")
         .replace(/ö/g,"o").replace(/Ö/g,"O")
         .replace(/ü/g,"u").replace(/Ü/g,"U")
         .replace(/ı/g,"i").replace(/İ/g,"I");

      const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW    = 210;
      const MAR   = 14;
      const CW    = PW - MAR * 2;               // 182 mm

      const f  = (r:number,g:number,b:number) => doc.setFillColor(r,g,b);
      const d  = (r:number,g:number,b:number) => doc.setDrawColor(r,g,b);
      const t  = (r:number,g:number,b:number) => doc.setTextColor(r,g,b);

      let y = 0;

      /* ━━━━ HEADER ━━━━ */
      f(30,41,59); doc.rect(0,0,PW,22,"F");
      doc.setFontSize(13); doc.setFont("helvetica","bold"); t(255,255,255);
      doc.text("Personel Karsilastirma Raporu", MAR, 14);
      doc.setFontSize(8); doc.setFont("helvetica","normal");
      doc.text(`${startDate} - ${endDate}`, PW-MAR, 9, { align:"right" });
      doc.text(`Olusturulma: ${new Date().toLocaleString("tr-TR")}`, PW-MAR, 14, { align:"right" });
      y = 28;

      /* ━━━━ WORKER CARDS ━━━━ */
      const BW = (CW - 6) / 2;

      const drawBox = (stat: WorkerCompStat, bx: number, color:[number,number,number], lbl:string, winner:boolean) => {
        f(...color); doc.rect(bx,y,BW,3,"F");
        f(249,250,251); doc.rect(bx,y+3,BW,42,"F");
        d(210,215,225); doc.rect(bx,y,BW,45,"S");

        t(...color); doc.setFontSize(7); doc.setFont("helvetica","bold");
        doc.text(lbl, bx+4, y+9);

        if (winner) {
          f(16,185,129); doc.roundedRect(bx+BW-24,y+5.5,22,5.5,1.5,1.5,"F");
          t(255,255,255); doc.setFontSize(6);
          doc.text("ONDE", bx+BW-13, y+9.5, { align:"center" });
        }

        t(30,41,59); doc.setFontSize(10); doc.setFont("helvetica","bold");
        doc.text(p(stat.name), bx+4, y+18, { maxWidth: BW-8 });

        t(100,116,139); doc.setFontSize(7); doc.setFont("helvetica","normal");
        doc.text(`${p(TEAM_LABELS[stat.team]??stat.team)} · ${p(stat.process)}`, bx+4, y+24, { maxWidth: BW-8 });

        const stats = [stat.total, stat.activeDays, stat.activeDays>0 ? Math.round(stat.total/stat.activeDays) : 0];
        const stlbls = ["Toplam","Gun","Ort/Gun"];
        const sw = (BW-8)/3;
        stats.forEach((v,i) => {
          const sx = bx+4+i*sw;
          f(Math.min(255,color[0]+160), Math.min(255,color[1]+120), Math.min(255,color[2]+100));
          doc.rect(sx, y+29, sw-1, 13, "F");
          t(...color); doc.setFontSize(10); doc.setFont("helvetica","bold");
          doc.text(String(v), sx+(sw-1)/2, y+37, { align:"center" });
          t(120,130,145); doc.setFontSize(6); doc.setFont("helvetica","normal");
          doc.text(stlbls[i], sx+(sw-1)/2, y+41, { align:"center" });
        });
      };

      drawBox(w1, MAR,     [59,130,246], "PERSONEL 1", w1.total >= w2.total);
      drawBox(w2, MAR+BW+6, [249,115,22], "PERSONEL 2", w2.total > w1.total);
      y += 51;

      /* ━━━━ OVERALL BAR ━━━━ */
      t(30,41,59); doc.setFontSize(9); doc.setFont("helvetica","bold");
      doc.text("Genel Uretim Karsilastirmasi", MAR, y+5); y += 8;

      const barX  = MAR+14;
      const barW  = CW-28;
      const p1pct = w1.total / ((w1.total+w2.total)||1);

      t(59,130,246); doc.setFontSize(9); doc.setFont("helvetica","bold");
      doc.text(String(w1.total), MAR+12, y+5, { align:"right" });

      f(241,245,249); doc.rect(barX,y,barW,8,"F");
      f(59,130,246);  doc.rect(barX,y,barW*p1pct,8,"F");
      f(249,115,22);  doc.rect(barX+barW*p1pct,y,barW*(1-p1pct),8,"F");
      d(200,210,220); doc.rect(barX,y,barW,8,"S");

      t(249,115,22); doc.text(String(w2.total), barX+barW+2, y+5);

      y += 10;
      t(59,130,246); doc.setFontSize(7.5); doc.setFont("helvetica","normal");
      doc.text(`%${Math.round(p1pct*100)}`, barX+2, y);
      t(249,115,22);
      doc.text(`%${Math.round((1-p1pct)*100)}`, barX+barW-2, y, { align:"right" });
      if (w1.total !== w2.total) {
        const winner = w1.total > w2.total ? w1 : w2;
        t(100,116,139);
        doc.text(`${p(winner.name)} onde - ${Math.abs(w1.total-w2.total)} adet fark`, PW/2, y, { align:"center" });
      }
      y += 8;

      /* ━━━━ HOURLY SLOTS ━━━━ */
      t(30,41,59); doc.setFontSize(9); doc.setFont("helvetica","bold");
      doc.text("Saat Dilimine Gore Karsilastirma", MAR, y); y += 5;

      const slotBarW = (CW-34)/2;
      const slotX    = MAR+11;
      const slotsData = [
        { label:"10:00", v1:w1.t1000, v2:w2.t1000 },
        { label:"13:00", v1:w1.t1300, v2:w2.t1300 },
        { label:"16:00", v1:w1.t1600, v2:w2.t1600 },
        { label:"18:30", v1:w1.t1830, v2:w2.t1830 },
      ];

      for (const slot of slotsData) {
        const mx = Math.max(slot.v1, slot.v2, 1);

        t(50,65,80); doc.setFontSize(8); doc.setFont("helvetica","bold");
        doc.text(slot.label, MAR, y+3.5);

        // P1
        f(219,234,254); doc.rect(slotX,y,slotBarW,4,"F");
        f(59,130,246);  doc.rect(slotX,y,(slotBarW)*(slot.v1/mx),4,"F");
        t(59,130,246); doc.setFontSize(7.5); doc.setFont("helvetica","normal");
        doc.text(String(slot.v1), slotX+slotBarW+1, y+3.5);

        // P2
        const p2x = slotX+slotBarW+10;
        f(255,237,213); doc.rect(p2x,y,slotBarW,4,"F");
        f(249,115,22);  doc.rect(p2x,y,(slotBarW)*(slot.v2/mx),4,"F");
        t(249,115,22); doc.text(String(slot.v2), p2x+slotBarW+1, y+3.5);

        // Diff
        const diff = slot.v1 - slot.v2;
        if (diff>0) t(16,185,129); else if (diff<0) t(239,68,68); else t(150,150,150);
        doc.setFont("helvetica","bold");
        doc.text(diff>0?`+${diff}`:diff===0?"=":String(diff), PW-MAR, y+3.5, { align:"right" });
        y += 7;
      }
      y += 5;

      /* ━━━━ LINE CHART ━━━━ */
      if (daily.length >= 2) {
        if (y > 195) { doc.addPage(); y = MAR; }

        t(30,41,59); doc.setFontSize(9); doc.setFont("helvetica","bold");
        doc.text("Gunluk Uretim Trendi", MAR, y);
        // legend
        f(59,130,246);  doc.rect(PW-MAR-50,y-3.5,6,3,"F");
        t(59,130,246); doc.setFontSize(7); doc.setFont("helvetica","normal");
        doc.text(p(w1.name), PW-MAR-43, y);
        f(249,115,22); doc.rect(PW-MAR-20,y-3.5,6,3,"F");
        t(249,115,22); doc.text(p(w2.name), PW-MAR-13, y);
        y += 4;

        const CX = MAR+10, CY = y, CH = 46, CWIDTH = CW-12;
        f(248,250,252); doc.rect(CX,CY,CWIDTH,CH,"F");
        d(220,225,230); doc.rect(CX,CY,CWIDTH,CH,"S");

        const maxYc = Math.max(...daily.map((dd)=>Math.max(dd.w1,dd.w2)),1);
        doc.setLineWidth(0.2); d(220,225,230);
        [0.25,0.5,0.75].forEach((pct) => {
          const gy = CY + CH - pct*CH;
          doc.line(CX,gy,CX+CWIDTH,gy);
        });
        const cx = (i:number) => CX + (i/(daily.length-1))*CWIDTH;
        const cy = (v:number) => CY + CH - (v/maxYc)*CH;

        doc.setLineWidth(0.7);
        d(59,130,246);
        for (let i=1;i<daily.length;i++) doc.line(cx(i-1),cy(daily[i-1].w1),cx(i),cy(daily[i].w1));
        d(249,115,22);
        for (let i=1;i<daily.length;i++) doc.line(cx(i-1),cy(daily[i-1].w2),cx(i),cy(daily[i].w2));

        t(120,130,145); doc.setFontSize(6); doc.setFont("helvetica","normal");
        const step = Math.max(1, Math.ceil(daily.length/5));
        daily.forEach((dd,i) => {
          if (i===0||i===daily.length-1||i%step===0)
            doc.text(dd.date.slice(5), cx(i), CY+CH+4, { align:"center" });
        });
        t(120,130,145);
        doc.text(String(maxYc), CX-1, CY+4, { align:"right" });
        doc.text("0", CX-1, CY+CH, { align:"right" });
        y = CY+CH+12;
      }

      /* ━━━━ DIFF TABLE ━━━━ */
      if (y > 228) { doc.addPage(); y = MAR; }

      t(30,41,59); doc.setFontSize(9); doc.setFont("helvetica","bold");
      doc.text("Detayli Fark Tablosu", MAR, y); y += 3;

      autoTable(doc, {
        startY: y,
        head: [["Saat", p(w1.name), p(w2.name), "Fark", "Once"]],
        body: [
          ...SLOTS.map(({key,label}) => {
            const v1=w1[key], v2=w2[key], diff=v1-v2;
            return [label, String(v1), String(v2),
              diff>0?`+${diff}`:String(diff),
              diff>0?p(w1.name):diff<0?p(w2.name):"-"];
          }),
          ["TOPLAM", String(w1.total), String(w2.total),
            w1.total-w2.total>0?`+${w1.total-w2.total}`:String(w1.total-w2.total),
            w1.total>w2.total?p(w1.name):w2.total>w1.total?p(w2.name):"Berabere"],
        ],
        styles: { fontSize:8.5, cellPadding:3 },
        headStyles: { fillColor:[30,41,59], textColor:[255,255,255], fontStyle:"bold" },
        columnStyles: {
          1: { textColor:[59,130,246], fontStyle:"bold" },
          2: { textColor:[249,115,22], fontStyle:"bold" },
        },
        didParseCell: (data) => {
          if (data.column.index===3 && data.section==="body") {
            const v = String(data.cell.raw??"");
            if (v.startsWith("+")) data.cell.styles.textColor=[16,185,129];
            else if (v.startsWith("-")) data.cell.styles.textColor=[239,68,68];
          }
          if (data.row.index === SLOTS.length) {
            data.cell.styles.fontStyle="bold";
            data.cell.styles.fillColor=[241,245,249];
          }
        },
        margin: { left:MAR, right:MAR },
      });

      /* ━━━━ FOOTER ━━━━ */
      const pages = (doc as unknown as { internal: { getNumberOfPages:()=>number } }).internal.getNumberOfPages();
      for (let i=1;i<=pages;i++) {
        doc.setPage(i); t(180,180,180); doc.setFontSize(7);
        doc.text(`Sayfa ${i} / ${pages}`, PW/2, 292, { align:"center" });
      }

      const fname = `karsilastirma_${p(w1.name).replace(/\s+/g,"_")}_${p(w2.name).replace(/\s+/g,"_")}_${startDate}_${endDate}.pdf`;
      doc.save(fname);
    } finally {
      setPdfBusy(false);
    }
  }

  /* Derived */
  const w1 = compData?.worker1 ?? null;
  const w2 = compData?.worker2 ?? null;
  const daily = compData?.daily ?? [];
  const bothTotal = (w1?.total ?? 0) + (w2?.total ?? 0) || 1;

  const pct1 = Math.round(((w1?.total ?? 0) / bothTotal) * 100);
  const pct2 = 100 - pct1;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Personel Karşılaştırma
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              İki personelin üretim performansını yan yana karşılaştırın
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {w1 && w2 && (
              <button
                onClick={() => void exportToPDF()}
                disabled={pdfBusy || loading}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {pdfBusy ? "PDF hazırlanıyor..." : "⬇ PDF İndir"}
              </button>
            )}
            <Link
              href="/"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              ← Ana Sayfa
            </Link>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Worker 1 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-blue-600 dark:text-blue-400">
                Personel 1 — Mavi
              </label>
              <select
                value={w1Id ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value) || null;
                  if (v !== null && v === w2Id) return;
                  setW1Id(v);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">Seçiniz...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.id === w2Id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Worker 2 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-orange-500 dark:text-orange-400">
                Personel 2 — Turuncu
              </label>
              <select
                value={w2Id ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value) || null;
                  if (v !== null && v === w1Id) return;
                  setW2Id(v);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">Seçiniz...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.id === w1Id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Başlangıç Tarihi
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(coerceWeekdayPickerValue(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>

            {/* End date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Bitiş Tarihi
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(coerceWeekdayPickerValue(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>
          </div>
        </section>

        {/* ── Placeholder when nothing selected ── */}
        {(!w1Id || !w2Id) && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-600 dark:bg-slate-800">
            <span className="text-5xl">👥</span>
            <p className="mt-3 text-slate-500 dark:text-slate-400">
              Karşılaştırma için iki personel seçin
            </p>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 dark:border-slate-700 dark:bg-slate-800">
            <span className="text-slate-400">Veriler yükleniyor...</span>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ══════════ COMPARISON CONTENT ══════════ */}
        {!loading && !error && w1 && w2 && (
          <>
            {/* ── Worker cards ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <WorkerCard stat={w1} color="blue"   label="PERSONEL 1" isWinner={w1.total >= w2.total} />
              <WorkerCard stat={w2} color="orange" label="PERSONEL 2" isWinner={w2.total > w1.total} />
            </div>

            {/* ── Overall comparison bar ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Genel Üretim Karşılaştırması
              </h2>
              <div className="flex items-center gap-3">
                <div className="w-16 text-right">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {w1.total}
                  </span>
                </div>
                <div className="relative flex h-9 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full bg-blue-500 transition-all duration-700"
                    style={{ width: `${pct1}%` }}
                  />
                  <div className="h-full flex-1 bg-orange-400" />
                  {/* Centre divider */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                      vs
                    </span>
                  </div>
                </div>
                <div className="w-16">
                  <span className="text-lg font-bold text-orange-500 dark:text-orange-400">
                    {w2.total}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 flex justify-between px-[4.5rem] text-xs font-medium text-slate-500">
                <span className="text-blue-500">%{pct1}</span>
                <span className="text-orange-400">%{pct2}</span>
              </div>

              {/* Fark */}
              <div className="mt-3 flex justify-center">
                {w1.total !== w2.total ? (
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      w1.total > w2.total
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                    }`}
                  >
                    {w1.total > w2.total ? w1.name : w2.name} önde —{" "}
                    {Math.abs(w1.total - w2.total)} adet fark
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500 dark:bg-slate-700">
                    Berabere!
                  </span>
                )}
              </div>
            </section>

            {/* ── Hourly slot comparison ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Saat Dilimine Göre Karşılaştırma
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {SLOTS.map(({ key, label }) => {
                  const v1 = w1[key];
                  const v2 = w2[key];
                  const mx = Math.max(v1, v2, 1);
                  const diff = v1 - v2;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-slate-100 p-3 dark:border-slate-700"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {label}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            diff > 0
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : diff < 0
                              ? "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400"
                              : "text-slate-400"
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff === 0 ? "Eşit" : diff}
                        </span>
                      </div>

                      {/* P1 bar */}
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="w-3 text-[10px] font-bold text-blue-500">1</span>
                        <div
                          className="flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-700"
                          style={{ height: 14 }}
                        >
                          <div
                            className="rounded-sm bg-blue-500 transition-all duration-500"
                            style={{ width: `${(v1 / mx) * 100}%`, height: 14 }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold">{v1}</span>
                      </div>

                      {/* P2 bar */}
                      <div className="flex items-center gap-2">
                        <span className="w-3 text-[10px] font-bold text-orange-500">2</span>
                        <div
                          className="flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-700"
                          style={{ height: 14 }}
                        >
                          <div
                            className="rounded-sm bg-orange-400 transition-all duration-500"
                            style={{ width: `${(v2 / mx) * 100}%`, height: 14 }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold">{v2}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Daily trend chart ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Günlük Üretim Trendi
                </h2>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-5 rounded bg-blue-500" />
                    {w1.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-5 rounded bg-orange-400" />
                    {w2.name}
                  </span>
                </div>
              </div>
              {daily.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Seçilen tarih aralığında üretim verisi bulunamadı.
                </p>
              ) : (
                <LineChart daily={daily} w1Name={w1.name} w2Name={w2.name} />
              )}
            </section>

            {/* ── Detailed diff table ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Detaylı Fark Tablosu
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500 dark:border-slate-700">
                      <th className="pb-2 text-left font-medium">Saat</th>
                      <th className="pb-2 text-right font-medium text-blue-500">{w1.name}</th>
                      <th className="pb-2 text-right font-medium text-orange-500">{w2.name}</th>
                      <th className="pb-2 text-right font-medium">Fark</th>
                      <th className="pb-2 text-right font-medium">Önde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {SLOTS.map(({ key, label }) => {
                      const v1 = w1[key];
                      const v2 = w2[key];
                      const diff = v1 - v2;
                      return (
                        <tr key={key}>
                          <td className="py-2 font-medium">{label}</td>
                          <td className="py-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                            {v1}
                          </td>
                          <td className="py-2 text-right font-semibold text-orange-500 dark:text-orange-400">
                            {v2}
                          </td>
                          <td
                            className={`py-2 text-right font-bold ${
                              diff > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : diff < 0
                                ? "text-red-500 dark:text-red-400"
                                : "text-slate-400"
                            }`}
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                          <td className="py-2 text-right text-xs">
                            {diff > 0 ? (
                              <span className="text-blue-500">● {w1.name}</span>
                            ) : diff < 0 ? (
                              <span className="text-orange-500">● {w2.name}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr className="border-t-2 border-slate-200 dark:border-slate-600">
                      <td className="pt-2 font-bold">Toplam</td>
                      <td className="pt-2 text-right font-bold text-blue-600 dark:text-blue-400">
                        {w1.total}
                      </td>
                      <td className="pt-2 text-right font-bold text-orange-500 dark:text-orange-400">
                        {w2.total}
                      </td>
                      <td
                        className={`pt-2 text-right font-bold ${
                          w1.total - w2.total > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : w1.total - w2.total < 0
                            ? "text-red-500 dark:text-red-400"
                            : "text-slate-400"
                        }`}
                      >
                        {w1.total - w2.total > 0
                          ? `+${w1.total - w2.total}`
                          : w1.total - w2.total}
                      </td>
                      <td className="pt-2 text-right text-xs">
                        {w1.total > w2.total ? (
                          <span className="font-semibold text-blue-500">🏆 {w1.name}</span>
                        ) : w2.total > w1.total ? (
                          <span className="font-semibold text-orange-500">🏆 {w2.name}</span>
                        ) : (
                          <span className="text-slate-400">Berabere</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
