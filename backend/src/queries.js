import db from "./db.js";
import { turkeyCalendarDayStartUtcSql, turkeyCalendarDayEndUtcSql, utcNowSqlite } from "./datetimeIstanbul.js";
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

/** Analiz / kişi raporu: aktif personel + geçmişte üretim kaydı olan pasif (listeden düşmüş) kayıtlar */
export function getWorkersForAnalytics() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT w.id, w.name, w.team, w.process, w.created_at, w.deleted_at
       FROM workers w
       WHERE w.deleted_at IS NULL
          OR EXISTS (SELECT 1 FROM production_entries p WHERE p.worker_id = w.id)
       ORDER BY (w.deleted_at IS NULL) DESC, w.team, w.process, w.name`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

/** Aktivite logu için (silinmiş / pasif çalışanlar dahil). */
export function getWorkerNameById(workerId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT name FROM workers WHERE id = ?", [workerId], (err, row) => {
      if (err) return reject(err);
      resolve(row?.name != null ? String(row.name) : "");
    });
  });
}

export function getWorkerNamesByIds(workerIds) {
  const ids = [...new Set((workerIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return Promise.resolve({});
  const placeholders = ids.map(() => "?").join(",");
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, name FROM workers WHERE id IN (${placeholders})`, ids, (err, rows) => {
      if (err) return reject(err);
      const map = {};
      for (const r of rows || []) map[Number(r.id)] = String(r.name);
      resolve(map);
    });
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
    /* deleted_at = ilk listeden düşüldüğü gün. Daha sonraki bir tarihle sil denirse tarihi ileri alma —
       yoksa o gün ve öncesi tekrar görünür; geçmiş günler etkilenmiş gibi olur. */
    db.run(
      `UPDATE workers SET deleted_at = CASE
         WHEN deleted_at IS NULL OR deleted_at > ? THEN ?
         ELSE deleted_at
       END
       WHERE id = ?`,
      [date, date, workerId],
      function onUpdate(err) {
        if (err) return reject(err);
        resolve({ deleted: this.changes > 0 });
      }
    );
  });
}

/** Ana ekranda seçili günde görünen tüm çalışanları listeden kaldırır (soft delete). Üretim satırları silinmez; seçilen günden önceki günler analizde ve listede kalır. */
export function deleteAllWorkersForVisibleDay(date) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE workers SET deleted_at = CASE
         WHEN deleted_at IS NULL OR deleted_at > ? THEN ?
         ELSE deleted_at
       END
       WHERE (created_at IS NULL OR created_at <= ?)
         AND (deleted_at IS NULL OR deleted_at > ?)`,
      [date, date, date, date],
      function onUpdate(err) {
        if (err) return reject(err);
        resolve({ removed: this.changes });
      }
    );
  });
}

/** Tek çalışan: yalnızca o gün listede gösterme (sahada yok). */
export function hideWorkerForSingleCalendarDay(workerId, date) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO worker_roster_day_hide (worker_id, hide_date) VALUES (?, ?)`,
      [workerId, date],
      function onRun(err) {
        if (err) return reject(err);
        resolve({ hidden: this.changes > 0 });
      }
    );
  });
}

/** O gün için roster gizlemesi olan çalışanlar (geri alma listesi). */
export function listWorkersHiddenForCalendarDay(date) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT w.id AS workerId, w.name AS name
       FROM worker_roster_day_hide h
       JOIN workers w ON w.id = h.worker_id
       WHERE h.hide_date = ?
       ORDER BY w.name`,
      [date],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

/** Tek çalışan: o gün için gizlemeyi kaldır (yeniden listele). */
export function unhideWorkerForSingleCalendarDay(workerId, date) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM worker_roster_day_hide WHERE worker_id = ? AND hide_date = ?`,
      [workerId, date],
      function onRun(err) {
        if (err) return reject(err);
        resolve({ removed: this.changes > 0 });
      }
    );
  });
}

