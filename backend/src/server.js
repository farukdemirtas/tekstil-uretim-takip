import express from "express";
import cors from "cors";
import { createHmac } from "crypto";
import { initDb } from "./db.js";
import {
  getWorkerNames,
  addWorkerName,
  updateWorkerName,
  deleteWorkerName,
  createWorker,
  updateWorker,
  deleteWorker,
  deleteWorkerForDate,
  getDailyEntries,
  getDayProductMeta,
  upsertDayProductMeta,
  getDailyTrendAnalytics,
  getRangeStageTotals,
  getHedefTakipStageTotals,
  getWorkerComparisonData,
  getWorkerHourlyBreakdown,
  getWorkerDailyAnalytics,
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  resetUserPassword,
  updateUserPermissions,
  verifyUserPassword,
  getTopWorkersAnalytics,
  getWorkers,
  upsertEntriesBulk,
  upsertEntry,
  getTeams,
  getProcesses,
  addTeam,
  updateTeam,
  deleteTeam,
  addProcess,
  updateProcess,
  deleteProcess,
  listTeamCodes,
  listProcessNames,
} from "./queries.js";
import { mergePermissionsPatch, normalizePermissions, permissionsJsonForDb } from "./permissions.js";

const app = express();
const PORT = process.env.PORT || 4000;
const AUTH_USER = process.env.APP_USERNAME || "admin";
const AUTH_PASS = process.env.APP_PASSWORD || "admin55";
// Token secret (eski sürümde "token sabiti" gibi kullanılıyordu).
// Burada signing secret olarak kullanıyoruz.
const AUTH_TOKEN = process.env.APP_TOKEN || "yeva-local-token";
const TOKEN_SECRET = process.env.APP_TOKEN_SECRET || AUTH_TOKEN;
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

function requirePermission(key) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(403).json({ message: "Yetersiz yetki" });
    if (u.role === "admin") return next();
    const p = u.permissions || {};
    if (p[key]) return next();
    return res.status(403).json({ message: "Yetersiz yetki" });
  };
}

function requireAnyPermission(keys) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(403).json({ message: "Yetersiz yetki" });
    if (u.role === "admin") return next();
    const p = u.permissions || {};
    if (keys.some((k) => p[k])) return next();
    return res.status(403).json({ message: "Yetersiz yetki" });
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  verifyUserPassword({ username, password })
    .then((user) => {
      if (!user) return res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı" });
      const exp = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 gün
      const permissions = normalizePermissions(user.permissions, user.role);
      const payload = { id: user.id, username: user.username, role: user.role, permissions, exp };
      const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
      const sig = createHmac("sha256", TOKEN_SECRET).update(payloadB64).digest("hex");
      const token = `v1.${payloadB64}.${sig}`;
      return res.json({ token, username: user.username, role: user.role, permissions });
    })
    .catch(() => res.status(500).json({ message: "Giriş doğrulanamadı" }));
});

app.get("/api/users", requireAdmin, async (_req, res) => {
  try {
    const users = await getUsers();
    res.json(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        created_at: u.created_at,
        permissions: normalizePermissions(u.permissions, u.role),
      }))
    );
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

app.patch("/api/users/:id/permissions", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ message: "Geçersiz kullanıcı id" });

  try {
    const row = await getUserById(userId);
    if (!row) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    if (row.role !== "data_entry") {
      return res.status(400).json({ message: "Yönetici hesaplarının yetkileri değiştirilemez" });
    }
    const current = normalizePermissions(row.permissions, row.role);
    const merged = mergePermissionsPatch(current, req.body || {});
    const json = permissionsJsonForDb(merged);
    const result = await updateUserPermissions({ userId, permissionsJson: json });
    if (!result.updated) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    res.json({ ok: true, permissions: merged });
  } catch (error) {
    res.status(500).json({ message: "Yetkiler güncellenemedi", error: String(error) });
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

/* ── İsim Havuzu (worker_names) ── */
app.get("/api/worker-names", requireAuth, async (req, res) => {
  try { res.json(await getWorkerNames()); }
  catch (e) { res.status(500).json({ message: String(e) }); }
});

app.post("/api/worker-names", requirePermission("ayarlar"), async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "İsim boş olamaz" });
  try { res.status(201).json(await addWorkerName(name)); }
  catch (e) {
    const msg = String(e);
    if (msg.includes("UNIQUE")) return res.status(409).json({ message: "Bu isim zaten kayıtlı" });
    res.status(500).json({ message: msg });
  }
});

app.put("/api/worker-names/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "İsim boş olamaz" });
  try {
    const r = await updateWorkerName(id, name);
    if (!r.updated) return res.status(404).json({ message: "Bulunamadı" });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: String(e) }); }
});

app.delete("/api/worker-names/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const r = await deleteWorkerName(id);
    if (!r.deleted) return res.status(404).json({ message: "Bulunamadı" });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: String(e) }); }
});

