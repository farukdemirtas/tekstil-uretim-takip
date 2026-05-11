import type { WorkerCompStat } from "@/lib/api";
import { DISPLAY_SLOT_CHART_LABELS } from "@/lib/displaySlotAggregation";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Dosya adı için güvenli kısaltma (Unicode harf Türkçe dahil korunur) */
function safeFilePart(s: string): string {
  const t = s.trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "").replace(/\s+/g, "_");
  return t.slice(0, 48) || "karsilastirma";
}

const SLOTS: { key: keyof Pick<WorkerCompStat, "t1000" | "t1300" | "t1600" | "t1830">; label: string }[] = [
  { key: "t1000", label: DISPLAY_SLOT_CHART_LABELS[0] },
  { key: "t1300", label: DISPLAY_SLOT_CHART_LABELS[1] },
  { key: "t1600", label: DISPLAY_SLOT_CHART_LABELS[2] },
  { key: "t1830", label: DISPLAY_SLOT_CHART_LABELS[3] },
];

function buildDailyTrendSvg(daily: { date: string; w1: number; w2: number }[], name1: string, name2: string): string {
  if (daily.length < 2) {
    return `<p style="margin:12px 0;font-size:11px;color:#64748b;">Günlük trend için en az iki iş günü gerekli.</p>`;
  }

  const W = 664;
  const H = 186;
  const PX = 40;
  const PY = 16;
  const innerW = W - PX * 2;
  const innerH = H - PY * 2;
  const maxY = Math.max(...daily.map((d) => Math.max(d.w1, d.w2)), 1);

  const toX = (i: number) => PX + (i / Math.max(daily.length - 1, 1)) * innerW;
  const toY = (v: number) => PY + (1 - v / maxY) * innerH;

  const pathD = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");

  const step = Math.max(1, Math.ceil(daily.length / 6));
  const gridlines = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (pct) =>
        `<line x1="${PX}" x2="${W - PX}" y1="${toY(maxY * pct).toFixed(1)}" y2="${toY(maxY * pct).toFixed(
          1
        )}" stroke="#cbd5e1" stroke-opacity="0.55" stroke-width="1"/>`
    )
    .join("");

  const xlabels = daily
    .map((_, i) => ({ i }))
    .filter(({ i }) => i === 0 || i === daily.length - 1 || i % step === 0)
    .map(({ i }) => {
      const d = daily[i].date.slice(5);
      return `<text x="${toX(i).toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">${escapeHtml(
        d
      )}</text>`;
    })
    .join("");

  return `
  <div class="pdf-avoid-break" style="margin-top:18px;">
    <h3 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a;">Günlük üretim trendi</h3>
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px;align-items:center;font-size:10px;color:#475569;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;">
      <span><span style="display:inline-block;width:12px;height:8px;background:#2563eb;border-radius:2px;margin-right:6px;"></span>${escapeHtml(
        name1
      )}</span>
      <span><span style="display:inline-block;width:12px;height:8px;background:#ea580c;border-radius:2px;margin-right:6px;"></span>${escapeHtml(
        name2
      )}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="max-width:664px;display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      ${gridlines}
      <path d="${pathD(
        daily.map((d) => d.w1)
      )}" fill="none" stroke="#2563eb" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${pathD(
        daily.map((d) => d.w2)
      )}" fill="none" stroke="#ea580c" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
      ${daily
        .map((d, i) => {
          const c1 = `<circle cx="${toX(i)}" cy="${toY(d.w1)}" r="3.5" fill="#2563eb"/>`;
          const c2 = `<circle cx="${toX(i)}" cy="${toY(d.w2)}" r="3.5" fill="#ea580c"/>`;
          return c1 + c2;
        })
        .join("")}
      <text x="${PX - 4}" y="${(PY + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">${escapeHtml(
        String(Math.round(maxY))
      )}</text>
      <text x="${PX - 4}" y="${(PY + innerH).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">0</text>
      ${xlabels}
    </svg>
  </div>`;
}

