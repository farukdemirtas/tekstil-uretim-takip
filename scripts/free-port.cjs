/**
 * Dev sunucusu öncesi portu boşaltır (Windows: EADDRINUSE önlemi).
 * Kullanım: node scripts/free-port.cjs 4000
 */
const { execSync } = require("child_process");

const port = String(process.argv[2] || "4000").trim();
if (!/^\d+$/.test(port)) process.exit(0);

function freeOnWindows() {
  let out = "";
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== "0") pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      // eslint-disable-next-line no-console
      console.log(`[free-port] ${port} portundaki eski süreç kapatıldı (PID ${pid})`);
    } catch {
      /* zaten kapalı */
    }
  }
}

function freeOnUnix() {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    if (!out) return;
    for (const pid of out.split(/\s+/)) {
      try {
        process.kill(Number(pid), "SIGTERM");
        // eslint-disable-next-line no-console
        console.log(`[free-port] ${port} portundaki eski süreç kapatıldı (PID ${pid})`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* port boş */
  }
}

if (process.platform === "win32") freeOnWindows();
else freeOnUnix();
