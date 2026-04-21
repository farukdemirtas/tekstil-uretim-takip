import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pbkdf2Sync, randomBytes } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataDir = path.resolve(__dirname, "../data");
const PRODUCTION_PERSISTENT_DB = path.join("/var/lib/tekstil-uretim", "production.db");

/** Öncelik: TEKSTIL_DB_PATH / SQLITE_DATABASE_PATH → TEKSTIL_DATA_DIR → (üretim) mevcut /var/lib/... → backend/data */
function resolveDbPath() {
  const explicit =
    process.env.TEKSTIL_DB_PATH?.trim() || process.env.SQLITE_DATABASE_PATH?.trim();
  if (explicit) return path.resolve(explicit);

  const extDir = process.env.TEKSTIL_DATA_DIR?.trim();
  if (extDir) return path.join(path.resolve(extDir), "production.db");

  if (process.env.NODE_ENV === "production") {
    try {
      if (fs.existsSync(PRODUCTION_PERSISTENT_DB)) {
        const dir = path.dirname(PRODUCTION_PERSISTENT_DB);
        fs.accessSync(dir, fs.constants.W_OK);
        return PRODUCTION_PERSISTENT_DB;
      }
    } catch {
      /* klasik yol */
    }
  }

  return path.join(defaultDataDir, "production.db");
}

const dbPath = resolveDbPath();
const dataDir = path.dirname(dbPath);

try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("Veritabanı klasörü oluşturulamadı:", dataDir, e);
  process.exit(1);
}

const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error("SQLite açılamadı:", dbPath, err.message);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log("[tekstil-db] SQLite:", dbPath);
  }
);

db.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("SQLite hatası:", err.message);
});