function statCard(stat: WorkerCompStat, teamLabels: Record<string, string>, accent: "#2563eb" | "#ea580c", title: string): string {
  const name = escapeHtml(stat.name || stat.team || "—");
  const sub = `${escapeHtml(teamLabels[stat.team] ?? stat.team)}${stat.process ? ` · ${escapeHtml(stat.process)}` : ""}`;
  const bgTint = accent === "#2563eb" ? "#eff6ff" : "#fff7ed";
  return `
  <div class="pdf-avoid-break" style="flex:1;min-width:240px;border:2px solid ${accent};border-radius:14px;overflow:hidden;background:#fff;">
    <div style="background:${accent};color:#fff;padding:10px 14px;font-size:11px;font-weight:700;">${escapeHtml(title)}</div>
    <div style="padding:14px;background:${bgTint};">
      <div style="font-size:17px;font-weight:800;color:#0f172a;line-height:1.25;margin-bottom:4px;">${name}</div>
      <div style="font-size:11px;color:#475569;line-height:1.35;margin-bottom:12px;">${sub}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">
          <div style="font-size:18px;font-weight:800;color:${accent};font-variant-numeric:tabular-nums;">${stat.total.toLocaleString("tr-TR")}</div>
          <div style="font-size:9px;color:#64748b;font-weight:600;margin-top:2px;">Toplam</div>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">
          <div style="font-size:18px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;">${stat.activeDays}</div>
          <div style="font-size:9px;color:#64748b;font-weight:600;margin-top:2px;">Gün</div>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">
          <div style="font-size:18px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;">${
            stat.activeDays > 0 ? Math.round(stat.total / stat.activeDays).toLocaleString("tr-TR") : "0"
          }</div>
          <div style="font-size:9px;color:#64748b;font-weight:600;margin-top:2px;">Ort./gün</div>
        </div>
      </div>
    </div>
  </div>`;
}

