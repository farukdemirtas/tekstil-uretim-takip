import fs from "fs";
import db, { getDbPath } from "./db.js";
import { getAppKv, setAppKv } from "./queries.js";

const KV_LAST_BACKUP = "db_last_backup_download";
const KV_LAST_RESTORE = "db_last_restore";

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseHistoryEvent(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || !o.at) return null;
    return {
      at: String(o.at),
      by: o.by != null ? String(o.by) : "",
      bytes: o.bytes != null ? Number(o.bytes) : undefined,
      tableCount: o.tableCount != null ? Number(o.tableCount) : undefined,
    };
  } catch {
    return null;
  }
}

export async function recordDatabaseBackupDownload({ username, bytes }) {
  const event = {
    at: new Date().toISOString(),
    by: String(username || "").trim() || "?",
    bytes: Math.max(0, Math.floor(Number(bytes) || 0)),
  };
  await setAppKv(KV_LAST_BACKUP, JSON.stringify(event));
  return event;
}

export async function recordDatabaseRestore({ username, tableCount, bytes }) {
  const event = {
    at: new Date().toISOString(),
    by: String(username || "").trim() || "?",
    tableCount: Math.max(0, Math.floor(Number(tableCount) || 0)),
    bytes: Math.max(0, Math.floor(Number(bytes) || 0)),
  };
  await setAppKv(KV_LAST_RESTORE, JSON.stringify(event));
  return event;
}

/** Mevcut SQLite veritabanını SQL dump olarak döndürür */
export async function exportDatabaseSql() {
  await dbRun("PRAGMA wal_checkpoint(FULL)").catch(() => {});

  const stamp = new Date().toISOString();
  const parts = [
    "-- Tekstil üretim takip — SQLite yedek",
    `-- Oluşturulma: ${stamp}`,
    "PRAGMA foreign_keys=OFF;",
    "BEGIN TRANSACTION;",
  ];

  const tables = await dbAll(
    `SELECT name, sql FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  );

  for (const { name, sql: createSql } of tables) {
    if (!createSql) continue;
    parts.push(`${createSql};`);
    const rows = await dbAll(`SELECT * FROM ${quoteIdent(name)}`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]).map((c) => quoteIdent(c)).join(", ");
    for (const row of rows) {
      const vals = Object.values(row).map(sqlLiteral).join(", ");
      parts.push(`INSERT INTO ${quoteIdent(name)} (${cols}) VALUES (${vals});`);
    }
  }

  parts.push("COMMIT;");
  parts.push("PRAGMA foreign_keys=ON;");
  return parts.join("\n");
}

/** SQL dump ile veritabanını sıfırdan yükler (mevcut tablolar silinir) */
export async function restoreDatabaseFromSql(dumpSql) {
  const text = String(dumpSql || "").trim();
  if (!text) throw new Error("Yedek dosyası boş");
  if (text.length > 150 * 1024 * 1024) {
    throw new Error("Yedek dosyası çok büyük (en fazla 150 MB)");
  }
  if (!/CREATE\s+TABLE/i.test(text)) {
    throw new Error("Geçersiz SQL yedek dosyası (CREATE TABLE bulunamadı)");
  }

  await dbRun("PRAGMA foreign_keys=OFF");

  const tables = await dbAll(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
  );
  for (const { name } of tables) {
    await dbRun(`DROP TABLE IF EXISTS ${quoteIdent(name)}`);
  }

  await dbExec(text);
  await dbRun("PRAGMA foreign_keys=ON");

  const tableCount = (
    await dbAll(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
  )[0]?.c;

  return { ok: true, tableCount: Number(tableCount) || 0 };
}

export async function getDatabaseInfo() {
  const dbPath = getDbPath();
  let sizeBytes = 0;
  let modifiedAt = null;
  try {
    const stat = fs.statSync(dbPath);
    sizeBytes = stat.size;
    modifiedAt = stat.mtime.toISOString();
  } catch {
    /* yeni kurulum */
  }

  const row = (
    await dbAll(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
  )[0];

  const [backupRaw, restoreRaw] = await Promise.all([
    getAppKv(KV_LAST_BACKUP),
    getAppKv(KV_LAST_RESTORE),
  ]);

  return {
    fileName: dbPath.split(/[/\\]/).pop() || "production.db",
    sizeBytes,
    modifiedAt,
    tableCount: Number(row?.c) || 0,
    lastBackupDownload: parseHistoryEvent(backupRaw),
    lastRestore: parseHistoryEvent(restoreRaw),
  };
}
