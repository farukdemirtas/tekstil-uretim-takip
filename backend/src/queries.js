import db from "./db.js";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

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

export function getWorkers() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id, name, team, process FROM workers ORDER BY team, process, name",
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

export function createWorker({ name, team, process }) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO workers (name, team, process) VALUES (?, ?, ?)",
      [name, team, process],
      function onInsert(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, name, team, process });
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
      WHERE (w.deleted_at IS NULL OR w.deleted_at > ?)
      ORDER BY w.team, w.process, w.name
      `,
      [date, date],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
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

export function getUsers() {
  return new Promise((resolve, reject) => {
    db.all("SELECT id, username, role, created_at FROM users ORDER BY id DESC", [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
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
      "INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, 'data_entry')",
      [trimmed, password_hash, salt],
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
      "SELECT id, username, role, password_hash, salt FROM users WHERE username = ? LIMIT 1",
      [trimmed],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        const incomingHash = hashPassword(String(password), row.salt);
        const ok = constantTimeEqual(incomingHash, row.password_hash);
        if (!ok) return resolve(null);

        resolve({ id: row.id, username: row.username, role: row.role });
      }
    );
  });
}
