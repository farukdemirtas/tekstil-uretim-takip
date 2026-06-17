import "./loadEnv.js";
import {
  UTU_PAKET_SLOT_KEYS,
  UTU_PAKET_SIZE_CODES,
  getUtuPaketDay,
  saveUtuPaketDay,
  refreshProductModelTargetsFromTakipsan,
  listProductModels,
  getDayProductMeta,
  getProductModelWithBaselines,
  getSecondaryModelId,
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

/** İki sevkiyat verisini birleştirir (adet + beden + paketler toplanır). */
function mergeConsignmentData(primary, secondary) {
  const mergedBeden = { ...(primary.bedenFromPackages || {}) };
  for (const [code, count] of Object.entries(secondary.bedenFromPackages || {})) {
    mergedBeden[code] = (mergedBeden[code] || 0) + (Number(count) || 0);
  }

  return {
    ...primary,
    orderQuantity: (Number(primary.orderQuantity) || 0) + (Number(secondary.orderQuantity) || 0),
    readCount: (Number(primary.readCount) || 0) + (Number(secondary.readCount) || 0),
    packageCount: (Number(primary.packageCount) || 0) + (Number(secondary.packageCount) || 0),
    packageCountFromHtml:
      primary.packageCountFromHtml != null || secondary.packageCountFromHtml != null
        ? (Number(primary.packageCountFromHtml) || 0) +
          (Number(secondary.packageCountFromHtml) || 0)
        : null,
    packages: [...(primary.packages || []), ...(secondary.packages || [])],
    bedenFromPackages: mergedBeden,
    // Sipariş kodları: "BIRINCI + İKİNCİ"
    orderCode: [primary.orderCode, secondary.orderCode].filter(Boolean).join(" + "),
  };
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

function normCode(s) {
  return String(s || "").trim().toLowerCase();
}

function codesMatch(a, b) {
  const x = normCode(a);
  const y = normCode(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const strip = (v) => v.replace(/[^a-z0-9]/g, "");
  const nx = strip(x);
  const ny = strip(y);
  return nx.length > 0 && ny.length > 0 && (nx.includes(ny) || ny.includes(nx));
}

/** Aynı ürün ailesine ait iki sipariş kodu (68131-01/… + 68131-01-…) */
function ordersRelated(orderCodeA, orderCodeB) {
  if (codesMatch(orderCodeA, orderCodeB)) return true;
  const strip = (v) => normCode(v).replace(/[^a-z0-9]/g, "");
  const a = strip(orderCodeA);
  const b = strip(orderCodeB);
  if (!a || !b) return false;
  const minLen = Math.min(a.length, b.length, 10);
  for (let len = minLen; len >= 6; len--) {
    if (a.slice(0, len) === b.slice(0, len)) return true;
  }
  return false;
}

/**
 * Birincil sevkiyat dışında birleştirilecek ikincil sevkiyat ID'leri.
 * Aktif model, günün ikinci modeli (production-b), env ve tek-model yedekleri.
 */
async function collectMergeConsignmentIds(date, activeModel, primaryFetchId) {
  const envSecondary = String(process.env.TAKIPSAN_SECONDARY_CONSIGNMENT_ID || "").trim();
  const ids = new Set();
  const add = (raw) => {
    const id = String(raw || "").trim();
    if (id && id !== primaryFetchId) ids.add(id);
  };

  if (envSecondary) add(envSecondary);

  const modelSecondary = String(activeModel?.secondaryConsignmentId || "").trim();
  if (modelSecondary) add(modelSecondary);

  try {
    const secMid = await getSecondaryModelId(date);
    if (secMid) {
      const sm = await getProductModelWithBaselines(secMid);
      add(sm?.secondaryConsignmentId);
    }
  } catch {
    /* devam */
  }

  if (ids.size === 0) {
    try {
      const models = await listProductModels();
      const withSecondary = models.filter((m) => m.secondaryConsignmentId);
      if (withSecondary.length === 1) {
        add(withSecondary[0].secondaryConsignmentId);
      }
    } catch {
      /* devam */
    }
  }

  return [...ids];
}

/**
 * Günün veri girişi modeline göre hangi Takipsan sevkiyat(lar)ından okunacağını belirler.
 * Aktif modelin kendi sevkiyatı varsa (env birincilden farklı) o esas alınır; gerekirse env birincil de birleştirilir.
 */
async function resolveSyncConsignments(date) {
  const envPrimary = String(process.env.TAKIPSAN_CONSIGNMENT_ID || "").trim();
  const envSecondary = String(process.env.TAKIPSAN_SECONDARY_CONSIGNMENT_ID || "").trim();

  let activeModelId = null;
  let activeModel = null;
  let meta = null;

  try {
    meta = await getDayProductMeta(date);
    activeModelId = meta?.modelId ?? null;
    if (activeModelId) {
      activeModel = await getProductModelWithBaselines(activeModelId);
    }
  } catch {
    // env varsayılanına düş
  }

  const modelSecondary = String(activeModel?.secondaryConsignmentId || "").trim();

  // Model kendi sevkiyatına bağlıysa (Bershka vb.) — gün o modele ait
  if (modelSecondary && activeModelId && modelSecondary !== envPrimary) {
    return {
      primaryId: modelSecondary,
      envPrimary,
      envSecondary: envSecondary || null,
      activeModelId,
      activeModel,
      meta,
      mode: "model_consignment",
    };
  }

  return {
    primaryId: envPrimary,
    envPrimary,
    envSecondary: envSecondary || null,
    activeModelId,
    activeModel,
    meta,
    mode: "env_primary",
  };
}

async function mergeExtraConsignments(client, data, mergeIds) {
  let merged = data;
  for (const sid of mergeIds) {
    try {
      const secondary = await client.fetchConsignmentReadData(sid);
      merged = mergeConsignmentData(merged, secondary);
      console.log(
        `[TakipsanSync] İkincil sevkiyat birleştirildi: +${sid} → toplam ${merged.orderQuantity} hedef / ${merged.readCount} okunan`
      );
    } catch (secondaryErr) {
      console.warn(
        `[TakipsanSync] İkincil sevkiyat (${sid}) alınamadı:`,
        String(secondaryErr?.message ?? secondaryErr)
      );
    }
  }
  return merged;
}

export async function syncTakipsanToUtuPaket(options = {}) {
  if (!isTakipsanConfigured()) {
    throw new Error("Takipsan entegrasyonu yapılandırılmamış (TAKIPSAN_ENABLED / kullanıcı / şifre / consignmentId)");
  }

  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const date = options.date || todayTurkeyIso();
    const syncedAt = new Date().toISOString();
    const resolved = await resolveSyncConsignments(date);
    const consignmentId = resolved.primaryId;
    const activeModel = resolved.activeModel;
    const meta = resolved.meta;

    updateState({ enabled: true, lastSyncAt: syncedAt, lastError: null });

    try {
      const client = getTakipsanClient();
      let data = await client.fetchConsignmentReadData(consignmentId);

      if (resolved.mode === "model_consignment") {
        // Aynı ürün ailesinde bölünmüş sipariş (68131 birincil + ikincil): env birincili de ekle
        const envPrimary = resolved.envPrimary;
        if (envPrimary && envPrimary !== consignmentId) {
          try {
            const primary = await client.fetchConsignmentReadData(envPrimary);
            const modelRef =
              activeModel?.takipsanOrderCode ||
              activeModel?.modelCode ||
              meta?.productModel ||
              data.orderCode;
            if (
              ordersRelated(primary.orderCode, modelRef) ||
              ordersRelated(primary.orderCode, data.orderCode)
            ) {
              data = mergeConsignmentData(primary, data);
              console.log(
                `[TakipsanSync] Model sevkiyatı + env birincil birleştirildi: ${envPrimary} + ${consignmentId}`
              );
            }
          } catch (primaryErr) {
            console.warn(
              `[TakipsanSync] Env birincil (${envPrimary}) model sevkiyatına eklenemedi:`,
              String(primaryErr?.message ?? primaryErr)
            );
          }
        }
        console.log(
          `[TakipsanSync] Aktif model sevkiyatı: ${consignmentId} → ${data.readCount} okunan / ${data.orderQuantity} hedef`
        );
      } else {
        let mergeIds = await collectMergeConsignmentIds(date, activeModel, consignmentId);

        try {
          const models = await listProductModels();
          const withSecondary = models.filter((m) => m.secondaryConsignmentId);
          if (withSecondary.length > 1 && data.orderCode) {
            const dataOc = String(data.orderCode).trim();
            const related = withSecondary.filter((m) => {
              const oc = String(m.takipsanOrderCode || m.modelCode || "").trim();
              return oc && ordersRelated(dataOc, oc);
            });
            if (related.length > 0) {
              const allowed = new Set(
                related.map((m) => String(m.secondaryConsignmentId).trim()).filter(Boolean)
              );
              if (resolved.envSecondary) allowed.add(resolved.envSecondary);
              mergeIds = mergeIds.filter((id) => allowed.has(id));
            }
          }
        } catch {
          /* tüm adayları birleştir */
        }

        if (mergeIds.length > 0) {
          data = await mergeExtraConsignments(client, data, mergeIds);
        }
      }

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

      await refreshProductModelTargetsFromTakipsan(
        {
          orderCode: data.orderCode,
          orderQuantity: packagingTarget,
          productLabel: data.productRef || data.productLabel || "",
          productName: data.productName,
          modelCode: data.modelCode,
        },
        resolved.activeModelId
      ).catch(() => {});

      const result = {
        ok: true,
        date,
        consignmentId,
        syncMode: resolved.mode,
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

/**
 * Ayarlar / Hedef Takip: sevkiyattan ürün adı ve hedef adet önizlemesi.
 * @param {string} [overrideId] - Belirtilirse bu sevkiyat ID'si kullanılır; yoksa env'den alınır.
 */
export async function fetchTakipsanConsignmentProductInfo(overrideId) {
  if (!isTakipsanConfigured()) {
    throw new Error(
      "Takipsan entegrasyonu yapılandırılmamış (TAKIPSAN_USERNAME, TAKIPSAN_PASSWORD, TAKIPSAN_CONSIGNMENT_ID)"
    );
  }
  const consignmentId = overrideId
    ? String(overrideId).trim()
    : String(process.env.TAKIPSAN_CONSIGNMENT_ID || "").trim();
  if (!consignmentId) throw new Error("Sevkiyat ID bulunamadı");
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
