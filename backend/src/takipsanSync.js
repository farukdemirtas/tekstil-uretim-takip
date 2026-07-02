import "./loadEnv.js";
import {
  UTU_PAKET_SLOT_KEYS,
  UTU_PAKET_SIZE_CODES,
  getUtuPaketDay,
  saveUtuPaketDay,
  refreshProductModelTargetsFromTakipsan,
  getProductModelWithBaselines,
  getSecondaryModelId,
  getUtuPaketModelForDate,
  isProductModelTakipsanLinked,
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

function parseConsignmentIds(raw) {
  return String(raw || "")
    .split(/[,+\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pushConsignmentIds(ordered, seen, raw) {
  for (const id of parseConsignmentIds(raw)) {
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
}

/**
 * Aktif ütü-paket modeline göre birleştirilecek tüm Takipsan sevkiyat ID'leri (sıralı, tekrarsız).
 * Ana (258152) + ikincil (258154) ayrı alanlarda veya ikincil alanda virgülle yazılabilir.
 */
async function buildConsignmentIdList(productionDate, activeModel) {
  const envPrimary = String(process.env.TAKIPSAN_CONSIGNMENT_ID || "").trim();
  const envSecondary = String(process.env.TAKIPSAN_SECONDARY_CONSIGNMENT_ID || "").trim();
  const ordered = [];
  const seen = new Set();

  const modelPrimary = String(activeModel?.primaryConsignmentId || "").trim();
  const modelSecondary = activeModel?.secondaryConsignmentId || "";
  const hasModelConsignment = Boolean(modelPrimary || String(modelSecondary).trim());

  if (hasModelConsignment) {
    if (modelPrimary) pushConsignmentIds(ordered, seen, modelPrimary);
    pushConsignmentIds(ordered, seen, modelSecondary);
    // Yalnızca ikincil tanımlıysa .env birincil de ekle (örn. 258152 + 258154)
    if (!modelPrimary && envPrimary) pushConsignmentIds(ordered, seen, envPrimary);
  } else {
    if (envPrimary) pushConsignmentIds(ordered, seen, envPrimary);
    if (envSecondary) pushConsignmentIds(ordered, seen, envSecondary);
  }

  if (ordered.length <= 1) {
    try {
      const secMid = await getSecondaryModelId(productionDate);
      if (secMid) {
        const sm = await getProductModelWithBaselines(secMid);
        if (sm?.primaryConsignmentId) pushConsignmentIds(ordered, seen, sm.primaryConsignmentId);
        if (sm?.secondaryConsignmentId) pushConsignmentIds(ordered, seen, sm.secondaryConsignmentId);
      }
    } catch {
      /* devam */
    }
  }

  if (ordered.length === 0 && envPrimary) pushConsignmentIds(ordered, seen, envPrimary);

  return ordered;
}

/**
 * Günün ütü-paket modeline göre hangi Takipsan sevkiyat(lar)ından okunacağını belirler.
 */
async function resolveSyncConsignments(productionDate) {
  let activeModelId = null;
  let activeModel = null;
  let meta = null;

  try {
    const upm = await getUtuPaketModelForDate(productionDate);
    if (upm?.modelId) {
      activeModelId = upm.modelId;
      meta = {
        productName: upm.productName,
        productModel: upm.productModel,
        modelId: upm.modelId,
      };
      activeModel = await getProductModelWithBaselines(upm.modelId);
    }
  } catch {
    // env varsayılanına düş
  }

  const consignmentIds = await buildConsignmentIdList(productionDate, activeModel);
  const primaryId =
    consignmentIds[0] || String(process.env.TAKIPSAN_CONSIGNMENT_ID || "").trim();

  return {
    primaryId,
    mergeIds: consignmentIds.slice(1),
    consignmentIds,
    activeModelId,
    activeModel,
    meta,
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

    const existingDay = await getUtuPaketDay(date).catch(() => null);

    const resolved = await resolveSyncConsignments(date);
    const consignmentId = resolved.primaryId;
    const allConsignmentIds = resolved.consignmentIds?.length
      ? resolved.consignmentIds
      : [consignmentId, ...resolved.mergeIds].filter(Boolean);
    const activeModel = resolved.activeModel;
    const meta = resolved.meta;

    // Manuel ütü–paket modeli (Takipsan sevkiyatı yok): otomatik sync hedefi ezmesin
    if (activeModel && !isProductModelTakipsanLinked(activeModel)) {
      updateState({
        lastSyncAt: syncedAt,
        lastError: null,
        lastDate: date,
      });
      return {
        ok: true,
        skipped: true,
        reason: "manual_utu_paket_model",
        date,
        modelId: resolved.activeModelId,
      };
    }

    updateState({ enabled: true, lastSyncAt: syncedAt, lastError: null });

    try {
      const client = getTakipsanClient();
      let data = await client.fetchConsignmentReadData(consignmentId);

      if (resolved.mergeIds.length > 0) {
        data = await mergeExtraConsignments(client, data, resolved.mergeIds);
      }

      if (allConsignmentIds.length > 1) {
        console.log(
          `[TakipsanSync] Birleşik sevkiyat: ${allConsignmentIds.join(" + ")} → ${data.readCount} okunan / ${data.orderQuantity} hedef`
        );
      }

      const slotKey = getCurrentUtuPaketSlotKey();
      const existing = existingDay || (await getUtuPaketDay(date));

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
        consignmentId: allConsignmentIds.join("+") || consignmentId,
        syncMode: allConsignmentIds.length > 1 ? "merged" : "single",
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
        lastConsignmentId: allConsignmentIds.join("+") || consignmentId,
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
