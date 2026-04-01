import db from "./db.js";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { DEFAULT_DATA_ENTRY_PERMISSIONS, permissionsJsonForDb } from "./permissions.js";

const DEFAULT_PERMS_JSON = permissionsJsonForDb(DEFAULT_DATA_ENTRY_PERMISSIONS);

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 310000, 64, "sha512").toString("hex");
}

function constantTimeEqual(a, b) {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function getWorkerNames() {
  return new Promise((resolve, reject) => {
    db.all("SELECT id, name FROM worker_names ORDER BY name COLLATE NOCASE", [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export function addWorkerName(name) {
  return new Promise((resolve, reject) => {
    db.run("INSERT INTO worker_names (name) VALUES (?)", [name.trim().toUpperCase()], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, name: name.trim().toUpperCase() });
    });
  });
}

export function updateWorkerName(id, name) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE worker_names SET name = ? WHERE id = ?", [name.trim().toUpperCase(), id], function (err) {
      if (err) return reject(err);
      resolve({ updated: this.changes > 0 });
    });
  });
}

export function deleteWorkerName(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM worker_names WHERE id = ?", [id], function (err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes > 0 });
    });
  });
}

export function getWorkers() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, name, team, process, created_at
       FROM workers
       WHERE deleted_at IS NULL
       ORDER BY team, process, name`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

export function createWorker({ name, team, process, created_at }) {
  const addedDate = created_at || new Date().toISOString().slice(0, 10);
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO workers (name, team, process, created_at) VALUES (?, ?, ?, ?)",
      [name, team, process, addedDate],
      function onInsert(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, name, team, process, created_at: addedDate });
      }
    );
  });
}

export function updateWorker(workerId, { process }) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE workers SET process = ? WHERE id = ?",
      [process, workerId],
      function onUpdate(err) {
        if (err) return reject(err);
        resolve({ updated: this.changes > 0 });
      }
    );
  });
}

export function deleteWorker(workerId) {
  // NOTE: Hard delete yerine soft delete kullanıyoruz.
  // Böylece geçmiş üretim kayıtları silinmeden, tarih bazlı sorgularda görünmeye devam eder.
  return new Promise((resolve, reject) => {
    db.run("UPDATE workers SET deleted_at = COALESCE(deleted_at, date('now')) WHERE id = ?", [workerId], function onUpdate(err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes > 0 });
    });
  });
}

export function deleteWorkerForDate(workerId, date) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE workers SET deleted_at = COALESCE(?, date('now')) WHERE id = ?",
      [date, workerId],
      function onUpdate(err) {
        if (err) return reject(err);
        resolve({ deleted: this.changes > 0 });
      }
    );
  });
}

export function getDailyEntries(date) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT
        w.id AS workerId,
        w.name,
        w.team,
        w.process,
        COALESCE(p.t1000, 0) AS t1000,
        COALESCE(p.t1300, 0) AS t1300,
        COALESCE(p.t1600, 0) AS t1600,
        COALESCE(p.t1830, 0) AS t1830
      FROM workers w
      LEFT JOIN production_entries p
        ON p.worker_id = w.id
        AND p.production_date = ?
      WHERE (w.created_at IS NULL OR w.created_at <= ?)
        AND (w.deleted_at IS NULL OR w.deleted_at > ?)
      ORDER BY w.team, w.process, w.name
      `,
      [date, date, date],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

export function getDayProductMeta(date) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT product_name AS productName, product_model AS productModel FROM daily_product_meta WHERE production_date = ?",
      [date],
      (err, row) => {
        if (err) return reject(err);
        resolve({
          productName: row?.productName != null ? String(row.productName) : "",
          productModel: row?.productModel != null ? String(row.productModel) : "",
        });
      }
    );
  });
}

