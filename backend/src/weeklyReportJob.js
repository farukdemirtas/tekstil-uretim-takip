import cron from "node-cron";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import {
  gatherWeeklyBriefingPayload,
  getDecisionSupportMerged,
  mondayFridayRangeUtcIsoContaining,
  saveDecisionSupportMerged,
  istanbulTodayIsoForBusiness,
} from "./queries.js";

/** ASCII güvenli (Helvetica) */
function asc(s) {
  return String(s ?? "")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/—/g, "-");
}

function istanbulDateParts(dt) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    f.formatToParts(dt).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  const minute = Number(parts.minute);
  let hour = Number(parts.hour);
  if (!Number.isFinite(hour)) hour = 12;
  const wdStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
  }).format(dt);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekdayJs = map[wdStr] ?? 0;
  const min = Number.isFinite(minute) ? minute : 0;
  return { hour, weekdayJs, minute: min };
}

function recipientsFromCsv(csv) {
  return String(csv || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => /.+@.+\..+/.test(s));
}

function briefingPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(14).fillColor("#0f172a").text(`Haftalik uretim ozeti (${asc(data.periodLabel)})`, {
      underline: false,
    });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#64748b").text(`Olusturulma: ${data.generatedAt ?? ""}`);
    doc.moveDown();

    doc.fontSize(11).fillColor("#0f172a").text("Bolum toplamlari", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#334155");
    for (const r of data.teamTotals || []) {
      const lbl = data.teamLabels?.[r.teamCode] ?? r.teamCode;
      doc.text(`${asc(lbl)}: ${Number(r.totalProduction) || 0}`);
    }

    doc.moveDown();
    doc.fontSize(11).fillColor("#0f172a").text("Model kullanim (gun sayisi)", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#334155");
    for (const m of (data.modelUsage || []).slice(0, 15)) {
      doc.text(`${asc(m.modelCode)}: ${Number(m.daysCount) || 0} gun`);
    }

    doc.moveDown();
    doc.fontSize(11).fillColor("#0f172a").text("En dusuk verimlilik (genel dk hedefleri, ort. %)", {
      underline: true,
    });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#334155");
    for (const row of (data.lowestEfficiency || []).slice(0, 15)) {
      const tl = data.teamLabels?.[row.team] ?? row.team;
      doc.text(
        `${asc(row.name)} | ${asc(tl)} | ${asc(row.process)} | %${row.efficiencyPct} | topl ${row.total} (${row.activeDays} gun)`,
      );
    }

    doc.end();
  });
}

async function sendWeeklyBriefingMail({ recipients, attachmentBuffer, summaryText, subject }) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.MAIL_FROM?.trim() || user || "noreply@localhost";
  if (!host || !user) {
    throw new Error("SMTP_HOST ve SMTP_USER ortam degiskenleri eksik.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject,
    text: summaryText,
    attachments: [{ filename: "haftalik-ozet.pdf", content: attachmentBuffer }],
  });
}