/** Yalnızca o takvim günü ana listede gösterme; ertesi günlerde yine listelenir. */
export function hideAllVisibleWorkersForSingleCalendarDay(date) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO worker_roster_day_hide (worker_id, hide_date)
       SELECT w.id, ? FROM workers w
       WHERE (w.created_at IS NULL OR w.created_at <= ?)
         AND (w.deleted_at IS NULL OR w.deleted_at > ?)
         AND NOT EXISTS (
           SELECT 1 FROM worker_roster_day_hide h
           WHERE h.worker_id = w.id AND h.hide_date = ?
         )`,
      [date, date, date, date],
      function onRun(err) {
        if (err) return reject(err);
        resolve({ hidden: this.changes });
      }
    );
  });
}

function parseIsoDate(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatIsoDate(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function addCalendarDays(iso, n) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + n);
  return formatIsoDate(d);
}

/** Kaynak günden sonraki her hafta içi gün (kaynak hariç, bitiş dahil). */
function weekDatesExclusiveAfter(sourceDate, endDate) {
  const out = [];
  let d = parseIsoDate(addCalendarDays(sourceDate, 1));
  const end = parseIsoDate(endDate);
  if (d > end) return out;
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(formatIsoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
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
        COALESCE(p.t1830, 0) AS t1830,
        CASE WHEN EXISTS (
          SELECT 1 FROM worker_roster_day_hide h
          WHERE h.worker_id = w.id AND h.hide_date = ?
        ) THEN 1 ELSE 0 END AS absentForDay
      FROM workers w
      LEFT JOIN production_entries p
        ON p.worker_id = w.id
        AND p.production_date = ?
      WHERE (
          (w.created_at IS NULL OR date(w.created_at) <= date(?))
          AND (w.deleted_at IS NULL OR date(w.deleted_at) > date(?))
        )
        OR EXISTS (
          SELECT 1 FROM production_entries pe
          WHERE pe.worker_id = w.id AND pe.production_date = ?
        )
      ORDER BY w.team, w.process, w.name
      `,
      [date, date, date, date, date],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

/**
 * Seçili gündeki personel listesini ileri tarihe taşır: her hedef hafta içi gün için
 * kaynak gündeki üretim rakamlarını (t1000–t1830) yazar; satır yoksa oluşturur, varsa günceller.
 * O gün için "sahada yok" işaretini kaldırır.
 * Kimlerin aktarılacağı yalnızca `getDailyEntries(sourceDate)` ile ana ekrandaki günlük liste ile aynıdır.
 */
export async function copyRosterToFutureWeekdays(sourceDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sourceDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
    throw new Error("Geçersiz tarih formatı");
  }
  if (parseIsoDate(sourceDate) >= parseIsoDate(endDate)) {
    throw new Error(
      "Bitiş tarihi, kaynak günden (seçili gün) sonra olmalıdır. Aynı günü seçmek aralığı boş bırakır; en az bir sonraki iş gününü kapsayın."
    );
  }
  const dates = weekDatesExclusiveAfter(sourceDate, endDate);
  if (dates.length === 0) {
    throw new Error(
      "Aktarılacak hafta içi gün yok. Bitiş tarihi, kaynak günden (seçili gün) sonra en az bir iş gününü kapsamalıdır " +
        "(ör. kaynak 28 Nisan ise bitiş en az 29 Nisan olmalıdır; aynı güne eşit bitiş aralığı boş kalır)."
    );
  }
  const dailyRows = await getDailyEntries(String(sourceDate));
  const ids = dailyRows
    .map((r) => Number(r.workerId))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (ids.length === 0) {
    return { workers: 0, weekdayCount: dates.length, entriesTouched: 0, hidesCleared: 0 };
  }
  const idPlaceholders = ids.map(() => "?").join(",");
  let hidesCleared = 0;
  await dbRun("BEGIN");
  try {
    for (const dayIso of dates) {
      /* Yalnızca kaynak gün listesindeki id'ler; hedef güne göre created/deleted filtreleri
         bazen tüm satırları eliyordu (deleted_at hedef günle çakışması, changes=0 no-op UPSERT vb.) */
      await dbRun(
        `INSERT INTO production_entries (worker_id, production_date, t1000, t1300, t1600, t1830)
         SELECT w.id, ?,
                COALESCE(src.t1000, 0), COALESCE(src.t1300, 0), COALESCE(src.t1600, 0), COALESCE(src.t1830, 0)
         FROM workers w
         LEFT JOIN production_entries src ON src.worker_id = w.id AND src.production_date = ?
         WHERE w.id IN (${idPlaceholders})
         ON CONFLICT(worker_id, production_date) DO UPDATE SET
           t1000 = excluded.t1000,
           t1300 = excluded.t1300,
           t1600 = excluded.t1600,
           t1830 = excluded.t1830`,
        [dayIso, sourceDate, ...ids]
      );
      const hd = await dbRun(
        `DELETE FROM worker_roster_day_hide WHERE hide_date = ? AND worker_id IN (${idPlaceholders})`,
        [dayIso, ...ids]
      );
      hidesCleared += hd;
    }
    await dbRun("COMMIT");
  } catch (e) {
    await dbRun("ROLLBACK").catch(() => {});
    throw e;
  }
  /* Her hedef gün × personel için bir satır işlendi (SQLite this.changes UPSERT no-op’ta 0 dönebiliyordu) */
  return {
    workers: ids.length,
    weekdayCount: dates.length,
    entriesTouched: ids.length * dates.length,
    hidesCleared,
  };
}