export function upsertDayProductMeta({ date, productName, productModel }) {
  const name = String(productName ?? "").trim();
  const model = String(productModel ?? "").trim();
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO daily_product_meta (production_date, product_name, product_model)
      VALUES (?, ?, ?)
      ON CONFLICT(production_date) DO UPDATE SET
        product_name = excluded.product_name,
        product_model = excluded.product_model
      `,
      [date, name, model],
      (err) => {
        if (err) return reject(err);
        resolve({ productName: name, productModel: model });
      }
    );
  });
}

export function upsertEntry({ workerId, date, t1000, t1300, t1600, t1830 }) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO production_entries (worker_id, production_date, t1000, t1300, t1600, t1830)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(worker_id, production_date) DO UPDATE SET
        t1000 = excluded.t1000,
        t1300 = excluded.t1300,
        t1600 = excluded.t1600,
        t1830 = excluded.t1830
      `,
      [workerId, date, t1000, t1300, t1600, t1830],
      (err) => {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

export function upsertEntriesBulk(entries) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      const stmt = db.prepare(
        `
        INSERT INTO production_entries (worker_id, production_date, t1000, t1300, t1600, t1830)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(worker_id, production_date) DO UPDATE SET
          t1000 = excluded.t1000,
          t1300 = excluded.t1300,
          t1600 = excluded.t1600,
          t1830 = excluded.t1830
        `
      );

      for (const entry of entries) {
        stmt.run([
          entry.workerId,
          entry.date,
          entry.t1000,
          entry.t1300,
          entry.t1600,
          entry.t1830
        ]);
      }

      stmt.finalize((err) => {
        if (err) {
          db.run("ROLLBACK");
          return reject(err);
        }
        db.run("COMMIT", (commitErr) => {
          if (commitErr) return reject(commitErr);
          resolve(true);
        });
      });
    });
  });
}

function getHourExpression(hourColumn = "") {
  if (hourColumn === "t1000") return "COALESCE(p.t1000, 0)";
  if (hourColumn === "t1300") return "COALESCE(p.t1300, 0)";
  if (hourColumn === "t1600") return "COALESCE(p.t1600, 0)";
  if (hourColumn === "t1830") return "COALESCE(p.t1830, 0)";
  return "COALESCE(p.t1000, 0) + COALESCE(p.t1300, 0) + COALESCE(p.t1600, 0) + COALESCE(p.t1830, 0)";
}

export function getTopWorkersAnalytics({ startDate, endDate, team = "", limit = 20, hourColumn = "" }) {
  const productionExpr = getHourExpression(hourColumn);
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT
        w.id AS workerId,
        w.name,
        w.team,
        w.process,
        COUNT(p.id) AS activeDays,
        SUM(${productionExpr}) AS totalProduction
      FROM workers w
      JOIN production_entries p ON p.worker_id = w.id
      WHERE p.production_date BETWEEN ? AND ?
        AND (? = '' OR w.team = ?)
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      GROUP BY w.id, w.name, w.team, w.process
      ORDER BY totalProduction DESC, w.name ASC
      LIMIT ?
      `,
      [startDate, endDate, team, team, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(
          rows.map((row) => ({
            ...row,
            activeDays: Number(row.activeDays) || 0,
            totalProduction: Number(row.totalProduction) || 0
          }))
        );
      }
    );
  });
}

export function getDailyTrendAnalytics({ startDate, endDate, team = "", hourColumn = "" }) {
  const productionExpr = getHourExpression(hourColumn);
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT
        p.production_date AS productionDate,
        SUM(${productionExpr}) AS totalProduction
      FROM production_entries p
      JOIN workers w ON w.id = p.worker_id
      WHERE p.production_date BETWEEN ? AND ?
        AND (? = '' OR w.team = ?)
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      GROUP BY p.production_date
      ORDER BY p.production_date ASC
      `,
      [startDate, endDate, team, team],
      (err, rows) => {
        if (err) return reject(err);
        resolve(
          rows.map((row) => ({
            ...row,
            totalProduction: Number(row.totalProduction) || 0
          }))
        );
      }
    );
  });
}

export function getWorkerDailyAnalytics({ startDate, endDate, team = "", hourColumn = "" }) {
  const productionExpr = getHourExpression(hourColumn);
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT
        p.production_date AS productionDate,
        w.id AS workerId,
        w.name,
        w.team,
        w.process,
        (${productionExpr}) AS production
      FROM production_entries p
      JOIN workers w ON w.id = p.worker_id
      WHERE p.production_date BETWEEN ? AND ?
        AND (? = '' OR w.team = ?)
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      ORDER BY p.production_date ASC, production DESC, w.name ASC
      `,
      [startDate, endDate, team, team],
      (err, rows) => {
        if (err) return reject(err);
        resolve(
          rows.map((row) => ({
            ...row,
            production: Number(row.production) || 0
          }))
        );
      }
    );
  });
}

export function getRangeStageTotals(startDate, endDate) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT
        w.team,
        SUM(
          COALESCE(p.t1000, 0) +
          COALESCE(p.t1300, 0) +
          COALESCE(p.t1600, 0) +
          COALESCE(p.t1830, 0)
        ) AS total
      FROM production_entries p
      JOIN workers w ON w.id = p.worker_id
      WHERE p.production_date BETWEEN ? AND ?
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      GROUP BY w.team
      `,
      [startDate, endDate],
      (err, rows) => {
        if (err) return reject(err);
        const totals = { SAG_ON: 0, SOL_ON: 0, YAKA_HAZIRLIK: 0, ARKA_HAZIRLIK: 0, BITIM: 0 };
        for (const row of rows) {
          if (row.team in totals) totals[row.team] = Number(row.total) || 0;
        }
        resolve(totals);
      }
    );
  });
}

