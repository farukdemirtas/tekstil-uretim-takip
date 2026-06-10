import "./loadEnv.js";
import {
  UTU_PAKET_SLOT_KEYS,
  UTU_PAKET_SIZE_CODES,
  getUtuPaketDay,
  saveUtuPaketDay,
  refreshProductModelTargetsFromTakipsan,
} from "./queries.js";
import { TakipsanClient, isTakipsanConfigured } from "./takipsanClient.js";
import { splitTakipsanProductLabel, buildTakipsanProductLabel } from "./takipsanProduct.js";

const SLOT_BOUNDARIES = [
  { key: "h0900", start: 9 * 60 },
  { key: "h1000", start: 10 * 60 },
  { key: "h1115", start: 11 * 60 + 15 },
  { key: "h1215", start: 12 * 60 + 15 },
  { key: "h1300", start: 13 * 60 },
  { key: "h1445", start: 14 * 60 + 45 },
  { key: "h1545", start: 15 * 60 + 45 },
  { key: "h1700", start: 17 * 60 },
  { key: "h1830", start: 18 * 60 + 30 },
];

export function todayTurkeyIso(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

export function getCurrentUtuPaketSlotKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const minutes = hour * 60 + minute;

  let current = SLOT_BOUNDARIES[0].key;
  for (const slot of SLOT_BOUNDARIES) {
    if (minutes >= slot.start) current = slot.key;
  }
  return current;
}

function emptyPaketlemeSlots() {
  return Object.fromEntries(UTU_PAKET_SLOT_KEYS.map((k) => [k, 0]));
}

function buildPaketlemeSlots(readCount, slotKey) {
  const slots = emptyPaketlemeSlots();
  const key = UTU_PAKET_SLOT_KEYS.includes(slotKey) ? slotKey : getCurrentUtuPaketSlotKey();
  slots[key] = Math.max(0, Math.floor(Number(readCount) || 0));
  return slots;
}

function bedenFromTakipsan(fromPackages) {
  const out = Object.fromEntries(UTU_PAKET_SIZE_CODES.map((c) => [c, 0]));
  for (const [size, count] of Object.entries(fromPackages || {})) {
    const code = String(size).trim().toUpperCase();
    if (!code) continue;
    out[code] = Math.max(0, Math.floor(Number(count) || 0));
  }
  return out;
}

let syncInFlight = null;

// Singleton client — oturum cookielerini senkronlar arasında korur
let _sharedClient = null;
function getSharedClient() {
  if (!_sharedClient) _sharedClient = new TakipsanClient();
  return _sharedClient;
}

export const takipsanSyncState = {
  enabled: false,
  lastSyncAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastReadCount: null,
  lastSource: null,
  lastConsignmentId: null,
  lastDate: null,
  lastSlotKey: null,
  lastPackageCount: null,
  lastOrderQuantity: null,
  lastOrderCode: null,
  lastPackages: [],
};

function updateState(patch) {
  Object.assign(takipsanSyncState, patch);
}

export function getTakipsanClient() {
  return getSharedClient();
}

export async function syncTakipsanToUtuPaket(options = {}) {
  if (!isTakipsanConfigured()) {
    throw new Error("Takipsan entegrasyonu yapılandırılmamış (TAKIPSAN_ENABLED / kullanıcı / şifre / consignmentId)");
  }

  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const consignmentId = String(process.env.TAKIPSAN_CONSIGNMENT_ID || "").trim();
    const date = options.date || todayTurkeyIso();
    const syncedAt = new Date().toISOString();

    updateState({ enabled: true, lastSyncAt: syncedAt, lastError: null });

    try {
      const client = getTakipsanClient();
      const data = await client.fetchConsignmentReadData(consignmentId);
      const slotKey = getCurrentUtuPaketSlotKey();
      const existing = await getUtuPaketDay(date);

      const stages = { ...existing.stages };
      stages.paketleme = buildPaketlemeSlots(data.readCount, slotKey);

      const beden = bedenFromTakipsan(data.bedenFromPackages);
      if (data.orderQuantity == null) {
        throw new Error("Takipsan Sipariş Sayısı okunamadı");
      }
      if (data.packageCountFromHtml == null && data.packageCount <= 0) {
        throw new Error("Takipsan Paket Sayısı okunamadı");
      }
      const packagingTarget = data.orderQuantity;
      const packageCount =
        data.packageCountFromHtml != null ? data.packageCountFromHtml : data.packageCount;

      await saveUtuPaketDay(date, {
        stages,
        beden,
        packagingTarget,
        takipsanPackageCount: packageCount,
        takipsanOrderCode: data.orderCode,
        takipsanSyncedAt: syncedAt,
        takipsanPackages: data.packages,
      });

      await refreshProductModelTargetsFromTakipsan({
        orderCode: data.orderCode,
        orderQuantity: packagingTarget,
        productLabel: data.productRef || data.productLabel || "",
        productName: data.productName,
        modelCode: data.modelCode,
      }).catch(() => {});

      const result = {
        ok: true,
        date,
        consignmentId,
        readCount: data.readCount,
        orderQuantity: packagingTarget,
        orderCode: data.orderCode,
        productLabel: data.productLabel || "",
        source: data.source,
        fromHtml: data.fromHtml,
        fromPackages: data.fromPackages,
        slotKey,
        packageCount,
        packageCountFromHtml: data.packageCountFromHtml,
        packages: data.packages,
        beden: data.bedenFromPackages,
        syncedAt,
      };

      updateState({
        lastSuccessAt: syncedAt,
        lastReadCount: data.readCount,
        lastSource: data.source,
        lastConsignmentId: consignmentId,
        lastDate: date,
        lastSlotKey: slotKey,
        lastPackageCount: packageCount,
        lastOrderQuantity: packagingTarget,
        lastOrderCode: data.orderCode || "",
        lastPackages: data.packages || [],
        lastError: null,
      });

      return result;
    } catch (err) {
      const message = String(err?.message ?? err);
      updateState({ lastError: message });
      throw err;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export function refreshTakipsanEnabledFlag() {
  updateState({ enabled: isTakipsanConfigured() });
  return takipsanSyncState.enabled;
}

/** Ayarlar / Hedef Takip: sevkiyattan ürün adı ve hedef adet önizlemesi */
export async function fetchTakipsanConsignmentProductInfo() {
  if (!isTakipsanConfigured()) {
    throw new Error(
      "Takipsan entegrasyonu yapılandırılmamış (TAKIPSAN_USERNAME, TAKIPSAN_PASSWORD, TAKIPSAN_CONSIGNMENT_ID)"
    );
  }
  const consignmentId = String(process.env.TAKIPSAN_CONSIGNMENT_ID || "").trim();
  const client = getTakipsanClient();
  const data = await client.fetchConsignmentReadData(consignmentId);
  const productRef = String(data.productRef || data.productLabel || "").trim();
  const productName = String(data.productName || "").trim();
  const modelCode = String(data.modelCode || productRef || "").trim();
  const productLabel =
    productRef ||
    buildTakipsanProductLabel(productName, modelCode) ||
    "";
  return {
    consignmentId,
    productLabel,
    productRef: productRef || productLabel,
    productName,
    modelCode,
    orderCode: String(data.orderCode || "").trim(),
    orderQuantity: Math.max(0, Math.floor(Number(data.orderQuantity) || 0)),
    readCount: Math.max(0, Math.floor(Number(data.readCount) || 0)),
  };
}
