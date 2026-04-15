import {
  AppPermissions,
  DailyTrendPoint,
  HourFilter,
  ProductionRow,
  Team,
  TopWorkerAnalytics,
  User,
  Worker,
  WorkerDailyAnalytics,
  WorkerProductionDayDetail,
} from "./types";
import { clearStoredPermissions } from "./permissions";

/**
 * Geliştirme: tarayıcıda her zaman `/api` — `next.config` rewrite ile backend (varsayılan 127.0.0.1:4000).
 * Böylece `.env.local` içindeki `NEXT_PUBLIC_API_BASE_URL` localhost çakışmasına takılmaz.
 * Canlıda API ayrı origin’deyse `NEXT_PUBLIC_API_BASE_URL` production build’de kullanılır.
 */
function apiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    if (process.env.NODE_ENV === "development") {
      return "/api";
    }
    return fromEnv || "/api";
  }

  if (fromEnv) return fromEnv;
  return "http://127.0.0.1:4000/api";
}
let authToken = "";

export function setAuthToken(token: string) {
  authToken = token;
}

function authHeaders(): Record<string, string> {
  return authToken ? { "x-auth-token": authToken } : {};
}

/** 401 gelince oturumu kapat ve login sayfasına yönlendir */
function handleUnauthorized() {
  authToken = "";
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("auth_user");
    window.localStorage.removeItem("auth_role");
    clearStoredPermissions();
    window.location.href = "/";
  }
}

/** Ortak fetch yardımcısı — 401'i merkezi olarak yönetir */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
  }
  return res;
}

export async function login(payload: {
  username: string;
  password: string;
}): Promise<{ token: string; username: string; role: string; permissions?: AppPermissions }> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Sunucuya bağlanılamadı. Backend’in çalıştığından emin olun (npm run dev, port 4000)."
    );
  }
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : `Giriş başarısız (${response.status})`
    );
  }
  return data as { token: string; username: string; role: string; permissions?: AppPermissions };
}

export async function getWorkerNames(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch(`${apiBase()}/worker-names`, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error("İsim listesi alınamadı");
  return res.json();
}

export async function addWorkerName(name: string): Promise<{ id: number; name: string }> {
  const res = await apiFetch(`${apiBase()}/worker-names`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name })
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as {message?:string}).message ?? "Eklenemedi"); }
  return res.json();
}