/** Hedef Takip ekranı: takım + belirli proseslere göre aşama adetleri (Bitim = BITIM + DÜĞME) */
export function getHedefTakipStageTotals(startDate, endDate) {
  const line =
    "COALESCE(p.t1000, 0) + COALESCE(p.t1300, 0) + COALESCE(p.t1600, 0) + COALESCE(p.t1830, 0)";
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT
        COALESCE(SUM(CASE WHEN w.team = 'SAG_ON' AND w.process = 'SAĞ KOL ÇIMA' THEN ${line} ELSE 0 END), 0) AS sag_on,
        COALESCE(SUM(CASE WHEN w.team = 'SOL_ON' AND w.process = 'SOL KOL ÇIMA' THEN ${line} ELSE 0 END), 0) AS sol_on,
        COALESCE(SUM(CASE WHEN w.team = 'YAKA_HAZIRLIK' AND w.process = 'YAKA İÇ ÇIMA' THEN ${line} ELSE 0 END), 0) AS yaka,
        COALESCE(SUM(CASE WHEN w.team = 'ARKA_HAZIRLIK' AND w.process = 'ARKA KOL ÇIMA' THEN ${line} ELSE 0 END), 0) AS arka_raw,
        COALESCE(SUM(CASE WHEN w.team = 'BITIM' AND w.process = 'DÜĞME' THEN ${line} ELSE 0 END), 0) AS bitim
      FROM production_entries p
      JOIN workers w ON w.id = p.worker_id
      WHERE p.production_date BETWEEN ? AND ?
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      `,
      [startDate, endDate],
      (err, row) => {
        if (err) return reject(err);
        const arkaRaw = Number(row.arka_raw) || 0;
        resolve({
          SAG_ON: Number(row.sag_on) || 0,
          SOL_ON: Number(row.sol_on) || 0,
          YAKA_HAZIRLIK: Number(row.yaka) || 0,
          ARKA_HAZIRLIK: arkaRaw / 2,
          BITIM: Number(row.bitim) || 0,
        });
      }
    );
  });
}

export function getWorkerComparisonData({ worker1Id, worker2Id, startDate, endDate }) {
  return new Promise((resolve, reject) => {
    // Hourly totals + summary for both workers
    db.all(
      `
      SELECT
        w.id          AS workerId,
        w.name,
        w.team,
        w.process,
        COALESCE(SUM(p.t1000), 0) AS t1000,
        COALESCE(SUM(p.t1300), 0) AS t1300,
        COALESCE(SUM(p.t1600), 0) AS t1600,
        COALESCE(SUM(p.t1830), 0) AS t1830,
        COALESCE(SUM(COALESCE(p.t1000,0) + COALESCE(p.t1300,0) + COALESCE(p.t1600,0) + COALESCE(p.t1830,0)), 0) AS total,
        COUNT(DISTINCT p.production_date) AS activeDays
      FROM workers w
      LEFT JOIN production_entries p
        ON p.worker_id = w.id
        AND p.production_date BETWEEN ? AND ?
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      WHERE w.id IN (?, ?)
      GROUP BY w.id
      `,
      [startDate, endDate, worker1Id, worker2Id],
      (err, workerRows) => {
        if (err) return reject(err);

        // Daily totals for both workers
        db.all(
          `
          SELECT
            p.production_date AS date,
            w.id AS workerId,
            COALESCE(p.t1000,0) + COALESCE(p.t1300,0) + COALESCE(p.t1600,0) + COALESCE(p.t1830,0) AS production
          FROM production_entries p
          JOIN workers w ON w.id = p.worker_id
          WHERE p.worker_id IN (?, ?)
            AND p.production_date BETWEEN ? AND ?
            AND (w.created_at IS NULL OR w.created_at <= p.production_date)
            AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
          ORDER BY p.production_date ASC
          `,
          [worker1Id, worker2Id, startDate, endDate],
          (err2, dailyRows) => {
            if (err2) return reject(err2);

            const toNum = (v) => Number(v) || 0;
            const fmt = (r) => r ? {
              workerId: r.workerId,
              name: r.name,
              team: r.team,
              process: r.process,
              t1000: toNum(r.t1000),
              t1300: toNum(r.t1300),
              t1600: toNum(r.t1600),
              t1830: toNum(r.t1830),
              total: toNum(r.total),
              activeDays: toNum(r.activeDays),
            } : null;

            const dateMap = new Map();
            for (const row of dailyRows) {
              if (!dateMap.has(row.date)) dateMap.set(row.date, { date: row.date, w1: 0, w2: 0 });
              const entry = dateMap.get(row.date);
              if (Number(row.workerId) === Number(worker1Id)) entry.w1 = toNum(row.production);
              else entry.w2 = toNum(row.production);
            }

            resolve({
              worker1: fmt(workerRows.find((r) => Number(r.workerId) === Number(worker1Id))),
              worker2: fmt(workerRows.find((r) => Number(r.workerId) === Number(worker2Id))),
              daily: [...dateMap.values()],
            });
          }
        );
      }
    );
  });
}

export function getWorkerHourlyBreakdown({ workerId, startDate, endDate }) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT
        COALESCE(SUM(p.t1000), 0) AS t1000,
        COALESCE(SUM(p.t1300), 0) AS t1300,
        COALESCE(SUM(p.t1600), 0) AS t1600,
        COALESCE(SUM(p.t1830), 0) AS t1830
      FROM production_entries p
      JOIN workers w ON w.id = p.worker_id
      WHERE p.worker_id = ?
        AND p.production_date BETWEEN ? AND ?
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      `,
      [workerId, startDate, endDate],
      (err, row) => {
        if (err) return reject(err);
        resolve({
          t1000: Number(row?.t1000) || 0,
          t1300: Number(row?.t1300) || 0,
          t1600: Number(row?.t1600) || 0,
          t1830: Number(row?.t1830) || 0,
        });
      }
    );
  });
}

