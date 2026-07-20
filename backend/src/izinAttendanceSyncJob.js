import "./loadEnv.js";
import { isIzinApiConfigured } from "./izinClient.js";
import {
  refreshIzinSyncEnabledFlag,
  syncIzinAttendanceToRoster,
} from "./izinAttendanceSync.js";

let timer = null;

export function scheduleIzinAttendanceSyncJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  const enabled = refreshIzinSyncEnabledFlag();
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log(
      "[izin-yoklama] Senkron kapalı — backend/.env içinde IZIN_API_USERNAME ve IZIN_API_PASSWORD tanımlayın"
    );
    return;
  }

  const intervalMs = Math.max(
    60_000,
    Number(process.env.IZIN_SYNC_INTERVAL_MS) || 15 * 60 * 1000
  );

  const run = async () => {
    if (!isIzinApiConfigured()) return;
    try {
      const result = await syncIzinAttendanceToRoster();
      if (result.skipped) {
        // eslint-disable-next-line no-console
        console.log(`[izin-yoklama] ${result.message}`);
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[izin-yoklama] Senkron OK — ${result.date}: ${result.hidden.length} sahada yok, ${result.alreadyHidden.length} zaten işaretli, ${result.unmatched.length} eşleşmedi`
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[izin-yoklama] Senkron hatası:", String(err?.message ?? err));
    }
  };

  run();
  timer = setInterval(run, intervalMs);
  // eslint-disable-next-line no-console
  console.log(`[izin-yoklama] Otomatik senkron başlatıldı (${intervalMs}ms)`);
}