export async function updateWorkerName(id: number, name: string): Promise<void> {
  const res = await apiFetch(`${apiBase()}/worker-names/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error("Güncellenemedi");
}

export async function deleteWorkerName(id: number): Promise<void> {
  const res = await apiFetch(`${apiBase()}/worker-names/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error("Silinemedi");
}

export async function getWorkers(): Promise<Worker[]> {
  const response = await apiFetch(`${apiBase()}/workers`, { cache: "no-store", headers: authHeaders() });
  if (!response.ok) throw new Error("Çalışanlar alınamadı");
  return response.json();
}

/** Analiz sayfaları: aktif personel + üretim kaydı olan pasif kayıtlar (x-auth-token gerekir) */
export async function getWorkersForAnalytics(): Promise<Worker[]> {
  const response = await apiFetch(`${apiBase()}/workers/for-analysis`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Çalışan listesi alınamadı");
  return response.json();
}

export type TeamRow = { id: number; code: string; label: string; sort_order: number };
export type ProcessRow = { id: number; name: string; sort_order: number };

export async function getTeams(): Promise<TeamRow[]> {
  const res = await apiFetch(`${apiBase()}/teams`, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error("Bölümler alınamadı");
  return res.json();
}

export async function getProcesses(): Promise<ProcessRow[]> {
  const res = await apiFetch(`${apiBase()}/processes`, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error("Prosesler alınamadı");
  return res.json();
}

export async function addTeamApi(body: { label: string }): Promise<TeamRow> {
  const res = await apiFetch(`${apiBase()}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { message?: string }).message ?? "Bölüm eklenemedi");
  return d as TeamRow;
}

export async function updateTeamApi(id: number, body: { label?: string; sort_order?: number }): Promise<void> {
  const res = await apiFetch(`${apiBase()}/teams/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? "Güncellenemedi");
  }
}

export async function deleteTeamApi(id: number): Promise<void> {
  const res = await apiFetch(`${apiBase()}/teams/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? "Silinemedi");
  }
}

export async function addProcessApi(body: { name: string }): Promise<ProcessRow> {
  const res = await apiFetch(`${apiBase()}/processes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { message?: string }).message ?? "Proses eklenemedi");
  return d as ProcessRow;
}

export async function updateProcessApi(id: number, body: { name?: string; sort_order?: number }): Promise<void> {
  const res = await apiFetch(`${apiBase()}/processes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? "Güncellenemedi");
  }
}

export async function deleteProcessApi(id: number): Promise<void> {
  const res = await apiFetch(`${apiBase()}/processes/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? "Silinemedi");
  }
}

export async function addWorker(payload: { name: string; team: Team; process: string; addedDate?: string }): Promise<Worker> {
  const response = await apiFetch(`${apiBase()}/workers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Çalışan eklenemedi");
  return response.json();
}

export async function updateWorker(workerId: number, payload: { process?: string; team?: string }): Promise<void> {
  const response = await apiFetch(`${apiBase()}/workers/${workerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Çalışan güncellenemedi");
}

export async function removeWorker(workerId: number, date: string): Promise<void> {
  const response = await apiFetch(`${apiBase()}/workers/${workerId}?date=${encodeURIComponent(date)}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  if (!response.ok) throw new Error("Çalışan silinemedi");
}

/** Seçili günde yalnızca listeden gizlenenler (sahada yok). */
export async function getRosterHiddenForDay(date: string): Promise<Array<{ workerId: number; name: string }>> {
  const q = new URLSearchParams({ date }).toString();
  const response = await apiFetch(`${apiBase()}/workers/roster-hidden?${q}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Gizli personel listesi alınamadı");
  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const o = row as Record<string, unknown>;
      const workerId = Number(o.workerId ?? o.worker_id);
      const name = o.name != null ? String(o.name) : "";
      if (!Number.isFinite(workerId) || workerId <= 0) return null;
      return { workerId, name };
    })
    .filter((x): x is { workerId: number; name: string } => x != null);
}

/** Yalnızca bu takvim günü için listede gösterme (üretim kaydı silinmez). */
export async function hideWorkerForCalendarDay(workerId: number, date: string): Promise<void> {
  const response = await apiFetch(`${apiBase()}/workers/${workerId}/hide-for-day`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ date }),
  });
  if (!response.ok) throw new Error("Bu gün için gizlenemedi");
}

export async function unhideWorkerForCalendarDay(workerId: number, date: string): Promise<void> {
  const q = new URLSearchParams({ date }).toString();
  const response = await apiFetch(`${apiBase()}/workers/${workerId}/hide-for-day?${q}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Listeye geri alınamadı");
}

/** Toplu listeden kaldır: `only_day` = yalnızca o tarih; `from_day` = o tarih ve sonrası (soft delete). */
/** Yalnızca admin: seçili gündeki listeyi bitiş tarihine kadar hafta içi günlere aktarır (kaynak günün üretim rakamları + sahada yok kaldır). */
export async function copyRosterToFutureDates(
  sourceDate: string,
  endDate: string
): Promise<{
  workers: number;
  weekdayCount: number;
  entriesTouched: number;
  hidesCleared: number;
}> {
  const response = await apiFetch(`${apiBase()}/workers/copy-roster-to-dates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ sourceDate, endDate }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? "Aktarım başarısız");
  }
  return data as {
    workers: number;
    weekdayCount: number;
    entriesTouched: number;
    hidesCleared: number;
  };
}