export function getUsers() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id, username, role, created_at, IFNULL(permissions, '{}') AS permissions FROM users ORDER BY id DESC",
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

export function getUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, username, role, IFNULL(permissions, '{}') AS permissions FROM users WHERE id = ? LIMIT 1",
      [userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

export function createUser({ username, password }) {
  return new Promise((resolve, reject) => {
    const trimmed = String(username || "").trim();
    if (!trimmed) return reject(new Error("username zorunlu"));
    if (!password || String(password).length < 4) return reject(new Error("Sifre en az 4 karakter olmalı"));

    const salt = randomBytes(16).toString("hex");
    const password_hash = hashPassword(String(password), salt);

    db.run(
      "INSERT INTO users (username, password_hash, salt, role, permissions) VALUES (?, ?, ?, 'data_entry', ?)",
      [trimmed, password_hash, salt, DEFAULT_PERMS_JSON],
      function onInsert(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, username: trimmed, role: "data_entry" });
      }
    );
  });
}

export function deleteUser(userId) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM users WHERE id = ? AND username <> 'admin'", [userId], function onDelete(err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes > 0 });
    });
  });
}

export function updateUserPermissions({ userId, permissionsJson }) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET permissions = ? WHERE id = ? AND role = 'data_entry'",
      [permissionsJson, userId],
      function onUpdate(err) {
        if (err) return reject(err);
        resolve({ updated: this.changes > 0 });
      }
    );
  });
}

export function resetUserPassword({ userId, password }) {
  return new Promise((resolve, reject) => {
    if (!password || String(password).length < 4) return reject(new Error("Sifre en az 4 karakter olmalı"));

    const salt = randomBytes(16).toString("hex");
    const password_hash = hashPassword(String(password), salt);

    db.run(
      "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
      [password_hash, salt, userId],
      function onUpdate(err) {
        if (err) return reject(err);
        resolve({ updated: this.changes > 0 });
      }
    );
  });
}

export function verifyUserPassword({ username, password }) {
  return new Promise((resolve, reject) => {
    const trimmed = String(username || "").trim();
    if (!trimmed) return resolve(null);

    db.get(
      "SELECT id, username, role, password_hash, salt, IFNULL(permissions, '{}') AS permissions FROM users WHERE username = ? LIMIT 1",
      [trimmed],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        const incomingHash = hashPassword(String(password), row.salt);
        const ok = constantTimeEqual(incomingHash, row.password_hash);
        if (!ok) return resolve(null);

        resolve({
          id: row.id,
          username: row.username,
          role: row.role,
          permissions: row.permissions,
        });
      }
    );
  });
}
