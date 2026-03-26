import express from "express";
import cors from "cors";
import { createHmac } from "crypto";
import { initDb } from "./db.js";
import {
  createWorker,
  deleteWorker,
  deleteWorkerForDate,
  getDailyEntries,
  getDailyTrendAnalytics,
  getRangeStageTotals,
  getWorkerDailyAnalytics,
  createUser,
  deleteUser,
  getUsers,
  resetUserPassword,
  verifyUserPassword,
  getTopWorkersAnalytics,
  getWorkers,
  upsertEntriesBulk,
  upsertEntry
} from "./queries.js";

const app = express();
const PORT = process.env.PORT || 4000;
const AUTH_USER = process.env.APP_USERNAME || "admin";
const AUTH_PASS = process.env.APP_PASSWORD || "1234";
// Token secret (eski sürümde "token sabiti" gibi kullanılıyordu).
// Burada signing secret olarak kullanıyoruz.
const AUTH_TOKEN = process.env.APP_TOKEN || "yeva-local-token";
const TOKEN_SECRET = process.env.APP_TOKEN_SECRET || AUTH_TOKEN;
const VALID_TEAMS = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM", "ADET"];
const VALID_HOURS = ["", "t1000", "t1300", "t1600", "t1830"];

initDb();

app.use(cors());
app.use(express.json());

function requireAuth(req, res, next) {
  if (req.path === "/api/health" || req.path === "/api/auth/login") {
    return next();
  }
  const token = req.headers["x-auth-token"];
  if (!token || typeof token !== "string") {
    return res.status(401).json({ message: "Yetkisiz istek" });
  }

  // Token format: v1.<payloadB64>.<sig>
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return res.status(401).json({ message: "Yetkisiz istek" });
  }

  const [_, payloadB64, sig] = parts;
  const expectedSig = createHmac("sha256", TOKEN_SECRET).update(payloadB64).digest("hex");
  if (expectedSig !== sig) {
    return res.status(401).json({ message: "Yetkisiz istek" });
  }

  try {
    const jsonStr = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(jsonStr);
    if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return res.status(401).json({ message: "Yetkisiz istek" });
    }
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Yetkisiz istek" });
  }
}

app.use(requireAuth);

function requireAdmin(req, res, next) {
  const user = req.user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Yetersiz yetki" });
  }
  return next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  verifyUserPassword({ username, password })
    .then((user) => {
      if (!user) return res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı" });
      const exp = Date.now() + 1000 * 60 * 60 * 24; // 24 saat
      const payload = { id: user.id, username: user.username, role: user.role, exp };
      const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
      const sig = createHmac("sha256", TOKEN_SECRET).update(payloadB64).digest("hex");
      const token = `v1.${payloadB64}.${sig}`;
      return res.json({ token, username: user.username, role: user.role });
    })
    .catch(() => res.status(500).json({ message: "Giriş doğrulanamadı" }));
});

app.get("/api/users", requireAdmin, async (_req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Kullanıcılar alınamadı", error: String(error) });
  }
});

app.post("/api/users", requireAdmin, async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const user = await createUser({ username, password });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: "Kullanıcı eklenemedi", error: String(error) });
  }
});

app.delete("/api/users/:id", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ message: "Geçersiz kullanıcı id" });

  try {
    const result = await deleteUser(userId);
    if (!result.deleted) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Kullanıcı silinemedi", error: String(error) });
  }
});

app.post("/api/users/:id/reset-password", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { password } = req.body || {};
  if (!userId) return res.status(400).json({ message: "Geçersiz kullanıcı id" });

  try {
    const result = await resetUserPassword({ userId, password });
    if (!result.updated) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: "Şifre sıfırlanamadı", error: String(error) });
  }
});

app.get("/api/workers", async (_req, res) => {
  try {
    const workers = await getWorkers();
    res.json(workers);
  } catch (error) {
    res.status(500).json({ message: "Çalışanlar alınamadı", error: String(error) });
  }
});

app.post("/api/workers", requireAuth, async (req, res) => {
  const { name, team, process } = req.body;
  if (!name || !team || !process) {
    return res.status(400).json({ message: "name, team ve process zorunlu" });
  }

  if (!VALID_TEAMS.includes(team)) {
    return res.status(400).json({ message: "Geçersiz grup" });
  }

  try {
    const worker = await createWorker({ name, team, process });
    res.status(201).json(worker);
  } catch (error) {
    res.status(500).json({ message: "Çalışan eklenemedi", error: String(error) });
  }
});

