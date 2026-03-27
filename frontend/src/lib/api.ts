import { DailyTrendPoint, HourFilter, ProductionRow, Team, TopWorkerAnalytics, User, Worker, WorkerDailyAnalytics } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";
let authToken = "";

export function setAuthToken(token: string) {
  authToken = token;
}

function authHeaders() {
  return authToken ? { "x-auth-token": authToken } : {};
}

/** 401 gelince oturumu kapat ve login sayfasına yönlendir */
function handleUnauthorized() {
  authToken = "";
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("auth_user");
    window.localStorage.removeItem("auth_role");
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

export async function login(payload: { username: string; password: string }): Promise<{ token: string; username: string; role: string }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Giriş başarısız");
  return response.json();
}

export async function getWorkerNames(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch(`${API_BASE}/worker-names`, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error("İsim listesi alınamadı");
  return res.json();
}

export async function addWorkerName(name: string): Promise<{ id: number; name: string }> {
  const res = await apiFetch(`${API_BASE}/worker-names`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name })
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as {message?:string}).message ?? "Eklenemedi"); }
  return res.json();
}

export async function updateWorkerName(id: number, name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/worker-names/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error("Güncellenemedi");
}

export async function deleteWorkerName(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/worker-names/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error("Silinemedi");
}

export async function getWorkers(): Promise<Worker[]> {
  const response = await apiFetch(`${API_BASE}/workers`, { cache: "no-store", headers: authHeaders() });
  if (!response.ok) throw new Error("Çalışanlar alınamadı");
  return response.json();
}

export async function addWorker(payload: { name: string; team: Team; process: string; addedDate?: string }): Promise<Worker> {
  const response = await apiFetch(`${API_BASE}/workers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Çalışan eklenemedi");
  return response.json();
}

export async function updateWorker(workerId: number, payload: { process: string }): Promise<void> {
  const response = await apiFetch(`${API_BASE}/workers/${workerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Çalışan güncellenemedi");
}

export async function removeWorker(workerId: number, date: string): Promise<void> {
  const response = await apiFetch(`${API_BASE}/workers/${workerId}?date=${encodeURIComponent(date)}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  if (!response.ok) throw new Error("Çalışan silinemedi");
}

export async function getProduction(date: string): Promise<ProductionRow[]> {
  const response = await apiFetch(`${API_BASE}/production?date=${date}`, { cache: "no-store", headers: authHeaders() });
  if (!response.ok) throw new Error("Üretim verisi alınamadı");
  return response.json();
}

export type DayProductMeta = { productName: string; productModel: string };

export async function getDayProductMeta(date: string): Promise<DayProductMeta> {
  const response = await apiFetch(`${API_BASE}/production/day-meta?date=${encodeURIComponent(date)}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Gün ürün bilgisi alınamadı");
  return response.json();
}

export async function saveDayProductMeta(payload: {
  date: string;
  productName: string;
  productModel: string;
}): Promise<DayProductMeta> {
  const response = await apiFetch(`${API_BASE}/production/day-meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Ürün bilgisi kaydedilemedi");
  return response.json();
}

export async function saveProduction(payload: {
  workerId: number;
  date: string;
  t1000: number;
  t1300: number;
  t1600: number;
  t1830: number;
}): Promise<void> {
  const response = await apiFetch(`${API_BASE}/production`, {
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
  const response = await apiFetch(`${API_BASE}/production/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Toplu kayıt başarısız");
}

export async function getRangeStageTotals(startDate: string, endDate: string): Promise<{
  SAG_ON: number;
  SOL_ON: number;
  YAKA_HAZIRLIK: number;
  ARKA_HAZIRLIK: number;
  BITIM: number;
}> {
  const query = new URLSearchParams({ startDate, endDate }).toString();
  const response = await apiFetch(`${API_BASE}/production/range-totals?${query}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Tarih aralığı verisi alınamadı");
  return response.json();
}

/** Hedef Takip: proses bazlı aşama toplamları */
export async function getHedefTakipStageTotals(startDate: string, endDate: string): Promise<{
  SAG_ON: number;
  SOL_ON: number;
  YAKA_HAZIRLIK: number;
  ARKA_HAZIRLIK: number;
  BITIM: number;
}> {
  const query = new URLSearchParams({ startDate, endDate }).toString();
  const response = await apiFetch(`${API_BASE}/production/hedef-stage-totals?${query}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Hedef takip verisi alınamadı");
  return response.json();
}

export async function getTopWorkersAnalytics(params: {
  startDate: string;
  endDate: string;
  team?: Team | "";
  hour?: HourFilter;
  limit?: number;
}): Promise<TopWorkerAnalytics[]> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    team: params.team ?? "",
    hour: params.hour ?? "",
    limit: String(params.limit ?? 20)
  }).toString();

  const response = await apiFetch(`${API_BASE}/analytics/top-workers?${query}`, {
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
  const res = await apiFetch(`${API_BASE}/analytics/worker-hourly?${query}`, {
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
  hour?: HourFilter;
}): Promise<DailyTrendPoint[]> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    team: params.team ?? "",
    hour: params.hour ?? ""
  }).toString();

  const response = await apiFetch(`${API_BASE}/analytics/daily-trend?${query}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Trend verisi alınamadı");
  return response.json();
}

export async function getWorkerDailyAnalytics(params: {
  startDate: string;
  endDate: string;
  team?: Team | "";
  hour?: HourFilter;
}): Promise<WorkerDailyAnalytics[]> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    team: params.team ?? "",
    hour: params.hour ?? ""
  }).toString();

  const response = await apiFetch(`${API_BASE}/analytics/worker-daily?${query}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("İşçi günlük verisi alınamadı");
  return response.json();
}

export async function getUsers(): Promise<User[]> {
  const response = await apiFetch(`${API_BASE}/users`, { cache: "no-store", headers: authHeaders() });
  if (!response.ok) throw new Error("Kullanıcılar alınamadı");
  return response.json();
}

export async function addUser(payload: { username: string; password: string }): Promise<User> {
  const response = await apiFetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Kullanıcı eklenemedi");
  return response.json();
}

export async function deleteUser(userId: number): Promise<void> {
  const response = await apiFetch(`${API_BASE}/users/${userId}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  if (!response.ok) throw new Error("Kullanıcı silinemedi");
}

export async function resetUserPassword(userId: number, password: string): Promise<void> {
  const response = await apiFetch(`${API_BASE}/users/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error("Şifre sıfırlanamadı");
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
  const res = await apiFetch(`${API_BASE}/analytics/worker-comparison?${query}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Karşılaştırma verisi alınamadı");
  return res.json();
}
