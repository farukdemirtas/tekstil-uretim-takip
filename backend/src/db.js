import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { pbkdf2Sync, randomBytes } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../data/production.db");

const db = new sqlite3.Database(dbPath);

export function initDb() {
  const AUTH_USER = process.env.APP_USERNAME || "admin";
  const AUTH_PASS = process.env.APP_PASSWORD || "1234";

  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.run(`
      CREATE TABLE IF NOT EXISTS workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        team TEXT NOT NULL CHECK(team IN ('SAG_ON', 'SOL_ON', 'YAKA_HAZIRLIK', 'ARKA_HAZIRLIK', 'BITIM', 'ADET')),
        process TEXT NOT NULL,
        deleted_at TEXT
      )
    `);

    db.get(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'workers'",
      [],
      (schemaErr, row) => {
        if (schemaErr) {
          // eslint-disable-next-line no-console
          console.error("DB schema read error:", String(schemaErr));
          return;
        }

        const schemaSql = String(row?.sql || "");
        const needsTeamMigration =
          !schemaSql.includes("ARKA_HAZIRLIK") ||
          !schemaSql.includes("BITIM") ||
          !schemaSql.includes("ADET");

        const hasDeletedAt = schemaSql.includes("deleted_at");

        if (needsTeamMigration) {
          // Eski workers tablosu sadece SAG_ON/SOL_ON kabul ediyor.
          // Yeni tabloya tüm ekipleri taşıyıp isim değiştiriyoruz.
          db.exec(
            `
            PRAGMA foreign_keys = OFF;
            BEGIN TRANSACTION;
            CREATE TABLE workers_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              team TEXT NOT NULL CHECK(team IN ('SAG_ON', 'SOL_ON', 'YAKA_HAZIRLIK', 'ARKA_HAZIRLIK', 'BITIM', 'ADET')),
              process TEXT NOT NULL,
              deleted_at TEXT
            );
            INSERT INTO workers_new (id, name, team, process, deleted_at)
            SELECT id, name, team, process, NULL FROM workers;
            DROP TABLE workers;
            ALTER TABLE workers_new RENAME TO workers;
            COMMIT;
            PRAGMA foreign_keys = ON;
            `,
            (migrateErr) => {
              if (migrateErr) {
                // eslint-disable-next-line no-console
                console.error("DB workers migration error:", String(migrateErr));
              }
            }
          );
          return;
        }

        if (!hasDeletedAt) {
          db.run("ALTER TABLE workers ADD COLUMN deleted_at TEXT", (alterErr) => {
            if (alterErr) {
              // eslint-disable-next-line no-console
              console.error("DB migration (deleted_at) error:", String(alterErr));
            }
          });
        }
      }
    );

    db.run(`
      CREATE TABLE IF NOT EXISTS production_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL,
        production_date TEXT NOT NULL,
        t1000 INTEGER DEFAULT 0,
        t1300 INTEGER DEFAULT 0,
        t1600 INTEGER DEFAULT 0,
        t1830 INTEGER DEFAULT 0,
        UNIQUE(worker_id, production_date),
        FOREIGN KEY(worker_id) REFERENCES workers(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'data_entry',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Mevcut DB'lerde `role` kolonu yoksa ekle.
    db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'data_entry'", (alterErr) => {
      if (alterErr) {
        const msg = String(alterErr.message || alterErr);
        // duplicate column name ise sessiz geç.
        if (!msg.toLowerCase().includes("duplicate column name")) {
          // eslint-disable-next-line no-console
          console.error("DB migration (users.role) error:", msg);
        }
      }
    });

    // Admin kullanıcısının rolünü admin yap.
    db.run("UPDATE users SET role = 'admin' WHERE username = ?", [AUTH_USER], () => {});

    // Bootstrap admin kullanıcısı (tablo boşsa)
    db.get("SELECT 1 FROM users WHERE username = ? LIMIT 1", [AUTH_USER], (err, row) => {
      if (err) return;
      if (row) return;

      const salt = randomBytes(16).toString("hex");
      const password_hash = pbkdf2Sync(AUTH_PASS, salt, 310000, 64, "sha512").toString("hex");
      db.run(
        "INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, 'admin')",
        [AUTH_USER, password_hash, salt],
        () => {}
      );
    });
  });
}

export default db;