app.delete("/api/workers/:id", requireAuth, async (req, res) => {
  const workerId = Number(req.params.id);
  if (!workerId) {
    return res.status(400).json({ message: "Geçersiz worker id" });
  }

  const { date } = req.query;
  // Tarih filtresi için uygun format kontrolü (YYYY-MM-DD).
  const deletedAt =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;

  try {
    const result = deletedAt ? await deleteWorkerForDate(workerId, deletedAt) : await deleteWorker(workerId);
    if (!result.deleted) {
      return res.status(404).json({ message: "Çalışan bulunamadı" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Çalışan silinemedi", error: String(error) });
  }
});

app.get("/api/production/range-totals", requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  try {
    const totals = await getRangeStageTotals(String(startDate), String(endDate));
    res.json(totals);
  } catch (error) {
    res.status(500).json({ message: "Tarih aralığı verisi alınamadı", error: String(error) });
  }
});

app.get("/api/production", async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ message: "date zorunlu (YYYY-MM-DD)" });
  }

  try {
    const rows = await getDailyEntries(String(date));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Üretim verisi alınamadı", error: String(error) });
  }
});

app.get("/api/analytics/top-workers", requireAdmin, async (req, res) => {
  const { startDate, endDate, team = "", limit = "20", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }

  if (team && !VALID_TEAMS.includes(String(team))) {
    return res.status(400).json({ message: "Geçersiz grup filtresi" });
  }
  if (!VALID_HOURS.includes(String(hour))) {
    return res.status(400).json({ message: "Geçersiz saat filtresi" });
  }

  try {
    const rows = await getTopWorkersAnalytics({
      startDate: String(startDate),
      endDate: String(endDate),
      team: String(team),
      limit: Number(limit) || 20,
      hourColumn: String(hour)
    });
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Analiz verisi alınamadı", error: String(error) });
  }
});

app.get("/api/analytics/daily-trend", requireAdmin, async (req, res) => {
  const { startDate, endDate, team = "", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  if (team && !VALID_TEAMS.includes(String(team))) {
    return res.status(400).json({ message: "Geçersiz grup filtresi" });
  }
  if (!VALID_HOURS.includes(String(hour))) {
    return res.status(400).json({ message: "Geçersiz saat filtresi" });
  }

  try {
    const rows = await getDailyTrendAnalytics({
      startDate: String(startDate),
      endDate: String(endDate),
      team: String(team),
      hourColumn: String(hour)
    });
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Trend verisi alınamadı", error: String(error) });
  }
});

app.get("/api/analytics/worker-daily", requireAdmin, async (req, res) => {
  const { startDate, endDate, team = "", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  if (team && !VALID_TEAMS.includes(String(team))) {
    return res.status(400).json({ message: "Geçersiz grup filtresi" });
  }
  if (!VALID_HOURS.includes(String(hour))) {
    return res.status(400).json({ message: "Geçersiz saat filtresi" });
  }

  try {
    const rows = await getWorkerDailyAnalytics({
      startDate: String(startDate),
      endDate: String(endDate),
      team: String(team),
      hourColumn: String(hour)
    });
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "İşçi günlük analiz verisi alınamadı", error: String(error) });
  }
});

app.post("/api/production", async (req, res) => {
  const { workerId, date, t1000 = 0, t1300 = 0, t1600 = 0, t1830 = 0 } = req.body;
  if (!workerId || !date) {
    return res.status(400).json({ message: "workerId ve date zorunlu" });
  }

  try {
    await upsertEntry({
      workerId: Number(workerId),
      date: String(date),
      t1000: Number(t1000) || 0,
      t1300: Number(t1300) || 0,
      t1600: Number(t1600) || 0,
      t1830: Number(t1830) || 0
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Üretim verisi kaydedilemedi", error: String(error) });
  }
});

app.post("/api/production/bulk", async (req, res) => {
  const { date, entries } = req.body;
  if (!date || !Array.isArray(entries)) {
    return res.status(400).json({ message: "date ve entries (array) zorunlu" });
  }

  const normalized = entries.map((entry) => ({
    workerId: Number(entry.workerId),
    date: String(date),
    t1000: Number(entry.t1000) || 0,
    t1300: Number(entry.t1300) || 0,
    t1600: Number(entry.t1600) || 0,
    t1830: Number(entry.t1830) || 0
  }));

  if (normalized.some((entry) => !entry.workerId)) {
    return res.status(400).json({ message: "Geçersiz workerId bulundu" });
  }

  try {
    await upsertEntriesBulk(normalized);
    return res.json({ ok: true, count: normalized.length });
  } catch (error) {
    return res.status(500).json({ message: "Toplu kayıt başarısız", error: String(error) });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
});