export function getDayProductMeta(date) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT product_name AS productName, product_model AS productModel,
              model_id AS modelId, meta_source AS metaSource
       FROM daily_product_meta WHERE production_date = ?`,
      [date],
      (err, row) => {
        if (err) return reject(err);
        const mid = row?.modelId;
        const modelId =
          mid != null && mid !== "" && Number.isFinite(Number(mid)) ? Number(mid) : null;
        const ms = row?.metaSource != null ? String(row.metaSource) : "manual";
        resolve({
          productName: row?.productName != null ? String(row.productName) : "",
          productModel: row?.productModel != null ? String(row.productModel) : "",
          modelId,
          metaSource: ms === "hedef" ? "hedef" : "manual",
        });
      }
    );
  });
}

export function upsertDayProductMeta({ date, productName, productModel, modelId, metaSource }) {
  const name = String(productName ?? "").trim();
  const model = String(productModel ?? "").trim();
  const src = metaSource === "hedef" ? "hedef" : "manual";
  let mid =
    modelId != null && modelId !== "" && Number.isFinite(Number(modelId)) ? Number(modelId) : null;
  if (src === "manual") mid = null;
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO daily_product_meta (production_date, product_name, product_model, model_id, meta_source)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(production_date) DO UPDATE SET
        product_name = excluded.product_name,
        product_model = excluded.product_model,
        model_id = excluded.model_id,
        meta_source = excluded.meta_source
      `,
      [date, name, model, mid, src],
      (err) => {
        if (err) return reject(err);
        resolve({ productName: name, productModel: model, modelId: mid, metaSource: src });
      }
    );
  });
}

/** Tek satır — aktivite logunda tekrarı önlemek için önceki değerlerle karşılaştırma. */
export function getProductionEntrySlots(workerId, date) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT t1000, t1300, t1600, t1830 FROM production_entries WHERE worker_id = ? AND production_date = ?`,
      [workerId, date],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve({
          t1000: Number(row.t1000) || 0,
          t1300: Number(row.t1300) || 0,
          t1600: Number(row.t1600) || 0,
          t1830: Number(row.t1830) || 0,
        });
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

export function getTopWorkersAnalytics({ startDate, endDate, team = "", process = "", limit = 20, hourColumn = "" }) {
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
        AND (? = '' OR w.process = ?)
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      GROUP BY w.id, w.name, w.team, w.process
      ORDER BY totalProduction DESC, w.name ASC
      LIMIT ?
      `,
      [startDate, endDate, team, team, process, process, limit],
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

export function getDailyTrendAnalytics({ startDate, endDate, team = "", process = "", hourColumn = "" }) {
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
        AND (? = '' OR w.process = ?)
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      GROUP BY p.production_date
      ORDER BY p.production_date ASC
      `,
      [startDate, endDate, team, team, process, process],
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

export function getWorkerDailyAnalytics({ startDate, endDate, team = "", process = "", hourColumn = "" }) {
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
        AND (? = '' OR w.process = ?)
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      ORDER BY p.production_date ASC, production DESC, w.name ASC
      `,
      [startDate, endDate, team, team, process, process],
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
    db.all("SELECT code, label FROM teams", [], (e1, teamRows) => {
      if (e1) return reject(e1);
      const sorted = (teamRows || []).slice().sort((a, b) =>
        String(a.label).localeCompare(String(b.label), "tr", { sensitivity: "base" })
      );
      const codes = sorted.length ? sorted.map((r) => r.code) : ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM", "ADET"];
      const totals = Object.fromEntries(codes.map((c) => [c, 0]));
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
          for (const row of rows) {
            if (row.team in totals) totals[row.team] = Number(row.total) || 0;
          }
          resolve(totals);
        }
      );
    });
  });
}

const LEGACY_HEDEF_LABELS = ["Sağ ön", "Sol ön", "Yaka hazırlık", "Arka hazırlık", "Bitim"];

function hedefLineSumSql() {
  return "COALESCE(p.t1000, 0) + COALESCE(p.t1300, 0) + COALESCE(p.t1600, 0) + COALESCE(p.t1830, 0)";
}