app.get("/api/teams", requireAuth, async (_req, res) => {
  try {
    res.json(await getTeams());
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

app.get("/api/processes", requireAuth, async (_req, res) => {
  try {
    res.json(await getProcesses());
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

app.post("/api/teams", requirePermission("ayarlar"), async (req, res) => {
  try {
    const row = await addTeam(req.body || {});
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.put("/api/teams/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Geçersiz id" });
  try {
    const r = await updateTeam(id, req.body || {});
    if (!r.updated) return res.status(404).json({ message: "Bulunamadı" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: String(e.message || e) });
  }
});

app.delete("/api/teams/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Geçersiz id" });
  try {
    const r = await deleteTeam(id);
    if (!r.deleted) return res.status(404).json({ message: "Bulunamadı" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.post("/api/processes", requirePermission("ayarlar"), async (req, res) => {
  try {
    const row = await addProcess(req.body || {});
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.put("/api/processes/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Geçersiz id" });
  try {
    const r = await updateProcess(id, req.body || {});
    if (!r.updated) return res.status(404).json({ message: "Bulunamadı" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.delete("/api/processes/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Geçersiz id" });
  try {
    const r = await deleteProcess(id);
    if (!r.deleted) return res.status(404).json({ message: "Bulunamadı" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.post("/api/workers", requireAuth, async (req, res) => {
  const { name, team, process, addedDate } = req.body;
  if (!name || !team || !process) {
    return res.status(400).json({ message: "name, team ve process zorunlu" });
  }

  const codes = await listTeamCodes();
  if (!codes.includes(String(team))) {
    return res.status(400).json({ message: "Geçersiz bölüm" });
  }
  const procNorm = String(process).trim().toUpperCase();
  const pnames = await listProcessNames();
  if (!pnames.includes(procNorm)) {
    return res.status(400).json({ message: "Geçersiz proses (ayarlardan tanımlı olmalı)" });
  }

  /* addedDate gönderilmezse bugünün tarihi kullanılır */
  const created_at = addedDate || new Date().toISOString().slice(0, 10);

  try {
    const worker = await createWorker({ name, team, process: procNorm, created_at });
    res.status(201).json(worker);
  } catch (error) {
    res.status(500).json({ message: "Çalışan eklenemedi", error: String(error) });
  }
});

app.put("/api/workers/:id", requireAuth, async (req, res) => {
  const workerId = Number(req.params.id);
  if (!workerId) return res.status(400).json({ message: "Geçersiz worker id" });

  const { process } = req.body;
  if (!process) return res.status(400).json({ message: "process zorunlu" });
  const procNorm = String(process).trim().toUpperCase();
  const pnames = await listProcessNames();
  if (!pnames.includes(procNorm)) {
    return res.status(400).json({ message: "Geçersiz proses" });
  }

  try {
    const result = await updateWorker(workerId, { process: procNorm });
    if (!result.updated) return res.status(404).json({ message: "Çalışan bulunamadı" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Çalışan güncellenemedi", error: String(error) });
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

app.get("/api/production/hedef-stage-totals", requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  try {
    const totals = await getHedefTakipStageTotals(String(startDate), String(endDate));
    res.json(totals);
  } catch (error) {
    res.status(500).json({ message: "Hedef takip verisi alınamadı", error: String(error) });
  }
});

app.get("/api/analytics/worker-comparison", requirePermission("karsilastirma"), async (req, res) => {
  const { worker1, worker2, startDate, endDate } = req.query;
  if (!worker1 || !worker2 || !startDate || !endDate) {
    return res.status(400).json({ message: "worker1, worker2, startDate ve endDate zorunlu" });
  }
  if (worker1 === worker2) {
    return res.status(400).json({ message: "Aynı kişi iki kez seçilemez" });
  }
  try {
    const data = await getWorkerComparisonData({
      worker1Id: Number(worker1),
      worker2Id: Number(worker2),
      startDate: String(startDate),
      endDate: String(endDate),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Karşılaştırma verisi alınamadı", error: String(error) });
  }
});

app.get("/api/analytics/worker-hourly", requireAnyPermission(["analysis", "ekran2", "ekran3"]), async (req, res) => {
  const { workerId, startDate, endDate } = req.query;
  if (!workerId || !startDate || !endDate) {
    return res.status(400).json({ message: "workerId, startDate ve endDate zorunlu" });
  }
  try {
    const data = await getWorkerHourlyBreakdown({
      workerId: Number(workerId),
      startDate: String(startDate),
      endDate: String(endDate),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Saatlik veri alınamadı", error: String(error) });
  }
});

app.get("/api/production/day-meta", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: "date zorunlu (YYYY-MM-DD)" });
  try {
    const meta = await getDayProductMeta(String(date));
    res.json(meta);
  } catch (error) {
    res.status(500).json({ message: "Gün ürün bilgisi alınamadı", error: String(error) });
  }
});

app.put("/api/production/day-meta", async (req, res) => {
  const { date, productName, productModel } = req.body || {};
  if (!date) return res.status(400).json({ message: "date zorunlu (YYYY-MM-DD)" });
  try {
    const meta = await upsertDayProductMeta({
      date: String(date),
      productName: productName ?? "",
      productModel: productModel ?? "",
    });
    res.json(meta);
  } catch (error) {
    res.status(500).json({ message: "Ürün bilgisi kaydedilemedi", error: String(error) });
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

app.get("/api/analytics/top-workers", requireAnyPermission(["analysis", "ekran2", "ekran3"]), async (req, res) => {
  const { startDate, endDate, team = "", limit = "20", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }

  const codes = await listTeamCodes();
  if (team && !codes.includes(String(team))) {
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

app.get("/api/analytics/daily-trend", requireAnyPermission(["analysis", "ekran2"]), async (req, res) => {
  const { startDate, endDate, team = "", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  const codes2 = await listTeamCodes();
  if (team && !codes2.includes(String(team))) {
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

app.get("/api/analytics/worker-daily", requireAnyPermission(["analysis", "ekran2"]), async (req, res) => {
  const { startDate, endDate, team = "", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  const codes3 = await listTeamCodes();
  if (team && !codes3.includes(String(team))) {
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