/** Personel veya bölüm karşılaştırması — Türkçe karakterleri koruyan PDF (html2pdf) */
export async function downloadKarsilastirmaPdf(params: {
  w1: WorkerCompStat;
  w2: WorkerCompStat;
  daily: { date: string; w1: number; w2: number }[];
  teamLabels: Record<string, string>;
  startDate: string;
  endDate: string;
  leftTitle: string;
  rightTitle: string;
  modeLabel: string;
}): Promise<void> {
  const { w1, w2, daily, teamLabels, startDate, endDate, leftTitle, rightTitle, modeLabel } = params;

  const sum = (w1.total + w2.total) || 1;
  const pct1 = Math.round((w1.total / sum) * 100);
  const pct2 = 100 - pct1;
  const n1 = w1.name?.trim() || teamLabels[w1.team] || w1.team;
  const n2 = w2.name?.trim() || teamLabels[w2.team] || w2.team;

  const slotRows = SLOTS.map(({ key, label }) => {
    const k = key as "t1000" | "t1300" | "t1600" | "t1830";
    const v1 = Number(w1[k]) || 0;
    const v2 = Number(w2[k]) || 0;
    const diff = v1 - v2;
    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
    const leader =
      diff > 0 ? n1 : diff < 0 ? n2 : "—";
    const diffColor = diff > 0 ? "#059669" : diff < 0 ? "#dc2626" : "#64748b";
    return `<tr class="pdf-avoid-break">
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(label)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#2563eb;font-variant-numeric:tabular-nums;">${v1.toLocaleString("tr-TR")}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#ea580c;font-variant-numeric:tabular-nums;">${v2.toLocaleString("tr-TR")}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:${diffColor};font-variant-numeric:tabular-nums;">${escapeHtml(diffStr)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(leader)}</td>
    </tr>`;
  }).join("");

  const diffTotal = w1.total - w2.total;
  const totalLeader = w1.total > w2.total ? n1 : w2.total > w1.total ? n2 : "Berabere";

  const html = `
<div class="karsilastirma-pdf-root" style="
  box-sizing:border-box;
  width:720px;
  padding:24px 26px 28px;
  font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans','Liberation Sans',sans-serif;
  font-size:12px;
  line-height:1.5;
  color:#0f172a;
  background:#ffffff;
  -webkit-font-smoothing:antialiased;
">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:14px;padding:18px 20px;margin-bottom:20px;color:#fff;">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;opacity:0.88;margin-bottom:6px;">Üretim karşılaştırma</div>
    <h1 style="margin:0;font-size:20px;font-weight:800;letter-spacing:-0.02em;">Karşılaştırma raporu</h1>
    <p style="margin:8px 0 0;font-size:12px;opacity:0.9;">Mod: ${escapeHtml(modeLabel)} · ${escapeHtml(startDate)} — ${escapeHtml(endDate)}</p>
    <p style="margin:4px 0 0;font-size:11px;opacity:0.75;">Oluşturulma: ${escapeHtml(
      new Date().toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
    )}</p>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:20px;">
    ${statCard(w1, teamLabels, "#2563eb", leftTitle)}
    ${statCard(w2, teamLabels, "#ea580c", rightTitle)}
  </div>

  <div class="pdf-avoid-break" style="background:linear-gradient(145deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:20px;">
    <h2 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#0f172a;">Genel üretim karşılaştırması</h2>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <span style="min-width:3.5rem;text-align:right;font-weight:800;color:#2563eb;font-size:15px;font-variant-numeric:tabular-nums;">${w1.total.toLocaleString("tr-TR")}</span>
      <div style="flex:1;height:22px;border-radius:999px;overflow:hidden;display:flex;background:#e2e8f0;border:1px solid #cbd5e1;">
        <div style="width:${pct1}%;background:linear-gradient(90deg,#3b82f6,#2563eb);"></div>
        <div style="flex:1;background:linear-gradient(90deg,#fb923c,#ea580c);"></div>
      </div>
      <span style="min-width:3.5rem;font-weight:800;color:#ea580c;font-size:15px;font-variant-numeric:tabular-nums;">${w2.total.toLocaleString("tr-TR")}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:0 3.5rem;font-size:11px;font-weight:600;color:#64748b;">
      <span style="color:#2563eb;">%${pct1}</span>
      <span style="color:#ea580c;">%${pct2}</span>
    </div>
    <p style="margin:12px 0 0;text-align:center;font-size:12px;font-weight:600;color:#475569;">
      ${w1.total !== w2.total ? `${escapeHtml(totalLeader)} önde — ${Math.abs(diffTotal).toLocaleString("tr-TR")} adet fark` : "Berabere"}
    </p>
  </div>

  <div class="pdf-avoid-break" style="margin-bottom:18px;">
    <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0f172a;">Saat dilimine göre karşılaştırma</h2>
    <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;">
          <th style="text-align:left;padding:10px 12px;font-weight:700;border-bottom:2px solid #e2e8f0;">Dilim</th>
          <th style="text-align:right;padding:10px 12px;font-weight:700;border-bottom:2px solid #e2e8f0;">${escapeHtml(n1)}</th>
          <th style="text-align:right;padding:10px 12px;font-weight:700;border-bottom:2px solid #e2e8f0;">${escapeHtml(n2)}</th>
          <th style="text-align:right;padding:10px 12px;font-weight:700;border-bottom:2px solid #e2e8f0;">Fark</th>
          <th style="text-align:left;padding:10px 12px;font-weight:700;border-bottom:2px solid #e2e8f0;">Önde</th>
        </tr>
      </thead>
      <tbody>${slotRows}<tr style="background:#f8fafc;font-weight:800;">
          <td style="padding:11px 12px;border-top:2px solid #cbd5e1;">Toplam</td>
          <td style="padding:11px 12px;border-top:2px solid #cbd5e1;text-align:right;color:#2563eb;font-variant-numeric:tabular-nums;">${w1.total.toLocaleString("tr-TR")}</td>
          <td style="padding:11px 12px;border-top:2px solid #cbd5e1;text-align:right;color:#ea580c;font-variant-numeric:tabular-nums;">${w2.total.toLocaleString("tr-TR")}</td>
          <td style="padding:11px 12px;border-top:2px solid #cbd5e1;text-align:right;font-variant-numeric:tabular-nums;">${
            diffTotal > 0 ? `+${diffTotal}` : `${diffTotal}`
          }</td>
          <td style="padding:11px 12px;border-top:2px solid #cbd5e1;">${escapeHtml(totalLeader)}</td>
        </tr></tbody>
    </table>
  </div>

  ${buildDailyTrendSvg(daily, n1, n2)}

  <p style="margin:20px 0 0;font-size:9px;color:#94a3b8;line-height:1.45;">Tekstil üretim takip — Karşılaştırma özeti. Sayılar üretim girişlerinden türetilmiştir.</p>
</div>`.trim();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:720px;pointer-events:none;overflow:visible;";
  host.innerHTML = html;
  document.body.appendChild(host);
  const root = host.querySelector(".karsilastirma-pdf-root") as HTMLElement;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const html2pdf = (await import("html2pdf.js")).default;
  const stamp = `${startDate}_${endDate}`;
  const fname = `uretim-karsilastirma_${safeFilePart(n1)}_${safeFilePart(n2)}_${stamp}.pdf`;

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 12, 10],
        filename: fname,
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