/** Tek bölüm+proses satırı için tarih aralığı üretim toplamı (0.5 çarpan opsiyonel). */
async function sumProductionForBaselineRow(startDate, endDate, teamCode, processName, halfFlag) {
  const line = hedefLineSumSql();
  const hf = Number(halfFlag) === 1 ? 1 : 0;
  const row = await dbGet(
    `
    SELECT COALESCE(SUM((CASE WHEN ? = 1 THEN 0.5 ELSE 1.0 END) * (${line})), 0) AS total
    FROM production_entries p
    JOIN workers w ON w.id = p.worker_id
    WHERE p.production_date BETWEEN ? AND ?
      AND w.team = ?
      AND TRIM(COALESCE(w.process,'')) = TRIM(?)
      AND (w.created_at IS NULL OR w.created_at <= p.production_date)
      AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
    `,
    [hf, startDate, endDate, teamCode, processName]
  );
  return Number(row?.total) || 0;
}

/** Hedef Takip: { stages: [{ sortOrder, teamCode, processName, teamLabel, total }] }
 *  modelId yok: prosesler tablosundaki hedef_* eşlemesi (klasik 5 satır).
 *  modelId var: modeldeki sıralı bölüm satırları (1…N).
 */
export async function getHedefTakipStageTotals(startDate, endDate, modelId) {
  const line = hedefLineSumSql();
  const mult = "(CASE WHEN COALESCE(pr.hedef_arka_half, 0) = 1 THEN 0.5 ELSE 1.0 END)";
  if (!modelId) {
    const row = await dbGet(
      `
      SELECT
        COALESCE(SUM(CASE WHEN pr.hedef_metric = 'SAG_ON' AND w.team = pr.hedef_team THEN ${mult} * (${line}) ELSE 0 END), 0) AS sag_on,
        COALESCE(SUM(CASE WHEN pr.hedef_metric = 'SOL_ON' AND w.team = pr.hedef_team THEN ${mult} * (${line}) ELSE 0 END), 0) AS sol_on,
        COALESCE(SUM(CASE WHEN pr.hedef_metric = 'YAKA_HAZIRLIK' AND w.team = pr.hedef_team THEN ${mult} * (${line}) ELSE 0 END), 0) AS yaka,
        COALESCE(SUM(CASE WHEN pr.hedef_metric = 'ARKA_HAZIRLIK' AND w.team = pr.hedef_team THEN ${mult} * (${line}) ELSE 0 END), 0) AS arka,
        COALESCE(SUM(CASE WHEN pr.hedef_metric = 'BITIM' AND w.team = pr.hedef_team THEN ${mult} * (${line}) ELSE 0 END), 0) AS bitim
      FROM production_entries p
      JOIN workers w ON w.id = p.worker_id
      LEFT JOIN processes pr ON TRIM(COALESCE(pr.name, '')) = TRIM(COALESCE(w.process, ''))
      WHERE p.production_date BETWEEN ? AND ?
        AND (w.created_at IS NULL OR w.created_at <= p.production_date)
        AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
      `,
      [startDate, endDate]
    );
    const nums = [
      Number(row?.sag_on) || 0,
      Number(row?.sol_on) || 0,
      Number(row?.yaka) || 0,
      Number(row?.arka) || 0,
      Number(row?.bitim) || 0,
    ];
    return {
      stages: LEGACY_HEDEF_LABELS.map((teamLabel, i) => ({
        sortOrder: i,
        teamCode: "",
        processName: "",
        teamLabel,
        total: nums[i],
      })),
    };
  }

  const baseRows = await dbAll(
    `SELECT sort_order AS sortOrder, team_code AS teamCode, process_name AS processName,
            COALESCE(arka_half, 0) AS arkaHalf
     FROM model_hedef_baselines WHERE model_id = ? ORDER BY sort_order ASC`,
    [modelId]
  );
  if (!baseRows.length) {
    throw new Error("Bu model için en az bir bölüm satırı tanımlanmalıdır (Ayarlar → Ürün modelleri).");
  }
  const teamRows = await dbAll("SELECT code, label FROM teams");
  const labelByCode = Object.fromEntries((teamRows || []).map((t) => [t.code, t.label]));

  const stages = [];
  for (const r of baseRows) {
    const total = await sumProductionForBaselineRow(
      startDate,
      endDate,
      r.teamCode,
      r.processName,
      Number(r.arkaHalf) === 1
    );
    stages.push({
      sortOrder: Number(r.sortOrder) || 0,
      teamCode: String(r.teamCode || ""),
      processName: String(r.processName || ""),
      teamLabel: labelByCode[r.teamCode] || String(r.teamCode || ""),
      total,
    });
  }
  return { stages };
}

