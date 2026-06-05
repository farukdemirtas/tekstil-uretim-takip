import "dotenv/config";
import { initDb } from "../src/db.js";
import { syncTakipsanToUtuPaket } from "../src/takipsanSync.js";
import { getTakipsanClient } from "../src/takipsanSync.js";

try {
  const c = getTakipsanClient();
  await c.fetchLoginBootstrap();
  console.log("bootstrap ok", c._pageToken?.slice(0, 16));
  await c.login();
  console.log("login ok");
  initDb();
  const r = await syncTakipsanToUtuPaket();
  console.log("sync", r.readCount, r.packageCount, r.orderQuantity);
} catch (e) {
  console.error("ERR", e.message);
  process.exit(1);
}
