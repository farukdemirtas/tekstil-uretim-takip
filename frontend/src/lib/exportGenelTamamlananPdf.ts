import type { GenelTamamlananTrend } from "@/lib/api";

type CompareCard = {
  current: number;
  previous: number;
  currentLabel: string;
  previousLabel: string;
};

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
  return escapeHtml(dt.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
}

function formatIsoTrShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return escapeHtml(iso);
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return escapeHtml(iso);
  return escapeHtml(dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }));
}

function deltaLabel(delta: number): string {
  if (delta === 0) return "Değişim yok";
  const up = delta > 0;
  return `${up ? "↑" : "↓"} ${Math.abs(delta).toLocaleString("tr-TR")} adet`;
}

function deltaPctLabel(current: number, previous: number): string {
  if (previous <= 0) return "";
  const pct = Math.round(((current - previous) / previous) * 100);
  return ` (${pct > 0 ? "+" : ""}${pct}%)`;
}

function statCard(label: string, value: string, sub?: string): string {
  return `
    <div class="pdf-avoid-break" style="background:linear-gradient(145deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
      <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${label}</div>
      <div style="font-size:18px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;">${value}</div>
      ${sub ? `<div style="margin-top:4px;font-size:10px;color:#64748b;line-height:1.35;">${sub}</div>` : ""}
    </div>`;
}

function compareCard(title: string, card: CompareCard): string {
  const delta = card.current - card.previous;
  const deltaColor = delta > 0 ? "#047857" : delta < 0 ? "#be123c" : "#475569";
  return `
    <div class="pdf-avoid-break" style="border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;background:#fff;">
      <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${title}</div>
      <div style="font-size:15px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;">
        ${card.current.toLocaleString("tr-TR")}
        <span style="font-size:11px;font-weight:500;color:#94a3b8;"> vs </span>
        ${card.previous.toLocaleString("tr-TR")}
      </div>
      <div style="margin-top:4px;font-size:10px;color:#64748b;">${escapeHtml(card.currentLabel)} · ${escapeHtml(card.previousLabel)}</div>
      <div style="margin-top:6px;font-size:11px;font-weight:700;color:${deltaColor};">${deltaLabel(delta)}${deltaPctLabel(card.current, card.previous)}</div>
    </div>`;
}

export async function downloadGenelTamamlananPdf(params: {
  data: GenelTamamlananTrend;
  metricLabel: string;
  rangeLabel: string;
  weekCompare: CompareCard | null;
  monthCompare: CompareCard | null;
  loadedAt?: string;
}): Promise<void> {
  const { data, metricLabel, rangeLabel, weekCompare, monthCompare, loadedAt } = params;
  const maxVal = Math.max(1, ...data.daily.map((d) => d.genelTamamlanan));

  const barRows = data.daily
    .map((point) => {
      const pct = Math.max(point.genelTamamlanan > 0 ? 4 : 0, (point.genelTamamlanan / maxVal) * 100);
      return `
        <div class="pdf-avoid-break" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:72px;flex-shrink:0;font-size:10px;color:#475569;font-weight:600;">${formatIsoTrShort(point.date)}</div>
          <div style="flex:1;height:18px;background:#f1f5f9;border-radius:6px;overflow:hidden;">
            <div style="height:100%;width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#14b8a6,#0d9488);border-radius:6px;"></div>
          </div>
          <div style="width:56px;text-align:right;font-size:11px;font-weight:700;color:#0f766e;font-variant-numeric:tabular-nums;">${point.genelTamamlanan.toLocaleString("tr-TR")}</div>
        </div>`;
    })
    .join("");

  const tableRows = [...data.daily]
    .reverse()
    .map(
      (row) => `
      <tr class="pdf-avoid-break">
        <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${formatIsoTrLong(row.date)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f766e;font-variant-numeric:tabular-nums;">${row.genelTamamlanan.toLocaleString("tr-TR")}</td>
      </tr>`
    )
    .join("");

  const now = new Date();
  const generatedAt = escapeHtml(
    now.toLocaleString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  );

  const html = `
<div class="genel-tamamlanan-pdf-root" style="
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
  <div class="pdf-avoid-break" style="border-bottom:3px solid #0d9488;padding-bottom:14px;margin-bottom:18px;">
    <div style="font-size:10px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:0.08em;">Yeşil İmaj Tekstil · Analiz</div>
    <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">Genel tamamlanan trendi</h1>
    <p style="margin:8px 0 0;font-size:11px;color:#64748b;">Dönem: <strong style="color:#0f172a;">${escapeHtml(rangeLabel)}</strong> · Metrik: <strong style="color:#0f172a;">${escapeHtml(metricLabel)}</strong></p>
    <p style="margin:4px 0 0;font-size:10px;color:#94a3b8;">PDF oluşturma: ${generatedAt}${loadedAt ? ` · Veri: ${escapeHtml(loadedAt)}` : ""}</p>
  </div>

  <div class="pdf-avoid-break" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
    ${statCard("Dönem toplamı", `${data.summary.total.toLocaleString("tr-TR")} adet`)}
    ${statCard(
      "Günlük ortalama",
      `${data.summary.avgPerDay.toLocaleString("tr-TR")} adet`,
      `${data.summary.daysWithData} veri alınan iş günü · ${data.summary.workdayCount} iş günü`
    )}
  </div>

  ${
    weekCompare || monthCompare
      ? `<div class="pdf-avoid-break" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
    ${weekCompare ? compareCard("Geçen haftaya göre", weekCompare) : ""}
    ${monthCompare ? compareCard("Geçen aya göre", monthCompare) : ""}
  </div>`
      : ""
  }

  <div class="pdf-avoid-break" style="margin-bottom:18px;">
    <h2 style="margin:0 0 10px;font-size:13px;font-weight:800;color:#0f172a;">Günlük trend</h2>
    ${data.daily.length === 0 ? '<p style="color:#94a3b8;font-size:11px;">Seçilen aralıkta iş günü yok.</p>' : barRows}
  </div>

  <div class="pdf-avoid-break">
    <h2 style="margin:0 0 10px;font-size:13px;font-weight:800;color:#0f172a;">Günlük detay</h2>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="text-align:left;padding:8px 12px;font-weight:700;border-bottom:2px solid #e2e8f0;">Tarih</th>
          <th style="text-align:right;padding:8px 12px;font-weight:700;border-bottom:2px solid #e2e8f0;">${escapeHtml(metricLabel)}</th>
        </tr>
      </thead>
      <tbody>${tableRows || `<tr><td colspan="2" style="padding:16px;color:#94a3b8;">Veri yok.</td></tr>`}</tbody>
    </table>
  </div>

  <p style="font-size:9px;color:#94a3b8;line-height:1.4;margin:16px 0 0;">Genel tamamlanan: veri girişi günlük özeti ile aynı (saat + ek giriş). Proses seçilmediğinde tüm satırların minimumu kullanılır.</p>
</div>`.trim();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:720px;pointer-events:none;overflow:visible;";
  host.innerHTML = html;
  document.body.appendChild(host);
  const root = host.querySelector(".genel-tamamlanan-pdf-root") as HTMLElement;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const html2pdf = (await import("html2pdf.js")).default;
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 12, 10],
        filename: `genel-tamamlanan-trendi-${data.startDate}-${data.endDate}-${stamp}.pdf`,
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