function eachWeekdayIsoInRange(startIso, endIso) {
  const parse = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const out = [];
  let d = parse(startIso);
  const end = parse(endIso);
  if (d > end) return out;
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${mo}-${da}`);
    }
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return out;
}

export function applyHedefSessionToDailyMeta({ modelId, startDate, endDate, productName, productModel }) {
  const name = String(productName ?? "").trim();
  const model = String(productModel ?? "").trim();
  const mid = Number(modelId);
  if (!Number.isFinite(mid) || mid < 1) {
    return Promise.reject(new Error("Geçersiz model"));
  }
  const dates = eachWeekdayIsoInRange(startDate, endDate);
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      const stmt = db.prepare(`
        INSERT INTO daily_product_meta (production_date, product_name, product_model, model_id, meta_source)
        VALUES (?, ?, ?, ?, 'hedef')
        ON CONFLICT(production_date) DO UPDATE SET
          product_name = excluded.product_name,
          product_model = excluded.product_model,
          model_id = excluded.model_id,
          meta_source = 'hedef'
      `);
      for (const d of dates) {
        stmt.run([d, name, model, mid]);
      }
      stmt.finalize((finErr) => {
        if (finErr) {
          db.run("ROLLBACK");
          return reject(finErr);
        }
        db.run("COMMIT", (cErr) => {
          if (cErr) return reject(cErr);
          resolve({ ok: true, datesUpdated: dates.length });
        });
      });
    });
  });
}

export function listProductModels() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, model_code AS modelCode, product_name AS productName, created_at AS createdAt
       FROM product_models ORDER BY model_code COLLATE NOCASE`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

export function getProductModelWithBaselines(id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, model_code AS modelCode, product_name AS productName, created_at AS createdAt
       FROM product_models WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        db.all(
          `SELECT sort_order AS sortOrder, team_code AS teamCode, process_name AS processName,
                  COALESCE(arka_half, 0) AS arkaHalf
           FROM model_hedef_baselines WHERE model_id = ? ORDER BY sort_order ASC`,
          [id],
          (e2, baselines) => {
            if (e2) return reject(e2);
            resolve({ ...row, baselines: baselines || [] });
          }
        );
      }
    );
  });
}

const MAX_HEDEF_BASELINE_ROWS = 20;

function validateBaselineRows(teamCodes, baselines) {
  const set = new Set(teamCodes);
  const rows = Array.isArray(baselines) ? baselines : [];
  if (rows.length === 0) {
    throw new Error("En az bir çalışılacak bölüm satırı gerekli");
  }
  if (rows.length > MAX_HEDEF_BASELINE_ROWS) {
    throw new Error(`En fazla ${MAX_HEDEF_BASELINE_ROWS} bölüm satırı eklenebilir`);
  }
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    if (!b || !String(b.teamCode ?? "").trim() || !String(b.processName ?? "").trim()) {
      throw new Error(`Satır ${i + 1}: bölüm ve proses seçilmelidir`);
    }
    if (!set.has(String(b.teamCode))) {
      throw new Error(`Geçersiz bölüm kodu: ${b.teamCode}`);
    }
  }
}

export async function createProductModel({ modelCode, productName, baselines }, teamCodes) {
  const code = String(modelCode ?? "").trim();
  const pname = String(productName ?? "").trim();
  if (!code) throw new Error("Model kodu gerekli");
  validateBaselineRows(teamCodes, baselines);
  const rows = Array.isArray(baselines) ? baselines : [];
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO product_models (model_code, product_name) VALUES (?, ?)",
      [code, pname],
      function onIns(err) {
        if (err) return reject(err);
        const modelId = this.lastID;
        const stmt = db.prepare(
          `INSERT INTO model_hedef_baselines (model_id, sort_order, team_code, process_name, arka_half)
           VALUES (?, ?, ?, ?, ?)`
        );
        rows.forEach((b, idx) => {
          const ah = Number(b.arkaHalf) === 1 ? 1 : 0;
          stmt.run([modelId, idx, String(b.teamCode).trim(), String(b.processName).trim(), ah]);
        });
        stmt.finalize((fe) => {
          if (fe) return reject(fe);
          resolve({ id: modelId, modelCode: code, productName: pname });
        });
      }
    );
  });
}

