/**
 * PM2 ile üretim: depo kökünden `pm2 start ecosystem.config.cjs`
 * Güvenlik: APP_PASSWORD ve APP_TOKEN_SECRET değerlerini aşağıda tanımlayın veya
 * sunucuda export edip `pm2 restart ecosystem.config.cjs --update-env` kullanın.
 */
const path = require("path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "tekstil-api",
      cwd: path.join(root, "backend"),
      script: "src/server.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        // Depo kökü (__dirname) üzerinden sabit yol; örn. sunucu: /var/www/uretim-takip/...
        TEKSTIL_DB_PATH: path.join(root, "backend", "data", "production.db"),
        // APP_USERNAME: "admin",
        // APP_PASSWORD: "güçlü-bir-şifre",
        // APP_TOKEN_SECRET: "en-az-32-karakter-rastgele"
      }
    },
    {
      name: "tekstil-web",
      cwd: path.join(root, "frontend"),
      script: "npm",
      args: "run start",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