export async function removeAllWorkersForDay(
  date: string,
  scope: "only_day" | "from_day" = "from_day"
): Promise<{ removed: number; scope: string }> {
  const q = new URLSearchParams({ date, scope });
  const response = await apiFetch(`${apiBase()}/workers/for-day?${q}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? "Personel silinemedi");
  }
  return {
    removed: Number((data as { removed?: number }).removed) || 0,
    scope: String((data as { scope?: string }).scope || scope),
  };
}

function parseProductionRow(raw: unknown): ProductionRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const workerId = Number(o.workerId);
  if (!Number.isFinite(workerId)) return null;
  const absentRaw = o.absentForDay ?? o.absentforday;
  const absentForDay =
    absentRaw === true ||
    absentRaw === 1 ||
    absentRaw === "1" ||
    String(absentRaw).toLowerCase() === "true";
  return {
    workerId,
    name: o.name != null ? String(o.name) : "",
    team: o.team != null ? String(o.team) : "",
    process: o.process != null ? String(o.process) : "",
    t1000: Number(o.t1000) || 0,
    t1300: Number(o.t1300) || 0,
    t1600: Number(o.t1600) || 0,
    t1830: Number(o.t1830) || 0,
    absentForDay: absentForDay || undefined,
    note: typeof o.note === "string" && o.note ? o.note : undefined,
  };
}

export async function getProduction(date: string): Promise<ProductionRow[]> {
  const response = await apiFetch(`${apiBase()}/production?date=${date}`, { cache: "no-store", headers: authHeaders() });
  if (!response.ok) throw new Error("Üretim verisi alınamadı");
  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map(parseProductionRow).filter((r): r is ProductionRow => r != null);
}

export type DayProductMeta = {
  productName: string;
  productModel: string;
  modelId: number | null;
  metaSource: "manual" | "hedef";
};

function parseDayProductMetaPayload(raw: unknown): DayProductMeta {
  if (!raw || typeof raw !== "object") {
    return { productName: "", productModel: "", modelId: null, metaSource: "manual" };
  }
  const o = raw as Record<string, unknown>;
  const mid = o.modelId;
  const modelId =
    mid != null && mid !== "" && Number.isFinite(Number(mid)) ? Number(mid) : null;
  const ms = o.metaSource === "hedef" ? "hedef" : "manual";
  return {
    productName: typeof o.productName === "string" ? o.productName : "",
    productModel: typeof o.productModel === "string" ? o.productModel : "",
    modelId,
    metaSource: ms,
  };
}

export async function getDayProductMeta(date: string): Promise<DayProductMeta> {
  const response = await apiFetch(`${apiBase()}/production/day-meta?date=${encodeURIComponent(date)}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Gün ürün bilgisi alınamadı");
  const raw = await response.json();
  return parseDayProductMetaPayload(raw);
}

export async function saveDayProductMeta(payload: {
  date: string;
  productName: string;
  productModel: string;
  modelId?: number | null;
  metaSource?: "manual" | "hedef";
}): Promise<DayProductMeta> {
  const response = await apiFetch(`${apiBase()}/production/day-meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Ürün bilgisi kaydedilemedi");
  const raw = await response.json();
  return parseDayProductMetaPayload(raw);
}

export async function saveWorkerNote(payload: {
  workerId: number;
  date: string;
  note: string;
}): Promise<void> {
  const response = await apiFetch(`${apiBase()}/production/note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Not kaydedilemedi");
}

export async function saveProduction(payload: {
  workerId: number;
  date: string;
  t1000: number;
  t1300: number;
  t1600: number;
  t1830: number;
}): Promise<void> {
  const response = await apiFetch(`${apiBase()}/production`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Üretim kaydedilemedi");
}

export async function saveProductionBulk(payload: {
  date: string;
  entries: Array<{
    workerId: number;
    t1000: number;
    t1300: number;
    t1600: number;
    t1830: number;
  }>;
}): Promise<void> {
  const response = await apiFetch(`${apiBase()}/production/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Toplu kayıt başarısız");
}

/** API: /production/hedef-stage-totals — sıralı bölüm satırları (N adet) */
export type HedefStageLineDto = {
  sortOrder: number;
  teamCode: string;
  processName: string;
  teamLabel: string;
  total: number;
};

export type HedefStageTotalsDto = {
  stages: HedefStageLineDto[];
};

const ZERO_HEDEF: HedefStageTotalsDto = { stages: [] };

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseStageLine(raw: unknown): HedefStageLineDto | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    sortOrder: num(o.sortOrder ?? o.sort_order),
    teamCode: String(o.teamCode ?? o.team_code ?? ""),
    processName: String(o.processName ?? o.process_name ?? ""),
    teamLabel: String(o.teamLabel ?? o.team_label ?? ""),
    total: num(o.total),
  };
}

/** API / proxy farklı anahtar döndürse veya sayı string gelse bile güvenli nesne */
export function parseHedefStageTotalsPayload(raw: unknown): HedefStageTotalsDto {
  if (!raw || typeof raw !== "object") return { ...ZERO_HEDEF };
  const o = raw as Record<string, unknown>;
  const stagesRaw = o.stages;
  if (Array.isArray(stagesRaw)) {
    const stages = stagesRaw.map(parseStageLine).filter((s): s is HedefStageLineDto => s != null);
    return { stages };
  }
  // Eski API (5 sabit anahtar) — geriye dönük
  if ("SAG_ON" in o || "sag_on" in o) {
    const labels = ["Sağ ön", "Sol ön", "Yaka hazırlık", "Arka hazırlık", "Bitim"];
    const keys = ["SAG_ON", "SOL_ON", "YAKA_HAZIRLIK", "ARKA_HAZIRLIK", "BITIM"] as const;
    const alt = ["sag_on", "sol_on", "yaka", "arka", "bitim"] as const;
    return {
      stages: keys.map((k, i) => ({
        sortOrder: i,
        teamCode: "",
        processName: "",
        teamLabel: labels[i],
        total: num(o[k] ?? o[alt[i]]),
      })),
    };
  }
  return { ...ZERO_HEDEF };
}

export function parseRangeStageTotalsPayload(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    const n = num(v);
    if (k) out[k] = n;
  }
  return out;
}

/** Tarih aralığında bölüm koduna göre üretim toplamları (tüm bölümler) */
export async function getRangeStageTotals(startDate: string, endDate: string): Promise<Record<string, number>> {
  const query = new URLSearchParams({ startDate, endDate }).toString();
  const response = await apiFetch(`${apiBase()}/production/range-totals?${query}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Tarih aralığı verisi alınamadı");
  const raw = await response.json().catch(() => ({}));
  return parseRangeStageTotalsPayload(raw);
}

/** Hedef Takip: proses bazlı aşama toplamları (modelId: Ayarlar’daki modele göre bölüm/proses bazı) */
export async function getHedefTakipStageTotals(
  startDate: string,
  endDate: string,
  modelId?: number | null
): Promise<HedefStageTotalsDto> {
  const q = new URLSearchParams({ startDate, endDate });
  if (modelId != null && Number.isFinite(modelId)) {
    q.set("modelId", String(modelId));
  }
  const response = await apiFetch(`${apiBase()}/production/hedef-stage-totals?${q.toString()}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Hedef takip verisi alınamadı");
  const raw = await response.json().catch(() => null);
  return parseHedefStageTotalsPayload(raw);
}

export type ProductModelListItem = { id: number; modelCode: string; productName: string; createdAt?: string };

/** arkaHalf: DB alanı adı; 1 ise o satırın üretim toplamı 0.5 ile çarpılır. */
export type ProductModelBaseline = {
  sortOrder: number;
  teamCode: string;
  processName: string;
  arkaHalf: number;
};

export type ProductModelDetail = ProductModelListItem & {
  baselines: ProductModelBaseline[];
};

export async function listProductModels(): Promise<ProductModelListItem[]> {
  const res = await apiFetch(`${apiBase()}/product-models`, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error("Modeller alınamadı");
  return res.json();
}

export async function getProductModel(id: number): Promise<ProductModelDetail> {
  const res = await apiFetch(`${apiBase()}/product-models/${id}`, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error("Model bulunamadı");
  return res.json();
}

export async function createProductModel(payload: {
  modelCode: string;
  productName: string;
  baselines: Array<{ teamCode: string; processName: string; arkaHalf?: number }>;
}): Promise<{ id: number; modelCode: string; productName: string }> {
  const res = await apiFetch(`${apiBase()}/product-models`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(typeof j.message === "string" ? j.message : "Model kaydedilemedi");
  }
  return res.json();
}

export async function updateProductModel(
  id: number,
  payload: {
    modelCode: string;
    productName: string;
    baselines: Array<{ teamCode: string; processName: string; arkaHalf?: number }>;
  }
): Promise<{ id: number; modelCode: string; productName: string }> {
  const res = await apiFetch(`${apiBase()}/product-models/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(typeof j.message === "string" ? j.message : "Model güncellenemedi");
  }
  return res.json();
}

export async function deleteProductModel(id: number): Promise<void> {
  const res = await apiFetch(`${apiBase()}/product-models/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Model silinemedi");
}

export async function applyHedefSession(payload: {
  modelId: number;
  startDate: string;
  endDate: string;
  productName?: string;
  productModel?: string;
}): Promise<{ ok: boolean; datesUpdated: number }> {
  const res = await apiFetch(`${apiBase()}/hedef/apply-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(typeof j.message === "string" ? j.message : "Oturum uygulanamadı");
  }
  return res.json();
}

export async function getTopWorkersAnalytics(params: {
  startDate: string;
  endDate: string;
  team?: Team | "";
  process?: string;
  hour?: HourFilter;
  limit?: number;
}): Promise<TopWorkerAnalytics[]> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    team: params.team ?? "",
    process: params.process ?? "",
    hour: params.hour ?? "",
    limit: String(params.limit ?? 20)
  }).toString();

  const response = await apiFetch(`${apiBase()}/analytics/top-workers?${query}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Analiz verisi alınamadı");
  return response.json();
}

export type WorkerHourlyBreakdown = { t1000: number; t1300: number; t1600: number; t1830: number };

export async function getWorkerHourlyBreakdown(params: {
  workerId: number;
  startDate: string;
  endDate: string;
}): Promise<WorkerHourlyBreakdown> {
  const query = new URLSearchParams({
    workerId: String(params.workerId),
    startDate: params.startDate,
    endDate: params.endDate,
  }).toString();
  const res = await apiFetch(`${apiBase()}/analytics/worker-hourly?${query}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Saatlik veri alınamadı");
  return res.json();
}

export async function getDailyTrendAnalytics(params: {
  startDate: string;
  endDate: string;
  team?: Team | "";
  process?: string;
  hour?: HourFilter;
}): Promise<DailyTrendPoint[]> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    team: params.team ?? "",
    process: params.process ?? "",
    hour: params.hour ?? ""
  }).toString();

  const response = await apiFetch(`${apiBase()}/analytics/daily-trend?${query}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Trend verisi alınamadı");
  return response.json();
}

export async function getWorkerProductionDailyDetail(params: {
  workerId: number;
  startDate: string;
  endDate: string;
  /** Aynı ada sahip tüm çalışan kayıtlarının (farklı bölüm/proses) üretimini birleştir */
  includeSameNameWorkers?: boolean;
}): Promise<WorkerProductionDayDetail[]> {
  const query = new URLSearchParams({
    workerId: String(params.workerId),
    startDate: params.startDate,
    endDate: params.endDate,
    ...(params.includeSameNameWorkers ? { includeSameNameWorkers: "1" } : {}),
  }).toString();
  const response = await apiFetch(`${apiBase()}/analytics/worker-production-detail?${query}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Kişi günlük detay alınamadı");
  return response.json();
}