export async function updateProductModel(id, { modelCode, productName, baselines }, teamCodes) {
  const code = String(modelCode ?? "").trim();
  const pname = String(productName ?? "").trim();
  if (!code) throw new Error("Model kodu gerekli");
  validateBaselineRows(teamCodes, baselines);
  const rows = Array.isArray(baselines) ? baselines : [];
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE product_models SET model_code = ?, product_name = ? WHERE id = ?",
      [code, pname, id],
      function onUp(err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error("Kayıt bulunamadı"));
        db.run("DELETE FROM model_hedef_baselines WHERE model_id = ?", [id], (delErr) => {
          if (delErr) return reject(delErr);
          const stmt = db.prepare(
            `INSERT INTO model_hedef_baselines (model_id, sort_order, team_code, process_name, arka_half)
             VALUES (?, ?, ?, ?, ?)`
          );
          rows.forEach((b, idx) => {
            const ah = Number(b.arkaHalf) === 1 ? 1 : 0;
            stmt.run([id, idx, String(b.teamCode).trim(), String(b.processName).trim(), ah]);
          });
          stmt.finalize((fe) => {
            if (fe) return reject(fe);
            resolve({ id, modelCode: code, productName: pname });
          });
        });
      }
    );
  });
}

export function deleteProductModel(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM product_models WHERE id = ?", [id], function onDel(err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes > 0 });
    });
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

/** Kişi bazlı analiz: her iş günü için dört saat dilimi + meta. `includeSameNameWorkers`: aynı ada sahip tüm worker kayıtları. */
export function getWorkerProductionDailyDetail({
  workerId,
  startDate,
  endDate,
  includeSameNameWorkers = false,
}) {
  return new Promise((resolve, reject) => {
    const mapRows = (rows) =>
      (rows || []).map((row) => ({
        workerId: Number(row.workerId) || 0,
        productionDate: String(row.productionDate),
        name: String(row.name || ""),
        team: String(row.team || ""),
        process: String(row.process || ""),
        t1000: Number(row.t1000) || 0,
        t1300: Number(row.t1300) || 0,
        t1600: Number(row.t1600) || 0,
        t1830: Number(row.t1830) || 0,
      }));

    const runQuery = (ids) => {
      const uniq = [...new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
      if (uniq.length === 0) return resolve([]);
      const ph = uniq.map(() => "?").join(",");
      db.all(
        `
        SELECT
          p.worker_id AS workerId,
          p.production_date AS productionDate,
          w.name AS name,
          w.team AS team,
          w.process AS process,
          COALESCE(p.t1000, 0) AS t1000,
          COALESCE(p.t1300, 0) AS t1300,
          COALESCE(p.t1600, 0) AS t1600,
          COALESCE(p.t1830, 0) AS t1830
        FROM production_entries p
        JOIN workers w ON w.id = p.worker_id
        WHERE p.worker_id IN (${ph})
          AND p.production_date BETWEEN ? AND ?
          AND (w.created_at IS NULL OR w.created_at <= p.production_date)
          AND (w.deleted_at IS NULL OR w.deleted_at > p.production_date)
        ORDER BY p.production_date ASC, w.team ASC, w.process ASC, p.worker_id ASC
        `,
        [...uniq, startDate, endDate],
        (err, rows) => {
          if (err) return reject(err);
          resolve(mapRows(rows));
        }
      );
    };

    if (!includeSameNameWorkers) {
      return runQuery([workerId]);
    }

    db.get("SELECT name FROM workers WHERE id = ?", [workerId], (err, row) => {
      if (err) return reject(err);
      const nm = row?.name != null ? String(row.name) : "";
      if (!nm.trim()) return runQuery([workerId]);
      db.all(
        "SELECT id FROM workers WHERE TRIM(LOWER(name)) = TRIM(LOWER(?))",
        [nm],
        (err2, idRows) => {
          if (err2) return reject(err2);
          const ids = (idRows || []).map((r) => Number(r.id)).filter((n) => n > 0);
          runQuery(ids.length ? ids : [workerId]);
        }
      );
    });
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

export function getTeams() {
  return new Promise((resolve, reject) => {
    db.all("SELECT id, code, label, sort_order FROM teams", [], (err, rows) => {
      if (err) return reject(err);
      const sorted = (rows || []).slice().sort((a, b) =>
        String(a.label).localeCompare(String(b.label), "tr", { sensitivity: "base" })
      );
      resolve(sorted);
    });
  });
}

export function listTeamCodes() {
  return new Promise((resolve, reject) => {
    db.all("SELECT code FROM teams", [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map((r) => r.code));
    });
  });
}

/** Bölüm adından teknik kod üretir (Türkçe harfler dönüştürülür). */
function slugifyTeamCodeFromLabel(label) {
  let s = String(label || "").normalize("NFC");
  const map = [
    ["ğ", "G"],
    ["Ğ", "G"],
    ["ü", "U"],
    ["Ü", "U"],
    ["ş", "S"],
    ["Ş", "S"],
    ["ı", "I"],
    ["İ", "I"],
    ["i", "I"],
    ["ö", "O"],
    ["Ö", "O"],
    ["ç", "C"],
    ["Ç", "C"],
  ];
  for (const [a, b] of map) s = s.split(a).join(b);
  s = s.toUpperCase();
  s = s.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) s = "BOLUM";
  if (/^[0-9]/.test(s)) s = `B_${s}`;
  return s.slice(0, 48);
}

function normalizeTeamLabel(label) {
  return String(label || "")
    .trim()
    .toLocaleUpperCase("tr-TR");
}

export function addTeam({ label } = {}) {
  const lab = normalizeTeamLabel(label);
  if (!lab) return Promise.reject(new Error("Bölüm adı zorunlu"));
  return new Promise((resolve, reject) => {
    db.get("SELECT COALESCE(MAX(sort_order), 0) AS m FROM teams", [], (e0, row0) => {
      if (e0) return reject(e0);
      const so = (Number(row0?.m) || 0) + 10;
      const base = slugifyTeamCodeFromLabel(lab);
      let n = 0;
      const attempt = () => {
        const suffix = n === 0 ? "" : `_${n + 1}`;
        let code = `${base}${suffix}`.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
        if (code.length > 64) code = code.slice(0, 64).replace(/_+$/g, "");
        if (!/^[A-Z]/.test(code)) code = `B_${code}`.slice(0, 64);
        db.run(
          "INSERT INTO teams (code, label, sort_order) VALUES (?, ?, ?)",
          [code, lab, so],
          function onRun(err) {
            if (err && String(err.message).includes("UNIQUE")) {
              n += 1;
              if (n > 200) return reject(new Error("Benzersiz kod üretilemedi"));
              return attempt();
            }
            if (err) return reject(err);
            resolve({ id: this.lastID, code, label: lab, sort_order: so });
          }
        );
      };
      attempt();
    });
  });
}

export function updateTeam(id, { label, sort_order }) {
  let lab = label !== undefined ? String(label).trim() : null;
  if (lab === "") return Promise.reject(new Error("Bölüm adı boş olamaz"));
  if (lab != null) lab = lab.toLocaleUpperCase("tr-TR");
  const so = sort_order !== undefined ? Number(sort_order) : null;
  if (sort_order !== undefined && !Number.isFinite(so)) {
    return Promise.reject(new Error("Geçersiz sıra numarası"));
  }
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE teams SET label = COALESCE(?, label), sort_order = COALESCE(?, sort_order) WHERE id = ?",
      [lab, so, id],
      function onRun(err) {
        if (err) return reject(err);
        resolve({ updated: this.changes > 0 });
      }
    );
  });
}