/** Test veya manuel: belirtilen Pzt–Cu aralığı için e-posta gönderir */
export async function runWeeklyReportForRange(mon, fri) {
  const data = await gatherWeeklyBriefingPayload(mon, fri);
  const buf = await briefingPdfBuffer(data);

  const lines = [];
  lines.push(`Donem: ${data.periodLabel}`);
  lines.push("");
  lines.push("Bolum toplamlari:");
  for (const r of data.teamTotals || []) {
    const lbl = data.teamLabels?.[r.teamCode] ?? r.teamCode;
    lines.push(`- ${lbl}: ${Number(r.totalProduction) || 0}`);
  }
  lines.push("");
  lines.push("Model (gun):");
  for (const m of (data.modelUsage || []).slice(0, 8)) {
    lines.push(`- ${m.modelCode}: ${m.daysCount} gun`);
  }
  lines.push("");
  lines.push("En dusuk verim (ilk 5):");
  for (const row of (data.lowestEfficiency || []).slice(0, 5)) {
    lines.push(`- ${row.name} %${row.efficiencyPct} (${row.total} / ${row.activeDays}g)`);
  }

  const settings = await getDecisionSupportMerged();
  const rcp = recipientsFromCsv(settings?.weeklyReport?.recipientsCsv);
  if (!rcp.length) throw new Error("Once ayarlardan alici e-posta adresi girin.");

  await sendWeeklyBriefingMail({
    recipients: rcp,
    attachmentBuffer: buf,
    summaryText: lines.join("\n"),
    subject: `[Tekstil] Haftalik ozet ${mon} … ${fri}`,
  });

  const periodLabel = `${mon}_${fri}`;
  await saveDecisionSupportMerged({
    weeklyReport: {
      lastSentPeriodLabel: periodLabel,
      lastError: null,
      lastSentAt: new Date().toISOString(),
    },
  });
  return { ok: true };
}

/** İstanbul takviminin içinde olduğu Pazartesi–Cuma aralığı */
export async function sendWeeklyReportForCurrentTurkeyBusinessWeek() {
  const iso = istanbulTodayIsoForBusiness();
  const { mon, fri } = mondayFridayRangeUtcIsoContaining(iso);
  return runWeeklyReportForRange(mon, fri);
}

export function scheduleWeeklyBriefingCron() {
  cron.schedule("* * * * *", async () => {
    try {
      const settings = await getDecisionSupportMerged();
      const wr = settings?.weeklyReport;
      if (!wr?.enabled) return;

      const rcp = recipientsFromCsv(wr.recipientsCsv);
      if (!rcp.length) return;

      const now = new Date();
      const { hour, weekdayJs, minute } = istanbulDateParts(now);
      const wantWd = Number.isFinite(Number(wr.sendWeekday)) ? Number(wr.sendWeekday) : 5;
      const wantHr = Number.isFinite(Number(wr.sendHourTurkey)) ? Number(wr.sendHourTurkey) : 18;
      const wantMin = Number.isFinite(Number(wr.sendMinuteTurkey)) ? Number(wr.sendMinuteTurkey) : 0;
      if (weekdayJs !== wantWd || hour !== wantHr || minute !== wantMin) return;

      const todayIso = istanbulTodayIsoForBusiness();
      const { mon: thisMon, fri: thisFri } = mondayFridayRangeUtcIsoContaining(todayIso);
      const periodLabel = `${thisMon}_${thisFri}`;
      if (wr.lastSentPeriodLabel === periodLabel) return;

      const payload = await gatherWeeklyBriefingPayload(thisMon, thisFri);
      await sendWeeklyBriefingMail({
        recipients: rcp,
        attachmentBuffer: await briefingPdfBuffer(payload),
        summaryText:
          `${asc("Haftalik ozet")}: ${payload.periodLabel}\n` +
          (payload.lowestEfficiency?.[0]
            ? `En dusuk: ${payload.lowestEfficiency[0].name} %${payload.lowestEfficiency[0].efficiencyPct}\n`
            : ""),
        subject: `[Tekstil] Haftalik ozet ${thisMon} … ${thisFri}`,
      });

      await saveDecisionSupportMerged({
        weeklyReport: {
          lastSentPeriodLabel: periodLabel,
          lastError: null,
          lastSentAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      const msg = String(e?.message ?? e).slice(0, 480);
      // eslint-disable-next-line no-console
      console.error("[weekly-report]", msg);
      try {
        await saveDecisionSupportMerged({ weeklyReport: { lastError: msg, lastSentAt: null } });
      } catch {
        /* ignore */
      }
    }
  });

  // eslint-disable-next-line no-console
  console.log("[weekly-report] Zamanlanmis gonderim: ayarlardan acilir; TR gun/saat eslesmesi dakikada bir kontrol.");
}