export async function getWorkerDailyAnalytics(params: {
  startDate: string;
  endDate: string;
  team?: Team | "";
  process?: string;
  hour?: HourFilter;
}): Promise<WorkerDailyAnalytics[]> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    team: params.team ?? "",
    process: params.process ?? "",
    hour: params.hour ?? ""
  }).toString();

  const response = await apiFetch(`${apiBase()}/analytics/worker-daily?${query}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("İşçi günlük verisi alınamadı");
  return response.json();
}

export async function getUsers(): Promise<User[]> {
  const response = await apiFetch(`${apiBase()}/users`, { cache: "no-store", headers: authHeaders() });
  if (!response.ok) throw new Error("Kullanıcılar alınamadı");
  return response.json();
}

export async function addUser(payload: { username: string; password: string }): Promise<User> {
  const response = await apiFetch(`${apiBase()}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Kullanıcı eklenemedi");
  return response.json();
}

export async function deleteUser(userId: number): Promise<void> {
  const response = await apiFetch(`${apiBase()}/users/${userId}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  if (!response.ok) throw new Error("Kullanıcı silinemedi");
}

export async function resetUserPassword(userId: number, password: string): Promise<void> {
  const response = await apiFetch(`${apiBase()}/users/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error("Şifre sıfırlanamadı");
}

export async function updateUserPermissions(userId: number, permissions: AppPermissions): Promise<AppPermissions> {
  const response = await apiFetch(`${apiBase()}/users/${userId}/permissions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(permissions),
  });
  if (!response.ok) {
    const d = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(d.message ?? "Yetkiler güncellenemedi");
  }
  const data = (await response.json()) as { permissions: AppPermissions };
  return data.permissions;
}

export type WorkerCompStat = {
  workerId: number;
  name: string;
  team: string;
  process: string;
  t1000: number;
  t1300: number;
  t1600: number;
  t1830: number;
  total: number;
  activeDays: number;
};

export type WorkerComparisonData = {
  worker1: WorkerCompStat | null;
  worker2: WorkerCompStat | null;
  daily: { date: string; w1: number; w2: number }[];
};

export async function getWorkerComparison(params: {
  worker1Id: number;
  worker2Id: number;
  startDate: string;
  endDate: string;
}): Promise<WorkerComparisonData> {
  const query = new URLSearchParams({
    worker1: String(params.worker1Id),
    worker2: String(params.worker2Id),
    startDate: params.startDate,
    endDate: params.endDate,
  }).toString();
  const res = await apiFetch(`${apiBase()}/analytics/worker-comparison?${query}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Karşılaştırma verisi alınamadı");
  return res.json();
}

export type ActivityLogRow = {
  id: number;
  created_at: string;
  actor_username: string;
  action: string;
  resource: string;
  details: string;
};

export type ActivityLogQuery = {
  limit?: number;
  offset?: number;
  /** Tam eşleşme (sunucu action kodu) */
  action?: string;
  /** Kullanıcı adında geçen metin */
  actor?: string;
  /** Kaynak alanında geçen metin */
  resource?: string;
  /** Ayrıntı, işlem, kaynak veya kullanıcıda arama */
  q?: string;
  /** YYYY-MM-DD */
  dateFrom?: string;
  /** YYYY-MM-DD */
  dateTo?: string;
};

export async function getActivityLogs(params?: ActivityLogQuery): Promise<ActivityLogRow[]> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  if (params?.action?.trim()) q.set("action", params.action.trim());
  if (params?.actor?.trim()) q.set("actor", params.actor.trim());
  if (params?.resource?.trim()) q.set("resource", params.resource.trim());
  if (params?.q?.trim()) q.set("q", params.q.trim());
  if (params?.dateFrom?.trim()) q.set("dateFrom", params.dateFrom.trim());
  if (params?.dateTo?.trim()) q.set("dateTo", params.dateTo.trim());
  const qs = q.toString();
  const res = await apiFetch(`${apiBase()}/activity-logs${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(d.message ?? "Loglar alınamadı");
  }
  return res.json();
}

// ─── Tamir Oranı ──────────────────────────────────────────────────────────────

export type RepairEntry = { processName: string; repairCount: number };

export type RepairHistoryPoint = {
  repairDate: string;
  totalRepairs: number;
  totalProduction: number;
  repairRate: number;
};

export async function getRepairs(date: string): Promise<{ date: string; entries: RepairEntry[] }> {
  const res = await apiFetch(`${apiBase()}/repairs?date=${encodeURIComponent(date)}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Tamir verileri alınamadı");
  return res.json() as Promise<{ date: string; entries: RepairEntry[] }>;
}

export async function saveRepairs(payload: { date: string; entries: RepairEntry[] }): Promise<void> {
  const res = await apiFetch(`${apiBase()}/repairs`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(d.message ?? "Tamir verisi kaydedilemedi");
  }
}

export async function getRepairsHistory(params: {
  startDate: string;
  endDate: string;
}): Promise<RepairHistoryPoint[]> {
  const q = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate }).toString();
  const res = await apiFetch(`${apiBase()}/repairs/history?${q}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Tamir geçmişi alınamadı");
  return res.json() as Promise<RepairHistoryPoint[]>;
}