export function deleteTeam(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT code FROM teams WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve({ deleted: false });
      const code = row.code;
      db.get(
        "SELECT 1 FROM workers WHERE team = ? LIMIT 1",
        [code],
        (err2, w) => {
          if (err2) return reject(err2);
          if (w) return reject(new Error("Bu bölümde kayıtlı çalışan varken silinemez"));
          db.run("DELETE FROM teams WHERE id = ?", [id], function onDel(err3) {
            if (err3) return reject(err3);
            resolve({ deleted: this.changes > 0 });
          });
        }
      );
    });
  });
}

export function getProcesses() {
  return new Promise((resolve, reject) => {
    db.all("SELECT id, name, sort_order FROM processes", [], (err, rows) => {
      if (err) return reject(err);
      const sorted = (rows || []).slice().sort((a, b) =>
        String(a.name).localeCompare(String(b.name), "tr", { sensitivity: "base" })
      );
      resolve(sorted);
    });
  });
}

export function listProcessNames() {
  return new Promise((resolve, reject) => {
    db.all("SELECT name FROM processes", [], (err, rows) => {
      if (err) return reject(err);
      const names = (rows || []).map((r) => r.name);
      names.sort((a, b) => String(a).localeCompare(String(b), "tr", { sensitivity: "base" }));
      resolve(names);
    });
  });
}

export function addProcess({ name } = {}) {
  const n = String(name || "").trim().toUpperCase();
  if (!n) return Promise.reject(new Error("Proses adı zorunlu"));
  return new Promise((resolve, reject) => {
    db.get("SELECT COALESCE(MAX(sort_order), 0) AS m FROM processes", [], (e0, row0) => {
      if (e0) return reject(e0);
      const so = (Number(row0?.m) || 0) + 10;
      db.run(
        "INSERT INTO processes (name, sort_order) VALUES (?, ?)",
        [n, so],
        function onRun(err) {
          if (err) {
            if (String(err.message).includes("UNIQUE")) return reject(new Error("Bu proses zaten kayıtlı"));
            return reject(err);
          }
          resolve({ id: this.lastID, name: n, sort_order: so });
        }
      );
    });
  });
}

