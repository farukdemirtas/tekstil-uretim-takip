import {
  UTU_PAKET_SIZE_CODES,
  UTU_PAKET_STAGE_META,
  UTU_PAKET_STAGES,
  type UtuPaketAnalytics,
  type UtuPaketDailyAnalytics,
} from "@/lib/utuPaket";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatIsoTrShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return escapeHtml(iso);
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return escapeHtml(iso);
  return escapeHtml(dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }));
}

function statCard(label: string, value: string, sub?: string): string {
  return `
    <div class="pdf-avoid-break" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;">
      <div style="font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">${label}</div>
      <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:3px;">${value}</div>
      ${sub ? `<div style="font-size:9px;color:#64748b;margin-top:3px;">${sub}</div>` : ""}
    </div>`;
}

export async function downloadUtuPaketAnaliziPdf(params: {
  data: UtuPaketAnalytics;
  dailyRows: UtuPaketDailyAnalytics[];
  rangeLabel: string;
  pipelineAvg: number;
}): Promise<void> {
  const { data, dailyRows, rangeLabel, pipelineAvg } = params;
  const now = new Date();
  const generatedAt = escapeHtml(
    now.toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  );

  const kpiCards = UTU_PAKET_STAGES.map(
    (st) =>
      statCard(
        UTU_PAKET_STAGE_META[st].label,
        `${(data.periodTotals[st] || 0).toLocaleString("tr-TR")} adet`,
        `Ort. gün: ${(data.avgDailyByStage[st] || 0).toLocaleString("tr-TR")}`
      )
  ).join("");

  const bedenBars = UTU_PAKET_SIZE_CODES.map((code) => {
    const v = data.bedenTotals[code] || 0;
    const max = Math.max(1, ...UTU_PAKET_SIZE_CODES.map((c) => data.bedenTotals[c] || 0));
    const pct = Math.round((v / max) * 100);
    return `
      <div class="pdf-avoid-break" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="width:28px;font-size:10px;font-weight:800;color:#047857;">${code}</div>
        <div style="flex:1;height:14px;background:#ecfdf5;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:#10b981;border-radius:4px;"></div>
        </div>
        <div style="width:48px;text-align:right;font-size:10px;font-weight:700;">${v.toLocaleString("tr-TR")}</div>
      </div>`;
  }).join("");

  const tableHead = `
    <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e2e8f0;">Tarih</th>
    ${UTU_PAKET_STAGES.map((st) => `<th style="text-align:right;padding:7px 8px;border-bottom:2px solid #e2e8f0;">${escapeHtml(UTU_PAKET_STAGE_META[st].label)}</th>`).join("")}
    <th style="text-align:right;padding:7px 8px;border-bottom:2px solid #e2e8f0;">Darboğaz</th>
    ${UTU_PAKET_SIZE_CODES.map((c) => `<th style="text-align:right;padding:7px 6px;border-bottom:2px solid #e2e8f0;">${c}</th>`).join("")}`;

  const tableRows = [...dailyRows]
    .reverse()
    .map(
      (row) => `
      <tr class="pdf-avoid-break">
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;">${formatIsoTrShort(row.date)}</td>
        ${UTU_PAKET_STAGES.map((st) => `<td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${(row.stages[st] || 0).toLocaleString("tr-TR")}</td>`).join("")}
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0d9488;">${row.pipelineMin > 0 ? row.pipelineMin.toLocaleString("tr-TR") : "—"}</td>
        ${UTU_PAKET_SIZE_CODES.map((c) => `<td style="padding:7px 6px;border-bottom:1px solid #e2e8f0;text-align:right;">${(row.beden[c] || 0).toLocaleString("tr-TR")}</td>`).join("")}
      </tr>`
    )
    .join("");

  const html = `
<div class="utu-paket-pdf-root" style="box-sizing:border-box;width:720px;padding:24px 26px 30px;font-family:system-ui,sans-serif;font-size:11px;color:#0f172a;background:#fff;">
  <div class="pdf-avoid-break" style="border-bottom:3px solid #0d9488;padding-bottom:12px;margin-bottom:16px;">
    <div style="font-size:9px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:0.08em;">Yeşil İmaj Tekstil · Ütü–Paket</div>
    <h1 style="margin:5px 0 0;font-size:20px;font-weight:800;">Ütü–Paket dönem analizi</h1>
    <p style="margin:6px 0 0;font-size:10px;color:#64748b;">Dönem: <strong>${escapeHtml(rangeLabel)}</strong></p>
    <p style="margin:3px 0 0;font-size:9px;color:#94a3b8;">PDF: ${generatedAt}</p>
  </div>

  <div class="pdf-avoid-break" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
    ${kpiCards}
    ${statCard("Ort. darboğaz", `${pipelineAvg.toLocaleString("tr-TR")} adet`, `${data.daysWithData} iş günü veri`)}
  </div>

  <div class="pdf-avoid-break" style="margin-bottom:14px;">
    <h2 style="margin:0 0 8px;font-size:12px;font-weight:800;">Dönem beden dağılımı</h2>
    ${bedenBars}
  </div>

  <div class="pdf-avoid-break">
    <h2 style="margin:0 0 8px;font-size:12px;font-weight:800;">Günlük özet (${dailyRows.length} gün)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:9px;">
      <thead><tr style="background:#f1f5f9;color:#475569;">${tableHead}</tr></thead>
      <tbody>${tableRows || `<tr><td colspan="9" style="padding:12px;color:#94a3b8;">Kayıt yok</td></tr>`}</tbody>
    </table>
  </div>
</div>`.trim();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:720px;pointer-events:none;";
  host.innerHTML = html;
  document.body.appendChild(host);
  const root = host.querySelector(".utu-paket-pdf-root") as HTMLElement;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const html2pdf = (await import("html2pdf.js")).default;
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  try {
    await html2pdf()
      .set({
        margin: [8, 8, 10, 8],
        filename: `utu-paket-analizi-${data.startDate}-${data.endDate}-${stamp}.pdf`,
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
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape", compress: true },
        pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-avoid-break", "tr"] },
      })
      .from(root ?? host)
      .save();
  } finally {
    document.body.removeChild(host);
  }
}
