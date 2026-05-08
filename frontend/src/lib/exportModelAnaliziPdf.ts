import type { JobCalcModelWorkerStatsResponse, ModelAnalysisProcessTotal, ModelAnalysisResponse } from "@/lib/api";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatIsoTrLong(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return escapeHtml(iso);
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return escapeHtml(iso);
  return escapeHtml(dt.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }));
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Math.round(n * 10) / 10;
  return `${v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function alignmentPct(genel: number, prosesSum: number): number | null {
  if (prosesSum <= 0) return null;
  return Math.min(999.9, (100 * genel) / prosesSum);
}

function processRowEfficiency(row: ModelAnalysisProcessTotal, report: ModelAnalysisResponse): number | null {
  const { completedGenelTotal, workDayCount } = report;
  if (workDayCount <= 0 || row.activeDays <= 0) return null;
  const lineAvg = completedGenelTotal / workDayCount;
  const stationAvg = row.adet / row.activeDays;
  if (lineAvg <= 0) return null;
  return (100 * stationAvg) / lineAvg;
}

export async function downloadModelAnaliziPdf(params: {
  report: ModelAnalysisResponse;
  teamLabels: Record<string, string>;
  modelTitle: string;
  effStats: JobCalcModelWorkerStatsResponse | null;
}): Promise<void> {
  const { report, teamLabels, modelTitle, effStats } = params;

  const title = modelTitle.trim() ? escapeHtml(modelTitle.trim()) : escapeHtml(report.modelCode);
  const codePart = report.modelCode ? ` <span style="color:#64748b;font-weight:500;">(${escapeHtml(report.modelCode)})</span>` : "";

  const periodAlignment = alignmentPct(report.completedGenelTotal, report.totalProsesAdetAllDays);
  const dayAligns =
    report.days.length > 0
      ? report.days
          .map((d) => alignmentPct(d.genelTamamlanan, d.totalProsesAdet))
          .filter((x): x is number => x != null)
      : [];
  const dailyAlignAvg =
    dayAligns.length > 0 ? dayAligns.reduce((a, b) => a + b, 0) / dayAligns.length : null;

  const avgDaily =
    report.workDayCount > 0 ? report.completedGenelTotal / report.workDayCount : null;

  const effLabel =
    effStats?.overallAvgEfficiencyPercent != null
      ? formatPct(effStats.overallAvgEfficiencyPercent)
      : "—";

  const stat = (label: string, value: string, sub?: string) => `
    <div style="background:linear-gradient(145deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
      <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${label}</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums;">${value}</div>
      ${sub ? `<div style="margin-top:4px;font-size:10px;color:#64748b;line-height:1.35;">${sub}</div>` : ""}
    </div>`;

  const dayRows = report.days
    .map((day) => {
      const ap = alignmentPct(day.genelTamamlanan, day.totalProsesAdet);
      const lines =
        day.lines.length === 0
          ? '<span style="color:#94a3b8;font-size:10px;">Proses satırı yok.</span>'
          : day.lines
              .map((ln) => {
                const dept = escapeHtml(teamLabels[ln.teamCode] ?? ln.teamCode);
                const proc = ln.processName ? ` · ${escapeHtml(ln.processName)}` : "";
                return `<div style="font-size:10px;color:#475569;padding:3px 0;border-bottom:1px solid #f1f5f9;">${dept}${proc} <span style="float:right;font-weight:600;color:#0f172a;">${ln.adet.toLocaleString("tr-TR")}</span></div>`;
              })
              .join("");
      return `<tr class="pdf-avoid-break">
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-weight:600;">${formatIsoTrLong(day.date)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#0f766e;">${day.genelTamamlanan.toLocaleString("tr-TR")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${formatPct(ap)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${lines}</td>
      </tr>`;
    })
    .join("");

  const procRows = report.processTotals
    .map((row) => {
      const eff = processRowEfficiency(row, report);
      return `<tr class="pdf-avoid-break">
        <td style="padding:9px 11px;border-bottom:1px solid #e2e8f0;">${escapeHtml(teamLabels[row.teamCode] ?? row.teamCode)}</td>
        <td style="padding:9px 11px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.processName || "—")}</td>
        <td style="padding:9px 11px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#0f766e;">${formatPct(eff)}</td>
        <td style="padding:9px 11px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.activeDays}</td>
        <td style="padding:9px 11px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${row.adet.toLocaleString("tr-TR")}</td>
      </tr>`;
    })
    .join("");

  const html = `
<div class="model-analiz-pdf-root" style="
  box-sizing:border-box;
  width:720px;
  padding:26px 28px 32px;
  font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans','Liberation Sans',sans-serif;
  font-size:12px;
  line-height:1.45;
  color:#0f172a;
  background:#ffffff;
  -webkit-font-smoothing:antialiased;
">
  <div style="background:linear-gradient(118deg,#0f766e 0%,#14b8a6 50%,#0d9488 100%);color:#fff;border-radius:14px;padding:20px 22px 22px;margin-bottom:20px;box-shadow:0 10px 36px -12px rgba(13,148,136,0.4);">
    <div style="font-size:9px;font-weight:700;opacity:0.92;letter-spacing:0.12em;">MODEL ANALİZİ</div>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.03em;">${title}${codePart}</h1>
    <p style="margin:8px 0 0;font-size:11px;opacity:0.95;">
      Dönem: ${formatIsoTrLong(report.startDate)} — ${formatIsoTrLong(report.endDate)}
    </p>
    <p style="margin:6px 0 0;font-size:11px;opacity:0.9;">Oluşturulma: ${escapeHtml(new Date().toLocaleString("tr-TR"))}</p>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
    ${stat("Kayıtlı iş günü", String(report.workDayCount))}
    ${stat(
      "Genel tamamlanan (toplam)",
      `${report.completedGenelTotal.toLocaleString("tr-TR")} <span style="font-size:11px;font-weight:600;color:#64748b;">adet</span>`
    )}
    ${stat(
      "Ortalama günlük üretim",
      avgDaily != null
        ? `${avgDaily.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 0 })} <span style="font-size:11px;font-weight:600;color:#64748b;">adet/gün</span>`
        : "—",
      "Genel tamamlanan ÷ iş günü"
    )}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
    ${stat("Ortalama personel verimliliği", effLabel, "Dönem / model (dk hedefi)")}
    ${stat(
      "Hat hizalaması (dönem)",
      formatPct(periodAlignment),
      `Günlük ortalama hizalama: ${formatPct(dailyAlignAvg)}`
    )}
  </div>

  <div style="border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:18px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
    <div style="background:linear-gradient(90deg,#334155,#475569);color:#fff;padding:10px 14px;font-size:11px;font-weight:700;">Gün bazında</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="text-align:left;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Tarih</th>
          <th style="text-align:right;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Genel</th>
          <th style="text-align:right;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Hizalama</th>
          <th style="text-align:left;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Proses satırları</th>
        </tr>
      </thead>
      <tbody>${dayRows || `<tr><td colspan="4" style="padding:16px;color:#94a3b8;">Bu dönemde kayıt yok.</td></tr>`}</tbody>
    </table>
  </div>
  <div style="border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
    <div style="background:linear-gradient(90deg,#0f766e,#0d9488);color:#fff;padding:10px 14px;font-size:11px;font-weight:700;">Proses özeti (dönem)</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="text-align:left;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Bölüm</th>
          <th style="text-align:left;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Proses</th>
          <th style="text-align:right;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Verimlilik</th>
          <th style="text-align:right;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">İş günü</th>
          <th style="text-align:right;padding:8px 11px;font-weight:700;border-bottom:2px solid #e2e8f0;">Toplam adet</th>
        </tr>
      </thead>
      <tbody>${procRows || `<tr><td colspan="5" style="padding:16px;color:#94a3b8;">Veri yok.</td></tr>`}</tbody>
    </table>
  </div>
  <p style="font-size:9px;color:#94a3b8;line-height:1.4;margin:0;">Hizalama: günlük genel tamamlanan ÷ aynı gün proses satır toplamı (%). Verimlilik (proses): istasyon günlük ortalaması ÷ model günlük ortalama genel üretim.</p>
</div>`.trim();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:720px;pointer-events:none;overflow:visible;";
  host.innerHTML = html;
  document.body.appendChild(host);
  const root = host.querySelector(".model-analiz-pdf-root") as HTMLElement;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const html2pdf = (await import("html2pdf.js")).default;
  const safeCode = report.modelCode.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 40) || "model";
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 12, 10],
        filename: `model-analizi-${safeCode}-${stamp}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false,
          backgroundColor: "#ffffff",
          scrollY: -window.scrollY,
          windowWidth: root?.scrollWidth ?? 720,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
        pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-avoid-break", "tr"] },
      })
      .from(root ?? host)
      .save();
  } finally {
    document.body.removeChild(host);
  }
}
