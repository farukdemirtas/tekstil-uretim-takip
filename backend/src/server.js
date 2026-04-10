import "dotenv/config";
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
  deleteAllWorkersForVisibleDay,
  hideAllVisibleWorkersForSingleCalendarDay,
  copyRosterToFutureWeekdays,
  hideWorkerForSingleCalendarDay,
  unhideWorkerForSingleCalendarDay,
  listWorkersHiddenForCalendarDay,
  getDailyEntries,
  getDayProductMeta,
  upsertDayProductMeta,
  getDailyTrendAnalytics,
  getRangeStageTotals,
  getHedefTakipStageTotals,
  getWorkerComparisonData,
  getWorkerHourlyBreakdown,
  getWorkerProductionDailyDetail,
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
  getWorkersForAnalytics,
  getWorkerNameById,
  getWorkerNamesByIds,
  upsertEntriesBulk,
  upsertEntry,
  getProductionEntrySlots,
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
  insertActivityLog,
  listActivityLogs,
  listProductModels,
  getProductModelWithBaselines,
  createProductModel,
  updateProductModel,
  deleteProductModel,
  applyHedefSessionToDailyMeta,
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

function logActivity(req, action, resource, details) {
  const actor = req.user?.username || "?";
  const det =
    details === undefined || details === null
      ? ""
      : typeof details === "string"
        ? details
        : JSON.stringify(details);
  insertActivityLog({
    actor_username: actor,
    action,
    resource: resource ?? "",
    details: det,
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("activity_logs:", e?.message || e);
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/activity-logs", requirePermission("loglar"), async (req, res) => {
  const limit = Number(req.query.limit) || 200;
  const offset = Number(req.query.offset) || 0;
  const pick = (k) => {
    const v = req.query[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  try {
    const rows = await listActivityLogs({
      limit,
      offset,
      action: pick("action"),
      actor: pick("actor"),
      resource: pick("resource"),
      q: pick("q"),
      dateFrom: pick("dateFrom"),
      dateTo: pick("dateTo"),
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Loglar alınamadı", error: String(e) });
  }
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
      insertActivityLog({
        actor_username: user.username,
        action: "giris",
        resource: "oturum",
        details: "",
      }).catch(() => {});
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
    logActivity(req, "kullanici_olustur", "kullanici", { username: user.username, id: user.id });
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
    logActivity(req, "kullanici_sil", "kullanici", { id: userId });
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
    logActivity(req, "sifre_sifirla", "kullanici", { id: userId });
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
    logActivity(req, "yetki_guncelle", "kullanici", { id: userId, permissions: merged });
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

/** Analiz ekranları: aktif + üretim geçmişi olan pasif kayıtlar */
app.get("/api/workers/for-analysis", requireAnyPermission(["analysis", "ekran2"]), async (_req, res) => {
  try {
    const workers = await getWorkersForAnalytics();
    res.json(workers);
  } catch (error) {
    res.status(500).json({ message: "Çalışan listesi alınamadı", error: String(error) });
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
  try {
    const row = await addWorkerName(name);
    logActivity(req, "isim_havuzu_ekle", "worker_names", { id: row.id, name: row.name });
    res.status(201).json(row);
  }
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
    logActivity(req, "isim_havuzu_guncelle", "worker_names", { id, name: name.trim().toUpperCase() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: String(e) }); }
});

app.delete("/api/worker-names/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const r = await deleteWorkerName(id);
    if (!r.deleted) return res.status(404).json({ message: "Bulunamadı" });
    logActivity(req, "isim_havuzu_sil", "worker_names", { id });
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
    logActivity(req, "bolum_ekle", "teams", { id: row.id, code: row.code, label: row.label });
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
    logActivity(req, "bolum_guncelle", "teams", { id, ...req.body });
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
    logActivity(req, "bolum_sil", "teams", { id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.post("/api/processes", requirePermission("ayarlar"), async (req, res) => {
  try {
    const row = await addProcess(req.body || {});
    logActivity(req, "proses_ekle", "processes", { id: row.id, name: row.name });
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
    logActivity(req, "proses_guncelle", "processes", { id, ...req.body });
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
    logActivity(req, "proses_sil", "processes", { id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.get("/api/product-models", requireAuth, async (_req, res) => {
  try {
    res.json(await listProductModels());
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

app.get("/api/product-models/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Geçersiz id" });
  try {
    const row = await getProductModelWithBaselines(id);
    if (!row) return res.status(404).json({ message: "Bulunamadı" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

app.post("/api/product-models", requirePermission("ayarlar"), async (req, res) => {
  try {
    const teamCodes = await listTeamCodes();
    const created = await createProductModel(req.body || {}, teamCodes);
    logActivity(req, "urun_model_ekle", "product_models", { id: created.id, modelCode: created.modelCode });
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.put("/api/product-models/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Geçersiz id" });
  try {
    const teamCodes = await listTeamCodes();
    const updated = await updateProductModel(id, req.body || {}, teamCodes);
    logActivity(req, "urun_model_guncelle", "product_models", { id, modelCode: updated.modelCode });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

app.delete("/api/product-models/:id", requirePermission("ayarlar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Geçersiz id" });
  try {
    const r = await deleteProductModel(id);
    if (!r.deleted) return res.status(404).json({ message: "Bulunamadı" });
    logActivity(req, "urun_model_sil", "product_models", { id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: String(e.message || e) });
  }
});

app.post("/api/hedef/apply-session", requirePermission("hedefTakip"), async (req, res) => {
  const { modelId, startDate, endDate, productName, productModel } = req.body || {};
  const mid = Number(modelId);
  if (!Number.isFinite(mid) || mid < 1) {
    return res.status(400).json({ message: "modelId gerekli" });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu" });
  }
  try {
    const m = await getProductModelWithBaselines(mid);
    if (!m) return res.status(404).json({ message: "Model bulunamadı" });
    const pn =
      productName != null && String(productName).trim() !== ""
        ? String(productName).trim()
        : String(m.productName || "");
    const pmd =
      productModel != null && String(productModel).trim() !== ""
        ? String(productModel).trim()
        : String(m.modelCode || "");
    const result = await applyHedefSessionToDailyMeta({
      modelId: mid,
      startDate: String(startDate),
      endDate: String(endDate),
      productName: pn,
      productModel: pmd,
    });
    logActivity(req, "hedef_oturum_uygula", "hedef", JSON.stringify({ modelId: mid, startDate, endDate, dates: result.datesUpdated }));
    res.json(result);
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
    logActivity(req, "calisan_ekle", "workers", {
      id: worker.id,
      name: worker.name,
      team: worker.team,
      process: worker.process,
    });
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
    const workerName = await getWorkerNameById(workerId);
    logActivity(req, "calisan_guncelle", "workers", {
      id: workerId,
      process: procNorm,
      name: workerName || undefined,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Çalışan güncellenemedi", error: String(error) });
  }
});

app.get("/api/workers/roster-hidden", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "date zorunlu (YYYY-MM-DD)" });
  }
  try {
    const rows = await listWorkersHiddenForCalendarDay(String(date));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Liste alınamadı", error: String(error) });
  }
});

/** Yalnızca seçili takvim günü listede gösterme (sahada yok); üretim satırı silinmez. */
app.post("/api/workers/:id/hide-for-day", requireAuth, async (req, res) => {
  const workerId = Number(req.params.id);
  const { date } = req.body || {};
  if (!workerId || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "Geçersiz çalışan veya tarih (YYYY-MM-DD)" });
  }
  try {
    const workerName = await getWorkerNameById(workerId);
    const result = await hideWorkerForSingleCalendarDay(workerId, date);
    logActivity(req, "calisan_gun_gizle", "workers", {
      id: workerId,
      date,
      name: workerName || undefined,
    });
    return res.json({ ok: true, hidden: result.hidden });
  } catch (error) {
    return res.status(500).json({ message: "Günlük gizleme başarısız", error: String(error) });
  }
});

app.delete("/api/workers/:id/hide-for-day", requireAuth, async (req, res) => {
  const workerId = Number(req.params.id);
  const { date } = req.query;
  if (!workerId || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "Geçersiz çalışan veya tarih (YYYY-MM-DD)" });
  }
  try {
    const workerName = await getWorkerNameById(workerId);
    const result = await unhideWorkerForSingleCalendarDay(workerId, date);
    logActivity(req, "calisan_gun_goster", "workers", {
      id: workerId,
      date,
      name: workerName || undefined,
    });
    return res.json({ ok: true, removed: result.removed });
  } catch (error) {
    return res.status(500).json({ message: "Gizleme kaldırılamadı", error: String(error) });
  }
});

app.delete("/api/workers/for-day", requirePermission("topluListeKaldir"), async (req, res) => {
  const { date } = req.query;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "Geçersiz veya eksik date (YYYY-MM-DD)" });
  }
  const scopeRaw = typeof req.query.scope === "string" ? req.query.scope.trim() : "from_day";
  const scope = scopeRaw === "only_day" ? "only_day" : "from_day";
  try {
    if (scope === "only_day") {
      const result = await hideAllVisibleWorkersForSingleCalendarDay(date);
      logActivity(req, "calisan_toplu_liste_kaldir", "workers", {
        date,
        count: result.hidden,
        scope: "only_day",
      });
      return res.json({ ok: true, removed: result.hidden, scope: "only_day" });
    }
    const result = await deleteAllWorkersForVisibleDay(date);
    logActivity(req, "calisan_toplu_liste_kaldir", "workers", {
      date,
      count: result.removed,
      scope: "from_day",
    });
    return res.json({ ok: true, removed: result.removed, scope: "from_day" });
  } catch (error) {
    res.status(500).json({ message: "Toplu silme başarısız", error: String(error) });
  }
});

app.post("/api/workers/copy-roster-to-dates", requireAdmin, async (req, res) => {
  const { sourceDate, endDate } = req.body || {};
  if (typeof sourceDate !== "string" || typeof endDate !== "string") {
    return res.status(400).json({ message: "sourceDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  try {
    const result = await copyRosterToFutureWeekdays(String(sourceDate), String(endDate));
    logActivity(req, "personel_roster_aktar", "workers", {
      sourceDate,
      endDate,
      ...result,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: String(error.message || error) });
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
    const workerName = await getWorkerNameById(workerId);
    const result = deletedAt ? await deleteWorkerForDate(workerId, deletedAt) : await deleteWorker(workerId);
    if (!result.deleted) {
      return res.status(404).json({ message: "Çalışan bulunamadı" });
    }
    logActivity(req, "calisan_sil", "workers", {
      id: workerId,
      date: deletedAt || "tam",
      name: workerName || undefined,
    });
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
  const { startDate, endDate, modelId: modelIdRaw } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  const modelId =
    modelIdRaw != null && String(modelIdRaw).trim() !== "" && Number.isFinite(Number(modelIdRaw))
      ? Number(modelIdRaw)
      : null;
  try {
    const totals = await getHedefTakipStageTotals(String(startDate), String(endDate), modelId);
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

app.get("/api/analytics/worker-production-detail", requireAnyPermission(["analysis", "ekran2"]), async (req, res) => {
  const { workerId, startDate, endDate, includeSameNameWorkers } = req.query;
  if (!workerId || !startDate || !endDate) {
    return res.status(400).json({ message: "workerId, startDate ve endDate zorunlu" });
  }
  const wid = Number(workerId);
  if (!Number.isFinite(wid) || wid < 1) {
    return res.status(400).json({ message: "Geçersiz workerId" });
  }
  const includeSame =
    includeSameNameWorkers === "1" ||
    includeSameNameWorkers === "true" ||
    String(includeSameNameWorkers).toLowerCase() === "yes";
  try {
    const rows = await getWorkerProductionDailyDetail({
      workerId: wid,
      startDate: String(startDate),
      endDate: String(endDate),
      includeSameNameWorkers: includeSame,
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Kişi günlük detay alınamadı", error: String(error) });
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
  const { date, productName, productModel, modelId, metaSource } = req.body || {};
  if (!date) return res.status(400).json({ message: "date zorunlu (YYYY-MM-DD)" });
  try {
    const meta = await upsertDayProductMeta({
      date: String(date),
      productName: productName ?? "",
      productModel: productModel ?? "",
      modelId,
      metaSource: metaSource ?? "manual",
    });
    logActivity(req, "urun_meta_guncelle", "daily_product_meta", {
      date,
      productName: meta.productName,
      productModel: meta.productModel,
      modelId: meta.modelId,
      metaSource: meta.metaSource,
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
  const { startDate, endDate, team = "", process = "", limit = "20", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }

  const codes = await listTeamCodes();
  if (team && !codes.includes(String(team))) {
    return res.status(400).json({ message: "Geçersiz grup filtresi" });
  }
  const pnamesTop = await listProcessNames();
  if (process && !pnamesTop.includes(String(process))) {
    return res.status(400).json({ message: "Geçersiz proses filtresi" });
  }
  if (!VALID_HOURS.includes(String(hour))) {
    return res.status(400).json({ message: "Geçersiz saat filtresi" });
  }

  try {
    const rows = await getTopWorkersAnalytics({
      startDate: String(startDate),
      endDate: String(endDate),
      team: String(team),
      process: String(process),
      limit: Number(limit) || 20,
      hourColumn: String(hour)
    });
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Analiz verisi alınamadı", error: String(error) });
  }
});

app.get("/api/analytics/daily-trend", requireAnyPermission(["analysis", "ekran2"]), async (req, res) => {
  const { startDate, endDate, team = "", process = "", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  const codes2 = await listTeamCodes();
  if (team && !codes2.includes(String(team))) {
    return res.status(400).json({ message: "Geçersiz grup filtresi" });
  }
  const pnamesTrend = await listProcessNames();
  if (process && !pnamesTrend.includes(String(process))) {
    return res.status(400).json({ message: "Geçersiz proses filtresi" });
  }
  if (!VALID_HOURS.includes(String(hour))) {
    return res.status(400).json({ message: "Geçersiz saat filtresi" });
  }

  try {
    const rows = await getDailyTrendAnalytics({
      startDate: String(startDate),
      endDate: String(endDate),
      team: String(team),
      process: String(process),
      hourColumn: String(hour)
    });
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Trend verisi alınamadı", error: String(error) });
  }
});

app.get("/api/analytics/worker-daily", requireAnyPermission(["analysis", "ekran2"]), async (req, res) => {
  const { startDate, endDate, team = "", process = "", hour = "" } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate ve endDate zorunlu (YYYY-MM-DD)" });
  }
  const codes3 = await listTeamCodes();
  if (team && !codes3.includes(String(team))) {
    return res.status(400).json({ message: "Geçersiz grup filtresi" });
  }
  const pnamesDaily = await listProcessNames();
  if (process && !pnamesDaily.includes(String(process))) {
    return res.status(400).json({ message: "Geçersiz proses filtresi" });
  }
  if (!VALID_HOURS.includes(String(hour))) {
    return res.status(400).json({ message: "Geçersiz saat filtresi" });
  }

  try {
    const rows = await getWorkerDailyAnalytics({
      startDate: String(startDate),
      endDate: String(endDate),
      team: String(team),
      process: String(process),
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
    const wid = Number(workerId);
    const dateStr = String(date);
    const t1000n = Number(t1000) || 0;
    const t1300n = Number(t1300) || 0;
    const t1600n = Number(t1600) || 0;
    const t1830n = Number(t1830) || 0;
    const prev = await getProductionEntrySlots(wid, dateStr);
    const unchanged =
      prev !== null &&
      prev.t1000 === t1000n &&
      prev.t1300 === t1300n &&
      prev.t1600 === t1600n &&
      prev.t1830 === t1830n;
    await upsertEntry({
      workerId: wid,
      date: dateStr,
      t1000: t1000n,
      t1300: t1300n,
      t1600: t1600n,
      t1830: t1830n
    });
    if (!unchanged) {
      const workerName = await getWorkerNameById(wid);
      logActivity(req, "uretim_kayit", "production_entries", {
        workerId: wid,
        date: dateStr,
        workerName: workerName || undefined,
      });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Üretim verisi kaydedilemedi", error: String(error) });
  }
});

app.post("/api/production/bulk", requireAdmin, async (req, res) => {
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
    const idList = normalized.map((e) => e.workerId);
    const nameMap = await getWorkerNamesByIds(idList);
    const seen = new Set();
    const labels = [];
    for (const id of idList) {
      if (seen.has(id)) continue;
      seen.add(id);
      const nm = nameMap[id];
      labels.push(nm ? nm : `#${id}`);
    }
    let workerNames = labels.join(", ");
    if (workerNames.length > 3500) workerNames = `${workerNames.slice(0, 3490)}…`;
    logActivity(req, "uretim_toplu", "production_entries", {
      date: String(date),
      satir: normalized.length,
      workerNames,
    });
    return res.json({ ok: true, count: normalized.length });
  } catch (error) {
    return res.status(500).json({ message: "Toplu kayıt başarısız", error: String(error) });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
});
