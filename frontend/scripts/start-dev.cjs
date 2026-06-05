/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
process.chdir(root);

function rmNextCache() {
  const nextDir = path.join(root, ".next");
  for (let i = 0; i < 5; i += 1) {
    try {
      if (!fs.existsSync(nextDir)) return;
      fs.rmSync(nextDir, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = err && err.code;
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") return;
      spawnSync("powershell", ["-Command", "Start-Sleep -Milliseconds 400"], { stdio: "ignore" });
    }
  }
}
rmNextCache();

const port = process.env.PORT || "3000";
const shell = process.platform === "win32";

spawnSync("npx", ["--yes", "kill-port", port], { stdio: "inherit", shell });

const next = spawn("npx", ["next", "dev", "--port", port], { stdio: "inherit", shell });
next.on("exit", (code) => process.exit(code ?? 0));
