import type { JobCompletionResult } from "@/lib/jobCompletionCalc";
import { formatHoursHuman } from "@/lib/jobCompletionCalc";

type SplitDays = { fullDays: number; remainderHours: number; hoursPerWorkday: number };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** PDF şablonunda metin güvenliği + satır sonları */
function safeText(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br/>");
}

export async function downloadIsBitirmeHesaplamaPdf(params: {
  result: JobCompletionResult;
  split: SplitDays;
  splitSeq: SplitDays;
  modelCode: string;
  productName: string;
  quantityLabel: string;
  referenceDate: string;
  hoursPerDayLabel: string;
}): Promise<void> {
  const {
    result,
    split,
    splitSeq,
    modelCode,
    productName,
    quantityLabel,
    referenceDate,
    hoursPerDayLabel,
  } = params;

  const lineTp = Math.round(result.lineThroughputPerHour * 100) / 100;
  const bnLabel = result.bottleneckProcessKey ? escapeHtml(result.bottleneckProcessKey) : "—";
  const modelTitle = productName.trim()
    ? `${escapeHtml(productName.trim())} <span style="color:#64748b;font-weight:500;">(${escapeHtml(modelCode)})</span>`
    : escapeHtml(modelCode);

  const statCard = (
    label: string,
    value: string,
    sub?: string
  ) => `
    <div style="background:linear-gradient(145deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
      <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${label}</div>
      <div style="font-size:19px;font-weight:700;color:#0f172a;line-height:1.25;letter-spacing:-0.02em;font-family:inherit;">${value}</div>
      ${sub ? `<div style="margin-top:6px;font-size:11px;color:#64748b;line-height:1.4;">${sub}</div>` : ""}
    </div>`;

  const tableRows = result.processes
    .map((proc) => {
      const hoursOnly = result.quantity / proc.totalRatePerHour;
      const isBn = proc.processKey === result.bottleneckProcessKey;
      const workers = proc.lines
        .map((l) => `${escapeHtml(l.workerName.trim() || "—")} <span style="color:#64748b;">(${l.ratePerHour}/sa)</span>`)
        .join(" · ");
      const bg = isBn ? "background:#ecfdf5;border-left:4px solid #0d9488;" : "border-left:4px solid transparent;";
      return `<tr class="pdf-avoid-break" style="${bg}">
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-weight:600;color:#0f172a;">
          ${escapeHtml(proc.processKey)}
          ${isBn ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#0d9488;color:white;font-size:9px;font-weight:700;letter-spacing:0.04em;">DARBOĞAZ</span>` : ""}
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#334155;">${Math.round(proc.totalRatePerHour * 100) / 100}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#334155;">${hoursOnly.toFixed(2)}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;line-height:1.45;color:#475569;">${workers || "—"}</td>
      </tr>`;
    })
    .join("");

  const html = `
<div class="is-bitirme-pdf-root" style="
  box-sizing:border-box;
  width:720px;
  padding:28px 32px 36px;
  font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans','Liberation Sans',sans-serif;
  font-size:13px;
  line-height:1.5;
  color:#0f172a;
  background:#ffffff;
  -webkit-font-smoothing:antialiased;
">
  <div style="background:linear-gradient(118deg,#0f766e 0%,#14b8a6 48%,#0d9488 100%);color:#ffffff;border-radius:16px;padding:22px 26px 24px;margin-bottom:24px;box-shadow:0 10px 40px -12px rgba(13,148,136,0.45);">
    <div style="font-size:10px;font-weight:700;opacity:0.92;letter-spacing:0.14em;">İŞ HESAPLAMA</div>
    <h1 style="margin:10px 0 0;font-size:24px;font-weight:800;letter-spacing:-0.03em;line-height:1.2;">Sonuç raporu</h1>
    <p style="margin:10px 0 0;font-size:12px;opacity:0.94;">Oluşturulma: ${escapeHtml(new Date().toLocaleString("tr-TR"))}</p>
  </div>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;margin-bottom:22px;">
    <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:12px;">Girdiler</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;font-size:12px;color:#334155;">
      <div><span style="color:#64748b;">Model</span><br/><span style="font-weight:600;color:#0f172a;">${modelTitle}</span></div>
      <div><span style="color:#64748b;">Hedef adet (Q)</span><br/><span style="font-weight:600;font-variant-numeric:tabular-nums;">${safeText(quantityLabel)}</span></div>
      <div><span style="color:#64748b;">Üretim ve verim tarihi</span><br/><span style="font-weight:600;font-variant-numeric:tabular-nums;">${escapeHtml(referenceDate)}</span></div>
      <div><span style="color:#64748b;">Gün başına çalışma</span><br/><span style="font-weight:600;">${safeText(hoursPerDayLabel)} saat</span></div>
    </div>
  </div>

  <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.07em;margin:0 0 14px;">Özet — darboğaz modeli</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px;">
    ${statCard(
      "Hat hızı (tahmini)",
      `${lineTp} <span style="font-size:14px;font-weight:600;color:#64748b;">adet/saat</span>`,
      "Sürekli hat: min. proses verimi"
    )}
    ${statCard(
      "Darboğaz proses",
      bnLabel,
      "Darboğaz, üretim hızını sınırlayan aşama"
    )}
    ${statCard(
      "Toplam süre",
      `${escapeHtml(formatHoursHuman(result.totalHoursBottleneck))}`,
      `${result.totalHoursBottleneck.toFixed(2)} saat`
    )}
    ${statCard(
      "İş günü karşılığı",
      `${split.fullDays} gün + ${split.remainderHours.toFixed(2)} sa`,
      `${split.hoursPerWorkday} sa/gün · ≈ ${(result.totalHoursBottleneck / split.hoursPerWorkday).toFixed(2)} iş günü`
    )}
  </div>

  <div style="border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:18px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
    <div style="background:linear-gradient(90deg,#0f766e,#0d9488);color:#fff;padding:12px 16px;font-size:12px;font-weight:700;letter-spacing:0.04em;">Proses detayı</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">
          <th style="text-align:left;padding:10px 14px;font-weight:700;border-bottom:2px solid #e2e8f0;">Proses</th>
          <th style="text-align:right;padding:10px 14px;font-weight:700;border-bottom:2px solid #e2e8f0;">Σ adet/sa</th>
          <th style="text-align:right;padding:10px 14px;font-weight:700;border-bottom:2px solid #e2e8f0;">Süre (sa)</th>
          <th style="text-align:left;padding:10px 14px;font-weight:700;border-bottom:2px solid #e2e8f0;">Personel</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div style="background:linear-gradient(180deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;font-size:11px;line-height:1.55;color:#475569;">
    <div style="font-weight:700;color:#334155;margin-bottom:6px;">Karşılaştırma — ardışık çalışma</div>
    Ara stok beklemeden her aşama kendi hızıyla tüm Q’yu bitirse toplam <strong style="color:#0f172a;">${result.sequentialNoWipHours.toFixed(2)} sa</strong>
    (${escapeHtml(formatHoursHuman(result.sequentialNoWipHours))}) — yaklaşık
    <strong style="color:#0f172a;">${splitSeq.fullDays} gün + ${splitSeq.remainderHours.toFixed(2)} sa</strong>
    (${splitSeq.hoursPerWorkday} sa/gün). Sürekli hat akışında genellikle <strong style="color:#0f766e;">darboğaz süresi</strong> daha gerçekçidir.
  </div>
</div>`.trim();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:720px;pointer-events:none;overflow:visible;";
  host.innerHTML = html;
  document.body.appendChild(host);
  const root = host.querySelector(".is-bitirme-pdf-root") as HTMLElement;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const html2pdf = (await import("html2pdf.js")).default;
  const safeCode = modelCode.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 40) || "rapor";
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 12, 10],
        filename: `is-hesaplama-sonuc-${safeCode}-${stamp}.pdf`,
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