export function initDb() {
  const AUTH_USER = process.env.APP_USERNAME || "admin";
  const AUTH_PASS = process.env.APP_PASSWORD || "admin55";

  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.run(`
      CREATE TABLE IF NOT EXISTS workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        team TEXT NOT NULL CHECK(team IN ('SAG_ON', 'SOL_ON', 'YAKA_HAZIRLIK', 'ARKA_HAZIRLIK', 'BITIM', 'ADET')),
        process TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (date('now')),
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
        /* Yalnızca eski sabit CHECK(team IN (...)) şeması: dinamik bölüm kodları (teams) için CHECK yoksa bu migrasyonu atla. */
        const hasLegacyTeamCheck =
          schemaSql.includes("CHECK(team") && schemaSql.includes("SAG_ON");
        const needsTeamMigration =
          hasLegacyTeamCheck &&
          (!schemaSql.includes("ARKA_HAZIRLIK") ||
            !schemaSql.includes("BITIM") ||
            !schemaSql.includes("ADET"));

        const hasDeletedAt  = schemaSql.includes("deleted_at");
        const hasCreatedAt  = schemaSql.includes("created_at");

        if (needsTeamMigration) {
          db.exec(
            `
            PRAGMA foreign_keys = OFF;
            BEGIN TRANSACTION;
            CREATE TABLE workers_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              team TEXT NOT NULL CHECK(team IN ('SAG_ON', 'SOL_ON', 'YAKA_HAZIRLIK', 'ARKA_HAZIRLIK', 'BITIM', 'ADET')),
              process TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (date('now')),
              deleted_at TEXT
            );
            INSERT INTO workers_new (id, name, team, process, created_at, deleted_at)
            SELECT id, name, team, process, date('now'), NULL FROM workers;
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

        if (!hasCreatedAt) {
          /* SQLite ALTER TABLE ADD COLUMN, fonksiyon default'u desteklemiyor;
             önce NULL olarak ekle, sonra mevcut satırları bugünün tarihiyle doldur. */
          db.run("ALTER TABLE workers ADD COLUMN created_at TEXT", (alterErr) => {
            if (alterErr) {
              const msg = String(alterErr.message || alterErr);
              if (!msg.toLowerCase().includes("duplicate column name")) {
                // eslint-disable-next-line no-console
                console.error("DB migration (created_at) error:", msg);
              }
              return;
            }
            db.run(
              "UPDATE workers SET created_at = date('now') WHERE created_at IS NULL",
              (updateErr) => {
                if (updateErr) {
                  // eslint-disable-next-line no-console
                  console.error("DB migration (created_at backfill) error:", String(updateErr));
                }
              }
            );
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

    db.all("PRAGMA table_info(production_entries)", [], (pragmaErr, cols) => {
      if (pragmaErr || !Array.isArray(cols) || cols.length === 0) return;
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("note")) {
        db.run("ALTER TABLE production_entries ADD COLUMN note TEXT NOT NULL DEFAULT ''", (e) => {
          if (e) {
            // eslint-disable-next-line no-console
            console.error("[tekstil-db] production_entries note migration:", e.message);
          }
        });
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS worker_roster_day_hide (
        worker_id INTEGER NOT NULL,
        hide_date TEXT NOT NULL,
        PRIMARY KEY (worker_id, hide_date),
        FOREIGN KEY(worker_id) REFERENCES workers(id) ON DELETE CASCADE
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_worker_roster_day_hide_date ON worker_roster_day_hide (hide_date)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS daily_product_meta (
        production_date TEXT PRIMARY KEY,
        product_name TEXT NOT NULL DEFAULT '',
        product_model TEXT NOT NULL DEFAULT ''
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS product_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_code TEXT NOT NULL UNIQUE,
        product_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.all("PRAGMA table_info(product_models)", [], (pragmaErr, cols) => {
      if (pragmaErr || !Array.isArray(cols) || cols.length === 0) return;
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("product_name")) {
        db.run("ALTER TABLE product_models ADD COLUMN product_name TEXT NOT NULL DEFAULT ''", (e) => {
          if (e) {
            // eslint-disable-next-line no-console
            console.error("[tekstil-db] product_models product_name migration:", e.message);
          }
        });
      }
      if (!names.has("created_at")) {
        db.run("ALTER TABLE product_models ADD COLUMN created_at TEXT NOT NULL DEFAULT ''", (e) => {
          if (e) {
            // eslint-disable-next-line no-console
            console.error("[tekstil-db] product_models created_at migration:", e.message);
          }
        });
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS model_hedef_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        team_code TEXT NOT NULL,
        process_name TEXT NOT NULL,
        arka_half INTEGER NOT NULL DEFAULT 0,
        UNIQUE (model_id, sort_order),
        FOREIGN KEY (model_id) REFERENCES product_models(id) ON DELETE CASCADE
      )
    `);

    db.all("PRAGMA table_info(model_hedef_baselines)", [], (pragmaErr, cols) => {
      if (pragmaErr || !Array.isArray(cols) || cols.length === 0) return;
      const names = new Set(cols.map((c) => c.name));
      if (names.has("hedef_metric") && !names.has("sort_order")) {
        db.serialize(() => {
          db.run(
            `
            CREATE TABLE model_hedef_baselines_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              model_id INTEGER NOT NULL,
              sort_order INTEGER NOT NULL,
              team_code TEXT NOT NULL,
              process_name TEXT NOT NULL,
              arka_half INTEGER NOT NULL DEFAULT 0,
              UNIQUE (model_id, sort_order),
              FOREIGN KEY (model_id) REFERENCES product_models(id) ON DELETE CASCADE
            )
            `,
            (e1) => {
              if (e1) {
                // eslint-disable-next-line no-console
                console.error("[tekstil-db] model_hedef_baselines migration create:", e1.message);
                return;
              }
              db.run(
                `
                INSERT INTO model_hedef_baselines_new (model_id, sort_order, team_code, process_name, arka_half)
                SELECT model_id,
                  CASE hedef_metric
                    WHEN 'SAG_ON' THEN 0 WHEN 'SOL_ON' THEN 1 WHEN 'YAKA_HAZIRLIK' THEN 2
                    WHEN 'ARKA_HAZIRLIK' THEN 3 WHEN 'BITIM' THEN 4 ELSE 0 END,
                  team_code, process_name, arka_half
                FROM model_hedef_baselines
                `,
                (e2) => {
                  if (e2) {
                    // eslint-disable-next-line no-console
                    console.error("[tekstil-db] model_hedef_baselines migration copy:", e2.message);
                    return;
                  }
                  db.run("DROP TABLE model_hedef_baselines", (e3) => {
                    if (e3) {
                      // eslint-disable-next-line no-console
                      console.error("[tekstil-db] model_hedef_baselines migration drop:", e3.message);
                      return;
                    }
                    db.run("ALTER TABLE model_hedef_baselines_new RENAME TO model_hedef_baselines", (e4) => {
                      if (e4) {
                        // eslint-disable-next-line no-console
                        console.error("[tekstil-db] model_hedef_baselines migration rename:", e4.message);
                      }
                    });
                  });
                }
              );
            }
          );
        });
      }
    });

    db.all("PRAGMA table_info(daily_product_meta)", [], (pragmaErr, cols) => {
      if (pragmaErr || !Array.isArray(cols)) return;
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("model_id")) {
        db.run("ALTER TABLE daily_product_meta ADD COLUMN model_id INTEGER", () => {});
      }
      if (!names.has("meta_source")) {
        db.run(
          "ALTER TABLE daily_product_meta ADD COLUMN meta_source TEXT NOT NULL DEFAULT 'manual'",
          () => {}
        );
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS worker_names (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        hedef_metric TEXT,
        hedef_team TEXT,
        hedef_arka_half INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.all("PRAGMA table_info(processes)", [], (pragmaErr, cols) => {
      if (pragmaErr || !Array.isArray(cols)) return;
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("hedef_metric")) {
        db.run("ALTER TABLE processes ADD COLUMN hedef_metric TEXT", () => {});
      }
      if (!names.has("hedef_team")) {
        db.run("ALTER TABLE processes ADD COLUMN hedef_team TEXT", () => {});
      }
      if (!names.has("hedef_arka_half")) {
        db.run("ALTER TABLE processes ADD COLUMN hedef_arka_half INTEGER NOT NULL DEFAULT 0", () => {});
      }
    });

    /* İsim havuzunu mevcut workers tablosundan doldur (ilk kurulumda) */
    db.get("SELECT COUNT(*) AS cnt FROM worker_names", [], (err, row) => {
      if (err || (row && row.cnt > 0)) return;
      const initialNames = [
        "ADNAN ŞEREF","AHMET ERİŞMİŞ","ALEYNA TAŞKARA","ARZU KARAGÜDEKOGLU","AYNUR BİNAY",
        "AYŞE BAYRAM","BAĞDAGÜL KARAGÜLMEZ","BERRİN ŞENOL","BETÜL KESKİN","BEYZA KESKİN",
        "BEYZANUR KORKMAZ","BÜŞRA DERE","CANSU DİLER","CEMİLE ŞAHİN","CEMİLE TULUM",
        "CEMİLE SARI","DERYA ERSOY ATABEK","DİLEK ATAKAN","EDANUR BOLAT","ELİF ÖZDEMİR",
        "ELİF PAK","ELVAN ÖZKAN","EMİNE ERATA","EMİNE AKIN","EMİNE ARSLAN",
        "EMİNE HACIHAMZAOĞLU","EMİNE BİLEN","EMİNE İLHAN","ENVER TURAN","ERCAN KAYA",
        "ESMA ÖZYAVUZ","EYÜP AKYÜZ","FADİME DİLER","FAHRİYE YILMAZ","FATMA BİGEÇ",
        "FERHAT ALTUN","FİLİZ BÜTÜN","FURKAN ERTÜRK","GÜLEN ÖKSÜZ","GÜLER AKER",
        "GÜLPERİ DİLER","GÜLSÜM YILDIRIM","GÜRSÜN KALAYCI","HAKAN ÇAKIR","HALİME ŞENER",
        "HAMİT BAYRAM","HANİFE YEŞİL","HATİCE YILDIRIM","HATİCE ŞAHAN","HATUN ZORLU",
        "HAVA ÇAKIR","HAVVANUR ÖZTÜRK","HEDİYE AYIK","HUSSEIN MAKHZOUM","HÜLYA ARAZ",
        "HÜLYA UÇAR","İREM AYIK","İSHAK NURİ ÇELİK","KADİR CEYLAN","KAYMAK SOYLU",
        "LEYLA CERRAH","LEYLA ERTÜRK","MAHMUT ÖZGÜNEŞ","MEDİHA YEŞİLTAŞ","MELAHAT YETKİN",
        "MELİSA YETKİN","MERVE CİNCİL","MERVE ÖNDER","MEVLÜDE AKÇAY","MUHAMMET KILIÇ",
        "MUSTAFA KEMAL ARSLAN","MÜBERRA GÖREN","NAGİHAN KÜÇÜKDURSUN","NERİMAN AYDINHAN",
        "NERİMAN YAVUZ","NEŞE CERRAH","NURAY KALOĞLU","NURGEL UYAR","OMAR MAKHZOUM",
        "ÖZLEM SOYÇİÇEK","PINAR ÖKSÜZ","RABİA ÜSTÜN","RUQIA JALAL","SALİH BİLEN",
        "SAYNUR ÖZKAN","SEDANUR ÇETİNER","SEDEF GÜNER BERBER","SEHER AKGÜL","SELCAN YILDIZ",
        "SELMA DEMİRBAŞ","SEMANUR TURAN","SERKAN BATUM","SEVDA GÜLMEZ","SEVDA KÖKÇE",
        "SEVDA ÇAMURCU","SEVGİ DEMİR","SEVİM BAŞ","SİBEL TAŞKIN","SÜNDÜZ YAVUZ",
        "ŞEREF BAŞBOĞA","ŞEVVAL BAYRİ","TALİP SAGLAM","TOLGA KAYA","TÜLAY ÇİLİNGİR",
        "TÜRKAN BAŞ","YAĞMUR ÇOŞKUN","YILDIZ MERT","YUSUF YAVUZ","ZAHİDE GÜLDANE","ZEYNEP BUZDAN"
      ];
      const stmt = db.prepare("INSERT OR IGNORE INTO worker_names (name) VALUES (?)");
      for (const n of initialNames) stmt.run([n]);
      stmt.finalize();
    });

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

    db.run(
      "ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'",
      (permErr) => {
        if (permErr) {
          const msg = String(permErr.message || permErr);
          if (!msg.toLowerCase().includes("duplicate column name")) {
            // eslint-disable-next-line no-console
            console.error("DB migration (users.permissions) error:", msg);
          }
        }
      }
    );

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

    db.run(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        actor_username TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT ''
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_activity_logs_id_desc ON activity_logs (id DESC)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS repair_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repair_date TEXT NOT NULL,
        process_name TEXT NOT NULL,
        repair_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(repair_date, process_name)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_repair_entries_date ON repair_entries (repair_date)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS proses_veri_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_code TEXT NOT NULL,
        team_code TEXT NOT NULL,
        team_label TEXT NOT NULL DEFAULT '',
        process_name TEXT NOT NULL,
        dk_adet TEXT NOT NULL DEFAULT '0',
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(model_code, team_code, process_name)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_proses_veri_rows_model ON proses_veri_rows (model_code)`);

    seedTeamsAndProcessesIfEmpty();
    migrateWorkersRemoveTeamCheckIfNeeded();
  });
}

const DEFAULT_PROCESS_NAMES = [
  "ARKA KOL ÇIMA",
  "ARKA KOL TAKMA",
  "CEP AĞZI",
  "CEP TAKMA",
  "DÜĞME",
  "ETEK UCU",
  "ETEK YAPMA",
  "ETİKET TAKMA",
  "İLİK AÇMA",
  "KESİM ADET",
  "KOL GAZİ",
  "KOLİTE KONTROL ADET",
  "OMUZ ÇATIM",
  "OMUZ ÇIMA",
  "ÖN PAT",
  "SAĞ KOL ÇIMA",
  "SAĞ KOL TAKMA",
  "SOL KOL ÇIMA",
  "SOL KOL TAKMA",
  "TALİMAT HAZIRLIK",
  "ÜTÜ ADET",
  "YAKA İÇ ÇIMA",
  "YAKA KAPAMA",
  "YAKA REGOLA",
  "YAKA TAKMA",
  "YAKA UCU",
  "YAKA ÜST TULUM",
  "YAKA YAN VURMA",
  "YAN ÇATMA",
  "YIKAMA TALİMATI",
].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" }));

function seedTeamsAndProcessesIfEmpty() {
  db.get("SELECT COUNT(*) AS c FROM teams", [], (err, row) => {
    if (err || !row || row.c > 0) return;
    const teams = [
      ["SAG_ON", "SAĞ ÖN", 10],
      ["SOL_ON", "SOL ÖN", 20],
      ["YAKA_HAZIRLIK", "YAKA HAZIRLIK", 30],
      ["ARKA_HAZIRLIK", "ARKA HAZIRLIK", 40],
      ["BITIM", "BİTİM", 50],
      ["ADET", "ADET", 60],
    ];
    const tstmt = db.prepare("INSERT INTO teams (code, label, sort_order) VALUES (?, ?, ?)");
    for (const [code, label, o] of teams) tstmt.run([code, label, o]);
    tstmt.finalize();
  });

  db.get("SELECT COUNT(*) AS c FROM processes", [], (err, row) => {
    if (err || !row || row.c > 0) return;
    const pstmt = db.prepare(
      "INSERT INTO processes (name, sort_order, hedef_metric, hedef_team, hedef_arka_half) VALUES (?, ?, ?, ?, ?)"
    );
    let order = 0;
    for (const name of DEFAULT_PROCESS_NAMES) {
      order += 10;
      let hm = null;
      let ht = null;
      let ha = 0;
      if (name === "SAĞ KOL ÇIMA") {
        hm = "SAG_ON";
        ht = "SAG_ON";
      } else if (name === "SOL KOL ÇIMA") {
        hm = "SOL_ON";
        ht = "SOL_ON";
      } else if (name === "YAKA İÇ ÇIMA") {
        hm = "YAKA_HAZIRLIK";
        ht = "YAKA_HAZIRLIK";
      } else if (name === "ARKA KOL ÇIMA") {
        hm = "ARKA_HAZIRLIK";
        ht = "ARKA_HAZIRLIK";
        ha = 1;
      } else if (name === "DÜĞME") {
        hm = "BITIM";
        ht = "BITIM";
      }
      pstmt.run([name, order, hm, ht, ha]);
    }
    pstmt.finalize();
  });
}

function migrateWorkersRemoveTeamCheckIfNeeded() {
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='workers'", [], (err, row) => {
    if (err) return;
    const sql = String(row?.sql || "");
    if (!sql.includes("CHECK(team")) return;
    db.exec(
      `
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;
      CREATE TABLE workers_dyn (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        team TEXT NOT NULL,
        process TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (date('now')),
        deleted_at TEXT
      );
      INSERT INTO workers_dyn (id, name, team, process, created_at, deleted_at)
        SELECT id, name, team, process,
          COALESCE(created_at, date('now')),
          deleted_at
        FROM workers;
      DROP TABLE workers;
      ALTER TABLE workers_dyn RENAME TO workers;
      COMMIT;
      PRAGMA foreign_keys = ON;
      `,
      (execErr) => {
        if (execErr) {
          // eslint-disable-next-line no-console
          console.error("workers team CHECK migration error:", String(execErr));
        }
      }
    );
  });
}

export default db;
  