/**
 * Admin şifresini sıfırlar (veritabanı eski kurulumda farklı şifreyle kalmışsa).
 * Kullanım: node scripts/reset-admin-password.mjs
 * veya: APP_PASSWORD=yeniSifre node scripts/reset-admin-password.mjs
 */
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { pbkdf2Sync, randomBytes } from "crypto";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "production.db");

const username = process.env.APP_USERNAME || "admin";
const password = process.env.APP_PASSWORD || "admin55";

if (!fs.existsSync(dbPath)) {
  console.error("Veritabanı bulunamadı:", dbPath);
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const password_hash = pbkdf2Sync(password, salt, 310000, 64, "sha512").toString("hex");

const db = new sqlite3.Database(dbPath);
db.run(
  "UPDATE users SET password_hash = ?, salt = ?, role = 'admin' WHERE username = ?",
  [password_hash, salt, username],
  function (err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    if (this.changes === 0) {
      console.error(`Kullanıcı bulunamadı: ${username}. Önce uygulamayı bir kez çalıştırın veya kullanıcıyı ekleyin.`);
      process.exit(1);
    }
    console.log(`Tamam: "${username}" şifresi güncellendi (pbkdf2 sha512).`);
    console.log(`Giriş → kullanıcı: ${username}  şifre: ${password}`);
    db.close();
  }
);