export function updateProcess(id, { name, sort_order }) {
  const newName = name !== undefined ? String(name).trim().toUpperCase() : null;
  if (newName === "") return Promise.reject(new Error("Proses adı boş olamaz"));
  const so = sort_order !== undefined ? Number(sort_order) : null;
  if (sort_order !== undefined && !Number.isFinite(so)) {
    return Promise.reject(new Error("Geçersiz sıra numarası"));
  }
  return new Promise((resolve, reject) => {
    db.get("SELECT name FROM processes WHERE id = ?", [id], (err, oldRow) => {
      if (err) return reject(err);
      if (!oldRow) return resolve({ updated: false });
      const oldName = oldRow.name;
      const finalName = newName && newName.length > 0 ? newName : oldName;
      db.run(
        "UPDATE processes SET name = ?, sort_order = COALESCE(?, sort_order) WHERE id = ?",
        [finalName, so, id],
        function onRun(err2) {
          if (err2) {
            if (String(err2.message).includes("UNIQUE")) return reject(new Error("Bu proses adı zaten kullanılıyor"));
            return reject(err2);
          }
          if (finalName !== oldName) {
            db.run("UPDATE workers SET process = ? WHERE process = ?", [finalName, oldName], () => {});
          }
          resolve({ updated: this.changes > 0 });
        }
      );
    });
  });
}

export function deleteProcess(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT name FROM processes WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve({ deleted: false });
      const n = row.name;
      db.get("SELECT 1 FROM workers WHERE process = ? LIMIT 1", [n], (err2, w) => {
        if (err2) return reject(err2);
        if (w) return reject(new Error("Bu prosesi kullanan çalışan varken silinemez"));
        db.run("DELETE FROM processes WHERE id = ?", [id], function onDel(err3) {
          if (err3) return reject(err3);
          resolve({ deleted: this.changes > 0 });
        });
      });
    });
  });
}

export function insertActivityLog({ actor_username, action, resource, details }) {
  const actor = String(actor_username || "sistem").slice(0, 200);
  const act = String(action || "olay").slice(0, 120);
  const res = resource == null ? "" : String(resource).slice(0, 200);
  const det = details == null ? "" : typeof details === "string" ? details : JSON.stringify(details);
  const detSafe = det.length > 8000 ? `${det.slice(0, 7997)}...` : det;
  const createdAt = utcNowSqlite();
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO activity_logs (created_at, actor_username, action, resource, details) VALUES (?, ?, ?, ?, ?)",
      [createdAt, actor, act, res, detSafe],
      function onRun(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

export function listActivityLogs(options = {}) {
  const {
    limit = 200,
    offset = 0,
    action: actionFilter,
    actor,
    resource,
    q,
    dateFrom,
    dateTo,
  } = options;

  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const conds = [];
  const params = [];

  if (actionFilter && String(actionFilter).trim()) {
    conds.push("action = ?");
    params.push(String(actionFilter).trim());
  }
  if (actor && String(actor).trim()) {
    conds.push("INSTR(LOWER(actor_username), LOWER(?)) > 0");
    params.push(String(actor).trim());
  }
  if (resource && String(resource).trim()) {
    conds.push("INSTR(LOWER(COALESCE(resource,'')), LOWER(?)) > 0");
    params.push(String(resource).trim());
  }
  if (q && String(q).trim()) {
    const s = String(q).trim();
    conds.push(
      "(INSTR(LOWER(COALESCE(details,'')), LOWER(?)) > 0 OR INSTR(LOWER(COALESCE(action,'')), LOWER(?)) > 0 OR INSTR(LOWER(COALESCE(resource,'')), LOWER(?)) > 0 OR INSTR(LOWER(COALESCE(actor_username,'')), LOWER(?)) > 0)"
    );
    params.push(s, s, s, s);
  }
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(String(dateFrom))) {
    conds.push("created_at >= ?");
    params.push(turkeyCalendarDayStartUtcSql(String(dateFrom)));
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(String(dateTo))) {
    conds.push("created_at <= ?");
    params.push(turkeyCalendarDayEndUtcSql(String(dateTo)));
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const sql = `SELECT id, created_at, actor_username, action, resource, details
     FROM activity_logs
     ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`;
  params.push(lim, off);

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}
