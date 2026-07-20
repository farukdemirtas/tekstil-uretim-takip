import "./loadEnv.js";
import { fetchAttendanceSession, isIzinApiConfigured } from "./izinClient.js";
import {
  getDailyEntries,
  hideWorkerForSingleCalendarDay,
  listWorkersHiddenForCalendarDay,
} from "./queries.js";
import { todayTurkeyIso } from "./takipsanSync.js";

export const izinAttendanceSyncState = {
  enabled: false,
  lastSyncAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastDate: null,
  lastAttendanceTitle: null,
  lastHiddenCount: null,
  lastAlreadyHiddenCount: null,
  lastUnmatchedNames: [],
};

function updateState(patch) {
  Object.assign(izinAttendanceSyncState, patch);
}

/** Üretim roster isimleri ile yoklama isimlerini eşleştirmek için */
export function normalizePersonName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr");
}

function buildRosterNameIndex(rows) {
  /** @type {Map<string, { workerId: number, name: string }[]>} */
  const map = new Map();
  for (const row of rows || []) {
    const key = normalizePersonName(row.name);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push({ workerId: row.workerId, name: row.name });
    map.set(key, list);
  }
  return map;
}

/**
 * İzin yoklama günlüğündeki gelmeyen personeli üretim listesinde "sahada yok" yapar.
 * Yoklama kaydı yalnızca gelmeyenleri içerir (devamsız + izinli).
 */
export async function syncIzinAttendanceToRoster(options = {}) {
  const date = String(options.date || todayTurkeyIso()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Geçersiz tarih (YYYY-MM-DD)");
  }

  updateState({ lastSyncAt: new Date().toISOString(), lastError: null });

  if (!isIzinApiConfigured()) {
    const msg = "İzin API yapılandırılmamış (IZIN_API_USERNAME / IZIN_API_PASSWORD)";
    updateState({ lastError: msg });
    throw new Error(msg);
  }

  try {
    const session = await fetchAttendanceSession(date);
    if (!session) {
      const result = {
        ok: true,
        date,
        skipped: true,
        reason: "no_attendance",
        message: `${date} için yoklama kaydı yok`,
        hidden: [],
        alreadyHidden: [],
        unmatched: [],
      };
      updateState({
        lastSuccessAt: new Date().toISOString(),
        lastDate: date,
        lastAttendanceTitle: null,
        lastHiddenCount: 0,
        lastAlreadyHiddenCount: 0,
        lastUnmatchedNames: [],
      });
      return result;
    }

    const entries = Array.isArray(session.entries) ? session.entries : [];
    const rosterRows = await getDailyEntries(date);
    const rosterIndex = buildRosterNameIndex(rosterRows);
    const alreadyHiddenRows = await listWorkersHiddenForCalendarDay(date);
    const alreadyHiddenIds = new Set(alreadyHiddenRows.map((r) => r.workerId));

    /** @type {{ workerId: number, name: string, description?: string }[]} */
    const hidden = [];
    /** @type {{ workerId: number, name: string }[]} */
    const alreadyHidden = [];
    /** @type {string[]} */
    const unmatched = [];
    const unmatchedSeen = new Set();

    for (const entry of entries) {
      const fullName = String(entry?.fullName ?? "").trim();
      if (!fullName) continue;
      const key = normalizePersonName(fullName);
      const matches = rosterIndex.get(key);
      if (!matches?.length) {
        if (!unmatchedSeen.has(key)) {
          unmatchedSeen.add(key);
          unmatched.push(fullName);
        }
        continue;
      }

      for (const match of matches) {
        if (alreadyHiddenIds.has(match.workerId)) {
          alreadyHidden.push({ workerId: match.workerId, name: match.name });
          continue;
        }
        const { hidden: didHide } = await hideWorkerForSingleCalendarDay(match.workerId, date);
        if (didHide) {
          alreadyHiddenIds.add(match.workerId);
          hidden.push({
            workerId: match.workerId,
            name: match.name,
            description: entry.description,
          });
        } else {
          alreadyHidden.push({ workerId: match.workerId, name: match.name });
        }
      }
    }

    const result = {
      ok: true,
      date,
      skipped: false,
      attendanceDate: session.attendanceDate || date,
      attendanceTitle: session.title || null,
      totalPersonnel: session.totalPersonnel ?? null,
      attendanceEntryCount: entries.length,
      hidden,
      alreadyHidden,
      unmatched,
    };

    updateState({
      lastSuccessAt: new Date().toISOString(),
      lastDate: date,
      lastAttendanceTitle: session.title || null,
      lastHiddenCount: hidden.length,
      lastAlreadyHiddenCount: alreadyHidden.length,
      lastUnmatchedNames: unmatched.slice(0, 50),
      lastError: null,
    });

    return result;
  } catch (err) {
    const message = String(err?.message ?? err);
    updateState({ lastError: message });
    throw err;
  }
}

export function refreshIzinSyncEnabledFlag() {
  updateState({ enabled: isIzinApiConfigured() });
  return izinAttendanceSyncState.enabled;
}
