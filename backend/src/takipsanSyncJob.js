import { isTakipsanConfigured } from "./takipsanClient.js";
import { refreshTakipsanEnabledFlag, syncTakipsanToUtuPaket } from "./takipsanSync.js";

let timer = null;

export function scheduleTakipsanSyncJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  const enabled = refreshTakipsanEnabledFlag();
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log("[takipsan] Senkron kapalı — TAKIPSAN_USERNAME, TAKIPSAN_PASSWORD, TAKIPSAN_CONSIGNMENT_ID gerekli");
    return;
  }

  const intervalMs = Math.max(
    10_000,
    Number(process.env.TAKIPSAN_SYNC_INTERVAL_MS) || 30_000
  );

  const run = async () => {
    if (!isTakipsanConfigured()) return;
    try {
      const result = await syncTakipsanToUtuPaket();
      // eslint-disable-next-line no-console
      console.log(
        `[takipsan] Senkron OK — okunan: ${result.readCount} (${result.source}), slot: ${result.slotKey}`
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[takipsan] Senkron hatası:", String(err?.message ?? err));
    }
  };

  run();
  timer = setInterval(run, intervalMs);
  // eslint-disable-next-line no-console
  console.log(`[takipsan] Otomatik senkron başlatıldı (${intervalMs}ms)`);
}
