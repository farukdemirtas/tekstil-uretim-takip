/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
process.chdir(root);

try {
  fs.rmSync(path.join(root, ".next"), { recursive: true, force: true });
} catch {
  /* ignore */
}

const port = process.env.PORT || "3000";
const shell = process.platform === "win32";

spawnSync("npx", ["--yes", "kill-port", port], { stdio: "inherit", shell });

const next = spawn("npx", ["next", "dev", "--port", port], { stdio: "inherit", shell });
next.on("exit", (code) => process.exit(code ?? 0));
